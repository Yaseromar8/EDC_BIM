"""Las entregas apuntan a la VERSIÓN, no al documento.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
Revisiones, Transmittals y Conjuntos guardaban el NÚMERO de la versión ("3") y
abrían por node_id, o sea el contenido de hoy. Los tres enseñaban «V3» y ninguno
podía demostrar qué había en esa V3. Conjuntos era el más descarado: pintaba
«V3 congelada» al lado de cada documento y, en cuanto alguien subía una revisión,
esa misma entrega servía otra cosa con el cartel puesto.

Un solo defecto de diseño repetido tres veces. Lo que hacía falta ya existía:
file_versions tiene su gcs_urn por versión y file_nodes.current_version_id apunta
a la vigente. Estaba a una columna de distancia.

Y de ahí sale el caso peor de todos, el de revisiones: se aprobaba el node_id a
secas, así que se sellaba «apto para construcción» sobre lo que hubiera subido en
ese momento -que podía no ser lo que nadie miró.
"""
import importlib
import json

import pytest
from flask import Flask, g


OBRA = 'urn:obra:PQT8'
DOC = '11111111-1111-1111-1111-111111111111'
V_REVISADA = 'aaaa-vieja'
V_NUEVA = 'bbbb-nueva'


# ── El blob de una versión concreta ─────────────────────────────────────────

@pytest.fixture
def docs(monkeypatch):
    import routes.documents as rd

    class Cursor:
        def __init__(self):
            self._u = None

        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            if 'FROM FILE_VERSIONS V JOIN FILE_NODES N' in s:
                self._u = ('gcs/blob-de-la-v2', DOC) if params[0] == V_REVISADA else None
            elif s.startswith('SELECT GCS_URN FROM FILE_NODES'):
                self._u = ('gcs/blob-vivo',)
            else:
                self._u = None

        def fetchone(self):
            return self._u

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    return rd


def test_una_version_concreta_devuelve_SU_blob_no_el_vivo(docs):
    """Es la pieza entera: sin esto, «congelada» no puede significar nada."""
    urn, node = docs._blob_de_la_version(V_REVISADA)
    assert urn == 'gcs/blob-de-la-v2'
    assert node == DOC


def test_una_version_que_no_existe_no_devuelve_nada(docs):
    assert docs._blob_de_la_version('no-existe') == (None, None)


def test_sin_version_no_se_consulta_nada(docs):
    assert docs._blob_de_la_version('') == (None, None)
    assert docs._blob_de_la_version(None) == (None, None)


# ── Conjuntos: guardar la referencia y no prometer de más ───────────────────

