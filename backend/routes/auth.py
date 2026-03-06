import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db_connection

auth_bp = Blueprint('auth', __name__)

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
            
            # Asegurar que el tipo de columna sea correcto si la tabla ya existía (migración pesada)
            cursor.execute("""
                DO $$ 
                DECLARE
                    row record;
                BEGIN 
                    -- 1. Eliminar la FK si existe para poder cambiar tipos
                    FOR row IN (
                        SELECT constraint_name 
                        FROM information_schema.table_constraints 
                        WHERE table_name = 'project_users' 
                          AND constraint_type = 'FOREIGN KEY' 
                          AND (constraint_name LIKE '%project_id%' OR constraint_name LIKE '%project_users_project_id_fkey%')
                    ) LOOP
                        EXECUTE 'ALTER TABLE project_users DROP CONSTRAINT ' || row.constraint_name;
                    END LOOP;

                    -- 2. Cambiar projects.id a TEXT si aún es integer
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'projects' AND column_name = 'id' AND data_type = 'integer'
                    ) THEN
                        ALTER TABLE projects ALTER COLUMN id TYPE TEXT USING id::text;
                    END IF;

                    -- 3. Cambiar project_users.project_id a TEXT si aún es integer
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'project_users' AND column_name = 'project_id' AND data_type = 'integer'
                    ) THEN
                        ALTER TABLE project_users ALTER COLUMN project_id TYPE TEXT USING project_id::text;
                    END IF;

                    -- 4. Re-añadir la FK
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE table_name = 'project_users' AND constraint_name = 'project_users_project_id_fkey'
                    ) THEN
                        ALTER TABLE project_users ADD CONSTRAINT project_users_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """)
            
            # Crear usuario Admin (Omar) si no existe
            cursor.execute("SELECT id FROM users WHERE email='omarsanchezh8@gmail.com'")
            if not cursor.fetchone():
                print("Creando usuario Administrador principal (Omar Sanchez)...")
                default_password = generate_password_hash("admin123")
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

@auth_bp.route('/api/auth/google', methods=['POST'])
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
            
        except ValueError:
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
                    'role': user[4],
                    'company': user[5],
                    'job_title': user[6]
                }), 200
            else:
                # Usuario no existe, crear cuenta automáticamente (Registro rápido)
                # Nota: Por defecto los dejamos sin empresa/cargo si es auto-registro, 
                # o el admin puede completarlo luego.
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, role)
                    VALUES (%s, %s, %s, %s) RETURNING id
                ''', (name, email, f"google_{google_id}", 'user'))
                new_id = cursor.fetchone()[0]
                conn.commit()
                
                return jsonify({
                    'id': new_id,
                    'name': name,
                    'email': email,
                    'role': 'user',
                    'is_new': True
                }), 200
                
    except Exception as e:
        print(f"Error en Google Auth: {e}")
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    """Valida las credenciales de un usuario con contraseña"""
    try:
        data = request.get_json()
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
                    'job_title': user[6]
                }), 200
            else:
                return jsonify({'error': 'Correo o contraseña incorrectos'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    """Permite a un usuario crear su propia cuenta"""
    try:
        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        company_id = data.get('company_id')
        job_title_id = data.get('job_title_id')
        
        if not name or not email or not password or not company_id or not job_title_id:
            return jsonify({'error': 'Faltan datos o selecciones en el formulario'}), 400
            
        hashed_pw = generate_password_hash(password)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Verificar si el email ya existe y su estado
            cursor.execute('SELECT id, password_hash, role FROM users WHERE email = %s', (email,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                u_id, u_hash, u_role = existing_user
                if not u_hash: # Es una invitación pendiente
                    cursor.execute('''
                        UPDATE users SET name=%s, password_hash=%s, company_id=%s, job_title_id=%s
                        WHERE id=%s
                    ''', (name, hashed_pw, company_id, job_title_id, u_id))
                    conn.commit()
                    return jsonify({
                        'id': u_id, 'name': name, 'email': email, 'role': u_role,
                        'company': company_id, 'job_title': job_title_id
                    }), 200
                else:
                    return jsonify({'error': 'El correo electrónico ya está registrado y activo'}), 400
            else:
                # Registro normal
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
                'role': 'user'
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
                users = []
                for r in rows:
                    users.append({
                        'id': r[0], 'name': r[1], 'email': r[2], 'role': r[3],
                        'created_at': r[4].isoformat() if r[4] else None,
                        'company_name': r[5] or 'N/A', 'job_title_name': r[6] or 'N/A'
                    })
                return jsonify(users), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    elif request.method == 'POST':
        try:
            data = request.get_json()
            email = data.get('email')
            role = data.get('role', 'user')
            
            if not email:
                return jsonify({'error': 'El correo es requerido'}), 400
                
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM users WHERE email = %s', (email,))
                if cursor.fetchone():
                    return jsonify({'error': 'El email ya existe o ya fue invitado'}), 400
                    
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, role)
                    VALUES (%s, %s, %s, %s)
                ''', ('(Invitado pendiente)', email.strip(), '', role))
                conn.commit()
                return jsonify({'success': True}), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Elimina un usuario"""
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
