import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn, pin_type, id FROM tracking_pins WHERE pin_type='fotos'")
        rows = cur.fetchall()
        print(f'All fotos pins: {rows}')
except Exception as e:
    print('Error:', e)
