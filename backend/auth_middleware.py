"""
Auth Middleware for VISOR_APS_TL
Protects all /api/* endpoints by validating session tokens.
Public endpoints (login, register, google-auth) are whitelisted.
"""

import os
import secrets
import time
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g
from app_logging import get_logger

logger = get_logger('auth')

# ── DEMO_TOKEN: backdoor de desarrollo (seguro por defecto) ─────────────────
# Historicamente el token 'DEMO_TOKEN' otorgaba acceso admin SIN login. Eso es
# un backdoor y en produccion debe estar APAGADO. Se controla por variable de
# entorno y por defecto esta DESACTIVADO.
#   ALLOW_DEMO_TOKEN=true  -> habilita el atajo demo (solo desarrollo local)
ALLOW_DEMO_TOKEN = os.getenv('ALLOW_DEMO_TOKEN', 'false').lower() in ('true', '1', 'yes')
if ALLOW_DEMO_TOKEN:
    logger.warning("ALLOW_DEMO_TOKEN ACTIVO -> DEMO_TOKEN concede admin sin login. NO usar en produccion.")
else:
    logger.info("DEMO_TOKEN deshabilitado (seguro). Para dev local: ALLOW_DEMO_TOKEN=true")

# Endpoints that don't require authentication
PUBLIC_ENDPOINTS = {
    # Latido de servicio: debe responder SIN sesion. Es lo que se consulta
    # cuando el backend no contesta, justo cuando nadie puede autenticarse.
    '/api/health',
    '/api/auth/login',
    '/api/auth/register', 
    '/api/auth/google',
    '/api/auth/handoff/exchange',
    '/api/auth/logout',
    '/api/auth/status',
    '/api/auth/aps/login',
    '/api/auth/aps/callback',
    '/api/token',           # Viewer token (Autodesk internal, not user-facing)
    '/api/companies',       # Public for registration form
    '/api/job_titles',      # Public for registration form
}

# Prefijos exentos de sesion para CUALQUIER metodo. Solo ficheros estaticos y
# callbacks OAuth de Autodesk, que no pueden llevar nuestra cabecera.
PUBLIC_PREFIXES = (
    '/maps/',                 # Tiles de mapa estaticos
    '/docs/uploads/',         # Servido estatico de ficheros subidos
    '/api/auth/aps/',         # Callbacks OAuth de APS
)

# ── Prefijos publicos SOLO PARA LECTURA (GET/HEAD) ─────────────────────────
# Estos endpoints se sirven con el token 2-legged de Autodesk que pone el
# backend, y hay lectores anonimos legitimos (vistas compartidas por UUID,
# miniaturas). Pero la ESCRITURA nunca fue publica a proposito: el prefijo
# '/api/projects' (sin barra final) tapaba tambien POST /api/projects/<id>/users,
# POST /api/projects/join y PUT/DELETE /api/projects/<id>, y como _require_admin
# permitia cuando no habia sesion, un anonimo podia reasignar la membresia de
# una obra o repuntarla a otro modelo. Separar por metodo cierra esa via sin
# tocar a los lectores.
#
# PROTEGIDO por sesion (no listado aqui): /api/docs/*, /api/users,
# /api/tracking/*, /api/pins/*, /api/digital-twin/*, /api/maps/*, /api/ai/*,
# /api/schedule/*, /api/inventory, /api/presupuesto, /api/config/*.
PUBLIC_GET_PREFIXES = (
    '/api/hubs',              # Hubs de ACC (token 2-legged)
    '/api/projects',          # Proyectos de ACC (token 2-legged)
    '/api/build/',            # Subida/traduccion en ACC (token 2-legged)
    '/api/images/',           # Proxy de imagenes (token 2-legged)
    '/api/documents/',        # Vinculacion de documentos de ACC (token 2-legged)
    # ── Secure Share Engine: SOLO enlaces publicos por UUID ──────────────
    '/api/docs/shared/',      # Enlaces publicos a documentos por UUID
    '/api/views/',            # Vistas compartidas por UUID
)

_METODOS_LECTURA = ('GET', 'HEAD')


def generate_session_token():
    """Generate a cryptographically secure session token."""
    return secrets.token_hex(32)  # 64-char hex string


