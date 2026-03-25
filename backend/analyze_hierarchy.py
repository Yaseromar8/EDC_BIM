import psycopg2
from dotenv import load_dotenv
import os

load_dotenv('d:/VISOR_APS_TL/.env')

def analyze_hierarchy():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        
        print("--- ROOT-LEVEL NODES (parent_id IS NULL) ---")
        cursor.execute("SELECT id, name, node_type FROM file_nodes WHERE model_urn = 'proyectos/PQT8_TALARA' AND parent_id IS NULL;")
        for r in cursor.fetchall():
            print(f"ROOT: {r}")
            
        print("\n--- ALL NODES GROUPED BY parent_id ---")
        cursor.execute("""
            SELECT parent_id, COUNT(*) 
            FROM file_nodes 
            WHERE model_urn = 'proyectos/PQT8_TALARA' 
            GROUP BY parent_id;
        """)
        for r in cursor.fetchall():
            print(f"Parent {r[0]} has {r[1]} children")
            
        print("\n--- LOOKING FOR NODES THAT MIGHT BE THE PROJECT ROOT ---")
        cursor.execute("SELECT id, name FROM file_nodes WHERE model_urn = 'proyectos/PQT8_TALARA' AND (name LIKE '%PQT8%' OR node_type = 'FOLDER');")
        for r in cursor.fetchall()[:20]:
            print(r)
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_hierarchy()
