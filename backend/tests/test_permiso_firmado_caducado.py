"""Un permiso firmado caducado no puede tapar una sesion valida. (N68)

EL FALLO QUE ESTAS PRUEBAS FIJAN
--------------------------------
`_acceso_al_recurso` miraba el permiso firmado ANTES que la sesion, y si el
permiso no valia respondia 403 sin llegar a mirar si quien pedia tenia sesion:

    firmado = request.args.get('t')
    if firmado:
        ...
        return 403          # <- cortaba aqui, con sesion buena o sin ella

Eso no es un detalle de estilo. El permiso dura 24 h y el cliente lo guarda 20 h
renovandolo SOLO por edad, nunca al recibir un 403. Asi que una pestaña abierta
en obra seguia pegando el mismo `?t=` muerto y veia las fotos y los PDF rotos
durante horas, con la sesion perfectamente valida. Y sobrevivia al cierre de
sesion: el usuario volvia a entrar y la pantalla seguia rota.

`pins.py` y `server.py` ya lo hacian al reves y bien -- miran el permiso firmado
SOLO si no hay sesion. Estas pruebas fijan que documents.py haga lo mismo, y que
al visitante sin sesion se le siga diciendo que su enlace caduco, en vez de
pedirle unas credenciales que nunca tuvo.
"""
import os

import pytest
from flask import Flask, g

os.environ.setdefault('APP_SECRET', 'x' * 32)


@pytest.fixture
def entorno(monkeypatch):
    documents = pytest.importorskip('routes.documents')
    # El registro de accesos escribe en la base: aqui solo interesa la decision.
    monkeypatch.setattr(documents, '_anotar_acceso', lambda *a, **k: None)
    return Flask(__name__), documents


def test_con_sesion_un_permiso_caducado_no_corta(entorno):
    """El caso real: pestaña abierta en obra, token viejo, sesion buena."""
    app, documents = entorno
    with app.test_request_context('/api/docs/proxy?id=7&t=esto-ya-no-vale'):
        g.current_user = {'id': 3, 'role': 'admin'}
        negativa = documents._acceso_al_recurso(node_id='7')
    assert negativa is None, (
        'el permiso caducado tapo la sesion: es lo que dejaba las fotos rotas '
        'hasta 20 horas. Devolvio: %r' % (negativa,))


def test_sin_sesion_un_permiso_caducado_dice_que_caduco(entorno):
    """Al que llega solo con el enlace se le dice lo que le pasa."""
    app, documents = entorno
    with app.test_request_context('/api/docs/proxy?id=7&t=esto-ya-no-vale'):
        g.current_user = None
        negativa = documents._acceso_al_recurso(node_id='7')
    assert negativa is not None
    cuerpo, codigo = negativa
    assert codigo == 403
    assert 'caducado' in cuerpo.get_json()['error'].lower(), (
        'pedirle credenciales a quien solo tiene un enlace le hace buscar unas '
        'que nunca tuvo')


def test_sin_sesion_y_sin_enlace_se_pide_sesion(entorno):
    """Y sin enlace ninguno, la respuesta correcta sigue siendo 401."""
    app, documents = entorno
    with app.test_request_context('/api/docs/proxy?id=7'):
        g.current_user = None
        negativa = documents._acceso_al_recurso(node_id='7')
    assert negativa is not None
    _cuerpo, codigo = negativa
    assert codigo == 401
