"""Puente temporal, opt-in POR CARPETA, de ALEPHIA Docs a Autodesk Docs.

No sustituye la traduccion CAD normal. Sin una carpeta vinculada y habilitada,
ninguna de estas funciones se invoca durante una subida. La configuracion vive
en metadata de la carpeta y el trabajo en metadata de la version: no hay DDL ni
una segunda copia del proyecto ALEPHIA.
"""

import base64
import json
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock, Timer
from urllib.parse import quote

import requests

from aps import get_internal_token
from db import get_db_connection


APS_BASE = 'https://developer.api.autodesk.com'
_WORKERS = ThreadPoolExecutor(max_workers=1, thread_name_prefix='acc-bridge')
_STATUS_WORKERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix='acc-bridge-status')
_STATUS_IN_FLIGHT = set()
_STATUS_LOCK = Lock()
_READY_WATCHED = set()
_READY_WATCH_LOCK = Lock()
_READY_WATCH_LIMIT = 20
_READY_WATCH_SECONDS = 30 * 60
_STORAGE_ID = re.compile(r'^urn:adsk\.objects:os\.object:([^/]+)/(.+)$')
_AUTODESK_EXTENSIONS = ('.dwg', '.dxf', '.dwf', '.dwfx', '.rvt', '.rfa', '.nwd', '.nwc')


def is_bridge_candidate(filename):
    """El puente temporal es sólo para formatos de productos Autodesk."""
    return bool(filename) and str(filename).lower().endswith(_AUTODESK_EXTENSIONS)


def bridge_service_enabled():
    """Cortacircuito global: desplegar codigo nunca activa el puente solo."""
    return os.getenv('ACC_EMERGENCY_BRIDGE_ENABLED', '').lower() in ('1', 'true', 'yes')


def parallel_upload_enabled():
    """Segundo cortacircuito: el puente probado sigue siendo el fallback."""
    return bridge_service_enabled() and os.getenv('ACC_BRIDGE_PARALLEL_UPLOAD_ENABLED', '').lower() in ('1', 'true', 'yes')


def folder_bridge(folder_id, model_urn):
    """Solo la carpeta exacta, nunca un ancestro: opt-in sin efectos sorpresa."""
    if not bridge_service_enabled():
        return None
    bridge = folder_bridge_config(folder_id, model_urn)
    if bridge and bridge.get('enabled') is True and not (bridge.get('project_id') and bridge.get('folder_id')):
        raise RuntimeError('El puente de esta carpeta esta incompleto; no se confirma el CAD')
    return bridge if bridge and bridge.get('enabled') is True else None


def bridge_for_upload(folder_id, model_urn, filename):
    if not bridge_service_enabled() or not folder_id or not is_bridge_candidate(filename):
        return None
    return folder_bridge(folder_id, model_urn)


