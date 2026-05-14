import requests

# Test the EXACT endpoint the frontend would call
url = 'https://visor-ecd-backend.onrender.com/api/project-pins?model_urn=1_CANAL'
headers = {'Authorization': 'Bearer DEMO_TOKEN'}
try:
    r = requests.get(url, headers=headers, timeout=15)
    print('STATUS:', r.status_code)
    print('BODY:', r.text[:2000])
except Exception as e:
    print('ERROR:', e)
