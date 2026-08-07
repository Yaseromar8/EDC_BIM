import requests, time, json
from deploy_app_bundle import get_token

token = get_token()
print(f"Token acquired.")
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

wi_payload = {
    "activityId": "3FkEfzdEFMWEm7GBX6TwViAUGR0bQHhydG36781PQoBNvHAS.ExtractSectionsActivity+prod",
    "arguments": {
        "HostDwg": {
            "url": "urn:adsk.wipprod:fs.file:vf.zV8NKSjsT4qqLKCjeRmiHA?version=30",
            "headers": {
                "Authorization": f"Bearer {token}"
            }
        },
        "Result": {
            "verb": "put",
            "url": "https://developer.api.autodesk.com/oss/v2/buckets/civil-results/objects/test_sections_dump.json",
            "headers": {
                "Authorization": f"Bearer {token}"
            }
        }
    }
}

print("Starting WorkItem...")
url = "https://developer.api.autodesk.com/da/us-east/v3/workitems"
resp = requests.post(url, headers=headers, json=wi_payload)
wi_data = resp.json()
wi_id = wi_data.get("id")
print(f"WorkItem ID: {wi_id}")

if not wi_id:
    print(wi_data)
    exit(1)

while True:
    time.sleep(5)
    s_resp = requests.get(f"{url}/{wi_id}", headers=headers)
    s_data = s_resp.json()
    status = s_data.get("status")
    print(f"Status: {status}")
    if status in ['success', 'failed', 'successWithErrors']:
        print(f"Report URL: {s_data.get('reportUrl')}")
        report_url = s_data.get('reportUrl')
        if report_url:
            report_txt = requests.get(report_url).text
            print("--- REPORT (Last 3000 chars) ---")
            print(report_txt[-3000:])
        break
