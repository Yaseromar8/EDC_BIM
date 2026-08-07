"""Perimetro: lo que un ANONIMO puede y no puede hacer.

Cada test de aqui corresponde a un agujero que estuvo abierto en produccion.
Si alguno se pone verde por el lado equivocado (o alguien vuelve a meter un
prefijo publico sin distinguir metodo), el agujero volvio.

DB-free: se mockea validate_session; ninguna prueba toca Postgres.
"""
import importlib

from flask import Flask, jsonify


def _app(monkeypatch):
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')
    import auth_middleware as am
    importlib.reload(am)
    app = Flask(__name__)
    am.init_auth_middleware(app)

    # Rutas espejo de las reales que caian bajo el prefijo '/api/projects'.
    @app.route('/api/projects', methods=['GET'])
    def listar():
        return jsonify(ok=True)

    @app.route('/api/projects/<pid>/users', methods=['GET', 'POST'])
    def miembros(pid):
        return jsonify(ok=True)

    @app.route('/api/projects/join', methods=['POST'])
    def unirse():
        return jsonify(ok=True)

    @app.route('/api/projects/<pid>', methods=['PUT', 'DELETE'])
    def editar(pid):
        return jsonify(ok=True)

    @app.route('/api/views', methods=['GET', 'POST'])
    def vistas():
        return jsonify(ok=True)

    @app.route('/api/views/<vid>', methods=['GET', 'DELETE'])
    def vista(vid):
        return jsonify(ok=True)

    @app.route('/api/build/signed-read', methods=['GET', 'POST'])
    def build():
        return jsonify(ok=True)

    return am, app


# ── Escrituras anonimas: la escalada que estaba viva en produccion ─────────

def test_anonimo_no_reasigna_miembros_de_una_obra(monkeypatch):
    _am, app = _app(monkeypatch)
    r = app.test_client().post('/api/projects/1/users', json={'user_ids': []})
    assert r.status_code == 401


def test_anonimo_no_se_une_a_una_obra(monkeypatch):
    _am, app = _app(monkeypatch)
    r = app.test_client().post('/api/projects/join', json={'invite_code': 'XXXXXX', 'user_id': 1})
    assert r.status_code == 401


def test_anonimo_no_edita_ni_archiva_una_obra(monkeypatch):
    _am, app = _app(monkeypatch)
    c = app.test_client()
    assert c.put('/api/projects/1', json={'model_urn': 'urn:otro'}).status_code == 401
    assert c.delete('/api/projects/1').status_code == 401


def test_anonimo_no_borra_ni_crea_vistas_guardadas(monkeypatch):
    _am, app = _app(monkeypatch)
    c = app.test_client()
    assert c.delete('/api/views/1738000000000').status_code == 401
    assert c.post('/api/views', json={'name': 'x', 'viewerState': {}}).status_code == 401


def test_anonimo_no_escribe_en_build(monkeypatch):
    _am, app = _app(monkeypatch)
    r = app.test_client().post('/api/build/signed-read', json={'versionId': 'urn:x'})
    assert r.status_code == 401


# ── Lecturas que deben SEGUIR funcionando (no romper la obra) ──────────────

def test_lecturas_publicas_siguen_abiertas(monkeypatch):
    """Vistas compartidas por enlace y miniaturas no tienen sesion: deben leer."""
    _am, app = _app(monkeypatch)
    c = app.test_client()
    assert c.get('/api/projects').status_code == 200
    assert c.get('/api/views/abc').status_code == 200
    assert c.get('/api/build/signed-read').status_code == 200


def test_con_sesion_la_escritura_pasa(monkeypatch):
    am, app = _app(monkeypatch)
    am.validate_session = lambda t: {'id': 1, 'role': 'admin'} if t == 'BUENO' else None
    r = app.test_client().post('/api/projects/1/users', json={'user_ids': [1]},
                               headers={'Authorization': 'Bearer BUENO'})
    assert r.status_code == 200


# ── El token en la URL ya no sirve para escribir ───────────────────────────

def test_token_en_query_string_solo_vale_para_leer(monkeypatch):
    """Ese token queda incrustado en permalinks de fotos que se comparten:
    quien reciba el enlace no debe poder escribir con el."""
    am, app = _app(monkeypatch)
    am.validate_session = lambda t: {'id': 1, 'role': 'admin'} if t == 'BUENO' else None
    c = app.test_client()
    assert c.get('/api/views/abc?session_token=BUENO').status_code == 200
    assert c.delete('/api/views/abc?session_token=BUENO').status_code == 401


# ── Los guards no asumen que otro ya comprobo ──────────────────────────────

def test_guard_de_admin_falla_cerrado_sin_sesion():
    """_require_admin devolvia None (=permitido) sin sesion, confiando en un
    middleware que para las rutas bajo prefijo publico no llegaba a correr."""
    import routes.auth as ra
    app = Flask(__name__)
    with app.test_request_context('/api/users'):
        respuesta = ra._require_admin('invitar usuarios')
    assert respuesta is not None, "sin sesion el guard debe cortar, no permitir"
    assert respuesta[1] == 401


def test_verificar_acceso_a_obra_falla_cerrado():
    from routes.documents import verify_project_access
    assert verify_project_access(None, 'urn:una-obra') is False
    assert verify_project_access({'role': 'user'}, 'urn:una-obra') is False  # dict sin id
    assert verify_project_access(None, 'global') is True  # namespace global sigue abierto


def test_permiso_de_carpeta_falla_cerrado():
    from folder_permissions import check_folder_permission
    app = Flask(__name__)
    with app.test_request_context('/'):
        respuesta = check_folder_permission(None, 1, 'urn:x', 'edit')
    assert respuesta is not None
    assert respuesta[1] == 401