def create_session(user_id):
    """Create a new session in the database and return the token."""
    from db import get_db_connection
    token = generate_session_token()
    expires_at = datetime.utcnow() + timedelta(days=7)  # 7-day sessions
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Ensure sessions table exists
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    token VARCHAR(128) PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    expires_at TIMESTAMP NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE
                )
            ''')
            # Clean up expired sessions (housekeeping)
            cursor.execute("DELETE FROM sessions WHERE expires_at < NOW()")
            # Insert new session
            cursor.execute(
                'INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)',
                (token, user_id, expires_at)
            )
            conn.commit()
        return token
    except Exception as e:
        logger.error(f"Error creando sesion: {e}")
        return None


# ── IN-MEMORY SESSION CACHE (TTL 60s) ──────────────────────────────────
# Elimina el roundtrip de ~600ms a Cloud SQL en cada request.
# Peor caso: una sesión revocada tarda 60s en ser rechazada.
_session_cache = {}  # token -> (user_dict, timestamp)
_SESSION_CACHE_TTL = 60  # seconds

# Los SPAs de Docs y Visor pueden estar en distintos orígenes. Un ticket
# opaco, de un único uso y de 60 segundos evita exponer la sesión reutilizable
# en una URL al pasar entre ellos.
_handoff_tickets = {}  # ticket -> (session_token, expires_at)


def create_handoff_ticket(session_token, ttl_seconds=60):
    ticket = secrets.token_urlsafe(32)
    now = time.time()
    for key, (_token, expires_at) in list(_handoff_tickets.items()):
        if expires_at <= now:
            _handoff_tickets.pop(key, None)
    _handoff_tickets[ticket] = (session_token, now + ttl_seconds)
    return ticket


def consume_handoff_ticket(ticket):
    entry = _handoff_tickets.pop(ticket, None)
    if not entry or entry[1] <= time.time():
        return None
    return entry[0]


def validate_session(token):
    """Validate a session token. Returns user dict or None. Uses in-memory cache."""
    # 1. Check in-memory cache first (0ms)
    cached = _session_cache.get(token)
    if cached:
        user_dict, cached_at = cached
        if time.time() - cached_at < _SESSION_CACHE_TTL:
            return user_dict
        else:
            del _session_cache[token]  # Expired

    # 2. Cache miss → hit Cloud SQL (~600ms)
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT s.user_id, u.id, u.name, u.email, u.role
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = %s AND s.is_active = TRUE AND s.expires_at > NOW()
            ''', (token,))
            row = cursor.fetchone()
            if row:
                user = {
                    'id': row[1],
                    'name': row[2],
                    'email': row[3],
                    'role': row[4]
                }
                # Store in cache
                _session_cache[token] = (user, time.time())
                return user
        return None
    except Exception as e:
        logger.error(f"Error validando sesion: {e}")
        return None


def revoke_all_sessions(user_id, excepto=None):
    """Cierra TODAS las sesiones de un usuario. Devuelve cuantas cerro.

    Se usa al cambiar la contrasena: si te roban la tablet en obra, cambiarla
    tiene que echar al ladron. Sin esto su token seguia valido hasta 7 dias.
    """
    from db import get_db_connection
    # Vaciar el cache local: el token revocado no debe seguir sirviendo desde
    # memoria. Con varios workers cada uno limpia el suyo al pasar por aqui;
    # el resto caduca en _SESSION_CACHE_TTL.
    for token, (user, _ts) in list(_session_cache.items()):
        if str(user.get('id')) == str(user_id) and token != excepto:
            _session_cache.pop(token, None)
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if excepto:
                cursor.execute(
                    'UPDATE sessions SET is_active = FALSE WHERE user_id = %s AND token <> %s AND is_active = TRUE',
                    (user_id, excepto)
                )
            else:
                cursor.execute(
                    'UPDATE sessions SET is_active = FALSE WHERE user_id = %s AND is_active = TRUE',
                    (user_id,)
                )
            cerradas = cursor.rowcount
            conn.commit()
            return cerradas
    except Exception as e:
        logger.error(f"Error revocando sesiones del usuario {user_id}: {e}")
        return 0


def revoke_session(token):
    """Revoke a session token (logout)."""
    # Immediately evict from cache on logout
    _session_cache.pop(token, None)
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE sessions SET is_active = FALSE WHERE token = %s', (token,))
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error revocando sesion: {e}")
        return False


# ── Autorizacion por proyecto (tenencia / Pilar Identidad) ─────────────────
# Transicion segura: ENFORCE_PROJECT_AUTHZ off por defecto => LOG-ONLY (registra
# que bloquearia, pero PERMITE). Encender (=true) cuando se confirme que no
# rompe accesos. Siempre: admin bypass + fail-open ante error de BD.
ENFORCE_PROJECT_AUTHZ = os.getenv('ENFORCE_PROJECT_AUTHZ', 'false').lower() in ('true', '1', 'yes')
logger.info(f"Autorizacion por proyecto: {'ENFORCE' if ENFORCE_PROJECT_AUTHZ else 'log-only (no bloquea)'}")

_membership_cache = {}  # (user_id, project_id) -> (bool, ts)
_MEMBERSHIP_TTL = 120


def _user_in_project(user_id, project_id):
    """True si el usuario pertenece a la obra. Cachea. Fail-open ante error."""
    import time as _t
    key = (user_id, str(project_id))
    cached = _membership_cache.get(key)
    if cached and _t.time() - cached[1] < _MEMBERSHIP_TTL:
        return cached[0]
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s LIMIT 1",
                        (str(project_id), user_id))
            ok = cur.fetchone() is not None
    except Exception as e:
        logger.error(f"error verificando membresia: {e}")
        return True  # fail-open: no romper por error de BD
    _membership_cache[key] = (ok, _t.time())
    return ok


