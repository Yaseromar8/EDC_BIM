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
    
    # Ver todos los proyectos actuales
    print("=== PROYECTOS ACTUALES ===")
    cursor.execute("SELECT id, name, model_urn, status FROM projects ORDER BY name")
    rows = cursor.fetchall()
    for r in rows:
        print(f"  ID='{r[0]}' Name='{r[1]}' model_urn='{r[2]}' status='{r[3]}'")
    
    print("\n=== ACTUALIZANDO model_urn EN TODOS LOS PROYECTOS TALARA/PQT8 ===")
    
    # Actualizar model_urn de todos los proyectos que contienen PQT8 o TALARA en el nombre
    cursor.execute("""
        UPDATE projects 
        SET model_urn = %s 
        WHERE UPPER(name) LIKE '%%TALARA%%' OR UPPER(name) LIKE '%%PQT8%%'
    """, (PROJECT_URN,))
    print(f"Proyectos actualizados: {cursor.rowcount}")
    
    # Si no se actualizó ninguno, actualizar todos los que tienen model_urn = null (a la espera de que el usuario confirme)
    if cursor.rowcount == 0:
        print("No se encontró proyecto TALARA/PQT8 por nombre. Actualizando todos los proyectos sin model_urn...")
        cursor.execute("UPDATE projects SET model_urn = %s WHERE model_urn IS NULL", (PROJECT_URN,))
        print(f"Proyectos actualizados: {cursor.rowcount}")
    
    conn.commit()
    
    print("\n=== RESULTADO FINAL ===")
    cursor.execute("SELECT id, name, model_urn FROM projects ORDER BY name")
    for r in cursor.fetchall():
        print(f"  ID='{r[0]}' Name='{r[1]}' model_urn='{r[2]}'")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
