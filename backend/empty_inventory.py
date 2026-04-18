import sys
import os
from dotenv import load_dotenv

load_dotenv(r'd:\VISOR_APS_TL\.env')
sys.path.append(r'd:\VISOR_APS_TL\backend')
from db import get_db_connection

try:
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Count beforehand
            cursor.execute('SELECT COUNT(*) FROM inventory_assets')
            before_count = cursor.fetchone()[0]
            print(f'Metadata antes: {before_count} elementos')
            
            # Limpiar tabla
            cursor.execute('TRUNCATE TABLE inventory_assets')
            conn.commit()
            print('Tabla `inventory_assets` vaciada correctamente.')
            
            # Count after
            cursor.execute('SELECT COUNT(*) FROM inventory_assets')
            after_count = cursor.fetchone()[0]
            print(f'Metadata ahora: {after_count} elementos')
            
except Exception as e:
    print('Error truncando la base de datos:', e)
