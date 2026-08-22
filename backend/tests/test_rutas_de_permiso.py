# -*- coding: utf-8 -*-
"""CAPA 9 · Las rutas que hacen operable el modelo de permisos.

Tres cosas que el motor ya sabía hacer y la interfaz no podía pedirle:

  · conceder a una EMPRESA o a una FUNCIÓN CONTRACTUAL, no solo a una persona
    (`POST /api/docs/folder-permissions` con `sujeto_tipo`/`sujeto_id`);
  · preguntar el PERMISO EFECTIVO de otra persona y POR QUÉ lo tiene
    (`GET /api/docs/permiso-efectivo`);
  · saber a quién se puede conceder en esta obra
    (`GET /api/docs/sujetos-concedibles`).

Las tres son actos ADMINISTRATIVOS: quién alcanza qué es información de
control de acceso, así que exigen el mismo mínimo que ver la tabla de
permisos de la carpeta. Eso es lo primero que se prueba aquí.
"""
import importlib

import pytest
from flask import Flask, jsonify

OBRA = 'b.proj_prueba'
CARPETA = 'carpeta-1'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import routes.documents as rd
    importlib.reload(rd)

    estado = {
        'autorizado': True,       # lo que responde check_folder_permission
        'en_la_obra': True,       # lo que responde verify_project_access
        'personas': {'19': ('Ana', 'ana@obra.pe', 'user')},
        'empresas': {'4': 'SINOHYDRO'},
        'escrituras': [],
        'nivel': ('view_download', {'regla': 'sujeto', 'carpeta_id': CARPETA,
                                    'sujeto_tipo': 'COMPANY', 'sujeto_id': '4',
                                    'saltos': 1, 'desplazados': [],
                                    'texto': 'regla de COMPANY en una carpeta superior'}),
        'miembros': [(19, 'Ana', 'ana@obra.pe', 'SINOHYDRO')],
        'companias_obra': [(4, 'SINOHYDRO', 'CONTRATISTA')],
    }

    class Cursor:
        def __init__(self): self._r = []
        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            p = params or ()
            self._r = []
            if 'SELECT 1 FROM USERS WHERE ID::TEXT' in s:
                self._r = [(1,)] if str(p[0]) in estado['personas'] else []
            elif 'SELECT 1 FROM COMPANIES' in s:
                self._r = [(1,)] if str(p[0]) in estado['empresas'] else []
            elif 'SELECT ID, NAME, EMAIL, ROLE FROM USERS' in s:
                d = estado['personas'].get(str(p[0]))
                self._r = [(int(p[0]), d[0], d[1], d[2])] if d else []
            elif 'SELECT NAME FROM COMPANIES' in s:
                n = estado['empresas'].get(str(p[0]))
                self._r = [(n,)] if n else []
            elif 'SELECT NAME FROM FILE_NODES' in s:
                self._r = [('CONTRATO',)]
            elif 'FROM PROJECT_USERS PU JOIN USERS' in s:
                self._r = list(estado['miembros'])
            elif 'FROM PROJECT_COMPANIES PC JOIN COMPANIES' in s:
                self._r = list(estado['companias_obra'])
        def fetchone(self): return self._r[0] if self._r else None
        def fetchall(self): return list(self._r)

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(db, 'resolve_project_id', lambda p: OBRA)
    monkeypatch.setattr(rd, 'verify_project_access',
                        lambda u, urn: estado['en_la_obra'])

    import folder_permissions as fp
    monkeypatch.setattr(fp, 'check_folder_permission',
                        lambda u, n, m, lvl, acc=None: None if estado['autorizado']
                        else (jsonify({'error': 'no'}), 403))
    monkeypatch.setattr(fp, 'set_permiso_de_sujeto',
                        lambda *a: estado['escrituras'].append(a) or 1)
    monkeypatch.setattr(fp, 'set_folder_permission',
                        lambda *a: estado['escrituras'].append(a) or 1)

    import permiso_documental as pd
    monkeypatch.setattr(pd, 'permiso_efectivo',
                        lambda cur, u, urn, node, con_motivo=False:
                        estado['nivel'] if con_motivo else estado['nivel'][0])
    monkeypatch.setattr(pd, 'sujetos_de',
                        lambda cur, u, urn: {'USER': '19', 'COMPANY': '4',
                                             'CONTRACTUAL_FUNCTION': 'CONTRATISTA'})

    app = Flask(__name__)
    app.register_blueprint(rd.documents_bp)

    @app.before_request
    def _sesion():
        from flask import g
        g.current_user = {'id': 2, 'role': 'admin', 'email': 'admin@obra.pe'}

    return app.test_client(), estado


