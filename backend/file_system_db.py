import os
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from db import get_db_connection

gcs_executor = ThreadPoolExecutor(max_workers=4)

def resolve_path_to_node_id(path, model_urn, created_by=None, auto_create=True):
    """
    Convierte un path del tipo 'folder1/folder2/' en el node_id correspondiente.
    Normaliza slashes y maneja el model_urn como prefijo opcional.
    """
    # Normalizar: quitar slashes y comparar con model_urn
    p = path.strip('/') if path else ''
    m = model_urn.strip('/') if model_urn else ''
    
    if not p or p == m:
        return None

    # Quitar model_urn si viene al inicio (ej: 'proyectos/PQT8_TALARA/Folder1' -> 'Folder1')
    if p.startswith(m + '/'):
        p = p[len(m)+1:]
    
    # Si después de quitar el prefijo queda vacío o es lo mismo, es la raíz
    if not p or p == m:
        return None

    parts = [part for part in p.split('/') if part]
    parent_id = None
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for part in parts:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id IS NOT DISTINCT FROM %s 
                AND name = %s AND node_type = 'FOLDER' AND is_deleted = FALSE
            """, (model_urn, parent_id, part))
            row = cursor.fetchone()
            
            if row:
                parent_id = row[0]
            elif auto_create:
                cursor.execute("""
                    INSERT INTO file_nodes (model_urn, parent_id, node_type, name, created_by)
                    VALUES (%s, %s, 'FOLDER', %s, %s)
                    RETURNING id
                """, (model_urn, parent_id, part, created_by))
                parent_id = cursor.fetchone()[0]
            else:
                return None
        conn.commit()
    return parent_id


def list_contents(parent_id, model_urn, base_path=""):
    """
    Devuelve inventario estructurado con metadata de auditoría (updated_by e iniciales).
    """
    def get_initials(name):
        if not name: return "??"
        parts = name.split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[1][0]).upper()
        return name[:2].upper()

    folders = []
    files = []
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT id, name, node_type, size_bytes, version_number, updated_at, gcs_urn, status, tags, metadata, description, mime_type, 
                   COALESCE(updated_by, created_by, 'Sistema') as u_by
            FROM file_nodes 
            WHERE model_urn = %s AND parent_id IS NOT DISTINCT FROM %s AND is_deleted = FALSE
            ORDER BY node_type DESC, name ASC
        """
        cursor.execute(query, (model_urn, parent_id))
        rows = cursor.fetchall()
        
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_gcs, r_status, r_tags, r_metadata, r_description, r_mime, r_u_by = row
            full_name = f"{base_path}{r_name}" + ("/" if r_type == 'FOLDER' else "")
            
            audit_data = {
                "name": r_u_by,
                "initials": get_initials(r_u_by)
            }

            item = {
                "id": r_id,
                "name": r_name,
                "fullName": full_name,
                "updated": r_updated.isoformat() if r_updated else None,
                "updated_by": audit_data,
                "description": r_description
            }

            if r_type == 'FOLDER':
                folders.append(item)
            else:
                item.update({
                    "size": r_size,
                    "version": r_version,
                    "status": r_status,
                    "tags": r_tags or [],
                    "metadata": r_metadata or {},
                    "mime_type": r_mime,
                    "gcs_urn": r_gcs
                })
                files.append(item)
                
    return {"folders": folders, "files": files}

def create_file_record(model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type=None, created_by=None):
    """Inserta/Actualiza el Ítem y crea una nueva Versión histórica (Estilo ACC)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Buscar si el Ítem ya existe en la ubicación
        cursor.execute(
            "SELECT id, version_number FROM file_nodes WHERE model_urn = %s AND parent_id IS NOT DISTINCT FROM %s AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE",
            (model_urn, parent_id, filename)
        )
        existing = cursor.fetchone()
        
        if existing:
            f_id, f_v = existing
            new_v = f_v + 1
            # Actualizar el Ítem (puntero rápido a la versión actual)
            cursor.execute("""
                UPDATE file_nodes 
                SET gcs_urn = %s, version_number = %s, size_bytes = %s, mime_type = %s, updated_at = CURRENT_TIMESTAMP, created_by = %s
                WHERE id = %s
            """, (gcs_uuid, new_v, size_bytes, mime_type, created_by, f_id))
        else:
            # Crear nuevo Ítem raíz
            cursor.execute("""
                INSERT INTO file_nodes (model_urn, parent_id, node_type, name, size_bytes, gcs_urn, mime_type, created_by, version_number)
                VALUES (%s, %s, 'FILE', %s, %s, %s, %s, %s, 1)
                RETURNING id
            """, (model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type, created_by))
            f_id = cursor.fetchone()[0]
            new_v = 1
            
        # 2. Registrar la Versión HISTÓRICA en la tabla de versiones
        cursor.execute("""
            INSERT INTO file_versions (file_node_id, version_number, gcs_urn, size_bytes, mime_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (f_id, new_v, gcs_uuid, size_bytes, mime_type, created_by))
        v_id = cursor.fetchone()[0]
        
        # 3. Vincular el Ítem principal a su registro de versión actual
        cursor.execute("UPDATE file_nodes SET current_version_id = %s WHERE id = %s", (v_id, f_id))
        
        conn.commit()

