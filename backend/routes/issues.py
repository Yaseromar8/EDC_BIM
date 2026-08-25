# -*- coding: utf-8 -*-
"""GAP 11 · CORE · ISSUES — y GAP 04 · PUNCH, que es `ISSUE(tipo=PUNCH)`.

La semantica esta en `flujo_de_issue.py`. Aqui solo se mueve el issue por donde
esa semantica permite.

EL PUNCH NO ES UNA TABLA PARALELA
----------------------------------
Un punch de recepcion, una no conformidad de protocolo y una observacion de
calidad tienen EL MISMO CICLO DE VIDA --detectar, corregir, verificar-- y solo
se diferencian en CUANDO nacen y con que exigencias. Eso es un `tipo`, no un
objeto. Construirlos aparte habria dejado tres tablas que hay que unificar
despues con datos ya escritos, que es la migracion que este proyecto lleva
evitando desde el principio (doc 86 §4).

    ISSUE(tipo=PUNCH)            observacion de cierre / recepcion
    ISSUE(tipo=NO_CONFORMIDAD)   punto no conforme de un protocolo
    ISSUE(tipo=CALIDAD)          defecto detectado en ejecucion
    ISSUE(tipo=SEGURIDAD)        condicion insegura

LO QUE ESTE MANEJADOR NO HACE
------------------------------
No acepta un estado que venga del cliente. Cada transicion es UN ACTO con su
propia ruta y su propia autoridad: `corregir`, `verificar`, `reabrir`, `anular`.
Un `PATCH estado` habria dejado el ciclo en manos de quien llame.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from administracion_de_obra import es_admin_de_obra, guardia_administrativa
from perimetro_de_obra import guardia_de_obra, guardia_de_recurso
import encargos as _enc
import flujo_de_issue as iss
import flujo_de_registro as reg

logger = logging.getLogger('issues')

issues_bp = Blueprint('issues_bp', __name__)
S = iss.SEMANTICA

_COLS = ('id, project_id, model_urn, codigo, tipo, titulo, descripcion, '
         'revision_id, ubicacion, progresiva, autor_id, responsable_id, '
         'verificador_id, verificado_por, created_by, estado, vence_en, evidencia, '
         'evidencia_correccion, autoverificacion, autoverificacion_motivo, '
         'origen_tipo, origen_id, history, creado_en, corregido_en, '
         'verificado_en, cerrado_en')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r):
    # A QUIEN LE TOCA AHORA, calculado POR LA MISMA FUNCION que reparte los
    # encargos. La pantalla necesita ensenarlo, y si lo dedujera por su cuenta
    # tendriamos dos versiones de la regla: la que manda los avisos y la que
    # dibuja la lista. Divergirian en el primer estado nuevo.
    a_quien, _asunto, _v = _enc.deudor_de_issue(None, (r[0], r[3], r[5], r[15],
                                                       r[10], r[11], r[12], r[16]))
    return {
        'a_quien_le_toca': a_quien,
        'id': str(r[0]), 'project_id': r[1], 'model_urn': r[2], 'codigo': r[3],
        'tipo': r[4], 'tipo_etiqueta': iss.etiqueta_tipo(r[4]),
        'titulo': r[5], 'descripcion': r[6],
        'revision_id': str(r[7]) if r[7] else None,
        'ubicacion': r[8], 'progresiva': r[9],
        # LAS TRES IDENTIDADES, SEPARADAS. `verificador_id` es el PAPEL --a
        # quien le toca-- y `verificado_por` el HECHO --quien firmo--.
        'autor_id': r[10], 'responsable_id': r[11],
        'verificador_id': r[12], 'verificado_por': r[13],
        'created_by': r[14], 'estado': r[15],
        'vence_en': r[16].isoformat() if r[16] else None,
        'evidencia': r[17] or [], 'evidencia_correccion': r[18] or [],
        'autoverificacion': bool(r[19]), 'autoverificacion_motivo': r[20],
        'origen_tipo': r[21], 'origen_id': r[22],
        'history': r[23] or [],
        'creado_en': r[24].isoformat() if r[24] else None,
        'corregido_en': r[25].isoformat() if r[25] else None,
        'verificado_en': r[26].isoformat() if r[26] else None,
        'cerrado_en': r[27].isoformat() if r[27] else None,
        'cerrado': iss.esta_cerrado(r[15]),
    }


def _leer(cur, iid):
    cur.execute('SELECT %s FROM doc_issues WHERE id = %%s' % _COLS, (iid,))
    r = cur.fetchone()
    return _fila(r) if r else None


def _historial(cur, iid, history, evento, **datos):
    h = list(history or []) + [reg.entrada(evento, _actor(), **datos)]
    cur.execute('UPDATE doc_issues SET history = %s WHERE id = %s',
                (json.dumps(h), iid))
    return h


def _abrir_pelota(cur, iid, issue, asunto):
    """La pelota va a quien tiene que ACTUAR AHORA. Nunca revienta el acto."""
    try:
        uid = issue.get('responsable_id')
        if not uid:
            return
        eid = _enc.abrir(cur, 'ISSUE', iid, asunto, destino_usuario=uid,
                         vence_en=issue.get('vence_en'), creado_por=_actor())
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        logger.warning('[issue %s] sin encargo: %s', iid, str(e)[:120])


def _cerrar_pelota(cur, iid):
    try:
        _enc.cerrar_los_de(cur, 'ISSUE', iid, cerrado_por=_actor())
    except Exception as e:
        logger.warning('[issue %s] no se cerraron los encargos: %s', iid, str(e)[:120])


# ── CATALOGO ───────────────────────────────────────────────────────────────

@issues_bp.route('/catalogo', methods=['GET'])
def catalogo():
    return jsonify({
        'tipos': [{'codigo': c, 'etiqueta': e,
                   'exige_responsable': c in iss.EXIGEN_RESPONSABLE,
                   'exige_ubicacion': c in iss.EXIGEN_UBICACION,
                   'exige_verificador': c in iss.EXIGEN_VERIFICADOR}
                  for c, e in iss.TIPOS],
        'estados': list(iss.ESTADOS),
        'vivos': list(iss.VIVOS),
    })


# ── LECTURA ────────────────────────────────────────────────────────────────

@issues_bp.route('', methods=['GET'])
def listar():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    tipo = (request.args.get('tipo') or '').strip().upper() or None
    estado = (request.args.get('estado') or '').strip() or None
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT %s FROM doc_issues WHERE project_id = %%s '
                        '   AND (%%s IS NULL OR tipo = %%s) '
                        '   AND (%%s IS NULL OR estado = %%s) '
                        ' ORDER BY codigo DESC' % _COLS,
                        (obra, tipo, tipo, estado, estado))
            filas = [_fila(r) for r in cur.fetchall()]
            cur.execute("""SELECT tipo, estado, count(*) FROM doc_issues
                            WHERE project_id = %s GROUP BY tipo, estado""", (obra,))
            resumen = {}
            for t, e, n in cur.fetchall():
                resumen.setdefault(t, {})[e] = n
            return jsonify({'issues': filas, 'resumen': resumen})
    except Exception as e:
        logger.error('listar issues: %s', e)
        return jsonify({'error': 'No se pudo listar.'}), 500


@issues_bp.route('/<int:iid>', methods=['GET'])
def detalle(iid):
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    with get_db_connection() as conn:
        d = _leer(conn.cursor(), iid)
    return (jsonify(d), 200) if d else (jsonify({'error': 'No existe.'}), 404)


# ── ALTA ───────────────────────────────────────────────────────────────────

@issues_bp.route('', methods=['POST'])
def crear():
    """Detecta un defecto. Quien lo crea es el AUTOR, y eso no se negocia."""
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'levantar un issue')
    if corte:
        return corte
    autor = _usuario().get('id')
    if not autor:
        return jsonify({'error': 'Sesión sin identidad.', 'code': 'NO_IDENTITY'}), 401

    tipo = (data.get('tipo') or '').strip().upper()
    if tipo not in iss.CODIGOS_TIPO:
        return jsonify({'error': 'Tipo desconocido.',
                        'admitidos': list(iss.CODIGOS_TIPO)}), 400
    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'error': 'El título es obligatorio.'}), 400

    responsable = data.get('responsable_id')
    if tipo in iss.EXIGEN_RESPONSABLE and not responsable:
        return jsonify({'error': 'Un %s sin responsable es un defecto que nadie va '
                                 'a corregir.' % iss.etiqueta_tipo(tipo),
                        'code': 'SIN_RESPONSABLE'}), 409

    verificador = data.get('verificador_id')
    if tipo in iss.EXIGEN_VERIFICADOR and not verificador:
        return jsonify({'error': 'Un %s exige un verificador designado: registra uno, '
                                 'corrige otro y aprueba el cierre un tercero. Sin '
                                 'designarlo, el cierre acabaria recayendo en quien '
                                 'detecto el defecto.' % iss.etiqueta_tipo(tipo),
                        'code': 'SIN_VERIFICADOR'}), 409
    if verificador and responsable and int(verificador) == int(responsable):
        return jsonify({'error': 'El verificador no puede ser el mismo que corrige. '
                                 'La autoverificacion existe, pero se autoriza aparte '
                                 'y con motivo escrito.',
                        'code': 'VERIFICADOR_ES_RESPONSABLE'}), 409

    revision_id = data.get('revision_id')
    if tipo in iss.EXIGEN_UBICACION and not revision_id:
        return jsonify({'error': 'Un punch se levanta sobre una lámina concreta: '
                                 'sin decir dónde, nadie puede ir a corregirlo.',
                        'code': 'SIN_UBICACION'}), 409

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            if revision_id:
                # LA LAMINA TIENE QUE SER DE ESTA OBRA. Sin esto se podria clavar
                # un defecto sobre el plano de otro con solo conocer su id.
                cur.execute("""SELECT p.project_id FROM doc_plano_revisiones r
                                 JOIN doc_planos p ON p.id = r.plano_id
                                WHERE r.id = %s""", (revision_id,))
                f = cur.fetchone()
                if not f:
                    return jsonify({'error': 'Esa revisión de plano no existe.'}), 404
                if f[0] != obra:
                    return jsonify({'error': 'Esa revisión pertenece a otra obra.',
                                    'code': 'OTRA_OBRA'}), 409
            for quien, uid_ in (('responsable', responsable),
                                ('verificador', verificador)):
                if not uid_:
                    continue
                cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                            (obra, int(uid_)))
                if not cur.fetchone():
                    return jsonify({'error': 'El %s no es miembro de esta obra.' % quien,
                                    'code': '%s_NO_MIEMBRO' % quien.upper()}), 409

            for intento in range(5):
                codigo = reg.siguiente_codigo(cur, S, obra)
                try:
                    cur.execute('SAVEPOINT alta_issue')
                    cur.execute("""INSERT INTO doc_issues
                        (project_id, model_urn, codigo, tipo, titulo, descripcion,
                         revision_id, ubicacion, progresiva, autor_id, responsable_id,
                         verificador_id, created_by, vence_en, evidencia,
                         origen_tipo, origen_id, history)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id""",
                        (obra, data.get('model_urn'), codigo, tipo, titulo,
                         (data.get('descripcion') or '').strip() or None,
                         revision_id,
                         (data.get('ubicacion') or '').strip() or None,
                         (data.get('progresiva') or '').strip() or None,
                         autor, responsable, verificador, _actor(),
                         data.get('vence_en') or None,
                         json.dumps(data.get('evidencia') or []),
                         data.get('origen_tipo'), data.get('origen_id'),
                         json.dumps([reg.entrada('detected', _actor(), codigo=codigo,
                                                 tipo=tipo)])))
                    iid = cur.fetchone()[0]
                    cur.execute('RELEASE SAVEPOINT alta_issue')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_issue')
                    if intento == 4:
                        raise
            conn.commit()
            d = _leer(cur, iid)
            _abrir_pelota(cur, iid, d, 'Corregir %s: %s' % (codigo, titulo))
            conn.commit()
            log_activity(data.get('model_urn'), 'CREATE', 'ISSUE', str(iid), codigo,
                         _actor(), {'tipo': tipo, 'responsable': responsable})
            return jsonify(_leer(cur, iid)), 201
    except Exception as e:
        logger.error('crear issue: %s', e)
        return jsonify({'error': 'No se pudo levantar el issue.'}), 500


# ── EL CICLO. Cada transicion es UN ACTO con su propia autoridad ───────────

@issues_bp.route('/<int:iid>/corregir', methods=['POST'])
def corregir(iid):
    """El RESPONSABLE declara que corrigio. Ready to Close.

    Exige EVIDENCIA: un «ya esta arreglado» sin prueba obliga al verificador a
    ir a mirar, y cuando la obra avanzo encima puede ser imposible.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            d = _leer(cur, iid)
            if not d:
                return jsonify({'error': 'No existe.'}), 404
            ok, motivo = reg.transicion_valida(S, d['estado'], iss.CORREGIDO)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
            if not iss.puede_corregir(_usuario(), d):
                return jsonify({'error': S.msg_no_adopta, 'code': 'NO_RESPONSABLE'}), 403

            evidencia = list(d['evidencia_correccion'] or []) + [
                {**(e if isinstance(e, dict) else {'nombre': e}),
                 'por': _actor(), 'en_estado': d['estado']}
                for e in (data.get('evidencia') or [])]
            if not evidencia:
                return jsonify({
                    'error': 'Declarar corregido exige evidencia: sin ella, verificar '
                             'obliga a volver a la obra y a veces ya no se puede.',
                    'code': 'SIN_EVIDENCIA'}), 409

            cur.execute("""UPDATE doc_issues
                              SET estado=%s, evidencia_correccion=%s,
                                  corregido_en=CURRENT_TIMESTAMP
                            WHERE id=%s""",
                        (iss.CORREGIDO, json.dumps(evidencia), iid))
            _historial(cur, iid, d['history'], 'corrected',
                       evidencias=len(evidencia),
                       comentario=(data.get('comentario') or '').strip() or None)
            # LA PELOTA PASA A QUIEN VERIFICA. El responsable ya hizo lo suyo.
            _cerrar_pelota(cur, iid)
            # AL VERIFICADOR DESIGNADO, no al detector. Si no hay ninguno, el
            # issue queda SIN deuda y visible en la lista de los que necesitan
            # que alguien la asigne: es preferible una deuda visible a una
            # responsabilidad adjudicada sola.
            try:
                if d['verificador_id']:
                    eid = _enc.abrir(cur, 'ISSUE', iid,
                                     'Verificar la corrección de %s: %s'
                                     % (d['codigo'], d['titulo']),
                                     destino_usuario=d['verificador_id'],
                                     vence_en=d['vence_en'], creado_por=_actor())
                    if eid:
                        _enc.avisar(cur, eid)
                else:
                    logger.warning('[issue %s] corregido y SIN verificador designado', iid)
            except Exception as e:
                logger.warning('[issue %s] sin encargo de verificacion: %s', iid, str(e)[:120])
            conn.commit()
            log_activity(d['model_urn'], 'CORRECT', 'ISSUE', str(iid), d['codigo'],
                         _actor(), {'evidencias': len(evidencia)})
            return jsonify(_leer(cur, iid))
    except Exception as e:
        logger.error('corregir issue %s: %s', iid, e)
        return jsonify({'error': 'No se pudo registrar la corrección.'}), 500


