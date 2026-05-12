"""
Debug: Detailed check for the specific model 740-ST-004120
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from dotenv import load_dotenv
import pathlib, json, base64
load_dotenv(pathlib.Path(r'd:\VISOR_APS_TL\.env'))

from db import init_db_pool, get_db_connection
from aps import get_internal_token
import requests

init_db_pool()

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("""
        SELECT model_id, name, urn, version_id, version_number, project_id, item_id, default_view_guid, app_project_id
        FROM model_config 
        WHERE name ILIKE '%%004120%%'
    """)
    rows = cur.fetchall()
    
    token, err = get_internal_token()
    if err:
        print(f"Auth error: {err}")
        exit(1)
    
    headers = {'Authorization': f'Bearer {token}'}
    
    for r in rows:
        model_id, name, urn, version_id, version_num, project_id, item_id, view_guid, app_proj = r
        print(f"=== MODEL: {name} ===")
        print(f"  DB URN:          {urn}")
        print(f"  DB Version ID:   {version_id}")
        print(f"  DB Version Num:  {version_num}")
        print(f"  Project ID:      {project_id}")
        print(f"  Item ID:         {item_id}")
        print(f"  App Project:     {app_proj}")
        print(f"  View GUID:       {view_guid}")
        
        if not project_id or not item_id:
            print(f"  >> NO ACC METADATA - Cannot check for updates!")
            continue
        
        # Get item tip
        url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{item_id}"
        resp = requests.get(url, headers=headers, timeout=15)
        print(f"\n  ACC Item API status: {resp.status_code}")
        
        if resp.ok:
            item_data = resp.json()
            latest_vid = item_data['data']['relationships']['tip']['data']['id']
            print(f"  ACC Latest Version ID: {latest_vid}")
            print(f"  DB  Current Version ID: {version_id}")
            print(f"  Match: {'YES' if latest_vid == version_id else 'NO - UPDATE AVAILABLE!'}")
            
            # Get version details
            v_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{latest_vid}"
            v_resp = requests.get(v_url, headers=headers, timeout=15)
            if v_resp.ok:
                v_data = v_resp.json()
                attrs = v_data.get('data', {}).get('attributes', {})
                print(f"\n  ACC Latest Version Number: {attrs.get('versionNumber')}")
                print(f"  ACC Last Modified: {attrs.get('lastModifiedTime')}")
                print(f"  ACC createTime: {attrs.get('createTime')}")
            
            # Calculate what the new URN would be
            if latest_vid != version_id:
                urn_bytes = base64.urlsafe_b64encode(latest_vid.encode('utf-8'))
                new_urn = urn_bytes.decode('utf-8').rstrip('=')
                print(f"\n  NEW URN would be: {new_urn}")
        else:
            print(f"  ERROR: {resp.text[:500]}")

print("\nDone.")
