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
    
    print("--- LISTADO JERÁRQUICO FINAL (SIN PROYECTOS/PQT8) ---")
    cursor.execute("""
        SELECT f.name, p.name as parent_name
        FROM file_nodes f
        LEFT JOIN file_nodes p ON f.parent_id = p.id
        WHERE f.node_type = 'FOLDER' AND f.name NOT IN ('proyectos', 'PQT8_TALARA') AND f.is_deleted = FALSE
        ORDER BY p.name, f.name
    """)
    for r in cursor.fetchall():
        print(f"[{r[1]}] -> {r[0]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
