import os
import time
import uuid
import requests
from flask import Blueprint, request, jsonify, redirect, Response
from werkzeug.utils import secure_filename
from gcs_manager import generate_signed_url, upload_file_to_gcs, delete_gcs_blob

documents_bp = Blueprint('documents', __name__)
print("[DEBUG] documents_bp loaded from routes/documents.py")


# ── RBAC: Control de Acceso Basado en Roles (ISO 19650) ──────────────
# ── RBAC: Control de Acceso Basado en Roles (ISO 19650) ──────────────
from folder_permissions import check_folder_permission


def verify_project_access(user_id, model_urn):
    """
    Verifica que el usuario tenga acceso al proyecto asociado a este model_urn.
    Admins tienen acceso global. Usuarios normales deben estar en project_users.
    model_urn == 'global' se permite sin verificación (datos compartidos).
    """
    if not user_id or not model_urn or model_urn == 'global':
        return True  # Global namespace no requiere verificación
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Admins tienen acceso a todo
            cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            if user_row and user_row[0] == 'admin':
                return True
            # Usuarios normales: verificar tabla project_users
            # Extraer nombre del proyecto del model_urn (puede venir como 'proyectos/PQT8_TALARA')
            project_name = model_urn.split('/')[-1] if '/' in model_urn else model_urn
            cursor.execute("""
                SELECT 1 FROM project_users pu
                JOIN projects p ON pu.project_id = p.id
                WHERE pu.user_id = %s AND (p.model_urn = %s OR p.id = %s OR p.name = %s)
                LIMIT 1
            """, (user_id, model_urn, model_urn, project_name))
            return cursor.fetchone() is not None
    except Exception as e:
        print(f"[ACL] Error checking project access: {e}")
        return False


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


