"""
Auditoría de TODAS las vistas: Compara cuántos nodos hoja tiene cada vista
para determinar cuál contiene la totalidad de la metadata.
"""
import os, sys, requests, time
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from aps import get_internal_token
from routes.inventory import sanitize_urn

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"

def audit_views():
    # URN del modelo principal (de la DB)
    raw_urn = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnViMnhmakRpUkJ5YW1rTXp2Q0Q3emc_dmVyc2lvbj0yMw"
    urn = sanitize_urn(raw_urn)
    
    token_result = get_internal_token()
    if isinstance(token_result, tuple):
        token, err = token_result
    else:
        token, err = token_result, None
    
    if err or not token:
        print(f"Error token: {err}")
        return
    
    headers = {'Authorization': f'Bearer {token}'}
    
    # Obtener todas las vistas
    resp = requests.get(f"{APS_MD_URL}/{urn}/metadata", headers=headers)
    resp.raise_for_status()
    metadata = resp.json().get('data', {}).get('metadata', [])
    
    print(f"\n{'='*80}")
    print(f"AUDITORIA DE VISTAS PARA URN: {raw_urn[:50]}...")
    print(f"{'='*80}")
    print(f"Vistas encontradas: {len(metadata)}")
    print()
    
    results = []
    
    for view in metadata:
        guid = view.get('guid')
        name = view.get('name', 'Unnamed')
        role = view.get('role', '?')
        
        print(f"--- Vista: {name} (role={role}, guid={guid}) ---")
        
        # Obtener arbol jerarquico
        try:
            hier_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata/{guid}", headers=headers, timeout=30)
            hier_resp.raise_for_status()
            hier_objects = hier_resp.json().get('data', {}).get('objects', [])
        except Exception as e:
            print(f"   Error obteniendo arbol: {e}")
            results.append({'name': name, 'role': role, 'guid': guid, 'total': '?', 'leaves': '?', 'error': str(e)})
            continue
        
        # Contar nodos
        tree_total = 0
        tree_leaves = 0
        leaf_names_sample = []
        
        def count_tree(objects_list, depth=0):
            nonlocal tree_total, tree_leaves
            for obj in objects_list:
                tree_total += 1
                children = obj.get('objects', [])
                if not children:
                    tree_leaves += 1
                    if len(leaf_names_sample) < 5:
                        leaf_names_sample.append(f"{'  '*depth}{obj.get('name', 'Unnamed')} (oid={obj.get('objectid')})")
                else:
                    count_tree(children, depth+1)
        
        count_tree(hier_objects)
        
        print(f"   Total nodos:  {tree_total}")
        print(f"   Nodos hoja:   {tree_leaves}")
        print(f"   Ejemplos de hojas:")
        for s in leaf_names_sample:
            print(f"      {s}")
        print()
        
        results.append({
            'name': name, 'role': role, 'guid': guid,
            'total': tree_total, 'leaves': tree_leaves
        })
    
    # Resumen final
    print(f"\n{'='*80}")
    print(f"RESUMEN COMPARATIVO")
    print(f"{'='*80}")
    print(f"{'Vista':<25} | {'Role':<6} | {'Total':<8} | {'Hojas':<8} | GUID")
    print("-"*90)
    for r in results:
        print(f"{r['name']:<25} | {r['role']:<6} | {str(r['total']):<8} | {str(r['leaves']):<8} | {r['guid']}")
    
    # Identificar la vista con mas hojas
    valid = [r for r in results if isinstance(r.get('leaves'), int)]
    if valid:
        best = max(valid, key=lambda x: x['leaves'])
        print(f"\n>>> VISTA CON MAS ELEMENTOS: {best['name']} ({best['leaves']} hojas)")
        print(f"    GUID: {best['guid']}")

if __name__ == '__main__':
    audit_views()
