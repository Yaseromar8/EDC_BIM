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
    
    print("--- CENSO DE HIJOS POR CADA PQT8_TALARA ---")
    cursor.execute("""
        SELECT id, is_deleted, model_urn,
               (SELECT count(*) FROM file_nodes WHERE parent_id = f.id AND is_deleted = FALSE) as active_children,
               (SELECT count(*) FROM file_nodes WHERE parent_id = f.id AND is_deleted = TRUE) as deleted_children
        FROM file_nodes f 
        WHERE name = 'PQT8_TALARA'
    """)
    rows = cursor.fetchall()
    print(f"Total nodos PQT8_TALARA encontrados (inc. borrados): {len(rows)}")
    for r in rows:
        print(f"ID: {r[0]} | Deleted: {r[1]} | URN: {r[2]} | Activos: {r[3]} | Borrados: {r[4]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
