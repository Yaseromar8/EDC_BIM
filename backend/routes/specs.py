# -*- coding: utf-8 -*-
"""GAP 05 · ESPECIFICACIONES — la exigencia del proyecto, con identidad.

La semantica esta en `especificaciones.py` y la mecanica de revisar en
`revisiones_de_documento.py`. Aqui solo hay HTTP, permisos y transaccion.

LO QUE ESTE FICHERO NO HACE, Y ES LO MAS IMPORTANTE
----------------------------------------------------
No almacena ni un byte, igual que planos: cada revision apunta a un
`file_version` que ya vive en el expediente. El permiso se hereda del fichero y
capa 09 sigue siendo la unica autoridad.

Y NO CREA SUBMITTALS. La ruta `submittal-propuesto` devuelve los campos con los
que nacería uno; crearlo sigue pasando por `POST /api/submittals`, con su
veredicto, su BIC y sus permisos. Un submittal que naciera por un camino
paralelo se saltaria justamente la parte que lo hace valer algo.
"""
import base64
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from administracion_de_obra import guardia_administrativa
from perimetro_de_obra import guardia_de_obra, guardia_de_recurso
import especificaciones as esp
import revisiones_de_documento as rev

logger = logging.getLogger('specs')

specs_bp = Blueprint('specs_bp', __name__)


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


# ── CATALOGO ───────────────────────────────────────────────────────────────

@specs_bp.route('/catalogo', methods=['GET'])
def catalogo():
    """Las listas del servidor. El catalogo de divisiones es SUGERIDO, no
    impuesto: la estructura la fija el contrato de cada obra."""
    return jsonify({
        'divisiones_sugeridas': [{'numero': d.numero, 'titulo': d.titulo}
                                 for d in esp.CATALOGO_SUGERIDO],
        'estados_revision': list(esp.ESTADOS_REVISION),
    })


# ── LA ESTRUCTURA DE LA OBRA ───────────────────────────────────────────────

@specs_bp.route('/divisiones', methods=['GET'])
def listar_divisiones():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver la estructura de especificaciones')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT d.id, d.numero, d.titulo,
                   (SELECT count(*) FROM doc_spec_secciones s WHERE s.division_id = d.id)
              FROM doc_spec_divisiones d
             WHERE d.project_id = %s
             ORDER BY d.numero
        """, (obra,))
        return jsonify({'divisiones': [
            {'id': str(r[0]), 'numero': r[1], 'titulo': r[2], 'secciones': r[3]}
            for r in cur.fetchall()]})


@specs_bp.route('/divisiones', methods=['POST'])
def crear_division():
    """La estructura la define QUIEN ADMINISTRA LA OBRA.

    No es burocracia: la division es la columna vertebral contra la que se
    aprueban materiales. Si cualquiera pudiera crearlas, en un mes habria
    '03 Concreto', '3 - CONCRETO' y 'Concretos', y el filtro dejaria de decir
    nada.
    """
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    # LAS DOS, y en este orden. `guardia_de_obra` responde «¿estás en esta
    # obra?» y `guardia_administrativa` «¿la administras?». Sin la primera, un
    # ajeno recibiría «no eres administrador de esta obra» —que es confirmarle
    # que la obra existe— en vez de un no rotundo.
    corte = guardia_de_obra(obra, 'definir la estructura de especificaciones')
    if corte:
        return corte
    with get_db_connection() as _c:
        corte = guardia_administrativa(_c.cursor(), _usuario(), obra,
                                       'definir la estructura de especificaciones')
    if corte:
        return corte

    numero = esp.normalizar_division(data.get('numero'))
    if not numero:
        return jsonify({'error': 'La división necesita un número (dos dígitos).'}), 400
    titulo = (data.get('titulo') or '').strip() or esp.titulo_sugerido(numero)
    if not titulo:
        return jsonify({'error': 'La división %s no está en el catálogo estándar: '
                                 'ponle un título.' % numero,
                        'code': 'SIN_TITULO'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT id FROM doc_spec_divisiones WHERE project_id=%s AND numero=%s',
                        (obra, numero))
            ya = cur.fetchone()
            if ya:
                return jsonify({'error': 'La división %s ya existe en esta obra.' % numero,
                                'code': 'DIVISION_DUPLICADA', 'id': str(ya[0])}), 409
            cur.execute("""INSERT INTO doc_spec_divisiones
                             (project_id, numero, titulo, creado_por)
                           VALUES (%s,%s,%s,%s) RETURNING id""",
                        (obra, numero, titulo, _usuario().get('id')))
            did = cur.fetchone()[0]
            conn.commit()
            return jsonify({'id': str(did), 'numero': numero, 'titulo': titulo,
                            'secciones': 0}), 201
    except Exception as e:
        logger.error('crear division: %s', e)
        return jsonify({'error': 'No se pudo crear la división.'}), 500


# ── LAS SECCIONES ──────────────────────────────────────────────────────────

@specs_bp.route('', methods=['GET'])
def listar():
    """Las secciones con SU REVISION VIGENTE, en una sola consulta.

    «Qué sección estoy mirando» y «qué texto vale» son la misma pregunta.
    Separarlas dejaria una ventana en la que la pantalla enseña una exigencia
    sin saber todavia si esta superada -- y contra una exigencia superada se
    compra material.
    """
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'ver las especificaciones')
    if corte:
        return corte
    division = request.args.get('division_id') or None
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT s.id, s.numero, s.titulo, s.division_id, d.numero, d.titulo,
                       s.creado_en,
                       r.id, r.codigo_revision, r.estado, r.emitida_en,
                       r.file_node_id, r.file_version_id, t.nombre,
                       (SELECT count(*) FROM doc_spec_revisiones x WHERE x.seccion_id = s.id),
                       (SELECT count(*) FROM doc_submittals b WHERE b.spec_section_id = s.id)
                  FROM doc_spec_secciones s
             LEFT JOIN doc_spec_divisiones d ON d.id = s.division_id
             LEFT JOIN doc_spec_revisiones r ON r.seccion_id = s.id AND r.estado = 'Vigente'
             LEFT JOIN doc_spec_sets t ON t.id = r.set_id
                 WHERE s.project_id = %s
                   AND (%s IS NULL OR s.division_id = %s::bigint)
                 ORDER BY d.numero NULLS LAST, s.numero
            """, (obra, division, division))
            secciones = [{
                'id': str(f[0]), 'numero': f[1], 'titulo': f[2],
                'division_id': str(f[3]) if f[3] else None,
                'division_numero': f[4], 'division_titulo': f[5],
                'creado_en': f[6].isoformat() if f[6] else None,
                'vigente': ({'id': str(f[7]), 'codigo': f[8], 'estado': f[9],
                             'emitida_en': f[10].isoformat() if f[10] else None,
                             'file_node_id': str(f[11]) if f[11] else None,
                             'file_version_id': str(f[12]) if f[12] else None,
                             'set': f[13]} if f[7] else None),
                'revisiones': f[14],
                # Cuantos submittals se han sometido contra esta seccion. Es el
                # dato que dice si la especificacion se esta USANDO o solo
                # guardando.
                'submittals': f[15],
            } for f in cur.fetchall()]
            return jsonify({'secciones': secciones})
    except Exception as e:
        logger.error('listar secciones: %s', e)
        return jsonify({'error': 'No se pudo listar.'}), 500


