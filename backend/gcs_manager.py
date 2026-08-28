import os
import threading
from google.cloud import storage
import datetime

# EL CLIENTE SE CONSTRUYE UNA VEZ, NO UNA POR FIRMA.
#
# Cada `storage.Client()` llama DOS veces a `google.auth.default()`, y cada una
# relee el JSON de la cuenta de servicio del disco y REPARSEA la clave privada
# RSA. Medido con las librerias de este repositorio: 72,8 ms por cliente, de los
# cuales el 98% se va en `load_pem_private_key`.
#
# Listar una carpeta firma una URL POR DOCUMENTO, asi que abrir una carpeta de 49
# planos costaba 98 parseos de clave RSA -- 3,5 s en un escritorio, y sobre la
# decima de CPU del plan gratuito, cerca de un MINUTO. Eso es lo que el
# propietario media mirando un spinner.
#
# Reutilizarlo baja el coste por documento de 72,8 ms a 0,4 ms: 180 veces menos.
# El cliente es seguro de compartir entre hilos (la libreria lo documenta asi) y
# el candado solo protege la CONSTRUCCION, para que varios hilos no lo creen a la
# vez en el arranque.
_cliente = None
_candado_cliente = threading.Lock()


def get_storage_client():
    """El cliente de GCS, construido una sola vez por proceso."""
    global _cliente
    if _cliente is not None:
        return _cliente
    with _candado_cliente:
        if _cliente is None:
            _cliente = _construir_cliente()
    return _cliente


def _construir_cliente():
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
        # Compat SDK: las versiones nuevas de google-cloud-storage QUITARON el
        # kwarg 'num_retries' (rompía TODOS los uploads con TypeError). Ahora los
        # reintentos se pasan vía 'retry'. Intentamos la firma moderna y caemos
        # a la básica si el SDK es aún más nuevo/viejo.
        try:
            from google.cloud.storage.retry import DEFAULT_RETRY
            blob.upload_from_file(
                file_object,
                content_type=content_type,
                timeout=300,
                retry=DEFAULT_RETRY,
            )
        except TypeError:
            file_object.seek(0)
            blob.upload_from_file(file_object, content_type=content_type, timeout=300)
        except ImportError:
            blob.upload_from_file(file_object, content_type=content_type, timeout=300)
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
    '.3gp': 'video/3gpp',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
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
    """Descarga el contenido de un blob y su tipo MIME.
    OPTIMIZADO: una sola llamada a GCS (download_as_bytes) en vez de tres
    (exists + reload + download). Desde Perú cada round-trip cuesta ~0.8s, así
    que esto baja de ~2.5s a ~0.6s por archivo. Si no existe, download lanza y
    devolvemos None (mismo comportamiento que antes, sin la llamada extra)."""
    try:
        from google.cloud.exceptions import NotFound
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        blob = client.bucket(bucket_name).blob(blob_name)
        try:
            data = blob.download_as_bytes()
        except NotFound:
            return None, None
        # content_type ya viene poblado tras download_as_bytes (sin reload extra)
        return data, (blob.content_type or None)
    except Exception as e:
        print(f"Error obteniendo data de GCS: {str(e)}")
        return None, None


