import sys, io, urllib.parse
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
    cur.execute("SELECT project_id, version_id, last_modified_time FROM model_config WHERE name ILIKE '%%004120%%'")
    pid, vid, db_lmt = cur.fetchone()

print(f"DB lastModifiedTime: {db_lmt}")

# URL-encode the version ID
encoded_vid = urllib.parse.quote(vid, safe='')
v_url = f"https://developer.api.autodesk.com/data/v1/projects/{pid}/versions/{encoded_vid}"
print(f"API URL: {v_url[:80]}...")

v_resp = requests.get(v_url, headers=headers, timeout=15)
print(f"Status: {v_resp.status_code}")

if v_resp.ok:
    attrs = v_resp.json().get('data', {}).get('attributes', {})
    acc_lmt = attrs.get('lastModifiedTime')
    acc_vnum = attrs.get('versionNumber')
    acc_create = attrs.get('createTime')
    print(f"\nACC versionNumber: {acc_vnum}")
    print(f"ACC lastModifiedTime: {acc_lmt}")
    print(f"ACC createTime: {acc_create}")
    
    # Fix the DB
    correct_lmt = acc_lmt or acc_create
    if correct_lmt:
        with get_db_connection() as conn2:
            cur2 = conn2.cursor()
            cur2.execute("UPDATE model_config SET last_modified_time = %s WHERE name ILIKE '%%004120%%'", (correct_lmt,))
            conn2.commit()
            print(f"\n>>> DB date updated: {db_lmt} -> {correct_lmt}")
else:
    print(f"Error: {v_resp.text[:300]}")
