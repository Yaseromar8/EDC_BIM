"""
Diagnóstico: Inspecciona los nodos del árbol de un modelo Civil 3D para entender
por qué algunos sólidos NO se clasifican como 'instance' y son descartados.
"""
import os, sys, re, json, pathlib
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
load_dotenv() or load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection

# Step 1: Find Civil 3D models (DWG) in model_config
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT name, urn, app_project_id, default_view_guid FROM model_config ORDER BY name")
    models = cur.fetchall()
    
print(f"\n{'='*80}")
print("  MODELOS REGISTRADOS")
print(f"{'='*80}")
for i, (name, urn, proj, guid) in enumerate(models):
    print(f"  [{i}] [{proj}] {name}  (urn=...{urn[-30:]})")

# Step 2: Fetch raw tree + properties for ALL models, focusing on classification
import requests

def get_internal_token():
    from aps import get_internal_token as aps_token
    return aps_token()

def sanitize_urn(urn):
    if urn.startswith('urn:adsk'):
        import base64
        urn = base64.b64encode(urn.encode()).decode()
    urn = urn.replace('+', '-').replace('/', '_').rstrip('=')
    return urn

token_result = get_internal_token()
if isinstance(token_result, tuple):
    token, err = token_result
else:
    token, err = token_result, None

if err or not token:
    print(f"ERROR: {err}")
    sys.exit(1)

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"
headers = {'Authorization': f'Bearer {token}'}

for idx, (name, urn, proj, configured_guid) in enumerate(models):
    urn = sanitize_urn(urn)
    print(f"\n{'='*80}")
    print(f"  ANALIZANDO: {name} (proyecto: {proj})")
    print(f"{'='*80}")
    
    # Get metadata views
    resp = requests.get(f"{APS_MD_URL}/{urn}/metadata", headers=headers)
    if resp.status_code != 200:
        print(f"  ERROR fetching metadata: {resp.status_code}")
        continue
    
    metadata = resp.json().get('data', {}).get('metadata', [])
    views_3d = [v for v in metadata if v.get('role') == '3d']
    
    # Select the same GUID the extractor would use
    guid = configured_guid if configured_guid and configured_guid in {v.get('guid') for v in metadata} else None
    if not guid:
        if len(views_3d) == 1:
            guid = views_3d[0]['guid']
        elif views_3d:
            guid = views_3d[0]['guid']
        else:
            guid = metadata[0]['guid'] if metadata else None
    
    if not guid:
        print("  NO GUID available, skipping")
        continue
    
    print(f"  Using GUID: {guid}")
    
    # Get hierarchy tree
    tree_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata/{guid}", headers=headers)
    if tree_resp.status_code != 200:
        print(f"  ERROR fetching tree: {tree_resp.status_code}")
        continue
    
    tree_objects = tree_resp.json().get('data', {}).get('objects', [])
    
    # Analyze ALL nodes
    all_nodes = []
    def catalog(objects_list, depth=0, parent_name=None):
        for obj in objects_list:
            children = obj.get('objects', [])
            all_nodes.append({
                'objectid': obj.get('objectid'),
                'name': obj.get('name', 'Unnamed'),
                'externalId': obj.get('externalId', ''),
                'depth': depth,
                'is_leaf': len(children) == 0,
                'child_count': len(children),
                'parent_name': parent_name
            })
            if children:
                catalog(children, depth + 1, obj.get('name', 'Unnamed'))
    
    catalog(tree_objects)
    
    # Count and classify
    leaves = [n for n in all_nodes if n['is_leaf']]
    has_bracket_id = [n for n in leaves if re.search(r'\[\d+\]', n['name'])]
    no_bracket_id = [n for n in leaves if not re.search(r'\[\d+\]', n['name'])]
    
    # Further classify no_bracket_id
    has_colon_extid = [n for n in no_bracket_id if ':' in n['externalId'] and not n['externalId'].startswith('urn:')]
    no_colon_extid = [n for n in no_bracket_id if ':' not in n['externalId'] or n['externalId'].startswith('urn:')]
    
    print(f"\n  --- RESUMEN DE NODOS ---")
    print(f"  Total nodos:            {len(all_nodes)}")
    print(f"  Nodos hoja:             {len(leaves)}")
    print(f"  Hojas con [ElementId]:  {len(has_bracket_id)}  → clasificadas como 'instance' ✅")
    print(f"  Hojas SIN [ElementId]:  {len(no_bracket_id)}")
    print(f"    De ellas, con ':' en externalId: {len(has_colon_extid)} → clasificadas como 'category' ❌")
    print(f"    De ellas, SIN ':' en externalId: {len(no_colon_extid)} → clasificadas como 'type' ❌")
    
    # Print samples of LOST leaves (no [ElementId])
    if no_bracket_id:
        print(f"\n  --- MUESTRAS DE HOJAS PERDIDAS (SIN [ElementId]) ---")
        for n in no_bracket_id[:30]:
            cls = 'category' if (':' in n['externalId'] and not n['externalId'].startswith('urn:')) else 'type'
            print(f"    objectid={n['objectid']:<6} depth={n['depth']} name='{n['name'][:60]}' extId='{n['externalId'][:60]}' parent='{(n['parent_name'] or '')[:40]}' → {cls}")
    
    # Print some WITH [ElementId] for comparison
    if has_bracket_id:
        print(f"\n  --- MUESTRAS DE HOJAS CORRECTAS (CON [ElementId]) ---")
        for n in has_bracket_id[:10]:
            print(f"    objectid={n['objectid']:<6} depth={n['depth']} name='{n['name'][:60]}' extId='{n['externalId'][:60]}' parent='{(n['parent_name'] or '')[:40]}'")

print(f"\n{'='*80}")
print("  DIAGNÓSTICO COMPLETO")
print(f"{'='*80}")