def find_node_by_gcs_urn(model_urn, gcs_urn):
    """
    Busca un nodo por su identificador fisico en GCS. 
    Util para mapear resultados de RAG (que vienen como gs://bucket/path) a IDs de nuestra tabla.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, metadata, updated_at
            FROM file_nodes 
            WHERE model_urn = %s AND gcs_urn = %s AND is_deleted = FALSE
            LIMIT 1
        """, (model_urn, gcs_urn))
        return cursor.fetchone()

def soft_delete_node(node_id, model_urn, performed_by=None, reason=None):
    """
    Soft-delete recursivo (Carpeta y descendientes).
    Maneja auditoría de tiempo y estado.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        target_id = node_id
        
        if not target_id:
            return False

        # CTE Recursivo para marcar todo el subárbol
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            UPDATE file_nodes
            SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP, updated_by = %s
            WHERE id IN (SELECT id FROM subtree)
        """, (target_id, performed_by))
        conn.commit()
        return True

def get_file_gcs_urn(model_urn, node_path):
    """Devuelve el URN de GCS real para generar el signed URL"""
    # node_path es algo como "fotos/Mi_Plano.pdf"
    parts = [p for p in node_path.split('/') if p]
    if not parts: return None
    
    filename = parts.pop()
    parent_id = resolve_path_to_node_id('/'.join(parts), model_urn) if parts else None
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if parent_id:
            cursor.execute("SELECT gcs_urn FROM file_nodes WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE", (model_urn, parent_id, filename))
        else:
            cursor.execute("SELECT gcs_urn FROM file_nodes WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE", (model_urn, filename))
            
        row = cursor.fetchone()
        return row[0] if row else None

def get_node_full_path(node_id):
    """
    Reconstruye el path visual (breadcrumb) de un nodo subiendo por los parent_id.
    Retorna algo como: '03_DOCUMENTOS / 02_MEMORIA_DESCRIPTIVA / archivo.pdf'
    """
    if node_id is None:
        return "Raíz"
        
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # CTE recursivo para subir en la jerarquia
        cursor.execute("""
            WITH RECURSIVE breadcrumbs AS (
                SELECT id, name, parent_id, 0 as level
                FROM file_nodes
                WHERE id = %s
                
                UNION ALL
                
                SELECT fn.id, fn.name, fn.parent_id, bc.level + 1
                FROM file_nodes fn
                INNER JOIN breadcrumbs bc ON fn.id = bc.parent_id
            )
            SELECT name FROM breadcrumbs ORDER BY level DESC;
        """, (node_id,))
        
        rows = cursor.fetchall()
        if not rows:
            return "Carpeta Desconocida"
            
        return " / ".join([r[0] for r in rows])

