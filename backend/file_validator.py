"""
Validador central de archivos para VISOR ECD.

Al estilo de plataformas profesionales como ACC/BIM360:
- Whitelist de tipos MIME permitidos
- Limite de tamanio configurable por tipo
- Deteccion de extensiones peligrosas
- Verificacion de consistencia nombre vs contenido MIME

Uso:
    from file_validator import validate_file, FileValidationError
    validate_file(flask_file_obj)  # lanza exception si no pasa
"""
import os

# ── Tipos MIME permitidos por categoria ─────────────────────────────────────
ALLOWED_TYPES = {
    # Documentos tecnicos
    # EL PDF ES EL FORMATO DEL EXPEDIENTE: mismo techo que el resto de lo
    # pesado (CAD, video, ZIP) y que el failsafe absoluto.
    #
    # Estaba en 200 MB y rechazaba un plano topografico escaneado de 272 MB
    # -- documento legitimo de obra que el CDE existe para custodiar. La
    # incoherencia era doble: una extension DESCONOCIDA recibia el techo
    # absoluto (2048) y el PDF, que es el formato central, el mas estrecho.
    #
    # Subirlo no carga al servidor: la validacion es sobre el tamano DECLARADO
    # y luego se abre una sesion reanudable de GCS -- los bytes van del
    # navegador a Google sin pasar por aqui.
    #
    # LO QUE SI CAMBIA, y conviene saberlo: por encima de 120 MB no se genera
    # miniatura (ver MAX_ORIGEN en gcs_manager.get_or_create_thumbnail), asi
    # que estos ficheros no tienen vista previa en el explorador ni en la cinta
    # del lector, y abrirlos en el lector web sera lento. Se guardan, se
    # comparten y se descargan; para revisarlos, el escritorio.
    'application/pdf':                        {'max_mb': 2048, 'extensions': ['.pdf']},
    'application/msword':                     {'max_mb': 50,  'extensions': ['.doc']},
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                                              {'max_mb': 50,  'extensions': ['.docx']},
    'application/vnd.ms-excel':               {'max_mb': 50,  'extensions': ['.xls']},
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                                              {'max_mb': 100, 'extensions': ['.xlsx']},
    'application/vnd.ms-powerpoint':          {'max_mb': 200, 'extensions': ['.ppt']},
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                                              {'max_mb': 200, 'extensions': ['.pptx']},

    # Formatos CAD / BIM — modelos federados (RVT/NWD/IFC) llegan a 1-2 GB.
    'application/octet-stream':               {'max_mb': 2048, 'extensions': ['.dwg', '.dxf', '.rvt', '.rfa', '.ifc', '.nwd', '.nwc']},
    'model/ifc':                              {'max_mb': 2048, 'extensions': ['.ifc']},

    # Imagenes de terreno (fotos de campo)
    'image/jpeg':                             {'max_mb': 30,  'extensions': ['.jpg', '.jpeg']},
    'image/png':                              {'max_mb': 30,  'extensions': ['.png']},
    'image/webp':                             {'max_mb': 20,  'extensions': ['.webp']},
    'image/gif':                              {'max_mb': 10,  'extensions': ['.gif']},
    'image/tiff':                             {'max_mb': 100, 'extensions': ['.tif', '.tiff']},

    # Video de inspeccion (dron / recorridos largos)
    'video/mp4':                              {'max_mb': 2048, 'extensions': ['.mp4']},
    'video/quicktime':                        {'max_mb': 2048, 'extensions': ['.mov']},
    'video/webm':                             {'max_mb': 2048, 'extensions': ['.webm']},
    'video/ogg':                              {'max_mb': 2048, 'extensions': ['.ogg']},

    # Texto plano / codigo
    'text/plain':                             {'max_mb': 5,   'extensions': ['.txt', '.csv', '.log']},
    'text/csv':                               {'max_mb': 50,  'extensions': ['.csv']},

    # Comprimidos (para importar modelos)
    'application/zip':                        {'max_mb': 2048, 'extensions': ['.zip']},
    'application/x-zip-compressed':          {'max_mb': 2048, 'extensions': ['.zip']},
}

