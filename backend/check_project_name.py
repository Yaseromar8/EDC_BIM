import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    print("=== 1. TABLA DE PROYECTOS ===")
    cursor.execute("SELECT id, name, code FROM projects WHERE is_active = TRUE LIMIT 10")
    rows = cursor.fetchall()
    for r in rows:
        name = r[1]
        name_normalized = name.replace(' ', '_')
        print(f"  ID: {r[0]}")
        print(f"  Name: '{name}'")
        print(f"  Code: '{r[2]}'")
        print(f"  Path que usará el frontend: 'proyectos/{name_normalized}/'")
        print()
    
    print("=== 2. CARPETAS RAÍZ EN FILE_NODES ===")
    cursor.execute("SELECT name, id, parent_id, model_urn FROM file_nodes WHERE name = 'proyectos' OR (parent_id IS NULL AND node_type = 'FOLDER') ORDER BY name")
    for r in cursor.fetchall():
        print(f"  Carpeta: '{r[0]}' | ID: {r[1]} | Parent: {r[2]} | URN: {r[3]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
