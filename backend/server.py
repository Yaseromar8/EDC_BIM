
import os
from datetime import datetime, timedelta

import mimetypes
import requests
import urllib.parse
import time
import json
import re
# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
import base64
import traceback

from aps import get_internal_token, get_api_data

# Flask app setup
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Register Blueprints


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

# ... (imports)


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
    
    print(f"[proxy_image] Request for storageId={storage_id} versionId={version_id}")

    if not storage_id and not version_id:
        return jsonify({'error': 'Missing storageId or versionId'}), 400

    # Try to get user token first (best for ACC files)
    tokens = load_user_tokens()
    token = tokens.get('access_token') if tokens else None
    internal_token = None
    
    # Fallback to internal token if no user token
    if not token:
        print("[proxy_image] No user token, using internal token")
        internal_token, error = get_internal_token()
        if error:
            return jsonify({'error': error}), 500
        token = internal_token

    # If we only have versionId, we need to find the storageId
    if not storage_id and version_id:
        try:
            url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/versions/{urllib.parse.quote(version_id)}'
            headers = {'Authorization': f'Bearer {token}'}
            resp = requests.get(url, headers=headers)
            if resp.ok:
                data = resp.json()
                storage_id = data['data']['relationships']['storage']['data']['id']
            else:
                # Try with internal token if user token failed
                if token != internal_token:
                     if not internal_token:
                         internal_token, _ = get_internal_token()
                     headers = {'Authorization': f'Bearer {internal_token}'}
                     resp = requests.get(url, headers=headers)
                     if resp.ok:
                        data = resp.json()
                        storage_id = data['data']['relationships']['storage']['data']['id']
                     else:
                        return jsonify({'error': f'Failed to resolve version: {resp.status_code}'}), resp.status_code
                else:
                    return jsonify({'error': f'Failed to resolve version: {resp.status_code}'}), resp.status_code
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # Now get the signed URL for the storageId
    bucket_key, object_name = parse_storage_components(storage_id)
    if not bucket_key or not object_name:
        print(f"[proxy_image] Invalid storageId format: {storage_id}")
        return jsonify({'error': 'Invalid storageId format'}), 400

    encoded_obj = urllib.parse.quote(object_name, safe='') # safe='' encodes slashes too which is sometimes needed for signeds3download
    
    # For ACC files (wip.dm.prod), we often need signeds3download
    if 'wip.dm.prod' in storage_id or 'wip.dm' in storage_id:
         url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signeds3download'
         try:
            print(f"[proxy_image] Trying signeds3download for ACC file: {url}")
            resp = requests.get(url, headers={'Authorization': f'Bearer {token}'})
            if resp.ok:
                data = resp.json()
                # signeds3download returns { "status": "complete", "url": "..." }
                download_url = data.get('url')
                if download_url:
                    return redirect(download_url)
            
            print(f"[proxy_image] User token failed ({resp.status_code}), trying internal token")
            # If failed, try internal token
            if token != internal_token:
                 if not internal_token:
                     internal_token, _ = get_internal_token()
                 resp = requests.get(url, headers={'Authorization': f'Bearer {internal_token}'})
                 if resp.ok:
                    data = resp.json()
                    download_url = data.get('url')
                    if download_url:
                        return redirect(download_url)

         except Exception as e:
             print(f"Error getting signeds3download: {e}")

    # Fallback to standard signed URL (OSS)
    # Re-encode with safe='/' for standard OSS endpoint
    encoded_obj = urllib.parse.quote(object_name, safe='/')
    signed_url_endpoint = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signed?access=read'
    
    try:
        print(f"[proxy_image] Trying standard signed URL: {signed_url_endpoint}")
        resp = requests.get(signed_url_endpoint, headers={'Authorization': f'Bearer {token}'})
        if resp.ok:
            data = resp.json()
            signed_url = data.get('signedUrl') or data.get('url')
            if signed_url:
                return redirect(signed_url)
        
        # Retry with internal token
        if token != internal_token:
             if not internal_token:
                 internal_token, _ = get_internal_token()
             resp = requests.get(signed_url_endpoint, headers={'Authorization': f'Bearer {internal_token}'})
             if resp.ok:
                data = resp.json()
                signed_url = data.get('signedUrl') or data.get('url')
                if signed_url:
                    return redirect(signed_url)

        return jsonify({'error': 'No signed URL returned', 'details': resp.text}), 500
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




# --- AUTH & TOKEN HELPERS ---

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
            print(f"[auth] No se pudo guardar tokens.json: {write_err}")
        
        # Redirect to the frontend (configured via env var or default to localhost)
        frontend_url = os.getenv('APS_FRONTEND_URL', 'http://localhost:5173')
        return redirect(f'{frontend_url}?auth=success')
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/token')
def get_viewer_token():
    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500
    return jsonify({'access_token': token})

# --- APS DATA ROUTES ---

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

# --- ACC UPLOAD & MANIPULATION ---

def trigger_translation_server(urn, token):
    url = 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'x-ads-force': 'true'
    }
    payload = {
        'input': {'urn': urn},
        'output': {'formats': [{'type': 'svf', 'views': ['2d', '3d']}]}
    }
    try:
        resp = requests.post(url, headers=headers, json=payload)
        return resp.ok
    except Exception as e:
        print(f"Translation exception: {e}")
        return False