def get_or_create_thumbnail(blob_name, max_px=420):
    """Versión reducida JPEG cacheada en GCS ('<blob>__thumb<max_px>.jpg').
    max_px=420 → miniatura de galería (~25 KB); max_px=1600 → 'display' para el
    lightbox (~150 KB, abre rápido). La 1ª vez se genera, luego es instantánea.
    Devuelve (bytes, 'image/jpeg') o (None, None)."""
    try:
        from io import BytesIO
        from PIL import Image, ImageOps
        from google.cloud.exceptions import NotFound
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        client = get_storage_client()
        bucket = client.bucket(bucket_name)

        thumb_name = f"{blob_name}__thumb{max_px}.jpg"
        # Intento directo de descarga (1 llamada): si existe, listo; si no, generamos.
        try:
            return bucket.blob(thumb_name).download_as_bytes(), 'image/jpeg'
        except NotFound:
            pass

        # GUARDIA DE TAMANO. Generar una miniatura carga el fichero ENTERO en
        # memoria; con un PDF de 300 MB eso tumba la instancia (512 MB), que
        # es como murio el hilo del DWG de 260 MB. Por encima del tope se
        # devuelve nada y la pantalla ensena su recuadro sin imagen: mejor
        # una miniatura ausente que el servicio caido.
        MAX_ORIGEN = 120 * 1024 * 1024
        try:
            origen = bucket.blob(blob_name)
            origen.reload()
            if (origen.size or 0) > MAX_ORIGEN:
                print(f"[thumb] {blob_name} pesa {origen.size}: sin miniatura")
                return None, None
        except NotFound:
            return None, None
        except Exception:
            pass   # si no se puede consultar el tamano, se intenta igual

        try:
            raw = bucket.blob(blob_name).download_as_bytes()
        except NotFound:
            return None, None
        thumb_blob = bucket.blob(thumb_name)

        # PDF: se rasteriza la PRIMERA PAGINA. Hace falta para la tira de
        # documentos de la carpeta (el boton de cuadricula del lector, como
        # ACC): sin esto la tira tendria iconos iguales y no se reconoceria
        # un plano de otro -- que es justo para lo que sirve.
        # PyMuPDF ya estaba en requirements; nada nuevo que instalar.
        if blob_name.lower().endswith(('.pdf', '.pdfx')):
            import fitz
            doc = fitz.open(stream=raw, filetype='pdf')
            try:
                if doc.page_count < 1:
                    return None, None
                pagina = doc.load_page(0)
                caja = pagina.rect
                escala = max_px / max(caja.width, caja.height, 1)
                pix = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala),
                                        alpha=False)
                img = Image.open(BytesIO(pix.tobytes('png'))).convert('RGB')
            finally:
                doc.close()
            out = BytesIO()
            img.save(out, format='JPEG', quality=72, optimize=True)
            data = out.getvalue()
            try:
                thumb_blob.upload_from_string(data, content_type='image/jpeg')
            except Exception as ce:
                print(f"[thumb] no se pudo cachear {thumb_name}: {ce}")
            return data, 'image/jpeg'

        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)      # respeta orientación EXIF del celular
        img = img.convert('RGB')
        img.thumbnail((max_px, max_px), Image.LANCZOS)
        out = BytesIO()
        img.save(out, format='JPEG', quality=72, optimize=True)
        data = out.getvalue()

        # Cachear para próximas veces (best-effort; si falla, igual servimos)
        try:
            thumb_blob.upload_from_string(data, content_type='image/jpeg')
        except Exception as ce:
            print(f"[thumb] no se pudo cachear {thumb_name}: {ce}")
        return data, 'image/jpeg'
    except Exception as e:
        print(f"[thumb] error generando miniatura de {blob_name}: {e}")
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


def descargar_a_fichero(blob_name, destino):
    """Baja un objeto a un fichero en disco, sin pasarlo por memoria.

    get_blob_data() hace download_as_bytes(), que carga el objeto ENTERO en RAM.
    Para un PDF da igual; para un Revit de 300 MB, en una instancia modesta y con
    varias peticiones a la vez, es la forma de quedarse sin memoria. Cuando lo
    unico que se va a hacer con los bytes es reenviarlos, no hace falta tenerlos
    todos a la vez.
    """
    import os as _os
    bucket_name = _os.environ.get("GCS_BUCKET_NAME")
    client = get_storage_client()
    blob = client.bucket(bucket_name).blob(blob_name)
    blob.download_to_file(destino)
    destino.flush()
    return destino.tell()


def describir_blob(blob_name):
    """¿Existe ya este objeto en el almacén? Devuelve sus datos o None.

    GAP 07 · Es lo que hace RECUPERABLE una subida cuyo desenlace se perdió.

    Cuando un móvil sube una evidencia y la respuesta no llega, el objeto puede
    estar ya arriba. Sin poder PREGUNTAR, el reintento tendría dos salidas
    igual de malas: subir otra vez —duplicando— o no subir —perdiéndola—. Como
    el nombre es determinista (`evidencia/<obra>/<operation_id>`), preguntar
    responde exactamente la pregunta que importa: ¿ocurrió aquello o no?

    Devuelve None también si el almacén no responde. NO se puede interpretar
    como «no existe»: quien llama tiene que distinguir las dos cosas, y por eso
    esta función deja que la excepción suba cuando el fallo es del cliente.
    """
    bucket_name = os.environ.get("GCS_BUCKET_NAME")
    if not bucket_name or bucket_name == "TU_BUCKET_AQUI":
        raise ValueError("GCS_BUCKET_NAME no esta configurado correctamente en el .env")
    client = get_storage_client()
    blob = client.bucket(bucket_name).get_blob(blob_name)
    if blob is None:
        return None
    return {
        'nombre': blob.name,
        'tamaño': blob.size or 0,
        'tipo': blob.content_type,
        'md5': blob.md5_hash,
        'subido_en': blob.time_created.isoformat() if blob.time_created else None,
    }
