# -*- coding: utf-8 -*-
"""NG-02 · FOTOS DE CAMPO — las rutas. La semántica vive en `fotos_de_obra`.

LO QUE ESTAS RUTAS NO HACEN, A PROPÓSITO:
  - No borran fotos. La evidencia no se borra (misma postura que la auditoría
    de solo anexar). Quitar de un álbum sí — deshacer una agrupación no
    destruye evidencia.
  - No queman marcas en el binario. El original es el testigo.
  - No aceptan lat-long. El GPS se limpia del fichero ANTES de subir
    (`privacidad_imagen`, regla vigente desde tracking) y lo limpiado queda en
    `exif`, aparte del fichero.
"""
import json
import logging

from flask import Blueprint, Response, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_obra
from administracion_de_obra import es_admin_de_obra
import flujo_de_registro as reg
import fotos_de_obra as fdo
import gcs_manager as gcs

logger = logging.getLogger('fotos')

fotos_bp = Blueprint('fotos_bp', __name__)

MAX_FOTO = 32 * 1024 * 1024

_COLS = ("id, project_id, model_urn, objeto, nombre, tipo_mime, tamano, sha256, "
         "capturado_en, subido_en, autor_id, created_by, descripcion, progresiva, "
         "external_id, ubicacion, sensibilidad, exif, marcas, history")


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _fila(r):
    return {'id': str(r[0]), 'project_id': r[1], 'model_urn': r[2], 'objeto': r[3],
            'nombre': r[4], 'tipo_mime': r[5], 'tamano': r[6], 'sha256': r[7],
            'capturado_en': r[8].isoformat() if r[8] else None,
            'subido_en': r[9].isoformat() if r[9] else None,
            'autor_id': r[10], 'created_by': r[11], 'descripcion': r[12],
            'progresiva': r[13], 'external_id': r[14], 'ubicacion': r[15],
            'sensibilidad': r[16], 'exif': r[17] or {}, 'marcas': r[18] or [],
            'history': r[19] or []}


def _con_visibilidad(cur, obra, filas):
    """Aplica la regla de sensibilidad y PODA las marcas privadas ajenas.

    La poda va aquí, en el borde, y no en la consulta: si las marcas privadas
    salieran del servidor y las escondiera la pantalla, cualquiera con la
    pestaña de red abierta las leería igual.
    """
    u = _usuario()
    admin = es_admin_de_obra(cur, u, obra)
    visibles = []
    for f in filas:
        d = _fila(f)
        if not fdo.puede_ver(u, d, admin):
            continue
        d['marcas'] = fdo.marcas_visibles(u, d)
        visibles.append(d)
    return visibles


# ── SUBIR (en línea) ───────────────────────────────────────────────────────

