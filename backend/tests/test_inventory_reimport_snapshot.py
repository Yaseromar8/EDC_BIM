"""Reimportar la misma version no reextrae ni reescribe un snapshot inmutable."""

import os
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from flask import Flask

os.environ.setdefault('APP_SECRET', 'x' * 32)

SCOPE = '1_CANAL'
URN = 'urn:adsk.wipprod:fs.file:vf.CanalEnsayo?version=66'


class Connection:
    autocommit = False

    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


@contextmanager
def connection_for(conn):
    yield conn


def test_reactivacion_exacta_preserva_snapshot_y_avanza_generacion(monkeypatch):
    from inventory_identity import InventoryIdentityRepository, source_identity

    normalized, lineage = source_identity(URN)
    conn = Connection()
    statements = []

    class Cursor:
        result = None

        def execute(self, query, params=None):
            sql = str(query)
            statements.append((sql, params))
            if 'SELECT active_urn,generation' in sql:
                self.result = (None, 5)
            elif 'SELECT row_count,read_visible' in sql:
                self.result = (2956, True)
            else:
                self.result = None

        def fetchone(self):
            return self.result

    @contextmanager
    def atomic():
        yield Cursor()

    repo = InventoryIdentityRepository(conn)
    monkeypatch.setattr(repo, '_atomic', atomic)
    monkeypatch.setattr(repo, '_lock_scopes', lambda *_: None)
    result = repo.reactivate_existing_snapshot(
        SCOPE, URN, expected_active_urn=None, expected_generation=5,
        allowed_scopes=[SCOPE])

    assert result['row_count'] == 2956
    assert result['generation'] == 6
    assert result['source_urn'] == normalized
    assert result['source_lineage'] == lineage
    assert any(params == (SCOPE, lineage, normalized) for sql, params in statements
               if 'SELECT row_count,read_visible' in sql)
    assert len([sql for sql, _ in statements if sql.startswith('UPDATE')]) == 1
    assert not any('UPDATE inventory_identity_b1.snapshots' in sql for sql, _ in statements)
    assert not any('DELETE' in sql or 'inventory_assets' in sql for sql, _ in statements)


@pytest.mark.parametrize('snapshot, error_code', [
    (None, None),
    ((2956, False), 'SNAPSHOT_NOT_VISIBLE'),
])
def test_sin_snapshot_visible_no_se_inventa_reuso(monkeypatch, snapshot, error_code):
    from inventory_identity import IdentityError, InventoryIdentityRepository

    statements = []

    class Cursor:
        result = None

        def execute(self, query, _params=None):
            sql = str(query)
            statements.append(sql)
            self.result = snapshot if 'SELECT row_count,read_visible' in sql else (None, 5)

        def fetchone(self):
            return self.result

    @contextmanager
    def atomic():
        yield Cursor()

    repo = InventoryIdentityRepository(Connection())
    monkeypatch.setattr(repo, '_atomic', atomic)
    monkeypatch.setattr(repo, '_lock_scopes', lambda *_: None)
    def reactivate():
        return repo.reactivate_existing_snapshot(
            SCOPE, URN, expected_active_urn=None, expected_generation=5,
            allowed_scopes=[SCOPE])

    if error_code:
        with pytest.raises(IdentityError) as error:
            reactivate()
        assert error.value.code == error_code
    else:
        assert reactivate() is None
    assert not any(sql.startswith('UPDATE') for sql in statements)


@pytest.mark.parametrize('source, expected', [
    ((None, 6), 'STALE_GENERATION'),
    (('different', 5), 'STALE_ACTIVE_URN'),
])
def test_reactivacion_no_pisa_cambios_concurrentes(monkeypatch, source, expected):
    from inventory_identity import IdentityError, InventoryIdentityRepository

    class Cursor:
        def execute(self, *_):
            pass

        def fetchone(self):
            return source

    @contextmanager
    def atomic():
        yield Cursor()

    repo = InventoryIdentityRepository(Connection())
    monkeypatch.setattr(repo, '_atomic', atomic)
    monkeypatch.setattr(repo, '_lock_scopes', lambda *_: None)
    with pytest.raises(IdentityError) as error:
        repo.reactivate_existing_snapshot(
            SCOPE, URN, expected_active_urn=None, expected_generation=5,
            allowed_scopes=[SCOPE])
    assert error.value.code == expected


def test_reactivacion_no_cruza_scope_sin_autorizacion():
    from inventory_identity import IdentityError, InventoryIdentityRepository

    repo = InventoryIdentityRepository(Connection())
    with pytest.raises(IdentityError) as error:
        repo.reactivate_existing_snapshot(
            SCOPE, URN, expected_active_urn=None, expected_generation=5,
            allowed_scopes=['1_DRENAJE'])
    assert error.value.code == 'FORBIDDEN_SCOPE'


