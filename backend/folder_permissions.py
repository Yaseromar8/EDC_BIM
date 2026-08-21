"""
Módulo de Permisos por Carpeta — Estilo ACC / ISO 19650
========================================================
Implementa los 6 niveles oficiales de Autodesk Construction Cloud
con herencia estricta padre→hijo y fallback al RBAC global.
"""
from esquema_congelado import solo_con_ddl

from db import get_db_connection

# ── Jerarquía de Permisos ACC (Refactorizado con Markups) ──
PERMISSION_LEVELS = {
    'none': -1,
    'viewer': 0,           # Leer (View)
    'view_download': 1,    # Leer + Descargar (Download)
    'view_markup': 2,      # NUEVO: Leer + Marcar (Markups / Comentar). NO Sube archivos.
    'edit': 3,             # Sube Físicos (Upload)
    'admin': 4             # Control total incluida eliminación
}

PERMISSION_LABELS = {
    'none':           'Restringido',
    'viewer':         'Ver',
    'view_download':  'Ver y descargar',
    'view_markup':    'Ver, descargar y marcar',
    'edit':           'Editar y subir',
    'admin':          'Administrar'
}

# Por defecto, si eres 'viewer' o 'user' sin permiso explícito, estás ciego (modo paranoico ISO 19650)
GLOBAL_ROLE_TO_PERMISSION = {
    'viewer': 'none',
    'user':   'none',
    'editor': 'edit',
    'admin':  'admin',
}

