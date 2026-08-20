from esquema_congelado import solo_con_ddl
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from politica import publico, requiere_rol
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db_connection
from auth_middleware import (create_session, revoke_session, revoke_all_sessions,
                             create_handoff_ticket, consume_handoff_ticket)
from rate_limit import limite, clave_por_correo
from enlaces_firmados import emitir, leer, PROPOSITO_INVITACION, PROPOSITO_RESET, PROPOSITO_2FA
from password_policy import validar as validar_password
import mailer

auth_bp = Blueprint('auth', __name__)


def _origenes_permitidos():
    """Lista blanca de webs propias. Reutiliza CORS_ORIGINS, que ya las declara."""
    crudo = os.getenv('CORS_ORIGINS', '') or ''
    return {o.strip().rstrip('/') for o in crudo.split(',') if o.strip().startswith('http')}


def _origen_del_cliente():
    """A que web apuntan los enlaces de los correos (visor o portal de documentos).

    SOLO se acepta el Origin si esta en la lista blanca. Derivarlo de la cabecera
    sin comprobar era un agujero grave: un atacante hacia
        POST /api/auth/forgot-password  {"email": "victima@obra.com"}
        Origin: https://dominio-del-atacante
    desde curl (no hay navegador, asi que CORS no interviene), y a la victima le
    llegaba a su buzon REAL un correo nuestro con un boton hacia el dominio del
    atacante. Al pulsarlo, el token de restablecimiento quedaba en los logs del
    atacante, que se quedaba con la cuenta -- y como restablecer revoca todas las
    sesiones, ademas echaba a la victima. Un solo intento bastaba: el limite de
    5/hora no protege de nada aqui.
    """
    porDefecto = os.getenv('APP_URL', 'https://visor-ecd-frontend.onrender.com').rstrip('/')
    origen = (request.headers.get('Origin') or request.headers.get('Referer') or '').strip()
    if not origen.startswith('http'):
        return porDefecto
    from urllib.parse import urlparse
    u = urlparse(origen)
    candidato = f'{u.scheme}://{u.netloc}'.rstrip('/')
    permitidos = _origenes_permitidos()
    if not permitidos:
        # Sin CORS_ORIGINS configurado no hay lista blanca en la que confiar:
        # se usa el destino fijo en vez de creerse la cabecera.
        return porDefecto
    if candidato in permitidos:
        return candidato
    logger_origen = f"origen no permitido en enlace de correo: {candidato}"
    print(f"[auth] {logger_origen}")
    return porDefecto


def registrar_evento(evento, email=None, user_id=None, detalle=None):
    """Deja rastro de los accesos. Nunca revienta la peticion por fallar."""
    try:
        ip = (request.headers.get('X-Forwarded-For') or request.remote_addr or '').split(',')[0].strip()
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO auth_events (evento, email, user_id, ip, user_agent, detalle)'
                ' VALUES (%s, %s, %s, %s, %s, %s)',
                (evento, (email or '')[:255] or None, user_id, ip[:64],
                 (request.headers.get('User-Agent') or '')[:500], detalle))
            conn.commit()
    except Exception as e:
        print(f"[auth] no se pudo registrar el evento {evento}: {e}")


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

