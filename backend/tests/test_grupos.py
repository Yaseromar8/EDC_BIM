"""Contrato local de los grupos de documentos (routes/grupos.py); no conecta a una base real."""
from datetime import datetime, timedelta, timezone
import os
import re
import uuid

from flask import Flask, g
import pytest

import routes.grupos as gr


GRUPO = str(uuid.uuid4())
DOC = str(uuid.uuid4())
OTRO = str(uuid.uuid4())
VER = str(uuid.uuid4())
AHORA = datetime.now(timezone.utc)


class Cursor:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []
        self.rowcount = 1

    def execute(self, sql, params=()):
        self.queries.append((sql, params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        return self.rows.pop(0) if self.rows else []


class Connection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(gr, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(gr.grupos_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'name': 'Ana'}))
    monkeypatch.setattr(gr, '_hay_acceso', lambda obra: obra == 'obra')
    monkeypatch.setattr(gr, '_es_admin', lambda obra: False)
    monkeypatch.setattr(gr, 'guardia_de_recurso', lambda tabla, valor: None)
    monkeypatch.setattr(gr, 'check_folder_permission', lambda *a, **k: None)
    return app


# ── crear ───────────────────────────────────────────────────────────────────────────────────

def test_crear_un_grupo_personal(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [None, (GRUPO,)])
    r = app.test_client().post('/api/docs/grupos', json={'model_urn': 'obra', 'nombre': '  Valorización   octubre '})
    assert r.status_code == 201
    assert r.get_json() == {'success': True, 'id': GRUPO, 'nombre': 'Valorización octubre', 'de_la_obra': False}
    sql, p = cur.queries[-1]
    assert 'INSERT INTO grupos_de_documentos' in sql and p == ('obra', 'Valorización octubre', 7, 7)
    assert conn.committed


def test_grupo_de_la_obra_solo_administrador(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [])
    r = app.test_client().post('/api/docs/grupos', json={'model_urn': 'obra', 'nombre': 'Contractuales', 'de_la_obra': True})
    assert r.status_code == 403 and not conn.committed
    monkeypatch.setattr(gr, '_es_admin', lambda obra: True)
    cur, _ = _conectar(monkeypatch, [None, (GRUPO,)])
    r = app.test_client().post('/api/docs/grupos', json={'model_urn': 'obra', 'nombre': 'Contractuales', 'de_la_obra': True})
    assert r.status_code == 201 and cur.queries[-1][1][2] is None      # owner_id NULL = de la obra


@pytest.mark.parametrize('cuerpo, estado', [
    ({'model_urn': 'otra', 'nombre': 'x'}, 403),           # obra ajena
    ({'model_urn': 'obra', 'nombre': ''}, 400),
    ({'model_urn': 'obra', 'nombre': 'x' * 81}, 400),
])
def test_crear_rechaza(app, monkeypatch, cuerpo, estado):
    _, conn = _conectar(monkeypatch, [])
    assert app.test_client().post('/api/docs/grupos', json=cuerpo).status_code == estado
    assert not conn.committed


def test_nombre_repetido_es_409(app, monkeypatch):
    _conectar(monkeypatch, [(1,)])
    assert app.test_client().post('/api/docs/grupos', json={'model_urn': 'obra', 'nombre': 'Campo'}).status_code == 409


# ── listar ──────────────────────────────────────────────────────────────────────────────────

def test_listar_mis_grupos_y_los_de_la_obra(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[(GRUPO, 'Contractuales', None, 6, 1), (OTRO, 'Campo', 7, 2, 0)]])
    r = app.test_client().get('/api/docs/grupos?model_urn=obra')
    d = r.get_json()
    assert [x['nombre'] for x in d['grupos']] == ['Contractuales', 'Campo']
    assert d['grupos'][0]['de_la_obra'] is True and d['grupos'][0]['con_version_nueva'] == 1
    assert '(gr.owner_id IS NULL OR gr.owner_id = %s)' in cur.queries[-1][0]      # nunca los personales de otros
    assert d['puede_crear_de_la_obra'] is False
    assert app.test_client().get('/api/docs/grupos?model_urn=otra').status_code == 403


# ── el grupo: ajeno, de la obra ─────────────────────────────────────────────────────────────

def test_grupo_personal_ajeno_no_existe_para_mi(app, monkeypatch):
    _conectar(monkeypatch, [(GRUPO, 'obra', 'De Luis', 99)])
    assert app.test_client().get('/api/docs/grupos/%s/documentos' % GRUPO).status_code == 404


def test_grupo_de_la_obra_se_lee_pero_solo_el_admin_lo_cambia(app, monkeypatch):
    _conectar(monkeypatch, [(GRUPO, 'obra', 'Contractuales', None), []])
    assert app.test_client().get('/api/docs/grupos/%s/documentos' % GRUPO).status_code == 200
    _, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Contractuales', None)])
    r = app.test_client().post('/api/docs/grupos/%s/documentos' % GRUPO, json={'node_id': DOC})
    assert r.status_code == 403 and not conn.committed
    assert app.test_client().delete('/api/docs/grupos/no-es-uuid').status_code == 400


# ── añadir, fijar, quitar ───────────────────────────────────────────────────────────────────

