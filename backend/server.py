
import os
from datetime import datetime, timedelta

import mimetypes
import requests
import urllib.parse
import time
import json
import re
from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

from aps import get_internal_token, get_api_data

# Load environment variables from .env file
load_dotenv()

# Flask app setup
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

MAP_PREPARATION_SECONDS = int(os.getenv('MAPS_PREPARATION_SECONDS', '5'))
DEFAULT_TILESET_URL = os.getenv(
    'MAPS_DEFAULT_TILESET_URL',
    '/maps/demo.kml'
)
MAP_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'maps')
DOC_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'documents')
ALLOWED_GIS_EXTENSIONS = {'kml', 'kmz'}
ALLOWED_DOC_EXTENSIONS = {
    'apng', 'avif', 'csv', 'doc', 'docx', 'gif', 'jpeg', 'jpg', 'odp', 'ods',
    'odt', 'pdf', 'png', 'ppt', 'pptx', 'svg', 'txt', 'webp', 'xls', 'xlsx',
    'kml', 'kmz', 'iwm'
}
ACC_PROJECT_ID = os.getenv('ACC_PROJECT_ID', 'b.50e13047-2a8c-4c8b-af53-8d509a281dba')
ACC_FOLDER_URN = os.getenv('ACC_FOLDER_URN', 'urn:adsk.wipprod:fs.folder:co.OdZ3iENkTh6vroYpYJxylA')
MAP_JOBS = {}

os.makedirs(MAP_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOC_UPLOAD_FOLDER, exist_ok=True)

PINS_FILE = os.path.join(os.path.dirname(__file__), 'pins.json')

