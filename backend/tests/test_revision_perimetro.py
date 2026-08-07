"""Regresiones que encontro la revision independiente del perimetro.

Casi todas fueron INTRODUCIDAS por la propia tanda de endurecimiento. Cada test
de aqui evita repetir el mismo error: cerrar una puerta y dejar la de al lado
abierta, o cerrarla tan fuerte que se rompe lo que ya funcionaba.
"""
import importlib

import pytest
from flask import Flask, jsonify


# ── El enlace de los correos no lo elige quien llama ────────────────────────

@pytest.fixture
def auth_con_lista_blanca(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('APP_URL', 'https://visor.propio.com')
    monkeypatch.setenv('CORS_ORIGINS', 'https://visor.propio.com,https://docs.propio.com')
    import routes.auth as ra
    importlib.reload(ra)
    app = Flask(__name__)
    return ra, app


def test_origen_de_atacante_no_decide_a_donde_apunta_el_enlace(auth_con_lista_blanca):
    """Con Origin de un tercero, a la víctima le llegaba un correo NUESTRO con
    un botón al dominio del atacante, y ahí se le entregaba su token de reset."""
    ra, app = auth_con_lista_blanca
    with app.test_request_context('/', headers={'Origin': 'https://dominio-del-atacante'}):
        assert ra._origen_del_cliente() == 'https://visor.propio.com'


def test_origen_propio_si_se_respeta(auth_con_lista_blanca):
    """El enlace tiene que apuntar a la web desde la que se pidió (visor o docs)."""
    ra, app = auth_con_lista_blanca
    with app.test_request_context('/', headers={'Origin': 'https://docs.propio.com'}):
        assert ra._origen_del_cliente() == 'https://docs.propio.com'


def test_sin_cabecera_se_usa_el_destino_fijo(auth_con_lista_blanca):
    ra, app = auth_con_lista_blanca
    with app.test_request_context('/'):
        assert ra._origen_del_cliente() == 'https://visor.propio.com'


def test_sin_lista_blanca_no_se_cree_la_cabecera(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('APP_URL', 'https://visor.propio.com')
    monkeypatch.delenv('CORS_ORIGINS', raising=False)
    import routes.auth as ra
    importlib.reload(ra)
    app = Flask(__name__)
    with app.test_request_context('/', headers={'Origin': 'https://dominio-del-atacante'}):
        assert ra._origen_del_cliente() == 'https://visor.propio.com'


# ── El perímetro heredado (el que manda en modo sombra) ─────────────────────

@pytest.fixture
def middleware(monkeypatch):
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')
    import auth_middleware as am
    importlib.reload(am)
    return am


@pytest.mark.parametrize('ruta', ['/api/auth/forgot-password', '/api/auth/reset-password'])
def test_recuperar_contrasena_es_publico(middleware, ruta):
    """Estaba construido pero respondía 401: quien olvida su contraseña, por
    definición, no puede autenticarse para pedir el enlace."""
    assert middleware._abierto_por_prefijo(ruta, 'POST') is True


@pytest.mark.parametrize('ruta', ['/api/companies', '/api/job_titles'])
def test_catalogos_se_leen_pero_no_se_escriben(middleware, ruta):
    """Estaban en la lista de paths públicos, que no mira el método: eso dejaba
    POST anónimo sobre los catálogos de empresas y cargos."""
    assert middleware._abierto_por_prefijo(ruta, 'GET') is True
    assert middleware._abierto_por_prefijo(ruta, 'POST') is False


# ── No se puede anular la autorización por obra con un parámetro basura ─────

def test_un_urn_inventado_no_anula_la_comprobacion_de_obra(middleware, monkeypatch):
    """_request_project_id cortaba en la PRIMERA fuente que trajera una clave,
    resolviera o no. Bastaba colgar ?urn=basura a cualquier petición para que la
    obra saliera None y la comprobación de membresía se saltara entera."""
    import db
    import time
    db._project_resolver_cache['map'] = {
        'by_id': {'obra-real': 'obra-real'}, 'by_name': {}, 'default': None,
    }
    db._project_resolver_cache['ts'] = time.time()

    app = Flask(__name__)
    # El atacante cuelga ?urn=basura, pero el cuerpo sí lleva la obra de verdad.
    with app.test_request_context('/api/lo-que-sea?urn=basura-inventada',
                                  method='POST', json={'project_id': 'obra-real'}):
        assert middleware._request_project_id() == 'obra-real'


def test_sin_ninguna_obra_deducible_devuelve_none(middleware):
    import db
    import time
    db._project_resolver_cache['map'] = {'by_id': {}, 'by_name': {}, 'default': None}
    db._project_resolver_cache['ts'] = time.time()
    app = Flask(__name__)
    with app.test_request_context('/api/lo-que-sea?urn=basura'):
        assert middleware._request_project_id() is None


# ── Los guards de rol funcionan ANTES de activar el modo estricto ───────────

def test_guard_de_obra_no_espera_al_modo_estricto():
    """@requiere_rol solo bloquea en modo estricto. Mientras la política corre en
    sombra, crear/renombrar/archivar obras necesita su propio guard dentro."""
    import routes.projects as rp
    app = Flask(__name__)
    with app.test_request_context('/'):
        assert rp._solo_admin('crear obras')[1] == 401          # sin sesión
    with app.test_request_context('/'):
        from flask import g
        g.current_user = {'id': 2, 'role': 'user'}
        assert rp._solo_admin('crear obras')[1] == 403          # con sesión, sin rol
    with app.test_request_context('/'):
        from flask import g
        g.current_user = {'id': 1, 'role': 'admin'}
        assert rp._solo_admin('crear obras') is None            # admin pasa
