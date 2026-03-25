import psycopg2
from dotenv import load_dotenv
import os

load_dotenv('d:/VISOR_APS_TL/.env')

def aggressive_normalize():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        
        target_urn = 'proyectos/PQT8_TALARA'
        print(f"--- AGGRESSIVE NORMALIZATION TO: '{target_urn}' ---")
        
        # Unify all variants of this specific URN
        cursor.execute("""
            UPDATE file_nodes 
            SET model_urn = %s 
            WHERE model_urn LIKE 'proyectos/PQT8_TALARA%%';
        """, (target_urn,))
        print(f"Nodes updated in file_nodes: {cursor.rowcount}")
        
        cursor.execute("""
            UPDATE activity_log 
            SET model_urn = %s 
            WHERE model_urn LIKE 'proyectos/PQT8_TALARA%%';
        """, (target_urn,))
        print(f"Log entries updated in activity_log: {cursor.rowcount}")
        
        conn.commit()
        
        # Verify
        cursor.execute("SELECT DISTINCT model_urn FROM file_nodes WHERE model_urn LIKE 'proyectos/PQT8_TALARA%';")
        urns = cursor.fetchall()
        print(f"\nRemaining URNs after update: {urns}")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    aggressive_normalize()
