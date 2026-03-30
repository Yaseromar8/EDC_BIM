"""
Módulo de Permisos por Carpeta — Estilo ACC / ISO 19650
========================================================
Implementa los 6 niveles oficiales de Autodesk Construction Cloud
con herencia estricta padre→hijo y fallback al RBAC global.
"""

from db import get_db_connection

# ── Los 7 niveles de permiso ACC (de menor a mayor) ──────────────────
PERMISSION_LEVELS = {
    'none':          -1,  # Sin acceso (Gris en UI, no ve archivos)
    'view_only':      0,  # Ver listado de archivos
    'view_download':  1,  # Ver + descargar archivos
    'create':         2,  # + publicar marcas de revisión
    'create_upload':  3,  # + subir archivos nuevos
    'edit':           4,  # + renombrar, mover, cambiar estados
    'admin':          5,  # Control total incluida eliminación
}

PERMISSION_LABELS = {
    'none':           'Restringido',
    'view_only':      'Ver',
    'view_download':  'Ver y descargar',
    'create':         'Crear',
    'create_upload':  'Crear y cargar',
    'edit':           'Editar',
    'admin':          'Administrar',
}
# Mapeo del RBAC global → nivel ACC (para fallback)
# Por defecto, si eres 'viewer' o 'user' sin permiso explícito, estás ciego (modo paranoico ISO 19650)
GLOBAL_ROLE_TO_PERMISSION = {
    'viewer': 'none',
    'user':   'none',
    'editor': 'edit',
    'admin':  'admin',
}

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
            print("[permissions] Tabla folder_permissions verificada.")
    except Exception as e:
        print(f"[permissions] Error creando tabla: {e}")


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
        
        # Paso 2: Caminar hacia arriba buscando permiso explícito
        visited = set()  # Protección contra ciclos infinitos
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
                return perm_row[0]  # ¡Encontramos permiso explícito!
            
            # Subir al padre
            cursor.execute(
                "SELECT parent_id FROM file_nodes WHERE id = %s",
                (current_folder_id,)
            )
            parent_row = cursor.fetchone()
            current_folder_id = parent_row[0] if parent_row else None
            
        # Paso 3: Fallback al RBAC global
        return GLOBAL_ROLE_TO_PERMISSION.get(global_role, 'none')

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
        return None  # Sin usuario autenticado, dejar que el middleware lo maneje
    
    user_id = user.get('id')
    effective = get_effective_permission(user_id, node_id, model_urn)
    effective_level = PERMISSION_LEVELS.get(effective, 0)
    required = PERMISSION_LEVELS.get(required_level, 0)
    
    if effective_level < required:
        label = PERMISSION_LABELS.get(required_level, required_level)
        return jsonify({
            "success": False,
            "error": f"Acceso denegado: Se requiere nivel de '{label}' o superior para {action_name}. Tu nivel actual es '{PERMISSION_LABELS.get(effective, effective)}'."
        }), 403
    
    return None


def set_folder_permission(folder_node_id, user_id, permission_level, granted_by):
    """
    Asigna o actualiza un permiso de usuario en una carpeta.
    Usa ON CONFLICT para upsert (insertar o actualizar).
    """
    if permission_level not in PERMISSION_LEVELS:
        raise ValueError(f"Nivel inválido: {permission_level}. Válidos: {list(PERMISSION_LEVELS.keys())}")
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO folder_permissions (folder_node_id, user_id, permission_level, granted_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (folder_node_id, user_id) 
            DO UPDATE SET permission_level = %s, granted_by = %s, updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (folder_node_id, user_id, permission_level, granted_by,
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
