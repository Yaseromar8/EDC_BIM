# -*- coding: utf-8 -*-
"""GAP 06 · el CRUD del molde. Aplicarlo NO vive aqui.

Aplicar una plantilla es crear una revision, y eso pasa por `POST /api/reviews`
con todas sus comprobaciones -- independencia autor/revisor, permiso sobre los
documentos, codigo de idoneidad, revisor miembro de la obra. Si aqui hubiera una
ruta «crear revision desde plantilla», seria un segundo camino de alta que
acabaria saltandose alguna de esas y nadie se enteraria hasta que hiciera falta.

LA AUTORIDAD NO ES NUEVA
------------------------
    plantilla de OBRA     la define quien ADMINISTRA esa obra
    plantilla de ENTIDAD  la define quien tiene la facultad `gestionar_perfiles`

`gestionar_perfiles` es literalmente «crear y editar los perfiles reutilizables;
aplicarlos sigue siendo un acto de cada obra». Una plantilla de flujo es
exactamente eso. Inventarle una facultad propia habria creado una segunda fuente
de autoridad para la misma clase de decision.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from administracion_de_obra import guardia_administrativa
from perimetro_de_obra import guardia_de_obra
import plantillas_de_revision as plt
import roles_de_entidad as roles

logger = logging.getLogger('plantillas_revision')

plantillas_revision_bp = Blueprint('plantillas_revision_bp', __name__)

_COLS = ('id, alcance, project_id, nombre, descripcion, pasos, activa, version, '
         'creado_por, creado_en, modificado_por, modificado_en, history')


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r, aplicadas=None):
    return {
        'id': str(r[0]), 'alcance': r[1], 'project_id': r[2],
        'nombre': r[3], 'descripcion': r[4],
        'pasos': r[5] or [], 'activa': bool(r[6]), 'version': r[7],
        'creado_por': r[8],
        'creado_en': r[9].isoformat() if r[9] else None,
        'modificado_por': r[10],
        'modificado_en': r[11].isoformat() if r[11] else None,
        'history': r[12] or [],
        'aplicada_a': aplicadas,
    }


def _puede_definir(cur, alcance, obra, accion):
    """None si puede; (respuesta, codigo) si no."""
    if alcance == plt.ENTIDAD:
        return roles.guardia(cur, _usuario(), 'gestionar_perfiles', accion)
    return guardia_administrativa(cur, _usuario(), obra, accion)


# ── LECTURA ────────────────────────────────────────────────────────────────

@plantillas_revision_bp.route('/catalogo', methods=['GET'])
def catalogo():
    return jsonify({
        'decisiones': [{'codigo': c, 'etiqueta': e} for c, e in plt.DECISIONES],
        'funciones': list(plt.FUNCIONES),
        'alcances': list(plt.ALCANCES),
        # Se dice lo que NO hay, en vez de callarlo: el benchmark contempla
        # pasos en paralelo y este motor es secuencial.
        'paralelo': False,
        'max_pasos': 6,
    })


@plantillas_revision_bp.route('', methods=['GET'])
def listar():
    """Las de esta obra Y las de la entidad: las dos se pueden aplicar aqui."""
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver las plantillas de revisión')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT %s FROM doc_review_plantillas '
                    ' WHERE project_id = %%s OR alcance = %%s '
                    ' ORDER BY alcance, lower(nombre)' % _COLS, (obra, plt.ENTIDAD))
        filas = cur.fetchall()
        # Cuantas revisiones se abrieron con cada una. Es el dato que dice si la
        # plantilla se USA o solo existe -- y el que hace visible que
        # desactivarla no borra nada de lo ya hecho.
        cur.execute("""SELECT plantilla_id, count(*) FROM doc_reviews
                        WHERE plantilla_id IS NOT NULL GROUP BY plantilla_id""")
        uso = {str(k): v for k, v in cur.fetchall()}
        return jsonify({'plantillas': [
            _fila(r, uso.get(str(r[0]), 0)) for r in filas]})


@plantillas_revision_bp.route('/<int:pid>', methods=['GET'])
def detalle(pid):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT %s FROM doc_review_plantillas WHERE id = %%s' % _COLS, (pid,))
        r = cur.fetchone()
        if not r:
            return jsonify({'error': 'No existe.'}), 404
        if r[2]:
            corte = guardia_de_obra(r[2], 'ver esta plantilla')
            if corte:
                return corte
        cur.execute('SELECT count(*) FROM doc_reviews WHERE plantilla_id = %s', (pid,))
        return jsonify(_fila(r, cur.fetchone()[0]))


# ── ALTA ───────────────────────────────────────────────────────────────────

@plantillas_revision_bp.route('', methods=['POST'])
def crear():
    data = request.get_json(silent=True) or {}
    alcance = (data.get('alcance') or plt.OBRA).strip().upper()
    if alcance not in plt.ALCANCES:
        return jsonify({'error': 'Alcance desconocido.',
                        'admitidos': list(plt.ALCANCES)}), 400

    obra = None
    if alcance == plt.OBRA:
        obra = resolve_project_id(data.get('model_urn') or '')
        if not obra:
            return jsonify({'error': 'Una plantilla de obra necesita su obra.',
                            'code': 'PROJECT_UNRESOLVED'}), 400
        corte = guardia_de_obra(obra, 'definir un flujo de revisión')
        if corte:
            return corte

    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'La plantilla necesita un nombre: es lo que verá '
                                 'quien la elija.'}), 400
    pasos = data.get('pasos')
    mal = plt.validar_pasos(pasos, alcance)
    if mal:
        return jsonify({'error': mal, 'code': 'PASOS_INVALIDOS'}), 400

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            corte = _puede_definir(cur, alcance, obra, 'definir un flujo de revisión')
            if corte:
                return corte

            # Una persona designada tiene que estar EN la obra. Se comprueba al
            # crear: descubrirlo al aplicar seria descubrirlo tarde.
            if alcance == plt.OBRA:
                for i, paso in enumerate(pasos):
                    if not paso.get('user_id'):
                        continue
                    cur.execute('SELECT 1 FROM project_users '
                                ' WHERE project_id=%s AND user_id=%s',
                                (obra, int(paso['user_id'])))
                    if not cur.fetchone():
                        return jsonify({
                            'error': 'El revisor del paso %d no es miembro de esta '
                                     'obra.' % (i + 1),
                            'code': 'REVISOR_NO_MIEMBRO'}), 409

            historia = [{'event': 'created', 'by': _actor(), 'version': 1}]
            cur.execute("""INSERT INTO doc_review_plantillas
                             (alcance, project_id, nombre, descripcion, pasos,
                              creado_por, history)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (alcance, obra, nombre,
                         (data.get('descripcion') or '').strip() or None,
                         json.dumps(pasos), _usuario().get('id'),
                         json.dumps(historia)))
            pid = cur.fetchone()[0]
            conn.commit()
            cur.execute('SELECT %s FROM doc_review_plantillas WHERE id=%%s' % _COLS, (pid,))
            if obra:
                log_activity(data.get('model_urn'), 'CREATE', 'REVIEW_TEMPLATE',
                             str(pid), nombre, _actor(), {'pasos': len(pasos)})
            return jsonify(_fila(cur.fetchone(), 0)), 201
    except Exception as e:
        logger.error('crear plantilla de revision: %s', e)
        return jsonify({'error': 'No se pudo crear la plantilla. ¿Ya existe una con '
                                 'ese nombre?'}), 409


