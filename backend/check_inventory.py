"""Quick audit: Compare instance vs type vs category property depth."""
import os, pathlib, json, sys
from dotenv import load_dotenv

# Fix encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

_env_found = load_dotenv()
if not _env_found:
    _parent_env = pathlib.Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(_parent_env)

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    
    for node_type in ['instance', 'type', 'category']:
        print(f"\n{'='*60}")
        print(f"  {node_type.upper()} NODES")
        print(f"{'='*60}")
        cur.execute("""
            SELECT name, external_id, properties 
            FROM inventory_assets 
            WHERE model_urn = '1_DRENAJE'
            AND properties::text LIKE %s
            LIMIT 2
        """, (f'%"__node_type__": "{node_type}"%',))
        rows = cur.fetchall()
        for name, ext_id, props_raw in rows:
            props = json.loads(props_raw) if isinstance(props_raw, str) else props_raw
            cat = (props.get('__category__') or {}).get('__category__', '?')
            groups = [k for k in props.keys() if not k.startswith('__')]
            
            # Count total properties
            total_props = sum(len(v) if isinstance(v, dict) else 1 for v in props.values())
            
            print(f"\n  Name: {name}")
            print(f"  Category: {cat}")
            print(f"  Property Groups ({len(groups)}): {groups[:10]}")
            print(f"  Total Properties: ~{total_props}")
            
            # Show Dimensions/quantities if available (audit-critical)
            dims = props.get('Dimensions', {})
            if dims:
                print(f"  AUDIT DATA (Dimensions):")
                for k, v in dims.items():
                    print(f"    {k} = {str(v)[:50]}")
            
            constr = props.get('Construction', {}) or props.get('Constraints', {})
            if constr:
                keys_preview = list(constr.keys())[:5]
                print(f"  Construction/Constraints: {keys_preview}")
            
            # Show Data group (DSI custom params)
            data_grp = props.get('Data', {})
            if data_grp:
                keys_preview = list(data_grp.keys())[:6]
                print(f"  Data (DSI params): {keys_preview}")