@specs_bp.route('/secciones/<int:sid>/revisiones', methods=['GET'])
def revisiones(sid):
    corte = guardia_de_recurso('doc_spec_secciones', sid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT r.id, r.codigo_revision, r.estado, r.emitida_en, r.emitida_por,
                   r.superada_en, r.superada_por_id, r.motivo,
                   r.file_node_id, r.file_version_id, t.nombre
              FROM doc_spec_revisiones r
         LEFT JOIN doc_spec_sets t ON t.id = r.set_id
             WHERE r.seccion_id = %s
             ORDER BY r.emitida_en DESC
        """, (sid,))
        return jsonify({'revisiones': [{
            'id': str(r[0]), 'codigo': r[1], 'estado': r[2],
            'emitida_en': r[3].isoformat() if r[3] else None, 'emitida_por': r[4],
            'superada_en': r[5].isoformat() if r[5] else None,
            'superada_por_id': str(r[6]) if r[6] else None, 'motivo': r[7],
            'file_node_id': str(r[8]) if r[8] else None,
            'file_version_id': str(r[9]) if r[9] else None,
            'set': r[10]} for r in cur.fetchall()]})


@specs_bp.route('/leer-encabezado', methods=['POST'])
def leer_encabezado():
    """Lee el encabezado del PDF y SUGIERE número, revisión y título.

    Sugerencias, nunca verdad: quien crea la sección confirma o corrige. Si el
    documento es un escaneo sin capa de texto, lo dice en vez de devolver
    campos vacios que parecen un formulario mal rellenado.
    """
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.'}), 400
    corte = guardia_de_obra(obra, 'leer una especificación')
    if corte:
        return corte
    nodo = data.get('file_node_id')
    if not nodo:
        return jsonify({'error': 'Hace falta el documento.'}), 400
    try:
        from storage import get_blob_data
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT model_urn, current_version_id FROM file_nodes WHERE id=%s',
                        (nodo,))
            fn = cur.fetchone()
            if not fn:
                return jsonify({'error': 'Ese documento no existe.'}), 404
            if resolve_project_id(fn[0]) != obra:
                return jsonify({'error': 'Ese documento pertenece a otra obra.',
                                'code': 'OTRA_OBRA'}), 409
        datos, _mime = get_blob_data(str(nodo))
        if not datos:
            return jsonify({'error': 'No se pudo leer el documento.'}), 502
        if isinstance(datos, str):
            datos = base64.b64decode(datos)
        return jsonify(esp.leer_encabezado(datos))
    except Exception as e:
        logger.error('leer encabezado: %s', e)
        return jsonify({'error': 'No se pudo leer el documento.'}), 500


@specs_bp.route('', methods=['POST'])
def crear():
    """Crea la sección y, si viene documento, emite su primera revisión."""
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    obra = resolve_project_id(model_urn or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'registrar una especificación')
    if corte:
        return corte

    numero = esp.normalizar_seccion(data.get('numero'))
    if not numero:
        return jsonify({'error': 'La sección necesita un número: es su identidad.'}), 400
    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'error': 'La sección necesita un título.'}), 400
    nodo = data.get('file_node_id')

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT id FROM doc_spec_secciones WHERE project_id=%s AND numero=%s',
                        (obra, numero))
            ya = cur.fetchone()
            if ya:
                return jsonify({'error': 'La sección %s ya existe: emítele una revisión '
                                         'en vez de crearla otra vez.' % numero,
                                'code': 'SECCION_DUPLICADA', 'id': str(ya[0])}), 409

            division_id = data.get('division_id')
            if division_id:
                cur.execute('SELECT project_id FROM doc_spec_divisiones WHERE id=%s',
                            (division_id,))
                d = cur.fetchone()
                if not d:
                    return jsonify({'error': 'Esa división no existe.'}), 404
                if d[0] != obra:
                    return jsonify({'error': 'Esa división pertenece a otra obra.',
                                    'code': 'OTRA_OBRA'}), 409

            if nodo:
                cur.execute('SELECT model_urn, current_version_id FROM file_nodes WHERE id=%s',
                            (nodo,))
                fn = cur.fetchone()
                if not fn:
                    return jsonify({'error': 'Ese documento no existe.'}), 404
                if resolve_project_id(fn[0]) != obra:
                    return jsonify({'error': 'Ese documento pertenece a otra obra.',
                                    'code': 'OTRA_OBRA'}), 409

            cur.execute("""INSERT INTO doc_spec_secciones
                             (project_id, model_urn, division_id, numero, titulo, creado_por)
                           VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (obra, model_urn, division_id, numero, titulo,
                         _usuario().get('id')))
            sid = cur.fetchone()[0]

            primera = None
            if nodo:
                rid, codigo, _ant = rev.emitir(
                    cur, esp.SECCION, sid, nodo,
                    file_version_id=data.get('file_version_id') or fn[1],
                    codigo=data.get('codigo_revision'), set_id=data.get('set_id'),
                    emitida_por=_usuario().get('id'))
                primera = {'id': str(rid), 'codigo': codigo, 'estado': rev.VIGENTE}
            conn.commit()
            log_activity(model_urn, 'CREATE', 'SPEC', str(sid), numero, _actor(),
                         {'revision': (primera or {}).get('codigo')})
            return jsonify({'id': str(sid), 'numero': numero, 'titulo': titulo,
                            'division_id': str(division_id) if division_id else None,
                            'vigente': primera, 'revisiones': 1 if primera else 0,
                            'submittals': 0}), 201
    except ValueError as e:
        return jsonify({'error': str(e), 'code': 'REVISION_INVALIDA'}), 409
    except Exception as e:
        logger.error('crear seccion: %s', e)
        return jsonify({'error': 'No se pudo registrar la especificación.'}), 500


