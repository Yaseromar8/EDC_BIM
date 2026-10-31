"""Contrato local de los Tableros de Docs (routes/tableros.py, docs/visor/57); no conecta a una base real."""
from datetime import datetime, timezone
import uuid

from flask import Flask, g
import pytest

import routes.tableros as tb
import perimetro_de_obra as po


TAB = str(uuid.uuid4())
AHORA = datetime(2026, 10, 30, 21, 0, tzinfo=timezone.utc)


class Cursor:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

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
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(tb, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(tb.tableros_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'name': 'Ana'}))
    monkeypatch.setattr(tb, '_hay_acceso', lambda obra: obra == 'obra')
    monkeypatch.setattr(tb, '_es_admin', lambda obra: False)
    monkeypatch.setattr(tb, 'guardia_de_recurso', lambda tabla, valor: None)
    return app


def _fila(autor=7, archivado=False, version=3, obra='obra'):
    """La fila que lee la guardia: id, obra, nombre, archivado, autor, versión."""
    return (TAB, obra, 'Reunión', archivado, autor, version)


# ── listar y crear ─────────────────────────────────────────────────────────────────────────

def test_listar_los_tableros_de_la_obra(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[(TAB, 'Reunión', False, AHORA, AHORA, 7, 'Ana', AHORA, '<svg></svg>')]])
    r = app.test_client().get('/api/docs/tableros?model_urn=obra')
    assert r.status_code == 200 and r.headers['Cache-Control'] == 'private, no-store'
    t = r.get_json()['tableros'][0]
    assert t == {'id': TAB, 'nombre': 'Reunión', 'archivado': False, 'creado_en': AHORA.isoformat(),
                 'actualizado_en': AHORA.isoformat(), 'creado_por_id': 7, 'creado_por': 'Ana',
                 'abierto_por_mi': AHORA.isoformat(), 'miniatura': '<svg></svg>'}
    sql, params = cur.queries[-1]
    assert 'ORDER BY a.abierto_en DESC NULLS LAST' in sql and params == (7, 'obra', False)


def test_listar_archivados(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[]])
    app.test_client().get('/api/docs/tableros?model_urn=obra&archivados=1')
    assert cur.queries[-1][1] == (7, 'obra', True)


def test_listar_otra_obra_es_403(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [])
    assert app.test_client().get('/api/docs/tableros?model_urn=otra').status_code == 403
    assert app.test_client().get('/api/docs/tableros').status_code == 403


def test_crear_un_tablero(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(TAB,)])
    r = app.test_client().post('/api/docs/tableros', json={'model_urn': 'obra', 'nombre': '  Reunión   lunes '})
    assert r.status_code == 201
    assert r.get_json() == {'success': True, 'id': TAB, 'nombre': 'Reunión lunes', 'version': 1}
    assert 'INSERT INTO tableros' in cur.queries[0][0] and cur.queries[0][1] == ('obra', 'Reunión lunes', 7, 7)
    assert 'tableros_abiertos' in cur.queries[1][0]          # quien lo crea lo tiene «abierto por mí»
    assert conn.committed


def test_crear_sin_nombre_es_sin_titulo(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [(TAB,)])
    r = app.test_client().post('/api/docs/tableros', json={'model_urn': 'obra'})
    assert r.get_json()['nombre'] == 'Sin título' and cur.queries[0][1][1] == 'Sin título'


@pytest.mark.parametrize('cuerpo, estado', [
    ({'model_urn': 'otra', 'nombre': 'x'}, 403),
    ({'model_urn': 'obra', 'nombre': 'x' * 121}, 400),
])
def test_crear_rechaza(app, monkeypatch, cuerpo, estado):
    _, conn = _conectar(monkeypatch, [])
    assert app.test_client().post('/api/docs/tableros', json=cuerpo).status_code == estado
    assert not conn.committed


# ── abrir ──────────────────────────────────────────────────────────────────────────────────

def test_abrir_devuelve_el_contenido_y_anota_quien_lo_abrio(app, monkeypatch):
    cfg = {'notas': [{'id': 'n1', 'texto': 'Hola'}]}
    cur, conn = _conectar(monkeypatch, [_fila(), (cfg, 3, 'Reunión', False)])
    r = app.test_client().get('/api/docs/tableros/%s' % TAB)
    assert r.status_code == 200
    d = r.get_json()
    assert d['config'] == cfg and d['version'] == 3 and d['model_urn'] == 'obra'
    assert 'INSERT INTO tableros_abiertos' in cur.queries[-1][0] and cur.queries[-1][1] == (TAB, 7)
    assert conn.committed


def test_tablero_de_otra_obra_es_403(app, monkeypatch):
    _conectar(monkeypatch, [_fila(obra='otra')])
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 403


def test_tablero_inexistente_o_id_invalido(app, monkeypatch):
    _conectar(monkeypatch, [None])
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 404
    assert app.test_client().get('/api/docs/tableros/no-es-uuid').status_code == 400


def test_la_guardia_de_recurso_manda(app, monkeypatch):
    _conectar(monkeypatch, [_fila()])
    monkeypatch.setattr(tb, 'guardia_de_recurso', lambda tabla, valor: (tb.jsonify({'error': 'x'}), 403))
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 403


# ── guardar sin pisar ──────────────────────────────────────────────────────────────────────

