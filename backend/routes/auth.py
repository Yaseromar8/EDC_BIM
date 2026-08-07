import os
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from politica import publico, requiere_rol
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db_connection
from auth_middleware import (create_session, revoke_session, revoke_all_sessions,
                             create_handoff_ticket, consume_handoff_ticket)
from rate_limit import limite, clave_por_correo
from enlaces_firmados import emitir, leer, PROPOSITO_INVITACION

auth_bp = Blueprint('auth', __name__)


def _require_admin(accion="esta acción"):
    """Guard de administrador para gestión de usuarios.

    Estos endpoints (invitar/eliminar usuarios y asignar accesos a proyectos)
    confiaban SOLO en que el frontend escondiera el botón — sin validar el rol
    en el servidor. Expuestos en producción eso permitía escalada de privilegios
    (crear un usuario con role='admin'). Mismo patrón que routes/documents.py.
    """
    user = getattr(g, 'current_user', None)
    if not user:
        # FAIL-CLOSED. Antes devolvia None (=permitido) delegando en el middleware,
        # pero el middleware no corria para las rutas bajo el prefijo publico
        # '/api/projects', asi que un anonimo pasaba este guard. Un guard nunca
        # debe asumir que otro ya comprobo: si no hay sesion, aqui se corta.
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    if user.get('role') != 'admin':
        return jsonify({'error': f'Solo los administradores pueden {accion}.'}), 403
    return None

