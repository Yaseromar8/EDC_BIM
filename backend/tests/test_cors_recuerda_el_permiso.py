# -*- coding: utf-8 -*-
"""El permiso previo de CORS se recuerda 2 h (docs/rendimiento/01 §H3).

View llama al backend desde otro dominio y con Authorization, así que cada llamada necesita un OPTIONS.
Sin Access-Control-Max-Age, Chrome lo recuerda 5 s: medido en producción, casi cada llamada pagaba un viaje
extra de ~160–260 ms y el servidor recibía el doble de peticiones."""
import importlib

import pytest


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('DDL_EN_CALIENTE', 'false')
    monkeypatch.setenv('CORS_ORIGINS', 'https://visor.alephia.com.pe')
    import server
    importlib.reload(server)
    return server.app.test_client()


def test_el_permiso_previo_dura_dos_horas(cliente):
    r = cliente.options('/api/inventory/version?model_urn=x', headers={
        'Origin': 'https://visor.alephia.com.pe',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
    })
    assert r.headers.get('Access-Control-Allow-Origin') == 'https://visor.alephia.com.pe'
    assert r.headers.get('Access-Control-Max-Age') == '7200'


def test_un_origen_ajeno_no_recibe_permiso(cliente):
    r = cliente.options('/api/inventory/version?model_urn=x', headers={
        'Origin': 'https://otro-sitio.example',
        'Access-Control-Request-Method': 'GET',
    })
    assert r.headers.get('Access-Control-Allow-Origin') is None
