import requests
import json
import sys
try:
    import server
    token, _ = server.get_internal_token()
    resp = requests.get('https://developer.api.autodesk.com/da/us-east/v3/workitems/8b40c0e0a310401c817f3ad1f53e88c7', headers={'Authorization': 'Bearer ' + token})
    report_url = resp.json().get('reportUrl')
    if report_url:
        print(requests.get(report_url).text)
    else:
        print("No reportUrl found:", resp.text)
except Exception as e:
    print(e)
