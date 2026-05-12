import json
from dotenv import load_dotenv
load_dotenv()

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT external_id, name, properties FROM inventory_assets WHERE name ILIKE '%Solid%' LIMIT 5")
    rows = cur.fetchall()
    
    output = []
    for r in rows:
        props = r[2] if isinstance(r[2], dict) else json.loads(r[2]) if r[2] else {}
        output.append({
            'external_id': r[0],
            'name': r[1],
            'properties': props
        })
    print(json.dumps(output, indent=2))