@specs_bp.route('/secciones/<int:sid>/revisiones', methods=['POST'])
def emitir_revision(sid):
    """Emite una revisión y SUPERA la anterior. La mecánica es la compartida.

    LAS DOS COSAS JUNTAS O NINGUNA: si se escribiera la nueva vigente antes de
    superar la anterior habria un instante con dos vigentes, y si el proceso
    muriera ahi ese instante seria permanente. El indice unico parcial lo impide
    ademas desde la base.
    """
    corte = guardia_de_recurso('doc_spec_secciones', sid)
    if corte:
        return corte
    data = request.get_json(silent=True) or {}
    nodo = data.get('file_node_id')
    if not nodo:
        return jsonify({'error': 'Hace falta el documento: una revisión sin soporte '
                                 'no es una revisión.'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT project_id, model_urn, numero FROM doc_spec_secciones '
                        ' WHERE id=%s', (sid,))
            seccion = cur.fetchone()
            if not seccion:
                return jsonify({'error': 'No existe.'}), 404
            obra, urn, numero = seccion

            cur.execute('SELECT model_urn, current_version_id FROM file_nodes WHERE id=%s',
                        (nodo,))
            fn = cur.fetchone()
            if not fn:
                return jsonify({'error': 'Ese documento no existe.'}), 404
            if resolve_project_id(fn[0]) != obra:
                return jsonify({'error': 'Ese documento pertenece a otra obra.',
                                'code': 'OTRA_OBRA'}), 409

            rid, codigo, anterior = rev.emitir(
                cur, esp.SECCION, sid, nodo,
                file_version_id=data.get('file_version_id') or fn[1],
                codigo=data.get('codigo_revision'), set_id=data.get('set_id'),
                motivo=data.get('motivo'), emitida_por=_usuario().get('id'))
            conn.commit()
            log_activity(urn, 'REVISE', 'SPEC', str(sid), numero, _actor(),
                         {'revision': codigo,
                          'supera_a': str(anterior) if anterior else None})
            return jsonify({'id': str(rid), 'codigo': codigo, 'estado': rev.VIGENTE,
                            'supera_a': str(anterior) if anterior else None}), 201
    except ValueError as e:
        return jsonify({'error': str(e), 'code': 'REVISION_INVALIDA'}), 409
    except Exception as e:
        logger.error('emitir revision de seccion %s: %s', sid, e)
        return jsonify({'error': 'No se pudo emitir la revisión.'}), 500


# ── LO QUE ESTE GAP EXISTE PARA HABILITAR ──────────────────────────────────

@specs_bp.route('/secciones/<int:sid>/submittal-propuesto', methods=['GET'])
def submittal_propuesto(sid):
    """Los campos con los que nacería un submittal contra esta sección.

    NO LO CREA, y eso no es una limitación: es el diseño. Crear el submittal
    sigue siendo `POST /api/submittals`, con el flujo, el veredicto y la BIC de
    GAP 01. Si esta ruta lo creara, existiría un segundo camino de alta que
    tarde o temprano dejaría de comprobar algo que el primero sí comprueba.
    """
    corte = guardia_de_recurso('doc_spec_secciones', sid)
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT s.id, s.numero, s.titulo, s.model_urn, r.codigo_revision
                         FROM doc_spec_secciones s
                    LEFT JOIN doc_spec_revisiones r
                           ON r.seccion_id = s.id AND r.estado = 'Vigente'
                        WHERE s.id = %s""", (sid,))
        f = cur.fetchone()
    if not f:
        return jsonify({'error': 'No existe.'}), 404
    propuesta = esp.submittal_desde_seccion(
        {'id': str(f[0]), 'numero': f[1], 'titulo': f[2]}, revision=f[4])
    propuesta['model_urn'] = f[3]
    # Se dice si la seccion NO tiene revision vigente. Someter un material
    # contra una especificacion que no tiene texto vigente es exactamente el
    # error que este objeto existe para hacer visible.
    propuesta['sin_revision_vigente'] = f[4] is None
    return jsonify(propuesta)


# ── SETS ───────────────────────────────────────────────────────────────────

@specs_bp.route('/sets', methods=['GET'])
def listar_sets():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver los juegos de especificaciones')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT t.id, t.nombre, t.descripcion, t.emitido_en,
                              (SELECT count(*) FROM doc_spec_revisiones r WHERE r.set_id = t.id)
                         FROM doc_spec_sets t WHERE t.project_id = %s
                        ORDER BY t.emitido_en DESC""", (obra,))
        return jsonify({'sets': [{'id': str(r[0]), 'nombre': r[1], 'descripcion': r[2],
                                  'emitido_en': r[3].isoformat() if r[3] else None,
                                  'revisiones': r[4]} for r in cur.fetchall()]})


@specs_bp.route('/sets', methods=['POST'])
def crear_set():
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'emitir un juego de especificaciones')
    if corte:
        return corte
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El juego necesita un nombre.'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_spec_sets
                             (project_id, nombre, descripcion, emitido_por)
                           VALUES (%s,%s,%s,%s) RETURNING id""",
                        (obra, nombre, (data.get('descripcion') or '').strip() or None,
                         _usuario().get('id')))
            tid = cur.fetchone()[0]
            conn.commit()
            return jsonify({'id': str(tid), 'nombre': nombre, 'revisiones': 0}), 201
    except Exception as e:
        logger.error('crear set de specs: %s', e)
        return jsonify({'error': 'No se pudo crear el juego. ¿Ya existe uno con ese '
                                 'nombre?'}), 409
