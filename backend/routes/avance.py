# -*- coding: utf-8 -*-
"""NG-04 · Avance físico desde campo — reportar, aprobar/devolver, proyectar.

Las reglas viven en `avance_fisico.py`; aquí solo transporte y transacciones.
El 4D consume ÚNICAMENTE lo aprobado: la proyección escribe el evento
`source='campo'` (idempotente por id canónico) y las columnas ACTUAL del
cronograma — jamás `planned_*` ni `metrado` (doc 98 §I).
"""
import json
import logging
from datetime import date, datetime, timezone

from flask import Blueprint, request, jsonify, g

import avance_fisico as af
import directorio_de_obra as dirobra
import encargos as _enc
from db import get_db_connection, log_activity
from routes.documents import verify_project_access

logger = logging.getLogger(__name__)
avance_bp = Blueprint('avance', __name__)


def _usuario():
    return getattr(g, 'current_user', None)


def _actor():
    u = _usuario() or {}
    return u.get('email') or u.get('name') or 'desconocido'


def _quien_es(cur, obra):
    """(uid, empresa_id, funcion) del actor EN ESTA obra — snapshot vivo."""
    u = _usuario() or {}
    uid = u.get('id')
    funcion = dirobra.funcion_de(cur, obra, uid)
    cur.execute('SELECT company_id FROM users WHERE id = %s', (uid,))
    f = cur.fetchone()
    return uid, (f[0] if f else None), funcion


def _fila(r):
    return {
        'id': str(r[0]), 'numero': r[1], 'dataset_id': r[2],
        'activity_id': r[3], 'cost_item_codigo': r[4],
        'elemento_link_id': r[5], 'frente_label': r[6],
        'progresiva_inicio': r[7], 'progresiva_fin': r[8], 'tipo': r[9],
        'ajusta_a': str(r[10]) if r[10] else None, 'cantidad': r[11],
        'unidad': r[12], 'termina_actividad': r[13], 'descripcion': r[14],
        'estado': r[15], 'fecha_operativa': r[16].isoformat() if r[16] else None,
        'origen': r[17], 'autor_id': r[18], 'autor_funcion': r[19],
        'aprobado_por': r[20], 'aprobado_funcion': r[21],
        'aprobado_en': r[22].isoformat() if r[22] else None,
        'motivo_devolucion': r[23],
        'objetivo_fuente': r[24], 'objetivo_cantidad': r[25],
        'objetivo_huella': r[26],
        'conflictos_detectados': r[27] or [],
        'conflictos_confirmados': r[28] or [],
        'proyectado_en': r[29].isoformat() if r[29] else None,
        'created_by': r[30],
    }


_COLS = ("id, numero, dataset_id, activity_id, cost_item_codigo, "
         "elemento_link_id, frente_label, progresiva_inicio, progresiva_fin, "
         "tipo, ajusta_a, cantidad, unidad, termina_actividad, descripcion, "
         "estado, fecha_operativa, origen, autor_id, autor_funcion, "
         "aprobado_por, aprobado_funcion, aprobado_en, motivo_devolucion, "
         "objetivo_fuente, objetivo_cantidad, objetivo_huella, "
         "conflictos_detectados, conflictos_confirmados, proyectado_en, "
         "created_by")


def _dataset_activo(cur, obra):
    """El dataset LOB vigente de la obra, con su huella (corrección 1)."""
    cur.execute("""SELECT id, version, source_fingerprint FROM lob_datasets
                    WHERE scope_urn = %s AND is_active IS TRUE
                    ORDER BY created_at DESC LIMIT 1""", (str(obra),))
    f = cur.fetchone()
    if not f:
        return None, None
    return f[0], af.huella_de_dataset(f[0], f[1], f[2])