@pytest.fixture
def sets_app(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.sets as rs
    importlib.reload(rs)

    puesto = []
    filas = {7: [('n1', 'PLANO-01.pdf', 3, None, V_REVISADA, 'Ana'),
                 ('n2', 'PLANO-02.pdf', 1, None, None, None)]}

    class Cursor:
        def __init__(self):
            self._u, self._all = None, []

        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            if s.startswith('SELECT MODEL_URN FROM DOC_SETS'):
                self._u = (OBRA,) if params[0] in filas else None
            elif s.startswith('SELECT NODE_ID, NAME, VERSION_NUMBER'):
                self._all = filas.get(params[0], [])
            elif s.startswith('INSERT INTO DOC_SET_ITEMS'):
                puesto.append(params)
            else:
                self._u = None

        def fetchone(self): return self._u
        def fetchall(self): return self._all

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(rs, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(rs, 'log_activity', lambda *a, **k: None)
    import routes.documents as rd
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: True)

    app = Flask(__name__)
    app.register_blueprint(rs.sets_bp)

    @app.before_request
    def _s():
        g.current_user = {'id': 1, 'role': 'admin', 'email': 'ana@obra.pe', 'name': 'Ana'}

    return app.test_client(), puesto


def test_al_anadir_a_un_conjunto_se_guarda_la_version_no_solo_su_numero(sets_app):
    cli, puesto = sets_app
    r = cli.post('/api/sets/7/items', json={'items': [
        {'node_id': 'n1', 'name': 'PLANO-01.pdf', 'version': 3, 'version_id': V_REVISADA}]})
    assert r.status_code == 200
    assert V_REVISADA in puesto[0]


def test_la_respuesta_dice_cuantos_quedaron_de_verdad_congelados(sets_app):
    cli, _p = sets_app
    d = cli.post('/api/sets/7/items', json={'items': [
        {'node_id': 'n1', 'version_id': V_REVISADA},
        {'node_id': 'n2'}]}).get_json()
    assert d['congelados'] == 1
    assert d['added'] == 2


def test_queda_registrado_quien_metio_el_documento(sets_app):
    """Sacar tres láminas de una entrega no dejaba ninguna huella."""
    cli, puesto = sets_app
    cli.post('/api/sets/7/items', json={'items': [{'node_id': 'n1', 'version_id': V_REVISADA}]})
    assert 'Ana' in puesto[0]


def test_el_listado_marca_cual_esta_congelado_y_cual_no(sets_app):
    """Lo añadido antes del arreglo no tiene referencia y no hay forma de
    adivinarla: se dice como es en vez de prometer un congelado falso."""
    cli, _p = sets_app
    items = cli.get('/api/sets/7/items').get_json()['items']
    assert items[0]['version_id'] == V_REVISADA and items[0]['congelado'] is True
    assert items[1]['version_id'] is None and items[1]['congelado'] is False


# ── Revisiones: no se aprueba una versión distinta de la que se revisó ──────

@pytest.fixture
def reviews_app(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.reviews as rv
    importlib.reload(rv)

    estado = {'version_viva': V_REVISADA}
    transicionado = []

    class Cursor:
        def __init__(self):
            self._u = None

        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            if s.startswith('SELECT ID, MODEL_URN, TITLE, ITEMS'):
                # La fila trae TODAS las columnas que la consulta pide, hasta
                # `contrato` (REVIEWS-R01). Sus pasos son legacy --solo correo y
                # nombre-- asi que el contrato que le corresponde es PRE: esta
                # revision cierra por posicion, como siempre.
                #
                # Y no vale dejarlo fuera: `/act` falla cerrado ante un contrato
                # que no reconoce, asi que un doble incompleto devolveria 409 y
                # esta prueba mediria eso en vez de la version.
                self._u = (
                    1, OBRA, 'Entrega 3',
                    [{'node_id': DOC, 'name': 'PLANO-01.pdf', 'version': 2,
                      'version_id': V_REVISADA}],
                    [{'email': 'ana@obra.pe', 'name': 'Ana'}], 0, 'pending',
                    'SHARED', [], 'Ana', None, 'S2', None,
                    None, None, None, None, 'PRE')
            elif s.startswith('SELECT CURRENT_VERSION_ID, NAME, VERSION_NUMBER'):
                self._u = (estado['version_viva'], 'PLANO-01.pdf', 4)
            else:
                self._u = None

        def fetchone(self): return self._u

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def rollback(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(rv, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(rv, 'log_activity', lambda *a, **k: None)
    import routes.documents as rd
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: True)
    import estados_ecd as ecd
    monkeypatch.setattr(ecd, 'transicionar_recorriendo',
                        lambda *a, **k: transicionado.append(a) or [])
    import folder_permissions as fp
    monkeypatch.setattr(fp, 'check_folder_permission', lambda *a, **k: None)

    app = Flask(__name__)
    app.register_blueprint(rv.reviews_bp)

    @app.before_request
    def _s():
        g.current_user = {'id': 1, 'role': 'admin', 'email': 'ana@obra.pe', 'name': 'Ana'}

    return app.test_client(), estado, transicionado


def test_aprobar_lo_que_se_reviso_funciona(reviews_app):
    cli, _e, transicionado = reviews_app
    r = cli.post('/api/reviews/1/act', json={'action': 'approve'})
    assert r.status_code == 200
    assert transicionado


def test_NO_se_aprueba_si_alguien_subio_una_version_nueva_entre_medias(reviews_app):
    """Sellar «apto para construcción» sobre algo que nadie miró es el peor
    fallo posible de un flujo de revisión."""
    cli, estado, transicionado = reviews_app
    estado['version_viva'] = V_NUEVA
    r = cli.post('/api/reviews/1/act', json={'action': 'approve'})
    assert r.status_code == 409
    assert transicionado == []


def test_el_error_dice_QUE_cambio_y_que_hacer(reviews_app):
    cli, estado, _t = reviews_app
    estado['version_viva'] = V_NUEVA
    e = cli.post('/api/reviews/1/act', json={'action': 'approve'}).get_json()['error']
    assert 'PLANO-01.pdf' in e
    assert 'v4' in e
    assert 'revisión' in e.lower()


def test_rechazar_no_mira_la_version(reviews_app):
    """Rechazar no sella nada, así que da igual lo que haya subido."""
    cli, estado, _t = reviews_app
    estado['version_viva'] = V_NUEVA
    assert cli.post('/api/reviews/1/act', json={'action': 'reject'}).status_code == 200