def test_job_reusa_snapshot_sin_entrar_a_aps(monkeypatch):
    import db
    import inventory_identity
    from routes import inventory

    conn = Connection()
    jobs = []
    calls = []

    class Repo:
        def __init__(self, received_conn):
            assert received_conn is conn

        def active_snapshot(self, *args, **kwargs):
            calls.append('active')
            return {'active_urn': None, 'generation': 5}

        def reactivate_existing_snapshot(self, *args, **kwargs):
            calls.append('reuse')
            assert kwargs['expected_generation'] == 5
            return {'row_count': 2956}

    monkeypatch.setattr(db, 'get_db_connection', lambda: connection_for(conn))
    monkeypatch.setattr(inventory_identity, 'InventoryIdentityRepository', Repo)
    monkeypatch.setattr(inventory, '_extraction_source_context', lambda *_a, **_k: {
        'source_urn': inventory_identity.source_identity(URN)[0],
        'linked_in_scope': False,
    })
    monkeypatch.setattr(inventory, 'set_job', lambda _id, data: jobs.append(data))
    monkeypatch.setattr(inventory, 'get_internal_token', lambda: pytest.fail('APS no debe ejecutarse'))

    inventory.extract_metadata_task(URN, SCOPE, 'reimport-test', reuse_existing_snapshot=True)

    assert calls == ['active', 'reuse']
    assert conn.commits == 1
    assert jobs[-1]['status'] == 'success'
    assert jobs[-1]['reused_snapshot'] is True


def test_version_sin_snapshot_conserva_camino_de_extraccion_aps(monkeypatch):
    import db
    import inventory_identity
    from routes import inventory

    conn = Connection()
    calls = []
    jobs = []

    class Repo:
        def __init__(self, received_conn):
            assert received_conn is conn

        def active_snapshot(self, *_args, **_kwargs):
            return {'active_urn': None, 'generation': 0}

        def reactivate_existing_snapshot(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(db, 'get_db_connection', lambda: connection_for(conn))
    monkeypatch.setattr(inventory_identity, 'InventoryIdentityRepository', Repo)
    monkeypatch.setattr(inventory, '_extraction_source_context', lambda *_a, **_k: {
        'source_urn': inventory_identity.source_identity(URN)[0],
        'source_lineage': inventory_identity.source_identity(URN)[1],
        'project_id': '1', 'linked_in_scope': False,
    })
    monkeypatch.setattr(inventory, 'set_job', lambda _id, data: jobs.append(data))
    monkeypatch.setattr(inventory, 'get_internal_token',
                        lambda: calls.append('aps-token') or (None, 'ensayo sin red'))

    inventory.extract_metadata_task(URN, SCOPE, 'new-version-test', reuse_existing_snapshot=True)

    assert calls == ['aps-token']
    assert jobs[-1]['status'] == 'error'
    assert 'ensayo sin red' in jobs[-1]['message']


def test_ruta_solo_pide_reuso_para_import_normal_y_expone_estado(monkeypatch):
    import db
    import inventory_http
    from routes import inventory

    conn = Connection()
    threads = []

    class Thread:
        def __init__(self, **kwargs):
            threads.append(kwargs)

        def start(self):
            pass

    monkeypatch.setattr(db, 'get_db_connection', lambda: connection_for(conn))
    monkeypatch.setattr(inventory_http, 'authorize_scope', lambda *_a, **_k: None)
    monkeypatch.setattr(inventory, '_extraction_source_context', lambda *_a, **_k: {
        'source_urn': URN,
        'project_id': '1',
        'linked_in_scope': False,
    })
    monkeypatch.setattr(inventory, 'threading', SimpleNamespace(Thread=Thread))
    monkeypatch.setattr(inventory, 'set_job', lambda *_a: None)
    app = Flask(__name__)
    with app.test_request_context('/api/inventory/extract', method='POST', json={
        'urn': URN, 'target_urn': SCOPE, 'reuse_existing_snapshot': True,
    }):
        response, status = inventory.start_extraction()
    assert status == 202, response.get_json()
    assert threads[0]['kwargs']['reuse_existing_snapshot'] is True

    monkeypatch.setattr(inventory, 'get_job', lambda _id: {
        'status': 'success', 'progress': 100, 'message': 'reusado',
        'reused_snapshot': True,
    })
    with app.test_request_context('/api/inventory/extract/status/reimport-test'):
        assert inventory.get_extraction_status('reimport-test').get_json()['reused_snapshot'] is True


def test_ruta_rechaza_reimportar_si_sigue_vinculado(monkeypatch):
    import db
    import inventory_http
    from routes import inventory

    monkeypatch.setattr(db, 'get_db_connection', lambda: connection_for(Connection()))
    monkeypatch.setattr(inventory_http, 'authorize_scope', lambda *_a, **_k: None)
    monkeypatch.setattr(inventory, '_extraction_source_context', lambda *_a, **_k: {
        'source_urn': URN, 'project_id': '1', 'linked_in_scope': True,
    })
    app = Flask(__name__)
    with app.test_request_context('/api/inventory/extract', method='POST', json={
        'urn': URN, 'target_urn': SCOPE, 'reuse_existing_snapshot': True,
    }):
        response, status = inventory.start_extraction()
    assert status == 409
    assert response.get_json()['code'] == 'MODEL_ALREADY_LINKED'
