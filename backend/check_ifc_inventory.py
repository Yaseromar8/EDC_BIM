import os, json
from dotenv import load_dotenv
load_dotenv('../.env')
import psycopg2

conn = psycopg2.connect(
    host=os.getenv('DB_HOST'), user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASS'), dbname=os.getenv('DB_NAME'),
    port=os.getenv('DB_PORT', '5432')
)
cur = conn.cursor()

# Simulate the EXACT flattening that App.jsx does (lines 1279-1323)
cur.execute("""
    SELECT name, external_id, model_urn, source_urn, material, 
           installation_status, properties
    FROM inventory_assets 
    WHERE name = 'IfcBuildingElementProxy'
    AND properties->'SCL_CANAL'->>'Volume' IS NOT NULL
    LIMIT 1
""")
row = cur.fetchone()
if row:
    name, ext_id, model_urn, source_urn, material, status, props_json = row
    props = json.loads(props_json) if isinstance(props_json, str) else props_json
    
    # Simulate App.jsx flattening
    flat = {
        'dbId': ext_id,
        'model_urn': model_urn,
        'source_urn': source_urn or model_urn,
        'Name': name,  # This starts as 'IfcBuildingElementProxy'
        'Material': material or '',
        'Status': status or ''
    }
    
    print(f"=== BEFORE flattening ===")
    print(f"  flat['Name'] = '{flat['Name']}'")
    
    # Now flatten properties (exactly as App.jsx does)
    for cName, cVal in props.items():
        if isinstance(cVal, dict):
            for pName, pVal in cVal.items():
                val = str(pVal).strip() if pVal is not None else ''
                if val != '' or pName not in flat or flat[pName] == '':
                    old = flat.get(pName, '<not set>')
                    flat[pName] = val
                    if pName == 'Name':
                        print(f"  [OVERWRITE] flat['Name'] = '{val}' (from category '{cName}', was '{old}')")
    
    print(f"\n=== AFTER flattening ===")
    print(f"  flat['Name'] = '{flat['Name']}'")
    print(f"  flat['Volume'] = '{flat.get('Volume', '<MISSING>')}'")
    print(f"  flat['01_13_DSI_Zona'] = '{flat.get('01_13_DSI_Zona', '<MISSING>')}'")
    
    # Show all categories that have a 'Name' key
    print(f"\n=== Categories with 'Name' key ===")
    for cName, cVal in props.items():
        if isinstance(cVal, dict) and 'Name' in cVal:
            print(f"  [{cName}] Name = '{cVal['Name']}'")

conn.close()
