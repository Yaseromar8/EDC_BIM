import os
import requests
from dotenv import load_dotenv
import json

# Force reload of .env to be sure
load_dotenv()

CLIENT_ID = os.getenv('APS_CLIENT_ID')
CLIENT_SECRET = os.getenv('APS_CLIENT_SECRET')

print(f"Using Client ID: {CLIENT_ID}")

def get_token():
    url = "https://developer.api.autodesk.com/authentication/v2/token"
    payload = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'scope': 'data:read'
    }
    resp = requests.post(url, data=payload)
    if resp.status_code != 200:
        print(f"Auth failed: {resp.text}")
        return None
    return resp.json()['access_token']

def get_hubs(token):
    print("\n--- HUBS ---")
    url = "https://developer.api.autodesk.com/project/v1/hubs"
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Hubs failed: {resp.text}")
        return []
    
    data = resp.json().get('data', [])
    for hub in data:
        print(f"Hub Found: {hub['attributes']['name']} (ID: {hub['id']})")
    return data

def get_projects(hub_id, token):
    print(f"\n--- PROJECTS for Hub {hub_id} ---")
    url = f"https://developer.api.autodesk.com/project/v1/hubs/{hub_id}/projects"
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Projects failed: {resp.text}")
        return
        
    data = resp.json().get('data', [])
    
    found_target = False
    print(f"Total Projects found: {len(data)}")
    
    for proj in data:
        name = proj['attributes']['name']
        print(f" - {name}")
        if "PQT8" in name or "DRENAJE" in name:
            found_target = True
            
    print("\n--------------------------------")
    if found_target:
        print("✅ SUCCESS: Project with 'PQT8' or 'DRENAJE' was FOUND.")
    else:
        print("❌ FAILURE: Project 'PQT8' NOT FOUND in the list.")
        print("Possible reasons:")
        print("1. The integration '3FkE...' is not added to the specific project (if required).")
        print("2. The user authorized is different from the project owner.")
        print("3. The project does not have 'Docs' service active.")

if __name__ == "__main__":
    t = get_token()
    if t:
        hubs = get_hubs(t)
        if hubs:
            # Check the first hub (usually the main account)
            get_projects(hubs[0]['id'], t)
        else:
            print("No hubs found.")
