"""Tableros de Docs (30-oct-2026, docs/visor/57).

La pizarra de la obra dentro de ALEPHIA Docs, como los «Tableros» (Paneles) de ACC: una lista por obra
(crear, abrir, renombrar, archivar; «abierto por última vez por usted» y «creado por») y cada tablero con su
contenido en `config` (notas, texto, secciones; documentos e incidencias en fases siguientes).

Un tablero es DE LA OBRA: lo ve y lo edita quien pertenece a ella. Archivarlo o recuperarlo, su autor o un
administrador de la obra.

Guardar sin pisar a nadie: cada guardado trae la `version` sobre la que se hizo. Si en el servidor ya hay
otra (alguien guardó antes), se responde 409 con la versión y el contenido actuales, y el cliente fusiona por
elemento y vuelve a guardar. Nunca se reemplaza a ciegas el trabajo de otro (el tablero de análisis del visor
sí lo hacía: docs/visor/56 §3).

Seguridad, igual que el resto del portal:
- la obra del tablero sale del propio tablero, nunca de la petición;
- `guardia_de_recurso` + pertenencia a la obra en cada ruta que recibe el id.
"""
import json
import re
import uuid

from flask import Blueprint, g, jsonify, request

from db import get_db_connection
from esquema_congelado import solo_con_ddl
from perimetro_de_obra import guardia_de_recurso


tableros_bp = Blueprint('tableros_bp', __name__)

NOMBRE_MAX = 120
CONFIG_MAX = 4 * 1024 * 1024     # 4 MB de JSON: un tablero grande de notas y tarjetas cabe de sobra
MINIATURA_MAX = 24000            # la miniatura es un SVG de rectángulos: unos pocos KB
# La miniatura se dibuja en la lista como <img> (un SVG en una imagen no ejecuta nada), pero además solo se guarda
# un SVG sin guiones, manejadores ni enlaces externos.
_MINIATURA_PROHIBIDO = re.compile(
    r'<\s*(script|foreignObject|iframe|object|embed|image|use|a|animate|set)\b|\bon\w+\s*=|javascript:|href\s*=|url\s*\(', re.I)