@solo_con_ddl
def init_folder_permissions_table():
    """Crea la tabla folder_permissions si no existe (auto-migración)."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS folder_permissions (
                    id SERIAL PRIMARY KEY,
                    folder_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    permission_level VARCHAR(20) NOT NULL DEFAULT 'view_only',
                    granted_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(folder_node_id, user_id)
                );
            """)
            # Índices para búsquedas rápidas
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_fp_folder ON folder_permissions(folder_node_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_fp_user ON folder_permissions(user_id);")
            conn.commit()
            _sujetos(cursor, conn)
            print("[permissions] Tabla folder_permissions verificada.")
    except Exception as e:
        print(f"[permissions] Error creando tabla: {e}")


def _sujetos(cursor, conn):
    """Una regla puede dirigirse a una PERSONA, una EMPRESA o una FUNCION.

    POR QUE AHORA Y NO DESPUES
    --------------------------
    La tabla nacio con `UNIQUE(folder_node_id, user_id)`. Dirigir una regla a
    una empresa obliga a cambiar esa clave, y cambiar una clave unica con
    concesiones repartidas por obras reales es una migracion con datos vivos.
    Hoy hay UNA concesion en toda la instancia --y apunta a una carpeta que ya
    no existe--, asi que cuesta lo que cuesta ahora y no lo que costaria luego.

    LAS CONCESIONES ACTUALES NO SE REINTERPRETAN
    --------------------------------------------
    Cada fila existente se marca `USER` con su propio `user_id`. Nadie decide
    que una concesion a una persona «en realidad» era a su empresa: eso seria
    inferir sobre permisos, que es la peor clase de inferencia.

    LA CLAVE DEL SUJETO ES ESTABLE Y NO ES UN NOMBRE
    ------------------------------------------------
      USER                  `users.id`
      COMPANY               `companies.id`
      CONTRACTUAL_FUNCTION  el codigo de `directorio_de_obra.FUNCIONES`, que es
                            una lista CERRADA y congelada con un CHECK en
                            `project_companies` -- no un texto libre.
    """
    try:
        cursor.execute("""SELECT count(*) FROM information_schema.columns
                           WHERE table_name = 'folder_permissions'
                             AND column_name = 'sujeto_tipo'""")
        if cursor.fetchone()[0]:
            return                                  # ya migrada

        cursor.execute("ALTER TABLE folder_permissions "
                       "  ADD COLUMN IF NOT EXISTS sujeto_tipo TEXT")
        cursor.execute("ALTER TABLE folder_permissions "
                       "  ADD COLUMN IF NOT EXISTS sujeto_id TEXT")
        conn.commit()

        # Lo que ya habia es, por definicion, de tipo USER.
        cursor.execute("UPDATE folder_permissions "
                       "   SET sujeto_tipo = 'USER', sujeto_id = user_id::text "
                       " WHERE sujeto_tipo IS NULL AND user_id IS NOT NULL")
        conn.commit()

        # `user_id` deja de ser obligatorio: una regla de EMPRESA no tiene
        # usuario. Se conserva la columna --y su clave ajena-- porque las reglas
        # de USER la siguen usando y hay codigo que la lee.
        try:
            cursor.execute("ALTER TABLE folder_permissions "
                           "  ALTER COLUMN user_id DROP NOT NULL")
            conn.commit()
        except Exception as e:
            conn.rollback()
            print('[permissions] user_id sigue NOT NULL: %s' % str(e)[:80])

        cursor.execute("ALTER TABLE folder_permissions "
                       "  ALTER COLUMN sujeto_tipo SET DEFAULT 'USER'")
        try:
            cursor.execute("ALTER TABLE folder_permissions ADD CONSTRAINT "
                           "  ck_fp_sujeto CHECK (sujeto_tipo IN "
                           "  ('USER','COMPANY','CONTRACTUAL_FUNCTION'))")
            conn.commit()
        except Exception:
            conn.rollback()

        # La unicidad pasa a ser por SUJETO. La vieja `UNIQUE(folder, user_id)`
        # se conserva: sigue siendo cierta para las reglas de USER y no estorba
        # a las demas, que llevan `user_id` nulo (y en SQL dos NULL no chocan).
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_sujeto "
                       "  ON folder_permissions (folder_node_id, sujeto_tipo, sujeto_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fp_sujeto "
                       "  ON folder_permissions (sujeto_tipo, sujeto_id)")
        conn.commit()

        # UNA REGLA SIN SUJETO NO APLICA NUNCA, y eso no puede pasar en
        # silencio: un `INSERT` al estilo antiguo --solo `user_id`-- crearia una
        # concesion que el resolutor jamas encuentra, y quien la creo creeria
        # haber dado acceso. Mas vale que reviente al escribirla.
        cursor.execute("UPDATE folder_permissions SET sujeto_id = user_id::text "
                       " WHERE sujeto_id IS NULL AND user_id IS NOT NULL")
        cursor.execute("SELECT count(*) FROM folder_permissions WHERE sujeto_id IS NULL")
        if cursor.fetchone()[0] == 0:
            try:
                cursor.execute("ALTER TABLE folder_permissions "
                               "  ALTER COLUMN sujeto_id SET NOT NULL")
                cursor.execute("ALTER TABLE folder_permissions "
                               "  ALTER COLUMN sujeto_tipo SET NOT NULL")
                conn.commit()
            except Exception as e:
                conn.rollback()
                print('[permissions] sujeto NOT NULL no aplicado: %s' % str(e)[:80])
        else:
            conn.commit()
            print('[permissions] AVISO: hay concesiones sin sujeto. NO se impone '
                  'NOT NULL y NO se adivina a quien iban dirigidas.')
        print('[permissions] folder_permissions ahora acepta sujetos '
              'USER / COMPANY / CONTRACTUAL_FUNCTION.')
    except Exception as e:
        conn.rollback()
        print('[permissions] sujetos no migrados: %s' % str(e)[:120])


def get_effective_permission(user_id, node_id, model_urn, **kwargs):
    """
    Obtiene el permiso efectivo de un usuario para un nodo (archivo o carpeta).
    
    Algoritmo de Herencia Estricta:
    1. Si el nodo es un archivo, busca permiso en su carpeta padre.
    2. Busca permiso directo en folder_permissions para esa carpeta.
    3. Si no hay permiso directo, sube al parent_id y repite.
    4. Si llega a la raíz sin encontrar nada, usa el RBAC global como fallback.
    
    Retorna: string con el nivel de permiso (ej: 'edit', 'admin', 'view_only')
    """
    if not user_id:
        return 'view_only'
    
    if user_id == 'demo':
        return 'admin'
    
    # Permitir inyección de cursor para evitar deadlocks en llamadas masivas (ej. list_contents)
    if kwargs.get('cursor'):
        return _get_effective_permission_impl(kwargs['cursor'], user_id, node_id, model_urn)

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            return _get_effective_permission_impl(cursor, user_id, node_id, model_urn)
    except Exception as e:
        print(f"[permissions] Error en get_effective_permission: {e}")
        return 'none'  # Fail-Closed: sin permiso en caso de error

