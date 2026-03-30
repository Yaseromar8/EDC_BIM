"""
Folder Validators — Validaciones Enterprise para Creación de Carpetas
=====================================================================
Estilo Autodesk Construction Cloud (ACC) / ISO 19650.

Pipeline de 5 validaciones ejecutadas ANTES de crear la carpeta:
1. Naming Conventions (ASCII estricto, longitud, nombres reservados)
2. Detección de duplicados (mismo nombre en mismo parent)
3. Cuota de almacenamiento (solo FILE size_bytes)
4. Profundidad máxima de carpetas (15 niveles default)
5. Máximo de hijos por carpeta (500 default)

Cada validación retorna un dict con:
  - valid: bool
  - code: str (código máquina para el frontend)
  - message: str (mensaje legible en español)
"""

import re
from db import get_db_connection

# ── Defaults (usados si no hay project_settings para el model_urn) ──
DEFAULTS = {
    'naming_pattern': r'^[A-Za-z0-9 _\-\.\(\)]+$',
    'max_name_length': 100,
    'reserved_names': ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'LPT1', 'LPT2', 'LPT3', '.', '..'],
    'storage_limit_bytes': 268435456000,  # 250 GB
    'max_folder_depth': 15,
    'max_children_per_folder': 500,
    'enforce_naming': True,
    'enforce_quota': True,
    'enforce_depth': True,
}

# ── Caracteres prohibidos en nombres de archivo/carpeta (Windows + Linux) ──
FORBIDDEN_CHARS = set('<>:"/\\|?*')
# Nombres que no pueden usarse en Windows (sin extensión)
WINDOWS_RESERVED = {'CON', 'PRN', 'AUX', 'NUL',
                    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
                    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}


def _get_project_settings(cursor, model_urn):
    """
    Obtener settings del proyecto desde project_settings,
    con fallback a DEFAULTS si no existe la fila.
    """
    cursor.execute("""
        SELECT naming_pattern, max_name_length, reserved_names,
               storage_limit_bytes, max_folder_depth, max_children_per_folder,
               enforce_naming, enforce_quota, enforce_depth
        FROM project_settings
        WHERE model_urn = %s
    """, (model_urn,))
    row = cursor.fetchone()
    
    if row:
        return {
            'naming_pattern': row[0] or DEFAULTS['naming_pattern'],
            'max_name_length': row[1] or DEFAULTS['max_name_length'],
            'reserved_names': row[2] or DEFAULTS['reserved_names'],
            'storage_limit_bytes': row[3] if row[3] is not None else DEFAULTS['storage_limit_bytes'],
            'max_folder_depth': row[4] or DEFAULTS['max_folder_depth'],
            'max_children_per_folder': row[5] or DEFAULTS['max_children_per_folder'],
            'enforce_naming': row[6] if row[6] is not None else DEFAULTS['enforce_naming'],
            'enforce_quota': row[7] if row[7] is not None else DEFAULTS['enforce_quota'],
            'enforce_depth': row[8] if row[8] is not None else DEFAULTS['enforce_depth'],
        }
    
    return dict(DEFAULTS)


def _ok():
    """Validación exitosa."""
    return {'valid': True, 'code': None, 'message': None}


def _fail(code, message):
    """Validación fallida."""
    return {'valid': False, 'code': code, 'message': message}