def _objetivo_de(cur, dataset_id, activity_id, cost_item_codigo):
    """(cantidad, unidad, objetivo_id) contra el plan VIGENTE, o (None,)*3."""
    if not dataset_id:
        return None, None, None
    if cost_item_codigo:
        cur.execute("""SELECT metrado, unidad, codigo FROM lob_cost_items
                        WHERE dataset_id = %s AND codigo = %s""",
                    (dataset_id, cost_item_codigo))
    elif activity_id:
        cur.execute("""SELECT SUM(metrado), MIN(unidad), MIN(codigo)
                         FROM lob_cost_items
                        WHERE dataset_id = %s AND activity_id = %s
                        GROUP BY activity_id""", (dataset_id, activity_id))
    else:
        return None, None, None
    f = cur.fetchone()
    if not f or f[0] is None or float(f[0]) <= 0:
        return None, None, None
    return float(f[0]), f[1], '%s·%s' % (dataset_id, f[2])


def _aprobados_de(cur, obra, activity_id, cost_item_codigo, excepto=None):
    """Los avances APROBADOS de la misma referencia física (para Σ y conflictos)."""
    cur.execute("""SELECT tipo, cantidad, estado, progresiva_inicio,
                          progresiva_fin, fecha_operativa
                     FROM avance_campo
                    WHERE model_urn = %s AND estado = 'APROBADO'
                      AND COALESCE(activity_id, '') = COALESCE(%s, '')
                      AND COALESCE(cost_item_codigo, '') = COALESCE(%s, '')
                      AND (%s::uuid IS NULL OR id <> %s::uuid)""",
                (str(obra), activity_id, cost_item_codigo, excepto, excepto))
    return [{'tipo': r[0], 'cantidad': r[1], 'estado': r[2],
             'progresiva_inicio': r[3], 'progresiva_fin': r[4],
             'fecha_operativa': r[5].isoformat() if r[5] else None}
            for r in cur.fetchall()]


def _candidatos_aprobadores(cur, obra):
    cur.execute("""SELECT u.id, pc.company_id, pc.funcion
                     FROM project_companies pc
                     JOIN users u ON u.company_id = pc.company_id
                     JOIN project_users pu
                       ON pu.project_id = pc.project_id AND pu.user_id = u.id
                    WHERE pc.project_id = %s AND pc.funcion = ANY(%s)
                      AND u.is_active""",
                (str(obra), list(af.FUNCIONES_VALIDADORAS_DE_AVANCE)))
    filas = [{'user_id': r[0], 'company_id': r[1], 'funcion': r[2]}
             for r in cur.fetchall()]
    sup = [c for c in filas if c['funcion'] == 'SUPERVISION']
    ent = [c for c in filas if c['funcion'] == 'ENTIDAD']
    return af.resolver_aprobador_contractual(sup, ent)


# ══ CONSULTAS ══════════════════════════════════════════════════════════════

@avance_bp.route('/api/avance/actividades', methods=['GET'])
def actividades():
    """El plan vigente con su acumulado aprobado: lo que la pantalla ofrece."""
    obra = request.args.get('model_urn', '')
    if not verify_project_access(_usuario(), obra):
        return jsonify({'success': False, 'error': 'Sin acceso a esta obra.'}), 403
    with get_db_connection() as conn:
        cur = conn.cursor()
        dataset_id, huella = _dataset_activo(cur, obra)
        if not dataset_id:
            return jsonify({'success': True, 'dataset': None, 'actividades': []})
        cur.execute("""
            SELECT ci.activity_id, ci.codigo, ci.descripcion, ci.unidad,
                   ci.metrado, ci.frente_label,
                   s.planned_start, s.planned_finish, s.actual_start,
                   s.actual_finish, s.percent, s.status,
                   COALESCE((SELECT SUM(CASE WHEN a.tipo = 'AJUSTE_NEGATIVO'
                                             THEN -a.cantidad ELSE a.cantidad END)
                               FROM avance_campo a
                              WHERE a.model_urn = %s AND a.estado = 'APROBADO'
                                AND a.activity_id = ci.activity_id), 0) AS aprobado
              FROM lob_cost_items ci
              LEFT JOIN lob_activity_schedule s
                     ON s.dataset_id = ci.dataset_id AND s.activity_id = ci.activity_id
             WHERE ci.dataset_id = %s AND ci.activity_id IS NOT NULL
             ORDER BY ci.orden NULLS LAST, ci.codigo""", (str(obra), dataset_id))
        actividades = []
        for r in cur.fetchall():
            objetivo = float(r[4]) if r[4] else None
            aprobado = float(r[12] or 0)
            actividades.append({
                'activity_id': r[0], 'codigo': r[1], 'descripcion': r[2],
                'unidad': r[3], 'metrado': objetivo, 'frente_label': r[5],
                'planned_start': r[6].isoformat() if r[6] else None,
                'planned_finish': r[7].isoformat() if r[7] else None,
                'actual_start': r[8].isoformat() if r[8] else None,
                'actual_finish': r[9].isoformat() if r[9] else None,
                'percent': r[10], 'status': r[11],
                'acumulado_aprobado': aprobado,
                'porcentaje_actual': af.porcentaje(aprobado, objetivo),
                'exceso': (objetivo is not None and aprobado > objetivo),
            })
        return jsonify({'success': True,
                        'dataset': {'id': dataset_id, 'huella': huella},
                        'actividades': actividades})


