
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

# El navegador necesita saber CUANTO le queda al token que recibe, no cuanto
# duraba cuando se pidio. Guardamos su instante de caducidad junto al token,
# bajo la misma clave con este sufijo y el mismo TTL, para poder responder con
# la vida RESTANTE real.
SUFIJO_CADUCA = ':caduca'

# Por debajo de este margen no se entrega el token cacheado: se pide uno nuevo.
# Coincide a proposito con el recorte del TTL de `_pedir_token`, asi que un
# token servido desde cache siempre llega con al menos este margen.
MARGEN_SEGURIDAD_S = 300

CLAVE_VISOR = 'viewer_token'


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
        vida = int(token_data.get('expires_in', 3599))
        safe_timeout = max(60, vida - MARGEN_SEGURIDAD_S)
        cache.set(clave_cache, token, timeout=safe_timeout)
        # Mismo TTL que el token: los dos entran y salen del cache a la vez.
        cache.set(clave_cache + SUFIJO_CADUCA, time.time() + vida, timeout=safe_timeout)
        return token, None
    except requests.exceptions.RequestException as e:
        if response is not None:
            print(f"APS Token Error: {response.status_code} - {response.text}")
        print(f"APS Token Request Exception: {e}")
        return None, str(e)


def get_internal_token():
    """Token 2-legged con permisos completos. SOLO para uso servidor-servidor."""
    return _pedir_token(APS_SCOPES, 'internal_token')


def _vida_restante(clave_cache):
    """Segundos que le quedan de verdad al token cacheado, o None si no consta."""
    caduca = cache.get(clave_cache + SUFIJO_CADUCA)
    if caduca is None:
        return None
    return caduca - time.time()


def get_public_viewer_token():
    """Token 2-legged de solo lectura con su vida RESTANTE real.

    Devuelve `(token, restante_s, error)`. Es el unico token que puede salir al
    navegador, y el Viewer de Autodesk decide cuando pedir otro a partir del
    numero que le demos: por eso el contrato es que `restante_s` NUNCA sea
    mayor que lo que le queda de verdad al token entregado.

    Antes se devolvia el token cacheado sin decir nada de su caducidad, y el
    visor declaraba 3600 s fijos. Un token servido en el minuto 54 del ciclo de
    cache llegaba con ~5 minutos de vida y el visor no volvia a preguntar hasta
    los 3595 s: el modelo dejaba de cargar con un 401 y sin mensaje.
    """
    token, error = _pedir_token(APS_VIEWER_SCOPES, CLAVE_VISOR)
    if error:
        return None, None, error
    restante = _vida_restante(CLAVE_VISOR)
    if restante is None or restante < MARGEN_SEGURIDAD_S:
        # Agonizando, o sin registro de caducidad (token de un proceso anterior
        # a este cambio). No se puede prometer nada: se pide uno nuevo.
        cache.delete(CLAVE_VISOR)
        cache.delete(CLAVE_VISOR + SUFIJO_CADUCA)
        token, error = _pedir_token(APS_VIEWER_SCOPES, CLAVE_VISOR)
        if error:
            return None, None, error
        restante = _vida_restante(CLAVE_VISOR)
        if restante is None:
            return None, None, 'el token llego sin caducidad'
    return token, int(restante), None

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