@solo_con_ddl
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

            # Desactivar en vez de borrar: hasta ahora la unica accion sobre un
            # usuario era el DELETE fisico, que arrastra en cascada sus sesiones,
            # accesos y permisos. Retirar el acceso a alguien que deja la obra no
            # deberia borrar su rastro de quien hizo que.
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE')
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP')

            # Auditoria de accesos: sin esto un ataque de fuerza bruta no deja
            # ningun rastro y no hay forma de saber quien entro ni desde donde.
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS auth_events (
                    id SERIAL PRIMARY KEY,
                    creado_en TIMESTAMP DEFAULT NOW(),
                    evento VARCHAR(40) NOT NULL,
                    email VARCHAR(255),
                    user_id INTEGER,
                    ip VARCHAR(64),
                    user_agent TEXT,
                    detalle TEXT
                )
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_auth_events_creado
                ON auth_events (creado_en DESC)
            ''')
            
            # La migración pesada se ha removido para evitar bloqueos en la base de datos
            # durante el reinicio de los contenedores en Render.
            conn.commit()
    except Exception as e:
        print(f"Error inicializando tablas de usuarios: {e}")


def asegurar_administrador_inicial():
    """Crea el primer administrador. NO lleva @solo_con_ddl, y ese es el punto.

    EL BLOQUEANTE QUE ESTO ARREGLA
    ------------------------------
    Esto vivia DENTRO de `ensure_users_tables`, que si esta decorada porque crea
    tablas. Con DDL_EN_CALIENTE=false -- que es justo lo que la guia de
    despliegue manda para la instancia de una entidad -- el decorador devuelve
    None sin entrar: las tablas no se tocan (correcto) y EL ADMINISTRADOR
    TAMPOCO SE CREA (desastre). La instancia arranca impecable, declara
    `faltan: 0`, y no puede entrar nadie. Nunca.

    Se descubrio EJECUTANDO el simulacro de primera entidad, no leyendo codigo:
    el login del administrador devolvio 401 sobre una instancia recien nacida.

    Es la misma familia que `ensure_project_root_node` (N66): una funcion que
    mezcla esquema con DATOS y queda muda entera al congelar el DDL. La
    diferencia es que aquella no tenia ni una sentencia DDL y el candado la
    cazo; esta si las tiene, asi que el candado la dejo pasar. Por eso crear
    datos y crear esquema no pueden compartir funcion.

    El correo y el nombre salen del ENTORNO: el primer administrador de la
    instancia de una municipalidad tiene que ser quien la opera, no el
    desarrollador. Sin ADMIN_EMAIL se conserva el valor historico para no
    cambiarle nada a la instancia que ya existe.
    """
    import os as _os
    import secrets as _secrets
    email = (_os.getenv('ADMIN_EMAIL') or '').strip()
    nombre = (_os.getenv('ADMIN_NAME') or '').strip()
    if not email:
        # EN PERFIL PORTAL NO HAY VALOR HISTORICO QUE CONSERVAR.
        # Una instancia de entidad es nueva por definicion, y caer al correo del
        # desarrollador ahi significa que el ECD de una municipalidad nace con un
        # administrador que no es suyo. Se niega y se dice, en vez de crear
        # callando una cuenta ajena. En perfil completo se conserva el historico:
        # ahi si hay una instancia viva a la que no se le debe cambiar nada.
        if (_os.getenv('DEPLOY_PROFILE') or 'completo').strip().lower() == 'portal':
            print('[AUTH] ADMIN_EMAIL no definido en perfil portal: NO se crea '
                  'administrador inicial. Definelo y vuelve a desplegar.')
            return
        email = 'omarsanchezh8@gmail.com'
        nombre = nombre or 'Omar Sanchez'
    nombre = nombre or email.split('@')[0]
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cursor.fetchone():
                return
            clave = _os.getenv('ADMIN_PASSWORD') or _secrets.token_urlsafe(12)
            if not _os.getenv('ADMIN_PASSWORD'):
                print(f"[AUTH] ADMIN_PASSWORD no definido -> password generada (GUARDALA): {clave}")
            print(f"[AUTH] Creando administrador inicial ({nombre} <{email}>)...")
            cursor.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
                (nombre, email, generate_password_hash(clave), 'admin'))
            cursor.execute("DELETE FROM users WHERE email = 'admin@plataforma.com'")
            conn.commit()
    except Exception as e:
        print(f"[AUTH] no se pudo asegurar el administrador inicial: {e}")


ensure_users_tables()
asegurar_administrador_inicial()

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
                       c.name as company_name, j.name as job_title_name,
                       COALESCE(u.is_active, TRUE)
                FROM users u
                LEFT JOIN companies c ON u.company_id = c.id
                LEFT JOIN job_titles j ON u.job_title_id = j.id
                WHERE u.email = %s
            ''', (email,))
            user = cursor.fetchone()

            if user and user[3] and check_password_hash(user[3], password):
                if not user[7]:
                    # Cuenta desactivada: mismo mensaje que credenciales malas.
                    # Decir "tu cuenta esta desactivada" confirmaria que existe.
                    registrar_evento('login_desactivado', email=email, user_id=user[0])
                    return jsonify({'error': 'Correo o contraseña incorrectos'}), 401
                # ── SEGUNDO FACTOR ────────────────────────────────────────────
                # Si la cuenta lo tiene activado, la contrasena correcta NO da
                # sesion todavia: da un desafio de un solo uso que se canjea en
                # /api/auth/2fa/verify presentando el codigo.
                #
                # Se emite ANTES de registrar 'login_ok' y antes de crear sesion:
                # una contrasena acertada sin segundo factor no es un inicio de
                # sesion, y anotarlo como tal falsearia el registro.
                try:
                    cursor.execute('SELECT COALESCE(totp_activo, FALSE) FROM users WHERE id = %s',
                                   (user[0],))
                    _fila = cursor.fetchone()
                    _tiene_2fa = bool(_fila and _fila[0])
                except Exception:
                    # Si la columna aun no existe (base sin migrar), se sigue como
                    # antes. Fallar aqui dejaria a todo el mundo sin poder entrar.
                    # El rollback es obligatorio: en PostgreSQL una sentencia que
                    # falla deja la transaccion abortada, y sin el se caerian todas
                    # las siguientes de este mismo login.
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    _tiene_2fa = False
                if _tiene_2fa:
                    from enlaces_firmados import emitir
                    registrar_evento('login_pide_2fa', email=email, user_id=user[0])
                    return jsonify({
                        'requiere_2fa': True,
                        'desafio': emitir(PROPOSITO_2FA, {'uid': user[0]}),
                    }), 200

                # A quien se le exige el segundo factor y no lo tiene puesto, se
                # le avisa. Con EXIGIR_2FA_ESTRICTO=true ademas se le cierra la
                # puerta: es el interruptor que la entidad enciende DESPUES de dar
                # de alta a sus administradores, no antes (encenderlo antes deja a
                # todo el mundo fuera de su propio sistema).
                import segundo_factor as _dfa
                _pendiente = _dfa.exigido_para(user[4])
                if _pendiente and os.getenv('EXIGIR_2FA_ESTRICTO', 'false').lower() == 'true':
                    registrar_evento('login_bloqueado_sin_2fa', email=email, user_id=user[0])
                    return jsonify({
                        'error': 'Esta cuenta debe tener segundo factor para entrar.',
                        'code': 'SEGUNDO_FACTOR_OBLIGATORIO'}), 403

                registrar_evento('login_ok', email=email, user_id=user[0])
                try:
                    cursor.execute('UPDATE users SET last_login_at = NOW() WHERE id = %s', (user[0],))
                    conn.commit()
                except Exception:
                    pass
                return jsonify({
                    'id': user[0],
                    'name': user[1],
                    'email': user[2],
                    'role': user[4],
                    'company': user[5],
                    'job_title': user[6],
                    'session_token': create_session(user[0]),
                    'segundo_factor_pendiente': _pendiente,
                }), 200
            else:
                registrar_evento('login_fallido', email=email,
                                 user_id=(user[0] if user else None))
                return jsonify({'error': 'Correo o contraseña incorrectos'}), 401
    except Exception as e:
        # str(e) al cliente filtraba detalles internos de la base de datos.
        print(f"[auth] error en login: {e}")
        return jsonify({'error': 'No se pudo procesar el acceso. Inténtalo de nuevo.'}), 500

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
@publico(motivo='canjea un ticket de un solo uso y 60 s por una sesion: por diseño se llama SIN sesion')
def exchange_handoff():
    """Canjea una única vez un ticket SSO por la sesión existente."""
    ticket = (request.get_json(silent=True) or {}).get('ticket')
    token = consume_handoff_ticket(ticket) if ticket else None
    if not token:
        return jsonify({'error': 'Ticket inválido o vencido'}), 401
    return jsonify({'session_token': token})

