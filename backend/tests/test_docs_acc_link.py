"""El enlace Docs -> ACC usa una versión concreta sin copiar ni traducir DWG."""
import base64

import pytest
from flask import Flask, g, jsonify

import routes.docs_cad as cad


@pytest.fixture
def cliente(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(cad.docs_cad_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'role': 'admin'}))
    node = {'id': 'doc-1', 'v_id': 'version-docs-1', 'name': 'ALINEAMIENTOS.dwg',
            'model_urn': 'obra-1', 'gcs_urn': 'gcs://original-1', 'meta': {}}
    writes = []
    calls = []
    monkeypatch.setattr(cad, '_cargar', lambda node_id, version_id=None: node if node_id == node['id'] else None)
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _: None)

    def save(_, link):
        writes.append(link)
        if link is None:
            node['meta'].pop('acc_link', None)
        else:
            node['meta']['acc_link'] = link

    def get(path):
        calls.append(path)
        return {'data': [{'id': 'urn:adsk.wipprod:fs.file:v1', 'type': 'versions',
                          'attributes': {'name': 'ALINEAMIENTOS.dwg', 'versionNumber': 1}}]}, None

    monkeypatch.setattr(cad, '_guardar_acc_link', save)
    monkeypatch.setattr(cad, '_acc_get', get)
    return app.test_client(), node, writes, calls


def _payload(**overrides):
    return {'node_id': 'doc-1', 'version_id': 'version-docs-1',
            'project_id': 'b.proyecto', 'item_id': 'urn:adsk.wipprod:dm.lineage:abc',
            'acc_version_id': 'urn:adsk.wipprod:fs.file:v1', **overrides}


def test_vinculo_persistente_y_urn_exacta(cliente):
    client, node, writes, calls = cliente
    response = client.post('/api/docs/cad/acc-link', json=_payload())
    assert response.status_code == 200
    link = response.json['link']
    assert link['gcs_urn'] == node['gcs_urn']
    assert base64.urlsafe_b64decode(link['viewer_urn'] + '==').decode() == link['version_id']
    assert calls == ['data/v1/projects/b.proyecto/items/urn%3Aadsk.wipprod%3Adm.lineage%3Aabc/versions']
    assert len(writes) == 1
    assert client.get('/api/docs/cad/acc-link?node_id=doc-1').json['link'] == link
    node['gcs_urn'] = 'gcs://otra-version'
    assert client.get('/api/docs/cad/acc-link?node_id=doc-1').json['link'] is None


def test_no_acepta_version_ajena_ni_nombre_distinto(cliente, monkeypatch):
    client, _, writes, _ = cliente
    response = client.post('/api/docs/cad/acc-link', json=_payload(acc_version_id='otro'))
    assert response.status_code == 400
    monkeypatch.setattr(cad, '_acc_get', lambda _: ({'data': [{
        'id': _payload()['acc_version_id'], 'attributes': {'name': 'OTRO.dwg'}}]}, None))
    response = client.post('/api/docs/cad/acc-link', json=_payload())
    assert response.status_code == 400
    assert writes == []


def test_no_admin_no_navega_ni_vincula(cliente, monkeypatch):
    client, _, writes, _ = cliente
    monkeypatch.setattr(cad, '_acc_admin_guard', lambda _: (jsonify(error='prohibido'), 403))
    assert client.get('/api/docs/cad/acc-browse?node_id=doc-1&level=hubs').status_code == 403
    assert client.post('/api/docs/cad/acc-link', json=_payload()).status_code == 403
    assert writes == []


def test_lector_abre_vinculo_sin_navegar_acc(cliente, monkeypatch):
    client, _, writes, calls = cliente
    linked = client.post('/api/docs/cad/acc-link', json=_payload()).json['link']
    writes.clear()
    calls.clear()
    monkeypatch.setattr(cad, '_acc_admin_guard', lambda _: (jsonify(error='prohibido'), 403))

    response = client.get('/api/docs/cad/acc-link?node_id=doc-1&version_id=version-docs-1')
    assert response.status_code == 200
    assert response.json['link'] == linked
    assert response.json['link']['viewer_urn']
    assert calls == []  # Ni siquiera enumera carpetas de ACC.
    assert writes == []
    assert client.get('/api/docs/cad/acc-browse?node_id=doc-1&level=hubs').status_code == 403


def test_token_acc_global_no_se_entrega_a_admin_de_una_sola_obra():
    app = Flask(__name__)
    with app.app_context():
        g.current_user = {'id': 8, 'role': 'member'}
        negative = cad._acc_admin_guard({'model_urn': 'obra-1'})
        assert negative[1] == 403
        g.current_user = {'id': 7, 'role': 'admin'}
        assert cad._acc_admin_guard({'model_urn': 'obra-1'}) is None


def test_retirar_enlace_no_borra_original(cliente):
    client, node, writes, _ = cliente
    client.post('/api/docs/cad/acc-link', json=_payload())
    assert client.delete('/api/docs/cad/acc-link', json={'node_id': 'doc-1'}).status_code == 200
    assert writes[-1] is None
    assert node['gcs_urn'] == 'gcs://original-1'


def test_paginacion_acc_no_acepta_otro_host_ni_ruta(cliente):
    client, _, _, calls = cliente
    base = '/api/docs/cad/acc-browse?node_id=doc-1&level=hubs'
    assert client.get(base + '&cursor=https%3A%2F%2Fevil.example%2Fproject%2Fv1%2Fhubs').status_code == 400
    assert client.get(base + '&cursor=https%3A%2F%2Fdeveloper.api.autodesk.com%2Fdata%2Fv1%2Fprojects').status_code == 400
    ok = client.get(base + '&cursor=https%3A%2F%2Fdeveloper.api.autodesk.com%2Fproject%2Fv1%2Fhubs%3Fpage%5Bnumber%5D%3D2')
    assert ok.status_code == 200
    assert calls == ['project/v1/hubs?page[number]=2']
