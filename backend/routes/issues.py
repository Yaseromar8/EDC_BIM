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
propia ruta y su propia autoridad: `corregir`, `verificar`, `reabrir`, `anular`
y, desde la 45, `enviar` (el borrador), `empezar`, `disputar` y `reafirmar`.
Un `PATCH estado` habria dejado el ciclo en manos de quien llame.
"""
import datetime
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
         'verificado_en, cerrado_en, '
         # 45: a quién (empresa), quién sigue, con qué y cómo se clasifica.
         'responsable_empresa, observadores, adjuntos, subtipo, causa_raiz, campos')


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
    # Las de la 45 al final; una fila de antes (o de una prueba) puede no traerlas.
    empresa, observadores, adjuntos, subtipo, causa, campos = (list(r[28:34]) + [None] * 6)[:6]
    fila_deudor = (r[0], r[3], r[5], r[15], r[10], r[11], r[12], r[16], empresa)
    a_quien, _asunto, _v = _enc.deudor_de_issue(None, fila_deudor)
    a_empresa, _asunto, _v = _enc.empresa_deudora_de_issue(fila_deudor)
    return {
        'a_quien_le_toca': a_quien,
        'a_quien_le_toca_empresa': a_empresa,
        'responsable_empresa': empresa,
        'observadores': list(observadores or []),
        'adjuntos': adjuntos or [],
        'subtipo': subtipo, 'causa_raiz': causa, 'campos': campos or {},
        'estado_etiqueta': iss.etiqueta_estado(r[15]),
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


def _leer(cur, iid, bloquear=False):
    """La incidencia. Con `bloquear`, la fila queda bloqueada hasta el commit (`FOR UPDATE`): toda ruta que ESCRIBE la
    lee así, y dos actos a la vez sobre la misma incidencia (o sus nubes) se turnan en vez de pisarse (docs/archivos/25,
    fase 1). El segundo ve lo que dejó el primero y, si ya no puede, recibe su 409."""
    cur.execute('SELECT %s FROM doc_issues WHERE id = %%s%s' % (_COLS, ' FOR UPDATE' if bloquear else ''), (iid,))
    r = cur.fetchone()
    d = _fila(r) if r else None
    # Un borrador descartado ya no existe para nadie: ni se lee ni admite actos.
    if not d or iss.es_descartada(d.get('history')):
        return None
    # Qué adjuntos puede quitar QUIEN MIRA, con la misma regla que la ruta que los quita: la pantalla no la repite.
    try:
        d['adjuntos_que_puedo_quitar'] = [a['documento'] for a in (d.get('adjuntos') or [])
                                          if isinstance(a, dict) and a.get('documento')
                                          and _puede_quitar_adjunto(a, d)]
    except Exception:
        d['adjuntos_que_puedo_quitar'] = []      # sin sesión (fuera de una petición): ninguno
    return d


def _puede_quitar_adjunto(adjunto, issue):
    """Quita una foto o un documento quien lo añadió, mientras la incidencia no esté cerrada; y queda en el
    historial quién y cuándo («detached»). Por su id (`por_id`); los que se añadieron AL LEVANTARLA antes del
    5-nov-2026 solo guardaban `por` (el correo o el nombre), y por eso nadie podía quitarlos: valen igual."""
    if iss.esta_cerrado(issue.get('estado')):
        return False
    yo = _usuario().get('id')
    if adjunto.get('por_id') is not None:
        return yo is not None and str(adjunto['por_id']) == str(yo)
    return bool(adjunto.get('por')) and adjunto.get('por') == _actor()


def _historial(cur, iid, history, evento, **datos):
    """Añade un evento al historial EN LA BASE (`history || evento`): no reescribe la lista que se leyó, así que un
    acto no borra el evento que otro dejó entre medias. Devuelve lo leído más el evento."""
    entrada = reg.entrada(evento, _actor(), **datos)
    cur.execute("""UPDATE doc_issues SET history = COALESCE(history, '[]'::jsonb) || %s::jsonb WHERE id = %s""",
                (json.dumps([entrada]), iid))
    return list(history or []) + [entrada]


def _abrir_pelota(cur, iid, issue, asunto):
    """La pelota va a quien tiene que ACTUAR AHORA. Nunca revienta el acto.

    Asignado a una EMPRESA (45), el encargo va a la empresa: lo ve en «Mi Trabajo»
    cualquiera de ella que sea de la obra, y les llega el aviso a todos.
    """
    try:
        uid = issue.get('responsable_id')
        empresa = None if uid else issue.get('responsable_empresa')
        if not uid and not empresa:
            return
        eid = _enc.abrir(cur, 'ISSUE', iid, asunto, destino_usuario=uid, destino_empresa=empresa,
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


def _apagado(cur, d, estado):
    """(cuerpo, 409) si la obra de este issue no usa ese estado opcional."""
    if iss.opcional_apagado(estado, iss.opcionales_de_obra(cur, d['project_id'])):
        return jsonify({'error': 'Esta obra no usa el estado «%s».' % iss.etiqueta_estado(estado),
                        'code': 'ESTADO_APAGADO'}), 409
    return None


def _es_autor(d):
    uid = _usuario().get('id')
    return bool(uid) and uid == d.get('autor_id')


def _empresa_de(cur, uid):
    if not uid:
        return None
    cur.execute('SELECT company_id FROM users WHERE id = %s', (uid,))
    f = cur.fetchone()
    return f[0] if f else None


def _mi_empresa_si_hace_falta(cur, d):
    """La empresa de quien actúa, solo si el issue está asignado a una empresa (45)."""
    if d.get('responsable_id') or not d.get('responsable_empresa'):
        return None
    return _empresa_de(cur, _usuario().get('id'))


def _avisar_observadores(cur, d, que):
    """Los OBSERVADORES (45) reciben aviso de cada paso, sin deber nada. Nunca revienta el acto."""
    try:
        ids = [u for u in (d.get('observadores') or []) if u != _usuario().get('id')]
        if not ids or d.get('estado') == iss.BORRADOR:
            return 0
        cur.execute('SELECT email FROM users WHERE id = ANY(%s) AND is_active', (ids,))
        correos = [f[0] for f in cur.fetchall() if f[0]]
        import mailer
        enviados = 0
        for correo in correos:
            ok, _det = mailer.enviar(correo, 'Novedad en %s' % d.get('codigo'), 'Sigues esta incidencia',
                                     '%s · %s\n\n%s' % (d.get('codigo'), d.get('titulo') or '', que),
                                     texto_boton='Ver la incidencia')
            enviados += 1 if ok else 0
        return enviados
    except Exception as e:
        logger.warning('[issue %s] sin aviso a observadores: %s', d.get('id'), str(e)[:120])
        return 0


def _documentos_de_la_obra(cur, obra, ids):
    """{id: nombre} de los documentos de Docs que son de ESTA obra. Un adjunto de otra obra no entra."""
    import uuid as _uuid
    validos = []
    for x in ids:
        try:
            validos.append(str(_uuid.UUID(str(x))))
        except (ValueError, TypeError):
            return None
    if not validos:
        return {}
    cur.execute('SELECT id::text, name, model_urn FROM file_nodes WHERE id = ANY(%s::uuid[]) AND NOT is_deleted',
                (validos,))
    return {f[0]: f[1] for f in cur.fetchall() if resolve_project_id(f[2]) == obra}


def datos_de_la_45(cur, obra, tipo, data, responsable, verificador, borrador=False, config=None):
    """Valida lo que trae la 45 al levantar una incidencia. ({columnas}, None) o (None, respuesta).

    Lo usan el alta de aquí y la observación del plano (routes/pdf_tools.py): una sola regla.
    """
    empresa = data.get('responsable_empresa')
    if empresa not in (None, ''):
        try:
            empresa = int(empresa)
        except (TypeError, ValueError):
            return None, (jsonify({'error': 'Empresa no válida.'}), 400)
        if responsable:
            return None, (jsonify({'error': 'Una incidencia se asigna a una persona o a una empresa, no a las dos.',
                                   'code': 'UN_SOLO_RESPONSABLE'}), 400)
        cur.execute('SELECT 1 FROM project_companies WHERE project_id = %s AND company_id = %s', (obra, empresa))
        if not cur.fetchone():
            return None, (jsonify({'error': 'Esa empresa no participa en esta obra.',
                                   'code': 'EMPRESA_NO_PARTICIPA'}), 409)
        if verificador and _empresa_de(cur, int(verificador)) == empresa:
            return None, (jsonify({'error': 'Quien verifica no puede ser de la empresa que corrige.',
                                   'code': 'VERIFICADOR_ES_RESPONSABLE'}), 409)
    else:
        empresa = None
    try:
        observadores = sorted({int(x) for x in (data.get('observadores') or [])})[:50]
    except (TypeError, ValueError):
        return None, (jsonify({'error': 'Observadores no válidos.'}), 400)
    if observadores:
        cur.execute('SELECT user_id FROM project_users WHERE project_id = %s AND user_id = ANY(%s)',
                    (obra, observadores))
        if len({f[0] for f in cur.fetchall()}) != len(observadores):
            return None, (jsonify({'error': 'Algún observador no es miembro de esta obra.',
                                   'code': 'OBSERVADOR_NO_MIEMBRO'}), 409)
    adjuntos = []
    pedidos = data.get('adjuntos') or []
    if pedidos:
        ids = [a.get('documento') if isinstance(a, dict) else a for a in pedidos][:30]
        nombres = _documentos_de_la_obra(cur, obra, ids)
        if nombres is None or len(nombres) != len(set(map(str, ids))):
            return None, (jsonify({'error': 'Algún adjunto no es un documento de esta obra.',
                                   'code': 'ADJUNTO_AJENO'}), 400)
        # Con `por_id`, como al añadirlo después: sin él, quien lo subió al levantarla no podía quitarlo (5-nov-2026).
        adjuntos = [{'documento': i, 'nombre': nombres[i], 'por': _actor(), 'por_id': _usuario().get('id')}
                    for i in dict.fromkeys(map(str, ids))]
    config = config if config is not None else iss.config_de_obra(cur, obra)
    subtipo = (str(data.get('subtipo') or '').strip()[:80]) or None
    lista = (config.get('subtipos') or {}).get(tipo) or []
    if subtipo and lista and subtipo not in lista:
        return None, (jsonify({'error': 'Ese subtipo no es de esta obra.', 'code': 'SUBTIPO_DESCONOCIDO'}), 400)
    causa = (str(data.get('causa_raiz') or '').strip()[:120]) or None
    if causa and config.get('causas') and causa not in config['causas']:
        return None, (jsonify({'error': 'Esa causa raíz no es de esta obra.', 'code': 'CAUSA_DESCONOCIDA'}), 400)
    campos, motivo = iss.valores_validos(config.get('campos'), data.get('campos'), exigir_obligatorios=not borrador,
                                         tipo=tipo)
    if motivo:
        return None, (jsonify({'error': motivo, 'code': 'CAMPO_NO_VALIDO'}), 400)
    return {'responsable_empresa': empresa, 'observadores': observadores, 'adjuntos': adjuntos,
            'subtipo': subtipo, 'causa_raiz': causa, 'campos': campos}, None


def guardar_datos_de_la_45(cur, iid, datos):
    """Escribe lo de la 45 en el issue recién insertado (solo si trae algo)."""
    if not datos or not any(datos.values()):
        return
    cur.execute("""UPDATE doc_issues SET responsable_empresa = %s, observadores = %s, adjuntos = %s,
                          subtipo = %s, causa_raiz = %s, campos = %s WHERE id = %s""",
                (datos['responsable_empresa'], datos['observadores'], json.dumps(datos['adjuntos']),
                 datos['subtipo'], datos['causa_raiz'], json.dumps(datos['campos']), iid))


def _falta_para_enviar(tipo, responsable, verificador, revision_id):
    """Lo que un issue de ese tipo no puede dejar de llevar al ENVIARSE. (cuerpo, código) o None.

    Un borrador puede guardarse sin esto (como el «Draft» de ACC); enviarlo no.
    """
    # `responsable`: la persona o, desde la 45, la empresa.
    if tipo in iss.EXIGEN_RESPONSABLE and not responsable:
        return jsonify({'error': 'Un %s sin responsable es un defecto que nadie va '
                                 'a corregir.' % iss.etiqueta_tipo(tipo),
                        'code': 'SIN_RESPONSABLE'}), 409
    if tipo in iss.EXIGEN_VERIFICADOR and not verificador:
        return jsonify({'error': 'Un %s exige un verificador designado: registra uno, '
                                 'corrige otro y aprueba el cierre un tercero. Sin '
                                 'designarlo, el cierre acabaria recayendo en quien '
                                 'detecto el defecto.' % iss.etiqueta_tipo(tipo),
                        'code': 'SIN_VERIFICADOR'}), 409
    if tipo in iss.EXIGEN_UBICACION and not revision_id:
        return jsonify({'error': 'Un punch se levanta sobre una lámina concreta: '
                                 'sin decir dónde, nadie puede ir a corregirlo.',
                        'code': 'SIN_UBICACION'}), 409
    return None


# ── CATALOGO ───────────────────────────────────────────────────────────────

@issues_bp.route('/catalogo', methods=['GET'])
def catalogo():
    return jsonify({
        'tipos': [{'codigo': c, 'etiqueta': e,
                   'exige_responsable': c in iss.EXIGEN_RESPONSABLE,
                   'exige_ubicacion': c in iss.EXIGEN_UBICACION,
                   'exige_verificador': c in iss.EXIGEN_VERIFICADOR,
                   # La observación de documento nace de una marca del lector (37).
                   'solo_desde_marca': c == iss.OBSERVACION}
                  for c, e in iss.TIPOS],
        'estados': list(iss.ESTADOS),
        'vivos': list(iss.VIVOS),
        # (45) Lo que se lee en pantalla, los de ACC; y los opcionales (GET /estados).
        'etiquetas': dict(iss.ETIQUETAS),
        'opcionales': list(iss.OPCIONALES),
    })


@issues_bp.route('/configuracion', methods=['GET', 'PUT'])
def configuracion_de_la_obra():
    """Lo que una obra decide de sus incidencias (45), como el administrador de ACC.

    Los estados opcionales que usa, los subtipos de cada tipo, su lista de causas
    raíz y sus campos propios. Leerlo, cualquiera de la obra; cambiarlo, solo su
    administrador, y solo lo que mande (el resto se queda). Apagar un estado NO
    toca los issues que ya están en él: siguen su ciclo hasta cerrarse; lo que
    deja de ofrecerse es entrar en él.
    """
    data = (request.get_json(silent=True) or {}) if request.method == 'PUT' else {}
    obra = resolve_project_id(data.get('model_urn') or request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'configurar las incidencias')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        if request.method == 'PUT':
            corte = guardia_administrativa(cur, _usuario(), obra, 'configurar las incidencias')
            if corte:
                return corte
            actual = iss.config_de_obra(cur, obra)
            if 'opcionales' in data:
                pedidos = data.get('opcionales')
                if not isinstance(pedidos, list) or any(e not in iss.OPCIONALES for e in pedidos):
                    return jsonify({'error': 'Solo se pueden encender o apagar: %s.'
                                             % ', '.join(iss.OPCIONALES)}), 400
                actual['opcionales'] = [e for e in iss.OPCIONALES if e in pedidos]
            if 'subtipos' in data:
                pedidos = data.get('subtipos')
                if not isinstance(pedidos, dict) or any(t not in iss.CODIGOS_TIPO for t in pedidos):
                    return jsonify({'error': 'Los subtipos van por tipo de incidencia.'}), 400
                actual['subtipos'] = {t: list(dict.fromkeys(str(x).strip()[:80] for x in (v or []) if str(x).strip()))[:50]
                                      for t, v in pedidos.items()}
            if 'causas' in data:
                pedidos = data.get('causas')
                if not isinstance(pedidos, list):
                    return jsonify({'error': 'Las causas raíz son una lista.'}), 400
                actual['causas'] = list(dict.fromkeys(str(x).strip()[:120] for x in pedidos if str(x).strip()))[:50]
            if 'campos' in data:
                campos, motivo = iss.definiciones_validas(data.get('campos'))
                if motivo:
                    return jsonify({'error': motivo}), 400
                actual['campos'] = campos
            cur.execute("""INSERT INTO issue_config_de_obra
                                  (project_id, opcionales, subtipos, causas, campos, actualizado_por)
                           VALUES (%s, %s, %s, %s, %s, %s)
                           ON CONFLICT (project_id) DO UPDATE
                              SET opcionales = EXCLUDED.opcionales, subtipos = EXCLUDED.subtipos,
                                  causas = EXCLUDED.causas, campos = EXCLUDED.campos,
                                  actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()""",
                        (obra, actual['opcionales'], json.dumps(actual['subtipos']), json.dumps(actual['causas']),
                         json.dumps(actual['campos']), _usuario().get('id')))
            conn.commit()
            log_activity(data.get('model_urn'), 'CONFIGURE', 'ISSUE_CONFIG', str(obra), '', _actor(),
                         {k: k in data for k in ('opcionales', 'subtipos', 'causas', 'campos')})
        return jsonify({**iss.config_de_obra(cur, obra), 'admin': es_admin_de_obra(cur, _usuario(), obra)})


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
            # Un BORRADOR (45) solo lo ve quien lo levantó: todavía no se envió a nadie.
            yo = _usuario().get('id')
            cur.execute(('SELECT %s FROM doc_issues WHERE project_id = %%s '
                         '   AND (%%s IS NULL OR tipo = %%s) '
                         '   AND (%%s IS NULL OR estado = %%s) '
                         "   AND (estado <> 'Borrador' OR autor_id = %%s) AND " + iss.SQL_NO_DESCARTADA + " "
                         ' ORDER BY codigo DESC') % _COLS,
                        (obra, tipo, tipo, estado, estado, yo))
            filas = [_fila(r) for r in cur.fetchall()]
            cur.execute("""SELECT tipo, estado, count(*) FROM doc_issues
                            WHERE project_id = %s AND (estado <> 'Borrador' OR autor_id = %s) AND """
                        + iss.SQL_NO_DESCARTADA + """
                            GROUP BY tipo, estado""", (obra, yo))
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
    if d and d['estado'] == iss.BORRADOR and not _es_autor(d):
        d = None                     # el borrador es de quien lo levanta (45)
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
    if tipo == iss.OBSERVACION:
        # Nace de una MARCA del lector (POST /api/pdf/markups/<id>/observacion), que
        # fija el documento, la versión y la hoja. Sin ese ancla no se sabría qué corregir.
        return jsonify({'error': 'Una observación de documento se levanta desde una marca '
                                 'del lector de documentos.',
                        'code': 'OBSERVACION_DESDE_MARCA'}), 409
    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'error': 'El título es obligatorio.'}), 400

    responsable = data.get('responsable_id')
    verificador = data.get('verificador_id')
    revision_id = data.get('revision_id')
    # BORRADOR (45): se guarda sin enviarlo a nadie, como el «Draft» de ACC. Lo
    # que el tipo exige se pide al ENVIARLO, no al guardarlo.
    borrador = bool(data.get('borrador'))
    if not borrador:
        falta = _falta_para_enviar(tipo, responsable or data.get('responsable_empresa'), verificador, revision_id)
        if falta:
            return falta
    if verificador and responsable and int(verificador) == int(responsable):
        return jsonify({'error': 'El verificador no puede ser el mismo que corrige. '
                                 'La autoverificacion existe, pero se autoriza aparte '
                                 'y con motivo escrito.',
                        'code': 'VERIFICADOR_ES_RESPONSABLE'}), 409

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            config = iss.config_de_obra(cur, obra)
            if borrador and iss.opcional_apagado(iss.BORRADOR, config['opcionales']):
                return jsonify({'error': 'Esta obra no usa borradores.',
                                'code': 'ESTADO_APAGADO'}), 409
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
            datos, error = datos_de_la_45(cur, obra, tipo, data, responsable, verificador, borrador, config)
            if error:
                return error

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
                    if borrador:
                        cur.execute('UPDATE doc_issues SET estado = %s WHERE id = %s',
                                    (iss.BORRADOR, iid))
                    guardar_datos_de_la_45(cur, iid, datos)
                    # Sus nubes nacen con ella, numeradas en el orden de su evidencia (47): no hay nubes virtuales.
                    _alm.crear_filas_de_la_incidencia(cur, {
                        'id': iid, 'model_urn': data.get('model_urn') or obra,
                        'evidencia': data.get('evidencia') or [],
                        'origen_tipo': data.get('origen_tipo'), 'origen_id': data.get('origen_id')},
                        creado_por=_usuario().get('id'))
                    cur.execute('RELEASE SAVEPOINT alta_issue')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_issue')
                    if intento == 4:
                        raise
            conn.commit()
            d = _leer(cur, iid)
            if not borrador:         # un borrador no le debe nada a nadie todavía
                _abrir_pelota(cur, iid, d, 'Corregir %s: %s' % (codigo, titulo))
            conn.commit()
            log_activity(data.get('model_urn'), 'CREATE', 'ISSUE', str(iid), codigo,
                         _actor(), {'tipo': tipo, 'responsable': responsable,
                                    'borrador': borrador or None})
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
            d = _leer(cur, iid, bloquear=True)
            if not d:
                return jsonify({'error': 'No existe.'}), 404
            ok, motivo = reg.transicion_valida(S, d['estado'], iss.CORREGIDO)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
            if not iss.puede_corregir(_usuario(), d, _mi_empresa_si_hace_falta(cur, d)):
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
            _avisar_observadores(cur, d, 'Declarada corregida: pasa a revisión.')
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
            d = _leer(cur, iid, bloquear=True)
            if not d:
                return jsonify({'error': 'No existe.'}), 404
            destino = iss.VERIFICADO if acepta else iss.REABIERTO
            ok, motivo = reg.transicion_valida(S, d['estado'], destino)
            if not ok:
                return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409

            admin = es_admin_de_obra(cur, _usuario(), d['project_id'])
            puede, por_que = iss.puede_verificar(_usuario(), d, admin, _mi_empresa_si_hace_falta(cur, d))
            if not puede:
                return jsonify({'error': por_que.capitalize() + '.',
                                'code': 'NO_PUEDE_VERIFICAR'}), 403

            # Con nubes (46), la incidencia se da por verificada solo si TODAS sus nubes de observación quedaron
            # levantadas en la versión nueva: el revisor las juzga una a una (docs/archivos/24, D8). Desde la 47 toda
            # nube tiene su fila desde el alta (también las de antes, que la migración creó), así que la regla es una
            # sola, sin excepciones.
            if acepta:
                pendientes = len(_nub.observaciones_sin_levantar(_nubes_de(cur, d)))
                if pendientes:
                    return jsonify({'error': ('Falta 1 nube por dar como levantada' if pendientes == 1 else
                                              'Faltan %d nubes por dar como levantadas' % pendientes)
                                             + ': verifícalas una a una en la pestaña Nubes.',
                                    'code': 'NUBES_SIN_LEVANTAR'}), 409

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
                _alm.sincronizar_pelotas(cur, _leer(cur, iid), actor=_actor())   # cerrada: nadie debe nada
            else:
                cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s',
                            (iss.REABIERTO, iid))
                _historial(cur, iid, d['history'], 'reopened', motivo=motivo_txt)
                _cerrar_pelota(cur, iid)
                _abrir_pelota(cur, iid, d,
                              'Volver a corregir %s: %s' % (d['codigo'], d['titulo']))
            conn.commit()
            _avisar_observadores(cur, d, 'Verificada y cerrada.' if acepta
                                 else 'No aprobada: vuelve al responsable.')
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
        d = _leer(cur, iid, bloquear=True)
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
        _alm.sincronizar_pelotas(cur, _leer(cur, iid), actor=_actor())       # anulada: nadie debe nada en sus nubes
        conn.commit()
        _avisar_observadores(cur, d, 'Anulada.')
        log_activity(d['model_urn'], 'VOID', 'ISSUE', str(iid), d['codigo'],
                     _actor(), {'motivo': motivo_txt})
        return jsonify(_leer(cur, iid))


# ── LOS ACTOS DE LA 45: los estados de ACC, cada uno con quien lo mueve ─────

def _publicar_marcas_del_borrador(cur, d):
    """Al enviar una observación de documento, se publican las marcas propias que lleva.

    Mientras era borrador las marcas seguían siendo borradores de su autor: nadie
    más tenía que verlas. Envía quien la levantó, y las marcas guardan su NOMBRE
    (`pdf_markups.created_by`), no su correo.
    """
    if d['tipo'] != iss.OBSERVACION:
        return []
    marcas = [e.get('marca') for e in (d['evidencia'] or [])
              if isinstance(e, dict) and e.get('marca') is not None]
    if d['origen_tipo'] == 'MARCA' and d['origen_id']:
        marcas.append(d['origen_id'])
    ids = sorted({int(m) for m in marcas if str(m).isdigit()})
    if not ids:
        return []
    cur.execute("""UPDATE pdf_markups SET publicado = TRUE, publicado_en = CURRENT_TIMESTAMP,
                          publicado_por = %s
                    WHERE id = ANY(%s) AND created_by = %s AND NOT publicado
                RETURNING id""", (_usuario().get('id'), ids, _usuario().get('name') or ''))
    return [r[0] for r in cur.fetchall()]


@issues_bp.route('/<int:iid>/enviar', methods=['POST'])
def enviar(iid):
    """Quien la levantó ENVÍA el borrador: desde ahora le toca al responsable."""
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d or (d['estado'] == iss.BORRADOR and not _es_autor(d)):
            return jsonify({'error': 'No existe.'}), 404
        if d['estado'] != iss.BORRADOR:
            return jsonify({'error': 'Solo se envía un borrador.',
                            'code': 'TRANSICION_INVALIDA'}), 409
        falta = _falta_para_enviar(d['tipo'], d['responsable_id'] or d['responsable_empresa'], d['verificador_id'],
                                   d['revision_id'])
        if falta:
            return falta
        cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s', (iss.ABIERTO, iid))
        _historial(cur, iid, d['history'], 'sent')
        publicadas = _publicar_marcas_del_borrador(cur, d)
        _abrir_pelota(cur, iid, d, 'Corregir %s: %s' % (d['codigo'], d['titulo']))
        conn.commit()
        _avisar_observadores(cur, {**d, 'estado': iss.ABIERTO}, 'Enviada al responsable.')
        log_activity(d['model_urn'], 'SEND', 'ISSUE', str(iid), d['codigo'], _actor(),
                     {'marcas_publicadas': publicadas or None})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/descartar', methods=['POST'])
def descartar(iid):
    """Quien la levantó DESCARTA su borrador: desaparece para todos, como el «eliminar borrador» de ACC (2-nov-2026,
    decisión del dueño).

    Un borrador nunca llegó a nadie: solo lo ve su autor, no abrió encargo ni avisó a observadores. Anularlo lo dejaba
    «Anulada» a la vista de TODA la obra. Ahora pasa a «Anulado» con el evento `discarded`, y ninguna lectura lo
    devuelve (`iss.SQL_NO_DESCARTADA`). La fila se queda: la aplicación no puede borrar en doc_issues (migración 26) y
    así debe seguir. Lo enviado no se descarta nunca: se anula, con su motivo, en el expediente.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d or (d['estado'] == iss.BORRADOR and not _es_autor(d)):
            return jsonify({'error': 'No existe.'}), 404
        if d['estado'] != iss.BORRADOR:
            return jsonify({'error': 'Solo se descarta un borrador: lo enviado se anula, con su motivo.',
                            'code': 'TRANSICION_INVALIDA'}), 409
        # Sin encargos que cerrar: un borrador no abre ninguno (`_abrir_pelota` va al enviarlo).
        cur.execute('UPDATE doc_issues SET estado = %s, cerrado_en = CURRENT_TIMESTAMP WHERE id = %s AND estado = %s',
                    (iss.ANULADO, iid, iss.BORRADOR))
        _historial(cur, iid, d['history'], iss.EVENTO_DESCARTADA)
        conn.commit()
        log_activity(d['model_urn'], 'DISCARD', 'ISSUE', str(iid), d['codigo'], _actor(), {'titulo': d['titulo']})
        return jsonify({'success': True, 'descartada': iid})


