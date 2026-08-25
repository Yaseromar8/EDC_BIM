# -*- coding: utf-8 -*-
"""GAP 02 · PLANOS — la identidad, sus revisiones, y lo que se clava en ellas.

La semantica esta en `planos_de_obra.py` y no se repite aqui.

LO QUE ESTE FICHERO NO HACE, Y ES LO MAS IMPORTANTE
----------------------------------------------------
No almacena ni un byte. Cada revision apunta a un `file_version` que ya vive en
el expediente. Por eso:

    · el permiso de recurso SE HEREDA: un plano se ve si su fichero se ve, y
      capa 09 sigue siendo la unica autoridad sobre eso;
    · no hay una segunda copia del PDF que pueda divergir del original;
    · el SHA-256 y la historia del fichero siguen siendo los suyos.

Publicar una revision es un acto sobre la IDENTIDAD del plano, no sobre el
fichero. Por eso `guardia_de_recurso` se aplica sobre `doc_planos`, y el acceso
al PDF lo sigue resolviendo el expediente cuando alguien lo abre.
"""
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_obra, guardia_de_recurso
import planos_de_obra as pl

logger = logging.getLogger('planos')

planos_bp = Blueprint('planos_bp', __name__)


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


# ── CATALOGO ───────────────────────────────────────────────────────────────

@planos_bp.route('/catalogo', methods=['GET'])
def catalogo():
    """Las listas cerradas, del servidor. Si la pantalla las llevara escritas,
    anadir una disciplina obligaria a desplegar las dos mitades a la vez."""
    return jsonify({
        'disciplinas': [{'codigo': c, 'etiqueta': e} for c, e in pl.DISCIPLINAS],
        'estados_revision': list(pl.ESTADOS_REVISION),
    })


# ── LECTURA ────────────────────────────────────────────────────────────────

@planos_bp.route('', methods=['GET'])
def listar():
    """Los planos de la obra con SU REVISION VIGENTE, en una sola consulta.

    La vigente se trae con el plano y no en una segunda llamada por fila: «que
    plano estoy mirando» y «que revision vale» son la misma pregunta, y
    separarlas deja una ventana en la que la pantalla ensena un numero sin
    saber todavia si esta superado.
    """
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    disciplina = request.args.get('disciplina') or None
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT p.id, p.numero, p.titulo, p.disciplina, p.creado_en,
                       r.id, r.codigo_revision, r.estado, r.emitida_en,
                       r.file_node_id, r.file_version_id, s.nombre,
                       (SELECT count(*) FROM doc_plano_revisiones x WHERE x.plano_id = p.id)
                  FROM doc_planos p
                  LEFT JOIN doc_plano_revisiones r
                         ON r.plano_id = p.id AND r.estado = 'Vigente'
                  LEFT JOIN doc_plano_sets s ON s.id = r.set_id
                 WHERE p.project_id = %s
                   AND (%s IS NULL OR p.disciplina = %s)
                 ORDER BY p.disciplina NULLS LAST, p.numero
            """, (obra, disciplina, disciplina))
            planos = [{
                'id': str(f[0]), 'numero': f[1], 'titulo': f[2],
                'disciplina': f[3], 'disciplina_etiqueta': pl.etiqueta_disciplina(f[3]),
                'creado_en': f[4].isoformat() if f[4] else None,
                'vigente': ({'id': str(f[5]), 'codigo': f[6], 'estado': f[7],
                             'emitida_en': f[8].isoformat() if f[8] else None,
                             'file_node_id': str(f[9]) if f[9] else None,
                             'file_version_id': str(f[10]) if f[10] else None,
                             'set': f[11]} if f[5] else None),
                'revisiones': f[12],
            } for f in cur.fetchall()]
            return jsonify({'planos': planos})
    except Exception as e:
        logger.error('listar planos: %s', e)
        return jsonify({'error': 'No se pudo listar.'}), 500


@planos_bp.route('/<int:pid>/revisiones', methods=['GET'])
def revisiones(pid):
    """TODAS, incluidas las superadas.

    Una revision superada se conserva entera: es lo que permite responder «que
    decia el plano cuando se levanto esta observacion», que en obra publica es
    una pregunta con consecuencias, no una curiosidad.
    """
    corte = guardia_de_recurso('doc_planos', pid)
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT r.id, r.codigo_revision, r.estado, r.emitida_en, r.superada_en,
                       r.file_node_id, r.file_version_id, s.nombre, r.motivo,
                       (SELECT count(*) FROM plano_anclajes a WHERE a.revision_id = r.id)
                  FROM doc_plano_revisiones r
                  LEFT JOIN doc_plano_sets s ON s.id = r.set_id
                 WHERE r.plano_id = %s
                 ORDER BY r.emitida_en DESC, r.id DESC
            """, (pid,))
            return jsonify({'revisiones': [{
                'id': str(f[0]), 'codigo': f[1], 'estado': f[2],
                'emitida_en': f[3].isoformat() if f[3] else None,
                'superada_en': f[4].isoformat() if f[4] else None,
                'file_node_id': str(f[5]) if f[5] else None,
                'file_version_id': str(f[6]) if f[6] else None,
                'set': f[7], 'motivo': f[8], 'anclajes': f[9],
            } for f in cur.fetchall()]})
    except Exception as e:
        logger.error('revisiones del plano %s: %s', pid, e)
        return jsonify({'error': 'No se pudieron leer las revisiones.'}), 500


