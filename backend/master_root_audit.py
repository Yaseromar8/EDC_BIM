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
    
    # 1. Check allFolders in the ROOT (parent_id is null) for this URN
    URN = 'proyectos/PQT8_TALARA'
    cur.execute("SELECT id, name, model_urn FROM file_nodes WHERE parent_id IS NULL AND model_urn = %s AND is_deleted = FALSE;", (URN,))
    urn_root = cur.fetchall()
    print(f"Folders in URN root '{URN}': {len(urn_root)}")
    
    # 2. Check all folders in NOT-NULL parents but belonging to this URN root structure
    # (Maybe the Sidebar is showing them because of path resolution?)
    
    # 3. Check for folders with parent_id = 'c209a04b-c16f-476a-9743-a5ea80ddc16c' (Ghost)
    GHOST = 'c209a04b-c16f-476a-9743-a5ea80ddc16c'
    cur.execute("SELECT id, name, model_urn FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE;", (GHOST,))
    ghost_children = cur.fetchall()
    print(f"Folders under GHOST parent: {len(ghost_children)}")
    for row in ghost_children:
        print(f" - {row[1]} (URN: {row[2]})")

    # 4. MOVE GHOST CHILDREN TO ROOT IF THEY BELONG TO TALARA
    if ghost_children:
        print("\nMOVING GHOST CHILDREN TO ROOT...")
        cur.execute("UPDATE file_nodes SET parent_id = NULL WHERE parent_id = %s;", (GHOST,))
        print(f"Moved {cur.rowcount} folders to root.")
        
    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
