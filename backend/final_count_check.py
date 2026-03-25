import requests
import json

URL = "http://127.0.0.1:3000/api/docs/list?path=proyectos/PQT8_TALARA&model_urn=proyectos/PQT8_TALARA"

try:
    resp = requests.get(URL)
    data = resp.json()
    folders = data.get('data', {}).get('folders', [])
    current_node_id = data.get('data', {}).get('current_node_id')
    
    print(f"Status Code: {resp.status_code}")
    print(f"Current Node ID (Root): {current_node_id}")
    print(f"Total Folders Found: {len(folders)}")
    
    # List first 3 folder names
    for f in folders[:3]:
        print(f" - {f['name']}")
        
except Exception as e:
    print(f"Error: {e}")