def folder_bridge_config(folder_id, model_urn):
    """Devuelve tambien la configuracion apagada para mostrar el interruptor."""
    if not folder_id or not model_urn:
        return None
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT metadata->'acc_emergency_bridge'
                       FROM file_nodes WHERE id = %s AND model_urn = %s
                         AND node_type = 'FOLDER' AND is_deleted = FALSE""",
                    (folder_id, model_urn))
        row = cur.fetchone()
    bridge = row[0] if row and isinstance(row[0], dict) else None
    return bridge


def set_folder_bridge(folder_id, model_urn, bridge):
    """Guarda o apaga el interruptor. Desactivar NO elimina enlaces historicos."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE file_nodes
                       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb),
                           '{acc_emergency_bridge}', %s::jsonb, true),
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = %s AND model_urn = %s AND node_type = 'FOLDER'
                         AND is_deleted = FALSE RETURNING id""",
                    (json.dumps(bridge), folder_id, model_urn))
        changed = bool(cur.fetchone())
        conn.commit()
    return changed


def initial_job(bridge, gcs_urn, filename, direct_storage_id=None):
    job = {'status': 'queued', 'gcs_urn': gcs_urn, 'name': filename,
            'project_id': bridge['project_id'], 'folder_id': bridge['folder_id'],
            'queued_at': int(time.time()), 'attempts': 0}
    if direct_storage_id:
        job.update(direct_upload=True, storage_id=direct_storage_id)
    return job


def prepare_parallel_upload(upload_id, bridge, filename, size_bytes):
    """URL(s) S3 de un solo archivo; nunca se envía el token APS al navegador."""
    if not parallel_upload_enabled():
        return None
    from enlaces_firmados import emitir, PROPOSITO_ACC_UPLOAD
    from routes.docs_cad import PART_SIZE
    token, error = get_internal_token()
    if error or not token:
        raise RuntimeError('No se obtuvo autorización APS')
    project_id = bridge['project_id']
    folder_id = bridge['folder_id']
    storage = _aps_request('POST', 'data/v1/projects/%s/storage' % _segment(project_id),
                           token, _payload_storage(folder_id, filename))
    storage_id = (storage.get('data') or {}).get('id') or ''
    match = _STORAGE_ID.fullmatch(storage_id)
    if not match:
        raise RuntimeError('ACC no devolvió una ubicación de almacenamiento válida')
    parts = max(1, (size_bytes + PART_SIZE - 1) // PART_SIZE)
    if parts > 25:
        raise RuntimeError('El CAD excede el máximo de partes del puente temporal')
    response = requests.get(
        '%s/oss/v2/buckets/%s/objects/%s/signeds3upload?parts=%d&minutesExpiration=60'
        % (APS_BASE, quote(match.group(1), safe=''), quote(match.group(2), safe=''), parts),
        headers={'Authorization': 'Bearer ' + token}, timeout=60)
    if not response.ok:
        raise RuntimeError('No se pudo preparar la subida directa ACC')
    info = response.json()
    urls = info.get('urls') or []
    upload_key = info.get('uploadKey')
    if len(urls) != parts or not upload_key:
        raise RuntimeError('ACC devolvió un plan de subida incompleto')
    ticket = emitir(PROPOSITO_ACC_UPLOAD, {
        'upload_id': str(upload_id), 'project_id': project_id, 'folder_id': folder_id,
        'filename': filename, 'size_bytes': size_bytes, 'storage_id': storage_id,
        'upload_key': upload_key,
    })
    return {'urls': urls, 'partSize': PART_SIZE, 'ticket': ticket}


def finish_parallel_upload(ticket, upload_id, bridge, filename, size_bytes):
    """Confirma S3 sólo para la sesión/carpeta firmada; error => copia GCS normal."""
    if not ticket or not parallel_upload_enabled():
        return None
    from enlaces_firmados import leer, PROPOSITO_ACC_UPLOAD
    plan, error = leer(PROPOSITO_ACC_UPLOAD, ticket)
    if error or not isinstance(plan, dict):
        return None
    if (plan.get('upload_id') != str(upload_id) or
            plan.get('project_id') != bridge['project_id'] or
            plan.get('folder_id') != bridge['folder_id'] or
            plan.get('filename') != filename or
            plan.get('size_bytes') != size_bytes):
        return None
    storage_id = plan.get('storage_id') or ''
    match = _STORAGE_ID.fullmatch(storage_id)
    if not match or not plan.get('upload_key'):
        return None
    token, error = get_internal_token()
    if error or not token:
        return None
    try:
        response = requests.post(
            '%s/oss/v2/buckets/%s/objects/%s/signeds3upload'
            % (APS_BASE, quote(match.group(1), safe=''), quote(match.group(2), safe='')),
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
            json={'uploadKey': plan['upload_key']}, timeout=300)
        if response.ok and response.json().get('objectId') == storage_id:
            return storage_id
    except (requests.RequestException, ValueError):
        pass
    return None


def record_job_in_version(cur, version_id, job):
    """Se llama DENTRO de la transaccion que crea la version Docs."""
    cur.execute("""UPDATE file_versions SET metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb), '{acc_emergency_bridge}',
                   %s::jsonb, true) WHERE id = %s""", (json.dumps(job), version_id))


def _job(version_id):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT v.metadata->'acc_emergency_bridge', v.file_node_id,
                              n.name, n.model_urn, v.gcs_urn
                       FROM file_versions v JOIN file_nodes n ON n.id = v.file_node_id
                       WHERE v.id = %s AND n.is_deleted = FALSE""", (version_id,))
        row = cur.fetchone()
    if not row or not isinstance(row[0], dict) or row[0].get('gcs_urn') != row[4]:
        return None
    return {'state': row[0], 'node_id': row[1], 'name': row[2],
            'model_urn': row[3], 'gcs_urn': row[4]}