def load_pins():
    if not os.path.exists(PINS_FILE):
        return []
    try:
        with open(PINS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading pins: {e}")
        return []

def save_pins(pins):
    try:
        with open(PINS_FILE, 'w', encoding='utf-8') as f:
            json.dump(pins, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving pins: {e}")

def allowed_gis_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_GIS_EXTENSIONS

def allowed_doc_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_DOC_EXTENSIONS

def normalize_urn(urn):
    """Replace chars so we can build mock URLs per URN."""
    return ''.join('_' if c in ':/\\' else c for c in urn)


def parse_storage_components(storage_id):
    """
    Devuelve (bucket_key, object_name) a partir de un storageId de ACC.
    Preserva la jerarquía de carpetas dentro del object_name.
    """
    if not storage_id:
        return None, None
    clean_id = storage_id.replace('urn:adsk.objects:os.object:', '')
    if '/' not in clean_id:
        return None, None
    bucket_key, object_name = clean_id.split('/', 1)
    if not bucket_key or not object_name:
        return None, None
    return bucket_key, object_name


def refresh_job_state(job):
    """Simulate async completion once the fake timer expires."""
    if job['status'] == 'pending' and datetime.utcnow() >= job['ready_at']:
        job['status'] = 'ready'
        if DEFAULT_TILESET_URL:
            job['tileset_url'] = DEFAULT_TILESET_URL
        else:
            job['tileset_url'] = f"/static/tilesets/{normalize_urn(job['urn'])}/tileset.json"
        job['message'] = 'Recurso GIS preparado y listo para Maps.'
    return job


def serialize_job(job):
    """Convert datetime objects into ISO strings for JSON responses."""
    copy = job.copy()
    copy['created_at'] = copy['created_at'].isoformat() + 'Z'
    copy['ready_at'] = copy['ready_at'].isoformat() + 'Z'
    return copy


def upsert_job(urn):
    """Create a fake preparation job or refresh an existing one."""
    job = MAP_JOBS.get(urn)
    created = False
    if job is None:
        now = datetime.utcnow()
        job = {
            'urn': urn,
            'status': 'pending',
            'tileset_url': None,
            'message': 'Solicitud recibida. Generando tileset...',
            'created_at': now,
            'ready_at': now + timedelta(seconds=MAP_PREPARATION_SECONDS)
        }
        MAP_JOBS[urn] = job
        created = True
    refresh_job_state(job)
    return job, created

@app.route('/api/token')
def get_viewer_token():
    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500
    return jsonify({'access_token': token})

@app.route('/api/hubs')
def get_hubs():
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data('project/v1/hubs', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/hubs/<hub_id>/projects')
def get_projects(hub_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'project/v1/hubs/{hub_id}/projects', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/hubs/<hub_id>/projects/<project_id>/topFolders')
def get_top_folders(hub_id, project_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'project/v1/hubs/{hub_id}/projects/{project_id}/topFolders', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/projects/<project_id>/folders/<folder_id>/contents')
def get_folder_contents(project_id, folder_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'data/v1/projects/{project_id}/folders/{folder_id}/contents', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/projects/<project_id>/items/<item_id>/versions')
def get_item_versions(project_id, item_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'data/v1/projects/{project_id}/items/{item_id}/versions', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/maps/prepare', methods=['POST'])
def prepare_maps():
    payload = request.get_json() or {}
    urn = (payload.get('urn') or '').strip()
    if not urn:
        return jsonify({'error': 'El URN es obligatorio.'}), 400
    job, created = upsert_job(urn)
    action = 'Creada' if created else 'Actualizada'
    print(f"{action} preparación Cesium para URN: {urn}")
    return jsonify({'job': serialize_job(job)})


@app.route('/api/maps/status/<path:urn>')
def get_maps_status(urn):
    urn = urn.strip()
    if not urn:
        return jsonify({'error': 'Proporciona un URN válido.'}), 400
    job = MAP_JOBS.get(urn)
    if job is None:
        return jsonify({'error': 'No existe una preparación registrada para este URN.'}), 404
    refresh_job_state(job)
    return jsonify({'job': serialize_job(job)})

@app.route('/api/maps/upload', methods=['POST'])
def upload_gis_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400
    if not allowed_gis_file(file.filename):
        return jsonify({'error': 'Solo se permiten archivos KML o KMZ.'}), 400
    filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secure_filename(file.filename)}"
    save_path = os.path.join(MAP_UPLOAD_FOLDER, filename)
    file.save(save_path)
    base = request.host_url.rstrip('/')
    url = f'{base}/maps/uploads/{filename}'
    return jsonify({'url': url})

@app.route('/maps/uploads/<path:filename>')
def serve_uploaded_gis(filename):
    response = send_from_directory(MAP_UPLOAD_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

@app.route('/api/documents/upload', methods=['POST'])
def upload_document_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400
    if not allowed_doc_file(file.filename):
        return jsonify({'error': 'Tipo de archivo no soportado.'}), 400
    filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secure_filename(file.filename)}"
    save_path = os.path.join(DOC_UPLOAD_FOLDER, filename)
    file.save(save_path)
    base = request.host_url.rstrip('/')
    url = f'{base}/docs/uploads/{filename}'
    return jsonify({'url': url, 'filename': file.filename, 'content_type': file.mimetype})

@app.route('/docs/uploads/<path:filename>')
def serve_uploaded_document(filename):
    response = send_from_directory(DOC_UPLOAD_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

def refresh_user_tokens(tokens):
    refresh_token = tokens.get('refresh_token')
    if not refresh_token:
        return None
    
    client_id = os.getenv('APS_CLIENT_ID')
    client_secret = os.getenv('APS_CLIENT_SECRET')
    
    try:
        print("Refreshing 3-legged token...")
        resp = requests.post(
            'https://developer.api.autodesk.com/authentication/v2/token',
            data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': client_id,
                'client_secret': client_secret
            }
        )
        resp.raise_for_status()
        new_tokens = resp.json()
        
        # Save new tokens
        tokens_path = os.path.join(os.path.dirname(__file__), 'tokens.json')
        with open(tokens_path, 'w', encoding='utf-8') as f:
            import json
            json.dump(new_tokens, f, ensure_ascii=False, indent=2)
            
        return new_tokens
    except Exception as e:
        print(f"Error refreshing token: {e}")
        return None

def load_user_tokens():
    tokens_path = os.path.join(os.path.dirname(__file__), 'tokens.json')
    if not os.path.exists(tokens_path):
        return None
    try:
        import json
        with open(tokens_path, 'r', encoding='utf-8') as f:
            tokens = json.load(f)
            
        # Check expiration based on file modification time
        mtime = os.path.getmtime(tokens_path)
        age = time.time() - mtime
        expires_in = tokens.get('expires_in', 3599)
        
        # Refresh if token is older than (expires_in - 5 minutes)
        if age > (expires_in - 300):
            print(f"Token age {int(age)}s > {expires_in - 300}s. Refreshing...")
            new_tokens = refresh_user_tokens(tokens)
            if new_tokens:
                return new_tokens
            else:
                print("Failed to refresh token. It might be invalid.")
                return None
        
        return tokens
    except Exception as e:
        print(f"Error loading tokens: {e}")
        return None

@app.route('/api/auth/status')
def auth_status():
    tokens = load_user_tokens()
    return jsonify({'connected': tokens is not None})

import base64

def trigger_translation(urn, token):
    """Triggers the Model Derivative translation job."""
    url = 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'x-ads-force': 'true'
    }
    payload = {
        'input': {
            'urn': urn
        },
        'output': {
            'formats': [
                {'type': 'svf', 'views': ['2d', '3d']}
            ]
        }
    }
    try:
        resp = requests.post(url, headers=headers, json=payload)
        if resp.status_code == 200 or resp.status_code == 201:
            print(f"Translation triggered for {urn}")
            return True
        else:
            print(f"Translation failed: {resp.text}")
            return False
    except Exception as e:
        print(f"Translation exception: {e}")
        return False

@app.route('/api/build/get-signed-url', methods=['GET'])
def get_signed_url():
    storage_id = request.args.get('storageId')
    if not storage_id:
        return jsonify({'error': 'Missing storageId'}), 400
    
    tokens = load_user_tokens()
    if not tokens or not tokens.get('access_token'):
        return jsonify({'error': 'Unauthorized'}), 401
    access_token = tokens['access_token']

    # Check if this is an ACC object (wip.dm.prod bucket)
    # ACC objects need to use signeds3download endpoint, not regular signed URL
    if 'wip.dm.prod' in storage_id or 'wip.dm' in storage_id:
        # For ACC objects, parse the storage ID to get bucket and object
        bucket_key, object_name = parse_storage_components(storage_id)
        if not bucket_key or not object_name:
            return jsonify({'error': 'Invalid storageId'}), 400
        
        # Use the signeds3download endpoint for ACC files
        encoded_obj = urllib.parse.quote(object_name, safe='')
        url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signeds3download'
        
        try:
            print(f'[get-signed-url] ACC object detected, using signeds3download: {storage_id}')
            resp = requests.get(url, headers={'Authorization': f'Bearer {access_token}'})
            if resp.ok:
                data = resp.json()
                download_url = data.get('url')
                if download_url:
                    print(f'[get-signed-url] Success! Got download URL')
                    return jsonify({'url': download_url})
                else:
                    print(f'[get-signed-url] No URL in response: {data}')
                    return jsonify({'error': 'No download URL in response'}), 500
            else:
                print(f'[get-signed-url] OSS API error ({resp.status_code}): {resp.text}')
                return jsonify({'error': f'OSS API Error: {resp.text}'}), resp.status_code
        except Exception as e:
            print(f'[get-signed-url] Exception: {e}')
            return jsonify({'error': str(e)}), 500
    else:
        # For regular OSS buckets, use the OSS signed URL API
        bucket_key, object_name = parse_storage_components(storage_id)
        if not bucket_key or not object_name:
            return jsonify({'error': 'Invalid storageId'}), 400

        encoded_obj = urllib.parse.quote(object_name, safe='/')
        url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signed?access=read'
        
        try:
            resp = requests.get(url, headers={'Authorization': f'Bearer {access_token}'})
            if resp.ok:
                data = resp.json()
                signed_url = data.get('signedUrl') or data.get('url')
                return jsonify({'url': signed_url})
            else:
                return jsonify({'error': f'APS Error: {resp.text}'}), resp.status_code
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/build/acc-upload', methods=['POST'])
def upload_to_acc():
    """
    Sube un archivo a ACC en la carpeta configurada (ACC_FOLDER_URN) usando el token 3-legged guardado en tokens.json.
    """
    tokens = load_user_tokens()
    if not tokens or not tokens.get('access_token'):
        return jsonify({'error': 'Falta token de usuario. Ejecuta el login 3-legged primero.'}), 401
    access_token = tokens['access_token']
    if 'file' not in request.files:
        return jsonify({'error': 'No se recibió archivo.'}), 400
    up_file = request.files['file']
    if not up_file or not up_file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400

    # Use original filename without timestamp to enable proper versioning in ACC
    filename = secure_filename(up_file.filename)
    print(f"[acc-upload] Uploading file: {filename}")
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    # 1) Crear storage location
    storage_payload = {
        "data": {
            "type": "objects",
            "attributes": {"name": filename},
            "relationships": {
                "target": {
                    "data": {
                        "type": "folders",
                        "id": ACC_FOLDER_URN
                    }
                }
            }
        }
    }
    storage_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/storage'
    try:
        storage_resp = requests.post(storage_url, headers=headers, json=storage_payload)
        if not storage_resp.ok:
            return jsonify({'error': f'Storage error: {storage_resp.status_code} {storage_resp.text}'}), 500
        storage_json = storage_resp.json()
        storage_data = storage_json.get('data') or {}
        object_id = storage_data.get('id')
        if not object_id:
            return jsonify({'error': 'No se obtuvo objectId de storage.'}), 500
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Storage error: {e}'}), 500

    # 2) Subir usando signed S3 upload (nuevo flujo ACC)
    file_bytes = up_file.read()
    bucket_key, object_name = parse_storage_components(object_id)
    if not bucket_key or not object_name:
        return jsonify({'error': f'No se pudo parsear bucket/object de storageId: {object_id}'}), 500

    # No codificamos los slashes para respetar las carpetas dentro del bucket.
    encoded_obj = urllib.parse.quote(object_name, safe='/')
    print(f"[acc-upload] bucket={bucket_key} object={object_name}")
    signed_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signeds3upload'
    signed_resp = requests.get(signed_url, headers={'Authorization': f'Bearer {access_token}'})
    if not signed_resp.ok:
        print(f'[acc-upload] signed upload error {signed_resp.status_code}: {signed_resp.text}')
        return jsonify({'error': f'Signed upload error: {signed_resp.status_code} {signed_resp.text}'}), 500

    try:
        signed_data = signed_resp.json()
    except ValueError:
        print(f'[acc-upload] signed upload no JSON: {signed_resp.text}')
        return jsonify({'error': f'Signed upload no devolvió JSON: {signed_resp.text}'}), 500
    if isinstance(signed_data, str):
        try:
            import json
            signed_data = json.loads(signed_data)
        except Exception:
            print(f'[acc-upload] signed upload respuesta string inválida: {signed_data}')
            return jsonify({'error': f'Signed upload respuesta no válida: {signed_data}'}), 500
    if not isinstance(signed_data, dict):
        print(f'[acc-upload] signed upload respuesta inesperada: {signed_data}')
        return jsonify({'error': f'Signed upload respuesta inesperada: {signed_data}'}), 500

    urls = signed_data.get('urls')
    if not urls or not isinstance(urls, list):
        print(f'[acc-upload] signed upload sin urls: {signed_data}')
        return jsonify({'error': f'Signed upload sin urls: {signed_data}'}), 500
    url_entry = urls[0] or {}
    if isinstance(url_entry, dict):
        upload_url = url_entry.get('url')
        signed_headers = url_entry.get('headers', {}) if isinstance(url_entry, dict) else {}
    elif isinstance(url_entry, str):
        upload_url = url_entry
        signed_headers = {}
    else:
        print(f'[acc-upload] url_entry inesperado: {url_entry}')
        return jsonify({'error': f'url_entry inesperado: {url_entry}'}), 500

    upload_key = signed_data.get('uploadKey')
    if not upload_url or not upload_key:
        print(f'[acc-upload] signed upload incompleto: {signed_data}')
        return jsonify({'error': f'Signed upload incompleto: {signed_data}'}), 500

    put_headers = dict(signed_headers) if isinstance(signed_headers, dict) else {}
    put_resp = requests.put(upload_url, headers=put_headers, data=file_bytes)
    if not put_resp.ok:
        print(f'[acc-upload] upload S3 error {put_resp.status_code}: {put_resp.text}')
        print(f'[acc-upload] upload_url: {upload_url}')
        print(f'[acc-upload] headers usados: {put_headers}')
        return jsonify({'error': f'Upload S3 error: {put_resp.status_code} {put_resp.text}'}), 500

    complete_resp = requests.post(signed_url, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }, json={'uploadKey': upload_key})
    if not complete_resp.ok:
        print(f'[acc-upload] complete upload error {complete_resp.status_code}: {complete_resp.text}')
        return jsonify({'error': f'Complete upload error: {complete_resp.status_code} {complete_resp.text}'}), 500

    upload_resp = complete_resp

    # 2b) Obtener URL firmada de lectura para previsualización
    read_url = None
    try:
        read_signed = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signed?access=read'
        read_resp = requests.get(read_signed, headers={'Authorization': f'Bearer {access_token}'})
        if read_resp.ok:
            read_json = read_resp.json()
            # La clave puede variar (signedUrl / url)
            read_url = read_json.get('signedUrl') or read_json.get('url')
        else:
            print(f'[acc-upload] signed read error {read_resp.status_code}: {read_resp.text}')
    except requests.exceptions.RequestException as e:
        print(f'[acc-upload] signed read url error: {e}')

    # 3) Crear Item+Version en la carpeta
    item_payload = {
        "data": {
            "type": "items",
            "attributes": {
                "displayName": filename,
                "extension": {
                    "type": "items:autodesk.bim360:File",
                    "version": "1.0"
                }
            },
            "relationships": {
                "tip": {
                    "data": {
                        "type": "versions",
                        "id": "1"
                    }
                },
                "parent": {
                    "data": {
                        "type": "folders",
                        "id": ACC_FOLDER_URN
                    }
                }
            }
        },
        "included": [
            {
                "type": "versions",
                "id": "1",
                "attributes": {
                    "name": filename,
                    "extension": {
                        "type": "versions:autodesk.bim360:File",
                        "version": "1.0"
                    }
                },
                "relationships": {
                    "storage": {
                        "data": {
                            "type": "objects",
                            "id": object_id
                        }
                    }
                }
            }
        ]
    }

    items_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/items'
    try:
        items_resp = requests.post(items_url, headers=headers, json=item_payload)
        
        # If we get 409 Conflict, it means the file already exists - create a new version instead
        if items_resp.status_code == 409:
            print(f"[acc-upload] File '{filename}' already exists, creating new version...")
            
            # Extract the existing item ID from the error response
            error_data = items_resp.json()
            existing_item_id = None
            
            # Try to get item ID from error response or fetch it from folder contents
            try:
                # Some ACC errors include the conflicting item ID
                if 'id' in error_data:
                    existing_item_id = error_data['id']
                else:
                    # Need to search for the item
                    folder_contents_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/folders/{ACC_FOLDER_URN}/contents'
                    contents_resp = requests.get(folder_contents_url, headers=headers)
                    if contents_resp.ok:
                        contents_data = contents_resp.json()
                        for item in contents_data.get('data', []):
                            if item.get('type') == 'items':
                                item_name = item.get('attributes', {}).get('displayName', '')
                                if item_name == filename:
                                    existing_item_id = item['id']
                                    break
            except Exception as e:
                print(f"[acc-upload] Error finding existing item: {e}")
            
            if not existing_item_id:
                return jsonify({'error': f'File already exists but could not find item ID to create version'}), 500
            
            # Create a new version for the existing item
            version_payload = {
                "data": {
                    "type": "versions",
                    "attributes": {
                        "name": filename,
                        "extension": {
                            "type": "versions:autodesk.bim360:File",
                            "version": "1.0"
                        }
                    },
                    "relationships": {
                        "item": {
                            "data": {
                                "type": "items",
                                "id": existing_item_id
                            }
                        },
                        "storage": {
                            "data": {
                                "type": "objects",
                                "id": object_id
                            }
                        }
                    }
                }
            }
            
            versions_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/versions'
            version_resp = requests.post(versions_url, headers=headers, json=version_payload)
            version_resp.raise_for_status()
            item_data = version_resp.json()
            print(f"[acc-upload] Created new version successfully")
        else:
            items_resp.raise_for_status()
            item_data = items_resp.json()
            print(f"[acc-upload] Created new item successfully")
            
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Item/Version error: {e}'}), 500

    # Extraer webView link si existe
    webview_url = None
    try:
        webview_url = item_data['data']['links']['webView']['href']
    except (KeyError, TypeError):
        pass

    # Extraer el ID de la versión creada (esto es lo que necesitamos para el URN)
    version_id = None
    try:
        # If we created a new version (not a new item), the response structure is different
        if item_data.get('data', {}).get('type') == 'versions':
            # Direct version response
            version_id = item_data['data']['id']
        elif 'included' in item_data and len(item_data['included']) > 0:
            #New item with included versions
            version_id = item_data['included'][0]['id']
        else:
            # Fallback: try to get from relationships
            version_id = item_data['data']['relationships']['tip']['data']['id']
        
        print(f"[acc-upload] Extracted versionId: {version_id}")
    except (KeyError, TypeError, IndexError) as e:
        print(f"[acc-upload] Could not extract versionId from response: {e}")
        print(f"[acc-upload] Response structure: {item_data}")
        version_id = object_id # Fallback to object_id if we can't find versionId

    # 4) Trigger Translation (Model Derivative)
    # Calculate URN (URL-SAFE base64 encoded versionId - as per official Autodesk docs)
    # Autodesk uses URL-safe base64: + becomes -, / becomes _, padding = removed
    urn_bytes = base64.urlsafe_b64encode(version_id.encode('utf-8'))
    urn = urn_bytes.decode('utf-8').rstrip('=')  # Remove padding
    print(f"[acc-upload] ===== URN GENERATION =====")
    print(f"[acc-upload] Version ID: {version_id}")
    print(f"[acc-upload] Generated URN: {urn}")
    print(f"[acc-upload] ===========================")
    
    trigger_translation(urn, access_token)

    # Extract item_id for deletion purposes
    item_id = None
    try:
        if item_data.get('data', {}).get('type') == 'items':
             item_id = item_data['data']['id']
        elif item_data.get('data', {}).get('type') == 'versions':
             item_id = item_data['data']['relationships']['item']['data']['id']
    except Exception as e:
        print(f"[acc-upload] Error extracting itemId: {e}")
        # Fallback: try to guess or leave None

    # Respuesta simplificada para el frontend Build
    return jsonify({
        'name': filename,
        'size': upload_resp.json().get('size'),
        'storage_id': object_id,
        'version_id': version_id,
        'item_id': item_id,
        'item': item_data,
        'project_id': ACC_PROJECT_ID,
        'bucket_key': bucket_key,
        'object_name': object_name,
        'url': read_url,  # Solo devolvemos URL si es de lectura válida
        'webview_url': webview_url,
        'urn': urn
    })

@app.route('/api/auth/login')
def auth_login():
    client_id = os.getenv('APS_CLIENT_ID')
    redirect_uri = os.getenv('APS_REDIRECT_URI', 'http://localhost:3000/api/auth/callback')
    # Scopes necesarios para ver y subir archivos
    scopes = 'data:read data:write data:create bucket:create bucket:read'
    
    # Construir URL de autorización
    url = (
        f'https://developer.api.autodesk.com/authentication/v2/authorize'
        f'?response_type=code'
        f'&client_id={client_id}'
        f'&redirect_uri={urllib.parse.quote(redirect_uri)}'
        f'&scope={urllib.parse.quote(scopes)}'
    )
    return redirect(url)

@app.route('/api/auth/callback')
def auth_callback():
    code = request.args.get('code')
    if not code:
        return jsonify({'error': 'Falta code'}), 400

    # Use the same redirect_uri as the login route
    redirect_uri = os.getenv('APS_REDIRECT_URI', 'http://localhost:3000/api/auth/callback')

    payload = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': os.getenv('APS_CLIENT_ID'),
        'client_secret': os.getenv('APS_CLIENT_SECRET'),
        'redirect_uri': redirect_uri
    }
    try:
        resp = requests.post('https://developer.api.autodesk.com/authentication/v2/token', data=payload)
        resp.raise_for_status()
        tokens = resp.json()
        # Persist tokens locally so they can be reused (no deploy impact).
        try:
            tokens_path = os.path.join(os.path.dirname(__file__), 'tokens.json')
            with open(tokens_path, 'w', encoding='utf-8') as f:
                import json
                json.dump(tokens, f, ensure_ascii=False, indent=2)
        except OSError as write_err:
            # Do not fail the callback if writing the file fails.
            print(f"[auth] No se pudo guardar tokens.json: {write_err}")
        
        # Redirect to the frontend (configured via env var or default to localhost)
        frontend_url = os.getenv('APS_FRONTEND_URL', 'http://localhost:5173')
        return redirect(f'{frontend_url}?auth=success')
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/link', methods=['POST'])
def link_acc_document():
    payload = request.get_json() or {}
    project_id = payload.get('projectId')
    version_id = payload.get('versionId')
    display_name = payload.get('name')
    web_view = payload.get('href')
    if not project_id or not version_id:
        return jsonify({'error': 'projectId y versionId son obligatorios.'}), 400
    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500
    result, download_error = download_acc_document(project_id, version_id, token)
    if download_error:
        return jsonify({
            'url': None,
            'filename': display_name or 'Documento',
            'content_type': None,
            'href': web_view,
            'message': download_error
        })
    result['href'] = web_view
    return jsonify(result)

@app.route('/api/build/delete-file', methods=['DELETE'])
def delete_acc_file():
    """
    Elimina un archivo (Item) o una versión de ACC.
    Requiere 'itemId' o 'versionId' en el query param o body.
    Si se envía 'itemId', se borra el Item completo (todas las versiones).
    Si se envía 'versionId', se borra solo esa versión.
    """
    version_id = request.args.get('versionId')
    item_id = request.args.get('itemId')
    
    if not version_id and not item_id:
        payload = request.get_json() or {}
        version_id = payload.get('versionId')
        item_id = payload.get('itemId')
    
    if not version_id and not item_id:
        return jsonify({'error': 'Se requiere itemId o versionId'}), 400

    tokens = load_user_tokens()
    if not tokens or not tokens.get('access_token'):
        return jsonify({'error': 'No autorizado. Inicia sesión nuevamente.'}), 401
    
    access_token = tokens['access_token']
    
    url = ''
    resource_type = ''
    
    if item_id:
        # DELETE Item: DELETE projects/:project_id/items/:item_id
        url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/items/{urllib.parse.quote(item_id)}'
        resource_type = f'Item {item_id}'
    else:
        # DELETE Version: DELETE projects/:project_id/versions/:version_id
        url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/versions/{urllib.parse.quote(version_id)}'
        resource_type = f'Version {version_id}'
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/vnd.api+json'
    }
    
    try:
        print(f"[delete-file] Eliminando {resource_type} del proyecto {ACC_PROJECT_ID}")
        resp = requests.delete(url, headers=headers)
        
        if resp.status_code == 204:
            print("[delete-file] Eliminación exitosa (204 No Content)")
            return jsonify({'message': 'Archivo eliminado correctamente'}), 200
        elif resp.ok:
            print(f"[delete-file] Eliminación exitosa ({resp.status_code})")
            return jsonify({'message': 'Archivo eliminado correctamente'}), 200
        else:
            print(f"[delete-file] Error al eliminar: {resp.status_code} {resp.text}")
            return jsonify({'error': f'Error al eliminar de ACC: {resp.text}'}), resp.status_code
            
    except Exception as e:
        print(f"[delete-file] Excepción: {e}")
        return jsonify({'error': str(e)}), 500

# --- PINS API (Centralized State) ---

@app.route('/api/pins', methods=['GET'])
def get_pins():
    return jsonify(load_pins())

@app.route('/api/pins', methods=['POST'])
def create_pin():
    data = request.json or {}
    if 'lat' not in data or 'lng' not in data:
        return jsonify({'error': 'Missing lat/lng'}), 400

    pins = load_pins()
    
    # Calculate next Point Number
    max_num = 0
    for p in pins:
        # Extract number from "Punto N"
        match = re.match(r'Punto (\d+)', p.get('name', ''))
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    
    next_num = max_num + 1
    name = f"Punto {next_num}"
    
    new_pin = {
        'id': str(int(time.time() * 1000)),
        'lat': data['lat'],
        'lng': data['lng'],
        'name': name,
        'documents': [],
        'createdAt': datetime.utcnow().isoformat() + 'Z'
    }
    
    pins.append(new_pin)
    save_pins(pins)
    return jsonify(new_pin)

@app.route('/api/pins/<pin_id>', methods=['DELETE'])
def delete_pin(pin_id):
    pins = load_pins()
    initial_len = len(pins)
    pins = [p for p in pins if p['id'] != pin_id]
    
    if len(pins) < initial_len:
        save_pins(pins)
        return jsonify({'success': True})
    return jsonify({'error': 'Pin not found'}), 404

@app.route('/api/pins/<pin_id>', methods=['PUT'])
def update_pin(pin_id):
    data = request.json or {}
    pins = load_pins()
    
    found = False
    updated_pin = None
    
    for p in pins:
        if p['id'] == pin_id:
            # Update fields if present
            if 'documents' in data:
                p['documents'] = data['documents']
            if 'name' in data:
                p['name'] = data['name']
            found = True
            updated_pin = p
            break
            
    if found:
        save_pins(pins)
        return jsonify(updated_pin)
    return jsonify({'error': 'Pin not found'}), 404
def extract_download_url(formats_payload):
    entries = formats_payload.get('data') or formats_payload.get('included') or []
    if isinstance(entries, dict):
        entries = [entries]
    for entry in entries:
        attrs = entry.get('attributes') or {}
        files = attrs.get('files') or attrs.get('formats') or []
        if isinstance(files, dict):
            files = [files]
        for file_entry in files:
            if not isinstance(file_entry, dict):
                continue
            filename = file_entry.get('displayName') or file_entry.get('name') or attrs.get('displayName')
            download_url = file_entry.get('downloadUrl')
            if not download_url:
                links = file_entry.get('links') or {}
                download_url = links.get('download')
                if isinstance(download_url, dict):
                    download_url = download_url.get('href')
            if not download_url:
                download_url = attrs.get('downloadUrl') or attrs.get('url')
                if isinstance(download_url, dict):
                    download_url = download_url.get('href')
            if download_url:
                return download_url, filename
    return None, None


def download_acc_document(project_id, version_id, token):
    formats_endpoint = f'data/v1/projects/{project_id}/versions/{version_id}/downloadFormats'
    formats_data, error = get_api_data(formats_endpoint, token)
    if error:
        return None, error

    download_url, filename = extract_download_url(formats_data)
    if not download_url:
        return None, 'No se encontró un enlace de descarga para este documento.'

    resp = requests.get(download_url, stream=True)
    if resp.status_code != 200:
        return None, f'Descarga fallida ({resp.status_code}).'

    filename = filename or 'document'
    content_type = resp.headers.get('Content-Type') or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    local_name = f"acc_{version_id.replace(':', '_')}_{secure_filename(filename)}"
    local_path = os.path.join(DOC_UPLOAD_FOLDER, local_name)
    with open(local_path, 'wb') as file_obj:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            if chunk:
                file_obj.write(chunk)

    base = request.host_url.rstrip('/')
    url = f'{base}/docs/uploads/{os.path.basename(local_path)}'
    return {
        'url': url,
        'filename': filename,
        'content_type': content_type
    }, None


@app.route('/api/build/signed-read', methods=['POST'])
def get_signed_read_url():
    """
    Devuelve una URL firmada de lectura para un archivo de ACC.
    Preferentemente recibe storageId; opcionalmente projectId + versionId.
    """
    payload = request.get_json() or {}
    storage_id = payload.get('storageId') or payload.get('storage_id')
    project_id = payload.get('projectId') or payload.get('project_id')
    version_id = payload.get('versionId') or payload.get('version_id')

    if not storage_id:
        if not (project_id and version_id):
            return jsonify({'error': 'Proporciona storageId o projectId + versionId.'}), 400
        token, err = get_internal_token()
        if err:
            return jsonify({'error': err}), 500
        version_endpoint = f'data/v1/projects/{project_id}/versions/{version_id}'
        version_data, api_err = get_api_data(version_endpoint, token)
        if api_err:
            return jsonify({'error': api_err}), 500
        try:
            storage_id = version_data['data']['relationships']['storage']['data']['id']
        except Exception:
            return jsonify({'error': 'No se pudo extraer storageId de la versión.'}), 500

    bucket_key, object_name = parse_storage_components(storage_id)
    if not bucket_key or not object_name:
        return jsonify({'error': f'No se pudo parsear bucket/object: {storage_id}'}), 400

    encoded_obj = urllib.parse.quote(object_name, safe='/')
    # Preferimos token 3-legged (usuario) para OSS wip.dm.prod; si no existe, usamos 2-legged.
    tokens = load_user_tokens() or {}
    token = tokens.get('access_token')
    if not token:
        token, err = get_internal_token()
        if err:
            return jsonify({'error': err}), 500
    print(f"[signed-read] bucket={bucket_key} object={object_name}")
    signed_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signed?access=read'
    try:
        resp = requests.get(signed_url, headers={'Authorization': f'Bearer {token}'})
        if not resp.ok:
            return jsonify({'error': f'Signed read error: {resp.status_code}', 'details': resp.text}), 500
        data = resp.json()
        url = data.get('signedUrl') or data.get('url')
        if not url:
             return jsonify({'error': 'No se recibió signedUrl de OSS.'}), 500
        return jsonify({'signedUrl': url, 'bucketKey': bucket_key, 'objectName': object_name})
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Request error: {e}'}), 500

@app.route('/api/images/proxy', methods=['GET'])
def proxy_image():
    """
    Proxies a request to an image in ACC/OSS by redirecting to a fresh signed URL.
    Accepts 'storageId' or 'versionId'.
    """
    storage_id = request.args.get('storageId')
    version_id = request.args.get('versionId')
    
    if not storage_id and not version_id:
        return jsonify({'error': 'Missing storageId or versionId'}), 400

    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500

    # If we only have versionId, we need to find the storageId
    if not storage_id and version_id:
        try:
            # We assume ACC_PROJECT_ID is available globally
            url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/versions/{urllib.parse.quote(version_id)}'
            headers = {'Authorization': f'Bearer {token}'}
            resp = requests.get(url, headers=headers)
            if resp.ok:
                data = resp.json()
                storage_id = data['data']['relationships']['storage']['data']['id']
            else:
                return jsonify({'error': f'Failed to resolve version: {resp.status_code}'}), resp.status_code
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # Now get the signed URL for the storageId
    bucket_key, object_name = parse_storage_components(storage_id)
    if not bucket_key or not object_name:
        return jsonify({'error': 'Invalid storageId format'}), 400

    encoded_obj = urllib.parse.quote(object_name, safe='/')
    
    # Try to use user token if available (for 3-legged access), otherwise internal 2-legged
    # For proxying images in a public-ish app, 2-legged is often safer/easier if the bucket allows it,
    # but ACC usually requires 3-legged or 2-legged with x-user-id. 
    # However, get_internal_token returns a 2-legged token which usually works for read if the app has access.
    # Let's stick to the token we got above (internal 2-legged).
    
    signed_url_endpoint = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signed?access=read'
    
    try:
        resp = requests.get(signed_url_endpoint, headers={'Authorization': f'Bearer {token}'})
        if resp.ok:
            data = resp.json()
            signed_url = data.get('signedUrl') or data.get('url')
            if signed_url:
                return redirect(signed_url)
            else:
                return jsonify({'error': 'No signed URL returned'}), 500
        else:
            return jsonify({'error': f'OSS Error: {resp.text}'}), resp.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500
def get_translation_status():
    urn = request.args.get('urn')
    print(f"[translation-status] Received URN: {urn}")
    if not urn:
        print("[translation-status] ERROR: Missing URN")
        return jsonify({'error': 'Missing urn parameter'}), 400

    token, error = get_internal_token()
    if error: 
        print(f"[translation-status] ERROR: Token error: {error}")
        return jsonify({'error': error}), 500
    
    # urn comes in URL-safe. Autodesk Model Derivative API accepts URL-safe base64.
    url = f'https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest'
    print(f"[translation-status] Requesting: {url}")
    headers = {'Authorization': f'Bearer {token}'}
    try:
        resp = requests.get(url, headers=headers)
        print(f"[translation-status] Response status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"[translation-status] Not ready yet, returning pending")
            return jsonify({'status': 'pending', 'progress': '0%'})
        
        data = resp.json()
        status = data.get('status')
        print(f"[translation-status] Manifest status: {status}")
        if status == 'success':
            return jsonify({'status': 'success', 'progress': '100%'})
        elif status == 'failed':
            return jsonify({'status': 'failed', 'progress': '0%'})
        else:
            return jsonify({'status': 'pending', 'progress': data.get('progress', '0%')})
    except Exception as e:
        print(f"[translation-status] ERROR: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