@auth_bp.route('/api/auth/forgot-password', methods=['POST'])
@publico(motivo='quien ha olvidado su contraseña por definicion no puede autenticarse')
@limite("5 per hour", key_func=clave_por_correo)
@limite("20 per hour")
def forgot_password():
    """Envía un enlace de restablecimiento. Nunca revela si el correo existe."""
    correo = ((request.get_json(silent=True) or {}).get('email') or '').strip().lower()

    # RESPUESTA CONSTANTE, exista o no la cuenta. Si aqui se distinguiera, este
    # endpoint se convertiria en un oraculo para saber quien trabaja en la obra
    # — que es justo la lista que necesita un ataque de phishing dirigido.
    respuesta = jsonify({
        'success': True,
        'message': 'Si ese correo tiene una cuenta, le llegará un enlace para restablecer la contraseña.'
    }), 200

    if not correo:
        return respuesta

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, name, password_hash FROM users WHERE email = %s', (correo,))
            fila = cursor.fetchone()
    except Exception as e:
        print(f"[auth] forgot-password: error de BD: {e}")
        return respuesta

    # Sin cuenta, o invitacion pendiente (password_hash vacio): no hay nada que
    # restablecer. Se responde igual, sin decirlo.
    if not fila or not fila[2]:
        return respuesta

    user_id, nombre = fila[0], fila[1]
    try:
        token = emitir(PROPOSITO_RESET, {'uid': user_id, 'email': correo})
    except Exception as e:
        # Si no se puede ni firmar, el flujo entero es inservible. Se responde
        # 500 A PROPOSITO: peor que no recibir el correo es que la pantalla diga
        # que va en camino cuando ni siquiera se intento.
        print(f"[auth] NO se pudo firmar el enlace de reset: {e}")
        return jsonify({'error': 'No se pudo generar el enlace. Avisa al administrador.',
                        'code': 'FIRMA_NO_DISPONIBLE'}), 500
    enlace = f"{_origen_del_cliente()}/?reset={token}"

    enviado, detalle = mailer.enviar(
        destino=correo,
        asunto='Restablece tu contraseña',
        titulo='Restablece tu contraseña',
        cuerpo=f'Hola {nombre or ""}, recibimos una solicitud para cambiar la contraseña de tu cuenta. '
               f'El enlace caduca en 1 hora y solo puede usarse una vez.',
        enlace=enlace,
        texto_boton='Cambiar mi contraseña',
    )
    if not enviado:
        print(f"[auth] enlace de reset NO enviado ({detalle}); queda en el log para envio manual")
    return respuesta


