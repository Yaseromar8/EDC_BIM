# -*- coding: utf-8 -*-
"""CAPA 02 · El catálogo de la entidad se administra como lo que es.

Los tres agujeros que esta batería fija (medidos el 24-ago-2026 en las rutas
más viejas del backend):

  · AUTORIZACIÓN: POST/DELETE del catálogo solo exigían sesión — cualquier
    `user` de cualquier obra podía crear y borrar empresas de la ENTIDAD.
  · ARRASTRE SILENCIOSO: borrar una empresa dejaba a su gente «sin empresa»
    (FK SET NULL) — y sin empresa no hay función contractual derivada: las
    reglas de permiso por EMPRESA y FUNCIÓN dejaban de alcanzarles. Borrar
    un nombre del catálogo degradaba permisos sin que nadie lo viera.
  · DUPLICADOS: dos empresas con el mismo nombre y el selector elige la
    equivocada.

Y la pieza que faltaba de la capa: /api/entidad/empresas — cada empresa con
su contexto (personas, obras+función, reglas de permiso que la nombran).
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
        'duplicada': None,          # fila que devuelve el chequeo LOWER(name)
        'personas': 0, 'obras': 0, 'reglas': 0,   # referencias al borrar
        'cargo_en_uso': 0,
        'sql': [],
        'resumen_empresas': [(4, 'INTERFERENCIAS', 2, 1)],
        'participaciones': [(4, 'PQT8_TALARA', 'SUPERVISION')],
    }

    class Cursor:
        def __init__(self): self.ultimo = ('', ())
        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            self.ultimo = (s, params or ())
            estado['sql'].append(s)
        def fetchone(self):
            s = self.ultimo[0]
            if 'WHERE LOWER(NAME) = LOWER' in s:
                return estado['duplicada']
            if 'COUNT(*) FROM USERS WHERE COMPANY_ID' in s:
                return (estado['personas'],)
            if 'COUNT(*) FROM PROJECT_COMPANIES' in s:
                return (estado['obras'],)
            if 'COUNT(*) FROM FOLDER_PERMISSIONS' in s:
                return (estado['reglas'],)
            if 'COUNT(*) FROM USERS WHERE JOB_TITLE_ID' in s:
                return (estado['cargo_en_uso'],)
            if s.startswith('INSERT INTO'):
                return (99,)
            return None
        def fetchall(self):
            s = self.ultimo[0]
            if 'FROM COMPANIES C ORDER BY' in s:
                return estado['resumen_empresas']
            if 'FROM PROJECT_COMPANIES PC JOIN PROJECTS' in s:
                return estado['participaciones']
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
            g.current_user = {'id': 2, 'role': 'admin', 'name': 'A', 'email': 'a@b.c'}
        elif request.headers.get('X-User') == '1':
            g.current_user = {'id': 23, 'role': 'user', 'name': 'P', 'email': 'p@b.c'}

    return app.test_client(), estado


ADMIN = {'X-Admin': '1'}
USER = {'X-User': '1'}


def _escrituras(estado):
    return [s for s in estado['sql'] if s.startswith(('INSERT', 'DELETE', 'UPDATE'))]


# ── EL FUERO: escribir en el catálogo es del Entity Admin ────────────────────

def test_un_usuario_no_escribe_en_el_catalogo_de_la_entidad(entorno):
    """EL AGUJERO: estas cuatro escrituras solo exigían sesión. Un `user` de
    cualquier obra —el piloto recién invitado, sin ir más lejos— podía borrar
    empresas de la entidad, degradando permisos ajenos en silencio."""
    c, estado = entorno
    assert c.post('/api/companies', json={'name': 'X'}, headers=USER).status_code == 403
    assert c.delete('/api/companies/4', headers=USER).status_code == 403
    assert c.post('/api/job_titles', json={'name': 'X'}, headers=USER).status_code == 403
    assert c.delete('/api/job_titles/1', headers=USER).status_code == 403
    assert _escrituras(estado) == []


def test_leer_el_catalogo_sigue_abierto_a_la_sesion(entorno):
    """Los selectores de Participantes lo usan: leer no cambia de fuero."""
    c, _e = entorno
    assert c.get('/api/companies', headers=USER).status_code == 200
    assert c.get('/api/job_titles', headers=USER).status_code == 200


# ── Sin borrados a ciegas ────────────────────────────────────────────────────

def test_una_empresa_con_gente_no_se_borra(entorno):
    c, estado = entorno
    estado['personas'] = 3
    r = c.delete('/api/companies/4', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'EMPRESA_EN_USO'
    assert '3 personas' in r.get_json()['error']
    assert _escrituras(estado) == []


def test_una_empresa_con_participacion_o_reglas_no_se_borra(entorno):
    c, estado = entorno
    estado['obras'] = 1
    estado['reglas'] = 2
    r = c.delete('/api/companies/4', headers=ADMIN)
    assert r.status_code == 409
    d = r.get_json()
    assert d['obras'] == 1 and d['reglas'] == 2
    assert 'degradaría en silencio' in d['error']
    assert _escrituras(estado) == []


def test_una_empresa_limpia_si_se_borra(entorno):
    c, estado = entorno
    r = c.delete('/api/companies/9', headers=ADMIN)
    assert r.status_code == 200
    assert any(s.startswith('DELETE FROM COMPANIES') for s in estado['sql'])


def test_un_cargo_en_uso_no_se_borra(entorno):
    c, estado = entorno
    estado['cargo_en_uso'] = 2
    r = c.delete('/api/job_titles/1', headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'CARGO_EN_USO'
    assert _escrituras(estado) == []


# ── Sin duplicados ───────────────────────────────────────────────────────────

def test_no_se_crean_dos_empresas_con_el_mismo_nombre(entorno):
    c, estado = entorno
    estado['duplicada'] = (4, 'SINOHYDRO')
    r = c.post('/api/companies', json={'name': 'sinohydro'}, headers=ADMIN)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'EMPRESA_DUPLICADA'
    assert not any(s.startswith('INSERT') for s in estado['sql'])


def test_una_empresa_nueva_si_se_crea(entorno):
    c, estado = entorno
    r = c.post('/api/companies', json={'name': 'NUEVA SAC'}, headers=ADMIN)
    assert r.status_code == 201
    assert r.get_json()['id'] == 99


# ── La vista de entidad ──────────────────────────────────────────────────────

def test_la_vista_de_entidad_da_el_contexto_de_cada_empresa(entorno):
    c, _e = entorno
    r = c.get('/api/entidad/empresas', headers=ADMIN)
    assert r.status_code == 200, r.get_json()
    e = r.get_json()['empresas'][0]
    assert e['name'] == 'INTERFERENCIAS'
    assert e['personas'] == 2
    assert e['reglas_de_permiso'] == 1
    assert e['obras'] == [{'obra': 'PQT8_TALARA', 'funcion': 'SUPERVISION'}]


def test_la_vista_de_entidad_es_del_entity_admin(entorno):
    """El contexto completo (quién tiene gente dónde, qué reglas existen) es
    información de control de acceso: mismo fuero que el padrón entero."""
    c, _e = entorno
    assert c.get('/api/entidad/empresas', headers=USER).status_code == 403
    assert c.get('/api/entidad/empresas').status_code in (401, 403)