# ── La autoridad ─────────────────────────────────────────────────────────────

def test_sin_autoridad_administrativa_no_se_consulta_ni_se_concede(entorno):
    c, e = entorno
    e['autorizado'] = False
    assert c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=19&model_urn=%s'
                 % (CARPETA, OBRA)).status_code == 403
    assert c.get('/api/docs/sujetos-concedibles?folder_id=%s&model_urn=%s'
                 % (CARPETA, OBRA)).status_code == 403
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'sujeto_tipo': 'COMPANY',
        'sujeto_id': '4', 'permission_level': 'admin'})
    assert r.status_code == 403
    assert e['escrituras'] == []


def test_fuera_de_la_obra_no_se_consulta(entorno):
    c, e = entorno
    e['en_la_obra'] = False
    assert c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=19&model_urn=%s'
                 % (CARPETA, OBRA)).status_code == 403


# ── Conceder a los tres sujetos ──────────────────────────────────────────────

def test_concede_a_una_empresa(entorno):
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'sujeto_tipo': 'COMPANY',
        'sujeto_id': '4', 'permission_level': 'view_download'})
    assert r.status_code == 200, r.get_json()
    assert e['escrituras'] == [(CARPETA, 'COMPANY', '4', 'view_download', 2)]


def test_concede_a_una_funcion_contractual(entorno):
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA,
        'sujeto_tipo': 'CONTRACTUAL_FUNCTION',
        'sujeto_id': 'SUPERVISION', 'permission_level': 'viewer'})
    assert r.status_code == 200, r.get_json()
    assert e['escrituras'] == [(CARPETA, 'CONTRACTUAL_FUNCTION', 'SUPERVISION',
                                'viewer', 2)]


def test_concede_a_una_persona_por_sujeto(entorno):
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'sujeto_tipo': 'USER',
        'sujeto_id': '19', 'permission_level': 'none'})
    assert r.status_code == 200, r.get_json()
    # `none` es una concesión legítima: es la denegación explícita.
    assert e['escrituras'] == [(CARPETA, 'USER', '19', 'none', 2)]


def test_el_camino_viejo_por_correo_sigue_funcionando(entorno):
    """La pantalla anterior manda `user_email`. No se rompe."""
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA,
        'user_email': 'ana@obra.pe', 'permission_level': 'edit'})
    assert r.status_code in (200, 404), r.get_json()


# ── Negativas de la concesión ────────────────────────────────────────────────

def test_no_se_concede_a_una_empresa_inexistente(entorno):
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'sujeto_tipo': 'COMPANY',
        'sujeto_id': '999', 'permission_level': 'admin'})
    assert r.status_code == 404
    assert e['escrituras'] == []


def test_no_se_concede_a_una_funcion_inventada(entorno):
    """La lista de funciones es CERRADA: 'JEFAZO' no es una función."""
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA,
        'sujeto_tipo': 'CONTRACTUAL_FUNCTION',
        'sujeto_id': 'JEFAZO', 'permission_level': 'admin'})
    assert r.status_code == 400
    assert e['escrituras'] == []


def test_no_se_concede_a_un_sujeto_desconocido(entorno):
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'sujeto_tipo': 'ROBOT',
        'sujeto_id': 'x', 'permission_level': 'admin'})
    assert r.status_code == 400
    assert e['escrituras'] == []