# ── MODIFICAR: SUBE LA VERSION, NO TOCA NINGUNA REVISION ───────────────────

@plantillas_revision_bp.route('/<int:pid>', methods=['PUT'])
def modificar(pid):
    """Cambia el molde. LAS REVISIONES YA ABIERTAS NO SE ENTERAN.

    Es la invariante del gap y por eso esta escrita aqui y no solo en el
    documento: este manejador toca `doc_review_plantillas` y NADA MAS. No hay
    una sola sentencia que escriba en `doc_reviews`.
    """
    data = request.get_json(silent=True) or {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT alcance, project_id, version, history, pasos, nombre '
                        '  FROM doc_review_plantillas WHERE id=%s', (pid,))
            actual = cur.fetchone()
            if not actual:
                return jsonify({'error': 'No existe.'}), 404
            alcance, obra, version, historia, pasos_viejos, nombre_viejo = actual

            if obra:
                corte = guardia_de_obra(obra, 'modificar un flujo de revisión')
                if corte:
                    return corte
            corte = _puede_definir(cur, alcance, obra, 'modificar un flujo de revisión')
            if corte:
                return corte

            pasos = data.get('pasos', pasos_viejos)
            mal = plt.validar_pasos(pasos, alcance)
            if mal:
                return jsonify({'error': mal, 'code': 'PASOS_INVALIDOS'}), 400
            nombre = (data.get('nombre') or nombre_viejo).strip()

            nueva_version = version + 1
            historia = list(historia or []) + [{
                'event': 'modified', 'by': _actor(), 'version': nueva_version,
                'motivo': (data.get('motivo') or '').strip() or None}]
            cur.execute("""UPDATE doc_review_plantillas
                              SET nombre=%s, descripcion=%s, pasos=%s,
                                  version=%s, modificado_por=%s,
                                  modificado_en=CURRENT_TIMESTAMP, history=%s
                            WHERE id=%s""",
                        (nombre, (data.get('descripcion') or '').strip() or None,
                         json.dumps(pasos), nueva_version, _usuario().get('id'),
                         json.dumps(historia), pid))
            conn.commit()
            cur.execute('SELECT %s FROM doc_review_plantillas WHERE id=%%s' % _COLS, (pid,))
            cur2 = conn.cursor()
            cur2.execute('SELECT count(*) FROM doc_reviews WHERE plantilla_id=%s', (pid,))
            return jsonify(_fila(cur.fetchone(), cur2.fetchone()[0]))
    except Exception as e:
        logger.error('modificar plantilla %s: %s', pid, e)
        return jsonify({'error': 'No se pudo modificar.'}), 500


