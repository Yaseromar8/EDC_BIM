import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
DB_NAME = os.getenv('DB_NAME')
DB_HOST = os.getenv('DB_HOST')

try:
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        host=DB_HOST
    )
    cur = conn.cursor()
    
    URN = 'proyectos/PQT8_TALARA'
    
    # 1. Who are the roots?
    cur.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id IS NULL;")
    print("CURRENT ROOTS:", cur.fetchall())
    
    # 2. What are the unique parent_ids of the projeto nodes?
    cur.execute("SELECT DISTINCT parent_id FROM file_nodes WHERE model_urn = %s;", (URN,))
    parents = [row[0] for row in cur.fetchall()]
    print(f"Parents for {URN}: {parents}")
    
    # 3. Check those parents
    if parents:
        non_null_parents = [p for p in parents if p]
        if non_null_parents:
            cur.execute("SELECT id, name, model_urn, is_deleted, parent_id FROM file_nodes WHERE id = ANY(%s);", (non_null_parents,))
            print("Parents Details:", cur.fetchall())
            
    conn.close()
except Exception as e:
    print(f"Error: {e}")
