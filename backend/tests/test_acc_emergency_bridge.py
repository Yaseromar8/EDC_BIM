"""El puente de emergencia nunca llama a ACC ni a la base real en estas pruebas."""
import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from threading import Barrier, Lock, Semaphore
import time

import acc_emergency_bridge as bridge
from flask import Flask, g, jsonify

import routes.docs_cad as cad


def test_cortacircuito_apagado_no_consulta_ni_copia(monkeypatch):
    monkeypatch.delenv('ACC_EMERGENCY_BRIDGE_ENABLED', raising=False)
    monkeypatch.delenv('ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED', raising=False)
    monkeypatch.setattr(bridge, 'folder_bridge_config', lambda *_: (_ for _ in ()).throw(
        AssertionError('no debe consultar la base')))
    assert bridge.bridge_for_upload('carpeta', 'obra', 'plano.dwg') is None
    assert bridge.folder_bridge('carpeta', 'obra') is None
    assert bridge.parallel_upload_enabled() is False


def test_solo_cad_y_carpeta_exacta_habilitada(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    calls = []

    def config(folder, model):
        calls.append((folder, model))
        return {'enabled': folder == 'exacta', 'project_id': 'b.acc', 'folder_id': 'acc-folder'}

    monkeypatch.setattr(bridge, 'folder_bridge_config', config)
    assert bridge.bridge_for_upload('exacta', 'obra', 'plano.dwg')['project_id'] == 'b.acc'
    assert bridge.bridge_for_upload('exacta', 'obra', 'modelo.RVT')['project_id'] == 'b.acc'
    assert bridge.bridge_for_upload('exacta', 'obra', 'coordinado.nwc')['project_id'] == 'b.acc'
    assert bridge.bridge_for_upload('otra', 'obra', 'plano.dwg') is None
    assert bridge.bridge_for_upload('exacta', 'obra', 'informe.pdf') is None
    assert bridge.bridge_for_upload('exacta', 'obra', 'modelo.ifc') is None
    assert bridge.bridge_for_upload('exacta', 'obra', 'modelo.dgn') is None
    assert calls == [('exacta', 'obra'), ('exacta', 'obra'), ('exacta', 'obra'),
                     ('otra', 'obra')]


def test_trabajo_nace_pendiente_por_version_sin_token(monkeypatch):
    monkeypatch.setattr(bridge.time, 'time', lambda: 12345)
    job = bridge.initial_job({'project_id': 'b.acc', 'folder_id': 'folder-acc'},
                             'gcs-original-1', 'plano.dwg')
    assert job == {'status': 'queued', 'gcs_urn': 'gcs-original-1',
                   'name': 'plano.dwg', 'project_id': 'b.acc',
                   'folder_id': 'folder-acc', 'queued_at': 12345, 'attempts': 0}


def test_vigilancia_local_detecta_listo_sin_pestana_abierta(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    timers = []
    statuses = iter(('preparing', 'ready'))

    class FakeTimer:
        def __init__(self, delay, callback):
            self.delay = delay
            self.callback = callback

        def start(self):
            timers.append(self)

    monkeypatch.setattr(bridge, 'Timer', FakeTimer)
    monkeypatch.setattr(bridge, '_job', lambda _v: {
        'state': {'status': 'preparing'}, 'node_id': 'node-1', 'gcs_urn': 'gcs-1'})
    monkeypatch.setattr(bridge, 'status_and_link',
                        lambda _node: ({'status': next(statuses)}, None))
    bridge._READY_WATCHED.clear()
    try:
        bridge.schedule_ready_watch('version-1')
        bridge.schedule_ready_watch('version-1')
        assert len(timers) == 1
        first = timers.pop(0)
        assert first.delay == 15
        first.callback()
        assert len(timers) == 1
        second = timers.pop(0)
        assert second.delay == 15
        second.callback()
        assert timers == []
        assert 'version-1' not in bridge._READY_WATCHED
    finally:
        bridge._READY_WATCHED.clear()


def test_despacho_conserva_traduccion_normal_y_aisla_puente(monkeypatch):
    scheduled = []
    translated = []
    monkeypatch.setattr(bridge, 'schedule', scheduled.append)
    monkeypatch.setattr(cad, 'encolar_pretraduccion', lambda *a, **kw: translated.append((a, kw)))
    bridge.dispatch_cad_after_upload('informe.pdf', 'node-pdf')
    bridge.dispatch_cad_after_upload('normal.dwg', 'node-normal')
    bridge.dispatch_cad_after_upload('emergencia.dwg', 'node-bridge',
                                     {'enabled': True}, 'docs-version-1')
    assert scheduled == ['docs-version-1']
    assert translated == [(('node-normal',), {'vistas_pdf': True})]
    # Las dos rutas conservan la llamada normal en su rama sin puente.
    # No prueba HTTP, pero vigila un olvido de cableado.
    root = Path(__file__).resolve().parents[1] / 'routes'
    assert "encolar_pretraduccion(node_id, vistas_pdf=filename.lower().endswith('.dwg'))" in (
        root / 'uploads.py').read_text(encoding='utf-8')
    assert "encolar_pretraduccion(file_id, vistas_pdf=filename.lower().endswith('.dwg'))" in (
        root / 'documents.py').read_text(encoding='utf-8')


def test_subida_a_acc_crea_item_sin_post_job(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    state = {'status': 'uploading', 'project_id': 'b.acc', 'folder_id': 'folder-acc',
             'gcs_urn': 'gcs-original-1', 'name': 'plano.dwg', 'attempts': 1}
    saved = []
    calls = []
    watched = []
    monkeypatch.setattr(bridge, 'schedule_ready_watch', watched.append)
    storage_id = 'urn:adsk.objects:os.object:wip.dm.prod/obj-1.dwg'
    acc_version_id = 'urn:adsk.wipprod:fs.file:vf.123?version=1'
    monkeypatch.setattr(bridge, '_claim', lambda _v: state.copy())
    monkeypatch.setattr(bridge, '_job', lambda _v: {'state': state, 'node_id': 'node-1',
                                                    'name': 'plano.dwg', 'model_urn': 'obra',
                                                    'gcs_urn': 'gcs-original-1'})
    monkeypatch.setattr(bridge, '_save_state', lambda _v, value: saved.append(value.copy()))
    monkeypatch.setattr(bridge, '_previous_acc_item', lambda *_: None)
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))

    def fake_aps(method, path, token, payload=None):
        calls.append((method, path, payload))
        if path.endswith('/storage'):
            return {'data': {'id': storage_id}}
        if path.endswith('/items'):
            return {'data': {'id': 'urn:adsk.wipprod:dm.lineage:item-1',
                             'relationships': {'tip': {'data': {'id': acc_version_id}}}}}
        raise AssertionError(path)

    monkeypatch.setattr(bridge, '_aps_request', fake_aps)
    import gcs_manager
    import routes.docs_cad as cad

    def fake_download(_urn, target):
        target.write(b'dwg-simulado')
        return target.tell()

    monkeypatch.setattr(gcs_manager, 'descargar_a_fichero', fake_download)
    monkeypatch.setattr(cad, '_upload_to_oss', lambda _t, _b, _o, _f, size: (storage_id, None))
    bridge.process('docs-version-1')

    assert [path.rsplit('/', 1)[-1] for _, path, _ in calls] == ['storage', 'items']
    assert all('/job' not in path for _, path, _ in calls)
    assert saved[-1]['status'] == 'preparing'
    assert watched == ['docs-version-1']
    assert saved[-1]['acc_version_id'] == acc_version_id
    assert saved[-1]['commit_attempted'] is True
    assert saved[-1]['gcs_download_started_at'] <= saved[-1]['gcs_download_finished_at']
    assert saved[-1]['gcs_download_finished_at'] <= saved[-1]['acc_transfer_started_at']
    assert saved[-1]['acc_transfer_started_at'] <= saved[-1]['acc_transfer_finished_at']


def test_plan_directo_firma_sesion_y_confirma_solo_misma_carpeta(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    monkeypatch.setenv('ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED', 'true')
    monkeypatch.setenv('APP_SECRET', 'clave-de-prueba-no-real-para-firma')
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))
    storage_id = 'urn:adsk.objects:os.object:wip.dm.prod/direct-1.dwg'
    monkeypatch.setattr(bridge, '_aps_request', lambda *_a, **_k: {'data': {'id': storage_id}})
    seen = []

    def fake_get(url, **_kwargs):
        seen.append(('GET', url))
        return type('Response', (), {'ok': True, 'json': lambda self: {
            'urls': ['https://s3.example.invalid/parte-1'], 'uploadKey': 'key-test'}})()

    def fake_post(url, **_kwargs):
        seen.append(('POST', url))
        return type('Response', (), {'ok': True, 'json': lambda self: {
            'objectId': storage_id}})()

    monkeypatch.setattr(bridge.requests, 'get', fake_get)
    monkeypatch.setattr(bridge.requests, 'post', fake_post)
    folder = {'project_id': 'b.acc', 'folder_id': 'carpeta-acc'}
    plan = bridge.prepare_parallel_upload('session-1', folder, 'plano.dwg', 1024)
    assert plan['urls'] == ['https://s3.example.invalid/parte-1']
    assert plan['partSize'] >= 5 * 1024 * 1024
    assert bridge.finish_parallel_upload(plan['ticket'], 'otra-sesion', folder, 'plano.dwg', 1024) is None
    assert bridge.finish_parallel_upload(plan['ticket'], 'session-1',
                                         {**folder, 'folder_id': 'otra'}, 'plano.dwg', 1024) is None
    assert bridge.finish_parallel_upload(plan['ticket'], 'session-1', folder, 'plano.dwg', 1024) == storage_id
    assert [method for method, _ in seen] == ['GET', 'POST']


