"""
Resumable Chunked Uploads — Backend Blueprint
==============================================
Implements GCS-native resumable upload protocol for files of any size.

Endpoints:
  POST   /api/uploads/init       — Validate + start GCS resumable session
  GET    /api/uploads/status/<id> — Query upload progress
  POST   /api/uploads/complete   — Confirm upload + create file_node
  DELETE /api/uploads/<id>       — Cancel and cleanup
  GET    /api/uploads/pending    — List active sessions for current user
"""

import os
import uuid
import time
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename

uploads_bp = Blueprint('uploads', __name__)

# ── Constants ──
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB (Google recommended)


def _get_user():
    return getattr(g, 'current_user', None)


def _get_auth_headers():
    """Get session token from request for permission checks."""
    return request.headers.get('Authorization', '')


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 1: INIT — Validate + Start Resumable Session
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/init', methods=['POST'])
def init_upload():
    """
    Validates file metadata and initiates a GCS resumable upload session.
    Returns session URI for direct browser-to-GCS chunked uploads.
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    filename = data.get('filename', '')
    size_bytes = data.get('size_bytes', 0)
    mime_type = data.get('mime_type', 'application/octet-stream')
    folder_path = data.get('folder_path', '')
    model_urn = data.get('model_urn', 'global')

    if not filename or size_bytes <= 0:
        return jsonify({"success": False, "error": "filename and size_bytes are required"}), 400

    user = _get_user()

    # ── TENANT ISOLATION ──
    from routes.documents import verify_project_access
    if user and not verify_project_access(user.get('id'), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403

    # ── RBAC CHECK ──
    from folder_permissions import check_folder_permission
    from file_system_db import resolve_path_to_node_id
    parent_node_id = resolve_path_to_node_id(folder_path, model_urn, auto_create=False) if folder_path else None
    rbac = check_folder_permission(user, parent_node_id, model_urn, 'create_upload', 'subir archivos')
    if rbac:
        return rbac

    # ── PRE-UPLOAD VALIDATIONS (ACC-Style) ──
    safe_name = secure_filename(filename)
    if not safe_name:
        return jsonify({"success": False, "error": "Nombre de archivo inválido", "code": "INVALID_NAME"}), 422

    # 1. Naming validation (ASCII strict)
    from folder_validators import validate_naming, _get_project_settings
    from db import get_db_connection
    with get_db_connection() as conn:
        cursor = conn.cursor()
        settings = _get_project_settings(cursor, model_urn)

    name_only = os.path.splitext(safe_name)[0]
    name_check = validate_naming(name_only, settings)
    if not name_check['valid']:
        return jsonify({"success": False, "error": name_check['message'], "code": name_check['code']}), 422

    # 2. Extension validation
    from file_validator import BLOCKED_EXTENSIONS, ALLOWED_TYPES
    ext = os.path.splitext(safe_name.lower())[1]
    if ext in BLOCKED_EXTENSIONS:
        return jsonify({
            "success": False,
            "error": f"Extensión '{ext}' no permitida por seguridad.",
            "code": "BLOCKED_EXTENSION"
        }), 422

    # 3. Size validation per type
    allowed_config = None
    for mime_key, config in ALLOWED_TYPES.items():
        if ext in config['extensions']:
            allowed_config = config
            break
    if not allowed_config:
        # Fallback: check by declared MIME
        allowed_config = ALLOWED_TYPES.get(mime_type)
    
    if allowed_config:
        max_bytes = allowed_config.get('max_mb', 1000) * 1024 * 1024
        if size_bytes > max_bytes:
            max_mb = allowed_config['max_mb']
            size_mb = round(size_bytes / (1024 * 1024), 1)
            return jsonify({
                "success": False,
                "error": f"Archivo demasiado grande: {size_mb} MB. Límite para {ext}: {max_mb} MB.",
                "code": "FILE_TOO_LARGE"
            }), 422

    # 4. Storage quota validation
    from folder_validators import validate_storage_quota
    with get_db_connection() as conn:
        cursor = conn.cursor()
        quota_check = validate_storage_quota(cursor, model_urn, settings)
    if not quota_check['valid']:
        return jsonify({"success": False, "error": quota_check['message'], "code": quota_check['code']}), 422

    # ── INITIATE GCS RESUMABLE SESSION ──
    try:
        from gcs_manager import get_storage_client
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        if not bucket_name or bucket_name == "TU_BUCKET_AQUI":
            return jsonify({"success": False, "error": "GCS_BUCKET_NAME not configured"}), 500

        gcs_urn = f"multi-tenant/{model_urn}/{int(time.time())}_{uuid.uuid4().hex[:8]}_{safe_name}"

        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(gcs_urn)

        # Create resumable upload session — returns a URI valid for 7 days
        session_uri = blob.create_resumable_upload_session(
            content_type=mime_type,
            size=size_bytes,
            origin=request.headers.get('Origin', '*'),
            timeout=300
        )

        # ── PERSIST SESSION IN DB ──
        performed_by = data.get('user') or (user.get('name') if user else None)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO upload_sessions 
                    (model_urn, filename, size_bytes, mime_type, gcs_urn, 
                     session_uri, folder_path, parent_node_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                model_urn, safe_name, size_bytes, mime_type, gcs_urn,
                session_uri, folder_path, str(parent_node_id) if parent_node_id else None,
                performed_by
            ))
            upload_id = str(cursor.fetchone()[0])
            conn.commit()

        print(f"[Uploads] Session created: {upload_id} for {safe_name} ({size_bytes} bytes)")

        return jsonify({
            "success": True,
            "uploadId": upload_id,
            "sessionUri": session_uri,
            "gcsUrn": gcs_urn,
            "chunkSize": CHUNK_SIZE,
            "filename": safe_name
        }), 200

    except Exception as e:
        print(f"[Uploads] Error initializing resumable session: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 2: STATUS — Query Upload Progress
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/status/<upload_id>', methods=['GET'])
def get_upload_status(upload_id):
    """
    Returns the current state of an upload session.
    Queries GCS to determine how many bytes have been received.
    """
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, filename, size_bytes, session_uri, bytes_uploaded, 
                       status, gcs_urn, created_at, folder_path, mime_type
                FROM upload_sessions 
                WHERE id = %s
            """, (upload_id,))
            row = cursor.fetchone()

        if not row:
            return jsonify({"success": False, "error": "Session not found"}), 404

        return jsonify({
            "success": True,
            "uploadId": str(row[0]),
            "filename": row[1],
            "sizeBytes": row[2],
            "sessionUri": row[3],
            "bytesUploaded": row[4],
            "status": row[5],
            "gcsUrn": row[6],
            "createdAt": row[7].isoformat() if row[7] else None,
            "folderPath": row[8],
            "mimeType": row[9],
            "chunkSize": CHUNK_SIZE
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 3: COMPLETE — Confirm Upload + Create file_node
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/complete', methods=['POST'])
def complete_upload():
    """
    Called after all chunks are uploaded to GCS.
    Creates the file_node record in PostgreSQL and closes the session.
    """
    data = request.get_json()
    upload_id = data.get('uploadId')
    if not upload_id:
        return jsonify({"success": False, "error": "uploadId is required"}), 400

    from db import get_db_connection, log_activity
    from file_system_db import resolve_path_to_node_id, create_file_record

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, model_urn, filename, size_bytes, gcs_urn, 
                       folder_path, created_by, status, mime_type, parent_node_id
                FROM upload_sessions 
                WHERE id = %s
            """, (upload_id,))
            session = cursor.fetchone()

        if not session:
            return jsonify({"success": False, "error": "Session not found"}), 404

        s_id, model_urn, filename, size_bytes, gcs_urn, \
            folder_path, created_by, status, mime_type, parent_node_id = session

        if status == 'completed':
            return jsonify({"success": True, "message": "Already completed"}), 200
        if status in ('cancelled', 'expired'):
            return jsonify({"success": False, "error": f"Session is {status}"}), 400

        # Resolve parent folder
        if folder_path:
            if not folder_path.endswith('/'):
                folder_path += '/'
            parent_id = resolve_path_to_node_id(folder_path, model_urn, created_by=created_by)
        else:
            parent_id = parent_node_id

        # Create file record in DB
        node_id, version_num = create_file_record(
            model_urn, parent_id, filename,
            size_bytes, gcs_urn,
            mime_type=mime_type,
            created_by=created_by
        )

        # Mark session as completed
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE upload_sessions 
                SET status = 'completed', bytes_uploaded = size_bytes
                WHERE id = %s
            """, (upload_id,))
            conn.commit()

        # Audit log
        node_path = (folder_path + filename) if folder_path else filename
        log_activity(
            model_urn, 'upload_file', 'file',
            entity_name=node_path,
            performed_by=created_by,
            details={
                'size_mb': round(size_bytes / (1024 * 1024), 2),
                'mime_type': mime_type,
                'gcs_urn': gcs_urn,
                'method': 'chunked_resumable',
                'version': version_num
            }
        )

        print(f"[Uploads] Completed: {upload_id} — {filename} V{version_num} ({size_bytes} bytes)")

        return jsonify({
            "success": True,
            "message": f"File '{filename}' uploaded successfully",
            "filename": filename,
            "gcsUrn": gcs_urn,
            "node_id": node_id,
            "version": version_num
        }), 201

    except Exception as e:
        print(f"[Uploads] Error completing upload {upload_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 4: CANCEL — Abort and Cleanup
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/<upload_id>', methods=['DELETE'])
def cancel_upload(upload_id):
    """Cancel an active upload session and clean up GCS partial blob."""
    from db import get_db_connection
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT gcs_urn, status FROM upload_sessions WHERE id = %s
            """, (upload_id,))
            row = cursor.fetchone()

        if not row:
            return jsonify({"success": False, "error": "Session not found"}), 404

        gcs_urn, status = row
        if status in ('completed', 'cancelled'):
            return jsonify({"success": True, "message": f"Already {status}"}), 200

        # Try to delete partial blob from GCS
        try:
            from gcs_manager import delete_gcs_blob
            delete_gcs_blob(gcs_urn)
        except Exception as cleanup_err:
            print(f"[Uploads] Warning: Could not delete partial blob {gcs_urn}: {cleanup_err}")

        # Mark session as cancelled
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE upload_sessions SET status = 'cancelled' WHERE id = %s
            """, (upload_id,))
            conn.commit()

        print(f"[Uploads] Cancelled: {upload_id}")
        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 5: PENDING — List Active Sessions for Current User
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/pending', methods=['GET'])
def get_pending_uploads():
    """
    Returns active (incomplete) upload sessions for the current user.
    Used to show the "resume pending uploads" banner on page reload.
    """
    user = _get_user()
    user_name = user.get('name') if user else request.args.get('user')
    model_urn = request.args.get('model_urn', 'global')

    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, filename, size_bytes, bytes_uploaded, session_uri,
                       folder_path, created_at, gcs_urn, mime_type
                FROM upload_sessions
                WHERE created_by = %s
                  AND model_urn = %s
                  AND status = 'active'
                  AND expires_at > CURRENT_TIMESTAMP
                ORDER BY created_at DESC
            """, (user_name, model_urn))
            rows = cursor.fetchall()

        sessions = [{
            'uploadId': str(r[0]),
            'filename': r[1],
            'sizeBytes': r[2],
            'bytesUploaded': r[3],
            'sessionUri': r[4],
            'folderPath': r[5],
            'createdAt': r[6].isoformat() if r[6] else None,
            'gcsUrn': r[7],
            'mimeType': r[8],
            'chunkSize': CHUNK_SIZE,
            'progress': round((r[3] / r[2]) * 100, 1) if r[2] > 0 else 0
        } for r in rows]

        return jsonify({"success": True, "sessions": sessions}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 6: UPDATE PROGRESS — Track bytes uploaded
# ═══════════════════════════════════════════════════════════════
@uploads_bp.route('/api/uploads/progress', methods=['POST'])
def update_progress():
    """Update bytes_uploaded for a session (called periodically by frontend)."""
    data = request.get_json()
    upload_id = data.get('uploadId')
    bytes_uploaded = data.get('bytesUploaded', 0)

    if not upload_id:
        return jsonify({"success": False}), 400

    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE upload_sessions 
                SET bytes_uploaded = %s 
                WHERE id = %s AND status = 'active'
            """, (bytes_uploaded, upload_id))
            conn.commit()
        return jsonify({"success": True}), 200
    except Exception:
        return jsonify({"success": False}), 500
