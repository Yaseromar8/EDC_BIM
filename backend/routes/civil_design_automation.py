import os
import time
import uuid
import requests
from flask import Blueprint, request, jsonify, send_file, Response

civil_da_bp = Blueprint('civil_da_bp', __name__)

# Global dictionary to store uploadKeys for OSS v2 signeds3upload completion
# Key: workitem_id, Value: uploadKey
UPLOAD_KEYS = {}
RESULT_OBJECTS = {}

# Configuración básica de APS (Deben estar en variables de entorno)
APS_CLIENT_ID = os.environ.get('APS_CLIENT_ID', 'TU_CLIENT_ID')
APS_CLIENT_SECRET = os.environ.get('APS_CLIENT_SECRET', 'TU_CLIENT_SECRET')
APS_BASE_URL = 'https://developer.api.autodesk.com'

def get_int_env(name, default):
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default

DA_LIMIT_PROCESSING_TIME_SEC = get_int_env('APS_DA_LIMIT_PROCESSING_TIME_SEC', 3500)
DA_SIGNED_URL_EXPIRATION_MIN = get_int_env('APS_DA_SIGNED_URL_EXPIRATION_MIN', 120)

def get_internal_token():
    """Obtiene un token de 2-legged para interactuar con Design Automation."""
    url = f"{APS_BASE_URL}/authentication/v2/token"
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'client_id': APS_CLIENT_ID,
        'client_secret': APS_CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'scope': 'code:all data:write data:read bucket:create bucket:read'
    }
    resp = requests.post(url, headers=headers, data=data)
    if resp.status_code == 200:
        return resp.json().get('access_token')
    raise Exception("No se pudo obtener el token de APS")

