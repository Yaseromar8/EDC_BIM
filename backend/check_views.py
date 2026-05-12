"""Verifica qué vista 3D se usó para cada modelo en model_config e inventory_assets."""
import os, pathlib, sys
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv() or load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    
    # 1. model_config: nombre, URN, vista configurada
    cur.execute('''
        SELECT name, urn, app_project_id, default_view_guid 
        FROM model_config 
        ORDER BY app_project_id, name
    ''')
    models = cur.fetchall()
    
    print(f"\n{'='*80}")
    print(f"  MODELOS Y VISTAS CONFIGURADAS (model_config)")
    print(f"{'='*80}")
    for name, urn, proj, view_guid in models:
        print(f"\n  [{proj}] {name}")
        print(f"    urn            = ...{urn[-30:]}")
        print(f"    view_guid (DB) = {view_guid or '(ninguno - usará fallback 3D)'}")
    
    # 2. inventory_assets: verificar qué modelos tienen metadata extraída
    cur.execute('''
        SELECT ia.model_urn, ia.source_urn, COUNT(*) as cnt,
               mc.name, mc.default_view_guid
        FROM inventory_assets ia
        LEFT JOIN model_config mc ON mc.urn = ia.source_urn
        GROUP BY ia.model_urn, ia.source_urn, mc.name, mc.default_view_guid
        ORDER BY ia.model_urn
    ''')
    inv = cur.fetchall()
    
    print(f"\n{'='*80}")
    print(f"  METADATA EXTRAIDA (inventory_assets)")
    print(f"{'='*80}")
    for model_urn, source_urn, cnt, name, view_guid in inv:
        print(f"\n  [{model_urn}] {name or '(sin match en model_config)'}")
        print(f"    source_urn = ...{source_urn[-30:]}")
        print(f"    registros  = {cnt}")
        print(f"    view_guid  = {view_guid or '(no configurado)'}")
    
    print(f"\n{'='*80}\n")
