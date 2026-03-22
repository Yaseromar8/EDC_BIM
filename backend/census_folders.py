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
    
    print("--- CENSO TOTAL DE CARPETAS ACTIVAS ---")
    cursor.execute("""
        SELECT f.id, f.name, f.parent_id, p.name as parent_name, f.model_urn
        FROM file_nodes f
        LEFT JOIN file_nodes p ON f.parent_id = p.id
        WHERE f.node_type = 'FOLDER' AND f.is_deleted = FALSE
        ORDER BY f.name
    """)
    rows = cursor.fetchall()
    print(f"Total carpetas: {len(rows)}")
    for r in rows:
        print(f"ID: {r[0]} | Name: {r[1]} | ParentName: {r[3]} | URN: {r[4]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