def get_3legged_token():
    """Obtiene el token de usuario (3-legged) de la base de datos."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT access_token FROM app_tokens WHERE id = %s', ('autodesk_app_tokens',))
                row = cursor.fetchone()
                if row:
                    return row[0]
    except Exception as e:
        print(f"[Design Automation] Error reading 3-legged token: {e}")
    return None

def create_signed_result_upload(token, object_name):
    from routes.digital_twin import get_app_bucket_key
    my_bucket = get_app_bucket_key()
    out_sign_url = f"{APS_BASE_URL}/oss/v2/buckets/{my_bucket}/objects/{object_name}/signeds3upload?minutesExpiration={DA_SIGNED_URL_EXPIRATION_MIN}"

    out_sign_resp = requests.get(
        out_sign_url,
        headers={'Authorization': f'Bearer {token}'}
    )

    if not out_sign_resp.ok and DA_SIGNED_URL_EXPIRATION_MIN != 60:
        fallback_sign_url = f"{APS_BASE_URL}/oss/v2/buckets/{my_bucket}/objects/{object_name}/signeds3upload?minutesExpiration=60"
        out_sign_resp = requests.get(
            fallback_sign_url,
            headers={'Authorization': f'Bearer {token}'}
        )

    if not out_sign_resp.ok:
        requests.post(
            f"{APS_BASE_URL}/oss/v2/buckets",
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json={'bucketKey': my_bucket, 'policyKey': 'transient'}
        )
        out_sign_resp = requests.get(out_sign_url, headers={'Authorization': f'Bearer {token}'})
        if not out_sign_resp.ok and DA_SIGNED_URL_EXPIRATION_MIN != 60:
            fallback_sign_url = f"{APS_BASE_URL}/oss/v2/buckets/{my_bucket}/objects/{object_name}/signeds3upload?minutesExpiration=60"
            out_sign_resp = requests.get(fallback_sign_url, headers={'Authorization': f'Bearer {token}'})

    if out_sign_resp.ok:
        signed_data = out_sign_resp.json()
        return signed_data.get('urls', [None])[0], signed_data.get('uploadKey')

    return f"{APS_BASE_URL}/oss/v2/buckets/{my_bucket}/objects/{object_name}", None

@civil_da_bp.route('/api/civil/extract-alignment', methods=['POST'])
@civil_da_bp.route('/api/civil/extract-curves', methods=['POST'])
def extract_alignment():
    """
    Endpoint maestro que orquesta la Ruta 3 (Design Automation).
    Espera un JSON en el body con:
    {
      "urn": "urn:adsk.objects:os.object:bucket_name/file_name.dwg"
    }
    /api/civil/extract-curves es un alias explicito para la funcion de UI
    que extrae tangentes, arcos y espirales del alineamiento Civil 3D.
    """
    try:
        data = request.json
        urn = data.get('urn')
        project_id = data.get('project_id')
        input_url = data.get('input_url')
        output_url = data.get('output_url')
        result_object_name = f"alignment_result_{uuid.uuid4().hex}.json"
        
        with open('da_debug.txt', 'a') as f:
            f.write(f"--- NUEVO REQUEST ---\n")
            f.write(f"URN original: {urn}\n")
            f.write(f"Project ID: {project_id}\n")

        token = get_internal_token()
        error_reason = "Unknown error"
        upload_key = None
        if urn and not input_url:
            import base64
            import urllib.parse
            
            decoded_urn = urn
            try:
                if not urn.startswith('urn:'):
                    padding = '=' * (-len(urn) % 4)
                    decoded_urn = base64.urlsafe_b64decode(urn + padding).decode('utf-8')
            except Exception as e:
                print(f"[Design Automation] Error decoding URN: {e}")
                pass
                
            if decoded_urn.startswith('urn:adsk.objects:os.object:'):
                parts = decoded_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                bucket = parts[0]
                obj = '/'.join(parts[1:])
                safe_obj = urllib.parse.quote(obj, safe='')
                input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}"
                output_url, upload_key = create_signed_result_upload(token, result_object_name)
            elif decoded_urn.startswith('urn:adsk.wipprod:fs.file:vf') and project_id:
                # Si es de ACC, obtener la URL de storage para DA
                # ACC projects normally require the "b." prefix for data management queries, ensure it's there
                if not project_id.startswith('b.'):
                    project_id = 'b.' + project_id
                
                token_3legged = get_3legged_token() or token
                
                # Autodesks bizarre API requires the ?version=3 to allow 2-legged tokens
                clean_version_urn = decoded_urn

                
                safe_version_id = urllib.parse.quote(clean_version_urn, safe='')
                version_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{safe_version_id}"
                
                v_resp = requests.get(version_url, headers={'Authorization': f'Bearer {token_3legged}'})
                storage_urn = None
                if v_resp.ok:
                    v_data = v_resp.json()
                    storage_urn = v_data.get('data', {}).get('relationships', {}).get('storage', {}).get('data', {}).get('id')
                else:
                    error_reason = f"Error al obtener version de ACC: {v_resp.status_code} - {v_resp.text}"
                    print(f"[Design Automation] {error_reason}")
                
                if storage_urn:
                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        
                        # Generate a signed S3 download URL for Design Automation to avoid token issues
                        safe_obj = urllib.parse.quote(obj, safe='')
                        sign_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration={DA_SIGNED_URL_EXPIRATION_MIN}"
                        sign_resp = requests.get(
                            sign_url,
                            headers={'Authorization': f'Bearer {token_3legged}'}
                        )
                        if not sign_resp.ok and DA_SIGNED_URL_EXPIRATION_MIN != 60:
                            fallback_sign_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration=60"
                            sign_resp = requests.get(
                                fallback_sign_url,
                                headers={'Authorization': f'Bearer {token_3legged}'}
                            )
                        if sign_resp.ok:
                            input_url = sign_resp.json().get('url')
                        else:
                            # Fallback to direct OSS url if signed URL fails
                            input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}"
                        
                        output_url, upload_key = create_signed_result_upload(token, result_object_name)
                    else:
                        error_reason = f"Storage URN no soportado: {storage_urn}"
                else:
                    if not error_reason:
                        error_reason = "Storage URN no encontrado"
            else:
                error_reason = f"El URN decodificado no es de un bucket OSS estándar o falta project_id: {decoded_urn} (project_id: {project_id})"
                with open('da_debug.txt', 'a') as f: f.write(f"{error_reason}\\n")
                print(f"[Design Automation] {error_reason}")

        if not input_url or not output_url:
            with open('da_debug.txt', 'a') as f: f.write(f"Failed to generate URLs. Input: {input_url}, Output: {output_url}\\n")
            print(f"[Design Automation] Error: input_url no se pudo generar para el urn: {urn}")
            return jsonify({"error": f"Falta URN o input_url/output_url válidos. Detalle: {error_reason}"}), 400

        token = get_internal_token()
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

        # The activity ID deployed earlier
        # Alias is 'prod', Activity name is 'ExtractAlignmentActivity'
        activity_id = f"{APS_CLIENT_ID}.ExtractAlignmentActivity+prod"

        # Determine which token to use for downloading the file. BIM 360 files usually require 3-legged.
        download_token = get_3legged_token() if (project_id and 'wip.dm.prod' in input_url) else token

        
        # If input_url is a signed S3 url, it doesn't need an Authorization header.
        # It's an AWS URL if it contains 's3.amazonaws.com'
        host_dwg_arg = { "url": input_url }
        if 'amazonaws.com' not in input_url:
            host_dwg_arg["headers"] = { "Authorization": f"Bearer {download_token}" }
            
        result_arg = { "verb": "put", "url": output_url }
        if 'amazonaws.com' not in output_url:
            result_arg["headers"] = { "Authorization": f"Bearer {token}" }

        workitem_payload = {
            "activityId": activity_id,
            "limitProcessingTimeSec": DA_LIMIT_PROCESSING_TIME_SEC,
            "arguments": {
                "HostDwg": host_dwg_arg,
                "Result": result_arg
            }
        }
        
        # Iniciar WorkItem
        da_url = f"{APS_BASE_URL}/da/us-east/v3/workitems"
        resp = requests.post(da_url, headers=headers, json=workitem_payload)
        
        if resp.status_code not in [200, 201]:
            with open('da_debug.txt', 'a') as f:
                f.write(f"DA API Error: {resp.status_code} - {resp.text}\n")
            print(f"[Design Automation] Error iniciando WorkItem: {resp.status_code} - {resp.text}")
            return jsonify({"error": "Falló al iniciar WorkItem", "details": resp.text}), 500
            
        wi_data = resp.json()
        workitem_id = wi_data.get('id')
        
        # Save upload_key if we have one, so we can complete it later
        if upload_key:
            UPLOAD_KEYS[workitem_id] = upload_key
        RESULT_OBJECTS[workitem_id] = result_object_name

        return jsonify({
            "status": "In Progress",
            "message": "WorkItem enviado a la nube de Civil 3D exitosamente.",
            "workitem_id": workitem_id,
            "result_object": result_object_name
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@civil_da_bp.route('/api/civil/extract-sections-test', methods=['POST'])
def extract_sections_test():
    """
    Endpoint experimental aislado para probar la extracción de secciones transversales
    y volúmenes desde Civil 3D, sin afectar el pipeline de alineamientos principal.
    """
    try:
        data = request.json
        urn = data.get('urn')
        project_id = data.get('project_id')
        input_url = data.get('input_url')
        output_url = data.get('output_url')

        # Archivos vinculados de Docs (urn wipprod) necesitan el project ACC.
        # Si el navegador no lo tiene (archivo elegido desde la BD), lo buscamos
        # en la extracción de alineamientos guardada.
        if urn and not project_id and not input_url:
            try:
                from db import get_db_connection
                with get_db_connection() as _conn:
                    _cur = _conn.cursor()
                    _cur.execute("""
                        SELECT acc_project_id FROM civil_alignments
                        WHERE urn = %s AND acc_project_id IS NOT NULL
                        ORDER BY updated_at DESC LIMIT 1
                    """, (urn,))
                    _row = _cur.fetchone()
                    if _row and _row[0]:
                        project_id = _row[0]
            except Exception:
                pass

        # Usamos un nombre diferente para no chocar con los JSONs de curvas
        result_object_name = f"section_result_{uuid.uuid4().hex}.json"
        
        with open('da_debug_sections.txt', 'a') as f:
            f.write(f"--- NUEVO REQUEST SECCIONES ---\n")
            f.write(f"URN original: {urn}\n")
            f.write(f"Project ID: {project_id}\n")

        token = get_internal_token()
        error_reason = "Unknown error"
        upload_key = None

        if urn and not input_url:
            import base64
            import urllib.parse
            
            decoded_urn = urn
            try:
                if not urn.startswith('urn:'):
                    padding = '=' * (-len(urn) % 4)
                    decoded_urn = base64.urlsafe_b64decode(urn + padding).decode('utf-8')
            except Exception:
                pass
                
            if decoded_urn.startswith('urn:adsk.objects:os.object:'):
                parts = decoded_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                bucket = parts[0]
                obj = '/'.join(parts[1:])
                safe_obj = urllib.parse.quote(obj, safe='')
                input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}"
                output_url, upload_key = create_signed_result_upload(token, result_object_name)
            elif decoded_urn.startswith('urn:adsk.wipprod:fs.file:vf') and project_id:
                if not project_id.startswith('b.'):
                    project_id = 'b.' + project_id
                
                token_3legged = get_3legged_token() or token
                clean_version_urn = decoded_urn
                safe_version_id = urllib.parse.quote(clean_version_urn, safe='')
                version_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{safe_version_id}"
                
                v_resp = requests.get(version_url, headers={'Authorization': f'Bearer {token_3legged}'})
                storage_urn = None
                if v_resp.ok:
                    storage_urn = v_resp.json().get('data', {}).get('relationships', {}).get('storage', {}).get('data', {}).get('id')
                else:
                    error_reason = f"Error al obtener version de ACC: {v_resp.status_code} - {v_resp.text}"
                
                if storage_urn:
                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        
                        safe_obj = urllib.parse.quote(obj, safe='')
                        sign_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration={DA_SIGNED_URL_EXPIRATION_MIN}"
                        sign_resp = requests.get(sign_url, headers={'Authorization': f'Bearer {token_3legged}'})
                        
                        if not sign_resp.ok and DA_SIGNED_URL_EXPIRATION_MIN != 60:
                            fallback_sign_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration=60"
                            sign_resp = requests.get(fallback_sign_url, headers={'Authorization': f'Bearer {token_3legged}'})
                            
                        if sign_resp.ok:
                            input_url = sign_resp.json().get('url')
                        else:
                            input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}"
                        
                        output_url, upload_key = create_signed_result_upload(token, result_object_name)
                    else:
                        error_reason = f"Storage URN no soportado: {storage_urn}"
                else:
                    if not error_reason:
                        error_reason = "Storage URN no encontrado"
            else:
                error_reason = f"El URN decodificado no es soportado: {decoded_urn}"

        if not input_url or not output_url:
            return jsonify({"error": f"Falta URN o input_url/output_url válidos. Detalle: {error_reason}"}), 400

        token = get_internal_token()
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

        # IMPORTANT: We use a DIFFERENT Activity ID for the section extractor
        # Activity name is 'ExtractSectionsActivity'
        activity_id = f"{APS_CLIENT_ID}.ExtractSectionsActivity+prod"

        download_token = get_3legged_token() if (project_id and 'wip.dm.prod' in input_url) else token

        host_dwg_arg = { "url": input_url }
        if 'amazonaws.com' not in input_url:
            host_dwg_arg["headers"] = { "Authorization": f"Bearer {download_token}" }
            
        result_arg = { "verb": "put", "url": output_url }
        if 'amazonaws.com' not in output_url:
            result_arg["headers"] = { "Authorization": f"Bearer {token}" }

        workitem_payload = {
            "activityId": activity_id,
            "limitProcessingTimeSec": DA_LIMIT_PROCESSING_TIME_SEC,
            "arguments": {
                "HostDwg": host_dwg_arg,
                "Result": result_arg
            }
        }

        # v4: CURACIÓN — extraer solo los ejes que el usuario marcó como reales.
        # Va embebido como data URL (params.json); sin subir nada extra a OSS.
        alignment_ids = data.get('alignment_ids') or data.get('alignmentIds')
        if isinstance(alignment_ids, list):
            _clean = [str(a).strip() for a in alignment_ids if str(a or '').strip()]
            if _clean:
                import json as _pj
                import base64 as _b64
                _payload = _pj.dumps({"alignmentIds": _clean})
                workitem_payload["arguments"]["Params"] = {
                    "url": "data:application/json;base64," + _b64.b64encode(_payload.encode('utf-8')).decode('ascii')
                }
                with open('da_debug_sections.txt', 'a') as f:
                    f.write(f"CURACION alignmentIds={_clean}\n")

        # Ejecutando el WorkItem real en Autodesk Design Automation
        da_url = f"{APS_BASE_URL}/da/us-east/v3/workitems"
        resp = requests.post(da_url, headers=headers, json=workitem_payload)
        
        if resp.status_code not in [200, 201]:
            with open('da_debug_sections.txt', 'a') as f:
                f.write(f"DA API Error: {resp.status_code} - {resp.text}\n")
            return jsonify({"error": "Falló al iniciar WorkItem de Secciones", "details": resp.text}), 500
            
        wi_data = resp.json()
        workitem_id = wi_data.get('id')
        
        if upload_key:
            UPLOAD_KEYS[workitem_id] = upload_key
        RESULT_OBJECTS[workitem_id] = result_object_name
        
        with open('da_debug_sections.txt', 'a') as f:
            f.write(f"WORKITEM_ID {workitem_id}\n")
        return jsonify({
            "status": "In Progress",
            "message": "WorkItem de Secciones enviado a la nube de Civil 3D exitosamente.",
            "workitem_id": workitem_id,
            "result_object": result_object_name
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Persistencia de alineamientos ─────────────────────────────────────────────
# La PRIMERA extracción queda guardada por URN/frente; solo se reemplaza cuando
# el usuario vuelve a dar "Extraer". El 4D LOB y Civil leen de aquí.

def _civil_scope_from_payload(payload):
    scope = payload.get('scope_urn') or payload.get('model_urn') or 'global'
    scope = str(scope or '').strip()
    return scope or 'global'


def _civil_scope_from_args():
    scope = request.args.get('scope_urn') or request.args.get('model_urn')
    if scope is None:
        return None
    scope = str(scope or '').strip()
    return scope or None


def _ensure_scoped_civil_table(cur, table_name):
    cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS scope_urn TEXT")
    cur.execute(f"""
        UPDATE {table_name}
        SET scope_urn = COALESCE(NULLIF(model_urn, ''), 'global')
        WHERE scope_urn IS NULL OR scope_urn = ''
    """)
    cur.execute(f"ALTER TABLE {table_name} ALTER COLUMN scope_urn SET DEFAULT 'global'")
    cur.execute(f"ALTER TABLE {table_name} ALTER COLUMN scope_urn SET NOT NULL")
    cur.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = '{table_name}'::regclass
                  AND conname = '{table_name}_pkey'
            ) THEN
                ALTER TABLE {table_name} DROP CONSTRAINT {table_name}_pkey;
            END IF;
        END $$;
    """)
    cur.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = '{table_name}'::regclass
                  AND conname = '{table_name}_scope_urn_key'
            ) THEN
                ALTER TABLE {table_name}
                ADD CONSTRAINT {table_name}_scope_urn_key UNIQUE (scope_urn, urn);
            END IF;
        END $$;
    """)
    cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_scope ON {table_name}(scope_urn, urn)")


def ensure_civil_alignments_table():
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS civil_alignments (
                    scope_urn  TEXT NOT NULL DEFAULT 'global',
                    urn        TEXT NOT NULL,
                    model_urn  TEXT,
                    data       JSONB NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                )""")
            _ensure_scoped_civil_table(cur, 'civil_alignments')
            # ACC project (b.xxx): necesario para re-extraer archivos vinculados
            # de Docs (urn wipprod) sin depender del contexto del navegador.
            cur.execute("ALTER TABLE civil_alignments ADD COLUMN IF NOT EXISTS acc_project_id TEXT")
            # Nombre legible del archivo fuente: sin él, el panel Civil solo
            # puede mostrar "Carga en la nube · fecha (urn…)" — confuso.
            cur.execute("ALTER TABLE civil_alignments ADD COLUMN IF NOT EXISTS display_name TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_civil_alignments_model ON civil_alignments(model_urn)")
            # Secciones transversales: mismo patrón (permanente hasta re-extraer)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS civil_sections (
                    scope_urn  TEXT NOT NULL DEFAULT 'global',
                    urn        TEXT NOT NULL,
                    model_urn  TEXT,
                    data       JSONB NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                )""")
            _ensure_scoped_civil_table(cur, 'civil_sections')
            cur.execute("ALTER TABLE civil_sections ADD COLUMN IF NOT EXISTS acc_project_id TEXT")
            cur.execute("ALTER TABLE civil_sections ADD COLUMN IF NOT EXISTS display_name TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_civil_sections_model ON civil_sections(model_urn)")
            conn.commit()
            print("[civil] Tablas civil_alignments y civil_sections listas.")
    except Exception as e:
        print(f"[civil] ensure_civil_alignments_table: {e}")


import re as _re

# Patrones CENTRALIZADOS de tipo de material (única fuente; si un DWG nuevo
# trae otra nomenclatura se ajusta AQUÍ y todos los consumidores lo heredan)
_KIND_CUT = _re.compile(r'desmonte|corte|excav|cut', _re.I)
_KIND_FILL = _re.compile(r'terrapl|relleno|fill', _re.I)


def _canon_material_key(label):
    """Identidad ESTABLE de una lista de material (quita prefijo de sample
    line y el id único final). Misma lógica que usa el holograma."""
    s = str(label or '').strip()
    s = _re.sub(r'\(\d+\)\s*$', '', s)
    m = _re.search(r'material list.*$', s, _re.I)
    if m:
        s = m.group(0)
    else:
        s = _re.sub(r'^secciones\s*-\s*', '', s, flags=_re.I)
        s = _re.sub(r'^sl[-\s]?\d+\s*-\s*', '', s, flags=_re.I)
    return _re.sub(r'\s+', ' ', s).strip().lower()


def _canonicalize_sections(data):
    """CONTRATO CANÓNICO por shape (idempotente, no toca campos crudos):
      role: 'corridor' | 'material' | 'line' | 'shape'
      kind: 'cut' | 'fill' | None      (solo role=material)
      materialKey: identidad estable   (solo role=material)
    Clasifica por PROPIEDADES INTRÍNSECAS (tipo del SDK, cerrado, área) y solo
    al final por nombre — así los DWG nuevos no requieren tocar consumidores.
    """
    if not isinstance(data, dict) or not isinstance(data.get('stations'), list):
        return data
    for st in data['stations']:
        for sec in st.get('sections') or []:
            if not isinstance(sec, dict) or sec.get('role'):
                continue  # ya canónico
            src_type = str(sec.get('sourceType') or '')
            style = str(sec.get('styleName') or '')
            label = str(sec.get('materialName') or sec.get('sourceName') or sec.get('name') or '')
            try:
                area = float(sec.get('area') or 0)
            except (TypeError, ValueError):
                area = 0.0
            is_closed = bool(sec.get('closed'))

            # Visibilidad del CADISTA (contrato): draw=false u estilo _Invisible
            # = no está en su lámina → los consumidores visuales lo omiten
            # (el QTO/cuadro sí puede usarlo: es dato, no dibujo).
            sec['hidden'] = bool(sec.get('draw') is False or 'invisible' in style.lower())

            if src_type == 'CorridorShape':
                sec['role'] = 'corridor'
                continue
            is_material = (
                src_type == 'MaterialSection'
                or style.lower().startswith('_hatch')
                or 'material list' in label.lower()
            )
            if is_material:
                sec['role'] = 'material'
                sec['materialKey'] = _canon_material_key(label)
                cut = bool(_KIND_CUT.search(label) or _KIND_CUT.search(style))
                fill = bool(_KIND_FILL.search(label) or _KIND_FILL.search(style))
                sec['kind'] = 'cut' if (cut and not fill) else ('fill' if fill else None)
                continue
            sec['role'] = 'shape' if (is_closed or area > 0) else 'line'
    data['schemaContract'] = 1
    return data


@civil_da_bp.route('/api/civil/sections', methods=['GET', 'POST', 'DELETE'])
def civil_sections():
    """Persistencia de secciones extraídas. GET ?urn= → JSON guardado.
    POST {urn, model_urn, data} → guarda/reemplaza (solo al re-extraer)."""
    import json as _json
    try:
        from db import get_db_connection
        if request.method == 'GET':
            urn = request.args.get('urn')
            scope_urn = _civil_scope_from_args()
            if not urn and not scope_urn:
                return jsonify({'error': 'Falta urn'}), 400
            if not urn:
                # Listado por frente (el panel Civil pide solo ?scope_urn= y toma
                # items[0]; el más reciente primero). Con ?meta=1 NO baja la data
                # (JSONB pesado): solo urn/fecha/nombre — para chips de estado.
                meta_only = request.args.get('meta') in ('1', 'true')
                with get_db_connection() as conn:
                    cur = conn.cursor()
                    if meta_only:
                        cur.execute("""
                            SELECT urn, updated_at::text, scope_urn, display_name
                            FROM civil_sections
                            WHERE scope_urn = %s
                            ORDER BY updated_at DESC
                        """, (scope_urn,))
                        return jsonify({'items': [
                            {'urn': r[0], 'updated_at': r[1], 'scope_urn': r[2], 'display_name': r[3]}
                            for r in cur.fetchall()
                        ]}), 200
                    cur.execute("""
                        SELECT urn, data, updated_at::text, scope_urn, display_name
                        FROM civil_sections
                        WHERE scope_urn = %s
                        ORDER BY updated_at DESC
                    """, (scope_urn,))
                    return jsonify({'items': [
                        {'urn': r[0], 'data': r[1], 'updated_at': r[2], 'scope_urn': r[3], 'display_name': r[4]}
                        for r in cur.fetchall()
                    ]}), 200
            with get_db_connection() as conn:
                cur = conn.cursor()
                if scope_urn:
                    cur.execute("""
                        SELECT data, updated_at::text, scope_urn
                        FROM civil_sections
                        WHERE scope_urn = %s AND urn = %s
                    """, (scope_urn, urn))
                else:
                    cur.execute("""
                        SELECT data, updated_at::text, scope_urn
                        FROM civil_sections
                        WHERE urn = %s
                        ORDER BY updated_at DESC
                        LIMIT 1
                    """, (urn,))
                row = cur.fetchone()
                if not row:
                    return jsonify({'found': False}), 200
                return jsonify({'found': True, 'data': row[0], 'updated_at': row[1], 'scope_urn': row[2]}), 200

        if request.method == 'DELETE':
            # Limpieza explícita: borra las secciones guardadas del archivo (o de
            # todo el frente si no llega urn). El usuario decide empezar de cero.
            urn = request.args.get('urn')
            scope_urn = _civil_scope_from_args()
            if not scope_urn and not urn:
                return jsonify({'error': 'Falta urn o scope_urn'}), 400
            with get_db_connection() as conn:
                cur = conn.cursor()
                if urn and scope_urn:
                    cur.execute("DELETE FROM civil_sections WHERE scope_urn = %s AND urn = %s", (scope_urn, urn))
                elif urn:
                    cur.execute("DELETE FROM civil_sections WHERE urn = %s", (urn,))
                else:
                    cur.execute("DELETE FROM civil_sections WHERE scope_urn = %s", (scope_urn,))
                deleted = cur.rowcount
                conn.commit()
            return jsonify({'status': 'ok', 'deleted': deleted}), 200

        payload = request.get_json() or {}
        urn = payload.get('urn')
        data = payload.get('data')
        scope_urn = _civil_scope_from_payload(payload)
        if not urn or data is None:
            return jsonify({'error': 'Faltan urn o data'}), 400
        # Contrato canónico: clasificar cada shape UNA vez al guardar
        try:
            data = _canonicalize_sections(data)
        except Exception as ce:
            print(f"[civil] canonicalize_sections fallo (se guarda crudo): {ce}")
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO civil_sections (scope_urn, urn, model_urn, data, acc_project_id, display_name, updated_at)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s, NOW())
                ON CONFLICT (scope_urn, urn) DO UPDATE SET
                    model_urn = EXCLUDED.model_urn,
                    data = EXCLUDED.data,
                    acc_project_id = COALESCE(EXCLUDED.acc_project_id, civil_sections.acc_project_id),
                    display_name = COALESCE(EXCLUDED.display_name, civil_sections.display_name),
                    updated_at = NOW()""",
                (scope_urn, urn, payload.get('model_urn'), _json.dumps(data),
                 payload.get('acc_project_id'), payload.get('display_name')))
            conn.commit()
        return jsonify({'status': 'ok', 'scope_urn': scope_urn}), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@civil_da_bp.route('/api/civil/alignments', methods=['GET', 'POST', 'DELETE'])
