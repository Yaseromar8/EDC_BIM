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
    
    # Encontrar el PQT8_TALARA que tiene hijos
    cursor.execute("""
        SELECT parent_id, count(*) FROM file_nodes 
        WHERE is_deleted = FALSE 
        GROUP BY parent_id HAVING count(*) > 5
    """)
    root_id = cursor.fetchone()[0]
    print(f"Raíz analizada: {root_id}")

    cursor.execute("SELECT name, model_urn, is_deleted FROM file_nodes WHERE parent_id = %s ORDER BY name", (root_id,))
    rows = cursor.fetchall()
    print(f"Total registros: {len(rows)}")
    
    names = {}
    for name, urn, deleted in rows:
        names[name] = names.get(name, 0) + 1
        print(f"'{name}' | URN: {urn} | Deleted: {deleted}")
        
    print(f"\nTotal nombres únicos: {len(names)}")
    for name, count in names.items():
        if count > 1:
            print(f"DUPLICADO: '{name}' aparece {count} veces")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
