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
    # List all root nodes to see why API skips 7
    cur.execute("""
        SELECT id, name, node_type, is_deleted 
        FROM file_nodes 
        WHERE parent_id IS NULL AND model_urn = %s AND is_deleted = FALSE
        ORDER BY name;
    """, (URN,))
    
    rows = cur.fetchall()
    print(f"Total root nodes found: {len(rows)}")
    for row in rows:
        print(f"Node: {row[1]} | Type: '{row[2]}' | Deleted: {row[3]}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
