"""Atributos personalizados por proyecto (estilo ACC Custom Attributes).

Definiciones a nivel proyecto (Disciplina, Código de plano, ...) y valores
por documento. Tipos: text, number, date, select (con opciones).
"""
from esquema_congelado import solo_con_ddl
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection

attributes_bp = Blueprint('attributes', __name__)

VALID_TYPES = ('text', 'number', 'date', 'select')


def _u():
    return getattr(g, 'current_user', None)


def _hay_acceso(model_urn):
    from routes.documents import verify_project_access
    return verify_project_access(_u(), model_urn)


def _obra_del_nodo(node_id):
    """La obra de un documento sale del documento, no de la petición.

    Los dos endpoints de valores solo reciben node_id, así que no había obra que
    comprobar y no comprobaban ninguna: con una sesión válida se podían leer y
    reescribir los atributos de cualquier documento de cualquier obra.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn FROM file_nodes WHERE id = %s", (str(node_id),))
        fila = cur.fetchone()
    return fila[0] if fila else None


def _guardia_del_nodo(node_id, nivel, accion):
    """Devuelve None si se puede seguir, o la respuesta de error."""
    from folder_permissions import check_folder_permission
    obra = _obra_del_nodo(node_id)
    if not obra:
        return jsonify({"success": False, "error": "El documento no existe."}), 404
    if not _hay_acceso(obra):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    return check_folder_permission(_u(), node_id, obra, nivel, accion)


@solo_con_ddl
def ensure_attributes_tables():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS custom_attr_defs (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                name TEXT NOT NULL,
                attr_type TEXT NOT NULL DEFAULT 'text',
                options JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (model_urn, name)
            )''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS custom_attr_values (
                node_id TEXT NOT NULL,
                attr_id INTEGER NOT NULL REFERENCES custom_attr_defs(id) ON DELETE CASCADE,
                value TEXT,
                PRIMARY KEY (node_id, attr_id)
            )''')
        conn.commit()


def _is_admin():
    u = getattr(g, 'current_user', None) or {}
    return u.get('role') == 'admin'


@attributes_bp.route('/api/attrs/defs', methods=['GET'])
def list_defs():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, name, attr_type, options FROM custom_attr_defs WHERE model_urn = %s ORDER BY id",
                        (model_urn,))
            defs = [{"id": r[0], "name": r[1], "attr_type": r[2], "options": r[3] or []} for r in cur.fetchall()]
        return jsonify({"success": True, "defs": defs})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@attributes_bp.route('/api/attrs/defs', methods=['POST'])
def create_def():
    if not _is_admin():
        return jsonify({"success": False, "error": "Solo administradores definen atributos."}), 403
    d = request.get_json() or {}
    if not d.get('model_urn') or not d.get('name'):
        return jsonify({"success": False, "error": "Faltan model_urn/name"}), 400
    attr_type = d.get('attr_type', 'text')
    if attr_type not in VALID_TYPES:
        return jsonify({"success": False, "error": f"attr_type debe ser {VALID_TYPES}"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO custom_attr_defs (model_urn, name, attr_type, options)
                           VALUES (%s,%s,%s,%s) ON CONFLICT (model_urn, name) DO NOTHING RETURNING id""",
                        (d['model_urn'], d['name'].strip(), attr_type, json.dumps(d.get('options') or [])))
            row = cur.fetchone()
            conn.commit()
        if not row:
            return jsonify({"success": False, "error": "Ya existe un atributo con ese nombre"}), 409
        return jsonify({"success": True, "id": row[0]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@attributes_bp.route('/api/attrs/defs/<int:attr_id>', methods=['DELETE'])
def delete_def(attr_id):
    if not _is_admin():
        return jsonify({"success": False, "error": "Solo administradores."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM custom_attr_defs WHERE id = %s", (attr_id,))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@attributes_bp.route('/api/attrs/values', methods=['GET'])
def get_values():
    node_id = request.args.get('node_id')
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    negado = _guardia_del_nodo(node_id, 'viewer', 'ver los atributos')
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT attr_id, value FROM custom_attr_values WHERE node_id = %s", (node_id,))
            values = {str(r[0]): r[1] for r in cur.fetchall()}
        return jsonify({"success": True, "values": values})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@attributes_bp.route('/api/attrs/values', methods=['PUT'])
def set_values():
    d = request.get_json() or {}
    node_id, values = d.get('node_id'), d.get('values') or {}
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    negado = _guardia_del_nodo(node_id, 'edit', 'cambiar los atributos')
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            for attr_id, value in values.items():
                if value is None or value == '':
                    cur.execute("DELETE FROM custom_attr_values WHERE node_id = %s AND attr_id = %s",
                                (node_id, int(attr_id)))
                else:
                    cur.execute("""INSERT INTO custom_attr_values (node_id, attr_id, value)
                                   VALUES (%s,%s,%s)
                                   ON CONFLICT (node_id, attr_id) DO UPDATE SET value = EXCLUDED.value""",
                                (node_id, int(attr_id), str(value)))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
