import psycopg2
from config import DB_CONFIG

def get_model():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("SELECT id, name, urn FROM inventory_models WHERE name LIKE '%SCL_SOLIDOS_CANAL%'")
    rows = cur.fetchall()
    for r in rows:
        print(f"Model ID: {r[0]}, Name: {r[1]}, URN: {r[2]}")
        
        # Now let's check how many assets it currently has
        cur.execute("SELECT COUNT(*) FROM inventory_assets WHERE model_id = %s", (r[0],))
        count = cur.fetchone()[0]
        print(f"  Current instances in DB: {count}")
    
    conn.close()

if __name__ == '__main__':
    get_model()