def test_plan_directo_apagado_no_pide_token_ni_storage(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    monkeypatch.delenv('ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED', raising=False)
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: (_ for _ in ()).throw(
        AssertionError('Sin flag no se piden credenciales APS')))
    folder = {'project_id': 'b.acc', 'folder_id': 'carpeta-acc'}
    assert bridge.prepare_parallel_upload('session', folder, 'plano.dwg', 1024) is None
    assert bridge.finish_parallel_upload('ticket', 'session', folder, 'plano.dwg', 1024) is None


def test_subida_directa_evita_descarga_gcs_y_copia_segunda(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    monkeypatch.setattr(bridge, 'schedule_ready_watch', lambda _v: None)
    storage_id = 'urn:adsk.objects:os.object:wip.dm.prod/direct-2.dwg'
    state = bridge.initial_job({'project_id': 'b.acc', 'folder_id': 'folder-acc'},
                               'gcs-original-2', 'plano.dwg', storage_id)
    saved = []
    monkeypatch.setattr(bridge, '_claim', lambda _v: state.copy())
    monkeypatch.setattr(bridge, '_job', lambda _v: {'state': state, 'node_id': 'node-2',
                                                    'gcs_urn': 'gcs-original-2'})
    monkeypatch.setattr(bridge, '_save_state', lambda _v, value: saved.append(value.copy()))
    monkeypatch.setattr(bridge, '_previous_acc_item', lambda *_: None)
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))
    def fake_aps(_method, path, _token, payload=None):
        assert path.endswith('/items')
        return {'data': {'id': 'acc-item-2', 'relationships': {
            'tip': {'data': {'id': 'acc-version-2'}}}}}

    monkeypatch.setattr(bridge, '_aps_request', fake_aps)
    import gcs_manager
    monkeypatch.setattr(gcs_manager, 'descargar_a_fichero', lambda *_: (_ for _ in ()).throw(
        AssertionError('La subida directa no debe descargar GCS')))
    monkeypatch.setattr(cad, '_upload_to_oss', lambda *_a, **_k: (_ for _ in ()).throw(
        AssertionError('La subida directa no debe copiar a OSS')))
    bridge.process('docs-version-directa')
    assert saved[-1]['status'] == 'preparing'
    assert saved[-1]['storage_id'] == storage_id


