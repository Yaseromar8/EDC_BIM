"""Revisión propia de ALEPHIA Docs sobre vistas CAD 2D.

El original y la traducción Autodesk son inmutables: estas marcas viven en
PostgreSQL y sus fotos privadas en GCS. Ningún endpoint escribe en ACC.
"""
import io
import json
import math
import uuid

from flask import Blueprint, Response, g, jsonify, request

from db import get_db_connection
from esquema_congelado import solo_con_ddl
from folder_permissions import check_folder_permission
from perimetro_de_obra import guardia_de_recurso


cad_review_bp = Blueprint('cad_review_bp', __name__)
KINDS = frozenset(('cloud', 'text', 'photo'))
REF_KINDS = frozenset(('plan', 'file', 'photo'))
PHOTO_LIMIT = 16 * 1024 * 1024


@solo_con_ddl
def ensure_cad_review_tables():
    """Esquema base para instalaciones nuevas; producción usa migración 33."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS cad_review_marks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
            version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
            view_guid TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('cloud', 'text', 'photo')),
            geometry JSONB NOT NULL,
            text_content TEXT,
            created_by_id INTEGER NOT NULL REFERENCES users(id),
            published BOOLEAN NOT NULL DEFAULT FALSE,
            published_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ,
            deleted_by_id INTEGER REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_cad_review_visible
            ON cad_review_marks(file_node_id, version_id, view_guid, published)''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_cad_review_author
            ON cad_review_marks(created_by_id) WHERE NOT published''')
        cur.execute('''CREATE TABLE IF NOT EXISTS cad_review_attachments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            mark_id UUID NOT NULL REFERENCES cad_review_marks(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('plan', 'file', 'photo')),
            file_node_id UUID REFERENCES file_nodes(id) ON DELETE RESTRICT,
            storage_object TEXT,
            name TEXT NOT NULL,
            mime_type TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ,
            deleted_by_id INTEGER REFERENCES users(id),
            CONSTRAINT cad_review_attachment_source CHECK (
              (file_node_id IS NOT NULL AND storage_object IS NULL) OR
              (file_node_id IS NULL AND storage_object IS NOT NULL)))''')
        cur.execute('''ALTER TABLE cad_review_attachments
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS deleted_by_id INTEGER REFERENCES users(id)''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_cad_review_attachment_mark
            ON cad_review_attachments(mark_id)''')
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
    """Devuelve (fila, negativa). Perímetro de obra Y permiso de carpeta."""
    nid = _uuid(node_id)
    if not nid:
        return None, _error('Documento no válido.', 400)
    if not _user().get('id'):
        return None, _error('Autenticación requerida.', 401)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT model_urn, node_type, current_version_id, name,
                              gcs_urn, mime_type FROM file_nodes
                        WHERE id = %s AND NOT is_deleted''', (nid,))
        row = cur.fetchone()
    if not row or row[1] != 'FILE':
        return None, _error('Documento no encontrado.', 404)
    denied = guardia_de_recurso('file_nodes', nid)
    if denied:
        return None, denied
    denied = check_folder_permission(_user(), nid, row[0], required,
                                      'revisar este plano')
    if denied:
        return None, denied
    return {'id': nid, 'project': row[0], 'version': row[2],
            'name': row[3], 'gcs_urn': row[4], 'mime': row[5]}, None


def _mark(mark_id, required='viewer', owner=False):
    mid = _uuid(mark_id)
    if not mid:
        return None, _error('Marca no válida.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT id, file_node_id, version_id, view_guid, kind,
                              geometry, text_content, created_by_id, published,
                              created_at, updated_at
                         FROM cad_review_marks
                        WHERE id = %s AND deleted_at IS NULL''', (mid,))
        row = cur.fetchone()
    if not row:
        return None, _error('Marca no encontrada.', 404)
    _, denied = _node(row[1], required)
    if denied:
        return None, denied
    actor = _user().get('id')
    if owner and str(row[7]) != str(actor):
        return None, _error('Sólo el autor puede modificar esta marca.', 403)
    if not owner and not row[8] and str(row[7]) != str(actor):
        return None, _error('Marca no encontrada.', 404)
    return {'id': str(row[0]), 'file_node_id': str(row[1]),
            'version_id': str(row[2]), 'view_guid': row[3], 'kind': row[4],
            'geometry': row[5], 'text': row[6], 'created_by_id': row[7],
            'published': bool(row[8]), 'created_at': row[9].isoformat(),
            'updated_at': row[10].isoformat()}, None


def _geometry(kind, value):
    if not isinstance(value, dict):
        return None
    keys = ('x', 'y', 'w', 'h') if kind == 'cloud' else ('x', 'y')
    if any(not isinstance(value.get(k), (int, float)) or
           isinstance(value.get(k), bool) or
           not math.isfinite(value[k]) or abs(value[k]) > 1e12 for k in keys):
        return None
    if kind == 'cloud' and (value['w'] <= 0 or value['h'] <= 0):
        return None
    result = {key: float(value[key]) for key in keys}
    if 'z' in value:
        if (not isinstance(value['z'], (int, float)) or isinstance(value['z'], bool)
                or not math.isfinite(value['z']) or abs(value['z']) > 1e12):
            return None
        result['z'] = float(value['z'])
    return result


def _version(node, supplied):
    vid = _uuid(supplied or node['version'])
    if not vid:
        return None
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT 1 FROM file_versions WHERE id = %s AND file_node_id = %s',
                    (vid, node['id']))
        return vid if cur.fetchone() else None


@cad_review_bp.route('/api/docs/cad/reviews', methods=['GET'])
def list_marks():
    node, denied = _node(request.args.get('node_id'))
    if denied:
        return denied
    version = _version(node, request.args.get('version_id'))
    view = (request.args.get('view_guid') or '').strip()
    if not version or not view or len(view) > 200:
        return _error('Indica una versión y vista válidas.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT m.id, m.kind, m.geometry, m.text_content,
                              m.created_by_id, u.name, m.published,
                              m.created_at, m.updated_at
                         FROM cad_review_marks m
                         JOIN users u ON u.id = m.created_by_id
                        WHERE m.file_node_id = %s AND m.version_id = %s
                          AND m.view_guid = %s AND m.deleted_at IS NULL
                          AND (m.published OR m.created_by_id = %s)
                        ORDER BY m.created_at, m.id''',
                    (node['id'], version, view, _user()['id']))
        rows = cur.fetchall()
        marks = [{'id': str(r[0]), 'kind': r[1], 'geometry': r[2],
                  'text': r[3], 'created_by_id': r[4], 'created_by': r[5],
                  'mine': str(r[4]) == str(_user()['id']),
                  'published': bool(r[6]),
                  'created_at': r[7].isoformat(), 'updated_at': r[8].isoformat(),
                  'attachments': []} for r in rows]
        if marks:
            cur.execute('''SELECT a.id, a.mark_id, a.kind, a.file_node_id,
                                  a.storage_object, a.name, a.mime_type
                             FROM cad_review_attachments a
                            WHERE a.mark_id = ANY(%s::uuid[])
                              AND a.deleted_at IS NULL
                            ORDER BY a.created_at, a.id''',
                        ([m['id'] for m in marks],))
            by_id = {m['id']: m for m in marks}
            attachments = cur.fetchall()
            for r in attachments:
                ref = {'id': str(r[0]), 'kind': r[2],
                       'file_node_id': str(r[3]) if r[3] else None,
                       'name': r[5], 'mime_type': r[6]}
                by_id[str(r[1])]['attachments'].append(ref)
    # Un enlace publicado NO concede acceso al archivo de destino. Se filtra
    # antes de enviarlo: ni siquiera su nombre debe filtrarse a otra carpeta.
    for m in marks:
        visible = []
        for ref in m['attachments']:
            if ref['file_node_id']:
                _, forbidden = _node(ref['file_node_id'])
                if forbidden:
                    continue
            visible.append(ref)
        m['attachments'] = visible
    response = jsonify({'success': True, 'marks': marks, 'version_id': version})
    response.headers['Cache-Control'] = 'private, no-store'
    return response


@cad_review_bp.route('/api/docs/cad/reviews', methods=['POST'])
def create_mark():
    data = request.get_json(silent=True) or {}
    node, denied = _node(data.get('node_id'), 'view_markup')
    if denied:
        return denied
    version = _version(node, data.get('version_id'))
    kind = data.get('kind')
    view = (data.get('view_guid') or '').strip()
    geometry = _geometry(kind, data.get('geometry'))
    content = (data.get('text') or '').strip()
    if kind not in KINDS or not version or not view or len(view) > 200 or not geometry:
        return _error('Marca, versión o vista no válida.', 400)
    if kind == 'text' and not content:
        return _error('El texto no puede estar vacío.', 400)
    if len(content) > 4000:
        return _error('El texto es demasiado largo.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''INSERT INTO cad_review_marks
                         (file_node_id, version_id, view_guid, kind, geometry,
                          text_content, created_by_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                    (node['id'], version, view, kind, json.dumps(geometry),
                     content or None, _user()['id']))
        mark_id = str(cur.fetchone()[0])
        conn.commit()
    return jsonify({'success': True, 'id': mark_id, 'published': False}), 201


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>', methods=['PATCH'])
def edit_mark(mark_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    geometry = _geometry(mark['kind'], data.get('geometry', mark['geometry']))
    content = (data.get('text', mark['text']) or '').strip()
    if not geometry or len(content) > 4000 or (mark['kind'] == 'text' and not content):
        return _error('Contenido no válido.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''UPDATE cad_review_marks SET geometry=%s, text_content=%s,
                              published=FALSE, published_at=NULL, updated_at=now()
                        WHERE id=%s AND created_by_id=%s AND deleted_at IS NULL''',
                    (json.dumps(geometry), content or None, mark['id'], _user()['id']))
        conn.commit()
    return jsonify({'success': True, 'published': False})


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>/publish', methods=['POST'])
def publish_mark(mark_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    with get_db_connection() as conn:
        cur = conn.cursor()
        if mark['kind'] == 'photo':
            cur.execute('SELECT 1 FROM cad_review_attachments WHERE mark_id=%s AND kind=%s AND deleted_at IS NULL',
                        (mark['id'], 'photo'))
            if not cur.fetchone():
                return _error('Añade una foto antes de publicar.', 400)
        cur.execute('''UPDATE cad_review_marks
                          SET published=TRUE, published_at=now(), updated_at=now()
                        WHERE id=%s AND created_by_id=%s AND deleted_at IS NULL''',
                    (mark['id'], _user()['id']))
        conn.commit()
    return jsonify({'success': True, 'published': True})


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>', methods=['DELETE'])
def delete_mark(mark_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''UPDATE cad_review_marks
                          SET deleted_at=now(), deleted_by_id=%s, published=FALSE,
                              published_at=NULL, updated_at=now()
                        WHERE id=%s AND created_by_id=%s AND deleted_at IS NULL''',
                    (_user()['id'], mark['id'], _user()['id']))
        conn.commit()
    return jsonify({'success': True})


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>/attachments', methods=['POST'])
def add_document_attachment(mark_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    kind = data.get('kind')
    if kind not in REF_KINDS or (mark['kind'] == 'photo') != (kind == 'photo'):
        return _error('Tipo de referencia no válido para esta marca.', 400)
    target, denied = _node(data.get('file_node_id'))
    if denied:
        return denied
    source, denied = _node(mark['file_node_id'])
    if denied:
        return denied
    if target['project'] != source['project']:
        return _error('La referencia debe pertenecer a la misma obra.', 400)
    if kind == 'photo' and not target['name'].lower().endswith(
            ('.jpg', '.jpeg', '.png', '.webp')):
        return _error('El documento elegido no es una imagen.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''INSERT INTO cad_review_attachments
                         (mark_id, kind, file_node_id, name, mime_type)
                       VALUES (%s,%s,%s,%s,%s) RETURNING id''',
                    (mark['id'], kind, target['id'], target['name'], target['mime']))
        attachment_id = str(cur.fetchone()[0])
        # Una referencia nueva aún no fue revisada: vuelve a borrador.
        cur.execute('''UPDATE cad_review_marks SET published=FALSE,
                       published_at=NULL, updated_at=now() WHERE id=%s''',
                    (mark['id'],))
        conn.commit()
    return jsonify({'success': True, 'id': attachment_id, 'published': False}), 201


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>/photos', methods=['POST'])
def upload_photo(mark_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    if mark['kind'] != 'photo':
        return _error('Sólo un marcador de foto recibe imágenes.', 400)
    source = request.files.get('file')
    if not source or not source.filename:
        return _error('Selecciona una foto.', 400)
    raw = source.stream.read(PHOTO_LIMIT + 1)
    if not raw or len(raw) > PHOTO_LIMIT:
        return _error('Foto vacía o mayor de 16 MB.', 413)
    # Decodificar y volver a codificar: se valida el tipo REAL y se elimina el
    # EXIF (incluido GPS) antes de que los bytes toquen GCS.
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return _error('El servidor no tiene el procesador de imágenes.', 503)
    try:
        Image.MAX_IMAGE_PIXELS = 30_000_000
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in ('JPEG', 'PNG', 'WEBP'):
                return _error('Usa JPG, PNG o WEBP.', 400)
            if original.width * original.height > 30_000_000:
                return _error('La foto supera 30 megapíxeles.', 413)
            image = ImageOps.exif_transpose(original).convert('RGB')
            encoded = io.BytesIO()
            image.save(encoded, format='JPEG', quality=90, optimize=True)
        if encoded.getbuffer().nbytes > PHOTO_LIMIT:
            return _error('La foto procesada supera 16 MB.', 413)
        encoded.content_type = 'image/jpeg'
    except (OSError, ValueError, Image.DecompressionBombError):
        return _error('La imagen no se pudo validar.', 400)
    import gcs_manager as gcs
    object_name = ('cad-review/%s/%s/%s.jpg' %
                   (mark['file_node_id'], mark['id'], uuid.uuid4()))
    if not gcs.upload_file_to_gcs(encoded, object_name):
        return _error('No se pudo guardar la foto.', 502)
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('''INSERT INTO cad_review_attachments
                             (mark_id, kind, storage_object, name, mime_type)
                           VALUES (%s,'photo',%s,%s,'image/jpeg') RETURNING id''',
                        (mark['id'], object_name, source.filename[:255]))
            attachment_id = str(cur.fetchone()[0])
            cur.execute('''UPDATE cad_review_marks SET published=FALSE,
                           published_at=NULL, updated_at=now() WHERE id=%s''',
                        (mark['id'],))
            conn.commit()
    except Exception:
        # El único objeto que se retira es el que acaba de crear este intento.
        gcs.delete_gcs_blob(object_name)
        raise
    return jsonify({'success': True, 'id': attachment_id, 'published': False}), 201


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>/attachments/<attachment_id>',
                     methods=['DELETE'])
def delete_attachment(mark_id, attachment_id):
    mark, denied = _mark(mark_id, 'view_markup', owner=True)
    if denied:
        return denied
    aid = _uuid(attachment_id)
    if not aid:
        return _error('Referencia no válida.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''UPDATE cad_review_attachments
                          SET deleted_at=now(), deleted_by_id=%s
                        WHERE id=%s AND mark_id=%s AND deleted_at IS NULL''',
                    (_user()['id'], aid, mark['id']))
        if not cur.rowcount:
            return _error('Referencia no encontrada.', 404)
        cur.execute('''UPDATE cad_review_marks SET published=FALSE,
                       published_at=NULL, updated_at=now() WHERE id=%s''',
                    (mark['id'],))
        conn.commit()
    # El objeto GCS no queda huérfano: su fila conserva el nombre y autor de
    # retirada para auditoría. Una limpieza por retención será una tarea
    # explícita posterior, nunca efecto lateral de editar una marca.
    return jsonify({'success': True, 'published': False})


@cad_review_bp.route('/api/docs/cad/reviews/<mark_id>/photos/<attachment_id>',
                     methods=['GET'])
def read_photo(mark_id, attachment_id):
    mark, denied = _mark(mark_id)
    if denied:
        return denied
    aid = _uuid(attachment_id)
    if not aid:
        return _error('Foto no válida.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT kind, file_node_id, storage_object
                         FROM cad_review_attachments
                        WHERE id=%s AND mark_id=%s AND deleted_at IS NULL''',
                    (aid, mark['id']))
        row = cur.fetchone()
    if not row or row[0] != 'photo':
        return _error('Foto no encontrada.', 404)
    if row[1]:
        target, forbidden = _node(row[1])
        if forbidden:
            return forbidden
        object_name = target['gcs_urn']
    else:
        object_name = row[2]
    if not object_name:
        return _error('La foto ya no tiene archivo.', 404)
    import gcs_manager as gcs
    data, _ = gcs.get_blob_data(object_name)
    if not data:
        return _error('No se pudo abrir la foto.', 502)
    # Nunca reflejar un MIME arbitrario del objeto: un SVG/HTML servido desde
    # nuestro origen podría ejecutar código al abrirse directamente.
    if data.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    elif data.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        mime = 'image/webp'
    else:
        return _error('El archivo vinculado no es una foto compatible.', 415)
    return Response(data, mimetype=mime,
                    headers={'Cache-Control': 'private, no-store',
                             'X-Content-Type-Options': 'nosniff'})
