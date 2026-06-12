import os
import urllib.parse
import time
import json
import base64
import traceback
import threading
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from aps import get_internal_token
from routes.inventory import sanitize_urn

digital_twin_bp = Blueprint('digital_twin', __name__)


def _is_model_translated(urn, token):
    """True si el modelo esta traducido (manifest status 'success').
    Solo devuelve False cuando el manifest dice claramente que NO esta listo;
    ante error/duda devuelve True (fail-open) para no bloquear flujos validos."""
    try:
        r = requests.get(
            f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest",
            headers={'Authorization': f'Bearer {token}'}, timeout=12)
        if not r.ok:
            return True
        return (r.json() or {}).get('status') == 'success'
    except Exception:
        return True

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
                       version_id, version_number, last_modified_time, app_project_id, added_at, default_view_guid
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
                    'added_at': r[11].isoformat() if r[11] else None,
                    'defaultViewGuid': r[12]
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
                         version_id, version_number, last_modified_time, app_project_id, default_view_guid, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (model_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        urn = EXCLUDED.urn,
                        version_id = EXCLUDED.version_id,
                        version_number = EXCLUDED.version_number,
                        last_modified_time = EXCLUDED.last_modified_time,
                        default_view_guid = EXCLUDED.default_view_guid,
                        updated_at = NOW()
                ''', (
                    model.get('id'), model.get('name'), model.get('urn'),
                    model.get('source', 'DOCS'), model.get('region', 'US'),
                    model.get('projectId'), model.get('itemId'),
                    model.get('versionId'), model.get('versionNumber'),
                    model.get('lastModifiedTime'), model.get('appProjectId'),
                    model.get('defaultViewGuid')
                ))
            conn.commit()
            db_ok = True
    except Exception as e:
        print(f"[digital_twin] DB save failed: {e}")
 
    return db_ok

def delete_model_from_db(urn, app_project_id=None):
    """Deletes a specific model from the DB by URN and optionally app_project_id."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if app_project_id:
                cursor.execute('DELETE FROM model_config WHERE urn = %s AND app_project_id = %s', (urn, app_project_id))
            else:
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
    print(f"\n[DIAG-GET] project_id={project_id}, total_models_in_db={len(config.get('models',[]))}")
    for m in config.get('models', []):
        print(f"  [DIAG-GET] model: name={m.get('name')}, appProjectId={m.get('appProjectId')}, urn=...{str(m.get('urn',''))[-20:]}")
    
    if project_id and 'models' in config:
        # Filtrado inteligente por frente.
        # project_id viene como "1_CANAL", "1_DRENAJE", "1_INFRAWORKS", etc.
        # Los appProjectId en la config pueden ser: "CANAL", "1_CANAL", "DRENAJE_URBANO", etc.
        if '_' in project_id:
            parts = project_id.split('_', 1)
            base_id = parts[0]       # ej: "1"
            frente = parts[1].upper() # ej: "CANAL", "DRENAJE"
            
            config['models'] = [
                m for m in config['models']
                if m.get('appProjectId') == project_id                        # exact: "1_CANAL"
                or m.get('appProjectId', '').upper() == frente                 # frente name: "CANAL"
                or frente in m.get('appProjectId', '').upper()                 # partial: "DRENAJE" in "DRENAJE_URBANO"
            ]
        else:
            # Sin frente, filtrar solo por ID exacto
            config['models'] = [
                m for m in config['models']
                if m.get('appProjectId') == project_id
            ]
    
    
    # NOTA: Se eliminó el Auto-Update silencioso que existía aquí.
    # Razón: Actualizaba el URN del modelo automáticamente al abrir la app,
    # sin re-extraer metadata a PostgreSQL ni permitir elegir vista.
    # Esto causaba desfase entre el visor 3D y los datos del inventario.
    # Las actualizaciones ahora son controladas por el usuario via el botón "Update"
    # en el menú de SourceFilesPanel, que usa POST /api/config/project/update.
            
    return jsonify(config)

@digital_twin_bp.route('/api/projects/<path:project_id>/frentes', methods=['GET'])
def list_project_frentes(project_id):
    """Lista los frentes reales de un proyecto (agrupaciones de modelos).
    Un frente es el sufijo del app_project_id en model_config: '1_CANAL' -> 'CANAL'.
    Sustituye las tarjetas hardcodeadas del Gateway de frontend-docs."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT app_project_id, COUNT(*), MAX(updated_at::text)
                FROM model_config
                WHERE app_project_id = %s OR app_project_id LIKE %s
                GROUP BY app_project_id
                ORDER BY app_project_id
            ''', (str(project_id), str(project_id) + '\\_%'))
            frentes = []
            for app_pid, n_models, last_update in cursor.fetchall():
                # Sufijo después del id del proyecto ('1_CANAL' -> 'CANAL')
                tag = app_pid.split('_', 1)[1] if app_pid.startswith(str(project_id) + '_') else app_pid
                frentes.append({
                    'id': tag,
                    'app_project_id': app_pid,
                    'models': n_models,
                    'last_update': last_update
                })
        return jsonify({'frentes': frentes})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@digital_twin_bp.route('/api/config/project/add', methods=['POST'])
