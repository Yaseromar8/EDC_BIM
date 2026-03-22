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
    
    print("--- INVENTARIO FINAL DE NIVEL 2 (HIJOS DE PQT8_TALARA) ---")
    cursor.execute("""
        SELECT p.name as parent_name, f.name, f.id, f.model_urn, f.is_deleted 
        FROM file_nodes f
        JOIN file_nodes p ON f.parent_id = p.id
        WHERE p.name = 'PQT8_TALARA'
        ORDER BY f.is_deleted, f.name
    """)
    rows = cursor.fetchall()
    print(f"Total encontrados: {len(rows)}")
    for r in rows:
        print(f"Parent: {r[0]} | Name: {r[1]} | ID: {r[2]} | URN: {r[3]} | Deleted: {r[4]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
