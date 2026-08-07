"""Politica de acceso declarada por endpoint.

Estos tests son el candado del inventario: si alguien añade una ruta nueva y no
la clasifica, o abre algo sin escribir por que, aqui se ve.
"""
import importlib

import pytest
from flask import Flask, jsonify


@pytest.fixture
def pol(monkeypatch):
    monkeypatch.setenv('AUTH_POLICY_MODE', 'estricto')
    import politica
    importlib.reload(politica)
    return politica


def _app(pol, am):
    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/abierto')
    @pol.publico(motivo='latido de servicio')
    def abierto():
        return jsonify(ok=True)

    @app.route('/api/lectura', methods=['GET', 'POST'])
    @pol.publico_en_lectura(motivo='vistas compartidas por enlace')
    def lectura():
        return jsonify(ok=True)

    @app.route('/api/privado', methods=['GET', 'POST'])
    @pol.requiere_sesion
    def privado():
        return jsonify(ok=True)

    @app.route('/api/solo-admin', methods=['POST'])
    @pol.requiere_rol('admin')
    def solo_admin():
        return jsonify(ok=True)

    @app.route('/api/sin-clasificar')          # a proposito: sin decorador
    def sin_clasificar():
        return jsonify(ok=True)

    return app


@pytest.fixture
def app_y_am(pol, monkeypatch):
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')
    import auth_middleware as am
    importlib.reload(am)
    app = _app(pol, am)
    am.validate_session = lambda t: (
        {'id': 1, 'role': 'admin'} if t == 'ADMIN'
        else ({'id': 2, 'role': 'user'} if t == 'USUARIO' else None)
    )
    return app, am


def _cab(token):
    return {'Authorization': f'Bearer {token}'}


def test_publico_entra_sin_sesion(app_y_am):
    app, _ = app_y_am
    assert app.test_client().get('/api/abierto').status_code == 200


def test_publico_en_lectura_lee_pero_no_escribe(app_y_am):
    app, _ = app_y_am
    c = app.test_client()
    assert c.get('/api/lectura').status_code == 200
    assert c.post('/api/lectura').status_code == 401


def test_privado_exige_sesion(app_y_am):
    app, _ = app_y_am
    c = app.test_client()
    assert c.get('/api/privado').status_code == 401
    assert c.get('/api/privado', headers=_cab('USUARIO')).status_code == 200


def test_rol_admin_rechaza_a_usuario_normal(app_y_am):
    app, _ = app_y_am
    c = app.test_client()
    assert c.post('/api/solo-admin', headers=_cab('USUARIO')).status_code == 403
    assert c.post('/api/solo-admin', headers=_cab('ADMIN')).status_code == 200


def test_ruta_sin_clasificar_falla_cerrada(app_y_am):
    """Lo no declarado NO se abre: el defecto seguro es exigir sesion."""
    app, _ = app_y_am
    assert app.test_client().get('/api/sin-clasificar').status_code == 401


def test_identidad_se_resuelve_tambien_en_rutas_publicas(app_y_am):
    """Un endpoint publico-en-lectura tiene que poder distinguir a un admin.

    Antes las rutas publicas retornaban antes de mirar la cabecera, asi que
    GET /api/projects no le entregaba el invite_code ni al propio admin.
    """
    app, _ = app_y_am
    from flask import g
    visto = {}

    @app.route('/api/quien')
    @importlib.import_module('politica').publico_en_lectura(motivo='prueba')
    def quien():
        visto['user'] = getattr(g, 'current_user', None)
        return jsonify(ok=True)

    app.test_client().get('/api/quien', headers=_cab('ADMIN'))
    assert visto['user'] and visto['user']['role'] == 'admin'


def test_motivo_obligatorio_al_abrir(pol):
    with pytest.raises(ValueError):
        pol.publico(motivo='')
    with pytest.raises(ValueError):
        pol.publico_en_lectura(motivo='   ')


def test_defectos_por_blueprint_cubren_todo(pol):
    app = Flask(__name__)

    bp_vistas = __import__('flask').Blueprint('cosas', __name__)

    @bp_vistas.route('/api/cosas')
    def listar():
        return jsonify(ok=True)

    @bp_vistas.route('/api/cosas/abierta')
    @pol.publico(motivo='ya declarada, no debe pisarse')
    def abierta():
        return jsonify(ok=True)

    app.register_blueprint(bp_vistas)
    _cubiertas, sin_clasificar = pol.aplicar_politicas_por_defecto(
        app, {'cosas': pol.Politica(pol.SESION)}
    )
    assert sin_clasificar == []
    assert pol.politica_de(app, 'cosas.listar').tipo == pol.SESION
    assert pol.politica_de(app, 'cosas.abierta').tipo == pol.PUBLICO   # no se pisó


