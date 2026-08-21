"""Flujos de revisión y aprobación de documentos (ISO 19650 / estilo ACC Reviews).

Una revisión congela una lista de documentos (con su versión) y una secuencia
de revisores. Cada paso aprueba o rechaza con comentario (trazable en history).
Al aprobar el último paso, los documentos transicionan al estado ISO final.
"""
from esquema_congelado import solo_con_ddl
import json
import logging
import traceback
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity, resolve_project_id
import estados_ecd as ecd
from perimetro_de_obra import guardia_de_obra

reviews_bp = Blueprint('reviews', __name__)

FINAL_STATUSES = (ecd.SHARED, ecd.PUBLISHED)


def _empieza_el_turno(cur, rid, steps, indice, actor, titulo, history):
    """Arranca el turno de un paso: fija su plazo, lo anota y abre el encargo.

    Devuelve (vence_en, history). El plazo se calcula AQUI, al empezar el turno,
    y se guarda en el Review -- no en el encargo. El encargo lo copia. Si el
    encargo se pierde, la conciliacion lo reconstruye CON su plazo, porque el
    Review lo sabe.

    Si el revisor no se puede determinar o no es miembro de la obra, NO se abre
    encargo: un encargo no da acceso, y no se inventa uno para quien no esta
    dentro. La revision no avanza sola por eso -- queda BLOQUEADA, y
    `flujo_de_revision.estado_del_flujo` lo dice al mirarla.
    """
    import flujo_de_revision as flujo
    if indice >= len(steps or []):
        return None, history
    paso = steps[indice] or {}
    vence = flujo.vencimiento(paso)

    # El historial registra el COMIENZO del turno, no solo su resolucion. Sin
    # esto, «cuanto tardo cada revisor» y «con que plazo se le pidio» habia que
    # inferirlos de la fila anterior.
    history = list(history or []) + [{
        'event': 'step_started',
        'step': indice,
        'to': flujo.etiqueta_del_paso(paso),
        'to_user_id': paso.get('user_id'),
        'due': vence.isoformat() if vence else None,
        'at': datetime.now(timezone.utc).isoformat(),
    }]

    try:
        import encargos as _enc
        uid, motivo = flujo.revisor_del_paso(cur, paso)
        if not uid:
            logging.getLogger('reviews').warning(
                'revision %s paso %s sin encargo: %s', rid, indice, motivo)
            return vence, history
        eid = _enc.abrir(cur, 'REVIEW', rid,
                         'Revisar: %s (paso %d)' % (titulo, indice + 1),
                         destino_usuario=uid, vence_en=vence, creado_por=actor)
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        # La revision avanza igual: el encargo es su reflejo, no su motor.
        logging.getLogger('reviews').warning('encargo no abierto: %s', e)
    return vence, history


def _pasos_validos(cur, obra, steps):
    """None si los pasos son utilizables; (respuesta, codigo) si no.

    UNA REVISION NUEVA EXIGE REVISOR ESTRUCTURADO. Hasta ahora un paso era
    `{email, name}` y quien podia actuar se decidia comparando correo O NOMBRE:
    con dos personas llamadas igual -- que en una obra con varias empresas no es
    raro -- las dos eran candidatas a firmar el mismo paso.

    Se exige aqui, al crear, y no al aprobar: descubrir que el paso 3 apunta a
    nadie cuando ya han firmado dos revisores es tarde.

    Los pasos HISTORICOS no se tocan ni se convierten: siguen resolviendose por
    correo y por nombre. Esta comprobacion solo mira lo que entra de nuevo.
    """
    for i, paso in enumerate(steps):
        if not isinstance(paso, dict) or not paso.get('user_id'):
            return jsonify({
                "success": False,
                "error": "El paso %d no dice a que USUARIO le toca. Elige al "
                         "revisor de la lista de miembros de la obra." % (i + 1),
                "code": "PASO_SIN_REVISOR",
            }), 400
        try:
            uid = int(paso['user_id'])
        except (TypeError, ValueError):
            return jsonify({"success": False,
                            "error": "El revisor del paso %d no es valido." % (i + 1)}), 400
        cur.execute('SELECT 1 FROM users WHERE id = %s AND is_active', (uid,))
        if not cur.fetchone():
            return jsonify({"success": False,
                            "error": "El revisor del paso %d no existe o esta "
                                     "desactivado." % (i + 1)}), 400
        # Y tiene que estar EN LA OBRA. Si no, el encargo no se podria abrir
        # --un encargo no da acceso-- y la revision naceria bloqueada.
        cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                    (str(obra), uid))
        if not cur.fetchone():
            cur.execute('SELECT name, email FROM users WHERE id = %s', (uid,))
            quien = cur.fetchone() or ('', '')
            return jsonify({
                "success": False,
                "error": "%s no pertenece a esta obra, asi que no puede revisar "
                         "el paso %d. Anadelo a la obra primero." % (
                             quien[0] or quien[1] or ('usuario %s' % uid), i + 1),
                "code": "REVISOR_FUERA_DE_LA_OBRA",
            }), 400
        # `dias` es opcional; si viene, tiene que ser un numero positivo.
        if paso.get('dias') not in (None, ''):
            try:
                if int(paso['dias']) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"success": False,
                                "error": "El plazo del paso %d tiene que ser un "
                                         "numero de dias mayor que cero." % (i + 1)}), 400
    return None


