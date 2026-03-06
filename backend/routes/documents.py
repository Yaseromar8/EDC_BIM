import os
import time
import uuid
from flask import Blueprint, request, jsonify, redirect, Response
from werkzeug.utils import secure_filename
from gcs_manager import generate_signed_url, upload_file_to_gcs

documents_bp = Blueprint('documents', __name__)

# ─── Tipos MIME → Content-Disposition hint ───────────────────────────────────
INLINE_MIMES = {'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'}


@documents_bp.route('/api/docs/view', methods=['GET'])
def view_document():
    """Redirige a una URL firmada fresca. Acepta path o urn directamente."""
    path = request.args.get('path', '')
    urn = request.args.get('urn', '')
    node_id = request.args.get('id', '')
    model_urn = request.args.get('model_urn', 'global')
    
    gcs_urn = None
    if urn:
        gcs_urn = urn
    elif node_id:
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT gcs_urn FROM file_nodes WHERE id = %s AND is_deleted = FALSE", (node_id,))
                row = cursor.fetchone()
                if row: gcs_urn = row[0]
        except Exception: pass
    elif path:
        from file_system_db import get_file_gcs_urn
        gcs_urn = get_file_gcs_urn(model_urn, path)
    else:
        return jsonify({"success": False, "error": "No identifier provided"}), 400

    if not gcs_urn:
        return jsonify({"success": False, "error": "File not found"}), 404

    url = generate_signed_url(gcs_urn)
    if url:
        return redirect(url)
    return jsonify({"success": False, "error": "Failed to generate access URL"}), 500


