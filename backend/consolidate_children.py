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
    
    # 1. Obtener el ID de PQT8_TALARA maestro
    cursor.execute("SELECT id FROM file_nodes WHERE name = 'PQT8_TALARA' AND is_deleted = FALSE LIMIT 1")
    parent_id = cursor.fetchone()[0]
    print(f"Auditando hijos de {parent_id}")

    # 2. Encontrar nombres duplicados
    cursor.execute("""
        SELECT name, count(*) 
        FROM file_nodes 
        WHERE parent_id = %s AND is_deleted = FALSE AND node_type = 'FOLDER'
        GROUP BY name HAVING count(*) > 1
    """, (parent_id,))
    duplicates = cursor.fetchall()
    
    for name, count in duplicates:
        print(f"Fusionando {count} carpetas llamadas '{name}'")
        cursor.execute("""
            SELECT id, (SELECT count(*) FROM file_nodes WHERE parent_id = f.id) as c
            FROM file_nodes f 
            WHERE parent_id = %s AND name = %s AND node_type = 'FOLDER' AND is_deleted = FALSE
            ORDER BY c DESC
        """, (parent_id, name))
        ids = [r[0] for r in cursor.fetchall()]
        
        winner = ids[0]
        losers = ids[1:]
        
        for l in losers:
            print(f"  Moviendo contenido de {l} a {winner}")
            cursor.execute("UPDATE file_nodes SET parent_id = %s WHERE parent_id = %s", (winner, l))
            cursor.execute("DELETE FROM file_nodes WHERE id = %s", (l,))
            
    conn.commit()
    conn.close()
    print("CONSOLIDACIÓN DE CONTENIDO COMPLETADA.")
except Exception as e:
    print(f"Error: {e}")
