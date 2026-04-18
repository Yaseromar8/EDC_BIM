import psycopg2, os
from dotenv import load_dotenv

load_dotenv()

try:
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST','localhost'),
        database=os.getenv('DB_NAME','postgres'),
        user=os.getenv('DB_USER','postgres'),
        password=os.getenv('DB_PASS','')
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check rows before
    cur.execute("SELECT count(*) FROM inventory_assets")
    count_before = cur.fetchone()[0]
    print(f"Activos en PostgreSQL antes de limpieza: {count_before}")
    
    # Truncate to wipe the slate clean
    cur.execute("TRUNCATE TABLE inventory_assets")
    print("¡Base de datos de metadata de Revit purgda exitosamente!")
    
    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
