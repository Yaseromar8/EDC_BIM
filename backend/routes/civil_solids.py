"""
civil_solids.py — Sólidos de movimiento de tierras por TOPOGRAFÍAS (Fase 2).

Evalúa la RECETA QTO del cadista (extraída del DWG: superficies con condición
encima/debajo por material) en CONTINUO sobre una grilla alineada al eje:

    espesor(s, off) = min(cotas Below) − max(cotas Above), recortado a ≥ 0

Donde el espesor es positivo hay material. La malla resultante es la MISMA
configuración de Compute Materials evaluada fuera de las sample lines — en
cada sample line coincide con el hatch de la lámina; entre ellas es la
topografía real, no una interpolación.

Regla del proyecto intacta: el volumen OFICIAL es el del cuadro por secciones;
el volumen por superficies se reporta como COMPARACIÓN (auditoría). La salida
usa el mismo contrato de cuerpos que el holograma de secciones — el visor
dibuja ambos con el mismo código (colores, leyenda, tapas de corte).

Datos de entrada (persistidos):
  - civil_sections.data.qtoRecipes  → recetas por material (bundle v6.1+)
  - civil_surfaces.data.surfaces    → triángulos TIN (bundle v7, recortados)
  - civil_alignments                → eje (marco s/offset)
"""
from esquema_congelado import solo_con_ddl
import math
import time as _time

from flask import Blueprint, request, jsonify

from routes.civil_ghost import (
    _normalize_stations, _normalize_alignments, _axis_polyline, _align_id,
    _frame_at, _material_key, _pretty_label, _build_kind_mesh, KIND_PATTERNS,
)

civil_solids_bp = Blueprint('civil_solids_bp', __name__)

# Resolución de la grilla. El paso LATERAL manda en la fidelidad: la sección
# cambia mucho más rápido de través que a lo largo del eje (donde la geometría
# es suave). Por eso doff es fino y ds moderado — más nitidez por byte.
GRID_DS = 0.75       # m a lo largo del eje
GRID_DOFF = 0.15     # m lateral
HALF_WIDTH = 18.0    # m a cada lado del eje
# Espesor mínimo para considerar material. Dos superficies del cadista que
# COINCIDEN (fuera del daylight) difieren por ruido de triangulación de hasta
# ±10-20 cm entre TINs distintos — con umbral chico salían mantos fantasma.
MIN_THICK = 0.05
# El sólido de un material solo puede vivir pegado al canal: componentes del
# campo de espesor que no tocan la franja del eje (islas de ruido) se descartan.
CORE_BAND = 3.0
# Margen sobre la franja lateral que el PROPIO cadista dibujó en sus láminas
# (el sólido no puede exceder lo que sus hatches delimitan).
LATERAL_MARGIN = 1.5
# Margen sobre el rango de COTAS de sus hatches: donde la superficie local que
# acota un relleno se acaba (borde de huella) y otra más profunda toma el
# relevo (p. ej. el pozo de la estructura), el sólido se abría en faldones
# hacia abajo que ninguna lámina dibuja — la banda vertical lo impide.
VERTICAL_MARGIN = 1.0


# ── Evaluador de TIN (Z en un punto por interpolación baricéntrica) ─────────

