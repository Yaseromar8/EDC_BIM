"""Fix lastModifiedTime for all models and trigger extraction for the 004120 model"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv; import pathlib
load_dotenv(pathlib.Path(r'd:\VISOR_APS_TL\.env'))
from db import init_db_pool, get_db_connection
from aps import get_internal_token
import requests
init_db_pool()

token, _ = get_internal_token()
headers = {'Authorization': f'Bearer {token}'}

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT model_id, name, project_id, version_id, last_modified_time FROM model_config")
    rows = cur.fetchall()
    
    for mid, name, pid, vid, lmt in rows:
        if not pid or not vid:
            continue
        try:
            v_url = f"https://developer.api.autodesk.com/data/v1/projects/{pid}/versions/{vid}"
            v_resp = requests.get(v_url, headers=headers, timeout=10)
            if v_resp.ok:
                attrs = v_resp.json().get('data', {}).get('attributes', {})
                new_lmt = attrs.get('lastModifiedTime')
                if new_lmt and new_lmt != lmt:
                    cur.execute("UPDATE model_config SET last_modified_time = %s WHERE model_id = %s", (new_lmt, mid))
                    print(f"  Fixed date: {name}: {lmt} -> {new_lmt}")
        except Exception as e:
            print(f"  Error for {name}: {e}")
    
    conn.commit()
    print("\nDates fixed.")
