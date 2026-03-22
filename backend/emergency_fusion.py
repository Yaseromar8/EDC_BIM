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
    
    print("--- FUSIÓN DE EMERGENCIA ---")
    
    # 1. Encontrar todos los PQT8_TALARA y sus hijos
    cursor.execute("""
        SELECT id, (SELECT count(*) FROM file_nodes WHERE parent_id = f.id AND is_deleted = FALSE) as c
        FROM file_nodes f WHERE name = 'PQT8_TALARA' AND is_deleted = FALSE
    """)
    roots = cursor.fetchall()
    print(f"Raíces encontradas: {len(roots)}")
    
    if len(roots) > 1:
        roots.sort(key=lambda x: x[1], reverse=True)
        winner = roots[0][0]
        losers = [r[0] for r in roots[1:]]
        
        for l in losers:
            print(f"Fusionando raíz {l} en {winner}")
            cursor.execute("UPDATE file_nodes SET parent_id = %s WHERE parent_id = %s", (winner, l))
            cursor.execute("DELETE FROM file_nodes WHERE id = %s", (l,))
        conn.commit()
    
    # 2. Verificar conteo final del ganador
    cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = (SELECT id FROM file_nodes WHERE name = 'PQT8_TALARA' AND is_deleted = FALSE LIMIT 1) AND is_deleted = FALSE")
    final_count = cursor.fetchone()[0]
    print(f"CONTEO FINAL DE CARPETAS EN PQT8_TALARA: {final_count}")

    conn.close()
    print("SANEAMIENTO COMPLETADO.")
except Exception as e:
    print(f"Error: {e}")
