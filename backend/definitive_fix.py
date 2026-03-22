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
    
    # ====================================================
    # PASO 1: Obtener el ID que el FRONTEND ya usa (por resolve_path)
    # ====================================================
    print("=== PASO 1: Nodo que usa el FRONTEND ===")
    frontend_node_id = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
    print(f"Frontend nodo: {frontend_node_id}")
    
    # ====================================================
    # PASO 2: Encontrar TODOS los nodos con muchos hijos (datos reales)
    # ====================================================
    print("\n=== PASO 2: Nodos ricos (con hijos reales) ===")
    cursor.execute("""
        SELECT parent_id, count(*) as c FROM file_nodes 
        WHERE is_deleted = FALSE AND parent_id IS NOT NULL
        GROUP BY parent_id HAVING count(*) > 5
        ORDER BY c DESC
    """)
    rich_parents = cursor.fetchall()
    
    for rich_id, count in rich_parents:
        if str(rich_id) != str(frontend_node_id):
            cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (rich_id,))
            pname = cursor.fetchone()
            print(f"  Nodo FUENTE: {rich_id} ({pname[0] if pname else '?'}) -> {count} hijos - MOVER AL FRONTEND")
            
            # PASO 3: Mover todos sus hijos al nodo del frontend
            print(f"  Moviendo {count} hijos de {rich_id} a {frontend_node_id}...")
            cursor.execute("""
                UPDATE file_nodes 
                SET parent_id = %s, model_urn = %s, is_deleted = FALSE
                WHERE parent_id = %s
            """, (frontend_node_id, PROJECT_URN, rich_id))
            print(f"  Hijos movidos: {cursor.rowcount}")
    
    conn.commit()
    
    # ====================================================
    # PASO 4: Verificar el resultado final
    # ====================================================
    print("\n=== VERIFICACIÓN FINAL ===")
    cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (frontend_node_id,))
    final = cursor.fetchone()[0]
    print(f"Hijos del nodo frontend: {final}")
    
    cursor.execute("SELECT name FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE ORDER BY name", (frontend_node_id,))
    for r in cursor.fetchall():
        print(f"  - {r[0]}")
    
    conn.close()
    print("\nCORRECCIÓN APLICADA. Reiniciar el servidor backend.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
