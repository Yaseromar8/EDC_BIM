import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT data->'photos' FROM tracking_pins WHERE pin_type='fotos'")
        for row in cur.fetchall():
            print(row[0])
except Exception as e:
    print('Error:', e)
