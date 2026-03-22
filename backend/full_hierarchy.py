import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # === PASO 1: Ver jerarquía actual completa ===
    print("=== JERARQUÍA COMPLETA ===")
    
    # Obtener todas las raíces
    cursor.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id IS NULL ORDER BY name, is_deleted")
    roots = cursor.fetchall()
    for r in roots:
        print(f"[ROOT] '{r[1]}' | ID: {r[0]} | URN: '{r[2]}' | Del: {r[3]}")
        
    # Obtener hijos de proyectos
    cursor.execute("""
        SELECT p.id as pid, f.name, f.id, f.model_urn, f.is_deleted,
               (SELECT count(*) FROM file_nodes x WHERE x.parent_id = f.id AND x.is_deleted = FALSE) as children
        FROM file_nodes f
        JOIN file_nodes p ON f.parent_id = p.id
        WHERE p.name = 'proyectos'
        ORDER BY f.is_deleted, f.name
    """)
    for r in cursor.fetchall():
        print(f"  [Child of proyectos(ID:{r[0]})] '{r[1]}' | ID: {r[2]} | URN: '{r[3]}' | Del: {r[4]} | Nietos: {r[5]}")
    
    print("\n=== IDENTIFICANDO RUTA CORRECTA ===")
    
    # Encontrar el PQT8_TALARA con hijos reales
    cursor.execute("""
        SELECT id, model_urn, is_deleted,
               (SELECT count(*) FROM file_nodes x WHERE x.parent_id = f.id AND x.is_deleted = FALSE) as children
        FROM file_nodes f
        WHERE name = 'PQT8_TALARA'
        ORDER BY children DESC
    """)
    pqt_nodes = cursor.fetchall()
    for r in pqt_nodes:
        print(f"  PQT8_TALARA: ID: {r[0]} | URN: {r[1]} | Del: {r[2]} | Children: {r[3]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
