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
    cur.execute("SELECT name FROM file_nodes WHERE parent_id IS NULL AND model_urn = %s AND node_type = 'FOLDER' AND is_deleted = FALSE ORDER BY name;")
    folders = [row[0] for row in cur.fetchall()]
    print(f"Total Folders: {len(folders)}")
    for i, name in enumerate(folders):
        print(f"{i+1}. {name}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
