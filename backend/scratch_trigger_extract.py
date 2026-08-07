import requests
import time
import sys

URL = "http://localhost:3000/api/civil/extract-sections-test"
payload = {
    "urn": "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmpqRjVaclBmUURDMk52X1dueW1UN0E_dmVyc2lvbj0x",
    "project_id": "b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f"
}

print("Starting extraction...")
try:
    resp = requests.post(URL, json=payload)
    resp.raise_for_status()
    data = resp.json()
    workitem_id = data.get('workitem_id')
    print("WorkItem ID:", workitem_id)
except Exception as e:
    print("Failed to start extraction:", e)
    sys.exit(1)

status_url = f"http://localhost:3000/api/civil/extract-sections-status/{workitem_id}"
print("Polling status...")
while True:
    try:
        s_resp = requests.get(status_url)
        s_data = s_resp.json()
        status = s_data.get('status')
        print("Status:", status)
        if status in ['success', 'failed', 'successWithErrors']:
            break
        time.sleep(5)
    except Exception as e:
        print("Polling error:", e)
        time.sleep(5)

if status == 'failed':
    print("Extraction failed!")
    print(s_data)
    sys.exit(1)

result_url = s_data.get('resultUrl')
if result_url:
    print("Result URL obtained. Downloading JSON...")
    r_resp = requests.get(result_url)
    r_data = r_resp.json()
    print("Warnings:")
    for w in r_data.get('warnings', []):
        print(w)
else:
    print("No result URL!")
