# -*- coding: utf-8 -*-
"""El GPS de una foto de obra no puede viajar dentro del fichero.

AREA 15 · datos personales. Medido en el baseline: 6 de 6 fotografias de obra
muestreadas llevan coordenadas GPS dentro del JPEG. Y no las usa NADIE: el
portal solo lee `DateTimeOriginal` para ordenar por fecha, y el backend solo la
orientacion para girar la miniatura.

POR QUE IMPORTA
---------------
Una coordenada suelta no dice gran cosa; la de una obra publica, menos. Lo que
convierte esto en dato personal es la combinacion que ya esta en la misma fila:
QUIEN subio la foto, CUANDO, y DONDE estaba. Eso situa a una persona
identificada en un sitio y una hora concretos, que es justo lo que la Ley 29733
protege.

Y el problema no es que el dato exista: es que viaja DENTRO de los bytes. Una
foto compartida por enlace, adjuntada a un transmittal o descargada por un
subcontratista se lleva las coordenadas puestas, fuera de cualquier permiso que
el ECD sepa aplicar. Los controles de acceso no alcanzan a un fichero que ya
salio.

QUE SE HACE, Y POR QUE NO SE BORRA SIN MAS
------------------------------------------
Se separan las dos cosas:

  · el dato se EXTRAE y se guarda en la base, donde el perimetro de obra ya
    manda y donde ademas sirve: una foto con coordenadas se puede situar en el
    modelo o relacionar con una progresiva, que es trabajo que esta obra ya
    hace por otras vias;
  · y se QUITA del fichero que se guarda y se reparte.

Borrarlo del todo seria mas simple y perderia informacion util de un registro de
obra. Dejarlo dentro seria repartirlo sin control. Extraer y limpiar es lo unico
que conserva el valor y quita el riesgo.

SOBRE REESCRIBIR LA IMAGEN
--------------------------
Limpiar el EXIF obliga a volver a codificar el JPEG. Se hace ANTES de subir y
antes de sellar la huella, asi que lo que se guarda, lo que se sella y lo que se
entrega son los mismos bytes: la cadena de custodia no se rompe. Se conserva la
orientacion aplicandola a los pixeles -- si se quitara la etiqueta sin girar la
imagen, media obra veria las fotos tumbadas -- y se guarda con calidad alta,
porque una foto de obra es evidencia y no un adorno.

Si algo falla, se sube el original TAL CUAL y se deja dicho en el registro. Una
foto que no se sube es una evidencia que se pierde; una foto con EXIF es un
riesgo que ya existia. No se cambia una perdida segura por un riesgo conocido.
"""

import io

from app_logging import get_logger

logger = get_logger('privacidad_imagen')

# Extensiones que llevan EXIF y que se suben como evidencia de obra.
CON_EXIF = ('.jpg', '.jpeg', '.tif', '.tiff', '.heic', '.heif')

# Calidad de re-codificacion. 92 es alto: la evidencia de obra se amplia para
# leer una regla o una fisura, y bajar aqui es perder eso para siempre.
CALIDAD = 92


def _grados(valor, referencia):
    """Los GPS del EXIF vienen en grados/minutos/segundos y hemisferio."""
    try:
        g, m, s = [float(x) for x in valor]
    except (TypeError, ValueError):
        return None
    grados = g + m / 60.0 + s / 3600.0
    if str(referencia or '').upper() in ('S', 'W'):
        grados = -grados
    return round(grados, 7)


def leer_metadatos(datos):
    """Lo que lleva dentro la imagen. Devuelve {} si no lleva nada o no se puede."""
    try:
        from PIL import Image, ExifTags
    except ImportError:
        return {}
    try:
        img = Image.open(io.BytesIO(datos))
        bruto = img.getexif()
        if not bruto:
            return {}
        etiquetas = {ExifTags.TAGS.get(k, k): v for k, v in bruto.items()}
        salida = {}
        for origen, destino in (('DateTimeOriginal', 'tomada_en'),
                                ('DateTime', 'tomada_en'),
                                ('Make', 'dispositivo_marca'),
                                ('Model', 'dispositivo_modelo')):
            if origen in etiquetas and destino not in salida:
                salida[destino] = str(etiquetas[origen]).strip() or None

        gps = bruto.get_ifd(0x8825) if hasattr(bruto, 'get_ifd') else None
        if gps:
            g = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps.items()}
            lat = _grados(g.get('GPSLatitude'), g.get('GPSLatitudeRef'))
            lon = _grados(g.get('GPSLongitude'), g.get('GPSLongitudeRef'))
            if lat is not None and lon is not None:
                salida['latitud'] = lat
                salida['longitud'] = lon
        return {k: v for k, v in salida.items() if v not in (None, '')}
    except Exception as e:
        logger.warning(f'no se pudieron leer los metadatos de la imagen: {e}')
        return {}


def limpiar(datos, nombre=''):
    """(bytes_sin_exif, metadatos). Si no se puede, devuelve los bytes tal cual.

    El segundo valor es lo que se guarda en la base; el primero, lo que se sube.
    """
    if not nombre.lower().endswith(CON_EXIF):
        return datos, {}

    metadatos = leer_metadatos(datos)
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(datos))
        # La orientacion se aplica a los PIXELES antes de tirar la etiqueta: si
        # no, al quitar el EXIF media obra veria las fotos tumbadas.
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        salida = io.BytesIO()
        # `exif` vacio a proposito: sin GPS, sin numero de serie del telefono y
        # sin nada mas de lo que el fichero llevaba pegado.
        img.save(salida, format='JPEG', quality=CALIDAD, optimize=True, exif=b'')
        return salida.getvalue(), metadatos
    except Exception as e:
        # Subir el original es peor que subirlo limpio, pero muchisimo mejor que
        # no subirlo: la evidencia de obra no se puede volver a tomar.
        logger.warning(f'no se pudo limpiar el EXIF de «{nombre}»: {e}. '
                       f'Se sube el original.')
        return datos, metadatos


def lleva_ubicacion(datos, nombre=''):
    """¿Esta imagen lleva coordenadas dentro? Para auditar lo ya subido."""
    if not nombre.lower().endswith(CON_EXIF):
        return False
    m = leer_metadatos(datos)
    return 'latitud' in m and 'longitud' in m
