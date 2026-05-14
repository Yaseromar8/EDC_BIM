import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, x, y, z, val FROM tracking_pins WHERE model_urn='1_CANAL' AND pin_type='fotos'")
        rows = cur.fetchall()
        print(f'Total fotos pins in 1_CANAL: {len(rows)}')
        for r in rows:
            print(r)
except Exception as e:
    print('Error:', e)