def find_nodes_by_description_match(query, model_urn, limit=8, priority_folders=[]):
    """
    Busca nodos que coincidan con el query en su descripción.
    Util para el motor de IA y el buscador global.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        search_pattern = f"%{query}%"
        
        # Primero buscamos en carpetas prioritarias si se proveen
        if priority_folders:
            # Esta es una version simplificada, se podria mejorar con joins
            cursor.execute("""
                SELECT id, name, description 
                FROM file_nodes 
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (description ILIKE %s OR name ILIKE %s)
                ORDER BY updated_at DESC LIMIT %s
            """, (model_urn, search_pattern, search_pattern, limit))
        else:
            cursor.execute("""
                SELECT id, name, description 
                FROM file_nodes 
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (description ILIKE %s OR name ILIKE %s)
                ORDER BY updated_at DESC LIMIT %s
            """, (model_urn, search_pattern, search_pattern, limit))
        
        return cursor.fetchall()

def search_nodes(model_urn, query, limit=100):
    """
    Búsqueda global exhaustiva para el Frontend optimizada para evitar N+1 queries.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        search_pattern = f"%{query}%"
        cursor.execute("""
            WITH RECURSIVE found_files AS (
                SELECT id, name, node_type, size_bytes, version_number, updated_at, description, gcs_urn, status, mime_type
                FROM file_nodes
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (name ILIKE %s OR description ILIKE %s)
                ORDER BY updated_at DESC
                LIMIT %s
            ),
            paths AS (
                SELECT f.id as base_id, fn.id, fn.parent_id, fn.name, 0 as level
                FROM found_files f
                JOIN file_nodes fn ON fn.id = f.id
                
                UNION ALL
                
                SELECT p.base_id, fn.id, fn.parent_id, fn.name, p.level + 1
                FROM file_nodes fn
                INNER JOIN paths p ON fn.id = p.parent_id
            ),
            assembled_paths AS (
                SELECT base_id, string_agg(name, ' / ' ORDER BY level DESC) as full_path
                FROM paths
                GROUP BY base_id
            )
            SELECT f.id, f.name, f.node_type, f.size_bytes, f.version_number, f.updated_at, f.description, f.gcs_urn, f.status, f.mime_type, ap.full_path
            FROM found_files f
            LEFT JOIN assembled_paths ap ON f.id = ap.base_id
            ORDER BY f.updated_at DESC
        """, (model_urn, search_pattern, search_pattern, limit))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_desc, r_gcs, r_status, r_mime, r_full_path = row
            results.append({
                "id": str(r_id),
                "name": r_name,
                "node_type": r_type,
                "fullName": r_full_path, 
                "size": r_size,
                "version": f"V{r_version}",
                "updated": r_updated.isoformat() if r_updated else None,
                "description": r_desc,
                "mime_type": r_mime,
                "status": r_status,
                "gcs_urn": r_gcs
            })
        return results

def list_deleted_contents(model_urn):
    """
    Lista todos los nodos marcados como eliminados (is_deleted = TRUE) en un proyecto.
    Optimizado con CTE recursivo para evitar consultas N+1 en las rutas.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            WITH RECURSIVE deleted_files AS (
                SELECT id, name, node_type, size_bytes, version_number, updated_at, description, gcs_urn, mime_type, created_by
                FROM file_nodes
                WHERE model_urn = %s AND is_deleted = TRUE
            ),
            paths AS (
                SELECT f.id as base_id, fn.id, fn.parent_id, fn.name, 0 as level
                FROM deleted_files f
                JOIN file_nodes fn ON fn.id = f.id
                
                UNION ALL
                
                SELECT p.base_id, fn.id, fn.parent_id, fn.name, p.level + 1
                FROM file_nodes fn
                INNER JOIN paths p ON fn.id = p.parent_id
            ),
            assembled_paths AS (
                SELECT base_id, string_agg(name, ' / ' ORDER BY level DESC) as full_path
                FROM paths
                GROUP BY base_id
            )
            SELECT f.id, f.name, f.node_type, f.size_bytes, f.version_number, f.updated_at, f.description, f.gcs_urn, f.mime_type, f.created_by, ap.full_path
            FROM deleted_files f
            LEFT JOIN assembled_paths ap ON f.id = ap.base_id
            ORDER BY f.updated_at DESC
        """, (model_urn,))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_desc, r_gcs, r_mime, r_created_by, r_full_path = row
            results.append({
                "id": str(r_id),
                "name": r_name,
                "node_type": r_type,
                "fullName": r_full_path, 
                "size": r_size,
                "version": f"V{r_version}",
                "updated": r_updated.isoformat() if r_updated else None,
                "description": r_desc,
                "mime_type": r_mime,
                "gcs_urn": r_gcs,
                "updated_by": r_created_by
            })
        return results

def restore_node(model_urn, node_id):
    """
    Restaura un nodo y sus hijos, marcándolos como is_deleted = FALSE.
    Si ya existe un nodo con el mismo nombre en el mismo padre, lanza excepción.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Obtener datos del nodo a restaurar (incluyendo el model_urn real de la DB)
        cursor.execute("SELECT name, parent_id, node_type, model_urn FROM file_nodes WHERE id = %s", (node_id,))
        node = cursor.fetchone()
        if not node: return False
        
        name, parent_id, node_type, model_urn = node
        
        # Verificar conflicto de nombres en el destino
        if parent_id:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = %s AND is_deleted = FALSE
            """, (model_urn, parent_id, name, node_type))
        else:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = %s AND is_deleted = FALSE
            """, (model_urn, name, node_type))
            
        if cursor.fetchone():
            raise Exception(f"Ya existe un elemento activo llamado '{name}' en la ubicación original.")
            
        # Recursive restore for the subtree
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            UPDATE file_nodes
            SET is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT id FROM subtree)
        """, (node_id,))
        conn.commit()
        return True