def _get_effective_permission_impl(cursor, user_id, node_id, model_urn):
    """UNA SOLA REGLA. Delega en `permiso_documental`.

    Esta funcion contenia su propia resolucion --herencia ADITIVA, con el rol
    global como SUELO--. Mientras existio, el producto tuvo dos reglas: esta
    para la navegacion y otra para la busqueda, y ninguna de las dos gobernaba
    la entrega de bytes. Ahora navegacion, busqueda, preview, descarga,
    signed-url, proxy, indice y flujos preguntan LO MISMO.

    La firma y el valor devuelto no cambian: `check_folder_permission` y
    `file_system_db` siguen llamando igual.
    """
    try:
        import permiso_documental as _pd
        cursor.execute("SELECT id, name, email, role FROM users WHERE id = %s",
                       (user_id,))
        u = cursor.fetchone()
        usuario = ({'id': u[0], 'name': u[1], 'email': u[2], 'role': u[3]}
                   if u else {'id': user_id, 'role': 'viewer'})
        return _pd.permiso_efectivo(cursor, usuario, model_urn, node_id)
    except Exception as e:
        print(f"[permissions] Error en _get_effective_permission_impl: {e}")
        return 'none'          # FAIL-CLOSED


def _resolucion_aditiva_retirada(cursor, user_id, node_id, model_urn):
    """La resolucion ANTERIOR. Se conserva sin llamar, como referencia de lo que
    hacia el producto antes del 21-ago-2026: maximo de la cadena y rol global
    como suelo. No se usa."""
    try:
        # Paso 0: Si el usuario global es admin, tiene acceso total siempre
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        user_row = cursor.fetchone()
        global_role = user_row[0] if user_row else 'viewer'
        if global_role == 'admin':
            return 'admin'
        
        # Paso 1: Determinar el folder_id de partida
        # Si node_id es un archivo, buscamos su parent_id (la carpeta contenedora)
        current_folder_id = node_id
        if node_id:
            cursor.execute(
                "SELECT id, parent_id, node_type FROM file_nodes WHERE id = %s AND model_urn = %s",
                (node_id, model_urn)
            )
            node_row = cursor.fetchone()
            if node_row:
                if node_row[2] == 'FILE':
                    current_folder_id = node_row[1]  # Usar el parent_id del archivo
                else:
                    current_folder_id = node_row[0]  # Ya es una carpeta
            else:
                current_folder_id = None
        
        # Paso 2: Caminar hacia arriba acumulando el máximo nivel (Herencia Aditiva)
        visited = set()  # Protección contra ciclos infinitos
        max_level_found = -1
        effective_perm = 'none'

        while current_folder_id is not None:
            if current_folder_id in visited:
                break  # Ciclo detectado
            visited.add(current_folder_id)
            
            cursor.execute("""
                SELECT permission_level FROM folder_permissions
                WHERE folder_node_id = %s AND user_id = %s
            """, (current_folder_id, user_id))
            perm_row = cursor.fetchone()
            
            if perm_row:
                level_str = perm_row[0]
                level_val = PERMISSION_LEVELS.get(level_str, -1)
                # HERENCIA ADITIVA: Solo importa si es MAYOR al nivel que ya traíamos
                if level_val > max_level_found:
                    max_level_found = level_val
                    effective_perm = level_str
            
            # Subir al padre
            cursor.execute(
                "SELECT parent_id FROM file_nodes WHERE id = %s",
                (current_folder_id,)
            )
            parent_row = cursor.fetchone()
            current_folder_id = parent_row[0] if parent_row else None
            
        # Paso 3: Fallback al RBAC global
        global_fallback = GLOBAL_ROLE_TO_PERMISSION.get(global_role, 'none')
        if PERMISSION_LEVELS.get(global_fallback, -1) > max_level_found:
             return global_fallback
             
        return effective_perm

    except Exception as e:
        print(f"[permissions] Error en _get_effective_permission_impl: {e}")
        return 'none'  # Fail-Closed: sin permiso en caso de error