@solo_con_ddl
def ensure_tableros_tables():
    """Esquema base para instalaciones nuevas; producción usa la migración 43."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS tableros (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            model_urn TEXT NOT NULL,
            nombre TEXT NOT NULL DEFAULT 'Sin título',
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            version INTEGER NOT NULL DEFAULT 1,
            miniatura TEXT,
            archivado BOOLEAN NOT NULL DEFAULT false,
            created_by_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by_id INTEGER REFERENCES users(id),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())''')
        cur.execute('''CREATE INDEX IF NOT EXISTS idx_tableros_obra
            ON tableros (model_urn, archivado, updated_at DESC)''')
        cur.execute('''CREATE TABLE IF NOT EXISTS tableros_abiertos (
            tablero_id UUID NOT NULL REFERENCES tableros(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            abierto_en TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (tablero_id, user_id))''')
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


def _error(message, status, **extra):
    return jsonify({'success': False, 'error': message, **extra}), status


def _hay_acceso(model_urn):
    """¿La sesión pertenece a esta obra? Mismo criterio que Grupos, Conjuntos y Revisiones."""
    from routes.documents import verify_project_access
    return verify_project_access(getattr(g, 'current_user', None), model_urn)


def _es_admin(obra):
    import administracion_de_obra as adm
    with get_db_connection() as conn:
        return adm.es_admin_de_obra(conn.cursor(), _user(), obra)


def _nombre(valor):
    return ' '.join(str(valor or '').split())


def _iso(valor):
    return valor.isoformat() if hasattr(valor, 'isoformat') else valor


def _miniatura(valor):
    """(ok, valor): '' o None la borran; un SVG válido se guarda; cualquier otra cosa es un error."""
    if valor in (None, ''):
        return True, None
    if not isinstance(valor, str) or len(valor) > MINIATURA_MAX or not valor.startswith('<svg')             or not valor.rstrip().endswith('</svg>') or _MINIATURA_PROHIBIDO.search(valor):
        return False, None
    return True, valor


# PRESENCIA (fase 5, docs/visor/64): quién tiene el tablero abierto. Sin tabla nueva: el tablero abierto pregunta su
# versión cada 10 s y, con `latido=1`, anota en `tableros_abiertos` que sigue ahí (así «Abierto por última vez por
# usted» dice la última vez que estuvo dentro). Está presente quien latió en los últimos 25 s.
PRESENTE_SEGUNDOS = 25


def _latido(tablero_id):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''INSERT INTO tableros_abiertos (tablero_id, user_id) VALUES (%s, %s)
                       ON CONFLICT (tablero_id, user_id) DO UPDATE SET abierto_en = now()''', (tablero_id, _uid()))
        cur.execute('''SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email)
                         FROM tableros_abiertos a JOIN users u ON u.id = a.user_id
                        WHERE a.tablero_id = %s AND a.abierto_en > now() - make_interval(secs => %s)
                        ORDER BY a.abierto_en DESC LIMIT 50''', (tablero_id, PRESENTE_SEGUNDOS))
        presentes = [{'id': r[0], 'nombre': r[1] or ''} for r in cur.fetchall()]
        conn.commit()
    return presentes


def _guardia_del_tablero(tid):
    """(tablero, negativa). La obra sale de la fila; el usuario tiene que pertenecer a ella."""
    tablero_id = _uuid(tid)
    if not tablero_id:
        return None, _error('Tablero no válido.', 400)
    if not _uid():
        return None, _error('Autenticación requerida.', 401)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''SELECT id, model_urn, nombre, archivado, created_by_id, version
                         FROM tableros WHERE id = %s''', (tablero_id,))
        fila = cur.fetchone()
    if not fila:
        return None, _error('Tablero no encontrado.', 404)
    tablero = {'id': str(fila[0]), 'obra': fila[1], 'nombre': fila[2], 'archivado': bool(fila[3]),
               'autor': fila[4], 'version': fila[5]}
    denied = guardia_de_recurso('tableros', tablero['id'])
    if denied:
        return None, denied
    if not _hay_acceso(tablero['obra']):
        return None, _error('No tienes acceso a esta obra.', 403)
    return tablero, None


@tableros_bp.route('/api/docs/tableros', methods=['GET', 'POST'])
def tableros():
    """GET ?model_urn=…&archivados=1 → los tableros de la obra. POST {model_urn, nombre} → crea uno vacío."""
    if not _uid():
        return _error('Autenticación requerida.', 401)
    if request.method == 'GET':
        obra = request.args.get('model_urn') or ''
        if not obra or not _hay_acceso(obra):
            return _error('No tienes acceso a esta obra.', 403)
        archivados = request.args.get('archivados') in ('1', 'true')
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('''SELECT t.id, t.nombre, t.archivado, t.created_at, t.updated_at, t.created_by_id,
                                  COALESCE(NULLIF(u.name, ''), u.email), a.abierto_en, t.miniatura
                             FROM tableros t
                             LEFT JOIN users u ON u.id = t.created_by_id
                             LEFT JOIN tableros_abiertos a ON a.tablero_id = t.id AND a.user_id = %s
                            WHERE t.model_urn = %s AND t.archivado = %s
                            ORDER BY a.abierto_en DESC NULLS LAST, t.updated_at DESC''',
                        (_uid(), obra, archivados))
            lista = [{'id': str(r[0]), 'nombre': r[1], 'archivado': bool(r[2]), 'creado_en': _iso(r[3]),
                      'actualizado_en': _iso(r[4]), 'creado_por_id': r[5], 'creado_por': r[6],
                      'abierto_por_mi': _iso(r[7]), 'miniatura': r[8]} for r in cur.fetchall()]
        resp = jsonify({'success': True, 'tableros': lista})
        resp.headers['Cache-Control'] = 'private, no-store'
        return resp

    data = request.get_json(silent=True) or {}
    obra = str(data.get('model_urn') or '')
    nombre = _nombre(data.get('nombre')) or 'Sin título'
    if not obra or not _hay_acceso(obra):
        return _error('No tienes acceso a esta obra.', 403)
    if len(nombre) > NOMBRE_MAX:
        return _error('El nombre admite hasta %d caracteres.' % NOMBRE_MAX, 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''INSERT INTO tableros (model_urn, nombre, created_by_id, updated_by_id)
                       VALUES (%s, %s, %s, %s) RETURNING id''', (obra, nombre, _uid(), _uid()))
        tid = str(cur.fetchone()[0])
        cur.execute('''INSERT INTO tableros_abiertos (tablero_id, user_id) VALUES (%s, %s)
                       ON CONFLICT (tablero_id, user_id) DO UPDATE SET abierto_en = now()''', (tid, _uid()))
        conn.commit()
    return jsonify({'success': True, 'id': tid, 'nombre': nombre, 'version': 1}), 201


@tableros_bp.route('/api/docs/tableros/<tid>', methods=['GET', 'PUT', 'PATCH'])
def tablero(tid):
    """GET → el tablero con su contenido (y se anota que lo abrí); ?solo_version=1 → solo su versión (para ver
    si otra persona guardó, sin traer el contenido ni anotar nada), y con &latido=1 además anota que sigo
    dentro y dice quién está (presencia); ?sin_apertura=1 → el contenido sin anotar la apertura. PUT {config, version, miniatura?} → guardar sin pisar (409 si la versión no es la del servidor).
    PATCH {nombre} | {archivado} → renombrar o archivar."""
    tab, denied = _guardia_del_tablero(tid)
    if denied:
        return denied

    if request.method == 'GET':
        if request.args.get('solo_version') in ('1', 'true'):
            cuerpo = {'success': True, 'version': tab['version'], 'archivado': tab['archivado'], 'nombre': tab['nombre']}
            if request.args.get('latido') in ('1', 'true'):
                cuerpo['presentes'] = _latido(tab['id'])
            resp = jsonify(cuerpo)
            resp.headers['Cache-Control'] = 'private, no-store'
            return resp
        anotar = request.args.get('sin_apertura') not in ('1', 'true')
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT config, version, nombre, archivado FROM tableros WHERE id = %s', (tab['id'],))
            fila = cur.fetchone()
            if anotar:
                cur.execute('''INSERT INTO tableros_abiertos (tablero_id, user_id) VALUES (%s, %s)
                               ON CONFLICT (tablero_id, user_id) DO UPDATE SET abierto_en = now()''', (tab['id'], _uid()))
                conn.commit()
        resp = jsonify({'success': True, 'id': tab['id'], 'model_urn': tab['obra'], 'nombre': fila[2],
                        'archivado': bool(fila[3]), 'config': fila[0] or {}, 'version': fila[1]})
        resp.headers['Cache-Control'] = 'private, no-store'
        return resp

    data = request.get_json(silent=True) or {}

    if request.method == 'PUT':
        config = data.get('config')
        if not isinstance(config, dict):
            return _error('Falta el contenido del tablero.', 400)
        try:
            version = int(data.get('version'))
        except (TypeError, ValueError):
            return _error('Falta la versión sobre la que se guarda.', 400)
        cambia_miniatura = 'miniatura' in data
        valida, miniatura = _miniatura(data.get('miniatura'))
        if not valida:
            return _error('La miniatura no es válida.', 400)
        texto = json.dumps(config, ensure_ascii=False)
        if len(texto.encode('utf-8')) > CONFIG_MAX:
            return _error('El tablero es demasiado grande para guardarse.', 413)
        if tab['archivado']:
            return _error('Este tablero está archivado: recupéralo para editarlo.', 409, code='ARCHIVADO')
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Guardado condicional: solo si nadie guardó desde la versión que trae el cliente.
            cur.execute('''UPDATE tableros SET config = %s::jsonb, version = version + 1,
                                  miniatura = CASE WHEN %s THEN %s ELSE miniatura END,
                                  updated_by_id = %s, updated_at = now()
                            WHERE id = %s AND version = %s RETURNING version''',
                        (texto, cambia_miniatura, miniatura, _uid(), tab['id'], version))
            fila = cur.fetchone()
            if not fila:
                cur.execute('SELECT config, version FROM tableros WHERE id = %s', (tab['id'],))
                actual = cur.fetchone()
                conn.rollback()
                return _error('Alguien guardó este tablero antes que tú.', 409, code='VERSION',
                              version=actual[1] if actual else None, config=(actual[0] if actual else None) or {})
            conn.commit()
        return jsonify({'success': True, 'version': fila[0]}), 200

    # PATCH: renombrar o archivar / recuperar
    cambios, params = [], []
    if 'nombre' in data:
        nombre = _nombre(data.get('nombre'))
        if not nombre or len(nombre) > NOMBRE_MAX:
            return _error('Pon un nombre de 1 a %d caracteres.' % NOMBRE_MAX, 400)
        cambios.append('nombre = %s')
        params.append(nombre)
    if 'archivado' in data:
        if tab['autor'] != _uid() and not _es_admin(tab['obra']):
            return _error('Solo quien lo creó o un administrador de la obra puede archivarlo.', 403)
        cambios.append('archivado = %s')
        params.append(bool(data.get('archivado')))
    if not cambios:
        return _error('Nada que cambiar.', 400)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE tableros SET %s, updated_by_id = %%s, updated_at = now() WHERE id = %%s' % ', '.join(cambios),
                    (*params, _uid(), tab['id']))
        conn.commit()
    return jsonify({'success': True}), 200