def test_version_existente_usa_item_vinculado_y_no_crea_otro(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    monkeypatch.setattr(bridge, 'schedule_ready_watch', lambda _v: None)
    state = {'status': 'uploading', 'project_id': 'b.acc', 'folder_id': 'folder-acc',
             'gcs_urn': 'gcs-2', 'name': 'plano.dwg'}
    paths = []
    monkeypatch.setattr(bridge, '_claim', lambda _: state.copy())
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state, 'node_id': 'node-1',
                                                  'name': 'plano.dwg', 'gcs_urn': 'gcs-2'})
    monkeypatch.setattr(bridge, '_save_state', lambda *_: None)
    monkeypatch.setattr(bridge, '_previous_acc_item', lambda *_: 'acc-existing-item')
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))

    def fake_aps(method, path, _token, _payload=None):
        paths.append(path)
        if path.endswith('/storage'):
            return {'data': {'id': 'urn:adsk.objects:os.object:wip.dm.prod/obj-2.dwg'}}
        if path.endswith('/items/acc-existing-item'):
            return {'data': {'attributes': {'displayName': 'plano.dwg'},
                'relationships': {'parent': {'data': {'id': 'folder-acc'}}}}}
        if path.endswith('/versions'):
            return {'data': {'id': 'acc-version-2'}}
        raise AssertionError(path)

    monkeypatch.setattr(bridge, '_aps_request', fake_aps)
    import gcs_manager
    import routes.docs_cad as cad
    monkeypatch.setattr(gcs_manager, 'descargar_a_fichero', lambda _, file: file.write(b'bytes'))
    monkeypatch.setattr(cad, '_upload_to_oss', lambda *_a, **_k:
                        ('urn:adsk.objects:os.object:wip.dm.prod/obj-2.dwg', None))
    bridge.process('docs-version-2')
    assert paths == ['data/v1/projects/b.acc/items/acc-existing-item',
                     'data/v1/projects/b.acc/storage',
                     'data/v1/projects/b.acc/versions']


