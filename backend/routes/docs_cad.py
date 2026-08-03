"""Ver archivos CAD (DWG, Civil 3D, RVT, IFC...) dentro del CDE de Documentos.

Los archivos de Docs viven en Google Cloud Storage. El visor de Autodesk no sabe
leer un DWG: solo lee SVF/SVF2, el formato que produce Model Derivative. Es lo
mismo que hace ACC por dentro — cuando subes un DWG, Autodesk lo traduce en
segundo plano y luego lo muestra con este mismo visor.

Asi que el camino es: GCS -> bucket OSS de APS -> traduccion -> URN -> visor.

La traduccion se lanza BAJO DEMANDA, al pulsar "Ver", no al subir: solo se
gastan creditos en los archivos que alguien abre de verdad. El resultado queda
guardado en file_versions.metadata (columna JSONB que ya existia), de modo que
la segunda apertura es inmediata y no hizo falta ninguna migracion de esquema.

Se guarda POR VERSION a proposito: una version nueva del DWG es otro archivo y
hay que volver a traducirla.
"""
import base64
import json
import os
import time

import requests
from flask import Blueprint, request, jsonify, g

from aps import get_internal_token
from db import get_db_connection
from gcs_manager import get_blob_data

docs_cad_bp = Blueprint('docs_cad', __name__)

APS_BASE = 'https://developer.api.autodesk.com'

# Formatos que Model Derivative sabe traducir y que aparecen en una obra civil.
CAD_EXTENSIONS = (
    '.dwg', '.dxf', '.dwf', '.dwfx',          # AutoCAD / Civil 3D
    '.rvt', '.rfa',                            # Revit
    '.ifc',                                    # IFC / openBIM
    '.nwd', '.nwc',                            # Navisworks
    '.dgn',                                    # MicroStation
    '.3dm', '.sat', '.step', '.stp', '.iges', '.igs',
    '.obj', '.fbx', '.stl',
)

# Traducciones que superan esto se dan por perdidas y se pueden relanzar.
STALE_SECONDS = 60 * 60


def is_cad_file(name):
    return bool(name) and name.lower().endswith(CAD_EXTENSIONS)


def _bucket_key():
    """Bucket propio, derivado del client id (los buckets son globales en APS)."""
    cid = (os.getenv('APS_CLIENT_ID') or 'ecd').lower()
    safe = ''.join(ch for ch in cid if ch.isalnum())[:18]
    return os.getenv('APS_DOCS_BUCKET') or ('ecd-docs-cad-%s' % safe)


def _headers(token, extra=None):
    h = {'Authorization': 'Bearer %s' % token}
    if extra:
        h.update(extra)
    return h


def _ensure_bucket(token):
    """Crea el bucket si no existe. 409 = ya estaba, que es exito."""
    key = _bucket_key()
    r = requests.post(
        '%s/oss/v2/buckets' % APS_BASE,
        headers=_headers(token, {'Content-Type': 'application/json'}),
        json={'bucketKey': key, 'policyKey': 'persistent'},
        timeout=30)
    if r.status_code in (200, 409):
        return key, None
    return None, 'No se pudo preparar el bucket APS: %s' % r.text[:200]


def _upload_to_oss(token, bucket, object_key, data):
    """Sube por S3 firmado (la subida directa a OSS esta descontinuada).

    Tres pasos: pedir URL firmada, PUT a S3, y confirmar a APS.
    """
    r = requests.get(
        '%s/oss/v2/buckets/%s/objects/%s/signeds3upload' % (APS_BASE, bucket, object_key),
        headers=_headers(token), timeout=30)
    if not r.ok:
        return None, 'No se pudo pedir la URL de subida: %s' % r.text[:200]
    info = r.json()
    urls = info.get('urls') or []
    if not urls:
        return None, 'APS no devolvio URL de subida'

    put = requests.put(urls[0], data=data, timeout=900)
    if not put.ok:
        return None, 'Fallo la subida del archivo a APS (%s)' % put.status_code

    done = requests.post(
        '%s/oss/v2/buckets/%s/objects/%s/signeds3upload' % (APS_BASE, bucket, object_key),
        headers=_headers(token, {'Content-Type': 'application/json'}),
        json={'uploadKey': info.get('uploadKey')}, timeout=120)
    if not done.ok:
        return None, 'APS rechazo el cierre de la subida: %s' % done.text[:200]

    obj = done.json()
    return obj.get('objectId'), None


def _urn_of(object_id):
    """URN en base64 sin relleno, que es lo que espera Model Derivative."""
    return base64.b64encode(object_id.encode('utf-8')).decode('utf-8').rstrip('=')


