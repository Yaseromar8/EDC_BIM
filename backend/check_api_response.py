import requests
import json

BASE_URL = "http://localhost:3000"
URN = "proyectos/PQT8_TALARA"

print(f"--- FETCHING ROOT FOR {URN} ---")
r = requests.get(f"{BASE_URL}/api/docs/list?path={URN}&model_urn={URN}")
print(f"Status: {r.status_code}")
data = r.json()
print("FULL JSON RESPONSE:")
print(json.dumps(data, indent=2))