def test_anadir_un_documento_que_sigue_la_vigente_o_fijo(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7), ('obra', 'FILE', VER)])
    r = app.test_client().post('/api/docs/grupos/%s/documentos' % GRUPO, json={'node_id': DOC})
    assert r.status_code == 201 and cur.queries[-1][1] == (GRUPO, DOC, None, 7) and conn.committed
    cur, _ = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7), ('obra', 'FILE', VER)])
    app.test_client().post('/api/docs/grupos/%s/documentos' % GRUPO, json={'node_id': DOC, 'fijar': True})
    assert cur.queries[-1][1][2] == VER


def test_no_se_anade_un_documento_de_otra_obra_ni_sin_permiso(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7), ('otra', 'FILE', VER)])
    assert app.test_client().post('/api/docs/grupos/%s/documentos' % GRUPO, json={'node_id': DOC}).status_code == 404
    monkeypatch.setattr(gr, 'check_folder_permission', lambda *a, **k: ('sin permiso', 403))
    _, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7), ('obra', 'FILE', VER)])
    assert app.test_client().post('/api/docs/grupos/%s/documentos' % GRUPO, json={'node_id': DOC}).status_code == 403
    assert not conn.committed


def test_fijar_quitar_y_lo_que_no_esta(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7)])
    r = app.test_client().patch('/api/docs/grupos/%s/documentos/%s' % (GRUPO, DOC), json={'fijar': False})
    assert r.status_code == 200 and 'version_id = NULL' in cur.queries[-1][0]
    cur, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7)])
    assert app.test_client().delete('/api/docs/grupos/%s/documentos/%s' % (GRUPO, DOC)).status_code == 200
    assert 'DELETE FROM grupo_documentos' in cur.queries[-1][0]          # solo el puntero, no el documento
    cur, conn = _conectar(monkeypatch, [(GRUPO, 'obra', 'Campo', 7)])
    cur.rowcount = 0
    assert app.test_client().delete('/api/docs/grupos/%s/documentos/%s' % (GRUPO, DOC)).status_code == 404


# ── ver lo que hay dentro ───────────────────────────────────────────────────────────────────

def _fila(nid, fijo=False, hace_dias=1):
    v = AHORA - timedelta(days=hace_dias)
    return (nid, 'Presupuesto.xlsx', 'obra', 'PUBLISHED', 'C04', 'A1', 'gs://x', 'application/xlsx', {}, AHORA,
            VER, 4, v,
            (VER if fijo else None), (1 if fijo else None), ('gs://v1' if fijo else None), ('C01' if fijo else None),
            (AHORA if fijo else None), ('Ana' if fijo else None), AHORA)


def test_documentos_con_su_carpeta_su_version_y_el_aviso(app, monkeypatch):
    _conectar(monkeypatch, [(GRUPO, 'obra', 'Contractuales', None),
                            [_fila(DOC, hace_dias=2), _fila(OTRO, fijo=True)],
                            [('c5', '5. PRESUPUESTO')], [('c5', '5. PRESUPUESTO')]])
    d = app.test_client().get('/api/docs/grupos/%s/documentos' % GRUPO).get_json()
    a, b = d['documentos']
    assert a['ruta'] == ['5. PRESUPUESTO'] and a['carpeta_id'] == 'c5' and a['file']['fullName'] == 'obra/5. PRESUPUESTO/Presupuesto.xlsx'
    assert a['version_vigente'] == 4 and a['fijo'] is None and a['nueva_version'] is True
    assert b['fijo']['version_number'] == 1 and b['nueva_version'] is False      # fijo: nunca «nueva»
    assert d['grupo']['de_la_obra'] is True


def test_un_grupo_no_concede_acceso_a_lo_que_no_puedes_abrir(app, monkeypatch):
    monkeypatch.setattr(gr, 'check_folder_permission', lambda u, nid, *a, **k: ('no', 403) if nid == OTRO else None)
    _conectar(monkeypatch, [(GRUPO, 'obra', 'Contractuales', None),
                            [_fila(DOC, hace_dias=30), _fila(OTRO)], [('c5', '5. PRESUPUESTO')]])
    d = app.test_client().get('/api/docs/grupos/%s/documentos' % GRUPO).get_json()
    assert [x['file']['id'] for x in d['documentos']] == [DOC]                     # ni el nombre del otro
    assert d['documentos'][0]['nueva_version'] is False                          # vigente de hace 30 días


# ── perímetro y esquema ─────────────────────────────────────────────────────────────────────

def test_el_perimetro_conoce_las_rutas_del_grupo():
    import perimetro_de_obra as p
    assert p.RECURSOS['grupos_de_documentos'] == ('id', 'model_urn')
    for vista in ('grupo', 'documentos_del_grupo', 'documento_del_grupo'):
        assert p.RUTAS_POR_RECURSO[vista] == ('grupos_de_documentos', 'gid')


def test_la_migracion_y_el_esquema_de_codigo_dicen_lo_mismo():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sql = open(os.path.join(raiz, 'sql', '35_grupos_de_documentos.sql'), encoding='utf-8').read()
    src = open(os.path.join(raiz, 'routes', 'grupos.py'), encoding='utf-8').read()
    columnas = lambda t: sorted(re.findall(r'^\s+(\w+) (?:UUID|TEXT|INTEGER|TIMESTAMPTZ)', t, re.M))
    assert columnas(sql) == columnas(src)
    assert os.path.exists(os.path.join(raiz, 'sql', '35_grupos_de_documentos_rollback.sql'))