@solo_con_ddl
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
        # CUANDO VENCE EL TURNO ACTUAL, Y POR QUE VIVE AQUI.
        #
        # El plazo estaba solo en `encargos`, y solo para el primer paso. Eso es
        # al reves de la regla: el Review es la fuente de verdad de su proceso.
        # Si el encargo se perdia y la conciliacion lo reconstruia, el plazo
        # desaparecia -- porque el Review no sabia cual era.
        #
        # Se guarda el vencimiento del paso EN CURSO. El de cada paso se calcula
        # al empezar su turno desde `steps[i].dias`, porque al crear la revision
        # no se sabe cuando le tocara al paso 3.
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS paso_vence_en TIMESTAMP')
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
        "paso_vence_en": r[13].isoformat() if len(r) > 13 and r[13] else None,
    }


def _con_estado_del_flujo(cur, rev):
    """Anade si la revision esta ACTIVA, BLOQUEADA o CERRADA.

    Se CALCULA al mirarla; no se guarda. Un estado guardado habria que
    mantenerlo al dia, y un estado que puede quedarse viejo es peor que no
    tenerlo. Tampoco es un estado nuevo del ciclo de vida del Review: `status`
    sigue siendo pending/approved/rejected.
    """
    try:
        import flujo_de_revision as flujo
        estado, motivo = flujo.estado_del_flujo(cur, rev)
        rev['flujo'] = estado
        rev['flujo_motivo'] = motivo
    except Exception:
        rev['flujo'] = None
        rev['flujo_motivo'] = ''
    return rev


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
                                  codigo_idoneidad, cerrada_en, paso_vence_en
                           FROM doc_reviews WHERE model_urn = %s ORDER BY id DESC LIMIT 200""",
                        (model_urn,))
            data = [_con_estado_del_flujo(cur, _row_to_dict(r)) for r in cur.fetchall()]
        return jsonify({"success": True, "reviews": data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def _revision_independiente(user, steps):
    """None si la revision tiene al menos un ojo ajeno; (respuesta, codigo) si no.

    POR QUE ES UNA REGLA Y NO UNA RECOMENDACION
    -------------------------------------------
    Una revision cuyo unico revisor es quien la crea no revisa nada: es una
    firma delante del espejo. Y en este sistema no es un detalle de proceso,
    porque la revision es el camino a PUBLICADO -- el estado con el que se
    construye. Sin esta comprobacion, cualquiera con permiso de edicion sobre
    sus propios documentos se los aprobaba a si mismo y quedaba en el
    expediente como material autorizado, con historial y fechas de aprobacion
    que parecen los de una revision de verdad. Eso es peor que no tener
    revision: tiene su apariencia.

    La regla es la minima que sostiene el control: el autor NO puede ser el
    unico. Puede estar entre los revisores -- en un equipo pequeño el autor
    conoce el documento y su firma vale -- pero tiene que haber alguien mas.
    Prohibirle aparecer del todo seria mas estricto de lo que pide ISO 19650-2
    y bloquearia a equipos de dos personas sin ganar nada.
    """
    correo = (user.get('email') or '').strip().lower()
    nombre = (user.get('name') or '').strip().lower()
    mi_id = user.get('id')

    def es_el_autor(paso):
        # Con identidad estructurada se comparan identidades: si no, dos
        # personas con el mismo nombre podrian «dar independencia» a una
        # revision en la que en realidad solo firma el autor.
        if paso.get('user_id') and mi_id:
            try:
                return int(paso['user_id']) == int(mi_id)
            except (TypeError, ValueError):
                return False
        c = (paso.get('email') or '').strip().lower()
        n = (paso.get('name') or '').strip().lower()
        return (correo and c == correo) or (nombre and n == nombre)

    ajenos = [p for p in steps if not es_el_autor(p)]
    if ajenos:
        return None
    return jsonify({
        "success": False,
        "error": "Una revisión necesita al menos un revisor distinto de quien la "
                 "crea. Puedes estar entre los revisores, pero no ser el único. "
                 "Si eres la única persona en esta obra, invita a alguien desde "
                 "Administración → Miembros y asígnalo como revisor.",
        "code": "REVISION_SIN_INDEPENDENCIA",
    }), 400


@reviews_bp.route('/api/reviews', methods=['POST'])
def create_review():
    d = request.get_json() or {}
    negativa = guardia_de_obra(d.get('model_urn'), 'crear una revision')
    if negativa:
        return negativa
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
    negado = _revision_independiente(u, steps)
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

            # Una revision NUEVA exige revisor estructurado en cada paso.
            obra = resolve_project_id(d['model_urn'])
            negado = _pasos_validos(cur, obra, steps)
            if negado:
                return negado

            actor = u.get('email') or u.get('name')
            historia = [{"event": "created", "by": actor,
                         "at": datetime.now(timezone.utc).isoformat()}]
            cur.execute("""INSERT INTO doc_reviews (model_urn, title, items, steps, final_status,
                                                    created_by, history, codigo_idoneidad)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['model_urn'], d['title'], json.dumps(items), json.dumps(steps),
                         final_status, actor, json.dumps(historia),
                         (d.get('codigo_idoneidad') or '').strip().upper() or None))
            rid = cur.fetchone()[0]

            # Arranca el turno del primer revisor: fija su plazo EN EL REVIEW, lo
            # anota en el historial y abre el encargo, que es la proyeccion de lo
            # que `steps` y `current_step` ya dicen.
            vence, historia = _empieza_el_turno(cur, rid, steps, 0, actor,
                                                d['title'], historia)
            cur.execute("UPDATE doc_reviews SET paso_vence_en=%s, history=%s WHERE id=%s",
                        (vence, json.dumps(historia), rid))
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
                                  codigo_idoneidad, cerrada_en, paso_vence_en
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
            # UNA sola forma de decidir quien es el revisor. Con `user_id` en el
            # paso es una comparacion de identidades y NADA MAS: los respaldos
            # por correo y por nombre solo se consultan en pasos LEGACY, que no
            # tienen identidad estructurada. Consultarlos «por si acaso» en un
            # paso nuevo devolveria la ambiguedad que el user_id viene a quitar
            # -- dos personas llamadas igual, las dos candidatas a firmar.
            import flujo_de_revision as flujo
            if not flujo.puede_actuar(u, step) and u.get('role') != 'admin':
                return jsonify({"success": False,
                                "error": "Este paso corresponde a %s"
                                         % flujo.etiqueta_del_paso(step)}), 403

            # CON FECHA. Cada acto de aprobacion o rechazo tiene que quedar
            # fechado: es la primera pregunta de una supervision, y hasta ahora la
            # unica forma de reconstruirla era mirar la fila correlativa del
            # registro de actividad y suponer.
            entry = {"event": action, "step": rev['current_step'],
                     "by": u.get('email') or u.get('name'), "comment": comment,
                     "at": datetime.now(timezone.utc).isoformat()}
            history = rev['history'] + [entry]

            # Se resolvio el paso: quien lo debia deja de deberlo. Va antes de
            # decidir si avanza o se rechaza, porque en los dos casos el encargo
            # de ESTE paso queda cerrado.
            try:
                import encargos as _enc
                _enc.cerrar_los_de(cur, 'REVIEW', rid, u.get('email') or u.get('name'))
            except Exception as _e:
                # La revision avanza igual: el encargo es su reflejo, no su motor.
                import logging as _lg
                _lg.getLogger('reviews').warning('encargo no cerrado: %s', _e)

            if action == 'reject':
                cur.execute("UPDATE doc_reviews SET status='rejected', history=%s, "
                            "       paso_vence_en=NULL WHERE id=%s",
                            (json.dumps(history), rid))
            elif rev['current_step'] + 1 < len(rev['steps']):
                # El turno siguiente calcula SU plazo, no hereda el del anterior
                # ni se queda sin ninguno -- que es lo que pasaba antes: solo el
                # primer paso recibia vencimiento.
                siguiente = rev['current_step'] + 1
                vence, history = _empieza_el_turno(
                    cur, rid, rev['steps'], siguiente,
                    u.get('email') or u.get('name'), rev['title'], history)
                cur.execute("UPDATE doc_reviews SET current_step=%s, history=%s, "
                            "       paso_vence_en=%s WHERE id=%s",
                            (siguiente, json.dumps(history), vence, rid))
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
                            "cerrada_en=CURRENT_TIMESTAMP, paso_vence_en=NULL WHERE id=%s",
                            (json.dumps(history), rid))
                ids = [it.get('node_id') for it in rev['items'] if it.get('node_id')]
                destino = ecd.normalizar(rev['final_status'])

                # ¿Sigue siendo la misma versión que se mandó a revisar?
                # Antes se aprobaba el node_id a secas, así que se sellaba «apto
                # para construcción» sobre lo que hubiera subido en ese momento,
                # que podía no ser lo que nadie miró. Sólo se puede comprobar en
                # las revisiones creadas ya con version_id; las anteriores pasan
                # (no hay con qué compararlas) y eso queda dicho aquí a propósito.
                cambiados = []
                for it in rev['items']:
                    esperada = it.get('version_id')
                    if not esperada or not it.get('node_id'):
                        continue
                    cur.execute("SELECT current_version_id, name, version_number "
                                "FROM file_nodes WHERE id = %s", (it['node_id'],))
                    fila = cur.fetchone()
                    if fila and fila[0] and str(fila[0]) != str(esperada):
                        cambiados.append(f"{fila[1] or it.get('name')} (ahora v{fila[2]})")
                if cambiados:
                    conn.rollback()
                    return jsonify({
                        "success": False,
                        "error": ("No se puede aprobar: alguien subió una versión nueva "
                                  "después de mandar esto a revisión, así que se estaría "
                                  "aprobando algo que nadie revisó. Cambió: "
                                  + ", ".join(cambiados[:5])
                                  + (" …" if len(cambiados) > 5 else "")
                                  + ". Vuelve a mandarlo a revisión.")}), 409
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


