import os
import psycopg2
import json
from dotenv import load_dotenv
import requests

load_dotenv('d:/VISOR_APS_TL/.env')

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/regions/eu/designdata"
APS_AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/v3/token"

def get_token():
    client_id = os.environ.get('APS_CLIENT_ID')
    client_secret = os.environ.get('APS_CLIENT_SECRET')
    resp = requests.post(
        APS_AUTH_URL,
        data={
            'client_id': client_id,
            'client_secret': client_secret,
            'grant_type': 'client_credentials',
            'scope': 'data:read viewables:read'
        }
    )
    return resp.json()['access_token']

try:
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS'),
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', '5432')
    )
    cur = conn.cursor()
    cur.execute("SELECT model_urn FROM inventory_assets LIMIT 1")
    urn = cur.fetchone()[0]
    conn.close()

    print(f"Model URN: {urn}")
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get metadata guid
    m_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata", headers=headers)
    guid = m_resp.json()['data']['metadata'][0]['guid']
    
    # Get hierarchy
    h_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata/{guid}", headers=headers)
    objs = h_resp.json()['data']['objects']
    
    def print_tree(nodes, depth=0, max_depth=4):
        if depth > max_depth: return
        for n in nodes[:3]: # limit to 3 branches
            print("  " * depth + str(n.get('objectid')) + ": " + n.get('name', ''))
            if 'objects' in n:
                print_tree(n['objects'], depth + 1, max_depth)
                
    print_tree(objs)

except Exception as e:
    print(f"Error: {e}")