@avance_bp.route('/api/avance/lista', methods=['GET'])
def lista():
    obra = request.args.get('model_urn', '')
    if not verify_project_access(_usuario(), obra):
        return jsonify({'success': False, 'error': 'Sin acceso a esta obra.'}), 403
    estado = request.args.get('estado')
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT %s FROM avance_campo WHERE model_urn = %%s %s "
                    "ORDER BY numero DESC LIMIT 500"
                    % (_COLS, "AND estado = %s" if estado else ''),
                    ((str(obra), estado) if estado else (str(obra),)))
        avances = [_fila(r) for r in cur.fetchall()]
        # el porcentaje HISTÓRICO se deriva del snapshot sellado, no se guarda
        for a in avances:
            a['porcentaje_historico'] = None
        cur.execute("""SELECT avance_id, COUNT(*) FROM avance_fotos
                        WHERE avance_id IN (SELECT id FROM avance_campo
                                             WHERE model_urn = %s)
                        GROUP BY avance_id""", (str(obra),))
        fotos = {str(r[0]): r[1] for r in cur.fetchall()}
        for a in avances:
            a['fotos'] = fotos.get(a['id'], 0)
        _destino, codigo = _candidatos_aprobadores(cur, obra)
        return jsonify({'success': True, 'avances': avances,
                        'bloqueo_de_aprobacion': codigo})


# ══ REPORTAR ═══════════════════════════════════════════════════════════════

