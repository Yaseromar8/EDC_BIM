"""
Auth Middleware for VISOR_APS_TL
Protects all /api/* endpoints by validating session tokens.
Public endpoints (login, register, google-auth) are whitelisted.
"""
from esquema_congelado import solo_con_ddl

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
    # '/api/auth/aps/login' NO va aqui: es quien EMPIEZA el flujo OAuth cuyo
    # callback sobrescribe las credenciales ACC de toda la plataforma. Si queda
    # abierto, cualquiera obtiene un 'state' valido y el state firmado no sirve
    # de nada. Exige admin (ver el guard dentro de la vista).
    '/api/auth/aps/callback',
    '/api/token',           # Viewer token (Autodesk internal, not user-facing)
    # Quien ha olvidado su contraseña, por definicion, no puede autenticarse.
    # Sin estas dos lineas el flujo entero respondia 401 y era inservible.
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    # EL MISMO ERROR, SEGUNDA VEZ. El segundo factor se presenta ENTRE la
    # contrasena y la sesion: por definicion todavia no hay sesion. La vista ya
    # estaba declarada @publico con su motivo escrito, pero aqui faltaba, y
    # manda esta lista mientras AUTH_POLICY_MODE siga en sombra. Medido contra
    # produccion el 17-ago-2026: POST devolvia 401 NO_TOKEN antes de entrar al
    # manejador. Nadie lo habia notado porque ningun usuario tenia el 2FA
    # encendido; el primero que lo encendiera se habria quedado fuera de su
    # propia cuenta sin vuelta atras.
    '/api/auth/2fa/verify',
}

# Publicos SOLO en lectura. '/api/companies' y '/api/job_titles' estaban en la
# lista de arriba, que se comprueba por PATH y sin mirar el metodo: eso dejaba
# POST anonimo sobre los catalogos. Y el motivo original ('para el formulario de
# registro') ya no existe: la pantalla nueva no los pide.
PUBLIC_ENDPOINTS_LECTURA = {
    '/api/companies',
    '/api/job_titles',
    # Estas tres SIRVEN BYTES a etiquetas <img> y al lector de PDF, que no pueden
    # mandar cabecera de autorizacion. El middleware las deja pasar y la puerta
    # real es _acceso_al_recurso() dentro del handler, que es quien sabe DE QUE
    # FICHERO se trata: exige sesion con acceso a esa obra, o un permiso firmado
    # para ese fichero concreto. Fail-closed alli, no aqui.
    '/api/docs/proxy',
    '/api/docs/view',
    '/api/docs/signed-url',
}

# Prefijos exentos de sesion para CUALQUIER metodo. Solo ficheros estaticos y
# callbacks OAuth de Autodesk, que no pueden llevar nuestra cabecera.
PUBLIC_PREFIXES = (
    '/maps/',                 # Tiles de mapa estaticos
    '/docs/uploads/',         # Servido estatico de ficheros subidos
    # Solo el CALLBACK, no todo '/api/auth/aps/': ese prefijo arrastraba tambien
    # la ruta de inicio del flujo.
    '/api/auth/aps/callback',
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
    # '/api/documents/' NO va aqui. El prefijo se puso para la vinculacion de
    # documentos de ACC con el token 2-legged, pero arrastraba tambien
    # GET /api/documents/<id>, que devuelve una URL FIRMADA de descarga de
    # cualquier nodo -- a un anonimo. Sus dos llamadores usan apiFetch.
    # ── Secure Share Engine: SOLO enlaces publicos por UUID ──────────────
    '/api/docs/shared/',      # Enlaces publicos a documentos por UUID
    '/api/views/',            # Vistas compartidas por UUID
)

_METODOS_LECTURA = ('GET', 'HEAD')


def generate_session_token():
    """Generate a cryptographically secure session token."""
    return secrets.token_hex(32)  # 64-char hex string


def _pimienta():
    """Clave para hashear los tokens. Fuera de la base, a proposito."""
    import os as _os
    return (_os.getenv('SESSION_PEPPER') or _os.getenv('APP_SECRET')
            or _os.getenv('DATABASE_URL') or 'sin-pimienta').encode()