def _start_translation(token, urn, force=False):
    """Lanza la traduccion a SVF2 (2D y 3D).

    SIN forzar por defecto. Con `x-ads-force` cada peticion rehace el trabajo
    desde cero, y dos llamadas casi simultaneas chocaban con un 409 Conflict
    ("conflicts with a previous request that is in-progress"): la primera
    traducia bien y la segunda devolvia error. Sin forzar, una llamada
    repetida sobre un trabajo ya lanzado responde 200 y se limita a informar
    del que ya existe — que es justo lo que queremos.

    rootFilename + compressedUrn irian aqui si algun dia se aceptan ZIP con
    referencias externas (xrefs de Civil). Por ahora, archivo suelto.
    """
    payload = {
        'input': {'urn': urn},
        'output': {
            'destination': {'region': 'us'},
            'formats': [{'type': 'svf2', 'views': ['2d', '3d']}],
        },
    }
    cabeceras = {'Content-Type': 'application/json'}
    if force:
        cabeceras['x-ads-force'] = 'true'
    r = requests.post(
        '%s/modelderivative/v2/designdata/job' % APS_BASE,
        headers=_headers(token, cabeceras), json=payload, timeout=60)
    # 409 = ya hay un trabajo en marcha para este mismo archivo. No es un fallo:
    # es exactamente el estado que buscabamos.
    if r.status_code == 409:
        return {'result': 'in-progress'}, None
    if r.status_code not in (200, 201):
        return None, 'Model Derivative rechazo el trabajo: %s' % r.text[:200]
    return r.json(), None


def _manifest(token, urn):
    r = requests.get(
        '%s/modelderivative/v2/designdata/%s/manifest' % (APS_BASE, urn),
        headers=_headers(token), timeout=30)
    if r.status_code == 404:
        return None, None                     # aun no hay manifiesto: recien lanzado
    if not r.ok:
        return None, 'No se pudo leer el estado: %s' % r.text[:200]
    return r.json(), None


def _object_key_for(node):
    """Clave estable del objeto en APS para esta VERSION del archivo."""
    ext = os.path.splitext(node['name'])[1].lower()
    return 'docs-%s%s' % (node['v_id'] or node['id'], ext)


def _urn_for(node, bucket):
    """URN deducido de bucket + clave. Deterministico.

    Antes el URN se guardaba en la base y esa copia era la fuente de verdad;
    si una escritura fallida la pisaba, el archivo quedaba inalcanzable aunque
    Autodesk ya lo hubiera traducido. Ahora se recalcula siempre y la fuente de
    verdad es el manifiesto de APS. La base solo cachea el estado.
    """
    return _urn_of('urn:adsk.objects:os.object:%s/%s' % (bucket, _object_key_for(node)))


