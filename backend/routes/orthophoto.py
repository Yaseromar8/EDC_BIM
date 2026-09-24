"""Ortofoto publicada por frente: dos JPG inmutables y un puntero activo en GCS.

No convierte ECW ni crea esquema. La publicacion cambia el puntero SOLO despues
de validar y subir ambos mosaicos; retirar la capa no borra sus binarios.
"""

import io
import json
import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request, send_file, url_for
from PIL import Image, UnidentifiedImageError
from google.api_core.exceptions import PreconditionFailed

from administracion_de_obra import es_admin_de_obra
from db import get_db_connection, resolve_project_id
from gcs_manager import get_storage_client
from perimetro_de_obra import guardia_de_obra
from politica import requiere_sesion


orthophoto_bp = Blueprint('orthophoto', __name__)
logger = logging.getLogger(__name__)
_SCOPE = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
_EXPECTED_SIZE = (4000, 5961)
_MAX_BYTES = 35_000_000
_ROOT = 'ortho-fronts/v1'


def _keys(scope):
    base = f'{_ROOT}/{scope}'
    return base, f'{base}/active.json'


def _scope_guard(scope, write=False):
    # La huella UTM y los dos mosaicos de esta unidad sólo sirven a Canal.
    if scope != '1_CANAL' or not _SCOPE.fullmatch(scope) or not resolve_project_id(scope):
        return jsonify({'error': 'Frente no reconocido'}), 404
    denied = guardia_de_obra(scope, 'gestionar ortofoto' if write else 'ver ortofoto')
    if denied:
        return denied
    if write:
        user = getattr(g, 'current_user', None)
        with get_db_connection() as conn:
            allowed = es_admin_de_obra(conn.cursor(), user, scope)
        if not allowed:
            return jsonify({'error': 'Solo un administrador de la obra puede publicar o retirar la ortofoto'}), 403
    return None


def _bucket():
    name = os.environ.get('GCS_BUCKET_NAME')
    if not name or name == 'TU_BUCKET_AQUI':
        raise RuntimeError('Almacenamiento de ortofotos no configurado')
    return get_storage_client().bucket(name)


def _active(bucket, key):
    blob = bucket.get_blob(key)
    if blob is None:
        return None, 0
    data = json.loads(blob.download_as_bytes().decode('utf-8'))
    if not isinstance(data, dict) or 'revision' not in data or 'active' not in data:
        raise ValueError('Manifiesto de ortofoto inválido')
    return data, blob.generation


def _check_revision(current, expected):
    current_revision = current['revision'] if current else ''
    return isinstance(expected, str) and expected == current_revision


def _validate_jpeg(upload):
    if not upload or not upload.filename:
        raise ValueError('Selecciona los mosaicos norte y sur')
    stream = upload.stream
    stream.seek(0, io.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    if not 0 < size <= _MAX_BYTES:
        raise ValueError('Cada mosaico debe medir entre 1 byte y 35 MB')
    try:
        with Image.open(stream) as image:
            if image.format != 'JPEG' or image.size != _EXPECTED_SIZE:
                raise ValueError('Los dos JPG deben conservar la huella de 4000×5961 píxeles')
            image.verify()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError('El archivo no es un JPG válido') from error
    finally:
        stream.seek(0)
    return size


def _visual_value(raw, minimum, maximum, label):
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise ValueError(f'{label} no válido') from error
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{label} fuera de rango')
    return value


def _source_belongs(scope, urn):
    if not isinstance(urn, str) or not urn or len(urn) > 2000:
        return False
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT 1 FROM model_config WHERE app_project_id = %s AND urn = %s LIMIT 1',
                       (scope, urn))
        return cursor.fetchone() is not None


def _write_state(bucket, base, active_key, state, generation):
    payload = json.dumps(state, separators=(',', ':'), sort_keys=True)
    event = bucket.blob(f"{base}/events/{state['revision']}.json")
    event.upload_from_string(payload, content_type='application/json', if_generation_match=0)
    pointer = bucket.blob(active_key)
    pointer.cache_control = 'no-store'
    pointer.upload_from_string(payload, content_type='application/json',
                               if_generation_match=generation)


@orthophoto_bp.route('/api/orthophoto/<scope>', methods=['GET'])
@requiere_sesion
def get_orthophoto(scope):
    denied = _scope_guard(scope)
    if denied:
        return denied
    try:
        bucket = _bucket()
        _, key = _keys(scope)
        state, _ = _active(bucket, key)
        if not state or not state['active']:
            return jsonify({'active': False, 'revision': state['revision'] if state else None})
        base, _ = _keys(scope)
        paths = [state.get('north'), state.get('south')]
        expected = [f"{base}/versions/{state['revision']}/{part}.jpg"
                    for part in ('north', 'south')]
        if any(path != name or not bucket.get_blob(path)
               for path, name in zip(paths, expected)):
            raise ValueError('Mosaico publicado incompleto')
        return jsonify({'active': True, 'revision': state['revision'],
                        'published_at': state['published_at'],
                        'model_urn': state['model_urn'], 'db_id': state['db_id'],
                        'relief_blend': state['relief_blend'],
                        'directional_shade': state['directional_shade'],
                        'north_path': url_for('orthophoto.get_tile', scope=scope,
                                              revision=state['revision'], part='north'),
                        'south_path': url_for('orthophoto.get_tile', scope=scope,
                                              revision=state['revision'], part='south')})
    except Exception:
        logger.exception('No se pudo leer ortofoto del frente')
        return jsonify({'error': 'Ortofoto temporalmente no disponible'}), 503


