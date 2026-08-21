# -*- coding: utf-8 -*-
"""RFI — Requerimiento de Información. Un objeto de negocio FORMAL.

QUE ES UN RFI AQUI, SEGUN LOS DATOS REALES
------------------------------------------
No es un hilo de conversacion: es un REGISTRO DE DOCUMENTOS FORMALES. La
consulta y la respuesta viven en PDF firmados y numerados
(`500125-SP-OT-GEN-RFI-003.pdf`, `…RFI-014_respuesta.pdf`), y `respuesta` no
contiene ninguna respuesta -- contiene el VEREDICTO: 'Aceptado' o 'Rechazado',
nueve caracteres como maximo en los 25 registros reales.

Asi funciona un RFI en obra publica peruana. Anadirle un campo de respuesta en
texto enriquecido porque ACC lo tiene seria copiar la forma y perder el fondo.

LO QUE LE FALTABA NO ERA CONTENIDO: ERA RESPONSABILIDAD Y RASTRO
----------------------------------------------------------------
  - `PATCH` comprobaba la OBRA y nada mas: cualquier miembro podia marcar un RFI
    como 'Aceptado' y cerrarlo. En un objeto contractual, eso significa que el
    registro no prueba nada.
  - El `responsable` salia de una lista en `localStorage` del navegador: un
    autocompletar personal, no un directorio. Por eso los 25 tienen el mismo
    valor y por eso habia CERO encargos de RFI.
  - La numeracion era `COUNT(*) + 1` sin unicidad.
  - Sin historial, sin plazo y sin notificacion.

Las reglas de quien puede que estan en `flujo_de_rfi.py`, para que este fichero
no las repita ni pueda contradecirlas.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_recurso
import encargos as _enc
import flujo_de_rfi as flujo

logger = logging.getLogger('rfi')

rfis_bp = Blueprint('rfis_bp', __name__)

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
        'id': str(r[0]), 'codigo': r[1], 'titulo': r[2], 'estado': r[3],
        'responsable': r[4], 'responsable_id': r[5],
        'fecha': r[6].isoformat() if r[6] else None,
        'adjuntos': r[7] or [], 'created_by': r[8],
        'respuesta': r[9], 'fecha_respuesta': r[10].isoformat() if r[10] else None,
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
    revision para que el RFI --con su numero y su veredicto puestos-- enseñara
    otra cosa. Es el mismo defecto que ya se corrigio en las entregas.

    Los adjuntos LEGACY (`{id, name, gcs_urn}`) se dejan pasar tal cual y no se
    convierten: seguiran abriendo la version viva, como hoy.
    """
    from folder_permissions import check_folder_permission
    for a in (adjuntos or []):
        if not isinstance(a, dict):
            return jsonify({'error': 'Adjunto con formato desconocido'}), 400
        nodo = a.get('node_id')
        if not nodo:
            continue          # legacy: se conserva sin tocar
        # El documento tiene que ser DE ESTA OBRA y quien adjunta tiene que
        # poder verlo. Antes no se comprobaba ninguna de las dos cosas.
        cur.execute('SELECT model_urn FROM file_nodes WHERE id::text = %s', (str(nodo),))
        fila = cur.fetchone()
        if not fila:
            return jsonify({'error': 'El documento adjunto no existe.'}), 400
        if resolve_project_id(fila[0]) != resolve_project_id(model_urn):
            return jsonify({'error': 'Ese documento es de otra obra.',
                            'code': 'ADJUNTO_DE_OTRA_OBRA'}), 400
        # 'viewer' es el nivel real de lectura (folder_permissions.py:14).
        # Adjuntar un documento a un RFI no exige poder editarlo: exige
        # poder VERLO. Pedir 'edit' dejaria fuera a quien consulta.
        negado = check_folder_permission(usuario, nodo, model_urn, 'viewer',
                                         'adjuntar este documento al RFI')
        if negado:
            return negado
    return None


