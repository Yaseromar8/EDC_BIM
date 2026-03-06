import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.environ.get('DB_HOST')
DB_NAME = os.environ.get('DB_NAME')
DB_USER = os.environ.get('DB_USER')
DB_PASS = os.environ.get('DB_PASS')
DB_PORT = os.environ.get('DB_PORT', '5432')

conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS, port=DB_PORT)
cur = conn.cursor()

tablas = ['tracking_pins', 'tracking_progress', 'tracking_details', 'photo_evidences', 'daily_reports', 'file_nodes']

# Get the last active urn that it was mistakenly migrated to
cur.execute("SELECT urn FROM model_config ORDER BY updated_at DESC LIMIT 1")
active_urn = cur.fetchone()[0]

for t in tablas:
    # 1_CANAL -> The URN the frontend sends to get_tracking
    cur.execute(f"UPDATE {t} SET model_urn = %s WHERE model_urn = '1_CANAL'", (active_urn,))

conn.commit()
print("Reverted 1_CANAL back to " + active_urn)
