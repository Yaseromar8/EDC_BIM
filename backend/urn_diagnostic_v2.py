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
    
    # Check for anything starting with 'proyecto'
    cur.execute("SELECT DISTINCT model_urn FROM file_nodes WHERE model_urn LIKE 'proyecto%';")
    print("Distinct model_urns in DB:")
    for row in cur.fetchall():
        urn = row[0]
        print(f"'{urn}' (Length: {len(urn)})")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
