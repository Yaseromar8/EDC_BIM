import psycopg2, os
from dotenv import load_dotenv

env_path = r'd:\\VISOR_APS_TL\\.env'
load_dotenv(env_path)

conn = psycopg2.connect(
    host=os.getenv('DB_HOST','localhost'),
    database=os.getenv('DB_NAME','postgres'),
    user=os.getenv('DB_USER','postgres'),
    password=os.getenv('DB_PASS','')
)
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [r[0] for r in cur.fetchall()]

out = []
out.append("--- MODELS ---")
if 'file_nodes' in tables:
    cur.execute("SELECT id, name, model_urn FROM file_nodes WHERE model_urn IS NOT NULL")
    for r in cur.fetchall(): out.append(f"File Node: {r[1]} -> URN: {r[2]}")

out.append("\n--- ELEMENTS EXTRACTED ---")
if 'inventory_assets' in tables:
    cur.execute("SELECT model_urn, COUNT(*) FROM inventory_assets GROUP BY model_urn")
    rows = cur.fetchall()
    if not rows: out.append("No elements in inventory_assets")
    for r in rows: out.append(f"inventory_assets table: {r[0]} - {r[1]} elements")

cur.close()
conn.close()

with open('result.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
