"""Verifica si la metadata fue purgada correctamente tras eliminar un modelo."""
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
    
    # 1. Check model_config
    cur.execute('SELECT model_id, name, urn, app_project_id FROM model_config ORDER BY app_project_id, name')
    models = cur.fetchall()
    
    print(f"\n{'='*60}")
    print(f"  MODELOS REGISTRADOS en model_config")
    print(f"{'='*60}")
    if models:
        for m in models:
            print(f"  [{m[3]}] {m[1]}")
            print(f"    urn = {m[2][:50]}...")
            print()
    else:
        print("  (sin modelos registrados)")
    
    # 2. Check inventory_assets
    cur.execute('SELECT COUNT(*) FROM inventory_assets')
    total = cur.fetchone()[0]
    
    cur.execute('SELECT model_urn, source_urn, COUNT(*) as cnt FROM inventory_assets GROUP BY model_urn, source_urn ORDER BY model_urn')
    urns = cur.fetchall()
    
    print(f"{'='*60}")
    print(f"  METADATA en inventory_assets")
    print(f"{'='*60}")
    print(f"  Total registros: {total}")
    
    if urns:
        # Check which source_urns are orphaned (not in model_config)
        cur.execute('SELECT urn FROM model_config')
        active_urns = set(r[0] for r in cur.fetchall())
        
        for r in urns:
            is_orphan = r[1] not in active_urns
            status = "⚠️ HUÉRFANO (modelo eliminado, metadata quedó)" if is_orphan else "✓ Activo"
            print(f"\n    model_urn  = {r[0]}")
            print(f"    source_urn = {r[1][:50]}...")
            print(f"    registros  = {r[2]}")
            print(f"    estado     = {status}")
    else:
        print("  ✓ TABLA LIMPIA")
    
    print(f"\n{'='*60}\n")