# ── LECTURA DEL CAJETIN ────────────────────────────────────────────────────

@planos_bp.route('/leer-cajetin', methods=['POST'])
def leer_cajetin():
    """Sugiere numero, revision y titulo leyendo el PDF que YA esta subido.

    SUGERENCIA, NO VERDAD: la confirma una persona. Un numero de plano mal
    leido se propaga a las observaciones, a los submittals y al acta de
    recepcion, y para cuando se nota ya esta en un documento firmado.
    """
    data = request.get_json(silent=True) or {}
    nodo = data.get('file_node_id')
    if not nodo:
        return jsonify({'error': 'file_node_id es obligatorio'}), 400
    corte = guardia_de_recurso('file_nodes', nodo)
    if corte:
        return corte
    try:
        from gcs_manager import descargar_bytes
    except ImportError:
        return jsonify({'error': 'Lectura de cajetín no disponible en este despliegue.',
                        'code': 'SIN_LECTOR'}), 501
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT v.gcs_urn FROM file_versions v
                            JOIN file_nodes n ON n.current_version_id = v.id
                           WHERE n.id = %s""", (nodo,))
            fila = cur.fetchone()
        if not fila:
            return jsonify({'error': 'Ese documento no tiene versión actual.'}), 404
        datos = descargar_bytes(fila[0])
        sug = pl.leer_cajetin(datos)
        if not sug['tiene_texto']:
            sug['aviso'] = ('Este PDF no tiene capa de texto —probablemente es un '
                            'escaneo—. Hay que teclear el número y el título.')
        return jsonify(sug)
    except Exception as e:
        logger.warning('leer cajetin de %s: %s', nodo, e)
        # No es un error del usuario: es que no se pudo leer. Se dice, y la
        # pantalla sigue dejando teclear.
        return jsonify({'numero': None, 'revision': None, 'titulo': None,
                        'tiene_texto': False,
                        'aviso': 'No se pudo leer el cajetín. Teclea los datos.'})


# ── ALTA ───────────────────────────────────────────────────────────────────

@planos_bp.route('', methods=['POST'])
def crear():
    """Crea la IDENTIDAD del plano y, si viene fichero, su primera revision."""
    data = request.get_json(silent=True) or {}
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    obra = resolve_project_id(model_urn)
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400

    numero = pl.normalizar_numero(data.get('numero'))
    titulo = (data.get('titulo') or '').strip()
    if not numero:
        return jsonify({'error': 'El número de plano es obligatorio: es su identidad.'}), 400
    if not titulo:
        return jsonify({'error': 'El título es obligatorio.'}), 400
    disciplina = (data.get('disciplina') or '').strip().upper() or None
    if disciplina and disciplina not in pl.CODIGOS_DISCIPLINA:
        return jsonify({'error': 'Disciplina desconocida.',
                        'admitidas': list(pl.CODIGOS_DISCIPLINA)}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT id FROM doc_planos WHERE project_id=%s AND numero=%s',
                        (obra, numero))
            if cur.fetchone():
                return jsonify({'error': 'Ya existe un plano %s en esta obra. El número '
                                         'es su identidad y no se repite.' % numero,
                                'code': 'NUMERO_DUPLICADO'}), 409

            cur.execute("""INSERT INTO doc_planos
                             (project_id, model_urn, numero, titulo, disciplina, creado_por)
                           VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (obra, model_urn, numero, titulo, disciplina, _usuario().get('id')))
            pid = cur.fetchone()[0]
            conn.commit()
            log_activity(model_urn, 'CREATE', 'PLANO', str(pid), numero, _actor(),
                         {'titulo': titulo, 'disciplina': disciplina})
            return jsonify({'id': str(pid), 'numero': numero, 'titulo': titulo,
                            'disciplina': disciplina, 'vigente': None,
                            'revisiones': 0}), 201
    except Exception as e:
        logger.error('crear plano: %s', e)
        return jsonify({'error': 'No se pudo crear el plano.'}), 500


