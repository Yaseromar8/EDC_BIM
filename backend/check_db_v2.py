import os
import psycopg2
from urllib.parse import urlparse

def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        return psycopg2.connect(db_url)
    return psycopg2.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        database=os.environ.get('DB_NAME', 'visor_db'),
        user=os.environ.get('DB_USER', 'postgres'),
        password=os.environ.get('DB_PASS', 'postgres')
    )

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT model_urn, COUNT(*) FROM file_nodes WHERE is_deleted = FALSE AND node_type = 'FILE' GROUP BY model_urn")
    rows = cursor.fetchall()
    print("Documents group by model_urn:")
    for row in rows:
        print(f"URN: {row[0]}, Count: {row[1]}")
    
    cursor.execute("SELECT name, model_urn FROM file_nodes WHERE is_deleted = FALSE AND node_type = 'FILE' LIMIT 10")
    print("\nSample files:")
    for row in cursor.fetchall():
        print(f"- {row[0]} (URN: {row[1]})")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
