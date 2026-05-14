import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn, pin_type, COUNT(*) FROM tracking_pins GROUP BY model_urn, pin_type")
        print('All pins:', cur.fetchall())
except Exception as e:
    print('Error:', e)