def hash_de_token(token):
    """Huella del token de sesion, que es lo UNICO que se guarda.

    Hasta ahora la tabla `sessions` guardaba el token EN CLARO: un volcado de la
    base -- una copia de seguridad mal guardada, un acceso de lectura, una
    captura de pantalla de un cliente SQL -- era un pase de sesion para todas las
    cuentas a la vez, valido 7 dias.

    No hace falta un KDF lento (scrypt, bcrypt): el token ya son 256 bits
    aleatorios, no una contrasena que alguien pueda adivinar por fuerza bruta. Lo
    que aporta la pimienta, que vive en el entorno y NO en la base, es que con el
    volcado solo no se puedan recalcular las huellas.
    """
    import hashlib
    import hmac
    return hmac.new(_pimienta(), (token or '').encode(), hashlib.sha256).hexdigest()


def create_session(user_id):
    """Create a new session in the database and return the token."""
    from db import get_db_connection
    token = generate_session_token()
    expires_at = datetime.utcnow() + timedelta(days=7)  # 7-day sessions
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Esta tabla se creaba EN CADA INICIO DE SESION. Era el camino mas
            # caliente del sistema ejecutando DDL, y obligaba a que la identidad de
            # la aplicacion pudiera crear tablas solo para poder dejar entrar a
            # alguien. Su sitio es el arranque del esquema (esquema_base), no aqui.
            from esquema_congelado import ddl_permitido
            if ddl_permitido():
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
            # La columna 'token' guarda la HUELLA, no el token. El token en claro
            # solo existe en la respuesta al cliente y nunca toca la base.
            cursor.execute(
                'INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)',
                (hash_de_token(token), user_id, expires_at)
            )
            conn.commit()
        return token
    except Exception as e:
        logger.error(f"Error creando sesion: {e}")
        return None


# ── CACHE DE SESION EN MEMORIA ─────────────────────────────────────────
# Existe para evitar un viaje de ~600 ms a la base en CADA peticion.
#
# El precio es el retraso de las revocaciones: la cache es POR WORKER, y
# gunicorn corre con 4, asi que revocar una sesion (logout, expulsar a alguien,
# cambiarle el rol, contener un incidente) tarda hasta un TTL completo en surtir
# efecto en los otros tres. Con 60 s eso era un minuto largo justo cuando mas
# prisa hay. Bajarlo a 15 s multiplica por 4 la ventana cerrada a cambio de
# alguna consulta mas, que ademas suele venir de la propia cache.
#
# Para que la revocacion sea INMEDIATA en todos los workers hace falta estado
# compartido (REDIS_URL, el mismo que usa el limitador). Mientras no lo haya,
# 15 s es el compromiso honesto.
_session_cache = {}  # token -> (user_dict, timestamp)
_SESSION_CACHE_TTL = int(os.getenv('SESSION_CACHE_TTL', '15'))  # segundos

# Los SPAs de Docs y Visor pueden estar en distintos orígenes. Un ticket
# opaco, de un único uso y de 60 segundos evita exponer la sesión reutilizable
# en una URL al pasar entre ellos. Se guarda en Postgres (ver más abajo): en
# memoria de proceso no funcionaba con varios workers.


