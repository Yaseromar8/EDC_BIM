import os
import psycopg2
import json

from dotenv import load_dotenv
load_dotenv(r'd:\VISOR_APS_TL\.env')

conn = psycopg2.connect(
    dbname=os.getenv('DB_NAME', 'visor_db'),
    user=os.getenv('DB_USER', 'postgres'),
    password=os.getenv('DB_PASSWORD', 'postgres'),
    host=os.getenv('DB_HOST', 'localhost'),
    port=os.getenv('DB_PORT', '5432')
)

cur = conn.cursor()
cur.execute("SELECT external_id, name, properties FROM inventory_assets WHERE name LIKE '%444129%'")
rows = cur.fetchall()
for row in rows:
    print(f"--- {row[1]} ---")
    print(f"External ID: {row[0]}")
    props = row[2]
    if isinstance(props, str): props = json.loads(props)
    
    cat = props.get('__category__', {}).get('__category__', '')
    print(f"Category: {cat}")
    
    # Print Revit specific props
    for k, v in props.items():
        if isinstance(v, dict):
            for k2, v2 in v.items():
                if k2 in ['Categoría', 'Category', '03_05_DSI_CodigoDePartida1', '03_04_DSI_NombreDePartida', 'Longitud']:
                    print(f"  {k} -> {k2}: {v2}")
