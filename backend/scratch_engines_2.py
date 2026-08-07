import sys
sys.path.append('d:/VISOR_APS_TL/backend/civil_app_bundle')
import deploy_app_bundle
token = deploy_app_bundle.get_token()
import requests
import json
engines = []
url = 'https://developer.api.autodesk.com/da/us-east/v3/engines'
r = requests.get(url, headers={'Authorization': f'Bearer {token}'})
if r.status_code == 200:
    for e in r.json().get('data', []):
        engines.append(e)
    # Loop for pagination
    pagination = r.json().get('paginationToken')
    while pagination:
        next_url = f'{url}?paginationToken={pagination}'
        r = requests.get(next_url, headers={'Authorization': f'Bearer {token}'})
        if r.status_code == 200:
            engines.extend(r.json().get('data', []))
            pagination = r.json().get('paginationToken')
        else:
            break
with open('d:/VISOR_APS_TL/backend/engines.json', 'w') as f:
    json.dump(engines, f, indent=2)
