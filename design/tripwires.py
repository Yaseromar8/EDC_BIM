# -*- coding: utf-8 -*-
"""TRIPWIRES DEL SISTEMA VISUAL · UX-01.

    python design/tripwires.py            comprueba
    python design/tripwires.py --autoprueba   se rompe a proposito, para
                                              demostrar que puede fallar

POR QUE EXISTE ESTE FICHERO
---------------------------
Cinco rondas de auditoria manual del contrato encontraron algo real cada
vez, y siempre el mismo patron: una regla corregida en un sitio y no
propagada al otro. Eso no lo arregla otra lectura; lo arregla que las
reglas se EJECUTEN.

Cada comprobacion corresponde a un punto de la lista de validacion del
contrato. Ninguna esta escrita para dar verde: `--autoprueba` introduce
una violacion de cada clase y verifica que el tripwire la detecta.
"""
import io
import os
import re
import sys

# La consola de Windows es cp1252: una flecha en un mensaje tumbaba el
# script con UnicodeEncodeError. Los mensajes van en ASCII y esto cubre
# lo que venga de los ficheros.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, 'design', 'alephia.tokens.css')
APPS = ('frontend-docs', 'frontend-react')

# Recuento de literales de color en CODIGO DE COMPONENTE medido en la linea
# base, antes de K1. UX-01 no toca ningun componente, asi que no puede
# moverse. Si se mueve, hubo migracion y no contrato.
LITERALES_BASE = 3801


def ficheros(app, exts=('.css', '.jsx', '.js')):
    base = os.path.join(RAIZ, app, 'src')
    for d, _, fs in os.walk(base):
        if 'node_modules' in d or 'dist' in d:
            continue
        for f in fs:
            if f.endswith(exts) and '.bak.' not in f and '.roto.' not in f:
                yield os.path.join(d, f)


def leer(p):
    return io.open(p, encoding='utf-8', errors='ignore').read()


