"""Contrato local de marcas CAD; no conecta a una base real."""
from datetime import datetime, timezone
import uuid

from flask import Flask, g
import pytest

import routes.cad_review as review


FILE = str(uuid.uuid4())
VERSION = str(uuid.uuid4())
MARK = str(uuid.uuid4())


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


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(review.cad_review_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7}))
    monkeypatch.setattr(review, '_node', lambda nid, required='viewer':
                        ({'id': FILE, 'project': 'obra', 'version': VERSION}, None))
    monkeypatch.setattr(review, '_version', lambda node, supplied: VERSION)
    return app


def test_crear_nube_es_borrador_y_conserva_su_version(app, monkeypatch):
    cursor = Cursor([(MARK,)])
    conn = Connection(cursor)
    monkeypatch.setattr(review, 'get_db_connection', lambda: conn)
    response = app.test_client().post('/api/docs/cad/reviews', json={
        'node_id': FILE, 'version_id': VERSION, 'view_guid': 'vista-2d',
        'kind': 'cloud', 'geometry': {'x': 10, 'y': 20, 'z': 0, 'w': 30, 'h': 40},
    })
    assert response.status_code == 201
    assert response.json == {'success': True, 'id': MARK, 'published': False}
    assert conn.committed
    sql, params = cursor.queries[0]
    assert 'INSERT INTO cad_review_marks' in sql
    assert params[0:4] == (FILE, VERSION, 'vista-2d', 'cloud')
    assert '"z": 0.0' in params[4]


def test_lista_solo_publicadas_o_propias(app, monkeypatch):
    cursor = Cursor([[], []])
    monkeypatch.setattr(review, 'get_db_connection', lambda: Connection(cursor))
    response = app.test_client().get(f'/api/docs/cad/reviews?node_id={FILE}&view_guid=vista-2d')
    assert response.status_code == 200
    assert response.json['marks'] == []
    sql, params = cursor.queries[0]
    assert '(m.published OR m.created_by_id = %s)' in sql
    assert params == (FILE, VERSION, 'vista-2d', 7)


def test_borrador_ajeno_no_se_abre(app, monkeypatch):
    now = datetime.now(timezone.utc)
    row = (MARK, FILE, VERSION, 'vista-2d', 'text', {'x': 1, 'y': 2},
           'Privado', 99, False, now, now)
    monkeypatch.setattr(review, 'get_db_connection', lambda: Connection(Cursor([row])))
    response = app.test_client().get(f'/api/docs/cad/reviews/{MARK}/photos/{uuid.uuid4()}')
    assert response.status_code == 404


def test_no_se_publica_foto_sin_adjunto(app, monkeypatch):
    now = datetime.now(timezone.utc).isoformat()
    monkeypatch.setattr(review, '_mark', lambda *_args, **_kwargs: ({
        'id': MARK, 'kind': 'photo', 'created_by_id': 7,
        'created_at': now, 'updated_at': now,
    }, None))
    cursor = Cursor([])
    conn = Connection(cursor)
    monkeypatch.setattr(review, 'get_db_connection', lambda: conn)
    response = app.test_client().post(f'/api/docs/cad/reviews/{MARK}/publish')
    assert response.status_code == 400
    assert not conn.committed
    assert len(cursor.queries) == 1


def test_referencia_entre_obras_denegada(app, monkeypatch):
    monkeypatch.setattr(review, '_mark', lambda *_args, **_kwargs: ({
        'id': MARK, 'kind': 'cloud', 'file_node_id': FILE,
    }, None))
    target_id = str(uuid.uuid4())
    def node(nid, required='viewer'):
        return ({'id': nid, 'project': 'otra' if nid == target_id else 'obra',
                 'version': VERSION}, None)
    monkeypatch.setattr(review, '_node', node)
    response = app.test_client().post(f'/api/docs/cad/reviews/{MARK}/attachments',
                                      json={'kind': 'plan', 'file_node_id': target_id})
    assert response.status_code == 400


def test_foto_no_sirve_contenido_activo_desde_nuestro_origen(app, monkeypatch):
    import gcs_manager
    monkeypatch.setattr(review, '_mark', lambda *_args, **_kwargs: ({
        'id': MARK, 'kind': 'photo', 'file_node_id': FILE,
    }, None))
    aid = str(uuid.uuid4())
    monkeypatch.setattr(review, 'get_db_connection', lambda: Connection(
        Cursor([('photo', None, 'cad-review/objeto')])))
    monkeypatch.setattr(gcs_manager, 'get_blob_data', lambda _: (
        b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'image/svg+xml'))
    response = app.test_client().get(f'/api/docs/cad/reviews/{MARK}/photos/{aid}')
    assert response.status_code == 415


def test_quitar_foto_conserva_rastro_sin_mostrarla(app, monkeypatch):
    monkeypatch.setattr(review, '_mark', lambda *_args, **_kwargs: ({
        'id': MARK, 'kind': 'photo', 'file_node_id': FILE,
    }, None))
    cursor = Cursor([])
    conn = Connection(cursor)
    monkeypatch.setattr(review, 'get_db_connection', lambda: conn)
    aid = str(uuid.uuid4())
    response = app.test_client().delete(f'/api/docs/cad/reviews/{MARK}/attachments/{aid}')
    assert response.status_code == 200
    assert conn.committed
    sql, params = cursor.queries[0]
    assert 'UPDATE cad_review_attachments' in sql
    assert 'SET deleted_at=now(), deleted_by_id=%s' in sql
    assert params == (7, aid, MARK)


@pytest.mark.parametrize('geometry', [
    {'x': 0, 'y': 0, 'w': 0, 'h': 20},
    {'x': float('nan'), 'y': 0, 'w': 10, 'h': 20},
    {'x': 0, 'y': 0, 'z': float('inf'), 'w': 10, 'h': 20},
])
def test_geometria_invalida_no_se_guarda(app, monkeypatch, geometry):
    response = app.test_client().post('/api/docs/cad/reviews', json={
        'node_id': FILE, 'view_guid': 'vista-2d', 'kind': 'cloud', 'geometry': geometry,
    })
    assert response.status_code == 400