def check_folder_permission(user, node_id, model_urn, required_level, action_name="esta acción"):
    """
    Función de validación para endpoints. Reemplaza a check_role.
    
    Retorna None si el usuario tiene permiso suficiente,
    o una Response JSON 403 si no tiene permisos.
    """
    from flask import jsonify
    
    if not user:
        # FAIL-CLOSED. Un guard no debe asumir que el middleware ya rechazo al
        # anonimo: basta que la ruta caiga bajo un prefijo publico para que no
        # lo haya hecho.
        return jsonify({"success": False, "error": "Autenticación requerida"}), 401


    user_id = user.get('id')
    effective = get_effective_permission(user_id, node_id, model_urn)
    effective_level = PERMISSION_LEVELS.get(effective, 0)

    # UN NIVEL QUE NO EXISTE DENIEGA. Antes se puntuaba 0, y 0 es 'viewer': un
    # nombre mal escrito no daba error, degradaba el guardia al nivel mas bajo
    # sin decir nada. Paso de verdad: seis rutas de subida pedian
    # 'create_upload', que nunca estuvo en PERMISSION_LEVELS, asi que subir
    # ficheros y crear carpetas exigian lo mismo que mirarlos. No se noto porque
    # los cinco usuarios de la obra son administradores y el admin corta antes.
    if required_level not in PERMISSION_LEVELS:
        print(f"[PERMISOS] nivel desconocido '{required_level}' para {action_name}: se deniega")
        return jsonify({
            "success": False,
            "error": f"Acceso denegado: el nivel exigido para {action_name} no está definido.",
        }), 403

    required = PERMISSION_LEVELS[required_level]

    if effective_level < required:
        label = PERMISSION_LABELS.get(required_level, required_level)
        return jsonify({
            "success": False,
            "error": f"Acceso denegado: Se requiere nivel de '{label}' o superior para {action_name}. Tu nivel actual es '{PERMISSION_LABELS.get(effective, effective)}'."
        }), 403
    
    return None


def set_folder_permission(folder_node_id, user_id, permission_level, granted_by, model_urn=None):
    """
    Asigna o actualiza un permiso de usuario en una carpeta.
    Usa ON CONFLICT para upsert (insertar o actualizar).

    SE RETIRA «Inherited permissions must expand»
    ---------------------------------------------
    Esta funcion se negaba a asignar un nivel MENOR que el heredado. Era la cara
    de ESCRITURA del modelo aditivo: si los permisos solo suman, conceder menos
    no significa nada y mas vale rechazarlo.

    Con CLOSEST-WINS conceder menos es EXACTAMENTE la operacion que hacia falta
    y no existia: «esta carpeta es de Direccion» se dice poniendo `none` a quien
    tiene `edit` mas arriba. Mantener la validacion habria dejado el modelo
    nuevo sin la unica accion que lo justifica -- y el producto habria seguido
    sin poder reservar una carpeta, ahora con una regla mas complicada.
    """
    if permission_level not in PERMISSION_LEVELS:
        raise ValueError(f"Nivel inválido: {permission_level}. Válidos: {list(PERMISSION_LEVELS.keys())}")

    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO folder_permissions (folder_node_id, user_id, permission_level,
                                            granted_by, sujeto_tipo, sujeto_id)
            VALUES (%s, %s, %s, %s, 'USER', %s::text)
            ON CONFLICT (folder_node_id, user_id)
            DO UPDATE SET permission_level = %s, granted_by = %s, updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (folder_node_id, user_id, permission_level, granted_by, user_id,
              permission_level, granted_by))
        result = cursor.fetchone()
        conn.commit()
        return result[0] if result else None


def list_folder_permissions(folder_node_id):
    """
    Lista todos los usuarios con permisos explícitos en una carpeta.
    Retorna lista de dicts con info del usuario y su nivel.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT fp.id, fp.user_id, u.name, u.email, fp.permission_level,
                   g.name as granted_by_name, fp.created_at
            FROM folder_permissions fp
            JOIN users u ON fp.user_id = u.id
            LEFT JOIN users g ON fp.granted_by = g.id
            WHERE fp.folder_node_id = %s
            ORDER BY fp.permission_level DESC, u.name
        """, (folder_node_id,))
        rows = cursor.fetchall()
        return [{
            'id': r[0],
            'user_id': r[1],
            'user_name': r[2],
            'user_email': r[3],
            'permission_level': r[4],
            'permission_label': PERMISSION_LABELS.get(r[4], r[4]),
            'granted_by': r[5],
            'created_at': str(r[6]) if r[6] else None
        } for r in rows]


def remove_folder_permission(permission_id):
    """Elimina un permiso específico por su ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM folder_permissions WHERE id = %s RETURNING id", (permission_id,))
        result = cursor.fetchone()
        conn.commit()
        return result is not None
