# -*- coding: utf-8 -*-
"""NG-03 · CUADERNO DE OBRA — las rutas. La semántica vive en `cuaderno_de_obra`.

LO QUE ESTAS RUTAS NO HACEN, A PROPÓSITO:
  - No editan asientos ni instrucciones. REGISTRADO/EMITIDA = inmutable; la
    corrección es OTRO acto que referencia (rectificación). No hay PATCH.
  - No borran nada. El cuaderno es evidencia.
  - No dejan aprobar a un Project Admin. Aprobar es autoridad CONTRACTUAL
    (SUPERVISION; ENTIDAD como contingencia declarada) y la administración no
    la confiere — corrección del propietario, doc 96.
  - No aceptan una función como destinatario de instrucción: el sujeto es una
    persona o una empresa concretas, con snapshot congelado al emitir.
"""
import datetime
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_obra
from administracion_de_obra import es_admin_de_obra
import cuaderno_de_obra as cdo
import directorio_de_obra as dirobra
import encargos as _enc
import flujo_de_registro as reg

logger = logging.getLogger('cuaderno')

cuaderno_bp = Blueprint('cuaderno_bp', __name__)


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _quien_es(cur, obra):
    """(uid, empresa_id, empresa_nombre, funcion) del actor EN ESTA obra."""
    uid = _usuario().get('id')
    funcion = dirobra.funcion_de(cur, obra, uid)
    cur.execute("""SELECT u.company_id, c.name FROM users u
                     LEFT JOIN companies c ON c.id = u.company_id
                    WHERE u.id = %s""", (uid,))
    f = cur.fetchone() or (None, None)
    return uid, f[0], f[1], funcion


_COLS_PARTE = ("id, project_id, model_urn, fecha_operativa, responsable_id, "
               "created_by, estado, cerrado_por, cerrado_en, creado_en, history")


def _parte(r):
    return {'id': r[0], 'project_id': r[1], 'model_urn': r[2],
            'fecha_operativa': r[3].isoformat() if r[3] else None,
            'responsable_id': r[4], 'created_by': r[5], 'estado': r[6],
            'cerrado_por': r[7],
            'cerrado_en': r[8].isoformat() if r[8] else None,
            'creado_en': r[9].isoformat() if r[9] else None,
            'history': r[10] or []}


_COLS_ASIENTO = ("id, project_id, parte_id, numero, tipo, texto, contenido, "
                 "referencias, autor_id, autor_empresa, autor_funcion, "
                 "created_by, estado, motivo_devolucion, aprobado_por, "
                 "aprobado_en, capturado_en, registrado_en, history")


def _asiento(r):
    return {'id': r[0], 'project_id': r[1], 'parte_id': r[2], 'numero': r[3],
            'tipo': r[4], 'texto': r[5], 'contenido': r[6] or {},
            'referencias': r[7] or {}, 'autor_id': r[8], 'autor_empresa': r[9],
            'autor_funcion': r[10], 'created_by': r[11], 'estado': r[12],
            'motivo_devolucion': r[13], 'aprobado_por': r[14],
            'aprobado_en': r[15].isoformat() if r[15] else None,
            'capturado_en': r[16].isoformat() if r[16] else None,
            'registrado_en': r[17].isoformat() if r[17] else None,
            'history': r[18] or []}


_COLS_INSTR = ("id, project_id, model_urn, codigo, asunto, contenido, "
               "emisor_id, emisor_empresa, emisor_funcion, created_by, "
               "destinatario, referencias, rectifica_a, acuses, estado, "
               "atencion, emitida_en, cerrada_en, history")


def _instr(r):
    return {'id': r[0], 'project_id': r[1], 'model_urn': r[2], 'codigo': r[3],
            'asunto': r[4], 'contenido': r[5], 'emisor_id': r[6],
            'emisor_empresa': r[7], 'emisor_funcion': r[8], 'created_by': r[9],
            'destinatario': r[10] or {}, 'referencias': r[11] or {},
            'rectifica_a': r[12], 'acuses': r[13] or [], 'estado': r[14],
            'atencion': r[15],
            'emitida_en': r[16].isoformat() if r[16] else None,
            'cerrada_en': r[17].isoformat() if r[17] else None,
            'history': r[18] or []}


def _hay_aprobador_contractual(cur, obra):
    """¿Alguien en la obra EJERCE una función aprobadora? (miembro + activo).

    Si no, la aprobación queda BLOQUEADA con código explícito: no hay fallback
    administrativo (corrección del propietario)."""
    cur.execute("""SELECT 1 FROM project_companies pc
                     JOIN users u ON u.company_id = pc.company_id
                     JOIN project_users pu
                       ON pu.project_id = pc.project_id AND pu.user_id = u.id
                    WHERE pc.project_id = %s AND pc.funcion = ANY(%s)
                      AND u.is_active LIMIT 1""",
                (str(obra), list(cdo.FUNCIONES_APROBADORAS_DE_ASIENTO)))
    return cur.fetchone() is not None


# ══ EL PARTE ═══════════════════════════════════════════════════════════════

