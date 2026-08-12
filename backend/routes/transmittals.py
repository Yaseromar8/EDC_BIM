"""Transmittals: emisión formal de documentos (estilo ACC).

Registro INMUTABLE de qué documentos (y en qué versión) se emitieron,
a quién, cuándo y por quién. No hay update ni delete: es evidencia contractual.
"""
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity

transmittals_bp = Blueprint('transmittals', __name__)


def _hay_acceso(model_urn):
    """¿La sesión pertenece a esta obra? Mismo criterio que usa reviews.py."""
    from routes.documents import verify_project_access
    return verify_project_access(getattr(g, 'current_user', None), model_urn)


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
        # A quien se AVISO de verdad. Sin esto, el registro decia "emitido a
        # Fulano" sin que a Fulano le llegara nada: la lista de destinatarios es
        # una intencion, esta columna es lo que ocurrio.
        cur.execute('ALTER TABLE transmittals ADD COLUMN IF NOT EXISTS notificado JSONB')
        # ACUSE DE RECIBO. Un transmittal sin acuse prueba el ENVIO, no la
        # ENTREGA: en ISO 19650 y en un contrato, "yo te lo mande" y "tu lo
        # recibiste" son dos hechos distintos, y el segundo es el que cuenta. Lista
        # de {por, en} que solo CRECE (nadie borra un acuse), coherente con que la
        # tabla es evidencia inmutable.
        cur.execute("ALTER TABLE transmittals ADD COLUMN IF NOT EXISTS acuses JSONB DEFAULT '[]'::jsonb")
        conn.commit()


def _avisar_a_los_destinatarios(numero, asunto, mensaje, destinatarios, items, emisor):
    """Manda el correo de emision. Devuelve la lista de lo que paso con cada uno.

    NUNCA levanta: si el correo falla, el transmittal se emite igual y queda
    escrito que a esa persona no le llego. Lo contrario -perder la emision
    porque el proveedor de correo tuvo un mal dia- seria peor. Lo que no vale es
    lo que habia antes: decir que se emitio sin haber avisado a nadie.
    """
    import mailer

    lineas = ''.join(
        '<li>%s <b>%s</b></li>' % (
            str(it.get('name', '?'))[:120],
            ('v%s' % it['version']) if it.get('version') is not None else '')
        for it in (items or [])[:60])
    if len(items or []) > 60:
        lineas += '<li>… y %d más</li>' % (len(items) - 60)

    cuerpo = (
        '<p>%s te ha emitido formalmente %d documento(s) en el transmittal '
        '<b>TR-%03d</b>.</p>' % (emisor or 'Alguien', len(items or []), numero)
        + ('<p>%s</p>' % mensaje if mensaje else '')
        + '<ul>%s</ul>' % lineas
        + '<p style="color:#4a5561">Este correo es el acuse de emisión. '
          'Los documentos se abren desde la plataforma.</p>')

    resultado = []
    for d in (destinatarios or []):
        correo = (d.get('email') if isinstance(d, dict) else d) or ''
        correo = str(correo).strip()
        if '@' not in correo:
            resultado.append({'destino': correo or '(sin correo)', 'enviado': False,
                              'detalle': 'no tiene correo'})
            continue
        try:
            ok, detalle = mailer.enviar(
                correo, 'TR-%03d · %s' % (numero, asunto),
                'Transmittal TR-%03d' % numero, cuerpo)
        except Exception as e:   # pragma: no cover - defensivo
            ok, detalle = False, str(e)[:120]
        resultado.append({'destino': correo, 'enviado': bool(ok), 'detalle': detalle})
    return resultado


