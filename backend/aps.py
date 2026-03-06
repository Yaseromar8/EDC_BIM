
import os
import time
import requests
from cachelib import SimpleCache

# APS API settings
APS_CLIENT_ID = os.getenv('APS_CLIENT_ID')
APS_CLIENT_SECRET = os.getenv('APS_CLIENT_SECRET')
APS_AUTH_URL = os.getenv('APS_AUTH_URL', 'https://developer.api.autodesk.com/authentication/v2/token')
APS_DATA_URL = os.getenv('APS_DATA_URL', 'https://developer.api.autodesk.com')
APS_SCOPES = ['data:read', 'data:write', 'data:create', 'bucket:read', 'bucket:create', 'bucket:delete', 'account:read']

# Cache for API responses
cache = SimpleCache()

def get_internal_token():
    """Gets a 2-legged token for internal server-to-server calls."""
    token = cache.get('internal_token')
    if token is None:
        try:
            response = requests.post(
                APS_AUTH_URL,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                data={
                    'client_id': APS_CLIENT_ID,
                    'client_secret': APS_CLIENT_SECRET,
                    'grant_type': 'client_credentials',
                    'scope': ' '.join(APS_SCOPES)
                }
            )
            response.raise_for_status()
            token_data = response.json()
            token = token_data['access_token']
            # Safety buffer: expire the token from cache 5 minutes BEFORE it actually expires on Autodesk's side
            # This prevents sending a dying token to the frontend Viewer.
            safe_timeout = max(60, int(token_data.get('expires_in', 3599)) - 300)
            cache.set('internal_token', token, timeout=safe_timeout)
        except requests.exceptions.RequestException as e:
            if 'response' in locals() and response is not None:
                print(f"APS Token Error: {response.status_code} - {response.text}")
            print(f"APS Token Request Exception: {e}")
            return None, str(e)
    return token, None

def get_api_data(endpoint, token):
    """Makes a GET request to the APS API and caches the response."""
    data = cache.get(endpoint)
    if data is None:
        try:
            response = requests.get(f'{APS_DATA_URL}/{endpoint}', headers={'Authorization': f'Bearer {token}'})
            response.raise_for_status()
            data = response.json()
            cache.set(endpoint, data, timeout=30)  # Cache for 30 seconds
        except requests.exceptions.RequestException as e:
            return None, str(e)
    return data, None
