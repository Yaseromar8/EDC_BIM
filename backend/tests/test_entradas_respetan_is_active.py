# -*- coding: utf-8 -*-
"""Toda puerta de entrada respeta el estado de la cuenta, y el reset es de un solo uso.

Lo que habia antes de estos cierres, medido en el codigo desplegado:

  · el RECLAMO de una invitacion no miraba `is_active`: una invitacion
    "retirada" por el administrador se reclamaba igual si el enlace seguia
    vivo (14 dias), con sesion incluida;
  · la puerta de GOOGLE tampoco: un usuario desactivado con Gmail entraba
    aunque la puerta de contraseña lo frenara, y una invitacion pendiente se
    "reclamaba" por Google sin el enlace del administrador, dejando la cuenta
    a medias (sin nombre real, sin contraseña) pero con sesion;
  · el enlace de RESTABLECIMIENTO prometia un solo uso y no lo era: token
    firmado sin estado, valido toda su hora de vida aunque ya se hubiera
    canjeado.

El ultimo se cierra sin estado nuevo: el token lleva la huella del hash de
contraseña VIGENTE al emitirse; canjearlo cambia el hash y mata el enlace.
"""
import importlib

import pytest
from flask import Flask


CORREO = 'persona@obra.pe'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.auth as ra
    importlib.reload(ra)

    # La fila del usuario, mutable por cada test (G7: la pendencia es
    # activated_at NULL, no el hash vacio):
    #   [id, name, password_hash, role, is_active, activated_at, invitacion_gen]
    import datetime as _dt
    ACTIVADA = _dt.datetime(2026, 8, 1, 12, 0)
    estado = {
        'fila': [7, 'Persona', 'hash-vigente', 'user', True, ACTIVADA, 0],
        'updates': [],
        'eventos': [],
    }

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
            s = self.ultimo[0].upper()
            if s.startswith('UPDATE USERS'):
                estado['updates'].append(self.ultimo)
        def fetchone(self):
            s = (self.ultimo or ('',))[0].upper()
            f = estado['fila']
            if 'SELECT ID, PASSWORD_HASH, ROLE, COALESCE(IS_ACTIVE' in s:
                # registro/reclamo (B.2): + activated_at, invitacion_gen
                return (f[0], f[2], f[3], f[4], f[5], f[6])
            if 'SELECT ID, NAME, PASSWORD_HASH, COALESCE(IS_ACTIVE' in s:
                # emision del reset
                return (f[0], f[1], f[2], f[4])
            if 'SELECT EMAIL, NAME, PASSWORD_HASH,' in s:
                # canje del reset
                return (CORREO, f[1], f[2], f[4])
            if 'FROM USERS U' in s and 'LEFT JOIN COMPANIES' in s:
                # puerta de Google: ...is_active, activated_at
                return (f[0], f[1], CORREO, f[3], None, None, f[4], f[5])
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'revoke_all_sessions', lambda uid, excepto=None: 1)
    monkeypatch.setattr(ra, 'create_session', lambda uid: 'token-de-prueba')
    monkeypatch.setattr(ra, 'registrar_evento',
                        lambda ev, **kw: estado['eventos'].append(ev))

    # Google siempre "verifica" a la persona del correo: lo que se prueba aqui
    # es lo que hace NUESTRA puerta despues de que Google diga que si.
    class _IdInfo(dict):
        pass
    monkeypatch.setattr(ra.id_token, 'verify_oauth2_token',
                        lambda *a, **k: {'email': CORREO, 'name': 'Persona',
                                         'sub': 'g-123', 'email_verified': True})

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)
    return ra, app.test_client(), estado


# ── Reclamo de invitacion ────────────────────────────────────────────────────

def _reclamo(ra, c, estado):
    token = ra.emitir(ra.PROPOSITO_INVITACION, {'email': CORREO, 'role': 'user'})
    return c.post('/api/auth/register', json={
        'name': 'Persona', 'email': CORREO,
        'password': 'Clave-Fuerte-2026!', 'invite_token': token,
    })


def _pendiente(estado):
    estado['fila'][2] = ''       # sin contraseña...
    estado['fila'][5] = None     # ...y SIN ACTIVAR: eso es estar pendiente


def test_invitacion_retirada_no_se_reclama(entorno):
    ra, c, estado = entorno
    _pendiente(estado)
    estado['fila'][4] = False    # ...y retirada
    r = _reclamo(ra, c, estado)
    assert r.status_code == 403
    assert r.get_json().get('code') == 'INVITACION_RETIRADA'
    assert estado['updates'] == [], 'escribio la cuenta de una invitacion retirada'
    assert 'reclamo_de_invitacion_retirada' in estado['eventos']


def test_invitacion_activa_si_se_reclama(entorno):
    ra, c, estado = entorno
    _pendiente(estado)
    r = _reclamo(ra, c, estado)
    assert r.status_code == 200, r.get_json()
    assert r.get_json().get('session_token')
    # El reclamo ES la activacion: fija activated_at en el mismo acto.
    assert any('ACTIVATED_AT = NOW()' in u[0].upper() for u in estado['updates'])