def add_model_route():
    data = request.json
    config = get_project_config_internal()
    
    app_project_id = data.get('project') # "DRENAJE_URBANO" or "CANAL"
    name = data.get('name')
    print(f"\n[DIAG-ADD] project={app_project_id}, name={name}, urn=...{str(data.get('urn',''))[-20:]}")

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
    
    if data.get('defaultViewGuid'):
        new_model["defaultViewGuid"] = data.get('defaultViewGuid')
    
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
    model = next((m for m in config.get('models', []) if m['urn'] == data['urn'] and m.get('appProjectId') == app_project_id), None)
    
    if not model:
        return jsonify({'error': 'Model not found'}), 404
        
    if not model.get('projectId') or not model.get('itemId'):
        # Can't check for updates without ACC metadata
        return jsonify({'updated': False, 'message': 'Este modelo no tiene projectId/itemId. Use Relink.'}), 200
        
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
            old_urn = model['urn']
            print(f"Updating model {model['name']} from {current_version_id} to {latest_version_id}")
            
            # Calculate new URN
            urn_bytes = base64.urlsafe_b64encode(latest_version_id.encode('utf-8'))
            new_urn = urn_bytes.decode('utf-8').rstrip('=')
            
            # SEGURIDAD TRANSACCIONAL (Fase 6): NO se borra el inventario viejo aqui.
            # Es la misma version-lineage (mismo base_urn), asi que extract_metadata_task
            # purga las versiones historicas y re-inserta en UNA sola transaccion atomica.
            # Si la extraccion falla (ej. traduccion no lista), el inventario viejo queda
            # intacto en vez de quedar vacio. (Antes habia un DELETE no-atomico aqui.)

            # Update Model Record
            version_num_before = model.get('versionNumber')
            model['urn'] = new_urn
            model['versionId'] = latest_version_id
            
            # Fetch version attributes to update versionNumber and lastModifiedTime
            try:
                v_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{urllib.parse.quote(latest_version_id, safe='')}"
                v_resp = requests.get(v_url, headers=headers, timeout=10)
                if v_resp.ok:
                    v_data = v_resp.json()
                    attrs = v_data.get('data', {}).get('attributes', {})
                    ext_attrs = attrs.get('extension', {}).get('data', {})
                    if attrs.get('versionNumber'):
                        model['versionNumber'] = attrs.get('versionNumber')
                    # lastModifiedTime puede estar en attributes o en extension.data
                    lmt = attrs.get('lastModifiedTime') or ext_attrs.get('lastModifiedTime') or attrs.get('createTime')
                    if lmt:
                        model['lastModifiedTime'] = lmt
            except Exception as e:
                print(f"[Update] Error fetching version details: {e}")
            
            # FALLBACK: Si aún no hay lastModifiedTime, usar timestamp actual
            if not model.get('lastModifiedTime'):
                model['lastModifiedTime'] = datetime.now().isoformat() + 'Z'
            
            # FALLBACK: Extraer versionNumber del version_id si la API no lo devolvió
            # El version_id siempre tiene formato "...?version=N"
            if not model.get('versionNumber') or model.get('versionNumber') == version_num_before:
                try:
                    v_num_from_id = int(latest_version_id.split('?version=')[1])
                    model['versionNumber'] = v_num_from_id
                    print(f"[Update] versionNumber extraído del ID: v{v_num_from_id}")
                except (IndexError, ValueError):
                    pass
            
            save_project_config_internal(config)
            
            # AUTO-EXTRACT: Disparar extracción en background (no depende del frontend)
            target = app_project_id or model.get('appProjectId') or new_urn
            try:
                from routes.inventory import extract_metadata_task
                job_id = f"auto_update_{int(time.time())}"
                thread = threading.Thread(
                    target=extract_metadata_task,
                    args=(new_urn, target, job_id),
                    daemon=True
                )
                thread.start()
                print(f"[Update] Auto-extracción iniciada en background (job: {job_id})")
            except Exception as extract_err:
                print(f"[Update] Advertencia: No se pudo iniciar auto-extracción: {extract_err}")
            
            if app_project_id:
                config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
                
            return jsonify({'updated': True, 'config': config, 'newUrn': new_urn})
        else:
            # Self-healing: Update might have occurred before the metadata fix.
            # Force verify if we have the correct lastModifiedTime and versionNumber.
            healed = False
            try:
                v_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{urllib.parse.quote(latest_version_id, safe='')}"
                v_resp = requests.get(v_url, headers=headers, timeout=10)
                if v_resp.ok:
                    v_data = v_resp.json()
                    attrs = v_data.get('data', {}).get('attributes', {})
                    if attrs.get('versionNumber') and model.get('versionNumber') != attrs.get('versionNumber'):
                        model['versionNumber'] = attrs.get('versionNumber')
                        healed = True
                    if attrs.get('lastModifiedTime') and model.get('lastModifiedTime') != attrs.get('lastModifiedTime'):
                        model['lastModifiedTime'] = attrs.get('lastModifiedTime')
                        healed = True
            except Exception as e:
                print(f"[Update] Error self-healing version details: {e}")

            if healed:
                save_project_config_internal(config)
                if app_project_id:
                    config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
                # Return updated:True but newUrn:None so it updates UI without triggering extraction again
                return jsonify({'updated': True, 'message': 'Metadata resynced', 'config': config})

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
    print(f"\n[DIAG-REMOVE] project={app_project_id}, urn=...{str(urn or '')[-20:]}")

    config = get_project_config_internal()
    initial_len = len(config.get('models', []))
    
    if app_project_id:
        config['models'] = [m for m in config.get('models', []) if not (m.get('urn') == urn and m.get('appProjectId') == app_project_id)]
    else:
        config['models'] = [m for m in config.get('models', []) if m.get('urn') != urn]
    
    if len(config['models']) < initial_len:
        # Delete model config from DB
        delete_model_from_db(urn, app_project_id)

        # CLEANUP: Purgar metadata de inventory_assets
        # COHERENCIA: sanitize_urn normaliza el URN exactamente como lo hace
        # extract_metadata_task antes de almacenar source_urn en inventory_assets.
        try:
            from db import get_db_connection
            urn_sanitized = sanitize_urn(urn)
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Estrategia multi-capa para garantizar purga completa:
                # 1. Intentar con URN sanitizado (como lo guarda extract_metadata_task)
                if app_project_id:
                    cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s AND model_urn = %s", (urn_sanitized, app_project_id))
                else:
                    cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s", (urn_sanitized,))
                deleted_count = cursor.rowcount
                
                # 2. Si no encontró nada, intentar con URN raw (por si hay datos legacy)
                if deleted_count == 0 and urn != urn_sanitized:
                    if app_project_id:
                        cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s AND model_urn = %s", (urn, app_project_id))
                    else:
                        cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s", (urn,))
                    deleted_count = cursor.rowcount
                

                
                conn.commit()
                print(f"[Remove] Limpieza inventario: {deleted_count} registros eliminados (URN: ...{urn_sanitized[-30:]})")
        except Exception as cleanup_err:
            print(f"[Remove] Advertencia: Error limpiando inventory_assets: {cleanup_err}")

        # Return filtered list
        if app_project_id:
            config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
        return jsonify(config)
    
    return jsonify({"error": "Model not found"}), 404

