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
    
    # Count ALL root folders by model_urn
    cur.execute("SELECT model_urn, count(*) FROM file_nodes WHERE parent_id IS NULL AND node_type = 'FOLDER' AND is_deleted = FALSE GROUP BY model_urn;")
    print("Root folders by URN:")
    for row in cur.fetchall():
        print(row)
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
