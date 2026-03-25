import psycopg2
import os
import requests
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
DB_NAME = os.getenv('DB_NAME')
DB_HOST = os.getenv('DB_HOST')

try:
    conn = psycopg2.connect(dbname=DB_NAME, user=DB_USER, password=DB_PASS, host=DB_HOST)
    cur = conn.cursor()
    
    URN = 'proyectos/PQT8_TALARA'
    
    # DB List
    cur.execute("SELECT name FROM file_nodes WHERE parent_id IS NULL AND model_urn = %s AND is_deleted = FALSE ORDER BY name;", (URN,))
    db_names = set(row[0] for row in cur.fetchall())
    
    # API List
    API_URL = "http://127.0.0.1:3000/api/docs/list?path=proyectos/PQT8_TALARA&model_urn=proyectos/PQT8_TALARA"
    resp = requests.get(API_URL)
    api_data = resp.json().get('data', {})
    api_names = set(f['name'] for f in api_data.get('folders', []))
    
    print(f"DB Count: {len(db_names)}")
    print(f"API Count: {len(api_names)}")
    
    print("\nNames in DB but NOT in API:")
    for name in sorted(db_names - api_names):
        print(f" - {name}")
        
    print("\nNames in API but NOT in DB:")
    for name in sorted(api_names - db_names):
        print(f" - {name}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
