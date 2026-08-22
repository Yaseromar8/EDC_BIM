# -*- coding: utf-8 -*-
"""P4 · La ficha de persona: una lectura transversal, cero edición.

La escalera persona → entidad → sus obras → empresa → función por obra →
qué administra, en una ruta de SOLO LECTURA para el Entity Admin. La función
contractual sale DERIVADA del par (empresa, obra) — nunca guardada en la
persona — y la administración es la de cada obra, no un rol global.
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

    import datetime
    F = datetime.datetime(2026, 8, 22, 12, 0)
    estado = {
        'persona': (7, 'Persona Real', 'p@obra.pe', 'user', True, False,
                    F, F, True, 4, 'SINOHYDRO', 'Residente'),
        'obras': [
            ('1', 'PQT8_TALARA', False, F, 'CONTRATISTA'),
            ('b.proj_x', 'OTRA OBRA', True, F, None),
        ],
    }

    class Cursor:
        def __init__(self): self.ultimo = None
        def execute(self, sql, params=None):
            self.ultimo = (' '.join(sql.split()), params)
        def fetchone(self):
            s = (self.ultimo or ('',))[0].upper()
            if 'LEFT JOIN JOB_TITLES' in s:
                return estado['persona']
            return None
        def fetchall(self):
            s = (self.ultimo or ('',))[0].upper()
            if 'FROM PROJECT_USERS PU JOIN PROJECTS' in s:
                return estado['obras']
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
        elif request.headers.get('X-User') == '1':
            g.current_user = {'id': 9, 'role': 'user', 'name': 'U', 'email': 'u@b.c'}

    return app.test_client(), estado


ADMIN = {'X-Admin': '1'}


def test_la_escalera_completa(entorno):
    c, _ = entorno
    r = c.get('/api/users/7/ficha', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d['name'] == 'Persona Real'
    assert d['perfil_del_sistema'] == 'user' and d['es_entity_admin'] is False
    assert d['empresa']['name'] == 'SINOHYDRO' and d['cargo'] == 'Residente'
    assert d['dos_pasos'] is True
    assert len(d['obras']) == 2
    # La función es DERIVADA por obra: puede existir en una y faltar en otra.
    o1, o2 = d['obras']
    assert o1['funcion_contractual'] == 'CONTRATISTA' and o1['administra'] is False
    assert o2['funcion_contractual'] is None and o2['administra'] is True


def test_solo_entity_admin(entorno):
    c, _ = entorno
    assert c.get('/api/users/7/ficha', headers={'X-User': '1'}).status_code == 403
    assert c.get('/api/users/7/ficha').status_code in (401, 403)


def test_persona_inexistente_404(entorno):
    c, estado = entorno
    estado['persona'] = None
    assert c.get('/api/users/999/ficha', headers=ADMIN).status_code == 404


def test_es_solo_lectura(entorno):
    c, _ = entorno
    # La ruta no acepta escribir: ni POST ni PATCH existen sobre /ficha.
    assert c.post('/api/users/7/ficha', headers=ADMIN).status_code == 405
    assert c.patch('/api/users/7/ficha', headers=ADMIN).status_code == 405
