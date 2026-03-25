import requests
import json

BASE_URL = "http://localhost:3000" # Backend port
URN = "proyectos/PQT8_TALARA"

print(f"--- TESTING API/DOCS/LIST FOR {URN} ---")
try:
    r = requests.get(f"{BASE_URL}/api/docs/list?path={URN}&model_urn={URN}")
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:500]}...")
except Exception as e:
    print(f"Error: {e}")

print(f"\n--- TESTING API/DOCS/RESTORE FOR AN ID (Simulated) ---")
# I'll need a deleted ID to test properly, but I can check if it even hits the route
try:
    r = requests.post(f"{BASE_URL}/api/docs/restore", json={"id": "dummy", "model_urn": URN})
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")
