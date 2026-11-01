"""Tableros de Docs (30-oct-2026, docs/visor/57).

La pizarra de la obra dentro de ALEPHIA Docs, como los «Tableros» (Paneles) de ACC: una lista por obra
(crear, abrir, renombrar, archivar; «abierto por última vez por usted» y «creado por») y cada tablero con su
contenido en `config` (notas, texto, secciones; documentos e incidencias en fases siguientes).

Un tablero es DE LA OBRA. MIEMBROS (docs/visor/66, migración 44), como «Miembros del panel» de ACC: cada tablero
tiene sus miembros con un rol —responsable (gestiona miembros y acceso, archiva), editor, lector (solo mira)— y dice
quién puede entrar: toda la obra (`acceso = 'obra'`, quien no es miembro edita como hasta ahora) o solo sus miembros
(`'invitados'`). Los administradores de la obra entran en todos y los gestionan. Quien lo crea es su responsable, y
siempre queda al menos uno. Solo se invita a quien pertenece a la obra.

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
        cur.execute("ALTER TABLE tableros ADD COLUMN IF NOT EXISTS acceso TEXT NOT NULL DEFAULT 'obra'")
        cur.execute('''CREATE TABLE IF NOT EXISTS tableros_miembros (
            tablero_id UUID NOT NULL REFERENCES tableros(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            rol TEXT NOT NULL CHECK (rol IN ('responsable', 'editor', 'lector')),
            agregado_por INTEGER REFERENCES users(id),
            agregado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
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


# GRÁFICAS DE VIEW (docs/visor/68): View calcula la gráfica con su modelo y la deja en un tablero como una foto con
# fecha. Aquí solo se valida su forma (nada se calcula, ni se lee el inventario) y se pone en el tablero.
TIPOS_DE_GRAFICA = ('bar', 'donut', 'kpi', 'line', 'area')
METRICAS = ('count', 'sum', 'avg')
MAX_GRUPOS = 60
GRAFICA_LADO = (480, 320)
_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
_ID_ORIGEN = re.compile(r'^[\w.:-]{1,80}$')

ROLES = ('responsable', 'editor', 'lector')
ACCESOS = ('obra', 'invitados')


def _pertenece(user_id, obra):
    """¿Esa persona (no la sesión) pertenece a la obra? Para invitarla."""
    from routes.documents import verify_project_access
    return verify_project_access(user_id, obra)


def _misma_obra(frente, obra):
    """¿El frente es de la obra del tablero? (las dos se resuelven a `projects.id`; sin resolver, no)"""
    from db import resolve_project_id
    a, b = resolve_project_id(frente), resolve_project_id(obra)
    return a is not None and a == b


def _txt(valor, maximo):
    return ' '.join(str(valor).split())[:maximo] if isinstance(valor, (str, int, float)) and not isinstance(valor, bool) else ''


def _numero(valor):
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    return float(valor) if valor == valor and abs(valor) < 1e15 else None


def _limpiar_grafica(d):
    """(grafica, error): solo pasa lo que una gráfica de View manda, con tamaños acotados."""
    if not isinstance(d, dict):
        return None, 'Falta la gráfica.'
    origen = d.get('origen') if isinstance(d.get('origen'), dict) else {}
    o = {k: str(origen.get(k) or '') for k in ('frente', 'obra', 'frenteId', 'tablero', 'grafica')}
    if not o['frente'] or not o['grafica'] or not all(_ID_ORIGEN.match(v) for v in o.values() if v):
        return None, 'La gráfica no dice de qué frente y de qué gráfica de View viene.'
    tipo, metrica = d.get('tipo'), d.get('metrica') or 'count'
    if tipo not in TIPOS_DE_GRAFICA or metrica not in METRICAS:
        return None, 'Tipo de gráfica no válido.'
    grupos = d.get('grupos')
    if not isinstance(grupos, list) or len(grupos) > MAX_GRUPOS:
        return None, 'Los grupos de la gráfica no son válidos.'
    limpios = []
    for g in grupos:
        v = _numero(g.get('v')) if isinstance(g, dict) else None
        if v is None:
            return None, 'Los grupos de la gráfica no son válidos.'
        n = g.get('n')
        c = g.get('c')
        limpios.append({'k': _txt(g.get('k'), 200) or '(sin valor)', 'v': v,
                        **({'n': int(n)} if isinstance(n, int) and not isinstance(n, bool) and 0 <= n < 10**9 else {}),
                        **({'c': c} if isinstance(c, str) and _COLOR.match(c) else {})})
    filtro = d.get('filtro') if isinstance(d.get('filtro'), dict) else None
    if filtro:
        valores = filtro.get('valores') if isinstance(filtro.get('valores'), list) else []
        filtro = {'campo': _txt(filtro.get('campo'), 200), 'valores': [_txt(x, 200) for x in valores[:50]]}
        if not filtro['campo'] or not filtro['valores']:
            filtro = None
    total = _numero(d.get('total'))
    elementos = d.get('elementos')
    return {
        'origen': {**{k: v for k, v in o.items() if v}, 'frenteNombre': _txt(origen.get('frenteNombre'), 120)},
        'nombre': _txt(d.get('titulo'), 200) or 'Gráfica',
        'subtitulo': _txt(d.get('subtitulo'), 300),
        'grafica': tipo, 'metrica': metrica,
        'campo': _txt(d.get('campo'), 200), 'valorCampo': _txt(d.get('valorCampo'), 200),
        'grupos': limpios, 'total': total if total is not None else sum(g['v'] for g in limpios),
        **({'elementos': int(elementos)} if isinstance(elementos, int) and not isinstance(elementos, bool) and 0 <= elementos < 10**9 else {}),
        **({'filtro': filtro} if filtro else {}),
        'unidad': _txt(d.get('unidad'), 40),
    }, None


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
        cur.execute('''SELECT t.id, t.model_urn, t.nombre, t.archivado, t.created_by_id, t.version, t.acceso, m.rol
                         FROM tableros t LEFT JOIN tableros_miembros m ON m.tablero_id = t.id AND m.user_id = %s
                        WHERE t.id = %s''', (_uid(), tablero_id))
        fila = cur.fetchone()
    if not fila:
        return None, _error('Tablero no encontrado.', 404)
    tablero = {'id': str(fila[0]), 'obra': fila[1], 'nombre': fila[2], 'archivado': bool(fila[3]),
               'autor': fila[4], 'version': fila[5], 'acceso': fila[6] or 'obra', 'rol': fila[7]}
    denied = guardia_de_recurso('tableros', tablero['id'])
    if denied:
        return None, denied
    if not _hay_acceso(tablero['obra']):
        return None, _error('No tienes acceso a esta obra.', 403)
    tablero['admin'] = _es_admin(tablero['obra'])
    if tablero['acceso'] == 'invitados' and not tablero['rol'] and not tablero['admin']:
        return None, _error('Este tablero es solo para sus miembros.', 403, code='SOLO_MIEMBROS')
    return tablero, None


def _gestiona(tab):
    return tab['admin'] or tab['rol'] == 'responsable'


def _puede_editar(tab):
    return tab['admin'] or tab['rol'] in ('responsable', 'editor') or (tab['rol'] is None and tab['acceso'] == 'obra')


def _mi_rol(tab):
    """El rol con el que lo ve esta sesión: el suyo, o «editor» si entra por ser de la obra; un administrador sin rol,
    «responsable»."""
    return tab['rol'] or ('responsable' if tab['admin'] else 'editor')


@tableros_bp.route('/api/docs/tableros', methods=['GET', 'POST'])
def tableros():
    """GET ?model_urn=…&archivados=1 → los tableros de la obra. POST {model_urn, nombre} → crea uno vacío."""
    if not _uid():
        return _error('Autenticación requerida.', 401)
    if request.method == 'GET':
        obra = request.args.get('model_urn') or ''
        frente = request.args.get('frente') or ''
        if frente and not obra:
            # Desde View, que conoce el frente y no el árbol documental de la obra: los tableros de la obra del frente.
            if not _hay_acceso(frente):
                return _error('No tienes acceso a esta obra.', 403)
            with get_db_connection() as conn:
                cur = conn.cursor()
                cur.execute('SELECT DISTINCT model_urn FROM tableros WHERE archivado = false')
                obras = [r[0] for r in cur.fetchall() if _misma_obra(frente, r[0])]
            if len(obras) != 1:
                return jsonify({'success': True, 'tableros': [], 'obra': None}), 200
            obra = obras[0]
        if not obra or not _hay_acceso(obra):
            return _error('No tienes acceso a esta obra.', 403)
        archivados = request.args.get('archivados') in ('1', 'true')
        admin = _es_admin(obra)
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Los cerrados a sus invitados solo los ve quien es miembro (o un administrador de la obra).
            cur.execute('''SELECT t.id, t.nombre, t.archivado, t.created_at, t.updated_at, t.created_by_id,
                                  COALESCE(NULLIF(u.name, ''), u.email), a.abierto_en, t.miniatura, t.acceso, m.rol
                             FROM tableros t
                             LEFT JOIN users u ON u.id = t.created_by_id
                             LEFT JOIN tableros_abiertos a ON a.tablero_id = t.id AND a.user_id = %s
                             LEFT JOIN tableros_miembros m ON m.tablero_id = t.id AND m.user_id = %s
                            WHERE t.model_urn = %s AND t.archivado = %s AND (t.acceso = 'obra' OR m.rol IS NOT NULL OR %s)
                            ORDER BY a.abierto_en DESC NULLS LAST, t.updated_at DESC''',
                        (_uid(), _uid(), obra, archivados, admin))
            lista = [{'id': str(r[0]), 'nombre': r[1], 'archivado': bool(r[2]), 'creado_en': _iso(r[3]),
                      'actualizado_en': _iso(r[4]), 'creado_por_id': r[5], 'creado_por': r[6],
                      'abierto_por_mi': _iso(r[7]), 'miniatura': r[8], 'acceso': r[9] or 'obra',
                      'mi_rol': r[10] or ('responsable' if admin else 'editor'),
                      'puedo_archivar': admin or r[10] == 'responsable'} for r in cur.fetchall()]
        resp = jsonify({'success': True, 'tableros': lista, 'obra': obra})
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
        cur.execute('''INSERT INTO tableros_miembros (tablero_id, user_id, rol, agregado_por) VALUES (%s, %s, 'responsable', %s)
                       ON CONFLICT (tablero_id, user_id) DO NOTHING''', (tid, _uid(), _uid()))
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
                        'archivado': bool(fila[3]), 'config': fila[0] or {}, 'version': fila[1],
                        'acceso': tab['acceso'], 'mi_rol': _mi_rol(tab), 'gestiona': _gestiona(tab)})
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
        if not _puede_editar(tab):
            return _error('En este tablero eres lector: puedes mirarlo, no cambiarlo.', 403, code='LECTOR')
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
    if ('nombre' in data or 'acceso' in data) and not _puede_editar(tab):
        return _error('En este tablero eres lector: puedes mirarlo, no cambiarlo.', 403, code='LECTOR')
    if 'acceso' in data:
        if not _gestiona(tab):
            return _error('Solo un responsable del tablero o un administrador de la obra decide quién puede entrar.', 403)
        if data.get('acceso') not in ACCESOS:
            return _error('Acceso no válido.', 400)
        cambios.append('acceso = %s')
        params.append(data.get('acceso'))
    if 'nombre' in data:
        nombre = _nombre(data.get('nombre'))
        if not nombre or len(nombre) > NOMBRE_MAX:
            return _error('Pon un nombre de 1 a %d caracteres.' % NOMBRE_MAX, 400)
        cambios.append('nombre = %s')
        params.append(nombre)
    if 'archivado' in data:
        if not _gestiona(tab):
            return _error('Solo un responsable del tablero o un administrador de la obra puede archivarlo.', 403)
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


@tableros_bp.route('/api/docs/tableros/<tid>/miembros', methods=['GET', 'POST', 'DELETE'])
def miembros_del_tablero(tid):
    """GET → quién es miembro, con su rol, el acceso y si esta sesión los gestiona. POST {user_id, rol} → invitar o
    cambiar el rol (gestiona). DELETE ?user_id= → quitar a alguien (gestiona) o salir uno mismo. Siempre queda al
    menos un responsable; solo se invita a quien pertenece a la obra."""
    tab, denied = _guardia_del_tablero(tid)
    if denied:
        return denied

    def lista(cur):
        cur.execute('''SELECT m.user_id, COALESCE(NULLIF(u.name, ''), u.email), m.rol
                         FROM tableros_miembros m JOIN users u ON u.id = m.user_id
                        WHERE m.tablero_id = %s
                        ORDER BY CASE m.rol WHEN 'responsable' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, 2''', (tab['id'],))
        return [{'id': r[0], 'nombre': r[1] or '', 'rol': r[2]} for r in cur.fetchall()]

    def responsables_sin(cur, user_id):
        cur.execute("SELECT count(*) FROM tableros_miembros WHERE tablero_id = %s AND rol = 'responsable' AND user_id <> %s",
                    (tab['id'], user_id))
        return cur.fetchone()[0]

    if request.method == 'GET':
        with get_db_connection() as conn:
            gente = lista(conn.cursor())
        resp = jsonify({'success': True, 'acceso': tab['acceso'], 'miembros': gente, 'mi_rol': _mi_rol(tab),
                        'gestiona': _gestiona(tab), 'soy_miembro': bool(tab['rol'])})
        resp.headers['Cache-Control'] = 'private, no-store'
        return resp

    if request.method == 'POST':
        if not _gestiona(tab):
            return _error('Solo un responsable del tablero o un administrador de la obra puede invitar.', 403)
        data = request.get_json(silent=True) or {}
        try:
            otro = int(data.get('user_id'))
        except (TypeError, ValueError):
            return _error('Falta a quién invitar.', 400)
        rol = data.get('rol')
        if rol not in ROLES:
            return _error('Rol no válido.', 400)
        if not _pertenece(otro, tab['obra']):
            return _error('Esa persona no pertenece a la obra.', 400)
        with get_db_connection() as conn:
            cur = conn.cursor()
            if rol != 'responsable' and not responsables_sin(cur, otro):
                return _error('El tablero tiene que quedarse con al menos un responsable.', 409, code='ULTIMO_RESPONSABLE')
            cur.execute('''INSERT INTO tableros_miembros (tablero_id, user_id, rol, agregado_por) VALUES (%s, %s, %s, %s)
                           ON CONFLICT (tablero_id, user_id) DO UPDATE SET rol = EXCLUDED.rol''', (tab['id'], otro, rol, _uid()))
            conn.commit()
            gente = lista(cur)
        return jsonify({'success': True, 'miembros': gente}), 200

    # DELETE: quitar a alguien, o salir
    try:
        otro = int(request.args.get('user_id'))
    except (TypeError, ValueError):
        return _error('Falta a quién quitar.', 400)
    if otro != _uid() and not _gestiona(tab):
        return _error('Solo un responsable del tablero o un administrador de la obra puede quitar a alguien.', 403)
    with get_db_connection() as conn:
        cur = conn.cursor()
        if not responsables_sin(cur, otro):
            cur.execute("SELECT rol FROM tableros_miembros WHERE tablero_id = %s AND user_id = %s", (tab['id'], otro))
            fila = cur.fetchone()
            if fila and fila[0] == 'responsable':
                return _error('El tablero tiene que quedarse con al menos un responsable.', 409, code='ULTIMO_RESPONSABLE')
        cur.execute('DELETE FROM tableros_miembros WHERE tablero_id = %s AND user_id = %s', (tab['id'], otro))
        conn.commit()
        gente = lista(cur)
    return jsonify({'success': True, 'miembros': gente}), 200


@tableros_bp.route('/api/docs/tableros/<tid>/graficas', methods=['POST'])
def graficas_del_tablero(tid):
    """POST {grafica} → deja en el tablero una gráfica calculada en View (docs/visor/68). Si ya estaba (misma gráfica de
    View: frente, tablero de View y gráfica), se le cambian los datos donde esté, sin moverla; si no, entra a la
    derecha de lo que hay. Sube la versión: quien tenga el tablero abierto la recibe con la fusión de siempre."""
    tab, denied = _guardia_del_tablero(tid)
    if denied:
        return denied
    if tab['archivado']:
        return _error('Este tablero está archivado: recupéralo para editarlo.', 409, code='ARCHIVADO')
    if not _puede_editar(tab):
        return _error('En este tablero eres lector: puedes mirarlo, no cambiarlo.', 403, code='LECTOR')
    grafica, error = _limpiar_grafica((request.get_json(silent=True) or {}).get('grafica'))
    if error:
        return _error(error, 400)
    if not _hay_acceso(grafica['origen']['frente']) or not _misma_obra(grafica['origen']['frente'], tab['obra']):
        return _error('Esa gráfica es de un frente de otra obra.', 400)
    usuario = _user()
    grafica['enviadaPor'] = _txt(usuario.get('name') or usuario.get('email') or '', 120)
    from datetime import datetime, timezone
    grafica['fecha'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    clave = (grafica['origen']['frente'], grafica['origen'].get('tablero', ''), grafica['origen']['grafica'])
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT config FROM tableros WHERE id = %s FOR UPDATE', (tab['id'],))
        config = (cur.fetchone() or [{}])[0] or {}
        notas = list(config.get('notas') or [])
        mismas = [i for i, n in enumerate(notas) if isinstance(n, dict) and n.get('tipo') == 'grafica'
                  and (n.get('origen', {}).get('frente'), n.get('origen', {}).get('tablero', ''), n.get('origen', {}).get('grafica')) == clave]
        if mismas:
            for i in mismas:
                n = notas[i]
                notas[i] = {**grafica, 'id': n['id'], 'tipo': 'grafica', 'x': n.get('x', 0), 'y': n.get('y', 0),
                            'w': n.get('w', GRAFICA_LADO[0]), 'h': n.get('h', GRAFICA_LADO[1])}
            nuevo_id = notas[mismas[0]]['id']
        else:
            cajas = [(e.get('x', 0), e.get('y', 0), e.get('x', 0) + e.get('w', 0), e.get('y', 0) + e.get('h', 0))
                     for e in notas + list(config.get('secciones') or []) if isinstance(e, dict)]
            x = max((c[2] for c in cajas), default=0) + (80 if cajas else 0)
            y = min((c[1] for c in cajas), default=0)
            nuevo_id = 'g' + uuid.uuid4().hex[:16]
            notas.append({**grafica, 'id': nuevo_id, 'tipo': 'grafica', 'x': x, 'y': y, 'w': GRAFICA_LADO[0], 'h': GRAFICA_LADO[1]})
        config = {**config, 'notas': notas}
        texto = json.dumps(config, ensure_ascii=False)
        if len(texto.encode('utf-8')) > CONFIG_MAX:
            conn.rollback()
            return _error('El tablero es demasiado grande para añadirle la gráfica.', 413)
        cur.execute('''UPDATE tableros SET config = %s::jsonb, version = version + 1, updated_by_id = %s, updated_at = now()
                        WHERE id = %s RETURNING version''', (texto, _uid(), tab['id']))
        version = cur.fetchone()[0]
        conn.commit()
    return jsonify({'success': True, 'id': nuevo_id, 'reemplazada': bool(mismas), 'version': version,
                    'tablero': tab['nombre']}), 200
