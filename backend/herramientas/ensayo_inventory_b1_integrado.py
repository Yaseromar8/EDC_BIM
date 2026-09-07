#!/usr/bin/env python
"""B1 integrado: SQL, rutas Inventory y middleware REALES, PG18 NUEVO.

No importa server.py (lee .env): compila por AST sus wrappers Flask reales.
db/auth/perimetro/inventory_http/inventory_identity y routes.inventory si son
modulos reales. Solo el transporte externo APS se sustituye por datos sinteticos.
Ninguna conexion, esquema o backup preexistente. ecd_migrator hace el DDL local;
ecd_app ejecuta publicaciones/rutas. Emite JSON, no escribe evidencia ni hace
commits. Conserva el cluster DETENIDO; no ejecuta el bootstrap completo.
"""
import argparse
import ast
import base64
from contextlib import contextmanager, redirect_stdout, redirect_stderr
from datetime import datetime, timezone
import gzip
import hashlib
import importlib
import io
import json
import logging
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import types
import uuid

sys.dont_write_bytecode = True
import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = 'inventory_identity_b1'
DDL = ROOT / 'backend/sql/31_inventory_identity.sql'
CORE = ROOT / 'backend/inventory_identity.py'
HTTP = ROOT / 'backend/inventory_http.py'
ROUTES = ('get_inventory', 'get_inventory_version', 'update_inventory',
          'bulk_update_inventory', 'get_inventory_schema')


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def source(relative):
    return (ROOT / relative).read_text(encoding='utf-8-sig')


def only(values, label):
    check(len(values) == 1, 'Fuente ambigua o ausente: ' + label)
    return values[0]


def ddl_literal(relative, table, function=None):
    tree = ast.parse(source(relative))
    if function:
        tree = only([n for n in tree.body if isinstance(n, ast.FunctionDef)
                     and n.name == function], function)
    return only([n.value for n in ast.walk(tree)
                 if isinstance(n, ast.Constant) and isinstance(n.value, str)
                 and ('CREATE TABLE IF NOT EXISTS "' + table + '"' in n.value
                      or 'CREATE TABLE IF NOT EXISTS ' + table + ' (' in n.value)], table)


def version(document, number=1):
    raw = f'urn:adsk.wipprod:fs.file:vf.{document}?version={number}'
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')


def lineage(document):
    return 'urn:adsk.wipprod:dm.lineage:' + document


def identity(scope, document='B1DocumentA', external='shared'):
    return {'scope_id': scope, 'source_lineage': lineage(document), 'external_id': external}


def native(external='shared', name='Synthetic element', state='Native', **kwargs):
    return {'external_id': external, 'name': name, 'properties': {'G1': {'Estado': state}},
            'material': 'Native material', 'installation_status': state,
            'vaciado_nro': 'Native pour', **kwargs}


def load_server_routes(app):
    from flask import g, jsonify, request, Response, stream_with_context
    tree = ast.parse(source('backend/server.py'))
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ROUTES]
    check({n.name for n in selected} == set(ROUTES), 'Faltan wrappers Inventory reales')
    for node in selected:
        check(any(isinstance(n, ast.ImportFrom) and n.module == 'inventory_http'
                  for n in ast.walk(node)), 'Wrapper no integrado aun: ' + node.name)
    namespace = {'__name__': 'b1_server_routes_real', 'app': app, 'g': g,
                 'jsonify': jsonify, 'request': request, 'Response': Response,
                 'stream_with_context': stream_with_context}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(ROOT / 'backend/server.py'), 'exec'), namespace)
    return {node.name: hashlib.sha256(ast.get_source_segment(source('backend/server.py'), node).encode()).hexdigest()
            for node in selected}


class ApsResponse:
    status_code = 200
    ok = True
    def __init__(self, payload):
        self.payload = payload
        self.text = json.dumps(payload)
    def json(self):
        return json.loads(self.text)
    def raise_for_status(self):
        return None


