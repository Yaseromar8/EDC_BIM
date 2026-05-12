import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv('d:/VISOR_APS_TL/.env')

try:
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS'),
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', '5432')
    )
    cur = conn.cursor()
    
    # 1. Total de elementos por categoría extraída
    cur.execute("""
        SELECT 
            properties->'__category__'->>'__category__' as revit_cat,
            COUNT(*) as cnt
        FROM inventory_assets
        GROUP BY revit_cat
        ORDER BY cnt DESC
    """)
    rows = cur.fetchall()
    
    total = 0
    print("=" * 50)
    print("CATEGORÍAS EXTRAÍDAS EN POSTGRESQL")
    print("=" * 50)
    for cat, cnt in rows:
        print(f"  {cat or '(null)':<35} {cnt:>6}")
        total += cnt
    print(f"  {'TOTAL':<35} {total:>6}")
    
    # 2. Total de elementos en la tabla
    cur.execute("SELECT COUNT(*) FROM inventory_assets")
    db_total = cur.fetchone()[0]
    print(f"\n  Total filas en inventory_assets:  {db_total}")
    
    # 3. Cuántos modelos (source_urn) distintos hay
    cur.execute("SELECT DISTINCT source_urn FROM inventory_assets")
    urns = cur.fetchall()
    print(f"  Modelos distintos (source_urn):   {len(urns)}")
    for u in urns:
        print(f"    - {u[0]}")
    
    conn.close()

except Exception as e:
    print(f"Error: {e}")
