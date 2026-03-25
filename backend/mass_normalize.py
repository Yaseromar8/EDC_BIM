import psycopg2
from dotenv import load_dotenv
import os

load_dotenv('d:/VISOR_APS_TL/.env')

def normalize_all():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        
        print("--- NORMALIZING file_nodes ---")
        cursor.execute("UPDATE file_nodes SET model_urn = RTRIM(model_urn, '/') WHERE model_urn LIKE '%/';")
        print(f"Nodes updated: {cursor.rowcount}")
        
        print("--- NORMALIZING activity_log ---")
        cursor.execute("UPDATE activity_log SET model_urn = RTRIM(model_urn, '/') WHERE model_urn LIKE '%/';")
        print(f"Log entries updated: {cursor.rowcount}")
        
        conn.commit()
        conn.close()
        print("Normalization COMPLETE.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    normalize_all()
