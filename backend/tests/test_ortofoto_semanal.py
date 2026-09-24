"""La capa semanal es compartida, atómica y sólo administrable en su obra.

No hay llamadas reales a PostgreSQL ni a GCS en este banco.
"""

import io
import json

from flask import Flask, g, jsonify
from google.api_core.exceptions import PreconditionFailed
from PIL import Image

from routes import orthophoto as ortho


class Blob:
    def __init__(self, bucket, name):
        self.bucket = bucket
        self.name = name
        self.generation = 0
        self.data = None
        self.cache_control = None

    def _put(self, data, if_generation_match):
        if if_generation_match != self.generation:
            raise PreconditionFailed('stale generation')
        if self.bucket.fail_south and self.name.endswith('/south.jpg'):
            raise OSError('fallo simulado en el segundo JPG')
        self.data = data
        self.generation += 1

    def upload_from_file(self, stream, content_type=None, if_generation_match=None, timeout=None):
        self._put(stream.read(), if_generation_match)

    def upload_from_string(self, data, content_type=None, if_generation_match=None):
        self._put(data.encode('utf-8'), if_generation_match)

    def download_as_bytes(self):
        return self.data


class Bucket:
    def __init__(self):
        self.blobs = {}
        self.fail_south = False

    def blob(self, name):
        return self.blobs.setdefault(name, Blob(self, name))

    def get_blob(self, name):
        blob = self.blobs.get(name)
        return blob if blob and blob.data is not None else None


def jpeg():
    data = io.BytesIO()
    Image.new('RGB', (8, 12), '#778899').save(data, format='JPEG')
    return data.getvalue()


def post_photo(client, expected='', role='admin', north=None, south=None,
               urn='urn:terrain', relief='0.4', shade='0.7'):
    return client.post('/api/orthophoto/1_CANAL/publish',
                       data={'expected_revision': expected, 'model_urn': urn,
                             'db_id': '42', 'relief_blend': relief,
                             'directional_shade': shade,
                             'north': (io.BytesIO(north or jpeg()), 'n.jpg'),
                             'south': (io.BytesIO(south or jpeg()), 's.jpg')},
                       headers={'X-Test-Role': role})


def test_weekly_publish_replaces_atomically_and_removal_does_not_delete(monkeypatch):
    bucket = Bucket()
    monkeypatch.setattr(ortho, '_bucket', lambda: bucket)
    monkeypatch.setattr(ortho, '_EXPECTED_SIZE', (8, 12))
    monkeypatch.setattr(ortho, 'resolve_project_id',
                        lambda scope: 'obra' if scope in ('1_CANAL', 'OTHER') else None)
    monkeypatch.setattr(ortho, '_source_belongs',
                        lambda scope, urn: scope == '1_CANAL' and urn == 'urn:terrain')

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def cursor(self): return self

    monkeypatch.setattr(ortho, 'get_db_connection', lambda: Connection())
    monkeypatch.setattr(ortho, 'es_admin_de_obra',
                        lambda _cursor, user, _scope: user['role'] == 'admin')
    monkeypatch.setattr(ortho, 'guardia_de_obra',
                        lambda _scope, _action: (jsonify({'error': 'sin sesión'}), 401)
                        if g.current_user['role'] == 'none' else None)
    app = Flask(__name__)
    app.register_blueprint(ortho.orthophoto_bp)

    @app.before_request
    def user():
        g.current_user = {'id': 7, 'role': __import__('flask').request.headers.get('X-Test-Role', 'reader')}

    client = app.test_client()
    reader = app.test_client()  # Segunda sesión: mismo estado publicado, sin rol admin.
    assert client.get('/api/orthophoto/1_CANAL').json == {'active': False, 'revision': None}
    assert post_photo(client, role='reader').status_code == 403
    assert client.get('/api/orthophoto/1_CANAL', headers={'X-Test-Role': 'none'}).status_code == 401
    assert client.get('/api/orthophoto/OTHER').status_code == 404
    assert post_photo(client, urn='urn:other').status_code == 422
    assert post_photo(client, north=b'no-es-jpeg').status_code == 422
    assert post_photo(client, relief='nan').status_code == 422
    assert post_photo(client, shade='1.5').status_code == 422

    first = post_photo(client)
    assert first.status_code == 201
    rev1 = first.json['revision']
    live = reader.get('/api/orthophoto/1_CANAL').json
    assert live['active'] and live['revision'] == rev1
    assert live['db_id'] == 42 and live['model_urn'] == 'urn:terrain'
    assert live['relief_blend'] == 0.4 and live['directional_shade'] == 0.7
    assert live['north_path'].endswith(f'/{rev1}/north')
    assert live['south_path'].endswith(f'/{rev1}/south')
    north = reader.get(live['north_path'])
    assert north.status_code == 200 and north.mimetype == 'image/jpeg'
    assert north.data == jpeg() and north.cache_control.no_store
    assert client.get(live['north_path'], headers={'X-Test-Role': 'none'}).status_code == 401
    assert client.get(live['north_path'].replace('1_CANAL', 'OTHER')).status_code == 404
    assert post_photo(client, expected='stale').status_code == 409

    bucket.fail_south = True
    assert post_photo(client, expected=rev1).status_code == 503
    assert client.get('/api/orthophoto/1_CANAL').json['revision'] == rev1
    bucket.fail_south = False
    second = post_photo(client, expected=rev1)
    assert second.status_code == 201
    rev2 = second.json['revision']
    assert rev1 != rev2
    assert reader.get('/api/orthophoto/1_CANAL').json['revision'] == rev2
    assert client.get(live['north_path']).status_code == 404
    assert client.get(f'/api/orthophoto/1_CANAL/tiles/{rev2}/north').status_code == 200
    assert client.post('/api/orthophoto/1_CANAL/deactivate',
                       json={'expected_revision': rev1},
                       headers={'X-Test-Role': 'admin'}).status_code == 409
    assert client.post('/api/orthophoto/1_CANAL/deactivate',
                       json={'expected_revision': rev2},
                       headers={'X-Test-Role': 'reader'}).status_code == 403
    removed = client.post('/api/orthophoto/1_CANAL/deactivate',
                          json={'expected_revision': rev2},
                          headers={'X-Test-Role': 'admin'})
    assert removed.status_code == 200
    assert client.get('/api/orthophoto/1_CANAL').json['active'] is False
    assert client.get(f'/api/orthophoto/1_CANAL/tiles/{rev2}/north').status_code == 404
    assert sum('/versions/' in key and key.endswith('.jpg') for key in bucket.blobs) >= 4
    pointer = json.loads(bucket.get_blob('ortho-fronts/v1/1_CANAL/active.json').data)
    assert pointer['active'] is False
