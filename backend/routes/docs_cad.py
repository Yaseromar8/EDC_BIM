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
import tempfile
import time
import zipfile

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

# Formatos que un DWG puede llevar ENGANCHADOS sin contenerlos: ortofotos,
# imagenes insertadas y xrefs. AutoCAD guarda solo la RUTA a estos archivos, no
# su contenido, asi que subir el .dwg suelto llega siempre incompleto — es lo
# que avisa Autodesk con "Missing reference ... not uploaded".
#
# SOLO raster. Los xrefs entre dibujos quedan FUERA a proposito: dos planos en
# la misma carpeta casi nunca se referencian entre si, y al incluirlos cada uno
# arrastraba al otro — con archivos de 400 MB el paquete se vuelve absurdo.
# Saber que DWG referencia a cual exige leer el propio DWG; hasta entonces, mas
# vale quedarse corto que empaquetar de mas.
REFERENCE_EXTENSIONS = (
    '.tif', '.tiff', '.jpg', '.jpeg', '.png', '.bmp', '.gif',   # ortofotos e imagenes
    '.ecw', '.sid', '.jp2', '.j2k',                              # raster comprimido de cartografia
    '.tfw', '.jgw', '.pgw', '.wld',                              # world files (georreferencia)
)

# Formatos que ADMITEN referencias externas. Un RVT o un IFC se bastan solos.
HOST_EXTENSIONS = ('.dwg', '.dxf', '.dgn')

# Tope del paquete. Una ortofoto puede pesar cientos de MB y el backend vive en
# una instancia modesta: mejor un aviso claro que quedarse sin memoria.
MAX_PACKAGE_BYTES = 1024 * 1024 * 1024   # 1 GB
# Por encima de esto la subida va troceada (S3 exige multipart en piezas).
PART_SIZE = 90 * 1024 * 1024


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


