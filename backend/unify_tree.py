import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

def unify_folders(name, parent_id=None):
    with psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    ) as conn:
        with conn.cursor() as cursor:
            if parent_id is None:
                cursor.execute("SELECT id FROM file_nodes WHERE name = %s AND parent_id IS NULL AND is_deleted = FALSE", (name,))
            else:
                cursor.execute("SELECT id FROM file_nodes WHERE name = %s AND parent_id = %s AND is_deleted = FALSE", (name, parent_id))
            
            ids = [r[0] for r in cursor.fetchall()]
            if len(ids) <= 1:
                return ids[0] if ids else None
            
            # Ganador: el que más hijos tenga
            counts = []
            for i in ids:
                cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s", (i,))
                counts.append((i, cursor.fetchone()[0]))
            
            counts.sort(key=lambda x: x[1], reverse=True)
            winner = counts[0][0]
            losers = [x[0] for x in counts[1:]]
            
            print(f"Fusionando {len(losers)} duplicados de '{name}' en el ganador {winner}")
            for l in losers:
                cursor.execute("UPDATE file_nodes SET parent_id = %s WHERE parent_id = %s", (winner, l))
                cursor.execute("DELETE FROM file_nodes WHERE id = %s", (l,))
            conn.commit()
            return winner

try:
    print("--- UNIFICANDO PROYECTOS ---")
    p_id = unify_folders("proyectos", None)
    if p_id:
        print(f"Root Proyectos ID: {p_id}")
        print("--- UNIFICANDO PQT8_TALARA ---")
        t_id = unify_folders("PQT8_TALARA", p_id)
        if t_id:
            print(f"Base Talara ID: {t_id}")
    print("UNIFICACIÓN DE ÁRBOL COMPLETADA.")
except Exception as e:
    print(f"Error: {e}")
