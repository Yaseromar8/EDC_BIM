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
    
    # Check for duplicate names in the root
    cur.execute("SELECT name, count(*) FROM file_nodes WHERE model_urn = %s AND parent_id IS NULL AND is_deleted = FALSE GROUP BY name HAVING count(*) > 1;")
    print("Duplicate names in root:")
    for row in cur.fetchall():
        print(row)
        
    # Check for all root folders and their IDs
    cur.execute("SELECT id, name FROM file_nodes WHERE model_urn = %s AND parent_id IS NULL AND is_deleted = FALSE ORDER BY name;")
    print("\nAll root folders:")
    for row in cur.fetchall():
        print(row)
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
