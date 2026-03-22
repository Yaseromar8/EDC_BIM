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
    
    print("=== 1. CARPETAS RAÍZ ===")
    cursor.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id IS NULL ORDER BY name, is_deleted")
    roots = cursor.fetchall()
    for r in roots:
        print(f"  ID: {r[0]} | Name: '{r[1]}' | URN: '{r[2]}' | Deleted: {r[3]}")
    
    print("\n=== 2. HIJOS DE TODAS LAS RAÍCES 'proyectos' ===")
    cursor.execute("""
        SELECT p.id as pid, p.model_urn as purn, f.name, f.id, f.model_urn, f.is_deleted
        FROM file_nodes f
        JOIN file_nodes p ON f.parent_id = p.id
        WHERE p.name = 'proyectos'
        ORDER BY p.id, f.name
    """)
    for r in cursor.fetchall():
        print(f"  [Parent ID: {r[0]} URN: {r[1]}] -> Child: '{r[2]}' ID: {r[3]} URN: '{r[4]}' Del: {r[5]}")
    
    print("\n=== 3. HIJOS DE TODOS LOS NODOS 'PQT8_TALARA' ===")
    cursor.execute("""
        SELECT p.id, p.is_deleted, p.model_urn, count(f.id) as children
        FROM file_nodes p
        LEFT JOIN file_nodes f ON f.parent_id = p.id AND f.is_deleted = FALSE
        WHERE p.name = 'PQT8_TALARA'
        GROUP BY p.id, p.is_deleted, p.model_urn
        ORDER BY children DESC
    """)
    for r in cursor.fetchall():
        print(f"  PQT8_TALARA ID: {r[0]} | Deleted: {r[1]} | URN: '{r[2]}' | Children: {r[3]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
