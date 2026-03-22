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
    
    # Ver el estado actual de la tabla projects
    print("=== ESTADO ACTUAL DE PROYECTOS ===")
    cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' ORDER BY ordinal_position")
    cols = [r[0] for r in cursor.fetchall()]
    print(f"Columnas: {cols}")
    
    cursor.execute("SELECT id, name, model_urn, status FROM projects ORDER BY id")
    rows = cursor.fetchall()
    for r in rows:
        print(f"  ID={r[0]} Name='{r[1]}' model_urn={r[2]} status={r[3]}")
    
    # Ver si el ID es texto o número
    cursor.execute("SELECT data_type FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'id'")
    id_type = cursor.fetchone()
    print(f"\nTipo de la columna id: {id_type}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
