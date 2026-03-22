import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"  # El model_urn que usa el frontend

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # 1. Ver cómo llega el proyecto al frontend (buscar en acc_projects o models table)  
    print("=== BUSCANDO b.a7ce... en TODAS LAS TABLAS ===")
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables = [r[0] for r in cursor.fetchall()]
    
    for t in tables:
        cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{t}'")
        cols = [r[0] for r in cursor.fetchall()]
        # Buscar tablas que tengan algo relacionado con acc_id o hub_id
        if any(c in cols for c in ['acc_id', 'hub_project_id', 'urn', 'project_id']):
            print(f"\nTabla '{t}' (cols: {cols})")
            try:
                cursor.execute(f"SELECT * FROM {t} LIMIT 5")
                for r in cursor.fetchall():
                    if any(str(PROJECT_URN) in str(v) or 'TALARA' in str(v).upper() or 'PQT8' in str(v).upper() for v in r):
                        print(f"  MATCH: {r}")
            except Exception as e:
                pass
    
    print("\n=== CARPETAS RAÍZ ACTUALES ===")
    cursor.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id IS NULL ORDER BY name")
    for r in cursor.fetchall():
        print(f"  '{r[1]}' | ID: {r[0]} | URN: {r[2]} | Deleted: {r[3]}")
    
    print("\n=== HIJOS DE 'proyectos' CON URN CORRECTO ===")
    cursor.execute("""
        SELECT p.name as parent, f.name, f.id, f.model_urn, f.is_deleted 
        FROM file_nodes f
        JOIN file_nodes p ON f.parent_id = p.id
        WHERE p.name = 'proyectos' AND f.model_urn = %s
    """, (PROJECT_URN,))
    for r in cursor.fetchall():
        print(f"  [Parent: {r[0]}] -> {r[1]} | ID: {r[2]} | Del: {r[4]}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