# ── Lectura ───────────────────────────────────────────────────────────────

@rfis_bp.route('/<path:model_urn>', methods=['GET'])
def get_rfis(model_urn):
    """La lista de RFI de una obra. El perimetro lo aplica el middleware."""
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT %s FROM doc_rfis WHERE model_urn = %%s '
                        ' ORDER BY created_at DESC' % _COLS, (model_urn,))
            datos = [_con_flujo(cur, _fila(r)) for r in cur.fetchall()]
        return jsonify(datos), 200
    except Exception as e:
        logger.error('GET /api/rfis: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Alta ──────────────────────────────────────────────────────────────────

@rfis_bp.route('', methods=['POST'])
def create_rfi():
    """Crea un RFI. La obra es obligatoria y el numero, determinista."""
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400

    # LA OBRA NO PUEDE SER DESCONOCIDA. Sin esto se crearia un RFI con
    # `project_id` nulo -- y en SQL dos NULL no chocan, asi que se colaria por
    # debajo de la restriccion unica y podrian convivir dos RFI-013.
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar a qué obra pertenece este RFI.',
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
                        'INSERT INTO doc_rfis (model_urn, codigo, titulo, created_by, '
                        '                      project_id, estado, historial) '
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
                    if 'uq_doc_rfis_codigo' not in str(e) and 'unique' not in str(e).lower():
                        raise
                    logger.warning('codigo %s ya tomado (intento %d)', codigo, intento + 1)
            else:
                # Tres colisiones seguidas. Se dice lo que pasa, con un codigo
                # que el cliente puede entender -- no un 500 sin explicacion.
                return jsonify({
                    'error': 'Varias personas están creando RFI a la vez. '
                             'Vuelve a intentarlo.',
                    'code': 'CODIGO_EN_DISPUTA'}), 409

        return jsonify({'message': 'RFI Creado', 'rfi': {
            'id': rid, 'codigo': codigo, 'titulo': titulo, 'estado': 'Emitido',
            'responsable': '', 'responsable_id': None,
            'fecha': fecha.isoformat() if fecha else None,
            'adjuntos': [], 'created_by': creado_por, 'respuesta': '',
            'fecha_respuesta': None, 'project_id': obra,
        }}), 200
    except Exception as e:
        logger.error('POST /api/rfis: %s', e)
        return jsonify({'error': str(e)}), 500


# ── Cambios ───────────────────────────────────────────────────────────────

# Lo que se puede escribir. `codigo`, `created_by` y `project_id` NO estan: la
# identidad de un RFI no se edita.
_EDITABLES = ('titulo', 'estado', 'responsable', 'fecha', 'adjuntos',
              'respuesta', 'fecha_respuesta', 'responsable_id', 'vence_en')


@rfis_bp.route('/<rfi_id>', methods=['PATCH'])
def update_rfi(rfi_id):
    """Cambia un RFI, con las reglas de quien puede que.

    Antes esto comprobaba la obra y NADA MAS: el propio autor podia marcar su
    RFI como 'Aceptado' y cerrarlo.
    """
    negativa = guardia_de_recurso('doc_rfis', rfi_id)
    if negativa:
        return negativa
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    u = _usuario()
    actor = _actor()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT %s FROM doc_rfis WHERE id::text = %%s FOR UPDATE' % _COLS,
                        (str(rfi_id),))
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'RFI not found'}), 404
            rfi = _fila(row)

            historia = list(rfi['historial'] or [])
            cambios, valores = [], []

            def poner(col, valor):
                cambios.append('%s = %%s' % col)
                valores.append(valor)

            def poner_sql(expresion):
                """Para valores que los pone PostgreSQL, no nosotros.

                La fecha de la respuesta la fija el servidor: si la mandara el
                cliente, el registro diria que se respondio cuando el cliente
                quiera. Es un dato contractual.
                """
                cambios.append(expresion)

            # ── 1. Pasar la pelota ────────────────────────────────────────
            nuevo_resp = data.get('responsable_id')
            if nuevo_resp is not None and str(nuevo_resp) != str(rfi['responsable_id'] or ''):
                if rfi['estado'] == 'Cerrado':
                    return jsonify({'error': 'Un RFI cerrado no se reasigna.',
                                    'code': 'RFI_CERRADO'}), 409

                adopcion = flujo.necesita_adopcion(rfi)
                permitido = (flujo.puede_adoptar(u, rfi) if adopcion
                             else flujo.puede_pasar_la_pelota(u, rfi))
                if not permitido:
                    return jsonify({
                        'error': ('Solo quien creó el RFI o un administrador puede '
                                  'incorporarlo al flujo.') if adopcion else
                                 ('Solo quien creó el RFI, quien lo tiene ahora o un '
                                  'administrador pueden cambiar el responsable.'),
                        'code': 'NO_PUEDE_REASIGNAR'}), 403

                cur.execute('SELECT id, name, email FROM users '
                            ' WHERE id = %s AND is_active', (int(nuevo_resp),))
                nuevo = cur.fetchone()
                if not nuevo:
                    return jsonify({'error': 'Ese usuario no existe o está desactivado.'}), 400
                cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                            '  AND user_id = %s', (str(rfi['project_id']), int(nuevo_resp)))
                if not cur.fetchone():
                    return jsonify({
                        'error': '%s no pertenece a esta obra.' % (nuevo[1] or nuevo[2]),
                        'code': 'RESPONSABLE_FUERA_DE_LA_OBRA'}), 400

                poner('responsable_id', int(nuevo_resp))
                if adopcion:
                    # EL TEXTO ORIGINAL NO SE TOCA. Nadie decide que
                    # 'Ing. Valeria Barrenechea' es tal usuario: una persona lo
                    # elige, y queda dicho QUIEN lo eligio.
                    historia.append(flujo.entrada(
                        'adopted', actor, responsable_texto=rfi['responsable'],
                        responsable_id=int(nuevo_resp),
                        responsable_nombre=nuevo[1] or nuevo[2]))
                else:
                    historia.append(flujo.entrada(
                        'ball_in_court_changed', actor,
                        de=rfi['responsable_id'], a=int(nuevo_resp),
                        a_nombre=nuevo[1] or nuevo[2]))
                # Emitido pasa a En revision al asignarse por primera vez.
                if (rfi['estado'] or 'Emitido') == 'Emitido' and not data.get('estado'):
                    poner('estado', 'En revisión')
                    historia.append(flujo.entrada('estado', actor,
                                                  de=rfi['estado'], a='En revisión'))

            # ── 2. Estado ─────────────────────────────────────────────────
            nuevo_estado = data.get('estado')
            if nuevo_estado and nuevo_estado != rfi['estado']:
                vale, motivo = flujo.transicion_valida(rfi['estado'], nuevo_estado)
                if not vale:
                    return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
                if flujo.necesita_adopcion(rfi) and nuevo_estado in ('Respondido', 'Cerrado'):
                    return jsonify({
                        'error': 'Este RFI viene del registro anterior y todavía no '
                                 'tiene responsable del sistema. Asígnalo antes de '
                                 'responderlo o cerrarlo.',
                        'code': 'NECESITA_ADOPCION'}), 409
                if nuevo_estado == 'Respondido':
                    if not flujo.puede_dictar_veredicto(u, rfi):
                        return jsonify({
                            'error': 'Solo quien tiene el RFI puede responderlo.',
                            'code': 'NO_PUEDE_RESPONDER'}), 403
                    veredicto = (data.get('respuesta') or rfi['respuesta'] or '').strip()
                    if not veredicto:
                        return jsonify({
                            'error': 'Responder exige un veredicto (Aceptado o Rechazado).',
                            'code': 'FALTA_VEREDICTO'}), 400
                    poner('respuesta', veredicto)
                    poner_sql('fecha_respuesta = CURRENT_TIMESTAMP')
                    historia.append(flujo.entrada('responded', actor, veredicto=veredicto))
                elif nuevo_estado == 'Cerrado':
                    if not flujo.puede_cerrar(u, rfi):
                        return jsonify({
                            'error': 'Cierra el RFI quien lo creó, o un administrador.',
                            'code': 'NO_PUEDE_CERRAR'}), 403
                    poner('cerrado_por', actor)
                    historia.append(flujo.entrada('closed', actor,
                                                  veredicto=rfi['respuesta']))
                else:
                    historia.append(flujo.entrada('estado', actor,
                                                  de=rfi['estado'], a=nuevo_estado))
                poner('estado', nuevo_estado)

            # ── 3. El resto de campos ─────────────────────────────────────
            if rfi['estado'] == 'Cerrado' and not nuevo_estado:
                # Cerrado es cerrado: no se retoca el registro despues.
                return jsonify({'error': 'Un RFI cerrado ya no se modifica.',
                                'code': 'RFI_CERRADO'}), 409

            if 'adjuntos' in data:
                negado = _validar_adjuntos(cur, u, rfi['model_urn'], data['adjuntos'])
                if negado:
                    return negado
                poner('adjuntos', json.dumps(data['adjuntos']))
            for campo in ('titulo', 'responsable', 'fecha', 'vence_en'):
                if campo in data:
                    poner(campo, data[campo] or None)
            if 'respuesta' in data and not nuevo_estado:
                # Cambiar el veredicto sin cambiar de estado tambien es dictarlo.
                if not flujo.puede_dictar_veredicto(u, rfi):
                    return jsonify({'error': 'Solo quien tiene el RFI puede responderlo.',
                                    'code': 'NO_PUEDE_RESPONDER'}), 403
                poner('respuesta', data['respuesta'])

            if not cambios:
                return jsonify({'message': 'No valid fields to update'}), 200

            cambios.append('historial = %s')
            valores.append(json.dumps(historia))
            cambios.append('updated_at = CURRENT_TIMESTAMP')
            valores.append(str(rfi_id))
            cur.execute('UPDATE doc_rfis SET %s WHERE id::text = %%s RETURNING id'
                        % ', '.join(cambios), tuple(valores))
            if not cur.fetchone():
                return jsonify({'error': 'RFI not found'}), 404

            # El encargo es la PROYECCION: se mueve porque se movio el objeto.
            _mover_encargo(cur, rfi_id, rfi, data, actor, nuevo_estado)
            conn.commit()
        return jsonify({'message': 'Updated successfully'}), 200
    except Exception as e:
        logger.error('PATCH /api/rfis: %s', e)
        return jsonify({'error': str(e)}), 500


def _mover_encargo(cur, rfi_id, rfi, data, actor, nuevo_estado):
    """Abre o cierra el encargo segun la transicion del objeto.

    Nunca al reves: `encargos` no decide nada, refleja. Y un fallo aqui no puede
    tumbar la transicion contractual -- por eso todo va dentro de un try.
    """
    try:
        if nuevo_estado in ('Respondido', 'Cerrado'):
            _enc.cerrar_los_de(cur, 'RFI', rfi_id, actor)
            return
        nuevo_resp = data.get('responsable_id')
        if nuevo_resp is None or str(nuevo_resp) == str(rfi['responsable_id'] or ''):
            return
        # Reasignar cierra lo anterior: la deuda no puede quedar en dos manos.
        _enc.cerrar_los_de(cur, 'RFI', rfi_id, actor)
        vence = data.get('vence_en') if 'vence_en' in data else rfi.get('vence_en')
        eid = _enc.abrir(cur, 'RFI', rfi_id,
                         'Responder %s: %s' % (rfi['codigo'], rfi['titulo'] or ''),
                         destino_usuario=int(nuevo_resp), vence_en=vence,
                         creado_por=actor)
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        logger.warning('encargo del RFI %s no movido: %s', rfi_id, e)
