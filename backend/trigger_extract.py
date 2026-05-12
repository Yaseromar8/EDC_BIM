import requests

url = 'http://localhost:3000/api/inventory/extract'
r = requests.get('http://localhost:3000/api/inventory/models')
models = r.json()
target = next((m for m in models if 'SCL_SOLIDOS_CANAL' in m['name']), None)
if target:
    print(f"Found model: {target['name']} (ID: {target['id']})")
    print("Triggering extraction...")
    res = requests.post(url, json={'urn': target['urn'], 'model_id': target['id']})
    print(res.json())
else:
    print('Model not found.')
