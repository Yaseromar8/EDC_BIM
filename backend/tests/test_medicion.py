# -*- coding: utf-8 -*-
"""Tiempo de servidor visible y peticiones lentas registradas sin datos (docs/rendimiento/01 §H7)."""
import importlib
import logging
import time

import pytest
from flask import Flask


@pytest.fixture
def app_medida(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', 'https://visor.alephia.com.pe,https://alephia.com.pe')
    monkeypatch.setenv('MEDICION_LENTO_MS', '50')
    import medicion
    importlib.reload(medicion)
    app = Flask(__name__)
    medicion.init_medicion(app)

    @app.route('/api/cosa/<ident>')
    def cosa(ident):
        if ident == 'lenta':
            time.sleep(0.08)
        return {'ok': True}

    return app.test_client()


def test_cada_respuesta_lleva_su_tiempo_de_servidor(app_medida):
    r = app_medida.get('/api/cosa/rapida')
    assert r.headers['Server-Timing'].startswith('app;dur=')
    assert float(r.headers['Server-Timing'].split('=')[1]) >= 0


def test_permiso_de_tiempos_solo_para_nuestros_dominios(app_medida):
    nuestro = app_medida.get('/api/cosa/x', headers={'Origin': 'https://visor.alephia.com.pe'})
    assert nuestro.headers['Timing-Allow-Origin'] == 'https://visor.alephia.com.pe'
    ajeno = app_medida.get('/api/cosa/x', headers={'Origin': 'https://otro.example'})
    assert 'Timing-Allow-Origin' not in ajeno.headers


def test_la_lenta_se_registra_por_regla_sin_identificadores(app_medida, caplog):
    with caplog.at_level(logging.WARNING, logger='medicion'):
        app_medida.get('/api/cosa/lenta?token=secreto')
        app_medida.get('/api/cosa/rapida')
    lineas = [r.getMessage() for r in caplog.records if r.name == 'medicion']
    assert len(lineas) == 1
    assert 'GET /api/cosa/<ident> -> 200' in lineas[0]
    assert 'lenta' not in lineas[0] and 'secreto' not in lineas[0]


def test_el_backend_real_lo_activa(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('DDL_EN_CALIENTE', 'false')
    monkeypatch.setenv('CORS_ORIGINS', 'https://visor.alephia.com.pe')
    import server
    importlib.reload(server)
    r = server.app.test_client().get('/api/health', headers={'Origin': 'https://visor.alephia.com.pe'})
    assert r.status_code == 200
    assert r.headers['Server-Timing'].startswith('app;dur=')
    assert r.headers['Timing-Allow-Origin'] == 'https://visor.alephia.com.pe'