@transmittals_bp.route('/api/transmittals', methods=['GET'])
def list_transmittals():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    # Los transmittals de una obra dicen que se entrego, a quien y cuando: se
    # leian enteros cambiando el ?model_urn, sin pertenecer a la obra.
    if not _hay_acceso(model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, number, subject, message, recipients, items, created_by,
                                  created_at, notificado, acuses
                           FROM transmittals WHERE model_urn = %s ORDER BY number DESC LIMIT 200""",
                        (model_urn,))
            data = [{
                "id": r[0], "number": r[1], "subject": r[2], "message": r[3],
                "recipients": r[4], "items": r[5], "created_by": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
                "notificado": r[8], "acuses": r[9] or []
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
    if not _hay_acceso(d['model_urn']):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    u = getattr(g, 'current_user', None) or {}
    # El autor sale de la SESION y de ningun otro sitio. Antes era
    # `u.get('name') or d.get('user')`: bastaba con no traer nombre en la sesion
    # para firmar una evidencia contractual con el nombre de otro.
    emisor = u.get('name') or u.get('email')
    if not emisor:
        return jsonify({"success": False, "error": "Hace falta una sesión para emitir."}), 401
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
                         json.dumps(d['recipients']), json.dumps(d['items']), emisor))
            tid = cur.fetchone()[0]
            conn.commit()

        # El aviso va DESPUES de guardar: la emision no se pierde porque el
        # correo falle. Y se guarda lo que paso con cada destinatario, para que
        # la pantalla pueda decir la verdad en vez de dar por hecha la entrega.
        notificado = _avisar_a_los_destinatarios(
            number, d['subject'], d.get('message', ''), d['recipients'], d['items'], emisor)
        try:
            with get_db_connection() as conn:
                cur = conn.cursor()
                cur.execute("UPDATE transmittals SET notificado = %s WHERE id = %s",
                            (json.dumps(notificado), tid))
                conn.commit()
        except Exception as e:   # pragma: no cover - defensivo
            print(f"[TRANSMITTAL] TR-{number:03d} emitido pero no se pudo anotar el aviso: {e}")

        avisados = sum(1 for n in notificado if n['enviado'])
        log_activity(d['model_urn'], 'transmittal_created', 'transmittal', entity_id=str(tid),
                     entity_name=f"TR-{number:03d} {d['subject']}", performed_by=emisor)
        return jsonify({"success": True, "id": tid, "number": number,
                        "notificado": notificado,
                        "avisados": avisados, "destinatarios": len(notificado)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def _es_destinatario(recipients, email, nombre):
    """¿Esta persona figura entre los destinatarios del transmittal?"""
    email = (email or '').strip().lower()
    nombre = (nombre or '').strip().lower()
    for r in (recipients or []):
        re_mail = str((r.get('email') if isinstance(r, dict) else r) or '').strip().lower()
        re_nom = str((r.get('name') if isinstance(r, dict) else '') or '').strip().lower()
        if email and re_mail == email:
            return True
        if nombre and re_nom and re_nom == nombre:
            return True
    return False


@transmittals_bp.route('/api/transmittals/<int:tid>/acuse', methods=['POST'])
def acusar_recibo(tid):
    """El destinatario acusa recibo de una emisión. Solo suma; nunca borra.

    Lo puede hacer quien figura como destinatario, o un administrador de la obra
    (que registra el acuse en nombre de alguien que avisó por otra vía). Se guarda
    QUIÉN acusó y CUÁNDO, con la fecha del servidor -no la del cliente-, porque en
    una discusión de plazos la fecha la pone la plataforma, no el navegador.
    """
    from datetime import datetime, timezone
    u = getattr(g, 'current_user', None) or {}
    quien = u.get('name') or u.get('email')
    if not quien:
        return jsonify({"success": False, "error": "Hace falta una sesión."}), 401
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT model_urn, recipients, acuses FROM transmittals WHERE id = %s", (tid,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "El transmittal no existe."}), 404
            obra, recipients, acuses = fila
            if not _hay_acceso(obra):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403

            es_admin = u.get('role') == 'admin'
            if not es_admin and not _es_destinatario(recipients, u.get('email'), u.get('name')):
                return jsonify({"success": False,
                                "error": "Solo un destinatario (o un administrador) puede acusar recibo."}), 403

            acuses = acuses or []
            ya = any((a.get('por') or '').strip().lower() == str(quien).strip().lower() for a in acuses)
            if not ya:
                acuses.append({
                    'por': quien,
                    'en': datetime.now(timezone.utc).isoformat(),
                    'via': 'admin' if (es_admin and not _es_destinatario(recipients, u.get('email'), u.get('name'))) else 'destinatario',
                })
                cur.execute("UPDATE transmittals SET acuses = %s WHERE id = %s",
                            (json.dumps(acuses), tid))
                conn.commit()
                cur.execute("SELECT number FROM transmittals WHERE id = %s", (tid,))
                num = cur.fetchone()[0]
                log_activity(obra, 'transmittal_acuse', 'transmittal', entity_id=str(tid),
                             entity_name=f"TR-{num:03d}", performed_by=quien)
        return jsonify({"success": True, "acuses": acuses, "ya_estaba": ya})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
