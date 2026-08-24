# -*- coding: utf-8 -*-
"""E2E-10 del diseño (doc 55 §8): el «rol gigante» no existe.

En ACC/Procore la lección es vieja: cuando una sola lista mezcla el PERFIL DEL
SISTEMA (qué puede hacer la persona en la plataforma: admin/user) con la
FUNCIÓN CONTRACTUAL (en qué calidad participa su EMPRESA en la obra:
contratista, supervisión…), nace el «rol gigante» — un control donde marcar
«Contratista» acaba concediendo o quitando permisos. Las dos cosas viven en
tablas distintas por diseño (users.role vs project_companies.funcion) y la UI
tiene prohibido volver a juntarlas en el mismo control.

Este test es el CONTRATO de esa separación, medido sobre el fuente del portal:

  1. Ningún `<select>` ofrece a la vez vocabulario de perfil y de función.
  2. Donde se lista gente por obra (Participantes), el perfil aparece como
     etiqueta, nunca como control editable.
  3. La ficha de persona (P4) no edita nada: es la vista transversal.

Es un test de texto sobre JSX — deliberadamente simple: si mañana alguien
añade `<option value="admin">` al selector de funciones, esto revienta.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORTAL = os.path.join(RAIZ, 'frontend-docs', 'src')

# Los dos vocabularios, tal como viajan en `value=` de las opciones:
PERFILES = ('admin', 'editor', 'viewer', 'user')
FUNCIONES = ('ENTIDAD', 'SUPERVISION', 'CONTRATISTA', 'PROYECTISTA')


def _jsx():
    for raiz, _dirs, ficheros in os.walk(PORTAL):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if f.endswith(('.jsx', '.js')):
                yield os.path.join(raiz, f)


def _selects(texto):
    """Cada bloque <select …>…</select> del fichero, con lo que contiene."""
    return re.findall(r'<select\b[\s\S]*?</select>', texto)


def _vocabulario_de(bloque):
    """Qué vocabularios ofrece un select, mirando sus opciones y fuentes."""
    perfiles = any(re.search(r'''value=["']%s["']''' % p, bloque) for p in PERFILES)
    # Las funciones pueden venir como opciones literales o desde el catálogo
    # (funciones.map / ETIQUETA_FUNCION): ambas formas cuentan.
    funciones = (any(f in bloque for f in FUNCIONES)
                 or 'ETIQUETA_FUNCION' in bloque
                 or re.search(r'\bfunciones\b', bloque) is not None)
    return perfiles, funciones


def test_ningun_select_mezcla_perfil_y_funcion():
    mezclados = []
    for ruta in _jsx():
        texto = io.open(ruta, encoding='utf-8', errors='ignore').read()
        for bloque in _selects(texto):
            perfil, funcion = _vocabulario_de(bloque)
            if perfil and funcion:
                mezclados.append(os.path.relpath(ruta, PORTAL))
    assert not mezclados, (
        'El "rol gigante" reapareció: estos ficheros ofrecen perfil del '
        'sistema y función contractual EN EL MISMO control: %s' % mezclados)


def test_participantes_no_edita_el_perfil():
    """En la pantalla por obra el perfil es una etiqueta. Editarlo es de la
    pantalla de Usuarios (la entidad), no del contexto de una obra — ahí es
    donde el rol gigante empieza."""
    ruta = os.path.join(PORTAL, 'components', 'ParticipantesModule.jsx')
    texto = io.open(ruta, encoding='utf-8').read()
    for bloque in _selects(texto):
        perfil, _ = _vocabulario_de(bloque)
        assert not perfil, 'ParticipantesModule ofrece un select de perfil del sistema'


def test_la_ficha_de_persona_es_solo_lectura():
    """P4: la ficha junta la escalera; no duplica caminos de edición."""
    ruta = os.path.join(PORTAL, 'components', 'FichaDePersona.jsx')
    texto = io.open(ruta, encoding='utf-8').read()
    assert '<select' not in texto and '<input' not in texto and '<textarea' not in texto, (
        'FichaDePersona dejó de ser solo lectura')


def test_los_dos_vocabularios_siguen_existiendo():
    """Autocontrol del test: si los selectores reales cambian de forma y este
    contrato deja de ver los vocabularios, debe avisar en vez de pasar en
    silencio por mirar al lugar equivocado."""
    con_perfil = con_funcion = 0
    for ruta in _jsx():
        texto = io.open(ruta, encoding='utf-8', errors='ignore').read()
        for bloque in _selects(texto):
            perfil, funcion = _vocabulario_de(bloque)
            con_perfil += perfil
            con_funcion += funcion
    assert con_perfil >= 1, 'ya no se encuentra el selector de perfil (Usuarios)'
    assert con_funcion >= 1, 'ya no se encuentra el selector de función (Participantes)'


# ── Los diálogos de actos críticos son del PRODUCTO, no del navegador ────────
#
# `window.confirm` lo SUPRIME Chrome cuando una página ya mostró varios
# diálogos (o el usuario marcó «impedir más diálogos»). Suprimido devuelve
# `false`: el acto se cancela EN SILENCIO y el control vuelve solo a su valor
# anterior, indistinguible de un permiso denegado.
#
# Medido el 23-ago-2026: el nombramiento del segundo custodio de la entidad
# quedó bloqueado exactamente así, sin un solo mensaje. `confirmAction`
# (utils/confirm.jsx) es el modal del producto y no lo puede suprimir nadie.

CRITICOS = ('RolDeMiembro.jsx', 'ParticipantesModule.jsx',
            'FolderPermissionsPanel.jsx')


def test_ningun_acto_critico_depende_del_dialogo_del_navegador():
    culpables = []
    for fichero in CRITICOS:
        ruta = os.path.join(PORTAL, 'components', fichero)
        if not os.path.exists(ruta):
            continue
        for n, linea in enumerate(io.open(ruta, encoding='utf-8').read().split('\n'), 1):
            # Se ignoran los comentarios: explican por qué ya no se usa.
            if 'window.confirm' in linea and not linea.strip().startswith('//'):
                culpables.append('%s:%d' % (fichero, n))
    assert not culpables, (
        'estos actos volverían a cancelarse en silencio si Chrome suprime el '
        'diálogo: %s' % culpables)


def test_el_anfitrion_del_dialogo_esta_montado():
    """Sin `<ConfirmHost />` en la raíz, `confirmAction` degrada al
    `window.confirm` de siempre — y con él vuelve el fallo silencioso."""
    main = io.open(os.path.join(PORTAL, 'main.jsx'), encoding='utf-8').read()
    assert '<ConfirmHost />' in main


# ── El mínimo de contraseña es UNO, no dos ──────────────────────────────────
#
# Medido el 23-ago-2026: la pantalla validaba 8 caracteres y el servidor exige
# 10. Una clave de 8 o 9 pasaba el control local PARA QUE el servidor la
# rechazara — el peor reparto posible: la validación de la pantalla no ahorra
# el viaje y además miente. Y era lo primero que veía un invitado.

def test_el_minimo_de_clave_de_la_pantalla_es_el_del_servidor():
    politica = io.open(os.path.join(os.path.dirname(PORTAL), '..', 'backend',
                                    'password_policy.py'), encoding='utf-8').read()
    servidor = int(re.search(r'LARGO_MINIMO\s*=\s*(\d+)', politica).group(1))
    login = io.open(os.path.join(PORTAL, 'LoginScreen.jsx'), encoding='utf-8').read()
    pantalla = int(re.search(r'const MIN_CLAVE\s*=\s*(\d+)', login).group(1))
    assert pantalla == servidor, (
        'la pantalla dice %d y el servidor exige %d: el usuario descubriría la '
        'regla a base de rechazos' % (pantalla, servidor))
    # Y el número no se repite a mano por ahí suelto.
    assert 'al menos 8 caracteres' not in login
    assert 'clave.length < 8' not in login


def test_la_politica_se_dice_antes_del_rechazo():
    """Donde se ELIGE una contraseña nueva (crear cuenta, restablecer), las
    reglas se ven de entrada. En el inicio de sesión normal no: ahí la clave ya
    existe y la pista sería ruido."""
    login = io.open(os.path.join(PORTAL, 'LoginScreen.jsx'), encoding='utf-8').read()
    assert 'clavePista' in login
    assert '{pideRepetir && <p className="cta-pista">{t.clavePista}</p>}' in login
