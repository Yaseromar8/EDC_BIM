"""Consulta las vistas 3D disponibles para el último modelo subido (1_DRENAJE)."""
import os, pathlib, sys, requests
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv() or load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection
from aps import get_internal_token
from routes.inventory import sanitize_urn

# Obtener URN del modelo 1_DRENAJE
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT name, urn, default_view_guid FROM model_config WHERE app_project_id = '1_DRENAJE'")
    row = cur.fetchone()

if not row:
    print("No se encontró modelo en 1_DRENAJE")
    sys.exit(1)

name, urn, configured_guid = row
urn_safe = sanitize_urn(urn)

print(f"\nModelo: {name}")
print(f"URN: ...{urn_safe[-30:]}")
print(f"GUID configurado en DB: {configured_guid or '(ninguno)'}")

# Consultar vistas disponibles en Autodesk
token_result = get_internal_token()
token = token_result[0] if isinstance(token_result, tuple) else token_result

url = f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn_safe}/metadata"
resp = requests.get(url, headers={'Authorization': f'Bearer {token}'})
resp.raise_for_status()

views = resp.json().get('data', {}).get('metadata', [])

print(f"\n{'='*80}")
print(f"  VISTAS DISPONIBLES EN AUTODESK ({len(views)} vistas)")
print(f"{'='*80}")
for v in views:
    is_selected = '>>> SELECCIONADA <<<' if v.get('guid') == configured_guid else ''
    print(f"\n  Nombre: {v.get('name')}")
    print(f"  Role:   {v.get('role')}")
    print(f"  GUID:   {v.get('guid')}")
    if is_selected:
        print(f"  {is_selected}")

print(f"\n{'='*80}\n")
