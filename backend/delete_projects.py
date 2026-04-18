import os
import sys
from dotenv import load_dotenv

load_dotenv(r'd:\VISOR_APS_TL\backend\.env')
sys.path.append(r'd:\VISOR_APS_TL\backend')
from db import get_db_connection

try:
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT id, name FROM projects')
            projects = cursor.fetchall()
            print('Current projects:', projects)
            
            cursor.execute("DELETE FROM projects WHERE name != 'PQT8_TALARA'")
            conn.commit()
            print('Deleted all non-PQT8_TALARA projects')
            
            cursor.execute('SELECT id, name FROM projects')
            print('Remaining:', cursor.fetchall())
except Exception as e:
    print('Error:', e)