@auth_bp.route('/api/auth/reset-password', methods=['POST'])
@publico(motivo='se llama con el token del enlace, no con una sesion')
@limite("10 per hour")
def reset_password():
    """Fija una contraseña nueva a partir del token del enlace."""
    datos = request.get_json(silent=True) or {}
    contenido, motivo = leer(PROPOSITO_RESET, datos.get('token'))
    if not contenido:
        return jsonify({'error': f'El enlace no sirve: {motivo}. Pide uno nuevo.',
                        'code': 'TOKEN_INVALIDO'}), 400

    nueva = datos.get('password') or ''
    user_id = contenido.get('uid')
    correo = contenido.get('email')

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # El token lleva el correo dentro y va firmado: se exige que ambos
            # sigan casando, para que un cambio de correo invalide los enlaces
            # emitidos antes.
            cursor.execute('SELECT email, name FROM users WHERE id = %s', (user_id,))
            fila = cursor.fetchone()
            if not fila or (fila[0] or '').lower() != (correo or '').lower():
                return jsonify({'error': 'El enlace ya no es válido. Pide uno nuevo.'}), 400

            # Con el nombre real delante: la política también rechaza que la
            # contraseña sea el propio nombre del usuario.
            fallo = validar_password(nueva, correo=correo, nombre=fila[1])
            if fallo:
                return jsonify({'error': fallo, 'code': 'PASSWORD_DEBIL'}), 400

            cursor.execute('UPDATE users SET password_hash = %s WHERE id = %s',
                           (generate_password_hash(nueva), user_id))
            conn.commit()
    except Exception as e:
        print(f"[auth] reset-password: error de BD: {e}")
        return jsonify({'error': 'No se pudo cambiar la contraseña. Inténtalo de nuevo.'}), 500

    # Restablecer la contraseña cierra TODAS las sesiones: el motivo habitual
    # para llegar aqui es que alguien mas tiene acceso.
    cerradas = revoke_all_sessions(user_id)
    return jsonify({'success': True, 'sesiones_cerradas': cerradas,
                    'message': 'Contraseña actualizada. Ya puedes entrar.'}), 200


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

        # La politica se aplica en el SERVIDOR. El minimo vivia solo en la
        # pantalla, asi que llamando la API se creaba una cuenta con "a".
        fallo = validar_password(password, correo=email, nombre=name)
        if fallo:
            return jsonify({'error': fallo, 'code': 'PASSWORD_DEBIL'}), 400

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

        # Misma politica que en registro y reset: antes aqui el minimo era 6 y
        # en el registro no habia ninguno.
        fallo = validar_password(new_password, correo=sesion.get('email'), nombre=sesion.get('name'))
        if fallo:
            return jsonify({'error': fallo, 'code': 'PASSWORD_DEBIL'}), 400

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
                # El padron completo (correo, empresa, cargo, rol) es una lista
                # de objetivos de phishing dirigido. Solo el admin lo ve entero;
                # el resto recibe lo justo para elegir destinatarios en
                # transmittals y revisiones.
                sesion = getattr(g, 'current_user', None)
                es_admin = bool(sesion and sesion.get('role') == 'admin')
                _uid = (sesion or {}).get('id')

                _COLUMNAS = '''
                    SELECT u.id, u.name, u.email, u.role, u.created_at,
                           c.name as company_name, j.name as job_title_name
                    FROM users u
                    LEFT JOIN companies c ON u.company_id = c.id
                    LEFT JOIN job_titles j ON u.job_title_id = j.id
                '''
                if es_admin:
                    cursor.execute(_COLUMNAS + ' ORDER BY u.created_at DESC')
                elif _uid:
                    # Solo las personas con las que se comparte alguna obra. Los
                    # campos sensibles ya estaban limitados al admin, pero el
                    # NOMBRE de todas las personas de todas las obras si salia, y
                    # eso ya dice quien trabaja con quien y en que: en una obra
                    # publica con varias empresas, es informacion.
                    cursor.execute(_COLUMNAS + '''
                        WHERE u.id = %s OR u.id IN (
                            SELECT pu.user_id FROM project_users pu
                             WHERE pu.project_id IN (
                                 SELECT project_id FROM project_users WHERE user_id = %s))
                        ORDER BY u.created_at DESC
                    ''', (_uid, _uid))
                else:
                    cursor.execute(_COLUMNAS + ' WHERE FALSE')   # sin sesion, nadie
                rows = cursor.fetchall()
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
                    # EL ENLACE APUNTA AL PORTAL, NO AL BACKEND.
                    # Antes se construia con `request.host_url`, que es el host
                    # del BACKEND. En un despliegue real el portal vive en otro
                    # dominio (backend y portal son servicios distintos), asi que
                    # el enlace que la entidad repartia a su equipo llevaba a un
                    # sitio sin pagina de registro: nadie podia darse de alta.
                    # `_origen_del_cliente()` ya resuelve esto bien para el
                    # restablecimiento de contrasena -- valida el Origin contra
                    # la lista blanca y, si no lo hay, cae en APP_URL -- y es la
                    # misma pregunta: ¿a que web mando a esta persona?
                    'invite_url': f"{_origen_del_cliente()}/registro?invite={token}",
                    'nota': 'Comparte este enlace con la persona invitada. Caduca en 14 días.'
                }), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@requiere_rol('admin')
