import psycopg2
from dotenv import load_dotenv
import os

# Cargar .env desde el directorio padre
load_dotenv('d:/VISOR_APS_TL/.env')

def inspect_nodes():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        print("--- LAST 10 NODES FOR PQT8_TALARA ---")
        # Buscamos coincidencias con el model_urn normalizado
        cursor.execute("""
            SELECT id, name, parent_id, model_urn, is_deleted 
            FROM file_nodes 
            WHERE model_urn = 'proyectos/PQT8_TALARA' 
            ORDER BY created_at DESC LIMIT 10;
        """)
        rows = cursor.fetchall()
        if not rows:
            print("No nodes found for 'proyectos/PQT8_TALARA'")
        for row in rows:
            print(row)
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_nodes()