@solo_con_ddl
def _asegurar_tabla_tickets(cursor):
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS handoff_tickets (
            ticket VARCHAR(64) PRIMARY KEY,
            session_token VARCHAR(128) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP
        )
    ''')


def create_handoff_ticket(session_token, ttl_seconds=60):
    """Emite un ticket de un solo uso para pasar de Docs al Visor.

    EN POSTGRES, no en memoria del proceso. Antes vivia en un diccionario y
    gunicorn corre con 4 workers: el ticket se creaba en un worker y se canjeaba
    en otro con probabilidad 3/4. Esa es la causa real de que el paso entre Docs
    y el Visor fallara ~3 de cada 4 veces; no era un problema de sesion.
    """
    from db import get_db_connection
    ticket = secrets.token_urlsafe(32)
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            _asegurar_tabla_tickets(cursor)
            cursor.execute("DELETE FROM handoff_tickets WHERE expires_at < NOW() - INTERVAL '1 hour'")
            cursor.execute(
                "INSERT INTO handoff_tickets (ticket, session_token, expires_at)"
                " VALUES (%s, %s, NOW() + make_interval(secs => %s))",
                (ticket, session_token, ttl_seconds))
            conn.commit()
        return ticket
    except Exception as e:
        logger.error(f"Error creando ticket de handoff: {e}")
        return None


def consume_handoff_ticket(ticket):
    """Canjea el ticket UNA sola vez. Devuelve el token de sesion o None."""
    from db import get_db_connection
    if not ticket:
        return None
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            _asegurar_tabla_tickets(cursor)
            # El UPDATE ... RETURNING hace atomico el "solo una vez": si dos
            # peticiones llegan a la vez, solo una encuentra used_at IS NULL.
            cursor.execute(
                "UPDATE handoff_tickets SET used_at = NOW()"
                " WHERE ticket = %s AND used_at IS NULL AND expires_at > NOW()"
                " RETURNING session_token",
                (ticket,))
            fila = cursor.fetchone()
            conn.commit()
            return fila[0] if fila else None
    except Exception as e:
        logger.error(f"Error canjeando ticket de handoff: {e}")
        return None


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
                  -- Defensa en profundidad: desactivar un usuario ya revoca sus
                  -- sesiones, pero si esa revocacion fallara su token seguiria
                  -- sirviendo hasta 7 dias.
                  AND COALESCE(u.is_active, TRUE)
            ''', (hash_de_token(token),))
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
                    (user_id, hash_de_token(excepto))
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
            cursor.execute('UPDATE sessions SET is_active = FALSE WHERE token = %s', (hash_de_token(token),))
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error revocando sesion: {e}")
        return False


# ── Autorizacion por proyecto (tenencia / Pilar Identidad) ─────────────────
# Transicion segura: ENFORCE_PROJECT_AUTHZ off por defecto => LOG-ONLY (registra
# que bloquearia, pero PERMITE). Encender (=true) cuando se confirme que no
# rompe accesos. Siempre: admin bypass + fail-open ante error de BD.
ENFORCE_PROJECT_AUTHZ = os.getenv('ENFORCE_PROJECT_AUTHZ', 'false').strip().lower() in ('true', '1', 'yes')
logger.info(f"Autorizacion por proyecto: {'ENFORCE' if ENFORCE_PROJECT_AUTHZ else 'log-only (no bloquea)'}")

_membership_cache = {}  # (user_id, project_id) -> (bool, ts)
_MEMBERSHIP_TTL = 120


# Identificador imposible: se devuelve cuando una peticion nombra dos obras
# distintas. No es una obra, es una negativa con forma de obra.
OBRA_EN_CONFLICTO = '__obras_en_conflicto__'


def _user_in_project(user_id, project_id):
    """True si el usuario pertenece a la obra. Cachea. Fail-open ante error."""
    import time as _t
    if project_id == OBRA_EN_CONFLICTO:
        return False        # nadie pertenece a una peticion ambigua

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
        # Ante caida de la BD: se responde con el ULTIMO valor conocido aunque
        # haya caducado (el equipo en obra sigue trabajando durante un bache), y
        # solo si no hay ninguno se decide por el modo. Antes era 'return True'
        # a secas: un bache de Postgres abria todas las obras a todo el mundo.
        logger.error(f"error verificando membresia: {e}")
        if cached:
            return cached[0]
        return not ENFORCE_PROJECT_AUTHZ
    _membership_cache[key] = (ok, _t.time())
    return ok


# Nombres bajo los que viaja la obra, en orden de preferencia. 'scope_urn' y
# 'scope' son los que usan de verdad Civil y el 4D LOB, y faltaban: por eso
# decenas de endpoints no resolvian obra y se colaban sin dejar ni un aviso.
_CLAVES_OBRA = ('project_id', 'model_urn', 'scope_urn', 'scope', 'project', 'target_urn', 'urn',
                # Variantes que usan de verdad las rutas, medidas sobre las 87 que
                # manejan datos de obra sin guardia propia. 'projectId' en
                # camelCase lo mandan cinco rutas desde el frontend, y sin esta
                # linea ninguna de las cinco resolvia obra: se colaban por el
                # hueco sin dejar siquiera un aviso.
                'projectId', 'base_project_id', 'acc_project_id',
                # 'base' a secas: lo manda la pantalla de aterrizaje de la app
                # de campo (GET /api/frentes?base=<obra>) y su valor ES el id
                # canonico de la obra, el mismo que devuelve /api/projects.
                # Estaba 'base_project_id' pero no 'base', asi que esa pantalla
                # no resolvia obra y bajo ENFORCE se habria quedado sin frentes.
                'base',
                'source_urn', 'model_id', 'oldUrn', 'newModel',
                # 'dataset_id': el 4D LOB direcciona por el UUID del dataset, y
                # ONCE de sus tablas (mas de 40.000 filas medidas) no tienen
                # ninguna otra columna de obra. Sin esta clave, `/api/lob` --que
                # SI esta en _PROJECT_SCOPED_PREFIXES-- no resolvia obra nunca:
                # con ENFORCE encendido el modulo entero habria contestado 403
                # PROJECT_UNRESOLVED a todo el que no fuera administrador.
                'dataset_id', 'datasetId')


