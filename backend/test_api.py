"""Check the model manifest to determine SVF vs SVF2."""
import os, sys, requests, json
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv; load_dotenv()
from aps import get_internal_token
from routes.inventory import sanitize_urn

urn = sanitize_urn('dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnViMnhmakRpUkJ5YW1rTXp2Q0Q3emc_dmVyc2lvbj0yMw')

token_result = get_internal_token()
if isinstance(token_result, tuple):
    token = token_result[0]
else:
    token = token_result

headers = {'Authorization': f'Bearer {token}'}

# Get manifest
resp = requests.get(f'https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest', headers=headers)
resp.raise_for_status()
manifest = resp.json()

print(f"URN: {manifest.get('urn', '?')[:60]}...")
print(f"Type: {manifest.get('type')}")
print(f"Status: {manifest.get('status')}")
print(f"Region: {manifest.get('region')}")
print(f"\nDerivatives:")
for d in manifest.get('derivatives', []):
    output_type = d.get('outputType')
    status = d.get('status')
    print(f"  outputType={output_type} status={status}")
    for child in d.get('children', []):
        role = child.get('role')
        mime = child.get('mime')
        urn_c = child.get('urn', '')[:60]
        print(f"    role={role} mime={mime} urn={urn_c}...")
