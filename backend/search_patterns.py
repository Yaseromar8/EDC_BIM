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
    
    print("--- BUSCANDO CARPETAS POR PATRÓN ---")
    cursor.execute("""
        SELECT name, parent_id, is_deleted, model_urn, id
        FROM file_nodes 
        WHERE node_type = 'FOLDER' AND name ILIKE '%PQT8%'
    """)
    rows = cursor.fetchall()
    print(f"Resultados para PQT8: {len(rows)}")
    for r in rows:
        print(f"  - {r[0]} | Parent: {r[1]} | Deleted: {r[2]} | URN: {r[3]} | ID: {r[4]}")

    cursor.execute("""
        SELECT name, parent_id, is_deleted, model_urn, id
        FROM file_nodes 
        WHERE node_type = 'FOLDER' AND name ILIKE '%Forense%'
    """)
    rows = cursor.fetchall()
    print(f"Resultados para Forense: {len(rows)}")
    for r in rows:
        print(f"  - {r[0]} | Parent: {r[1]} | Deleted: {r[2]} | URN: {r[3]} | ID: {r[4]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