def _primer_valor(origen):
    for clave in _CLAVES_OBRA:
        valor = origen.get(clave)
        if valor:
            return clave, valor
    return None, None


def _request_project_id():
    """Mejor esfuerzo: deduce la obra (projects.id) de la request. None si no se puede.

    Mira CUATRO fuentes. Antes solo leia args y el cuerpo JSON, y eso dejaba
    fuera de la comprobacion, de un plumazo:
      - los parametros de RUTA  -> GET /api/rfis/<model_urn>, /api/redlines/<model_urn>
      - los formularios multipart -> POST /api/pins/upload, /api/project-pins/photo
        (request.is_json es False en multipart, asi que ni se miraba el cuerpo)
      - scope_urn / scope        -> todo Civil y el 4D LOB
    """
    try:
        from db import resolve_project_id
    except Exception:
        return None

    origenes = [request.args, (request.view_args or {})]
    if request.is_json:
        cuerpo = request.get_json(silent=True)
        if isinstance(cuerpo, dict):
            origenes.append(cuerpo)
    elif request.form:
        origenes.append(request.form)

    # Se recorren TODAS las fuentes y se recogen las obras que de verdad
    # resuelven. Antes se cortaba en la primera fuente que trajera una clave,
    # resolviera o no: bastaba colgar ?urn=basura a cualquier peticion para que
    # la obra saliera None y la comprobacion de membresia se saltara entera.
    # request.args es lo primero que se mira y lo controla quien llama.
    encontradas = []
    for origen in origenes:
        for clave in _CLAVES_OBRA:
            valor = origen.get(clave)
            if not valor:
                continue
            # Se VALIDA contra las obras reales en vez de fiarse del valor: los
            # frontends mandan tres cosas distintas bajo 'project_id' (el id de
            # la obra, el de ACC y el scope con frente), y darlo por bueno
            # convertia la comprobacion en un sello de goma.
            obra = resolve_project_id(valor)
            if obra and obra not in encontradas:
                encontradas.append(obra)

    if not encontradas:
        # Ultima via: rutas que reciben el ID DE UN RECURSO y no la obra. La
        # obra esta en la propia fila y solo se sabe consultandola.
        try:
            from perimetro_de_obra import obra_de_la_peticion, obra_por_query
            obra = obra_de_la_peticion(request.endpoint, request.view_args)
            if obra:
                return obra
            # ...y rutas cuyo id de recurso viaja en la query (?node_id=...).
            obra = obra_por_query(request.endpoint, request.args)
            if obra:
                return obra
        except Exception as e:
            logger.warning(f'[authz] no se pudo resolver por recurso: {e}')
        return None
    if len(encontradas) > 1:
        # DOS OBRAS EN LA MISMA PETICION: NO SE ELIGE, SE NIEGA.
        #
        # Eso decia el comentario. El codigo hacia `return encontradas[0]` en las
        # dos ramas, y como las fuentes se recorren en orden [args, view_args,
        # cuerpo], bastaba con colgar `?project_id=<mi_propia_obra>` a una
        # peticion dirigida a otra obra: la comprobacion de pertenencia se hacia
        # contra la mia, salia que si, y pasaba.
        #
        # Con el interruptor apagado esto no cambiaba nada --no se bloquea a
        # nadie-- asi que nunca se noto. Pero el dia de encender ENFORCE el
        # control habria nacido ya sorteable, que es la peor forma de tener un
        # control: la que se cree que existe.
        #
        # Se devuelve un identificador al que no pertenece nadie. El flujo de
        # arriba no necesita saber nada nuevo: `_user_in_project` dira que no y
        # la peticion se niega bajo ENFORCE, o se anota bajo log-only.
        logger.warning(f"[authz] peticion con obras en conflicto {encontradas}: {request.method} {request.path}")
        return OBRA_EN_CONFLICTO
    return encontradas[0]