@issues_bp.route('/<int:iid>/empezar', methods=['POST'])
def empezar(iid):
    """El RESPONSABLE dice que ya la está corrigiendo (ACC: In progress).

    No mueve la pelota --sigue siendo suya--; le dice a quien la levantó que
    alguien ya está en ello.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        ok, motivo = reg.transicion_valida(S, d['estado'], iss.EN_CURSO)
        if not ok:
            return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
        if not iss.puede_corregir(_usuario(), d, _mi_empresa_si_hace_falta(cur, d)):
            return jsonify({'error': 'Solo el responsable dice que la está corrigiendo.',
                            'code': 'NO_RESPONSABLE'}), 403
        corte = _apagado(cur, d, iss.EN_CURSO)
        if corte:
            return corte
        cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s', (iss.EN_CURSO, iid))
        _historial(cur, iid, d['history'], 'started')
        conn.commit()
        _avisar_observadores(cur, d, 'El responsable empezó a corregirla.')
        log_activity(d['model_urn'], 'START', 'ISSUE', str(iid), d['codigo'], _actor(), {})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/disputar', methods=['POST'])
def disputar(iid):
    """El RESPONSABLE dice que NO PROCEDE, con motivo (ACC: In dispute).

    La pelota pasa a quien la levantó: él la reafirma o la anula. El responsable
    no puede cerrarla por su cuenta diciendo que no era un defecto.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    motivo_txt = ((request.get_json(silent=True) or {}).get('motivo') or '').strip()
    if not motivo_txt:
        return jsonify({'error': 'Decir que no procede exige el motivo: quien la '
                                 'levantó decide con él.', 'code': 'SIN_MOTIVO'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        ok, motivo = reg.transicion_valida(S, d['estado'], iss.EN_DISPUTA)
        if not ok:
            return jsonify({'error': motivo, 'code': 'TRANSICION_INVALIDA'}), 409
        if not iss.puede_corregir(_usuario(), d, _mi_empresa_si_hace_falta(cur, d)):
            return jsonify({'error': 'Solo el responsable puede decir que no procede.',
                            'code': 'NO_RESPONSABLE'}), 403
        corte = _apagado(cur, d, iss.EN_DISPUTA)
        if corte:
            return corte
        cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s', (iss.EN_DISPUTA, iid))
        _historial(cur, iid, d['history'], 'disputed', motivo=motivo_txt)
        _cerrar_pelota(cur, iid)
        try:
            if d['autor_id']:
                eid = _enc.abrir(cur, 'ISSUE', iid,
                                 'Resolver la disputa de %s: %s' % (d['codigo'], d['titulo']),
                                 destino_usuario=d['autor_id'], vence_en=d['vence_en'],
                                 creado_por=_actor())
                if eid:
                    _enc.avisar(cur, eid)
        except Exception as e:
            logger.warning('[issue %s] sin encargo de disputa: %s', iid, str(e)[:120])
        conn.commit()
        _avisar_observadores(cur, d, 'El responsable dice que no procede.')
        log_activity(d['model_urn'], 'DISPUTE', 'ISSUE', str(iid), d['codigo'], _actor(),
                     {'motivo': motivo_txt})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/reafirmar', methods=['POST'])
def reafirmar(iid):
    """Quien la levantó (o un administrador) dice que SÍ procede: vuelve al responsable.

    Con motivo, porque es la respuesta a la del responsable. Si no procede, el
    acto es `anular`.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    motivo_txt = ((request.get_json(silent=True) or {}).get('motivo') or '').strip()
    if not motivo_txt:
        return jsonify({'error': 'Reafirmar exige el motivo: es la respuesta al '
                                 'responsable.', 'code': 'SIN_MOTIVO'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        if d['estado'] != iss.EN_DISPUTA:
            return jsonify({'error': 'Solo se reafirma una incidencia en disputa.',
                            'code': 'TRANSICION_INVALIDA'}), 409
        obj = {'created_by': d['created_by'], 'responsable_id': d['responsable_id'],
               'project_id': d['project_id']}
        if not (_es_autor(d) or reg.puede_cerrar(S, _usuario(), obj, cur)):
            return jsonify({'error': 'La disputa la resuelve quien levantó la incidencia '
                                     'o un administrador de la obra.', 'code': 'NO_AUTOR'}), 403
        cur.execute('UPDATE doc_issues SET estado=%s WHERE id=%s', (iss.ABIERTO, iid))
        _historial(cur, iid, d['history'], 'reaffirmed', motivo=motivo_txt)
        _cerrar_pelota(cur, iid)
        _abrir_pelota(cur, iid, d, 'Corregir %s: %s' % (d['codigo'], d['titulo']))
        conn.commit()
        _avisar_observadores(cur, d, 'Reafirmada: vuelve al responsable.')
        log_activity(d['model_urn'], 'REAFFIRM', 'ISSUE', str(iid), d['codigo'], _actor(),
                     {'motivo': motivo_txt})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/editar', methods=['POST'])
def editar(iid):
    """Lo que se puede cambiar de una incidencia sin moverla de estado (45).

      responsable_id | responsable_empresa   REASIGNAR: quien la levantó o un administrador,
                                             mientras le toque al responsable (o sea borrador).
                                             La pelota se va con ella.
      observadores                           la lista entera: quien la levantó o un administrador.
      seguir: true | false                   cualquiera de la obra, para sí mismo.
      subtipo, causa_raiz, campos            quien la levantó, el responsable, quien verifica o
                                             un administrador. Cerrada, solo la causa raíz
                                             (es lo que se analiza después).
    Cada cambio queda en el historial.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    yo = _usuario().get('id')
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d or (d['estado'] == iss.BORRADOR and not _es_autor(d)):
            return jsonify({'error': 'No existe.'}), 404
        admin = es_admin_de_obra(cur, _usuario(), d['project_id'])
        obj = {'created_by': d['created_by'], 'responsable_id': d['responsable_id'], 'project_id': d['project_id']}
        dirige = _es_autor(d) or admin or reg.puede_pasar_la_pelota(S, _usuario(), obj, cur)
        cambios, sets, params = {}, [], []

        if 'responsable_id' in data or 'responsable_empresa' in data:
            if not dirige:
                return jsonify({'error': S.msg_no_reasigna, 'code': 'NO_AUTOR'}), 403
            if d['estado'] not in (iss.BORRADOR,) + iss.EN_MANOS_DEL_RESPONSABLE:
                return jsonify({'error': 'Solo se reasigna mientras le toca al responsable.',
                                'code': 'TRANSICION_INVALIDA'}), 409
            nuevo = data.get('responsable_id') or None
            if nuevo:
                cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s', (d['project_id'], int(nuevo)))
                if not cur.fetchone():
                    return jsonify({'error': 'El responsable no es miembro de esta obra.',
                                    'code': 'RESPONSABLE_NO_MIEMBRO'}), 409
                if d['verificador_id'] and int(nuevo) == d['verificador_id']:
                    return jsonify({'error': 'Quien corrige no puede ser quien verifica.',
                                    'code': 'VERIFICADOR_ES_RESPONSABLE'}), 409
            datos, error = datos_de_la_45(cur, d['project_id'], d['tipo'],
                                          {'responsable_empresa': None if nuevo else data.get('responsable_empresa')},
                                          nuevo, d['verificador_id'], borrador=True, config={})
            if error:
                return error
            if not nuevo and not datos['responsable_empresa'] and d['estado'] != iss.BORRADOR:
                return jsonify({'error': 'Una incidencia enviada necesita a quién reclamarle.',
                                'code': 'SIN_RESPONSABLE'}), 409
            sets += ['responsable_id = %s', 'responsable_empresa = %s']
            params += [int(nuevo) if nuevo else None, datos['responsable_empresa']]
            cambios['responsable'] = {'persona': int(nuevo) if nuevo else None, 'empresa': datos['responsable_empresa']}

        if 'observadores' in data:
            if not dirige:
                return jsonify({'error': 'La lista de observadores la lleva quien la levantó o un administrador.',
                                'code': 'NO_AUTOR'}), 403
            datos, error = datos_de_la_45(cur, d['project_id'], d['tipo'], {'observadores': data['observadores']},
                                          None, None, borrador=True, config={})
            if error:
                return error
            sets.append('observadores = %s')
            params.append(datos['observadores'])
            cambios['observadores'] = datos['observadores']
        elif 'seguir' in data:
            cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s', (d['project_id'], yo))
            if not cur.fetchone():
                return jsonify({'error': 'Solo sigue una incidencia quien es de la obra.'}), 403
            lista = [u for u in d['observadores'] if u != yo] + ([yo] if data.get('seguir') else [])
            sets.append('observadores = %s')
            params.append(sorted(set(lista)))
            cambios['seguir' if data.get('seguir') else 'dejar_de_seguir'] = yo

        clasificar = {k: data[k] for k in ('subtipo', 'causa_raiz', 'campos') if k in data}
        if clasificar:
            interviene = dirige or iss.es_del_responsable(_usuario(), d, _mi_empresa_si_hace_falta(cur, d)) \
                or yo == d['verificador_id']
            if not interviene:
                return jsonify({'error': 'La clasifican quien la levantó, el responsable, quien verifica o un '
                                         'administrador.', 'code': 'NO_INTERVIENE'}), 403
            if iss.esta_cerrado(d['estado']) and set(clasificar) - {'causa_raiz'}:
                return jsonify({'error': 'Cerrada, solo se puede apuntar la causa raíz.',
                                'code': 'CERRADA'}), 409
            completo = {'subtipo': d['subtipo'], 'causa_raiz': d['causa_raiz'], 'campos': d['campos'], **clasificar}
            # Los campos obligatorios se exigen al levantarla y al cambiar los campos; no para apuntar la causa
            # raíz o el subtipo de una que nació antes de que la obra los pidiera.
            datos, error = datos_de_la_45(cur, d['project_id'], d['tipo'], completo, None, None,
                                          borrador=d['estado'] == iss.BORRADOR or 'campos' not in clasificar)
            if error:
                return error
            for k in clasificar:
                sets.append('%s = %%s' % k)
                params.append(json.dumps(datos[k]) if k == 'campos' else datos[k])
                cambios[k] = datos[k]

        if not sets:
            return jsonify({'error': 'Nada que cambiar.'}), 400
        cur.execute('UPDATE doc_issues SET %s WHERE id = %%s' % ', '.join(sets), (*params, iid))
        _historial(cur, iid, d['history'], 'edited', cambios=cambios)
        avisos = []
        if 'responsable' in cambios and d['estado'] != iss.BORRADOR:
            _cerrar_pelota(cur, iid)
            _abrir_pelota(cur, iid, _leer(cur, iid), 'Corregir %s: %s' % (d['codigo'], d['titulo']))
            # Lo entregado en sus nubes lo revisa ahora el encargado nuevo.
            avisos = _alm.sincronizar_pelotas(cur, _leer(cur, iid), actor=_actor())
        conn.commit()
        _avisar_tras_el_commit(conn, cur, avisos)
        if 'responsable' in cambios:
            _avisar_observadores(cur, d, 'Reasignada.')
        log_activity(d['model_urn'], 'EDIT', 'ISSUE', str(iid), d['codigo'], _actor(),
                     {'campos': sorted(cambios)})
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/adjuntar', methods=['POST'])
def adjuntar(iid):
    """Fotos y documentos de la incidencia (45): documentos de Docs de la misma obra.

    {documento} lo añade; {quitar: documento} lo quita, y solo quien lo añadió.
    Añaden quien la levantó, el responsable, quien verifica y un administrador.
    Como mucho 30. Queda en el historial.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d or (d['estado'] == iss.BORRADOR and not _es_autor(d)):
            return jsonify({'error': 'No existe.'}), 404
        if iss.esta_cerrado(d['estado']):
            return jsonify({'error': 'Cerrada: sus adjuntos ya no cambian.', 'code': 'CERRADA'}), 409
        yo = _usuario().get('id')
        interviene = _es_autor(d) or yo == d['verificador_id'] \
            or iss.es_del_responsable(_usuario(), d, _mi_empresa_si_hace_falta(cur, d)) \
            or es_admin_de_obra(cur, _usuario(), d['project_id'])
        if not interviene:
            return jsonify({'error': 'Adjuntan quien la levantó, el responsable, quien verifica o un administrador.',
                            'code': 'NO_INTERVIENE'}), 403
        adjuntos = list(d['adjuntos'] or [])
        if data.get('quitar'):
            quitar = str(data['quitar'])
            antes = next((a for a in adjuntos if a.get('documento') == quitar), None)
            if not antes:
                return jsonify({'error': 'Ese adjunto no está.'}), 404
            if not _puede_quitar_adjunto(antes, d):
                return jsonify({'error': 'Solo lo quita quien lo añadió.', 'code': 'NO_AUTOR'}), 403
            adjuntos = [a for a in adjuntos if a.get('documento') != quitar]
            evento = ('detached', {'documento': quitar, 'nombre': antes.get('nombre')})
        else:
            if len(adjuntos) >= 30:
                return jsonify({'error': 'Como mucho 30 adjuntos por incidencia.'}), 400
            nombres = _documentos_de_la_obra(cur, d['project_id'], [data.get('documento')])
            if not nombres:
                return jsonify({'error': 'Ese documento no es de esta obra.', 'code': 'ADJUNTO_AJENO'}), 400
            doc = next(iter(nombres))
            if any(a.get('documento') == doc for a in adjuntos):
                return jsonify(_leer(cur, iid))
            adjuntos.append({'documento': doc, 'nombre': nombres[doc], 'por': _actor(), 'por_id': yo})
            evento = ('attached', {'documento': doc, 'nombre': nombres[doc]})
        cur.execute('UPDATE doc_issues SET adjuntos = %s WHERE id = %s', (json.dumps(adjuntos), iid))
        _historial(cur, iid, d['history'], evento[0], **evento[1])
        conn.commit()
        log_activity(d['model_urn'], 'ATTACH', 'ISSUE', str(iid), d['codigo'], _actor(), evento[1])
        return jsonify(_leer(cur, iid))


@issues_bp.route('/<int:iid>/comentar', methods=['POST'])
def comentar(iid):
    """Un comentario en el historial. SOLO SE AÑADE: nadie lo edita ni lo borra.

    Lo que se dijo sobre un defecto es parte de su expediente. Comentar no mueve
    el estado ni la pelota; lo puede hacer cualquiera con acceso a la obra.
    """
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    texto = ((request.get_json(silent=True) or {}).get('texto') or '').strip()
    if not texto:
        return jsonify({'error': 'Escribe un comentario.'}), 400
    if len(texto) > 2000:
        return jsonify({'error': 'Como mucho 2.000 caracteres por comentario.'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        d = _leer(cur, iid, bloquear=True)
        if not d:
            return jsonify({'error': 'No existe.'}), 404
        _historial(cur, iid, d['history'], 'commented', texto=texto)
        conn.commit()
        _avisar_observadores(cur, d, 'Comentario: %s' % texto[:300])
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
        d = _leer(cur, iid, bloquear=True)
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


# ══ LAS NUBES DE UNA INCIDENCIA (46, 3-nov-2026) ═════════════════════════════════════════════════════════════════
#
# Quién alimenta cada nube y si quedó levantada. Las reglas (papeles, actos, transiciones, quién debe, quién ve) están
# en `nubes_de_issue.py`; dónde se guardan, en `almacen_de_nubes.py`. Aquí se lee, se pregunta y se escribe.
# Diseño y normas: docs/archivos/23, 24 y 25.
#
# UNA SOLA RUTA, a propósito (el perfil portal vigila cuántas sirve): GET lee las nubes; POST hace un acto
# —crear · asignar · entregar · aceptar · devolver · verificar— sobre una nube.
#
# CADA ACTO BLOQUEA LA INCIDENCIA (47): dos personas sobre la misma nube se turnan y la segunda ve lo que dejó la
# primera. Lo que se debe en la nube se sincroniza en el mismo acto; los correos salen DESPUÉS del commit.

import almacen_de_nubes as _alm
import nubes_de_issue as _nub


def _nubes_de(cur, d):
    """Las nubes de la incidencia, por su número (47). Solo una marca de tipo nube es una nube: sus flechas, textos o
    recuadros acompañan a la incidencia pero no se asignan ni llevan estado (el dueño, 3-nov-2026)."""
    return _alm.de_la_incidencia(cur, d['id'])


def _avisar_tras_el_commit(conn, cur, encargos):
    """El correo de cada encargo abierto, ya guardado el acto: si el acto se hubiera deshecho, no habría correo."""
    for eid in encargos or []:
        _enc.avisar(cur, eid)
    if encargos:
        conn.commit()      # `avisado_en`


def _nombres(cur, nubes):
    """Los nombres de personas y empresas que aparecen, para la pantalla."""
    uids = sorted({u for n in nubes for u in (n.get('destino_usuario'),) if u})
    eids = sorted({e for n in nubes for e in (n.get('destino_empresa'),) if e})
    personas, empresas = {}, {}
    if uids:
        cur.execute('SELECT id, name FROM users WHERE id = ANY(%s)', (uids,))
        personas = {r[0]: r[1] for r in cur.fetchall()}
    if eids:
        cur.execute('SELECT id, name FROM companies WHERE id = ANY(%s)', (eids,))
        empresas = {r[0]: r[1] for r in cur.fetchall()}
    return personas, empresas


def _marcas(cur, ids):
    """{markup_id: {page, kind, created_by, version_id}} de esas marcas."""
    if not ids:
        return {}
    cur.execute("""SELECT id, page, kind, created_by, file_version_id::text, file_node_id::text, geometry
                     FROM pdf_markups WHERE id = ANY(%s)""", (list(ids),))
    # `geometria` (en puntos del PDF): para encuadrar la nube al compararla con la versión corregida.
    return {r[0]: {'page': r[1], 'kind': r[2], 'created_by': r[3], 'version_id': r[4], 'documento': r[5],
                   'geometria': r[6]}
            for r in cur.fetchall()}


def _contexto(cur, d):
    """(admin, empresa del usuario) de quien pregunta."""
    admin = es_admin_de_obra(cur, _usuario(), d['project_id'])
    return admin, _empresa_de(cur, _usuario().get('id'))


def _para_la_pantalla(cur, d, nubes, admin, empresa):
    personas, empresas = _nombres(cur, nubes)
    marcas = _marcas(cur, {n['markup_id'] for n in nubes if n.get('markup_id')})
    colores = _nub.colores_del_plano(cur, _nub.documento_de_la_incidencia(d)[0])
    salida, ocultas = [], 0
    for n in nubes:
        sus = _nub.papeles(_usuario(), d, n, admin, empresa)
        if not _nub.visible(n, sus, empresa):
            ocultas += 1
            continue
        actos = [a for a in _nub.ACTOS if _nub.puede(a, n, d, sus, _usuario().get('id'))[0]]
        salida.append({
            **{k: v for k, v in n.items() if k != 'history'},
            'estado_etiqueta': _nub.ETIQUETAS.get(n['estado'], n['estado']),
            'por_verificar': _nub.por_verificar(n, d),
            'por_entregar': _nub.por_entregar(n, d),
            'destino_nombre': personas.get(n.get('destino_usuario')) or empresas.get(n.get('destino_empresa')),
            'destino_es_empresa': bool(n.get('destino_empresa')),
            'color': colores.get(_nub.clave_de_destino(n)),
            'marca': marcas.get(n.get('markup_id')),
            'mis_papeles': sorted(sus),
            'actos': actos,
        })
    papeles_issue = _nub.papeles(_usuario(), d, None, admin, empresa)
    return {'nubes': salida,
            # Las nubes de encargo que esta persona no ve (trabajo en proceso de otro equipo): solo cuántas hay.
            'encargos_internos': ocultas,
            'mis_papeles': sorted(papeles_issue),
            'puedo_crear_encargo': _nub.puede_crear_encargo(papeles_issue)}


def _destino_valido(cur, d, data):
    """(usuario, empresa, error) de a quién se asigna: miembro de la obra o empresa que participa."""
    uid = data.get('destino_usuario')
    eid = data.get('destino_empresa')
    if bool(uid) == bool(eid):
        return None, None, 'Asigna la nube a una persona O a una empresa.'
    if uid:
        try:
            uid = int(uid)
        except (TypeError, ValueError):
            return None, None, 'Persona no válida.'
        cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s', (d['project_id'], uid))
        if not cur.fetchone():
            return None, None, 'Esa persona no es de la obra.'
        if _nub.es_revisor(uid, d):
            return None, None, 'Quien revisa la incidencia no aporta en sus nubes: lo ve todo y las verifica.'
        return uid, None, None
    try:
        eid = int(eid)
    except (TypeError, ValueError):
        return None, None, 'Empresa no válida.'
    cur.execute('SELECT 1 FROM project_companies WHERE project_id = %s AND company_id = %s', (d['project_id'], eid))
    if not cur.fetchone():
        return None, None, 'Esa empresa no participa en la obra.'
    return None, eid, None


def _version_del_plano(cur, d):
    """(version_id, numero) vigente del plano de la incidencia, para dejar escrito sobre qué versión se verificó."""
    nodo, _v = _nub.documento_de_la_incidencia(d)
    if not nodo:
        return None, None
    cur.execute("""SELECT n.current_version_id::text, v.version_number
                     FROM file_nodes n LEFT JOIN file_versions v ON v.id = n.current_version_id
                    WHERE n.id::text = %s""", (nodo,))
    f = cur.fetchone()
    return (f[0], f[1]) if f else (None, None)


def _evento(n, evento, **datos):
    n['history'] = list(n['history'] or []) + [reg.entrada(evento, _actor(), **{k: v for k, v in datos.items()
                                                                                if v is not None})]


@issues_bp.route('/<int:iid>/nubes', methods=['GET', 'POST'])
def nubes_de_la_incidencia(iid):
    corte = guardia_de_recurso('doc_issues', iid)
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            d = _leer(cur, iid, bloquear=request.method == 'POST')
            if not d or (d['estado'] == iss.BORRADOR and not _es_autor(d)):
                return jsonify({'error': 'No existe.'}), 404
            admin, empresa = _contexto(cur, d)
            if request.method == 'GET':
                return jsonify(_para_la_pantalla(cur, d, _nubes_de(cur, d), admin, empresa))
            avisos = []
            respuesta = _acto_sobre_nube(cur, d, request.get_json(silent=True) or {}, admin, empresa, avisos)
            if isinstance(respuesta, tuple):
                conn.rollback()
                return respuesta
            conn.commit()
            _avisar_tras_el_commit(conn, cur, avisos)
            return jsonify(_para_la_pantalla(cur, d, _nubes_de(cur, d), admin, empresa))
    except Exception as e:
        logger.error('nubes de la incidencia %s: %s', iid, e)
        return jsonify({'error': 'No se pudo.'}), 500


def _acto_sobre_nube(cur, d, data, admin, empresa, avisos):
    """Hace el acto con la incidencia bloqueada. Devuelve None si salió bien, o (cuerpo, código) si no; en `avisos`
    deja los encargos abiertos, para avisarlos después del commit."""
    acto = str(data.get('acto') or '')
    if d.get('cerrado'):
        return jsonify({'error': 'La incidencia está cerrada.', 'code': 'CERRADA'}), 409

    if acto == 'crear':
        return _anadir_nube(cur, d, data, admin, empresa, avisos)

    # La nube: por su id o por su marca.
    nubes = _nubes_de(cur, d)
    n = None
    if data.get('nube') is not None:
        n = next((x for x in nubes if str(x['id']) == str(data['nube'])), None)
    elif data.get('marca') is not None:
        n = next((x for x in nubes if str(x.get('markup_id')) == str(data['marca'])), None)
    if not n:
        return jsonify({'error': 'Esa nube no es de esta incidencia.'}), 404
    negativa = _negativa(acto, n, d, admin, empresa)
    if negativa:
        return negativa
    return _hacer(cur, d, n, acto, data, avisos)


def _negativa(acto, n, d, admin, empresa):
    """(cuerpo, código) si esta persona no puede hacer el acto en la nube; None si puede. El código sale del TIPO de la
    negativa (`nubes_de_issue.Motivo`)."""
    sus = _nub.papeles(_usuario(), d, n, admin, empresa)
    if not _nub.visible(n, sus, empresa):
        return jsonify({'error': 'Esa nube no es de esta incidencia.'}), 404
    ok, por_que = _nub.puede(acto, n, d, sus, _usuario().get('id'))
    if not ok:
        return jsonify({'error': por_que[0].upper() + por_que[1:] + '.', 'code': 'NO_PUEDE'}), \
            _nub.HTTP_DE_LA_NEGATIVA[por_que.tipo]
    return None


def _hacer(cur, d, n, acto, data, avisos):
    """El acto, ya permitido: cambia la nube, su ronda y su historial, la guarda, sincroniza lo que se debe en ella y lo
    cuenta en el historial de la incidencia. None si salió bien; (cuerpo, código) si los datos no valen."""
    yo = _usuario()
    ahora = reg.entrada('x', _actor())['at']          # la hora del servidor, en UTC, como el resto del historial
    rondas = [dict(r) for r in (n['rondas'] or [])]

    if acto == 'asignar':
        uid, eid, error = _destino_valido(cur, d, data)
        if error:
            return jsonify({'error': error}), 400
        pedido = str(data.get('pedido') or '').strip()
        if not pedido or len(pedido) > _nub.TOPE_TEXTO:
            return jsonify({'error': 'Escribe qué se pide (de 1 a %d caracteres).' % _nub.TOPE_TEXTO}), 400
        vence = str(data.get('vence_en') or '').strip() or None
        if vence:
            try:
                vence = datetime.date.fromisoformat(vence).isoformat()
            except ValueError:
                return jsonify({'error': 'El plazo va como fecha (AAAA-MM-DD).'}), 400
        n.update({'destino_usuario': uid, 'destino_empresa': eid, 'pedido': pedido, 'vence_en': vence,
                  'estado': _nub.PEDIDA, 'ronda': (n['ronda'] or 0) + 1})
        rondas.append({'n': n['ronda'], 'pedido': pedido, 'pedido_por': yo.get('name') or _actor(),
                       'pedido_por_id': yo.get('id'), 'pedido_en': ahora, 'destino_usuario': uid,
                       'destino_empresa': eid, 'entregas': []})
        _evento(n, 'cloud_assigned', destino_usuario=uid, destino_empresa=eid, ronda=n['ronda'])
        evento_issue = 'cloud_assigned'

    elif acto == 'entregar':
        entregas, error = _nub.entregas_validas(data.get('entregas'))
        if error:
            return jsonify({'error': error}), 400
        docs = [e['documento'] for e in entregas if e['tipo'] == 'documento']
        nombres = _documentos_de_la_obra(cur, d['project_id'], docs) if docs else {}
        if nombres is None or any(x not in nombres for x in docs):
            return jsonify({'error': 'Solo se entregan documentos de Docs de esta obra.'}), 400
        for e in entregas:
            if e['tipo'] == 'documento':
                e['nombre'] = nombres[e['documento']]
        if not rondas:
            rondas.append({'n': n['ronda'] or 1, 'entregas': []})
        r = rondas[-1]
        r['entregas'] = list(r.get('entregas') or []) + entregas
        r.update({'entregado_por': yo.get('name') or _actor(), 'entregado_por_id': yo.get('id'), 'entregado_en': ahora})
        n['estado'] = _nub.ENTREGADA
        _evento(n, 'cloud_delivered', ronda=n['ronda'], cuantas=len(entregas))
        evento_issue = 'cloud_delivered'

    elif acto in ('aceptar', 'devolver'):
        motivo = str(data.get('motivo') or '').strip()
        if acto == 'devolver' and not motivo:
            return jsonify({'error': 'Devolver exige decir qué falta: sin eso no se sabe qué volver a entregar.',
                            'code': 'SIN_MOTIVO'}), 400
        if rondas:
            rondas[-1].update({'decision': 'aceptada' if acto == 'aceptar' else 'devuelta',
                               'decidido_por': yo.get('name') or _actor(), 'decidido_por_id': yo.get('id'),
                               'decidido_en': ahora, 'motivo': motivo or None})
        if acto == 'devolver':
            # La MISMA nube abre la ronda siguiente para el mismo aportante (D7).
            n['ronda'] = (n['ronda'] or 0) + 1
            rondas.append({'n': n['ronda'], 'pedido': motivo, 'pedido_por': yo.get('name') or _actor(),
                           'pedido_por_id': yo.get('id'), 'pedido_en': ahora, 'devuelta': True,
                           'destino_usuario': n['destino_usuario'], 'destino_empresa': n['destino_empresa'],
                           'entregas': []})
        n['estado'] = _nub.destino(acto)
        _evento(n, 'cloud_accepted' if acto == 'aceptar' else 'cloud_returned', ronda=n['ronda'], motivo=motivo or None)
        evento_issue = 'cloud_accepted' if acto == 'aceptar' else 'cloud_returned'

    elif acto == 'verificar':
        resultado = str(data.get('resultado') or '')
        if resultado not in (_nub.LEVANTADA, _nub.NO_LEVANTADA):
            return jsonify({'error': 'Di si quedó levantada o no.'}), 400
        motivo = str(data.get('motivo') or '').strip()
        if resultado == _nub.NO_LEVANTADA and not motivo:
            return jsonify({'error': 'Si no quedó levantada, di por qué: es lo que el encargado tiene que volver '
                                     'a hacer.', 'code': 'SIN_MOTIVO'}), 400
        version_id, numero = _version_del_plano(cur, d)
        n['verificacion'] = {'resultado': resultado, 'motivo': motivo or None, 'version_id': version_id,
                             'version_number': numero, 'por': yo.get('name') or _actor(), 'por_id': yo.get('id'),
                             'en': ahora}
        n['estado'] = _nub.destino('verificar', resultado)
        _evento(n, 'cloud_verified', resultado=resultado, motivo=motivo or None, version=numero)
        evento_issue = 'cloud_verified'
    else:
        return jsonify({'error': 'Acto desconocido.'}), 400

    n['rondas'] = rondas
    _alm.guardar(cur, n)
    # La pelota de la nube: la tiene quien debe entregar mientras le toque y, entregada, el encargado.
    avisos.extend(_alm.sincronizar_pelota(cur, d, n, actor=_actor()))
    # El historial de la incidencia también lo cuenta (la pestaña Historial).
    _historial(cur, int(d['id']), d['history'], evento_issue, nube=n['id'], marca=n.get('markup_id'),
               estado=n['estado'], ronda=n['ronda'])
    log_activity(d['model_urn'], 'CLOUD_' + acto.upper(), 'ISSUE', str(d['id']), d['codigo'], _actor(),
                 {'nube': n['id'], 'estado': n['estado']})
    return None


def _anadir_nube(cur, d, data, admin, empresa, avisos):
    """Una nube suelta de este plano pasa a ser nube de la incidencia (4-nov-2026, el dueño: «no veo dónde asignar»
    en una nube dibujada después). Cómo entra lo dice `nubes_de_issue.como_se_anade`: de observación si la añade quien
    revisa (o el administrador); de encargo si la añade el encargado.

    AÑADIR Y ASIGNAR ES UN SOLO ACTO (docs/archivos/25, P3): con `destino_usuario` o `destino_empresa` y `pedido`, la
    nube se añade y se asigna en la misma transacción, con las mismas reglas que «asignar». Si algo no vale, no queda
    nada a medias."""
    como = _nub.como_se_anade(_nub.papeles(_usuario(), d, None, admin, empresa))
    if not como:
        return jsonify({'error': 'Añade nubes quien revisa la incidencia; el encargado, nubes de encargo.',
                        'code': 'NO_PUEDE'}), 403
    clase, _asigna = como
    try:
        marca = int(data.get('marca'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Falta la marca.'}), 400
    nodo, _v = _nub.documento_de_la_incidencia(d)
    m = _marcas(cur, [marca]).get(marca)
    if not m or not nodo or m.get('documento') != nodo:
        return jsonify({'error': 'La marca tiene que ser de este plano.'}), 400
    if m.get('kind') != _nub.TIPO_DE_NUBE:
        return jsonify({'error': 'Solo una nube se reparte: dibuja una nube sobre lo que hay que hacer.'}), 400
    if not admin and m.get('created_by') != (_usuario().get('name') or ''):   # las marcas guardan el NOMBRE de su autor
        return jsonify({'error': 'Añade una nube tuya: dibújala sobre lo que hay que hacer.', 'code': 'NO_PUEDE'}), 403
    nubes = _nubes_de(cur, d)
    if any(x.get('markup_id') == marca for x in nubes):
        return jsonify({'error': 'Esa marca ya es una nube de la incidencia.'}), 409
    padre = data.get('padre') if clase == 'encargo' else None
    if padre is not None:
        p = next((x for x in nubes if str(x['id']) == str(padre)), None)
        if not p or p['clase'] != 'observacion':
            return jsonify({'error': 'Un encargo cuelga de una nube de observación de esta incidencia.'}), 400
        padre = p['id']
    nid = _alm.crear_fila(cur, d, marca, clase=clase, padre_id=padre,
                          empresa_equipo=empresa if clase == 'encargo' else None, creado_por=_usuario().get('id'))
    if not nid:
        return jsonify({'error': 'No se pudo crear la nube.'}), 500
    # Su equipo y quien revisa la tienen que ver en el plano: la nube se publica (un borrador solo lo ve su autor).
    cur.execute("""UPDATE pdf_markups SET publicado = TRUE, publicado_en = CURRENT_TIMESTAMP, publicado_por = %s
                    WHERE id = %s AND NOT publicado""", (_usuario().get('id'), marca))
    _historial(cur, int(d['id']), d['history'], 'cloud_created', nube=nid, marca=marca, clase=clase,
               padre=padre)
    log_activity(d['model_urn'], 'CLOUD_CREATE', 'ISSUE', str(d['id']), d['codigo'], _actor(), {'nube': nid})
    if data.get('destino_usuario') or data.get('destino_empresa'):
        n = next((x for x in _nubes_de(cur, d) if x['id'] == nid), None)
        negativa = _negativa('asignar', n, d, admin, empresa)
        if negativa:
            return negativa
        return _hacer(cur, d, n, 'asignar', data, avisos)
    return None