@plantillas_revision_bp.route('/<int:pid>/activa', methods=['POST'])
def activar(pid):
    """Habilita o deshabilita. NO borra: una plantilla que se aplicó a treinta
    revisiones es parte de cómo se gobernó esta obra."""
    quiere = bool((request.get_json(silent=True) or {}).get('activa', True))
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT alcance, project_id, history FROM doc_review_plantillas '
                    ' WHERE id=%s', (pid,))
        actual = cur.fetchone()
        if not actual:
            return jsonify({'error': 'No existe.'}), 404
        alcance, obra, historia = actual
        if obra:
            corte = guardia_de_obra(obra, 'habilitar o deshabilitar un flujo')
            if corte:
                return corte
        corte = _puede_definir(cur, alcance, obra, 'habilitar o deshabilitar un flujo')
        if corte:
            return corte
        historia = list(historia or []) + [
            {'event': 'enabled' if quiere else 'disabled', 'by': _actor()}]
        cur.execute('UPDATE doc_review_plantillas SET activa=%s, modificado_por=%s, '
                    '       modificado_en=CURRENT_TIMESTAMP, history=%s WHERE id=%s',
                    (quiere, _usuario().get('id'), json.dumps(historia), pid))
        conn.commit()
        cur.execute('SELECT %s FROM doc_review_plantillas WHERE id=%%s' % _COLS, (pid,))
        return jsonify(_fila(cur.fetchone()))


# ── PREVISUALIZAR LA APLICACION ────────────────────────────────────────────

@plantillas_revision_bp.route('/<int:pid>/resolver', methods=['GET'])
def previsualizar(pid):
    """Qué pasos saldrían al aplicarla EN ESTA OBRA. Solo lee.

    Existe porque una plantilla de entidad designa FUNCIONES, y hasta que no se
    resuelve contra los miembros de una obra concreta nadie sabe en quién va a
    caer. Enseñarlo antes de abrir la revisión evita descubrirlo cuando ya está
    abierta y hay un encargo circulando.
    """
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'previsualizar un flujo de revisión')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT %s FROM doc_review_plantillas WHERE id=%%s' % _COLS, (pid,))
        r = cur.fetchone()
        if not r:
            return jsonify({'error': 'No existe.'}), 404
        p = _fila(r)
        if p['alcance'] == plt.OBRA and p['project_id'] != obra:
            return jsonify({'error': 'Esa plantilla es de otra obra.',
                            'code': 'OTRA_OBRA'}), 409
        if not p['activa']:
            return jsonify({'error': 'Esa plantilla está deshabilitada.',
                            'code': 'PLANTILLA_DESACTIVADA'}), 409
        res = plt.resolver(cur, p, obra)
        if res.error:
            return jsonify({'error': res.error, 'code': res.code,
                            'opciones': res.opciones}), 409
        return jsonify({'pasos': res.pasos, 'plantilla': plt.procedencia(p)})