@documents_bp.route('/api/docs/signed-url', methods=['GET'])
def get_signed_url_json():
    """Retorna la URL firmada como JSON (útil para visores externos como Office)."""
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
    
    if not gcs_urn:
        return jsonify({"success": False, "error": "File not found"}), 404

    url = generate_signed_url(gcs_urn)
    if url:
        return jsonify({"success": True, "url": url}), 200
    return jsonify({"success": False, "error": "Failed to generate signed URL"}), 500


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
        return jsonify({"success": False, "error": "Document URN not found"}), 404

    from gcs_manager import generate_signed_url, get_blob_data
    from flask import redirect, Response

    # Si es imagen, lo evitamos exponer a redirect/signing issues (soluciona error de imagen negra)
    is_image = any(gcs_urn.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif'])
    if is_image:
        content, content_type = get_blob_data(gcs_urn)
        if content:
            return Response(content, mimetype=content_type or 'image/jpeg')

    # Para PDFs o archivos grandes, proxy streaming para esquivar bloqueos de CORS del navegador
    signed_url = generate_signed_url(gcs_urn)
    if not signed_url:
        # Fallback de emergencia, extraerlo a la fuerza
        content, content_type = get_blob_data(gcs_urn)
        if content:
             return Response(content, mimetype=content_type or 'application/octet-stream')
        return f"File not found in storage for URN: {gcs_urn}", 404

    try:
        req_headers = {}
        if 'Range' in request.headers:
            req_headers['Range'] = request.headers['Range']
            
        r = requests.get(signed_url, headers=req_headers, stream=True, timeout=15)
        r.raise_for_status()
        
        def generate():
            for chunk in r.iter_content(chunk_size=1024 * 512): # 512KB chunks
                yield chunk
                
        resp_headers = {}
        for h in ['Content-Type', 'Content-Length', 'Accept-Ranges', 'Content-Range']:
            if h in r.headers:
                resp_headers[h] = r.headers[h]
                
        resp_headers['Access-Control-Allow-Origin'] = '*'
        resp_headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'
        
        return Response(generate(), status=r.status_code, headers=resp_headers)
    except Exception as e:
        print(f"[Proxy] Error streaming {gcs_urn}: {e}")
        return "Error fetching document from storage", 502


@documents_bp.route('/api/docs/list', methods=['GET'])
def list_documents():
    """Devuelve el inventario (archivos y carpetas logicas) desde PostgreSQL."""
    node_id = request.args.get('id')
    path = request.args.get('path', '')
    model_urn = request.args.get('model_urn', 'global')

    # ── TENANT ISOLATION: Verificar que el usuario tiene acceso al proyecto ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403

    try:
        from file_system_db import resolve_path_to_node_id, list_contents, ensure_project_root_node
        
        import uuid
        def is_valid_uuid(val):
            try:
                uuid.UUID(str(val))
                return True
            except ValueError:
                return False

        # Si mandan ID valido, lo usamos directamente. Si no, resolvemos el path.
        if node_id and node_id != 'null' and is_valid_uuid(node_id):
            parent_id = node_id
            # Verificar si el ID existe en el model_urn. Si no, fallback a global.
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT model_urn FROM file_nodes WHERE id = %s", (parent_id,))
                row = cursor.fetchone()
                if row:
                    model_urn = row[0] # Usar la URN real del nodo
        elif path:
            if not path.endswith('/'): path += '/'
            parent_id = resolve_path_to_node_id(path, model_urn, auto_create=False)
            
            is_project_root = (path.strip('/') == model_urn.strip('/') or path.strip('/') == '')
            
            # Si es la raíz del proyecto, asegurar que existe el nodo raíz real
            if is_project_root and model_urn != 'global':
                root_id = ensure_project_root_node(model_urn)
                if root_id:
                    parent_id = root_id
            
            # Si no se encontró y NO es el root del proyecto, intentar fallback a global
            if not parent_id and not is_project_root and model_urn != 'global':
                # Try fallback to global
                parent_id = resolve_path_to_node_id(path, 'global', auto_create=False)
                if parent_id:
                    model_urn = 'global'
            
            # PREVENT FRACTAL BUG: Si piden un path especifico y no existe, no listar la raíz.
            if not parent_id and not is_project_root:
                return jsonify({"success": True, "data": {"folders": [], "files": [], "current_node_id": None}}), 200
        else:
            parent_id = None

        contents = list_contents(parent_id, model_urn, path, user=user)

        # Generar URLs firmadas para los archivos listados
        for f in contents['files']:
            if f.get('gcs_urn'):
                f['mediaLink'] = generate_signed_url(f['gcs_urn'])

        return jsonify({"success": True, "data": {**contents, "current_node_id": str(parent_id) if parent_id else None}}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/versions', methods=['GET'])
def get_versions():
    """
    Obtiene el historial de versiones de un archivo específico.
    Requiere id (node_id) y model_urn.
    """
    file_id = request.args.get('id')
    model_urn = request.args.get('model_urn', 'global')
    
    if not file_id:
        return jsonify({"success": False, "error": "ID de archivo no proporcionado"}), 400
        
    try:
        from file_system_db import get_file_versions
        versions = get_file_versions(model_urn, file_id)
        return jsonify({"success": True, "versions": versions}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/versions/promote', methods=['POST'])
def promote_document_version():
    """Promociona una versión antigua a la actual (Crea una nueva versión con el mismo URN)."""
    data = request.get_json()
    node_id = data.get('id')
    version_id = data.get('version_id')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user')
    
    if not node_id or not version_id:
        return jsonify({"success": False, "error": "Faltan IDs"}), 400
        
    try:
        from file_system_db import promote_version
        success = promote_version(model_urn, node_id, version_id, performed_by=performed_by)
        if success:
            return jsonify({"success": True}), 200
        return jsonify({"success": False, "error": "No se pudo promocionar la versión"}), 500
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

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
        
    import os
    from file_system_db import resolve_path_to_node_id

    # El parent del nuevo folder se usa para validar permisos
    # folder_path = 'ARCHIVOS_01/01/nuevo' -> parent_path = 'ARCHIVOS_01/01'
    parent_path = os.path.dirname(folder_path.rstrip('/'))
    parent_node_id = resolve_path_to_node_id(parent_path, model_urn, auto_create=False)
    
    rbac = check_folder_permission(user, parent_node_id, model_urn, 'create_upload', 'crear carpetas')
    if rbac: return rbac

    # ── VALIDACIONES ENTERPRISE (Estilo ACC / ISO 19650) ──
    # Extraer solo el nombre de la carpeta nueva (última parte del path)
    folder_name = folder_path.rstrip('/').split('/')[-1]
    
    from folder_validators import validate_folder_creation
    validation = validate_folder_creation(folder_name, parent_node_id, model_urn)
    if not validation['valid']:
        return jsonify({
            "success": False, 
            "error": validation['message'], 
            "code": validation['code']
        }), 422

    try:
        from db import log_activity
        node_id = resolve_path_to_node_id(folder_path, model_urn, created_by=performed_by)
        log_activity(model_urn, 'create_folder', 'folder',
                     entity_name=folder_path, entity_id=str(node_id) if node_id else None, performed_by=performed_by)
        return jsonify({"success": True, "id": str(node_id) if node_id else None, "message": f"Folder '{folder_path}' created"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/upload', methods=['POST'])
def upload_document():
    """
    Sube a GCS con nombre ofuscado y guarda metadatos en file_nodes.
    Valida: tipo MIME, extension, tamanio maximo permitido.
    """
    print(f"[Upload] Request received at /api/docs/upload")
    if 'file' not in request.files:
        print("[Upload] Error: No file part in request.files")
        return jsonify({"success": False, "error": "No file part in request"}), 400

    file = request.files['file']
    print(f"[Upload] File received: {file.filename} (content_type: {file.content_type})")
    
    if not file or file.filename == '':
        print("[Upload] Error: No selected file")
        return jsonify({"success": False, "error": "No selected file"}), 400

    folder_path = request.form.get('path', '')
    model_urn = request.form.get('model_urn', 'global')
    performed_by = request.form.get('user', None)
    print(f"[Upload] Meta: path='{folder_path}', model_urn='{model_urn}', user='{performed_by}'")

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
        
    from file_system_db import resolve_path_to_node_id
    parent_node_id = resolve_path_to_node_id(folder_path, model_urn, auto_create=False)
    rbac = check_folder_permission(user, parent_node_id, model_urn, 'create_upload', 'subir archivos')
    if rbac: return rbac

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
        parent_id = resolve_path_to_node_id(folder_path, model_urn, created_by=performed_by)

        # ── 3. Generar nombre ofuscado en GCS (nunca el nombre real del archivo) ─
        # Formato: multi-tenant/{project_id}/{timestamp}_{uuid8}_{filename}
        gcs_uuid = f"multi-tenant/{model_urn}/{int(time.time())}_{uuid.uuid4().hex[:8]}_{filename}"

        # ── 4. Subir blob fisico a GCS ────────────────────────────────────────
        print(f"[Upload] Attempting GCS upload to: {gcs_uuid}")
        gcs_url = upload_file_to_gcs(file, gcs_uuid)
        if not gcs_url:
            print("[Upload] Error: GCS upload failed (upload_file_to_gcs returned None)")
            return jsonify({"success": False, "error": "GCS upload failed"}), 500

        print(f"[Upload] GCS upload success: {gcs_url}")
        # ── 5. Registrar en PostgreSQL con metadatos completos ────────────────
        # ROLLBACK: Si la BD falla, borramos el blob de GCS para evitar huérfanos
        try:
            create_file_record(
                model_urn, parent_id, filename,
                file_info['size_bytes'], gcs_uuid,
                mime_type=file_info.get('mime_type'),
                created_by=performed_by
            )
        except Exception as db_error:
            print(f"[Upload] DB FAILED after GCS success. Rolling back blob: {gcs_uuid}")
            try:
                delete_gcs_blob(gcs_uuid)
                print(f"[Upload] Orphan blob deleted successfully: {gcs_uuid}")
            except Exception as cleanup_err:
                print(f"[Upload] CRITICAL: Failed to delete orphan blob {gcs_uuid}: {cleanup_err}")
            raise db_error

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

        permalink_url = f"/api/docs/proxy?urn={gcs_uuid}"

        return jsonify({
            "success": True,
            "filename": filename,
            "fullName": f"{folder_path}{filename}",
            "size_mb": file_info['size_mb'],
            "mime_type": file_info['mime_type'],
            "url": permalink_url,
            "gcs_urn": gcs_uuid
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/dev/wipe', methods=['POST'])
def dev_wipe_ecd():
    """DESTRUCTIVE: Wipe entire ECD. Protected by env flag + admin role."""
    # ── GATE 1: Environment flag must be explicitly set ──
    import os
    if os.environ.get('ALLOW_DEV_WIPE') != 'true':
        return jsonify({"success": False, "error": "Endpoint disabled. Set ALLOW_DEV_WIPE=true to enable."}), 403

    # ── GATE 2: Must be authenticated admin ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if not user or user.get('role') != 'admin':
        return jsonify({"success": False, "error": "Admin role required for destructive operations."}), 403

    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('TRUNCATE TABLE file_nodes CASCADE;')
            cursor.execute('TRUNCATE TABLE activity_log CASCADE;')
            conn.commit()
        print(f"[WIPE] ECD wiped by {user.get('email', 'unknown')}")
        return jsonify({"success": True, "message": "ECD Wiped"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/delete', methods=['DELETE'])
def delete_document():
    """Soft-delete recursivo en BD (carpetas borran todos sus hijos)."""
    data = request.get_json()
    if not data or 'fullName' not in data:
        return jsonify({"success": False, "error": "No fullName provided"}), 400

    node_path = data['fullName']
    node_id = data.get('id')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    # ── TENANT ISOLATION: Verificar acceso al proyecto ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    rbac = check_folder_permission(user, node_id, model_urn, 'admin', 'eliminar archivos')
    if rbac: return rbac

    try:
        from file_system_db import soft_delete_node, resolve_path_to_node_id
        from db import log_activity
        
        target_id = node_id
        if not target_id:
            target_id = resolve_path_to_node_id(node_path, model_urn, auto_create=False)

        if target_id:
            success = soft_delete_node(target_id, model_urn, performed_by=performed_by)
            if success:
                log_activity(model_urn, 'delete', 'file_or_folder',
                             entity_name=node_path, performed_by=performed_by)
                return jsonify({"success": True, "message": "Moved to Trash (soft delete)"}), 200
        return jsonify({"success": False, "error": "Node not found or already deleted"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/rename', methods=['POST', 'PUT'])
def rename_document():
    """Renombra un archivo o carpeta. Soporta ID-based (POST) y Path-based (PUT)."""
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    model_urn = data.get('model_urn', 'global')

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    
    # ── Extraer node_id antes del RBAC check ──
    req_node_id = data.get('node_id') or data.get('id')
    rbac = check_folder_permission(user, req_node_id, model_urn, 'edit', 'renombrar archivos')
    if rbac: return rbac

    # RESOLVER EL NODO OBJETIVO
    try:
        from file_system_db import resolve_path_to_node_id, ISO_19650_REGEX
        import re
        from db import get_db_connection, log_activity

        target_node_id = req_node_id
        old_name = None
        parent_id = None
        node_type = None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            if not target_node_id and data.get('fullName'):
                # Legacy Path Resolution
                node_path = data.get('fullName').strip('/')
                parts = [p for p in node_path.split('/') if p]
                if not parts:
                    return jsonify({"success": False, "error": "Invalid path"}), 400
                old_name = parts[-1]
                parent_path = '/'.join(parts[:-1])
                parent_id = resolve_path_to_node_id(parent_path, model_urn, created_by=data.get('user')) if parent_path else None
                
                # Fetch node type and ID
                if parent_id:
                    cursor.execute("SELECT id, node_type FROM file_nodes WHERE model_urn = %s AND name = %s AND parent_id = %s AND is_deleted = FALSE", (model_urn, old_name, parent_id))
                else:
                    cursor.execute("SELECT id, node_type FROM file_nodes WHERE model_urn = %s AND name = %s AND parent_id IS NULL AND is_deleted = FALSE", (model_urn, old_name))
                row = cursor.fetchone()
                if row:
                    target_node_id, node_type = row
            else:
                # Modem ID Resolution
                cursor.execute("SELECT name, parent_id, node_type FROM file_nodes WHERE id = %s AND model_urn = %s AND is_deleted = FALSE", (target_node_id, model_urn))
                row = cursor.fetchone()
                if row:
                    old_name, parent_id, node_type = row

            if not target_node_id or not old_name:
                return jsonify({"success": False, "error": "Item not found in specified location"}), 404

            # --- ISO 19650 HOLDING AREA SANEAMIENTO ---
            new_status = 'ACTIVE' # Por defecto para FOLDER o si ya pasa
            
            if node_type == 'FILE':
                base_name = new_name.rsplit('.', 1)[0] if '.' in new_name else new_name
                if not re.match(ISO_19650_REGEX, base_name.upper()):
                    return jsonify({
                        "success": False, 
                        "error": "El nombre no cumple con el estándar ISO 19650 (Ej: PRJ-ORG-VOL-LVL-TYP-RL-0001)"
                    }), 400
            
            # EJECUTAR UPDATE APLICANDO EXTRACTO ISO
            cursor.execute("""
                UPDATE file_nodes 
                SET name = %s, status = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND model_urn = %s AND is_deleted = FALSE
                RETURNING id
            """, (new_name, new_status, target_node_id, model_urn))
            updated = cursor.fetchone()
            conn.commit()

        if updated:
            log_activity(model_urn, 'rename', 'file_or_folder',
                         entity_name=new_name, performed_by=data.get('user'),
                         details={'old_name': old_name, 'new_name': new_name})
            return jsonify({"success": True}), 200

        return jsonify({"success": False, "error": "Item not found in specified location"}), 404

    except Exception as e:
        print(f"[RENAME] Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/move', methods=['PUT'])
def move_document():
    """Mueve una carpeta o archivo a un nuevo directorio en PostgreSQL usando IDs."""
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    # Soporte para IDs (Preferido) o Paths (Legacy/Fallback)
    node_id = data.get('node_id')
    dest_node_id = data.get('destNodeId')
    
    node_path = data.get('fullName')
    dest_path = data.get('destPath')
    
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    rbac = check_folder_permission(user, node_id, model_urn, 'edit', 'mover archivos')
    if rbac: return rbac

    print(f"[MOVE] Request: node_id={node_id}, dest_node_id={dest_node_id}, node_path='{node_path}', dest_path='{dest_path}'")

    try:
        from file_system_db import resolve_path_to_node_id
        from db import get_db_connection, log_activity

        target_node_id = node_id
        if not target_node_id and node_path:
            # Fallback a resolver por path (Ojo: resolve_path_to_node_id crea carpetas si no existen!)
            target_node_id = resolve_path_to_node_id(node_path, model_urn)
            
        if not target_node_id:
            return jsonify({"success": False, "error": "Source item not found"}), 404

        # Resolver el ID del nodo destino
        new_parent_id = dest_node_id
        if new_parent_id is None and dest_path:
            # Si dest_path es solo la raiz del proyecto o vacio, parent_id es None
            if dest_path.strip('/') == '' or '/' not in dest_path.strip('/'):
                 new_parent_id = None
            else:
                 new_parent_id = resolve_path_to_node_id(dest_path, model_urn, created_by=performed_by)

        # Evitar mover dentro de sí mismo
        if target_node_id == new_parent_id:
            return jsonify({"success": False, "error": "Cannot move item into itself"}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Obtener datos del nodo a mover (nombre y tipo para validar conflictos)
            cursor.execute("SELECT name, node_type FROM file_nodes WHERE id = %s", (target_node_id,))
            source_row = cursor.fetchone()
            if not source_row:
                return jsonify({"success": False, "error": "Source not found"}), 404
            
            s_name, s_type = source_row

            # 2. Validar si ya existe un nodo con ese nombre en el destino
            if new_parent_id:
                cursor.execute("""
                    SELECT id FROM file_nodes 
                    WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = %s AND is_deleted = FALSE
                """, (model_urn, new_parent_id, s_name, s_type))
            else:
                cursor.execute("""
                    SELECT id FROM file_nodes 
                    WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = %s AND is_deleted = FALSE
                """, (model_urn, s_name, s_type))
            
            if cursor.fetchone():
                return jsonify({"success": False, "error": f"Ya existe un {'archivo' if s_type == 'FILE' else 'folder'} llamado '{s_name}' en el destino."}), 409

            # 3. Actualizar el parent_id
            cursor.execute("""
                UPDATE file_nodes 
                SET parent_id = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND model_urn = %s AND is_deleted = FALSE
                RETURNING id, name
            """, (new_parent_id, target_node_id, model_urn))
            
            updated = cursor.fetchone()
            conn.commit()

        if updated:
            t_id, t_name = updated
            print(f"[MOVE] SUCCESS: Moved {t_name} (ID: {t_id}) to parent {new_parent_id}")
            log_activity(model_urn, 'move', 'file_or_folder',
                         entity_id=str(t_id),
                         entity_name=t_name, 
                         performed_by=performed_by,
                         details={'dest_parent_id': str(new_parent_id)})
            return jsonify({"success": True, "message": "Item moved successfully"}), 200

        return jsonify({"success": False, "error": "Failed to update database record"}), 500

    except Exception as e:
        print(f"[MOVE] CRITICAL ERROR: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/upload-url', methods=['POST'])
def get_upload_url():
    """Generates a Signed URL for direct-to-bucket client uploads."""
    data = request.get_json()
    if not data: return jsonify({"success": False, "error": "No data"}), 400
    model_urn = data.get('model_urn', 'global')
    filename = data.get('filename')
    content_type = data.get('contentType', 'application/octet-stream')
    
    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    rbac = check_folder_permission(user, None, model_urn, 'create_upload', 'obtener URL de subida')
    if rbac: return rbac

    import uuid
    gcs_urn = str(uuid.uuid4())
    from gcs_manager import generate_upload_url
    upload_url = generate_upload_url(gcs_urn, content_type=content_type)
    
    if upload_url:
        return jsonify({"success": True, "uploadUrl": upload_url, "gcs_urn": gcs_urn}), 200
    return jsonify({"success": False, "error": "Error generando URL"}), 500

@documents_bp.route('/api/docs/upload-confirm', methods=['POST'])
def confirm_upload():
    """Validates the uploaded file exists and creates the DB record for the item."""
    data = request.get_json()
    if not data: return jsonify({"success": False, "error": "No data"}), 400
    model_urn = data.get('model_urn', 'global')
    folder_path = data.get('path', '')
    filename = data.get('filename')
    gcs_urn = data.get('gcs_urn')
    size_bytes = data.get('size_bytes', 0)
    mime_type = data.get('mime_type', 'application/octet-stream')
    performed_by = data.get('user', None)

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
        
    from file_system_db import resolve_path_to_node_id
    parent_node_id = resolve_path_to_node_id(folder_path, model_urn, auto_create=False)
    rbac = check_folder_permission(user, parent_node_id, model_urn, 'create_upload', 'confirmar subidas')
    if rbac: return rbac

    if folder_path and not folder_path.endswith('/'):
        folder_path += '/'

    try:
        from file_system_db import create_file_record, resolve_path_to_node_id
        from db import log_activity

        parent_id = resolve_path_to_node_id(folder_path, model_urn, created_by=performed_by) if folder_path else None
        create_file_record(model_urn, parent_id, filename, size_bytes, gcs_urn, mime_type=mime_type, created_by=performed_by)

        node_path = (folder_path + filename) if folder_path else filename
        log_activity(model_urn, 'upload_file', 'file',
                     entity_name=node_path, performed_by=performed_by)

        return jsonify({"success": True, "message": "File record created"}), 201
    except Exception as e:
        print(f"[Upload Confirm] Error: {e}")
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

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    
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
    """Operaciones masivas: cambio de estado ISO 19650 o eliminación de múltiples items."""
    data = request.get_json()
    if not data or 'items' not in data or 'action' not in data:
        return jsonify({"success": False, "error": "Missing items or action"}), 400

    items = data['items'] # Lista de IDs (UUIDs)
    action = data['action'] # 'SET_STATUS' | 'DELETE'
    new_status = data.get('status')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    # ── TENANT ISOLATION ──
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
        
    req_node_id = items[0] if items else None
    rbac = check_folder_permission(user, req_node_id, model_urn, 'edit', 'modificar documentos')
    if rbac: return rbac

    if not items:
        return jsonify({"success": True, "message": "No items to process"}), 200

    # ── ISO 19650 STATUS ENGINE ──────────────────────────────────────────
    VALID_STATUSES = {'WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED'}
    VALID_TRANSITIONS = {
        'WIP':       {'SHARED'},              # Borrador → Compartido
        'SHARED':    {'WIP', 'PUBLISHED'},     # Compartido → Publicado o devolver a WIP
        'PUBLISHED': {'SHARED', 'ARCHIVED'},   # Publicado → Archivar o devolver a SHARED
        'ARCHIVED':  {'PUBLISHED'},            # Archivo → Re-publicar (recuperar)
    }

    try:
        from db import get_db_connection, log_activity
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            if action == 'SET_STATUS' and new_status:
                if new_status not in VALID_STATUSES:
                    return jsonify({"success": False, "error": f"Estado inválido: {new_status}. Válidos: {', '.join(VALID_STATUSES)}"}), 400
                # ── RBAC: Solo admin puede aprobar a PUBLISHED o ARCHIVED ──
                if new_status in ('PUBLISHED', 'ARCHIVED'):
                    rbac_pub = check_folder_permission(user, req_node_id, model_urn, 'admin', f'aprobar documentos como {new_status}')
                    if rbac_pub: return rbac_pub

                # Validar transiciones para cada item
                cursor.execute("""
                    SELECT id, status FROM file_nodes 
                    WHERE id = ANY(%s) AND model_urn = %s
                """, (items, model_urn))
                current_items = cursor.fetchall()
                
                ERROR_MSGS = {
                    ('WIP', 'PUBLISHED'): "No se puede publicar un documento que no ha pasado por el estado SHARED.",
                    ('WIP', 'ARCHIVED'): "No se puede archivar un documento directamente desde estado WIP (Borrador).",
                    ('SHARED', 'ARCHIVED'): "Un documento debe ser PUBLICADO antes de poder ser archivado.",
                    ('PUBLISHED', 'WIP'): "Un documento publicado no puede volver a ser borrador. Envíelo a SHARED primero.",
                    ('ARCHIVED', 'SHARED'): "Un documento archivado solo puede volver a estado PUBLISHED.",
                    ('ARCHIVED', 'WIP'): "Un documento archivado no puede volver a Borrador de forma directa."
                }
                
                valid_ids = []
                for item_id, current_status in current_items:
                    current = current_status or 'WIP'  # Default para items sin status
                    allowed =VALID_TRANSITIONS.get(current, set())
                    if new_status == current:
                        continue  # Ya tiene ese estado, skip silencioso
                        
                    if new_status not in allowed:
                        msg = ERROR_MSGS.get((current, new_status), f"Transición no permitida: de {current} a {new_status}.")
                        return jsonify({"success": False, "error": msg}), 400
                    
                    valid_ids.append(str(item_id))

                if valid_ids:
                    cursor.execute("""
                        UPDATE file_nodes 
                        SET status = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ANY(%s) AND model_urn = %s
                    """, (new_status, valid_ids, model_urn))
                
                log_activity(model_urn, 'batch_status', 'multiple', 
                             entity_name=f"{len(valid_ids)} items", 
                             performed_by=performed_by,
                             details={
                                 'new_status': new_status, 
                                 'processed': len(valid_ids)
                             })

            elif action == 'DELETE':
                # Soft delete masivo
                cursor.execute("""
                    UPDATE file_nodes 
                    SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ANY(%s::uuid[]) AND model_urn = %s
                """, (items, model_urn))
                
                log_activity(model_urn, 'batch_delete', 'multiple', 
                             entity_name=f"{len(items)} items", 
                             performed_by=performed_by,
                             details={'item_count': len(items)})
            
            conn.commit()
            
        return jsonify({"success": True, "processed": len(items)}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/description', methods=['POST', 'PUT'])
def update_node_description_route():
    """Actualiza la descripción de un archivo o carpeta en PostgreSQL."""
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    # Soporta 'id' (legacy/PUT) o 'node_id' (new/POST)
    node_id = data.get('node_id') or data.get('id')
    description = data.get('description')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user', None)

    if not node_id:
        return jsonify({"success": False, "error": "node_id or id is required"}), 400

    try:
        from db import get_db_connection, log_activity
        # Cast to int if possible
        try:
            node_id = int(node_id)
        except: pass

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE file_nodes 
                SET description = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND model_urn = %s AND is_deleted = FALSE
                RETURNING name
            """, (description, node_id, model_urn))
            row = cursor.fetchone()
            conn.commit()

        if row:
            from db import log_activity
            log_activity(model_urn, 'update_description', 'file_or_folder',
                         entity_id=str(node_id),
                         entity_name=row[0],
                         performed_by=performed_by,
                         details={'description': description})
            return jsonify({"success": True, "message": "Description updated"}), 200

        return jsonify({"success": False, "error": "Item not found"}), 404

    except Exception as e:
        print(f"[DESCRIPTION UPDATE] Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@documents_bp.route('/api/docs/search', methods=['POST'])
def search_docs():
    """Búsqueda global por nombre o descripción."""
    data = request.get_json()
    model_urn = str(data.get('model_urn', 'global'))
    query = data.get('query', '')
    
    if not query:
        return jsonify([])
        
    try:
        from file_system_db import search_nodes
        results = search_nodes(model_urn, query)
        return jsonify(results)
    except Exception as e:
        print(f"[SEARCH ERROR] {e}")
        return jsonify({"error": str(e)}), 500

@documents_bp.route('/api/docs/deleted', methods=['GET'])
def get_deleted_docs():
    """Lista todos los elementos en la papelera del proyecto."""
    model_urn = request.args.get('model_urn', 'global')
    try:
        from file_system_db import list_deleted_contents
        results = list_deleted_contents(model_urn)
        folders = [r for r in results if r.get('node_type') == 'FOLDER']
        files = [r for r in results if r.get('node_type') == 'FILE']
        return jsonify({"success": True, "data": {"folders": folders, "files": files}}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/restore', methods=['POST'])
def restore_doc():
    """Restaura un elemento de la papelera."""
    data = request.get_json()
    node_id = data.get('id')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user')

    if not node_id:
        return jsonify({"success": False, "error": "Missing ID"}), 400

    try:
        from file_system_db import restore_node
        from db import log_activity
        success = restore_node(model_urn, node_id)
        if success:
            log_activity(model_urn, 'restore', 'file_or_folder', 
                         entity_id=node_id, performed_by=performed_by)
            return jsonify({"success": True, "message": "Elemento restaurado"}), 200
        return jsonify({"success": False, "error": "No se pudo restaurar"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/permanent-delete', methods=['DELETE'])
def permanent_delete_doc():
    """Borra físicamente de GCS y de la BD."""
    data = request.get_json()
    node_id = data.get('id')
    model_urn = data.get('model_urn', 'global')
    performed_by = data.get('user')

    if not node_id:
        return jsonify({"success": False, "error": "Missing ID"}), 400

    try:
        from file_system_db import permanent_delete_node_internal
        from db import log_activity
        # Necesitamos el nombre antes de borrarlo para el log
        from db import get_db_connection
        name = "Unknown"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (node_id,))
            row = cursor.fetchone()
            if row: name = row[0]

        success = permanent_delete_node_internal(model_urn, node_id)
        if success:
            log_activity(model_urn, 'permanent_delete', 'file_or_folder', 
                         entity_id=node_id, entity_name=name, performed_by=performed_by)
            return jsonify({"success": True, "message": "Elemento eliminado permanentemente"}), 200
        return jsonify({"success": False, "error": "No se pudo eliminar"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────
# SHARE ENGINE ENDPOINTS (EXTERNAL FIELD ACCESS)
# ─────────────────────────────────────────────────────────────────

@documents_bp.route('/api/docs/share', methods=['POST'])
def share_document():
    """Generates a secure UUID link for a document."""
    data = request.get_json()
    node_id = data.get('node_id')
    model_urn = data.get('model_urn')
    shared_by = data.get('shared_by', 'system')
    role = data.get('role', 'viewer')
    access_type = data.get('access_type', 'restricted')
    
    if not node_id or not model_urn:
        return jsonify({"success": False, "error": "Missing node_id or model_urn"}), 400
        
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO document_shares (file_node_id, model_urn, shared_by, role, access_type)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (node_id, model_urn, shared_by, role, access_type))
            share_id = cursor.fetchone()[0]
            conn.commit()
            return jsonify({"success": True, "share_id": str(share_id)}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/shared/<share_id>', methods=['GET'])
def get_shared_document(share_id):
    """Retrieves a shared document metadata and a temporary signed URL for public viewing."""
    try:
        from db import get_db_connection
        from gcs_manager import generate_signed_url
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.role, s.access_type, f.name, f.gcs_urn, f.size_bytes, f.mime_type
                FROM document_shares s
                JOIN file_nodes f ON s.file_node_id = f.id
                WHERE s.id = %s
            """, (share_id,))
            row = cursor.fetchone()
            
            if not row:
                return jsonify({"success": False, "error": "Enlace inválido o expirado"}), 404
                
            role, access_type, name, gcs_urn, size, mime = row
            
            if not gcs_urn:
                return jsonify({"success": False, "error": "El archivo físico no existe"}), 404
                
            signed_url = generate_signed_url(gcs_urn)
            
            return jsonify({
                "success": True, 
                "data": {
                    "name": name,
                    "url": signed_url,
                    "role": role,
                    "access_type": access_type,
                    "size": size,
                    "mime_type": mime
                }
            }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── ENDPOINTS DE CONTROL DE PERMISOS (Fase 3 ISO 19650) ─────────────────

@documents_bp.route('/api/docs/folder-permissions', methods=['GET'])
def get_folder_permissions_endpoint():
    """Lista todos los permisos asignados explícitamente a una carpeta."""
    folder_id = request.args.get('folder_id')
    model_urn = request.args.get('model_urn', 'global')
    
    if not folder_id:
        return jsonify({"success": False, "error": "Falta folder_id"}), 400
        
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso al proyecto."}), 403
        
    # Solo administradores pueden ver la tabla de permisos
    from folder_permissions import check_folder_permission, list_folder_permissions
    rbac = check_folder_permission(user, folder_id, model_urn, 'admin', 'ver permisos')
    if rbac: return rbac
    
    try:
        perms = list_folder_permissions(folder_id)
        return jsonify({"success": True, "permissions": perms}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/folder-permissions', methods=['POST'])
def set_folder_permission_endpoint():
    """Añade o modifica el nivel de permiso de un usuario en una carpeta."""
    data = request.get_json()
    if not data: return jsonify({"success": False, "error": "No data"}), 400
    
    folder_id = data.get('folder_id')
    user_email = data.get('user_email')
    permission_level = data.get('permission_level')
    model_urn = data.get('model_urn', 'global')
    
    if not folder_id or not user_email or not permission_level:
        return jsonify({"success": False, "error": "Faltan parámetros (folder_id, user_email, permission_level)"}), 400
        
    from flask import g
    current_user = getattr(g, 'current_user', None)
    if current_user and not verify_project_access(current_user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso al proyecto."}), 403
        
    from folder_permissions import check_folder_permission, set_folder_permission
    rbac = check_folder_permission(current_user, folder_id, model_urn, 'admin', 'modificar permisos')
    if rbac: return rbac
    
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = %s", (user_email,))
            row = cursor.fetchone()
            if not row:
                return jsonify({"success": False, "error": f"Usuario no encontrado: {user_email}"}), 404
            target_user_id = row[0]
            
        granted_by = current_user.get('id') if current_user else None
        set_folder_permission(folder_id, target_user_id, permission_level, granted_by, model_urn)
        
        return jsonify({"success": True, "message": "Permisos actualizados correctamente."}), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/folder-permissions', methods=['DELETE'])
def remove_folder_permission_endpoint():
    """Elimina un permiso asignado de la tabla de permisos de una carpeta."""
    data = request.get_json()
    if not data: return jsonify({"success": False, "error": "No data"}), 400
    
    perm_id = data.get('permission_id')
    folder_id = data.get('folder_id') # Necesario para chequear admin
    model_urn = data.get('model_urn', 'global')
    
    if not perm_id or not folder_id:
        return jsonify({"success": False, "error": "Faltan parámetros (permission_id, folder_id)"}), 400
        
    from flask import g
    user = getattr(g, 'current_user', None)
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso al proyecto."}), 403
        
    from folder_permissions import check_folder_permission, remove_folder_permission
    rbac = check_folder_permission(user, folder_id, model_urn, 'admin', 'eliminar permisos')
    if rbac: return rbac
    
    try:
        success = remove_folder_permission(perm_id)
        if success:
            return jsonify({"success": True, "message": "Permiso eliminado correctamente."}), 200
        else:
            return jsonify({"success": False, "error": "Permiso no encontrado."}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/api/docs/download_folder_urls', methods=['GET'])
def download_folder_urls():
    """Descarga asíncrona (Túnel OSS): Devuelve URLs firmadas para que el cliente zipee."""
    folder_id = request.args.get('folder_id')
    model_urn = request.args.get('model_urn', 'global')
    
    if not folder_id:
        return jsonify({"success": False, "error": "Falta folder_id"}), 400
        
    from flask import g, jsonify
    user = getattr(g, 'current_user', None)
    
    # 1. Chequear permisos (mínimo view_download)
    from folder_permissions import check_folder_permission
    rbac = check_folder_permission(user, folder_id, model_urn, 'view_download', 'descargar_carpeta')
    if rbac: return rbac
    
    from db import get_db_connection
    from gcs_manager import generate_signed_url
    
    # 2. CTE recursivo para obtener todos los archivos de la carpeta
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            WITH RECURSIVE folder_tree AS (
                SELECT id, name, parent_id, node_type, gcs_urn, CAST(name AS TEXT) as path
                FROM file_nodes
                WHERE id = %s AND is_deleted = FALSE
                
                UNION ALL
                
                SELECT fn.id, fn.name, fn.parent_id, fn.node_type, fn.gcs_urn, CAST(ft.path || '/' || fn.name AS TEXT)
                FROM file_nodes fn
                JOIN folder_tree ft ON fn.parent_id = ft.id
                WHERE fn.is_deleted = FALSE
            )
            SELECT name, gcs_urn, path FROM folder_tree WHERE node_type = 'FILE'
        """
        cursor.execute(query, (folder_id,))
        files = cursor.fetchall()
        
    manifest = []
    if files:
        for r_name, r_gcs_urn, r_path in files:
            if not r_gcs_urn: continue
            # Limpiar el path para que la raiz sea la primer carpeta resolviendo correctamente anidacion
            clean_path = r_path.split('/', 1)[-1] if '/' in r_path else r_path
            
            # Túnel OSS: Generar Signed URL de corta duración para descarga paralela local
            try:
                signed_url = generate_signed_url(r_gcs_urn)
                if signed_url:
                    manifest.append({
                        "path": clean_path,
                        "url": signed_url
                    })
            except Exception as e:
                print(f"[TUNNEL] Error firmando {r_gcs_urn}: {e}")
                
    return jsonify({"success": True, "manifest": manifest}), 200

@documents_bp.route('/api/docs/force-init-permissions', methods=['GET'])
def force_init_permissions():
    """Endpoint temporal para forzar la creación de la tabla usando el pool activo."""
    from folder_permissions import init_folder_permissions_table
    try:
        init_folder_permissions_table()
        return jsonify({"success": True, "message": "Tabla creada exitosamente."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@documents_bp.route('/api/docs/quarantine', methods=['GET'])
def get_quarantine_files():
    "\"\"
    [ISO 19650 Holding Area]
    Extrae estrictamente los archivos retenidos por fallar la validaci�n 
    de nomenclatura (NON_CONFORMING) para ser curados con un renombramiento masivo.
    El Auth Middleware asume la autenticaci�n autom�ticamente para todas las rutas /api/.
    \"\""
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({'error': 'Falta model_urn'}), 400

    from db import get_db_connection

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Buscar archivos NON_CONFORMING limitados por el proyecto / modelo
            cursor.execute("\"\"
                SELECT 
                    id, name, status, size_bytes, mime_type, updated_at, updated_by
                FROM file_nodes
                WHERE model_urn = %s 
                  AND status = 'NON_CONFORMING' 
                  AND is_deleted = false
                ORDER BY updated_at DESC
            \"\"", (model_urn,))
            
            columns = [desc[0] for desc in cursor.description]
            quarantine_records = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return jsonify({
            'success': True,
            'count': len(quarantine_records),
            'files': quarantine_records
        })

    except Exception as e:
        print("Error al acceder al Holding Area:", e)
        return jsonify({'error': str(e)}), 500

