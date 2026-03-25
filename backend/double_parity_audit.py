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
    
    # DB List of FOLDERS
    cur.execute("SELECT name, node_type FROM file_nodes WHERE parent_id IS NULL AND model_urn = %s AND is_deleted = FALSE ORDER BY name;", (URN,))
    all_db = cur.fetchall()
    db_folders = set(row[0] for row in all_db if row[1] == 'FOLDER')
    db_files = set(row[0] for row in all_db if row[1] != 'FOLDER')
    
    # API List
    API_URL = "http://127.0.0.1:3000/api/docs/list?path=proyectos/PQT8_TALARA&model_urn=proyectos/PQT8_TALARA"
    resp = requests.get(API_URL)
    api_data = resp.json().get('data', {})
    api_folders = set(f['name'] for f in api_data.get('folders', []))
    api_files = set(f['name'] for f in api_data.get('files', []))
    
    print(f"DB Folders: {len(db_folders)} | API Folders: {len(api_folders)}")
    print(f"DB Files: {len(db_files)} | API Files: {len(api_files)}")
    
    if db_folders != api_folders:
        print("\nFOLDER DISCREPANCY:")
        print("In DB but not API:", db_folders - api_folders)
        print("In API but not DB:", api_folders - db_folders)
        
    if db_files != api_files:
        print("\nFILE DISCREPANCY:")
        print("In DB but not API:", db_files - api_files)
        print("In API but not DB:", api_files - db_files)
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