@cuaderno_bp.route('/api/cuaderno/partes', methods=['GET'])
def listar_partes():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver el cuaderno de obra')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_PARTE + """ FROM doc_partes
                     WHERE project_id = %s
                     ORDER BY fecha_operativa DESC LIMIT 200""", (obra,))
        partes = [_parte(r) for r in cur.fetchall()]
        if partes:
            cur.execute("""SELECT parte_id, count(*),
                                  count(*) FILTER (WHERE estado = 'EN_APROBACION')
                             FROM doc_asientos WHERE project_id = %s
                            GROUP BY parte_id""", (obra,))
            conteo = {pid: (n, en_ap) for pid, n, en_ap in cur.fetchall()}
            for p in partes:
                n, en_ap = conteo.get(p['id'], (0, 0))
                p['asientos'] = n
                p['en_aprobacion'] = en_ap
    return jsonify({'partes': partes, 'total': len(partes)})


@cuaderno_bp.route('/api/cuaderno/partes', methods=['POST'])
def abrir_parte():
    """Abre la jornada. La fecha es la OPERATIVA DECLARADA (regla congelada:
    jamás created_at UTC — a las 7 pm de Lima el servidor ya vive en mañana)."""
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.'}), 400
    corte = guardia_de_obra(obra, 'abrir el parte diario')
    if corte:
        return corte
    fecha, mal = cdo.fecha_operativa_valida(data.get('fecha_operativa'))
    if not fecha:
        return jsonify({'error': 'La fecha operativa de la jornada es '
                                 'obligatoria (AAAA-MM-DD) y no puede estar '
                                 'en el futuro.', 'code': mal}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_PARTE + """ FROM doc_partes
                     WHERE project_id = %s AND fecha_operativa = %s""",
                    (obra, fecha))
        ya = cur.fetchone()
        if ya:
            # La identidad única en acción: la jornada ya existe y se devuelve.
            return jsonify({'error': 'El parte de esa jornada ya existe.',
                            'code': 'PARTE_YA_EXISTE', 'parte': _parte(ya)}), 409
        uid, _eid, _emp, funcion = _quien_es(cur, obra)
        cur.execute("""INSERT INTO doc_partes
                         (project_id, model_urn, fecha_operativa, responsable_id,
                          created_by, estado, history)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)
                       RETURNING """ + _COLS_PARTE,
                    (obra, data.get('model_urn') or obra, fecha, uid, _actor(),
                     cdo.ABIERTO,
                     json.dumps([reg.entrada('abierto', _actor(),
                                             fecha_operativa=fecha.isoformat(),
                                             funcion=funcion)])))
        d = _parte(cur.fetchone())
        conn.commit()
    log_activity(obra, 'PARTE_ABIERTO', 'doc_partes', str(d['id']),
                 d['fecha_operativa'], _actor(), {})
    return jsonify(d), 201


@cuaderno_bp.route('/api/cuaderno/partes/<int:pid>', methods=['GET'])
def detalle_parte(pid):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_PARTE + " FROM doc_partes WHERE id = %s", (pid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'ver este parte')
        if corte:
            return corte
        d = _parte(f)
        cur.execute("SELECT " + _COLS_ASIENTO + """ FROM doc_asientos
                     WHERE parte_id = %s ORDER BY numero""", (pid,))
        d['asientos'] = [_asiento(r) for r in cur.fetchall()]
        # Si hay asientos esperando y nadie ejerce función aprobadora, la
        # pantalla tiene que poder DECIRLO con su código, no colgar la deuda
        # de un admin.
        if any(a['estado'] == cdo.EN_APROBACION for a in d['asientos']):
            d['aprobador_contractual'] = _hay_aprobador_contractual(cur, obra)
    return jsonify(d)


@cuaderno_bp.route('/api/cuaderno/partes/<int:pid>/cerrar', methods=['POST'])
def cerrar_parte(pid):
    """Congela la jornada. SOLO EN LÍNEA (no está en el motor de campo, a
    propósito). Acto administrativo de jornada: responsable o admin de obra —
    aquí el admin SÍ, porque cerrar no es aprobación contractual (doc 96 §D)."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_PARTE +
                    " FROM doc_partes WHERE id = %s FOR UPDATE", (pid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'cerrar el parte diario')
        if corte:
            return corte
        d = _parte(f)
        if d['estado'] != cdo.ABIERTO:
            return jsonify({'error': 'Esta jornada ya está cerrada.',
                            'code': 'PARTE_CERRADO'}), 409
        u = _usuario()
        if u.get('id') != d['responsable_id'] and not es_admin_de_obra(cur, u, obra):
            return jsonify({'error': 'Cierra el parte su responsable o un '
                                     'administrador de la obra.',
                            'code': 'NO_RESPONSABLE'}), 403
        # Un parte con asientos EN_APROBACION se puede cerrar: la aprobación
        # es del ASIENTO y sigue su curso; lo que se congela es la jornada
        # (nada nuevo entra).
        h = list(d['history']) + [reg.entrada('cerrado', _actor())]
        cur.execute("""UPDATE doc_partes SET estado=%s, cerrado_por=%s,
                              cerrado_en=CURRENT_TIMESTAMP, history=%s
                        WHERE id=%s RETURNING """ + _COLS_PARTE,
                    (cdo.CERRADO, _actor(), json.dumps(h), pid))
        d = _parte(cur.fetchone())
        try:
            _enc.cerrar_los_de(cur, 'PARTE', pid, cerrado_por=_actor())
        except Exception as e:
            logger.warning('[parte %s] BIC: %s', pid, str(e)[:120])
        conn.commit()
    log_activity(obra, 'PARTE_CERRADO', 'doc_partes', str(pid),
                 d['fecha_operativa'], _actor(), {})
    return jsonify(d)