@planos_bp.route('/<int:pid>/revisiones', methods=['POST'])
def emitir_revision(pid):
    """Emite una revision y SUPERA la anterior, en la misma transaccion.

    LAS DOS COSAS JUNTAS O NINGUNA. Si se escribiera la nueva vigente antes de
    superar la anterior, habria un instante con DOS vigentes; y si el proceso
    muriera ahi, ese instante seria permanente. El indice unico parcial
    `idx_plano_una_sola_vigente` lo impide ademas desde la base, asi que un
    error de orden falla ruidosamente en vez de corromper el expediente.
    """
    corte = guardia_de_recurso('doc_planos', pid)
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
            cur.execute('SELECT project_id, model_urn, numero FROM doc_planos WHERE id=%s',
                        (pid,))
            plano = cur.fetchone()
            if not plano:
                return jsonify({'error': 'No existe.'}), 404
            obra, urn, numero = plano

            # EL SOPORTE TIENE QUE SER DE ESTA OBRA. Sin esto se podria clavar
            # como revision un documento de otra obra con solo conocer su id.
            cur.execute('SELECT model_urn, current_version_id FROM file_nodes WHERE id=%s',
                        (nodo,))
            fn = cur.fetchone()
            if not fn:
                return jsonify({'error': 'Ese documento no existe.'}), 404
            if resolve_project_id(fn[0]) != obra:
                return jsonify({'error': 'Ese documento pertenece a otra obra.',
                                'code': 'OTRA_OBRA'}), 409

            cur.execute('SELECT codigo_revision FROM doc_plano_revisiones WHERE plano_id=%s',
                        (pid,))
            existentes = [r[0] for r in cur.fetchall()]
            codigo = (data.get('codigo_revision') or '').strip().upper() \
                or pl.siguiente_revision(existentes)
            if not codigo:
                return jsonify({'error': 'No se pudo deducir la siguiente revisión: '
                                         'la serie no sigue ninguna convención conocida. '
                                         'Indícala a mano.',
                                'code': 'REVISION_INDEDUCIBLE'}), 409
            if codigo in [c.upper() for c in existentes if c]:
                return jsonify({'error': 'La revisión %s de %s ya existe.' % (codigo, numero),
                                'code': 'REVISION_DUPLICADA'}), 409

            # 1) superar la vigente  2) insertar la nueva. En este orden.
            cur.execute("""UPDATE doc_plano_revisiones
                              SET estado='Superada', superada_en=CURRENT_TIMESTAMP
                            WHERE plano_id=%s AND estado='Vigente'
                        RETURNING id""", (pid,))
            anterior = cur.fetchone()

            cur.execute("""INSERT INTO doc_plano_revisiones
                             (plano_id, codigo_revision, set_id, file_node_id,
                              file_version_id, estado, emitida_por, motivo)
                           VALUES (%s,%s,%s,%s,%s,'Vigente',%s,%s) RETURNING id""",
                        (pid, codigo, data.get('set_id'), nodo,
                         data.get('file_version_id') or fn[1],
                         _usuario().get('id'),
                         (data.get('motivo') or '').strip() or None))
            rid = cur.fetchone()[0]
            if anterior:
                cur.execute('UPDATE doc_plano_revisiones SET superada_por_id=%s WHERE id=%s',
                            (rid, anterior[0]))
            conn.commit()
            log_activity(urn, 'REVISE', 'PLANO', str(pid), numero, _actor(),
                         {'revision': codigo, 'supera_a': str(anterior[0]) if anterior else None})
            return jsonify({'id': str(rid), 'codigo': codigo, 'estado': 'Vigente',
                            'supera_a': str(anterior[0]) if anterior else None}), 201
    except Exception as e:
        logger.error('emitir revision de %s: %s', pid, e)
        return jsonify({'error': 'No se pudo emitir la revisión.'}), 500


