"""Diagnostica la discrepancia de URNs entre model_config e inventory_assets."""
import os, pathlib, sys
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

_env_found = load_dotenv()
if not _env_found:
    load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    
    # Get all model_config URNs
    cur.execute('SELECT name, urn, app_project_id FROM model_config')
    models = cur.fetchall()
    
    # Get all inventory source URNs
    cur.execute('SELECT DISTINCT source_urn FROM inventory_assets')
    inv_urns = set(r[0] for r in cur.fetchall())
    
    print(f"\n{'='*80}")
    print(f"  DIAGNÓSTICO DE COHERENCIA URN")
    print(f"{'='*80}")
    
    for name, urn, proj in models:
        # Simulate sanitize_urn
        sanitized = urn.replace('+', '-').replace('/', '_').rstrip('=')
        
        in_inv_raw = urn in inv_urns
        in_inv_san = sanitized in inv_urns
        
        if urn == sanitized:
            match_info = "✓ URN idéntico (sin diferencia)"
        elif in_inv_san and not in_inv_raw:
            match_info = "⚠️ DISCREPANCIA: inventory usa sanitizado, model_config usa raw"
        elif in_inv_raw and not in_inv_san:
            match_info = "⚠️ DISCREPANCIA: inventory usa raw, extracción sanitiza"
        elif not in_inv_raw and not in_inv_san:
            match_info = "❌ NO ENCONTRADO en inventory (sin metadata)"
        else:
            match_info = "✓ Encontrado"
        
        print(f"\n  [{proj}] {name}")
        print(f"    model_config.urn   = ...{urn[-30:]}")
        print(f"    sanitize_urn(urn)  = ...{sanitized[-30:]}")
        print(f"    ¿Son iguales?      = {urn == sanitized}")
        print(f"    En inventory (raw) = {in_inv_raw}")
        print(f"    En inventory (san) = {in_inv_san}")
        print(f"    ESTADO: {match_info}")
    
    print(f"\n{'='*80}\n")
