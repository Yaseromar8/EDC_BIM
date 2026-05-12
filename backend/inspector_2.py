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
    print("[Diag] Buscando un registro para analizar...")
    # Find any record
    cur.execute("SELECT model_urn FROM inventory_assets LIMIT 1")
    model_urn = cur.fetchone()[0]
    
    print(f"[Diag] El modelo es: {model_urn}")

except Exception as e:
    print(f"[Diag] Finalizo con error: {e}")