# Endpoints que operan sobre datos de UNA obra concreta (por eso deben poder
# resolver el proyecto). Si uno de estos no resuelve el proyecto, es un HUECO
# de autorizacion que hay que cerrar antes de activar ENFORCE. Los que NO estan
# aqui (login, token, lista de usuarios, salud) son globales por diseno.
# Rutas bajo un prefijo de obra que, aun asi, NO hablan de una obra concreta:
# listados, catalogos y creacion (donde la obra todavia no existe). Cada una
# lleva su motivo escrito. Esta lista solo puede ENCOGER: cada entrada es una
# peticion que, con el control encendido, pasa sin saber de que obra es.
_SIN_OBRA_JUSTIFICADO = {
    '/api/projects': 'lista y crea obras; filtra por pertenencia dentro de la vista',
    '/api/docs/global-search': 'busca en las obras del usuario; filtra por pertenencia',
    '/api/inventory/schema': 'catalogo de campos, igual para todas las obras',
    # -- Anadidas el 17-ago al preparar ENFORCE --
    #
    # Estas cuatro reciben el id del recurso en el CUERPO de la peticion, no en
    # la ruta ni en la query, asi que ninguna de las dos maquinarias de
    # resolucion las alcanza. Se conceden porque el manejador comprueba la
    # PERTENENCIA A LA OBRA por dentro -- no la mera existencia del recurso --
    # y esa guardia esta leida linea a linea, no supuesta. Si alguna de esas
    # guardias desaparece, la exencion se convierte en un agujero permanente:
    # por eso hay una prueba que las ata (test_las_exenciones_tienen_guardia).
    '/api/uploads/complete':
        'recibe uploadId; el manejador lee model_urn de la fila de upload_sessions '
        'y exige pertenencia con verify_project_access (routes/uploads.py)',
    '/api/uploads/progress':
        'recibe uploadId; el manejador exige pertenencia con guardia_de_recurso '
        'sobre upload_sessions antes de escribir (routes/uploads.py)',
    '/api/attrs/values':
        'recibe node_id; la obra sale del propio nodo y _guardia_del_nodo exige '
        'pertenencia y permiso de carpeta, en GET y en PUT (routes/attributes.py)',
    # -- El comparador de versiones. Sus scopes viajan ANIDADOS en el cuerpo
    # ({a: {type, value}}), y el resolutor central solo mira claves de primer
    # nivel: nunca podra verlos. La obra la comprueba _guardia_scopes dentro del
    # manejador, y la resuelve del DATO, no de lo que declare quien llama -- un
    # scope 'source' es un urn de VERSION, y la obra sale de inventory_assets.
    # Anadidas el 17-ago; hasta entonces estas cuatro rutas no comprobaban NADA:
    # con una sesion valida se leian las propiedades de elementos de cualquier
    # obra. --
    '/api/compare/diff':
        'scopes anidados; _guardia_scopes exige pertenencia a TODAS las obras '
        'implicadas antes de tocar la base (routes/compare.py)',
    '/api/compare/metrados':
        'scopes anidados; misma guardia _guardia_scopes (routes/compare.py)',
    '/api/compare/element':
        'scopes anidados; misma guardia _guardia_scopes (routes/compare.py)',
    '/api/compare/element-metrados':
        'scopes anidados; misma guardia _guardia_scopes (routes/compare.py)',
    # -- Civil 3D y el enlace con Revit. Anadidas el 17-ago. --
    #
    # Las dos de civil NO PUEDEN resolver obra, y hay que decirlo tal cual: el
    # unico dato es el identificador del WorkItem de Autodesk, y no existe
    # ninguna tabla que lo ate a una obra (el vinculo vive en diccionarios EN
    # MEMORIA del proceso). No es una exencion comoda: es que no hay de donde
    # sacarla sin persistir esa relacion, que es trabajo aparte.
    #
    # Lo que SI se cerro es la puerta que estaba abierta de par en par: el
    # nombre del objeto del bucket se aceptaba crudo de la query. Ahora solo
    # vale el registrado por el servidor o un nombre con su forma exacta
    # (prefijo + UUID de 32 hex).
    #
    # RIESGO RESIDUAL DECLARADO: quien conozca un identificador de trabajo de
    # otra obra puede leer su resultado. Son UUID de 128 bits, no se adivinan, y
    # ningun cliente los expone -- pero el control por obra ahi NO existe, y
    # fingir lo contrario seria peor que declararlo.
    '/api/civil/alignment-result':
        'solo lleva el id del WorkItem de Autodesk, que no se puede traducir a '
        'obra; el nombre del objeto ya no lo elige quien llama (routes/'
        'civil_design_automation.py). Residual: sin control por obra',
    '/api/link/active-frentes':
        'descubrimiento de frente para el plugin de Revit: llama SIN parametros '
        'porque la llamada existe precisamente para saber en que frente esta. La '
        'respuesta se limita a los frentes con visor abierto del PROPIO usuario '
        '(routes/link.py). Residual: las filas de presencia sin user_id las ve '
        'cualquiera',
    '/api/compare/cleanup':
        'cuerpo vacio: no hay obra que resolver. Solo borra extracciones '
        'temporales del comparador, y ese scope es una CONSTANTE literal del '
        'SQL, no un dato de la peticion (routes/compare.py)',
}


