import os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("""
        SELECT model_urn, source_urn, COUNT(*) 
        FROM inventory_assets 
        GROUP BY model_urn, source_urn 
        ORDER BY model_urn, COUNT(*) DESC
    """)
    rows = cur.fetchall()
    
    total = sum(r[2] for r in rows)
    frentes = set(r[0] for r in rows)
    print(f"Total: {total} elementos en Google Cloud PostgreSQL")
    print(f"Frentes: {len(frentes)}")
    
    current = None
    for r in rows:
        if r[0] != current:
            current = r[0]
            subtotal = sum(x[2] for x in rows if x[0] == current)
            print(f"\n  Frente: {current} ({subtotal} total)")
        src = r[1][-35:] if r[1] else '?'
        print(f"    source: ...{src} = {r[2]} elementos")
