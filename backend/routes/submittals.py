# -*- coding: utf-8 -*-
"""SUBMITTALS — someter un producto a aprobacion contra la especificacion.

La SEMANTICA esta en `flujo_de_submittal.py` y no se repite aqui. Este fichero
solo mueve el registro por el camino que la semantica declara, y por eso no
puede contradecirla.

EL CAMINO, Y QUIEN LO EMPUJA EN CADA TRAMO
-------------------------------------------
    Borrador     ──enviar──▶     Enviado        el AUTOR (contratista)
    Enviado      ──distribuir─▶  En revision    el MANAGER o el ADMIN de obra
    En revision  ──responder──▶  En revision    el REVISOR DEL PASO (avanza)
                 ──responder──▶  Respondido     el REVISOR DEL ULTIMO PASO
    Respondido   ──cerrar────▶   Cerrado        el MANAGER o el ADMIN de obra
    (cualquiera) ──anular────▶   Anulado        el MANAGER o el ADMIN de obra

    Cerrado con veredicto que exige revision ──▶ el AUTOR crea la REVISION,
    que es una FILA NUEVA. La anterior no se toca: el rechazo tiene que seguir
    existiendo, porque es justo lo que hay que poder demostrar.

LAS TRES CAPAS, SIN MEZCLARSE
------------------------------
    PERMISSION      llegar a /api/submittals ....... capas 16 y 08, en el
                                                     middleware. Aqui NO se
                                                     vuelve a comprobar.
    WORKFLOW AUTH.  ejecutar ESTE acto ............. `flujo_de_registro` con la
                                                     semantica del submittal
    RESPONSIBILITY  a quien le toca ahora .......... `encargos`, que REFLEJA y
                                                     nunca decide

UN FALLO DE ENCARGO NO TUMBA UN ACTO CONTRACTUAL. La proyeccion se reconstruye
sola (`encargos.conciliar`); un veredicto perdido, no. Por eso cada llamada a
`encargos` va dentro de su propio try y el acto sigue adelante.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_recurso
import encargos as _enc
import flujo_de_registro as reg
import flujo_de_revision as rev
import flujo_de_submittal as sem

logger = logging.getLogger('submittals')

submittals_bp = Blueprint('submittals_bp', __name__)

S = sem.SEMANTICA

_COLS = ('id, project_id, model_urn, codigo, titulo, descripcion, spec_seccion, '
         'spec_titulo, paquete, autor_id, responsable_id, created_by, steps, '
         'current_step, paso_vence_en, estado, veredicto, veredicto_en, '
         'veredicto_por, revision, revision_de, adjuntos, distribucion, '
         'history, vence_en, created_at, enviado_en, cerrado_en, cerrado_por')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r):
    """La fila, tal como la ve quien la consume. `created_by` NO es identidad:
    es la instantanea legible de quien lo creo."""
    return {
        'id': str(r[0]), 'project_id': r[1], 'model_urn': r[2], 'codigo': r[3],
        'titulo': r[4], 'descripcion': r[5],
        'spec_seccion': r[6], 'spec_titulo': r[7], 'paquete': r[8],
        'autor_id': r[9], 'responsable_id': r[10], 'created_by': r[11],
        'steps': r[12] or [], 'current_step': r[13],
        'paso_vence_en': r[14].isoformat() if r[14] else None,
        'estado': r[15], 'veredicto': r[16],
        'veredicto_en': r[17].isoformat() if r[17] else None,
        'veredicto_por': r[18],
        'revision': r[19], 'revision_de': str(r[20]) if r[20] else None,
        'adjuntos': r[21] or [], 'distribucion': r[22] or [],
        'history': r[23] or [],
        'vence_en': r[24].isoformat() if r[24] else None,
        'created_at': r[25].isoformat() if r[25] else None,
        'enviado_en': r[26].isoformat() if r[26] else None,
        'cerrado_en': r[27].isoformat() if r[27] else None,
        'cerrado_por': r[28],
        'habilita_instalacion': sem.habilita_instalacion(r[16]),
    }


def _leer(cur, sid):
    cur.execute('SELECT %s FROM doc_submittals WHERE id = %%s' % _COLS, (sid,))
    r = cur.fetchone()
    return _fila(r) if r else None


def _guardar_historial(cur, sid, history):
    cur.execute('UPDATE doc_submittals SET history = %s WHERE id = %s',
                (json.dumps(history), sid))


def _abrir_encargo(cur, sid, uid, asunto, vence):
    """Abre la pelota. NUNCA revienta el acto que la origina."""
    if not uid:
        return None
    try:
        eid = _enc.abrir(cur, 'SUBMITTAL', sid, asunto, destino_usuario=uid,
                         vence_en=vence, creado_por=_actor())
        if eid:
            _enc.avisar(cur, eid)
        return eid
    except Exception as e:
        logger.warning('[submittal %s] no se pudo abrir el encargo: %s', sid, e)
        return None


def _cerrar_encargos(cur, sid):
    try:
        _enc.cerrar_los_de(cur, 'SUBMITTAL', sid, cerrado_por=_actor())
    except Exception as e:
        logger.warning('[submittal %s] no se pudieron cerrar los encargos: %s', sid, e)


# ── CATALOGO ───────────────────────────────────────────────────────────────

@submittals_bp.route('/catalogo', methods=['GET'])
def catalogo():
    """Lo que la pantalla necesita saber SIN inventarselo: las listas cerradas.

    Si la pantalla las llevara escritas, un veredicto nuevo obligaria a
    desplegar las dos mitades a la vez, y durante un rato una ofreceria algo que
    la otra rechaza.
    """
    return jsonify({
        'estados': list(sem.ESTADOS),
        'veredictos': [{'codigo': v,
                        'exige_revision': v in sem.EXIGEN_REVISION,
                        'habilita_instalacion': sem.habilita_instalacion(v)}
                       for v in sem.VEREDICTOS],
    })


# ── LECTURA ────────────────────────────────────────────────────────────────

@submittals_bp.route('', methods=['GET'])
def listar():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    # AGRUPAR POR SPEC Y POR PAQUETE, que es para lo que los dos fabricantes
    # los tienen. Guardarlos sin poder filtrar por ellos era tener el DATO y no
    # la CAPACIDAD -- en una obra con doscientos submittals, «ensename los de
    # la seccion 05 52 13» es la pregunta que se hace, no «ensenamelos todos».
    spec = (request.args.get('spec_seccion') or '').strip() or None
    paquete = (request.args.get('paquete') or '').strip() or None
    estado = (request.args.get('estado') or '').strip() or None
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Por OBRA y no por alcance: `model_urn` es un alias, y una obra
            # tiene varios. Filtrar por alias escondería submittals de la misma
            # obra creados bajo otro.
            cur.execute('SELECT %s FROM doc_submittals WHERE project_id = %%s '
                        '   AND (%%s IS NULL OR spec_seccion = %%s) '
                        '   AND (%%s IS NULL OR paquete = %%s) '
                        '   AND (%%s IS NULL OR estado = %%s) '
                        ' ORDER BY codigo DESC, revision DESC' % _COLS,
                        (obra, spec, spec, paquete, paquete, estado, estado))
            filas = [_fila(r) for r in cur.fetchall()]
            # Y las agrupaciones QUE EXISTEN, para que la pantalla ofrezca solo
            # las que tienen contenido en vez de una lista inventada.
            cur.execute("""SELECT spec_seccion, count(*) FROM doc_submittals
                            WHERE project_id = %s AND spec_seccion IS NOT NULL
                            GROUP BY spec_seccion ORDER BY spec_seccion""", (obra,))
            specs = [{'codigo': r[0], 'cuantos': r[1]} for r in cur.fetchall()]
            cur.execute("""SELECT paquete, count(*) FROM doc_submittals
                            WHERE project_id = %s AND paquete IS NOT NULL
                            GROUP BY paquete ORDER BY paquete""", (obra,))
            paquetes = [{'nombre': r[0], 'cuantos': r[1]} for r in cur.fetchall()]
            return jsonify({'submittals': filas,
                            'spec_secciones': specs, 'paquetes': paquetes})
    except Exception as e:
        logger.error('listar submittals: %s', e)
        return jsonify({'error': 'No se pudo listar.'}), 500


@submittals_bp.route('/<int:sid>', methods=['GET'])
def detalle(sid):
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    with get_db_connection() as conn:
        s = _leer(conn.cursor(), sid)
    if not s:
        return jsonify({'error': 'No existe.'}), 404
    return jsonify(s)


# ── ALTA ───────────────────────────────────────────────────────────────────

@submittals_bp.route('', methods=['POST'])
def crear():
    """Nace en BORRADOR y con AUTOR ESTRUCTURADO desde el primer dia.

    El RFI y el Red Line nacieron con el responsable en texto libre y costo un
    rediseño entero recuperarlo. Aqui el autor es `users.id` y no se negocia.
    """
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar a qué obra pertenece.',
                        'code': 'PROJECT_UNRESOLVED'}), 400

    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'error': 'El título es obligatorio.'}), 400

    autor_id = _usuario().get('id')
    if not autor_id:
        return jsonify({'error': 'Sesión sin identidad.', 'code': 'NO_IDENTITY'}), 401

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # REINTENTO CON SAVEPOINT, igual que el RFI: dos altas simultaneas
            # pueden calcular el mismo numero, y el indice unico lo rechaza. Se
            # reintenta en vez de devolver un error que el usuario no entiende.
            for intento in range(5):
                codigo = reg.siguiente_codigo(cur, S, obra)
                try:
                    cur.execute('SAVEPOINT alta_submittal')
                    cur.execute("""
                        INSERT INTO doc_submittals
                            (project_id, model_urn, codigo, titulo, descripcion,
                             spec_seccion, spec_titulo, paquete, autor_id,
                             responsable_id, created_by, adjuntos, vence_en, history)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id
                    """, (obra, model_urn, codigo, titulo,
                          (data.get('descripcion') or '').strip() or None,
                          (data.get('spec_seccion') or '').strip() or None,
                          (data.get('spec_titulo') or '').strip() or None,
                          (data.get('paquete') or '').strip() or None,
                          autor_id, data.get('responsable_id'), _actor(),
                          json.dumps(data.get('adjuntos') or []),
                          data.get('vence_en') or None,
                          json.dumps([reg.entrada('created', _actor(), codigo=codigo)])))
                    sid = cur.fetchone()[0]
                    cur.execute('RELEASE SAVEPOINT alta_submittal')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_submittal')
                    if intento == 4:
                        raise
            else:
                return jsonify({'error': 'No se pudo asignar número.'}), 409

            conn.commit()
            log_activity(model_urn, 'CREATE', 'SUBMITTAL', str(sid), codigo,
                         _actor(), {'titulo': titulo})
            return jsonify(_leer(cur, sid)), 201
    except Exception as e:
        logger.error('crear submittal: %s', e)
        return jsonify({'error': 'No se pudo crear el submittal.'}), 500


@submittals_bp.route('/<int:sid>', methods=['PATCH'])
def editar(sid):
    """Solo en BORRADOR, y solo su autor.

    Un submittal enviado ya no se edita: cambiar lo sometido despues de que
    alguien empezo a revisarlo haria que el veredicto recayera sobre algo
    distinto de lo que se leyo.
    """
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404
            if s['estado'] != sem.BORRADOR:
                return jsonify({'error': 'Solo se puede editar mientras está en borrador.',
                                'code': 'NO_EDITABLE'}), 409
            if not reg.es_el_autor(_usuario(), {'created_by': s['created_by']}) \
               and _usuario().get('id') != s['autor_id']:
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_AUTOR'}), 403

            campos, valores = [], []
            for k in ('titulo', 'descripcion', 'spec_seccion', 'spec_titulo',
                      'paquete', 'responsable_id', 'vence_en'):
                if k in data:
                    campos.append('%s = %%s' % k)
                    valores.append(data[k] if data[k] not in ('',) else None)
            if 'adjuntos' in data:
                campos.append('adjuntos = %s')
                valores.append(json.dumps(data['adjuntos'] or []))
            if not campos:
                return jsonify(s)
            valores.append(sid)
            cur.execute('UPDATE doc_submittals SET %s WHERE id = %%s'
                        % ', '.join(campos), valores)
            _guardar_historial(cur, sid, s['history'] + [
                reg.entrada('edited', _actor(), campos=sorted(data.keys()))])
            conn.commit()
            log_activity(s['model_urn'], 'UPDATE', 'SUBMITTAL', str(sid),
                         s['codigo'], _actor(), {'campos': sorted(data.keys())})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('editar submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo editar.'}), 500


# ── EL CAMINO ──────────────────────────────────────────────────────────────

@submittals_bp.route('/<int:sid>/enviar', methods=['POST'])
def enviar(sid):
    """El CONTRATISTA somete. La pelota pasa al manager."""
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404

            ok, motivo = reg.transicion_valida(S, s['estado'], sem.ENVIADO)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409

            # ENVIA SU AUTOR Y NADIE MAS. Ni el manager ni el admin: si otro
            # pudiera enviar por el, el sometimiento dejaria de tener autor, y
            # el autor es lo que hace que un submittal sea un acto contractual.
            if _usuario().get('id') != s['autor_id']:
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_AUTOR'}), 403

            if not s['responsable_id']:
                return jsonify({'error': 'Asigna primero un gestor de submittals: '
                                         'sin él, nadie recibe lo que envías.',
                                'code': 'SIN_MANAGER'}), 409

            cur.execute("UPDATE doc_submittals SET estado=%s, enviado_en=CURRENT_TIMESTAMP "
                        " WHERE id=%s", (sem.ENVIADO, sid))
            hist = s['history'] + [reg.entrada('sent', _actor(),
                                               to_user_id=s['responsable_id'])]
            _guardar_historial(cur, sid, hist)
            _abrir_encargo(cur, sid, s['responsable_id'],
                           'Distribuir a revision %s: %s' % (s['codigo'], s['titulo']),
                           None)
            conn.commit()
            log_activity(s['model_urn'], 'SUBMIT', 'SUBMITTAL', str(sid),
                         s['codigo'], _actor(), {})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('enviar submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo enviar.'}), 500


@submittals_bp.route('/<int:sid>/distribuir', methods=['POST'])
def distribuir(sid):
    """El MANAGER fija la cadena de revisores y arranca el primer turno.

    Los pasos tienen la MISMA forma que los de una revision --y por eso los
    resuelve `flujo_de_revision`, el mismo modulo--. Si se resolvieran aparte,
    el submittal y su proyeccion podrian discrepar sobre a quien le toca.
    """
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    pasos = data.get('steps') or []
    if not pasos:
        return jsonify({'error': 'Hace falta al menos un revisor.'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404

            ok, motivo = reg.transicion_valida(S, s['estado'], sem.EN_REVISION)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409

            obj = {'created_by': s['created_by'], 'responsable_id': s['responsable_id'],
                   'project_id': s['project_id']}
            if not reg.puede_pasar_la_pelota(S, _usuario(), obj, cur):
                return jsonify({'error': S.msg_no_reasigna, 'code': 'NO_MANAGER'}), 403

            # INDEPENDENCIA. Quien somete un producto no puede aprobarlo: seria
            # una firma delante del espejo, y aqui la firma habilita a INSTALAR.
            # Se comprueba por identidad, que es la unica que no admite homonimos.
            for p in pasos:
                if p.get('user_id') and int(p['user_id']) == int(s['autor_id']):
                    return jsonify({
                        'error': 'Quien somete el submittal no puede ser uno de sus '
                                 'revisores: nadie aprueba su propio producto.',
                        'code': 'SIN_INDEPENDENCIA'}), 409

            # Cada revisor tiene que EXISTIR y ser miembro; si no, el flujo
            # nacería bloqueado y lo descubriríamos al conciliar, no al crearlo.
            for i, p in enumerate(pasos):
                uid, motivo_p = rev.revisor_del_paso(cur, p)
                if not uid:
                    return jsonify({'error': 'Paso %d: %s' % (i + 1, motivo_p),
                                    'code': 'REVISOR_INVALIDO'}), 400
                cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                            (s['project_id'], uid))
                if not cur.fetchone():
                    return jsonify({
                        'error': 'Paso %d: esa persona no es miembro de esta obra.' % (i + 1),
                        'code': 'REVISOR_NO_MIEMBRO'}), 409

            vence = rev.vencimiento(pasos[0])
            cur.execute("""UPDATE doc_submittals
                              SET estado=%s, steps=%s, current_step=0, paso_vence_en=%s
                            WHERE id=%s""",
                        (sem.EN_REVISION, json.dumps(pasos), vence, sid))
            uid0, _m = rev.revisor_del_paso(cur, pasos[0])
            hist = s['history'] + [
                reg.entrada('distributed', _actor(), pasos=len(pasos)),
                reg.entrada('step_started', _actor(), step=0, to_user_id=uid0,
                            due=vence.isoformat() if vence else None)]
            _guardar_historial(cur, sid, hist)

            _cerrar_encargos(cur, sid)          # la del manager queda saldada
            _abrir_encargo(cur, sid, uid0,
                           'Revisar %s: %s (paso 1)' % (s['codigo'], s['titulo']),
                           vence)
            conn.commit()
            log_activity(s['model_urn'], 'DISTRIBUTE', 'SUBMITTAL', str(sid),
                         s['codigo'], _actor(), {'pasos': len(pasos)})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('distribuir submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo distribuir.'}), 500


@submittals_bp.route('/<int:sid>/responder', methods=['POST'])
def responder(sid):
    """El REVISOR DEL PASO ACTUAL se pronuncia. Nadie mas, y el admin tampoco.

    El veredicto de un submittal habilita a instalar un producto en la obra. Si
    un administrador pudiera dictarlo, la revision tecnica seria un tramite --y
    por eso la semantica declara `quien_dicta_veredicto=()`: no hay ninguna
    posicion del registro que lo dicte, solo el paso.
    """
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    veredicto = (data.get('veredicto') or '').strip()
    if veredicto not in sem.VEREDICTOS:
        return jsonify({'error': 'Veredicto desconocido.',
                        'admitidos': list(sem.VEREDICTOS)}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404
            if s['estado'] != sem.EN_REVISION:
                return jsonify({'error': 'Este submittal no está en revisión.',
                                'code': 'NO_EN_REVISION'}), 409

            pasos = s['steps'] or []
            i = s['current_step'] or 0
            if i >= len(pasos):
                return jsonify({'error': 'El flujo no tiene un paso activo.',
                                'code': 'SIN_PASO'}), 409
            if not rev.puede_actuar(_usuario(), pasos[i]):
                return jsonify({'error': 'Este paso no es tuyo: le toca a %s.'
                                         % rev.etiqueta_del_paso(pasos[i]),
                                'code': 'NO_ES_TU_PASO'}), 403

            # EL REVISOR DEVUELVE ALGO, no solo texto: el documento marcado,
            # el sello, la observacion escrita. Se anade a `adjuntos` con quien
            # y en que paso -- NUNCA se sustituye lo sometido, porque entonces
            # el veredicto dejaria de recaer sobre lo que se leyo.
            adjuntos = list(s['adjuntos'] or [])
            devueltos = data.get('adjuntos') or []
            for a in devueltos:
                adjuntos.append({**(a if isinstance(a, dict) else {'nombre': a}),
                                 'de_revision': True, 'paso': i, 'por': _actor()})
            if devueltos:
                cur.execute('UPDATE doc_submittals SET adjuntos = %s WHERE id = %s',
                            (json.dumps(adjuntos), sid))

            hist = s['history'] + [reg.entrada(
                'step_answered', _actor(), step=i, veredicto=veredicto,
                adjuntos=len(devueltos) or None,
                comentario=(data.get('comentario') or '').strip() or None)]

            # UN VEREDICTO QUE EXIGE REVISION CORTA LA CADENA. Seguir pasando a
            # los revisores siguientes un producto que ya hay que reenviar es
            # gastarles el tiempo y ensuciar el registro con firmas sobre algo
            # que no va a instalarse.
            corta = veredicto in sem.EXIGEN_REVISION
            ultimo = (i + 1) >= len(pasos)

            if corta or ultimo:
                cur.execute("""UPDATE doc_submittals
                                  SET estado=%s, veredicto=%s,
                                      veredicto_en=CURRENT_TIMESTAMP, veredicto_por=%s,
                                      paso_vence_en=NULL
                                WHERE id=%s""",
                            (sem.RESPONDIDO, veredicto, _usuario().get('id'), sid))
                hist.append(reg.entrada('verdict', _actor(), veredicto=veredicto,
                                        corto_la_cadena=bool(corta and not ultimo) or None))
                _guardar_historial(cur, sid, hist)
                _cerrar_encargos(cur, sid)
                _abrir_encargo(cur, sid, s['responsable_id'],
                               'Cerrar y distribuir %s: %s' % (s['codigo'], s['titulo']),
                               None)
            else:
                siguiente = i + 1
                vence = rev.vencimiento(pasos[siguiente])
                cur.execute("""UPDATE doc_submittals
                                  SET current_step=%s, paso_vence_en=%s WHERE id=%s""",
                            (siguiente, vence, sid))
                uid_s, _m = rev.revisor_del_paso(cur, pasos[siguiente])
                hist.append(reg.entrada('step_started', _actor(), step=siguiente,
                                        to_user_id=uid_s,
                                        due=vence.isoformat() if vence else None))
                _guardar_historial(cur, sid, hist)
                _cerrar_encargos(cur, sid)
                _abrir_encargo(cur, sid, uid_s,
                               'Revisar %s: %s (paso %d)' % (s['codigo'], s['titulo'],
                                                             siguiente + 1),
                               vence)
            conn.commit()
            log_activity(s['model_urn'], 'REVIEW', 'SUBMITTAL', str(sid),
                         s['codigo'], _actor(), {'veredicto': veredicto, 'paso': i})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('responder submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo registrar la respuesta.'}), 500


@submittals_bp.route('/<int:sid>/cerrar', methods=['POST'])
def cerrar(sid):
    """El MANAGER cierra y DISTRIBUYE el veredicto.

    Cerrar sin veredicto no se puede, y no solo aqui: la base tiene el CHECK
    `ck_submittals_cierre_con_veredicto`. Una regla que vive unicamente en
    Python la salta cualquier script.
    """
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404

            ok, motivo = reg.transicion_valida(S, s['estado'], sem.CERRADO)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
            if not s['veredicto']:
                return jsonify({'error': S.msg_falta_veredicto,
                                'code': 'SIN_VEREDICTO'}), 409

            obj = {'created_by': s['created_by'], 'responsable_id': s['responsable_id'],
                   'project_id': s['project_id']}
            if not reg.puede_cerrar(S, _usuario(), obj, cur):
                return jsonify({'error': S.msg_no_cierra, 'code': 'NO_MANAGER'}), 403

            # LA DISTRIBUCION son personas que deben ENTERARSE, no aprobar. Se
            # les abre encargo; quien no sea miembro sencillamente no recibe uno
            # --`encargos.abrir` se niega--, porque un encargo no da acceso.
            lista = data.get('distribucion') or s['distribucion'] or []
            cur.execute("""UPDATE doc_submittals
                              SET estado=%s, distribucion=%s,
                                  cerrado_en=CURRENT_TIMESTAMP, cerrado_por=%s
                            WHERE id=%s""",
                        (sem.CERRADO, json.dumps(lista), _usuario().get('id'), sid))
            hist = s['history'] + [reg.entrada('closed', _actor(),
                                               veredicto=s['veredicto'],
                                               distribuido_a=len(lista) or None)]
            _guardar_historial(cur, sid, hist)
            _cerrar_encargos(cur, sid)
            for d in lista:
                uid = d.get('user_id') if isinstance(d, dict) else None
                if uid:
                    _abrir_encargo(cur, sid, int(uid),
                                   'Enterarse del veredicto de %s: %s'
                                   % (s['codigo'], s['veredicto']), None)
            conn.commit()
            log_activity(s['model_urn'], 'CLOSE', 'SUBMITTAL', str(sid), s['codigo'],
                         _actor(), {'veredicto': s['veredicto'],
                                    'distribuido_a': len(lista)})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('cerrar submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo cerrar.'}), 500


@submittals_bp.route('/<int:sid>/revision', methods=['POST'])
def crear_revision(sid):
    """Una FILA NUEVA con el mismo codigo y revision+1. La anterior NO se toca.

    Reabrir la fila rechazada borraria que hubo un rechazo -- y el rechazo es
    justo lo que hay que poder demostrar dentro de dos anos.
    """
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404
            if s['estado'] != sem.CERRADO:
                return jsonify({'error': 'La revisión se crea sobre un submittal '
                                         'ya cerrado.', 'code': 'NO_CERRADO'}), 409
            if s['veredicto'] not in sem.EXIGEN_REVISION:
                return jsonify({'error': 'El veredicto «%s» no pide reenviar nada.'
                                         % s['veredicto'],
                                'code': 'NO_EXIGE_REVISION'}), 409
            if _usuario().get('id') != s['autor_id']:
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_AUTOR'}), 403

            data = request.get_json(silent=True) or {}
            cur.execute("""
                INSERT INTO doc_submittals
                    (project_id, model_urn, codigo, titulo, descripcion,
                     spec_seccion, spec_titulo, paquete, autor_id, responsable_id,
                     created_by, adjuntos, vence_en, revision, revision_de, history)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            """, (s['project_id'], s['model_urn'], s['codigo'], s['titulo'],
                  s['descripcion'], s['spec_seccion'], s['spec_titulo'], s['paquete'],
                  s['autor_id'], s['responsable_id'], _actor(),
                  json.dumps(data.get('adjuntos') or []), s['vence_en'],
                  (s['revision'] or 0) + 1, sid,
                  json.dumps([reg.entrada('revision_created', _actor(),
                                          de=str(sid), revision=(s['revision'] or 0) + 1,
                                          motivo=s['veredicto'])])))
            nuevo = cur.fetchone()[0]
            conn.commit()
            log_activity(s['model_urn'], 'REVISE', 'SUBMITTAL', str(nuevo), s['codigo'],
                         _actor(), {'de': str(sid), 'revision': (s['revision'] or 0) + 1})
            return jsonify(_leer(cur, nuevo)), 201
    except Exception as e:
        logger.error('revision de submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo crear la revisión.'}), 500


@submittals_bp.route('/<int:sid>/anular', methods=['POST'])
def anular(sid):
    """Se pidio por error. NO es un rechazo: un anulado no dice nada del producto."""
    corte = guardia_de_recurso('doc_submittals', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    motivo_txt = (data.get('motivo') or '').strip()
    if not motivo_txt:
        return jsonify({'error': 'Anular exige un motivo: sin él, el registro no '
                                 'explica por qué desapareció.'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            s = _leer(cur, sid)
            if not s:
                return jsonify({'error': 'No existe.'}), 404
            ok, motivo = reg.transicion_valida(S, s['estado'], sem.ANULADO)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
            obj = {'created_by': s['created_by'], 'responsable_id': s['responsable_id'],
                   'project_id': s['project_id']}
            if not reg.puede_cerrar(S, _usuario(), obj, cur):
                return jsonify({'error': S.msg_no_cierra, 'code': 'NO_MANAGER'}), 403

            cur.execute('UPDATE doc_submittals SET estado=%s, paso_vence_en=NULL '
                        ' WHERE id=%s', (sem.ANULADO, sid))
            _guardar_historial(cur, sid, s['history'] +
                               [reg.entrada('voided', _actor(), motivo=motivo_txt)])
            _cerrar_encargos(cur, sid)
            conn.commit()
            log_activity(s['model_urn'], 'VOID', 'SUBMITTAL', str(sid), s['codigo'],
                         _actor(), {'motivo': motivo_txt})
            return jsonify(_leer(cur, sid))
    except Exception as e:
        logger.error('anular submittal %s: %s', sid, e)
        return jsonify({'error': 'No se pudo anular.'}), 500