# ══ EL ASIENTO ═════════════════════════════════════════════════════════════

def _referencias_validas(cur, obra, tipo, referencias):
    """None si las citas apuntan a objetos DE ESTA OBRA; (motivo, code) si no.

    Una cita es un vínculo, no una copia — y no puede cruzar expedientes.
    La foto además tiene que ser VISIBLE para quien la cita: citar una foto
    N2 ajena confirmaría que existe (misma regla 404 de NG-02).
    """
    r = referencias or {}
    if r.get('foto_id'):
        cur.execute("""SELECT id, sensibilidad, autor_id FROM doc_fotos
                        WHERE id = %s AND project_id = %s""",
                    (int(r['foto_id']), obra))
        f = cur.fetchone()
        if not f:
            return 'esa foto no existe en esta obra', 'FOTO_NO_EXISTE'
        import fotos_de_obra as fdo
        u = _usuario()
        d = {'sensibilidad': f[1], 'autor_id': f[2]}
        if not fdo.puede_ver(u, d, es_admin_de_obra(cur, u, obra)):
            return 'esa foto no existe en esta obra', 'FOTO_NO_EXISTE'
    if r.get('instruccion_id'):
        cur.execute('SELECT 1 FROM doc_instrucciones WHERE id = %s AND project_id = %s',
                    (int(r['instruccion_id']), obra))
        if not cur.fetchone():
            return 'esa instrucción no existe en esta obra', 'INSTRUCCION_NO_EXISTE'
    if r.get('asiento_id'):
        cur.execute('SELECT 1 FROM doc_asientos WHERE id = %s AND project_id = %s',
                    (int(r['asiento_id']), obra))
        if not cur.fetchone():
            return 'ese asiento no existe en esta obra', 'ASIENTO_NO_EXISTE'
    if r.get('issue_id'):
        cur.execute('SELECT 1 FROM doc_issues WHERE id = %s AND project_id = %s',
                    (int(r['issue_id']), obra))
        if not cur.fetchone():
            return 'ese issue no existe en esta obra', 'ISSUE_NO_EXISTE'
    return None


@cuaderno_bp.route('/api/cuaderno/partes/<int:pid>/asientos', methods=['POST'])
def registrar_asiento(pid):
    """Registra un asiento. INMUTABLE una vez registrado: se corrige con OTRO
    asiento que lo referencia. El autor NO gana autoridad por crear: si su
    función es colaboradora (o ninguna), nace EN_APROBACION (E07)."""
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        # El candado del parte: FOR UPDATE, como las actas. Un parte cerrado
        # no admite asientos, y dos registros simultáneos no se cuelan.
        cur.execute("""SELECT id, project_id, estado, fecha_operativa
                         FROM doc_partes WHERE id = %s FOR UPDATE""", (pid,))
        parte = cur.fetchone()
        if not parte:
            return jsonify({'error': 'Ese parte no existe.'}), 404
        obra = parte[1]
        corte = guardia_de_obra(obra, 'registrar un asiento')
        if corte:
            return corte
        if parte[2] != cdo.ABIERTO:
            return jsonify({'error': 'La jornada del %s ya está cerrada; nada '
                                     'entra en un parte congelado. Registra en '
                                     'el parte del día en curso, citando.'
                                     % parte[3].isoformat(),
                            'code': 'PARTE_CERRADO'}), 409

        tipo = (data.get('tipo') or '').strip()
        ok, mal = cdo.validar_asiento(tipo, data.get('texto'),
                                      data.get('contenido'), data.get('referencias'))
        if not ok:
            return jsonify({'error': 'Asiento no registrable.', 'code': mal,
                            'tipos': list(cdo.TIPOS_DE_ASIENTO)}), 400
        malas = _referencias_validas(cur, obra, tipo, data.get('referencias'))
        if malas:
            return jsonify({'error': malas[0], 'code': malas[1]}), 404

        uid, _eid, empresa, funcion = _quien_es(cur, obra)
        estado = cdo.estado_inicial_de_asiento(funcion)

        for intento in range(5):
            numero = cdo.siguiente_numero_de_asiento(cur, obra)
            try:
                cur.execute('SAVEPOINT alta_asiento')
                cur.execute("""INSERT INTO doc_asientos
                    (project_id, parte_id, numero, tipo, texto, contenido,
                     referencias, autor_id, autor_empresa, autor_funcion,
                     created_by, estado, capturado_en, history)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING """ + _COLS_ASIENTO,
                    (obra, pid, numero, tipo,
                     (data.get('texto') or '').strip() or None,
                     json.dumps(data.get('contenido') or {}),
                     json.dumps(data.get('referencias') or {}),
                     uid, empresa, funcion, _actor(), estado,
                     data.get('capturado_en') or None,
                     json.dumps([reg.entrada('registrado', _actor(),
                                             numero=numero, tipo=tipo,
                                             funcion=funcion, estado=estado)])))
                d = _asiento(cur.fetchone())
                cur.execute('RELEASE SAVEPOINT alta_asiento')
                break
            except Exception:
                cur.execute('ROLLBACK TO SAVEPOINT alta_asiento')
                if intento == 4:
                    raise

        # BIC: colaborador registra → la pelota la tiene la función aprobadora.
        if estado == cdo.EN_APROBACION:
            try:
                eid2 = _enc.abrir(cur, 'ASIENTO', d['id'],
                                  'Aprobar o devolver el asiento N.º %s (%s)'
                                  % (numero, tipo),
                                  destino_funcion='SUPERVISION',
                                  creado_por=_actor())
                if eid2:
                    _enc.avisar(cur, eid2)
            except Exception as e:
                logger.warning('[asiento %s] sin encargo: %s', d['id'], str(e)[:120])
        # Si este asiento corrige a uno DEVUELTO, aquella deuda queda saldada.
        corrige = (data.get('referencias') or {}).get('asiento_id')
        if corrige:
            try:
                _enc.cerrar_los_de(cur, 'ASIENTO', int(corrige), cerrado_por=_actor())
            except Exception:
                pass
        conn.commit()
    log_activity(obra, 'ASIENTO_REGISTRADO', 'doc_asientos', str(d['id']),
                 '%s N.º %s' % (tipo, numero), _actor(), {'estado': estado})
    return jsonify(d), 201