@orthophoto_bp.route('/api/orthophoto/<scope>/tiles/<revision>/<part>', methods=['GET'])
@requiere_sesion
def get_tile(scope, revision, part):
    denied = _scope_guard(scope)
    if denied:
        return denied
    if part not in ('north', 'south') or not re.fullmatch(r'[a-f0-9]{32}', revision):
        return jsonify({'error': 'Mosaico no reconocido'}), 404
    try:
        bucket = _bucket()
        base, key = _keys(scope)
        state, _ = _active(bucket, key)
        if not state or not state['active'] or state['revision'] != revision:
            return jsonify({'error': 'Esta versión ya no está publicada'}), 404
        path = state.get(part)
        if path != f'{base}/versions/{revision}/{part}.jpg':
            raise ValueError('Mosaico publicado inválido')
        blob = bucket.get_blob(path)
        if blob is None:
            raise ValueError('Mosaico publicado incompleto')
        response = send_file(io.BytesIO(blob.download_as_bytes()), mimetype='image/jpeg',
                             download_name=f'ortofoto-{part}.jpg', as_attachment=False)
        response.cache_control.no_store = True
        return response
    except Exception:
        logger.exception('No se pudo leer mosaico publicado del frente')
        return jsonify({'error': 'Mosaico temporalmente no disponible'}), 503


@orthophoto_bp.route('/api/orthophoto/<scope>/publish', methods=['POST'])
@requiere_sesion
def publish_orthophoto(scope):
    denied = _scope_guard(scope, write=True)
    if denied:
        return denied
    try:
        north = request.files.get('north')
        south = request.files.get('south')
        _validate_jpeg(north)
        _validate_jpeg(south)
        model_urn = request.form.get('model_urn', '')
        if not _source_belongs(scope, model_urn):
            return jsonify({'error': 'La superficie no pertenece a este frente'}), 422
        db_id = int(request.form.get('db_id', ''))
        if db_id <= 0:
            raise ValueError('Selecciona una superficie válida antes de publicar')
        relief_blend = _visual_value(request.form.get('relief_blend'), 0, 0.75,
                                     'Mezcla de relieve')
        directional_shade = _visual_value(request.form.get('directional_shade'), 0, 1,
                                          'Sombreado de pendientes')
        bucket = _bucket()
        base, key = _keys(scope)
        current, generation = _active(bucket, key)
        if not _check_revision(current, request.form.get('expected_revision')):
            return jsonify({'error': 'La ortofoto cambió; recarga antes de publicar',
                            'code': 'REVISION_CONFLICT'}), 409
        revision = uuid.uuid4().hex
        names = {part: f'{base}/versions/{revision}/{part}.jpg' for part in ('north', 'south')}
        for part, upload in (('north', north), ('south', south)):
            blob = bucket.blob(names[part])
            blob.cache_control = 'public, max-age=31536000, immutable'
            upload.stream.seek(0)
            blob.upload_from_file(upload.stream, content_type='image/jpeg',
                                  if_generation_match=0, timeout=300)
        state = {'active': True, 'revision': revision, 'north': names['north'],
                 'south': names['south'], 'model_urn': model_urn, 'db_id': db_id,
                 'relief_blend': relief_blend,
                 'directional_shade': directional_shade,
                 'published_at': datetime.now(timezone.utc).isoformat()}
        _write_state(bucket, base, key, state, generation)
        return jsonify({'active': True, 'revision': revision,
                        'published_at': state['published_at']}), 201
    except (ValueError, TypeError) as error:
        return jsonify({'error': str(error)}), 422
    except PreconditionFailed:
        return jsonify({'error': 'La ortofoto cambió; recarga antes de publicar',
                        'code': 'REVISION_CONFLICT'}), 409
    except Exception:
        logger.exception('Fallo al publicar ortofoto del frente')
        return jsonify({'error': 'No se pudo publicar la ortofoto; la anterior sigue activa'}), 503


@orthophoto_bp.route('/api/orthophoto/<scope>/deactivate', methods=['POST'])
@requiere_sesion
def deactivate_orthophoto(scope):
    denied = _scope_guard(scope, write=True)
    if denied:
        return denied
    try:
        body = request.get_json(silent=True) or {}
        bucket = _bucket()
        base, key = _keys(scope)
        current, generation = _active(bucket, key)
        if not _check_revision(current, body.get('expected_revision')):
            return jsonify({'error': 'La ortofoto cambió; recarga antes de retirarla',
                            'code': 'REVISION_CONFLICT'}), 409
        if not current or not current['active']:
            return jsonify({'error': 'No hay ortofoto activa'}), 409
        state = {**current, 'active': False, 'revision': uuid.uuid4().hex,
                 'published_at': datetime.now(timezone.utc).isoformat()}
        _write_state(bucket, base, key, state, generation)
        return jsonify({'active': False, 'revision': state['revision']})
    except PreconditionFailed:
        return jsonify({'error': 'La ortofoto cambió; recarga antes de retirarla',
                        'code': 'REVISION_CONFLICT'}), 409
    except Exception:
        logger.exception('Fallo al retirar ortofoto del frente')
        return jsonify({'error': 'No se pudo retirar la ortofoto; sigue activa'}), 503