# ── SETS ───────────────────────────────────────────────────────────────────

@planos_bp.route('/sets', methods=['GET'])
def listar_sets():
    model_urn = request.args.get('model_urn')
    obra = resolve_project_id(model_urn) if model_urn else None
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT s.id, s.nombre, s.descripcion, s.emitido_en,
                              (SELECT count(*) FROM doc_plano_revisiones r WHERE r.set_id=s.id)
                         FROM doc_plano_sets s WHERE s.project_id=%s
                        ORDER BY s.emitido_en DESC""", (obra,))
        return jsonify({'sets': [{'id': str(f[0]), 'nombre': f[1], 'descripcion': f[2],
                                  'emitido_en': f[3].isoformat() if f[3] else None,
                                  'revisiones': f[4]} for f in cur.fetchall()]})


@planos_bp.route('/sets', methods=['POST'])
def crear_set():
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    nombre = (data.get('nombre') or '').strip()
    if not obra or not nombre:
        return jsonify({'error': 'Hacen falta la obra y el nombre del set.'}), 400
    # La obra llega en el CUERPO: defensa en profundidad, porque el control
    # central del middleware depende de una variable de entorno y la separacion
    # entre obras no puede colgar de una variable.
    corte = guardia_de_obra(obra, 'crear un set de planos')
    if corte:
        return corte
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_plano_sets (project_id, nombre, descripcion, emitido_por)
                           VALUES (%s,%s,%s,%s) RETURNING id""",
                        (obra, nombre, (data.get('descripcion') or '').strip() or None,
                         _usuario().get('id')))
            sid = cur.fetchone()[0]
            conn.commit()
            return jsonify({'id': str(sid), 'nombre': nombre}), 201
    except Exception as e:
        if 'idx_plano_sets_nombre' in str(e):
            return jsonify({'error': 'Ya hay un set con ese nombre en esta obra.',
                            'code': 'SET_DUPLICADO'}), 409
        logger.error('crear set: %s', e)
        return jsonify({'error': 'No se pudo crear el set.'}), 500


# ── ANCLAJES ───────────────────────────────────────────────────────────────

def _obra_de_la_revision(rid):
    """La obra a la que pertenece una revision, mirando su plano.

    `doc_plano_revisiones` NO esta en RECURSOS a proposito: su obra no vive en
    su propia fila sino en la del plano del que cuelga, y declarar una columna
    `model_urn` que no existe habria dejado la guardia dormida --exactamente el
    fallo que ya tuvo `saved_views`--. Se resuelve con un salto explicito.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT p.model_urn FROM doc_plano_revisiones r
                         JOIN doc_planos p ON p.id = r.plano_id
                        WHERE r.id = %s""", (rid,))
        f = cur.fetchone()
    return f[0] if f else None


