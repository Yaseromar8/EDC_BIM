import os
import requests
import json
import base64
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime
from dotenv import load_dotenv

# Cargar las variables desde el archivo .env en la raíz
load_dotenv()

# =====================================================================
# CONFIGURACIÓN (EXTRAÍDO AUTOMÁTICAMENTE DEL .ENV Y LA BD LOCAL)
# =====================================================================
APS_CLIENT_ID = os.getenv("APS_CLIENT_ID")
APS_CLIENT_SECRET = os.getenv("APS_CLIENT_SECRET")
TARGET_URN = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc/dmVyc2lvbj0yNg"

# PostgreSQL Credentials
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "")

# URLs base de Autodesk Platform Services
APS_AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token"
APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"

def get_access_token() -> str:
    """
    Fase 1: Autenticación 2-Legged OAuth v2.
    """
    print("[1] Solicitando Token de Acceso APS...")
    
    auth_str = f"{APS_CLIENT_ID}:{APS_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    
    payload = {
        'grant_type': 'client_credentials',
        'scope': 'data:read data:search'
    }
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': f'Basic {b64_auth}'
    }
    
    response = requests.post(APS_AUTH_URL, data=payload, headers=headers)
    response.raise_for_status()
    
    token_data = response.json()
    print("    -> ¡Autenticación Exitosa!")
    return token_data.get('access_token')

def get_model_view_guid(urn: str, access_token: str) -> str:
    """
    Fase 2: Obtener Metadata GUID.
    """
    print(f"\n[2] Buscando Metadatos y GUID del modelo para URN: {urn}...")
    
    url = f"{APS_MD_URL}/{urn}/metadata"
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    metadata = response.json().get('data', {}).get('metadata', [])
    if not metadata:
        raise Exception("No se encontraron metadatos para este URN.")
    
    for view in metadata:
        if view.get('role') == '3d':
            print(f"    -> Vista 3D encontrada. GUID General: {view['guid']}")
            return view['guid']
            
    fallback_guid = metadata[0]['guid']
    print(f"    -> Vista genérica encontrada. GUID: {fallback_guid}")
    return fallback_guid

def extract_immutable_inventory(urn: str, guid: str, access_token: str):
    """
    Fase 3: Extracción de Propiedades y Filtrado Estricto de Llaves (ExternalId).
    """
    print("\n[3] Extrayendo árbol de propiedades... (Esto puede tardar en modelos enormes)")
    
    url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties?forceget=true"
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.get(url, headers=headers)
    if response.status_code == 202:
        print("    -> La API de Autodesk está preparando el JSON (202 Accepted). Por favor reintenta en unos instantes.")
        return None
        
    response.raise_for_status()
    
    collection = response.json().get('data', {}).get('collection', [])
    print(f"    -> Descarga completada. Analizando {len(collection)} nodos...")

    # Fase 3.1: Extracción Árbol Jerárquico (Para Herencia Tipo->Instancia)
    print("\n[3.1] Extrayendo árbol jerárquico (Fusión Semántica Tipo->Instancia)...")
    hier_url = f"{APS_MD_URL}/{urn}/metadata/{guid}"
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

    print(f"    -> Jerarquía extraída: {len(parent_map)} relaciones padre-hijo")
    
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
        
        clean_element = {
            "name": name,
            "external_id": external_id,
            "properties": json.dumps(merged_props)
        }
        inventory_data.append(clean_element)

    print(f"    -> Extracción finalizada. {len(inventory_data)} elementos listos para ingestar (Familias Fusionadas).")
    return inventory_data

def insert_into_db(inventory_data, target_urn):
    """
    Fase 4: Inserción Masiva en PostgreSQL (UPSERT / Idempotencia).
    Inserta el inventario evitando duplicar external_id's.
    """
    if not inventory_data:
        print("\n[!] No hay datos para insertar en la base de datos.")
        return

    print(f"\n[4] Conectando a PostgreSQL y ejecutando UPSERT para el modelo: {target_urn}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        # Activar el autocommit por bloque o usar transaction blocks.
        conn.autocommit = False 
        cursor = conn.cursor()

        # Preparar los datos en una lista de tuplas para Inserción Rápida
        current_time = datetime.now()
        records_to_insert = [
            (item['external_id'], target_urn, item['name'], item['properties'], current_time) 
            for item in inventory_data
        ]

        # Query SQL UPSERT
        # ON CONFLICT ejecuta DO UPDATE para actualizar de forma segura si ya existía el external_id
        insert_query = """
            INSERT INTO inventory_assets (external_id, model_urn, name, properties, last_updated)
            VALUES %s
            ON CONFLICT (external_id) DO UPDATE SET 
                model_urn = EXCLUDED.model_urn,
                name = EXCLUDED.name,
                properties = EXCLUDED.properties,
                last_updated = EXCLUDED.last_updated;
        """

        # execute_values es altamente eficiente (Batch Insert)
        execute_values(cursor, insert_query, records_to_insert)
        
        conn.commit()
        print(f"    -> ¡Éxito! {len(records_to_insert)} elementos insertados o actualizados correctamente.")

    except psycopg2.Error as e:
        print(f"    -> [ERROR PostgreSQL]: {e}")
        if 'conn' in locals() and conn is not None:
             conn.rollback()
    finally:
        if 'cursor' in locals() and cursor is not None:
            cursor.close()
        if 'conn' in locals() and conn is not None:
            conn.close()

if __name__ == "__main__":
    try:
        # 1. Autenticar
        token = get_access_token()
        
        # Corrección de URL-Safe Base64
        safe_urn = TARGET_URN.replace('+', '-').replace('/', '_').rstrip('=')
        
        # 2. Descubrir el GUID del modelo federado / view
        guid = get_model_view_guid(safe_urn, token)
        
        # 3. Descargar y filtrar
        clean_inventory = extract_immutable_inventory(safe_urn, guid, token)
        
        # 4. Insertar a PostgreSQL
        if clean_inventory is not None:
            insert_into_db(clean_inventory, safe_urn)
            
    except requests.exceptions.HTTPError as he:
        print(f"\n[!] Error en la API REST APS: {he}")
        if he.response is not None:
             print(he.response.text)
    except Exception as e:
        print(f"\n[!] Fallo crítico en el motor: {e}")
