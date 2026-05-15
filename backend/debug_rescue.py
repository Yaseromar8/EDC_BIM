import os, sys
from dotenv import load_dotenv
load_dotenv()

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db import get_db_connection

print("Buscando en file_nodes por si acaso...")
try:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        missing = [
            '17787980302264768626663798515799.jpg',
            '17787980389515293724540004321107.jpg',
            '17787980449402992357872786189859.jpg',
            '17787980531627130816610037799830.jpg'
        ]
        
        for name in missing:
            cursor.execute("SELECT id, name, gcs_urn FROM file_nodes WHERE name LIKE %s", (f"%{name}%",))
            row = cursor.fetchone()
            if row:
                print(f"FOUND EXACT OR PARTIAL: {row}")
            else:
                print(f"DEFINITELY NOT IN FILE_NODES: {name}")
                
except Exception as e:
    print(f"Error: {e}")
