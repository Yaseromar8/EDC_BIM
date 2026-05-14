import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM tracking_pins WHERE model_urn='1_CANAL' AND pin_type='fotos'")
        print('IDs:', cur.fetchall())
except Exception as e:
    print('Error:', e)