def test_cambio_de_destino_no_reutiliza_item_acc_anterior(monkeypatch):
    seen = []

    class Cursor:
        def execute(self, query, params):
            seen.append((query, params))

        def fetchone(self):
            # El mismo documento ya tenia una version en la carpeta antigua.
            return ('item-antiguo',) if seen[-1][1][3] == 'carpeta-antigua' else None

    class Connection:
        def cursor(self):
            return Cursor()

    @contextmanager
    def connection():
        yield Connection()

    monkeypatch.setattr(bridge, 'get_db_connection', connection)
    assert bridge._previous_acc_item('nodo', 'v2', 'proyecto', 'carpeta-nueva') is None
    assert bridge._previous_acc_item('nodo', 'v2', 'proyecto', 'carpeta-antigua') == 'item-antiguo'
    assert all("metadata->'acc_emergency_bridge'->>'folder_id' = %s" in query
               for query, _ in seen)
    assert seen[0][1] == ('nodo', 'v2', 'proyecto', 'carpeta-nueva')


def test_complete_toma_lock_por_sesion_antes_de_crear_version(monkeypatch):
    import db
    import routes.uploads as uploads
    events = []

    class Cursor:
        def execute(self, query, params):
            events.append(('lock', query, params))

    class Connection:
        def cursor(self):
            return Cursor()

    @contextmanager
    def connection():
        events.append(('enter',))
        yield Connection()
        events.append(('exit',))

    monkeypatch.setattr(db, 'get_db_connection', connection)
    monkeypatch.setattr(uploads, 'guardia_de_recurso', lambda tabla, upload_id:
                        events.append(('guard', tabla, upload_id)) or None)
    monkeypatch.setattr(uploads, '_complete_upload_locked', lambda data, upload_id:
                        events.append(('work', data, upload_id)) or jsonify(success=True))
    app = Flask(__name__)
    with app.test_request_context('/api/uploads/complete', method='POST',
                                  json={'uploadId': 'sesion-1'}):
        response = uploads.complete_upload()
    assert response.get_json() == {'success': True}
    assert [entry[0] for entry in events] == ['guard', 'enter', 'lock', 'work', 'exit']
    assert events[0][1:] == ('upload_sessions', 'sesion-1')
    assert 'pg_advisory_xact_lock' in events[2][1]
    assert events[2][2] == ('sesion-1',)


