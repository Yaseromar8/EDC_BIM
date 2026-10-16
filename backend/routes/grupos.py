"""Grupos de documentos (15-oct-2026).

Los documentos VIVEN en sus carpetas; un grupo solo APUNTA a ellos, como «anclar» en Windows. Cada persona
arma los suyos («Valorización octubre», «Lo que uso en campo») y un administrador de la obra puede crear
grupos DE LA OBRA, que ven todos («Contractuales»). Cada documento del grupo abre la versión vigente o una
versión fija (p. ej. «el presupuesto del contrato, V1»).

No son los Conjuntos (routes/sets.py): esos son fotos congeladas de una entrega y siguen como están.

Seguridad, igual que el resto del portal:
- la obra del grupo sale del propio grupo, nunca de la petición;
- un grupo personal solo lo ve su dueño; uno de la obra, quien pertenece a la obra;
- un documento solo se ENSEÑA dentro de un grupo si el usuario puede abrirlo en su carpeta (ni su nombre
  sale si no): pertenecer a un grupo no concede acceso.
"""
import uuid

from flask import Blueprint, g, jsonify, request

from db import get_db_connection
from esquema_congelado import solo_con_ddl
from folder_permissions import check_folder_permission
from perimetro_de_obra import guardia_de_recurso


grupos_bp = Blueprint('grupos_bp', __name__)

NOMBRE_MAX = 80
NUEVA_DIAS = 7          # «nueva versión» = la vigente se subió hace menos de 7 días