def ensure_users_tables():
    """Crea las tablas de usuarios y la relación con proyectos si no existen"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Tabla de Empresas
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS companies (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL
                )
            ''')
            
            # Tabla de Cargos
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS job_titles (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL
                )
            ''')

            # Tabla de Usuarios (con password_hash y foreign keys)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) DEFAULT 'user',
                    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
                    job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Asegurar que las columnas nuevas existan si venimos de versiones anteriores
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)')
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL')
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL')
            
            # Tabla de Relación Usuario-Proyecto (para accesos)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS project_users (
                    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (project_id, user_id)
                )
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_project_users_user_project
                ON project_users (user_id, project_id)
            ''')
            
            # La migración pesada se ha removido para evitar bloqueos en la base de datos
            # durante el reinicio de los contenedores en Render.
            
            # Crear usuario Admin (Omar) si no existe.
            # Sin password hardcodeada: usa ADMIN_PASSWORD del entorno, o genera una
            # aleatoria fuerte y la imprime una vez (para capturarla). Nunca 'admin123'.
            cursor.execute("SELECT id FROM users WHERE email='omarsanchezh8@gmail.com'")
            if not cursor.fetchone():
                import os as _os, secrets as _secrets
                admin_pw = _os.getenv('ADMIN_PASSWORD') or _secrets.token_urlsafe(12)
                if not _os.getenv('ADMIN_PASSWORD'):
                    print(f"[AUTH] ADMIN_PASSWORD no definido -> password generada (GUARDALA): {admin_pw}")
                print("Creando usuario Administrador principal (Omar Sanchez)...")
                default_password = generate_password_hash(admin_pw)
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, role)
                    VALUES (%s, %s, %s, %s)
                ''', ('Omar Sanchez', 'omarsanchezh8@gmail.com', default_password, 'admin'))
            
            # (Opcional) Borrar el admin antiguo si existe
            cursor.execute("DELETE FROM users WHERE email='admin@plataforma.com'")
            
            conn.commit()
    except Exception as e:
        print(f"Error inicializando tablas de usuarios: {e}")

ensure_users_tables()

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Google Client ID (Debería estar en .env)
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', 'placeholder-google-client-id')
print(f"[AUTH] Google Client ID loaded: {GOOGLE_CLIENT_ID[:20]}...{GOOGLE_CLIENT_ID[-15:]}")

@auth_bp.route('/api/auth/google', methods=['POST'])
@publico(motivo='puerta de entrada: se llama antes de tener sesion')
def google_auth():
    """Autenticación o Registro vía Google"""
    try:
        data = request.get_json()
        token = data.get('token')
        
        if not token:
            return jsonify({'error': 'Token de Google faltante'}), 400
            
        # Verificar el token con Google
        try:
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)

            # Datos del usuario desde Google
            email = idinfo['email']
            name = idinfo.get('name', 'Usuario Google')
            google_id = idinfo['sub'] # ID único de Google

            # Google afirma la identidad, pero solo si el propio Google verificó
            # el correo. Sin este chequeo, un correo no verificado en el id_token
            # bastaba para emparejar con una cuenta de la plataforma.
            if not idinfo.get('email_verified'):
                return jsonify({'error': 'Tu correo de Google no está verificado'}), 403

        except ValueError as e:
            print(f"[AUTH] Google token verification FAILED: {e}")
            print(f"[AUTH] Using Client ID: {GOOGLE_CLIENT_ID}")
            return jsonify({'error': 'Token de Google inválido'}), 401
            
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Buscar si el usuario ya existe
            cursor.execute('''
                SELECT u.id, u.name, u.email, u.role, 
                       c.name as company_name, j.name as job_title_name
                FROM users u
                LEFT JOIN companies c ON u.company_id = c.id
                LEFT JOIN job_titles j ON u.job_title_id = j.id
                WHERE u.email = %s
            ''', (email,))
            user = cursor.fetchone()
            
            if user:
                # Usuario existe, iniciar sesión
                return jsonify({
                    'id': user[0],
                    'name': user[1],
                    'email': user[2],
                    # La cuarta columna es el rol; user[4] es la compañía y
                    # hacía que un admin autenticado con Google perdiera acceso.
                    'role': user[3],
                    'company': user[5],
                    'job_title': user[6],
                    'session_token': create_session(user[0])
                }), 200
            else:
                # SOLO POR INVITACION, igual que el registro con contraseña.
                # Antes se auto-creaba cuenta para CUALQUIER titular de una
                # cuenta Google valida para este client_id: una puerta abierta
                # que se saltaba entera la politica de invitacion.
                return jsonify({
                    'error': 'Este correo no tiene acceso a la plataforma. '
                             'Pide al administrador de la obra que te invite.',
                    'code': 'NO_INVITADO'
                }), 403

    except Exception as e:
        print(f"Error en Google Auth: {e}")
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/auth/login', methods=['POST'])
@publico(motivo='puerta de entrada: se llama antes de tener sesion')
@limite("20 per minute")                                  # por IP
@limite("8 per minute", key_func=clave_por_correo)        # por cuenta
@limite("40 per hour", key_func=clave_por_correo)         # barrido lento
def login():
    """Valida las credenciales de un usuario con contraseña"""
    try:
        data = request.get_json() or {}
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Faltan credenciales'}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT u.id, u.name, u.email, u.password_hash, u.role, 
                       c.name as company_name, j.name as job_title_name
                FROM users u
                LEFT JOIN companies c ON u.company_id = c.id
                LEFT JOIN job_titles j ON u.job_title_id = j.id
                WHERE u.email = %s
            ''', (email,))
            user = cursor.fetchone()
            
            if user and user[3] and check_password_hash(user[3], password):
                return jsonify({
                    'id': user[0],
                    'name': user[1],
                    'email': user[2],
                    'role': user[4],
                    'company': user[5],
                    'job_title': user[6],
                    'session_token': create_session(user[0])
                }), 200
            else:
                return jsonify({'error': 'Correo o contraseña incorrectos'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/auth/logout', methods=['POST'])
@publico(motivo='debe poder cerrar sesion tambien con un token ya caducado; solo revoca el token que venga en la cabecera')
def logout():
    """Revoke the current session token"""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        revoke_session(token)
    return jsonify({'success': True}), 200


@auth_bp.route('/api/auth/handoff', methods=['POST'])
def create_handoff():
    """Entrega un ticket SSO efímero para abrir el Visor desde Docs."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer ') or not getattr(g, 'current_user', None):
        return jsonify({'error': 'No autenticado'}), 401
    return jsonify({'ticket': create_handoff_ticket(auth_header[7:]), 'expires_in': 60})


