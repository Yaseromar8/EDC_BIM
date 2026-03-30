"""
Auth Middleware for VISOR_APS_TL
Protects all /api/* endpoints by validating session tokens.
Public endpoints (login, register, google-auth) are whitelisted.
"""

import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g

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
    # ── Secure Share Engine ────────────────────────
    '/api/docs/shared/',      # Public UUID-based document viewer links
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


def validate_session(token):
    """Validate a session token. Returns user dict or None."""
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
                return {
                    'id': row[1],
                    'name': row[2],
                    'email': row[3],
                    'role': row[4]
                }
        return None
    except Exception as e:
        print(f"[auth_middleware] Error validating session: {e}")
        return None


def revoke_session(token):
    """Revoke a session token (logout)."""
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
        
        # Validate the session
        user = validate_session(token)
        if not user:
            return jsonify({'error': 'Sesión inválida o expirada', 'code': 'INVALID_TOKEN'}), 401
        
        # Store authenticated user in Flask's g context
        g.current_user = user
        return None
