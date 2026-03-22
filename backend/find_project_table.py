import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    print("=== TABLAS DISPONIBLES ===")
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables = [r[0] for r in cursor.fetchall()]
    print(tables)
    
    print("\n=== BUSCANDO TABLA DE PROYECTOS ===")
    for t in tables:
        cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{t}'")
        cols = [r[0] for r in cursor.fetchall()]
        if 'name' in cols and ('id' in cols or 'acc_id' in cols):
            print(f"Tabla '{t}' tiene columnas: {cols}")
            try:
                cursor.execute(f"SELECT * FROM {t} LIMIT 3")
                for r in cursor.fetchall():
                    print(f"  {r}")
            except Exception as e:
                print(f"  Error: {e}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