# ── Persistencia: la traduccion se guarda en la VERSION, no en el nodo ──────
def _load_node(node_id):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT n.id, n.name, n.model_urn, n.gcs_urn, n.current_version_id,
                   -- El metadato puede estar en la version o, en archivos
                   -- antiguos sin versionar, en el propio nodo. Se fusionan con
                   -- la version a la derecha, que es la que manda.
                   COALESCE(n.metadata, '{}'::jsonb) || COALESCE(v.metadata, '{}'::jsonb),
                   v.id
            FROM file_nodes n
            LEFT JOIN file_versions v ON v.id = n.current_version_id
            WHERE n.id = %s AND n.is_deleted = FALSE
        """, (node_id,))
        row = cur.fetchone()
    if not row:
        return None
    return {
        'id': row[0], 'name': row[1], 'model_urn': row[2], 'gcs_urn': row[3],
        'version_id': row[4], 'meta': row[5] or {}, 'v_id': row[6],
    }


def _save_cad_meta(node, patch):
    """Guarda el estado de traduccion. Si el nodo no tiene fila de version
    (archivos antiguos, anteriores al versionado), cae al propio nodo."""
    meta = dict(node['meta'].get('cad') or {})
    meta.update(patch)
    with get_db_connection() as conn:
        cur = conn.cursor()
        if node['v_id']:
            cur.execute(
                "UPDATE file_versions SET metadata = COALESCE(metadata,'{}'::jsonb) "
                "|| jsonb_build_object('cad', %s::jsonb) WHERE id = %s",
                (json.dumps(meta), node['v_id']))
        else:
            cur.execute(
                "UPDATE file_nodes SET metadata = COALESCE(metadata,'{}'::jsonb) "
                "|| jsonb_build_object('cad', %s::jsonb) WHERE id = %s",
                (json.dumps(meta), node['id']))
        conn.commit()
    return meta


@docs_cad_bp.route('/api/docs/cad/translate', methods=['POST'])
def translate_cad():
    """Prepara un CAD para verse: lo sube a APS y lanza la traduccion.

    Es idempotente: si ya esta traducido devuelve el URN sin gastar nada, y si
    hay una traduccion en curso informa del progreso en vez de duplicarla.
    """
    data = request.get_json(silent=True) or {}
    node_id = data.get('node_id')
    if not node_id:
        return jsonify({'success': False, 'error': 'Falta node_id'}), 400

    node = _load_node(node_id)
    if not node:
        return jsonify({'success': False, 'error': 'Archivo no encontrado'}), 404
    if not is_cad_file(node['name']):
        return jsonify({'success': False, 'error': 'Este archivo no es CAD'}), 400
    if not node['gcs_urn']:
        return jsonify({'success': False, 'error': 'El archivo no tiene contenido'}), 400

    forzar = bool(data.get('force'))

    token, error = get_internal_token()
    if error or not token:
        return jsonify({'success': False, 'error': 'Sin credenciales APS'}), 502

    bucket, error = _ensure_bucket(token)
    if error:
        return jsonify({'success': False, 'error': error}), 502

    urn = _urn_for(node, bucket)

    # Lo primero: preguntarle a APS. Si ya esta traducido —o traduciendose— no
    # se sube nada ni se lanza nada. Esto hace la llamada idempotente aunque
    # entren dos a la vez, que es lo que rompia antes.
    if not forzar:
        manifest, _err = _manifest(token, urn)
        if manifest:
            estado = manifest.get('status')
            if estado == 'success':
                _save_cad_meta(node, {'urn': urn, 'status': 'success'})
                return jsonify({'success': True, 'status': 'success', 'urn': urn, 'cached': True})
            if estado in ('inprogress', 'pending'):
                _save_cad_meta(node, {'urn': urn, 'status': 'inprogress'})
                return jsonify({'success': True, 'status': 'inprogress',
                                'progress': manifest.get('progress', ''), 'urn': urn})

    try:
        content, _ctype = get_blob_data(node['gcs_urn'])
    except Exception as e:
        return jsonify({'success': False, 'error': 'No se pudo leer de GCS: %s' % e}), 502
    if not content:
        return jsonify({'success': False, 'error': 'El archivo esta vacio en GCS'}), 400

    # Clave estable por version: re-traducir sobrescribe en vez de acumular.
    object_key = _object_key_for(node)

    object_id, error = _upload_to_oss(token, bucket, object_key, content)
    if error:
        return jsonify({'success': False, 'error': error}), 502

    # El URN se guarda ANTES de lanzar el trabajo. Si el trabajo fallara, el
    # URN sigue ahi y el estado se puede consultar: un fallo no deja el archivo
    # inalcanzable, que es lo que pasaba cuando el error borraba el URN.
    urn = _urn_of(object_id)
    _save_cad_meta(node, {'urn': urn, 'status': 'inprogress',
                          'started_at': time.time(), 'object_key': object_key, 'error': None})

    _job, error = _start_translation(token, urn, force=forzar)
    if error:
        _save_cad_meta(node, {'status': 'failed', 'error': error})
        return jsonify({'success': False, 'error': error}), 502

    return jsonify({'success': True, 'status': 'inprogress', 'urn': urn})


@docs_cad_bp.route('/api/docs/cad/status', methods=['GET'])
def cad_status():
    """Progreso de la traduccion. El frontend consulta esto mientras espera."""
    node_id = request.args.get('node_id')
    if not node_id:
        return jsonify({'success': False, 'error': 'Falta node_id'}), 400

    node = _load_node(node_id)
    if not node:
        return jsonify({'success': False, 'error': 'Archivo no encontrado'}), 404

    cad = node['meta'].get('cad') or {}

    token, error = get_internal_token()
    if error or not token:
        return jsonify({'success': False, 'error': 'Sin credenciales APS'}), 502

    # Se deriva del bucket + version: aunque la base tenga basura de un intento
    # anterior, el estado real se puede consultar igualmente.
    urn = cad.get('urn') or _urn_for(node, _bucket_key())

    manifest, error = _manifest(token, urn)
    if error:
        return jsonify({'success': False, 'error': error}), 502
    if manifest is None:
        return jsonify({'success': True, 'status': 'inprogress', 'progress': '0%', 'urn': urn})

    status = manifest.get('status', 'inprogress')
    progress = manifest.get('progress', '')
    if status in ('success', 'failed', 'timeout') and cad.get('status') != status:
        # 'success' con mensajes de aviso es normal en Civil 3D: los objetos
        # propios de Civil se traducen como graficos proxy.
        _save_cad_meta(node, {'status': status, 'finished_at': time.time()})

    return jsonify({'success': True, 'status': status, 'progress': progress, 'urn': urn})