@app.route('/api/build/acc-upload', methods=['POST'])
def upload_to_acc():
    tokens = load_user_tokens()
    if not tokens or not tokens.get('access_token'):
        return jsonify({'error': 'Falta token de usuario. Ejecuta el login 3-legged primero.'}), 401
    access_token = tokens['access_token']
    if 'file' not in request.files:
        return jsonify({'error': 'No se recibió archivo.'}), 400
    up_file = request.files['file']
    if not up_file or not up_file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400

    filename = secure_filename(up_file.filename)
    
    # 1. Get Storage
    storage_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/storage'
    storage_payload = {
        "data": {
            "type": "objects",
            "attributes": {"name": filename},
            "relationships": {"target": {"data": {"type": "folders", "id": ACC_FOLDER_URN}}}
        }
    }
    try:
        storage_resp = requests.post(storage_url, headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}, json=storage_payload)
        if not storage_resp.ok: return jsonify({'error': f'Storage error: {storage_resp.text}'}), 500
        object_id = storage_resp.json()['data']['id']
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # 2. Upload (Signed S3)
    bucket_key, object_name = parse_storage_components(object_id)
    if not bucket_key: return jsonify({'error': 'Invalid storage ID'}), 500
    
    encoded_obj = urllib.parse.quote(object_name, safe='/')
    signed_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{encoded_obj}/signeds3upload'
    
    try:
        signed_resp = requests.get(signed_url, headers={'Authorization': f'Bearer {access_token}'})
        if not signed_resp.ok: return jsonify({'error': f'Signed URL error: {signed_resp.text}'}), 500
        signed_data = signed_resp.json()
        upload_url = signed_data['urls'][0]
        upload_key = signed_data['uploadKey']
        
        file_bytes = up_file.read()
        put_resp = requests.put(upload_url, data=file_bytes)
        if not put_resp.ok: return jsonify({'error': 'S3 Upload failed'}), 500
        
        complete_resp = requests.post(signed_url, headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}, json={'uploadKey': upload_key})
        if not complete_resp.ok: return jsonify({'error': 'Complete upload failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # 3. Create Item/Version
    item_payload = {
        "data": {
            "type": "items",
            "attributes": {
                "displayName": filename,
                "extension": {"type": "items:autodesk.bim360:File", "version": "1.0"}
            },
            "relationships": {
                "tip": {"data": {"type": "versions", "id": "1"}},
                "parent": {"data": {"type": "folders", "id": ACC_FOLDER_URN}}
            }
        },
        "included": [{
            "type": "versions", "id": "1",
            "attributes": {"name": filename, "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}},
            "relationships": {"storage": {"data": {"type": "objects", "id": object_id}}}
        }]
    }
    
    items_url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/items'
    version_id = None
    try:
        items_resp = requests.post(items_url, headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}, json=item_payload)
        
        if items_resp.status_code == 409:
            # Already exists, Create Version (Simplified logic for recovery)
            # Fetch existing item ID logic omitted for brevity, assuming standard flow for now or user can delete and re-upload
            return jsonify({'error': 'El archivo ya existe. Por favor, elimínalo primero o renómbralo.'}), 409
        elif not items_resp.ok:
             return jsonify({'error': f'Create Item failed: {items_resp.text}'}), 500
        
        item_data = items_resp.json()
        if item_data.get('included'):
            version_id = item_data['included'][0]['id']
        else:
            version_id = object_id # Fallback
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # 4. Trigger Translation
    if version_id:
        urn_bytes = base64.urlsafe_b64encode(version_id.encode('utf-8'))
        urn = urn_bytes.decode('utf-8').rstrip('=')
        trigger_translation_server(urn, access_token)
        
    return jsonify({'status': 'success', 'version_id': version_id, 'urn': urn})

@app.route('/api/build/delete-file', methods=['DELETE'])
def delete_acc_file():
    version_id = request.args.get('versionId') or request.json.get('versionId')
    item_id = request.args.get('itemId') or request.json.get('itemId')
    
    if not (version_id or item_id): return jsonify({'error': 'Missing ID'}), 400
    
    tokens = load_user_tokens()
    if not tokens: return jsonify({'error': 'Unauthorized'}), 401
    
    url = f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/versions/{urllib.parse.quote(version_id)}' if version_id else f'https://developer.api.autodesk.com/data/v1/projects/{ACC_PROJECT_ID}/items/{urllib.parse.quote(item_id)}'
    
    resp = requests.delete(url, headers={'Authorization': f'Bearer {tokens["access_token"]}'})
    if resp.ok or resp.status_code == 204:
        return jsonify({'success': True})
    return jsonify({'error': resp.text}), resp.status_code

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


from routes.maps import maps_bp
from routes.digital_twin import digital_twin_bp
from routes.views import views_bp
from routes.pins import pins_bp

# ... (rest of imports)

app.register_blueprint(digital_twin_bp)
app.register_blueprint(maps_bp)
app.register_blueprint(views_bp)
app.register_blueprint(pins_bp)

@app.route('/maps/uploads/<path:filename>')
def serve_map_file(filename):
    return send_from_directory(MAP_UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
