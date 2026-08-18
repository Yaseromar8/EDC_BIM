"""Herramientas de ingeniería sobre PDF: anotaciones (markups) y calibración de escala.

Las geometrías se guardan en coordenadas del espacio PDF (puntos, origen
abajo-izquierda) para que sean independientes del zoom/rotación del visor.
"""
from esquema_congelado import solo_con_ddl
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection
from perimetro_de_obra import guardia_de_recurso

pdf_tools_bp = Blueprint('pdf_tools', __name__)


@solo_con_ddl
def ensure_pdf_tools_tables():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS pdf_markups (
                id SERIAL PRIMARY KEY,
                file_node_id INTEGER NOT NULL,
                model_urn TEXT NOT NULL,
                page INTEGER NOT NULL,
                kind TEXT NOT NULL,
                geometry JSONB NOT NULL,
                style JSONB DEFAULT '{}'::jsonb,
                text_content TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_pdf_markups_node_page ON pdf_markups(file_node_id, page)')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS pdf_calibrations (
                file_node_id INTEGER NOT NULL,
                page INTEGER NOT NULL,
                units_per_pdf DOUBLE PRECISION NOT NULL,
                display_unit TEXT DEFAULT 'm',
                updated_by TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (file_node_id, page)
            )''')
        conn.commit()


def _user():
    u = getattr(g, 'current_user', None)
    return (u or {})


@pdf_tools_bp.route('/api/pdf/markups', methods=['GET'])
def list_markups():
    node_id = request.args.get('node_id')
    page = request.args.get('page')
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    # Las ESCRITURAS de este blueprint llevaban guardia desde el principio; las
    # LECTURAS no, asi que cualquier sesion leia las marcas de cualquier obra
    # -- y una nube de revision o una medicion dice tanto del plano como el
    # plano mismo. La misma guardia que ya usa el POST de aqui al lado.
    negativa = guardia_de_recurso('file_nodes', node_id)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            if page:
                cur.execute("""SELECT id, page, kind, geometry, style, text_content, created_by, created_at
                               FROM pdf_markups WHERE file_node_id = %s AND page = %s ORDER BY id""",
                            (node_id, page))
            else:
                cur.execute("""SELECT id, page, kind, geometry, style, text_content, created_by, created_at
                               FROM pdf_markups WHERE file_node_id = %s ORDER BY id""", (node_id,))
            rows = [{
                "id": r[0], "page": r[1], "kind": r[2], "geometry": r[3],
                "style": r[4] or {}, "text": r[5], "created_by": r[6],
                "created_at": r[7].isoformat() if r[7] else None
            } for r in cur.fetchall()]
        return jsonify({"success": True, "markups": rows})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups', methods=['POST'])
def create_markup():
    d = request.get_json() or {}
    required = ('node_id', 'model_urn', 'page', 'kind', 'geometry')
    if any(k not in d for k in required):
        return jsonify({"success": False, "error": f"Faltan campos {required}"}), 400
    # Se comprueba contra el NODO del documento, no contra el model_urn del
    # cuerpo: el model_urn lo elige quien llama, el nodo dice de que obra es.
    negativa = guardia_de_recurso('file_nodes', d['node_id'])
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO pdf_markups (file_node_id, model_urn, page, kind, geometry, style, text_content, created_by)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['node_id'], d['model_urn'], d['page'], d['kind'],
                         json.dumps(d['geometry']), json.dumps(d.get('style') or {}),
                         d.get('text'), _user().get('name') or d.get('user')))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"success": True, "id": new_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>', methods=['DELETE'])
def delete_markup(markup_id):
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    try:
        u = _user()
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Cada quien borra lo suyo; admin borra todo
            if u.get('role') == 'admin':
                cur.execute("DELETE FROM pdf_markups WHERE id = %s", (markup_id,))
            else:
                cur.execute("DELETE FROM pdf_markups WHERE id = %s AND created_by = %s",
                            (markup_id, u.get('name')))
            deleted = cur.rowcount
            conn.commit()
        if not deleted:
            return jsonify({"success": False, "error": "No encontrado o sin permiso"}), 403
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/calibration', methods=['GET'])
def get_calibration():
    node_id = request.args.get('node_id')
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    negativa = guardia_de_recurso('file_nodes', node_id)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT page, units_per_pdf, display_unit FROM pdf_calibrations WHERE file_node_id = %s",
                        (node_id,))
            cals = {str(r[0]): {"units_per_pdf": r[1], "display_unit": r[2]} for r in cur.fetchall()}
        return jsonify({"success": True, "calibrations": cals})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/calibration', methods=['PUT'])
def set_calibration():
    d = request.get_json() or {}
    if any(k not in d for k in ('node_id', 'page', 'units_per_pdf')):
        return jsonify({"success": False, "error": "Faltan node_id/page/units_per_pdf"}), 400
    # La calibracion decide a cuantos metros equivale un pixel del plano: con
    # ella se miden longitudes. No puede ajustarla quien no es de la obra.
    negativa = guardia_de_recurso('file_nodes', d['node_id'])
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO pdf_calibrations (file_node_id, page, units_per_pdf, display_unit, updated_by)
                           VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (file_node_id, page) DO UPDATE SET
                             units_per_pdf = EXCLUDED.units_per_pdf,
                             display_unit = EXCLUDED.display_unit,
                             updated_by = EXCLUDED.updated_by,
                             updated_at = CURRENT_TIMESTAMP""",
                        (d['node_id'], d['page'], d['units_per_pdf'],
                         d.get('display_unit', 'm'), _user().get('name')))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
