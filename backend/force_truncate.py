import sys
import os
from dotenv import load_dotenv

load_dotenv(r'd:\VISOR_APS_TL\.env')
sys.path.append(r'd:\VISOR_APS_TL\backend')
from db import get_db_connection

try:
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Kill locks
            cursor.execute('''
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = current_database() 
                AND pid <> pg_backend_pid();
            ''')
            print("Conexiones zombis terminadas.")
            
            cursor.execute('TRUNCATE TABLE inventory_assets CASCADE;')
            conn.commit()
            print('Tabla `inventory_assets` vaciada correctamente a cero.')
            
            # Count after
            cursor.execute('SELECT COUNT(*) FROM inventory_assets')
            after_count = cursor.fetchone()[0]
            print(f'Metadata ahora: {after_count} elementos')
            
except Exception as e:
    print('Error truncando la base de datos:', e)