def delete_user(user_id):
    """Retira el acceso de un usuario. DESACTIVA, no borra.

    El DELETE fisico arrastraba en cascada sus sesiones, accesos y permisos: al
    retirar a alguien que deja la obra se perdia tambien el rastro de quien hizo
    que. Se puede forzar el borrado real con ?purgar=1, pero no es lo normal.
    """
    denied = _require_admin("retirar el acceso de un usuario")
    if denied:
        return denied

    sesion = getattr(g, 'current_user', None)
    if sesion and str(sesion.get('id')) == str(user_id):
        return jsonify({'error': 'No puedes retirarte el acceso a ti mismo.'}), 400

    purgar = request.args.get('purgar') == '1'
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # No dejar la plataforma sin ningun admin activo.
            cursor.execute("SELECT role, COALESCE(is_active, TRUE) FROM users WHERE id = %s", (user_id,))
            fila = cursor.fetchone()
            if not fila:
                return jsonify({'error': 'Usuario no encontrado'}), 404
            if fila[0] == 'admin':
                cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND COALESCE(is_active, TRUE)")
                if (cursor.fetchone() or [0])[0] <= 1:
                    return jsonify({'error': 'Es el único administrador activo: asigna otro antes.'}), 400

            if purgar:
                cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
                evento = 'usuario_borrado'
            else:
                cursor.execute('UPDATE users SET is_active = FALSE WHERE id = %s', (user_id,))
                evento = 'usuario_desactivado'
            conn.commit()

        # Desactivar sin cerrar sus sesiones no retira nada: su token seguiria
        # sirviendo hasta 7 dias.
        revoke_all_sessions(user_id)
        registrar_evento(evento, user_id=user_id,
                         detalle=f"por admin {sesion.get('id') if sesion else '?'}")
        return jsonify({'success': True, 'purgado': purgar}), 200
    except Exception as e:
        print(f"[auth] error retirando acceso: {e}")
        return jsonify({'error': 'No se pudo completar la operación.'}), 500


@auth_bp.route('/api/auth/events', methods=['GET'])
@requiere_rol('admin')
def listar_eventos():
    """Registro de accesos y de cambios sobre obras. Solo administración.

    Existe porque el 2026-08-07 alguien archivó una obra y no hubo forma de
    saber quién: había que entrar a la base para mirarlo, y ni siquiera estaba
    registrado. Ahora se ve desde la propia plataforma.
    """
    denied = _require_admin("ver el registro de accesos")
    if denied:
        return denied

    limite = min(int(request.args.get('limite', 100) or 100), 500)
    evento = (request.args.get('evento') or '').strip()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            sql = ('SELECT creado_en, evento, email, user_id, ip, detalle'
                   ' FROM auth_events')
            params = []
            if evento:
                sql += ' WHERE evento = %s'
                params.append(evento)
            sql += ' ORDER BY creado_en DESC LIMIT %s'
            params.append(limite)
            cur.execute(sql, params)
            eventos = [{
                'fecha': r[0].isoformat() if r[0] else None,
                'evento': r[1], 'email': r[2], 'user_id': r[3],
                'ip': r[4], 'detalle': r[5],
            } for r in cur.fetchall()]
        return jsonify({'eventos': eventos}), 200
    except Exception as e:
        print(f"[auth] error leyendo eventos: {e}")
        return jsonify({'error': 'No se pudo leer el registro.'}), 500


