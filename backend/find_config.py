
import os
import requests
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
from aps import get_internal_token, APS_DATA_URL

def find_config_folder():
    token, error = get_internal_token()
    if error:
        print(f"Error getting token: {error}")
        return

    headers = {'Authorization': f'Bearer {token}'}

    # 1. Get Hubs
    print("Fetching Hubs...")
    hubs_resp = requests.get(f'{APS_DATA_URL}/project/v1/hubs', headers=headers)
    if not hubs_resp.ok:
        print(f"Error fetching hubs: {hubs_resp.text}")
        return
    
    hubs = hubs_resp.json()['data']
    
    config_folder_name = "00_CONFIGURACION_VISOR"
    attachments_folder_name = "ADJUNTOS_PINES"
    
    found_info = {}

    # Direct search on known Project ID
    target_project_id = "b.ef954d04-cbd2-4995-a8c0-33f182067104"
    print(f"Checking Known Project ID: {target_project_id}")

    # 3. Get Top Folders
    top_folders_url = f'{APS_DATA_URL}/project/v1/projects/{target_project_id}/topFolders'
    top_resp = requests.get(top_folders_url, headers=headers)
    
    if not top_resp.ok:
        print(f"Error fetching top folders for known project: {top_resp.status_code} - {top_resp.text}")
        return
        
    top_folders = top_resp.json()['data']
    for folder in top_folders:
        fname = folder['attributes']['displayName']
        fid = folder['id']
        print(f"  Top Folder: '{fname}' ({fid})")
        
        # Check children
        found = search_folder_recursive(headers, target_project_id, folder['id'], config_folder_name, attachments_folder_name)
        if found:
            print("\n!!! FOUND !!!")
            print(f"PROJECT_ID = '{target_project_id}'")
            print(f"CONFIG_FOLDER_ID = '{found['config_id']}'")
            print(f"ATTACHMENTS_FOLDER_ID = '{found['attachments_id']}'")
            return

def search_folder_recursive(headers, project_id, folder_id, target_name, sub_target_name, depth=0):
    if depth > 3: return None
    indent = "      " * (depth + 1)
    
    url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/folders/{folder_id}/contents'
    resp = requests.get(url, headers=headers)
    if not resp.ok:
        return None
        
    items = resp.json().get('data', [])
    
    # Check for target
    config_folder = next((i for i in items if i['attributes']['displayName'] == target_name and i['type'] == 'folders'), None)
    
    if config_folder:
        print(f"{indent}-> Found TARGET '{target_name}'! ID: {config_folder['id']}")
        
        # Search inside
        sub_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/folders/{config_folder["id"]}/contents'
        sub_resp = requests.get(sub_url, headers=headers)
        attachments_id = None
        
        if sub_resp.ok:
            sub_items = sub_resp.json().get('data', [])
            att_folder = next((i for i in sub_items if i['attributes']['displayName'] == sub_target_name), None)
            if att_folder:
                print(f"{indent}-> Found SUB '{sub_target_name}'! ID: {att_folder['id']}")
                attachments_id = att_folder['id']
            else:
                 print(f"{indent}-> Sub '{sub_target_name}' not found. Needs creation.")
        
        return {
            'config_id': config_folder['id'],
            'attachments_id': attachments_id
        }

    # Dive into 01-BIM if present
    bim_folder = next((i for i in items if i['attributes']['displayName'] == '01-BIM'), None)
    if bim_folder:
        print(f"{indent}-> Found '01-BIM', diving in...")
        return search_folder_recursive(headers, project_id, bim_folder['id'], target_name, sub_target_name, depth+1)
        
    return None

if __name__ == '__main__':
    find_config_folder()
