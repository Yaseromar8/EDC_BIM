# -*- coding: utf-8 -*-
"""La huella del contenido de cada version, y como se comprueba.

EL HUECO QUE CIERRA
-------------------
Ante "demuestreme que este es el plano que se aprobo el 3 de junio y que nadie lo
ha tocado despues", la plataforma no tenia respuesta. Sabia el tamano y la fecha,
que no prueban nada: dos ficheros distintos pueden pesar lo mismo, y la fecha la
escribe quien sube. Se podia sustituir el contenido de un objeto conservando su
clave y la base no se enteraba.

QUE HACE
--------
Calcula el SHA-256 del contenido al subir y lo guarda en la VERSION. Como la
aprobacion tambien vive en la version (idoneidad, revision, emitida_en,
emitida_por), aprobar ata automaticamente una autorizacion a un contenido
concreto, sin ningun paso adicional.

Y permite lo contrario, que es lo que de verdad usa un auditor: coger el fichero
que alguien te ensena, calcular su huella y preguntar si coincide con la que se
aprobo.

POR QUE SHA-256 Y NO EL md5 QUE YA DA GCS
-----------------------------------------
El objeto de Cloud Storage trae md5Hash y crc32c gratis. crc32c detecta
corrupcion accidental, no manipulacion. Y MD5 admite colisiones construidas a
proposito desde hace anos: se pueden fabricar dos ficheros distintos con el mismo
md5. Para una huella que ha de sostenerse delante de alguien que busca fallos, eso
la descalifica.

LO QUE ESTO **NO** DEMUESTRA
----------------------------
Que la huella no haya sido cambiada. Vive en la misma base que el resto, y quien
pueda escribir en `file_versions` puede escribir tambien el sha256. Esto prueba
que el CONTENIDO no ha cambiado respecto de lo anotado; no convierte la anotacion
en inmutable. Esa es otra pieza (separacion de identidades y auditoria
append-only) y va aparte.
"""

import hashlib

from app_logging import get_logger

logger = get_logger('integridad')

# 1 MiB. Suficientemente grande para que el coste por trozo sea despreciable y
# suficientemente pequeno para no cargar en memoria un plano de 272 MB, que los
# hay en esta obra.
TROZO = 1024 * 1024


def huella_de_flujo(flujo):
    """SHA-256 de un fichero abierto, leyendolo por trozos.

    Deja el puntero al PRINCIPIO al terminar: quien llama va a subir ese mismo
    flujo justo despues y encontrarselo consumido es un fallo silencioso -- se
    sube un fichero de cero bytes y nadie se entera hasta que alguien lo abre.
    """
    h = hashlib.sha256()
    try:
        flujo.seek(0)
    except Exception:                     # pragma: no cover - flujos no buscables
        pass
    while True:
        trozo = flujo.read(TROZO)
        if not trozo:
            break
        h.update(trozo if isinstance(trozo, bytes) else trozo.encode())
    try:
        flujo.seek(0)
    except Exception:                     # pragma: no cover
        pass
    return h.hexdigest()


def huella_de_bytes(datos):
    """SHA-256 de un contenido que ya esta en memoria."""
    return hashlib.sha256(datos if isinstance(datos, bytes) else datos.encode()).hexdigest()


def anotar(cursor, version_id, sha256):
    """Guarda la huella en la version. Solo la ESCRIBE SI ESTA VACIA.

    Nunca sobrescribe una huella existente. Si una version ya tiene su huella y
    llega otra distinta, no es una correccion: es que el contenido cambio bajo una
    version que ya estaba anotada, y eso hay que verlo, no taparlo.
    """
    if not (version_id and sha256):
        return False
    cursor.execute(
        "UPDATE file_versions SET sha256 = %s, huella_en = CURRENT_TIMESTAMP "
        " WHERE id = %s AND sha256 IS NULL", (sha256, str(version_id)))
    return cursor.rowcount > 0