def test_complete_rechaza_sesion_ajena_antes_de_tomar_lock(monkeypatch):
    import db
    import routes.uploads as uploads

    monkeypatch.setattr(uploads, 'guardia_de_recurso', lambda *_:
                        (jsonify(error='Sin acceso'), 403))
    monkeypatch.setattr(db, 'get_db_connection', lambda:
                        (_ for _ in ()).throw(AssertionError('no tomar lock')))
    app = Flask(__name__)
    with app.test_request_context('/api/uploads/complete', method='POST',
                                  json={'uploadId': 'sesion-ajena'}):
        response, status = uploads.complete_upload()
    assert status == 403
    assert response.get_json()['error'] == 'Sin acceso'


def test_ocho_confirmaciones_no_agotan_pool_de_quince(monkeypatch):
    """Simula el pool real sin abrir PostgreSQL, GCS ni ACC."""
    import db
    import routes.uploads as uploads

    slots = Semaphore(15)
    start = Barrier(8)
    counts_lock = Lock()
    active = 0
    peak = 0

    class Cursor:
        def execute(self, query, _params):
            if 'pg_advisory_xact_lock' in query:
                time.sleep(0.1)  # deja que todas las peticiones disputen el pool

    class Connection:
        def cursor(self):
            return Cursor()

    @contextmanager
    def connection():
        nonlocal active, peak
        if not slots.acquire(timeout=1):
            raise RuntimeError('pool de 15 agotado')
        with counts_lock:
            active += 1
            peak = max(peak, active)
        try:
            yield Connection()
        finally:
            with counts_lock:
                active -= 1
            slots.release()

    def work(_data, _upload_id):
        with connection():
            time.sleep(1.2)  # el segundo préstamo puede durar más que el reintento del pool
            return jsonify(success=True)

    monkeypatch.setattr(db, 'get_db_connection', connection)
    monkeypatch.setattr(uploads, 'guardia_de_recurso', lambda *_: None)
    monkeypatch.setattr(uploads, '_complete_upload_locked', work)
    app = Flask(__name__)

    def confirm(i):
        start.wait(timeout=5)
        with app.test_request_context('/api/uploads/complete', method='POST',
                                      json={'uploadId': f'sesion-{i}'}):
            result = uploads.complete_upload()
            response, status = result if isinstance(result, tuple) else (result, 200)
            return status, response.get_json()

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(confirm, range(8)))
    assert all(status == 200 for status, _ in results), (peak, results)


def test_complete_recupera_version_ya_guardada_tras_caida(monkeypatch):
    import db
    import file_system_db
    import routes.documents as documents
    import routes.uploads as uploads
    events = []

    class Cursor:
        def execute(self, query, params):
            events.append((query, params))
            self.query = query

        def fetchone(self):
            if 'FROM upload_sessions' in self.query:
                return ('sesion-1', 'obra', 'plano.dwg', 10, 'gcs-unico',
                        None, 'autor', 'active', 'application/acad', 'carpeta-local')
            if 'FROM file_versions v' in self.query:
                return ('nodo-1', 'version-1', 2, True)
            raise AssertionError(self.query)

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            events.append(('commit',))

    @contextmanager
    def connection():
        yield Connection()

    monkeypatch.setattr(db, 'get_db_connection', connection)
    monkeypatch.setattr(documents, 'verify_project_access', lambda *_: True)
    monkeypatch.setattr(uploads, '_get_user', lambda: {'email': 'autor'})
    monkeypatch.setattr(file_system_db, 'create_file_record', lambda *_a, **_k:
                        (_ for _ in ()).throw(AssertionError('no duplicar versión')))
    scheduled = []
    monkeypatch.setattr(bridge, 'schedule', scheduled.append)
    app = Flask(__name__)
    with app.test_request_context('/api/uploads/complete', method='POST',
                                  json={'uploadId': 'sesion-1'}):
        response, status = uploads._complete_upload_locked({'uploadId': 'sesion-1'}, 'sesion-1')
    assert status == 200
    assert response.get_json()['version'] == 2
    assert scheduled == ['version-1']
    assert any('UPDATE upload_sessions' in query for query, _ in events if isinstance(query, str))


