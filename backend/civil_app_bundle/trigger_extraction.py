import requests
import time

urn = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnpWOE5LU2pzVDRxcUxLQ2plUm1pSEE_dmVyc2lvbj0zMA"
url = f"http://localhost:3000/api/civil/extract-sections?urn={urn}&object_name=alignment_result.json"

print(f"Triggering extraction: {url}")
resp = requests.post(url)
data = resp.json()
workitem_id = data.get('workitem_id')
print(f"WorkItem ID: {workitem_id}")

if not workitem_id:
    exit(1)

# Poll for status
status_url = f"http://localhost:3000/api/civil/workitem-status/{workitem_id}"
while True:
    time.sleep(5)
    s_resp = requests.get(status_url)
    if s_resp.status_code == 200:
        s_data = s_resp.json()
        status = s_data.get('status')
        print(f"Status: {status}")
        if status in ['success', 'failed', 'successWithErrors']:
            print(f"Report URL: {s_data.get('reportUrl')}")
            break
