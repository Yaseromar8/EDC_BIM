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
    
    # 1. Identificar el nodo MASTER que usa la API actualmente
    print(f"--- Resolviendo nodo MASTER para {PATH} ---")
    master_id = file_system_db.resolve_path_to_node_id(PATH, PROJECT_ID)
    print(f"MASTER ID: {master_id}")
    
    # 2. Rescatar TODOS los nodos FOLDER que digan ser hijos de ALGO llamado PQT8_TALARA
    print("--- Secuestrando carpetas de otros PQT8_TALARA ---")
    cursor.execute("""
        UPDATE file_nodes 
        SET parent_id = %s, is_deleted = FALSE, model_urn = %s
        WHERE node_type = 'FOLDER' 
          AND parent_id IN (SELECT id FROM file_nodes WHERE name = 'PQT8_TALARA')
          AND parent_id != %s
    """, (master_id, PROJECT_ID, master_id))
    print(f"Carpetas rescatadas y movidas al MASTER: {cursor.rowcount}")
    
    # 3. Eliminar los PQT8_TALARA sobrantes (vacíos ahora)
    cursor.execute("""
        DELETE FROM file_nodes 
        WHERE name = 'PQT8_TALARA' AND id != %s
    """, (master_id,))
    print(f"Raíces duplicadas eliminadas: {cursor.rowcount}")

    conn.commit()
    
    # 4. Conteo FINAL
    cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (master_id,))
    final_count = cursor.fetchone()[0]
    print(f"RESULTADO: {final_count} carpetas en el nodo principal.")

    conn.close()
    print("OPERACIÓN DE RESCATE TOTAL FINALIZADA.")
except Exception as e:
    print(f"Error: {e}")
