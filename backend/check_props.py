import sys, os, json
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT name, properties FROM inventory_assets WHERE properties != '{}' LIMIT 1")
    row = cur.fetchone()
    data = json.dumps(row[1], indent=2, ensure_ascii=False)
    with open('props_out.txt', 'w', encoding='utf-8') as f:
        f.write(data)
    cur.close()