def test_guardar_sobre_la_version_vigente(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(), (4,)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'notas': []}, 'version': 3})
    assert r.status_code == 200 and r.get_json() == {'success': True, 'version': 4}
    sql, params = cur.queries[-1]
    assert 'WHERE id = %s AND version = %s' in sql and params[-2:] == (TAB, 3)    # guardado condicional
    assert params[1] is False                                                       # sin miniatura: no se toca
    assert conn.committed


def test_guardar_sobre_una_version_vieja_es_409_con_lo_actual(app, monkeypatch):
    actual = {'notas': [{'id': 'de-luis'}]}
    _, conn = _conectar(monkeypatch, [_fila(version=5), None, (actual, 5)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'notas': []}, 'version': 3})
    assert r.status_code == 409
    d = r.get_json()
    assert d['code'] == 'VERSION' and d['version'] == 5 and d['config'] == actual
    assert conn.rolled_back and not conn.committed


@pytest.mark.parametrize('cuerpo', [{'version': 3}, {'config': [], 'version': 3}, {'config': {}}, {'config': {}, 'version': 'x'}])
def test_guardar_rechaza_cuerpos_malos(app, monkeypatch, cuerpo):
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().put('/api/docs/tableros/%s' % TAB, json=cuerpo).status_code == 400
    assert not conn.committed


def test_no_se_guarda_un_tablero_archivado(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(archivado=True)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3})
    assert r.status_code == 409 and r.get_json()['code'] == 'ARCHIVADO' and not conn.committed


def test_no_se_guarda_un_tablero_enorme(app, monkeypatch):
    monkeypatch.setattr(tb, 'CONFIG_MAX', 50)
    _, conn = _conectar(monkeypatch, [_fila()])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'texto': 'x' * 100}, 'version': 3})
    assert r.status_code == 413 and not conn.committed


def test_abrir_solo_la_version_no_lee_ni_anota(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(version=9)])
    r = app.test_client().get('/api/docs/tableros/%s?solo_version=1' % TAB)
    assert r.status_code == 200 and r.get_json()['version'] == 9 and 'config' not in r.get_json()
    assert len(cur.queries) == 1 and not conn.committed            # solo la guardia; nada de tableros_abiertos


def test_abrir_sin_apertura_no_anota(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(), ({'notas': []}, 3, 'Reunión', False)])
    r = app.test_client().get('/api/docs/tableros/%s?sin_apertura=1' % TAB)
    assert r.status_code == 200 and r.get_json()['version'] == 3
    assert not any('tableros_abiertos' in q[0] for q in cur.queries) and not conn.committed


def test_guardar_con_miniatura(app, monkeypatch):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="4" height="4" fill="#FBE8A6"/></svg>'
    cur, conn = _conectar(monkeypatch, [_fila(), (4,)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': svg})
    assert r.status_code == 200
    params = cur.queries[-1][1]
    assert params[1] is True and params[2] == svg and conn.committed


def test_miniatura_vacia_la_borra(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_fila(), (4,)])
    app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': ''})
    params = cur.queries[-1][1]
    assert params[1] is True and params[2] is None


@pytest.mark.parametrize('svg', [
    '<svg onload="alert(1)"></svg>', '<svg><script>alert(1)</script></svg>', '<svg><a href="https://x"><rect/></a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>', '<svg><image href="https://x"/></svg>', '<svg style="fill:url(https://x)"></svg>',
    '<svg><animate attributeName="x"/></svg>', '<p>no es svg</p>', '<svg>' + 'x' * 30000 + '</svg>', 42,
])
def test_miniatura_peligrosa_o_rara_se_rechaza(app, monkeypatch, svg):
    _, conn = _conectar(monkeypatch, [_fila()])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': svg})
    assert r.status_code == 400 and not conn.committed


# ── renombrar y archivar ───────────────────────────────────────────────────────────────────

def test_renombrar(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(autor=99)])          # cualquiera de la obra lo renombra
    r = app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'nombre': '  Comité   de obra '})
    assert r.status_code == 200
    sql, params = cur.queries[-1]
    assert sql.startswith('UPDATE tableros SET nombre = %s, updated_by_id = %s') and params == ('Comité de obra', 7, TAB)
    assert conn.committed


def test_archivar_solo_autor_o_administrador(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(autor=99)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': True}).status_code == 403
    assert not conn.committed
    cur, conn = _conectar(monkeypatch, [_fila(autor=7)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': True}).status_code == 200
    assert cur.queries[-1][1] == (True, 7, TAB) and conn.committed
    monkeypatch.setattr(tb, '_es_admin', lambda obra: True)
    _, conn = _conectar(monkeypatch, [_fila(autor=99)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': False}).status_code == 200


@pytest.mark.parametrize('cuerpo', [{}, {'nombre': ''}, {'nombre': 'x' * 121}])
def test_patch_rechaza(app, monkeypatch, cuerpo):
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json=cuerpo).status_code == 400
    assert not conn.committed


# ── perímetro ──────────────────────────────────────────────────────────────────────────────

def test_el_perimetro_sabe_de_que_obra_es_un_tablero():
    assert po.RECURSOS['tableros'] == ('id', 'model_urn')
    assert po.RUTAS_POR_RECURSO['tablero'] == ('tableros', 'tid')


def test_sin_sesion_es_401(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(tb.tableros_bp)
    _conectar(monkeypatch, [])
    assert app.test_client().get('/api/docs/tableros?model_urn=obra').status_code == 401
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 401
