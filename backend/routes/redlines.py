# -*- coding: utf-8 -*-
"""Red Line — el registro de los CROQUIS DE MODIFICACION del proyecto.

QUE ES UN RED LINE AQUI, SEGUN LOS DATOS REALES
-----------------------------------------------
No es una observacion ni un markup grafico: es un REGISTRO DE DOCUMENTOS
FORMALES. Los 33 registros reales adjuntan croquis numerados y firmados
--`RL_0004_500125-SCL-CNS-RL-SKT-P08-0004_RL_BP-01_a_BP-04.pdf`, donde `SKT` es
sketch-- y sus titulos son modificaciones del proyecto:
`Reubicar_BP-04_Y_CAMBIO_DE_COTA_BP-01`, `REFUERZO_EN_ABERTURAS`.

`respuesta` no contiene ninguna respuesta: contiene el VEREDICTO sobre la
modificacion, 'Aceptado' o 'Rechazado'. Los 33 estan en 'Cerrado'/'Aceptado'.

El markup grafico es OTRA COSA y ya existe aparte: `pdf_markups`, dibujado
desde `PdfToolsOverlay`. Este fichero no lo menciona, y asi debe seguir.

LO QUE LE FALTABA NO ERA CONTENIDO: ERA RESPONSABILIDAD Y RASTRO
----------------------------------------------------------------
  - `PATCH` comprobaba la OBRA y nada mas: CUALQUIER miembro podia marcar una
    modificacion como 'Aceptado' y cerrarla. En un registro que documenta
    cambios al proyecto, eso significa que no prueba nada.
  - El `responsable` salia de una lista en `localStorage` del navegador: un
    autocompletar personal, no un directorio. Por eso los 33 tienen el mismo
    valor.
  - La numeracion era `COUNT(*) + 1` sin unicidad, y agrupada por `model_urn`
    --un ALCANCE-- en vez de por la obra.
  - Sin historial, sin plazo y sin notificacion.
  - Y habia un camino de asignacion PARALELO Y SIN GOBIERNO,
    `responsable_funcion`, que abria un encargo a una funcion contractual sin
    pasar por ninguna comprobacion. No lo usaba nadie --ni la interfaz ni las
    pruebas-- y era justo el defecto que esta pieza corrige, asi que se retiro.

Las reglas de quien puede que estan en `flujo_de_redline.py`, para que este
fichero no las repita ni pueda contradecirlas. La MECANICA la comparte con el
RFI (`flujo_de_registro.py`); el SIGNIFICADO no.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_recurso
import encargos as _enc
import flujo_de_redline as flujo

logger = logging.getLogger('redline')

redlines_bp = Blueprint('redlines_bp', __name__)

# Las columnas que se devuelven y se leen, en un solo sitio.
_COLS = ('id, codigo, titulo, estado, responsable, responsable_id, fecha, '
         'adjuntos, created_by, respuesta, fecha_respuesta, vence_en, '
         'historial, cerrado_por, model_urn, project_id')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r):
    return {
        'id': str(r[0]), 'codigo': r[1], 'titulo': r[2] or '', 'estado': r[3],
        'responsable': r[4] or '', 'responsable_id': r[5],
        'fecha': r[6].isoformat() if r[6] else None,
        'adjuntos': r[7] if isinstance(r[7], list) else json.loads(r[7] or '[]'),
        'created_by': r[8], 'respuesta': r[9] or '',
        'fecha_respuesta': r[10].isoformat() if r[10] else None,
        'vence_en': r[11].isoformat() if r[11] else None,
        'historial': r[12] or [], 'cerrado_por': r[13],
        'model_urn': r[14], 'project_id': r[15],
    }


def _con_flujo(cur, d):
    """Anade ACTIVO / SIN_ASIGNAR / BLOQUEADO / CERRADO. Calculado, no guardado."""
    try:
        estado, motivo = flujo.estado_del_flujo(cur, d)
        d['flujo'], d['flujo_motivo'] = estado, motivo
        d['necesita_adopcion'] = flujo.necesita_adopcion(d)
    except Exception:
        d['flujo'], d['flujo_motivo'], d['necesita_adopcion'] = None, '', False
    return d


def _validar_adjuntos(cur, usuario, model_urn, adjuntos):
    """None si valen; (respuesta, codigo) si no.

    UN ADJUNTO NUEVO SE FIJA A UNA VERSION. Antes se guardaba solo el nodo, o
    sea «lo que haya hoy en ese fichero»: bastaba con que alguien subiera una
    revision para que el croquis RL-004 --con su numero y su veredicto puestos--
    enseñara otra cosa. En un registro de modificaciones del proyecto eso es
    grave: la version donde se detecto la modificacion es parte de la prueba.

    Los 29 adjuntos LEGACY (`{id, name, gcs_urn}`) se dejan pasar tal cual y NO
    se convierten: seguiran abriendo la version viva, como hoy.
    """
    from folder_permissions import check_folder_permission
    for a in (adjuntos or []):
        if not isinstance(a, dict):
            return jsonify({'error': 'Adjunto con formato desconocido'}), 400
        nodo = a.get('node_id')
        if not nodo:
            continue          # legacy: se conserva sin tocar
        cur.execute('SELECT model_urn FROM file_nodes WHERE id::text = %s', (str(nodo),))
        fila = cur.fetchone()
        if not fila:
            return jsonify({'error': 'El documento adjunto no existe.'}), 400
        if resolve_project_id(fila[0]) != resolve_project_id(model_urn):
            return jsonify({'error': 'Ese documento es de otra obra.',
                            'code': 'ADJUNTO_DE_OTRA_OBRA'}), 400
        # 'viewer' es el nivel real de lectura (folder_permissions.py:14).
        # Adjuntar un plano a un Red Line no exige poder editarlo: exige poder
        # VERLO.
        negado = check_folder_permission(usuario, nodo, model_urn, 'viewer',
                                         'adjuntar este documento al Red Line')
        if negado:
            return negado
    return None


# ── Lectura ───────────────────────────────────────────────────────────────

@redlines_bp.route('/<path:model_urn>', methods=['GET'])
def get_redlines(model_urn):
    """La lista de Red Lines de una obra. El perimetro lo aplica el middleware."""
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT %s FROM doc_redlines WHERE model_urn = %%s '
                        ' ORDER BY created_at DESC' % _COLS, (model_urn,))
            datos = [_con_flujo(cur, _fila(r)) for r in cur.fetchall()]
        # `{"results": [...]}` es el contrato que la interfaz espera. Al
        # reescribir la ruta gemela del RFI se rompio sin querer y nadie lo noto
        # porque el modulo no estaba montado; aqui SI lo esta, y las pruebas
        # comprueban el contrato como cliente HTTP, no solo la base.
        return jsonify({'results': datos}), 200
    except Exception as e:
        logger.error('GET /api/redlines: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Alta ──────────────────────────────────────────────────────────────────

@redlines_bp.route('', methods=['POST'])
def create_redline():
    """Crea un Red Line. La obra es obligatoria y el numero, determinista."""
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400

    # LA OBRA NO PUEDE SER DESCONOCIDA. Sin esto se crearia un Red Line con
    # `project_id` nulo -- y en SQL DOS NULL NO CHOCAN, asi que se colaria por
    # debajo de la restriccion unica y podrian convivir dos RL-013.
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar a qué obra pertenece este Red Line.',
                        'code': 'PROJECT_UNRESOLVED'}), 400

    titulo = (data.get('titulo') or '').strip()
    creado_por = _actor()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # REINTENTO CON SAVEPOINT.
            #
            # En PostgreSQL, una violacion de unicidad ABORTA la transaccion: a
            # partir de ahi cualquier sentencia falla con «current transaction is
            # aborted». Sin un punto de retorno, el reintento seria un adorno y
            # dos creaciones simultaneas acabarian en un 500 opaco.
            for intento in range(3):
                codigo = flujo.siguiente_codigo(cur, obra)
                cur.execute('SAVEPOINT intento_codigo')
                try:
                    cur.execute(
                        'INSERT INTO doc_redlines (model_urn, codigo, titulo, created_by, '
                        '                          project_id, estado, historial) '
                        'VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id::text, fecha',
                        (model_urn, codigo, titulo, creado_por, obra, 'Emitido',
                         json.dumps([flujo.entrada('created', creado_por,
                                                   codigo=codigo)])))
                    rid, fecha = cur.fetchone()
                    cur.execute('RELEASE SAVEPOINT intento_codigo')
                    conn.commit()
                    break
                except Exception as e:
                    cur.execute('ROLLBACK TO SAVEPOINT intento_codigo')
                    if (flujo.SEMANTICA.restriccion_unica not in str(e)
                            and 'unique' not in str(e).lower()):
                        raise
                    logger.warning('codigo %s ya tomado (intento %d)', codigo, intento + 1)
            else:
                return jsonify({
                    'error': 'Varias personas están creando Red Lines a la vez. '
                             'Vuelve a intentarlo.',
                    'code': 'CODIGO_EN_DISPUTA'}), 409

        # La clave `rfi` es la que la interfaz compartida ya lee. Renombrarla
        # aqui obligaria a bifurcar el componente por un nombre.
        return jsonify({'message': 'Red Line Creado', 'rfi': {
            'id': rid, 'codigo': codigo, 'titulo': titulo, 'estado': 'Emitido',
            'responsable': '', 'responsable_id': None,
            'fecha': fecha.isoformat() if fecha else None,
            'adjuntos': [], 'created_by': creado_por, 'respuesta': '',
            'fecha_respuesta': None, 'project_id': obra,
        }}), 200
    except Exception as e:
        logger.error('POST /api/redlines: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Cambios ───────────────────────────────────────────────────────────────

@redlines_bp.route('/<redline_id>', methods=['PATCH'])
def update_redline(redline_id):
    """Cambia un Red Line, con las reglas de quien puede que.

    Antes esto comprobaba la obra y NADA MAS: cualquier miembro podia aceptar
    una modificacion del proyecto y cerrarla.
    """
    # De que obra es este recurso. Sin esto, conocer el id bastaba para
    # escribir en el expediente de otra obra.
    negativa = guardia_de_recurso('doc_redlines', redline_id)
    if negativa:
        return negativa
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    sem = flujo.SEMANTICA
    u = _usuario()
    actor = _actor()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT %s FROM doc_redlines WHERE id::text = %%s FOR UPDATE'
                        % _COLS, (str(redline_id),))
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'Red Line not found'}), 404
            rl = _fila(row)

            historia = list(rl['historial'] or [])
            cambios, valores = [], []

            def poner(col, valor):
                cambios.append('%s = %%s' % col)
                valores.append(valor)

            def poner_sql(expresion):
                """Para valores que los pone PostgreSQL, no nosotros.

                La fecha del veredicto la fija el servidor: si la mandara el
                cliente, el registro diria que se acepto la modificacion cuando
                el cliente quiera.
                """
                cambios.append(expresion)

            # ── 1. Pasar la pelota ────────────────────────────────────────
            nuevo_resp = data.get('responsable_id')
            if nuevo_resp is not None and str(nuevo_resp) != str(rl['responsable_id'] or ''):
                if rl['estado'] == 'Cerrado':
                    return jsonify({'error': 'Un Red Line cerrado no se reasigna.',
                                    'code': 'REDLINE_CERRADO'}), 409

                adopcion = flujo.necesita_adopcion(rl)
                permitido = (flujo.puede_adoptar(u, rl, cur) if adopcion
                             else flujo.puede_pasar_la_pelota(u, rl, cur))
                if not permitido:
                    return jsonify({
                        'error': sem.msg_no_adopta if adopcion else sem.msg_no_reasigna,
                        'code': 'NO_PUEDE_REASIGNAR'}), 403

                cur.execute('SELECT id, name, email FROM users '
                            ' WHERE id = %s AND is_active', (int(nuevo_resp),))
                nuevo = cur.fetchone()
                if not nuevo:
                    return jsonify({'error': 'Ese usuario no existe o está desactivado.'}), 400
                cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                            '  AND user_id = %s', (str(rl['project_id']), int(nuevo_resp)))
                if not cur.fetchone():
                    return jsonify({
                        'error': '%s no pertenece a esta obra.' % (nuevo[1] or nuevo[2]),
                        'code': 'RESPONSABLE_FUERA_DE_LA_OBRA'}), 400

                poner('responsable_id', int(nuevo_resp))
                if adopcion:
                    # EL TEXTO ORIGINAL NO SE TOCA. Nadie decide que el nombre
                    # escrito a mano es tal usuario: una persona lo elige, y
                    # queda dicho QUIEN lo eligio.
                    historia.append(flujo.entrada(
                        'adopted', actor, responsable_texto=rl['responsable'],
                        responsable_id=int(nuevo_resp),
                        responsable_nombre=nuevo[1] or nuevo[2]))
                else:
                    historia.append(flujo.entrada(
                        'ball_in_court_changed', actor,
                        de=rl['responsable_id'], a=int(nuevo_resp),
                        a_nombre=nuevo[1] or nuevo[2]))
                # Emitido pasa a En revision al asignarse por primera vez.
                if (rl['estado'] or 'Emitido') == 'Emitido' and not data.get('estado'):
                    poner('estado', 'En revisión')
                    historia.append(flujo.entrada('estado', actor,
                                                  de=rl['estado'], a='En revisión'))

            # ── 2. Estado ─────────────────────────────────────────────────
            nuevo_estado = data.get('estado')
            if nuevo_estado and nuevo_estado != rl['estado']:
                vale, motivo = flujo.transicion_valida(rl['estado'], nuevo_estado)
                if not vale:
                    return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
                if flujo.necesita_adopcion(rl) and nuevo_estado in ('Respondido', 'Cerrado'):
                    return jsonify({'error': sem.msg_necesita_adopcion,
                                    'code': 'NECESITA_ADOPCION'}), 409
                if nuevo_estado == 'Respondido':
                    # EL VEREDICTO SOBRE LA MODIFICACION lo dicta SOLO quien
                    # tiene el Red Line. Ni quien lo emitio ni un administrador:
                    # aceptar la propia propuesta no prueba nada.
                    if not flujo.puede_dictar_veredicto(u, rl, cur):
                        return jsonify({'error': sem.msg_no_veredicto,
                                        'code': 'NO_PUEDE_RESPONDER'}), 403
                    veredicto = (data.get('respuesta') or rl['respuesta'] or '').strip()
                    if not veredicto:
                        return jsonify({'error': sem.msg_falta_veredicto,
                                        'code': 'FALTA_VEREDICTO'}), 400
                    poner('respuesta', veredicto)
                    poner_sql('fecha_respuesta = CURRENT_TIMESTAMP')
                    historia.append(flujo.entrada('responded', actor, veredicto=veredicto))
                elif nuevo_estado == 'Cerrado':
                    if not flujo.puede_cerrar(u, rl, cur):
                        return jsonify({'error': sem.msg_no_cierra,
                                        'code': 'NO_PUEDE_CERRAR'}), 403
                    poner('cerrado_por', actor)
                    historia.append(flujo.entrada('closed', actor,
                                                  veredicto=rl['respuesta']))
                else:
                    # DEVOLVER A CORRECCION (`Respondido -> En revisión`) es la
                    # misma posicion que cerrar: quien lo emitio, o un
                    # administrador. Quien dicto el veredicto no puede deshacerlo.
                    if rl['estado'] == 'Respondido' and nuevo_estado == 'En revisión':
                        if not flujo.puede_cerrar(u, rl, cur):
                            return jsonify({
                                'error': 'Devuelve el Red Line a revisión quien lo '
                                         'emitió, o un administrador.',
                                'code': 'NO_PUEDE_DEVOLVER'}), 403
                        historia.append(flujo.entrada('returned', actor,
                                                      veredicto=rl['respuesta']))
                        # AL DEVOLVER SE RETIRA EL VEREDICTO, y no es un detalle:
                        #
                        # 1. Semantica. Si la modificacion vuelve a revision es
                        #    porque su veredicto ya no vale. Dejarlo puesto
                        #    describiria un Red Line «en revisión» que a la vez
                        #    consta como resuelto.
                        # 2. Convergencia. `_faltantes` y `_sigue_debiendose`
                        #    tratan un `respuesta` no vacia como «ya no se debe».
                        #    Con el veredicto viejo pegado, reabrir el encargo lo
                        #    haria sobrante en el acto y la conciliacion
                        #    OSCILARIA -- el mismo defecto que ya se pago una vez.
                        #
                        # No se pierde nada: el veredicto retirado queda en el
                        # historial, en la linea `returned` de aqui arriba.
                        poner('respuesta', None)
                        poner_sql('fecha_respuesta = NULL')
                    else:
                        historia.append(flujo.entrada('estado', actor,
                                                      de=rl['estado'], a=nuevo_estado))
                poner('estado', nuevo_estado)

            # ── 3. El resto de campos ─────────────────────────────────────
            if rl['estado'] == 'Cerrado' and not nuevo_estado:
                # Cerrado es cerrado: no se retoca el registro despues. Es lo
                # que protege a los 33 historicos.
                return jsonify({'error': sem.msg_cerrado,
                                'code': 'REDLINE_CERRADO'}), 409

            if 'adjuntos' in data:
                negado = _validar_adjuntos(cur, u, rl['model_urn'], data['adjuntos'])
                if negado:
                    return negado
                poner('adjuntos', json.dumps(data['adjuntos']))
            for campo in ('titulo', 'responsable', 'fecha', 'vence_en'):
                if campo in data:
                    poner(campo, data[campo] or None)
            if 'respuesta' in data and not nuevo_estado:
                # Cambiar el veredicto sin cambiar de estado tambien es dictarlo.
                if not flujo.puede_dictar_veredicto(u, rl, cur):
                    return jsonify({'error': sem.msg_no_veredicto,
                                    'code': 'NO_PUEDE_RESPONDER'}), 403
                poner('respuesta', data['respuesta'])

            if not cambios:
                return jsonify({'message': 'No valid fields to update'}), 200

            cambios.append('historial = %s')
            valores.append(json.dumps(historia))
            cambios.append('updated_at = CURRENT_TIMESTAMP')
            valores.append(str(redline_id))
            cur.execute('UPDATE doc_redlines SET %s WHERE id::text = %%s RETURNING id'
                        % ', '.join(cambios), tuple(valores))
            if not cur.fetchone():
                return jsonify({'error': 'Red Line not found'}), 404

            # El encargo es la PROYECCION: se mueve porque se movio el objeto.
            _mover_encargo(cur, redline_id, rl, data, actor, nuevo_estado)
            conn.commit()
        return jsonify({'message': 'Updated successfully'}), 200
    except Exception as e:
        logger.error('PATCH /api/redlines: %s', e)
        return jsonify({'error': str(e)}), 500


def _mover_encargo(cur, rl_id, rl, data, actor, nuevo_estado):
    """Abre o cierra el encargo segun la transicion del objeto.

    Nunca al reves: `encargos` no decide nada, REFLEJA. Y un fallo aqui no puede
    tumbar la transicion del registro -- por eso todo va dentro de un try. Es la
    misma leccion que se pago con el acuse de una emision, que devolvia 500
    porque la proyeccion habia fallado.
    """
    try:
        if nuevo_estado in ('Respondido', 'Cerrado'):
            _enc.cerrar_los_de(cur, 'REDLINE', rl_id, actor)
            return
        # DEVOLVER A CORRECCION LE VUELVE A TOCAR AL RESPONSABLE. Sin esto, el
        # Red Line volvia a «En revisión» y no aparecia en la bandeja de nadie:
        # una devolucion que nadie ve no es una devolucion.
        if (nuevo_estado == 'En revisión' and rl['estado'] == 'Respondido'
                and rl.get('responsable_id')):
            _enc.cerrar_los_de(cur, 'REDLINE', rl_id, actor)
            eid = _enc.abrir(cur, 'REDLINE', rl_id,
                             flujo.SEMANTICA.asunto_encargo % (rl['codigo'],
                                                               rl['titulo'] or ''),
                             destino_usuario=int(rl['responsable_id']),
                             vence_en=data.get('vence_en', rl.get('vence_en')),
                             creado_por=actor)
            if eid:
                _enc.avisar(cur, eid)
            return
        nuevo_resp = data.get('responsable_id')
        if nuevo_resp is None or str(nuevo_resp) == str(rl['responsable_id'] or ''):
            return
        # Reasignar cierra lo anterior: la deuda no puede quedar en dos manos.
        _enc.cerrar_los_de(cur, 'REDLINE', rl_id, actor)
        vence = data.get('vence_en') if 'vence_en' in data else rl.get('vence_en')
        eid = _enc.abrir(cur, 'REDLINE', rl_id,
                         flujo.SEMANTICA.asunto_encargo % (rl['codigo'], rl['titulo'] or ''),
                         destino_usuario=int(nuevo_resp), vence_en=vence,
                         creado_por=actor)
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        logger.warning('encargo del Red Line %s no movido: %s', rl_id, e)