@auth_bp.route('/api/users/<int:user_id>/role', methods=['PATCH'])
@requiere_rol('admin')
def cambiar_rol(user_id):
    """Cambia el rol de un usuario. Antes no habia forma: solo borrar y reinvitar."""
    denied = _require_admin("cambiar el rol de un usuario")
    if denied:
        return denied

    nuevo = ((request.get_json(silent=True) or {}).get('role') or '').strip()
    if nuevo not in ('user', 'editor', 'viewer', 'admin'):
        return jsonify({'error': 'Rol inválido'}), 400

    sesion = getattr(g, 'current_user', None)
    if sesion and str(sesion.get('id')) == str(user_id) and nuevo != 'admin':
        return jsonify({'error': 'No puedes quitarte a ti mismo el rol de administrador.'}), 400

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT role FROM users WHERE id = %s', (user_id,))
            fila = cursor.fetchone()
            if not fila:
                return jsonify({'error': 'Usuario no encontrado'}), 404
            if fila[0] == 'admin' and nuevo != 'admin':
                cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND COALESCE(is_active, TRUE)")
                if (cursor.fetchone() or [0])[0] <= 1:
                    return jsonify({'error': 'Es el único administrador activo.'}), 400
            cursor.execute('UPDATE users SET role = %s WHERE id = %s', (nuevo, user_id))
            conn.commit()

        # Cambiar el rol tiene que surtir efecto YA: el rol viaja dentro de la
        # sesion cacheada, asi que sin revocar seguiria con el rol viejo.
        revoke_all_sessions(user_id)
        registrar_evento('rol_cambiado', user_id=user_id, detalle=f'{fila[0]} -> {nuevo}')
        return jsonify({'success': True, 'role': nuevo}), 200
    except Exception as e:
        print(f"[auth] error cambiando rol: {e}")
        return jsonify({'error': 'No se pudo cambiar el rol.'}), 500

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
    # El decorador @requiere_rol solo bloquea en modo estricto, y GET
    # /api/projects* es publico por prefijo: sin este guard la membresia de la
    # obra la lee cualquiera, incluido un anonimo.
    denied = _require_admin("ver los accesos de una obra")
    if denied:
        return denied
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


# =========================================================================
#  SEGUNDO FACTOR (TOTP)  ·  BASELINE 0 · C9
# =========================================================================
#  La contrasena era lo unico que separaba a un atacante de la cuenta que puede
#  archivar obras y borrar documentos. El ciclo es:
#      /setup       genera el secreto y devuelve la URI del QR (aun NO activa)
#      /activar     exige un codigo valido y entonces si lo activa
#      /verify      canjea el desafio del login por una sesion
#      /desactivar  exige codigo: robar la sesion no basta para quitarlo
#
#  El secreto se guarda en claro a proposito: TOTP lo necesita para calcular el
#  codigo, no admite hash. Por eso esto NO sustituye a separar las identidades
#  de base de datos: quien entre por debajo de la aplicacion no pasa por aqui.


@auth_bp.route('/api/auth/2fa/setup', methods=['POST'])
def dfa_setup():
    """Genera un secreto y devuelve la URI del QR. NO lo activa todavia."""
    import segundo_factor as dfa
    u = getattr(g, 'current_user', None)
    if not u:
        return jsonify({'error': 'Autenticación requerida'}), 401
    try:
        secreto = dfa.secreto_nuevo()
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Solo se pisa el secreto si el 2FA NO esta activo: si lo estuviera,
            # esta seria la forma de anularlo desde una sesion robada.
            # Se guarda CIFRADO. En claro, una copia de la base bastaba para
            # generar codigos validos de cualquier cuenta, para siempre -- y la
            # copia de seguridad lo llevaba dentro.
            cur.execute('UPDATE users SET totp_secreto = %s WHERE id = %s'
                        '   AND COALESCE(totp_activo, FALSE) = FALSE',
                        (dfa.cifrar_secreto(secreto), u['id']))
            if not cur.rowcount:
                return jsonify({'error': 'El segundo factor ya está activo. '
                                         'Desactívalo antes de volver a darlo de alta.'}), 409
            conn.commit()
        registrar_evento('2fa_setup', email=u.get('email'), user_id=u['id'])
        return jsonify({'secreto': secreto,
                        'uri': dfa.uri_de_provisionamiento(secreto, u.get('email') or '')}), 200
    except Exception as e:
        print(f'[2fa] setup: {e}')
        return jsonify({'error': 'No se pudo iniciar el alta del segundo factor.'}), 500