def permanent_delete_node_internal(model_urn, node_id):
    """
    Borra físicamente de GCS y elimina el registro de BD.
    Si es carpeta, borra todo su contenido recursivamente.
    """
    from gcs_manager import delete_gcs_blob
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Obtener lista de todos los descendientes (incluyendo el actual)
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id, gcs_urn, name, node_type FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id, fn.gcs_urn, fn.name, fn.node_type FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            SELECT id, gcs_urn FROM subtree
        """, (node_id,))
        
        to_delete = cursor.fetchall()
        
        # 2. Borrar de BD inmediato (para que frontend reciba OK instantaneo)
        cursor.execute("DELETE FROM file_nodes WHERE id = %s", (node_id,))
        conn.commit()

        # 3. Borrar de GCS en background (fire and forget)
        def bg_delete(items):
            for rid, gcs_urn in items:
                if gcs_urn:
                    try:
                        delete_gcs_blob(gcs_urn)
                    except Exception as e:
                        print(f"Error background delete {gcs_urn}: {e}")

        gcs_executor.submit(bg_delete, to_delete)
        
        return True

def get_file_versions(model_urn, file_node_id):
    """
    Obtiene el historial completo de versiones de un Ítem (FileNode).
    Basado en el modelo HPFIV de Autodesk.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT v.id, v.version_number, v.size_bytes, v.created_at, v.created_by, v.metadata, v.gcs_urn
                FROM file_versions v
                JOIN file_nodes n ON v.file_node_id = n.id
                WHERE n.model_urn = %s AND n.id = %s
                ORDER BY v.version_number DESC
            """, (model_urn, file_node_id))
            
            versions = []
            for r_id, r_num, r_size, r_at, r_by, r_meta, r_gcs in cursor.fetchall():
                versions.append({
                    "id": str(r_id),
                    "version_number": r_num,
                    "size": r_size,
                    "updated": r_at.isoformat() if r_at else None,
                    "updated_by": r_by,
                    "metadata": r_meta or {},
                    "gcs_urn": r_gcs
                })
            return versions
    except Exception as e:
        print(f"Error fetching versions for {file_node_id}: {e}")
        return []

def promote_version(model_urn, node_id, version_id, performed_by=None):
    """
    Promociona una versión antigua a 'Actual' (Estilo ACC).
    Crea una NUEVA versión con el contenido de la versión seleccionada.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Obtener datos de la versión a promocionar
        cursor.execute("""
            SELECT gcs_urn, size_bytes, mime_type, metadata
            FROM file_versions
            WHERE id = %s AND file_node_id = %s
        """, (version_id, node_id))
        source_v = cursor.fetchone()
        if not source_v: return False
        
        gcs_urn, size, mime, meta = source_v
        
        # 2. Obtener el número de la última versión del ítem
        cursor.execute("SELECT version_number FROM file_nodes WHERE id = %s", (node_id,))
        current_v_num = cursor.fetchone()[0]
        new_v_num = current_v_num + 1
        
        # 3. Crear el nuevo registro de versión
        cursor.execute("""
            INSERT INTO file_versions (file_node_id, version_number, gcs_urn, size_bytes, mime_type, created_by, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (node_id, new_v_num, gcs_urn, size, mime, performed_by, meta))
        new_v_id = cursor.fetchone()[0]
        
        # 4. Actualizar el ítem principal
        cursor.execute("""
            UPDATE file_nodes
            SET version_number = %s, gcs_urn = %s, size_bytes = %s, current_version_id = %s, updated_at = CURRENT_TIMESTAMP, created_by = %s
            WHERE id = %s
        """, (new_v_num, gcs_urn, size, new_v_id, performed_by, node_id))
        
        conn.commit()
        return True
def update_node_description(model_urn, node_id, description):
    """
    Actualiza el campo descripción de un nodo (archivo o carpeta).
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE file_nodes SET description = %s WHERE id = %s AND model_urn = %s",
            (description, node_id, model_urn)
        )
        conn.commit()
    return True
