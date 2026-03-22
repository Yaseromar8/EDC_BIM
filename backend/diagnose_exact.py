import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"
# El frontend usa: proyectos/{project.name.replace(' ', '_')}/
# El nombre del proyecto según la BD de proyectos es 'PQT8_TALARA' o similar
# Necesitamos saber exactamente qué nombre tiene el proyecto

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # === DIAGNÓSTICO TOTAL ===
    
    print("1. NODOS ROOT (parent_id IS NULL):")
    cursor.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id IS NULL")
    roots = cursor.fetchall()
    for r in roots:
        cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s", (r[0],))
        children = cursor.fetchone()[0]
        print(f"  ID={r[0]} NAME='{r[1]}' URN={r[2]} DEL={r[3]} Children={children}")
    
    print("\n2. TODOS LOS 'proyectos' (sin filtro):")
    cursor.execute("SELECT id, name, model_urn, is_deleted, parent_id FROM file_nodes WHERE name = 'proyectos'")
    for r in cursor.fetchall():
        cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s", (r[0],))
        children = cursor.fetchone()[0]
        print(f"  ID={r[0]} URN={r[2]} DEL={r[3]} Parent={r[4]} Children={children}")
    
    print("\n3. TODOS 'PQT8_TALARA':")
    cursor.execute("SELECT id, model_urn, is_deleted, parent_id FROM file_nodes WHERE name = 'PQT8_TALARA'")
    for r in cursor.fetchall():
        cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (r[0],))
        children = cursor.fetchone()[0]
        parent_name = ''
        if r[3]:
            cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (r[3],))
            pr = cursor.fetchone()
            parent_name = pr[0] if pr else 'UNKNOWN'
        print(f"  ID={r[0]} URN={r[1]} DEL={r[2]} Parent={r[3]}({parent_name}) Children_active={children}")
    
    print("\n4. NODO CON MÁS HIJOS ACTIVOS:")
    cursor.execute("""
        SELECT parent_id, count(*) as c FROM file_nodes 
        WHERE is_deleted = FALSE AND parent_id IS NOT NULL
        GROUP BY parent_id ORDER BY c DESC LIMIT 5
    """)
    for r in cursor.fetchall():
        cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (r[0],))
        pname = cursor.fetchone()
        print(f"  Parent ID={r[0]} ({pname[0] if pname else '?'}) -> {r[1]} children")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
