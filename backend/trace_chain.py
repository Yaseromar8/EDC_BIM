import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

# El frontend construye el path como: proyectos/{project.name.replace(' ', '_')}/
# Necesitamos saber cuál es el project.name para construir el path correcto

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # Paso 1: Encontrar el nodo padre más "rico" - el que tiene los datos reales
    cursor.execute("""
        SELECT parent_id, count(*) as c FROM file_nodes 
        WHERE is_deleted = FALSE AND parent_id IS NOT NULL
        GROUP BY parent_id ORDER BY c DESC LIMIT 1
    """)
    richest = cursor.fetchone()
    rich_id, rich_count = richest
    
    cursor.execute("SELECT id, name, model_urn, parent_id FROM file_nodes WHERE id = %s", (rich_id,))
    rich_node = cursor.fetchone()
    print(f"NODO RICO: ID={rich_node[0]} Name='{rich_node[1]}' URN={rich_node[2]} Parent={rich_node[3]}")
    
    # Paso 2: Reconstruir la cadena hacia la raíz
    print("\n=== CADENA HACIA RAÍZ ===")
    current = rich_node
    chain = [current]
    while current[3] is not None:
        cursor.execute("SELECT id, name, model_urn, parent_id FROM file_nodes WHERE id = %s", (current[3],))
        current = cursor.fetchone()
        if current:
            chain.append(current)
        else:
            break
    
    chain.reverse()
    for node in chain:
        print(f"  -> '{node[1]}' (ID: {node[0]})")
    
    # Paso 3: Calcular el path que el frontend usará
    # El frontend usa: proyectos/{project.name_normalizado}/
    # El project name viene del acc, pero en file_nodes debería ser: proyectos/PQT8_TALARA/
    
    # Verificar si resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN) encuentra algo útil
    print("\n=== SIMULANDO FRONTEND: proyectos/PQT8_TALARA/ ===")
    talara_node = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
    print(f"Nodo encontrado/creado: {talara_node}")
    
    cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (talara_node,))
    print(f"Hijos del nodo: {cursor.fetchone()[0]}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
