import requests
import os
from dotenv import load_dotenv

load_dotenv('d:/VISOR_APS_TL/.env')
url = 'https://developer.api.autodesk.com/authentication/v2/token'
data = {
    'client_id': os.environ.get('APS_CLIENT_ID'),
    'client_secret': os.environ.get('APS_CLIENT_SECRET'),
    'grant_type': 'client_credentials',
    'scope': 'code:all'
}
t = requests.post(url, data=data).json()['access_token']

da_url = 'https://developer.api.autodesk.com/da/us-east/v3/engines'
eng = []
while da_url:
    r = requests.get(da_url, headers={'Authorization': 'Bearer ' + t}).json()
    eng.extend(r.get('data', []))
    da_url = f"https://developer.api.autodesk.com/da/us-east/v3/engines?page={r['paginationToken']}" if r.get('paginationToken') else None

print("All engines:")
for e in eng:
    print(e)
