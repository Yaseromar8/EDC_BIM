# -*- coding: utf-8 -*-
"""Guardar Accesos actualiza POR DIFERENCIA, no por reemplazo total.

El endpoint hacía DELETE de toda la membresía + INSERT de lo marcado. Dos
pérdidas silenciosas en cada guardado: `es_admin` (el INSERT no lo lleva y
nace FALSE — un guardado posterior a la adjudicación degradaba a los
administradores de obra) y `assigned_at` (la fecha real de incorporación,
que ya se perdió una vez en la obra real el 22-ago).

Estas pruebas fijan la propiedad: quien se queda, NI SE TOCA.
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

    estado = {
        'miembros': {10, 11, 12},     # membresía actual de la obra
        'no_admins': {10, 11, 12, 13, 14},  # ids válidos con role != admin
        'deletes': [],
        'inserts': [],
    }

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
            s = self.ultimo[0].upper()
            if s.startswith('DELETE FROM PROJECT_USERS'):
                estado['deletes'].append(params)
            elif s.startswith('INSERT INTO PROJECT_USERS'):
                estado['inserts'].append(params)
        def fetchall(self):
            s = (self.ultimo or ('',))[0].upper()
            if 'SELECT USER_ID FROM PROJECT_USERS' in s:
                return [(u,) for u in sorted(estado['miembros'])]
            if 'SELECT ID FROM USERS' in s:
                pedidos = set(self.ultimo[1][0])
                return [(u,) for u in sorted(pedidos & estado['no_admins'])]
            return []

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())

    app = Flask(__name__)
    app.register_blueprint(ra.auth_bp)

    @app.before_request
    def _sesion():
        from flask import g, request
        if request.headers.get('X-Admin') == '1':
            g.current_user = {'id': 1, 'role': 'admin', 'name': 'A', 'email': 'a@b.c'}

    return app.test_client(), estado


ADMIN = {'X-Admin': '1'}


def test_quien_se_queda_ni_se_toca(entorno):
    c, estado = entorno
    # Se guardan los mismos tres: nada que borrar, nada que insertar.
    r = c.post('/api/projects/obra-x/users', json={'user_ids': [10, 11, 12]}, headers=ADMIN)
    assert r.status_code == 200
    assert estado['deletes'] == [], 'borro filas de gente que seguia marcada'
    assert estado['inserts'] == [], 'reinserto filas existentes (pisa es_admin y assigned_at)'
    assert r.get_json()['se_quedaron'] == 3


def test_solo_entra_el_nuevo(entorno):
    c, estado = entorno
    r = c.post('/api/projects/obra-x/users', json={'user_ids': [10, 11, 12, 13]}, headers=ADMIN)
    assert r.status_code == 200
    assert estado['deletes'] == []
    assert [p[1] for p in estado['inserts']] == [13]
    assert r.get_json()['entraron'] == [13]


def test_solo_sale_el_desmarcado(entorno):
    c, estado = entorno
    r = c.post('/api/projects/obra-x/users', json={'user_ids': [10, 11]}, headers=ADMIN)
    assert r.status_code == 200
    assert len(estado['deletes']) == 1
    assert estado['deletes'][0][1] == [12], 'debe borrar exactamente al que sale'
    assert estado['inserts'] == []
    assert r.get_json()['salieron'] == [12]


def test_un_admin_de_entidad_no_entra_como_membresia(entorno):
    c, estado = entorno
    # el 99 no esta en no_admins (es admin o no existe): se ignora
    r = c.post('/api/projects/obra-x/users', json={'user_ids': [10, 11, 12, 99]}, headers=ADMIN)
    assert r.status_code == 200
    assert estado['inserts'] == []


def test_sin_admin_no_se_guarda(entorno):
    c, estado = entorno
    r = c.post('/api/projects/obra-x/users', json={'user_ids': []})
    assert r.status_code in (401, 403)
    assert estado['deletes'] == [] and estado['inserts'] == []
