# -*- coding: utf-8 -*-
"""Poder demostrar QUE version esta desplegada.

BASELINE 0 · C2, residual. El hallazgo era «lo corregido no esta en produccion».
Se desplegó, pero quedaba abierto lo importante: no habia forma de COMPROBARLO
desde fuera.

El middleware responde 401 a todo lo que no lleva sesion -- tambien a una ruta
inventada -- asi que sondear «¿existe ya el endpoint nuevo?» devuelve 401 tanto
si el despliegue entro como si no. Medido el 15-ago-2026 contra produccion:

    GET /api/esta-ruta-no-existe-nunca  -> 401
    GET /api/plan?model_urn=x           -> 401

Los dos iguales. Con eso, la unica «prueba» de que un despliegue habia entrado
era abrir el panel de Render y creerselo, que no es una prueba: es un acuse de
otra persona. Un expediente que no puede decir que codigo lo esta sirviendo no
puede sostener nada de lo que afirme sobre si mismo.

El latido es publico a proposito (se consulta justo cuando nadie puede
autenticarse), asi que la version tiene que ser un dato que no comprometa nada:
el identificador del commit de un repositorio publico. Ni configuracion, ni
variables, ni rutas internas.
"""
import importlib
import io
import os

import pytest


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('DDL_EN_CALIENTE', 'false')
    import server
    importlib.reload(server)
    return server.app.test_client()


def test_el_latido_dice_la_version(cliente, monkeypatch):
    monkeypatch.setenv('RENDER_GIT_COMMIT', 'b6dd397aabbccddeeff0011')
    r = cliente.get('/api/health')
    assert r.status_code == 200
    d = r.get_json()
    assert d['status'] == 'ok'
    # Corto: identifica el commit sin ser un volcado.
    assert d['version'] == 'b6dd397aabbc'


def test_sin_la_variable_lo_dice_en_vez_de_inventarse_una(cliente, monkeypatch):
    """Devolver una version falsa seria peor que no devolver ninguna: haria
    creer que un despliegue entro."""
    monkeypatch.delenv('RENDER_GIT_COMMIT', raising=False)
    monkeypatch.delenv('GIT_COMMIT', raising=False)
    assert cliente.get('/api/health').get_json()['version'] == 'desconocida'


def test_el_latido_sigue_sin_tocar_la_base(cliente):
    """Su razon de ser es distinguir «no arranco» de «la base no responde». Si
    consultara la base, dejaria de poder distinguirlo."""
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'server.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    i = fuente.index('def health_check')
    cuerpo = fuente[i:fuente.index('@app.route', i)]
    for prohibido in ('get_db_connection', 'cursor', 'SELECT'):
        assert prohibido not in cuerpo, f'el latido no puede usar {prohibido}'


def test_el_latido_no_publica_nada_mas(cliente, monkeypatch):
    """Es publico. Todo lo que salga por aqui sale sin sesion.

    `configuracion` se anadio despues, a proposito y acotado: solo el RECUENTO
    de puntos de seguridad que faltan, nunca cuales ni ningun valor. Es lo que
    permite verificar desde fuera que un cambio de configuracion se aplico, sin
    dar un mapa de por donde entrar.
    """
    monkeypatch.setenv('RENDER_GIT_COMMIT', 'abc123')
    d = cliente.get('/api/health').get_json()
    assert set(d) == {'status', 'service', 'version', 'rama', 'configuracion'}
    assert set(d['configuracion']) == {'completa', 'puntos', 'faltan'}