@documents_bp.route('/api/documents/<int:node_id>', methods=['GET'])
def get_document_by_id(node_id):
    """Obtiene metadata y URL de un documento por su ID de base de datos."""
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, gcs_urn, mime_type, metadata 
                FROM file_nodes 
                WHERE id = %s AND is_deleted = FALSE
            """, (node_id,))
            row = cursor.fetchone()
            
            if not row:
                return jsonify({"success": False, "error": "Documento no encontrado"}), 404
            
            doc_data = {
                "id": row[0],
                "name": row[1],
                "gcs_urn": row[2],
                "mime_type": row[3],
                "metadata": row[4]
            }
            
            # Generar URL firmada
            doc_data["url"] = generate_signed_url(row[2])
            
            return jsonify({"success": True, "document": doc_data}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/proxy', methods=['GET', 'OPTIONS'])
def proxy_document():
    """Sirve el documento directamente desde GCS para evitar problemas de CORS en el Viewer."""
    urn = request.args.get('urn', '')
    path = request.args.get('path', '')
    node_id = request.args.get('id', '')
    model_urn = request.args.get('model_urn', 'global')
    
    gcs_urn = None
    if urn:
        gcs_urn = urn
    elif node_id:
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT gcs_urn FROM file_nodes WHERE id = %s AND is_deleted = FALSE", (node_id,))
                row = cursor.fetchone()
                if row: gcs_urn = row[0]
        except Exception: pass
    elif path:
        from file_system_db import get_file_gcs_urn
        gcs_urn = get_file_gcs_urn(model_urn, path)
    
    if not gcs_urn:
        return "No path, urn or valid id provided", 400

    from gcs_manager import get_blob_data
    content, content_type = get_blob_data(gcs_urn)
    
    if content is None:
        print(f"[Proxy] Blob {gcs_urn} not found in GCS.")
        return f"File not found in storage for URN: {gcs_urn}", 404
        
    print(f"[Proxy] Serving {gcs_urn} as {content_type}")
    return Response(content, mimetype=content_type or 'application/octet-stream')


@documents_bp.route('/api/docs/list', methods=['GET'])
def list_documents():
    """Devuelve el inventario (archivos y carpetas logicas) desde PostgreSQL."""
    path = request.args.get('path', '')
    model_urn = request.args.get('model_urn', 'global')

    if path and not path.endswith('/'):
        path += '/'

    try:
        from file_system_db import resolve_path_to_node_id, list_contents

        parent_id = resolve_path_to_node_id(path, model_urn)
        contents = list_contents(parent_id, model_urn, path)

        # Generar URLs firmadas para los archivos listados
        for f in contents['files']:
            if f.get('gcs_urn'):
                f['mediaLink'] = generate_signed_url(f['gcs_urn'])

        return jsonify({"success": True, "data": contents}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/folder', methods=['POST'])
def create_folder():
    """Crea una carpeta virtual en base de datos PostgreSQL."""
    data = request.get_json()
    if not data or 'path' not in data:
        return jsonify({"success": False, "error": "No path provided"}), 400

    folder_path = data['path']
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    try:
        from file_system_db import resolve_path_to_node_id
        from db import log_activity
        resolve_path_to_node_id(folder_path, model_urn)
        log_activity(model_urn, 'create_folder', 'folder',
                     entity_name=folder_path, performed_by=performed_by)
        return jsonify({"success": True, "message": f"Folder '{folder_path}' created"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/upload', methods=['POST'])
def upload_document():
    """
    Sube a GCS con nombre ofuscado y guarda metadatos en file_nodes.
    Valida: tipo MIME, extension, tamanio maximo permitido.
    """
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file part in request"}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400

    folder_path = request.form.get('path', '')
    model_urn = request.form.get('model_urn', 'global')
    performed_by = request.form.get('user', None)

    if folder_path and not folder_path.endswith('/'):
        folder_path += '/'

    filename = secure_filename(file.filename)

    # ── 1. VALIDACION DE ARCHIVO ─────────────────────────────────────────────
    try:
        from file_validator import validate_file, FileValidationError
        file_info = validate_file(file)
    except Exception as ve:
        # Importar FileValidationError puede estar fuera del scope
        return jsonify({
            "success": False,
            "error": str(ve),
            "code": getattr(ve, 'code', 'VALIDATION_ERROR')
        }), 422

    try:
        from file_system_db import resolve_path_to_node_id, create_file_record
        from db import log_activity

        # ── 2. Resolver path logico en BD ─────────────────────────────────────
        parent_id = resolve_path_to_node_id(folder_path, model_urn)

        # ── 3. Generar nombre ofuscado en GCS (nunca el nombre real del archivo) ─
        # Formato: multi-tenant/{project_id}/{timestamp}_{uuid8}_{filename}
        gcs_uuid = f"multi-tenant/{model_urn}/{int(time.time())}_{uuid.uuid4().hex[:8]}_{filename}"

        # ── 4. Subir blob fisico a GCS ────────────────────────────────────────
        gcs_url = upload_file_to_gcs(file, gcs_uuid)
        if not gcs_url:
            return jsonify({"success": False, "error": "GCS upload failed"}), 500

        # ── 5. Registrar en PostgreSQL con metadatos completos ────────────────
        create_file_record(
            model_urn, parent_id, filename,
            file_info['size_bytes'], gcs_uuid,
            mime_type=file_info.get('mime_type')
        )

        # ── 6. Auditoria ─────────────────────────────────────────────────────
        log_activity(
            model_urn, 'upload', 'file',
            entity_name=f"{folder_path}{filename}",
            performed_by=performed_by,
            details={
                'size_mb': file_info['size_mb'],
                'mime_type': file_info['mime_type'],
                'gcs_urn': gcs_uuid
            }
        )

        return jsonify({
            "success": True,
            "filename": filename,
            "fullName": f"{folder_path}{filename}",
            "size_mb": file_info['size_mb'],
            "mime_type": file_info['mime_type'],
            "url": gcs_url
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/delete', methods=['DELETE'])
def delete_document():
    """Soft-delete recursivo en BD (carpetas borran todos sus hijos)."""
    data = request.get_json()
    if not data or 'fullName' not in data:
        return jsonify({"success": False, "error": "No fullName provided"}), 400

    node_path = data['fullName']
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    try:
        from file_system_db import soft_delete_node
        from db import log_activity
        success = soft_delete_node(model_urn, node_path)
        if success:
            log_activity(model_urn, 'delete', 'file_or_folder',
                         entity_name=node_path, performed_by=performed_by)
            return jsonify({"success": True, "message": "Moved to Trash (soft delete)"}), 200
        return jsonify({"success": False, "error": "Node not found or already deleted"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/rename', methods=['PUT'])
def rename_document():
    """Renombra un archivo o carpeta en PostgreSQL."""
    data = request.get_json()
    if not data or 'fullName' not in data or 'newName' not in data:
        return jsonify({"success": False, "error": "Requires fullName and newName"}), 400

    node_path = data['fullName']
    new_name = secure_filename(data['newName'])
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    if not new_name:
        return jsonify({"success": False, "error": "Invalid new name"}), 400

    try:
        from file_system_db import resolve_path_to_node_id
        from db import get_db_connection, log_activity

        # Descomponer el path para encontrar el nombre actual y el parent_id real
        parts = [p for p in node_path.strip('/').split('/') if p]
        if not parts:
            return jsonify({"success": False, "error": "Invalid path"}), 400
            
        old_name = parts[-1]
        parent_path = '/'.join(parts[:-1])
        parent_id = resolve_path_to_node_id(parent_path, model_urn) if parent_path else None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Buscamos el nodo específico que cuelga del mismo padre
            if parent_id:
                cursor.execute("""
                    UPDATE file_nodes SET name = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE model_urn = %s AND name = %s AND parent_id = %s AND is_deleted = FALSE
                    RETURNING id
                """, (new_name, model_urn, old_name, parent_id))
            else:
                cursor.execute("""
                    UPDATE file_nodes SET name = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE model_urn = %s AND name = %s AND parent_id IS NULL AND is_deleted = FALSE
                    RETURNING id
                """, (new_name, model_urn, old_name))
                
            updated = cursor.fetchone()
            conn.commit()

        if updated:
            log_activity(model_urn, 'rename', 'file_or_folder',
                         entity_name=node_path, performed_by=performed_by,
                         details={'old_name': old_name, 'new_name': new_name})
            new_full_path = (parent_path + '/' if parent_path else '') + new_name
            return jsonify({"success": True, "newFullName": new_full_path}), 200

        return jsonify({"success": False, "error": "Item not found in specified location"}), 404

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/move', methods=['PUT'])
def move_document():
    """Mueve una carpeta o archivo a un nuevo directorio en PostgreSQL."""
    data = request.get_json()
    if not data or 'fullName' not in data or 'destPath' not in data:
        return jsonify({"success": False, "error": "Requires fullName and destPath"}), 400

    node_path = data['fullName']
    dest_path = data['destPath']
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    print(f"[MOVE] Attempting to move '{node_path}' to '{dest_path}' (urn: {model_urn})")

    try:
        from file_system_db import resolve_path_to_node_id
        from db import get_db_connection, log_activity

        # 1. Resolver el ID del nodo que queremos mover
        # resolve_path_to_node_id maneja bien si hay o no slash al final
        target_node_id = resolve_path_to_node_id(node_path, model_urn)
        if not target_node_id:
            print(f"[MOVE] ERROR: Source not found: {node_path}")
            return jsonify({"success": False, "error": f"Source item not found: {node_path}"}), 404

        # 2. Resolver el ID del nodo destino (donde va a vivir)
        # resolve_path_to_node_id creará la ruta si no existe
        new_parent_id = resolve_path_to_node_id(dest_path, model_urn) if dest_path else None
        
        # 3. Evitar mover dentro de sí mismo
        if target_node_id == new_parent_id:
            return jsonify({"success": False, "error": "Cannot move item into itself"}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Actualizar el parent_id
            cursor.execute("""
                UPDATE file_nodes 
                SET parent_id = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND model_urn = %s AND is_deleted = FALSE
                RETURNING id
            """, (new_parent_id, target_node_id, model_urn))
            
            updated = cursor.fetchone()
            conn.commit()

        if updated:
            print(f"[MOVE] SUCCESS: Moved {node_path} to {dest_path}")
            log_activity(model_urn, 'move', 'file_or_folder',
                         entity_id=str(target_node_id),
                         entity_name=node_path, 
                         performed_by=performed_by,
                         details={'dest_path': dest_path})
            return jsonify({"success": True, "message": "Item moved successfully"}), 200

        return jsonify({"success": False, "error": "Failed to update database record"}), 500

    except Exception as e:
        print(f"[MOVE] CRITICAL ERROR: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/versions', methods=['GET'])
def get_file_versions():
    """Obtiene el historial de versiones consultando el log de actividad."""
    path = request.args.get('path')
    model_urn = request.args.get('model_urn', 'global')
    
    if not path:
        return jsonify({"success": False, "error": "Path required"}), 400
        
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT performed_by, details, created_at
                FROM activity_log
                WHERE model_urn = %s AND entity_name = %s AND action = 'upload'
                ORDER BY created_at DESC
            """, (model_urn, path))
            rows = cursor.fetchall()
            
            versions = []
            total = len(rows)
            for i, r in enumerate(rows):
                versions.append({
                    "version": f"V{total - i}",
                    "performed_by": r[0] or "Sistema",
                    "details": r[1] or {},
                    "created_at": r[2].isoformat() if r[2] else None
                })
        return jsonify({"success": True, "data": versions}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/activity', methods=['GET'])
def get_activity_log():
    """Activity Feed del proyecto — al estilo ACC."""
    model_urn = request.args.get('model_urn', 'global')
    entity_name = request.args.get('entity_name') # Opcional: para ver historial de un archivo específico
    limit = min(int(request.args.get('limit', 50)), 200)

    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            query = """
                SELECT action, entity_type, entity_name, performed_by, details, created_at
                FROM activity_log
                WHERE model_urn = %s
            """
            params = [model_urn]
            
            if entity_name:
                query += " AND entity_name = %s "
                params.append(entity_name)
                
            query += " ORDER BY created_at DESC LIMIT %s "
            params.append(limit)
            
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            activities = [{
                "action": r[0], "entity_type": r[1], "entity_name": r[2],
                "performed_by": r[3] or "Sistema",
                "details": r[4] or {},
                "created_at": r[5].isoformat() if r[5] else None
            } for r in rows]
        return jsonify({"success": True, "data": activities}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/search', methods=['GET'])
def search_documents():
    """Buscador global dentro de un proyecto (model_urn)."""
    query = request.args.get('q', '').strip()
    model_urn = request.args.get('model_urn', 'global')
    
    if not query or len(query) < 2:
        return jsonify({"success": True, "data": []}), 200
        
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Búsqueda usando ILIKE (Case Insensitive) sobre el nombre y tags
            # Usamos un CTE recursivo para reconstruir el path lógico de cada resultado
            # Esto es VITAL para que el usuario sepa dónde está el archivo encontrado
            cursor.execute("""
                WITH RECURSIVE path_builder AS (
                    SELECT id, parent_id, name, CAST(name AS TEXT) as full_path
                    FROM file_nodes
                    WHERE parent_id IS NULL AND model_urn = %s
                    
                    UNION ALL
                    
                    SELECT fn.id, fn.parent_id, fn.name, 
                           pb.full_path || '/' || fn.name
                    FROM file_nodes fn
                    INNER JOIN path_builder pb ON fn.parent_id = pb.id
                    WHERE fn.model_urn = %s
                )
                SELECT fn.id, fn.node_type, fn.name, pb.full_path, fn.size_bytes, fn.updated_at, fn.version_number
                FROM file_nodes fn
                JOIN path_builder pb ON fn.id = pb.id
                WHERE fn.model_urn = %s 
                  AND fn.is_deleted = FALSE
                  AND (fn.name ILIKE %s OR %s = ANY(fn.tags))
                ORDER BY fn.node_type DESC, fn.name ASC
                LIMIT 50
            """, (model_urn, model_urn, model_urn, f"%{query}%", query))
            
            rows = cursor.fetchall()
            results = [{
                "id": r[0], "type": r[1], "name": r[2], "path": r[3],
                "size_bytes": r[4], "updated_at": r[5].isoformat() if r[5] else None,
                "version": r[6]
            } for r in rows]
            
        return jsonify({"success": True, "data": results}), 200
    except Exception as e:
        print(f"[Search] Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
@documents_bp.route('/api/docs/batch', methods=['POST'])
def batch_update():
    """Operaciones masivas: cambio de estado o eliminación de múltiples items."""
    data = request.get_json()
    if not data or 'items' not in data or 'action' not in data:
        return jsonify({"success": False, "error": "Missing items or action"}), 400

    items = data['items'] # Lista de IDs (UUIDs)
    action = data['action'] # 'SET_STATUS' | 'DELETE'
    new_status = data.get('status')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    if not items:
        return jsonify({"success": True, "message": "No items to process"}), 200

    try:
        from db import get_db_connection, log_activity
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            if action == 'SET_STATUS' and new_status:
                cursor.execute("""
                    UPDATE file_nodes 
                    SET status = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ANY(%s) AND model_urn = %s
                """, (new_status, items, model_urn))
                
                # Loggear actividad masiva (resumida)
                log_activity(model_urn, 'batch_status', 'multiple', 
                             entity_name=f"{len(items)} items", 
                             performed_by=performed_by,
                             details={'new_status': new_status, 'item_count': len(items)})

            elif action == 'DELETE':
                # Soft delete masivo
                cursor.execute("""
                    UPDATE file_nodes 
                    SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ANY(%s) AND model_urn = %s
                """, (items, model_urn))
                
                log_activity(model_urn, 'batch_delete', 'multiple', 
                             entity_name=f"{len(items)} items", 
                             performed_by=performed_by,
                             details={'item_count': len(items)})
            
            conn.commit()
            
        return jsonify({"success": True, "processed": len(items)}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/upload-url', methods=['POST'])
def get_upload_url():
    """Genera una Signed URL para subida directa (PUT) a GCS. Estilo profesional ACC."""
    data = request.get_json()
    filename = data.get('filename')
    content_type = data.get('contentType', 'application/octet-stream')
    model_urn = data.get('model_urn', 'global')

    if not filename:
        return jsonify({"success": False, "error": "Filename required"}), 400

    # Generar la URN oculta (mismo proceso que upload normal)
    safe_name = secure_filename(filename)
    gcs_uuid = f"multi-tenant/{model_urn}/{int(time.time())}_{uuid.uuid4().hex[:8]}_{safe_name}"

    try:
        from gcs_manager import generate_upload_url
        upload_url = generate_upload_url(gcs_uuid, content_type=content_type)
        
        if upload_url:
            return jsonify({
                "success": True, 
                "uploadUrl": upload_url, 
                "gcsUrn": gcs_uuid
            }), 200
        return jsonify({"success": False, "error": "Failed to generate upload URL"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/upload-complete', methods=['POST'])
def finalize_upload():
    """Confirma que la subida directa a GCS terminó y registra en BD."""
    data = request.get_json()
    filename = data.get('filename')
    gcs_urn = data.get('gcsUrn')
    size_bytes = data.get('sizeBytes')
    folder_path = data.get('path', '')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    if not filename or not gcs_urn:
        return jsonify({"success": False, "error": "Missing data"}), 400

    if folder_path and not folder_path.endswith('/'):
        folder_path += '/'

    try:
        from file_system_db import resolve_path_to_node_id, create_file_record
        from db import log_activity

        parent_id = resolve_path_to_node_id(folder_path, model_urn)
        
        create_file_record(
            model_urn, parent_id, filename,
            size_bytes, gcs_urn,
            mime_type=data.get('contentType')
        )

        log_activity(
            model_urn, 'upload', 'file',
            entity_name=f"{folder_path}{filename}",
            performed_by=performed_by,
            details={'gcs_urn': gcs_urn, 'method': 'direct_upload'}
        )

        return jsonify({"success": True, "message": "File registered"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
