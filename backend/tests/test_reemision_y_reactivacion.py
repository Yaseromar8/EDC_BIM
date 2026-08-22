# -*- coding: utf-8 -*-
"""Reemitir (= re-invitación) y reactivar, sobre la máquina de estados G7.

El enlace de invitación solo se muestra una vez; si el admin cierra el modal
sin copiarlo, la invitación quedaba muerta y el correo quemado («ya existe»).

Con la máquina de doc 58 los dos verbos quedan nítidos:

  · REINVITAR es de INVITACIONES (activated_at NULL): incrementa la
    generación —todo enlace anterior muere por igualdad de enteros— y si la
    invitación estaba REVOCADA la resucita en el mismo acto (is_active=TRUE).
  · REACTIVAR es de CUENTAS (activated_at NOT NULL): deshace la suspensión.
    Sobre una invitación revocada es INAPLICABLE — reactivarla la dejaría
    pendiente con los tokens viejos aún casando por generación.
"""
import datetime
import importlib

import pytest
from flask import Flask

ACTIVADA = datetime.datetime(2026, 8, 1, 12, 0)


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'estricto')
    import routes.auth as ra
    importlib.reload(ra)

    # [email, invitacion (activated_at NULL), activa, gen vigente]
    estado = {
        'fila': ['gente@obra.pe', True, True, 1],
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
            if 'RETURNING INVITACION_GEN' in s:
                # el gen++ de la reemisión, tal como lo devolvería la base
                f[3] += 1
                return (f[3],)
            if 'SELECT EMAIL, (ACTIVATED_AT IS NULL)' in s:
                return (f[0], f[1], f[2])
            if 'SELECT COALESCE(IS_ACTIVE, TRUE), ACTIVATED_AT' in s:
                return (f[2], None if f[1] else ACTIVADA)
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


# ── Reemisión (re-invitación) ────────────────────────────────────────────────

def test_reemite_el_enlace_de_una_pendiente(entorno):
    ra, c, estado = entorno
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert 'invite_url' in d and 'invite=' in d['invite_url']
    # El token reemitido abre la MISMA cuenta y lleva la generación NUEVA:
    # el enlace anterior (gen 1) queda muerto por igualdad de enteros.
    datos, _ = ra.leer(ra.PROPOSITO_INVITACION, d['invite_token'])
    assert datos and datos['email'] == 'gente@obra.pe'
    assert datos['gen'] == 2
    assert any('INVITACION_GEN' in u[0].upper() for u in estado['updates'])
    assert 'invitacion_reemitida' in estado['eventos']


def test_una_activada_no_se_reinvita(entorno):
    ra, c, estado = entorno
    estado['fila'][1] = False   # cuenta activada: tiene dueño
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json().get('code') == 'YA_RECLAMADA'
    assert estado['updates'] == []


def test_reinvitar_resucita_a_la_revocada(entorno):
    # doc 58, REVOCADA → PENDIENTE: la re-invitación es EL camino de vuelta
    # de una invitación revocada — is_active=TRUE y gen++ en el mismo acto.
    ra, c, estado = entorno
    estado['fila'][2] = False   # revocada
    r = c.post('/api/users/5/reinvitar', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    u = ' · '.join(x[0].upper() for x in estado['updates'])
    assert 'IS_ACTIVE = TRUE' in u and 'INVITACION_GEN' in u
    datos, _ = ra.leer(ra.PROPOSITO_INVITACION, r.get_json()['invite_token'])
    assert datos['gen'] == 2
    assert 'invitacion_reemitida' in estado['eventos']


def test_reinvitar_exige_admin(entorno):
    ra, c, estado = entorno
    r = c.post('/api/users/5/reinvitar', headers={'X-User': '1'})
    assert r.status_code == 403
    assert estado['eventos'] == []


# ── Reactivación ─────────────────────────────────────────────────────────────

def test_reactivar_devuelve_el_acceso(entorno):
    ra, c, estado = entorno
    estado['fila'][1] = False   # cuenta activada...
    estado['fila'][2] = False   # ...y suspendida
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


def test_reactivar_es_inaplicable_a_una_invitacion_revocada(entorno):
    # La reactivación es SUSPENDIDA→ACTIVADA y nada más: sobre una invitación
    # revocada el remedio es REINVITAR (arriba), nunca revivir el estado
    # pendiente con los tokens viejos aún vigentes por generación.
    ra, c, estado = entorno
    estado['fila'][2] = False   # revocada (sigue siendo invitación)
    r = c.post('/api/users/5/reactivar', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json().get('code') == 'INVITACION_REVOCADA'
    assert estado['updates'] == []


def test_reactivar_exige_admin(entorno):
    ra, c, estado = entorno
    estado['fila'][1] = False
    estado['fila'][2] = False
    r = c.post('/api/users/5/reactivar', headers={'X-User': '1'})
    assert r.status_code == 403
    assert estado['updates'] == []
