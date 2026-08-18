# -*- coding: utf-8 -*-
"""Una capacidad de administrador sin puerta es una capacidad que no existe.

LO QUE PASO
-----------
El propietario quiso archivar una obra y no encontró la opción. El backend sabía
archivar desde siempre: ruta de administrador, borrado suave, auditada. Y
NINGUNO de los tres clientes la llamaba. Cero. La capacidad estaba; la puerta no.

Es la misma familia que ya apareció con el catálogo de idoneidad («editable por
obra» y sin ninguna vía de escritura), con el triaje de seguridad (guardia
correcta y sin pantalla donde contestar) y con `puede_salir_del_ecd` (escrita,
documentada y llamada solo por sus propios tests).

POR QUE EL CANDADO QUE YA HABIA NO LO CAZO
------------------------------------------
`test_controles_con_salida.py` comprueba exactamente esto, pero sobre una LISTA
ESCRITA A MANO de dos rutas. Solo vigila lo que alguien recordó apuntar, así que
no podía ver una tercera. Este barre TODAS las rutas de administrador y obliga a
justificar por escrito cada una que no tenga llamador.

Las excepciones son tres y llevan su motivo. La lista solo debería encoger.
"""
import ast
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENTES = [os.path.join(RAIZ, d, 'src') for d in
            ('frontend-docs', 'frontend-react', 'frontend')]

# Rutas de administrador que legítimamente no se invocan desde una pantalla.
# CADA UNA con su motivo: sin motivo escrito, esto es una lista de tapaderas.
SIN_PANTALLA = {
    '/api/audit/snapshot':
        'instantánea para auditoría: la usa una herramienta de línea de comandos, '
        'no una pantalla. Meterla en el portal invitaría a lanzarla sin querer',
    '/api/audit/compare':
        'compara dos instantáneas de auditoría; mismo caso que snapshot',
    '/api/auth/aps/login':
        'ARRANCA el flujo OAuth de Autodesk: es una REDIRECCIÓN del navegador, no '
        'una llamada de datos, así que no aparece como fetch en el código. '
        'PENDIENTE comprobado el 17-ago: hoy NINGÚN cliente la enlaza, así que la '
        'conexión con ACC no se puede iniciar desde el producto',
}


def _rutas_de_admin():
    """(fichero, ruta) de cada endpoint que exige rol de administrador."""
    salida = []
    for raiz, _dirs, ficheros in os.walk(BACKEND):
        if any(x in raiz for x in ('venv', 'tests', '__pycache__')):
            continue
        for f in sorted(ficheros):
            if not f.endswith('.py'):
                continue
            ruta_f = os.path.join(raiz, f)
            src = io.open(ruta_f, encoding='utf-8', errors='ignore').read()
            try:
                arbol = ast.parse(src)
            except SyntaxError:
                continue
            for n in ast.walk(arbol):
                if not isinstance(n, ast.FunctionDef):
                    continue
                deco = ' '.join(ast.get_source_segment(src, d) or ''
                                for d in n.decorator_list)
                if '.route(' not in deco:
                    continue
                cuerpo = ast.get_source_segment(src, n) or ''
                if "requiere_rol('admin')" not in deco and '_solo_admin(' not in cuerpo:
                    continue
                m = re.search(r"route\(\s*['\"]([^'\"]+)", deco)
                if m:
                    salida.append((os.path.relpath(ruta_f, BACKEND), m.group(1)))
    return sorted(set(salida))


def _codigo_de_los_clientes():
    trozos = []
    for base in CLIENTES:
        if not os.path.isdir(base):
            continue
        for raiz, _dirs, ficheros in os.walk(base):
            if 'node_modules' in raiz:
                continue
            for f in ficheros:
                if f.endswith(('.jsx', '.js')):
                    trozos.append(io.open(os.path.join(raiz, f),
                                          encoding='utf-8', errors='ignore').read())
    return '\n'.join(trozos)


def _la_llama(ruta, cliente):
    """¿Hay una llamada a esta ruta en algún cliente?

    Las rutas con parámetro se escriben interpoladas -- `/api/projects/${id}/restaurar` --
    así que buscar la ruta entera nunca casaría. Se exige el trozo ANTES del
    primer parámetro y el trozo DESPUÉS del último: los dos tienen que aparecer.
    """
    partes = re.split(r'<[^>]+>', ruta)
    prefijo = partes[0].rstrip('/')
    sufijo = partes[-1].strip('/') if len(partes) > 1 else ''
    if prefijo and prefijo not in cliente:
        return False
    if sufijo and sufijo not in cliente:
        return False
    return bool(prefijo or sufijo)


def test_toda_capacidad_de_administrador_tiene_puerta():
    cliente = _codigo_de_los_clientes()
    assert len(cliente) > 100000, 'no se leyó el código de los clientes'

    huerfanas = []
    for fichero, ruta in _rutas_de_admin():
        if ruta in SIN_PANTALLA:
            continue
        if not _la_llama(ruta, cliente):
            huerfanas.append('%s  (%s)' % (ruta, fichero))

    assert not huerfanas, (
        'estas capacidades de administrador NO se pueden usar desde ningún '
        'cliente: existen en el backend y no hay puerta. O se les construye la '
        'pantalla, o se declaran en SIN_PANTALLA con su motivo:\n  '
        + '\n  '.join(huerfanas))


def test_las_excepciones_declaradas_siguen_existiendo():
    """Una excepción para una ruta que ya no existe esconde el siguiente fallo."""
    rutas = {r for _f, r in _rutas_de_admin()}
    fantasmas = sorted(set(SIN_PANTALLA) - rutas)
    assert not fantasmas, (
        'estas excepciones ya no corresponden a ninguna ruta de administrador: '
        + ', '.join(fantasmas))


def test_archivar_una_obra_tiene_su_puerta_y_su_vuelta():
    """El caso concreto que originó todo esto.

    No basta con que se pueda archivar: tiene que poder deshacerse. Archivar era
    `UPDATE status='archived'` sin ninguna vía de retorno, y cuando el 7-ago se
    archivó PQT8_TALARA por error, la única salida fue tocar la base a mano.
    """
    cliente = _codigo_de_los_clientes()
    assert '/api/projects/archivadas' in cliente, (
        'no hay forma de VER las obras archivadas, así que archivar sigue siendo '
        'un viaje de ida')
    assert 'restaurar' in cliente, 'no hay forma de restaurar una obra archivada'
