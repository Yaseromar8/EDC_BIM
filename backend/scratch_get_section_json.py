import os
import sys
import io
import json
import requests
from dotenv import load_dotenv
import pathlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
load_dotenv(pathlib.Path(r'd:\VISOR_APS_TL\.env'))

sys.path.append(r'd:\VISOR_APS_TL\backend')
from routes.digital_twin import get_app_bucket_key
from aps import get_internal_token

token, err = get_internal_token()
if err:
    print("Error getting token:", err)
    sys.exit(1)

bucket = get_app_bucket_key()
url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects"
headers = {'Authorization': f'Bearer {token}'}

resp = requests.get(url, headers=headers)
if resp.status_code != 200:
    print("Error listing objects:", resp.text)
    sys.exit(1)

objects = resp.json().get('items', [])
print(f"Total objects in bucket: {len(objects)}")
for obj in objects:
    if obj['objectKey'].startswith('section_result_') or obj['objectKey'].startswith('alignment_result_'):
        print(f"{obj['objectKey']} - Size: {obj['size']} bytes")

section_results = [obj for obj in objects if obj['objectKey'].startswith('section_result_') or obj['objectKey'].startswith('alignment_result_')]

obj = [o for o in objects if o['objectKey'] == 'section_result_b38e68226f5042fcb1754e1b31bc6864.json'][0]
resp2 = requests.post(f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{obj['objectKey']}/signeds3download", headers=headers, json={"minutesExpiration": 5})
if resp2.status_code != 200:
    resp2 = requests.get(f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{obj['objectKey']}", headers=headers)
    try:
        data = resp2.json()
    except:
        data = resp2.content
else:
    url2 = resp2.json().get('url')
    print(f"Signed URL: {url2}")
    dl_resp = requests.get(url2)
    try:
        data = dl_resp.json()
    except:
        print("Failed to parse JSON, printing text:")
        print(dl_resp.text[:1000])
        sys.exit(1)
    
print(f"Type of data: {type(data)}")
if isinstance(data, dict):
    print(f"Keys: {data.keys()}")
elif isinstance(data, list):
    print(f"List length: {len(data)}")
print(f"Data preview: {str(data)[:500]}")