@issues_bp.route('/<int:iid>/verificar', methods=['POST'])
def verificar(iid):
    """QUIEN NO CORRIGIO comprueba la correccion y cierra. O la rechaza.

    LA INVARIANTE DEL OBJETO vive aqui y en la base. Sin ella, «verificado»
    significa «el responsable dice que ya esta», que es lo mismo que no
    verificar.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    acepta = bool(data.get('acepta', True))
    motivo_txt = (data.get('motivo') or '').strip()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            d = _leer(cur, iid)
            if not d:
                return jsonify({'error': 'No existe.'}), 404
            destino = iss.VERIFICADO if acepta else iss.REABIERTO
            ok, motivo = reg.transicion_valida(S, d['estado'], destino)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409

            admin = es_admin_de_obra(cur, _usuario(), d['project_id'])
            puede, por_que = iss.puede_verificar(_usuario(), d, admin)
            if not puede:
                return jsonify({'error': por_que.capitalize() + '.',
                                'code': 'NO_PUEDE_VERIFICAR'}), 403

            if not acepta and not motivo_txt:
                return jsonify({'error': 'Rechazar exige un motivo: sin él, el '
                                         'responsable no sabe qué volver a hacer.',
                                'code': 'SIN_MOTIVO'}), 400

            if acepta:
                cur.execute("""UPDATE doc_issues
                                  SET estado=%s, verificado_por=%s,
                                      verificado_en=CURRENT_TIMESTAMP,
                                      cerrado_en=CURRENT_TIMESTAMP
                                WHERE id=%s""",
                            (iss.VERIFICADO, _usuario().get('id'), iid))
                _historial(cur, iid, d['history'], 'verified',
                           comentario=motivo_txt or None,
                           autoverificacion=d['autoverificacion'] or None)
                _cerrar_pelota(cur, iid)
            else:
                cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s',
                            (iss.REABIERTO, iid))
                _historial(cur, iid, d['history'], 'reopened', motivo=motivo_txt)
                _cerrar_pelota(cur, iid)
                _abrir_pelota(cur, iid, d,
                              'Volver a corregir %s: %s' % (d['codigo'], d['titulo']))
            conn.commit()
            log_activity(d['model_urn'], 'VERIFY' if acepta else 'REOPEN', 'ISSUE',
                         str(iid), d['codigo'], _actor(), {'motivo': motivo_txt or None})
            return jsonify(_leer(cur, iid))
    except Exception as e:
        logger.error('verificar issue %s: %s', iid, e)
        return jsonify({'error': 'No se pudo verificar.'}), 500


@issues_bp.route('/<int:iid>/anular', methods=['POST'])
def anular(iid):
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    motivo_txt = ((request.get_json(silent=True) or {}).get('motivo') or '').strip()
    if not motivo_txt:
        return jsonify({'error': 'Anular exige un motivo.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        ok, motivo = reg.transicion_valida(S, d['estado'], iss.ANULADO)
        if not ok:
            return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
        obj = {'created_by': d['created_by'], 'responsable_id': d['responsable_id'],
               'project_id': d['project_id']}
        if not reg.puede_cerrar(S, _usuario(), obj, cur):
            return jsonify({'error': S.msg_no_cierra, 'code': 'NO_AUTOR'}), 403
        cur.execute("""UPDATE doc_issues SET estado=%s, cerrado_en=CURRENT_TIMESTAMP
                        WHERE id=%s""", (iss.ANULADO, iid))
        _historial(cur, iid, d['history'], 'voided', motivo=motivo_txt)
        _cerrar_pelota(cur, iid)
        conn.commit()
        log_activity(d['model_urn'], 'VOID', 'ISSUE', str(iid), d['codigo'],
                     _actor(), {'motivo': motivo_txt})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/autoverificacion', methods=['POST'])
def permitir_autoverificacion(iid):
    """LA EXCEPCION, y solo un ADMINISTRADOR DE OBRA la concede.

    Con motivo obligatorio y en el historial. Una excepcion que se puede leer es
    gobierno; una que se concede en silencio es un agujero. El propio
    responsable NO puede concedersela.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    motivo_txt = ((request.get_json(silent=True) or {}).get('motivo') or '').strip()
    if not motivo_txt:
        return jsonify({'error': 'Autorizar la autoverificación exige un motivo '
                                 'escrito: queda en el expediente.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        corte = guardia_administrativa(cur, _usuario(), d['project_id'],
                                       'autorizar la autoverificación')
        if corte:
            return corte
        if _usuario().get('id') == d['responsable_id']:
            return jsonify({'error': 'El responsable no puede autorizarse a sí mismo '
                                     'a verificar su propia corrección.',
                            'code': 'NO_SE_AUTOAUTORIZA'}), 403
        cur.execute("""UPDATE doc_issues
                          SET autoverificacion=TRUE, autoverificacion_motivo=%s,
                              autoverificacion_por=%s
                        WHERE id=%s""", (motivo_txt, _usuario().get('id'), iid))
        _historial(cur, iid, d['history'], 'self_verification_allowed', motivo=motivo_txt)
        conn.commit()
        log_activity(d['model_urn'], 'SELF_VERIFY_ALLOWED', 'ISSUE', str(iid),
                     d['codigo'], _actor(), {'motivo': motivo_txt})
        return jsonify(_leer(cur, iid))
