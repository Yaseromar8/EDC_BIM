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
    
    # Check for nodes named 'proyectos/PQT8_TALARA' or 'PQT8_TALARA' in the 'global' URN
    cur.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE (name = 'proyectos/PQT8_TALARA' OR name = 'PQT8_TALARA') AND model_urn = 'global';")
    print("Ghost nodes in 'global' URN:")
    rows = cur.fetchall()
    for row in rows:
        print(row)
        
    if rows:
        ids = [row[0] for row in rows]
        cur.execute("UPDATE file_nodes SET is_deleted = TRUE WHERE id = ANY(%s);", (ids,))
        print(f"Set is_deleted=True for {cur.rowcount} ghost nodes in 'global'.")
    
    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