# Extensiones absolutamente prohibidas (seguridad)
BLOCKED_EXTENSIONS = {
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.msi', '.dll',
    '.py', '.php', '.asp', '.aspx', '.jsp', '.rb', '.pl', '.cgi', '.htaccess'
}

# Limite global absoluto (failsafe)
ABSOLUTE_MAX_MB = 2048


class FileValidationError(Exception):
    """Raised cuando un archivo no pasa la validacion."""
    def __init__(self, message, code='INVALID_FILE'):
        self.message = message
        self.code = code
        super().__init__(message)


def get_extension(filename: str) -> str:
    """Retorna la extension en minuscula: 'foto.JPG' -> '.jpg'"""
    return os.path.splitext(filename.lower())[1]


def get_file_size_mb(file_obj) -> float:
    """Lee el tamanio real del archivo en MB sin consumirlo."""
    file_obj.seek(0, 2)  # Ir al final
    size = file_obj.tell()
    file_obj.seek(0)     # Volver al inicio
    return size / (1024 * 1024)


def validate_file(file_obj, custom_max_mb: float = None) -> dict:
    """
    Valida un archivo Flask antes de subirlo a GCS.
    
    Args:
        file_obj: werkzeug.FileStorage (request.files['file'])
        custom_max_mb: Override del limite de tamanio (opcional)
    
    Returns:
        dict con {mime_type, extension, size_mb, size_bytes} si es valido
    
    Raises:
        FileValidationError si el archivo no es aceptable
    """
    filename = file_obj.filename or ''
    
    # 1. El archivo debe tener nombre
    if not filename:
        raise FileValidationError("El archivo no tiene nombre.", 'NO_FILENAME')
    
    # 2. Verificar extension (primera linea de defensa)
    ext = get_extension(filename)
    if ext in BLOCKED_EXTENSIONS:
        raise FileValidationError(
            f"Extension '{ext}' no permitida por seguridad.", 'BLOCKED_EXTENSION'
        )
    
    # 3. Obtener MIME type declarado por el cliente
    declared_mime = (file_obj.content_type or '').split(';')[0].strip().lower()
    if not declared_mime:
        declared_mime = 'application/octet-stream'
    
    # 4. Verificar que el MIME este en la whitelist
    allowed_config = ALLOWED_TYPES.get(declared_mime)
    if not allowed_config:
        # Fallback: buscar por extension en todos los tipos permitidos
        found_by_ext = False
        for mime, config in ALLOWED_TYPES.items():
            if ext in config['extensions']:
                allowed_config = config
                declared_mime = mime
                found_by_ext = True
                break
        if not found_by_ext:
            raise FileValidationError(
                f"Tipo de archivo '{ext}' no permitido. Formatos aceptados: PDF, DWG, IFC, imágenes, Excel, Word.",
                'UNSUPPORTED_TYPE'
            )
    
    # 5. Verificar que la extension coincida con el tipo MIME declarado
    if ext and ext not in allowed_config['extensions']:
        # Solo warning, no error — algunos navegadores envian MIME incorrecto
        print(f"[FileValidator] Warning: extension '{ext}' inusual para MIME '{declared_mime}'")
    
    # 6. Verificar tamanio
    size_mb = get_file_size_mb(file_obj)
    max_mb = custom_max_mb or allowed_config.get('max_mb', ABSOLUTE_MAX_MB)
    max_mb = min(max_mb, ABSOLUTE_MAX_MB)  # Nunca pasar el limite absoluto
    
    if size_mb > max_mb:
        raise FileValidationError(
            f"Archivo demasiado grande: {size_mb:.1f} MB. Límite para {ext}: {max_mb} MB.",
            'FILE_TOO_LARGE'
        )
    
    if size_mb == 0:
        raise FileValidationError("El archivo está vacío.", 'EMPTY_FILE')
    
    size_bytes = int(size_mb * 1024 * 1024)
    
    return {
        'mime_type': declared_mime,
        'extension': ext,
        'size_mb': round(size_mb, 2),
        'size_bytes': size_bytes
    }
