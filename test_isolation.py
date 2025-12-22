import requests
import json
import time

BASE_URL = "http://localhost:3000"

def log(msg):
    with open("test_results.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)

def test_isolation():
    open("test_results.log", "w").close() # Clear file
    log("--- STARTING ISOLATION TEST ---")
    
    # 1. Create Pin A in PROJ_A
    pin_a_payload = {
        "name": "Pin A",
        "x": 10, "y": 10, "z": 0,
        "projectId": "PROJ_A",
        "type": "issue"
    }
    log(f"Creating Pin A in PROJ_A...")
    res = requests.post(f"{BASE_URL}/api/pins", json=pin_a_payload)
    if res.status_code not in [200, 201]:
        log(f"FAILED to create Pin A (Status: {res.status_code}): {res.text}")
        return
    pin_a = res.json()
    log(f"Created Pin A: {pin_a['id']} (Status: {res.status_code})")
    
    # 2. Check PROJ_A (Should see Pin A)
    log("Checking PROJ_A...")
    res = requests.get(f"{BASE_URL}/api/pins?project=PROJ_A")
    pins_a = res.json()
    found_a = any(p['id'] == pin_a['id'] for p in pins_a)
    log(f"Pin A visible in PROJ_A? {found_a}")
    
    # 3. Check PROJ_B (Should NOT see Pin A)
    log("Checking PROJ_B...")
    res = requests.get(f"{BASE_URL}/api/pins?project=PROJ_B")
    pins_b = res.json()
    found_a_in_b = any(p['id'] == pin_a['id'] for p in pins_b)
    log(f"Pin A visible in PROJ_B? {found_a_in_b}")
    
    if found_a_in_b:
        leaked_pin = next(p for p in pins_b if p['id'] == pin_a['id'])
        log(f"CRITICAL FAIL: Pin A leaked into PROJ_B. Leaked Pin Data: {json.dumps(leaked_pin)}")
    else:
        log("PASS: Pin A hidden from PROJ_B")

    # 4. Create Pin B in PROJ_B
    pin_b_payload = {
        "name": "Pin B",
        "x": 20, "y": 20, "z": 0,
        "projectId": "PROJ_B",
        "type": "issue"
    }
    log(f"Creating Pin B in PROJ_B...")
    res = requests.post(f"{BASE_URL}/api/pins", json=pin_b_payload)
    pin_b = res.json()
    
    # 5. Check PROJ_A (Should NOT see Pin B)
    log("Checking PROJ_A for Pin B...")
    res = requests.get(f"{BASE_URL}/api/pins?project=PROJ_A")
    pins_a = res.json()
    found_b_in_a = any(p['id'] == pin_b['id'] for p in pins_a)
    log(f"Pin B visible in PROJ_A? {found_b_in_a}")

    if found_b_in_a:
         log("CRITICAL FAIL: Pin B leaked into PROJ_A")
    else:
         log("PASS: Pin B hidden from PROJ_A")
         
    # 6. Delete Pin A
    log(f"Deleting Pin A ({pin_a['id']})...")
    requests.delete(f"{BASE_URL}/api/pins/{pin_a['id']}")
    
    # 7. Verify Deletion
    res = requests.get(f"{BASE_URL}/api/pins?project=PROJ_A")
    pins_a = res.json()
    found_a = any(p['id'] == pin_a['id'] for p in pins_a)
    log(f"Pin A still in PROJ_A? {found_a}")
    
    # 8. Verify Pin B persists in PROJ_B
    res = requests.get(f"{BASE_URL}/api/pins?project=PROJ_B")
    pins_b = res.json()
    found_b = any(p['id'] == pin_b['id'] for p in pins_b)
    log(f"Pin B still in PROJ_B? {found_b}")
    
    # Cleanup Pin B
    requests.delete(f"{BASE_URL}/api/pins/{pin_b['id']}")
    log("--- TEST COMPLETE ---")

if __name__ == "__main__":
    try:
        test_isolation()
    except Exception as e:
        print(f"Test Error: {e}")
