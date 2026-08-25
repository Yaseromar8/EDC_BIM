# -*- coding: utf-8 -*-
"""GAP 03 · PROTOCOLOS E INSPECCIONES.

La semantica esta en `flujo_de_protocolo.py`. Aqui solo se mueve el acta por
donde esa semantica permite, y por eso este fichero no puede contradecirla.

LO QUE ESTE MANEJADOR NO HACE, Y ES LO IMPORTANTE
--------------------------------------------------
NO acepta un veredicto que venga de fuera. `firmar` NO lee `estado` del cuerpo:
lo CALCULA con `veredicto_que_corresponde(items)`. Si lo aceptara, una interfaz
mal hecha --o alguien con curl-- podria declarar liberada un acta con un punto
en rojo dentro, y la firma dejaria de probar nada.

    los ITEMS dictan el veredicto  ·  la FIRMA dice quien lo comprobo
    y ninguno de los dos puede desmentir al otro

EL ESCALADO NO ES OPCIONAL, PERO TAMPOCO ES AUTOMATICO A CIEGAS
----------------------------------------------------------------
Un punto NO CONFORME genera un Red Line con responsable y plazo: un defecto que
vive solo dentro del acta no tiene a quien reclamarle ni cuando. Se hace en el
mismo acto de firmar, y si el Red Line falla NO se tumba la firma -- el acta ya
dice que hay un no conforme, y `escalar` puede reintentarlo despues.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_obra, guardia_de_recurso
import encargos as _enc
import flujo_de_protocolo as pro
import flujo_de_registro as reg

logger = logging.getLogger('protocolos')

protocolos_bp = Blueprint('protocolos_bp', __name__)
S = pro.SEMANTICA

_COLS = ('id, project_id, model_urn, codigo, protocolo_id, protocolo_nombre, '
         'protocolo_version, titulo, ubicacion, progresiva, items, firmas, '
         'estado, motivo_veredicto, autor_id, responsable_id, created_by, '
         'history, vence_en, creada_en, firmada_en, cerrada_en')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r):
    items = r[10] or []
    veredicto, motivo = pro.veredicto_que_corresponde(items)
    return {
        'id': str(r[0]), 'project_id': r[1], 'model_urn': r[2], 'codigo': r[3],
        'protocolo_id': str(r[4]) if r[4] else None,
        'protocolo_nombre': r[5], 'protocolo_version': r[6],
        'titulo': r[7], 'ubicacion': r[8], 'progresiva': r[9],
        'items': items, 'firmas': r[11] or [],
        'estado': r[12], 'motivo_veredicto': r[13],
        'autor_id': r[14], 'responsable_id': r[15], 'created_by': r[16],
        'history': r[17] or [],
        'vence_en': r[18].isoformat() if r[18] else None,
        'creada_en': r[19].isoformat() if r[19] else None,
        'firmada_en': r[20].isoformat() if r[20] else None,
        'cerrada_en': r[21].isoformat() if r[21] else None,
        # LO QUE EL ACTA DIRIA SI SE FIRMARA AHORA. Se calcula y se muestra
        # ANTES de firmar, para que nadie firme creyendo que libera algo que
        # no libera. No es el estado: es el estado que le corresponderia.
        'veredicto_que_corresponde': veredicto,
        'motivo_que_corresponde': motivo,
        'no_conformes': len([i for i in items if (i or {}).get('resultado') == 'No conforme']),
        'sin_comprobar': len([i for i in items
                              if (i or {}).get('resultado', 'Pendiente') == 'Pendiente'
                              and (i or {}).get('tipo', 'conformidad') == 'conformidad']),
    }


def _leer(cur, aid):
    cur.execute('SELECT %s FROM doc_actas WHERE id = %%s' % _COLS, (aid,))
    r = cur.fetchone()
    return _fila(r) if r else None


# ── CATALOGO ───────────────────────────────────────────────────────────────

@protocolos_bp.route('/catalogo', methods=['GET'])
def catalogo():
    return jsonify({
        'resultados': list(pro.RESULTADOS),
        'impiden_liberar': list(pro.IMPIDEN_LIBERAR),
        'tipos_item': [{'codigo': c, 'etiqueta': e} for c, e in pro.TIPOS_ITEM],
        'exigencias': list(pro.EXIGENCIAS),
        'estados': list(pro.ESTADOS),
    })


# ── PLANTILLAS ─────────────────────────────────────────────────────────────

@protocolos_bp.route('/plantillas', methods=['GET'])
def listar_plantillas():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT id, codigo, nombre, descripcion, disciplina, secciones,
                              activo, version,
                              (SELECT count(*) FROM doc_actas a WHERE a.protocolo_id = p.id)
                         FROM doc_protocolos p
                        WHERE project_id = %s ORDER BY codigo""", (obra,))
        return jsonify({'plantillas': [{
            'id': str(f[0]), 'codigo': f[1], 'nombre': f[2], 'descripcion': f[3],
            'disciplina': f[4], 'secciones': f[5] or [], 'activo': f[6],
            'version': f[7], 'actas': f[8],
            'puntos': sum(len((s or {}).get('items') or []) for s in (f[5] or [])),
        } for f in cur.fetchall()]})