def test_urn_de_vista_se_deriva_de_version_acc(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    version = 'urn:adsk.wipprod:fs.file:vf.123?version=1'
    state = {'status': 'preparing', 'project_id': 'b.acc', 'item_id': 'item-1',
             'acc_version_id': version, 'name': 'plano.dwg', 'checked_at': 0}
    node = {'v_id': 'docs-v1', 'gcs_urn': 'gcs-1', 'meta': {'acc_emergency_bridge': state}}
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state, 'name': 'plano.dwg',
                                                  'gcs_urn': 'gcs-1'})
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))
    monkeypatch.setattr(bridge.requests, 'get', lambda *_a, **_k: type('Response', (), {
        'status_code': 200, 'ok': True, 'json': lambda self: {'status': 'success'}})())
    linked = []
    import routes.docs_cad as cad
    monkeypatch.setattr(cad, '_guardar_acc_link', lambda _node, link: linked.append(link))
    monkeypatch.setattr(bridge, '_save_state', lambda *_: None)
    result, link = bridge.status_and_link(node)
    assert result['status'] == 'ready'
    assert base64.urlsafe_b64decode(link['viewer_urn'] + '==').decode() == version
    assert linked == [link]


def test_version_acc_lista_adelanta_manifiesto_global_pendiente(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    version = 'urn:adsk.wipprod:fs.file:vf.123?version=1'
    derivative_urn = base64.urlsafe_b64encode(version.encode()).decode().rstrip('=')
    state = {'status': 'preparing', 'project_id': 'b.acc', 'item_id': 'item-1',
             'acc_version_id': version, 'name': 'plano.dwg', 'checked_at': 0}
    node = {'v_id': 'docs-v1', 'meta': {'acc_emergency_bridge': state}}
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state, 'gcs_urn': 'gcs-1'})
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))
    calls = []

    def response(payload):
        return type('Response', (), {'status_code': 200, 'ok': True,
                                     'json': lambda self: payload})()

    def fake_get(url, **_kwargs):
        calls.append(url)
        if '/modelderivative/' in url:
            return response({'status': 'inprogress', 'derivatives': [
                {'outputType': 'svf', 'status': 'success'}]})
        assert '/data/v1/projects/b.acc/versions/' in url
        return response({'data': {'type': 'versions', 'id': version,
            'attributes': {'extension': {'data': {
                'processState': 'PROCESSING_COMPLETE', 'extractionState': 'SUCCESS'}}},
            'relationships': {'derivatives': {'data': {
                'type': 'derivatives', 'id': derivative_urn}}}}})

    monkeypatch.setattr(bridge.requests, 'get', fake_get)
    linked = []
    monkeypatch.setattr(cad, '_guardar_acc_link', lambda _node, link: linked.append(link))
    monkeypatch.setattr(bridge, '_save_state', lambda *_: None)
    result, link = bridge.status_and_link(node)
    assert result['status'] == 'ready'
    assert result['ready_signal'] == 'acc_version'
    assert link['viewer_urn'] == derivative_urn
    assert len(calls) == 2
    assert linked == [link]