@auth_bp.route('/api/auth/2fa/activar', methods=['POST'])
@limite("10 per minute")
def dfa_activar():
    """Activa el segundo factor tras comprobar un codigo. Devuelve los de recuperacion."""
    import segundo_factor as dfa
    u = getattr(g, 'current_user', None)
    if not u:
        return jsonify({'error': 'Autenticación requerida'}), 401
    codigo_dado = (request.get_json() or {}).get('codigo')
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT totp_secreto, COALESCE(totp_activo, FALSE)'
                        '  FROM users WHERE id = %s', (u['id'],))
            fila = cur.fetchone()
            if not fila or not fila[0]:
                return jsonify({'error': 'Primero hay que generar el secreto.'}), 400
            if fila[1]:
                return jsonify({'error': 'El segundo factor ya está activo.'}), 409
            try:
                secreto_claro = dfa.descifrar_secreto(fila[0])
            except dfa.SecretoIlegible:
                return jsonify({
                    'error': 'Se rotó la clave del servidor y este secreto ya no '
                             'se puede leer. Vuelve a dar de alta el segundo factor.',
                    'code': 'SECRETO_ILEGIBLE'}), 409
            if not dfa.comprobar(secreto_claro, codigo_dado):
                registrar_evento('2fa_activacion_fallida', email=u.get('email'), user_id=u['id'])
                return jsonify({'error': 'El código no es válido.'}), 400

            cur.execute('UPDATE users SET totp_activo = TRUE, totp_activado_en = NOW()'
                        '  WHERE id = %s', (u['id'],))
            # Los de recuperacion se muestran UNA vez y se guardan hasheados. Sin
            # ellos, perder el telefono seria perder la unica cuenta administradora.
            cur.execute('DELETE FROM totp_recuperacion WHERE user_id = %s', (u['id'],))
            codigos = dfa.codigos_de_recuperacion()
            for c in codigos:
                cur.execute('INSERT INTO totp_recuperacion (user_id, huella, pimienta)'
                            ' VALUES (%s, %s, %s)',
                            (u['id'], dfa.huella_de_codigo(c), dfa.huella_de_la_pimienta()))
            conn.commit()
        registrar_evento('2fa_activado', email=u.get('email'), user_id=u['id'])
        return jsonify({'activo': True, 'codigos_de_recuperacion': codigos,
                        'aviso': 'Guárdalos ahora: no se vuelven a mostrar.'}), 200
    except Exception as e:
        print(f'[2fa] activar: {e}')
        return jsonify({'error': 'No se pudo activar el segundo factor.'}), 500


@auth_bp.route('/api/auth/2fa/verify', methods=['POST'])
@publico(motivo='se llama entre la contraseña y la sesion: por diseño aun no hay sesion')
@limite("10 per minute")
def dfa_verify():
    """Canjea el desafio del login por una sesion, presentando el codigo."""
    import segundo_factor as dfa
    d = request.get_json() or {}
    datos, motivo = leer(PROPOSITO_2FA, d.get('desafio'))
    if not datos:
        return jsonify({'error': 'El desafío no es válido o ha caducado.', 'code': motivo}), 401
    uid = datos.get('uid')
    codigo_dado = (d.get('codigo') or '').strip()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT u.id, u.name, u.email, u.role, c.name, j.name, u.totp_secreto'
                        '  FROM users u'
                        '  LEFT JOIN companies c ON u.company_id = c.id'
                        '  LEFT JOIN job_titles j ON u.job_title_id = j.id'
                        ' WHERE u.id = %s AND COALESCE(u.is_active, TRUE)', (uid,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'El desafío no es válido.'}), 401

            try:
                secreto_claro = dfa.descifrar_secreto(fila[6])
            except dfa.SecretoIlegible:
                # No es «el codigo no vale»: es «ya no puedo leer tu secreto».
                # Son cosas distintas y llevan a acciones distintas, asi que se
                # dicen distinto. Le quedan sus codigos de recuperacion.
                secreto_claro = None
            valido = bool(secreto_claro) and dfa.consumir(cur, uid, secreto_claro, codigo_dado)
            if not valido and codigo_dado:
                # Codigo de recuperacion: de un solo uso. Se marca usado DENTRO de la
                # misma sentencia, para que dos intentos a la vez no canjeen el mismo.
                cur.execute('UPDATE totp_recuperacion SET usado_en = NOW()'
                            ' WHERE id = (SELECT id FROM totp_recuperacion'
                            '              WHERE user_id = %s AND huella = %s'
                            '                AND usado_en IS NULL LIMIT 1)'
                            ' RETURNING id', (uid, dfa.huella_de_codigo(codigo_dado)))
                if cur.fetchone():
                    valido = True
                    conn.commit()
                    registrar_evento('2fa_codigo_recuperacion', email=fila[2], user_id=uid)

            if not valido:
                registrar_evento('2fa_fallido', email=fila[2], user_id=uid)
                # Antes de dar el generico: mirar si el codigo no vale porque se
                # roto la clave del servidor. Quien tiene el papel en la mano y
                # lee «el codigo no es valido» piensa que se equivoco de linea, y
                # lo prueba ocho veces hasta quedarse sin intentos. Decirle la
                # verdad no le devuelve la cuenta, pero le ahorra buscar donde no
                # hay nada.
                cur.execute('SELECT count(*) FROM totp_recuperacion'
                            ' WHERE user_id = %s AND usado_en IS NULL'
                            '   AND pimienta IS NOT NULL AND pimienta <> %s',
                            (uid, dfa.huella_de_la_pimienta()))
                if (cur.fetchone() or [0])[0]:
                    return jsonify({
                        'error': 'Se rotó la clave del servidor y tus códigos de '
                                 'recuperación dejaron de valer. Entra con el código '
                                 'del teléfono; si lo perdiste, tiene que reponerte '
                                 'el acceso quien administre la base.',
                        'code': 'CODIGOS_INVALIDADOS_POR_ROTACION'}), 401
                return jsonify({'error': 'El código no es válido.'}), 401

            cur.execute('UPDATE users SET last_login_at = NOW() WHERE id = %s', (uid,))
            conn.commit()
        registrar_evento('login_ok', email=fila[2], user_id=uid, detalle='con segundo factor')
        return jsonify({'id': fila[0], 'name': fila[1], 'email': fila[2], 'role': fila[3],
                        'company': fila[4], 'job_title': fila[5],
                        'session_token': create_session(uid)}), 200
    except Exception as e:
        print(f'[2fa] verify: {e}')
        return jsonify({'error': 'No se pudo completar el inicio de sesión.'}), 500


