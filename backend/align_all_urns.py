import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_ID = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    print(f"--- Forzando URN {PROJECT_ID} en TODOS los nodos activos ---")
    cursor.execute("UPDATE file_nodes SET model_urn = %s WHERE is_deleted = FALSE", (PROJECT_ID,))
    print(f"Nodos actualizados: {cursor.rowcount}")
    
    # 2. Eliminar duplicados de 'proyectos' y 'PQT8_TALARA' que NO tengan hijos
    print("--- Limpiando nodos redundantes sin hijos ---")
    cursor.execute("""
        DELETE FROM file_nodes 
        WHERE (name = 'proyectos' OR name = 'PQT8_TALARA') 
          AND is_deleted = FALSE 
          AND id NOT IN (SELECT parent_id FROM file_nodes WHERE parent_id IS NOT NULL)
    """)
    print(f"Nodos vacíos eliminados: {cursor.rowcount}")

    conn.commit()
    conn.close()
    print("UNIFICACIÓN COMPLETADA.")
except Exception as e:
    print(f"Error: {e}")