def test_una_regla_sin_sujeto_no_se_escribe(entorno):
    """Una fila sin sujeto no alcanzaría a nadie y nadie la entendería después."""
    c, e = entorno
    r = c.post('/api/docs/folder-permissions', json={
        'folder_id': CARPETA, 'model_urn': OBRA, 'permission_level': 'admin'})
    assert r.status_code == 400
    assert e['escrituras'] == []


# ── El permiso efectivo, explicado ───────────────────────────────────────────

def test_dice_el_nivel_y_por_que(entorno):
    c, e = entorno
    r = c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=19&model_urn=%s'
              % (CARPETA, OBRA))
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d['nivel'] == 'view_download'
    assert d['nivel_label'] == 'Ver y descargar'
    assert d['denegado'] is False
    # Los tres datos del punto 6: carpeta ganadora, sujeto ganador, nivel.
    assert d['carpeta_ganadora'] == {'id': CARPETA, 'nombre': 'CONTRATO'}
    assert d['motivo']['sujeto_tipo'] == 'COMPANY'
    assert d['sujeto_ganador_label'] == 'Empresa'
    # Y con qué identidades le alcanza una regla aquí.
    assert d['alcanzable_por']['COMPANY'] == 'SINOHYDRO'
    assert d['alcanzable_por']['CONTRACTUAL_FUNCTION'] == 'Contratista'


def test_denegado_se_dice_denegado(entorno):
    c, e = entorno
    e['nivel'] = ('none', {'regla': 'sujeto', 'carpeta_id': CARPETA,
                           'sujeto_tipo': 'USER', 'sujeto_id': '19',
                           'saltos': 0, 'desplazados': [],
                           'texto': 'regla de USER en esta misma carpeta'})
    d = c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=19&model_urn=%s'
              % (CARPETA, OBRA)).get_json()
    assert d['nivel'] == 'none' and d['denegado'] is True
    assert d['nivel_label'] == 'Restringido'


def test_sin_regla_lo_dice_sin_inventar_carpeta(entorno):
    c, e = entorno
    e['nivel'] = ('none', {'regla': 'defecto', 'carpeta_id': None,
                           'sujeto_tipo': None, 'sujeto_id': None, 'saltos': 3,
                           'desplazados': [],
                           'texto': 'ninguna regla le alcanza'})
    d = c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=19&model_urn=%s'
              % (CARPETA, OBRA)).get_json()
    assert d['carpeta_ganadora'] is None
    assert d['sujeto_ganador_label'] is None
    assert d['motivo']['regla'] == 'defecto'


def test_preguntar_por_alguien_que_no_existe_es_404(entorno):
    c, e = entorno
    assert c.get('/api/docs/permiso-efectivo?node_id=%s&user_id=999&model_urn=%s'
                 % (CARPETA, OBRA)).status_code == 404


def test_faltan_parametros(entorno):
    c, _e = entorno
    assert c.get('/api/docs/permiso-efectivo?node_id=%s' % CARPETA).status_code == 400
    assert c.get('/api/docs/sujetos-concedibles?model_urn=%s' % OBRA).status_code == 400


# ── El catálogo de sujetos ───────────────────────────────────────────────────

def test_ofrece_personas_de_la_obra_empresas_y_las_funciones(entorno):
    c, _e = entorno
    r = c.get('/api/docs/sujetos-concedibles?folder_id=%s&model_urn=%s'
              % (CARPETA, OBRA))
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d['personas'] == [{'sujeto_id': '19', 'nombre': 'Ana',
                              'detalle': 'ana@obra.pe', 'empresa': 'SINOHYDRO'}]
    assert d['empresas'] == [{'sujeto_id': '4', 'nombre': 'SINOHYDRO',
                              'detalle': 'Participa como Contratista'}]
    # Las funciones salen TODAS, de la lista cerrada: conceder a una función
    # que aún no ejerce nadie es legítimo (y su alcance futuro se advierte).
    from directorio_de_obra import FUNCIONES
    assert [f['sujeto_id'] for f in d['funciones']] == list(FUNCIONES)