def _request_project_id():
    """Mejor esfuerzo: deduce la obra (projects.id) de la request. None si no se puede."""
    try:
        from db import resolve_project_id
    except Exception:
        return None
    pid = request.args.get('project_id')
    if pid:
        return pid
    frente = request.args.get('model_urn') or request.args.get('project')
    if not frente and request.is_json:
        body = request.get_json(silent=True) or {}
        if isinstance(body, dict):
            if body.get('project_id'):
                return body.get('project_id')
            frente = body.get('model_urn') or body.get('project') or body.get('target_urn')
    return resolve_project_id(frente) if frente else None


# Endpoints que operan sobre datos de UNA obra concreta (por eso deben poder
# resolver el proyecto). Si uno de estos no resuelve el proyecto, es un HUECO
# de autorizacion que hay que cerrar antes de activar ENFORCE. Los que NO estan
# aqui (login, token, lista de usuarios, salud) son globales por diseno.
_PROJECT_SCOPED_PREFIXES = (
    '/api/docs', '/api/inventory', '/api/civil', '/api/lob4d', '/api/4d-lob',
    '/api/rfis', '/api/redlines', '/api/partidas', '/api/presupuesto',
    '/api/pins', '/api/project-pins', '/api/views', '/api/tracking',
    '/api/attrs', '/api/transmittals', '/api/reviews', '/api/sets',
)


def _is_project_scoped(path):
    return any(path.startswith(p) for p in _PROJECT_SCOPED_PREFIXES)


def init_auth_middleware(app):
    """Register the authentication middleware on a Flask app."""
    
    @app.before_request
    def check_auth():
        # Always allow CORS preflight requests
        if request.method == 'OPTIONS':
            return None
        
        path = request.path
        
        # Skip non-API routes
        if not path.startswith('/api/'):
            return None
        
        # Skip public endpoints
        if path in PUBLIC_ENDPOINTS:
            return None
            
        # /api/config/project: solo GET (leer configuracion de vistas compartidas)
        if request.method == 'GET' and path == '/api/config/project':
            return None

        # Prefijos publicos para cualquier metodo (estaticos y callbacks OAuth)
        for prefix in PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return None

        # Prefijos publicos SOLO en lectura. Las escrituras (POST/PUT/PATCH/
        # DELETE) caen al chequeo de sesion de abajo.
        if request.method in _METODOS_LECTURA:
            for prefix in PUBLIC_GET_PREFIXES:
                if path.startswith(prefix):
                    return None

        # Extract token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        elif request.method in _METODOS_LECTURA:
            # Respaldo por query string: solo en lectura. Este token de 7 dias
            # queda escrito dentro de permalinks de fotos que luego se comparten
            # (PhotoAlbumModal, uploadQueue), asi que quien reciba el enlace
            # hereda la sesion. Limitarlo a GET evita que ademas sirva para
            # escribir o borrar. Se retira del todo al firmar los enlaces (F2).
            token = request.args.get('session_token')
        else:
            token = None
        
        if not token:
            return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
        
        # Validate the session (now with in-memory cache)
        if token == 'DEMO_TOKEN':
            # Backdoor solo si ALLOW_DEMO_TOKEN esta activo (off por defecto -> None -> 401)
            user = {'id': 'demo', 'name': 'Demo User', 'role': 'admin'} if ALLOW_DEMO_TOKEN else None
        else:
            user = validate_session(token)
            
        if not user:
            return jsonify({'error': 'Sesión inválida o expirada', 'code': 'INVALID_TOKEN'}), 401
        
        # Store authenticated user in Flask's g context
        g.current_user = user

        # ── Autorizacion por proyecto ──
        # Rollout seguro: en log-only NO bloquea, pero registra EXACTAMENTE lo
        # que pasaria bajo ENFORCE (a quien y donde). Asi, antes de activar
        # ENFORCE_PROJECT_AUTHZ=true en produccion, se leen los logs para no
        # trabar a un usuario real por sorpresa.
        try:
            if user.get('role') != 'admin':
                pid = _request_project_id()
                if pid and not _user_in_project(user.get('id'), pid):
                    if ENFORCE_PROJECT_AUTHZ:
                        logger.warning(f"[authz BLOQUEADO] user={user.get('id')} obra={pid} {request.method} {path}")
                        return jsonify({'error': 'Sin acceso a este proyecto', 'code': 'PROJECT_FORBIDDEN'}), 403
                    logger.info(f"[authz log-only] BLOQUEARIA: user={user.get('id')} obra={pid} {request.method} {path}")
                elif not pid and _is_project_scoped(path):
                    # HUECO: endpoint que SI maneja datos de una obra pero no se
                    # pudo deducir cual → bajo ENFORCE hoy se COLARIA. Se avisa
                    # para cerrarlo (agregar el identificador de obra a la ruta).
                    logger.warning(f"[authz HUECO] proyecto indeterminable en endpoint con datos de obra: {request.method} {path} (user={user.get('id')})")
        except Exception as e:
            logger.error(f"authz error (fail-open): {e}")  # nunca bloquear por bug del authz

        return None