@auth_bp.route('/api/auth/handoff/exchange', methods=['POST'])
def exchange_handoff():
    """Canjea una única vez un ticket SSO por la sesión existente."""
    ticket = (request.get_json(silent=True) or {}).get('ticket')
    token = consume_handoff_ticket(ticket) if ticket else None
    if not token:
        return jsonify({'error': 'Ticket inválido o vencido'}), 401
    return jsonify({'session_token': token})

@auth_bp.route('/api/auth/register', methods=['POST'])
@publico(motivo='alta por invitacion: quien la reclama todavia no tiene sesion (el token firmado es la prueba)')
@limite("10 per hour")
def register():
    """Permite a un usuario crear su propia cuenta"""
    try:
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        company_id = data.get('company_id')
        job_title_id = data.get('job_title_id')
        
        if not name or not email or not password:
            return jsonify({'error': 'Nombre, correo y contraseña son requeridos'}), 400
            
        hashed_pw = generate_password_hash(password)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Verificar si el email ya existe y su estado
            cursor.execute('SELECT id, password_hash, role FROM users WHERE email = %s', (email,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                u_id, u_hash, u_role = existing_user
                if not u_hash: # Es una invitación pendiente
                    # Reclamar exige el token firmado que emitio el admin al
                    # invitar. Antes bastaba con conocer el correo, y ademas se
                    # heredaba el rol invitado (admin incluido): toma de cuenta.
                    datos, motivo = leer(PROPOSITO_INVITACION, data.get('invite_token'))
                    if not datos or (datos.get('email') or '').lower() != (email or '').strip().lower():
                        return jsonify({
                            'error': 'Necesitas el enlace de invitación que te envió el administrador'
                                     + (f' ({motivo})' if motivo else '.'),
                            'code': 'INVITE_REQUIRED'
                        }), 403
                    cursor.execute('''
                        UPDATE users SET name=%s, password_hash=%s, company_id=%s, job_title_id=%s
                        WHERE id=%s
                    ''', (name, hashed_pw, company_id, job_title_id, u_id))
                    conn.commit()
                    # session_token: sin él, el invitado quedaba "logueado" pero
                    # todas sus llamadas autenticadas daban 401 hasta relogearse.
                    return jsonify({
                        'id': u_id, 'name': name, 'email': email, 'role': u_role,
                        'company': company_id, 'job_title': job_title_id,
                        'session_token': create_session(u_id)
                    }), 200
                else:
                    return jsonify({'error': 'El correo electrónico ya está registrado y activo'}), 400
            else:
                # SOLO POR INVITACIÓN (por defecto). Antes cualquiera con la URL
                # podía crearse una cuenta en producción. Para abrir el registro
                # libre (p. ej. en una demo), setear ALLOW_OPEN_REGISTRATION=true.
                if os.environ.get('ALLOW_OPEN_REGISTRATION', 'false').lower() != 'true':
                    return jsonify({
                        'error': 'El registro es solo por invitación. Pide a un administrador que te invite con este correo.'
                    }), 403

                # Registro normal (solo si el registro abierto está habilitado)
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, role, company_id, job_title_id)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                ''', (name, email, hashed_pw, 'user', company_id, job_title_id))
            new_id = cursor.fetchone()[0]
            conn.commit()
            
            return jsonify({
                'id': new_id,
                'name': name,
                'email': email,
                'role': 'user',
                'session_token': create_session(new_id)
            }), 200
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/auth/me', methods=['GET'])
def me():
    """Devuelve el usuario de la sesión actual (para que el Visor hidrate al
    entrar desde Docs con el token en la URL, sin re-loguear)."""
    user = getattr(g, 'current_user', None)
    if not user:
        return jsonify({'error': 'No autenticado'}), 401
    return jsonify({
        'id': user.get('id'),
        'name': user.get('name'),
        'email': user.get('email'),
        'role': user.get('role', 'user'),
    }), 200


@auth_bp.route('/api/auth/change-password', methods=['POST'])
def change_password():
    """Permite al usuario cambiar su contraseña (requiere contraseña actual)"""
    try:
        data = request.get_json() or {}
        # El usuario sale de la SESION, no del cuerpo: antes se podia operar
        # sobre la cuenta de otro pasando su user_id.
        sesion = getattr(g, 'current_user', None)
        if not sesion:
            return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
        user_id = sesion.get('id')
        current_password = data.get('current_password')
        new_password = data.get('new_password')

        if not current_password or not new_password:
            return jsonify({'error': 'Faltan campos requeridos'}), 400

        if len(new_password) < 6:
            return jsonify({'error': 'La nueva contraseña debe tener al menos 6 caracteres'}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT password_hash FROM users WHERE id = %s', (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'error': 'Usuario no encontrado'}), 404

            if not check_password_hash(user[0], current_password):
                return jsonify({'error': 'Contraseña actual incorrecta'}), 401

            new_hash = generate_password_hash(new_password)
            cursor.execute('UPDATE users SET password_hash = %s WHERE id = %s', (new_hash, user_id))
            conn.commit()

        # Fuera del bloque anterior para que el UPDATE ya este confirmado.
        # Se conserva la sesion actual: quien cambia la contraseña no se
        # autoexpulsa, pero cualquier otra sesion (tablet perdida) muere aqui.
        actual = request.headers.get('Authorization', '')
        actual = actual[7:] if actual.startswith('Bearer ') else None
        cerradas = revoke_all_sessions(user_id, excepto=actual)

        return jsonify({
            'success': True,
            'message': 'Contraseña actualizada correctamente',
            'sesiones_cerradas': cerradas
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/users', methods=['GET', 'POST'])
def manage_users():
    """Lista todos los usuarios o crea uno nuevo por parte del admin"""
    if request.method == 'GET':
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT u.id, u.name, u.email, u.role, u.created_at,
                           c.name as company_name, j.name as job_title_name
                    FROM users u
                    LEFT JOIN companies c ON u.company_id = c.id
                    LEFT JOIN job_titles j ON u.job_title_id = j.id
                    ORDER BY u.created_at DESC
                ''')
                rows = cursor.fetchall()
                # El padron completo (correo, empresa, cargo, rol) es una lista
                # de objetivos de phishing dirigido. Solo el admin lo ve entero;
                # el resto recibe lo justo para elegir destinatarios en
                # transmittals y revisiones.
                sesion = getattr(g, 'current_user', None)
                es_admin = bool(sesion and sesion.get('role') == 'admin')
                users = []
                for r in rows:
                    if es_admin:
                        users.append({
                            'id': r[0], 'name': r[1], 'email': r[2], 'role': r[3],
                            'created_at': r[4].isoformat() if r[4] else None,
                            'company_name': r[5] or 'N/A', 'job_title_name': r[6] or 'N/A'
                        })
                    else:
                        users.append({'id': r[0], 'name': r[1]})
                return jsonify(users), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    elif request.method == 'POST':
        denied = _require_admin("invitar usuarios")
        if denied:
            return denied
        try:
            data = request.get_json()
            email = data.get('email')
            role = data.get('role', 'user')

            if not email:
                return jsonify({'error': 'El correo es requerido'}), 400
            # Solo roles conocidos: bloquea inyectar un rol arbitrario por payload.
            if role not in ('user', 'editor', 'viewer', 'admin'):
                return jsonify({'error': 'Rol inválido'}), 400
                
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM users WHERE email = %s', (email,))
                if cursor.fetchone():
                    return jsonify({'error': 'El email ya existe o ya fue invitado'}), 400
                    
                correo = email.strip().lower()
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, role)
                    VALUES (%s, %s, %s, %s)
                ''', ('(Invitado pendiente)', correo, '', role))
                conn.commit()

                # El token es la prueba de que la invitacion viene del admin.
                # Sin el, reclamar la cuenta solo exigia conocer el correo.
                # Mientras no haya envio de correo (F3), el admin copia este
                # enlace y lo hace llegar por su medio.
                token = emitir(PROPOSITO_INVITACION, {'email': correo, 'role': role})
                return jsonify({
                    'success': True,
                    'invite_token': token,
                    'invite_url': f"{request.host_url.rstrip('/')}/registro?invite={token}",
                    'nota': 'Comparte este enlace con la persona invitada. Caduca en 14 días.'
                }), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@requiere_rol('admin')
def delete_user(user_id):
    """Elimina un usuario"""
    denied = _require_admin("eliminar usuarios")
    if denied:
        return denied
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
            conn.commit()
            return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Endpoints para Etiquetas de Empresas y Cargos (Admin)
# -------------------------------------------------------------

@auth_bp.route('/api/companies', methods=['GET', 'POST'])
def manage_companies():
    if request.method == 'GET':
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id, name FROM companies ORDER BY name ASC')
                return jsonify([{'id': r[0], 'name': r[1]} for r in cursor.fetchall()]), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    elif request.method == 'POST':
        try:
            name = request.get_json().get('name')
            if not name: return jsonify({'error': 'Nombre es requerido'}), 400
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT INTO companies (name) VALUES (%s) RETURNING id', (name.strip(),))
                new_id = cursor.fetchone()[0]
                conn.commit()
                return jsonify({'id': new_id, 'name': name.strip()}), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/companies/<int:company_id>', methods=['DELETE'])
def delete_company(company_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM companies WHERE id = %s', (company_id,))
            conn.commit()
            return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/job_titles', methods=['GET', 'POST'])
def manage_job_titles():
    if request.method == 'GET':
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id, name FROM job_titles ORDER BY name ASC')
                return jsonify([{'id': r[0], 'name': r[1]} for r in cursor.fetchall()]), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    elif request.method == 'POST':
        try:
            name = request.get_json().get('name')
            if not name: return jsonify({'error': 'Nombre es requerido'}), 400
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT INTO job_titles (name) VALUES (%s) RETURNING id', (name.strip(),))
                new_id = cursor.fetchone()[0]
                conn.commit()
                return jsonify({'id': new_id, 'name': name.strip()}), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/job_titles/<int:job_id>', methods=['DELETE'])
def delete_job_title(job_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM job_titles WHERE id = %s', (job_id,))
            conn.commit()
            return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Endpoints para Relación Proyecto-Usuario (Accesos)
# -------------------------------------------------------------

@auth_bp.route('/api/projects/<project_id>/users', methods=['GET'])
def get_project_users(project_id):
    """Obtiene la lista de IDs de usuarios asignados a un proyecto"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT user_id FROM project_users WHERE project_id = %s', (project_id,))
            rows = cursor.fetchall()
            user_ids = [r[0] for r in rows]
            return jsonify(user_ids), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/projects/<project_id>/users', methods=['POST'])
def update_project_users(project_id):
    """Actualiza la lista de usuarios asignados a un proyecto (reemplazo total)"""
    denied = _require_admin("asignar usuarios a un proyecto")
    if denied:
        return denied
    try:
        data = request.get_json()
        user_ids = data.get('user_ids', [])
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Borrar asignaciones actuales
            cursor.execute('DELETE FROM project_users WHERE project_id = %s', (project_id,))
            
            # 2. Insertar nuevas asignaciones (solo si son usuarios reales y no admins, aunque el front ya filtra)
            if user_ids:
                # Filtrar para asegurar que los IDs existen y no son de administradores
                # (Opcional, pero recomendado para robustez)
                cursor.execute('SELECT id FROM users WHERE id IN %s AND role != %s', (tuple(user_ids), 'admin'))
                valid_ids = [r[0] for r in cursor.fetchall()]
                
                for u_id in valid_ids:
                    cursor.execute('''
                        INSERT INTO project_users (project_id, user_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    ''', (project_id, u_id))
            
            conn.commit()
            return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