def comprobar(cursor, version_id, sha256_actual):
    """¿El contenido que me dan coincide con el que se anoto?

    Devuelve (veredicto, detalle):
      'coincide'      la huella anotada y la calculada son la misma
      'NO COINCIDE'   el contenido ha cambiado respecto de lo anotado
      'sin huella'    esa version es anterior a que existiera este control
      'sin version'   no existe
    """
    cursor.execute("SELECT sha256, version_number, emitida_en, codigo_idoneidad, "
                   "       codigo_revision, emitida_por "
                   "  FROM file_versions WHERE id = %s", (str(version_id),))
    fila = cursor.fetchone()
    if not fila:
        return 'sin version', {}
    anotada, num, emitida_en, idoneidad, revision, emisor = fila
    ficha = {'version': num, 'sha256_anotado': anotada, 'sha256_calculado': sha256_actual,
             'emitida_en': emitida_en.isoformat() if emitida_en else None,
             'codigo_idoneidad': idoneidad, 'codigo_revision': revision,
             'emitida_por': emisor}
    if not anotada:
        return 'sin huella', ficha
    return ('coincide' if anotada == sha256_actual else 'NO COINCIDE'), ficha


def sellar_desde_almacen(version_id, gcs_urn):
    """Calcula la huella leyendo el objeto del almacen, y la anota.

    Hace falta porque en la subida por trozos el cliente envia los datos DIRECTO a
    Cloud Storage y el backend no ve ni un byte: no hay flujo del que calcularla.
    La unica forma es leerla de vuelta.

    Se lee por trozos, sin cargar el objeto en memoria: en esta obra hay planos de
    272 MB y el servicio corre con un solo worker.

    Devuelve la huella, o None si no se pudo. NUNCA levanta: que falle el sellado
    no puede tumbar una subida que ya termino bien. La version se queda sin huella
    y eso se ve en la cobertura, que es justo lo que se quiere que se vea.
    """
    try:
        from gcs_manager import get_storage_client
        import os
        cliente = get_storage_client()
        blob = cliente.bucket(os.environ.get('GCS_BUCKET_NAME')).blob(gcs_urn)
        h = hashlib.sha256()
        with blob.open('rb') as f:
            while True:
                trozo = f.read(TROZO)
                if not trozo:
                    break
                h.update(trozo)
        sha = h.hexdigest()
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            anotado = anotar(cur, version_id, sha)
            conn.commit()
        logger.info(f"huella sellada para la version {version_id}: {sha[:12]}… "
                    f"({'anotada' if anotado else 'ya tenia una'})")
        return sha
    except Exception as e:
        logger.warning(f"no se pudo sellar la version {version_id}: {e}")
        return None


def resumen_de_obra(cursor, model_urn):
    """Cuantas versiones tienen huella y cuantas no. Es la medida de cobertura.

    Importa distinguirlo del total: mientras haya versiones sin huella, la
    respuesta honesta a "¿podeis demostrarlo?" es "de estas si, de estas no".
    """
    cursor.execute("""
        SELECT count(*)                                    AS total,
               count(*) FILTER (WHERE fv.sha256 IS NOT NULL) AS con_huella,
               count(*) FILTER (WHERE fv.emitida_en IS NOT NULL) AS emitidas,
               count(*) FILTER (WHERE fv.emitida_en IS NOT NULL
                                  AND fv.sha256 IS NULL)  AS emitidas_sin_huella
          FROM file_versions fv
          JOIN file_nodes fn ON fn.id = fv.file_node_id
         WHERE fn.model_urn = %s AND COALESCE(fn.is_deleted, FALSE) = FALSE
    """, (model_urn,))
    total, con, emitidas, emitidas_sin = cursor.fetchone()
    return {'versiones': total, 'con_huella': con, 'sin_huella': total - con,
            'emitidas': emitidas, 'emitidas_sin_huella': emitidas_sin,
            'cobertura': round(100.0 * con / total, 1) if total else 0.0}