# Exenciones por ENDPOINT, para rutas con segmento variable que el diccionario
# de paths exactos no puede expresar. Mismo contrato: motivo escrito, una a una.
_ENDPOINTS_JUSTIFICADOS = {
    # La vista compartida por enlace. El identificador aleatorio ES la
    # credencial, y el enlace se comparte fuera del equipo A PROPOSITO (por eso
    # la vista es @publico_en_lectura). Resolver aqui la obra y exigir
    # pertenencia invertiria el diseno: el anonimo entraria (pasa antes del
    # bloque de authz) y el companero CON sesion recibiria 403. Riesgo asumido
    # y escrito: quien tenga un enlace ve esa vista, con o sin sesion -- que es
    # exactamente lo que "compartir por enlace" significa.
    'get_view': 'el identificador aleatorio es la credencial del enlace compartido',
    # Los dos PATCH del inventario. Comparten path con el GET, asi que la
    # exencion NO puede ir por path: el GET sin identificador tiene que seguir
    # cerrado -- hay dos pruebas que lo fijan, y son las que cazaron mi primer
    # intento de exentar '/api/inventory' entero.
    #
    # Se conceden porque el cuerpo solo trae external_id / fieldName y la
    # proteccion real esta dentro: ambos manejadores acotan por SQL contra
    # project_users, que es MAS fino que el control central (comprueba el
    # elemento, no solo la obra).
    'update_inventory': 'acota por SQL contra project_users dentro del manejador (server.py)',
    'bulk_update_inventory': 'acota por SQL contra project_users dentro del manejador (server.py)',
}


def _sin_obra_justificado(path):
    """¿Es una de las rutas que legitimamente no habla de UNA obra?"""
    if path.rstrip('/') in _SIN_OBRA_JUSTIFICADO:
        return True
    endpoint = (request.endpoint or '').rsplit('.', 1)[-1]
    return endpoint in _ENDPOINTS_JUSTIFICADOS


_PROJECT_SCOPED_PREFIXES = (
    '/api/docs', '/api/documents', '/api/inventory', '/api/civil',
    # OJO: el 4D LOB se sirve en '/api/lob', no en '/api/lob4d' ni '/api/4d-lob'.
    # Esos dos prefijos no casaban con NINGUNA ruta registrada, asi que el modulo
    # entero quedaba fuera de la vigilancia y no aparecia ni en los avisos.
    '/api/lob',
    '/api/rfis', '/api/redlines', '/api/partidas', '/api/presupuesto',
    '/api/pins', '/api/project-pins', '/api/views',
    '/api/attrs', '/api/transmittals', '/api/reviews', '/api/sets',
    '/api/dashboards', '/api/geo', '/api/activity', '/api/schedule',
    '/api/compare', '/api/element-docs',
    # Faltaban TODOS estos: se localizaron comparando la lista con las rutas
    # realmente registradas en backend/routes, no de memoria. Cada uno maneja
    # datos de una obra (usa model_urn o project_id), asi que hasta ahora
    # quedaban fuera de la vigilancia y ni siquiera aparecian en los avisos de
    # hueco. '/api/uploads' es el mas serio: por ahi entran los ficheros.
    '/api/uploads', '/api/ai', '/api/audit', '/api/config', '/api/frentes',
    '/api/link', '/api/model', '/api/modelos', '/api/pdf',
    # NO se incluyen a proposito: '/api/debug', '/api/diag', '/api/layers' y
    # '/api/maps' no manejan datos de obra; '/api/projects' y '/api/hubs' son
    # justamente los que LISTAN obras y tienen que poder responder sin una
    # obra concreta en la peticion.
)


