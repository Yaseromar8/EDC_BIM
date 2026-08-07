import requests, os
from dotenv import load_dotenv
load_dotenv('d:/VISOR_APS_TL/.env')
token = requests.post('https://developer.api.autodesk.com/authentication/v2/token', data={'client_id': os.environ.get('APS_CLIENT_ID'), 'client_secret': os.environ.get('APS_CLIENT_SECRET'), 'grant_type': 'client_credentials', 'scope': 'code:all'}).json()['access_token']
headers = {'Authorization': f'Bearer {token}'}

url = 'https://developer.api.autodesk.com/da/us-east/v3/engines'
engines = []
while url:
    r = requests.get(url, headers=headers).json()
    engines.extend(r.get('data', []))
    url = f'https://developer.api.autodesk.com/da/us-east/v3/engines?page={r.get("paginationToken")}' if r.get('paginationToken') else None

for e in engines:
    print(e)

