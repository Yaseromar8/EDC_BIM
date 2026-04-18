import os
import json
import threading
import time
import requests
import psycopg2
from datetime import datetime
from flask import Blueprint, request, jsonify

inventory_bp = Blueprint('inventory', __name__)

# Memoria temporal para progreso (en un entorno PROD debería ser Redis/DB)
EXTRACTION_JOBS = {}

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"

def get_internal_token():
    from aps import get_internal_token as aps_token
    return aps_token()

def sanitize_urn(urn):
    """
    Convierte un URN base64 estandar a base64 URL-safe.
    Autodesk Model Derivative API requiere URL-safe base64:
      - '+' -> '-'
      - '/' -> '_'
      - Eliminar '=' de padding
    Si el URN es texto plano (urn:adsk...), primero lo codifica.
    """
    if urn.startswith('urn:adsk'):
        import base64
        urn = base64.b64encode(urn.encode()).decode()
    # Convertir a URL-safe base64
    urn = urn.replace('+', '-').replace('/', '_').rstrip('=')
    return urn

def extract_metadata_task(urn, target_urn, job_id):
    """ Tarea en segundo plano para extraer metadata de Autodesk. """
    try:
        print(f"\n[Extractor] ===== INICIO JOB: {job_id} =====")
        print(f"[Extractor] URN recibido (raw): {urn}")
        
        # Sanitizar URN a URL-safe base64
        urn = sanitize_urn(urn)
        print(f"[Extractor] URN sanitizado: {urn}")
        print(f"[Extractor] Target URN: {target_urn}")
        
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 0, 'message': 'Conectando con Autodesk...'}
        token_result = get_internal_token()
        if isinstance(token_result, tuple):
            token, err = token_result
        else:
            token, err = token_result, None
            
        if err or not token:
            raise Exception(f"Token error: {err}")
        print(f"[Extractor] Token obtenido OK")
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 10, 'message': 'Autenticacion exitosa. Consultando modelo...'}

        # Fase 1: GUID
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 20, 'message': 'Buscando metadatos 3D del modelo...'}
        uid_url = f"{APS_MD_URL}/{urn}/metadata"
        headers = {'Authorization': f'Bearer {token}'}
        
        print(f"[Extractor] Fase 1 - GET {uid_url}")
        resp = requests.get(uid_url, headers=headers)
        print(f"[Extractor] Fase 1 - Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"[Extractor] Fase 1 - Body: {resp.text[:500]}")
            resp.raise_for_status()
            
        metadata = resp.json().get('data', {}).get('metadata', [])
        print(f"[Extractor] Fase 1 - Encontradas {len(metadata)} vistas")
        
        if not metadata:
            raise Exception("No se encontraron metadatos para este URN.")
        
        guid = None
        for view in metadata:
            print(f"[Extractor]   Vista: {view.get('name')} (role={view.get('role')}, guid={view.get('guid')})")
            if view.get('role') == '3d':
                guid = view['guid']
                break
        if not guid:
            guid = metadata[0]['guid']
        print(f"[Extractor] GUID seleccionado: {guid}")

        # Fase 2: Extracción Properties
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 40, 'message': 'Descargando propiedades (puede tardar)...'}
        prop_url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties?forceget=true"
        print(f"[Extractor] Fase 2 - GET {prop_url}")
        
        collection = None
        max_retries = 30
        for attempt in range(max_retries):
            resp = requests.get(prop_url, headers=headers)
            print(f"[Extractor] Fase 2 - Intento {attempt+1}/{max_retries}: status={resp.status_code}")
            
            if resp.status_code == 202:
                # Autodesk is still preparing the data
                pct = 40 + int((attempt / max_retries) * 30)  # 40% -> 70%
                EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': pct, 'message': f'Esperando respuesta de Autodesk (intento {attempt+1})...'}
                time.sleep(5)
                continue
            resp.raise_for_status()
            collection = resp.json().get('data', {}).get('collection', [])
            print(f"[Extractor] Fase 2 - Recibidos {len(collection)} elementos")
            break
            
        if collection is None:
            raise Exception("Autodesk tardó demasiado en preparar las propiedades.")

        # Fase 2.1: Extracción Árbol Jerárquico (Para Herencia Tipo->Instancia)
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 70, 'message': 'Descargando árbol jerárquico (Fusión Semántica)...'}
        hier_url = f"{APS_MD_URL}/{urn}/metadata/{guid}"
        print(f"[Extractor] Fase 2.1 - GET {hier_url}")
        hier_resp = requests.get(hier_url, headers=headers)
        hier_resp.raise_for_status()
        hier_objects = hier_resp.json().get('data', {}).get('objects', [])
        
        parent_map = {}
        def build_parent_map(objects_list, parent_id):
            for obj in objects_list:
                obj_id = obj.get('objectid')
                if parent_id is not None:
                    parent_map[obj_id] = parent_id
                children = obj.get('objects', [])
                if children:
                    build_parent_map(children, obj_id)
        build_parent_map(hier_objects, None)
        print(f"[Extractor] Fase 2.1 - Jerarquía extraída: {len(parent_map)} relaciones padre-hijo")

        # Fase 3: Inserción BD y Fusión Genética
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 80, 'message': 'Estructurando gemelo digital (Fusionando Familias)...'}
        
        props_by_id = {node.get('objectid'): node.get('properties', {}) for node in collection}
        
        import copy
        def deep_merge(target, source):
            for k, v in source.items():
                if isinstance(v, dict):
                    if k not in target or not isinstance(target[k], dict):
                        target[k] = {}
                    deep_merge(target[k], v)
                else:
                    # Source es más específico (hijo). Sobrescribe al target (padre) SOLO si aporta valor real
                    val_src = str(v).strip() if v is not None else ''
                    if val_src != '' and val_src != 'None':
                        target[k] = copy.deepcopy(v)

        inventory_data = []
        for node in collection:
            name = node.get('name', 'Unnamed')
            external_id = node.get('externalId')
            objectid = node.get('objectid')
            if not external_id:
                continue
                
            ancestral_path = []
            curr_id = parent_map.get(objectid)
            while curr_id is not None:
                ancestral_path.append(curr_id)
                curr_id = parent_map.get(curr_id)
            ancestral_path.reverse()
            
            merged_props = {}
            for anc_id in ancestral_path:
                anc_props = props_by_id.get(anc_id, {})
                deep_merge(merged_props, anc_props)
                
            my_props = node.get('properties', {})
            deep_merge(merged_props, my_props)
            
            inventory_data.append({
                "name": name,
                "external_id": external_id,
                "properties": json.dumps(merged_props)
            })

        print(f"[Extractor] Fase 3 - {len(inventory_data)} objetos con ID para insertar")

        if not inventory_data:
            EXTRACTION_JOBS[job_id] = {'status': 'success', 'progress': 100, 'message': 'El modelo no contiene objetos con ID.'}
            print(f"[Extractor] Sin objetos con ID. Finalizando.")
            return

        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # WIPE QUIRÚRGICO: Elimina los datos fantasmas antiguos para este modelo específico.
            print(f"[Extractor] Aplicando Hard Wipe (Espejo Estricto) para model_urn={target_urn} y source_urn={urn}")
            cursor.execute("DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn = %s", (target_urn, urn))

            current_time = datetime.now()
            records = [
                (item['external_id'], target_urn, urn, item['name'], item['properties'], current_time) 
                for item in inventory_data
            ]
            
            from psycopg2.extras import execute_values
            insert_query = """
                INSERT INTO inventory_assets (external_id, model_urn, source_urn, name, properties, last_updated)
                VALUES %s
                ON CONFLICT (model_urn, source_urn, external_id) DO UPDATE SET 
                    name = EXCLUDED.name,
                    properties = EXCLUDED.properties,
                    last_updated = EXCLUDED.last_updated;
            """
            execute_values(cursor, insert_query, records)
            conn.commit()

        EXTRACTION_JOBS[job_id] = {'status': 'success', 'progress': 100, 'message': f'Extracción completa. {len(inventory_data)} activos insertados.'}
        print(f"[Extractor] COMPLETADO: {len(inventory_data)} activos insertados en PostgreSQL")
        print(f"[Extractor] ===== FIN JOB: {job_id} =====\n")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Extractor ERROR] {e}")
        EXTRACTION_JOBS[job_id] = {'status': 'error', 'progress': 0, 'message': str(e)}


