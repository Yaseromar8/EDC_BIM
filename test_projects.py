import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, model_urn FROM projects")
        for r in cur.fetchall():
            print(r)
except Exception as e:
    print('Error:', e)