def test_blueprint_desconocido_cae_a_sesion(pol):
    app = Flask(__name__)
    bp = __import__('flask').Blueprint('nuevo_sin_declarar', __name__)

    @bp.route('/api/nuevo')
    def nuevo():
        return jsonify(ok=True)

    app.register_blueprint(bp)
    _c, sin_clasificar = pol.aplicar_politicas_por_defecto(app, {})
    assert 'nuevo_sin_declarar.nuevo' in sin_clasificar          # avisa
    assert pol.politica_de(app, 'nuevo_sin_declarar.nuevo').tipo == pol.SESION  # y cierra


def test_todo_lo_publico_del_backend_real_tiene_motivo_escrito():
    """Inventario del backend de verdad: abrir una ruta cuesta una frase."""
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    import politica as p
    sin_motivo = [
        f for f in p.resumen_de_politicas(server.app)
        if f['politica'] in (p.PUBLICO, p.PUBLICO_LECTURA) and not (f['motivo'] or '').strip()
    ]
    assert not sin_motivo, f"rutas abiertas sin justificar: {[f['ruta'] for f in sin_motivo]}"


def test_ninguna_ruta_del_backend_real_queda_sin_politica():
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    import politica as p
    huerfanas = [f['ruta'] for f in p.resumen_de_politicas(server.app)
                 if f['politica'] is None and f['ruta'].startswith('/api/')]
    assert not huerfanas, f"endpoints /api sin politica declarada: {huerfanas}"


# ── Modo estricto sobre el backend REAL ────────────────────────────────────
# Estos dos son el contrato de la activación: lo que debe seguir abierto y lo
# que debe cerrarse. Se ejecutan contra app.url_map de verdad, no un mock.

_SIN_SESION_DEBEN_VIVIR = [
    ('GET', '/api/health'),                    # latido
    ('GET', '/api/token'),                     # Viewer de Autodesk
    ('GET', '/api/config/project'),            # qué modelo carga el enlace
    ('GET', '/api/views/<view_id>'),           # la vista compartida en sí
    ('GET', '/api/inventory'),                 # sin él no hay colores ni filtros
    ('GET', '/api/inventory/version'),         # huella para reusar caché
    ('GET', '/api/docs/shared/<share_id>'),    # documento compartido por enlace
    ('POST', '/api/auth/login'),
    ('POST', '/api/auth/register'),
]

_SIN_SESION_DEBEN_CAER = [
    ('POST', '/api/projects/<project_id>/users'),
    ('POST', '/api/projects/join'),
    ('PUT', '/api/projects/<project_id>'),
    ('DELETE', '/api/projects/<project_id>'),
    ('POST', '/api/views'),
    ('DELETE', '/api/views/<view_id>'),
    ('GET', '/api/projects/<project_id>/users'),
    ('GET', '/api/hubs'),
    ('GET', '/api/auth/aps/login'),
    ('DELETE', '/api/users/<int:user_id>'),
]


def _politica_de_ruta(app, metodo, ruta):
    import politica as p
    for regla in app.url_map.iter_rules():
        if str(regla) == ruta and metodo in (regla.methods or set()):
            return p.politica_de(app, regla.endpoint)
    raise AssertionError(f"ruta no encontrada en el mapa: {metodo} {ruta}")


@pytest.mark.parametrize('metodo,ruta', _SIN_SESION_DEBEN_VIVIR)
def test_lo_que_no_puede_cerrarse(metodo, ruta):
    """Cerrar esto rompe la vista compartida o la puerta de entrada."""
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    import politica as p
    politica = _politica_de_ruta(server.app, metodo, ruta)
    assert politica.evaluar(metodo, None) is None, (
        f"{metodo} {ruta} quedaria cerrada a un anonimo y eso rompe el producto"
    )


@pytest.mark.parametrize('metodo,ruta', _SIN_SESION_DEBEN_CAER)
def test_lo_que_debe_estar_cerrado(metodo, ruta):
    """Cada una de estas estuvo abierta a anonimos en produccion."""
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    politica = _politica_de_ruta(server.app, metodo, ruta)
    assert politica.evaluar(metodo, None) is not None, (
        f"{metodo} {ruta} sigue abierta a un anonimo"
    )