def civil_alignments():
    """GET ?urn= (o ?model_urn= para todos los del frente) → JSON persistido.
    POST {urn, model_urn, data} → guarda/reemplaza la extracción (explícito)."""
    import json as _json
    try:
        from db import get_db_connection
        if request.method == 'GET':
            urn = request.args.get('urn')
            model_urn = request.args.get('model_urn')
            scope_urn = _civil_scope_from_args()
            with get_db_connection() as conn:
                cur = conn.cursor()
                if urn:
                    if scope_urn:
                        cur.execute("""
                            SELECT data, updated_at::text, scope_urn
                            FROM civil_alignments
                            WHERE scope_urn = %s AND urn = %s
                        """, (scope_urn, urn))
                    else:
                        cur.execute("""
                            SELECT data, updated_at::text, scope_urn
                            FROM civil_alignments
                            WHERE urn = %s
                            ORDER BY updated_at DESC
                            LIMIT 1
                        """, (urn,))
                    row = cur.fetchone()
                    if not row:
                        return jsonify({'found': False}), 200
                    return jsonify({'found': True, 'data': row[0], 'updated_at': row[1], 'scope_urn': row[2]}), 200
                if model_urn or scope_urn:
                    # Listado por frente: el panel Civil pide solo ?scope_urn= para
                    # poblar el selector multi-archivo (varias topos/DWG por frente).
                    key = scope_urn or model_urn
                    cur.execute("""SELECT urn, data, updated_at::text, scope_urn, display_name FROM civil_alignments
                                   WHERE scope_urn = %s OR model_urn = %s
                                   ORDER BY updated_at DESC""", (key, model_urn or key))
                    return jsonify({'items': [
                        {'urn': r[0], 'data': r[1], 'updated_at': r[2], 'scope_urn': r[3], 'display_name': r[4]}
                        for r in cur.fetchall()
                    ]}), 200
            return jsonify({'error': 'Falta urn o model_urn'}), 400

        if request.method == 'DELETE':
            urn = request.args.get('urn')
            scope_urn = _civil_scope_from_args()
            if not scope_urn and not urn:
                return jsonify({'error': 'Falta urn o scope_urn'}), 400
            with get_db_connection() as conn:
                cur = conn.cursor()
                if urn and scope_urn:
                    cur.execute("DELETE FROM civil_alignments WHERE scope_urn = %s AND urn = %s", (scope_urn, urn))
                elif urn:
                    cur.execute("DELETE FROM civil_alignments WHERE urn = %s", (urn,))
                else:
                    cur.execute("DELETE FROM civil_alignments WHERE scope_urn = %s", (scope_urn,))
                deleted = cur.rowcount
                conn.commit()
            return jsonify({'status': 'ok', 'deleted': deleted}), 200

        payload = request.get_json() or {}
        urn = payload.get('urn')
        data = payload.get('data')
        scope_urn = _civil_scope_from_payload(payload)
        if not urn or data is None:
            return jsonify({'error': 'Faltan urn o data'}), 400
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO civil_alignments (scope_urn, urn, model_urn, data, acc_project_id, display_name, updated_at)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s, NOW())
                ON CONFLICT (scope_urn, urn) DO UPDATE SET
                    model_urn = EXCLUDED.model_urn,
                    data = EXCLUDED.data,
                    acc_project_id = COALESCE(EXCLUDED.acc_project_id, civil_alignments.acc_project_id),
                    display_name = COALESCE(EXCLUDED.display_name, civil_alignments.display_name),
                    updated_at = NOW()""",
                (scope_urn, urn, payload.get('model_urn'), _json.dumps(data),
                 payload.get('acc_project_id'), payload.get('display_name')))
            conn.commit()
        return jsonify({'status': 'ok', 'scope_urn': scope_urn}), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@civil_da_bp.route('/api/civil/alignment-result', methods=['GET'])
def get_alignment_result():
    """Downloads alignment_result.json from the app bucket and returns it to the frontend."""
    try:
        from routes.digital_twin import get_app_bucket_key
        my_bucket = get_app_bucket_key()
        token = get_internal_token()
        workitem_id = request.args.get('workitem_id')
        object_name = RESULT_OBJECTS.get(workitem_id) if workitem_id else None
        object_name = object_name or request.args.get('object_name') or 'alignment_result.json'
        
        # Get download URL
        dl_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{my_bucket}/objects/{object_name}/signeds3download"
        dl_resp = requests.get(dl_url, headers={'Authorization': f'Bearer {token}'})
        if not dl_resp.ok:
            return jsonify({"error": "No se pudo obtener URL de descarga", "details": dl_resp.text}), 500
            
        s3_url = dl_resp.json().get('url')
        if not s3_url:
            return jsonify({"error": "No URL found in signeds3download response"}), 500
            
        # Download from S3
        file_resp = requests.get(s3_url)
        if not file_resp.ok:
            return jsonify({"error": "No se pudo descargar de S3", "details": file_resp.text}), 500
            
        return jsonify(file_resp.json()), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@civil_da_bp.route('/api/civil/workitem-status/<workitem_id>', methods=['GET'])
def get_workitem_status(workitem_id):
    """Consulta el estado del WorkItem en la nube de Autodesk."""
    try:
        token = get_internal_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        da_url = f"{APS_BASE_URL}/da/us-east/v3/workitems/{workitem_id}"
        resp = requests.get(da_url, headers=headers)
        
        if resp.status_code == 200:
            status_data = resp.json()
            
            # If successful, complete the S3 upload
            if status_data.get('status') in ['success', 'failed', 'successWithErrors']:
                report_url = status_data.get('reportUrl')
                # Guardar la URL del reporte para inspección
                try:
                    with open('last_report.txt', 'w') as f:
                        f.write(report_url if report_url else 'none')
                except Exception as e:
                    pass
                # En cualquier estado terminal distinto de 'success': bajar el
                # reporte (guardado por workitem para no perderlo entre runs).
                st_lo = str(status_data.get('status', '')).lower()
                if st_lo != 'success' and report_url:
                    try:
                        rep = requests.get(report_url, timeout=20)
                        if rep.ok:
                            txt = rep.text
                            status_data['report_tail'] = txt[-3000:]
                            with open(f'da_report_{workitem_id}.txt', 'w', encoding='utf-8', errors='replace') as f:
                                f.write(txt)
                            with open('da_report_fail.txt', 'w', encoding='utf-8', errors='replace') as f:
                                f.write(txt)
                    except Exception:
                        pass
                
                upload_key = UPLOAD_KEYS.pop(workitem_id, None)
                if upload_key:
                    from routes.digital_twin import get_app_bucket_key
                    my_bucket = get_app_bucket_key()
                    object_name = RESULT_OBJECTS.get(workitem_id, 'alignment_result.json')
                    complete_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{my_bucket}/objects/{object_name}/signeds3upload"
                    comp_resp = requests.post(complete_url, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, json={"uploadKey": upload_key})
                    print("[Design Automation] Completed S3 Upload:", comp_resp.status_code, comp_resp.text)
                    
            return jsonify(status_data), 200
        else:
            return jsonify({"error": "No se pudo consultar el estado", "details": resp.text}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