@inventory_bp.route('/api/inventory/extract', methods=['POST'])
def start_extraction():
    data = request.get_json() or {}
    urn = data.get('urn')
    target_urn = data.get('target_urn') or urn
    
    if not urn:
        return jsonify({'error': 'Missing urn'}), 400

    # Sanitize job_id: replace / with _ to avoid breaking Flask URL routing
    safe_urn = urn.replace('/', '_').replace('+', '-')
    job_id = f"job_{safe_urn}_{int(time.time())}"
    
    # Iniciar hilo secundario
    thread = threading.Thread(target=extract_metadata_task, args=(urn, target_urn, job_id))
    thread.daemon = True
    thread.start()
    
    return jsonify({'job_id': job_id}), 202


@inventory_bp.route('/api/inventory/extract/status/<job_id>', methods=['GET'])
def get_extraction_status(job_id):
    job = EXTRACTION_JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
        
    return jsonify({
        'status': job['status'],
        'progress': job['progress'],
        'message': job['message']
    })


@inventory_bp.route('/api/inventory/viewables/<path:urn>', methods=['GET'])
def get_model_viewables(urn):
    """
    Consulta las vistas publicadas (viewables) de un modelo ya traducido en ACC.
    Devuelve la lista de vistas 3D y 2D con su GUID y nombre.
    """
    try:
        from urllib.parse import unquote
        urn = unquote(urn)  # Decode %2F -> / etc.
        urn = sanitize_urn(urn)  # Convert to URL-safe base64
        
        token_result = get_internal_token()
        if isinstance(token_result, tuple):
            token, err = token_result
            if err:
                return jsonify({'error': f'Token error: {err}'}), 500
        else:
            token = token_result

        url = f"{APS_MD_URL}/{urn}/metadata"
        headers = {'Authorization': f'Bearer {token}'}
        
        print(f"[Viewables] Fetching: {url}")
        resp = requests.get(url, headers=headers)
        
        if resp.status_code == 202:
            return jsonify({'views': [], 'message': 'Model still processing'}), 202
        if resp.status_code == 401:
            return jsonify({'error': 'Autodesk token expired or invalid'}), 401
        resp.raise_for_status()
        
        metadata = resp.json().get('data', {}).get('metadata', [])
        
        views = []
        for view in metadata:
            views.append({
                'guid': view.get('guid'),
                'name': view.get('name', 'Unnamed View'),
                'role': view.get('role', 'unknown'),
                'is3D': view.get('role') == '3d'
            })
        
        print(f"[Viewables] Found {len(views)} views for URN: {urn[:40]}...")
        return jsonify({'views': views})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Viewables Error] {e}")
        return jsonify({'error': str(e)}), 500

