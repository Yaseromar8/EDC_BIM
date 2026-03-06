import os
import uuid
import time
from db import get_db_connection

def resolve_path_to_node_id(path, model_urn):
    """
    Convierte un path del tipo 'folder1/folder2/' en el node_id correspondiente de la base de datos.
    Crea las carpetas intermedias si no existen (ideal para migraciones y frontends que mandan texto).
    """
    if not path or path == '/':
        return None  # Directorio raiz del modelo

    parts = [p for p in path.split('/') if p]
    parent_id = None
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        for part in parts:
            # Buscar si el folder existe
            if parent_id is None:
                cursor.execute(
                    "SELECT id FROM file_nodes WHERE model_urn = %s AND name = %s AND parent_id IS NULL AND node_type = 'FOLDER' AND is_deleted = FALSE",
                    (model_urn, part)
                )
            else:
                cursor.execute(
                    "SELECT id FROM file_nodes WHERE model_urn = %s AND name = %s AND parent_id = %s AND node_type = 'FOLDER' AND is_deleted = FALSE",
                    (model_urn, part, parent_id)
                )
            row = cursor.fetchone()
            
            if row:
                parent_id = row[0]
            else:
                # El folder no existe, creémoslo on the fly para asegurar "cimiento indestructible"
                cursor.execute("""
                    INSERT INTO file_nodes (model_urn, parent_id, node_type, name)
                    VALUES (%s, %s, 'FOLDER', %s)
                    RETURNING id
                """, (model_urn, parent_id, part))
                parent_id = cursor.fetchone()[0]
                conn.commit()
                
    return parent_id

def list_contents(parent_id, model_urn, base_path=""):
    """
    Devuelve lista estructurada estilo GCS {"folders":[], "files":[]} pero instantánea desde BD
    """
    folders = []
    files = []
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        if parent_id is None:
            cursor.execute("""
                SELECT id, name, node_type, size_bytes, version_number, updated_at, gcs_urn, status, tags, metadata 
                FROM file_nodes 
                WHERE model_urn = %s AND parent_id IS NULL AND is_deleted = FALSE
                ORDER BY name
            """, (model_urn,))
        else:
            cursor.execute("""
                SELECT id, name, node_type, size_bytes, version_number, updated_at, gcs_urn, status, tags, metadata 
                FROM file_nodes 
                WHERE model_urn = %s AND parent_id = %s AND is_deleted = FALSE
                ORDER BY name
            """, (model_urn, parent_id))
            
        rows = cursor.fetchall()
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_gcs, r_status, r_tags, r_metadata = row
            # Construir fullName conceptual para Frontend ('fotos/app/')
            full_name = f"{base_path}{r_name}" + ("/" if r_type == 'FOLDER' else "")
            
            if r_type == 'FOLDER':
                folders.append({
                    "id": r_id,
                    "name": r_name,
                    "fullName": full_name
                })
            else:
                files.append({
                    "id": r_id,
                    "name": r_name,
                    "fullName": full_name, # Frontend espera fullName como identificador en view
                    "size": r_size,
                    "version": f"V{r_version}",
                    "updated": r_updated.isoformat() if r_updated else None,
                    "status": r_status,
                    "tags": r_tags or [],
                    "metadata": r_metadata or {},
                    "gcs_urn": r_gcs
                })
                
    return {"folders": folders, "files": files}

def create_file_record(model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type=None):
    """Inserta el registro fisico del archivo en BD apuntando al UUID oculto en GCS"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Check if file exists to bump version
        cursor.execute(
            "SELECT id, version_number FROM file_nodes WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE",
            (model_urn, parent_id, filename)
        )
        existing = cursor.fetchone()
        
        if existing: # Si ya existia con mismo nombre, actualizamos su GCS URN y subimos versión
            f_id, f_v = existing
            cursor.execute("""
                UPDATE file_nodes 
                SET gcs_urn = %s, version_number = %s, size_bytes = %s, mime_type = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (gcs_uuid, f_v + 1, size_bytes, mime_type, f_id))
        else:
            cursor.execute("""
                INSERT INTO file_nodes (model_urn, parent_id, node_type, name, size_bytes, gcs_urn, mime_type)
                VALUES (%s, %s, 'FILE', %s, %s, %s, %s)
            """, (model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type))
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

def soft_delete_node(model_urn, node_path):
    """
    Soft-delete de un nodo y TODOS sus hijos recursivamente.
    Igual que ACC cuando borras una carpeta: todo desaparece sin perder el blob en GCS.
    Usa CTE recursivo de PostgreSQL para eficiencia maxima.
    """
    # Primero obtener el node_id del nodo raiz a borrar
    parts = [p for p in node_path.strip('/').split('/') if p]
    if not parts:
        return False

    # Si tiene mas de un segmento, el 'nodo' es el archivo/carpeta final
    # y el parent es el resto del path
    target_name = parts[-1]
    parent_path = '/'.join(parts[:-1])
    parent_id = resolve_path_to_node_id(parent_path, model_urn) if parent_path else None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Buscar el nodo objetivo
        if parent_id:
            cursor.execute(
                "SELECT id FROM file_nodes WHERE model_urn = %s AND parent_id = %s AND name = %s AND is_deleted = FALSE",
                (model_urn, parent_id, target_name)
            )
        else:
            cursor.execute(
                "SELECT id FROM file_nodes WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND is_deleted = FALSE",
                (model_urn, target_name)
            )
        row = cursor.fetchone()
        if not row:
            return False

        root_id = row[0]

        # CTE recursivo: marca el nodo Y TODOS SUS DESCENDIENTES como borrados
        # Equivale a borrar una carpeta completa con todas sus subcarpetas y archivos
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            UPDATE file_nodes
            SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT id FROM subtree)
        """, (root_id,))
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
