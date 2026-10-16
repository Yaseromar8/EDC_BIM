"""Sustento de metrados: una zona de un plano sustenta una cantidad de una partida.

Estándar LDA, capa 3 (docs/ux/ESTANDAR_LDA.md §6; LECTOR_ALEPHIA_ESTANDAR.md §17 y §21):

- La LLAVE es el ítem de la partida («02.01.03»), no la fila de un Excel: la planilla se
  actualiza a diario y el ítem sigue siendo el mismo.
- La zona va FIJADA a la versión del plano sobre la que se midió. Si el plano tiene una versión
  más nueva, el vínculo no se mueve solo: se avisa («se midió sobre la V1; la vigente es la V2»).
- La zona se guarda en FRACCIONES de la página (0–1), así no depende del zoom ni del tamaño.

Cada ruta comprueba el perímetro de obra Y el permiso de la carpeta del plano: un vínculo nunca
enseña un plano que el usuario no puede abrir (ni su nombre).
"""
import json
import math
import re
import uuid

from flask import Blueprint, g, jsonify, request

from db import get_db_connection
from esquema_congelado import solo_con_ddl
from folder_permissions import check_folder_permission
from perimetro_de_obra import guardia_de_recurso


sustento_bp = Blueprint('sustento_bp', __name__)

ITEM_VALIDO = re.compile(r'^[0-9A-Za-z][0-9A-Za-z._\-]{0,39}$')
TOPE_LISTA = 2000