@protocolos_bp.route('/plantillas', methods=['POST'])
def crear_plantilla():
    """Crea el protocolo en abstracto. Los puntos se declaran aqui, una vez."""
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'crear un protocolo')
    if corte:
        return corte

    codigo = (data.get('codigo') or '').strip().upper()
    nombre = (data.get('nombre') or '').strip()
    if not codigo or not nombre:
        return jsonify({'error': 'El código y el nombre son obligatorios.'}), 400

    secciones, malos = _normalizar_secciones(data.get('secciones') or [])
    if malos:
        return jsonify({'error': 'Hay puntos con tipo desconocido: %s' % ', '.join(malos),
                        'admitidos': list(pro.CODIGOS_TIPO)}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_protocolos
                             (project_id, codigo, nombre, descripcion, disciplina,
                              secciones, creado_por)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (obra, codigo, nombre,
                         (data.get('descripcion') or '').strip() or None,
                         (data.get('disciplina') or '').strip().upper() or None,
                         json.dumps(secciones), _usuario().get('id')))
            pid = cur.fetchone()[0]
            conn.commit()
            return jsonify({'id': str(pid), 'codigo': codigo, 'nombre': nombre}), 201
    except Exception as e:
        if 'idx_protocolos_codigo' in str(e):
            return jsonify({'error': 'Ya existe un protocolo %s en esta obra.' % codigo,
                            'code': 'CODIGO_DUPLICADO'}), 409
        logger.error('crear plantilla: %s', e)
        return jsonify({'error': 'No se pudo crear el protocolo.'}), 500


def _normalizar_secciones(secciones):
    """Deja las secciones en forma canonica y dice que tipos no se reconocen.

    Un tipo desconocido NO se acepta en silencio: se pintaria mal, se exportaria
    mal y nadie lo notaria hasta que un acta con ese punto fuera a discutirse.
    """
    salida, malos = [], []
    for s in (secciones or []):
        s = s or {}
        items = []
        for i in (s.get('items') or []):
            i = i or {}
            tipo = (i.get('tipo') or 'conformidad').strip()
            if tipo not in pro.CODIGOS_TIPO:
                malos.append(tipo)
                continue
            exige = [e for e in (i.get('exige_si_no_conforme') or [])
                     if e in pro.EXIGENCIAS]
            items.append({'texto': (i.get('texto') or '').strip(),
                          'tipo': tipo,
                          'opciones': i.get('opciones') or [],
                          'exige_si_no_conforme': exige,
                          'depende_de': i.get('depende_de'),
                          'visible_si': i.get('visible_si')})
        salida.append({'nombre': (s.get('nombre') or '').strip(), 'items': items})
    return salida, sorted(set(malos))


# ── ACTAS ──────────────────────────────────────────────────────────────────

@protocolos_bp.route('/actas', methods=['GET'])
def listar_actas():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    estado = (request.args.get('estado') or '').strip() or None
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT %s FROM doc_actas WHERE project_id = %%s '
                    '   AND (%%s IS NULL OR estado = %%s) '
                    ' ORDER BY codigo DESC' % _COLS, (obra, estado, estado))
        return jsonify({'actas': [_fila(r) for r in cur.fetchall()]})


