"""Ajustar relieve y sombreado de la ortofoto publicada sin volver a subir los JPG (20-oct-2026).

Usa los mismos dobles de GCS que test_ortofoto_semanal: sin red ni base.
"""
from flask import Flask, g, jsonify, request

from routes import orthophoto as ortho
from tests.test_ortofoto_semanal import Bucket, jpeg, post_photo


def _app(monkeypatch, bucket):
    monkeypatch.setattr(ortho, '_bucket', lambda: bucket)
    monkeypatch.setattr(ortho, '_EXPECTED_SIZE', (8, 12))
    monkeypatch.setattr(ortho, 'resolve_project_id', lambda scope: 'obra' if scope == '1_CANAL' else None)
    monkeypatch.setattr(ortho, '_source_belongs', lambda scope, urn: urn == 'urn:terrain')

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_a): pass
        def cursor(self): return self

    monkeypatch.setattr(ortho, 'get_db_connection', lambda: Connection())
    monkeypatch.setattr(ortho, 'es_admin_de_obra', lambda _c, user, _s: user['role'] == 'admin')
    monkeypatch.setattr(ortho, 'guardia_de_obra',
                        lambda _s, _a: (jsonify({'error': 'sin sesión'}), 401)
                        if g.current_user['role'] == 'none' else None)
    app = Flask(__name__)
    app.register_blueprint(ortho.orthophoto_bp)

    @app.before_request
    def usuario():
        g.current_user = {'id': 7, 'role': request.headers.get('X-Test-Role', 'reader')}

    return app.test_client()


def _ajustar(client, expected, relief='0.2', shade='0.9', role='admin'):
    return client.post('/api/orthophoto/1_CANAL/ajustes',
                       json={'expected_revision': expected, 'relief_blend': relief, 'directional_shade': shade},
                       headers={'X-Test-Role': role})


def test_ajustar_guarda_solo_los_valores_y_reutiliza_las_imagenes(monkeypatch):
    bucket = Bucket()
    client = _app(monkeypatch, bucket)
    rev1 = post_photo(client).json['revision']
    antes = client.get('/api/orthophoto/1_CANAL').json
    assert antes['imagenes_de'] == rev1

    r = _ajustar(client, rev1)
    assert r.status_code == 200, r.json
    rev2 = r.json['revision']
    vivo = client.get('/api/orthophoto/1_CANAL').json
    assert vivo['revision'] == rev2 != rev1
    assert vivo['relief_blend'] == 0.2 and vivo['directional_shade'] == 0.9
    assert vivo['imagenes_de'] == rev1                       # las mismas fotos: el visor no las vuelve a bajar
    assert vivo['published_at'] == antes['published_at'] and vivo['ajustado_en']
    assert vivo['model_urn'] == 'urn:terrain' and vivo['db_id'] == 42
    nueva = client.get(vivo['north_path'])
    assert nueva.status_code == 200 and nueva.data == jpeg()     # copiada a su propia revisión
    assert bucket.get_blob(f'ortho-fronts/v1/1_CANAL/versions/{rev1}/north.jpg') is not None   # historial intacto

    # Un segundo ajuste sigue apuntando a la publicación original de las imágenes
    rev3 = _ajustar(client, rev2, relief='0.5').json['revision']
    assert client.get('/api/orthophoto/1_CANAL').json['imagenes_de'] == rev1 and rev3 != rev2


def test_ajustar_exige_admin_revision_vigente_y_valores_validos(monkeypatch):
    bucket = Bucket()
    client = _app(monkeypatch, bucket)
    assert _ajustar(client, '').status_code == 409                       # no hay ortofoto publicada
    rev1 = post_photo(client).json['revision']
    assert _ajustar(client, rev1, role='reader').status_code == 403
    assert _ajustar(client, 'vieja').status_code == 409
    assert _ajustar(client, rev1, relief='0.9').status_code == 422       # fuera de 0–0,75
    assert _ajustar(client, rev1, shade='nan').status_code == 422
    assert client.get('/api/orthophoto/1_CANAL').json['revision'] == rev1   # nada cambió


def test_ajustar_una_ortofoto_retirada_no_la_reactiva(monkeypatch):
    bucket = Bucket()
    client = _app(monkeypatch, bucket)
    rev1 = post_photo(client).json['revision']
    rev2 = client.post('/api/orthophoto/1_CANAL/deactivate', json={'expected_revision': rev1},
                       headers={'X-Test-Role': 'admin'}).json['revision']
    assert _ajustar(client, rev2).status_code == 409
    assert client.get('/api/orthophoto/1_CANAL').json['active'] is False
