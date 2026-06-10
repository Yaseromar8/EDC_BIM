"""Pilar Auth: backdoor DEMO_TOKEN, prefijos publicos y authz por proyecto.
DB-free: mockea validate_session y _user_in_project."""
import importlib
from flask import Flask, jsonify


def _make_app(monkeypatch, enforce=False, allow_demo=False):
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'true' if enforce else 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'true' if allow_demo else 'false')
    import auth_middleware as am
    importlib.reload(am)  # re-lee las env vars
    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/inventory')
    def inv():
        return jsonify(ok=True)

    @app.route('/api/tracking/x')
    def trk():
        return jsonify(ok=True)

    @app.route('/api/docs/shared/<u>')
    def shared(u):
        return jsonify(ok=True)

    return am, app


def test_demo_token_bloqueado_por_defecto(monkeypatch):
    _am, app = _make_app(monkeypatch, allow_demo=False)
    r = app.test_client().get('/api/tracking/x', headers={'Authorization': 'Bearer DEMO_TOKEN'})
    assert r.status_code == 401


def test_demo_token_permitido_si_se_habilita(monkeypatch):
    _am, app = _make_app(monkeypatch, allow_demo=True)
    r = app.test_client().get('/api/tracking/x', headers={'Authorization': 'Bearer DEMO_TOKEN'})
    assert r.status_code == 200


def test_inventory_exige_sesion(monkeypatch):
    _am, app = _make_app(monkeypatch)
    assert app.test_client().get('/api/inventory').status_code == 401


def test_links_compartidos_publicos(monkeypatch):
    _am, app = _make_app(monkeypatch)
    assert app.test_client().get('/api/docs/shared/abc').status_code == 200


def test_authz_bloquea_no_miembro(monkeypatch):
    am, app = _make_app(monkeypatch, enforce=True)
    am.validate_session = lambda t: {'id': 17, 'role': 'user'} if t == 'M' \
        else ({'id': 999, 'role': 'user'} if t == 'N' else None)
    am._user_in_project = lambda uid, pid: uid == 17  # solo 17 es miembro
    c = app.test_client()
    assert c.get('/api/tracking/x?project_id=1', headers={'Authorization': 'Bearer M'}).status_code == 200
    assert c.get('/api/tracking/x?project_id=1', headers={'Authorization': 'Bearer N'}).status_code == 403


def test_authz_log_only_no_bloquea(monkeypatch):
    am, app = _make_app(monkeypatch, enforce=False)  # log-only
    am.validate_session = lambda t: {'id': 999, 'role': 'user'}
    am._user_in_project = lambda uid, pid: False  # no miembro
    r = app.test_client().get('/api/tracking/x?project_id=1', headers={'Authorization': 'Bearer N'})
    assert r.status_code == 200  # en log-only NO bloquea
