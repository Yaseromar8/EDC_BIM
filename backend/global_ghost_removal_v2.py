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
    
    # DELETE instead of UPDATE for ghost nodes in 'global'
    cur.execute("DELETE FROM file_nodes WHERE (name = 'proyectos/PQT8_TALARA' OR name = 'PQT8_TALARA') AND model_urn = 'global';")
    count = cur.rowcount
    
    # Also delete any node where name matches the project prefix inside the project URN themselves (except the real folders)
    # (Just in case they are hiding something)
    cur.execute("DELETE FROM file_nodes WHERE name = 'PQT8_TALARA' AND model_urn = 'proyectos/PQT8_TALARA';")
    count += cur.rowcount
    
    print(f"Deleted {count} ghost nodes in total.")
    
    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
