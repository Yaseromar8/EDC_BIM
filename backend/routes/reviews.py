"""Flujos de revisión y aprobación de documentos (ISO 19650 / estilo ACC Reviews).

Una revisión congela una lista de documentos (con su versión) y una secuencia
de revisores. Cada paso aprueba o rechaza con comentario (trazable en history).
Al aprobar el último paso, los documentos transicionan al estado ISO final.
"""
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity
import estados_ecd as ecd

reviews_bp = Blueprint('reviews', __name__)

FINAL_STATUSES = (ecd.SHARED, ecd.PUBLISHED)


def ensure_reviews_table():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_reviews (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                title TEXT NOT NULL,
                items JSONB NOT NULL,
                steps JSONB NOT NULL,
                current_step INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                final_status TEXT DEFAULT 'SHARED',
                history JSONB DEFAULT '[]'::jsonb,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_doc_reviews_urn ON doc_reviews(model_urn)')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _row_to_dict(r):
    return {
        "id": r[0], "model_urn": r[1], "title": r[2], "items": r[3],
        "steps": r[4], "current_step": r[5], "status": r[6],
        "final_status": r[7], "history": r[8] or [],
        "created_by": r[9], "created_at": r[10].isoformat() if r[10] else None
    }


@reviews_bp.route('/api/reviews', methods=['GET'])
def list_reviews():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at
                           FROM doc_reviews WHERE model_urn = %s ORDER BY id DESC LIMIT 200""",
                        (model_urn,))
            data = [_row_to_dict(r) for r in cur.fetchall()]
        return jsonify({"success": True, "reviews": data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews', methods=['POST'])
def create_review():
    d = request.get_json() or {}
    items, steps = d.get('items') or [], d.get('steps') or []
    if not d.get('model_urn') or not d.get('title') or not items or not steps:
        return jsonify({"success": False, "error": "Faltan model_urn/title/items/steps"}), 400
    final_status = d.get('final_status', 'SHARED')
    if final_status not in FINAL_STATUSES:
        return jsonify({"success": False, "error": f"final_status debe ser {FINAL_STATUSES}"}), 400
    u = _user()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_reviews (model_urn, title, items, steps, final_status, created_by, history)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['model_urn'], d['title'], json.dumps(items), json.dumps(steps),
                         final_status, u.get('name') or d.get('user'),
                         json.dumps([{"event": "created", "by": u.get('name'), "at": None}])))
            rid = cur.fetchone()[0]
            conn.commit()
        log_activity(d['model_urn'], 'review_created', 'review', entity_id=str(rid),
                     entity_name=d['title'], performed_by=u.get('name'))
        return jsonify({"success": True, "id": rid})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews/<int:rid>/act', methods=['POST'])
def act_on_review(rid):
    """Aprueba o rechaza el paso actual. Solo el revisor asignado (o un admin)."""
    d = request.get_json() or {}
    action = d.get('action')
    comment = (d.get('comment') or '').strip()
    if action not in ('approve', 'reject'):
        return jsonify({"success": False, "error": "action debe ser approve|reject"}), 400
    u = _user()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at
                           FROM doc_reviews WHERE id = %s FOR UPDATE""", (rid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Revisión no encontrada"}), 404
            rev = _row_to_dict(row)
            if rev['status'] != 'pending':
                return jsonify({"success": False, "error": f"La revisión ya está {rev['status']}"}), 409

            step = rev['steps'][rev['current_step']]
            is_reviewer = (u.get('email') and u.get('email') == step.get('email')) or \
                          (u.get('name') and u.get('name') == step.get('name'))
            if not is_reviewer and u.get('role') != 'admin':
                return jsonify({"success": False, "error": f"Este paso corresponde a {step.get('name') or step.get('email')}"}), 403

            entry = {"event": action, "step": rev['current_step'],
                     "by": u.get('name') or u.get('email'), "comment": comment}
            history = rev['history'] + [entry]

            if action == 'reject':
                cur.execute("UPDATE doc_reviews SET status='rejected', history=%s WHERE id=%s",
                            (json.dumps(history), rid))
            elif rev['current_step'] + 1 < len(rev['steps']):
                cur.execute("UPDATE doc_reviews SET current_step=%s, history=%s WHERE id=%s",
                            (rev['current_step'] + 1, json.dumps(history), rid))
            else:
                # Ultimo paso aprobado: los documentos avanzan al estado final.
                #
                # Esto era un UPDATE directo a file_nodes que se saltaba la maquina
                # de estados entera: por aqui un documento pasaba a Publicado sin
                # haber estado nunca Compartido, y el registro no decia de donde
                # venia. Ahora va por la misma puerta que el resto
                # (backend/estados_ecd.py), que valida el camino y deja UNA linea
                # de auditoria por documento, con su nombre y su estado anterior.
                cur.execute("UPDATE doc_reviews SET status='approved', history=%s WHERE id=%s",
                            (json.dumps(history), rid))
                ids = [it.get('node_id') for it in rev['items'] if it.get('node_id')]
                try:
                    ecd.transicionar_recorriendo(
                        cur, rev['model_urn'], ids, ecd.normalizar(rev['final_status']), u,
                        motivo_del_cambio=f"revisión #{rid}: {rev['title']}")
                except ecd.TransicionRechazada as rechazo:
                    conn.rollback()
                    return jsonify({"success": False, "error": rechazo.motivo}), 409
            conn.commit()

        log_activity(rev['model_urn'], f'review_{action}', 'review', entity_id=str(rid),
                     entity_name=rev['title'], performed_by=u.get('name'),
                     details={"step": rev['current_step'], "comment": comment})
        return jsonify({"success": True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