def test_version_acc_incompleta_no_adelanta_vista(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    version = 'urn:adsk.wipprod:fs.file:vf.123?version=1'
    state = {'status': 'preparing', 'project_id': 'b.acc', 'item_id': 'item-1',
             'acc_version_id': version, 'name': 'plano.dwg', 'checked_at': 0}
    node = {'v_id': 'docs-v1', 'meta': {'acc_emergency_bridge': state}}
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state, 'gcs_urn': 'gcs-1'})
    monkeypatch.setattr(bridge, 'get_internal_token', lambda: ('token-simulado', None))

    def response(payload):
        return type('Response', (), {'status_code': 200, 'ok': True,
                                     'json': lambda self: payload})()

    def fake_get(url, **_kwargs):
        if '/modelderivative/' in url:
            return response({'status': 'inprogress'})
        return response({'data': {'type': 'versions', 'id': version,
            'attributes': {'extension': {'data': {
                'processState': 'PROCESSING_COMPLETE', 'extractionState': 'IN_PROGRESS'}}},
            'relationships': {'derivatives': {'data': {'type': 'derivatives',
                'id': 'derivative-urn'}}}}})

    monkeypatch.setattr(bridge.requests, 'get', fake_get)
    monkeypatch.setattr(cad, '_guardar_acc_link', lambda *_: (_ for _ in ()).throw(
        AssertionError('No se debe vincular una vista incompleta')))
    saved = []
    monkeypatch.setattr(bridge, '_save_state', lambda _v, value: saved.append(value.copy()))
    result, link = bridge.status_and_link(node)
    assert result['status'] == 'preparing'
    assert link is None
    assert saved[-1]['checked_at'] > 0


def test_configurar_y_apagar_solo_carpeta_sin_borrar_documentos(monkeypatch):
    local_id = 'd11dafff-64a4-43ff-b2b5-b3990ba6cf5c'
    app = Flask(__name__)
    app.register_blueprint(cad.docs_cad_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'role': 'admin'}))
    configs = []

    class FakeDb:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return self
        def execute(self, *_): pass
        def fetchone(self): return ('Carpeta ALEPHIA',)

    monkeypatch.setattr(cad, 'get_db_connection', lambda: FakeDb())
    monkeypatch.setattr(cad, '_acc_admin_guard', lambda _: None)
    monkeypatch.setattr(bridge, 'folder_bridge_config', lambda *_: configs[-1] if configs else None)
    monkeypatch.setattr(bridge, 'set_folder_bridge', lambda _id, _urn, value: configs.append(value) or True)
    monkeypatch.setattr(cad, '_acc_get', lambda _: ({'data': {'type': 'folders',
        'id': 'urn:adsk.wipprod:fs.folder:co.123',
        'attributes': {'displayName': 'Carpeta ACC'}}}, None))
    client = app.test_client()
    payload = {'local_folder_id': local_id, 'model_urn': 'obra', 'enabled': True,
               'project_id': 'b.acc', 'folder_id': 'urn:adsk.wipprod:fs.folder:co.123'}
    assert client.put('/api/docs/cad/acc-bridge/folder', json=payload).status_code == 200
    assert configs[-1]['enabled'] is True
    assert client.put('/api/docs/cad/acc-bridge/folder', json={
        'local_folder_id': local_id, 'model_urn': 'obra', 'enabled': False}).status_code == 200
    assert configs[-1]['enabled'] is False
    assert configs[-1]['folder_id'] == payload['folder_id']


def test_un_lector_no_configura_puente(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(cad.docs_cad_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 8, 'role': 'viewer'}))
    monkeypatch.setattr(cad, '_acc_admin_guard', lambda _: (jsonify(error='prohibido'), 403))
    client = app.test_client()
    assert client.get('/api/docs/cad/acc-bridge/folder').status_code == 403
    assert client.put('/api/docs/cad/acc-bridge/folder', json={}).status_code == 403


def test_cliente_antiguo_no_lanza_traduccion_de_version_con_puente(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(cad.docs_cad_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'role': 'admin'}))
    node = {'id': 'doc-1', 'name': 'plano.dwg', 'gcs_urn': 'gcs-1',
            'meta': {'acc_emergency_bridge': {'status': 'queued'}}}
    monkeypatch.setattr(cad, '_cargar', lambda *_: node)
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _: None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: (_ for _ in ()).throw(
        AssertionError('No debe pedir token para POST /job')))
    response = app.test_client().post('/api/docs/cad/translate', json={'node_id': 'doc-1'})
    assert response.status_code == 409
    assert 'puente temporal' in response.json['error']


