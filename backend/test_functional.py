import requests
import json

BASE_URL = "http://localhost:3000"
URN = "proyectos/PQT8_TALARA"

print(f"--- TESTING FOLDER CREATION AT ROOT FOR {URN} ---")
payload = {
    "path": f"{URN}/API_TEST_FOLDER/",
    "model_urn": URN,
    "user": "Antigravity Diagnostic"
}

try:
    r = requests.post(f"{BASE_URL}/api/docs/folder", json=payload)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")

print(f"\n--- TESTING FOLDER LISTING TO VERIFY VISIBILITY ---")
try:
    r = requests.get(f"{BASE_URL}/api/docs/list?path={URN}&model_urn={URN}")
    print(f"Status: {r.status_code}")
    data = r.json()
    if data.get('success'):
        folders = [f['name'] for f in data['data']['folders']]
        print(f"Folders found: {folders}")
        if "API_TEST_FOLDER" in folders:
            print("SUCCESS: API_TEST_FOLDER is visible!")
        else:
            print("FAILURE: API_TEST_FOLDER is NOT visible in listing.")
    else:
        print(f"Listing failed: {data.get('error')}")
except Exception as e:
    print(f"Error during listing check: {e}")
