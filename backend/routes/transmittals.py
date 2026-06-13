"""Transmittals: emisión formal de documentos (estilo ACC).

Registro INMUTABLE de qué documentos (y en qué versión) se emitieron,
a quién, cuándo y por quién. No hay update ni delete: es evidencia contractual.
"""
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity

transmittals_bp = Blueprint('transmittals', __name__)


def ensure_transmittals_table():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS transmittals (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                number INTEGER NOT NULL,
                subject TEXT NOT NULL,
                message TEXT,
                recipients JSONB NOT NULL,
                items JSONB NOT NULL,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_transmittals_urn ON transmittals(model_urn)')
        conn.commit()


@transmittals_bp.route('/api/transmittals', methods=['GET'])
def list_transmittals():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, number, subject, message, recipients, items, created_by, created_at
                           FROM transmittals WHERE model_urn = %s ORDER BY number DESC LIMIT 200""",
                        (model_urn,))
            data = [{
                "id": r[0], "number": r[1], "subject": r[2], "message": r[3],
                "recipients": r[4], "items": r[5], "created_by": r[6],
                "created_at": r[7].isoformat() if r[7] else None
            } for r in cur.fetchall()]
        return jsonify({"success": True, "transmittals": data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@transmittals_bp.route('/api/transmittals', methods=['POST'])
def create_transmittal():
    d = request.get_json() or {}
    if not d.get('model_urn') or not d.get('subject') or not d.get('items') or not d.get('recipients'):
        return jsonify({"success": False, "error": "Faltan model_urn/subject/items/recipients"}), 400
    u = getattr(g, 'current_user', None) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Numeración secuencial por proyecto (TR-001, TR-002, ...)
            cur.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM transmittals WHERE model_urn = %s",
                        (d['model_urn'],))
            number = cur.fetchone()[0]
            cur.execute("""INSERT INTO transmittals (model_urn, number, subject, message, recipients, items, created_by)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['model_urn'], number, d['subject'], d.get('message', ''),
                         json.dumps(d['recipients']), json.dumps(d['items']),
                         u.get('name') or d.get('user')))
            tid = cur.fetchone()[0]
            conn.commit()
        log_activity(d['model_urn'], 'transmittal_created', 'transmittal', entity_id=str(tid),
                     entity_name=f"TR-{number:03d} {d['subject']}", performed_by=u.get('name'))
        return jsonify({"success": True, "id": tid, "number": number})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
