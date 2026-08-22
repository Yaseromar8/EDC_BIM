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
