import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv('d:/VISOR_APS_TL/.env')

try:
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS'),
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', '5432')
    )
    cur = conn.cursor()
    # Find any properties dict that might have a string value equal to "Pipes" or "Tuberías"
    cur.execute("SELECT name, properties FROM inventory_assets WHERE properties::text ILIKE '%Pipes%' OR properties::text ILIKE '%Tuber%as%' LIMIT 3")
    rows = cur.fetchall()

    for r in rows:
        print(f"Name: {r[0]}")
        p = json.loads(r[1]) if isinstance(r[1], str) else r[1]
        for v in p.values():
            if isinstance(v, dict):
                for k2, v2 in v.items():
                    if 'pipe' in str(v2).lower() or 'tuber' in str(v2).lower():
                        print(f"   [{k2}]: {v2}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
