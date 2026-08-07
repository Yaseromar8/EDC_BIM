import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(
    dbname=os.environ.get('DB_NAME', 'bim_digital_twin'),
    user=os.environ.get('DB_USER', 'postgres'),
    password=os.environ.get('DB_PASS', 'postgres'),
    host=os.environ.get('DB_HOST', 'localhost'),
    port=os.environ.get('DB_PORT', '5432')
)
cur = conn.cursor()
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'inventory_assets';
""")
for r in cur.fetchall():
    print(r)
