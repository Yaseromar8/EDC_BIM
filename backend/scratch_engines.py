import sys
sys.path.append('d:/VISOR_APS_TL/backend/civil_app_bundle')
import deploy_app_bundle
token = deploy_app_bundle.get_token()
import requests
engines = []
url = 'https://developer.api.autodesk.com/da/us-east/v3/engines'
while url:
    r_eng = requests.get(url, headers={'Authorization': f'Bearer {token}'}).json()
    engines.extend(r_eng.get('data', []))
    url = f'https://developer.api.autodesk.com/da/us-east/v3/engines?page={r_eng["paginationToken"]}' if r_eng.get('paginationToken') else None
print([e for e in engines if 'civil' in e.lower()])
