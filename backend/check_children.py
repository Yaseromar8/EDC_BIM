import os
from dotenv import load_dotenv
load_dotenv()
from db import get_db_connection

PARENT_ID = "e0566362-e2cbb2b60721" # Usar el ID que salió en el test anterior

try:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        print(f"--- Inspeccionando HIJOS de {PARENT_ID} ---")
        cursor.execute("SELECT id, name, model_urn, is_deleted FROM file_nodes WHERE parent_id = %s", (PARENT_ID,))
        rows = cursor.fetchall()
        print(f"Total encontrados (sin filtro URN/Deleted): {len(rows)}")
        for r_id, r_name, r_urn, r_del in rows:
            print(f"  - {r_name} | URN: '{r_urn}' | Deleted: {r_del}")

except Exception as e:
    print(f"Error: {e}")