@reviews_bp.route('/api/reviews/<int:rid>/reasignar', methods=['POST'])
def reasignar_revisor(rid):
    """Sustituye al revisor del paso actual de una revision BLOQUEADA.

    POR QUE EXISTE, Y POR QUE ES TAN ESTRECHA
    -----------------------------------------
    Una revision cuyo revisor sale de la obra se queda parada: no se le puede
    abrir encargo --un encargo no da acceso-- y el tampoco puede actuar. Se
    detecta y se dice, pero hasta ahora no habia salida.

    Esta ruta es esa salida, y NADA MAS:

      - SOLO si la revision esta BLOQUEADA. No es administracion de flujos: no
        sirve para cambiar revisores de una revision que avanza bien. Permitirlo
        convertiria una via de rescate en una forma de elegir quien firma.
      - SOLO un administrador.
      - NUNCA automatica. Quien sustituye a un revisor que se fue es una
        decision de obra; el sistema la ejecuta, no la toma.
      - El nuevo revisor tiene que ser miembro de la obra, igual que al crear.
      - La INDEPENDENCIA se vuelve a comprobar: una sustitucion no puede dejar
        como unico revisor al autor de la revision.

    LO QUE NO TOCA
    --------------
    Los actos ya firmados. Solo reescribe el paso EN CURSO y ANADE una entrada
    al historial. Las aprobaciones anteriores siguen exactamente como estaban.

    Y no toca ningun encargo directamente: cierra los del objeto y arranca el
    turno por la MISMA via que el resto del flujo (`_empieza_el_turno`), porque
    `encargos` es la proyeccion y se mueve cuando se mueve el objeto.
    """
    u = _user()
    if not u:
        return jsonify({"success": False, "error": "Autenticación requerida"}), 401
    if u.get('role') != 'admin':
        return jsonify({"success": False,
                        "error": "Solo un administrador puede sustituir al revisor "
                                 "de una revisión bloqueada.",
                        "code": "SOLO_ADMIN"}), 403

    d = request.get_json(silent=True) or {}
    nuevo_id, motivo = d.get('user_id'), (d.get('motivo') or '').strip()
    if not nuevo_id:
        return jsonify({"success": False, "error": "Falta user_id del nuevo revisor"}), 400
    if not motivo:
        # El motivo es obligatorio a proposito: una sustitucion sin explicacion
        # deja el historial contando QUE paso y no POR QUE, que es la mitad
        # inutil de una trazabilidad.
        return jsonify({"success": False,
                        "error": "Explica por qué se sustituye al revisor: queda en "
                                 "el historial de la revisión.",
                        "code": "FALTA_MOTIVO"}), 400

    import flujo_de_revision as flujo
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at,
                                  codigo_idoneidad, cerrada_en, paso_vence_en
                           FROM doc_reviews WHERE id = %s FOR UPDATE""", (rid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Revisión no encontrada"}), 404
            rev = _row_to_dict(row)

            # La obra sale de la revision guardada, no de lo que mande el cliente.
            from routes.documents import verify_project_access
            if not verify_project_access(u, rev['model_urn']):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403

            estado, motivo_bloqueo = flujo.estado_del_flujo(cur, rev)
            if estado != 'BLOQUEADA':
                return jsonify({
                    "success": False,
                    "error": "Esta revisión no está bloqueada (%s). Sustituir al "
                             "revisor solo sirve para desatascar, no para cambiar "
                             "quién firma una revisión que avanza." % estado.lower(),
                    "code": "NO_ESTA_BLOQUEADA"}), 409

            obra = resolve_project_id(rev['model_urn'])
            cur.execute('SELECT id, email, name FROM users WHERE id = %s AND is_active',
                        (int(nuevo_id),))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False,
                                "error": "El revisor elegido no existe o está desactivado."}), 400
            nuevo = {'id': fila[0], 'email': fila[1], 'name': fila[2]}

            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), nuevo['id']))
            if not cur.fetchone():
                return jsonify({
                    "success": False,
                    "error": "%s no pertenece a esta obra. Añádelo a la obra antes de "
                             "asignarle la revisión." % (nuevo['name'] or nuevo['email']),
                    "code": "REVISOR_FUERA_DE_LA_OBRA"}), 400

            indice = rev['current_step'] or 0
            pasos, entrada = flujo.sustituir_revisor(
                rev['steps'], indice, nuevo, u.get('email') or u.get('name'), motivo)

            if not flujo.sigue_habiendo_independencia(pasos, rev['created_by']):
                return jsonify({
                    "success": False,
                    "error": "Esa sustitución dejaría a quien creó la revisión como "
                             "único revisor. Elige a otra persona.",
                    "code": "REVISION_SIN_INDEPENDENCIA"}), 400

            historia = list(rev['history'] or []) + [entrada]

            # El encargo del revisor que se fue deja de existir; el turno arranca
            # de nuevo para quien entra, con el plazo del paso.
            try:
                import encargos as _enc
                _enc.cerrar_los_de(cur, 'REVIEW', rid, u.get('email') or u.get('name'))
            except Exception as e:
                logging.getLogger('reviews').warning('encargo previo no cerrado: %s', e)

            vence, historia = _empieza_el_turno(
                cur, rid, pasos, indice, u.get('email') or u.get('name'),
                rev['title'], historia)

            cur.execute("UPDATE doc_reviews SET steps=%s, history=%s, paso_vence_en=%s "
                        " WHERE id=%s",
                        (json.dumps(pasos), json.dumps(historia), vence, rid))
            conn.commit()

        log_activity(rev['model_urn'], 'review_reassigned', 'review', entity_id=str(rid),
                     entity_name=rev['title'], performed_by=u.get('name'))
        return jsonify({"success": True, "id": rid, "step": indice,
                        "nuevo_revisor": nuevo, "paso_vence_en":
                            vence.isoformat() if vence else None})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