@planos_bp.route('/revisiones/<int:rid>/anclajes', methods=['GET'])
def listar_anclajes(rid):
    # Conocer un id de revision no puede bastar para leer los anclajes de la
    # obra de otro: es la misma familia de agujero que se midio el 13-ago-2026.
    urn = _obra_de_la_revision(rid)
    if not urn:
        return jsonify({'error': 'No existe.'}), 404
    corte = guardia_de_obra(urn, 'ver los anclajes de este plano')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT id, objeto_tipo, objeto_id, pagina, x, y, creado_en
                         FROM plano_anclajes WHERE revision_id=%s ORDER BY id""", (rid,))
        return jsonify({'anclajes': [{'id': str(f[0]), 'objeto_tipo': f[1],
                                      'objeto_id': f[2], 'pagina': f[3],
                                      'x': f[4], 'y': f[5],
                                      'creado_en': f[6].isoformat() if f[6] else None}
                                     for f in cur.fetchall()]})


_TIPOS_ANCLABLES = ('RFI', 'REDLINE', 'SUBMITTAL', 'REVIEW')


@planos_bp.route('/revisiones/<int:rid>/anclajes', methods=['POST'])
def anclar(rid):
    """Clava un registro en un PUNTO de esta revision.

    El ancla apunta a la REVISION y no al plano: una observacion se levanto
    sobre un soporte concreto, y cuando ese soporte quede superado tiene que
    seguir diciendo sobre CUAL se levanto. Si apuntara al plano, superar una
    revision moveria silenciosamente todas las observaciones al soporte nuevo.
    """
    data = request.get_json(silent=True) or {}
    tipo = (data.get('objeto_tipo') or '').strip().upper()
    oid = str(data.get('objeto_id') or '').strip()
    if tipo not in _TIPOS_ANCLABLES:
        return jsonify({'error': 'Tipo no anclable.', 'admitidos': list(_TIPOS_ANCLABLES)}), 400
    if not oid:
        return jsonify({'error': 'objeto_id es obligatorio'}), 400
    try:
        x, y = float(data.get('x')), float(data.get('y'))
    except (TypeError, ValueError):
        return jsonify({'error': 'x e y son obligatorias.'}), 400
    if not (0 <= x <= 1 and 0 <= y <= 1):
        return jsonify({'error': 'x e y son relativas a la lámina (0 a 1): en '
                                 'coordenadas absolutas el ancla se descoloca al '
                                 'reexportar el plano con otro tamaño.'}), 400

    # LO CAZO `test_la_defensa_en_profundidad_no_retrocede`, y era real: sin
    # esto, conocer un id de revision bastaba para clavar una observacion sobre
    # el plano de OTRA obra. La obra sale de la fila del plano, nunca de lo que
    # mande el cliente.
    urn = _obra_de_la_revision(rid)
    if not urn:
        return jsonify({'error': 'No existe.'}), 404
    corte = guardia_de_obra(urn, 'anclar sobre este plano')
    if corte:
        return corte

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO plano_anclajes
                             (revision_id, objeto_tipo, objeto_id, pagina, x, y, creado_por)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (revision_id, objeto_tipo, objeto_id)
                           DO UPDATE SET pagina=EXCLUDED.pagina, x=EXCLUDED.x, y=EXCLUDED.y
                           RETURNING id""",
                        (rid, tipo, oid, int(data.get('pagina') or 1), x, y,
                         _usuario().get('id')))
            aid = cur.fetchone()[0]
            conn.commit()
            return jsonify({'id': str(aid), 'objeto_tipo': tipo, 'objeto_id': oid,
                            'x': x, 'y': y}), 201
    except Exception as e:
        logger.error('anclar en revision %s: %s', rid, e)
        return jsonify({'error': 'No se pudo anclar.'}), 500
