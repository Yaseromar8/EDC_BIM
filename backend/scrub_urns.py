import base64
import os
import sys

# Change working dir to backend so imports work
os.chdir('d:/VISOR_APS_TL/backend')
sys.path.append('d:/VISOR_APS_TL/backend')

from dotenv import load_dotenv
load_dotenv('d:/VISOR_APS_TL/.env')

from db import get_db_connection

with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT model_id, name, urn FROM model_config WHERE urn LIKE '%urn:adsk%'")
    rows = cursor.fetchall()
    
    if len(rows) == 0:
        print("No corrupt URNs found.")
    
    for row in rows:
        model_id, name, raw_urn = row
        print(f"Found corrupt URN for {name}: {raw_urn}")
        try:
            b64_urn = base64.urlsafe_b64encode(raw_urn.encode('utf-8')).decode('utf-8').rstrip('=')
            cursor.execute("UPDATE model_config SET urn = %s WHERE model_id = %s", (b64_urn, model_id))
            print(f"  -> Fixed to: {b64_urn}")
        except Exception as e:
            print(f"  -> Failed to encode: {e}")
            
    conn.commit()
    print("Database scrub complete.")
