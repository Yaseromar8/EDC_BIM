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
from flask import Blueprint, request, jsonify
from db import get_db_connection
from app_logging import get_logger

compare_bp = Blueprint('compare', __name__)
logger = get_logger('compare')

MAX_IDS = 20000  # techo de ids por lista (los ids son livianos, ~40 bytes c/u)


def _scope_filter(scope, alias):
    """Devuelve (condicion_sql, params) para un scope. None si es invalido."""
    if not isinstance(scope, dict):
        return None, None
    stype = scope.get('type')
    value = scope.get('value')
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