class _Tin:
    """Malla TIN con índice espacial por celdas para consultar Z(x, y)."""

    CELL = 3.0

    def __init__(self, name, vertices, indices):
        self.name = name
        self.tris = []          # (x1,y1,z1, x2,y2,z2, x3,y3,z3)
        self.grid = {}          # (cx, cy) -> [índices de triángulo]
        v = vertices
        for t in range(0, len(indices), 3):
            i1, i2, i3 = indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3
            tri = (v[i1], v[i1 + 1], v[i1 + 2],
                   v[i2], v[i2 + 1], v[i2 + 2],
                   v[i3], v[i3 + 1], v[i3 + 2])
            ti = len(self.tris)
            self.tris.append(tri)
            x0 = min(tri[0], tri[3], tri[6]); x1 = max(tri[0], tri[3], tri[6])
            y0 = min(tri[1], tri[4], tri[7]); y1 = max(tri[1], tri[4], tri[7])
            for cx in range(int(x0 // self.CELL), int(x1 // self.CELL) + 1):
                for cy in range(int(y0 // self.CELL), int(y1 // self.CELL) + 1):
                    self.grid.setdefault((cx, cy), []).append(ti)

    def z_at(self, x, y):
        cands = self.grid.get((int(x // self.CELL), int(y // self.CELL)))
        if not cands:
            return None
        for ti in cands:
            x1, y1, z1, x2, y2, z2, x3, y3, z3 = self.tris[ti]
            den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
            if abs(den) < 1e-12:
                continue
            a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / den
            b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / den
            c = 1.0 - a - b
            if a >= -1e-9 and b >= -1e-9 and c >= -1e-9:
                return a * z1 + b * z2 + c * z3
        return None


# ── Persistencia de superficies extraídas ───────────────────────────────────

@solo_con_ddl
def ensure_civil_surfaces_table():
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS civil_surfaces (
                scope_urn TEXT NOT NULL,
                urn TEXT NOT NULL,
                data JSONB NOT NULL,
                display_name TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (scope_urn, urn)
            )
        """)
        conn.commit()


@civil_solids_bp.route('/api/civil/surfaces', methods=['GET', 'POST'])
def civil_surfaces():
    """GET ?scope_urn= → metadatos/último set de superficies del frente.
    POST {urn, scope_urn, data, display_name} → guarda/reemplaza."""
    import json as _json
    try:
        from db import get_db_connection
        ensure_civil_surfaces_table()
        if request.method == 'GET':
            scope_urn = request.args.get('scope_urn') or request.args.get('model_urn')
            if not scope_urn:
                return jsonify({'error': 'Falta scope_urn'}), 400
            meta_only = request.args.get('meta') in ('1', 'true')
            with get_db_connection() as conn:
                cur = conn.cursor()
                if meta_only:
                    cur.execute("""
                        SELECT urn, updated_at::text, display_name FROM civil_surfaces
                        WHERE scope_urn = %s ORDER BY updated_at DESC
                    """, (scope_urn,))
                    return jsonify({'items': [
                        {'urn': r[0], 'updated_at': r[1], 'display_name': r[2]}
                        for r in cur.fetchall()]}), 200
                cur.execute("""
                    SELECT urn, data, updated_at::text FROM civil_surfaces
                    WHERE scope_urn = %s ORDER BY updated_at DESC LIMIT 1
                """, (scope_urn,))
                row = cur.fetchone()
                if not row:
                    return jsonify({'found': False}), 200
                return jsonify({'found': True, 'urn': row[0], 'data': row[1], 'updated_at': row[2]}), 200
        payload = request.get_json() or {}
        urn = payload.get('urn')
        data = payload.get('data')
        scope_urn = payload.get('scope_urn') or payload.get('model_urn') or 'global'
        if not urn or data is None:
            return jsonify({'error': 'Faltan urn o data'}), 400
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO civil_surfaces (scope_urn, urn, data, display_name, updated_at)
                VALUES (%s, %s, %s::jsonb, %s, NOW())
                ON CONFLICT (scope_urn, urn) DO UPDATE SET
                    data = EXCLUDED.data,
                    display_name = EXCLUDED.display_name,
                    updated_at = NOW()
            """, (scope_urn, urn, _json.dumps(data), payload.get('display_name')))
            conn.commit()
        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Extracción de topografías de UNA zona (workitem DA) ─────────────────────
# Flujo del panel: POST aquí → poll /api/civil/workitem-status/<id> → GET
# /api/civil/alignment-result?workitem_id=<id> → POST /api/civil/surfaces.

@civil_solids_bp.route('/api/civil/extract-surfaces', methods=['POST'])
def extract_surfaces_da():
    # Lanzar un trabajo de Civil 3D en la nube se factura por MINUTOS DE MOTOR, y
    # un trabajo atascado consume su tiempo maximo entero antes de rendirse. Esto
    # no lo dispara cualquiera con sesion.
    from flask import g as _g
    _u = getattr(_g, 'current_user', None)
    if not _u:
        return jsonify({"error": "Autenticación requerida"}), 401
    if _u.get('role') != 'admin':
        return jsonify({"error": "Solo un administrador puede lanzar extracciones de Civil 3D."}), 403


    import base64 as _b64
    import json as _json
    import urllib.parse as _up
    import uuid as _uuid
    import requests as _rq
    try:
        from db import get_db_connection
        from routes.civil_design_automation import (
            get_internal_token, get_3legged_token, create_signed_result_upload,
            UPLOAD_KEYS, RESULT_OBJECTS, APS_BASE_URL, APS_CLIENT_ID,
            DA_LIMIT_PROCESSING_TIME_SEC, DA_SIGNED_URL_EXPIRATION_MIN,
        )
        from routes.civil_ghost import _axis_for
        body = request.get_json() or {}
        urn = body.get('urn')
        scope_urn = body.get('scope_urn') or body.get('model_urn')
        project_id = body.get('project_id')
        if not urn or not scope_urn:
            return jsonify({'error': 'Faltan urn o scope_urn'}), 400

        # 1) superficies que usan las recetas de ESTE archivo + su tramo (clip)
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT data, acc_project_id FROM civil_sections WHERE scope_urn=%s AND urn=%s",
                        (scope_urn, urn))
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'sin-secciones',
                                'detail': 'Extrae primero las secciones de este archivo.'}), 404
            data = row[0]
            project_id = project_id or row[1]
            cur.execute("SELECT data FROM civil_alignments WHERE scope_urn=%s ORDER BY updated_at DESC",
                        (scope_urn,))
            align_rows = cur.fetchall()
            # project_id de ACC con RESPALDOS: la fila de secciones puede venir
            # sin él (según la ruta con que se extrajo) — se busca en los
            # alineamientos del MISMO archivo y, si no, en cualquier fila del
            # frente (todas las zonas viven en el mismo proyecto ACC).
            if not project_id:
                cur.execute("""SELECT acc_project_id FROM civil_alignments
                               WHERE scope_urn=%s AND acc_project_id IS NOT NULL
                               ORDER BY (urn = %s) DESC, updated_at DESC LIMIT 1""",
                            (scope_urn, urn))
                r2 = cur.fetchone()
                if r2:
                    project_id = r2[0]
            if not project_id:
                cur.execute("""SELECT acc_project_id FROM civil_sections
                               WHERE scope_urn=%s AND acc_project_id IS NOT NULL
                               ORDER BY updated_at DESC LIMIT 1""", (scope_urn,))
                r2 = cur.fetchone()
                if r2:
                    project_id = r2[0]
        recipes = (data.get('qtoRecipes') if isinstance(data, dict) else None) or []
        if not recipes:
            return jsonify({'error': 'sin-recetas',
                            'detail': 'La extracción no trae recetas QTO — re-extraer secciones.'}), 404
        names = {i['name'] for r in recipes for i in r.get('items') or [] if i.get('name')}
        inv = [s.get('name') for s in (data.get('surfaces') or []) if s.get('name')]
        for n in inv:
            if n.upper().endswith('_DATUM'):
                pref = n[:-6]
                for m2 in inv:
                    if m2.upper() == (pref + '_TOP').upper():
                        names.add(n)
                        names.add(m2)
        if not names:
            return jsonify({'error': 'sin-superficies-en-recetas'}), 404
        stations = _normalize_stations(data)
        pks = sorted(float(s.get('station')) for s in stations if s.get('station') is not None)
        aligns = {}
        for st in stations:
            aligns[st.get('alignmentId') or ''] = aligns.get(st.get('alignmentId') or '', 0) + 1
        clip = None
        if pks and aligns:
            want = max(aligns, key=aligns.get)
            axis, _u = _axis_for([(str(i), '', r[0]) for i, r in enumerate(align_rows)], want)
            if axis:
                seg = [(x, y) for s, x, y in axis if pks[0] - 10 <= s <= pks[-1] + 10]
                if seg:
                    B = 30.0
                    clip = [min(p[0] for p in seg) - B, min(p[1] for p in seg) - B,
                            max(p[0] for p in seg) + B, max(p[1] for p in seg) + B]

        # 2) workitem (mismo wiring que la extracción de secciones)
        token = get_internal_token()
        decoded = urn
        try:
            if not urn.startswith('urn:'):
                decoded = _b64.urlsafe_b64decode(urn + '=' * (-len(urn) % 4)).decode('utf-8')
        except Exception:
            pass
        # Resolución del DWG con las MISMAS rutas que la extracción de secciones:
        # (a) input_url que manda el cliente, (b) objeto OSS directo,
        # (c) versión de ACC → storage → descarga firmada. Cada fallo se
        # reporta con su causa (nada de "no se pudo" a secas).
        input_url = body.get('input_url')
        why = []
        if not input_url and decoded.startswith('urn:adsk.objects:os.object:'):
            parts = decoded.replace('urn:adsk.objects:os.object:', '').split('/')
            bucket, obj = parts[0], '/'.join(parts[1:])
            input_url = f"{APS_BASE_URL}/oss/v2/buckets/{bucket}/objects/{_up.quote(obj, safe='')}"
        if not input_url and decoded.startswith('urn:adsk.wipprod:fs.file:vf'):
            if not project_id:
                why.append('el archivo no tiene proyecto ACC registrado')
            else:
                if not project_id.startswith('b.'):
                    project_id = 'b.' + project_id
                t3 = get_3legged_token()
                if not t3:
                    why.append('sin sesión de Autodesk (token 3-legged) — inicia sesión en ACC desde el visor')
                    t3 = token
                vr = _rq.get(f"{APS_BASE_URL}/data/v1/projects/{project_id}/versions/{_up.quote(decoded, safe='')}",
                             headers={'Authorization': f'Bearer {t3}'})
                storage = None
                if vr.ok:
                    storage = vr.json().get('data', {}).get('relationships', {}).get('storage', {}).get('data', {}).get('id')
                else:
                    why.append(f'ACC versions HTTP {vr.status_code}')
                if storage and storage.startswith('urn:adsk.objects:os.object:'):
                    parts = storage.replace('urn:adsk.objects:os.object:', '').split('/')
                    bucket, obj = parts[0], '/'.join(parts[1:])
                    base_sign = f"{APS_BASE_URL}/oss/v2/buckets/{bucket}/objects/{_up.quote(obj, safe='')}/signeds3download"
                    sr = _rq.get(f"{base_sign}?minutesExpiration={DA_SIGNED_URL_EXPIRATION_MIN}",
                                 headers={'Authorization': f'Bearer {t3}'})
                    # los buckets de ACC rechazan expiraciones > 60 min: mismo
                    # reintento que la extracción de secciones (sin esto la URL
                    # caía al fallback sin firma y el workitem daba failedDownload)
                    if not sr.ok and DA_SIGNED_URL_EXPIRATION_MIN != 60:
                        sr = _rq.get(f"{base_sign}?minutesExpiration=60",
                                     headers={'Authorization': f'Bearer {t3}'})
                    if sr.ok:
                        input_url = sr.json().get('url')
                    else:
                        why.append(f'signeds3download HTTP {sr.status_code}')
                        input_url = f"{APS_BASE_URL}/oss/v2/buckets/{bucket}/objects/{_up.quote(obj, safe='')}"
                elif storage:
                    why.append(f'storage no soportado: {storage[:40]}')
        if not input_url:
            return jsonify({'error': 'Sin acceso al DWG',
                            'detail': ('No se pudo resolver el archivo: '
                                       + ('; '.join(why) if why else f'URN no soportado ({decoded[:48]})'))}), 400
        result_object = f'surfaces_result_{_uuid.uuid4().hex}.json'
        output_url, upload_key = create_signed_result_upload(token, result_object)
        params_b64 = _b64.b64encode(_json.dumps({'surfaceNames': sorted(names), 'clip': clip}).encode()).decode()
        # URLs de APS (no firmadas de S3) necesitan el token en la cabecera
        host_dwg_arg = {'url': input_url}
        if 'amazonaws.com' not in input_url:
            dl_token = get_3legged_token() if 'wip.dm.prod' in input_url else token
            host_dwg_arg['headers'] = {'Authorization': f'Bearer {dl_token or token}'}
        result_arg = {'verb': 'put', 'url': output_url}
        if 'amazonaws.com' not in output_url:
            result_arg['headers'] = {'Authorization': f'Bearer {token}'}
        wi = _rq.post(f"{APS_BASE_URL}/da/us-east/v3/workitems",
                      headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                      json={
                          'activityId': f'{APS_CLIENT_ID}.ExtractSurfacesActivity+prod',
                          'limitProcessingTimeSec': DA_LIMIT_PROCESSING_TIME_SEC,
                          'arguments': {
                              'HostDwg': host_dwg_arg,
                              'Result': result_arg,
                              'Params': {'url': 'data:application/json;base64,' + params_b64},
                          },
                      })
        if wi.status_code not in (200, 201):
            return jsonify({'error': 'Falló al iniciar el workitem de topografías', 'details': wi.text}), 500
        wid = wi.json().get('id')
        if upload_key:
            UPLOAD_KEYS[wid] = upload_key
        RESULT_OBJECTS[wid] = result_object
        return jsonify({'status': 'In Progress', 'workitem_id': wid,
                        'result_object': result_object, 'surfaceNames': sorted(names)}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── Generador de sólidos ────────────────────────────────────────────────────

def _interp_rows(rows, s_val, n_vals):
    """Interpola n_vals columnas de rows=[(pk, v1, v2, ...)] en la progresiva
    s_val (las bandas del cadista y el prisma de la estructura viven por
    estación y deben poder consultarse en cualquier punto intermedio)."""
    if not rows:
        return None
    if s_val <= rows[0][0]:
        return tuple(rows[0][1:1 + n_vals])
    if s_val >= rows[-1][0]:
        return tuple(rows[-1][1:1 + n_vals])
    for a, b in zip(rows, rows[1:]):
        if a[0] <= s_val <= b[0]:
            t = (s_val - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
            return tuple(a[1 + k] + (b[1 + k] - a[1 + k]) * t for k in range(n_vals))
    return tuple(rows[-1][1:1 + n_vals])


def _build_solid_bodies(recipes, tins, axis, s_min, s_max, hidden_keys,
                        include_hidden, lateral_bounds=None, vertical_bounds=None,
                        struct_rows=None, frame_rows=None,
                        ds=GRID_DS, doff=GRID_DOFF, half=HALF_WIDTH):
    """Cuerpos por material evaluando cada receta sobre la grilla del eje.

    DELIMITACIÓN (regla del cadista: "hasta el choque de una topografía con la
    otra"): (1) el borde del sólido se recorta a la ISOLÍNEA de espesor mínimo
    (donde las superficies de la receta se encuentran — daylight), no al borde
    de la huella de las TIN; (2) lateralmente nunca excede la franja que sus
    propios hatches ocupan en las láminas (lateral_bounds por material);
    (3) las componentes que no tocan la franja del eje (ruido) se descartan.
    """
    warnings = []
    n_s = max(2, int(round((s_max - s_min) / ds)) + 1)
    n_o = max(2, int(round((2 * half) / doff)) + 1)

    # 1) cotas de TODAS las superficies en cada nodo (una sola pasada)
    zcache = []   # [i_s][i_o] -> {surfName: z}
    frames = []
    for i in range(n_s):
        s = s_min + i * ds
        (px, py), (nx, ny) = _frame_at(axis, s)
        frames.append((s, px, py, nx, ny))
        row = []
        for j in range(n_o):
            off = -half + j * doff
            x = px + nx * off
            y = py + ny * off
            zs = {}
            for name, tin in tins.items():
                z = tin.z_at(x, y)
                if z is not None:
                    zs[name] = z
            row.append(zs)
        zcache.append(row)

    # ── ENVOLVENTE DE EXCAVACIÓN ("cortar según la topografía, sea cual
    # sea"): ningún relleno puede invadir terreno natural — su piso se recorta
    # contra la superficie EXCAVADA de la receta de corte del cadista, y fuera
    # de la huella excavada no hay relleno. Excepción: materiales que van
    # SOBRE el terreno (su receta usa el TN del corte como piso), p. ej. los
    # taludes de protección.
    def _items(rec, cond):
        return [i['name'] for i in rec.get('items') or []
                if i.get('name') and str(i.get('condition')).lower() == cond]

    cut_rec = None
    for rec in recipes:
        if str(rec.get('quantityType') or '').lower() != 'cut':
            continue
        k = _material_key(f"{rec.get('materialListName') or ''} - {rec.get('materialName') or ''}".strip(' -'))
        if include_hidden or k not in hidden_keys:
            cut_rec = rec
            break
    if cut_rec is None:
        cut_rec = next((r for r in recipes if str(r.get('quantityType') or '').lower() == 'cut'), None)
    void_bot = None   # superficie EXCAVADA (piso del hueco)
    void_top = None   # TERRENO de la receta de corte (techo del hueco)
    cut_tops = set()
    if cut_rec:
        cut_ab = [n for n in _items(cut_rec, 'above') if n in tins]
        cut_be = [n for n in _items(cut_rec, 'below') if n in tins]
        cut_tops = set(_items(cut_rec, 'below'))
        if cut_ab and cut_be:
            void_bot = []
            void_top = []
            for i in range(n_s):
                row_b = []
                row_t = []
                for j in range(n_o):
                    zs = zcache[i][j]
                    zl = [zs[n] for n in cut_ab if n in zs]
                    zt = [zs[n] for n in cut_be if n in zs]
                    row_b.append(max(zl) if zl else None)
                    row_t.append(min(zt) if zt else None)
                void_bot.append(row_b)
                void_top.append(row_t)

    # prisma de la ESTRUCTURA por progresiva (bbox de las shapes Box+Solado del
    # corredor, interpolado entre estaciones): el relleno se resta contra él
    sgrid = None
    if struct_rows:
        rows = sorted(struct_rows)
        sgrid = []
        for i in range(n_s):
            s = s_min + i * ds
            if s <= rows[0][0]:
                sgrid.append(rows[0][1:])
            elif s >= rows[-1][0]:
                sgrid.append(rows[-1][1:])
            else:
                val = rows[-1][1:]
                for a, b in zip(rows, rows[1:]):
                    if a[0] <= s <= b[0]:
                        t = (s - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
                        val = tuple(a[1 + k] + (b[1 + k] - a[1 + k]) * t for k in range(4))
                        break
                sgrid.append(val)

    bodies_by_kind = {'corte': [], 'relleno': []}
    for rec in recipes:
        mat_full = f"{rec.get('materialListName') or ''} - {rec.get('materialName') or ''}".strip(' -')
        key = _material_key(mat_full)
        if not include_hidden and key in hidden_keys:
            continue
        kind = 'corte' if str(rec.get('quantityType') or '').lower() == 'cut' else 'relleno'
        aboves = _items(rec, 'above')
        belows = _items(rec, 'below')
        missing = [n for n in aboves + belows if n not in tins]
        if missing or not aboves or not belows:
            warnings.append(f"[{key}] receta incompleta (faltan superficies: {', '.join(missing) or 'sin above/below'}); omitido")
            continue
        # rellenos dentro del hueco excavado; los que van sobre el terreno
        # (usan el TN de la receta de corte como piso) quedan exentos
        # REGLA DEL PROYECTO: el material es EXACTAMENTE lo que el cadista
        # configuró entre superficies. Nada de envolventes ni recortes nuestros
        # — si su receta produce algo raro, se corrige en el DWG, no aquí.
        clamp_void = False

        # espesor por nodo. Semántica de huecos como Compute Materials: una
        # superficie de la receta que NO existe en esa vertical no restringe
        # (varias recetas usan superficies parciales, p. ej. COMPONENTE
        # 11-ROCA solo bajo el box); basta UNA definida por lado. f = espesor
        # − MIN_THICK: el CERO de f es la isolínea del "choque" (daylight).
        lb = (lateral_bounds or {}).get(key)
        lb_frame = (lb == 'frame')
        if lb_frame:
            lb = None
        # ancho de SU sección por estación (interpolado a lo largo del eje)
        fband = None
        if lb_frame and frame_rows:
            fband = [_interp_rows(frame_rows, s_min + i * ds, 2) for i in range(n_s)]
        # banda de cotas de sus láminas POR PROGRESIVA (interpolada entre
        # estaciones — respeta la pendiente del canal)
        vrows = (vertical_bounds or {}).get(key)
        vband = None
        if vrows:
            vband = []
            for i in range(n_s):
                s = s_min + i * ds
                if s <= vrows[0][0]:
                    lo, hi = vrows[0][1], vrows[0][2]
                elif s >= vrows[-1][0]:
                    lo, hi = vrows[-1][1], vrows[-1][2]
                else:
                    lo, hi = vrows[-1][1], vrows[-1][2]
                    for a, b in zip(vrows, vrows[1:]):
                        if a[0] <= s <= b[0]:
                            t = (s - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
                            lo = a[1] + (b[1] - a[1]) * t
                            hi = a[2] + (b[2] - a[2]) * t
                            break
                vband.append((lo - VERTICAL_MARGIN, hi + VERTICAL_MARGIN))
        # ── NÚCLEO ÚNICO: de las cotas de las superficies en un punto a
        # (piso, techo, espesor) del material, aplicando TODAS las reglas.
        # Lo usan por igual los nodos de la grilla y el refinado exacto del
        # borde — así los dos caminos no pueden divergir jamás.
        def _tb_from(zs, off_val, vb_row, st_row):
            zb_l = [zs[n] for n in belows if n in zs]
            za_l = [zs[n] for n in aboves if n in zs]
            if not zb_l or not za_l:
                return None
            zb = min(zb_l)
            za = max(za_l)
            if clamp_void:
                vbz = [zs[n] for n in cut_ab if n in zs]
                vtz = [zs[n] for n in cut_be if n in zs]
                # el relleno solo EXISTE donde hubo hueco excavado; su piso es
                # la excavación y su techo nunca supera el terreno
                if not vbz or not vtz:
                    return None
                vb = max(vbz)
                vt = min(vtz)
                if vt - vb < MIN_THICK:
                    return None
                if vb > za:
                    za = vb
                if vt < zb:
                    zb = vt
            if vb_row:
                # banda de COTAS de sus láminas: sin faldones profundos donde
                # otra superficie más honda toma el relevo
                za = max(za, vb_row[0])
                zb = min(zb, vb_row[1])
            if kind == 'relleno' and st_row is not None:
                # el relleno NUNCA ocupa el prisma de la estructura (Box +
                # Solado): se queda con la tajada mayor y muere en sus caras
                o0, o1, z0, z1 = st_row
                if o0 <= off_val <= o1 and not (zb <= z0 + 1e-6 or za >= z1 - 1e-6):
                    up = (max(za, z1), zb)
                    lo2 = (za, min(zb, z0))
                    za, zb = up if (up[1] - up[0]) >= (lo2[1] - lo2[0]) else lo2
            return (za, zb, (zb - za) - MIN_THICK)

        # Evaluación en un punto ARBITRARIO (s, off) — la usa el refinado del
        # borde, que necesita muestrear entre nodos de la grilla.
        need = [n for n in (set(aboves) | set(belows)
                            | (set(cut_ab) | set(cut_be) if clamp_void else set()))
                if n in tins]
        st_rows_sorted = sorted(struct_rows) if struct_rows else None

        def _vband_at(s_val):
            if not vrows:
                return None
            v = _interp_rows(vrows, s_val, 2)
            return (v[0] - VERTICAL_MARGIN, v[1] + VERTICAL_MARGIN)

        def _tb_at(s_val, off_val):
            if lb and not (lb[0] <= off_val <= lb[1]):
                return None
            if fband:
                fb = _interp_rows(frame_rows, s_val, 2)
                if fb and not (fb[0] <= off_val <= fb[1]):
                    return None
            (px2, py2), (nx2, ny2) = _frame_at(axis, s_val)
            x = px2 + nx2 * off_val
            y = py2 + ny2 * off_val
            zs = {}
            for n_ in need:
                z = tins[n_].z_at(x, y)
                if z is not None:
                    zs[n_] = z
            st_row = _interp_rows(st_rows_sorted, s_val, 4) if st_rows_sorted else None
            return _tb_from(zs, off_val, _vband_at(s_val), st_row)

        top = [[None] * n_o for _ in range(n_s)]
        bot = [[None] * n_o for _ in range(n_s)]
        f = [[None] * n_o for _ in range(n_s)]
        for i in range(n_s):
            for j in range(n_o):
                off = -half + j * doff
                if lb and not (lb[0] <= off <= lb[1]):
                    continue  # fuera de la franja que el cadista dibuja
                if fband and not (fband[i][0] <= off <= fband[i][1]):
                    continue  # fuera del ancho de SU sección en esta estación
                r = _tb_from(zcache[i][j], off, vband[i] if vband else None,
                             sgrid[i] if sgrid is not None else None)
                if r is None:
                    continue
                # piso/techo se guardan SIEMPRE (aunque el espesor sea
                # negativo): así el vértice del borde interpola hasta espesor
                # cero y el sólido termina en filo, como la booleana de Civil
                # — antes se copiaba la cota del nodo interior y quedaba un
                # escalón de hasta media celda en todo el contorno.
                bot[i][j], top[i][j], f[i][j] = r

        # componentes conectadas: solo sobrevive material PEGADO al canal
        # (|off| ≤ CORE_BAND en algún nodo); las islas de ruido se descartan
        seen = [[False] * n_o for _ in range(n_s)]
        keep = [[False] * n_o for _ in range(n_s)]
        for i0 in range(n_s):
            for j0 in range(n_o):
                if seen[i0][j0] or f[i0][j0] is None or f[i0][j0] < 0:
                    continue
                comp = []
                stack = [(i0, j0)]
                seen[i0][j0] = True
                touches = False
                while stack:
                    ci, cj = stack.pop()
                    comp.append((ci, cj))
                    if True:   # sin filtro de islas: manda la franja del cadista
                        touches = True
                    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ni, nj = ci + di, cj + dj
                        if 0 <= ni < n_s and 0 <= nj < n_o and not seen[ni][nj] \
                                and f[ni][nj] is not None and f[ni][nj] >= 0:
                            seen[ni][nj] = True
                            stack.append((ni, nj))
                if touches:
                    for ci, cj in comp:
                        keep[ci][cj] = True
        for i in range(n_s):
            for j in range(n_o):
                if f[i][j] is not None and f[i][j] >= 0 and not keep[i][j]:
                    f[i][j] = None
                    top[i][j] = None
                    bot[i][j] = None

        # 2) malla recortada a la isolínea: cada celda se corta con f=0
        # (marching-squares por clipping) — el borde del sólido ES el choque
        # de topografías, no el borde de la huella TIN ni un escalón de grilla.
        vertices = []
        indices = []
        vmap = {}

        def _vtx(x, y, z):
            k2 = (round(x, 3), round(y, 3), round(z, 3))
            if k2 in vmap:
                return vmap[k2]
            vmap[k2] = len(vertices) // 3
            vertices.extend(k2)
            return vmap[k2]

        def _emit_quad(quad, open_flags):
            """Emite el prisma de un cuadro recortado a la isolínea f=0.
            quad = 4 registros (s, off, piso, techo, f) en orden CCW.
            open_flags[k] = la arista k no tiene vecino con material (va pared).
            La arista nacida del recorte SIEMPRE lleva pared (es el daylight)."""
            nonlocal volume
            fs = [c[4] for c in quad]
            if max(fs) < 0:
                return
            poly = []   # [(registro, tag_de_arista_original | -1 = daylight)]
            for k in range(4):
                A = quad[k]
                B = quad[(k + 1) % 4]
                fa, fb = A[4], B[4]
                if fa >= 0:
                    poly.append((A, k))
                if (fa >= 0) != (fb >= 0):
                    t = fa / (fa - fb)
                    P = tuple(A[m] + (B[m] - A[m]) * t for m in range(5))
                    poly.append((P, -1 if fa >= 0 else k))
            if len(poly) < 3:
                return
            tops, bots, xy = [], [], []
            for rec, _tag in poly:
                (px2, py2), (nx2, ny2) = _frame_at(axis, rec[0])
                x = px2 + nx2 * rec[1]
                y = py2 + ny2 * rec[1]
                xy.append((x, y))
                bots.append((x, y, rec[2]))
                tops.append((x, y, rec[3]))
            a2 = 0.0
            for k in range(len(xy)):
                x1, y1 = xy[k]
                x2, y2 = xy[(k + 1) % len(xy)]
                a2 += x1 * y2 - x2 * y1
            area = abs(a2) / 2.0          # área REAL en mundo (no en índices)
            th = sum(max(t[2] - b[2], 0.0) for t, b in zip(tops, bots)) / len(tops)
            volume += area * th
            ti = [_vtx(*p) for p in tops]
            bi = [_vtx(*p) for p in bots]
            for k in range(1, len(ti) - 1):
                indices.extend((ti[0], ti[k], ti[k + 1]))
                indices.extend((bi[0], bi[k + 1], bi[k]))
            m = len(poly)
            for k in range(m):
                tag = poly[k][1]
                if not (tag == -1 or open_flags[tag]):
                    continue                       # interior: sin pared
                k2 = (k + 1) % m
                indices.extend((ti[k], bi[k], bi[k2]))
                indices.extend((ti[k], bi[k2], ti[k2]))

        def _emit_patch(recs, open_w, open_e, open_lo, open_hi):
            """Emite un parche de (R x R) cuadros a partir de una matriz de
            registros (R+1 x R+1). Las paredes internas se resuelven entre
            sub-celdas; las del contorno heredan los flags del parche."""
            R = len(recs) - 1
            has = [[False] * R for _ in range(R)]
            for a in range(R):
                for b in range(R):
                    cs = (recs[a][b], recs[a + 1][b], recs[a + 1][b + 1], recs[a][b + 1])
                    has[a][b] = all(c is not None for c in cs) and max(c[4] for c in cs) >= 0
            for a in range(R):
                for b in range(R):
                    if not has[a][b]:
                        continue
                    quad = [recs[a][b], recs[a + 1][b], recs[a + 1][b + 1], recs[a][b + 1]]
                    e0 = open_lo if b == 0 else (not has[a][b - 1])
                    e1 = open_e if a == R - 1 else (not has[a + 1][b])
                    e2 = open_hi if b == R - 1 else (not has[a][b + 1])
                    e3 = open_w if a == 0 else (not has[a - 1][b])
                    _emit_quad(quad, [e0, e1, e2, e3])

        def _cell_ok(i, j):
            if i < 0 or j < 0 or i >= n_s - 1 or j >= n_o - 1:
                return False
            for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                if f[ii][jj] is None:
                    return False
            return max(f[i][j], f[i + 1][j], f[i + 1][j + 1], f[i][j + 1]) >= 0

        def _rec(i, j):
            if f[i][j] is None:
                return None
            return (s_min + i * ds, -half + j * doff, bot[i][j], top[i][j], f[i][j])

        volume = 0.0
        # Celdas que el borde del sólido ATRAVIESA: ahí la grilla no basta y se
        # remuestrean las superficies (refinado adaptativo). El resto del
        # cuerpo, donde el espesor es franco, no necesita más resolución.
        border = []
        for i in range(n_s - 1):
            for j in range(n_o - 1):
                if not _cell_ok(i, j):
                    continue
                fs = (f[i][j], f[i + 1][j], f[i + 1][j + 1], f[i][j + 1])
                if min(fs) < 0:
                    border.append((i, j))
        border_set = set(border)
        # el refinado cuesta ~R^2 evaluaciones por celda: se ajusta al tamaño
        # real del borde para que el tiempo de respuesta no se dispare
        R = 4 if len(border) <= 6000 else (3 if len(border) <= 15000 else 2)

        for i in range(n_s - 1):
            for j in range(n_o - 1):
                if not _cell_ok(i, j):
                    continue
                open_w = not _cell_ok(i - 1, j)
                open_e = not _cell_ok(i + 1, j)
                open_lo = not _cell_ok(i, j - 1)
                open_hi = not _cell_ok(i, j + 1)
                if (i, j) not in border_set:
                    _emit_patch([[_rec(i, j), _rec(i, j + 1)],
                                 [_rec(i + 1, j), _rec(i + 1, j + 1)]],
                                open_w, open_e, open_lo, open_hi)
                    continue
                # borde: submuestreo REAL de las superficies dentro de la celda
                s0 = s_min + i * ds
                o0 = -half + j * doff
                recs = []
                for a in range(R + 1):
                    row = []
                    s_val = s0 + ds * (a / R)
                    for b in range(R + 1):
                        off_val = o0 + doff * (b / R)
                        if a in (0, R) and b in (0, R):
                            row.append(_rec(i + (a // R), j + (b // R)))
                            continue
                        r2 = _tb_at(s_val, off_val)
                        row.append(None if r2 is None else (s_val, off_val, r2[0], r2[1], r2[2]))
                    recs.append(row)
                _emit_patch(recs, open_w, open_e, open_lo, open_hi)

        if not indices:
            warnings.append(f"[{key}] la receta no produce espesor en el tramo; omitido")
            continue
        bodies_by_kind[kind].append({
            'material': key,
            'label': _pretty_label(key, kind),
            'vertices': vertices,
            'indices': indices,
            'ringBases': [],
            'ringSize': 0,
            'outlines': [],
            'hatches': [],
            'midOutlines': [],
            'midHatches': [],
            'direct': False,
            'volume': round(volume, 2),
            'areas': [],
            'stations': n_s,
            'segments': 1,
        })

    return bodies_by_kind, warnings


# Caché en memoria (misma razón que el holograma: JSONB remoto + malla cara)
_SOLID_CACHE = {}
_SOLID_CACHE_MAX = 4


@civil_solids_bp.route('/api/civil/earthworks-solids', methods=['GET'])
def earthworks_solids():
    """Sólidos por topografías del frente (contrato = earthworks-mesh).

    ?scope_urn=  frente (obligatorio)
    ?all=1       incluye materiales que el cadista oculta en lámina (contractuales)
    ?ds= ?doff= ?half=  resolución de la grilla (avanzado)
    """
    try:
        from db import get_db_connection
        scope_urn = request.args.get('scope_urn') or request.args.get('model_urn')
        if not scope_urn:
            return jsonify({'error': 'Falta scope_urn'}), 400
        include_hidden = request.args.get('all') in ('1', 'true')
        try:
            ds = float(request.args.get('ds') or GRID_DS)
            doff = float(request.args.get('doff') or GRID_DOFF)
            half = float(request.args.get('half') or HALF_WIDTH)
        except ValueError:
            ds, doff, half = GRID_DS, GRID_DOFF, HALF_WIDTH
        ds = min(max(ds, 0.5), 10.0)
        doff = min(max(doff, 0.1), 5.0)
        half = min(max(half, 5.0), 60.0)

        ensure_civil_surfaces_table()
        with get_db_connection() as conn:
            cur = conn.cursor()
            # TODAS las filas: varios DWG = varias ZONAS del mismo frente
            cur.execute("""SELECT urn, data, updated_at::text FROM civil_sections
                           WHERE scope_urn = %s ORDER BY updated_at""", (scope_urn,))
            sec_rows = cur.fetchall()
            cur.execute("""SELECT urn, data, updated_at::text FROM civil_surfaces
                           WHERE scope_urn = %s""", (scope_urn,))
            surf_by_urn = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            cur.execute("""SELECT urn, data, updated_at::text FROM civil_alignments
                           WHERE scope_urn = %s ORDER BY updated_at""", (scope_urn,))
            align_rows = cur.fetchall()

        if not sec_rows:
            return jsonify({'error': 'sin-secciones', 'detail': 'Este frente no tiene secciones extraídas.'}), 404
        if not align_rows:
            return jsonify({'error': 'sin-eje', 'detail': 'Este frente no tiene alineamientos extraídos.'}), 404

        cache_key = (scope_urn, include_hidden, ds, doff, half,
                     tuple((r[0], r[2]) for r in sec_rows),
                     tuple(sorted((u, m[1]) for u, m in surf_by_urn.items())),
                     tuple((r[0], r[2]) for r in align_rows))
        cached = _SOLID_CACHE.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        # FUSIÓN por eje (misma regla que el holograma): estaciones de todas
        # las zonas; en solape manda el archivo más reciente
        from routes.civil_ghost import _fuse_station_rows, _axis_for
        rows_data = [(r[0], r[2], r[1]) for r in sec_rows if _normalize_stations(r[1])]
        if not rows_data:
            return jsonify({'error': 'sin-estaciones'}), 404
        stations, zonas, zone_warns = _fuse_station_rows(rows_data)
        counts = {}
        for st in stations:
            counts[st.get('alignmentId') or ''] = counts.get(st.get('alignmentId') or '', 0) + 1
        want_align = max(counts, key=counts.get)
        stations = [s for s in stations if (s.get('alignmentId') or '') == want_align]
        stations.sort(key=lambda s: float(s.get('station') or 0))
        pks = [float(s.get('station')) for s in stations]
        if not pks:
            return jsonify({'error': 'sin-estaciones'}), 404

        axis, _axis_urn = _axis_for([(r[0], r[2], r[1]) for r in align_rows],
                                    want_align, coherence_warns=zone_warns)
        if not axis:
            return jsonify({'error': 'sin-geometria-eje'}), 404

        # materiales que el cadista OCULTA en su lámina (misma regla del holograma)
        hidden_keys = set()
        visible_keys = set()
        for st in stations:
            for sec in st.get('sections') or []:
                if sec.get('role') != 'material':
                    continue
                k = sec.get('materialKey') or _material_key(
                    sec.get('materialName') or sec.get('name') or '')
                if sec.get('hidden'):
                    hidden_keys.add(k)
                else:
                    visible_keys.add(k)
        hidden_keys -= visible_keys   # oculto = oculto en TODAS sus apariciones

        # Delimitación del PROPIO cadista: franja de offsets (lateral) y banda
        # de cotas POR ESTACIÓN (vertical) que sus hatches ocupan en las
        # láminas (+margen). El sólido nunca las excede.
        # DOMINIO del cadista: el ANCHO DE SU SECCIÓN (marco de la Section
        # View, viewOffsetLeft/Right por estación). Es hasta donde él calcula
        # sus materiales — el sólido no puede pasar de ahí, y no hace falta
        # ninguna banda inventada por nosotros.
        frame_rows = []
        for st in stations:
            try:
                pk_st = float(st.get('station'))
                lo = float(st.get('viewOffsetLeft'))
                hi = float(st.get('viewOffsetRight'))
            except (TypeError, ValueError):
                continue
            if hi - lo > 1.0:
                frame_rows.append((pk_st, min(lo, hi), max(lo, hi)))
        frame_rows.sort()

        lat = {}
        vert = {}   # key -> {pk: (lo, hi)}
        for st in stations:
            try:
                pk_st = float(st.get('station'))
            except (TypeError, ValueError):
                continue
            for sec in st.get('sections') or []:
                if sec.get('role') != 'material':
                    continue
                k = sec.get('materialKey') or _material_key(
                    sec.get('materialName') or sec.get('name') or '')
                for p in sec.get('points') or []:
                    try:
                        o = float(p[0])
                        c = float(p[1])
                    except (TypeError, ValueError, IndexError):
                        continue
                    lo, hi = lat.get(k, (o, o))
                    lat[k] = (min(lo, o), max(hi, o))
                    vk = vert.setdefault(k, {})
                    vlo, vhi = vk.get(pk_st, (c, c))
                    vk[pk_st] = (min(vlo, c), max(vhi, c))
        if frame_rows:
            # el marco de SU sección varía por estación: se respeta como tal
            # (interpolado entre estaciones), no aplanado a un único ancho
            lateral_bounds = {k: 'frame' for k in lat}
        else:
            # sin marco guardado: la extensión de sus hatches, sin margen extra
            lateral_bounds = {k: (lo, hi) for k, (lo, hi) in lat.items()}
        vertical_bounds = {k: sorted((pk_st, v[0], v[1]) for pk_st, v in rows.items())
                           for k, rows in vert.items()}

        # ESTRUCTURA del cadista: prisma por estación desde las shapes de
        # corredor Box + Solado (bbox offset×cota) — el relleno se resta
        # contra él y queda pegado a las caras de la estructura
        struct_rows = []
        for st in stations:
            try:
                pk_st = float(st.get('station'))
            except (TypeError, ValueError):
                continue
            o0 = o1 = z0 = z1 = None
            for sec in st.get('sections') or []:
                if sec.get('role') != 'corridor':
                    continue
                nm = str(sec.get('name') or '').strip().lower()
                if nm not in ('box', 'solado'):
                    continue
                for q in sec.get('points') or []:
                    try:
                        ov, cv = float(q[0]), float(q[1])
                    except (TypeError, ValueError, IndexError):
                        continue
                    o0 = ov if o0 is None else min(o0, ov)
                    o1 = ov if o1 is None else max(o1, ov)
                    z0 = cv if z0 is None else min(z0, cv)
                    z1 = cv if z1 is None else max(z1, cv)
            if o0 is not None and o1 - o0 > 0.3 and z1 - z0 > 0.3:
                struct_rows.append((pk_st, o0, o1, z0, z1))

        # ── SÓLIDOS POR ZONA: cada archivo se evalúa con SUS recetas y SUS
        # topografías dentro de SU tramo (nunca se cruzan superficies entre
        # zonas); los cuerpos resultantes se fusionan por material.
        zonas_eje = []
        for urn, updated, data in rows_data:
            sts_z = [s for s in _normalize_stations(data)
                     if (s.get('alignmentId') or '') == want_align]
            pks_z = sorted(float(s.get('station')) for s in sts_z if s.get('station') is not None)
            if not pks_z:
                continue
            zonas_eje.append({'urn': urn, 'pk0': pks_z[0], 'pk1': pks_z[-1],
                              'recipes': (data.get('qtoRecipes') if isinstance(data, dict) else None) or []})
        zonas_eje.sort(key=lambda z: z['pk0'])

        t0 = _time.time()
        merged = {}
        covered = []
        warnings = list(zone_warns)
        any_recipes = False
        for idx, z in enumerate(zonas_eje):
            tag = f"zona …{z['urn'][-8:]} ({z['pk0']:.0f}-{z['pk1']:.0f})"
            if not z['recipes']:
                warnings.append(f'{tag}: sin recetas QTO — re-extraer secciones')
                continue
            any_recipes = True
            sm = surf_by_urn.get(z['urn'])
            tins = {}
            for s in ((sm[0] if sm else {}) or {}).get('surfaces') or []:
                try:
                    tins[s['name']] = _Tin(s['name'], s.get('vertices') or [], s.get('indices') or [])
                except Exception:
                    pass
            if not tins:
                warnings.append(f'{tag}: sin topografías extraídas — usa "Extraer topografías" en el panel Civil')
                continue
            # extensión de tapas sin invadir la zona vecina
            # el tramo del sólido es EXACTAMENTE el del cadista: de su primera
            # a su última sample line (antes le añadía 2 m por cada extremo —
            # metros que él nunca calculó)
            ext0 = ext1 = 0.0
            bodies_z, warns_z = _build_solid_bodies(
                z['recipes'], tins, axis, z['pk0'] - ext0, z['pk1'] + ext1,
                hidden_keys, include_hidden, lateral_bounds=lateral_bounds,
                vertical_bounds=None, struct_rows=None, frame_rows=frame_rows,
                ds=ds, doff=doff, half=half)
            pref = f"[…{z['urn'][-8:]}] " if len(zonas_eje) > 1 else ''
            warnings.extend(pref + w for w in warns_z)
            covered.append((z['pk0'], z['pk1']))
            for kind, bl in bodies_z.items():
                for b in bl:
                    mk = (kind, b['material'])
                    m = merged.get(mk)
                    if m is None:
                        merged[mk] = b
                    else:
                        base = len(m['vertices']) // 3
                        m['vertices'].extend(b['vertices'])
                        m['indices'].extend(i2 + base for i2 in b['indices'])
                        m['volume'] = round(m['volume'] + b['volume'], 2)
                        m['areas'].extend(b['areas'])
                        m['stations'] += b['stations']
                        m['segments'] += b['segments']

        if not any_recipes:
            return jsonify({'error': 'sin-recetas',
                            'detail': 'Ninguna zona trae recetas QTO — re-extraer secciones.'}), 404
        if not covered:
            return jsonify({'error': 'sin-superficies',
                            'detail': 'Ninguna zona tiene topografías extraídas (usa "Extraer topografías" en el panel Civil).',
                            'warnings': warnings}), 404

        bodies_by_kind = {'corte': [], 'relleno': []}
        for (kind, _mk), b in sorted(merged.items()):
            bodies_by_kind[kind].append(b)
        if len(zonas_eje) > 1:
            warnings.insert(0, 'Zonas: ' + ' · '.join(
                f"…{z['urn'][-8:]} {z['pk0']:.0f}-{z['pk1']:.0f}" for z in zonas_eje))
        if struct_rows:
            warnings.append(f'Estructura (Box+Solado) restada del relleno en {len(struct_rows)} estaciones')

        out_kinds = {}
        for kind, bodies in bodies_by_kind.items():
            if bodies:
                out_kinds[kind] = {'volume': round(sum(b['volume'] for b in bodies), 2), 'bodies': bodies}
        if not out_kinds:
            return jsonify({'error': 'sin-materiales', 'detail': 'Ninguna receta produce sólido en el tramo.',
                            'warnings': warnings}), 404

        # AUDITORÍA superficies↔cuadro: mismo material, dos métodos. Divergencia
        # grande = misma señal que los avisos de lámina (p. ej. PK 660 taludes).
        try:
            # comparar SOLO contra las zonas que sí tienen sólidos (las que
            # faltan por topografías ya tienen su aviso propio)
            stations_cov = [s for s in stations
                            if any(c0 - 0.1 <= float(s.get('station') or 0) <= c1 + 0.1
                                   for c0, c1 in covered)]
            sec_vol_by_key = {}
            totals = {}
            for kind in ('corte', 'relleno'):
                m = _build_kind_mesh(stations_cov, axis, KIND_PATTERNS[kind], flip=False, kind_name=kind)
                if m and not m.get('warnings_only'):
                    totals[kind] = m['volume']
                    for b in m['bodies']:
                        sec_vol_by_key[b['material']] = b['volume']
            resumen = []
            for kind, ok in out_kinds.items():
                ref = totals.get(kind)
                if ref:
                    d = (ok['volume'] - ref) / ref * 100
                    resumen.append(f"{kind} {ok['volume']:.0f} vs cuadro {ref:.0f} m³ ({d:+.1f}%)")
            if resumen:
                warnings.append('Superficies↔cuadro: ' + ' · '.join(resumen))
            for kind, ok in out_kinds.items():
                for b in ok['bodies']:
                    ref = sec_vol_by_key.get(b['material'])
                    if ref and abs(b['volume'] - ref) / ref > 0.15:
                        warnings.append(f"[{b['material']}] superficies {b['volume']:.0f} vs cuadro {ref:.0f} m³ "
                                        f"({(b['volume'] - ref) / ref * 100:+.0f}%) — revisar lámina/cuadro")
        except Exception:
            pass

        payload = {
            'alignmentId': want_align,
            'scope_urn': scope_urn,
            'source': 'surfaces',
            'units': 'm',
            'ringSize': 0,
            'kinds': out_kinds,
            'warnings': warnings + [
                f'Sólidos por topografía (recetas del cadista), grilla {ds:g}×{doff:g} m, {_time.time() - t0:.1f} s'
            ],
        }
        if len(_SOLID_CACHE) >= _SOLID_CACHE_MAX:
            _SOLID_CACHE.pop(next(iter(_SOLID_CACHE)))
        _SOLID_CACHE[cache_key] = payload
        return jsonify(payload), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