def _save_state(version_id, state):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE file_versions SET metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb), '{acc_emergency_bridge}',
                   %s::jsonb, true) WHERE id = %s""", (json.dumps(state), version_id))
        conn.commit()


def _claim(version_id):
    """Una sola instancia toma el trabajo; una falla no reintenta a ciegas."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE file_versions
                       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb),
                           '{acc_emergency_bridge}',
                           (metadata->'acc_emergency_bridge') ||
                           jsonb_build_object('status', 'uploading',
                                              'started_at', extract(epoch from now())::bigint,
                                              'attempts', COALESCE((metadata->'acc_emergency_bridge'->>'attempts')::int, 0) + 1),
                           true)
                       WHERE id = %s AND metadata->'acc_emergency_bridge'->>'status' = 'queued'
                       RETURNING metadata->'acc_emergency_bridge'""", (version_id,))
        row = cur.fetchone()
        conn.commit()
    return row[0] if row else None


def schedule(version_id):
    """La cola es durable en PostgreSQL; el hilo solo despierta el trabajo."""
    if bridge_service_enabled():
        _WORKERS.submit(process, str(version_id))


def schedule_status_check(node):
    """Concilia el manifiesto fuera del GET de carpeta, sin bloquear la lista."""
    version_id = node.get('v_id')
    if not version_id or not bridge_service_enabled():
        return
    with _STATUS_LOCK:
        if version_id in _STATUS_IN_FLIGHT:
            return
        _STATUS_IN_FLIGHT.add(version_id)

    def run():
        try:
            status_and_link(node)
        finally:
            with _STATUS_LOCK:
                _STATUS_IN_FLIGHT.discard(version_id)

    try:
        _STATUS_WORKERS.submit(run)
    except RuntimeError:
        with _STATUS_LOCK:
            _STATUS_IN_FLIGHT.discard(version_id)


def schedule_ready_watch(version_id):
    """Concilia una vista nueva aun si la pestaña Docs queda en segundo plano.

    Sondeo acotado: cada 15 s los primeros 5 min y cada 30 s después,
    durante 30 min como máximo. La consulta de la página sigue como respaldo.
    """
    if not bridge_service_enabled():
        return
    version_id = str(version_id)
    with _READY_WATCH_LOCK:
        if version_id in _READY_WATCHED or len(_READY_WATCHED) >= _READY_WATCH_LIMIT:
            return
        _READY_WATCHED.add(version_id)
    started = time.monotonic()

    def check():
        try:
            if bridge_service_enabled():
                job = _job(version_id)
                if job and job['state'].get('status') == 'preparing':
                    node = {'id': job['node_id'], 'v_id': version_id,
                            'gcs_urn': job['gcs_urn'],
                            'meta': {'acc_emergency_bridge': job['state']}}
                    state, _ = status_and_link(node)
                    if state and state.get('status') == 'preparing':
                        elapsed = time.monotonic() - started
                        delay = 15 if elapsed < 5 * 60 else 30
                        if elapsed + delay < _READY_WATCH_SECONDS:
                            arm(delay)
                            return
        except Exception:
            # Una caída puntual de red/DB no debe dejar la vista huérfana.
            elapsed = time.monotonic() - started
            if elapsed + 30 < _READY_WATCH_SECONDS:
                arm(30)
                return
        with _READY_WATCH_LOCK:
            _READY_WATCHED.discard(version_id)

    def arm(delay):
        timer = Timer(delay, check)
        timer.daemon = True
        timer.start()

    try:
        arm(15)
    except Exception:
        with _READY_WATCH_LOCK:
            _READY_WATCHED.discard(version_id)


def dispatch_cad_after_upload(filename, node_id, bridge=None, bridge_version_id=None):
    """Una unica bifurcacion; la traduccion historica sigue siendo el default."""
    if not is_bridge_candidate(filename):
        return
    if bridge:
        schedule(bridge_version_id)
    else:
        from routes.docs_cad import encolar_pretraduccion
        encolar_pretraduccion(node_id, vistas_pdf=filename.lower().endswith('.dwg'))


def _aps_request(method, path, token, payload=None):
    headers = {'Authorization': 'Bearer ' + token,
               'Accept': 'application/vnd.api+json'}
    if payload is not None:
        headers['Content-Type'] = 'application/vnd.api+json'
    response = requests.request(method, APS_BASE + '/' + path,
                                headers=headers, json=payload, timeout=60)
    if not response.ok:
        raise RuntimeError('Autodesk rechazo %s (%s)' % (method, response.status_code))
    return response.json()


def _segment(value):
    value = str(value or '')
    if not value or len(value) > 512 or any(ord(c) < 32 for c in value):
        raise ValueError('Identificador ACC invalido')
    return quote(value, safe='')


def _payload_storage(folder_id, filename):
    return {'jsonapi': {'version': '1.0'}, 'data': {
        'type': 'objects', 'attributes': {'name': filename},
        'relationships': {'target': {'data': {'type': 'folders', 'id': folder_id}}}}}


def _payload_item(folder_id, filename, object_id):
    extension = {'type': 'items:autodesk.bim360:File', 'version': '1.0'}
    version_ext = {'type': 'versions:autodesk.bim360:File', 'version': '1.0'}
    return {'jsonapi': {'version': '1.0'}, 'data': {
        'type': 'items', 'attributes': {'displayName': filename, 'extension': extension},
        'relationships': {'tip': {'data': {'type': 'versions', 'id': '1'}},
                          'parent': {'data': {'type': 'folders', 'id': folder_id}}}},
        'included': [{'type': 'versions', 'id': '1',
                      'attributes': {'name': filename, 'extension': version_ext},
                      'relationships': {'storage': {'data': {'type': 'objects', 'id': object_id}}}}]}


def _payload_version(item_id, filename, object_id):
    return {'jsonapi': {'version': '1.0'}, 'data': {
        'type': 'versions', 'attributes': {'name': filename,
            'extension': {'type': 'versions:autodesk.bim360:File', 'version': '1.0'}},
        'relationships': {'item': {'data': {'type': 'items', 'id': item_id}},
                          'storage': {'data': {'type': 'objects', 'id': object_id}}}}}


def _previous_acc_item(node_id, version_id, project_id, folder_id):
    """Reutiliza el linaje ACC sólo dentro del destino actual de la carpeta.

    Al cambiar la pareja de carpetas, las versiones antiguas conservan su
    vínculo histórico, pero una versión nueva debe crear un item en el nuevo
    destino y nunca escribir en el anterior.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT metadata->'acc_emergency_bridge'->>'item_id'
                       FROM file_versions WHERE file_node_id = %s AND id <> %s
                         AND metadata->'acc_emergency_bridge'->>'project_id' = %s
                         AND metadata->'acc_emergency_bridge'->>'folder_id' = %s
                         AND metadata->'acc_emergency_bridge'->>'item_id' IS NOT NULL
                       ORDER BY version_number DESC LIMIT 1""",
                    (node_id, version_id, project_id, folder_id))
        row = cur.fetchone()
    return row[0] if row else None


def _new_version_id(result, item_id, project_id, token, object_id):
    for entry in result.get('included') or []:
        if entry.get('type') == 'versions' and entry.get('id') not in (None, '1'):
            return entry['id']
    tip = (((result.get('data') or {}).get('relationships') or {}).get('tip') or {}).get('data') or {}
    if tip.get('id') not in (None, '1'):
        return tip['id']
    versions = _aps_request('GET', 'data/v1/projects/%s/items/%s/versions' %
                            (_segment(project_id), _segment(item_id)), token)
    for entry in versions.get('data') or []:
        storage = (((entry.get('relationships') or {}).get('storage') or {}).get('data') or {}).get('id')
        if storage == object_id:
            return entry.get('id')
    raise RuntimeError('ACC creo el archivo pero no devolvio su version; requiere conciliacion manual')


def process(version_id):
    """Sube una version a ACC sin llamar a Model Derivative POST /job."""
    if not bridge_service_enabled():
        return
    state = _claim(version_id)
    if not state:
        return
    try:
        job = _job(version_id)
        if not job:
            raise RuntimeError('La version Docs ya no coincide con el trabajo')
        token, error = get_internal_token()
        if error or not token:
            raise RuntimeError('No se obtuvo autorizacion APS')
        project_id = state['project_id']
        folder_id = state['folder_id']
        filename = state['name']
        item_id = _previous_acc_item(job['node_id'], version_id, project_id, folder_id)
        if item_id:
            existing = _aps_request('GET', 'data/v1/projects/%s/items/%s' %
                                    (_segment(project_id), _segment(item_id)), token)
            item = existing.get('data') or {}
            parent = (((item.get('relationships') or {}).get('parent') or {}).get('data') or {}).get('id')
            existing_name = (item.get('attributes') or {}).get('displayName')
            if parent != folder_id or existing_name != filename:
                raise RuntimeError('El item ACC previo no pertenece a esta carpeta o tiene otro nombre')
        if state.get('direct_upload'):
            storage_id = state.get('storage_id') or ''
            if not _STORAGE_ID.fullmatch(storage_id):
                raise RuntimeError('La subida directa ACC no tiene almacenamiento válido')
        else:
            storage = _aps_request('POST', 'data/v1/projects/%s/storage' % _segment(project_id),
                                   token, _payload_storage(folder_id, filename))
            storage_id = (storage.get('data') or {}).get('id') or ''
            match = _STORAGE_ID.fullmatch(storage_id)
            if not match:
                raise RuntimeError('ACC no devolvio una ubicacion de almacenamiento valida')
            from gcs_manager import descargar_a_fichero
            from routes.docs_cad import _upload_to_oss
            with tempfile.TemporaryFile() as tmp:
                state['gcs_download_started_at'] = int(time.time())
                size = descargar_a_fichero(job['gcs_urn'], tmp)
                state['gcs_download_finished_at'] = int(time.time())
                if not size:
                    raise RuntimeError('El original de ALEPHIA esta vacio')
                tmp.seek(0)
                state['acc_transfer_started_at'] = int(time.time())
                uploaded, upload_error = _upload_to_oss(token, match.group(1), match.group(2), tmp, size=size)
                state['acc_transfer_finished_at'] = int(time.time())
            if upload_error or uploaded != storage_id:
                raise RuntimeError('ACC no acepto la copia del original')
        # A partir del siguiente POST el desenlace remoto podria ser incierto
        # si se corta la conexion. Bloquear reintento automatico evita crear
        # una segunda version del documento en ACC.
        state.update(storage_id=storage_id, commit_attempted=True)
        _save_state(version_id, state)
        if item_id:
            result = _aps_request('POST', 'data/v1/projects/%s/versions' % _segment(project_id),
                                  token, _payload_version(item_id, filename, storage_id))
            acc_version_id = (result.get('data') or {}).get('id')
        else:
            # Un nombre que ya existe en ACC no se sobreescribe sin un vinculo
            # previo explicito: podria ser otro documento de otra persona.
            result = _aps_request('POST', 'data/v1/projects/%s/items' % _segment(project_id),
                                  token, _payload_item(folder_id, filename, storage_id))
            item_id = (result.get('data') or {}).get('id')
            acc_version_id = _new_version_id(result, item_id, project_id, token, storage_id)
        if not item_id or not acc_version_id:
            raise RuntimeError('ACC no devolvio el archivo y version creados')
        state.update(status='preparing', item_id=item_id, acc_version_id=acc_version_id,
                     storage_id=storage_id, uploaded_at=int(time.time()))
        _save_state(version_id, state)
        schedule_ready_watch(version_id)
    except Exception as exc:
        # Nunca registrar URL firmada, token ni cuerpo de error remoto.
        state.update(status='error', error=str(exc)[:180], failed_at=int(time.time()))
        _save_state(version_id, state)


def _acc_ready_derivative(state, token):
    """Usa la señal de Docs ACC de que esta versión ya tiene vista abrible.

    El manifiesto global puede seguir en progreso por otros derivados. Sólo
    aceptamos la versión exacta, extracción exitosa y URN de derivado entregado
    por Data Management; una respuesta parcial no adelanta el vínculo.
    """
    path = 'data/v1/projects/%s/versions/%s' % (
        _segment(state['project_id']), _segment(state['acc_version_id']))
    try:
        response = requests.get('%s/%s' % (APS_BASE, path),
                                headers={'Authorization': 'Bearer ' + token,
                                         'Accept': 'application/vnd.api+json'}, timeout=10)
        if not response.ok:
            return None
        version = (response.json() or {}).get('data') or {}
        if version.get('type') != 'versions' or version.get('id') != state['acc_version_id']:
            return None
        data = (((version.get('attributes') or {}).get('extension') or {}).get('data') or {})
        if (data.get('processState') != 'PROCESSING_COMPLETE' or
                data.get('extractionState') != 'SUCCESS'):
            return None
        derivative = (((version.get('relationships') or {}).get('derivatives') or {}).get('data') or {})
        urn = derivative.get('id') or ''
        if derivative.get('type') != 'derivatives' or not re.fullmatch(r'[A-Za-z0-9_-]+', urn):
            return None
        return urn
    except (requests.RequestException, ValueError, TypeError):
        return None


def status_and_link(node):
    """Consulta estado sin reintentar un POST. Link solo cuando ACC termino."""
    version_id = node.get('v_id')
    if not version_id or not (node.get('meta') or {}).get('acc_emergency_bridge'):
        return None, None
    job = _job(version_id)
    if not job:
        return None, None
    state = job['state']
    if state['status'] == 'queued':
        schedule(version_id)
    if not bridge_service_enabled():
        return {**state, 'paused': True}, None
    if (state['status'] == 'uploading' and
            time.time() - state.get('started_at', time.time()) > 6 * 60 * 60):
        state.update(status='error', error='El envio a ACC quedo sin confirmacion; revisar antes de reintentar',
                     manual_review_required=True, failed_at=int(time.time()))
        _save_state(version_id, state)
        return state, None
    if state['status'] != 'preparing':
        return state, None
    if time.time() - state.get('uploaded_at', time.time()) > 24 * 60 * 60:
        state.update(status='error', error='ACC no preparo la vista en 24 horas; revisar el archivo en ACC',
                     failed_at=int(time.time()))
        _save_state(version_id, state)
        return state, None
    if time.time() - state.get('checked_at', 0) < 15:
        return state, None
    token, error = get_internal_token()
    if error or not token:
        return state, None
    urn = base64.urlsafe_b64encode(state['acc_version_id'].encode()).decode().rstrip('=')
    try:
        response = requests.get('%s/modelderivative/v2/designdata/%s/manifest' % (APS_BASE, urn),
                                headers={'Authorization': 'Bearer ' + token}, timeout=30)
        if response.status_code == 404:
            state['checked_at'] = int(time.time())
            _save_state(version_id, state)
            return state, None
        if not response.ok:
            return state, None
        manifest = response.json()
        if manifest.get('status') in ('failed', 'timeout'):
            state.update(status='error', error='ACC no pudo preparar esta version',
                         failed_at=int(time.time()))
            _save_state(version_id, state)
            return state, None
        ready_signal = 'manifest'
        if manifest.get('status') != 'success':
            # ACC puede ofrecer ya una vista mientras el manifiesto global
            # sigue procesando otros derivados. No basta con que exista el
            # archivo: la versión debe confirmar extracción y derivado.
            ready_urn = _acc_ready_derivative(state, token)
            if ready_urn:
                urn = ready_urn
                ready_signal = 'acc_version'
        if manifest.get('status') != 'success' and ready_signal != 'acc_version':
            state['checked_at'] = int(time.time())
            _save_state(version_id, state)
            return state, None
        link = {'project_id': state['project_id'], 'item_id': state['item_id'],
                'version_id': state['acc_version_id'], 'version_number': None,
                'name': state['name'], 'viewer_urn': urn, 'gcs_urn': job['gcs_urn'],
                'linked_at': int(time.time()), 'source': 'emergency_folder_bridge'}
        from routes.docs_cad import _guardar_acc_link
        _guardar_acc_link(node, link)
        state.update(status='ready', ready_at=int(time.time()), ready_signal=ready_signal)
        _save_state(version_id, state)
        return state, link
    except (requests.RequestException, ValueError):
        return state, None


def retry_failed(node):
    """Solo antes de crear version ACC; una fase remota incierta no se duplica."""
    job = _job(node.get('v_id'))
    if not job or job['state'].get('status') != 'error':
        return False
    state = job['state']
    if state.get('commit_attempted') or state.get('manual_review_required'):
        return False
    state.pop('error', None)
    state['status'] = 'queued'
    _save_state(node['v_id'], state)
    schedule(node['v_id'])
    return True
