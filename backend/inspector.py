import os
import psycopg2
import json
from dotenv import load_dotenv

# Cargar entorno
load_dotenv('d:/VISOR_APS_TL/.env')

print("[Diag] Conectando a BD...")
try:
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS'),
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', '5432')
    )
    cur = conn.cursor()
    print("[Diag] DB Conectada. Extrayendo muestra de nodos con __category__ en texto...")
    cur.execute("SELECT name, properties FROM inventory_assets WHERE properties::text LIKE '%__category__%' LIMIT 5")
    rows = cur.fetchall()

    if not rows:
        print("[Diag] No se encontraron elementos con '__category__' explícito. Buscando cualquiera normal...")
        cur.execute("SELECT name, properties FROM inventory_assets LIMIT 5")
        rows = cur.fetchall()

    db_sample = []
    for r in rows:
        name = r[0]
        # Postgres puede retornar string o dict de JSONB
        props = r[1]
        if isinstance(props, str):
            props = json.loads(props)
        
        db_sample.append({
            "name": name,
            "root_keys": list(props.keys()),
            "Datos de identidad": props.get('Datos de identidad'),
            "__category__": props.get('__category__')
        })
    
    print(json.dumps(db_sample, indent=2))
    conn.close()

except Exception as e:
    print(f"[Diag] Finalizo con error: {e}")
