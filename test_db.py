import os
import sys
from dotenv import load_dotenv

# Load env before importing db
load_dotenv(os.path.abspath('.env'))

sys.path.append(os.path.abspath('backend'))
from db import get_db_connection

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT external_id, name, type, category, raw_properties, parent_id FROM inventory_assets WHERE name ILIKE '%Solid%' LIMIT 3")
        print("ASSETS WITH SOLID IN NAME:")
        for row in cur.fetchall():
            ext_id, name, itype, category, raw_props, parent_id = row
            print(f"ID: {ext_id}, Name: {name}, Type: {itype}, Category: {category}, Parent: {parent_id}")
            print(f"Props keys: {list(raw_props.keys()) if raw_props else []}")
            print(f"Raw Props: {raw_props}")
            print("-" * 50)