@avance_bp.route('/api/avance/reportar', methods=['POST'])
def reportar():
    d = request.get_json(silent=True) or {}
    obra = d.get('model_urn', '')
    if not verify_project_access(_usuario(), obra):
        return jsonify({'success': False, 'error': 'Sin acceso a esta obra.'}), 403

    tipo = d.get('tipo') or 'AVANCE'
    if tipo not in af.TIPOS_DE_AVANCE:
        return jsonify({'success': False, 'error': 'Tipo de avance desconocido.',
                        'code': 'TIPO_DESCONOCIDO'}), 400
    try:
        cantidad = float(d.get('cantidad') or 0)
    except (TypeError, ValueError):
        cantidad = 0
    if cantidad <= 0:
        return jsonify({'success': False, 'code': 'CANTIDAD_NO_POSITIVA',
                        'error': 'La cantidad es una magnitud positiva; la '
                                 'dirección la pone el tipo de ajuste.'}), 400
    if not (d.get('activity_id') or d.get('cost_item_codigo')
            or d.get('elemento_link_id')):
        return jsonify({'success': False, 'code': 'SIN_DESTINO_FISICO',
                        'error': 'Un avance sin destino físico no es un '
                                 'avance: partida, actividad o elemento.'}), 400
    fecha_op, codigo_fecha = af.fecha_operativa_valida(
        d.get('fecha_operativa'), date.today())
    if codigo_fecha:
        return jsonify({'success': False, 'code': codigo_fecha,
                        'error': 'La fecha operativa declarada no es '
                                 'valida.'}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        uid, empresa_id, funcion = _quien_es(cur, obra)
        dataset_id, _huella = _dataset_activo(cur, obra)
        dataset_id = d.get('dataset_id') or dataset_id

        # unidad casa con la partida cuando hay partida (invariante §L.4)
        objetivo, unidad_plan, _oid = _objetivo_de(
            cur, dataset_id, d.get('activity_id'), d.get('cost_item_codigo'))
        unidad = (d.get('unidad') or '').strip()
        if unidad_plan and unidad and unidad.lower() != str(unidad_plan).lower():
            return jsonify({'success': False, 'code': 'UNIDAD_NO_CASA',
                            'error': 'La partida mide en %s y el reporte '
                                     'viene en %s.' % (unidad_plan, unidad)}), 400
        unidad = unidad or unidad_plan
        if not unidad:
            return jsonify({'success': False, 'code': 'SIN_UNIDAD',
                            'error': 'Falta la unidad de la cantidad.'}), 400

        # un AJUSTE referencia a un APROBADO — y lo toma con candado
        ajusta_a = d.get('ajusta_a')
        if tipo != 'AVANCE':
            if not ajusta_a:
                return jsonify({'success': False, 'code': 'AJUSTE_SIN_REFERENCIA',
                                'error': 'Un ajuste dice a qué aprobado '
                                         'ajusta.'}), 400
            cur.execute("""SELECT estado FROM avance_campo
                            WHERE id = %s AND model_urn = %s FOR UPDATE""",
                        (ajusta_a, str(obra)))
            f = cur.fetchone()
            if not f or f[0] != 'APROBADO':
                return jsonify({'success': False, 'code': 'AJUSTE_SIN_APROBADO',
                                'error': 'Solo se ajusta un avance '
                                         'APROBADO.'}), 409

        # fotos: citas a doc_fotos de LA MISMA obra (guardia C1 en el borde)
        fotos = [int(x) for x in (d.get('fotos') or []) if str(x).isdigit()]
        if fotos:
            cur.execute("""SELECT id FROM doc_fotos
                            WHERE project_id = %s AND id = ANY(%s)""",
                        (str(obra), fotos))
            elegibles = {r[0] for r in cur.fetchall()}
            if set(fotos) - elegibles:
                return jsonify({'success': False, 'code': 'FOTO_AJENA',
                                'error': 'Hay fotos que no pertenecen a esta '
                                         'obra.'}), 400

        aprobados = _aprobados_de(cur, obra, d.get('activity_id'),
                                  d.get('cost_item_codigo'))
        nuevo = {'tipo': tipo, 'cantidad': cantidad,
                 'progresiva_inicio': d.get('progresiva_inicio'),
                 'progresiva_fin': d.get('progresiva_fin'),
                 'fecha_operativa': d.get('fecha_operativa')}
        conflictos = af.detectar_conflictos(nuevo, aprobados, objetivo)

        for intento in range(5):
            cur.execute("SAVEPOINT alta_avance")
            try:
                cur.execute("""SELECT COALESCE(MAX(numero), 0) + 1
                                 FROM avance_campo WHERE model_urn = %s""",
                            (str(obra),))
                numero = cur.fetchone()[0]
                cur.execute("""
                    INSERT INTO avance_campo
                        (model_urn, numero, dataset_id, activity_id,
                         cost_item_codigo, elemento_link_id, frente_label,
                         progresiva_inicio, progresiva_fin, tipo, ajusta_a,
                         cantidad, unidad, termina_actividad, descripcion,
                         estado, fecha_operativa, capturado_en, origen,
                         autor_id, autor_empresa_id, autor_funcion,
                         conflictos_detectados, created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                            'REPORTADO',%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id""",
                    (str(obra), numero, dataset_id, d.get('activity_id'),
                     d.get('cost_item_codigo'), d.get('elemento_link_id'),
                     d.get('frente_label'), d.get('progresiva_inicio'),
                     d.get('progresiva_fin'), tipo, ajusta_a, cantidad,
                     unidad, bool(d.get('termina_actividad')),
                     d.get('descripcion'), fecha_op,
                     d.get('capturado_en'), d.get('origen') or 'online',
                     uid, empresa_id, funcion, json.dumps(conflictos),
                     _actor()))
                aid = cur.fetchone()[0]
                break
            except Exception:
                cur.execute("ROLLBACK TO SAVEPOINT alta_avance")
                if intento == 4:
                    raise
        for foto in fotos:
            cur.execute("""INSERT INTO avance_fotos (avance_id, foto_id)
                            VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                        (aid, foto))

        # BIC contractual CONCRETO (corrección 2): persona o empresa, jamás
        # una función desnuda. Sin sujeto resoluble: bloqueo visible.
        destino, codigo = _candidatos_aprobadores(cur, obra)
        if destino:
            try:
                eid = _enc.abrir(
                    cur, 'AVANCE', str(aid),
                    'Aprobar o devolver el avance N.º %s (%s %s)'
                    % (numero, cantidad, unidad),
                    destino_usuario=destino.get('user_id'),
                    destino_empresa=(destino.get('company_id')
                                     if destino['tipo'] == 'empresa' else None),
                    creado_por=_actor())
                if eid:
                    _enc.avisar(cur, eid)
            except Exception as e:
                logger.warning('[avance %s] sin encargo: %s', aid, str(e)[:120])

        log_activity(str(obra), 'avance_reportado', 'avance', entity_id=str(aid),
                     entity_name='N.º %s' % numero, performed_by=_actor())
        conn.commit()
        return jsonify({'success': True, 'id': str(aid), 'numero': numero,
                        'conflictos_detectados': conflictos,
                        'bloqueo_de_aprobacion': codigo}), 201


# ══ APROBAR / DEVOLVER ═════════════════════════════════════════════════════

def _proyectar(cur, obra, avance):
    """La proyección: idempotente, re-ejecutable, SOLO columnas ACTUAL.

    Escribe el evento `source='campo'` con id = id canónico del avance (el
    pipeline 4D existente lo consume; la matemática nunca está en el visor) y
    recalcula percent/actual_start/actual_finish/status del cronograma.
    `planned_*` y `metrado`: intactos — se miden en la EXP.
    """
    dataset_id = avance.get('dataset_id')
    activity_id = avance.get('activity_id')
    # Contrato del evento, medido en prod: `codigo` y `evidence` NOT NULL,
    # `quantity >= 0` (un ajuste negativo viaja con quantity 0 y su magnitud
    # en la nota: la VERDAD aritmetica vive en avance_campo y el cronograma,
    # no en la suma de eventos), y scope_urn tiene FK a lob_linear_profiles:
    # una obra sin perfil lineal no puede recibir el evento y NO por eso se
    # pierde la proyeccion del cronograma — savepoint.
    firmado = af.efecto_de(avance['tipo']) * float(avance['cantidad'])
    cur.execute("SAVEPOINT evento_lob")
    try:
        cur.execute("""INSERT INTO lob_linear_progress_events
                         (id, scope_urn, dataset_id, codigo, zone_code,
                          event_date, station_start, station_end, quantity,
                          unit, percent_complete, source, note, evidence,
                          created_by, created_at)
                       VALUES (%s,%s,%s,%s,NULL,%s,%s,%s,%s,%s,NULL,'campo',
                               %s,'[]'::jsonb,%s,CURRENT_TIMESTAMP)
                       ON CONFLICT (id) DO NOTHING""",
                    (str(avance['id']), str(obra), dataset_id,
                     avance.get('cost_item_codigo') or avance.get('activity_id')
                     or 'AVANCE',
                     avance['fecha_operativa'],
                     avance.get('progresiva_inicio'),
                     avance.get('progresiva_fin'),
                     max(0.0, firmado), avance['unidad'],
                     'avance N.º %s (%+g %s)' % (avance['numero'], firmado,
                                                 avance['unidad']),
                     avance.get('created_by')))
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT evento_lob")
        logger.warning('[avance %s] sin evento LOB: %s',
                       avance['id'], str(e)[:120])

    if not (dataset_id and activity_id):
        return
    cur.execute("""SELECT tipo, cantidad, estado, fecha_operativa,
                          termina_actividad
                     FROM avance_campo
                    WHERE model_urn = %s AND activity_id = %s
                      AND estado = 'APROBADO'""", (str(obra), activity_id))
    aprobados = [{'tipo': r[0], 'cantidad': r[1], 'estado': r[2],
                  'fecha_operativa': r[3].isoformat() if r[3] else None,
                  'termina_actividad': r[4]} for r in cur.fetchall()]
    objetivo, _u, _oid = _objetivo_de(cur, dataset_id, activity_id, None)
    acumulado = af.acumulado_de(aprobados)
    pct = af.porcentaje(acumulado, objetivo)
    inicio = af.actual_start_de(aprobados)
    fin = af.actual_finish_de(aprobados)
    estado = af.estado_derivado(inicio, fin)
    cur.execute("""UPDATE lob_activity_schedule
                      SET percent = %s, actual_start = %s, actual_finish = %s,
                          status = %s
                    WHERE dataset_id = %s AND activity_id = %s""",
                # el exceso NO se capa en silencio: percent llega a 100 y el
                # exceso queda visible en /actividades (flag `exceso`)
                (min(100.0, pct) if pct is not None else None,
                 inicio, fin, estado, dataset_id, activity_id))


@avance_bp.route('/api/avance/<aid>/aprobar', methods=['POST'])
def aprobar(aid):
    d = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn FROM avance_campo WHERE id = %s", (aid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'success': False, 'error': 'No existe.'}), 404
        obra = f[0]
        if not verify_project_access(_usuario(), obra):
            return jsonify({'success': False, 'error': 'Sin acceso.'}), 403

        cur.execute("SELECT %s FROM avance_campo WHERE id = %%s FOR UPDATE"
                    % _COLS, (aid,))
        avance = _fila(cur.fetchone())
        if avance['estado'] != 'REPORTADO':
            return jsonify({'success': False, 'code': 'ESTADO_INVALIDO',
                            'error': 'Solo se aprueba lo REPORTADO.'}), 409

        uid, empresa_id, funcion = _quien_es(cur, obra)
        if not af.puede_aprobar_avance(funcion, uid == avance['autor_id']):
            return jsonify({'success': False, 'code': 'SIN_AUTORIDAD',
                            'error': 'Aprobar avance es autoridad contractual '
                                     '(SUPERVISION; ENTIDAD como contingencia '
                                     'declarada) y nunca del autor.'}), 403

        # el sujeto contractual debe ser resoluble (corrección 2)
        destino, codigo = _candidatos_aprobadores(cur, obra)
        if codigo:
            return jsonify({'success': False, 'code': codigo,
                            'error': 'La aprobación no tiene sujeto '
                                     'contractual resoluble.'}), 409

        # conflictos: se recalculan AHORA y cada uno exige confirmación
        objetivo, _u, objetivo_id = _objetivo_de(
            cur, avance['dataset_id'], avance['activity_id'],
            avance['cost_item_codigo'])
        aprobados = _aprobados_de(cur, obra, avance['activity_id'],
                                  avance['cost_item_codigo'], excepto=aid)
        conflictos = af.detectar_conflictos(avance, aprobados, objetivo)
        ahora = datetime.now(timezone.utc).isoformat()
        confirmaciones = [{'codigo': c.get('codigo'),
                           'motivo': (c.get('motivo') or '').strip(),
                           'actor_id': uid, 'ts': ahora}
                          for c in (d.get('confirmaciones') or [])]
        pendientes = af.confirmaciones_completas(conflictos, confirmaciones)
        if pendientes:
            return jsonify({'success': False, 'code': 'CONFLICTO_SIN_CONFIRMAR',
                            'conflictos': pendientes,
                            'error': 'Aprobar con conflicto exige confirmarlo '
                                     'uno a uno, con motivo.'}), 409

        # snapshot de autoridad del objetivo (corrección 1), sellado AHORA
        _did, huella = _dataset_activo(cur, obra)
        snap = af.snapshot_del_objetivo(
            'lob_cost_items' if objetivo is not None else None,
            objetivo_id, avance['unidad'], objetivo, huella)

        cur.execute("""UPDATE avance_campo
                          SET estado = 'APROBADO', aprobado_por = %s,
                              aprobado_empresa_id = %s, aprobado_funcion = %s,
                              aprobado_en = CURRENT_TIMESTAMP,
                              objetivo_fuente = %s, objetivo_id = %s,
                              objetivo_unidad = %s, objetivo_cantidad = %s,
                              objetivo_huella = %s,
                              conflictos_detectados = %s,
                              conflictos_confirmados = %s
                        WHERE id = %s""",
                    (uid, empresa_id, funcion, snap['objetivo_fuente'],
                     snap['objetivo_id'], snap['objetivo_unidad'],
                     snap['objetivo_cantidad'], snap['objetivo_huella'],
                     json.dumps(conflictos), json.dumps(confirmaciones), aid))

        avance['estado'] = 'APROBADO'
        _proyectar(cur, obra, avance)
        cur.execute("""UPDATE avance_campo SET proyectado_en = CURRENT_TIMESTAMP
                        WHERE id = %s""", (aid,))
        try:
            _enc.cerrar_los_de(cur, 'AVANCE', str(aid), cerrado_por=_actor())
        except Exception as e:
            logger.warning('[avance %s] cierre de encargos: %s', aid, str(e)[:120])
        log_activity(str(obra), 'avance_aprobado', 'avance', entity_id=str(aid),
                     entity_name='N.º %s' % avance['numero'],
                     performed_by=_actor())
        conn.commit()
        return jsonify({'success': True, 'id': aid, 'estado': 'APROBADO',
                        'snapshot': snap,
                        'porcentaje_historico': af.porcentaje(
                            af.acumulado_de(aprobados)
                            + af.efecto_de(avance['tipo']) * float(avance['cantidad']),
                            snap['objetivo_cantidad'])})


@avance_bp.route('/api/avance/<aid>/devolver', methods=['POST'])
def devolver(aid):
    d = request.get_json(silent=True) or {}
    motivo = (d.get('motivo') or '').strip()
    if not motivo:
        return jsonify({'success': False, 'code': 'SIN_MOTIVO',
                        'error': 'Devolver exige motivo.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn FROM avance_campo WHERE id = %s", (aid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'success': False, 'error': 'No existe.'}), 404
        obra = f[0]
        if not verify_project_access(_usuario(), obra):
            return jsonify({'success': False, 'error': 'Sin acceso.'}), 403
        cur.execute("""SELECT estado, autor_id, numero FROM avance_campo
                        WHERE id = %s FOR UPDATE""", (aid,))
        estado, autor_id, numero = cur.fetchone()
        if estado != 'REPORTADO':
            return jsonify({'success': False, 'code': 'ESTADO_INVALIDO',
                            'error': 'Solo se devuelve lo REPORTADO.'}), 409
        uid, _eid, funcion = _quien_es(cur, obra)
        if not af.puede_aprobar_avance(funcion, uid == autor_id):
            return jsonify({'success': False, 'code': 'SIN_AUTORIDAD',
                            'error': 'Devolver es de la misma autoridad que '
                                     'aprobar.'}), 403
        cur.execute("""UPDATE avance_campo
                          SET estado = 'DEVUELTO', motivo_devolucion = %s,
                              devuelto_por = %s, devuelto_en = CURRENT_TIMESTAMP
                        WHERE id = %s""", (motivo, uid, aid))
        try:
            _enc.cerrar_los_de(cur, 'AVANCE', str(aid), cerrado_por=_actor())
        except Exception as e:
            logger.warning('[avance %s] cierre de encargos: %s', aid, str(e)[:120])
        try:
            eid = _enc.abrir(cur, 'AVANCE', str(aid),
                             'Corregir y re-reportar el avance N.º %s' % numero,
                             destino_usuario=autor_id, creado_por=_actor())
            if eid:
                _enc.avisar(cur, eid)
        except Exception as e:
            logger.warning('[avance %s] devuelto sin encargo: %s', aid, str(e)[:120])
        log_activity(str(obra), 'avance_devuelto', 'avance', entity_id=str(aid),
                     entity_name='N.º %s' % numero, performed_by=_actor())
        conn.commit()
        return jsonify({'success': True, 'id': aid, 'estado': 'DEVUELTO'})