def _upload_to_oss(token, bucket, object_key, source, size=None):
    """Sube por S3 firmado (la subida directa a OSS esta descontinuada).

    `source` puede ser bytes o un fichero abierto en binario — un paquete con
    ortofotos no cabe comodamente en memoria.

    Tres pasos: pedir URL(es) firmada(s), PUT a S3, y confirmar a APS. Si el
    tamaño supera PART_SIZE se pide una URL por trozo, porque S3 no admite un
    PUT unico ilimitado.
    """
    if size is None:
        size = len(source) if isinstance(source, (bytes, bytearray)) else None
    partes = 1
    if size:
        partes = max(1, (size + PART_SIZE - 1) // PART_SIZE)

    r = requests.get(
        '%s/oss/v2/buckets/%s/objects/%s/signeds3upload?parts=%d'
        % (APS_BASE, bucket, object_key, partes),
        headers=_headers(token), timeout=60)
    if not r.ok:
        return None, 'No se pudo pedir la URL de subida: %s' % r.text[:200]
    info = r.json()
    urls = info.get('urls') or []
    if not urls:
        return None, 'APS no devolvio URL de subida'

    if isinstance(source, (bytes, bytearray)):
        trozos = [source[i * PART_SIZE:(i + 1) * PART_SIZE] for i in range(len(urls))]
        for url, trozo in zip(urls, trozos):
            put = requests.put(url, data=trozo, timeout=1800)
            if not put.ok:
                return None, 'Fallo la subida a APS (%s)' % put.status_code
    else:
        source.seek(0)
        for url in urls:
            trozo = source.read(PART_SIZE)
            if not trozo:
                break
            put = requests.put(url, data=trozo, timeout=1800)
            if not put.ok:
                return None, 'Fallo la subida a APS (%s)' % put.status_code

    done = requests.post(
        '%s/oss/v2/buckets/%s/objects/%s/signeds3upload' % (APS_BASE, bucket, object_key),
        headers=_headers(token, {'Content-Type': 'application/json'}),
        json={'uploadKey': info.get('uploadKey')}, timeout=300)
    if not done.ok:
        return None, 'APS rechazo el cierre de la subida: %s' % done.text[:200]

    obj = done.json()
    return obj.get('objectId'), None


def _urn_of(object_id):
    """URN en base64 URL-SAFE sin relleno, que es lo que espera Model Derivative.

    Antes usaba base64 estandar. Ese alfabeto incluye '/' y '+', y el urn viaja
    DENTRO de la ruta al consultar el manifiesto:

        GET /modelderivative/v2/designdata/<urn>/manifest

    Una barra ahi parte la ruta y la peticion se va a otro sitio. Medido sobre
    3.000 nombres de fichero realistas y sobre nombres con tildes y enies, no
    salio ni uno: por eso nunca dio la cara. Pero es cuestion del contenido
    exacto de los bytes, no de suerte, y el dia que salga sera un fallo
    incomprensible en un solo modelo.

    El cambio es seguro: url-safe y estandar dan EXACTAMENTE el mismo resultado
    salvo justo en esos casos, asi que los urn ya guardados siguen valiendo.
    """
    return base64.urlsafe_b64encode(object_id.encode('utf-8')).decode('utf-8').rstrip('=')


def _start_translation(token, urn, force=False, root_filename=None):
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
    if root_filename:
        # El paquete es un ZIP: hay que decirle cual de los archivos manda.
        # Los demas (ortofotos, xrefs) los resuelve el solo dentro del ZIP.
        payload['input']['compressedUrn'] = True
        payload['input']['rootFilename'] = root_filename
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


def _first_error(manifest):
    """Primer mensaje de error del manifiesto, para guardar la causa real."""
    for d in (manifest or {}).get('derivatives', []):
        for msg in (d.get('messages') or []):
            if msg.get('type') == 'error':
                t = msg.get('message')
                if isinstance(t, list):
                    t = ' | '.join(str(x) for x in t)
                return str(t)[:300]
    return None


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
    """Clave estable del objeto en APS para esta VERSION del archivo.

    Cambia si el dibujo pasa a llevar referencias: subir una ortofoto a la
    carpeta cambia la clave, luego cambia el URN, luego se retraduce. Es lo
    correcto — el dibujo completo NO es el mismo modelo que el dibujo suelto.
    """
    if node.get('refs'):
        return 'docs-%s-pkg.zip' % (node['v_id'] or node['id'])
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
                   COALESCE(n.size_bytes, 0) AS tam,
                   -- El metadato puede estar en la version o, en archivos
                   -- antiguos sin versionar, en el propio nodo. Se fusionan con
                   -- la version a la derecha, que es la que manda.
                   COALESCE(n.metadata, '{}'::jsonb) || COALESCE(v.metadata, '{}'::jsonb),
                   v.id, n.parent_id
            FROM file_nodes n
            LEFT JOIN file_versions v ON v.id = n.current_version_id
            WHERE n.id = %s AND n.is_deleted = FALSE
        """, (node_id,))
        row = cur.fetchone()
        if not row:
            return None
        node = {
            'id': row[0], 'name': row[1], 'model_urn': row[2], 'gcs_urn': row[3],
            'version_id': row[4], 'size': row[5] or 0, 'meta': row[6] or {},
            'v_id': row[7], 'parent_id': row[8], 'refs': [],
        }

        # Referencias: los archivos de LA MISMA CARPETA que este dibujo puede
        # necesitar. El usuario sube el DWG y sus ortofotos como documentos
        # normales del CDE; el empaquetado es cosa nuestra y no se ve.
        #
        # `skip_refs` es la marca de rendicion: si el paquete ya hizo fracasar
        # una traduccion, se vuelve al dibujo suelto. Mas vale el plano sin su
        # ortofoto que una pantalla de error — y hay formatos raster que tumban
        # al extractor de Autodesk (visto con .ecw: exit code -1073741831).
        salta_refs = bool(((node['meta'] or {}).get('cad') or {}).get('skip_refs'))
        if not salta_refs and node['parent_id'] and node['name'].lower().endswith(HOST_EXTENSIONS):
            cur.execute("""
                SELECT name, gcs_urn, COALESCE(size_bytes, 0)
                FROM file_nodes
                WHERE parent_id = %s AND id <> %s AND is_deleted = FALSE
                  AND node_type = 'FILE' AND gcs_urn IS NOT NULL
                ORDER BY name
            """, (node['parent_id'], node['id']))
            for nombre, gcs, tam in cur.fetchall():
                if nombre.lower().endswith(REFERENCE_EXTENSIONS):
                    node['refs'].append({'name': nombre, 'gcs_urn': gcs, 'size': tam or 0})
    return node


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


def _build_package(node):
    """Arma el ZIP con el dibujo y sus referencias. Devuelve (fichero, tam, raiz).

    Va a un fichero TEMPORAL, no a memoria: una ortofoto puede pesar cientos de
    MB y el backend corre en una instancia modesta.

    Todo se escribe PLANO, en la raiz del ZIP. AutoCAD guarda las rutas de sus
    referencias de forma relativa o sin ruta, y con todo junto en el mismo nivel
    es como mas veces resuelve.
    """
    total = (node.get('size') or 0) + sum(r['size'] for r in node['refs'])
    if total > MAX_PACKAGE_BYTES:
        return None, 0, None, ('El dibujo y sus referencias suman %d MB, mas del limite. '
                               'Sube menos imagenes a esa carpeta o reduce su tamaño.'
                               % (total // (1024 * 1024)))

    tmp = tempfile.TemporaryFile()
    try:
        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as z:
            contenido, _ = get_blob_data(node['gcs_urn'])
            if not contenido:
                return None, 0, None, 'El dibujo esta vacio en GCS'
            z.writestr(os.path.basename(node['name']), contenido)
            for ref in node['refs']:
                try:
                    datos, _ = get_blob_data(ref['gcs_urn'])
                except Exception:
                    datos = None
                if datos:
                    # Una referencia que no se pueda leer no debe tumbar el
                    # paquete: el dibujo se vera incompleto, pero se vera.
                    z.writestr(os.path.basename(ref['name']), datos)
        tam = tmp.tell()
        tmp.seek(0)
        return tmp, tam, os.path.basename(node['name']), None
    except Exception as e:
        try:
            tmp.close()
        except Exception:
            pass
        return None, 0, None, 'No se pudo armar el paquete: %s' % e


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

    # Clave estable por version: re-traducir sobrescribe en vez de acumular.
    object_key = _object_key_for(node)
    raiz = None
    paquete = None

    if node.get('refs'):
        # Dibujo CON referencias (ortofotos, xrefs): viaja en un ZIP junto a
        # ellas. Model Derivative lo abre, resuelve lo que hay dentro y traduce.
        paquete, tam, raiz, error = _build_package(node)
        if error:
            return jsonify({'success': False, 'error': error}), 400
        object_id, error = _upload_to_oss(token, bucket, object_key, paquete, size=tam)
        try:
            paquete.close()
        except Exception:
            pass
        if error:
            return jsonify({'success': False, 'error': error}), 502
    else:
        try:
            content, _ctype = get_blob_data(node['gcs_urn'])
        except Exception as e:
            return jsonify({'success': False, 'error': 'No se pudo leer de GCS: %s' % e}), 502
        if not content:
            return jsonify({'success': False, 'error': 'El archivo esta vacio en GCS'}), 400
        object_id, error = _upload_to_oss(token, bucket, object_key, content)
        if error:
            return jsonify({'success': False, 'error': error}), 502

    # El URN se guarda ANTES de lanzar el trabajo. Si el trabajo fallara, el
    # URN sigue ahi y el estado se puede consultar: un fallo no deja el archivo
    # inalcanzable, que es lo que pasaba cuando el error borraba el URN.
    urn = _urn_of(object_id)
    _save_cad_meta(node, {'urn': urn, 'status': 'inprogress',
                          'started_at': time.time(), 'object_key': object_key,
                          'refs': [r['name'] for r in node.get('refs') or []], 'error': None})

    _job, error = _start_translation(token, urn, force=forzar, root_filename=raiz)
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

    # RENDICION ELEGANTE: si lo que fracaso fue el PAQUETE, se prescinde de las
    # referencias y se reintenta con el dibujo suelto. El usuario acaba viendo
    # su plano —sin la ortofoto— en vez de un error.
    if status in ('failed', 'timeout') and node.get('refs'):
        _save_cad_meta(node, {'skip_refs': True, 'pkg_error': _first_error(manifest)})
        return jsonify({
            'success': True, 'status': 'retry_plain',
            'aviso': ('No se pudo procesar %s junto al dibujo. Se muestra el plano '
                      'sin esa imagen.' % ', '.join(r['name'] for r in node['refs'])),
        })

    payload = {'success': True, 'status': status, 'progress': progress, 'urn': urn}
    if status == 'success' and cad.get('pkg_error'):
        payload['aviso'] = ('El plano se ve completo salvo la imagen adjunta, que '
                            'Autodesk no pudo procesar. Si la necesitas, subela en '
                            'formato GeoTIFF (.tif + .tfw).')
    return jsonify(payload)