@fotos_bp.route('/api/fotos', methods=['POST'])
def subir_foto():
    """Sube el binario Y registra la foto, en ese orden.

    El binario primero: un registro que apunta a un objeto que no existe es una
    evidencia que promete y no muestra. Al revés —objeto sin registro— no rompe
    nada: el nombre determinista permite reconciliarlo (GAP 07).
    """
    obra = resolve_project_id(request.form.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.',
                        'code': 'PROJECT_UNRESOLVED'}), 400
    corte = guardia_de_obra(obra, 'subir una fotografía de obra')
    if corte:
        return corte

    fichero = request.files.get('file')
    if not fichero or not fichero.filename:
        return jsonify({'error': 'No llegó ningún fichero.', 'code': 'SIN_FICHERO'}), 400

    # validate_file LANZA si el fichero no es aceptable y devuelve los datos
    # si lo es -- NO devuelve {'valid': ...}. El patron get('valid') rechazaba
    # TODO fichero desde siempre (defecto heredado, ver commit).
    from file_validator import validate_file, FileValidationError
    try:
        validate_file(fichero)
    except FileValidationError as ve:
        return jsonify({'error': str(ve), 'code': getattr(ve, 'code', 'INVALID_FILE')}), 400

    sensibilidad = (request.form.get('sensibilidad') or fdo.NIVEL_POR_DEFECTO).strip()
    if not fdo.nivel_valido(sensibilidad):
        return jsonify({'error': 'Sensibilidad desconocida.',
                        'admitidas': list(fdo.NIVELES)}), 400

    # EL GPS SE QUITA ANTES DE SUBIR, no después: si el fichero con coordenadas
    # llegara al almacén, limpiarlo luego no lo quita de donde ya fue.
    import io as _io
    import privacidad_imagen
    datos = fichero.read()
    if len(datos) > MAX_FOTO:
        return jsonify({'error': 'La foto pesa demasiado (máximo %d MB).'
                                 % (MAX_FOTO // (1024 * 1024))}), 413
    if not datos:
        return jsonify({'error': 'La foto llegó vacía.'}), 400
    limpios, metadatos = privacidad_imagen.limpiar(datos, fichero.filename)

    objeto = fdo.nombre_de_objeto(obra)
    url = gcs.upload_file_to_gcs(_io.BytesIO(limpios), objeto)
    if not url:
        return jsonify({'error': 'No se pudo subir la foto; nada quedó registrado.',
                        'code': 'SUBIDA_FALLIDA'}), 502

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO doc_fotos
                         (project_id, model_urn, objeto, nombre, tipo_mime, tamano,
                          capturado_en, autor_id, created_by, descripcion,
                          progresiva, external_id, ubicacion, sensibilidad, exif,
                          history)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       RETURNING """ + _COLS,
                    (obra, request.form.get('model_urn') or obra, objeto,
                     fichero.filename, fichero.mimetype, len(limpios),
                     request.form.get('capturado_en') or None,
                     _usuario().get('id'), _actor(),
                     (request.form.get('descripcion') or '').strip() or None,
                     (request.form.get('progresiva') or '').strip() or None,
                     (request.form.get('external_id') or '').strip() or None,
                     (request.form.get('ubicacion') or '').strip() or None,
                     sensibilidad, json.dumps(metadatos or {}),
                     json.dumps([reg.entrada('created', _actor(),
                                             origen='subida en línea')])))
        d = _fila(cur.fetchone())
        conn.commit()
    log_activity(obra, 'FOTO_SUBIDA', 'doc_fotos', d['id'], d['nombre'] or '',
                 _actor(), {'objeto': objeto})
    return jsonify(d), 201


# ── GALERÍA ────────────────────────────────────────────────────────────────

@fotos_bp.route('/api/fotos', methods=['GET'])
def listar():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver las fotos de la obra')
    if corte:
        return corte
    album = request.args.get('album_id')
    with get_db_connection() as conn:
        cur = conn.cursor()
        if album:
            cur.execute("SELECT " + _COLS + """ FROM doc_fotos f
                          JOIN doc_album_fotos af ON af.foto_id = f.id
                         WHERE f.project_id = %s AND af.album_id = %s
                         ORDER BY COALESCE(f.capturado_en, f.subido_en) DESC
                         LIMIT 500""", (obra, int(album)))
        else:
            cur.execute("SELECT " + _COLS + """ FROM doc_fotos
                         WHERE project_id = %s
                         ORDER BY COALESCE(capturado_en, subido_en) DESC
                         LIMIT 500""", (obra,))
        fotos = _con_visibilidad(cur, obra, cur.fetchall())

        # VÍNCULOS: qué issues citan cada objeto. La evidencia del issue guarda
        # el MISMO nombre de objeto — esa es la unión, no una tabla nueva.
        objetos = [f['objeto'] for f in fotos]
        vinculos = {}
        if objetos:
            cur.execute("""SELECT i.codigo, e->>'objeto_externo'
                             FROM doc_issues i,
                                  jsonb_array_elements(i.evidencia) e
                            WHERE i.project_id = %s
                              AND e->>'objeto_externo' = ANY(%s)""",
                        (obra, objetos))
            for codigo, obj in cur.fetchall():
                vinculos.setdefault(obj, []).append(codigo)
        for f in fotos:
            f['citada_por'] = vinculos.get(f['objeto'], [])
    return jsonify({'fotos': fotos, 'total': len(fotos)})


@fotos_bp.route('/api/fotos/<int:fid>', methods=['GET'])
def detalle(fid):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS + " FROM doc_fotos WHERE id = %s", (fid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'ver esta foto')
        if corte:
            return corte
        visibles = _con_visibilidad(cur, obra, [f])
    if not visibles:
        # Para quien no puede verla, la foto NO EXISTE. Un 403 confirmaría que
        # hay algo sensible con ese id.
        return jsonify({'error': 'No existe.'}), 404
    return jsonify(visibles[0])


@fotos_bp.route('/api/fotos/<int:fid>/miniatura', methods=['GET'])
def miniatura(fid):
    px = min(int(request.args.get('px') or 420), 1600)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS + " FROM doc_fotos WHERE id = %s", (fid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'ver esta foto')
        if corte:
            return corte
        if not _con_visibilidad(cur, obra, [f]):
            return jsonify({'error': 'No existe.'}), 404
        objeto = f[3]
    datos, mime = gcs.get_or_create_thumbnail(objeto, max_px=px)
    if not datos:
        return jsonify({'error': 'La miniatura no se pudo generar.'}), 502
    return Response(datos, mimetype=mime or 'image/jpeg',
                    headers={'Cache-Control': 'private, max-age=3600'})


# ── EDITAR METADATOS (no el binario) ───────────────────────────────────────

@fotos_bp.route('/api/fotos/<int:fid>', methods=['PATCH'])
def editar(fid):
    """Descripción, ubicación, progresiva, elemento y sensibilidad. El binario
    y `capturado_en` NO se editan: son el testigo y su declaración."""
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS + " FROM doc_fotos WHERE id = %s FOR UPDATE", (fid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'editar esta foto')
        if corte:
            return corte
        d = _fila(f)
        u = _usuario()
        admin = es_admin_de_obra(cur, u, obra)
        if not fdo.puede_ver(u, d, admin):
            return jsonify({'error': 'No existe.'}), 404
        # Editar metadatos: su autor o un admin. Un tercero que reetiqueta la
        # evidencia ajena está reescribiendo lo que otro atestiguó.
        if u.get('id') != d['autor_id'] and not admin:
            return jsonify({'error': 'Solo el autor o un administrador editan '
                                     'los metadatos de esta foto.',
                            'code': 'NO_AUTOR'}), 403
        cambios, valores = [], []
        for campo in ('descripcion', 'progresiva', 'external_id', 'ubicacion'):
            if campo in data:
                cambios.append('%s = %%s' % campo)
                valores.append((data.get(campo) or '').strip() or None)
        if 'sensibilidad' in data:
            if not fdo.nivel_valido(data['sensibilidad']):
                return jsonify({'error': 'Sensibilidad desconocida.',
                                'admitidas': list(fdo.NIVELES)}), 400
            cambios.append('sensibilidad = %s')
            valores.append(data['sensibilidad'])
        if not cambios:
            return jsonify({'error': 'Nada que cambiar.'}), 400
        h = list(d['history']) + [reg.entrada('edited', _actor(),
                                              campos=sorted(set(
                                                  c.split(' ')[0] for c in cambios)))]
        cambios.append('history = %s')
        valores.append(json.dumps(h))
        valores.append(fid)
        cur.execute('UPDATE doc_fotos SET ' + ', '.join(cambios)
                    + ' WHERE id = %s RETURNING ' + _COLS, valores)
        d = _fila(cur.fetchone())
        conn.commit()
    d['marcas'] = fdo.marcas_visibles(_usuario(), d)
    return jsonify(d)


# ── MARCAS ─────────────────────────────────────────────────────────────────

@fotos_bp.route('/api/fotos/<int:fid>/marcas', methods=['POST'])
def marcar(fid):
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS + " FROM doc_fotos WHERE id = %s FOR UPDATE", (fid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'anotar esta foto')
        if corte:
            return corte
        d = _fila(f)
        u = _usuario()
        if not fdo.puede_ver(u, d, es_admin_de_obra(cur, u, obra)):
            return jsonify({'error': 'No existe.'}), 404
        marca, malas = fdo.marca_nueva(u, data.get('figuras'), data.get('nota'))
        if not marca:
            return jsonify({'error': 'Figuras no válidas: %s' % ', '.join(malas),
                            'admitidas': list(fdo.FIGURAS)}), 400
        marcas = list(d['marcas']) + [marca]
        h = list(d['history']) + [reg.entrada('marca_creada', _actor(),
                                              marca=marca['id'])]
        cur.execute('UPDATE doc_fotos SET marcas=%s, history=%s WHERE id=%s',
                    (json.dumps(marcas), json.dumps(h), fid))
        conn.commit()
    return jsonify(marca), 201


@fotos_bp.route('/api/fotos/<int:fid>/marcas/<mid>/publicar', methods=['POST'])
def publicar_marca(fid, mid):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT " + _COLS + " FROM doc_fotos WHERE id = %s FOR UPDATE", (fid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[1]
        corte = guardia_de_obra(obra, 'publicar una marca')
        if corte:
            return corte
        d = _fila(f)
        marca = next((m for m in d['marcas'] if m.get('id') == mid), None)
        if not marca:
            return jsonify({'error': 'Esa marca no existe.'}), 404
        if not fdo.puede_publicar_marca(_usuario(), marca):
            return jsonify({'error': 'Una marca la publica su autor.',
                            'code': 'NO_AUTOR'}), 403
        marca['publicada'] = True
        h = list(d['history']) + [reg.entrada('marca_publicada', _actor(),
                                              marca=mid)]
        cur.execute('UPDATE doc_fotos SET marcas=%s, history=%s WHERE id=%s',
                    (json.dumps(d['marcas']), json.dumps(h), fid))
        conn.commit()
    return jsonify(marca)


# ── ÁLBUMES ────────────────────────────────────────────────────────────────

@fotos_bp.route('/api/fotos/albumes', methods=['GET'])
def listar_albumes():
    obra = resolve_project_id(request.args.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'model_urn es obligatorio'}), 400
    corte = guardia_de_obra(obra, 'ver los álbumes')
    if corte:
        return corte
    with get_db_connection() as conn:
        cur = conn.cursor()
        u = _usuario()
        admin = es_admin_de_obra(cur, u, obra)
        cur.execute("""SELECT a.id, a.nombre, a.descripcion, a.sensibilidad,
                              a.creado_por, count(af.foto_id)
                         FROM doc_albumes a
                    LEFT JOIN doc_album_fotos af ON af.album_id = a.id
                        WHERE a.project_id = %s
                     GROUP BY a.id ORDER BY a.nombre""", (obra,))
        albumes = []
        for aid, nombre, desc, nivel, por, n in cur.fetchall():
            # El nivel del álbum restringe el CONJUNTO; jamás concede.
            if nivel in fdo.RESTRINGIDOS and u.get('id') != por and not admin:
                continue
            albumes.append({'id': str(aid), 'nombre': nombre, 'descripcion': desc,
                            'sensibilidad': nivel, 'creado_por': por, 'fotos': n})
    return jsonify({'albumes': albumes})


@fotos_bp.route('/api/fotos/albumes', methods=['POST'])
def crear_album():
    data = request.get_json(silent=True) or {}
    obra = resolve_project_id(data.get('model_urn') or '')
    if not obra:
        return jsonify({'error': 'No se pudo determinar la obra.'}), 400
    corte = guardia_de_obra(obra, 'crear un álbum')
    if corte:
        return corte
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio.'}), 400
    nivel = (data.get('sensibilidad') or fdo.NIVEL_POR_DEFECTO).strip()
    if not fdo.nivel_valido(nivel):
        return jsonify({'error': 'Sensibilidad desconocida.'}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_albumes
                             (project_id, nombre, descripcion, sensibilidad, creado_por)
                           VALUES (%s,%s,%s,%s,%s) RETURNING id""",
                        (obra, nombre, (data.get('descripcion') or '').strip() or None,
                         nivel, _usuario().get('id')))
            aid = cur.fetchone()[0]
            conn.commit()
        return jsonify({'id': str(aid), 'nombre': nombre, 'sensibilidad': nivel}), 201
    except Exception as e:
        if 'uq_albumes_nombre' in str(e):
            return jsonify({'error': 'Ya existe un álbum con ese nombre.',
                            'code': 'NOMBRE_DUPLICADO'}), 409
        logger.error('crear album: %s', e)
        return jsonify({'error': 'No se pudo crear el álbum.'}), 500


@fotos_bp.route('/api/fotos/albumes/<int:aid>/fotos', methods=['POST'])
def agrupar(aid):
    """Mete o saca fotos de un álbum. AGRUPAR, no mover: la foto puede estar en
    varios álbumes a la vez, y salir de todos sin dejar de existir."""
    data = request.get_json(silent=True) or {}
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT project_id FROM doc_albumes WHERE id = %s', (aid,))
        f = cur.fetchone()
        if not f:
            return jsonify({'error': 'No existe.'}), 404
        obra = f[0]
        corte = guardia_de_obra(obra, 'organizar un álbum')
        if corte:
            return corte
        poner = [int(x) for x in (data.get('poner') or [])]
        quitar = [int(x) for x in (data.get('quitar') or [])]
        # Solo fotos DE LA MISMA OBRA: un álbum no puede cruzar expedientes.
        if poner:
            cur.execute('SELECT id FROM doc_fotos WHERE id = ANY(%s) AND project_id = %s',
                        (poner, obra))
            propias = {r[0] for r in cur.fetchall()}
            ajenas = [p for p in poner if p not in propias]
            if ajenas:
                return jsonify({'error': 'Hay fotos de otra obra: %s' % ajenas,
                                'code': 'OTRA_OBRA'}), 409
            for fid in poner:
                cur.execute("""INSERT INTO doc_album_fotos (album_id, foto_id, anadido_por)
                               VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""",
                            (aid, fid, _usuario().get('id')))
        if quitar:
            cur.execute('DELETE FROM doc_album_fotos WHERE album_id=%s AND foto_id = ANY(%s)',
                        (aid, quitar))
        conn.commit()
        cur.execute('SELECT count(*) FROM doc_album_fotos WHERE album_id=%s', (aid,))
        n = cur.fetchone()[0]
    return jsonify({'album_id': str(aid), 'fotos': n})
