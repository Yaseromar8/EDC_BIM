"""Purga registros huérfanos de inventory_assets que no tienen modelo asociado en model_config."""
import os, pathlib, sys
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

_env_found = load_dotenv()
if not _env_found:
    _parent_env = pathlib.Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(_parent_env)

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    
    # Find all active URNs in model_config
    cur.execute('SELECT urn FROM model_config')
    active_urns = set(r[0] for r in cur.fetchall())
    
    # Find orphaned source_urns
    cur.execute('SELECT DISTINCT source_urn FROM inventory_assets')
    all_source_urns = set(r[0] for r in cur.fetchall())
    
    orphaned = all_source_urns - active_urns
    
    print(f"\nURNs activos en model_config: {len(active_urns)}")
    print(f"URNs únicos en inventory_assets: {len(all_source_urns)}")
    print(f"URNs huérfanos: {len(orphaned)}")
    
    if orphaned:
        for urn in orphaned:
            cur.execute('SELECT model_urn, COUNT(*) FROM inventory_assets WHERE source_urn = %s GROUP BY model_urn', (urn,))
            for row in cur.fetchall():
                print(f"  PURGANDO: model_urn={row[0]}, source_urn={urn[:50]}..., registros={row[1]}")
            cur.execute('DELETE FROM inventory_assets WHERE source_urn = %s', (urn,))
        
        conn.commit()
        
        # Verify
        cur.execute('SELECT COUNT(*) FROM inventory_assets')
        remaining = cur.fetchone()[0]
        print(f"\n✓ PURGA COMPLETA. Registros restantes: {remaining}")
    else:
        print("\n✓ No hay registros huérfanos.")