@digital_twin_bp.route('/api/config/project/relink', methods=['POST'])
def relink_model_route():
    data = request.json
    target_id = data.get('targetId')
    old_urn = data.get('oldUrn')
    app_project_id = data.get('project') # Segregation
    if isinstance(app_project_id, dict):
        app_project_id = app_project_id.get('id')
    new_data = data.get('newModel')

    if not target_id or not new_data:
        return jsonify({"error": "Missing targetId or newModel data"}), 400

    # SEGURIDAD TRANSACCIONAL (Fase 6): el relink apunta a OTRO archivo (otro base_urn),
    # asi que la extraccion no purga la data vieja: hay que borrarla aqui. Pero NO la
    # borramos si el nuevo modelo aun no esta traducido (la extraccion fallaria y
    # quedaria sin datos). Verificamos primero.
    _new_urn = new_data.get('urn')
    if _new_urn:
        _tok, _ = get_internal_token()
        if _tok and not _is_model_translated(_new_urn, _tok):
            return jsonify({
                "error": "El nuevo modelo aun no esta traducido. Reintente en unos minutos.",
                "code": "TRANSLATION_PENDING"
            }), 409

    # LIMPIEZA: Borrar inventario del URN viejo antes de relinkear
    # COHERENCIA: sanitize_urn asegura match con el formato de source_urn en inventory_assets.
    if old_urn and app_project_id:
        try:
            from db import get_db_connection
            old_urn_sanitized = sanitize_urn(old_urn)
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn IN (%s, %s)",
                    (app_project_id, old_urn_sanitized, old_urn)
                )
                deleted = cursor.rowcount
                conn.commit()
                print(f"[Relink] Limpieza inventario: {deleted} registros del URN viejo eliminados")
        except Exception as cleanup_err:
            print(f"[Relink] Advertencia: Error limpiando inventario viejo: {cleanup_err}")

    config = get_project_config_internal()
    model_found = False

    for m in config.get('models', []):
        # Match by ID (preferred) or URN if needed
        if m.get('id') == target_id or (not target_id and m.get('urn') == old_urn):
            model_found = True
            # Update fields
            m['urn'] = new_data.get('urn')
            m['name'] = new_data.get('name') or new_data.get('label')
            m['versionId'] = new_data.get('versionId')
            m['versionNumber'] = new_data.get('versionNumber')
            m['lastModifiedTime'] = new_data.get('lastModifiedTime')
            m['projectId'] = new_data.get('projectId')
            m['itemId'] = new_data.get('itemId')
            if new_data.get('defaultViewGuid'):
                m['defaultViewGuid'] = new_data.get('defaultViewGuid')
            # appProjectId stays same to keep it in same view
            break
    
    if model_found:
        if save_project_config_internal(config):
             # AUTO-EXTRACT: Disparar extracción en background para el nuevo URN
             new_urn = new_data.get('urn')
             if new_urn and app_project_id:
                 try:
                     from routes.inventory import extract_metadata_task
                     job_id = f"auto_relink_{int(time.time())}"
                     thread = threading.Thread(
                         target=extract_metadata_task,
                         args=(new_urn, app_project_id, job_id),
                         daemon=True
                     )
                     thread.start()
                     print(f"[Relink] Auto-extracción iniciada en background (job: {job_id})")
                 except Exception as extract_err:
                     print(f"[Relink] Advertencia: No se pudo iniciar auto-extracción: {extract_err}")

             if app_project_id:
                 config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
             return jsonify(config)
        else:
             return jsonify({"error": "Failed to save config"}), 500

    return jsonify({"error": "Target model not found"}), 404