@protocolos_bp.route('/actas/<int:aid>', methods=['GET'])
def detalle_acta(aid):
    corte = guardia_de_recurso('doc_actas', aid)
    if corte:
        return corte
    with get_db_connection() as conn:
        a = _leer(conn.cursor(), aid)
    return (jsonify(a), 200) if a else (jsonify({'error': 'No existe.'}), 404)


@protocolos_bp.route('/actas', methods=['POST'])
def levantar_acta():
    """Levanta un acta DESDE una plantilla, COPIANDO sus puntos.

    La copia es deliberada. Si el acta solo referenciara la plantilla y esta
    cambiara despues, un acta firmada diria haber comprobado puntos que en su
    dia no existian -- falsificar el pasado con buena intencion.
    """
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    obra = resolve_project_id(model_urn or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'levantar un acta')
    if corte:
        return corte
    autor = _usuario().get('id')
    if not autor:
        return jsonify({'error': 'Sesión sin identidad.', 'code': 'NO_IDENTITY'}), 401

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            plantilla, items = None, []
            if data.get('protocolo_id'):
                cur.execute("""SELECT id, nombre, version, secciones, activo, project_id
                                 FROM doc_protocolos WHERE id = %s""",
                            (data['protocolo_id'],))
                plantilla = cur.fetchone()
                if not plantilla:
                    return jsonify({'error': 'Ese protocolo no existe.'}), 404
                if plantilla[5] != obra:
                    return jsonify({'error': 'Ese protocolo es de otra obra.',
                                    'code': 'OTRA_OBRA'}), 409
                if not plantilla[4]:
                    return jsonify({'error': 'Ese protocolo está desactivado: no se '
                                             'levantan actas nuevas con él.',
                                    'code': 'PROTOCOLO_INACTIVO'}), 409
                for s in (plantilla[3] or []):
                    for i in ((s or {}).get('items') or []):
                        items.append({**i, 'seccion': (s or {}).get('nombre'),
                                      'resultado': pro.PENDIENTE,
                                      'valor': None, 'observacion': '', 'fotos': []})

            titulo = (data.get('titulo') or (plantilla[1] if plantilla else '')).strip()
            if not titulo:
                return jsonify({'error': 'El título es obligatorio.'}), 400

            for intento in range(5):
                codigo = reg.siguiente_codigo(cur, S, obra)
                try:
                    cur.execute('SAVEPOINT alta_acta')
                    cur.execute("""INSERT INTO doc_actas
                                     (project_id, model_urn, codigo, protocolo_id,
                                      protocolo_nombre, protocolo_version, titulo,
                                      ubicacion, progresiva, items, autor_id,
                                      responsable_id, created_by, history, vence_en)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                                RETURNING id""",
                                (obra, model_urn, codigo,
                                 plantilla[0] if plantilla else None,
                                 plantilla[1] if plantilla else None,
                                 plantilla[2] if plantilla else None,
                                 titulo,
                                 (data.get('ubicacion') or '').strip() or None,
                                 (data.get('progresiva') or '').strip() or None,
                                 json.dumps(items), autor, data.get('responsable_id'),
                                 _actor(),
                                 json.dumps([reg.entrada('created', _actor(),
                                                         codigo=codigo,
                                                         protocolo=plantilla[1] if plantilla else None)]),
                                 data.get('vence_en') or None))
                    aid = cur.fetchone()[0]
                    cur.execute('RELEASE SAVEPOINT alta_acta')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_acta')
                    if intento == 4:
                        raise
            conn.commit()
            log_activity(model_urn, 'CREATE', 'ACTA', str(aid), codigo, _actor(),
                         {'protocolo': plantilla[1] if plantilla else None,
                          'puntos': len(items)})
            return jsonify(_leer(cur, aid)), 201
    except Exception as e:
        logger.error('levantar acta: %s', e)
        return jsonify({'error': 'No se pudo levantar el acta.'}), 500


