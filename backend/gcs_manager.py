import os
from google.cloud import storage
import datetime

def get_storage_client():
    """Inicializa y retorna el cliente de GCS usando las credenciales del entorno."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    
    if creds_path and not os.path.isabs(creds_path):
        # Intentar resolver relativo al CWD
        if os.path.exists(creds_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(creds_path)
        else:
            # Intentar relativo al directorio del backend
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            alt_path = os.path.join(backend_dir, os.path.basename(creds_path))
            if os.path.exists(alt_path):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = alt_path
            else:
                # Intentar relativo a la raíz del proyecto (un nivel arriba de backend/)
                project_root = os.path.dirname(backend_dir)
                root_path = os.path.join(project_root, creds_path)
                if os.path.exists(root_path):
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(root_path)
    
    return storage.Client()

def upload_file_to_gcs(file_object, destination_blob_name):
    """Sube un binario (foto/documento) al bucket de GCS usando streaming (no carga todo a RAM)."""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        if not bucket_name or bucket_name == "TU_BUCKET_AQUI":
            raise ValueError("GCS_BUCKET_NAME no esta configurado correctamente en el .env")
        
        print(f"[GCS] Initializing upload for {destination_blob_name} to bucket {bucket_name}")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(destination_blob_name)
        
        # Checking metadata for ACC Style Versioning
        if blob.exists():
            blob.reload()
            current_v = int(blob.metadata.get("version", 1)) if blob.metadata and "version" in blob.metadata else 1
            new_version = current_v + 1
        else:
            new_version = 1
            
        # ── STREAMING UPLOAD: No carga todo a RAM ──────────────────────────
        # upload_from_file() transmite el contenido directamente al bucket
        # sin leer todo el archivo en memoria. Soporta reintentos automáticos.
        content_type = getattr(file_object, 'content_type', 'application/octet-stream')
        file_object.seek(0)
        
        print(f"[GCS] Starting streaming transfer... (version {new_version})")
        blob.upload_from_file(
            file_object,
            content_type=content_type,
            timeout=300,
            num_retries=3    # Reintentos automáticos en fallos transitorios
        )
        print(f"[GCS] Transfer complete.")
        
        # Patch the metadata to store version
        blob.metadata = {"version": str(new_version)}
        blob.patch()
        
        return generate_signed_url(destination_blob_name)

    except Exception as e:
        print(f"[GCS] CRITICAL ERROR during upload: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def generate_upload_url(blob_name, content_type=None, expiration_minutes=60):
    """Genera una URL firmada para permitir la subida directa (PUT) desde el navegador."""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="PUT",
            content_type=content_type
        )
        return url
    except Exception as e:
        print(f"Error generando signed upload url: {str(e)}")
        return None


# Mapa de extensiones → Content-Type para signed URLs
_CONTENT_TYPE_MAP = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
}

def generate_signed_url(blob_name, expiration_minutes=60*24):
    """Genera una URL temporal segura para ver la imagen/documento inline."""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        # Determinar Content-Type correcto basado en la extensión
        ext = os.path.splitext(blob_name.lower())[1]
        content_type = _CONTENT_TYPE_MAP.get(ext)
        
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="GET",
            response_disposition="inline",
            response_type=content_type
        )
        return url
    except Exception as e:
        print(f"Error generando signed url: {str(e)}")
        return None

def get_blob_data(blob_name):
    """Descarga el contenido de un blob y su tipo MIME."""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        if not blob.exists():
            return None, None
        blob.reload()
        return blob.download_as_bytes(), blob.content_type
    except Exception as e:
        print(f"Error obteniendo data de GCS: {str(e)}")
        return None, None

def list_gcs_contents(prefix=""):
    """
    Simula un sistema de directorios. Retorna archivos y subcarpetas (prefixes)
    en el nivel actual especificado por el prefix.
    """
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        # delimitador es clave para que no traiga TODOS los archivos internos, solo el nivel actual
        blobs = client.list_blobs(bucket_name, prefix=prefix, delimiter='/')
        
        folders = []
        files = []
        
        for blob in blobs:
            # Archivo normal o carpeta simulada que termina en / y tiene 0 bytes
            if blob.name == prefix:
                continue # Evitar enumerarse a si mismo si es una carpeta explicita
                
            version = f"V{blob.metadata.get('version', '1')}" if blob.metadata and "version" in blob.metadata else "V1"
            
            try:
                signed_url = blob.generate_signed_url(
                    version="v4", 
                    expiration=datetime.timedelta(minutes=1440), 
                    method="GET", 
                    response_disposition="inline"
                )
            except Exception:
                signed_url = blob.public_url
                
            files.append({
                "name": blob.name.replace(prefix, ""),
                "fullName": blob.name,
                "size": blob.size,
                "version": version,
                "updated": blob.updated.isoformat() if blob.updated else None,
                "mediaLink": signed_url
            })
            
        # Al iterar los blobs, list_blobs junta los prefijos comunes en 'prefixes' (carpetas reales)
        if blobs.prefixes:
            for p in blobs.prefixes:
                folders.append({
                    "name": p.replace(prefix, ""),
                    "fullName": p
                })
                
        return {"folders": folders, "files": files}
    except Exception as e:
        print(f"Error listando GCS: {str(e)}")
        return {"folders": [], "files": [], "error": str(e)}

def create_gcs_folder(folder_path):
    """
    GCS no tiene carpetas. Subimos un objeto de 0 bytes que termine en /
    """
    try:
        if not folder_path.endswith('/'):
            folder_path += '/'
            
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(folder_path)
        blob.upload_from_string('') # Vacio
        return True
    except Exception as e:
        print(f"Error creando carpeta GCS: {str(e)}")
        return False

def delete_gcs_blob(blob_name):
    """Borra un objeto (si termina en / borrara la simulacion de carpeta, no su contenido)"""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        
        if blob_name.endswith('/'):
            # It's a folder, delete everything inside
            blobs = list(bucket.list_blobs(prefix=blob_name))
            for b in blobs:
                b.delete()
        else:
            blob = bucket.blob(blob_name)
            blob.delete()
        return True
    except Exception as e:
        print(f"Error borrando de GCS: {str(e)}")
        return False

def rename_gcs_blob(old_name, new_name):
    """Renombra archivo o simulacion de carpeta entera en GCS"""
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        
        if old_name.endswith('/'):
            # Asegurar que new_name tambien sea carpeta
            if not new_name.endswith('/'): new_name += '/'
            blobs = list(bucket.list_blobs(prefix=old_name))
            for blob in blobs:
                new_blob_name = blob.name.replace(old_name, new_name, 1)
                bucket.copy_blob(blob, bucket, new_blob_name)
                blob.delete()
        else:
            blob = bucket.blob(old_name)
            bucket.rename_blob(blob, new_name)
            
        return True
    except Exception as e:
        print(f"Error renombrando en GCS: {str(e)}")
        return False

