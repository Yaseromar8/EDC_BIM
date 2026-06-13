"""
Comparador (contractual vs avance) — motor de diff en PostgreSQL.

La comparacion de DATOS se hace integramente en la BD por external_id (identidad
estable entre versiones/copias del mismo modelo Revit), sin transferir los JSONB:
  - agregados:   en B y no en A
  - eliminados:  en A y no en B
  - modificados: en ambos pero con properties distintas (hash md5 en SQL)

Un "scope" define cada lado:
  {type: 'frente', value: '1_CANAL'}        -> todo un frente (model_urn)
  {type: 'source', value: '<urn base64>'}   -> un modelo especifico (source_urn)

El detalle por elemento (que propiedades cambiaron) se pide bajo demanda con
/api/compare/element para no mover MBs innecesarios.
"""
import re
import base64
import urllib.parse
import requests
from flask import Blueprint, request, jsonify
from db import get_db_connection
from app_logging import get_logger

compare_bp = Blueprint('compare', __name__)
logger = get_logger('compare')

MAX_IDS = 20000  # techo de ids por lista (los ids son livianos, ~40 bytes c/u)

# Parametros DSI por slot (mismo esquema que budgetEngine.js):
#   CodigoDePartida{n} + Metrado{n} + Unidad{n}. Si no hay Metrado{n} explicito,
#   fallback al medible NATIVO segun la unidad: m3->Volume, m2->Area, m->Length,
#   und/u/pza->1 (conteo). Igual que el motor 5D del frontend.
_DSI_COD = re.compile(r'DSI_CodigoDePartida(\d)\s*$')
_DSI_MET = re.compile(r'DSI_Metrado(\d)\s*$')
_DSI_UNI = re.compile(r'DSI_Unidad(\d)\s*$')
# Medibles nativos en ingles y espanol (Revit ES usa Volumen/Área/Longitud)
_NATIVE = re.compile(r'\b(Volume|Volumen|Area|Área|Length|Longitud)\s*$', re.IGNORECASE)
_NATIVE_MAP = {'volume': 'volume', 'volumen': 'volume', 'area': 'area', 'área': 'area', 'length': 'length', 'longitud': 'length'}
_NUM = re.compile(r'-?\d+(?:[\.,]\d+)?')


def _to_float(val):
    m = _NUM.search(str(val or ''))
    if not m:
        return None
    try:
        return float(m.group(0).replace(',', '.'))
    except ValueError:
        return None


def _pivot_dsi_rows(rows):
    """(external_id, key, value) -> {ext: {codigo_partida: metrado_float}}.
    Pura (testeable sin BD). Empareja por slot y aplica fallback nativo por unidad."""
    slots = {}
    natives = {}
    for ext, key, val in rows:
        key = key or ''
        m = _DSI_COD.search(key)
        if m:
            slots.setdefault(ext, {}).setdefault(m.group(1), {})['cod'] = val
            continue
        m = _DSI_MET.search(key)
        if m:
            slots.setdefault(ext, {}).setdefault(m.group(1), {})['met'] = val
            continue
        m = _DSI_UNI.search(key)
        if m:
            slots.setdefault(ext, {}).setdefault(m.group(1), {})['uni'] = val
            continue
        m = _NATIVE.search(key)
        if m:
            f = _to_float(val)
            if f is not None:
                nat = _NATIVE_MAP.get(m.group(1).lower())
                if nat:
                    natives.setdefault(ext, {})[nat] = f

    UNIT_TO_NATIVE = {'m3': 'volume', 'm³': 'volume', 'm2': 'area', 'm²': 'area', 'm': 'length', 'ml': 'length'}
    COUNT_UNITS = {'und', 'u', 'pza', 'und.', 'glb'}

    out = {}
    for ext, by_slot in slots.items():
        for _slot, kv in by_slot.items():
            cod = (kv.get('cod') or '').strip()
            if not cod:
                continue
            met = _to_float(kv.get('met'))
            if met is None:
                uni = str(kv.get('uni') or '').strip().lower()
                if uni in COUNT_UNITS:
                    met = 1.0
                else:
                    nat_key = UNIT_TO_NATIVE.get(uni)
                    met = natives.get(ext, {}).get(nat_key) if nat_key else None
            if met is None:
                met = 0.0
            out.setdefault(ext, {})[cod] = out.get(ext, {}).get(cod, 0.0) + met
    return out