def _is_project_scoped(path):
    return any(path.startswith(p) for p in _PROJECT_SCOPED_PREFIXES)


def _politica_manda():
    """True cuando la politica declarada decide de verdad (modo estricto)."""
    try:
        import politica
        return politica.MODO == 'estricto'
    except Exception:
        return False


def _evaluar_politica(app, metodo, user):
    """Aplica la politica declarada del endpoint. None = permitido."""
    try:
        import politica
        pol = politica.politica_de(app, request.endpoint) if request.endpoint else None
        if pol is None:
            # Endpoint sin clasificar: fail-closed, exige sesion.
            pol = politica.Politica(politica.SESION)
        return pol.evaluar(metodo, user)
    except Exception as e:
        # EN SOMBRA este error es inofensivo: decide la logica heredada.
        # EN ESTRICTO la politica es la UNICA puerta, y devolver None aqui era
        # dejarla abierta justo cuando falla -- fail-open en el peor momento.
        # La salida segura es caer al minimo comun: quien tiene sesion pasa
        # (no se le puede negar todo por un bug de evaluacion), quien no la
        # tiene recibe el 401 de siempre. Se mira la variable directamente
        # porque si lo que fallo fue importar `politica`, tampoco se puede
        # preguntar a `politica.MODO`.
        logger.error(f"error evaluando politica: {e}")
        if os.getenv('AUTH_POLICY_MODE', 'sombra').strip().lower() == 'estricto':
            if user:
                return None
            return ('Autenticación requerida', 'NO_TOKEN', 401)
        return None


def _registrar_divergencia(path, metodo, abierto, negativa, user):
    """En sombra: registra donde la politica nueva y los prefijos no coinciden.

    Estos son los logs que hay que leer ANTES de poner AUTH_POLICY_MODE=estricto.
    Sin fecha de caducidad esto degenera: el modo log-only de la autorizacion por
    proyecto lleva meses encendido y sus avisos no los ha leido nadie.
    """
    quien = (user or {}).get('id', 'anonimo')
    if abierto and negativa:
        logger.warning(
            f"[politica SOMBRA cerraria] {metodo} {path} endpoint={request.endpoint} "
            f"user={quien} motivo={negativa[1]} (hoy pasa por prefijo)"
        )
    elif not abierto and not negativa:
        logger.info(
            f"[politica SOMBRA abriria] {metodo} {path} endpoint={request.endpoint} user={quien}"
        )


def _abierto_por_prefijo(path, metodo):
    """Decision HEREDADA (por prefijo de path). Se conserva para el modo sombra."""
    if path in PUBLIC_ENDPOINTS:
        return True
    if metodo in _METODOS_LECTURA and path in PUBLIC_ENDPOINTS_LECTURA:
        return True
    if metodo == 'GET' and path == '/api/config/project':
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    if metodo in _METODOS_LECTURA:
        for prefix in PUBLIC_GET_PREFIXES:
            if path.startswith(prefix):
                return True
    return False


def _token_de_la_peticion(metodo):
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    if metodo in _METODOS_LECTURA:
        # Respaldo por query string: solo en lectura. Este token de 7 dias
        # queda escrito dentro de permalinks de fotos que luego se comparten
        # (PhotoAlbumModal, uploadQueue), asi que quien reciba el enlace
        # hereda la sesion. Limitarlo a GET evita que ademas sirva para
        # escribir o borrar. Se retira del todo al firmar los enlaces (F2).
        return request.args.get('session_token')
    return None


