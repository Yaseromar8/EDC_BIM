import psycopg2
from dotenv import load_dotenv
import os

load_dotenv('d:/VISOR_APS_TL/.env')

def check_urns():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        print("--- UNIQUE model_urn VALUES IN DB ---")
        cursor.execute("SELECT DISTINCT model_urn FROM file_nodes;")
        urns = cursor.fetchall()
        for u in urns:
            print(f"'{u[0]}'")
            
        print("\n--- NODES FOR 'proyectos/PQT8_TALARA' (EXACT MATCH) ---")
        cursor.execute("SELECT id, name FROM file_nodes WHERE model_urn = 'proyectos/PQT8_TALARA';")
        rows = cursor.fetchall()
        print(f"Count: {len(rows)}")
        for r in rows[:5]:
            print(r)
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_urns()
