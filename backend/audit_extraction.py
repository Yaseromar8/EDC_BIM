"""
AUDITORÍA DE EXTRACCIÓN: Compara lo que la API de Autodesk devuelve vs. lo que
el clasificador de nodos actual está guardando en PostgreSQL.

Uso: python audit_extraction.py
"""
import os, sys, re, json, requests
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from aps import get_internal_token
from routes.inventory import sanitize_urn
from db import get_db_connection

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"

def audit():
    # 1. Listar URNs en la base de datos
    print("\n" + "="*70)
    print("AUDITORÍA DE EXTRACCIÓN - CLASIFICADOR DE NODOS")
    print("="*70)
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT model_urn, source_urn, COUNT(*) as cnt 
            FROM inventory_assets 
            GROUP BY model_urn, source_urn 
            ORDER BY model_urn
        """)
        rows = cur.fetchall()
    
    print(f"\n📊 ESTADO ACTUAL EN PostgreSQL:")
    print(f"{'Model URN':<25} | {'Source URN':<55} | {'Assets'}")
    print("-"*100)
    for r in rows:
        print(f"{r[0]:<25} | {str(r[1])[:55]:<55} | {r[2]}")
    
    if not rows:
        print("  (sin datos)")
        return
    
    # 2. Para cada source_urn, consultar la API de Autodesk
    token_result = get_internal_token()
    if isinstance(token_result, tuple):
        token, err = token_result
    else:
        token, err = token_result, None
    
    if err or not token:
        print(f"\n❌ Error obteniendo token: {err}")
        return
    
    for model_urn, source_urn, db_count in rows:
        print(f"\n{'='*70}")
        print(f"🔍 Auditando: {source_urn[:60]}...")
        print(f"   DB actual: {db_count} assets")
        
        urn = sanitize_urn(source_urn)
        headers = {'Authorization': f'Bearer {token}'}
        
        # Fase 1: Obtener GUID
        resp = requests.get(f"{APS_MD_URL}/{urn}/metadata", headers=headers)
        if resp.status_code != 200:
            print(f"   ❌ Error obteniendo metadata: {resp.status_code}")
            continue
        
        metadata = resp.json().get('data', {}).get('metadata', [])
        print(f"   📋 Vistas disponibles:")
        guid = None
        for v in metadata:
            marker = " ← (usada)" if not guid and v.get('role') == '3d' else ""
            print(f"      - {v.get('name')} (role={v.get('role')}, guid={v.get('guid')}){marker}")
            if not guid and v.get('role') == '3d':
                guid = v['guid']
        
        if not guid:
            guid = metadata[0]['guid'] if metadata else None
        
        if not guid:
            print("   ❌ Sin GUIDs disponibles")
            continue
        
        # Fase 2: Obtener árbol jerárquico
        hier_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata/{guid}", headers=headers)
        hier_resp.raise_for_status()
        hier_objects = hier_resp.json().get('data', {}).get('objects', [])
        
        # Contar nodos en el árbol
        tree_total = 0
        tree_leaves = 0
        tree_internal = 0
        def count_tree(objects_list):
            nonlocal tree_total, tree_leaves, tree_internal
            for obj in objects_list:
                tree_total += 1
                children = obj.get('objects', [])
                if not children:
                    tree_leaves += 1
                else:
                    tree_internal += 1
                    count_tree(children)
        count_tree(hier_objects)
        
        print(f"\n   🌳 ÁRBOL JERÁRQUICO:")
        print(f"      Total nodos:    {tree_total}")
        print(f"      Nodos hoja:     {tree_leaves}")
        print(f"      Nodos internos: {tree_internal}")
        
        # Fase 3: Obtener properties collection (paginado)
        print(f"\n   📦 PROPERTIES COLLECTION (API paginada):")
        query_url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties:query"
        
        all_items = []
        offset = 0
        PAGE_SIZE = 500
        
        try:
            for page in range(200):
                payload = {'pagination': {'limit': PAGE_SIZE, 'offset': offset}}
                for attempt in range(10):
                    resp = requests.post(query_url, headers={**headers, 'Content-Type': 'application/json'}, json=payload)
                    if resp.status_code == 202:
                        import time
                        time.sleep(3)
                        continue
                    break
                
                if resp.status_code != 200:
                    print(f"      ❌ Error en página {page+1}: {resp.status_code}")
                    break
                    
                batch = resp.json().get('data', {}).get('collection', [])
                all_items.extend(batch)
                
                if len(batch) < PAGE_SIZE:
                    break
                offset += PAGE_SIZE
            
            print(f"      Total elementos en collection: {len(all_items)}")
        except Exception as e:
            print(f"      ❌ Error: {e}")
            continue
        
        # Fase 4: CLASIFICAR cada nodo y mostrar distribución
        stats = {
            'instance_elementid': 0,    # [ElementId] en nombre
            'instance_ifc': 0,          # IfcGUID detectado
            'category': 0,              # ':' en externalId
            'type': 0,                  # Fallback (todo lo demás)
            'no_external_id': 0,        # Sin externalId
            'leaf_node': 0,             # Es nodo hoja en el árbol
            'leaf_with_props': 0,       # Hoja con propiedades significativas
        }
        
        # Construir set de hojas
        leaf_ids = set()
        def find_leaves(objects_list):
            for obj in objects_list:
                children = obj.get('objects', [])
                if not children:
                    leaf_ids.add(obj.get('objectid'))
                else:
                    find_leaves(children)
        find_leaves(hier_objects)
        
        type_examples = []  # Guardar ejemplos de nodos clasificados como 'type'
        
        for node in all_items:
            name = node.get('name', 'Unnamed')
            external_id = node.get('externalId')
            objectid = node.get('objectid')
            props = node.get('properties', {})
            
            if not external_id:
                stats['no_external_id'] += 1
                continue
            
            is_leaf = objectid in leaf_ids
            if is_leaf:
                stats['leaf_node'] += 1
                # Verificar si tiene propiedades significativas (dimensiones, datos, etc.)
                has_significant = False
                for cat_name, cat_props in props.items():
                    if isinstance(cat_props, dict):
                        for prop_name in cat_props:
                            low = prop_name.lower()
                            if any(kw in low for kw in ['area', 'volume', 'length', 'width', 'height', 'count', 'material', 'mark', 'type']):
                                has_significant = True
                                break
                    if has_significant:
                        break
                if has_significant:
                    stats['leaf_with_props'] += 1
            
            # Clasificar con la lógica ACTUAL
            if re.search(r'\[\d+\]', name):
                stats['instance_elementid'] += 1
            elif ':' in external_id and not external_id.startswith('urn:'):
                stats['category'] += 1
            elif 'IfcGUID' in props.get('Element', {}):
                stats['instance_ifc'] += 1
            else:
                stats['type'] += 1
                if len(type_examples) < 15:
                    type_examples.append({
                        'name': name[:60],
                        'objectid': objectid,
                        'externalId': external_id[:50],
                        'is_leaf': is_leaf,
                        'prop_categories': list(props.keys())[:5]
                    })
        
        # Resumen
        total_instances = stats['instance_elementid'] + stats['instance_ifc']
        total_discarded = stats['type'] + stats['category']
        
        print(f"\n   📊 CLASIFICACIÓN ACTUAL:")
        print(f"      ✅ instance (ElementId):  {stats['instance_elementid']}")
        print(f"      ✅ instance (IFC):         {stats['instance_ifc']}")
        print(f"      ❌ type (descartado):       {stats['type']}")
        print(f"      ❌ category (descartado):   {stats['category']}")
        print(f"      ⚠️  sin externalId:         {stats['no_external_id']}")
        print(f"      ─────────────────────────")
        print(f"      Total guardados:           {total_instances}")
        print(f"      Total descartados:         {total_discarded}")
        
        print(f"\n   🌿 ANÁLISIS DE HOJAS vs. CLASIFICACIÓN:")
        print(f"      Hojas en el árbol:         {stats['leaf_node']}")
        print(f"      Hojas con props útiles:    {stats['leaf_with_props']}")
        print(f"      DB actual:                 {db_count}")
        
        gap = stats['leaf_node'] - db_count
        if gap > 0:
            print(f"      ⚠️  GAP (hojas - DB):       {gap} elementos NO extraídos")
        
        if type_examples:
            print(f"\n   🔬 EJEMPLOS DE NODOS CLASIFICADOS COMO 'type' (descartados):")
            for ex in type_examples:
                leaf_tag = "🌿HOJA" if ex['is_leaf'] else "🔀RAMA"
                print(f"      [{leaf_tag}] name=\"{ex['name']}\" | oid={ex['objectid']} | eid={ex['externalId']}")
                print(f"              props: {ex['prop_categories']}")

if __name__ == '__main__':
    audit()