def test_reintento_no_duplica_version_acc_incierta(monkeypatch):
    node = {'v_id': 'docs-v1'}
    saved = []
    scheduled = []
    monkeypatch.setattr(bridge, '_save_state', lambda _, value: saved.append(value.copy()))
    monkeypatch.setattr(bridge, 'schedule', scheduled.append)
    state = {'status': 'error', 'commit_attempted': True}
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state})
    assert bridge.retry_failed(node) is False
    assert saved == scheduled == []
    state = {'status': 'error', 'commit_attempted': False}
    monkeypatch.setattr(bridge, '_job', lambda _: {'state': state})
    assert bridge.retry_failed(node) is True
    assert saved[-1]['status'] == 'queued'
    assert scheduled == ['docs-v1']


def test_lista_cad_muestra_puente_y_concilia_sin_abrir_archivo(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    app = Flask(__name__)
    app.register_blueprint(cad.docs_cad_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'role': 'admin'}))
    import routes.documents as documents
    monkeypatch.setattr(documents, 'verify_project_access', lambda *_: True)

    bridge_meta = {'acc_emergency_bridge': {'status': 'preparing'}}
    normal_meta = {'cad': {'status': 'inprogress', 'started_at': 9999999999}}
    rows = [('bridge-node', 'plano.dwg', 'obra', bridge_meta),
            ('normal-node', 'otro.dwg', 'obra', normal_meta)]

    class FakeDb:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return self
        def execute(self, query, *_): self.versions = 'SELECT n.id::text, v.id' in query
        def fetchall(self):
            return [('bridge-node', 'version-1', 'gcs-1')] if self.versions else rows

    monkeypatch.setattr(cad, 'get_db_connection', lambda: FakeDb())
    monkeypatch.setattr(cad.time, 'time', lambda: 1000)
    queried = []

    def reconcile(node):
        queried.append(node['id'])

    monkeypatch.setattr(bridge, 'schedule_status_check', reconcile)
    client = app.test_client()
    payload = {'node_ids': ['bridge-node', 'normal-node']}
    first = client.post('/api/docs/cad/estados', json=payload)
    assert first.status_code == 200
    assert first.json['estados'] == {'bridge-node': 'procesando', 'normal-node': 'inprogress'}
    assert first.json['bridge_pending'] is True
    assert queried == ['bridge-node']

    # La conciliación en segundo plano persiste el estado; el siguiente poll
    # de la lista lo lee sin que el usuario abra el documento.
    rows[0] = (rows[0][0], rows[0][1], rows[0][2],
               {'acc_emergency_bridge': {'status': 'ready'}})
    second = client.post('/api/docs/cad/estados', json=payload)
    assert second.json['estados'] == {'bridge-node': 'success', 'normal-node': 'inprogress'}
    assert second.json['bridge_pending'] is False

    rows[0] = (rows[0][0], rows[0][1], rows[0][2], bridge_meta)
    monkeypatch.delenv('ACC_EMERGENCY_BRIDGE_ENABLED')
    monkeypatch.setattr(bridge, 'schedule_status_check', lambda _: (_ for _ in ()).throw(
        AssertionError('No debe consultar ACC con el puente apagado')))
    paused = client.post('/api/docs/cad/estados', json=payload)
    assert paused.json['estados'] == {'bridge-node': 'pausado', 'normal-node': 'inprogress'}
    assert paused.json['bridge_pending'] is False


def test_consulta_de_estado_en_segundo_plano_no_se_duplica(monkeypatch):
    monkeypatch.setenv('ACC_EMERGENCY_BRIDGE_ENABLED', 'true')
    node = {'v_id': 'version-status-test'}
    pending = []
    checked = []
    monkeypatch.setattr(bridge._STATUS_WORKERS, 'submit', pending.append)
    monkeypatch.setattr(bridge, 'status_and_link', lambda value: checked.append(value))
    bridge.schedule_status_check(node)
    bridge.schedule_status_check(node)
    assert len(pending) == 1
    pending.pop()()
    assert checked == [node]
    bridge.schedule_status_check(node)
    assert len(pending) == 1
    pending.pop()()