# ═══════════════════════════════════════════════════════════════
# VALIDACIÓN 1: Naming Conventions (ISO 19650 / BIM)
# ═══════════════════════════════════════════════════════════════
def validate_naming(folder_name, settings):
    """
    Valida que el nombre de la carpeta cumpla con:
    - ASCII estricto (sin acentos, ñ, etc.)
    - Sin caracteres prohibidos por Windows (<>:"/\\|?*)
    - Longitud máxima configurable (default: 100)
    - No sea un nombre reservado de Windows (CON, PRN, etc.)
    - No empiece ni termine con espacios o puntos
    """
    if not settings.get('enforce_naming', True):
        return _ok()
    
    name = folder_name.strip()
    
    # Vacío
    if not name:
        return _fail('INVALID_NAME', 'El nombre de la carpeta no puede estar vacío.')
    
    # Longitud máxima
    max_len = settings.get('max_name_length', 100)
    if len(name) > max_len:
        return _fail('INVALID_NAME', 
            f'El nombre excede el límite de {max_len} caracteres ({len(name)} caracteres). '
            f'Acorta el nombre para cumplir con el estándar ISO 19650.')
    
    # Caracteres prohibidos por Windows
    found_forbidden = [c for c in name if c in FORBIDDEN_CHARS]
    if found_forbidden:
        chars_str = ', '.join(f'"{c}"' for c in set(found_forbidden))
        return _fail('INVALID_NAME',
            f'El nombre contiene caracteres no permitidos: {chars_str}. '
            f'Usa solo letras (A-Z), números, espacios, guiones (-) y guiones bajos (_).')
    
    # ASCII estricto — rechazar acentos, ñ, emojis, etc.
    try:
        name.encode('ascii')
    except UnicodeEncodeError:
        # Identificar los caracteres problemáticos
        non_ascii = [c for c in name if ord(c) > 127]
        chars_str = ', '.join(f'"{c}"' for c in set(non_ascii))
        return _fail('INVALID_NAME',
            f'El nombre contiene caracteres no-ASCII: {chars_str}. '
            f'Para compatibilidad con BIM (Dynamo, scripts Python, descargas Windows), '
            f'usa solo caracteres ASCII: letras sin acento, números, espacios, guiones.')
    
    # Regex configurable (patrón por defecto: alfanumérico + espacio + _ - . ( ))
    pattern = settings.get('naming_pattern', DEFAULTS['naming_pattern'])
    if not re.match(pattern, name):
        return _fail('INVALID_NAME',
            f'El nombre "{name}" no cumple con el patrón de nomenclatura del proyecto. '
            f'Usa solo: letras (A-Z), números (0-9), espacios, guiones (-), '
            f'guiones bajos (_), puntos (.) y paréntesis.')
    
    # Nombres reservados de Windows
    name_upper = name.upper().split('.')[0]  # "CON.txt" → "CON"
    reserved = settings.get('reserved_names', DEFAULTS['reserved_names'])
    reserved_set = set(r.upper() for r in reserved) | WINDOWS_RESERVED
    if name_upper in reserved_set:
        return _fail('INVALID_NAME',
            f'"{name}" es un nombre reservado del sistema operativo Windows. '
            f'Elige un nombre diferente.')
    
    # No empezar/terminar con punto o espacio
    if name.startswith('.') or name.startswith(' '):
        return _fail('INVALID_NAME',
            'El nombre no puede empezar con punto (.) ni espacio.')
    if name.endswith('.') or name.endswith(' '):
        return _fail('INVALID_NAME',
            'El nombre no puede terminar con punto (.) ni espacio.')
    
    return _ok()


# ═══════════════════════════════════════════════════════════════
# VALIDACIÓN 2: Detección de Duplicados
# ═══════════════════════════════════════════════════════════════
def validate_no_duplicate(cursor, folder_name, parent_id, model_urn):
    """
    Verifica que no exista otra carpeta con exactamente el mismo nombre
    bajo el mismo parent_id (case-insensitive).
    """
    cursor.execute("""
        SELECT id, name FROM file_nodes
        WHERE model_urn = %s
          AND parent_id IS NOT DISTINCT FROM %s
          AND LOWER(name) = LOWER(%s)
          AND node_type = 'FOLDER'
          AND is_deleted = FALSE
        LIMIT 1
    """, (model_urn, parent_id, folder_name))
    
    existing = cursor.fetchone()
    if existing:
        return _fail('DUPLICATE_FOLDER',
            f'Ya existe una carpeta llamada "{existing[1]}" en esta ubicación. '
            f'Elige un nombre diferente.')
    
    return _ok()


# ═══════════════════════════════════════════════════════════════
# VALIDACIÓN 3: Cuota de Almacenamiento
# ═══════════════════════════════════════════════════════════════
def validate_storage_quota(cursor, model_urn, settings):
    """
    Compara el peso total de archivos (FILE) del proyecto
    contra el límite configurado (250 GB por defecto).
    Solo cuenta FILE.size_bytes, no metadata.
    """
    if not settings.get('enforce_quota', True):
        return _ok()
    
    limit_bytes = settings.get('storage_limit_bytes', DEFAULTS['storage_limit_bytes'])
    
    # Calcular uso actual (solo archivos, no carpetas)
    cursor.execute("""
        SELECT COALESCE(SUM(size_bytes), 0)
        FROM file_nodes
        WHERE model_urn = %s
          AND node_type = 'FILE'
          AND is_deleted = FALSE
    """, (model_urn,))
    
    used_bytes = cursor.fetchone()[0]
    
    if used_bytes >= limit_bytes:
        used_gb = round(used_bytes / (1024**3), 2)
        limit_gb = round(limit_bytes / (1024**3), 2)
        return _fail('STORAGE_QUOTA_EXCEEDED',
            f'El proyecto ha alcanzado su cuota de almacenamiento: '
            f'{used_gb} GB de {limit_gb} GB utilizados. '
            f'Contacta al administrador para aumentar el límite o libera espacio eliminando archivos.')
    
    return _ok()


