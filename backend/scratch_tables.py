import sys
import os
sys.path.append('d:/VISOR_APS_TL/backend')
from dotenv import load_dotenv
load_dotenv('d:/VISOR_APS_TL/.env')
from db import get_db_connection

with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT urn, name FROM model_config WHERE name LIKE '%011264@011268%'")
    rows = cursor.fetchall()
    
    total = 0
    for urn, name in rows:
        cursor.execute("SELECT COUNT(*) FROM gemelo_assets WHERE urn = %s", (urn,))
        count = cursor.fetchone()[0]
        print(f"Model: {name} (URN: {urn[:20]}...) -> {count} elements")
        total += count
    print(f"Total elements for this file: {total}")
