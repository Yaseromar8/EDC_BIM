"""El listado documental resuelve el admin con un cursor válido."""

import administracion_de_obra
import file_system_db
import folder_permissions
import permiso_documental


class _Cursor:
    def __init__(self):
        self.queries = []

    def execute(self, sql, params):
        self.queries.append((sql, params))

    def fetchall(self):
        return []


class _Connection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self._cursor


def test_admin_demo_no_se_une_a_user_id_entero(monkeypatch):
    cursor = _Cursor()
    monkeypatch.setattr(file_system_db, 'get_db_connection', lambda: _Connection(cursor))
    calls = []

    def admin(cur, user, scope):
        calls.append((cur, user, scope))
        return user['role'] == 'admin'

    monkeypatch.setattr(administracion_de_obra, 'es_admin_de_obra', admin)

    result = file_system_db.list_contents(None, 'proyecto-ensayo',
                                          user={'id': 'demo', 'role': 'admin'})

    assert result == {'folders': [], 'files': []}
    assert calls == [(cursor, {'id': 'demo', 'role': 'admin'}, 'proyecto-ensayo')]
    assert len(cursor.queries) == 1
    assert 'JOIN folder_permissions' not in cursor.queries[0][0]
    assert cursor.queries[0][1] == ('proyecto-ensayo',)


def test_usuario_comun_conserva_join_de_permisos(monkeypatch):
    cursor = _Cursor()
    monkeypatch.setattr(file_system_db, 'get_db_connection', lambda: _Connection(cursor))
    monkeypatch.setattr(administracion_de_obra, 'es_admin_de_obra',
                        lambda cur, user, scope: False)
    monkeypatch.setattr(folder_permissions, 'get_effective_permission',
                        lambda *args, **kwargs: 'none')
    monkeypatch.setattr(permiso_documental, 'contexto_de_permisos',
                        lambda *args, **kwargs: None)

    result = file_system_db.list_contents(None, 'proyecto-ensayo',
                                          user={'id': 42, 'role': 'viewer'})

    assert result == {'folders': [], 'files': []}
    assert len(cursor.queries) == 1
    assert 'JOIN folder_permissions' in cursor.queries[0][0]
    assert cursor.queries[0][1] == (42, 'proyecto-ensayo')
