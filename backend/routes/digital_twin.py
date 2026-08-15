from esquema_congelado import solo_con_ddl
import os
import urllib.parse
import time
import json
import base64
import traceback
import threading
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from politica import publico_en_lectura
from werkzeug.utils import secure_filename
from aps import get_internal_token
from routes.inventory import sanitize_urn
from perimetro_de_obra import guardia_de_obra

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

@solo_con_ddl
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

def trigger_translation(urn, token, filename='', forzar=False):
    """Lanza la traduccion SVF de un URN. Vale para modelos y para nubes de puntos.

    SIN forzar por defecto. 'x-ads-force' obliga a Autodesk a rehacer la
    traduccion desde cero AUNQUE YA ESTUVIERA HECHA, y cada trabajo se cobra
    (0,5 creditos un Revit o un IFC). Estaba puesto a 'true' fijo: cada reintento
    del usuario, cada recarga de la pantalla que dispare esto, vuelve a pagar por
    un trabajo que ya estaba pagado. Se fuerza solo cuando de verdad se quiere
    rehacer.
    """
    url = 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    if forzar:
        headers['x-ads-force'] = 'true'
    
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
        # SVF2: formato con INSTANCIACIÓN de geometría (clave para acero/rebar)
        # y streaming por visibilidad — el mismo que usa Tandem/ACC. El visor
        # ahora inicializa con api streamingV2, así que todo derivado nuevo
        # debe ser svf2 (svf clásico ya no se carga).
        payload = {
            'input': {'urn': urn},
            'output': {
                'formats': [
                    {'type': 'svf2', 'views': ['2d', '3d']}
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
@publico_en_lectura(motivo='la vista compartida por enlace la necesita para saber que modelo cargar; sin sesion solo responde si se le dice de que obra')
def get_config_route():
    config = get_project_config_internal()
    project_id = request.args.get('project')

    # Esta ruta es publica porque la vista compartida por enlace la necesita sin
    # sesion. Pero SIN ?project devolvia TODOS los modelos de TODAS las obras
    # con sus URN, que encadenado con /api/token (publico, data:read sobre la
    # cuenta APS) permitia a un anonimo enumerar y abrir cualquier modelo. Sin
    # sesion, y sin decir de que obra, no se entrega catalogo.
    if not project_id and not getattr(g, 'current_user', None):
        config['models'] = []
        return jsonify(config)

    print(f"\n[DIAG-GET] project_id={project_id}, total_models_in_db={len(config.get('models',[]))}")
    for m in config.get('models', []):
        print(f"  [DIAG-GET] model: name={m.get('name')}, appProjectId={m.get('appProjectId')}, urn=...{str(m.get('urn',''))[-20:]}")
    
    if project_id and 'models' in config:
        # Aislamiento estricto: appProjectId es el scope completo del frente.
        # Proyecto y frente NO se filtran por texto parcial, porque eso cruza
        # proyectos distintos que comparten palabras como "DRENAJE".
        exact_models = [
            m for m in config['models']
            if m.get('appProjectId') == project_id
        ]

        # Compatibilidad solo para scopes legacy guardados como "CANAL" o
        # "DRENAJE" sin prefijo de proyecto. Se usa unicamente si no hay
        # coincidencias exactas, nunca como mezcla adicional.
        if not exact_models and '_' in project_id:
            frente = project_id.rsplit('_', 1)[1].upper()
            exact_models = [
                m for m in config['models']
                if m.get('appProjectId', '').upper() == frente
            ]

        config['models'] = exact_models
    
    
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
    # El frente ("1_DRENAJE") resuelve a su obra por la convencion
    # "<projects.id>_<FRENTE>", asi que el guardia lo entiende igual.
    negativa = guardia_de_obra(app_project_id, 'vincular un modelo a la obra')
    if negativa:
        return negativa
    name = data.get('name')
    print(f"\n[DIAG-ADD] project={app_project_id}, name={name}, urn=...{str(data.get('urn',''))[-20:]}")

    # GUARD ANTI-DUPLICADOS (estilo Tandem): el mismo URN no puede vincularse
    # dos veces al mismo frente — evita doble entrada en config y doble carga
    # en el visor. También bloquea por itemId (misma pieza de ACC en otra versión).
    dup = next((m for m in config.get('models', [])
                if m.get('appProjectId') == app_project_id and (
                    m.get('urn') == data.get('urn')
                    or (data.get('itemId') and m.get('itemId') == data.get('itemId'))
                )), None)
    if dup:
        return jsonify({
            "error": "duplicate",
            "message": f"'{dup.get('name')}' ya está vinculado a este frente"
                       + (" (misma pieza de ACC; usa Update para traer la versión nueva)."
                          if dup.get('urn') != data.get('urn') else "."),
        }), 409

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
    negativa = guardia_de_obra(app_project_id, 'cambiar el vinculo de un modelo')
    if negativa:
        return negativa

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

            # PRE-CHEQUEO DE TRADUCCIÓN (igual que Relink): si la versión nueva todavía
            # NO está traducida en ACC, no cambiamos el modelo ni disparamos una extracción
            # condenada a fallar (properties 202 → timeout). El modelo se queda en su versión
            # vieja —que funciona— y el usuario reintenta en unos minutos. Esto elimina los
            # updates "que no traen datos" (causa #1 de inestabilidad).
            if not _is_model_translated(new_urn, token):
                print(f"[Update] Versión nueva de {model['name']} aún traduciéndose; se pospone.")
                return jsonify({
                    'updated': False,
                    'pending_translation': True,
                    'message': 'La nueva versión aún se está traduciendo en ACC. Reintenta en unos minutos.'
                }), 200

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
            
            # AUTO-EXTRACT: Disparar extracción en background (no depende del frontend).
            # Devolvemos el job_id para que el frontend SONDEE este mismo job en vez de
            # lanzar una segunda extracción (antes corrían dos en paralelo del mismo URN).
            target = app_project_id or model.get('appProjectId') or new_urn
            extraction_job_id = None
            try:
                from routes.inventory import extract_metadata_task
                extraction_job_id = f"auto_update_{int(time.time())}"
                thread = threading.Thread(
                    target=extract_metadata_task,
                    args=(new_urn, target, extraction_job_id),
                    daemon=True
                )
                thread.start()
                print(f"[Update] Auto-extracción iniciada en background (job: {extraction_job_id})")
            except Exception as extract_err:
                print(f"[Update] Advertencia: No se pudo iniciar auto-extracción: {extract_err}")

            if app_project_id:
                config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]

            return jsonify({'updated': True, 'config': config, 'newUrn': new_urn, 'extraction_job_id': extraction_job_id})
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

@digital_twin_bp.route('/api/config/project/update-all', methods=['POST'])
def update_all_models():
    """UPDATE MASIVO profesional (estilo Tandem), resuelto SERVER-SIDE:
    - UNA sola lectura y UNA sola escritura del config (sin carreras
      read-modify-write entre N requests).
    - Pre-chequeo de traducción por modelo (los no listos se posponen,
      no rompen el lote).
    - Extracciones EN COLA (secuenciales en un hilo): no se lanzan N hilos
      en paralelo contra la API de properties de APS — esa era la causa de
      los fallos del update masivo.
    - Devuelve reporte por modelo: updated / up_to_date / pending_translation /
      no_acc_metadata / error, con su job de extracción para sondear."""
    data = request.get_json() or {}
    app_project_id = data.get('project')
    if not app_project_id:
        return jsonify({'error': 'Missing project'}), 400
    # Este endpoint dispara extracciones contra la API de Autodesk para TODOS
    # los modelos del frente: sin guardia, un ajeno consume creditos de la obra.
    negativa = guardia_de_obra(app_project_id, 'actualizar todos los modelos del frente')
    if negativa:
        return negativa

    token, error = get_internal_token()
    if error or not token:
        return jsonify({'error': 'Internal auth failed', 'details': error}), 500
    headers = {'Authorization': f'Bearer {token}'}

    config = get_project_config_internal()
    project_models = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]

    results = []
    to_extract = []   # [(new_urn, target, job_id)]
    config_dirty = False

    for model in project_models:
        entry = {'id': model.get('id'), 'name': model.get('name'), 'urn': model.get('urn')}
        pid, iid = model.get('projectId'), model.get('itemId')
        if not pid or not iid:
            entry.update(status='no_acc_metadata', message='Sin projectId/itemId (usa Relink).')
            results.append(entry)
            continue
        try:
            resp = requests.get(
                f"https://developer.api.autodesk.com/data/v1/projects/{pid}/items/{iid}",
                headers=headers, timeout=15)
            if not resp.ok:
                entry.update(status='error', message=f'ACC item {resp.status_code}')
                results.append(entry)
                continue
            latest_version_id = resp.json()['data']['relationships']['tip']['data']['id']
            if latest_version_id == model.get('versionId'):
                entry.update(status='up_to_date', versionNumber=model.get('versionNumber'))
                results.append(entry)
                continue

            new_urn = base64.urlsafe_b64encode(latest_version_id.encode('utf-8')).decode('utf-8').rstrip('=')
            if not _is_model_translated(new_urn, token):
                entry.update(status='pending_translation',
                             message='La versión nueva aún se traduce en ACC. Reintenta en unos minutos.')
                results.append(entry)
                continue

            # Mutar el modelo EN SU LUGAR (misma posición del config = mismo slot en el visor)
            model['urn'] = new_urn
            model['versionId'] = latest_version_id
            try:
                v_resp = requests.get(
                    f"https://developer.api.autodesk.com/data/v1/projects/{pid}/versions/{urllib.parse.quote(latest_version_id, safe='')}",
                    headers=headers, timeout=10)
                if v_resp.ok:
                    attrs = v_resp.json().get('data', {}).get('attributes', {})
                    ext_attrs = attrs.get('extension', {}).get('data', {})
                    if attrs.get('versionNumber'):
                        model['versionNumber'] = attrs.get('versionNumber')
                    lmt = attrs.get('lastModifiedTime') or ext_attrs.get('lastModifiedTime') or attrs.get('createTime')
                    if lmt:
                        model['lastModifiedTime'] = lmt
            except Exception as ve:
                print(f"[UpdateAll] version details {model.get('name')}: {ve}")
            if not model.get('lastModifiedTime'):
                model['lastModifiedTime'] = datetime.now().isoformat() + 'Z'
            try:
                model['versionNumber'] = model.get('versionNumber') or int(latest_version_id.split('?version=')[1])
            except (IndexError, ValueError):
                pass

            config_dirty = True
            job_id = f"auto_update_{model.get('id') or new_urn[:8]}_{int(time.time())}"
            to_extract.append((new_urn, app_project_id, job_id))
            entry.update(status='updated', newUrn=new_urn,
                         versionNumber=model.get('versionNumber'), extraction_job_id=job_id)
            results.append(entry)
        except Exception as me:
            traceback.print_exc()
            entry.update(status='error', message=str(me))
            results.append(entry)

    if config_dirty:
        save_project_config_internal(config)

    # Cola de extracciones: UN hilo, secuencial. Jobs pre-registrados como
    # 'queued' para que el frontend pueda sondear desde ya.
    if to_extract:
        from routes.inventory import extract_metadata_task, set_job
        for (u, t, j) in to_extract:
            set_job(j, {'status': 'queued', 'progress': 0, 'message': 'En cola de extracción…'})

        def run_queue(queue):
            for (u, t, j) in queue:
                try:
                    extract_metadata_task(u, t, j)
                except Exception as qe:
                    print(f"[UpdateAll] extracción {j} falló: {qe}")
        threading.Thread(target=run_queue, args=(to_extract,), daemon=True).start()

    config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
    summary = {
        'updated': sum(1 for r in results if r['status'] == 'updated'),
        'up_to_date': sum(1 for r in results if r['status'] == 'up_to_date'),
        'pending_translation': sum(1 for r in results if r['status'] == 'pending_translation'),
        'errors': sum(1 for r in results if r['status'] == 'error'),
        'no_acc_metadata': sum(1 for r in results if r['status'] == 'no_acc_metadata'),
    }
    return jsonify({'results': results, 'summary': summary, 'config': config})


# ─── SUBIDA DIRECTA DESDE EL NAVEGADOR ───────────────────────────────────────
# Como lo hace Tandem: los bytes van del navegador A AMAZON, sin pasar por
# nuestro backend.
#
# POR QUE IMPORTA AQUI, y no es una elegancia: el backend corre con 4 workers y
# 2 hilos, o sea OCHO peticiones simultaneas para TODA la plataforma. Una subida
# de 300 MB que atraviese el backend retiene uno de esos ocho hilos varios
# minutos y ademas se lee entera en memoria. Dos o tres modelos a la vez y se
# queda sin aire el portal entero: documentos, fotos de campo, LOB.
#
# Con la URL firmada, el backend solo hace dos llamadas cortas -- firmar y
# cerrar -- y los megas viajan por su cuenta.

@digital_twin_bp.route('/api/modelos/publicar-desde-ecd', methods=['POST'])
def publicar_modelo_desde_ecd():
    """Lleva al visor un modelo que YA esta en el ECD, sin volver a subirlo.

    Hasta ahora un modelo se subia dos veces -- una al gestor documental y otra
    al visor -- y de ahi salian las dos cosas de siempre: se desincronizan y
    nadie sabe cual manda. Peor: el modelo del visor no tiene estado, ni
    idoneidad, ni revision, ni huella, porque llego por su cuenta. Mirando el
    visor no se podia decir si lo que se ve es la version aprobada.

    Aqui el documento del ECD ES el modelo. Los bytes ya estan en el almacen: se
    leen de ahi y se pasan a Autodesk sin que nadie vuelva a subir nada.

    FASE 1 de dos. La FASE 2 -- esperar la traduccion y registrar el modelo -- es
    `/api/config/project/upload/finalize`, que ya existe y funciona. No se
    duplica: dos copias del mismo flujo es como se llego a tener una version
    viva y otra muerta.
    """
    from flask import g
    import publicar_al_visor as pub

    d = request.get_json() or {}
    node_id = d.get('node_id')
    model_urn = d.get('model_urn')
    forzar = bool(d.get('forzar'))
    if not node_id or not model_urn:
        return jsonify({'error': 'Faltan node_id o model_urn'}), 400

    negativa = guardia_de_obra(model_urn, 'publicar un modelo al visor')
    if negativa:
        return negativa
    # Traducir cuesta creditos de la cuenta de Autodesk que paga el usuario.
    user = getattr(g, 'current_user', None) or {}
    if user.get('role') != 'admin':
        return jsonify({'error': 'Solo un administrador puede publicar modelos '
                                 'al visor.'}), 403

    try:
        from db import get_db_connection, log_activity
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS urn_aps TEXT')
            cur.execute("""SELECT n.id, n.name, n.gcs_urn, n.model_urn, n.status,
                                  n.size_bytes, v.sha256, n.urn_aps
                             FROM file_nodes n
                             LEFT JOIN file_versions v ON v.id = n.current_version_id
                            WHERE n.id = %s AND NOT COALESCE(n.is_deleted, FALSE)""",
                        (str(node_id),))
            fila = cur.fetchone()
            conn.commit()

        try:
            doc = pub.comprobar_documento(fila, model_urn)
        except pub.NoSePuedePublicar as motivo:
            return jsonify({'error': str(motivo)}), 400

        # Ya publicado: se devuelve el mismo URN en vez de pagar otra vez. No es
        # hipotetico -- basta con que dos personas pulsen el boton.
        urn_previo = pub.ya_publicado(doc, forzar)
        if urn_previo:
            return jsonify({'status': 'ya_publicado', 'urn': urn_previo,
                            'translation_triggered': False,
                            'nombre': doc['nombre']}), 200

        token, error = get_internal_token()
        if error or not token:
            return jsonify({'error': 'Autenticación con Autodesk fallida'}), 502
        bucket = get_app_bucket_key()
        if not ensure_bucket_exists(bucket, token):
            return jsonify({'error': 'No se pudo preparar el almacén de Autodesk'}), 502

        # Los bytes salen del almacen del ECD y van a Autodesk sin pasar por el
        # navegador de nadie: es el mismo fichero que aprobo la obra.
        from gcs_manager import get_storage_client
        from routes.docs_cad import _upload_to_oss, _urn_of
        bucket_gcs = os.environ.get('GCS_BUCKET_NAME')
        blob = get_storage_client().bucket(bucket_gcs).blob(doc['gcs_urn'])
        try:
            with blob.open('rb') as flujo:
                object_id, fallo = _upload_to_oss(
                    token, bucket, pub.clave_de_objeto(doc), flujo,
                    size=doc['size_bytes'] or None)
        except Exception as e:
            return jsonify({'error': 'No se pudo leer el fichero del almacén: %s'
                                     % str(e)[:120]}), 502
        if fallo:
            return jsonify({'error': 'Autodesk rechazó la subida: %s' % fallo}), 502

        urn = _urn_of(object_id)
        lanzada = trigger_translation(urn, token, filename=doc['nombre'], forzar=forzar)

        # El URN se guarda EN EL DOCUMENTO: es lo que ata el modelo del visor con
        # su ficha del expediente, y lo que evita pagar dos veces por lo mismo.
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE file_nodes SET urn_aps = %s WHERE id = %s',
                        (urn, doc['node_id']))
            conn.commit()

        log_activity(model_urn, 'modelo_publicado_al_visor', 'file',
                     entity_id=doc['node_id'], entity_name=doc['nombre'],
                     performed_by=user.get('name') or user.get('email'),
                     details={'urn': urn, 'traduccion': bool(lanzada),
                              'forzada': forzar})
        return jsonify({'status': 'uploaded', 'urn': urn, 'nombre': doc['nombre'],
                        'translation_triggered': bool(lanzada)}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@digital_twin_bp.route('/api/modelos/firmar-subida', methods=['POST'])
def firmar_subida_de_modelo():
    """Devuelve las URL firmadas para que el navegador suba el modelo a S3."""
    from flask import g
    from routes.docs_cad import PART_SIZE, APS_BASE, _headers
    d = request.get_json() or {}
    nombre = (d.get('filename') or '').strip()
    try:
        tamano = int(d.get('size') or 0)
    except (TypeError, ValueError):
        tamano = 0
    if not nombre or tamano <= 0:
        return jsonify({'error': 'Falta el nombre o el tamaño del archivo'}), 400

    # Traducir un modelo cuesta creditos de la cuenta de Autodesk que paga el
    # usuario. Esto no lo dispara cualquiera con sesion.
    user = getattr(g, 'current_user', None)
    if not user:
        return jsonify({'error': 'Autenticación requerida'}), 401
    if user.get('role') != 'admin':
        return jsonify({'error': 'Solo un administrador puede publicar modelos al visor.'}), 403

    token, error = get_internal_token()
    if error or not token:
        return jsonify({'error': 'Autenticación con Autodesk fallida', 'details': error}), 500
    bucket = get_app_bucket_key()
    if not ensure_bucket_exists(bucket, token):
        return jsonify({'error': 'No se pudo preparar el almacén de Autodesk'}), 500

    object_key = f"{int(time.time())}_{secure_filename(nombre)}"
    partes = max(1, (tamano + PART_SIZE - 1) // PART_SIZE)
    # 60 minutos, el maximo. El valor por defecto de Autodesk son DOS, y con eso
    # una subida de obra caduca a mitad de camino.
    r = requests.get(
        f'{APS_BASE}/oss/v2/buckets/{bucket}/objects/{object_key}/signeds3upload'
        f'?parts={partes}&minutesExpiration=60',
        headers=_headers(token), timeout=60)
    if not r.ok:
        return jsonify({'error': f'Autodesk no dio la URL de subida: {r.text[:200]}'}), 502
    info = r.json()
    return jsonify({
        'objectKey': object_key,
        'uploadKey': info.get('uploadKey'),
        'urls': info.get('urls') or [],
        'partSize': PART_SIZE,
    })


@digital_twin_bp.route('/api/modelos/cerrar-subida', methods=['POST'])
def cerrar_subida_de_modelo():
    """Cierra la subida contra Autodesk y lanza la traducción."""
    from flask import g
    from routes.docs_cad import APS_BASE, _headers, _urn_of
    d = request.get_json() or {}
    object_key, upload_key = d.get('objectKey'), d.get('uploadKey')
    if not object_key or not upload_key:
        return jsonify({'error': 'Falta objectKey o uploadKey'}), 400

    user = getattr(g, 'current_user', None)
    if not user or user.get('role') != 'admin':
        return jsonify({'error': 'Solo un administrador puede publicar modelos al visor.'}), 403

    token, error = get_internal_token()
    if error or not token:
        return jsonify({'error': 'Autenticación con Autodesk fallida'}), 500
    bucket = get_app_bucket_key()

    # Este paso es OBLIGATORIO aunque el fichero haya ido en un solo trozo: hasta
    # que no se cierra, para Autodesk el objeto no existe.
    done = requests.post(
        f'{APS_BASE}/oss/v2/buckets/{bucket}/objects/{object_key}/signeds3upload',
        headers=_headers(token, {'Content-Type': 'application/json'}),
        json={'uploadKey': upload_key}, timeout=300)
    if not done.ok:
        return jsonify({'error': f'Autodesk rechazó el cierre: {done.text[:200]}'}), 502

    urn = _urn_of(done.json().get('objectId'))
    lanzada = trigger_translation(urn, token, filename=d.get('filename') or object_key)
    return jsonify({'status': 'uploaded', 'urn': urn,
                    'translation_triggered': bool(lanzada)})


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

        # ── POR QUE ESTO CAMBIO ──────────────────────────────────────────────
        # Aqui habia un PUT directo a /oss/v2/buckets/{bucket}/objects/{objeto}
        # con los bytes en el cuerpo. Autodesk RETIRO ese endpoint el 31 de
        # diciembre de 2022: ya no se pasan binarios por su proxy. Desde
        # entonces, subir un modelo desde el visor fallaba aqui.
        #
        # El camino correcto (pedir URL firmada de S3, subir a Amazon, y cerrar
        # la subida contra APS) YA estaba escrito en este mismo repositorio, en
        # routes/docs_cad.py, funcionando para los resultados de Civil 3D. Se
        # reutiliza en vez de escribirlo por segunda vez: dos copias del mismo
        # flujo es como se llego a tener una version viva y otra muerta.
        from routes.docs_cad import _upload_to_oss, _urn_of

        file.stream.seek(0, 2)
        tamano = file.stream.tell()
        file.stream.seek(0)
        object_id, fallo = _upload_to_oss(token, bucket_key, object_name,
                                          file.stream, size=tamano)
        if fallo:
            return jsonify({'error': f"Upload failed: {fallo}"}), 500

        urn = _urn_of(object_id)
        
        translation_triggered = trigger_translation(urn, token, filename=file.filename)

        # FASE 1 completa: archivo subido + traducción disparada. El modelo NO se
        # agrega al config todavía — eso lo hace /upload/finalize cuando la
        # traducción termina (así el visor nunca recibe un modelo a medio traducir
        # y la extracción de metadata corre en el momento correcto).
        return jsonify({
            "status": "uploaded",
            "urn": urn,
            "translation_triggered": bool(translation_triggered),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@digital_twin_bp.route('/api/config/project/upload/finalize', methods=['POST'])
def finalize_local_upload():
    """FASE 2 del upload local (sondeada por el frontend cada pocos segundos):
    - Si la traducción sigue en curso → {ready: false, progress}.
    - Si falló → {ready: false, failed: true, message}.
    - Si terminó → agrega el modelo al config (con guard anti-duplicados y la
      primera vista 3D como defaultViewGuid), dispara la extracción de metadata
      (mismo pipeline que update/relink) y devuelve el config + job."""
    try:
        data = request.get_json() or {}
        urn = data.get('urn')
        label = data.get('label') or 'Modelo local'
        app_project_id = data.get('project')
        if not urn or not app_project_id:
            return jsonify({'error': 'Faltan urn o project'}), 400

        token, error = get_internal_token()
        if error or not token:
            return jsonify({'error': 'Internal auth failed'}), 500

        # Estado real de la traducción (manifest)
        r = requests.get(
            f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest",
            headers={'Authorization': f'Bearer {token}'}, timeout=15)
        if not r.ok:
            return jsonify({'ready': False, 'progress': 'Esperando manifest…'}), 200
        manifest = r.json() or {}
        status = manifest.get('status')
        if status in ('pending', 'inprogress'):
            return jsonify({'ready': False, 'progress': manifest.get('progress') or 'Traduciendo…'}), 200
        if status in ('failed', 'timeout'):
            return jsonify({'ready': False, 'failed': True,
                            'message': f"La traducción falló ({status}). Revisa el archivo."}), 200

        # Traducción lista → primera vista 3D (fallback: primera geometría)
        default_guid = None
        try:
            for d in manifest.get('derivatives', []):
                for ch in d.get('children', []):
                    if ch.get('type') == 'geometry':
                        if ch.get('role') == '3d':
                            default_guid = ch.get('guid')
                            break
                        default_guid = default_guid or ch.get('guid')
                if default_guid:
                    break
        except Exception:
            pass

        config = get_project_config_internal()
        existing = next((m for m in config.get('models', [])
                         if m.get('urn') == urn and m.get('appProjectId') == app_project_id), None)
        if not existing:
            new_model = {
                "id": str(int(time.time() * 1000)),
                "name": label,
                "urn": urn,
                "source": "LOCAL",
                "region": "US",
                "added_at": datetime.now().isoformat(),
                "appProjectId": app_project_id,
            }
            if default_guid:
                new_model["defaultViewGuid"] = default_guid
            config.setdefault('models', []).append(new_model)
            if not save_project_config_internal(config):
                return jsonify({'error': 'Failed to save config'}), 500

        # Auto-extracción de metadata (paridad con update/relink/DOCS)
        extraction_job_id = None
        try:
            from routes.inventory import extract_metadata_task, set_job
            extraction_job_id = f"auto_upload_{int(time.time())}"
            set_job(extraction_job_id, {'status': 'queued', 'progress': 0, 'message': 'En cola de extracción…'})
            threading.Thread(target=extract_metadata_task,
                             args=(urn, app_project_id, extraction_job_id), daemon=True).start()
        except Exception as ee:
            print(f"[UploadFinalize] extracción no iniciada: {ee}")

        config['models'] = [m for m in config.get('models', []) if m.get('appProjectId') == app_project_id]
        return jsonify({'ready': True, 'config': config, 'urn': urn,
                        'defaultViewGuid': default_guid, 'extraction_job_id': extraction_job_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ── FRENTES DINÁMICOS ─────────────────────────────────────────────────────────
# Los 3 frentes base (CANAL / DRENAJE / INFRAWORKS) viven en el frontend;
# los adicionales (ej. INTERFERENCIAS) se crean desde la UI y persisten aquí.
# Un frente es solo un scope "{base_project_id}_{front_id}" — todo lo demás
# (config, inventario, tracking, LOB) ya se aísla por ese id.

@solo_con_ddl
def ensure_frentes_table():
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS project_frentes (
                    id SERIAL PRIMARY KEY,
                    base_project_id TEXT NOT NULL,
                    front_id        TEXT NOT NULL,
                    name            TEXT NOT NULL,
                    description     TEXT,
                    icon            TEXT DEFAULT '📌',
                    created_at      TIMESTAMP DEFAULT NOW(),
                    UNIQUE (base_project_id, front_id)
                )""")
            # front_type vivia en un ALTER dentro del handler GET: cada peticion de
            # lectura ejecutaba DDL. Su sitio es aqui, que corre una sola vez en el
            # arranque del esquema y no en el camino HTTP.
            cur.execute("ALTER TABLE project_frentes ADD COLUMN IF NOT EXISTS front_type TEXT")

            # SEED ÚNICO: los 3 frentes que antes estaban hardcodeados se migran
            # a datos SOLO para los proyectos existentes en este momento (con
            # centinela para no re-sembrar). Los proyectos creados después
            # nacen VACÍOS — aislamiento real estilo ACC.
            cur.execute("""SELECT 1 FROM project_frentes
                           WHERE base_project_id = '__meta__' AND front_id = 'SEEDED_BASE'""")
            if not cur.fetchone():
                base = [
                    ('CANAL', 'Frente Canal', 'Gestión de infraestructura hidráulica, canales y revestimientos.', '🌊'),
                    ('DRENAJE', 'Frente Drenaje Urbano', 'Captación pluvial, tuberías, buzones y obras urbanas de drenaje.', '🏙️'),
                    ('INFRAWORKS', 'Frente Infraworks', 'Visualización de modelos conceptuales y de contexto territorial o urbano.', '🛣️'),
                ]
                try:
                    cur.execute("SELECT id FROM projects")
                    for (pid,) in cur.fetchall():
                        for fid, name, desc, icon in base:
                            cur.execute("""
                                INSERT INTO project_frentes (base_project_id, front_id, name, description, icon)
                                VALUES (%s, %s, %s, %s, %s)
                                ON CONFLICT (base_project_id, front_id) DO NOTHING
                            """, (str(pid), fid, name, desc, icon))
                    cur.execute("""
                        INSERT INTO project_frentes (base_project_id, front_id, name, description, icon)
                        VALUES ('__meta__', 'SEEDED_BASE', 'seed', '', '')
                        ON CONFLICT DO NOTHING""")
                    print("[frentes] Frentes base sembrados en proyectos existentes.")
                except Exception as se:
                    print(f"[frentes] seed base: {se}")

            conn.commit()
            print("[frentes] Tabla project_frentes lista.")
    except Exception as e:
        print(f"[frentes] ensure_frentes_table: {e}")


@digital_twin_bp.route('/api/frentes', methods=['DELETE'])
def delete_project_frente():
    """Elimina la TARJETA del frente (no toca los datos de su scope:
    si el frente tenía modelos/inventario, siguen en la BD por si se recrea)."""
    try:
        data = request.get_json() or {}
        base = data.get('base_project_id')
        negativa = guardia_de_obra(base, 'borrar la tarjeta de un frente')
        if negativa:
            return negativa
        front_id = (data.get('front_id') or '').strip().upper()
        if not base or not front_id:
            return jsonify({'error': 'Faltan base_project_id o front_id'}), 400
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                DELETE FROM project_frentes
                WHERE base_project_id = %s AND front_id = %s
                RETURNING front_id""", (base, front_id))
            row = cur.fetchone()
            conn.commit()
        if not row:
            return jsonify({'error': 'Frente no encontrado'}), 404
        return jsonify({'status': 'ok', 'frontId': front_id}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@digital_twin_bp.route('/api/frentes', methods=['GET', 'POST'])
def project_frentes():
    """GET ?base=<projectId> → frentes personalizados del proyecto.
    POST {base_project_id, name, description?, icon?} → crea el frente
    (front_id se deriva del nombre: 'Interferencias' → 'INTERFERENCIAS')."""
    try:
        from db import get_db_connection
        if request.method == 'GET':
            base = request.args.get('base')
            if not base:
                return jsonify({'error': 'Falta base'}), 400
            negativa = guardia_de_obra(base, 'listar los frentes de la obra')
            if negativa:
                return negativa
            with get_db_connection() as conn:
                cur = conn.cursor()
                conn.commit()
                cur.execute("""
                    SELECT front_id, name, description, icon, front_type FROM project_frentes
                    WHERE base_project_id = %s ORDER BY id""", (base,))
                rows = cur.fetchall()

                # Estado Civil por frente (scope = base_frontId): nº de ejes y de
                # estaciones extraídas — para el badge ✓ extraído / ⏳ pendiente.
                scopes = [f"{base}_{r[0]}" for r in rows]
                status = {}
                if scopes:
                    try:
                        cur.execute("""
                            SELECT scope_urn,
                                   COALESCE(SUM(CASE WHEN jsonb_typeof(data)='array'
                                                     THEN jsonb_array_length(data) ELSE 0 END), 0)
                            FROM civil_alignments WHERE scope_urn = ANY(%s) GROUP BY scope_urn
                        """, (scopes,))
                        for s, ejes in cur.fetchall():
                            status[s] = {'ejes': int(ejes or 0), 'estaciones': 0}
                        cur.execute("""
                            SELECT scope_urn,
                                   COALESCE(SUM(CASE
                                       WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data)
                                       WHEN jsonb_typeof(data->'stations')='array' THEN jsonb_array_length(data->'stations')
                                       ELSE 0 END), 0)
                            FROM civil_sections WHERE scope_urn = ANY(%s) GROUP BY scope_urn
                        """, (scopes,))
                        for s, est in cur.fetchall():
                            status.setdefault(s, {'ejes': 0})['estaciones'] = int(est or 0)
                    except Exception:
                        pass  # tablas civil aún no existen: todo en pendiente

                return jsonify({'frentes': [
                    {
                        'frontId': r[0], 'name': r[1], 'description': r[2] or '',
                        'icon': r[3] or '📌', 'frontType': (r[4] or '').strip(),
                        'civil': status.get(f"{base}_{r[0]}")
                    }
                    for r in rows
                ]}), 200

        data = request.get_json() or {}
        base = data.get('base_project_id')
        name = (data.get('name') or '').strip()
        if not base or not name:
            return jsonify({'error': 'Faltan base_project_id o name'}), 400
        negativa = guardia_de_obra(base, 'crear un frente')
        if negativa:
            return negativa

        # front_id: slug en mayúsculas, solo A-Z0-9_ (es parte del scope de datos)
        import re as _re
        import unicodedata as _ud
        slug = _ud.normalize('NFD', name).encode('ascii', 'ignore').decode('ascii')
        slug = _re.sub(r'[^A-Za-z0-9]+', '_', slug).strip('_').upper()
        if not slug or slug == '__META__':
            return jsonify({'error': 'Nombre inválido'}), 400

        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO project_frentes (base_project_id, front_id, name, description, icon, front_type)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (base_project_id, front_id) DO NOTHING
                RETURNING front_id""",
                (base, slug, name, (data.get('description') or '').strip(),
                 (data.get('icon') or '📌').strip()[:8],
                 (data.get('front_type') or '').strip()[:40] or None))
            row = cur.fetchone()
            conn.commit()
        if not row:
            return jsonify({'error': f"El frente '{slug}' ya existe en este proyecto."}), 409
        return jsonify({'status': 'ok', 'frontId': slug, 'name': name}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@digital_twin_bp.route('/api/inventory/purge-source', methods=['POST'])
def purge_inventory_source():
    """Limpia filas de inventory_assets extraídas para un modelo que NUNCA se
    vinculó (usuario canceló el import de DOCS después de la extracción).
    Seguridad: si el URN está vinculado al frente en el config, NO se purga."""
    try:
        data = request.get_json() or {}
        source_urn = data.get('source_urn')
        target = data.get('project')
        if not source_urn or not target:
            return jsonify({'error': 'Faltan source_urn o project'}), 400
        negativa = guardia_de_obra(target, 'purgar el inventario de un modelo')
        if negativa:
            return negativa

        config = get_project_config_internal()
        linked = any(m.get('urn') == source_urn and m.get('appProjectId') == target
                     for m in config.get('models', []))
        if linked:
            return jsonify({'purged': 0, 'linked': True}), 200

        from db import get_db_connection
        urns = list(dict.fromkeys([source_urn, sanitize_urn(source_urn)]))
        with get_db_connection() as conn:
            cursor = conn.cursor()
            fmt = ','.join(['%s'] * len(urns))
            cursor.execute(
                f"DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn IN ({fmt})",
                [target] + urns)
            purged = cursor.rowcount
            conn.commit()
        print(f"[PurgeSource] {purged} filas huérfanas eliminadas (import cancelado).")
        return jsonify({'purged': purged}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@digital_twin_bp.route('/api/config/project/remove', methods=['POST'])
def remove_model_route():
    data = request.json
    urn = data.get('urn')
    app_project_id = data.get('project')
    negativa = guardia_de_obra(app_project_id, 'desvincular un modelo de la obra')
    if negativa:
        return negativa
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
    negativa = guardia_de_obra(app_project_id, 'reapuntar un modelo a otro archivo')
    if negativa:
        return negativa

    # SEGURIDAD TRANSACCIONAL (Fase 6): el relink apunta a OTRO archivo (otro base_urn),
    # así que la limpieza por linaje de la extracción no cubre la data vieja.
    # Pre-chequeo: no seguimos si el nuevo modelo aún no está traducido (la
    # extracción fallaría y daría una mala UX inmediata).
    _new_urn = new_data.get('urn')
    if _new_urn:
        _tok, _ = get_internal_token()
        if _tok and not _is_model_translated(_new_urn, _tok):
            return jsonify({
                "error": "El nuevo modelo aun no esta traducido. Reintente en unos minutos.",
                "code": "TRANSLATION_PENDING"
            }), 409

    # El borrado del inventario viejo se hace de forma ATÓMICA dentro de la
    # extracción (purge_source_urns): solo se borra cuando los datos nuevos ya
    # están insertados y a punto de commitear. Si la extracción falla, NO se
    # pierde la data vieja -> el frente nunca queda vacío por un error.
    # Solo si NO vamos a extraer (faltan urn/proyecto) caemos al borrado directo.
    will_extract = bool(_new_urn and app_project_id)
    if old_urn and app_project_id and not will_extract:
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
                print(f"[Relink] Limpieza inventario (respaldo, sin extracción): {deleted} registros eliminados")
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
             # AUTO-EXTRACT: Disparar extracción en background para el nuevo URN.
             # Devolvemos el job_id para que el frontend sondee este job (evita doble extracción).
             new_urn = new_data.get('urn')
             extraction_job_id = None
             if new_urn and app_project_id:
                 try:
                     from routes.inventory import extract_metadata_task
                     extraction_job_id = f"auto_relink_{int(time.time())}"
                     thread = threading.Thread(
                         target=extract_metadata_task,
                         args=(new_urn, app_project_id, extraction_job_id),
                         kwargs={'purge_source_urns': [old_urn] if old_urn else None},
                         daemon=True
                     )
                     thread.start()
                     print(f"[Relink] Auto-extracción iniciada en background (job: {extraction_job_id})")
                 except Exception as extract_err:
                     print(f"[Relink] Advertencia: No se pudo iniciar auto-extracción: {extract_err}")

             if app_project_id:
                 config['models'] = [m for m in config['models'] if m.get('appProjectId') == app_project_id]
             resp = dict(config)
             resp['extraction_job_id'] = extraction_job_id
             return jsonify(resp)
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
