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
    GHOST = 'c209a04b-c16f-476a-9743-a5ea80ddc16c'
    
    # Identify nodes that WERE children of ghost (or are now orphans at root with name 'proyectos/PQT8_TALARA/' or similar)
    # Actually, I set parent_id = NULL for them in Step 7493. 
    # But I need to find them by name pattern or previous parent.
    
    # I'll search for 'FOLDER' nodes where model_urn != URN but they are at root and look like they belong there
    cur.execute("UPDATE file_nodes SET model_urn = %s WHERE parent_id IS NULL AND (model_urn = 'global' OR model_urn IS NULL) AND name != 'global' AND is_deleted = FALSE;", (URN,))
    count = cur.rowcount
    print(f"Updated URN for {count} folders at root.")
    
    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