class SyntheticAps:
    """Doble solo de transporte: el extractor/normalizador/SQL no se sustituyen."""
    def __init__(self, items, before_first_request=None):
        self.items = items
        self.before_first_request = before_first_request
        self.calls = 0
    def _before(self):
        self.calls += 1
        if self.before_first_request is not None:
            callback, self.before_first_request = self.before_first_request, None
            callback()
    def get(self, url, **kwargs):
        self._before()
        if url.endswith('/metadata'):
            return ApsResponse({'data': {'metadata': [{'guid': 'fixture-view', 'name': 'Synthetic 3D', 'role': '3d'}]}})
        if url.endswith('/metadata/fixture-view'):
            return ApsResponse({'data': {'objects': [{'objectid': i + 1, 'name': item['name']}
                                                    for i, item in enumerate(self.items)]}})
        if '/properties?' in url:
            return self._properties({})
        raise AssertionError('Peticion APS inesperada (no se permite red)')
    def _properties(self, payload):
        offset = payload.get('pagination', {}).get('offset', 0)
        limit = payload.get('pagination', {}).get('limit', 500)
        result = [{'objectid': i + 1, 'externalId': item['external_id'], 'name': item['name'],
                   'properties': {**item['properties'], 'Item': {'Category': 'Walls'}}}
                  for i, item in enumerate(self.items)]
        return ApsResponse({'data': {'collection': result[offset:offset + limit]}})
    def post(self, url, **kwargs):
        self._before()
        check(url.endswith('/properties:query'), 'POST APS inesperado')
        return self._properties(kwargs.get('json') or {})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', required=True)
    parser.add_argument('--confirm-disposable-only', action='store_true')
    args = parser.parse_args()
    if not args.confirm_disposable_only:
        parser.error('Requiere --confirm-disposable-only; no acepta DB existente.')
    pg_bin = Path(args.pg_bin).resolve()
    for executable in ('initdb.exe', 'pg_ctl.exe'):
        check((pg_bin / executable).is_file(), 'Falta binario PG18: ' + executable)
    for path in (DDL, CORE, HTTP):
        check(path.is_file(), 'Integracion no lista: ' + str(path.relative_to(ROOT)))
    for key in list(os.environ):
        if key.startswith(('PG', 'DB_')) or key in ('DATABASE_URL', 'SESSION_PEPPER', 'APP_SECRET'):
            del os.environ[key]
    os.environ.update(DDL_EN_CALIENTE='false', ALLOW_DEMO_TOKEN='false',
                      ENFORCE_PROJECT_AUTHZ='true', AUTH_POLICY_MODE='estricto', LOG_LEVEL='CRITICAL',
                      APP_SECRET=secrets.token_hex(32), SESSION_PEPPER=secrets.token_hex(32))
    fixture = Path(tempfile.mkdtemp(prefix='alephia_inventory_b1_integrado_')).resolve()
    data_dir = fixture / 'data'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    dbname = 'ecd_ensayo_inventory_integrado_' + uuid.uuid4().hex[:12]
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    paths = [DDL, CORE, HTTP, ROOT / 'backend/server.py', ROOT / 'backend/routes/inventory.py',
             ROOT / 'backend/db.py', ROOT / 'backend/auth_middleware.py']
    paths += [ROOT / 'backend/routes/digital_twin.py', ROOT / 'backend/bootstrap_esquema.py',
              ROOT / 'backend/sql/03_grants_ida.sql']
    fingerprints = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    report = {'verdict': 'NOT_RUN', 'createdAt': datetime.now(timezone.utc).isoformat(),
              'environment': {'newCluster': True, 'host': '127.0.0.1', 'port': port,
                              'database': dbname, 'clusterDirectory': str(data_dir)},
              'sourceFingerprints': fingerprints(), 'cases': [], 'clusterStopped': False,
              'limitations': ['Datos sinteticos; no produccion, backups, censo, APS real ni browser.',
                              'Wrappers server.py compilados por AST; no se importa su arranque ni .env.',
                              'Sesiones/membresia y SQL de identidad reales; no se simulan decisiones de permiso.',
                              'APS simulado; hilos se ejecutan sincronicamente y readiness de traduccion es sintetico.',
                              'Transformacion, publicacion, ACL, config, SQL y rutas son implementaciones reales.',
                              'No certifica bootstrap integral, 4D/5D ni comparacion frente-frente.']}

    def command(name, *argv):
        launching = name == 'pg_ctl.exe' and 'start' in argv
        outputs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL} if launching else {'capture_output': True}
        result = subprocess.run([str(pg_bin / name), *map(str, argv)], **outputs,
                                stdin=subprocess.DEVNULL, text=True, errors='replace',
                                timeout=55, creationflags=flags)
        check(result.returncode == 0, 'Comando PG local fallo: ' + name)

    raw_connect = psycopg2.connect
    def connect(user='ecd_app', database=dbname):
        return raw_connect(host='127.0.0.1', port=port, dbname=database, user=user, password='',
                           passfile=str(fixture / 'no-password-file'), connect_timeout=5,
                           application_name='inventory_b1_integrado')
    @contextmanager
    def transaction(user='ecd_app'):
        conn = connect(user)
        try:
            with conn:
                yield conn
        finally:
            conn.close()
    def query(statement, params=(), user='ecd_app'):
        with transaction(user) as conn:
            with conn.cursor() as cur:
                cur.execute(statement, params)
                return cur.fetchall() if cur.description else []
    def count(table, scope):
        return query(sql.SQL('SELECT COUNT(*) FROM {}.{} WHERE scope_id=%s').format(
            sql.Identifier(SCHEMA), sql.Identifier(table)), (scope,), 'ecd_migrator')[0][0]
    def case(name, operation):
        try:
            details = operation() or {}
            report['cases'].append({'case': name, 'status': 'PASS', **details})
        except Exception as exc:
            report['cases'].append({'case': name, 'status': 'FAIL',
                                    'error': type(exc).__name__ + ': ' + str(exc)[:1800]})

    started = False
    db_module = None
    captured = io.StringIO()
    try:
        command('initdb.exe', '-D', data_dir, '-U', 'ecd_migrator', '--auth=trust', '--encoding=UTF8', '--locale=C')
        started = True
        command('pg_ctl.exe', '-D', data_dir, '-l', fixture / 'postgres.log',
                '-o', '-h 127.0.0.1 -p ' + str(port), '-w', '-t', '30', 'start')
        admin = connect('ecd_migrator', 'postgres')
        try:
            admin.autocommit = True
            with admin.cursor() as cur:
                cur.execute("SELECT current_user,current_setting('data_directory'),host(inet_server_addr()),inet_server_port(),current_setting('server_version_num')")
                who, directory, host, actual_port, pg_version = cur.fetchone()
                check(who == 'ecd_migrator' and Path(directory).resolve() == data_dir
                      and host == '127.0.0.1' and actual_port == port and int(pg_version) // 10000 == 18,
                      'Identidad/cluster no coincide ANTES de DDL')
                report['environment']['serverVersionNum'] = pg_version
                cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(dbname)))
                cur.execute('CREATE ROLE ecd_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS')
        finally:
            admin.close()
        with transaction('ecd_migrator') as conn:
            with conn.cursor() as cur:
                for table in ('projects', 'users', 'project_users', 'sessions', 'inventory_assets'):
                    cur.execute(ddl_literal('backend/esquema_base.py', table))
                cur.execute(ddl_literal('backend/db.py', 'asset_user_data', 'ensure_asset_user_data_table'))
                cur.execute(ddl_literal('backend/routes/digital_twin.py', 'model_config', 'ensure_model_config_table'))
                cur.execute(ddl_literal('backend/routes/inventory.py', 'extraction_jobs', 'ensure_extraction_jobs_table'))
                tree = ast.parse(source('backend/referencias_de_obra.py'))
                assigned = only([n for n in tree.body if isinstance(n, ast.Assign)
                                 and any(isinstance(t, ast.Name) and t.id == '_TABLA' for t in n.targets)], 'project_ref DDL')
                cur.execute(ast.literal_eval(assigned.value))
                cur.execute('ALTER TABLE users ADD COLUMN activated_at TIMESTAMPTZ')
                cur.execute('ALTER TABLE project_users ADD COLUMN es_admin BOOLEAN DEFAULT false')
                cur.execute('ALTER TABLE asset_user_data ADD COLUMN project_id TEXT')
                cur.execute('ALTER TABLE model_config ADD COLUMN default_view_guid TEXT')
                cur.execute('ALTER TABLE extraction_jobs ADD COLUMN model_urn TEXT')
                # Signature-only dependencies of the REAL 03 grant script.
                # Their document/audit behaviour is outside this bank.
                cur.execute('CREATE SCHEMA ai_brain')
                cur.execute('CREATE TABLE activity_log(id INTEGER)')
                cur.execute('CREATE TABLE auth_events(id INTEGER)')
                cur.execute("CREATE FUNCTION resolve_folder_path(text,varchar,varchar,boolean) RETURNS text LANGUAGE sql AS 'SELECT NULL::text'")
                cur.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
                cur.execute(sql.SQL('REVOKE CREATE,TEMPORARY ON DATABASE {} FROM PUBLIC').format(sql.Identifier(dbname)))
                cur.execute('GRANT USAGE ON SCHEMA public TO ecd_app')
                cur.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ecd_app')
                cur.execute('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ecd_app')
                cur.execute("INSERT INTO projects(id,name) VALUES ('B1A','Synthetic A'),('B1B','Synthetic B')")
                for project in ('B1A', 'B1B'):
                    cur.execute("INSERT INTO project_ref(alias,kind,project_id,es_escritura,origen) VALUES (%s,'PROJECT',%s,true,'fixture')", (project, project))
                cur.execute("INSERT INTO asset_user_data(external_id,status,extras,project_id) VALUES ('legacy-only','Legacy must remain unassigned','{}','B1A')")
                cur.execute(DDL.read_text(encoding='utf-8-sig'))

        # Solo parametros de destino NUEVO; el guard driver cubre tambien el pool real.
        def guarded_connect(*argv, **kwargs):
            check(not argv, 'DSN posicional no permitido en banco aislado')
            database = kwargs.get('database', kwargs.get('dbname'))
            check(kwargs.get('host') == '127.0.0.1' and int(kwargs.get('port', 0)) == port
                  and database == dbname and kwargs.get('user') == 'ecd_app',
                  'Conexion runtime fuera del cluster/identidad permitidos')
            kwargs['passfile'] = str(fixture / 'no-password-file')
            return raw_connect(**kwargs)
        psycopg2.connect = guarded_connect
        os.environ.update(DB_HOST='127.0.0.1', DB_PORT=str(port), DB_NAME=dbname,
                          DB_USER='ecd_app', DB_PASS='')
        sys.path.insert(0, str(ROOT / 'backend'))
        with redirect_stdout(captured), redirect_stderr(captured):
            core = importlib.import_module('inventory_identity')
            db_module = importlib.import_module('db')
            db_module.init_db_pool()
            auth = importlib.import_module('auth_middleware')
            from flask import Flask
            app = Flask('inventory_b1_real_routes')
            app.config['TESTING'] = True
            report['compiledRouteFingerprints'] = load_server_routes(app)
            extractor = importlib.import_module('routes.inventory')
            app.register_blueprint(extractor.inventory_bp)
            twin = importlib.import_module('routes.digital_twin')
            app.register_blueprint(twin.digital_twin_bp)
            auth.init_auth_middleware(app)
            client = app.test_client()
            check('server' not in sys.modules and 'config' not in sys.modules,
                  'Se importo el arranque/config prohibido')
            Repository, IdentityError = core.InventoryIdentityRepository, core.IdentityError

            tokens = {key: secrets.token_hex(32) for key in ('memberA', 'memberB', 'both', 'admin', 'inactive', 'pending', 'expired', 'revoked')}
            with transaction('ecd_migrator') as conn:
                with conn.cursor() as cur:
                    for uid, (label, token) in enumerate(tokens.items(), 1):
                        cur.execute("INSERT INTO users(id,name,email,password_hash,role,is_active,activated_at) VALUES (%s,%s,%s,'not-a-password',%s,%s,%s)",
                                    (uid, label, label + '@fixture.invalid', 'admin' if label == 'admin' else 'user',
                                     label != 'inactive', None if label == 'pending' else datetime.now(timezone.utc)))
                        cur.execute("INSERT INTO sessions(token,user_id,expires_at,is_active) VALUES (%s,%s,NOW()+(%s * INTERVAL '1 day'),%s)",
                                    (auth.hash_de_token(token), uid, -1 if label == 'expired' else 1, label != 'revoked'))
                        for project in (('B1A', 'B1B') if label in ('both', 'admin') else ('B1B',) if label == 'memberB' else ('B1A',)):
                            cur.execute('INSERT INTO project_users(project_id,user_id) VALUES (%s,%s)', (project, uid))

            def register(scope, document, number=1, item=None):
                project = scope.split('_', 1)[0]
                with transaction('ecd_migrator') as conn:
                    with conn.cursor() as cur:
                        cur.execute("INSERT INTO project_ref(alias,kind,project_id,origen) VALUES (%s,'FRONT',%s,'fixture') ON CONFLICT(account_id,alias) DO NOTHING", (scope, project))
                        cur.execute("INSERT INTO model_config(model_id,name,urn,source,app_project_id,item_id,default_view_guid) VALUES (%s,%s,%s,'DOCS',%s,%s,'fixture-view') ON CONFLICT(model_id) DO UPDATE SET urn=EXCLUDED.urn,item_id=EXCLUDED.item_id",
                                    (scope + ':' + document, document, version(document, number), scope, item or lineage(document)))
                db_module._project_resolver_cache['map'] = None
                auth._membership_cache.clear()
            def publish(scope, document='B1DocumentA', number=1, rows=None, expected=None, **kwargs):
                register(scope, document, number)
                with transaction() as conn:
                    repository = Repository(conn)
                    state = repository.active_snapshot(scope, version(document, number), allowed_scopes=[scope])
                    return Repository(conn).publish_snapshot(scope, version(document, number),
                        rows if rows is not None else [native()], expected_active_urn=expected,
                        expected_generation=state['generation'],
                        allowed_scopes=[scope], item_id=lineage(document), **kwargs)
            def read(scope, **kwargs):
                with transaction() as conn:
                    return Repository(conn).get_inventory(scope, allowed_scopes=[scope], **kwargs)
            def http(method, path, user='memberA', body=None, expected=200):
                headers = {'Authorization': 'Bearer ' + tokens[user]} if user else {}
                response = client.open(path, method=method, json=body, headers=headers)
                payload = response.get_data()
                if response.headers.get('Content-Encoding') == 'gzip':
                    payload = gzip.decompress(payload)
                parsed = json.loads(payload) if payload else None
                check(response.status_code == expected,
                      f'{method} {path}: esperado {expected}, real {response.status_code}, cuerpo={parsed}')
                response.close()
                return parsed
            def get(scope, user='memberA', full=True):
                return http('GET', '/api/inventory?model_urn=' + scope + '&include_props=' + str(full).lower(), user)
            def reject(code, operation):
                try:
                    operation()
                except IdentityError as exc:
                    check(exc.code == code, f'Esperado {code}, observado {exc.code}')
                    return {'rejectedCode': exc.code}
                raise AssertionError('No rechazo ' + code)

            # Seis documentos sinteticos; los dos primeros comparten externalId.
            base_scope = 'B1A_CONTROL'
            for i, document in enumerate(('B1DocumentA', 'B1DocumentB', 'B1DocumentC', 'B1DocumentD', 'B1DocumentE', 'B1DocumentF')):
                publish(base_scope, document, rows=[native('shared' if i < 2 else 'element-' + str(i), name=document, state='Native-' + document)])

            def payload_identity():
                full, lite = get(base_scope), get(base_scope, full=False)
                wanted = ('scope_id', 'source_lineage', 'external_id', 'source_urn', 'element_key')
                check(len(full) == len(lite) == 6, 'No sobreviven los seis documentos')
                check(all(all(k in r for k in wanted) for r in full + lite), 'Payload sin identidad completa')
                full_ids = {tuple(r[k] for k in wanted) for r in full}
                check(full_ids == {tuple(r[k] for k in wanted) for r in lite}, 'Full/lite discrepan en identidad')
                check(len({r['element_key'] for r in full}) == 6, 'element_key colisiona')
                check(sum(r['external_id'] == 'shared' for r in full) == 2, 'externalId compartido se colapsa')
                return {'fullRows': 6, 'liteRows': 6, 'distinctKeys': 6}
            case('I01-real-http-full-lite-six-sources-complete-identity', payload_identity)

            def sessions():
                denied = 0
                for user in (None, 'inactive', 'pending', 'expired', 'revoked'):
                    auth._session_cache.clear()
                    http('GET', '/api/inventory?model_urn=' + base_scope, user, expected=401)
                    denied += 1
                http('GET', '/api/inventory?model_urn=' + base_scope, 'memberA')
                return {'realSessionRejections': denied, 'activatedMemberAccepted': True}
            case('I02-real-hashed-session-activation-expiry-revocation', sessions)

            def membership():
                scope = 'B1B_CONTROL'; publish(scope)
                http('GET', '/api/inventory?model_urn=' + scope, 'memberA', expected=403)
                rows_b = get(scope, 'memberB')
                check(rows_b[0]['element_key'] != get(base_scope)[0]['element_key'], 'Scopes comparten clave')
                http('PATCH', '/api/inventory', body={'identity': identity(scope), 'fieldName': 'Status', 'fieldValue': 'Forbidden'}, expected=403)
                check(read(scope)[0]['installation_status'] == 'Native', 'Escritura ajena alcanzo SQL')
                return {'foreignGetAndPatchRejected': 2, 'sameDocumentAcrossScopesSeparated': True}
            case('I03-membership-real-sql-no-cross-scope-read-or-write', membership)

            def edit_one():
                target = identity(base_scope)
                revision_before = http('GET', '/api/inventory/version?model_urn=' + base_scope)
                before_b = next(r for r in read(base_scope) if r['source_lineage'] == lineage('B1DocumentB'))
                for field, value in [('Status', 'Done-A'), ('Material', 'Steel-A'), ('Name', 'Renamed A'), ('CustomField', 'Custom A')]:
                    http('PATCH', '/api/inventory', body={'identity': target, 'fieldName': field, 'fieldValue': value})
                rows = read(base_scope)
                current_a = next(r for r in rows if r['source_lineage'] == lineage('B1DocumentA'))
                current_b = next(r for r in rows if r['source_lineage'] == lineage('B1DocumentB'))
                check(current_b == before_b, 'Edicion A modifico B')
                check(current_a['name'] == 'Renamed A' and current_a['installation_status'] == 'Done-A'
                      and current_a['properties']['Live Edit']['CustomField'] == 'Custom A', 'Edicion no persistida')
                before_name = http('GET', '/api/inventory/version?model_urn=' + base_scope)
                http('PATCH', '/api/inventory', body={'identity': target, 'fieldName': 'Name', 'fieldValue': 'Name-only cache revision'})
                check(before_name != http('GET', '/api/inventory/version?model_urn=' + base_scope), 'Name no invalida cache')
                return {'realQualifiedHttpEdits': 5, 'otherSourceExactlyPreserved': True, 'nameOnlyInvalidatesRevision': True}
            case('I04-qualified-http-patch-all-main-edit-paths', edit_one)

            def bulk_atomic():
                before = read(base_scope)
                http('PATCH', '/api/inventory/bulk', body={'identities': [identity(base_scope), identity('B1B_CONTROL')],
                     'fieldName': 'Status', 'fieldValue': 'Forbidden bulk'}, expected=403)
                check(read(base_scope) == before, 'Bulk parcialmente aplicado antes de rechazo ACL')
                http('PATCH', '/api/inventory/bulk', body={'identities': [identity(base_scope), identity(base_scope, 'B1DocumentB')],
                     'fieldName': 'Vaciado_Nro', 'fieldValue': 'Qualified bulk'})
                check(all(r['vaciado_nro'] == 'Qualified bulk' for r in read(base_scope) if r['external_id'] == 'shared'), 'Bulk valido incompleto')
                return {'unauthorizedBulkAtomic': True, 'qualifiedRowsUpdated': 2}
            case('I05-real-bulk-all-or-nothing-authorization', bulk_atomic)

            def ambiguity():
                before = read(base_scope)
                body = http('PATCH', '/api/inventory', body={'external_id': 'shared', 'model_urn': base_scope,
                            'fieldName': 'Status', 'fieldValue': 'Do not guess'}, expected=409)
                check(read(base_scope) == before, 'Fallback externalId modifico alguna Source')
                return {'httpStatus': 409, 'errorCode': body.get('code'), 'writes': 0}
            case('I06-legacy-http-ambiguous-externalId-is-409', ambiguity)

            def new_version_and_cas():
                scope = 'B1A_CAS'; first = publish(scope)
                second = publish(scope, number=2, expected=version('B1DocumentA'), rows=[native(state='V2')])
                reject('STALE_ACTIVE_URN', lambda: publish(scope, number=3, expected=version('B1DocumentA'), rows=[native(state='STALE')]))
                check(len(read(scope)) == 1 and read(scope)[0]['source_urn'] == version('B1DocumentA', 2), 'CAS perdio version activa')
                check(count('elements', scope) == 1 and count('snapshots', scope) == 2, 'CAS dejo datos parciales')
                return {'logicalElements': 1, 'snapshots': 2, 'firstPublication': first, 'secondPublication': second}
            case('I07-new-version-logical-identity-and-stale-CAS', new_version_and_cas)

            def idempotence():
                scope = 'B1A_RETRY'; publish(scope)
                before = read(scope)
                result = publish(scope, expected=version('B1DocumentA'))
                reject('SNAPSHOT_CONTENT_CONFLICT', lambda: publish(scope, expected=version('B1DocumentA'), rows=[native(state='Different')]))
                check(read(scope) == before and count('snapshots', scope) == 1, 'Reintento modifica snapshot')
                return {'identicalRetry': result, 'contentConflictRejected': True}
            case('I08-idempotent-retry-does-not-overwrite-same-version', idempotence)

            def history():
                scope = 'B1A_HISTORY'; publish(scope, rows=[native('historical')])
                publish(scope, number=2, expected=version('B1DocumentA'), rows=[native('current')])
                publish(scope, 'B1DocumentB', rows=[native('historical')])
                with transaction() as conn:
                    repo = Repository(conn)
                    reject('LEGACY_AMBIGUOUS', lambda: repo.resolve_legacy_identity('historical', scope_id=scope, allowed_scopes=[scope]))
                check(read(scope, source_urn=version('B1DocumentA'))[0]['external_id'] == 'historical', 'Version historica perdida')
                return {'historicalRivalBlocksLegacyResolution': True, 'historicalReadPreserved': True}
            case('I09-historical-rival-cannot-be-ignored-for-legacy', history)

            def no_promotion():
                scope = 'B1A_LEGACY'; publish(scope, rows=[native('legacy-only')])
                for user in ('ecd_app', 'ecd_migrator'):
                    with transaction(user) as conn:
                        repo = Repository(conn)
                        reject('NO_PROMOTION', lambda: repo.migrate_legacy_user(
                            {'scope_id': scope, 'external_id': 'legacy-only', 'status': 'Legacy'},
                            coverage_complete=True, allowed_scopes=[scope]))
                check(count('user_data', scope) == 0 and read(scope)[0]['installation_status'] == 'Native', 'Promocion por boolean o join legacy')
                preserved = query("SELECT COUNT(*) FROM public.asset_user_data WHERE external_id='legacy-only' AND status='Legacy must remain unassigned'", user='ecd_migrator')[0][0]
                check(preserved == 1, 'Se altero legacy sin autorizacion')
                return {'noPromotionEvenMigratorBoolean': True, 'legacyRowPreserved': 1}
            case('I10-runtime-no-promotion-by-coverage-boolean', no_promotion)

            def grants():
                statements = ["CREATE TABLE public.forbidden_probe(id integer)",
                              'SELECT COUNT(*) FROM inventory_identity_b1.legacy_user_quarantine',
                              "UPDATE inventory_identity_b1.user_data SET promoted_by='forged'",
                              'UPDATE inventory_identity_b1.user_data SET promotion_coverage_complete=true',
                              "UPDATE inventory_identity_b1.user_data SET original_payload='{}'::jsonb"]
                denied = 0
                for statement in statements:
                    try:
                        query(statement)
                    except psycopg2.errors.InsufficientPrivilege:
                        denied += 1
                check(denied == len(statements), 'Runtime tiene permisos DDL/quarantine/provenance')
                return {'actualPrivilegeRejections': denied}
            case('I11-runtime-grants-protect-DDL-quarantine-provenance', grants)

            def row_conflict():
                scope = 'B1A_CONFLICT'
                reject('ROW_IDENTITY_CONFLICT', lambda: publish(scope, rows=[native(), native('bad', scope_id='B1B_CONTROL')]))
                check(count('elements', scope) == count('snapshots', scope) == 0, 'Publicacion parcial tras identidad ajena')
                with transaction() as conn:
                    repo = Repository(conn)
                    reject('ITEM_LINEAGE_CONFLICT', lambda: repo.publish_snapshot(scope, version('B1DocumentA'), [native()],
                        item_id=lineage('B1DocumentB'), expected_active_urn=None, expected_generation=0, allowed_scopes=[scope]))
                return {'rowAndSourceIdentityConflictsRejected': 2, 'partialSnapshots': 0}
            case('I12-source-and-row-identity-conflict-fail-atomic', row_conflict)

            def empty_publication():
                scope = 'B1A_EMPTY'; publish(scope)
                before = http('GET', '/api/inventory/version?model_urn=' + scope)
                result = publish(scope, number=2, expected=version('B1DocumentA'), rows=[], complete=True)
                after = http('GET', '/api/inventory/version?model_urn=' + scope)
                check(get(scope) == [], 'Publicacion completa vacia deja filas activas anteriores')
                check(before != after, 'Huella/version no cambia en publicacion vacia')
                check(result.get('generation', 0) > 0, 'No se expone generation de publicacion')
                return {'emptyActiveRows': 0, 'versionChanged': True, 'publication': result}
            case('I13-complete-empty-snapshot-invalidates-generation', empty_publication)

            extractor = importlib.import_module('routes.inventory')
            def extract(scope, document, number=1, rows=None, callback=None, transport=None, purge=None):
                register(scope, document, number)
                fake = transport or SyntheticAps(rows if rows is not None else [native()], callback)
                old_transport, old_token = extractor.requests, extractor.get_internal_token
                job = 'b1-integrated-' + uuid.uuid4().hex
                try:
                    extractor.requests = fake
                    extractor.get_internal_token = lambda: ('synthetic-aps-token', None)
                    extractor.extract_metadata_task(version(document, number), scope, job, purge_source_urns=purge)
                finally:
                    extractor.requests, extractor.get_internal_token = old_transport, old_token
                return extractor.get_job(job), fake.calls

            def extraction_pair():
                scope = 'B1A_EXTRACT'
                for document in ('B1ExtractorA', 'B1ExtractorB'):
                    job, calls = extract(scope, document, rows=[native(name=document, state=document)])
                    check(job.get('status') == 'success', 'Extractor real no termino: ' + repr(job))
                    check(calls >= 3, 'No se recorrio transporte/normalizacion real')
                rows = get(scope)
                check(len(rows) == 2 and len({r['element_key'] for r in rows}) == 2, 'Extracciones reales colapsan Sources')
                check({r['properties']['G1']['Estado'] for r in rows} == {'B1ExtractorA', 'B1ExtractorB'}, 'Propiedades mezcladas')
                return {'realExtractorPublications': 2, 'realHttpRows': 2}
            case('I14-real-extractor-two-sources-to-real-HTTP', extraction_pair)

            def extraction_cas():
                scope = 'B1A_EXTRACT_CAS'; document = 'B1ExtractorCas'
                job, _ = extract(scope, document, rows=[native(state='V1')])
                check(job.get('status') == 'success', 'Semilla extractor fallo')
                def rival():
                    publish(scope, document, number=3, expected=version(document), rows=[native(state='Rival-V3')])
                job, calls = extract(scope, document, 2, rows=[native(state='Stale-V2')], callback=rival)
                check(job.get('status') == 'error', 'Extractor obsoleto debe fallar CAS')
                current = read(scope)
                check(len(current) == 1 and current[0]['source_urn'] == version(document, 3), 'Extractor antiguo gano carrera')
                return {'rivalActiveVersion': 3, 'staleJobRejected': True, 'apsTransportCalls': calls}
            case('I15-real-extractor-captures-CAS-before-APS', extraction_cas)

            def extractor_empty():
                scope = 'B1A_EXTRACT_EMPTY'; document = 'B1ExtractorEmpty'
                first, _ = extract(scope, document)
                check(first.get('status') == 'success', 'Semilla vacio fallo')
                before = http('GET', '/api/inventory/version?model_urn=' + scope)
                job, _ = extract(scope, document, 2, rows=[])
                check(job.get('status') == 'success', 'Extractor completo vacio rechazado: ' + repr(job))
                check(get(scope) == [], 'Extractor vacio mantiene filas anteriores')
                check(before != http('GET', '/api/inventory/version?model_urn=' + scope), 'Cache no se invalida con extractor vacio')
                return {'realEmptyPublication': True, 'newVersionVisible': True}
            case('I16-real-extractor-complete-empty-publication', extractor_empty)

            class ImmediateThread:
                """Only scheduling is synchronous; target code and SQL remain real."""
                started_count = 0
                def __init__(self, target, args=(), kwargs=None, daemon=None):
                    self.target, self.args, self.kwargs = target, args, kwargs or {}
                    self.daemon = daemon
                def start(self):
                    ImmediateThread.started_count += 1
                    self.target(*self.args, **self.kwargs)
            @contextmanager
            def aps_and_scheduler(fake):
                old = (extractor.requests, extractor.get_internal_token, extractor.threading,
                       twin.requests, twin.get_internal_token, twin.threading, twin._is_model_translated)
                try:
                    extractor.requests = twin.requests = fake
                    extractor.get_internal_token = twin.get_internal_token = lambda: ('synthetic-aps-token', None)
                    extractor.threading = twin.threading = types.SimpleNamespace(Thread=ImmediateThread)
                    twin._is_model_translated = lambda urn, token: True
                    yield
                finally:
                    (extractor.requests, extractor.get_internal_token, extractor.threading,
                     twin.requests, twin.get_internal_token, twin.threading, twin._is_model_translated) = old

            def extraction_http_admission():
                scope = 'B1A_PRELINK'
                query("INSERT INTO project_ref(alias,kind,project_id,origen) VALUES (%s,'FRONT','B1A','fixture')", (scope,), 'ecd_migrator')
                db_module.invalidar_resolver_de_obras()
                fake = SyntheticAps([native()])
                before_threads = ImmediateThread.started_count
                before_jobs = query('SELECT COUNT(*) FROM extraction_jobs')[0][0]
                with aps_and_scheduler(fake):
                    http('POST', '/api/inventory/extract', body={'urn': version('B1PrelinkNew'), 'target_urn': scope}, user='memberB', expected=403)
                    check(ImmediateThread.started_count == before_threads and fake.calls == 0, 'Denegacion dispara hilo/APS')
                    check(query('SELECT COUNT(*) FROM extraction_jobs')[0][0] == before_jobs, 'Denegacion crea job')
                    response = http('POST', '/api/inventory/extract', body={'urn': version('B1PrelinkNew'), 'target_urn': scope}, expected=202)
                    check(extractor.get_job(response['job_id'])['status'] == 'success', 'Import prelink autorizado falla')
                check(len(get(scope)) == 1, 'Prelink no queda consultable')
                foreign_scope = 'B1B_SOURCE_ONLY'
                register(foreign_scope, 'B1ForeignOnly')
                before_threads, before_jobs = ImmediateThread.started_count, query('SELECT COUNT(*) FROM extraction_jobs')[0][0]
                fake = SyntheticAps([native()])
                with aps_and_scheduler(fake):
                    # Middleware may deny the member before the domain boundary.
                    http('POST', '/api/inventory/extract', body={'urn': version('B1ForeignOnly'), 'target_urn': scope}, expected=403)
                    # A member of BOTH projects reaches the Source ownership
                    # boundary: project membership alone does not authorize relink.
                    denegada = http('POST', '/api/inventory/extract', body={'urn': version('B1ForeignOnly'), 'target_urn': scope}, user='both', expected=403)
                # Una peticion que nombra DOS obras --la del Source y la del
                # destino-- la deniega ANTES el perimetro, por ambigua
                # (`OBRA_EN_CONFLICTO` en auth_middleware): nadie pertenece a una
                # peticion ambigua, ni siquiera quien es miembro de las dos. Esa
                # guardia es anterior a B1 y es correcta, asi que exigir aqui el
                # codigo del dominio era exigir algo inalcanzable por HTTP.
                # Lo que este caso SI debe demostrar --y demuestra-- es que la
                # negativa ocurre antes de APS y antes del job, y que la frontera
                # de dominio existe: se comprueba contra el contexto real.
                check(denegada['code'] in ('SOURCE_PROJECT_CONFLICT', 'PROJECT_FORBIDDEN'),
                      'Codigo inesperado al negar un Source ajeno: ' + str(denegada))
                check(fake.calls == 0 and before_threads == ImmediateThread.started_count,
                      'Source ajeno llega a APS o dispara hilo')
                with transaction() as conn:
                    try:
                        extractor._extraction_source_context(conn, version('B1ForeignOnly'), scope)
                        raise AssertionError('El dominio admite un Source de otra obra')
                    except IdentityError as exc:
                        check(exc.code == 'SOURCE_PROJECT_CONFLICT',
                              'La frontera de dominio da otro codigo: ' + str(exc.code))
                check(query('SELECT COUNT(*) FROM extraction_jobs')[0][0] == before_jobs, 'Source ajeno crea job')
                # Same document may legitimately be linked in both projects.
                register(scope, 'B1ForeignOnly')
                with aps_and_scheduler(SyntheticAps([native()])):
                    response = http('POST', '/api/inventory/extract', body={'urn': version('B1ForeignOnly'), 'target_urn': scope}, expected=202)
                    check(extractor.get_job(response['job_id'])['status'] == 'success', 'Source compartida con vinculo local bloqueada')
                return {'prelinkAuthorized': True, 'unauthorizedTargetBeforeJobAndAPS': True,
                        'foreignOnlySourceBeforeJobAndAPS': True, 'sharedSourceWithTargetLinkAllowed': True,
                        'foreignOnlyDeniedBy': denegada['code'],
                        'domainBoundaryRaises': 'SOURCE_PROJECT_CONFLICT'}
            case('I17-real-extract-HTTP-prelink-source-target-ACL', extraction_http_admission)

            def identity_declarations():
                before = read(base_scope)
                variants = [
                    {'external_id': 'different'},
                    {'model_urn': 'B1B_CONTROL'},
                    {'scope_id': 'B1B_CONTROL'},
                    {'source_urn': version('B1DocumentB')},
                    {'element_key': 'not-the-identity'},
                ]
                for declaration in variants:
                    http('PATCH', '/api/inventory', body={'identity': identity(base_scope),
                         'fieldName': 'Status', 'fieldValue': 'Do not apply', **declaration}, user='both', expected=409)
                check(read(base_scope) == before, 'Alias contradictorio escribe')
                http('PATCH', '/api/inventory/bulk', body={'identities': [identity(base_scope), identity(base_scope, external='absent')],
                     'fieldName': 'Status', 'fieldValue': 'Missing second target'}, expected=404)
                check(read(base_scope) == before, 'Bulk target inexistente escribe el primero')
                return {'contradictoryDeclarationsRejected': len(variants), 'missingTargetBulkAtomic': True}
            case('I18-HTTP-identity-alias-conflicts-and-missing-bulk-atomic', identity_declarations)

            class FaultAps(SyntheticAps):
                def __init__(self, mode):
                    super().__init__([native()])
                    self.mode = mode
                def _properties(self, payload):
                    if self.mode == 'malformed':
                        return ApsResponse({'data': {}})
                    if self.mode == 'missing-leaf':
                        return ApsResponse({'data': {'collection': []}})
                    if self.mode == 'missing-external':
                        return ApsResponse({'data': {'collection': [{'objectid': 1, 'name': 'Without identity', 'properties': {}}]}})
                    if self.mode == 'page-limit':
                        rows = [{'objectid': i + 1, 'externalId': str(i), 'name': 'Synthetic', 'properties': {}} for i in range(500)]
                        return ApsResponse({'data': {'collection': rows}})
                    if self.mode == 'transport':
                        raise RuntimeError('Synthetic APS failure')
                    return super()._properties(payload)
            def extraction_failures():
                codes = {'malformed': 'INCOMPLETE_APS_COLLECTION', 'missing-leaf': 'INCOMPLETE_MODEL_COVERAGE',
                         'missing-external': 'INCOMPLETE_ELEMENT_IDENTITY', 'page-limit': 'INCOMPLETE_EXTRACTION_PAGE_LIMIT',
                         'transport': 'EXTRACTION_FAILED'}
                observed = {}
                for mode, expected_code in codes.items():
                    scope, doc = 'B1A_BAD_' + mode.replace('-', ''), 'Bad' + mode.replace('-', '')
                    job, calls = extract(scope, doc, transport=FaultAps(mode))
                    check(job['status'] == 'error' and job['code'] == expected_code, 'Fallo APS aceptado o codigo distinto: ' + str(job))
                    check(count('snapshots', scope) == 0 and read(scope) == [], 'Extraccion incompleta publica')
                    observed[mode] = {'code': expected_code, 'transportCalls': calls, 'snapshots': 0}
                return {'rejectedIncompleteExtractions': observed}
            case('I19-real-extractor-rejects-malformed-gaps-missing-ID-limit-and-APSerror', extraction_failures)

            def extraction_aba():
                scope, doc = 'B1A_ABA', 'B1FirstInFlight'
                def retire_first_in_flight():
                    with transaction() as conn:
                        Repository(conn).deactivate_sources(scope, [version(doc)], allowed_scopes=[scope])
                job, _ = extract(scope, doc, callback=retire_first_in_flight)
                check(job['status'] == 'error' and job['code'] == 'STALE_GENERATION', 'Primer Source retirado resucita')
                check(read(scope) == [] and count('snapshots', scope) == 0, 'ABA deja snapshot publicado')
                return {'firstPublicationRetiredDuringAPSRejected': True, 'snapshots': 0}
            case('I20-real-extractor-first-publication-retirement-ABA', extraction_aba)

            def twin_paths():
                scope, old, new = 'B1A_RELINK', 'B1OldLink', 'B1NewLink'
                publish(scope, old, rows=[native('old', state='Keep old')])
                with transaction() as conn:
                    Repository(conn).update_element(identity(scope, old, 'old'), 'Status', 'Human old', allowed_scopes=[scope])
                existing_id = scope + ':' + old
                body = {'targetId': existing_id, 'oldUrn': version(old), 'project': scope,
                        'newModel': {'urn': version(new), 'name': 'New source', 'itemId': lineage(new)}}
                with aps_and_scheduler(SyntheticAps([native('new')])):
                    response = http('POST', '/api/config/project/relink', body=body)
                check(response['extraction_job_id'] and extractor.get_job(response['extraction_job_id'])['status'] == 'success', 'Relink extractor no success')
                check(len(read(scope)) == 1 and read(scope)[0]['external_id'] == 'new', 'Relink no retira old al publicar new')
                check(read(scope, source_urn=version(old))[0]['installation_status'] == 'Human old', 'Relink borra historico/humano')
                # Version-equivalent purge must not hide a still-linked Source.
                response = http('POST', '/api/inventory/purge-source', body={'project': scope, 'source_urn': version(new, 2)})
                check(response.get('linked') and len(read(scope)) == 1, 'Purge de otra version elimina linaje vinculado')
                http('POST', '/api/config/project/remove', body={'project': scope, 'urn': version(new)})
                check(read(scope) == [] and count('snapshots', scope) == 2 and count('user_data', scope) == 1, 'Remove borra historia o edicion')
                check(query('SELECT COUNT(*) FROM model_config WHERE model_id=%s', (existing_id,))[0][0] == 0, 'Remove no borra config')
                http('POST', '/api/config/project/remove', user='memberB', body={'project': scope, 'urn': version(new)}, expected=403)
                # A known foreign new Source fails before config mutation or APS.
                foreign_doc = 'B1RelinkForeign'
                register('B1B_RELINK_FOREIGN', foreign_doc)
                publish(scope, old, rows=[native('old', state='Keep old')])
                body['newModel'] = {'urn': version(foreign_doc), 'name': 'Foreign', 'itemId': lineage(foreign_doc)}
                fake = SyntheticAps([native()])
                with aps_and_scheduler(fake):
                    http('POST', '/api/config/project/relink', body=body, expected=403)
                check(fake.calls == 0 and query('SELECT urn FROM model_config WHERE model_id=%s', (existing_id,))[0][0] == version(old), 'Relink ajeno modifica config/APS')
                return {'relinkAtomicPublicationRetirement': True, 'removeKeepsTwoSnapshotsAndHumanData': True,
                        'sameLineagePurgeProtected': True, 'foreignRelinkNoConfigMutationOrAPS': True}
            case('I21-real-digital-twin-relink-remove-purge-and-foreign-relink', twin_paths)

            def bootstrap_grants():
                bootstrap = importlib.import_module('bootstrap_esquema')
                checks = []
                def verify(label):
                    for role in ('ecd_migrator', 'ecd_app'):
                        with transaction(role) as conn:
                            with conn.cursor() as cur:
                                for path in ('public', 'inventory_identity_b1,public'):
                                    cur.execute('SET LOCAL search_path TO ' + path)
                                    missing = core.verify_inventory_schema(cur)
                                    check(missing == [], label + ':' + role + ':' + path + ':' + repr(missing))
                                    checks.append(label + ':' + role + ':' + path)
                verify('direct31')
                original_db_connection = db_module.get_db_connection
                try:
                    db_module.get_db_connection = lambda: transaction('ecd_migrator')
                    bootstrap._inventory_canonical_31()
                    verify('bootstrap31')
                    bootstrap.aplicar_grants_aplicacion()
                    verify('bootstrap03then31')
                finally:
                    db_module.get_db_connection = original_db_connection
                check('config' not in sys.modules and 'server' not in sys.modules, 'Bootstrap importo config/server')
                return {'realBootstrapAndGrantsExecuted': True, 'catalogAndPrivilegeChecks': checks,
                        'signatureOnlyUnrelatedGrantDependencies': ['ai_brain', 'activity_log', 'auth_events', 'resolve_folder_path']}
            case('I22-real-bootstrap31-and-03-regrant-parity-verifier', bootstrap_grants)

            def read_readiness():
                scope = 'B1A_READINESS'
                register(scope, 'B1CurrentReady')
                # Legacy orphan is native history, not a second authority or a
                # proof of complete coverage for human-data promotion.
                query("INSERT INTO public.inventory_assets(external_id,model_urn,source_urn,name) VALUES ('orphan',%s,%s,'Old unconfigured')",
                      (scope, version('B1UnconfiguredOld')), 'ecd_migrator')
                http('GET', '/api/inventory?model_urn=' + scope, expected=409)
                publish(scope, 'B1CurrentReady')
                rows = get(scope)
                check(len(rows) == 1 and rows[0]['source_lineage'] == lineage('B1CurrentReady'), 'Config lista bloqueada o legacy promovido')
                check(query('SELECT COUNT(*) FROM public.inventory_assets WHERE model_urn=%s', (scope,), 'ecd_migrator')[0][0] == 1, 'Orphan legacy borrado')
                unready = 'B1A_UNREADY_NO_CONFIG'
                query("INSERT INTO project_ref(alias,kind,project_id,origen) VALUES (%s,'FRONT','B1A','fixture')", (unready,), 'ecd_migrator')
                query("INSERT INTO public.inventory_assets(external_id,model_urn,source_urn,name) VALUES ('orphan2',%s,NULL,'Unknown native')",
                      (unready,), 'ecd_migrator')
                db_module.invalidar_resolver_de_obras()
                http('GET', '/api/inventory?model_urn=' + unready, expected=409)
                return {'configuredIncompleteIs409': True, 'configuredReadyIgnoresOnlyUnconfiguredLegacy': True,
                        'legacyPreservedNotPromoted': True, 'unconfiguredUnknownLegacyIs409': True}
            case('I23-read-readiness-preserves-orphan-native-without-false-empty', read_readiness)

        failed = sum(c['status'] != 'PASS' for c in report['cases'])
        report['summary'] = {'passed': len(report['cases']) - failed, 'failed': failed, 'total': len(report['cases'])}
        report['sourceFilesUnchangedDuringRun'] = fingerprints() == report['sourceFingerprints']
        report['verdict'] = 'INTEGRATION PASS' if failed == 0 and report['sourceFilesUnchangedDuringRun'] else 'INTEGRATION FAIL'
    except Exception as exc:
        report['verdict'] = 'HARNESS ERROR'
        report['error'] = type(exc).__name__ + ': ' + str(exc)[:1800]
    finally:
        psycopg2.connect = raw_connect
        if db_module is not None and getattr(db_module, 'db_pool', None) is not None:
            db_module.db_pool.closeall()
        if started:
            try:
                command('pg_ctl.exe', '-D', data_dir, '-m', 'fast', '-w', '-t', '30', 'stop')
                report['clusterStopped'] = True
            except Exception:
                report['verdict'] = 'SHUTDOWN ERROR'
        report['capturedRuntimeLogCharacters'] = len(captured.getvalue())
        report['completedAt'] = datetime.now(timezone.utc).isoformat()
        report['exitCode'] = 0 if report['verdict'] == 'INTEGRATION PASS' and report['clusterStopped'] else 1
        print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    return report['exitCode']


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