def _aggregate_por_partida(by_elem):
    """{ext: {cod: met}} -> {cod: metrado_total}. Pura."""
    agg = {}
    for _ext, cods in by_elem.items():
        for cod, met in cods.items():
            agg[cod] = agg.get(cod, 0.0) + met
    return agg


def _scope_filter(scope, alias):
    """Devuelve (condicion_sql, params) para un scope. None si es invalido."""
    if not isinstance(scope, dict):
        return None, None
    stype = scope.get('type')
    value = scope.get('value')

    if stype == 'sources':
        values = scope.get('values') or []
        if not isinstance(values, list) or not values:
            return None, None
        params = []
        for urn in values:
            if not urn:
                continue
            try:
                from routes.inventory import sanitize_urn
                sanitized = sanitize_urn(urn)
            except Exception:
                sanitized = urn
            params.extend([urn, sanitized])
        if not params:
            return None, None
        placeholders = ', '.join(['%s'] * len(params))
        return f"{alias}.source_urn IN ({placeholders})", params

    if not value:
        return None, None
    if stype == 'source':
        # source_urn se guardo sanitizado (base64 URL-safe); aceptar ambas formas
        try:
            from routes.inventory import sanitize_urn
            sanitized = sanitize_urn(value)
        except Exception:
            sanitized = value
        return f"{alias}.source_urn IN (%s, %s)", [value, sanitized]
    # default: frente completo
    return f"{alias}.model_urn = %s", [value]


