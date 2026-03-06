import os
import time
import json
import base64
import traceback
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from aps import get_internal_token

digital_twin_bp = Blueprint('digital_twin', __name__)

digital_twin_bp = Blueprint('digital_twin', __name__)

def ensure_model_config_table():
    """Creates the model_config table in PostgreSQL if it doesn't exist."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS model_config (
                    id SERIAL PRIMARY KEY,
                    model_id TEXT UNIQUE NOT NULL,
                    name TEXT,
                    urn TEXT NOT NULL,
                    source TEXT DEFAULT 'DOCS',
                    region TEXT DEFAULT 'US',
                    project_id TEXT,
                    item_id TEXT,
                    version_id TEXT,
                    version_number INTEGER,
                    last_modified_time TEXT,
                    app_project_id TEXT NOT NULL,
                    added_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            conn.commit()
            print("[digital_twin] Table model_config ready.")
    except Exception as e:
        print(f"[digital_twin] Error creating model_config table: {e}")

try:
    ensure_model_config_table()
except Exception:
    pass

def get_project_config_internal():
    """Reads the model config from PostgreSQL. Falls back to local JSON if DB unavailable."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT model_id, name, urn, source, region, project_id, item_id,
                       version_id, version_number, last_modified_time, app_project_id, added_at
                FROM model_config ORDER BY added_at
            ''')
            rows = cursor.fetchall()
            models = []
            for r in rows:
                models.append({
                    'id': r[0],
                    'name': r[1],
                    'urn': r[2],
                    'source': r[3],
                    'region': r[4],
                    'projectId': r[5],
                    'itemId': r[6],
                    'versionId': r[7],
                    'versionNumber': r[8],
                    'lastModifiedTime': r[9],
                    'appProjectId': r[10],
                    'added_at': r[11].isoformat() if r[11] else None
                })
            return {'models': models}
    except Exception as e:
        print(f"[digital_twin] DB read failed: {e}")
        return {"models": []}

def save_project_config_internal(config):
    """Saves all models to PostgreSQL AND local JSON as backup. Returns True on success."""
    db_ok = False
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            for model in config.get('models', []):
                cursor.execute('''
                    INSERT INTO model_config
                        (model_id, name, urn, source, region, project_id, item_id,
                         version_id, version_number, last_modified_time, app_project_id, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (model_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        urn = EXCLUDED.urn,
                        version_id = EXCLUDED.version_id,
                        version_number = EXCLUDED.version_number,
                        last_modified_time = EXCLUDED.last_modified_time,
                        updated_at = NOW()
                ''', (
                    model.get('id'), model.get('name'), model.get('urn'),
                    model.get('source', 'DOCS'), model.get('region', 'US'),
                    model.get('projectId'), model.get('itemId'),
                    model.get('versionId'), model.get('versionNumber'),
                    model.get('lastModifiedTime'), model.get('appProjectId')
                ))
            conn.commit()
            db_ok = True
    except Exception as e:
        print(f"[digital_twin] DB save failed: {e}")
 
    return db_ok

def delete_model_from_db(urn):
    """Deletes a specific model from the DB by URN."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM model_config WHERE urn = %s', (urn,))
            conn.commit()
    except Exception as e:
        print(f"[digital_twin] Error deleting model from DB: {e}")


POINT_CLOUD_EXTENSIONS = {'.laz', '.las', '.e57', '.rcp', '.rcs', '.pts', '.ptx', '.xyz'}

def trigger_translation(urn, token, filename=''):
    """Triggers SVF translation for a given URN. Handles both BIM and point cloud files."""
    url = 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job'
    headers = {
        'Authorization': f'Bearer {token}', 
        'Content-Type': 'application/json',
        'x-ads-force': 'true'
    }
    
    # Detect file type by extension
    ext = os.path.splitext(filename.lower())[1] if filename else ''
    is_point_cloud = ext in POINT_CLOUD_EXTENSIONS
    
    if is_point_cloud:
        print(f"[trigger_translation] Detected point cloud format: {ext}")
        payload = {
            'input': {'urn': urn},
            'output': {
                'formats': [
                    {
                        'type': 'svf2',
                        'views': ['3d']
                    }
                ]
            }
        }
    else:
        payload = {
            'input': {'urn': urn},
            'output': {
                'formats': [
                    {'type': 'svf', 'views': ['2d', '3d']}
                ]
            }
        }
    
    try:
        resp = requests.post(url, headers=headers, json=payload)
        if resp.status_code == 200 or resp.status_code == 201:
            print(f"[trigger_translation] Success for {urn} (point_cloud={is_point_cloud})")
            return True
        else:
            print(f"[trigger_translation] Failed: {resp.text}")
            return False
    except Exception as e:
        print(f"[trigger_translation] Exception: {e}")
        return False

def get_app_bucket_key():
    """Returns a unique bucket key for this application based on the APS Client ID."""
    import os
    client_id = os.getenv('APS_CLIENT_ID', 'default')
    # Bucket names must be 3-128 lowercase alphanumeric chars, can include - and _
    safe_id = client_id.lower().replace(' ', '_')[:64]
    return f"visor-ecd-{safe_id}"

def ensure_bucket_exists(bucket_key, token):
    """Creates an OSS bucket if it doesn't already exist."""
    import requests
    url = f'https://developer.api.autodesk.com/oss/v2/buckets'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    payload = {
        'bucketKey': bucket_key,
        'access': 'full',
        'policyKey': 'persistent'
    }
    try:
        resp = requests.post(url, headers=headers, json=payload)
        if resp.status_code == 200 or resp.status_code == 409:  # 409 = already exists
            return True
        print(f"[ensure_bucket] Failed: {resp.status_code} - {resp.text}")
        return False
    except Exception as e:
        print(f"[ensure_bucket] Exception: {e}")
        return False

# Routes
@digital_twin_bp.route('/api/config/project', methods=['GET'])
def get_config_route():
    config = get_project_config_internal()
    project_id = request.args.get('project')
    
    if project_id and 'models' in config:
        # Filter models by internal 'userProjectId' (we'll use this key to distinguish from ACC's projectId)
        # Or simply overload 'projectId' if it's not strictly ACC-bound? 
        # ACC models use 'projectId' for the BIM360 Project ID.
        # Let's use 'internalProjectId' or 'appContext' to avoid confusion.
        # BETTER: Let's use 'appProjectId' for our filter "DRENAJE_URBANO" etc.
        config['models'] = [m for m in config['models'] if m.get('appProjectId') == project_id]
    
    
    # Auto-update logic: Check for latest versions of linked docs
    # Activado: asegura que los modelos apuntan a la última versión (Tip Version)
    token, error = get_internal_token()
    if not error and token:
        updated_any = False
        models = config.get('models', [])
        
        for model in models:
            # Solo actualizar modelos enlazados directamente desde ACC (DOCS), no GEMELOS estáticos ni LOCALES
            if model.get('source') == 'DOCS' and model.get('projectId') and model.get('itemId'):
                try:
                    # Quick check for latest tip
                    url = f"https://developer.api.autodesk.com/data/v1/projects/{model['projectId']}/items/{model['itemId']}"
                    headers = {'Authorization': f'Bearer {token}'}
                    resp = requests.get(url, headers=headers, timeout=3) # Timeout corto para no bloquear la carga
                    
                    if resp.ok:
                        data = resp.json()
                        latest_version_id = data['data']['relationships']['tip']['data']['id']
                        current_version_id = model.get('versionId')
                        
                        if latest_version_id and latest_version_id != current_version_id:
                            print(f"[AutoUpdate] Se detectó una nueva versión. Actualizando {model['name']} a {latest_version_id}")
                            
                            # Calcular nuevo URN base64 sin paddle
                            urn_bytes = base64.urlsafe_b64encode(latest_version_id.encode('utf-8'))
                            new_urn = urn_bytes.decode('utf-8').rstrip('=')
                            
                            model['urn'] = new_urn
                            model['versionId'] = latest_version_id
                            
                            # Opcional: Extraer también la nueva fecha de modificación
                            try:
                                v_url = f"https://developer.api.autodesk.com/data/v1/projects/{model['projectId']}/versions/{latest_version_id}"
                                v_resp = requests.get(v_url, headers=headers)
                                if v_resp.ok:
                                    v_data = v_resp.json()
                                    model['lastModifiedTime'] = v_data['data']['attributes']['lastModifiedTime']
                            except:
                                pass
                                
                            updated_any = True
                except Exception as e:
                    print(f"[AutoUpdate] Check failed para {model.get('name')}: {e}")
                    continue
        
        if updated_any:
            # Si se actualizó algún URN, guardar los cambios en la BD para que la próxima carga sea rápida
            save_project_config_internal(config)
            
    return jsonify(config)

@digital_twin_bp.route('/api/config/project/add', methods=['POST'])
def add_model_route():
    data = request.json
    config = get_project_config_internal()
    
    app_project_id = data.get('project') # "DRENAJE_URBANO" or "CANAL"
    name = data.get('name')

    new_model = {
        "id": str(int(time.time() * 1000)),
        "name": name,
        "urn": data.get('urn'),
        "source": "DOCS",
        "region": data.get('region', "US"),
        "projectId": data.get('projectId'), # ACC Project ID
        "itemId": data.get('itemId'),
        "versionId": data.get('versionId'),
        "versionNumber": data.get('versionNumber'),
        "lastModifiedTime": data.get('lastModifiedTime'),
        "added_at": datetime.now().isoformat(),
        "appProjectId": app_project_id # Segregation tag
    }
    
    config.setdefault('models', []).append(new_model)
    if save_project_config_internal(config):
         # Return filtered list to frontend so it updates correctly
         if app_project_id:
             config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
         resp = {"models": config['models']}
         return jsonify(resp)
    return jsonify({"error": "Failed to save"}), 500

@digital_twin_bp.route('/api/config/project/update', methods=['POST'])
def update_model_link():
    data = request.get_json()
    if not data or 'urn' not in data:
        return jsonify({'error': 'Missing URN'}), 400
    
    app_project_id = data.get('project')
    
    config = get_project_config_internal()
    model = next((m for m in config.get('models', []) if m['urn'] == data['urn']), None)
    
    if not model:
        return jsonify({'error': 'Model not found'}), 404
        
    if not model.get('projectId') or not model.get('itemId'):
        # Just reload if we can't check for updates
        if app_project_id:
            config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
        return jsonify(config) # Or return specific status to frontend
        
    # Check for new version from APS
    try:
        token, error = get_internal_token()
        if error or not token:
             return jsonify({'error': 'Internal auth failed', 'details': error}), 500
             
        project_id = model['projectId']
        item_id = model['itemId']
        
        # Get Item Tip (Latest Version)
        url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{item_id}"
        headers = {'Authorization': f'Bearer {token}'}
        
        resp = requests.get(url, headers=headers)
        if not resp.ok:
            return jsonify({'error': 'Failed to fetch item details from APS'}), 502
            
        item_data = resp.json()
        
        latest_version_id = item_data['data']['relationships']['tip']['data']['id']
        current_version_id = model.get('versionId')
        
        if latest_version_id != current_version_id:
            # New version detected!
            print(f"Updating model {model['name']} from {current_version_id} to {latest_version_id}")
            
            # Calculate new URN
            # Standard URN is base64 encoded version_id (no padding)
            urn_bytes = base64.urlsafe_b64encode(latest_version_id.encode('utf-8'))
            new_urn = urn_bytes.decode('utf-8').rstrip('=')
            
            # Update Model Record
            model['urn'] = new_urn
            model['versionId'] = latest_version_id
            
            # Optional: Update Name if changed?
            # We can fetch version details if we want the new name:
            # v_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{latest_version_id}"
            # v_resp = requests.get(v_url, headers=headers)
            # if v_resp.ok:
            #    model['name'] = v_resp.json()['data']['attributes']['name'] 
            
            save_project_config_internal(config)
            
            if app_project_id:
                config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
                
            return jsonify({'updated': True, 'config': config, 'newUrn': new_urn})
        else:
            if app_project_id:
                config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
            return jsonify({'updated': False, 'message': 'Already latest version', 'config': config})
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@digital_twin_bp.route('/api/config/project/upload', methods=['POST'])
def upload_local_model():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        label = request.form.get('label', file.filename)
        app_project_id = request.form.get('project') # "DRENAJE_URBANO" or "CANAL"
        
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        token, error = get_internal_token()
        if error or not token:
             return jsonify({'error': 'Internal auth failed', 'details': error}), 500
             
        bucket_key = get_app_bucket_key()
        if not ensure_bucket_exists(bucket_key, token):
             return jsonify({'error': 'Could not create bucket'}), 500
        
        object_name = f"{int(time.time())}_{secure_filename(file.filename)}"
        url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{object_name}'
        
        file_content = file.read()
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/octet-stream'}
        up_resp = requests.put(url, headers=headers, data=file_content)
        
        if not up_resp.ok:
            return jsonify({'error': f"Upload failed: {up_resp.text}"}), 500
            
        object_data = up_resp.json()
        object_id = object_data.get('objectId')
        
        urn_bytes = base64.urlsafe_b64encode(object_id.encode('utf-8'))
        urn = urn_bytes.decode('utf-8').rstrip('=')
        
        translation_triggered = trigger_translation(urn, token, filename=file.filename)
       # 6. Update Config
        config = get_project_config_internal()
        new_model = {
            "id": str(int(time.time() * 1000)),
            "name": label,
            "urn": urn,
            "source": "LOCAL",
            "region": "US",
            "added_at": datetime.now().isoformat(),
            "appProjectId": app_project_id
        }
        config.setdefault('models', []).append(new_model)
        if save_project_config_internal(config):
            # Return filtered list
            if app_project_id:
                 config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
            return jsonify({"status": "success", "urn": urn, "config": config})
        else:
            return jsonify({"error": "Failed to save config"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@digital_twin_bp.route('/api/config/project/remove', methods=['POST'])
def remove_model_route():
    data = request.json
    urn = data.get('urn')
    app_project_id = data.get('project')

    config = get_project_config_internal()
    initial_len = len(config.get('models', []))
    config['models'] = [m for m in config.get('models', []) if m.get('urn') != urn]
    
    if len(config['models']) < initial_len:
        # Delete from DB directly
        delete_model_from_db(urn)
        # Return filtered list
        if app_project_id:
            config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
        return jsonify(config)
    
    return jsonify({"error": "Model not found"}), 404

@digital_twin_bp.route('/api/config/project/relink', methods=['POST'])
def relink_model_route():
    data = request.json
    target_id = data.get('targetId')
    app_project_id = data.get('project') # Segregation
    new_data = data.get('newModel')

    if not target_id or not new_data:
        return jsonify({"error": "Missing targetId or newModel data"}), 400

    config = get_project_config_internal()
    model_found = False

    for m in config.get('models', []):
        # Match by ID (preferred) or URN if needed
        if m.get('id') == target_id or (not target_id and m.get('urn') == data.get('oldUrn')):
            model_found = True
            # Update fields
            m['urn'] = new_data.get('urn')
            m['name'] = new_data.get('name') or new_data.get('label')
            m['versionId'] = new_data.get('versionId')
            m['versionNumber'] = new_data.get('versionNumber')
            m['lastModifiedTime'] = new_data.get('lastModifiedTime')
            m['projectId'] = new_data.get('projectId')
            m['itemId'] = new_data.get('itemId')
            # appProjectId stays same to keep it in same view
            break
    
    if model_found:
        if save_project_config_internal(config):
             if app_project_id:
                 config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
             return jsonify(config)
        else:
             return jsonify({"error": "Failed to save config"}), 500

    return jsonify({"error": "Target model not found"}), 404


@digital_twin_bp.route('/api/model/views', methods=['GET'])
def get_model_views():
    """
    Returns all named viewables (3D views, sheets, phases) for a given model URN.
    These come from the Model Derivative manifest.
    Query params:
      - urn: base64-encoded URN of the model version
    """
    urn = request.args.get('urn')
    if not urn:
        return jsonify({'error': 'Missing URN'}), 400

    try:
        token, error = get_internal_token()
        if error or not token:
            return jsonify({'error': 'Auth failed', 'details': error}), 500

        # Fetch Model Derivative manifest
        manifest_url = f'https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest'
        headers = {'Authorization': f'Bearer {token}'}
        resp = requests.get(manifest_url, headers=headers, timeout=15)

        if not resp.ok:
            return jsonify({'error': f'Manifest fetch failed: {resp.status_code}', 'detail': resp.text}), 502

        manifest = resp.json()
        views = []

        def extract_views(derivatives):
            for deriv in derivatives:
                output_type = deriv.get('outputType') or deriv.get('type', '')
                children = deriv.get('children', [])

                if output_type in ('svf', 'svf2'):
                    for child in children:
                        role = child.get('role', '')
                        name = child.get('name', '')
                        guid = child.get('guid', '')
                        view_type = child.get('viewableID', '') or child.get('type', '')

                        if role == '3d' and guid:
                            views.append({
                                'guid': guid,
                                'name': name or '3D View',
                                'role': '3d',
                                'type': 'view3d'
                            })
                        elif role == '2d' and guid:
                            views.append({
                                'guid': guid,
                                'name': name or '2D Sheet',
                                'role': '2d',
                                'type': 'sheet'
                            })

        derivatives = manifest.get('derivatives', [])
        extract_views(derivatives)

        # Sort: 3D views first, then 2D sheets
        views_sorted = sorted(views, key=lambda v: (0 if v['role'] == '3d' else 1, v['name']))

        return jsonify({'views': views_sorted, 'status': manifest.get('status', 'unknown')})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
@digital_twin_bp.route('/api/config/project/clone', methods=['POST'])
def clone_acc_to_gemelo():
    """Copia un archivo desde ACC a nuestro cubo OSS para crear un Gemelo Digital independiente."""
    try:
        data = request.json
        project_id = data.get('projectId') # ACC Project
        item_id = data.get('itemId')
        version_id = data.get('versionId')
        filename = data.get('name', 'gemelo_digital.rvt')
        app_project_id = data.get('project') # "DRENAJE_URBANO" o "CANAL"

        token, error = get_internal_token()
        if error or not token:
             return jsonify({'error': 'Auth failed', 'details': error}), 500
             
        # 1. Obtener detalles de la versión para conseguir la URL de descarga o storage URN
        # Pero APS permite copiar directamente entre buckets/storages si tenemos el storage URN
        version_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{version_id}"
        v_resp = requests.get(version_url, headers={'Authorization': f'Bearer {token}'})
        if not v_resp.ok:
            return jsonify({'error': 'No se pudo obtener la versión de ACC'}), 500
        
        v_data = v_resp.json()
        storage_urn = v_data['data']['relationships']['storage']['data']['id']
        # Formato esperado: urn:adsk.objects:os.object:wip.dm.prod/UUID
        
        source_bucket, source_obj = parse_storage_urn(storage_urn)
        if not source_bucket:
             return jsonify({'error': 'Formato de storage URN no soportado'}), 500

        # 2. Asegurar nuestro cubo
        dest_bucket = get_app_bucket_key()
        if not ensure_bucket_exists(dest_bucket, token):
             return jsonify({'error': 'No se pudo preparar el almacén local'}), 500
        
        dest_obj = f"gemelo_{int(time.time())}_{secure_filename(filename)}"
        
        # 3. Copiar Objeto (OSS to OSS)
        # Nota: Entre buckets de APS se usa el endpoint de copy
        copy_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{source_bucket}/objects/{source_obj}/copyto/{dest_bucket}/objects/{dest_obj}"
        copy_resp = requests.put(copy_url, headers={'Authorization': f'Bearer {token}'})
        
        if not copy_resp.ok:
            print(f"Error copia directa: {copy_resp.text}")
            # Si falla la copia directa (a veces entre regiones o WIP), intentamos descarga/subida (más lento pero seguro)
            # Por ahora probamos directa.
            return jsonify({'error': 'Falla en la clonación directa', 'details': copy_resp.text}), 500
            
        dest_data = copy_resp.json()
        dest_object_id = dest_data['objectId']
        
        # 4. Generar URN Base64
        urn_bytes = base64.urlsafe_b64encode(dest_object_id.encode('utf-8'))
        new_urn = urn_bytes.decode('utf-8').rstrip('=')
        
        # 5. Trigger Translation
        trigger_translation(new_urn, token, filename=filename)
        
        # 6. Registrar en DB
        config = get_project_config_internal()
        new_model = {
            "id": str(int(time.time() * 1000)),
            "name": f"{filename} (Gemelo)",
            "urn": new_urn,
            "source": "GEMELO",
            "region": "US",
            "appProjectId": app_project_id,
            "added_at": datetime.now().isoformat(),
            "originalProjectId": project_id,
            "originalVersionId": version_id
        }
        config.setdefault('models', []).append(new_model)
        save_project_config_internal(config)
        
        return jsonify({"status": "success", "urn": new_urn, "config": config})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def parse_storage_urn(urn):
    """Extrae bucket y object_name de un urn de storage tipo 'urn:adsk.objects:os.object:bucket/object'"""
    if not urn or ':' not in urn: return None, None
    try:
        parts = urn.split(':')
        last_part = parts[-1] # 'bucket/object'
        if '/' in last_part:
            b, o = last_part.split('/', 1)
            return b, o
    except:
        pass
    return None, None

