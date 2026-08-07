"""Recuperacion de contraseña.

Antes NO existia: si alguien olvidaba su contraseña, la unica via era editar la
base de datos a mano. Eso solo se sostiene con un usuario; con un equipo de obra,
no.

DB-free: se mockea get_db_connection y el envio de correo.
"""
import importlib
from unittest.mock import MagicMock

import pytest
from flask import Flask


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'false')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')

    import enlaces_firmados
    importlib.reload(enlaces_firmados)
    import routes.auth as ra
    importlib.reload(ra)

    correos = []
    monkeypatch.setattr(ra.mailer, 'enviar',
                        lambda **kw: (correos.append(kw), (True, 'enviado'))[1])

    # Fila del usuario: id, name, password_hash  /  y para reset: email, name
    estado = {'usuario': (7, 'Ana Torres', 'scrypt:hash-existente'), 'updates': []}

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (sql, params)
            if sql.strip().upper().startswith('UPDATE'):
                estado['updates'].append(params)
        def fetchone(self):
            sql = (self.ultimo or ('',))[0]
            if 'SELECT id, name, password_hash' in sql:
                return estado['usuario']
            if 'SELECT email, name' in sql:
                u = estado['usuario']
                return ('ana@contratista.com', u[1]) if u else None
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'revoke_all_sessions', lambda uid, excepto=None: 3)

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)
    return app.test_client(), correos, estado, ra


# ── No revelar quien tiene cuenta ──────────────────────────────────────────

def test_respuesta_identica_exista_o_no_la_cuenta(entorno):
    c, _correos, estado, _ = entorno
    con = c.post('/api/auth/forgot-password', json={'email': 'ana@contratista.com'})
    estado['usuario'] = None
    sin = c.post('/api/auth/forgot-password', json={'email': 'nadie@ejemplo.com'})
    assert con.status_code == sin.status_code == 200
    assert con.get_json() == sin.get_json(), (
        "la respuesta distingue cuentas existentes: es un buscador de correos del equipo"
    )


def test_correo_vacio_no_revienta(entorno):
    c, _, _, _ = entorno
    assert c.post('/api/auth/forgot-password', json={}).status_code == 200


def test_invitacion_pendiente_no_recibe_reset(entorno):
    """password_hash vacio = invitacion sin reclamar: no hay nada que restablecer."""
    c, correos, estado, _ = entorno
    estado['usuario'] = (9, 'Invitado', '')
    c.post('/api/auth/forgot-password', json={'email': 'pendiente@contratista.com'})
    assert not correos


def test_cuenta_existente_recibe_un_enlace(entorno):
    c, correos, _, _ = entorno
    c.post('/api/auth/forgot-password', json={'email': 'ana@contratista.com'})
    assert len(correos) == 1
    assert 'reset=' in correos[0]['enlace']


# ── Canje del token ────────────────────────────────────────────────────────

def _token_valido(ra, uid=7, email='ana@contratista.com'):
    from enlaces_firmados import emitir, PROPOSITO_RESET
    return emitir(PROPOSITO_RESET, {'uid': uid, 'email': email})


def test_token_de_otro_proposito_no_sirve(entorno):
    c, _, _, _ = entorno
    from enlaces_firmados import emitir, PROPOSITO_INVITACION
    ajeno = emitir(PROPOSITO_INVITACION, {'email': 'ana@contratista.com'})
    r = c.post('/api/auth/reset-password',
               json={'token': ajeno, 'password': 'zanja profunda 3m'})
    assert r.status_code == 400


def test_sin_token_no_se_cambia_nada(entorno):
    c, _, estado, _ = entorno
    r = c.post('/api/auth/reset-password', json={'password': 'zanja profunda 3m'})
    assert r.status_code == 400
    assert not estado['updates']


def test_password_debil_se_rechaza(entorno):
    c, _, estado, ra = entorno
    r = c.post('/api/auth/reset-password',
               json={'token': _token_valido(ra), 'password': '12345'})
    assert r.status_code == 400
    assert r.get_json()['code'] == 'PASSWORD_DEBIL'
    assert not estado['updates']


def test_reset_correcto_cambia_y_cierra_sesiones(entorno):
    c, _, estado, ra = entorno
    r = c.post('/api/auth/reset-password',
               json={'token': _token_valido(ra), 'password': 'zanja profunda 3m'})
    assert r.status_code == 200
    assert estado['updates'], 'no se guardó la contraseña nueva'
    # Se llega aqui normalmente porque alguien mas tiene acceso: hay que echarlo.
    assert r.get_json()['sesiones_cerradas'] == 3


def test_token_de_correo_que_ya_no_casa_se_rechaza(entorno):
    """Cambiar el correo de la cuenta invalida los enlaces emitidos antes."""
    c, _, estado, ra = entorno
    token = _token_valido(ra, email='correo-viejo@contratista.com')
    r = c.post('/api/auth/reset-password',
               json={'token': token, 'password': 'zanja profunda 3m'})
    assert r.status_code == 400
    assert not estado['updates']
