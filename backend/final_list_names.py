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
    
    print("--- LISTADO FINAL DE CARPETAS EN PQT8_TALARA ---")
    cursor.execute("""
        SELECT name FROM file_nodes 
        WHERE parent_id = (SELECT id FROM file_nodes WHERE name = 'PQT8_TALARA' AND is_deleted = FALSE LIMIT 1)
          AND is_deleted = FALSE
        ORDER BY name
    """)
    for r in cursor.fetchall():
        print(f" - {r[0]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
