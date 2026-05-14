import requests, json

url = 'https://visor-ecd-backend.onrender.com/api/project-pins?model_urn=1_CANAL'
headers = {'Authorization': 'Bearer DEMO_TOKEN'}
r = requests.get(url, headers=headers, timeout=15)
data = r.json()
for foto in data.get('fotos', []):
    print(f"Pin {foto['id']}:")
    photos = foto.get('photos', [])
    print(f"  Photos count: {len(photos)}")
    for p in photos:
        print(f"    Photo: {p.get('desc', 'N/A')}")
        print(f"    src: {p.get('src', 'MISSING')}")
        print(f"    url: {p.get('url', 'MISSING')}")
        print(f"    fullPath: {p.get('fullPath', 'MISSING')}")