def test_una_cuenta_activada_por_google_no_se_reclama(entorno):
    # ONE-SHOT (doc 58 §B.3): hash vacio pero ACTIVADA (entro por Google).
    # Con la guardia vieja (hash=='') un token aun vigente sobreescribia
    # nombre, empresa y contraseña de esa cuenta VIVA.
    ra, c, estado = entorno
    estado['fila'][2] = ''                    # sin contraseña
    # activated_at queda puesto: NO esta pendiente
    r = _reclamo(ra, c, estado)
    assert r.status_code == 400
    assert 'ya está registrado' in r.get_json().get('error', '')
    assert estado['updates'] == []


def test_un_token_de_otra_generacion_no_reclama(entorno):
    # LA GENERACION (doc 59): reemitir incremento gen a 2; el enlace viejo
    # (gen ausente = 0) muere por igualdad de enteros, sin relojes.
    ra, c, estado = entorno
    _pendiente(estado)
    estado['fila'][6] = 2
    r = _reclamo(ra, c, estado)   # token sin gen -> 0 != 2
    assert r.status_code == 403
    assert r.get_json().get('code') == 'INVITACION_SUSTITUIDA'
    assert estado['updates'] == []

    # ...y el de la generacion VIGENTE si reclama.
    token = ra.emitir(ra.PROPOSITO_INVITACION, {'email': CORREO, 'gen': 2})
    r = c.post('/api/auth/register', json={
        'name': 'Persona', 'email': CORREO,
        'password': 'Clave-Fuerte-2026!', 'invite_token': token,
    })
    assert r.status_code == 200, r.get_json()


# ── Puerta de Google ─────────────────────────────────────────────────────────

def test_google_no_deja_entrar_a_un_desactivado(entorno):
    ra, c, estado = entorno
    estado['fila'][4] = False
    r = c.post('/api/auth/google', json={'token': 'lo-que-sea'})
    assert r.status_code == 401
    # Mensaje generico: no se confirma a un retirado que su cuenta existe.
    assert 'incorrectos' in r.get_json().get('error', '')
    assert 'login_desactivado' in estado['eventos']


def test_google_activa_a_la_invitacion_pendiente(entorno):
    # G5b (doc 58): Google verifico que quien entra es el titular del correo
    # invitado — exactamente lo que probaria el enlace. La primera entrada
    # FIJA activated_at (y con el mueren los tokens de invitacion) y deja
    # asiento doble: cuenta_activada + login_ok.
    ra, c, estado = entorno
    _pendiente(estado)
    estado['fila'][1] = '(Invitado pendiente)'
    r = c.post('/api/auth/google', json={'token': 'lo-que-sea'})
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d.get('session_token')
    assert d.get('name') == 'Persona', 'debia tomar el nombre real de Google'
    assert any('ACTIVATED_AT = NOW()' in u[0].upper() for u in estado['updates'])
    assert 'cuenta_activada' in estado['eventos']
    assert 'login_ok' in estado['eventos']


def test_google_deja_entrar_al_activo_de_siempre(entorno):
    ra, c, estado = entorno
    r = c.post('/api/auth/google', json={'token': 'lo-que-sea'})
    assert r.status_code == 200
    assert r.get_json().get('session_token')
    # El rastro de accesos no depende de la puerta: Google tambien asienta.
    assert 'login_ok' in estado['eventos']
    # ...pero a una cuenta YA activada no se le re-fija activated_at.
    assert not any('ACTIVATED_AT' in u[0].upper() for u in estado['updates'])


# ── Restablecimiento: un solo uso ────────────────────────────────────────────

def _token_de_reset(ra, hash_vigente):
    return ra.emitir(ra.PROPOSITO_RESET, {
        'uid': 7, 'email': CORREO, 'huella': ra._huella_de_hash(hash_vigente)})


def test_reset_con_huella_vigente_funciona(entorno):
    ra, c, estado = entorno
    r = c.post('/api/auth/reset-password', json={
        'token': _token_de_reset(ra, 'hash-vigente'),
        'password': 'Clave-Fuerte-2026!'})
    assert r.status_code == 200, r.get_json()
    assert estado['updates'], 'no escribio la contraseña nueva'


def test_reset_ya_canjeado_no_sirve_dos_veces(entorno):
    ra, c, estado = entorno
    # El enlace se emitio cuando la contraseña era otra (ya se canjeo, o se
    # cambio por otra via): la huella ya no casa.
    r = c.post('/api/auth/reset-password', json={
        'token': _token_de_reset(ra, 'hash-anterior-ya-cambiado'),
        'password': 'Clave-Fuerte-2026!'})
    assert r.status_code == 400
    assert r.get_json().get('code') == 'TOKEN_USADO'
    assert estado['updates'] == []


def test_reset_sin_huella_muere(entorno):
    # Token del formato anterior (sin huella): muere, que es el lado seguro.
    ra, c, estado = entorno
    token = ra.emitir(ra.PROPOSITO_RESET, {'uid': 7, 'email': CORREO})
    r = c.post('/api/auth/reset-password', json={
        'token': token, 'password': 'Clave-Fuerte-2026!'})
    assert r.status_code == 400
    assert estado['updates'] == []


def test_reset_de_cuenta_desactivada_no_escribe(entorno):
    ra, c, estado = entorno
    estado['fila'][4] = False
    r = c.post('/api/auth/reset-password', json={
        'token': _token_de_reset(ra, 'hash-vigente'),
        'password': 'Clave-Fuerte-2026!'})
    assert r.status_code == 400
    assert estado['updates'] == []
