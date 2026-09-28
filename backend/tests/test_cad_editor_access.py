"""El editor abre un CAD vinculado sin saltarse el perímetro ni la carpeta."""
import contextlib
import importlib

import pytest
from flask import Flask, jsonify


OBRA = 'obra-cad-editor'
NODO = '00000000-0000-4000-8000-00000000cad1'
MARCA = '00000000-0000-4000-8000-00000000cad2'


@contextlib.contextmanager
def _conexion():
    class Conexion:
        def cursor(self):
            return object()
    yield Conexion()


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')

    import auth_middleware as auth
    importlib.reload(auth)
    import db
    import perimetro_de_obra as perimetro
    import routes.docs_cad as cad
    import acc_emergency_bridge as bridge

    estado = {'miembro': True, 'carpeta': True}
    monkeypatch.setattr(auth, 'validate_session',
                        lambda _token: {'id': 7, 'role': 'editor', 'email': 'editor@obra.test'})
    monkeypatch.setattr(auth, '_user_in_project',
                        lambda _uid, obra: estado['miembro'] and obra == OBRA)
    monkeypatch.setattr(auth, 'ENFORCE_PROJECT_AUTHZ', True)
    monkeypatch.setattr(db, 'get_db_connection', _conexion)
    monkeypatch.setattr(perimetro, 'obra_del_recurso',
                        lambda _cur, tabla, valor: OBRA if
                        (tabla, str(valor)) in {('file_nodes', NODO),
                                                ('cad_review_marks', MARCA)} else None)
    node = {'id': NODO, 'v_id': None, 'name': 'PLANO.dwg',
            'model_urn': OBRA, 'gcs_urn': 'gcs://plano', 'meta': {}}
    monkeypatch.setattr(cad, '_cargar',
                        lambda node_id, version_id=None: node if node_id == NODO else None)
    monkeypatch.setattr(cad, '_guardia_del_plano',
                        lambda _node: None if estado['carpeta'] else
                        (jsonify(code='SIN_PERMISO_DOCUMENTAL'), 403))
    monkeypatch.setattr(bridge, 'status_and_link', lambda _node: (None, None))

    app = Flask(__name__)
    auth.init_auth_middleware(app)
    app.register_blueprint(cad.docs_cad_bp)
    client = app.test_client()
    client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion-de-prueba'
    return client, estado, perimetro


def test_editor_puede_consultar_vinculo_de_su_plano(entorno):
    client, _, _ = entorno
    response = client.get(f'/api/docs/cad/acc-link?node_id={NODO}')
    assert response.status_code == 200
    assert response.get_json()['success'] is True


def test_obras_y_carpetas_ajenas_siguen_cerradas(entorno):
    client, estado, _ = entorno
    estado['miembro'] = False
    response = client.get(f'/api/docs/cad/acc-link?node_id={NODO}')
    assert response.status_code == 403
    assert response.get_json()['code'] == 'PROJECT_FORBIDDEN'

    estado['miembro'] = True
    estado['carpeta'] = False
    response = client.get(f'/api/docs/cad/acc-link?node_id={NODO}')
    assert response.status_code == 403
    assert response.get_json()['code'] == 'SIN_PERMISO_DOCUMENTAL'

    response = client.get('/api/docs/cad/acc-link?node_id=otro')
    assert response.status_code == 403
    assert response.get_json()['code'] == 'PROJECT_UNRESOLVED'


def test_revision_cad_resuelve_obra_del_nodo_o_marca(entorno):
    _, _, perimetro = entorno
    assert perimetro.RUTAS_POR_QUERY['list_marks'] == ('file_nodes', 'node_id')
    assert perimetro.RUTAS_POR_CUERPO['create_mark'] == ('file_nodes', 'node_id')
    for name in ('edit_mark', 'publish_mark', 'delete_mark',
                 'add_document_attachment', 'upload_photo',
                 'delete_attachment', 'read_photo'):
        assert perimetro.RUTAS_POR_RECURSO[name] == ('cad_review_marks', 'mark_id')
        assert perimetro.obra_de_la_peticion('cad_review_bp.' + name,
                                            {'mark_id': MARCA}) == OBRA


def test_resolucion_de_marca_consulta_el_documento_sin_abrir_otras_obras(monkeypatch):
    import db
    import perimetro_de_obra as perimetro

    class Cursor:
        def __init__(self, row):
            self.row = row
            self.sql = ''
            self.params = None

        def execute(self, sql, params):
            self.sql, self.params = sql, params

        def fetchone(self):
            return self.row

    monkeypatch.setattr(db, 'resolve_project_id', lambda value: OBRA if value == OBRA else None)
    cursor = Cursor((OBRA,))
    assert perimetro.obra_del_recurso(cursor, 'cad_review_marks', MARCA) == OBRA
    assert 'JOIN file_nodes n ON n.id = m.file_node_id' in cursor.sql
    assert 'm.deleted_at IS NULL' in cursor.sql
    assert 'NOT n.is_deleted' in cursor.sql
    assert cursor.params == (MARCA,)
    assert perimetro.obra_del_recurso(Cursor(None), 'cad_review_marks', MARCA) is None