def init_auth_middleware(app):
    """Register the authentication middleware on a Flask app."""

    @app.before_request
    def check_auth():
        # Always allow CORS preflight requests
        if request.method == 'OPTIONS':
            return None

        path = request.path
        metodo = request.method

        # ── 1. Identidad ──────────────────────────────────────────────────
        # Se resuelve ANTES de descartar las rutas que no son /api/, porque los
        # ficheros servidos estaticamente (/maps/uploads/, /uploads/pins/) tambien
        # necesitan saber quien llama para decidir. Resolver la identidad nunca
        # hace dano; lo que se salta abajo es la EXIGENCIA, no la lectura.
        # Se resuelve SIEMPRE que venga un token, incluso en rutas publicas.
        # Antes las rutas publicas retornaban antes de mirar la cabecera, asi
        # que g.current_user quedaba vacio y un endpoint publico-en-lectura no
        # podia distinguir a un admin de un anonimo (GET /api/projects dejaba de
        # entregar el invite_code al propio admin).
        token = _token_de_la_peticion(metodo)
        user = None
        if token == 'DEMO_TOKEN':
            # Backdoor solo si ALLOW_DEMO_TOKEN esta activo (off por defecto)
            user = {'id': 'demo', 'name': 'Demo User', 'role': 'admin'} if ALLOW_DEMO_TOKEN else None
        elif token:
            user = validate_session(token)
        if user:
            g.current_user = user

        # Fuera de /api/ el middleware no exige nada: son ficheros servidos
        # estaticamente y cada uno decide en su propio handler, ya con la
        # identidad resuelta arriba.
        if not path.startswith('/api/'):
            return None

        # ── 2. ¿Se permite? ───────────────────────────────────────────────
        abierto = _abierto_por_prefijo(path, metodo)
        negativa_politica = _evaluar_politica(app, metodo, user)

        g._auth_verificada = True   # el tripwire sabe que aqui SI se comprobo

        if _politica_manda():
            if negativa_politica:
                mensaje, codigo, http = negativa_politica
                logger.warning(f"[politica BLOQUEA] {metodo} {path} endpoint={request.endpoint} code={codigo}")
                return jsonify({'error': mensaje, 'code': codigo}), http
        else:
            # MODO SOMBRA: manda la logica heredada, pero se registra en que se
            # habrian diferenciado, para poder leer los logs antes de activar.
            _registrar_divergencia(path, metodo, abierto, negativa_politica, user)
            if not abierto:
                if not token:
                    return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
                if not user:
                    return jsonify({'error': 'Sesión inválida o expirada', 'code': 'INVALID_TOKEN'}), 401

        if not user:
            return None   # ruta abierta y visitante anonimo: nada mas que hacer

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
                    # HUECO: endpoint que SI maneja datos de una obra y no se
                    # pudo deducir cual.
                    #
                    # Esto ANTES solo se anotaba, incluso con ENFORCE encendido,
                    # y ahi estaba el agujero de verdad: bastaba direccionar la
                    # peticion con un identificador que el resolutor no supiera
                    # traducir para saltarse la comprobacion entera. Se midio: un
                    # usuario de la obra A leyendo y ESCRIBIENDO en 11 familias
                    # de rutas de la obra B, con ENFORCE_PROJECT_AUTHZ=true.
                    #
                    # Ahora, bajo ENFORCE, NO PASA. Que el sistema no sepa de que
                    # obra es una peticion no puede resolverse dandola por buena.
                    # Con ENFORCE apagado se sigue anotando y nada cambia, que es
                    # el comportamiento de hoy en produccion.
                    if ENFORCE_PROJECT_AUTHZ and not _sin_obra_justificado(path):
                        logger.warning(f"[authz BLOQUEADO-HUECO] proyecto indeterminable: "
                                       f"{request.method} {path} (user={user.get('id')})")
                        return jsonify({
                            'error': 'No se pudo determinar a que obra pertenece esta peticion.',
                            'code': 'PROJECT_UNRESOLVED'}), 403
                    logger.warning(f"[authz HUECO] proyecto indeterminable en endpoint con datos de obra: {request.method} {path} (user={user.get('id')})")
        except Exception as e:
            logger.error(f"authz error (fail-open): {e}")  # nunca bloquear por bug del authz

        return None
