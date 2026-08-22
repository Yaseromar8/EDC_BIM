# -*- coding: utf-8 -*-
"""Reemitir el enlace de una invitación pendiente, y reactivar una cuenta.

El enlace de invitación solo se muestra una vez; si el admin cierra el modal
sin copiarlo, la invitación quedaba muerta y el correo quemado («ya existe»).
Y retirar el acceso era un viaje sin vuelta desde la interfaz: la única
«reactivación» era purgar y reinvitar, destruyendo el rastro que la
desactivación existe para conservar.

El token de invitación es firmado y sin estado: reemitirlo para la MISMA
cuenta pendiente es tan seguro como emitir el primero. Lo que no se reemite:
cuentas ya reclamadas (tienen dueño) ni retiradas (primero se reactivan, que
es una decisión aparte con su propio asiento).
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

    # (email, role, pendiente, activa) para reinvitar; activa para reactivar.
    estado = {
        'fila': ['gente@obra.pe', 'user', True, True],
        'updates': [],
        'eventos': [],
    }

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
            if self.ultimo[0].upper().startswith('UPDATE USERS'):
                estado['updates'].append(self.ultimo)
        def fetchone(self):
            s = (self.ultimo or ('',))[0].upper()
            f = estado['fila']
            if 'SELECT EMAIL, ROLE, (PASSWORD_HASH =' in s:
                return tuple(f)
            if 'SELECT COALESCE(IS_ACTIVE, TRUE) FROM USERS' in s:
                return (f[3],)
            return None

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'registrar_evento',
                        lambda ev, **kw: estado['eventos'].append(ev))

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)

    @app.before_request
    def _sesion():
        from flask import g, request
        if request.headers.get('X-Admin') == '1':
            g.current_user = {'id': 1, 'role': 'admin', 'name': 'Admin', 'email': 'a@b.c'}
        elif request.headers.get('X-User') == '1':
            g.current_user = {'id': 9, 'role': 'user', 'name': 'U', 'email': 'u@b.c'}

    return ra, app.test_client(), estado


ADMIN = {'X-Admin': '1'}


# ── Reemisión ────────────────────────────────────────────────────────────────

def test_reemite_el_enlace_de_una_pendiente(entorno):
    ra, c, estado = entorno
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert 'invite_url' in d and 'invite=' in d['invite_url']
    # El token reemitido debe abrir la MISMA cuenta: mismo correo dentro.
    datos, _ = ra.leer(ra.PROPOSITO_INVITACION, d['invite_token'])
    assert datos and datos['email'] == 'gente@obra.pe'
    assert 'invitacion_reemitida' in estado['eventos']


def test_una_reclamada_no_se_reinvita(entorno):
    ra, c, estado = entorno
    estado['fila'][2] = False   # ya tiene contraseña
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json().get('code') == 'YA_RECLAMADA'


def test_una_retirada_no_se_reinvita(entorno):
    ra, c, estado = entorno
    estado['fila'][3] = False   # retirada
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json().get('code') == 'INVITACION_RETIRADA'


def test_reinvitar_exige_admin(entorno):
    ra, c, estado = entorno
    r = c.post('/api/users/5/reinvitar', headers={'X-User': '1'})
    assert r.status_code == 403
    assert estado['eventos'] == []


# ── Reactivación ─────────────────────────────────────────────────────────────

def test_reactivar_devuelve_el_acceso(entorno):
    ra, c, estado = entorno
    estado['fila'][3] = False
    r = c.post('/api/users/5/reactivar', headers=ADMIN)
    assert r.status_code == 200
    assert any('IS_ACTIVE = TRUE' in u[0].upper() for u in estado['updates'])
    assert 'usuario_reactivado' in estado['eventos']


def test_reactivar_una_activa_es_409(entorno):
    ra, c, estado = entorno
    r = c.post('/api/users/5/reactivar', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json().get('code') == 'YA_ACTIVA'
    assert estado['updates'] == []


def test_reactivar_exige_admin(entorno):
    ra, c, estado = entorno
    estado['fila'][3] = False
    r = c.post('/api/users/5/reactivar', headers={'X-User': '1'})
    assert r.status_code == 403
    assert estado['updates'] == []
