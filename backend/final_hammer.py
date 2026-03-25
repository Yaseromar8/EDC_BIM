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
    
    # 1. Force ALL nodes that look like they belong to this project but are orphans or in 'global' to the correct URN and Root
    # We use a pattern to find them if they were moved by mistake
    cur.execute("""
        UPDATE file_nodes 
        SET model_urn = %s, parent_id = NULL 
        WHERE (model_urn = %s OR model_urn = 'global') 
        AND node_type = 'FOLDER' 
        AND is_deleted = FALSE
        AND (
            id IN (
                SELECT id FROM file_nodes 
                WHERE model_urn = 'global' AND (name LIKE '0%%' OR name LIKE 'PQT8%%')
            )
            OR parent_id IS NULL
        );
    """, (URN, URN))
    
    print(f"Hammered {cur.rowcount} folders into the project root.")
    
    # 2. Final Count Check
    cur.execute("SELECT count(*) FROM file_nodes WHERE parent_id IS NULL AND model_urn = %s AND node_type = 'FOLDER' AND is_deleted = FALSE;", (URN,))
    count = cur.fetchone()[0]
    print(f"Final Folder Count in Root: {count}")
    
    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
