# -*- coding: utf-8 -*-
"""G1 · el correo de invitación, y G4a · cerrar mis otras sesiones.

G1: invitar y reemitir INTENTAN el envío y dicen la verdad en `avisado`. Sin
RESEND_API_KEY el mailer degrada (enviado=False) y el enlace copiable sigue
siendo el camino — el comportamiento de siempre, pero sin fingir entregas.

G4a: la ruta nueva sobre el mecanismo rodado (`revoke_all_sessions` con
`excepto`, el mismo del cambio de contraseña). Solo actúa sobre quien llama.
"""
import importlib

import pytest
from flask import Flask


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'estricto')
    import routes.auth as ra
    importlib.reload(ra)

    correos = []
    monkeypatch.setattr(ra.mailer, 'enviar',
                        lambda destino, asunto, titulo, cuerpo, enlace=None, texto_boton='':
                        (correos.append({'a': destino, 'asunto': asunto, 'enlace': enlace}),
                         (True, 'enviado'))[1])

    # (email, invitacion=activated_at NULL, activa) — la forma G7 de reinvitar
    estado = {'existe': None, 'pendiente_activa': ('p@obra.pe', True, True)}

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
        def fetchone(self):
            s = (self.ultimo or ('',))[0].upper()
            if 'SELECT ID FROM USERS WHERE EMAIL' in s:
                return estado['existe']
            if 'RETURNING INVITACION_GEN' in s:
                return (2,)
            if 'SELECT EMAIL, (ACTIVATED_AT IS NULL)' in s:
                return estado['pendiente_activa']
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    revocadas = []
    monkeypatch.setattr(ra, 'revoke_all_sessions',
                        lambda uid, excepto=None: revocadas.append((uid, excepto)) or 3)
    eventos = []
    monkeypatch.setattr(ra, 'registrar_evento', lambda ev, **kw: eventos.append(ev))

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)

    @app.before_request
    def _sesion():
        from flask import g, request
        if request.headers.get('X-Admin') == '1':
            g.current_user = {'id': 1, 'role': 'admin', 'name': 'A', 'email': 'a@b.c'}
        elif request.headers.get('X-User') == '1':
            g.current_user = {'id': 9, 'role': 'user', 'name': 'U', 'email': 'u@b.c'}

    return app.test_client(), correos, revocadas, eventos


ADMIN = {'X-Admin': '1'}


# ── G1 ───────────────────────────────────────────────────────────────────────

def test_invitar_envia_el_correo_y_dice_la_verdad(entorno):
    c, correos, _, _ = entorno
    r = c.post('/api/users', json={'email': 'nueva@obra.pe', 'role': 'user'}, headers=ADMIN)
    assert r.status_code == 201, r.get_json()
    d = r.get_json()
    assert d['avisado'] is True
    assert len(correos) == 1 and correos[0]['a'] == 'nueva@obra.pe'
    # El enlace del correo ES el de la respuesta: una sola verdad.
    assert correos[0]['enlace'] == d['invite_url']
    assert '/registro?invite=' in correos[0]['enlace']


def test_reemitir_tambien_avisa(entorno):
    c, correos, _, _ = entorno
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['avisado'] is True
    assert len(correos) == 1 and correos[0]['a'] == 'p@obra.pe'


def test_correo_degradado_no_rompe_la_invitacion(entorno, monkeypatch):
    c, correos, _, _ = entorno
    import routes.auth as ra
    monkeypatch.setattr(ra.mailer, 'enviar',
                        lambda *a, **k: (False, 'correo no configurado'))
    r = c.post('/api/users', json={'email': 'otra@obra.pe', 'role': 'user'}, headers=ADMIN)
    assert r.status_code == 201
    d = r.get_json()
    assert d['avisado'] is False          # la verdad
    assert 'invite_url' in d              # y el respaldo copiable, intacto


# ── G4a ──────────────────────────────────────────────────────────────────────

def test_cerrar_otras_conserva_exactamente_la_actual(entorno):
    c, _, revocadas, eventos = entorno
    r = c.post('/api/auth/sesiones/cerrar-otras',
               headers={'X-User': '1', 'Authorization': 'Bearer token-vivo-123'})
    assert r.status_code == 200
    assert r.get_json()['sesiones_cerradas'] == 3
    # El E2E 16 del diseño: «otras sesiones» conserva EXACTAMENTE la actual.
    assert revocadas == [(9, 'token-vivo-123')]
    assert 'sesiones_cerradas_por_usuario' in eventos


def test_cerrar_otras_sin_sesion_es_401(entorno):
    c, _, revocadas, _ = entorno
    r = c.post('/api/auth/sesiones/cerrar-otras')
    assert r.status_code == 401
    assert revocadas == []


def test_cerrar_otras_no_acepta_user_id_ajeno(entorno):
    c, _, revocadas, _ = entorno
    # Aunque el cuerpo traiga un user_id, se ignora: solo actúa sobre quien llama.
    r = c.post('/api/auth/sesiones/cerrar-otras', json={'user_id': 999},
               headers={'X-User': '1', 'Authorization': 'Bearer t'})
    assert r.status_code == 200
    assert revocadas[0][0] == 9, 'debe cerrar las del que llama, jamás las de otro'