@digital_twin_bp.route('/api/config/project/check-updates', methods=['POST'])
def check_model_updates():
    """Verifica si hay versiones nuevas disponibles en ACC para los modelos del proyecto.
    No aplica cambios — solo informa."""
    data = request.get_json() or {}
    app_project_id = data.get('project')
    if not app_project_id:
        return jsonify({'error': 'Missing project'}), 400

    config = get_project_config_internal()
    project_models = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]

    if not project_models:
        return jsonify({'updates': []})

    try:
        token, error = get_internal_token()
        if error or not token:
            return jsonify({'error': 'Auth failed'}), 500

        headers = {'Authorization': f'Bearer {token}'}
        updates = []

        for model in project_models:
            pid = model.get('projectId')
            iid = model.get('itemId')
            if not pid or not iid:
                updates.append({
                    'model_id': model.get('id'),
                    'name': model.get('name'),
                    'has_update': False,
                    'reason': 'no_acc_metadata',
                    'current_version': model.get('versionNumber'),
                })
                continue

            try:
                url = f"https://developer.api.autodesk.com/data/v1/projects/{pid}/items/{iid}"
                resp = requests.get(url, headers=headers, timeout=10)
                if not resp.ok:
                    updates.append({
                        'model_id': model.get('id'),
                        'name': model.get('name'),
                        'has_update': False,
                        'reason': f'api_error_{resp.status_code}',
                        'current_version': model.get('versionNumber'),
                    })
                    continue

                item_data = resp.json()
                latest_version_id = item_data['data']['relationships']['tip']['data']['id']
                current_version_id = model.get('versionId')

                has_update = latest_version_id != current_version_id

                # Extract version number from latest_version_id if possible
                latest_version_num = None
                if has_update:
                    try:
                        v_url = f"https://developer.api.autodesk.com/data/v1/projects/{pid}/versions/{urllib.parse.quote(latest_version_id, safe='')}"
                        v_resp = requests.get(v_url, headers=headers, timeout=10)
                        if v_resp.ok:
                            v_data = v_resp.json()
                            latest_version_num = v_data.get('data', {}).get('attributes', {}).get('versionNumber')
                    except Exception:
                        pass

                updates.append({
                    'model_id': model.get('id'),
                    'name': model.get('name'),
                    'has_update': has_update,
                    'current_version': model.get('versionNumber'),
                    'latest_version': latest_version_num,
                    'urn': model.get('urn'),
                })
            except Exception as model_err:
                print(f"[check-updates] Error checking {model.get('name')}: {model_err}")
                updates.append({
                    'model_id': model.get('id'),
                    'name': model.get('name'),
                    'has_update': False,
                    'reason': 'exception',
                    'current_version': model.get('versionNumber'),
                })

        return jsonify({'updates': updates})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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
    except Exception:
        pass
    return None, None

