
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

# Permisos MINIMOS para que el Viewer cargue un modelo ya traducido. Este es el
# unico token que sale del backend hacia un navegador, y /api/token es publico
# porque las vistas compartidas por enlace no tienen sesion. Con los scopes
# completos, cualquiera en internet obtenia una credencial de ~1 hora capaz de
# escribir y BORRAR en los buckets del proyecto y de leer datos de la cuenta
# Autodesk. Leer no basta para eso.
APS_VIEWER_SCOPES = ['data:read', 'viewables:read']

# Cache for API responses
cache = SimpleCache()


def _pedir_token(scopes, clave_cache):
    """Pide un token 2-legged con esos permisos y lo cachea."""
    token = cache.get(clave_cache)
    if token is not None:
        return token, None
    response = None
    try:
        response = requests.post(
            APS_AUTH_URL,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            data={
                'client_id': APS_CLIENT_ID,
                'client_secret': APS_CLIENT_SECRET,
                'grant_type': 'client_credentials',
                'scope': ' '.join(scopes)
            }
        )
        response.raise_for_status()
        token_data = response.json()
        token = token_data['access_token']
        # Margen de seguridad: sacarlo del cache 5 minutos ANTES de que caduque
        # en Autodesk, para no mandarle al Viewer un token agonizando.
        safe_timeout = max(60, int(token_data.get('expires_in', 3599)) - 300)
        cache.set(clave_cache, token, timeout=safe_timeout)
        return token, None
    except requests.exceptions.RequestException as e:
        if response is not None:
            print(f"APS Token Error: {response.status_code} - {response.text}")
        print(f"APS Token Request Exception: {e}")
        return None, str(e)


def get_internal_token():
    """Token 2-legged con permisos completos. SOLO para uso servidor-servidor."""
    return _pedir_token(APS_SCOPES, 'internal_token')


def get_public_viewer_token():
    """Token 2-legged de solo lectura. Es el unico que puede salir al navegador."""
    return _pedir_token(APS_VIEWER_SCOPES, 'viewer_token')

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
