import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_ID = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"
PATH = "proyectos/PQT8_TALARA/"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # 1. Obtener el MASTER ID
    master_id = file_system_db.resolve_path_to_node_id(PATH, PROJECT_ID)
    print(f"MASTER ID: {master_id}")

    # 2. Rescatar huérfanos (parent_id IS NULL y name != 'proyectos')
    print("--- RESCATANDO HUÉRFANOS ---")
    cursor.execute("""
        UPDATE file_nodes 
        SET parent_id = %s, model_urn = %s, is_deleted = FALSE
        WHERE node_type = 'FOLDER' 
          AND parent_id IS NULL 
          AND name != 'proyectos'
    """, (master_id, PROJECT_ID))
    print(f"Huérfanos rescatados: {cursor.rowcount}")
    
    # 3. Consolidar de nuevo por si acaso los huérfanos tienen nombres duplicados con los que ya estaban
    conn.commit()
    conn.close()
    print("RECONEXIÓN COMPLETADA. Ejecutando consolidación final...")
    
    # Re-ejecutar consolidación
    import subprocess
    subprocess.run(["python", "consolidate_children.py"])
    
except Exception as e:
    print(f"Error: {e}")
