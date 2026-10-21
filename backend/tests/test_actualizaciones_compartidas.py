# -*- coding: utf-8 -*-
"""«¿Hay versiones nuevas en ACC?» en paralelo y compartido por obra (docs/rendimiento/01 §H4).

Medido: 2,6 s al abrir el frente, preguntando a Autodesk modelo a modelo en serie, y lo pedía cada usuario
al abrir y cada 5 min aunque la respuesta es la misma para la obra."""
import threading
import time

import pytest
from flask import Flask

from routes import digital_twin as dt


class Resp:
    def __init__(self, ok, cuerpo=None, status=200):
        self.ok, self._cuerpo, self.status_code = ok, cuerpo, status

    def json(self):
        return self._cuerpo


@pytest.fixture
def banco(monkeypatch):
    estado = {'llamadas': 0, 'activas': 0, 'max_activas': 0, 'fallar': set(),
              'modelos': [{'id': f'm{i}', 'name': f'Modelo {i}', 'appProjectId': 'p1', 'projectId': 'b.1',
                           'itemId': f'it{i}', 'versionId': f'v{i}-1', 'versionNumber': 1, 'urn': f'u{i}'}
                          for i in range(4)]}
    cerrojo = threading.Lock()

    def get(url, headers=None, timeout=None):
        with cerrojo:
            estado['llamadas'] += 1
            estado['activas'] += 1
            estado['max_activas'] = max(estado['max_activas'], estado['activas'])
        time.sleep(0.15)
        with cerrojo:
            estado['activas'] -= 1
        item = url.rsplit('/', 1)[-1]
        if item in estado['fallar']:
            return Resp(False, status=503)
        if '/versions/' in url:
            return Resp(True, {'data': {'attributes': {'versionNumber': 2}}})
        tip = f"{item.replace('it', 'v')}-2" if item == 'it0' else f"{item.replace('it', 'v')}-1"
        return Resp(True, {'data': {'relationships': {'tip': {'data': {'id': tip}}}}})

    monkeypatch.setattr(dt.requests, 'get', get)
    monkeypatch.setattr(dt, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(dt, 'get_project_config_internal', lambda: {'models': estado['modelos']})
    dt._actualizaciones_cache.clear()
    dt._actualizaciones_en_curso.clear()
    app = Flask(__name__)

    def pedir():
        with app.test_request_context('/api/config/project/check-updates', method='POST', json={'project': 'p1'}):
            r = dt.check_model_updates()
            return (r[0] if isinstance(r, tuple) else r).get_json()['updates']

    return estado, pedir


def test_misma_respuesta_y_orden(banco):
    estado, pedir = banco
    updates = pedir()
    assert [u['model_id'] for u in updates] == ['m0', 'm1', 'm2', 'm3']
    assert updates[0]['has_update'] is True and updates[0]['latest_version'] == 2
    assert all(u['has_update'] is False for u in updates[1:])


def test_pregunta_en_paralelo(banco):
    estado, pedir = banco
    t = time.perf_counter()
    pedir()
    assert estado['max_activas'] > 1
    assert time.perf_counter() - t < 0.15 * estado['llamadas']  # en serie serían 5 × 0,15 s


def test_se_comparte_entre_usuarios_de_la_obra(banco):
    estado, pedir = banco
    pedir()
    llamadas = estado['llamadas']
    pedir()
    pedir()
    assert estado['llamadas'] == llamadas


def test_al_cambiar_una_version_se_vuelve_a_preguntar(banco):
    estado, pedir = banco
    pedir()
    llamadas = estado['llamadas']
    estado['modelos'][0] = {**estado['modelos'][0], 'versionId': 'v0-2', 'versionNumber': 2}
    assert pedir()[0]['has_update'] is False
    assert estado['llamadas'] > llamadas


def test_los_errores_de_autodesk_no_se_comparten(banco):
    estado, pedir = banco
    estado['fallar'] = {'it2'}
    assert pedir()[2]['reason'] == 'api_error_503'
    llamadas = estado['llamadas']
    estado['fallar'] = set()
    assert 'reason' not in pedir()[2]
    assert estado['llamadas'] > llamadas


def test_caduca(banco, monkeypatch):
    estado, pedir = banco
    pedir()
    llamadas = estado['llamadas']
    monkeypatch.setattr(dt, '_ACTUALIZACIONES_TTL_S', 0)
    pedir()
    assert estado['llamadas'] > llamadas
