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
    
    print("--- RESTAURACIÓN DE EMERGENCIA ---")
    cursor.execute("UPDATE file_nodes SET is_deleted = FALSE WHERE node_type = 'FOLDER'")
    print(f"Carpetas restauradas: {cursor.rowcount}")
    
    # También restaurar archivos de esas carpetas por si acaso
    cursor.execute("UPDATE file_nodes SET is_deleted = FALSE WHERE node_type = 'FILE'")
    print(f"Archivos restaurados: {cursor.rowcount}")

    conn.commit()
    conn.close()
    print("RESTAURACIÓN COMPLETADA.")
except Exception as e:
    print(f"Error: {e}")