# ═══════════════════════════════════════════════════════════════
# VALIDACIÓN 4: Profundidad Máxima de Carpetas
# ═══════════════════════════════════════════════════════════════
def validate_folder_depth(cursor, parent_id, model_urn, settings):
    """
    Cuenta cuántos ancestros tiene el parent_id hasta la raíz.
    Si la nueva carpeta excedería el límite, la rechaza.
    """
    if not settings.get('enforce_depth', True):
        return _ok()
    
    max_depth = settings.get('max_folder_depth', DEFAULTS['max_folder_depth'])
    
    # Contar ancestros usando un CTE recursivo (1 sola query)
    cursor.execute("""
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, 1 AS depth
            FROM file_nodes
            WHERE id = %s AND model_urn = %s
            
            UNION ALL
            
            SELECT fn.id, fn.parent_id, a.depth + 1
            FROM file_nodes fn
            JOIN ancestors a ON fn.id = a.parent_id
            WHERE a.depth < %s + 2  -- Safety limit para evitar loops infinitos
        )
        SELECT MAX(depth) FROM ancestors
    """, (parent_id, model_urn, max_depth))
    
    row = cursor.fetchone()
    current_depth = row[0] if row and row[0] else 0
    
    # La nueva carpeta será current_depth + 1
    if current_depth + 1 > max_depth:
        return _fail('MAX_DEPTH_EXCEEDED',
            f'No se puede crear la carpeta: se excedería el límite de profundidad '
            f'de {max_depth} niveles (actual: {current_depth}). '
            f'Este límite previene rutas demasiado largas para Windows (máx. 256 caracteres).')
    
    return _ok()


# ═══════════════════════════════════════════════════════════════
# VALIDACIÓN 5: Máximo de Hijos por Carpeta
# ═══════════════════════════════════════════════════════════════
def validate_max_children(cursor, parent_id, model_urn, settings):
    """
    Cuenta cuántos nodos (archivos + carpetas) tiene el parent directamente.
    Previene que una sola carpeta tenga 10,000 hijos (rendimiento).
    """
    max_children = settings.get('max_children_per_folder', DEFAULTS['max_children_per_folder'])
    
    cursor.execute("""
        SELECT COUNT(*)
        FROM file_nodes
        WHERE model_urn = %s
          AND parent_id IS NOT DISTINCT FROM %s
          AND is_deleted = FALSE
    """, (model_urn, parent_id))
    
    count = cursor.fetchone()[0]
    
    if count >= max_children:
        return _fail('MAX_CHILDREN_EXCEEDED',
            f'La carpeta actual ya contiene {count} elementos (límite: {max_children}). '
            f'Organiza los archivos en subcarpetas para mantener el rendimiento.')
    
    return _ok()


# ═══════════════════════════════════════════════════════════════
# PIPELINE PRINCIPAL
# ═══════════════════════════════════════════════════════════════
def validate_folder_creation(folder_name, parent_id, model_urn):
    """
    Pipeline completo de validación ACC-style.
    Ejecuta las 5 validaciones en orden de prioridad.
    
    Args:
        folder_name: Nombre de la carpeta nueva (sin path)
        parent_id: UUID del nodo padre (puede ser None para raíz)
        model_urn: Identificador del proyecto
    
    Returns:
        dict: {valid: bool, code: str|None, message: str|None}
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Cargar settings del proyecto (o defaults)
            settings = _get_project_settings(cursor, model_urn)
            
            # 1. Naming Conventions
            result = validate_naming(folder_name, settings)
            if not result['valid']:
                return result
            
            # 2. Duplicados
            result = validate_no_duplicate(cursor, folder_name, parent_id, model_urn)
            if not result['valid']:
                return result
            
            # 3. Cuota de Almacenamiento
            result = validate_storage_quota(cursor, model_urn, settings)
            if not result['valid']:
                return result
            
            # 4. Profundidad
            if parent_id:
                result = validate_folder_depth(cursor, parent_id, model_urn, settings)
                if not result['valid']:
                    return result
            
            # 5. Máximo de hijos
            result = validate_max_children(cursor, parent_id, model_urn, settings)
            if not result['valid']:
                return result
            
            return _ok()
            
    except Exception as e:
        print(f"[folder_validators] Error en pipeline de validación: {e}")
        # Fail-Open: Si la validación falla por error técnico, permitir la creación
        # (mejor crear la carpeta que bloquear al usuario por un bug nuestro)
        return _ok()
