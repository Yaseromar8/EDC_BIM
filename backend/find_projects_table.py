import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # 1. Ver la tabla de proyectos
    print("=== TABLA DE PROYECTOS ===")
    cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'obras' ORDER BY ordinal_position")
    cols = cursor.fetchall()
    print(f"Columnas de 'obras': {[c[0] for c in cols]}")
    
    cursor.execute("SELECT * FROM obras LIMIT 5")
    rows = cursor.fetchall()
    for r in rows:
        print(f"  {r}")
    
    # 2. También verificar qué devuelve /api/projects 
    print("\n=== REVISANDO TABLA DE PROYECTOS USUAL ===")
    for table in ['projects', 'project', 'models', 'acc_projects']:
        try:
            cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'")
            cols = cursor.fetchall()
            if cols:
                print(f"Tabla '{table}': {[c[0] for c in cols]}")
                cursor.execute(f"SELECT * FROM {table} LIMIT 3")
                for r in cursor.fetchall():
                    print(f"  {r}")
        except Exception as e:
            pass
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