@protocolos_bp.route('/actas/<int:aid>/items', methods=['PUT'])
def guardar_items(aid):
    """Guarda lo comprobado. Solo en BORRADOR y solo quien la levanta.

    Un acta firmada no se edita: cambiar un resultado despues de la firma haria
    que la firma dijera algo distinto de lo que se firmo.
    """
    corte = guardia_de_recurso('doc_actas', aid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            a = _leer(cur, aid)
            if not a:
                return jsonify({'error': 'No existe.'}), 404
            if a['estado'] != pro.BORRADOR:
                return jsonify({'error': 'Un acta firmada no se edita.',
                                'code': 'NO_EDITABLE'}), 409
            if _usuario().get('id') != a['autor_id']:
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_AUTOR'}), 403

            items = data.get('items')
            if not isinstance(items, list):
                return jsonify({'error': 'items tiene que ser una lista.'}), 400
            for i in items:
                r = (i or {}).get('resultado')
                if r is not None and r not in pro.RESULTADOS:
                    return jsonify({'error': 'Resultado desconocido: %s' % r,
                                    'admitidos': list(pro.RESULTADOS)}), 400
            cur.execute('UPDATE doc_actas SET items = %s WHERE id = %s',
                        (json.dumps(items), aid))
            conn.commit()
            return jsonify(_leer(cur, aid))
    except Exception as e:
        logger.error('guardar items del acta %s: %s', aid, e)
        return jsonify({'error': 'No se pudo guardar.'}), 500


@protocolos_bp.route('/actas/<int:aid>/firmar', methods=['POST'])
def firmar(aid):
    """Firma el acta Y FIJA EL VEREDICTO QUE LOS ITEMS OBLIGAN.

    EL VEREDICTO NO SE LEE DEL CUERPO. Se calcula. Aceptarlo de fuera dejaria
    que una interfaz mal hecha --o alguien con curl-- declarara liberada un
    acta con un punto en rojo dentro, y la firma dejaria de probar nada.

    Antes de firmar se comprueba que los puntos NO CONFORMES traen lo que
    exigian: sin la foto, una no conformidad es la palabra de uno contra la de
    otro dentro de un ano.
    """
    corte = guardia_de_recurso('doc_actas', aid)
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            a = _leer(cur, aid)
            if not a:
                return jsonify({'error': 'No existe.'}), 404
            ok, motivo = reg.transicion_valida(S, a['estado'], pro.FIRMADA)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
            if _usuario().get('id') != a['autor_id']:
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_AUTOR'}), 403

            faltan = pro.exigencias_incumplidas(a['items'])
            if faltan:
                return jsonify({
                    'error': 'Hay puntos no conformes sin la evidencia que exigen.',
                    'code': 'FALTA_EVIDENCIA',
                    'faltan': [{'item': n, 'exige': e} for n, e in faltan]}), 409

            veredicto, motivo_v = pro.veredicto_que_corresponde(a['items'])
            firmas = list(a['firmas'] or [])
            firmas.append({'user_id': _usuario().get('id'), 'como': _actor(),
                           'en': None, 'papel': (request.get_json(silent=True) or {}
                                                 ).get('papel') or 'quien levanta'})
            cur.execute("""UPDATE doc_actas
                              SET estado = %s, motivo_veredicto = %s, firmas = %s,
                                  firmada_en = CURRENT_TIMESTAMP,
                                  cerrada_en = CURRENT_TIMESTAMP
                            WHERE id = %s""",
                        (veredicto, motivo_v or None, json.dumps(firmas), aid))
            hist = a['history'] + [reg.entrada('signed', _actor(), veredicto=veredicto,
                                               motivo=motivo_v or None)]
            cur.execute('UPDATE doc_actas SET history = %s WHERE id = %s',
                        (json.dumps(hist), aid))
            conn.commit()

            escalados = _escalar(cur, conn, aid) if veredicto == pro.NO_LIBERADO else []
            log_activity(a['model_urn'], 'SIGN', 'ACTA', str(aid), a['codigo'],
                         _actor(), {'veredicto': veredicto, 'escalados': len(escalados)})
            salida = _leer(cur, aid)
            salida['escalados'] = escalados
            return jsonify(salida)
    except Exception as e:
        logger.error('firmar acta %s: %s', aid, e)
        return jsonify({'error': 'No se pudo firmar.'}), 500


def _escalar(cur, conn, aid):
    """Cada punto NO CONFORME sin escalar se convierte en un Red Line.

    UN FALLO AQUI NO TUMBA LA FIRMA: el acta ya dice que hay un no conforme, y
    `POST /escalar` puede reintentarlo. Perder la firma por no poder crear un
    Red Line seria cambiar un problema pequeno por uno grande.
    """
    import flujo_de_redline as rl
    creados = []
    try:
        a = _leer(cur, aid)
        items = list(a['items'])
        for n, item in pro.items_a_escalar(items):
            titulo = ('%s · %s' % (a['codigo'], (item.get('texto') or 'Punto no conforme')))[:180]
            for intento in range(5):
                codigo = reg.siguiente_codigo(cur, rl.SEMANTICA, a['project_id'])
                try:
                    cur.execute('SAVEPOINT escalado')
                    cur.execute(
                        'INSERT INTO doc_redlines (model_urn, codigo, titulo, created_by, '
                        '                          project_id, estado, responsable_id, historial) '
                        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id::text',
                        (a['model_urn'], codigo, titulo, _actor(), a['project_id'],
                         'Emitido', a['responsable_id'],
                         json.dumps([reg.entrada('created', _actor(), codigo=codigo,
                                                 desde_acta=a['codigo'])])))
                    rid = cur.fetchone()[0]
                    cur.execute('RELEASE SAVEPOINT escalado')
                    items[n] = {**item, 'redline_id': rid, 'redline_codigo': codigo}
                    creados.append({'item': n, 'redline_id': rid, 'codigo': codigo})
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT escalado')
                    if intento == 4:
                        raise
        if creados:
            cur.execute('UPDATE doc_actas SET items = %s WHERE id = %s',
                        (json.dumps(items), aid))
            conn.commit()
    except Exception as e:
        logger.warning('[acta %s] escalado incompleto: %s', aid, e)
        try:
            conn.rollback()
        except Exception:
            pass
    return creados


@protocolos_bp.route('/actas/<int:aid>/escalar', methods=['POST'])
def reintentar_escalado(aid):
    """Reintenta el escalado de los no conformes que quedaron sin Red Line."""
    corte = guardia_de_recurso('doc_actas', aid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        a = _leer(cur, aid)
        if not a:
            return jsonify({'error': 'No existe.'}), 404
        if a['estado'] not in (pro.NO_LIBERADO,):
            return jsonify({'error': 'Solo un acta NO LIBERADA tiene algo que escalar.',
                            'code': 'NADA_QUE_ESCALAR'}), 409
        creados = _escalar(cur, conn, aid)
    return jsonify({'escalados': creados})


@protocolos_bp.route('/actas/<int:aid>/anular', methods=['POST'])
def anular_acta(aid):
    corte = guardia_de_recurso('doc_actas', aid)
    if corte:
        return corte
    motivo = ((request.get_json(silent=True) or {}).get('motivo') or '').strip()
    if not motivo:
        return jsonify({'error': 'Anular exige un motivo: sin él, el registro no '
                                 'explica por qué desapareció.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        a = _leer(cur, aid)
        if not a:
            return jsonify({'error': 'No existe.'}), 404
        ok, m = reg.transicion_valida(S, a['estado'], pro.ANULADA)
        if not ok:
            return jsonify({'error': m, 'code': 'TRANSICION_INVALIDA'}), 409
        obj = {'created_by': a['created_by'], 'responsable_id': a['responsable_id'],
               'project_id': a['project_id']}
        if not reg.puede_cerrar(S, _usuario(), obj, cur):
            return jsonify({'error': S.msg_no_cierra, 'code': 'NO_RESPONSABLE'}), 403
        cur.execute("""UPDATE doc_actas SET estado=%s, motivo_veredicto=%s,
                                            history=%s, cerrada_en=CURRENT_TIMESTAMP
                        WHERE id=%s""",
                    (pro.ANULADA, motivo,
                     json.dumps(a['history'] + [reg.entrada('voided', _actor(), motivo=motivo)]),
                     aid))
        conn.commit()
        log_activity(a['model_urn'], 'VOID', 'ACTA', str(aid), a['codigo'], _actor(),
                     {'motivo': motivo})
        return jsonify(_leer(cur, aid))
