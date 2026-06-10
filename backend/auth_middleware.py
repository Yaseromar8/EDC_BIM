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

# ── DEMO_TOKEN: backdoor de desarrollo (seguro por defecto) ─────────────────
# Historicamente el token 'DEMO_TOKEN' otorgaba acceso admin SIN login. Eso es
# un backdoor y en produccion debe estar APAGADO. Se controla por variable de
# entorno y por defecto esta DESACTIVADO.
#   ALLOW_DEMO_TOKEN=true  -> habilita el atajo demo (solo desarrollo local)
ALLOW_DEMO_TOKEN = os.getenv('ALLOW_DEMO_TOKEN', 'false').lower() in ('true', '1', 'yes')
if ALLOW_DEMO_TOKEN:
    print("[security] WARNING: ALLOW_DEMO_TOKEN ACTIVO -> DEMO_TOKEN concede admin sin login. NO usar en produccion.")
else:
    print("[security] DEMO_TOKEN deshabilitado (seguro). Para dev local: ALLOW_DEMO_TOKEN=true")

# Endpoints that don't require authentication
PUBLIC_ENDPOINTS = {
    '/api/auth/login',
    '/api/auth/register', 
    '/api/auth/google',
    '/api/auth/logout',
    '/api/auth/status',
    '/api/auth/aps/login',
    '/api/auth/aps/callback',
    '/api/token',           # Viewer token (Autodesk internal, not user-facing)
    '/api/companies',       # Public for registration form
    '/api/job_titles',      # Public for registration form
}

# Prefixes that bypass session-token auth
# ─ Static files: served directly, no auth needed
# ─ APS proxy endpoints: authenticated via Autodesk 2-legged/3-legged tokens
#   (managed by the backend, not by user session)
# 
# PROTECTED by session token (NOT listed here):
#   /api/docs/*      → ECD document CRUD
#   /api/users       → User listing
#   /api/tracking/*  → Construction progress tracking
#   /api/pins/*      → 3D annotation pins
#   /api/digital-twin/* → Digital twin data
#   /api/views/*     → Saved views
#   /api/maps/*      → GIS maps
#   /api/ai/*        → AI assistant
#   /api/schedule/*  → Project schedule
PUBLIC_PREFIXES = (
    # Static file serving
    '/maps/',                 # Static map tiles
    '/docs/uploads/',         # Static uploaded file serving
    # Autodesk APS proxy (uses internal Autodesk tokens, not user sessions)
    '/api/auth/aps/',         # APS OAuth callbacks
    '/api/hubs',              # ACC hubs (2-legged token)
    '/api/projects',          # ACC projects (2-legged token)
    '/api/build/',            # ACC upload/translation (2-legged token)
    '/api/images/',           # Image proxy (2-legged token)
    '/api/documents/',        # ACC document linking (2-legged token)
    # ── Secure Share Engine: SOLO links publicos por UUID ──────────────
    '/api/docs/shared/',      # Public UUID-based document viewer links
    '/api/views/',            # Public UUID-based shared views
    # NOTA (Fase 3): /api/inventory, /api/presupuesto y /api/config/* salieron
    # de aqui -> ahora EXIGEN sesion (y quedan cubiertos por authz por proyecto).
    # El frontend ya los llama via apiFetch (token). GET /api/config/project
    # sigue permitido por el caso especial de abajo (vistas compartidas).
)


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
        print(f"[auth_middleware] Error creating session: {e}")
        return None


# ── IN-MEMORY SESSION CACHE (TTL 60s) ──────────────────────────────────
# Elimina el roundtrip de ~600ms a Cloud SQL en cada request.
# Peor caso: una sesión revocada tarda 60s en ser rechazada.
_session_cache = {}  # token -> (user_dict, timestamp)
_SESSION_CACHE_TTL = 60  # seconds


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
        print(f"[auth_middleware] Error validating session: {e}")
        return None


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
        print(f"[auth_middleware] Error revoking session: {e}")
        return False


# ── Autorizacion por proyecto (tenencia / Pilar Identidad) ─────────────────
# Transicion segura: ENFORCE_PROJECT_AUTHZ off por defecto => LOG-ONLY (registra
# que bloquearia, pero PERMITE). Encender (=true) cuando se confirme que no
# rompe accesos. Siempre: admin bypass + fail-open ante error de BD.
ENFORCE_PROJECT_AUTHZ = os.getenv('ENFORCE_PROJECT_AUTHZ', 'false').lower() in ('true', '1', 'yes')
print(f"[security] Autorizacion por proyecto: {'ENFORCE' if ENFORCE_PROJECT_AUTHZ else 'log-only (no bloquea)'}")

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
        print(f"[authz] error verificando membresia: {e}")
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
            
        # Specific public routes for Gateway/BYPASS_AUTH mode
        # /api/views: Allow all methods (save/delete views without session token)
        # /api/config/project: Allow GET only (read config for shared views)
        if path == '/api/views':
            return None
        if request.method == 'GET' and path == '/api/config/project':
            return None
        
        # Skip public prefixes
        for prefix in PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return None
        
        # Extract token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        else:
            token = request.args.get('session_token')  # Fallback: query param
        
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

        # ── Autorizacion por proyecto (log-only por defecto) ──
        try:
            if user.get('role') != 'admin':
                pid = _request_project_id()
                if pid and not _user_in_project(user.get('id'), pid):
                    if ENFORCE_PROJECT_AUTHZ:
                        return jsonify({'error': 'Sin acceso a este proyecto', 'code': 'PROJECT_FORBIDDEN'}), 403
                    print(f"[authz][log-only] user={user.get('id')} SIN acceso a obra={pid} ({request.method} {path})")
        except Exception as e:
            print(f"[authz] error (fail-open): {e}")  # nunca bloquear por bug del authz

        return None