def _asiento_bloqueado(cur, aid):
    cur.execute("SELECT " + _COLS_ASIENTO +
                " FROM doc_asientos WHERE id = %s FOR UPDATE", (aid,))
    f = cur.fetchone()
    return _asiento(f) if f else None


def _resolver_aprobacion(aid, veredicto):
    """Aprobar y devolver comparten TODA la autoridad; solo cambia el desenlace.

    LA CORRECCIÓN DEL PROPIETARIO, EN CÓDIGO: la decisión la toma
    `cdo.puede_aprobar_asiento(funcion, es_autor)` — que NI ACEPTA un
    parámetro administrativo. Aquí no se consulta al administrador de la
    obra, a propósito: administrar no es autoridad contractual.
    """
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _asiento_bloqueado(cur, aid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        obra = d['project_id']
        corte = guardia_de_obra(obra, 'resolver un asiento')
        if corte:
            return corte
        if d['estado'] != cdo.EN_APROBACION:
            return jsonify({'error': 'Este asiento está en «%s»: no espera '
                                     'aprobación.' % d['estado'],
                            'code': 'NO_ESPERA_APROBACION'}), 409
        uid, _eid, _emp, funcion = _quien_es(cur, obra)
        if not cdo.puede_aprobar_asiento(funcion, uid == d['autor_id']):
            if uid == d['autor_id']:
                return jsonify({'error': 'El autor no se aprueba a sí mismo.',
                                'code': 'AUTOR_NO_SE_APRUEBA'}), 403
            if not _hay_aprobador_contractual(cur, obra):
                return jsonify({'error': 'Nadie ejerce una función aprobadora '
                                         '(SUPERVISION; ENTIDAD como '
                                         'contingencia) en esta obra. La '
                                         'administración no la sustituye.',
                                'code': 'SIN_APROBADOR_CONTRACTUAL'}), 403
            return jsonify({'error': 'Aprobar un asiento es autoridad '
                                     'contractual: SUPERVISION (o ENTIDAD como '
                                     'contingencia declarada). Ser '
                                     'administrador de la obra no la confiere.',
                            'code': 'APROBADOR_NO_CONTRACTUAL'}), 403

        if veredicto == cdo.DEVUELTO:
            motivo = (data.get('motivo') or '').strip()
            if not motivo:
                return jsonify({'error': 'Devolver sin motivo no le dice a su '
                                         'autor qué corregir.',
                                'code': 'SIN_MOTIVO'}), 400
            h = list(d['history']) + [reg.entrada('devuelto', _actor(),
                                                  funcion=funcion, motivo=motivo)]
            cur.execute("""UPDATE doc_asientos SET estado=%s, motivo_devolucion=%s,
                                  aprobado_por=%s, aprobado_en=CURRENT_TIMESTAMP,
                                  history=%s
                            WHERE id=%s RETURNING """ + _COLS_ASIENTO,
                        (cdo.DEVUELTO, motivo, _actor(), json.dumps(h), aid))
        else:
            h = list(d['history']) + [reg.entrada('aprobado', _actor(),
                                                  funcion=funcion)]
            cur.execute("""UPDATE doc_asientos SET estado=%s, aprobado_por=%s,
                                  aprobado_en=CURRENT_TIMESTAMP, history=%s
                            WHERE id=%s RETURNING """ + _COLS_ASIENTO,
                        (cdo.APROBADO, _actor(), json.dumps(h), aid))
        d = _asiento(cur.fetchone())
        try:
            _enc.cerrar_los_de(cur, 'ASIENTO', aid, cerrado_por=_actor())
            if d['estado'] == cdo.DEVUELTO and d['autor_id']:
                eid2 = _enc.abrir(cur, 'ASIENTO', aid,
                                  'Corregir y re-registrar el asiento N.º %s (%s)'
                                  % (d['numero'], d['tipo']),
                                  destino_usuario=d['autor_id'], creado_por=_actor())
                if eid2:
                    _enc.avisar(cur, eid2)
        except Exception as e:
            logger.warning('[asiento %s] BIC: %s', aid, str(e)[:120])
        conn.commit()
    log_activity(d['project_id'], 'ASIENTO_' + d['estado'], 'doc_asientos',
                 str(aid), 'N.º %s' % d['numero'], _actor(), {})
    return jsonify(d)


@cuaderno_bp.route('/api/cuaderno/asientos/<int:aid>/aprobar', methods=['POST'])
def aprobar_asiento(aid):
    return _resolver_aprobacion(aid, cdo.APROBADO)


@cuaderno_bp.route('/api/cuaderno/asientos/<int:aid>/devolver', methods=['POST'])
def devolver_asiento(aid):
    """La devolución no borra: el asiento queda DEVUELTO, inmutable, y su autor
    re-registra otro que lo referencia."""
    return _resolver_aprobacion(aid, cdo.DEVUELTO)


# ══ LA INSTRUCCIÓN ═════════════════════════════════════════════════════════

@cuaderno_bp.route('/api/cuaderno/instrucciones', methods=['GET'])
def listar_instrucciones():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver las instrucciones de obra')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_INSTR + """ FROM doc_instrucciones
                     WHERE project_id = %s ORDER BY id DESC LIMIT 200""", (obra,))
        filas = [_instr(r) for r in cur.fetchall()]
    return jsonify({'instrucciones': filas, 'total': len(filas)})


@cuaderno_bp.route('/api/cuaderno/instrucciones/<int:iid>', methods=['GET'])
def detalle_instruccion(iid):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS_INSTR + " FROM doc_instrucciones WHERE id = %s",
                    (iid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        corte = guardia_de_obra(f[1], 'ver esta instrucción')
        if corte:
            return corte
    return jsonify(_instr(f))


@cuaderno_bp.route('/api/cuaderno/instrucciones', methods=['POST'])
def emitir_instruccion():
    """Emite (o RECTIFICA, con `rectifica_a`). EMITIDA = inmutable: no existe
    PATCH, deliberadamente. La autoridad es la FUNCIÓN emisora declarada —
    ser admin no emite."""
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.'}), 400
    corte = guardia_de_obra(obra, 'emitir una instrucción de obra')
    if corte:
        return corte

    asunto = (data.get('asunto') or '').strip()
    contenido = (data.get('contenido') or '').strip()
    if not asunto or not contenido:
        return jsonify({'error': 'Una instrucción tiene asunto y contenido.',
                        'code': 'INSTRUCCION_VACIA'}), 400
    destino, mal = cdo.destinatario_valido(data.get('destinatario'))
    if not destino:
        return jsonify({'error': 'El destinatario es una persona concreta o '
                                 'una empresa concreta de la obra — nunca una '
                                 'función.', 'code': mal}), 400

    with get_db_connection() as conn:
        cur = conn.cursor()
        uid, _eid, empresa, funcion = _quien_es(cur, obra)
        if not cdo.puede_emitir_instruccion(funcion):
            return jsonify({'error': 'Emiten instrucciones las funciones %s. '
                                     'La administración de la obra no lo es.'
                                     % ' y '.join(cdo.FUNCIONES_EMISORAS_DE_INSTRUCCION),
                            'code': 'SIN_AUTORIDAD_DE_EMISION'}), 403

        # EL SNAPSHOT DEL SUJETO CONTRACTUAL, congelado al emitir.
        if destino['tipo'] == cdo.DESTINATARIO_PERSONA:
            cur.execute("""SELECT u.name, u.email, u.company_id, c.name
                             FROM users u
                             LEFT JOIN companies c ON c.id = u.company_id
                             JOIN project_users pu
                               ON pu.project_id = %s AND pu.user_id = u.id
                            WHERE u.id = %s AND u.is_active""",
                        (obra, destino['usuario_id']))
            f = cur.fetchone()
            if not f:
                return jsonify({'error': 'Esa persona no es miembro de la obra.',
                                'code': 'DESTINATARIO_NO_MIEMBRO'}), 404
            destino.update({'nombre': f[0], 'email': f[1], 'empresa_id': f[2],
                            'empresa': f[3],
                            'funcion': dirobra.funcion_de(cur, obra,
                                                          destino['usuario_id'])})
        else:
            cur.execute("""SELECT c.name, pc.funcion FROM project_companies pc
                             JOIN companies c ON c.id = pc.company_id
                            WHERE pc.project_id = %s AND pc.company_id = %s""",
                        (obra, destino['empresa_id']))
            f = cur.fetchone()
            if not f:
                return jsonify({'error': 'Esa empresa no participa en la obra.',
                                'code': 'DESTINATARIO_NO_PARTICIPA'}), 404
            destino.update({'empresa': f[0], 'funcion': f[1]})

        # ¿RECTIFICACIÓN? La vieja queda RECTIFICADA, visible; jamás se edita.
        vieja = None
        rectifica_a = data.get('rectifica_a')
        if rectifica_a:
            cur.execute("SELECT " + _COLS_INSTR + """ FROM doc_instrucciones
                         WHERE id = %s FOR UPDATE""", (int(rectifica_a),))
            fv = cur.fetchone()
            if not fv:
                return jsonify({'error': 'La instrucción a rectificar no existe.'}), 404
            vieja = _instr(fv)
            if str(vieja['project_id']) != str(obra):
                return jsonify({'error': 'Esa instrucción es de otra obra.',
                                'code': 'OTRA_OBRA'}), 409
            if vieja['estado'] not in cdo.RECTIFICABLES:
                return jsonify({'error': 'Una instrucción en «%s» no se '
                                         'rectifica; se emite una nueva.'
                                         % vieja['estado'],
                                'code': 'NO_RECTIFICABLE'}), 409

        malas = _referencias_validas(cur, obra, None, data.get('referencias'))
        if malas:
            return jsonify({'error': malas[0], 'code': malas[1]}), 404

        for intento in range(5):
            codigo = reg.siguiente_codigo(cur, cdo.SEM_INSTRUCCION, obra)
            try:
                cur.execute('SAVEPOINT alta_instr')
                cur.execute("""INSERT INTO doc_instrucciones
                    (project_id, model_urn, codigo, asunto, contenido, emisor_id,
                     emisor_empresa, emisor_funcion, created_by, destinatario,
                     referencias, rectifica_a, estado, history)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING """ + _COLS_INSTR,
                    (obra, data.get('model_urn') or obra, codigo, asunto,
                     contenido, uid, empresa, funcion, _actor(),
                     json.dumps(destino), json.dumps(data.get('referencias') or {}),
                     int(rectifica_a) if rectifica_a else None, cdo.EMITIDA,
                     json.dumps([reg.entrada('emitida', _actor(), codigo=codigo,
                                             funcion=funcion,
                                             rectifica_a=vieja['codigo'] if vieja else None)])))
                d = _instr(cur.fetchone())
                cur.execute('RELEASE SAVEPOINT alta_instr')
                break
            except Exception:
                cur.execute('ROLLBACK TO SAVEPOINT alta_instr')
                if intento == 4:
                    raise

        if vieja:
            h = list(vieja['history']) + [reg.entrada('rectificada', _actor(),
                                                      por=d['codigo'])]
            cur.execute("""UPDATE doc_instrucciones SET estado=%s, history=%s
                            WHERE id=%s""",
                        (cdo.RECTIFICADA, json.dumps(h), vieja['id']))
            try:
                _enc.cerrar_los_de(cur, 'INSTRUCCION', vieja['id'],
                                   cerrado_por=_actor())
            except Exception:
                pass

        # BIC: el acuse lo debe EL SUJETO CONTRACTUAL del snapshot.
        try:
            eid2 = _enc.abrir(
                cur, 'INSTRUCCION', d['id'],
                'Acusar recibo de %s: %s' % (codigo, asunto),
                destino_usuario=(destino.get('usuario_id')
                                 if destino['tipo'] == cdo.DESTINATARIO_PERSONA
                                 else None),
                destino_empresa=(destino.get('empresa_id')
                                 if destino['tipo'] == cdo.DESTINATARIO_EMPRESA
                                 else None),
                creado_por=_actor())
            if eid2:
                _enc.avisar(cur, eid2)
        except Exception as e:
            logger.warning('[instr %s] sin encargo: %s', d['id'], str(e)[:120])
        conn.commit()
    log_activity(obra, 'INSTRUCCION_EMITIDA', 'doc_instrucciones', str(d['id']),
                 d['codigo'], _actor(),
                 {'rectifica_a': vieja['codigo'] if vieja else None})
    return jsonify(d), 201


def _instr_bloqueada(cur, iid):
    cur.execute("SELECT " + _COLS_INSTR +
                " FROM doc_instrucciones WHERE id = %s FOR UPDATE", (iid,))
    f = cur.fetchone()
    return _instr(f) if f else None


@cuaderno_bp.route('/api/cuaderno/instrucciones/<int:iid>/acusar', methods=['POST'])
def acusar_instruccion(iid):
    """El acuse SOLO CRECE (patrón transmittal) y lo firma el SUJETO
    CONTRACTUAL: la persona destinataria, o un miembro de la empresa
    destinataria. Jamás «cualquiera con la misma función»."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _instr_bloqueada(cur, iid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        obra = d['project_id']
        corte = guardia_de_obra(obra, 'acusar recibo de una instrucción')
        if corte:
            return corte
        uid, empresa_id, _emp, _funcion = _quien_es(cur, obra)
        if not cdo.es_del_destinatario(_usuario(), d['destinatario'], empresa_id):
            return jsonify({'error': 'El acuse es del sujeto contractual '
                                     'destinatario.', 'code': 'NO_DESTINATARIO'}), 403
        if d['estado'] not in (cdo.EMITIDA, cdo.ACUSADA):
            return jsonify({'error': 'Esta instrucción está en «%s».' % d['estado'],
                            'code': 'ESTADO_NO_ADMITE_ACUSE'}), 409
        acuses = list(d['acuses']) + [{'por': _actor(), 'por_id': uid,
                                       'en': datetime.datetime.now(
                                           datetime.timezone.utc).isoformat()}]
        h = list(d['history']) + [reg.entrada('acusada', _actor())]
        cur.execute("""UPDATE doc_instrucciones SET acuses=%s, estado=%s, history=%s
                        WHERE id=%s RETURNING """ + _COLS_INSTR,
                    (json.dumps(acuses), cdo.ACUSADA, json.dumps(h), iid))
        d = _instr(cur.fetchone())
        try:
            _enc.cerrar_los_de(cur, 'INSTRUCCION', iid, cerrado_por=_actor())
            dest = d['destinatario']
            eid2 = _enc.abrir(
                cur, 'INSTRUCCION', iid,
                'Atender %s: %s' % (d['codigo'], d['asunto']),
                destino_usuario=(dest.get('usuario_id')
                                 if dest.get('tipo') == cdo.DESTINATARIO_PERSONA
                                 else None),
                destino_empresa=(dest.get('empresa_id')
                                 if dest.get('tipo') == cdo.DESTINATARIO_EMPRESA
                                 else None),
                creado_por=_actor())
            if eid2:
                _enc.avisar(cur, eid2)
        except Exception as e:
            logger.warning('[instr %s] BIC: %s', iid, str(e)[:120])
        conn.commit()
    log_activity(obra, 'INSTRUCCION_ACUSADA', 'doc_instrucciones', str(iid),
                 d['codigo'], _actor(), {})
    return jsonify(d)


@cuaderno_bp.route('/api/cuaderno/instrucciones/<int:iid>/atender', methods=['POST'])
def atender_instruccion(iid):
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _instr_bloqueada(cur, iid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        obra = d['project_id']
        corte = guardia_de_obra(obra, 'atender una instrucción')
        if corte:
            return corte
        uid, empresa_id, _emp, _funcion = _quien_es(cur, obra)
        if not cdo.es_del_destinatario(_usuario(), d['destinatario'], empresa_id):
            return jsonify({'error': 'Atiende el sujeto contractual destinatario.',
                            'code': 'NO_DESTINATARIO'}), 403
        if d['estado'] != cdo.ACUSADA:
            return jsonify({'error': 'Se atiende una instrucción ACUSADA (está '
                                     'en «%s»).' % d['estado'],
                            'code': 'ESTADO_NO_ADMITE_ATENCION'}), 409
        atencion = {'nota': (data.get('nota') or '').strip() or None,
                    'por': _actor(), 'por_id': uid,
                    'en': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        h = list(d['history']) + [reg.entrada('atendida', _actor())]
        cur.execute("""UPDATE doc_instrucciones SET estado=%s, atencion=%s, history=%s
                        WHERE id=%s RETURNING """ + _COLS_INSTR,
                    (cdo.ATENDIDA, json.dumps(atencion), json.dumps(h), iid))
        d = _instr(cur.fetchone())
        try:
            _enc.cerrar_los_de(cur, 'INSTRUCCION', iid, cerrado_por=_actor())
            if d['emisor_id']:
                eid2 = _enc.abrir(cur, 'INSTRUCCION', iid,
                                  'Verificar y cerrar %s: %s'
                                  % (d['codigo'], d['asunto']),
                                  destino_usuario=d['emisor_id'], creado_por=_actor())
                if eid2:
                    _enc.avisar(cur, eid2)
        except Exception as e:
            logger.warning('[instr %s] BIC: %s', iid, str(e)[:120])
        conn.commit()
    log_activity(obra, 'INSTRUCCION_ATENDIDA', 'doc_instrucciones', str(iid),
                 d['codigo'], _actor(), {})
    return jsonify(d)


@cuaderno_bp.route('/api/cuaderno/instrucciones/<int:iid>/cerrar', methods=['POST'])
def cerrar_instruccion(iid):
    """Cierra quien emitió — o alguien de las funciones emisoras, para que una
    instrucción no quede eternamente abierta si su emisor dejó la obra."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _instr_bloqueada(cur, iid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        obra = d['project_id']
        corte = guardia_de_obra(obra, 'cerrar una instrucción')
        if corte:
            return corte
        uid, _eid, _emp, funcion = _quien_es(cur, obra)
        if uid != d['emisor_id'] and not cdo.puede_emitir_instruccion(funcion):
            return jsonify({'error': 'Cierra su emisor o una función emisora.',
                            'code': 'NO_EMISOR'}), 403
        if d['estado'] != cdo.ATENDIDA:
            return jsonify({'error': 'Se cierra una instrucción ATENDIDA (está '
                                     'en «%s»).' % d['estado'],
                            'code': 'ESTADO_NO_ADMITE_CIERRE'}), 409
        h = list(d['history']) + [reg.entrada('cerrada', _actor())]
        cur.execute("""UPDATE doc_instrucciones SET estado=%s,
                              cerrada_en=CURRENT_TIMESTAMP, history=%s
                        WHERE id=%s RETURNING """ + _COLS_INSTR,
                    (cdo.CERRADA, json.dumps(h), iid))
        d = _instr(cur.fetchone())
        try:
            _enc.cerrar_los_de(cur, 'INSTRUCCION', iid, cerrado_por=_actor())
        except Exception as e:
            logger.warning('[instr %s] BIC: %s', iid, str(e)[:120])
        conn.commit()
    log_activity(obra, 'INSTRUCCION_CERRADA', 'doc_instrucciones', str(iid),
                 d['codigo'], _actor(), {})
    return jsonify(d)


# ══ LA UBICACIÓN DE LA OBRA Y EL CLIMA (E08) ═══════════════════════════════

@cuaderno_bp.route('/api/cuaderno/ubicacion', methods=['GET'])
def ver_ubicacion():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver la ubicación de la obra')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT lat, lon, descripcion, actualizado_por, actualizado_en
                         FROM doc_obra_ubicacion WHERE project_id = %s""", (obra,))
        f = cur.fetchone()
    if not f:
        return jsonify({'ubicacion': None,
                        'nota': 'la obra no tiene ubicación configurada; el '
                                'clima automático la necesita'}), 200
    return jsonify({'ubicacion': {'lat': f[0], 'lon': f[1], 'descripcion': f[2],
                                  'actualizado_por': f[3],
                                  'actualizado_en': f[4].isoformat() if f[4] else None}})


@cuaderno_bp.route('/api/cuaderno/ubicacion', methods=['PUT'])
def fijar_ubicacion():
    """Coordenadas DE LA OBRA, nunca del dispositivo (privacidad GPS, NG-02).
    Configuración administrativa: admin de obra."""
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.'}), 400
    corte = guardia_de_obra(obra, 'configurar la ubicación de la obra')
    if corte:
        return corte
    try:
        lat, lon = float(data.get('lat')), float(data.get('lon'))
    except (TypeError, ValueError):
        return jsonify({'error': 'lat y lon son obligatorios.'}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({'error': 'Coordenadas fuera de rango.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        if not es_admin_de_obra(cur, _usuario(), obra):
            return jsonify({'error': 'La ubicación la configura un administrador '
                                     'de la obra.', 'code': 'NO_ADMIN'}), 403
        cur.execute("""INSERT INTO doc_obra_ubicacion
                         (project_id, lat, lon, descripcion, actualizado_por)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (project_id) DO UPDATE
                          SET lat=EXCLUDED.lat, lon=EXCLUDED.lon,
                              descripcion=EXCLUDED.descripcion,
                              actualizado_por=EXCLUDED.actualizado_por,
                              actualizado_en=CURRENT_TIMESTAMP""",
                    (obra, lat, lon, (data.get('descripcion') or '').strip() or None,
                     _actor()))
        conn.commit()
    return jsonify({'ubicacion': {'lat': lat, 'lon': lon}})


_CIELO = {0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nuboso',
          3: 'nublado', 45: 'niebla', 48: 'niebla con escarcha',
          51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna densa',
          61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia fuerte',
          80: 'chubascos ligeros', 81: 'chubascos', 82: 'chubascos fuertes',
          95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta fuerte'}


@cuaderno_bp.route('/api/cuaderno/clima', methods=['GET'])
def clima():
    """El dato del proveedor CON SU PROCEDENCIA COMPLETA (doc 96 §F.1):
    origen, instante de servidor, coordenadas DE LA OBRA, y la respuesta
    CRUDA conservada. La pantalla lo registra como asiento `clima`; una
    corrección manual NO reemplaza — conserva lo recibido y lo corregido."""
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'consultar el clima de la obra')
    if corte:
        return corte
    fecha, mal = cdo.fecha_operativa_valida(request.args.get('fecha'))
    if not fecha:
        return jsonify({'error': 'fecha AAAA-MM-DD obligatoria', 'code': mal}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT lat, lon FROM doc_obra_ubicacion WHERE project_id = %s',
                    (obra,))
        f = cur.fetchone()
    if not f:
        return jsonify({'error': 'La obra no tiene ubicación configurada; sin '
                                 'ella no hay clima automático. Registra el '
                                 'clima manual, o pide a un administrador que '
                                 'la configure.',
                        'code': 'SIN_UBICACION_DE_OBRA'}), 409
    lat, lon = f
    import requests
    try:
        r = requests.get(
            'https://api.open-meteo.com/v1/forecast',
            params={'latitude': lat, 'longitude': lon,
                    'daily': 'temperature_2m_max,temperature_2m_min,'
                             'precipitation_sum,wind_speed_10m_max,weather_code',
                    'timezone': 'auto',
                    'start_date': fecha.isoformat(), 'end_date': fecha.isoformat()},
            timeout=8)
        r.raise_for_status()
        crudo = r.json()
    except Exception as e:
        logger.warning('[clima] open-meteo: %s', str(e)[:200])
        return jsonify({'error': 'El proveedor de clima no respondió; el '
                                 'asiento manual sigue disponible.',
                        'code': 'PROVEEDOR_NO_RESPONDE'}), 502
    diario = crudo.get('daily') or {}

    def _v(clave):
        vals = diario.get(clave) or []
        return vals[0] if vals else None
    codigo_cielo = _v('weather_code')
    return jsonify({
        'origen': cdo.ORIGEN_PROVEEDOR,
        'proveedor': 'open-meteo',
        'consultado_en': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'fecha': fecha.isoformat(),
        'lat': lat, 'lon': lon,
        'dato': {'temperatura_max': _v('temperature_2m_max'),
                 'temperatura_min': _v('temperature_2m_min'),
                 'precipitacion_mm': _v('precipitation_sum'),
                 'viento_kmh': _v('wind_speed_10m_max'),
                 'cielo': _CIELO.get(codigo_cielo, 'código %s' % codigo_cielo)},
        'dato_recibido': diario,
    })