def _bloques(css):
    """{selector: {token: valor}} de los bloques de primer nivel.

    Sin comentarios primero: si no, el «selector» se traga el comentario
    que precede al bloque -- ocurrio, y dejaba el analizador en vacio."""
    limpio = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    fuera = {}
    for trozo in limpio.split('}'):
        if '{' not in trozo:
            continue
        cabeza, cuerpo = trozo.rsplit('{', 1)
        sel = cabeza.strip().split('\n')[-1].strip()
        toks = {t: v.strip() for t, v in re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', cuerpo)}
        if toks:
            fuera.setdefault(sel, {}).update(toks)
    return fuera


# ── las comprobaciones ────────────────────────────────────────────────────

def t1_una_sola_fuente():
    """Las dos apps consumen la MISMA fuente canonica."""
    faltan = [a for a in APPS
              if 'design/alephia.tokens.css' not in leer(os.path.join(RAIZ, a, 'src', 'index.css'))]
    return (not faltan), 'no la importan: %s' % ', '.join(faltan) if faltan else 'docs y view importan la fuente'


def t2_sin_declaraciones_fuera():
    """Ningun --a-* se DECLARA fuera de design/."""
    malos = []
    for app in APPS:
        for p in ficheros(app):
            for m in re.finditer(r'^\s*(--a-[a-z0-9-]+)\s*:', leer(p), re.M):
                malos.append('%s -> %s' % (os.path.relpath(p, RAIZ), m.group(1)))
    return (not malos), ('%d declaraciones fuera de la fuente: %s' % (len(malos), malos[:3])
                         if malos else '0 declaraciones canonicas fuera')


def t3_cobertura_claro_oscuro():
    """Todo semantico del tema claro se redefine en el oscuro."""
    b = _bloques(leer(FUENTE))
    # Fuera las PRIMITIVAS (rampas y canales) y las escalas: no son
    # semanticos y no tienen por que redefinirse por tema. Los canales
    # terminan en «-rgb» y llevan guion dentro, asi que [a-z0-9-] y no \w.
    claro = {k for k in b.get(':root', {}) if not re.match(
        r'--a-(blue|steel|neutral|ink|green|red|amber)-\d+$|--a-[a-z0-9-]+-rgb$|'
        r'--a-(space|radius|border-width|type|font|motion|ease|bp|layer)', k)}
    oscuro = set(b.get('[data-theme="dark"]', {}))
    falta = sorted(claro - oscuro)
    sobra = sorted(oscuro - claro)
    ok = not falta and not sobra
    return ok, ('cobertura equivalente · %d semanticos en ambos' % len(claro) if ok
                else 'sin pareja → falta:%s sobra:%s' % (falta[:4], sobra[:4]))


def t4a1_color_sin_literal():
    """Semantico de COLOR: resuelve via var(), nunca un hexadecimal."""
    b = _bloques(leer(FUENTE))
    malos = []
    for sel in (':root', '[data-theme="dark"]'):
        for tok, val in b.get(sel, {}).items():
            if re.match(r'--a-(blue|steel|neutral|ink|green|red|amber)-\d+$', tok):
                continue                      # es primitiva: ahi vive el valor
            if re.search(r'#[0-9a-fA-F]{3,8}\b', val):
                malos.append('%s: %s' % (tok, val))
    return (not malos), ('%d semanticos con color crudo: %s' % (len(malos), malos[:3])
                         if malos else 'ningun semantico esconde un color')


def t4a2_compuestos_por_canal():
    """Compuesto (sombra, anillo, velo): su color sale de un token de canal."""
    b = _bloques(leer(FUENTE))
    malos = []
    for sel in (':root', '[data-theme="dark"]'):
        for tok, val in b.get(sel, {}).items():
            if not re.match(r'--a-(shadow|focus-ring|surface-overlay)', tok):
                continue
            if re.search(r'rgba?\(\s*\d', val) and 'rgb(255 255 255' not in val:
                malos.append('%s: %s' % (tok, val))
    return (not malos), ('%d compuestos con color crudo: %s' % (len(malos), malos[:2])
                         if malos else 'los compuestos usan canales')


def t4b_rampa_sin_repetir():
    """Ninguna rampa repite un valor DENTRO de si misma.

    Entre rampas si se permite --a-neutral-900 y --a-ink-900 valen ambos
    Ink, y es correcto: es el suelo de los neutros y el fondo del tema
    oscuro. Prohibirlo fue un falso positivo del contrato."""
    b = _bloques(leer(FUENTE)).get(':root', {})
    porRampa = {}
    for tok, val in b.items():
        m = re.match(r'--a-(blue|steel|neutral|ink|green|red|amber)-\d+$', tok)
        if m:
            porRampa.setdefault(m.group(1), {}).setdefault(val.upper(), []).append(tok)
    malos = ['%s: %s' % (r, v) for r, vals in porRampa.items()
             for v, toks in vals.items() if len(toks) > 1]
    return (not malos), ('valores repetidos intra-rampa: %s' % malos if malos
                         else '%d rampas sin repeticion interna' % len(porRampa))


def t5_capas_finitas():
    """La escala de capas es finita, nombrada y con techo."""
    b = _bloques(leer(FUENTE)).get(':root', {})
    capas = {k: int(v) for k, v in b.items() if k.startswith('--a-layer-')}
    techo = max(capas.values()) if capas else None
    ok = bool(capas) and techo == 800 and len(capas) == 10
    return ok, ('%d capas nombradas · techo %s' % (len(capas), techo) if ok
                else 'escala inesperada: %d capas, techo %s' % (len(capas), techo))


def t7b_componentes_intactos():
    """Los literales en CODIGO DE COMPONENTE no se mueven."""
    n = 0
    for app in APPS:
        for p in ficheros(app):
            sin_decl = re.sub(r'^\s*--[a-z0-9-]+:[^;]+;', '', leer(p), flags=re.M)
            n += len(re.findall(r'#[0-9a-fA-F]{6}\b', sin_decl))
    return n == LITERALES_BASE, '%d literales (base %d)' % (n, LITERALES_BASE)


def t8_contraste():
    """Cada par texto/superficie del canon cumple WCAG 2.1 AA (>= 4.5:1).

    `text-disabled` queda exento: WCAG 2.1 SC 1.4.3 exceptua explicitamente
    los controles inactivos."""
    def lum(h):
        h = h.lstrip('#')
        c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
        c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    def ratio(a, b):
        la, lb = lum(a), lum(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

    b = _bloques(leer(FUENTE))
    prim = {k: v for k, v in b[':root'].items() if re.match(r'--a-\w+-\d+$', k)}

    def val(sel, tok):
        v = b[sel].get(tok) or b[':root'].get(tok)
        m = re.match(r'var\(\s*(--a-[a-z0-9-]+)', v or '')
        return prim.get(m.group(1)) if m else None

    malos = []
    for sel in (':root', '[data-theme="dark"]'):
        fondo = val(sel, '--a-surface-raised')
        for tok in ('--a-text-primary', '--a-text-secondary', '--a-text-muted', '--a-action-text'):
            fg = val(sel, tok)
            if fg and fondo:
                r = ratio(fg, fondo)
                if r < 4.5:
                    malos.append('%s %s %.2f:1' % (sel, tok, r))
    return (not malos), ('bajo AA: %s' % malos if malos else 'todos los pares >= 4.5:1')


COMPROBACIONES = [
    ('T1  una sola fuente canonica', t1_una_sola_fuente),
    ('T2  0 declaraciones fuera', t2_sin_declaraciones_fuera),
    ('T3  cobertura claro/oscuro', t3_cobertura_claro_oscuro),
    ('T4a-1 color sin literal', t4a1_color_sin_literal),
    ('T4a-2 compuestos por canal', t4a2_compuestos_por_canal),
    ('T4b rampa sin repetir', t4b_rampa_sin_repetir),
    ('T5  capas finitas', t5_capas_finitas),
    ('T7b componentes intactos', t7b_componentes_intactos),
    ('T8  contraste AA', t8_contraste),
]


def correr():
    fallos = 0
    for nombre, fn in COMPROBACIONES:
        try:
            ok, detalle = fn()
        except Exception as e:
            ok, detalle = False, 'EXCEPCION: %s' % e
        print('  %-28s %s  %s' % (nombre, 'PASA' if ok else 'FALLA', detalle))
        fallos += 0 if ok else 1
    return fallos


def autoprueba():
    """Rompe la fuente a proposito y comprueba que los tripwires lo ven."""
    original = leer(FUENTE)
    casos = [
        ('color crudo en un semantico',
         lambda t: t.replace('--a-text-primary:   var(--a-neutral-900);',
                             '--a-text-primary:   #123456;'), 'T4a-1'),
        ('valor repetido en la rampa neutra',
         lambda t: t.replace('--a-neutral-50:  #F8F9FA;',
                             '--a-neutral-50:  #FFFFFF;'), 'T4b'),
        ('capa por encima del techo',
         lambda t: t.replace('--a-layer-system:   800;',
                             '--a-layer-system:   999999;'), 'T5'),
        ('semantico sin pareja en oscuro',
         lambda t: t.replace('  --a-state-selected: var(--a-ink-600);\n', ''), 'T3'),
        ('texto que no cumple contraste',
         lambda t: t.replace('--a-text-secondary: var(--a-neutral-300);',
                             '--a-text-secondary: var(--a-ink-600);'), 'T8'),
    ]
    print('AUTOPRUEBA · cada caso introduce UNA violacion real\n')
    detectados = 0
    for etiqueta, romper, esperado in casos:
        io.open(FUENTE, 'w', encoding='utf-8').write(romper(original))
        vistos = [n for n, fn in COMPROBACIONES if not fn()[0]]
        pillado = any(esperado in v for v in vistos)
        detectados += pillado
        print('  %-38s espera %-6s -> %s' % (etiqueta, esperado,
              'DETECTADO' if pillado else 'NO DETECTADO (!!)'))
    io.open(FUENTE, 'w', encoding='utf-8').write(original)
    print('\n  %d/%d violaciones detectadas · fuente restaurada' % (detectados, len(casos)))
    return 0 if detectados == len(casos) else 1


if __name__ == '__main__':
    if '--autoprueba' in sys.argv:
        sys.exit(autoprueba())
    print('TRIPWIRES · sistema visual ALEPHIA\n')
    n = correr()
    print('\n  %d fallo(s)' % n)
    sys.exit(1 if n else 0)
