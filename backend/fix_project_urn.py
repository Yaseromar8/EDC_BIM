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
    
    # Ver todos los proyectos y su estado actual
    print("=== ESTADO ACTUAL DE PROYECTOS ===")
    cursor.execute("SELECT id, name, model_urn, status, hub_id FROM projects ORDER BY id")
    rows = cursor.fetchall()
    for r in rows:
        print(f"  ID='{r[0]}' Name='{r[1]}' model_urn='{r[2]}' status={r[3]}")
    
    print(f"\n=== ACTUALIZANDO PROYECTO TALARA ===")
    
    # Buscar el proyecto PQT8_TALARA (varios posibles nombres)
    cursor.execute("SELECT id, name FROM projects WHERE UPPER(name) LIKE '%TALARA%' OR UPPER(name) LIKE '%PQT8%'")
    talara_rows = cursor.fetchall()
    
    if talara_rows:
        for pid, pname in talara_rows:
            print(f"Encontrado: ID={pid} Name={pname}")
            
            # Actualizar SOLO el model_urn, no el ID para evitar romper FKs
            cursor.execute("UPDATE projects SET model_urn = %s WHERE id = %s", (PROJECT_URN, pid))
            print(f"  model_urn actualizado a: {PROJECT_URN}")
    else:
        print("No encontrado por nombre. Buscando el ID='1' u otros numéricos...")
        cursor.execute("SELECT id, name FROM projects WHERE id NOT LIKE 'b.%'")
        for pid, pname in cursor.fetchall():
            print(f"Encontrado legacy: ID={pid} Name={pname}")
            cursor.execute("UPDATE projects SET model_urn = %s WHERE id = %s", (PROJECT_URN, pid))
            print(f"  model_urn actualizado a: {PROJECT_URN}")
    
    conn.commit()
    print("\nFinalizado. Verificando resultado...")
    cursor.execute("SELECT id, name, model_urn FROM projects ORDER BY id")
    for r in cursor.fetchall():
        print(f"  ID='{r[0]}' Name='{r[1]}' model_urn='{r[2]}'")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
