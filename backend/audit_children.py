import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PARENT_ID = "befbc7f6-a43e-4796-9975-6a7534364db7" # El que tenía 18

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    print(f"--- AUDITORÍA DE HIJOS DE {PARENT_ID} ---")
    cursor.execute("SELECT id, name, is_deleted, model_urn FROM file_nodes WHERE parent_id = %s", (PARENT_ID,))
    rows = cursor.fetchall()
    
    print(f"Total hijos físicos: {len(rows)}")
    for r_id, r_name, r_del, r_urn in rows:
        print(f"  - {r_name} | Deleted: {r_del} | URN: {r_urn}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
