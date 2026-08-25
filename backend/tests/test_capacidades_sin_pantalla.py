# -*- coding: utf-8 -*-
"""«EXISTE EN EL BACKEND» NO CUENTA COMO IMPLEMENTADO.

EL DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR
---------------------------------------------
GAP 02 se declaro COMPLETE --ARQ, OP y EXP-- el 25-ago-2026. Su EXP se ejecuto
contra la API con un script. Un mes de trabajo despues se descubrio que la
pantalla de Planos podia crear la identidad de un plano y NO PODIA EMITIR UNA
REVISION: `POST /api/planos/<pid>/revisiones` existia desde el primer dia y no
la llamaba nadie.

Un usuario real no podia responder desde la interfaz la unica pregunta que ese
objeto existe para responder --cual es la lamina vigente en obra-- y sin embargo
el gap figuraba cerrado.

    UNA EXP POR API DEMUESTRA QUE EL BACKEND FUNCIONA.
    NO DEMUESTRA QUE LA CAPACIDAD EXISTA PARA UNA PERSONA.

Medido ese dia: de las 5 rutas de escritura de planos, la pantalla usaba 1.

QUE MIDE
--------
Para las herramientas del CDE --las que una entidad opera desde el portal-- cada
ruta que ESCRIBE tiene que ser llamada por algun fichero de `frontend-docs`. Lo
que no, se declara con su motivo. Una lista sin motivos es una tapadera.

No comprueba que la pantalla este BIEN, ni que la llamada sea correcta: eso lo
hace la EXP. Comprueba que exista un camino desde la interfaz, que es la
condicion minima para que la EXP de una persona sea siquiera posible.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTAL = os.path.join(os.path.dirname(BACKEND), 'frontend-docs', 'src')

# Las herramientas del CDE y el prefijo con el que `server.py` las monta.
HERRAMIENTAS = {
    'submittals.py': '/api/submittals',
    'planos.py': '/api/planos',
    'protocolos.py': '/api/protocolos',
    'issues.py': '/api/issues',
    'specs.py': '/api/specs',
}

# Rutas de escritura que HOY no tienen camino desde la interfaz, cada una con su
# motivo. Esta lista solo puede ENCOGER.
SIN_PANTALLA = {
    # Clavar un RFI, un punch o un submittal en un PUNTO de la lamina. No es la
    # misma capacidad que emitir una revision: necesita una interaccion sobre el
    # PDF --abrir, hacer zoom, senalar-- y por tanto un visor, no un formulario.
    # El objeto y su ruta estan listos; la interaccion es trabajo propio.
    ('planos.py', 'POST', '/api/planos/revisiones/<int:rid>/anclajes'):
        'exige senalar un punto sobre el PDF: es interaccion de visor, no de formulario',
}


def _rutas_de_escritura():
    for fichero, prefijo in HERRAMIENTAS.items():
        camino = os.path.join(BACKEND, 'routes', fichero)
        src = io.open(camino, encoding='utf-8').read()
        for m in re.finditer(r"@\w+\.route\(\s*'([^']*)'.*?methods=\[([^\]]+)\]", src):
            url, metodos = m.group(1), m.group(2)
            for verbo in ('POST', 'PUT', 'PATCH', 'DELETE'):
                if verbo in metodos:
                    yield fichero, verbo, (prefijo + url) or prefijo


def _texto_del_portal():
    trozos = []
    for raiz, _dirs, ficheros in os.walk(PORTAL):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if f.endswith(('.jsx', '.js')):
                trozos.append(io.open(os.path.join(raiz, f), encoding='utf-8',
                                      errors='ignore').read())
    return '\n'.join(trozos)


def _sin_camino():
    portal = _texto_del_portal()
    sin = []
    for fichero, verbo, url in _rutas_de_escritura():
        # El prefijo LITERAL hasta el primer parametro: es lo que el cliente
        # escribe antes de interpolar el id.
        literal = re.split(r'<', url)[0].rstrip('/')
        if literal and literal not in portal:
            sin.append((fichero, verbo, url))
    return sin


def test_toda_capacidad_del_CDE_tiene_camino_desde_la_interfaz():
    huerfanas = [x for x in _sin_camino() if x not in SIN_PANTALLA]
    assert not huerfanas, (
        'estas rutas ESCRIBEN y ninguna pantalla las llama: existen en el '
        'backend y no existen para una persona. Declarar el gap COMPLETE con '
        'una EXP por API seria esconderlo:\n  '
        + '\n  '.join('%s  %s  %s' % x for x in sorted(huerfanas)))


def test_las_excepciones_declaradas_siguen_siendo_ciertas():
    """Si una deja de aparecer es que ya tiene pantalla: se retira de la lista.
    Una lista de excepciones que cria polvo deja de significar nada."""
    sin = set(_sin_camino())
    sobran = set(SIN_PANTALLA) - sin
    assert not sobran, (
        'estas ya tienen camino desde la interfaz; quitalas de SIN_PANTALLA:\n  '
        + '\n  '.join('%s  %s  %s' % x for x in sorted(sobran)))


def test_la_pantalla_de_planos_puede_EMITIR_UNA_REVISION():
    """La capacidad concreta cuya ausencia obligo a reabrir la EXP de GAP 02.

    Se comprueba por partes, porque emitir una revision no es una llamada: es
    elegir el documento del expediente, fijar SU VERSION, y mandar las dos cosas.
    """
    fuente = io.open(os.path.join(PORTAL, 'components', 'PlanosModule.jsx'),
                     encoding='utf-8').read()
    assert 'SelectorDeDocumento' in fuente, 'sin selector no hay forma de senalar la lamina'
    assert '/api/planos/' in fuente and '/revisiones' in fuente
    cuerpo = fuente.split('const emitir')[1].split('\n  const ')[0]
    assert "method: 'POST'" in cuerpo
    assert 'file_node_id' in cuerpo
    assert 'file_version_id' in cuerpo, (
        'se manda el NODO sin la VERSION: la revision diria «lo que haya hoy en '
        'ese fichero» y bastaria con subir otra para cambiar lo ya emitido')


def test_el_cajetin_se_lee_al_elegir_la_lamina():
    """`leer-cajetin` tambien estaba muerta desde la interfaz. Es el asistente
    del mismo acto: sugiere la revision leyendo el PDF."""
    fuente = io.open(os.path.join(PORTAL, 'components', 'PlanosModule.jsx'),
                     encoding='utf-8').read()
    assert 'leer-cajetin' in fuente
    # Y la sugerencia NO se impone: si el cajetin dice otro plano, se avisa.
    assert 'sug.numero' in fuente and 'plano.numero' in fuente