@solo_con_ddl
def ensure_grupos_tables():
    """Esquema base para instalaciones nuevas; producción usa la migración 35."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS grupos_de_documentos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            model_urn TEXT NOT NULL,
            nombre TEXT NOT NULL,
            owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_by_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())''')
        cur.execute('''CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_nombre
            ON grupos_de_documentos (model_urn, COALESCE(owner_id, 0), lower(nombre))''')
        cur.execute('''CREATE TABLE IF NOT EXISTS grupo_documentos (
            grupo_id UUID NOT NULL REFERENCES grupos_de_documentos(id) ON DELETE CASCADE,
            file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
            version_id UUID REFERENCES file_versions(id) ON DELETE SET NULL,
            added_by_id INTEGER REFERENCES users(id),
            added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (grupo_id, file_node_id))''')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _uid():
    try:
        return int(_user().get('id'))
    except (TypeError, ValueError):
        return None


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None


def _error(message, status):
    return jsonify({'success': False, 'error': message}), status


def _hay_acceso(model_urn):
    """¿La sesión pertenece a esta obra? Mismo criterio que Conjuntos y Revisiones."""
    from routes.documents import verify_project_access
    return verify_project_access(getattr(g, 'current_user', None), model_urn)


def _es_admin(obra):
    import administracion_de_obra as adm
    with get_db_connection() as conn:
        return adm.es_admin_de_obra(conn.cursor(), _user(), obra)


def _guardia_del_grupo(gid, para_escribir=False):
    """(grupo, negativa). Un grupo ajeno y personal se responde como inexistente: no se confirma que exista."""
    grupo_id = _uuid(gid)
    if not grupo_id:
        return None, _error('Grupo no válido.', 400)
    if not _uid():
        return None, _error('Autenticación requerida.', 401)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, model_urn, nombre, owner_id FROM grupos_de_documentos WHERE id = %s', (grupo_id,))
        fila = cur.fetchone()
    if not fila:
        return None, _error('Grupo no encontrado.', 404)
    grupo = {'id': str(fila[0]), 'obra': fila[1], 'nombre': fila[2], 'owner_id': fila[3]}
    denied = guardia_de_recurso('grupos_de_documentos', grupo['id'])
    if denied:
        return None, denied
    if not _hay_acceso(grupo['obra']):
        return None, _error('No tienes acceso a esta obra.', 403)
    if grupo['owner_id'] is not None and grupo['owner_id'] != _uid():
        return None, _error('Grupo no encontrado.', 404)
    if para_escribir and grupo['owner_id'] is None and not _es_admin(grupo['obra']):
        return None, _error('Solo un administrador de la obra cambia un grupo de la obra.', 403)
    return grupo, None


def _documento(node_id, obra):
    """(documento, negativa): un FICHERO de la obra del grupo que el usuario puede abrir."""
    nid = _uuid(node_id)
    if not nid:
        return None, _error('Documento no válido.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT model_urn, node_type, current_version_id FROM file_nodes
                        WHERE id = %s AND NOT is_deleted''', (nid,))
        fila = cur.fetchone()
    if not fila or fila[1] != 'FILE' or fila[0] != obra:
        return None, _error('Documento no encontrado en esta obra.', 404)
    denied = check_folder_permission(_user(), nid, obra, 'viewer', 'añadirlo a un grupo')
    if denied:
        return None, denied
    return {'id': nid, 'version_actual': str(fila[2]) if fila[2] else None}, None


def _ruta(cur, node_id):
    """Las carpetas que contienen el documento, de arriba abajo y sin la raíz («Vive en»): [(id, nombre)]."""
    cur.execute('''WITH RECURSIVE sube(id, parent_id, name, folder_type, n) AS (
                       SELECT id, parent_id, name, folder_type, 0 FROM file_nodes WHERE id = %s
                       UNION ALL
                       SELECT p.id, p.parent_id, p.name, p.folder_type, s.n + 1 FROM file_nodes p
                         JOIN sube s ON p.id = s.parent_id WHERE s.n < 30)
                   SELECT id, name FROM sube
                    WHERE n > 0 AND folder_type IS DISTINCT FROM 'PROJECT_ROOT'
                    ORDER BY n DESC''', (node_id,))
    return [(str(r[0]), r[1]) for r in cur.fetchall()]


@grupos_bp.route('/api/docs/grupos', methods=['GET', 'POST'])
def grupos():
    """GET ?model_urn=… → mis grupos y los de la obra. POST {model_urn, nombre, de_la_obra} → crea uno."""
    if not _uid():
        return _error('Autenticación requerida.', 401)
    if request.method == 'GET':
        obra = request.args.get('model_urn') or ''
        if not obra or not _hay_acceso(obra):
            return _error('No tienes acceso a esta obra.', 403)
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('''SELECT gr.id, gr.nombre, gr.owner_id, COUNT(gd.file_node_id),
                                  COUNT(gd.file_node_id) FILTER (
                                      WHERE gd.version_id IS NULL
                                        AND v.created_at > now() - make_interval(days => %s))
                             FROM grupos_de_documentos gr
                             LEFT JOIN grupo_documentos gd ON gd.grupo_id = gr.id
                             LEFT JOIN file_nodes n ON n.id = gd.file_node_id AND NOT n.is_deleted
                             LEFT JOIN file_versions v ON v.id = n.current_version_id
                            WHERE gr.model_urn = %s AND (gr.owner_id IS NULL OR gr.owner_id = %s)
                            GROUP BY gr.id
                            ORDER BY (gr.owner_id IS NOT NULL), lower(gr.nombre)''', (NUEVA_DIAS, obra, _uid()))
            lista = [{'id': str(r[0]), 'nombre': r[1], 'de_la_obra': r[2] is None,
                      'documentos': r[3], 'con_version_nueva': r[4]} for r in cur.fetchall()]
        resp = jsonify({'success': True, 'grupos': lista, 'puede_crear_de_la_obra': _es_admin(obra)})
        resp.headers['Cache-Control'] = 'private, no-store'
        return resp

    data = request.get_json(silent=True) or {}
    obra = str(data.get('model_urn') or '')
    nombre = ' '.join(str(data.get('nombre') or '').split())
    de_la_obra = bool(data.get('de_la_obra'))
    if not obra or not _hay_acceso(obra):
        return _error('No tienes acceso a esta obra.', 403)
    if not nombre or len(nombre) > NOMBRE_MAX:
        return _error('Pon un nombre de 1 a %d caracteres.' % NOMBRE_MAX, 400)
    if de_la_obra and not _es_admin(obra):
        return _error('Solo un administrador de la obra crea grupos de la obra.', 403)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT 1 FROM grupos_de_documentos
                        WHERE model_urn = %s AND COALESCE(owner_id, 0) = %s AND lower(nombre) = lower(%s)''',
                    (obra, 0 if de_la_obra else _uid(), nombre))
        if cur.fetchone():
            return _error('Ya tienes un grupo con ese nombre.', 409)
        cur.execute('''INSERT INTO grupos_de_documentos (model_urn, nombre, owner_id, created_by_id)
                       VALUES (%s, %s, %s, %s) RETURNING id''',
                    (obra, nombre, None if de_la_obra else _uid(), _uid()))
        gid = str(cur.fetchone()[0])
        conn.commit()
    return jsonify({'success': True, 'id': gid, 'nombre': nombre, 'de_la_obra': de_la_obra}), 201


@grupos_bp.route('/api/docs/grupos/<gid>', methods=['DELETE'])
def grupo(gid):
    """Borra el grupo. Los documentos NO se tocan: solo se quitan los punteros."""
    grupo, denied = _guardia_del_grupo(gid, para_escribir=True)
    if denied:
        return denied
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM grupos_de_documentos WHERE id = %s', (grupo['id'],))
        conn.commit()
    return jsonify({'success': True})


@grupos_bp.route('/api/docs/grupos/<gid>/documentos', methods=['GET', 'POST'])
def documentos_del_grupo(gid):
    """GET → los documentos del grupo que el usuario puede abrir. POST {node_id, fijar} → añade uno."""
    grupo, denied = _guardia_del_grupo(gid, para_escribir=request.method == 'POST')
    if denied:
        return denied

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        doc, denied = _documento(data.get('node_id'), grupo['obra'])
        if denied:
            return denied
        version = doc['version_actual'] if data.get('fijar') else None
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('''INSERT INTO grupo_documentos (grupo_id, file_node_id, version_id, added_by_id)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (grupo_id, file_node_id) DO NOTHING''',
                        (grupo['id'], doc['id'], version, _uid()))
            nuevo = cur.rowcount
            conn.commit()
        return jsonify({'success': True, 'ya_estaba': not nuevo}), (201 if nuevo else 200)

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT n.id, n.name, n.model_urn, n.status, n.codigo_revision, n.codigo_idoneidad,
                              n.gcs_urn, n.mime_type, n.metadata, n.updated_at,
                              v.id, v.version_number, v.created_at,
                              f.id, f.version_number, f.gcs_urn, f.codigo_revision, f.created_at, f.created_by,
                              gd.added_at
                         FROM grupo_documentos gd
                         JOIN file_nodes n ON n.id = gd.file_node_id AND NOT n.is_deleted
                         LEFT JOIN file_versions v ON v.id = n.current_version_id
                         LEFT JOIN file_versions f ON f.id = gd.version_id
                        WHERE gd.grupo_id = %s
                        ORDER BY gd.added_at''', (grupo['id'],))
        filas = cur.fetchall()
        documentos = []
        for r in filas:
            # Un grupo NO concede acceso: lo que el usuario no puede abrir no se enseña (ni su nombre).
            if check_folder_permission(_user(), str(r[0]), r[2], 'viewer', 'verlo') is not None:
                continue
            carpetas = _ruta(cur, str(r[0]))
            ruta = [nombre for _, nombre in carpetas]
            fijo = ({'id': str(r[13]), 'version_number': r[14], 'gcs_urn': r[15], 'codigo_revision': r[16],
                     'updated': r[17].isoformat() if r[17] else None, 'updated_by': r[18]}
                    if r[13] else None)
            documentos.append({
                'file': {'id': str(r[0]), 'type': 'file', 'name': r[1], 'fullName': '/'.join([r[2]] + ruta + [r[1]]),
                         'status': r[3], 'codigo_revision': r[4], 'codigo_idoneidad': r[5], 'gcs_urn': r[6],
                         'mime_type': r[7], 'metadata': r[8] or {}, 'version': r[11],
                         'version_id': str(r[10]) if r[10] else None,
                         'updated': r[9].isoformat() if r[9] else None},
                'ruta': ruta,
                'carpeta_id': carpetas[-1][0] if carpetas else None,     # para «Vive en» → ir a la carpeta
                'version_vigente': r[11],
                'fijo': fijo,
                'nueva_version': bool(not fijo and r[12] and _reciente(r[12])),
                'vigente_desde': r[12].isoformat() if r[12] else None,
            })
    resp = jsonify({'success': True, 'grupo': {'id': grupo['id'], 'nombre': grupo['nombre'],
                                               'de_la_obra': grupo['owner_id'] is None},
                    'documentos': documentos})
    resp.headers['Cache-Control'] = 'private, no-store'
    return resp


def _reciente(cuando):
    from datetime import datetime, timedelta, timezone
    ahora = datetime.now(cuando.tzinfo or timezone.utc)
    return cuando > ahora - timedelta(days=NUEVA_DIAS)


@grupos_bp.route('/api/docs/grupos/<gid>/documentos/<node_id>', methods=['DELETE', 'PATCH'])
def documento_del_grupo(gid, node_id):
    """DELETE → lo quita del grupo (el documento no se toca). PATCH {fijar: true|false} → fija o sigue la vigente."""
    grupo, denied = _guardia_del_grupo(gid, para_escribir=True)
    if denied:
        return denied
    nid = _uuid(node_id)
    if not nid:
        return _error('Documento no válido.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        if request.method == 'DELETE':
            cur.execute('DELETE FROM grupo_documentos WHERE grupo_id = %s AND file_node_id = %s', (grupo['id'], nid))
        else:
            data = request.get_json(silent=True) or {}
            if 'fijar' not in data:
                return _error('Indica si se fija o sigue la vigente.', 400)
            if data.get('fijar'):
                cur.execute('''UPDATE grupo_documentos gd SET version_id = n.current_version_id
                                 FROM file_nodes n
                                WHERE gd.grupo_id = %s AND gd.file_node_id = %s AND n.id = gd.file_node_id''',
                            (grupo['id'], nid))
            else:
                cur.execute('UPDATE grupo_documentos SET version_id = NULL WHERE grupo_id = %s AND file_node_id = %s',
                            (grupo['id'], nid))
        cambiados = cur.rowcount
        conn.commit()
    if not cambiados:
        return _error('Ese documento no está en el grupo.', 404)
    return jsonify({'success': True})
