"""Flujos de revisión y aprobación de documentos (ISO 19650 / estilo ACC Reviews).

Una revisión congela una lista de documentos (con su versión) y una secuencia
de revisores. Cada paso aprueba o rechaza con comentario (trazable en history).
Al aprobar el último paso, los documentos transicionan al estado ISO final.
"""
import json
import traceback
from datetime import datetime, timezone
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
        # Con que autorizacion queda emitido lo que se apruebe, y cuando se cerro
        # la revision. Ante "cuando se aprobo este plano" no habia respuesta: el
        # historial guardaba quien y en que paso, pero ninguna fecha.
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS codigo_idoneidad VARCHAR(10)')
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMP WITH TIME ZONE')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _puede_con_estos_documentos(user, model_urn, items, nivel, accion):
    """Comprueba obra y permiso de carpeta sobre CADA documento de la revision.

    Devuelve None si puede, o la respuesta de error. Aqui no habia ninguna
    comprobacion: ni de obra ni de carpeta. Una revision es el camino por el que
    un documento acaba publicado, asi que sin esto era la puerta de atras.
    """
    from routes.documents import verify_project_access
    from folder_permissions import check_folder_permission

    if not user:
        return jsonify({"success": False, "error": "Autenticación requerida"}), 401
    if not verify_project_access(user, model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    for it in (items or []):
        node_id = it.get('node_id') if isinstance(it, dict) else it
        if not node_id:
            continue
        negado = check_folder_permission(user, node_id, model_urn, nivel, accion)
        if negado:
            return negado
    return None


def _row_to_dict(r):
    return {
        "id": r[0], "model_urn": r[1], "title": r[2], "items": r[3],
        "steps": r[4], "current_step": r[5], "status": r[6],
        "final_status": r[7], "history": r[8] or [],
        "created_by": r[9], "created_at": r[10].isoformat() if r[10] else None,
        "codigo_idoneidad": r[11] if len(r) > 11 else None,
        "cerrada_en": r[12].isoformat() if len(r) > 12 and r[12] else None,
    }


@reviews_bp.route('/api/reviews', methods=['GET'])
def list_reviews():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    # Las revisiones de una obra dicen que planos hay y quien los aprueba: se
    # leian cambiando el ?model_urn.
    from routes.documents import verify_project_access
    if not verify_project_access(_user(), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at,
                                  codigo_idoneidad, cerrada_en
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
    final_status = d.get('final_status', ecd.SHARED)
    if final_status not in FINAL_STATUSES:
        return jsonify({"success": False, "error": f"final_status debe ser {FINAL_STATUSES}"}), 400
    u = _user()
    # Este modulo no comprobaba NADA: ni que la obra fuera tuya, ni que tuvieras
    # permiso sobre los documentos. Cualquiera con sesion podia crear una revision
    # sobre planos de otra obra, ponerse a si mismo de revisor y publicarlos.
    negado = _puede_con_estos_documentos(u, d['model_urn'], items, 'edit',
                                         'incluir documentos en una revisión')
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Se valida AL CREAR, no al aprobar: enterarse de que el código no
            # sirve cuando ya han firmado tres revisores es tarde y humillante.
            from idoneidad import validar_para
            vale, motivo = validar_para(cur, d['model_urn'],
                                        d.get('codigo_idoneidad'), final_status)
            if not vale:
                return jsonify({"success": False, "error": motivo}), 400
            cur.execute("""INSERT INTO doc_reviews (model_urn, title, items, steps, final_status,
                                                    created_by, history, codigo_idoneidad)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['model_urn'], d['title'], json.dumps(items), json.dumps(steps),
                         final_status, u.get('email') or u.get('name'),
                         json.dumps([{"event": "created", "by": u.get('email') or u.get('name'),
                                      "at": datetime.now(timezone.utc).isoformat()}]),
                         (d.get('codigo_idoneidad') or '').strip().upper() or None))
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
                                  final_status, history, created_by, created_at,
                                  codigo_idoneidad, cerrada_en
                           FROM doc_reviews WHERE id = %s FOR UPDATE""", (rid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Revisión no encontrada"}), 404
            rev = _row_to_dict(row)
            # La obra sale de la revision guardada, no de lo que mande el cliente.
            from routes.documents import verify_project_access
            if not verify_project_access(u, rev['model_urn']):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
            if rev['status'] != 'pending':
                return jsonify({"success": False, "error": f"La revisión ya está {rev['status']}"}), 409

            step = rev['steps'][rev['current_step']]
            is_reviewer = (u.get('email') and u.get('email') == step.get('email')) or \
                          (u.get('name') and u.get('name') == step.get('name'))
            if not is_reviewer and u.get('role') != 'admin':
                return jsonify({"success": False, "error": f"Este paso corresponde a {step.get('name') or step.get('email')}"}), 403

            # CON FECHA. Cada acto de aprobacion o rechazo tiene que quedar
            # fechado: es la primera pregunta de una supervision, y hasta ahora la
            # unica forma de reconstruirla era mirar la fila correlativa del
            # registro de actividad y suponer.
            entry = {"event": action, "step": rev['current_step'],
                     "by": u.get('email') or u.get('name'), "comment": comment,
                     "at": datetime.now(timezone.utc).isoformat()}
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
                cur.execute("UPDATE doc_reviews SET status='approved', history=%s, "
                            "cerrada_en=CURRENT_TIMESTAMP WHERE id=%s",
                            (json.dumps(history), rid))
                ids = [it.get('node_id') for it in rev['items'] if it.get('node_id')]
                destino = ecd.normalizar(rev['final_status'])
                # Publicar es un acto de autoridad tambien por esta via: quien
                # aprueba el ultimo paso tiene que mandar de verdad sobre la
                # carpeta del documento, no solo estar apuntado como revisor.
                nivel = 'admin' if destino in ecd.REQUIEREN_AUTORIDAD else 'edit'
                from folder_permissions import check_folder_permission

                def _autorizado(node_id):
                    return check_folder_permission(
                        u, node_id, rev['model_urn'], nivel,
                        f"aprobar como {ecd.ETIQUETAS.get(destino, destino)}") is None

                # La idoneidad la fija la revision al crearse, pero quien aprueba
                # puede indicarla si falta. Sin esto, las revisiones que YA estan
                # en marcha con destino Publicado -- creadas antes de que existiera
                # el campo -- no se podrian aprobar nunca: el codigo llegaria vacio
                # y la puerta las rechazaria una y otra vez, sin salida.
                idoneidad = (rev.get('codigo_idoneidad')
                             or (d.get('codigo_idoneidad') or '').strip().upper() or None)
                try:
                    ecd.transicionar_recorriendo(
                        cur, rev['model_urn'], ids, destino, u,
                        motivo_del_cambio=f"revisión #{rid}: {rev['title']}",
                        autorizar=_autorizado,
                        codigo_idoneidad=idoneidad)
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
