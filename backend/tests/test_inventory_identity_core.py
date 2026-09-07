"""DB-free contract checks; SQL correctness is exercised by the disposable bank."""
import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

from inventory_identity import IdentityError, InventoryIdentityRepository, element_key, source_identity
from prototypes.inventory_identity_b1 import InventoryIdentityRepository as CandidateRepository


URN = 'urn:adsk.wipprod:fs.file:vf.Sample?version=1'


class Cursor:
    def __init__(self, connection):
        self.connection = connection
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def execute(self, statement, args=None):
        self.connection.statements.append((str(statement), args))
    def fetchone(self):
        return self.connection.responses.pop(0)


class Connection:
    def __init__(self, responses=(), autocommit=False, status=1):
        self.responses = list(responses)
        self.autocommit = autocommit
        self.status = status
        self.statements = []
        self.rollbacks = 0
    def cursor(self, **kwargs):
        return Cursor(self)
    def rollback(self):
        self.rollbacks += 1
        self.status = 1


def test_operational_promotion_disabled_even_with_boolean_coverage():
    conn = Connection()
    with pytest.raises(IdentityError, match='Verified coverage') as error:
        InventoryIdentityRepository(conn).migrate_legacy_user(
            {'external_id': 'x'}, coverage_complete=True, allowed_scopes=['scope'])
    assert error.value.code == 'NO_PROMOTION'
    assert conn.statements == []


def test_fixture_promotion_cannot_be_called_on_non_disposable_database():
    conn = Connection([('live_db',)])
    with pytest.raises(IdentityError) as error:
        InventoryIdentityRepository(conn)._migrate_legacy_user_for_fixture(
            {'external_id': 'x'}, coverage_complete=True, allowed_scopes=['scope'])
    assert error.value.code == 'UNSAFE_DATABASE'
    assert len(conn.statements) == 1


def test_candidate_inherits_the_one_core_and_retains_database_guard():
    assert issubclass(CandidateRepository, InventoryIdentityRepository)
    conn = Connection([('live_db',)])
    with pytest.raises(IdentityError) as error:
        CandidateRepository(conn)
    assert error.value.code == 'UNSAFE_DATABASE'


def test_transaction_is_required():
    with pytest.raises(IdentityError) as error:
        InventoryIdentityRepository(Connection(autocommit=True))
    assert error.value.code == 'TRANSACTION_REQUIRED'


@pytest.mark.parametrize('generation', [-1, True, None, '0', 0.0])
def test_publication_rejects_invalid_generation_without_writes(generation):
    conn = Connection()
    with pytest.raises(IdentityError) as error:
        InventoryIdentityRepository(conn).publish_snapshot('scope', URN, [],
            expected_active_urn=None, expected_generation=generation, allowed_scopes=['scope'])
    assert error.value.code == 'INVALID_GENERATION'
    assert conn.statements == []


def test_cleanup_cannot_target_an_ordinary_scope():
    conn = Connection()
    with pytest.raises(IdentityError) as error:
        InventoryIdentityRepository(conn).clear_temporary_snapshots('scope')
    assert error.value.code == 'NOT_TEMPORARY_SCOPE'
    assert conn.statements == []


def test_lineage_is_stable_but_external_id_is_not_rewritten():
    assert source_identity(URN)[1] == source_identity(URN.replace('version=1', 'version=2'))[1]
    assert element_key('front', 'lineage', 'IFC/Wall:1') == '["front","lineage","IFC/Wall:1"]'


def load_pool_hook():
    # Execute only the real hook, not app initialization or any connection factory.
    source = Path(__file__).resolve().parents[1] / 'db.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_configure_inventory_path')
    namespace = {'psycopg2': SimpleNamespace(extensions=SimpleNamespace(STATUS_READY=1))}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
    return namespace['_configure_inventory_path']


def test_pool_runtime_path_is_session_scoped_and_preserves_autocommit():
    conn = Connection([('ecd_app',), (True, True), (True,)])
    load_pool_hook()(conn)
    assert conn.autocommit is False
    assert any('SET SESSION search_path TO pg_catalog,inventory_identity_b1,public,pg_temp' in statement for statement, _ in conn.statements)
    assert not any('CREATE ' in statement or 'ALTER ' in statement for statement, _ in conn.statements)


def test_pool_migrator_keeps_public_without_requiring_migration_31():
    conn = Connection([('ecd_migrator',)])
    load_pool_hook()(conn)
    assert conn.statements[-1][0] == 'SET SESSION search_path TO public,pg_catalog,pg_temp'
    assert conn.autocommit is False


@pytest.mark.parametrize('catalog', [(None, False), (False, True), (True, False)])
def test_pool_does_not_fall_back_to_public_when_canonical_view_is_absent(catalog):
    conn = Connection([('ecd_app',), catalog])
    with pytest.raises(RuntimeError, match='migration 31'):
        load_pool_hook()(conn)
    assert conn.autocommit is False


def test_pool_missing_select_grant_is_explicit_error():
    conn = Connection([('ecd_app',), (True, True), (False,)])
    with pytest.raises(RuntimeError, match='grant missing'):
        load_pool_hook()(conn)
    assert conn.autocommit is False
