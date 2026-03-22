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
    
    # Listar todas las tablas
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
    tables = [r[0] for r in cursor.fetchall()]
    print("=== TABLAS EN LA BD ===")
    for t in tables:
        print(f"  - {t}")
    
    # Intentar encontrar la tabla de proyectos con cualquier nombre
    for table in ['projects', 'project', 'proyectos', 'obras']:
        if table in tables:
            cursor.execute(f"SELECT * FROM {table} LIMIT 5")
            rows = cursor.fetchall()
            print(f"\n=== TABLA {table} ===")
            cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'")
            cols = [r[0] for r in cursor.fetchall()]
            print(f"  Columns: {cols}")
            for r in rows:
                print(f"  Row: {r}")
    
    print("\n=== CARPETAS RAÍZ (parent_id IS NULL) ===")
    cursor.execute("SELECT id, name, model_urn FROM file_nodes WHERE parent_id IS NULL AND is_deleted = FALSE")
    for r in cursor.fetchall():
        print(f"  ID: {r[0]} | Name: '{r[1]}' | URN: {r[2]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
