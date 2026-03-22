import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

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
    
    # Obtener el nodo que usa el frontend
    frontend_id = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
    print(f"Frontend node ID: {frontend_id}")
    
    # Listar todos los hijos directos con su conteo de hijos
    cursor.execute("""
        SELECT f.id, f.name, f.node_type,
               (SELECT count(*) FROM file_nodes x WHERE x.parent_id = f.id AND x.is_deleted = FALSE) as children
        FROM file_nodes f
        WHERE f.parent_id = %s AND f.is_deleted = FALSE
        ORDER BY f.node_type DESC, f.name
    """, (frontend_id,))
    items = cursor.fetchall()
    
    print(f"\nTotal en RAÍZ (nivel 1): {len(items)}")
    print("="*70)
    
    folders = [(r[0], r[1], r[3]) for r in items if r[2] == 'FOLDER']
    files = [(r[0], r[1]) for r in items if r[2] == 'FILE']
    
    print(f"\nCARPETAS ({len(folders)}):")
    for fid, fname, children in folders:
        print(f"  [ID:{fid}] '{fname}' — {children} hijos")
    
    print(f"\nARCHIVOS EN RAÍZ ({len(files)}):")
    for fid, fname in files[:20]:
        print(f"  '{fname}'")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
