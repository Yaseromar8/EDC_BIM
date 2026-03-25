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
    
    # 1. Total folders
    cur.execute("SELECT count(*) FROM file_nodes WHERE is_folder=TRUE;")
    print(f"Total folders: {cur.fetchone()[0]}")
    
    # 2. Root folders
    cur.execute("SELECT count(*) FROM file_nodes WHERE parent_id IS NULL AND is_folder=TRUE;")
    print(f"Root folders: {cur.fetchone()[0]}")
    
    # 3. URNs
    cur.execute("SELECT model_urn, count(*) FROM file_nodes GROUP BY model_urn;")
    print("URNs in DB:", cur.fetchall())
    
    # 4. Sample path
    cur.execute("SELECT name, model_urn, path FROM file_nodes WHERE parent_id IS NULL AND is_folder=TRUE LIMIT 10;")
    print("Samples:", cur.fetchall())
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