@solo_con_ddl
def ensure_sustento_table():
    """Esquema base para instalaciones nuevas; producción usa la migración 34."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS vinculos_de_sustento (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            model_urn TEXT NOT NULL,
            item TEXT NOT NULL,
            cantidad NUMERIC(18,4),
            unidad TEXT,
            file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
            version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            pagina INTEGER NOT NULL DEFAULT 1,
            zona JSONB NOT NULL,
            nota TEXT,
            planilla_node_id UUID REFERENCES file_nodes(id) ON DELETE SET NULL,
            vista TEXT,
            vista_nombre TEXT,
            created_by_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ,
            deleted_by_id INTEGER REFERENCES users(id))''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_sustento_item
            ON vinculos_de_sustento(model_urn, item) WHERE deleted_at IS NULL''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_sustento_plano
            ON vinculos_de_sustento(file_node_id) WHERE deleted_at IS NULL''')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None


def _error(message, status):
    return jsonify({'success': False, 'error': message}), status


def _node(node_id, required='viewer'):
    """(documento, negativa). Perímetro de obra Y permiso de la carpeta del documento."""
    nid = _uuid(node_id)
    if not nid:
        return None, _error('Documento no válido.', 400)
    if not _user().get('id'):
        return None, _error('Autenticación requerida.', 401)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT n.model_urn, n.node_type, n.name, v.version_number
                         FROM file_nodes n
                         LEFT JOIN file_versions v ON v.id = n.current_version_id
                        WHERE n.id = %s AND NOT n.is_deleted''', (nid,))
        row = cur.fetchone()
    if not row or row[1] != 'FILE':
        return None, _error('Documento no encontrado.', 404)
    denied = guardia_de_recurso('file_nodes', nid)
    if denied:
        return None, denied
    denied = check_folder_permission(_user(), nid, row[0], required, 'ver el sustento de metrados')
    if denied:
        return None, denied
    return {'id': nid, 'project': row[0], 'name': row[2], 'vigente': row[3]}, None


def _version(node, supplied):
    """(id, número) de una versión que de verdad es de este documento, o (None, None)."""
    vid = _uuid(supplied)
    with get_db_connection() as conn:
        cur = conn.cursor()
        if vid:
            cur.execute('SELECT id, version_number FROM file_versions WHERE id = %s AND file_node_id = %s',
                        (vid, node['id']))
        else:
            cur.execute('''SELECT v.id, v.version_number FROM file_nodes n
                             JOIN file_versions v ON v.id = n.current_version_id
                            WHERE n.id = %s''', (node['id'],))
        row = cur.fetchone()
    return (str(row[0]), int(row[1])) if row else (None, None)


def _zona(value, en_dibujo=False):
    """[x0, y0, x1, y1] con x0 < x1 e y0 < y1.

    En un PDF, en fracciones de la página (0–1). En un DWG (`en_dibujo`), en las coordenadas de la vista
    del dibujo: no van de 0 a 1, pero siguen en su sitio aunque la presentación cambie de tamaño.
    """
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    nums = []
    for v in value:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            return None
        nums.append(round(float(v), 6 if en_dibujo else 5))
    x0, y0, x1, y1 = nums
    if en_dibujo:
        if not (x0 < x1 and y0 < y1 and all(abs(n) < 1e10 for n in nums)):
            return None
        return nums
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        return None
    return nums


VISTA_VALIDA = re.compile(r'^[\w.:\-]{1,120}$')


def _vista(data):
    """(guid, nombre) de la vista 2D de un DWG, o (None, None) si es un PDF. Nombre recortado a 120."""
    guid = str(data.get('vista') or '').strip()
    if not guid:
        return None, None
    if not VISTA_VALIDA.match(guid):
        return False, None
    return guid, (str(data.get('vista_nombre') or '').strip()[:120] or None)


def _cantidad(value):
    if value is None or value == '':
        return None, True
    if isinstance(value, bool):
        return None, False
    try:
        n = float(str(value).replace(',', '.')) if isinstance(value, str) else float(value)
    except (TypeError, ValueError):
        return None, False
    if not math.isfinite(n) or abs(n) >= 1e13:
        return None, False
    return round(n, 4), True


def _fila(r, actor):
    return {'id': str(r[0]), 'item': r[1],
            'cantidad': float(r[2]) if r[2] is not None else None, 'unidad': r[3],
            'file_node_id': str(r[4]), 'plano': r[5], 'version_number': r[6],
            'version_vigente': r[7], 'pagina': r[8], 'zona': r[9], 'nota': r[10],
            'autor': r[11], 'mio': str(r[12]) == str(actor),
            'creado': r[13].isoformat() if r[13] else None,
            # La versión medida, para abrir el plano tal como estaba al medir.
            'version_id': str(r[14]) if len(r) > 14 and r[14] else None,
            # La planilla de origen, si el vínculo se hizo desde un Excel.
            'planilla_node_id': str(r[15]) if len(r) > 15 and r[15] else None,
            # En un DWG: la vista donde se marcó (la zona va en coordenadas del dibujo).
            'vista': r[16] if len(r) > 16 else None,
            'vista_nombre': r[17] if len(r) > 17 else None}


_SELECT = '''SELECT s.id, s.item, s.cantidad, s.unidad, s.file_node_id, n.name,
                    s.version_number, vv.version_number, s.pagina, s.zona, s.nota,
                    u.name, s.created_by_id, s.created_at, s.version_id, s.planilla_node_id,
                    s.vista, s.vista_nombre
               FROM vinculos_de_sustento s
               JOIN file_nodes n ON n.id = s.file_node_id AND NOT n.is_deleted
               LEFT JOIN file_versions vv ON vv.id = n.current_version_id
               LEFT JOIN users u ON u.id = s.created_by_id
              WHERE s.deleted_at IS NULL'''


@sustento_bp.route('/api/docs/sustento', methods=['GET'])
def listar_sustento():
    """?node_id=<documento>&ambito=documento|obra.

    documento: los vínculos de ESTE plano (lo que sale de él).
    obra: todos los vínculos de la obra del documento (para una planilla: de dónde sale cada ítem),
    sin los de planos que el usuario no puede abrir.
    """
    node, denied = _node(request.args.get('node_id'))
    if denied:
        return denied
    ambito = (request.args.get('ambito') or 'documento').strip()
    if ambito not in ('documento', 'obra'):
        return _error('Ámbito no válido.', 400)
    actor = _user()['id']
    with get_db_connection() as conn:
        cur = conn.cursor()
        if ambito == 'documento':
            cur.execute(_SELECT + ' AND s.file_node_id = %s ORDER BY s.item, s.created_at LIMIT %s',
                        (node['id'], TOPE_LISTA))
        else:
            cur.execute(_SELECT + ' AND s.model_urn = %s ORDER BY s.item, s.created_at LIMIT %s',
                        (node['project'], TOPE_LISTA))
        filas = [_fila(r, actor) for r in cur.fetchall()]
    if ambito == 'obra':
        # Un vínculo NO concede acceso a su plano: se quitan los de carpetas sin permiso.
        permitidos = {}
        visibles = []
        for f in filas:
            pid = f['file_node_id']
            if pid not in permitidos:
                permitidos[pid] = _node(pid)[1] is None
            if permitidos[pid]:
                visibles.append(f)
        filas = visibles
    response = jsonify({'success': True, 'vinculos': filas, 'ambito': ambito})
    response.headers['Cache-Control'] = 'private, no-store'
    return response


@sustento_bp.route('/api/docs/sustento', methods=['POST'])
def crear_sustento():
    data = request.get_json(silent=True) or {}
    node, denied = _node(data.get('node_id'), 'view_markup')
    if denied:
        return denied
    version_id, version_number = _version(node, data.get('version_id'))
    item = str(data.get('item') or '').strip()
    vista, vista_nombre = _vista(data)
    if vista is False:
        return _error('La vista del plano no es válida.', 400)
    zona = _zona(data.get('zona'), en_dibujo=bool(vista))
    cantidad, cantidad_ok = _cantidad(data.get('cantidad'))
    unidad = str(data.get('unidad') or '').strip()[:12] or None
    nota = str(data.get('nota') or '').strip()
    try:
        pagina = 1 if data.get('pagina') is None else int(data.get('pagina'))
    except (TypeError, ValueError):
        pagina = 0
    if not version_id:
        return _error('La versión no es de este documento.', 400)
    if not ITEM_VALIDO.match(item):
        return _error('Indica el ítem de la partida (por ejemplo 02.01.03).', 400)
    if not zona:
        return _error('La zona del plano no es válida.', 400)
    if not cantidad_ok:
        return _error('La cantidad no es un número.', 400)
    if pagina < 1 or pagina > 100000:
        return _error('La página no es válida.', 400)
    if len(nota) > 500:
        return _error('La nota es demasiado larga.', 400)
    planilla = None
    if data.get('planilla_node_id'):
        planilla_doc, denied = _node(data.get('planilla_node_id'))
        if denied:
            return denied
        if planilla_doc['project'] != node['project']:
            return _error('La planilla no es de la misma obra que el plano.', 400)
        planilla = planilla_doc['id']
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''INSERT INTO vinculos_de_sustento
                         (model_urn, item, cantidad, unidad, file_node_id, version_id,
                          version_number, pagina, zona, nota, created_by_id, planilla_node_id,
                          vista, vista_nombre)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                    (node['project'], item, cantidad, unidad, node['id'], version_id,
                     version_number, pagina, json.dumps(zona), nota or None, _user()['id'],
                     planilla, vista, vista_nombre))
        vid = str(cur.fetchone()[0])
        conn.commit()
    return jsonify({'success': True, 'id': vid, 'version_number': version_number}), 201


@sustento_bp.route('/api/docs/sustento/<vid>', methods=['DELETE'])
def borrar_sustento(vid):
    """Solo su autor lo retira; queda en la tabla (deleted_at) para la traza."""
    sid = _uuid(vid)
    if not sid:
        return _error('Vínculo no válido.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT file_node_id, created_by_id FROM vinculos_de_sustento
                        WHERE id = %s AND deleted_at IS NULL''', (sid,))
        row = cur.fetchone()
    if not row:
        return _error('Vínculo no encontrado.', 404)
    denied = guardia_de_recurso('vinculos_de_sustento', sid)
    if denied:
        return denied
    _, denied = _node(row[0], 'view_markup')
    if denied:
        return denied
    if str(row[1]) != str(_user().get('id')):
        return _error('Solo quien creó el vínculo puede retirarlo.', 403)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''UPDATE vinculos_de_sustento SET deleted_at = now(), deleted_by_id = %s
                        WHERE id = %s AND deleted_at IS NULL''', (_user()['id'], sid))
        conn.commit()
    return jsonify({'success': True})
