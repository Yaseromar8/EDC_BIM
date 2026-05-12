import os, sys, json
sys.path.append(os.path.abspath('backend'))
from dotenv import load_dotenv
load_dotenv(os.path.abspath('.env'))
from db import get_db_connection

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT external_id, name, properties FROM inventory_assets WHERE name ILIKE '%Solid%' LIMIT 3")
        rows = cur.fetchall()
        for r in rows:
            print(f"ID: {r[0]}, Name: {r[1]}\nProps: {json.dumps(r[2], indent=2)}")
