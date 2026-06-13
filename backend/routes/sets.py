"""Conjuntos (Sets) de documentos por entrega/hito (estilo ACC Sets).

Un set agrupa documentos con su versión CONGELADA al momento de añadirlos:
la foto exacta de una entrega ("Entrega 30%", "Rev B"), aunque los archivos
sigan evolucionando después.
"""
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity

sets_bp = Blueprint('sets', __name__)


def ensure_sets_tables():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_sets (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (model_urn, name)
            )''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_set_items (
                set_id INTEGER NOT NULL REFERENCES doc_sets(id) ON DELETE CASCADE,
                node_id TEXT NOT NULL,
                name TEXT,
                version_number INTEGER,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (set_id, node_id)
            )''')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


@sets_bp.route('/api/sets', methods=['GET'])
def list_sets():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT s.id, s.name, s.description, s.created_by, s.created_at, COUNT(i.node_id)
                           FROM doc_sets s LEFT JOIN doc_set_items i ON i.set_id = s.id
                           WHERE s.model_urn = %s
                           GROUP BY s.id ORDER BY s.id DESC""", (model_urn,))
            sets = [{"id": r[0], "name": r[1], "description": r[2], "created_by": r[3],
                     "created_at": r[4].isoformat() if r[4] else None, "items_count": r[5]}
                    for r in cur.fetchall()]
        return jsonify({"success": True, "sets": sets})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets', methods=['POST'])
def create_set():
    d = request.get_json() or {}
    if not d.get('model_urn') or not d.get('name'):
        return jsonify({"success": False, "error": "Faltan model_urn/name"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_sets (model_urn, name, description, created_by)
                           VALUES (%s,%s,%s,%s) ON CONFLICT (model_urn, name) DO NOTHING RETURNING id""",
                        (d['model_urn'], d['name'].strip(), d.get('description', ''), _user().get('name')))
            row = cur.fetchone()
            conn.commit()
        if not row:
            return jsonify({"success": False, "error": "Ya existe un conjunto con ese nombre"}), 409
        log_activity(d['model_urn'], 'set_created', 'set', entity_id=str(row[0]),
                     entity_name=d['name'], performed_by=_user().get('name'))
        return jsonify({"success": True, "id": row[0]})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>', methods=['DELETE'])
def delete_set(set_id):
    if _user().get('role') != 'admin':
        return jsonify({"success": False, "error": "Solo administradores."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM doc_sets WHERE id = %s", (set_id,))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items', methods=['GET'])
def get_set_items(set_id):
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT node_id, name, version_number, added_at
                           FROM doc_set_items WHERE set_id = %s ORDER BY name""", (set_id,))
            items = [{"node_id": r[0], "name": r[1], "version_number": r[2],
                      "added_at": r[3].isoformat() if r[3] else None} for r in cur.fetchall()]
        return jsonify({"success": True, "items": items})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items', methods=['POST'])
def add_set_items(set_id):
    d = request.get_json() or {}
    items = d.get('items') or []
    if not items:
        return jsonify({"success": False, "error": "Faltan items"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            for it in items:
                cur.execute("""INSERT INTO doc_set_items (set_id, node_id, name, version_number)
                               VALUES (%s,%s,%s,%s)
                               ON CONFLICT (set_id, node_id) DO UPDATE SET
                                 version_number = EXCLUDED.version_number, name = EXCLUDED.name""",
                            (set_id, it['node_id'], it.get('name'), it.get('version', 1)))
            conn.commit()
        return jsonify({"success": True, "added": len(items)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items/<node_id>', methods=['DELETE'])
def remove_set_item(set_id, node_id):
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM doc_set_items WHERE set_id = %s AND node_id = %s", (set_id, node_id))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