@auth_bp.route('/api/auth/2fa/desactivar', methods=['POST'])
@limite("10 per minute")
def dfa_desactivar():
    """Quita el segundo factor. EXIGE un codigo valido: no basta con tener la sesion.

    Si bastara la sesion, robar una cookie permitiria desactivar el 2FA y dejar la
    cuenta con solo contrasena, que es exactamente lo que el 2FA venia a evitar.
    """
    import segundo_factor as dfa
    u = getattr(g, 'current_user', None)
    if not u:
        return jsonify({'error': 'Autenticación requerida'}), 401
    codigo_dado = (request.get_json() or {}).get('codigo')
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT totp_secreto, COALESCE(totp_activo, FALSE)'
                        '  FROM users WHERE id = %s', (u['id'],))
            fila = cur.fetchone()
            if not fila or not fila[1]:
                return jsonify({'error': 'El segundo factor no está activo.'}), 400
            # Quitar la proteccion tambien canjea el codigo: si vale una vez, no
            # puede valer otra. Es la accion que deja la cuenta desnuda.
            try:
                secreto_claro = dfa.descifrar_secreto(fila[0])
            except dfa.SecretoIlegible:
                secreto_claro = None
            if not secreto_claro or not dfa.consumir(cur, u['id'], secreto_claro, codigo_dado):
                registrar_evento('2fa_desactivacion_fallida', email=u.get('email'), user_id=u['id'])
                return jsonify({'error': 'El código no es válido.'}), 400
            cur.execute('UPDATE users SET totp_activo = FALSE, totp_secreto = NULL,'
                        '       totp_activado_en = NULL WHERE id = %s', (u['id'],))
            cur.execute('DELETE FROM totp_recuperacion WHERE user_id = %s', (u['id'],))
            conn.commit()
        registrar_evento('2fa_desactivado', email=u.get('email'), user_id=u['id'])
        return jsonify({'activo': False}), 200
    except Exception as e:
        print(f'[2fa] desactivar: {e}')
        return jsonify({'error': 'No se pudo desactivar el segundo factor.'}), 500


@auth_bp.route('/api/auth/2fa/estado', methods=['GET'])
def dfa_estado():
    """Si tengo el segundo factor activo, y si me lo exigen."""
    import segundo_factor as dfa
    u = getattr(g, 'current_user', None)
    if not u:
        return jsonify({'error': 'Autenticación requerida'}), 401
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Se cuentan por SEPARADO los que siguen sirviendo y los que murieron
            # al rotar la pimienta. Contarlos juntos era la mentira: la pantalla
            # decia «8 validos» sobre codigos que ya no abrian nada.
            ahora = dfa.huella_de_la_pimienta()
            cur.execute('SELECT COALESCE(totp_activo, FALSE), totp_activado_en,'
                        '       (SELECT count(*) FROM totp_recuperacion'
                        '         WHERE user_id = %s AND usado_en IS NULL'
                        '           AND (pimienta IS NULL OR pimienta = %s)),'
                        '       (SELECT count(*) FROM totp_recuperacion'
                        '         WHERE user_id = %s AND usado_en IS NULL'
                        '           AND pimienta IS NOT NULL AND pimienta <> %s)'
                        '  FROM users WHERE id = %s',
                        (u['id'], ahora, u['id'], ahora, u['id']))
            activo, desde, quedan, muertos = cur.fetchone()
        respuesta = {'activo': bool(activo),
                     'activado_en': desde.isoformat() if desde else None,
                     'codigos_de_recuperacion_sin_usar': quedan,
                     'exigido': dfa.exigido_para(u.get('role'))}
        if muertos:
            respuesta['codigos_invalidados_por_rotacion'] = muertos
            respuesta['aviso'] = (
                'Se rotó la clave del servidor y %d de tus códigos de recuperación '
                'dejaron de valer. No se pueden recuperar. Desactiva y vuelve a '
                'activar el segundo factor, con el teléfono a mano, para tener '
                'códigos nuevos.' % muertos)
        return jsonify(respuesta), 200
    except Exception as e:
        print(f'[2fa] estado: {e}')
        return jsonify({'error': 'No se pudo consultar el estado.'}), 500
