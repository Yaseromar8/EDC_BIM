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
    
    # Obtener el ID del nodo PQT8_TALARA
    cursor.execute("""
        SELECT id FROM file_nodes 
        WHERE name = 'PQT8_TALARA' AND is_deleted = FALSE
        LIMIT 1
    """)
    talara_id = cursor.fetchone()[0]
    print(f"PQT8_TALARA ID: {talara_id}")
    
    print("\n=== LISTADO ACTUAL DE RAÍZ (hijos directos de PQT8_TALARA) ===")
    cursor.execute("""
        SELECT id, name, node_type,
               (SELECT count(*) FROM file_nodes x WHERE x.parent_id = f.id AND x.is_deleted = FALSE) as children
        FROM file_nodes f
        WHERE parent_id = %s AND is_deleted = FALSE
        ORDER BY name
    """, (talara_id,))
    root_items = cursor.fetchall()
    print(f"Total en raíz: {len(root_items)}")
    for r in root_items:
        marker = "📁" if r[3] > 0 else "  "
        print(f"  {marker} [{r[2]}] '{r[1]}' (ID:{r[0]}) — {r[3]} hijos")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