@compare_bp.route('/api/compare/diff', methods=['POST'])
def compare_diff():
    data = request.get_json(silent=True) or {}
    cond_a, par_a = _scope_filter(data.get('a'), 'a')
    cond_b, par_b = _scope_filter(data.get('b'), 'b')
    if not cond_a or not cond_b:
        return jsonify({'error': 'Scopes a/b invalidos. Formato: {type: frente|source, value}'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SET statement_timeout = '60000'")

            # AGREGADOS: en B y no en A (ids + nombre para la lista clickeable)
            cur.execute(f"""
                SELECT b.external_id, b.name FROM inventory_assets b
                WHERE {cond_b} AND NOT EXISTS (
                    SELECT 1 FROM inventory_assets a WHERE {cond_a} AND a.external_id = b.external_id)
                LIMIT {MAX_IDS}
            """, par_b + par_a)
            added = [{'id': r[0], 'name': r[1]} for r in cur.fetchall()]

            # ELIMINADOS: en A y no en B
            cur.execute(f"""
                SELECT a.external_id, a.name FROM inventory_assets a
                WHERE {cond_a} AND NOT EXISTS (
                    SELECT 1 FROM inventory_assets b WHERE {cond_b} AND b.external_id = a.external_id)
                LIMIT {MAX_IDS}
            """, par_a + par_b)
            removed = [{'id': r[0], 'name': r[1]} for r in cur.fetchall()]

            # MODIFICADOS: en ambos, properties distintas. El hash se calcula EN la
            # BD (no se transfieren los JSONB). DISTINCT por si hay filas repetidas.
            cur.execute(f"""
                SELECT DISTINCT a.external_id, a.name
                FROM inventory_assets a
                JOIN inventory_assets b ON b.external_id = a.external_id AND {cond_b}
                WHERE {cond_a}
                  AND md5(a.properties::text) IS DISTINCT FROM md5(b.properties::text)
                LIMIT {MAX_IDS}
            """, par_b + par_a)
            modified = [{'id': r[0], 'name': r[1]} for r in cur.fetchall()]

            # Totales por lado (contexto del resumen)
            cur.execute(f"SELECT COUNT(*) FROM inventory_assets a WHERE {cond_a}", par_a)
            total_a = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM inventory_assets b WHERE {cond_b}", par_b)
            total_b = cur.fetchone()[0]

        return jsonify({
            'summary': {
                'total_a': total_a,
                'total_b': total_b,
                'added': len(added),
                'removed': len(removed),
                'modified': len(modified),
                'unchanged': max(total_b - len(added) - len(modified), 0),
            },
            'added': added,
            'removed': removed,
            'modified': modified,
        })
    except Exception as e:
        logger.error(f"diff fallo: {e}")
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/versions', methods=['GET'])
def compare_versions():
    """Lista las versiones ACC de un modelo vinculado (para elegir que comparar).

    ?model_id=<model_config.model_id>  ->  [{versionNumber, urn, createTime, isCurrent}]
    El urn de cada version (base64 URL-safe) es directamente cargable en el visor
    y usable como scope 'source' del diff (si esa version esta extraida).
    """
    model_id = request.args.get('model_id')
    if not model_id:
        return jsonify({'error': 'Falta model_id'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT project_id, item_id, urn, version_number FROM model_config WHERE model_id = %s", (model_id,))
            row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Modelo no encontrado'}), 404
        acc_project, item_id, current_urn, current_vnum = row

        if not acc_project or not item_id:
            # Modelo sin metadata ACC (subida local): solo la version actual
            return jsonify({'versions': [{'versionNumber': current_vnum or 1, 'urn': current_urn, 'createTime': None, 'isCurrent': True}], 'source': 'local'})

        from aps import get_internal_token
        token, err = get_internal_token()
        if err or not token:
            return jsonify({'error': 'Auth APS fallo', 'details': err}), 502

        url = f"https://developer.api.autodesk.com/data/v1/projects/{acc_project}/items/{urllib.parse.quote(item_id, safe='')}/versions"
        r = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=20)
        if not r.ok:
            return jsonify({'error': f'ACC versions fallo: {r.status_code}'}), 502

        versions = []
        for v in (r.json().get('data') or []):
            vid = v.get('id', '')
            attrs = v.get('attributes', {}) or {}
            vurn = base64.urlsafe_b64encode(vid.encode('utf-8')).decode('utf-8').rstrip('=')
            versions.append({
                'versionNumber': attrs.get('versionNumber'),
                'urn': vurn,
                'createTime': attrs.get('createTime') or attrs.get('lastModifiedTime'),
                'isCurrent': vurn == current_urn,
            })
        versions.sort(key=lambda x: x.get('versionNumber') or 0, reverse=True)
        return jsonify({'versions': versions, 'source': 'acc'})
    except Exception as e:
        logger.error(f"versions fallo: {e}")
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/prepare-version', methods=['POST'])
def compare_prepare_version():
    """Estado de traduccion (SVF) de una version, para poder comparar.

    SOLO dispara la traduccion si llega force=true (el frontend la fuerza UNA vez).
    Sin force, solo informa el estado -> evita el bucle de re-disparo infinito.

    -> {status: 'ready'|'translating'|'failed'|'not_translated', progress, detail}
    """
    data = request.get_json(silent=True) or {}
    urn = data.get('urn')
    force = bool(data.get('force'))
    if not urn:
        return jsonify({'error': 'Falta urn'}), 400
    try:
        from aps import get_internal_token
        token, err = get_internal_token()
        if err or not token:
            return jsonify({'error': 'Auth APS fallo'}), 502

        def _trigger():
            from routes.digital_twin import trigger_translation
            ok = trigger_translation(urn, token)
            logger.info(f"traduccion {'disparada' if ok else 'NO disparada'} para ...{urn[-14:]}")
            return ok

        r = requests.get(
            f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest",
            headers={'Authorization': f'Bearer {token}'}, timeout=15)

        if r.ok:
            mani = r.json() or {}
            st = mani.get('status')
            if st == 'success':
                return jsonify({'status': 'ready'})
            if st in ('inprogress', 'pending'):
                return jsonify({'status': 'translating', 'progress': mani.get('progress')})
            if st == 'failed':
                if force:
                    _trigger()
                    return jsonify({'status': 'translating', 'detail': 'reintentando traduccion'})
                # Extraer el motivo (ej. "Tr worker fail to download" = archivo no disponible)
                detail = 'la traduccion falló en Autodesk'
                for der in mani.get('derivatives', []):
                    for m in der.get('messages', []):
                        if m.get('type') == 'error':
                            detail = str(m.get('message', detail))
                            break
                return jsonify({'status': 'failed', 'detail': detail})
            # estado raro: tratar como no traducida
        elif r.status_code == 404:
            if force:
                return jsonify({'status': 'translating', 'detail': 'traduccion iniciada'}) if _trigger() \
                    else jsonify({'status': 'failed', 'detail': 'no se pudo iniciar la traduccion'})
            return jsonify({'status': 'not_translated'})
        else:
            return jsonify({'status': 'failed', 'detail': f'manifest HTTP {r.status_code}'})

        # fallback: no traducida
        if force:
            return jsonify({'status': 'translating', 'detail': 'traduccion iniciada'}) if _trigger() \
                else jsonify({'status': 'failed', 'detail': 'no se pudo iniciar la traduccion'})
        return jsonify({'status': 'not_translated'})
    except Exception as e:
        logger.error(f"prepare-version fallo: {e}")
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/cleanup', methods=['POST'])
def compare_cleanup():
    """Borra las extracciones TEMPORALES del comparador (scope '__cmp__').
    Se llama al salir del modo: no queda nada 'volando' en la BD."""
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM inventory_assets WHERE model_urn = '__cmp__'")
            n = cur.rowcount
            conn.commit()
        if n:
            logger.info(f"cleanup comparador: {n} filas temporales eliminadas")
        return jsonify({'deleted': n})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/extracted', methods=['GET'])
def compare_extracted():
    """¿Esta version (urn) tiene inventario extraido en Postgres? -> {extracted, count}.
    El frontend lo usa para decidir si dispara la extraccion temporal ('__cmp__')
    antes del diff de datos de una version historica."""
    urn = request.args.get('urn')
    if not urn:
        return jsonify({'error': 'Falta urn'}), 400
    try:
        try:
            from routes.inventory import sanitize_urn
            sanitized = sanitize_urn(urn)
        except Exception:
            sanitized = urn
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM inventory_assets WHERE source_urn IN (%s, %s)", (urn, sanitized))
            n = cur.fetchone()[0]
        return jsonify({'extracted': n > 0, 'count': n})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/metrados', methods=['POST'])
def compare_metrados():
    """Diff 5D: metrados por partida (y precios) entre los dos scopes.

    Extrae los parametros DSI (CodigoDePartida{n} + Metrado{n}) de ambos lados
    EN la BD (jsonb_each_text, sin transferir los JSONB completos), agrega por
    partida, y cruza precios unitarios desde doc_partidas para valorizar el delta.

    include_elements=true agrega el mapa por-elemento {ext: {a:{cod:met}, b:{...}}}
    para el hover sincronizado (solo recomendable comparando modelos individuales).
    """
    data = request.get_json(silent=True) or {}
    cond_a, par_a = _scope_filter(data.get('a'), 'ia')
    cond_b, par_b = _scope_filter(data.get('b'), 'ia')
    include_elements = bool(data.get('include_elements'))
    if not cond_a or not cond_b:
        return jsonify({'error': 'Scopes a/b invalidos'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SET statement_timeout = '60000'")

            def fetch_side(cond, params):
                # Escanea TODOS los grupos de properties (Civil3D usa 'PROPERTY SETS',
                # Revit usa sus propios grupos como 'Cotas' o el del shared parameter).
                cur.execute(f"""
                    SELECT ia.external_id, kv.key, kv.value
                    FROM inventory_assets ia,
                         jsonb_each(ia.properties) g,
                         jsonb_each_text(CASE WHEN jsonb_typeof(g.value) = 'object'
                                              THEN g.value ELSE '{{}}'::jsonb END) kv
                    WHERE {cond}
                      AND (kv.key ~ 'DSI_CodigoDePartida[0-9]\\s*$'
                           OR kv.key ~ 'DSI_Metrado[0-9]\\s*$'
                           OR kv.key ~ 'DSI_Unidad[0-9]\\s*$'
                           OR kv.key ~* '(Volume|Volumen|Area|Área|Length|Longitud)\\s*$')
                """, params)
                return _pivot_dsi_rows(cur.fetchall())

            elems_a = fetch_side(cond_a, par_a)
            elems_b = fetch_side(cond_b, par_b)
            agg_a = _aggregate_por_partida(elems_a)
            agg_b = _aggregate_por_partida(elems_b)

            # Precios unitarios + descripcion desde doc_partidas (catalogo del proyecto)
            codes = sorted(set(agg_a) | set(agg_b))
            precios = {}
            if codes:
                cur.execute("""
                    SELECT item, MAX(descripcion), MAX(precio_unitario), MAX(unidad)
                    FROM doc_partidas WHERE item = ANY(%s) GROUP BY item
                """, (codes,))
                for item, desc, pu, unidad in cur.fetchall():
                    precios[item] = {'descripcion': desc, 'pu': float(pu) if pu is not None else None, 'unidad': unidad}

        partidas = []
        total_delta_precio = 0.0
        for cod in codes:
            ma = round(agg_a.get(cod, 0.0), 3)
            mb = round(agg_b.get(cod, 0.0), 3)
            delta = round(mb - ma, 3)
            info = precios.get(cod, {})
            pu = info.get('pu')
            dp = round(delta * pu, 2) if pu is not None else None
            if dp is not None:
                total_delta_precio += dp
            partidas.append({
                'codigo': cod,
                'descripcion': info.get('descripcion'),
                'unidad': info.get('unidad'),
                'metrado_a': ma, 'metrado_b': mb, 'delta': delta,
                'precio_unitario': pu, 'delta_precio': dp,
            })
        # Las de mayor impacto primero
        partidas.sort(key=lambda p: abs(p['delta_precio'] if p['delta_precio'] is not None else p['delta']), reverse=True)

        resp = {
            'partidas': partidas,
            'totals': {
                'partidas': len(partidas),
                'delta_precio_total': round(total_delta_precio, 2),
                'con_precio': sum(1 for p in partidas if p['precio_unitario'] is not None),
            }
        }
        if include_elements:
            ext_ids = set(elems_a) | set(elems_b)
            resp['byElement'] = {
                ext: {'a': elems_a.get(ext), 'b': elems_b.get(ext)} for ext in ext_ids
            }
        return jsonify(resp)
    except Exception as e:
        logger.error(f"metrados diff fallo: {e}")
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/element-metrados', methods=['POST'])
def compare_element_metrados():
    """Diff 5D por elemento bajo demanda.

    Evita enviar el mapa completo {external_id -> metrados} al frontend cuando el
    usuario solo necesita el tooltip del elemento bajo hover.
    """
    data = request.get_json(silent=True) or {}
    ext_id = data.get('external_id')
    cond_a, par_a = _scope_filter(data.get('a'), 'ia')
    cond_b, par_b = _scope_filter(data.get('b'), 'ia')
    if not ext_id or not cond_a or not cond_b:
        return jsonify({'error': 'Faltan external_id o scopes a/b'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SET statement_timeout = '30000'")

            def fetch_side(cond, params):
                cur.execute(f"""
                    SELECT ia.external_id, kv.key, kv.value
                    FROM inventory_assets ia,
                         jsonb_each(ia.properties) g,
                         jsonb_each_text(CASE WHEN jsonb_typeof(g.value) = 'object'
                                              THEN g.value ELSE '{{}}'::jsonb END) kv
                    WHERE {cond}
                      AND ia.external_id = %s
                      AND (kv.key ~ 'DSI_CodigoDePartida[0-9]\\s*$'
                           OR kv.key ~ 'DSI_Metrado[0-9]\\s*$'
                           OR kv.key ~ 'DSI_Unidad[0-9]\\s*$'
                           OR kv.key ~* '(Volume|Volumen|Area|Ãrea|Length|Longitud)\\s*$')
                """, params + [ext_id])
                return _pivot_dsi_rows(cur.fetchall()).get(ext_id, {})

            side_a = fetch_side(cond_a, par_a)
            side_b = fetch_side(cond_b, par_b)

        return jsonify({'external_id': ext_id, 'a': side_a, 'b': side_b})
    except Exception as e:
        logger.error(f"element metrados diff fallo: {e}")
        return jsonify({'error': str(e)}), 500


@compare_bp.route('/api/compare/element', methods=['POST'])
def compare_element():
    """Detalle bajo demanda: properties del elemento en ambos scopes, para que el
    frontend muestre que cambio (A vs B) al hacer click en un elemento."""
    data = request.get_json(silent=True) or {}
    ext_id = data.get('external_id')
    cond_a, par_a = _scope_filter(data.get('a'), 'ia')
    cond_b, par_b = _scope_filter(data.get('b'), 'ia')
    if not ext_id or not cond_a or not cond_b:
        return jsonify({'error': 'Faltan external_id o scopes a/b'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            def fetch(cond, params):
                cur.execute(
                    f"SELECT name, properties FROM inventory_assets ia WHERE {cond} AND ia.external_id = %s LIMIT 1",
                    params + [ext_id])
                row = cur.fetchone()
                return {'name': row[0], 'properties': row[1]} if row else None

            side_a = fetch(cond_a, par_a)
            side_b = fetch(cond_b, par_b)

        return jsonify({'external_id': ext_id, 'a': side_a, 'b': side_b})
    except Exception as e:
        logger.error(f"element diff fallo: {e}")
        return jsonify({'error': str(e)}), 500
