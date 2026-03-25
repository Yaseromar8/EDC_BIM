import os
from dotenv import load_dotenv
load_dotenv('../.env')
from db import get_db_connection

with get_db_connection() as conn:
    cursor = conn.cursor()
    urn = 'proyectos/PQT8_TALARA'
    print(f"--- POST-NORMALIZATION AUDIT FOR {urn} ---")
    cursor.execute("SELECT id, name, model_urn, parent_id, is_deleted FROM file_nodes WHERE model_urn = %s AND is_deleted = FALSE", (urn,))
    rows = cursor.fetchall()
    print(f"Active nodes found: {len(rows)}")
    for r in rows:
        print(r)
    
    print("\n--- CHECKING FOR ANY REMAINING SLASHED URNS ---")
    cursor.execute("SELECT count(*) FROM file_nodes WHERE model_urn LIKE '%/'")
    print(f"Slashed nodes count: {cursor.fetchone()[0]}")
