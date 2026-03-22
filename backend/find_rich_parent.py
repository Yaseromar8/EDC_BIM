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
    
    # El diagnóstico previo mostró un padre con 19 hijos y mencionó "PLANOS"
    # Vamos a encontrar ese nodo y todos sus hijos
    
    print("=== NODOS CON MAS HIJOS ACTIVOS ===")
    cursor.execute("""
        SELECT parent_id, count(*) as c FROM file_nodes 
        WHERE is_deleted = FALSE AND parent_id IS NOT NULL
        GROUP BY parent_id ORDER BY c DESC LIMIT 10
    """)
    rich_parents = cursor.fetchall()
    for pid, count in rich_parents:
        cursor.execute("SELECT id, name, model_urn, parent_id FROM file_nodes WHERE id = %s", (pid,))
        prow = cursor.fetchone()
        if prow:
            parent_name_row = cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (prow[3],)) if prow[3] else None
            cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (prow[3],)) if prow[3] else None
            parent_parent = cursor.fetchone() if prow[3] else None
            print(f"\n[PARENT] ID={prow[0]} Name='{prow[1]}' URN={prow[2]}")
            print(f"  Su padre: {parent_parent[0] if parent_parent else 'ROOT'}")
            print(f"  Hijos activos: {count}")
            
            # Listar hijos de este nodo
            cursor.execute("SELECT name, node_type, is_deleted FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE ORDER BY name", (pid,))
            for child in cursor.fetchall():
                print(f"    - [{child[1]}] {child[0]}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
