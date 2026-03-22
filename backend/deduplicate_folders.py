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
    
    print("--- INICIANDO DE-DUPLICACIÓN RECURSIVA ---")
    
    # 1. Encontrar carpetas con mismo nombre y mismo padre
    cursor.execute("""
        SELECT name, parent_id, array_agg(id) as ids, count(*) 
        FROM file_nodes 
        WHERE node_type = 'FOLDER' AND is_deleted = FALSE
        GROUP BY name, parent_id
        HAVING count(*) > 1;
    """)
    duplicates = cursor.fetchall()
    print(f"Set de duplicados encontrados: {len(duplicates)}")
    
    for name, parent_id, ids, count in duplicates:
        print(f"Fusionando duplicados para '{name}' (Padre: {parent_id})")
        # El ganador será el que tenga más hijos
        cursor.execute("""
            SELECT id, (SELECT count(*) FROM file_nodes WHERE parent_id = f.id) as child_count
            FROM file_nodes f
            WHERE id = ANY(%s)
            ORDER BY child_count DESC LIMIT 1
        """, (ids,))
        winner_id = cursor.fetchone()[0]
        losers = [i for i in ids if i != winner_id]
        
        for loser_id in losers:
            print(f"  Moviendo hijos de {loser_id} a {winner_id}")
            cursor.execute("UPDATE file_nodes SET parent_id = %s WHERE parent_id = %s", (winner_id, loser_id))
            print(f"  Eliminando duplicado {loser_id}")
            cursor.execute("DELETE FROM file_nodes WHERE id = %s", (loser_id,))
            
    conn.commit()
    conn.close()
    print("DE-DUPLICACIÓN COMPLETADA.")
except Exception as e:
    print(f"Error: {e}")
