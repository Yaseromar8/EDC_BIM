# -*- coding: utf-8 -*-
"""Conciliacion entre lo que dice la base y lo que hay en el almacen.

QUE PROBLEMA ATACA
------------------
BASELINE 0 · C7: "No hay copia de los ficheros; la mayoria de los bytes no los
conoce nadie" -- 721 objetos y 3,95 GB en el bucket sin correspondencia en la
base. Un ECD que no sabe de quien son sus propios bytes no puede responder por
ellos, ni ante una auditoria ni ante una reclamacion.

POR QUE ESTE MODULO SUSTITUYE A reconcile_storage.py
----------------------------------------------------
El guion anterior recogia las referencias de DOS tablas -- file_nodes y
file_versions -- y con `--force` BORRABA del bucket todo lo demas. En la base hay
seis columnas mas que apuntan a objetos: fotografias de obra, fuentes de datos
4D, subidas en curso, miniaturas y logotipos. Ejecutarlo habria borrado, entre
otras cosas, todas las fotografias de interferencias de Talara. Por eso:

  1. las fuentes se declaran explicitamente y se COMPRUEBAN contra el esquema
     real: si aparece una columna nueva que apunta a objetos y no esta declarada,
     la conciliacion se niega a correr en vez de tratar esos objetos como basura;
  2. se miran las DOS direcciones. Que sobre un objeto es dinero; que FALTE es un
     documento del expediente sin bytes, y eso es mucho peor;
  3. no borra nada. Nunca. Produce un informe, y borrar es una decision del
     dueno del expediente tomada sobre ese informe.

LO QUE NO RESUELVE
------------------
Conciliar no es respaldar. Que el inventario cuadre no protege de un borrado:
eso es versionado y copia del bucket, y se configura en la consola de Google.
"""

import datetime
import os
import re

# (tabla, columna, que representa). Orden de importancia para el informe.
FUENTES = (
    ('file_nodes', 'gcs_urn', 'documento vigente'),
    ('file_versions', 'gcs_urn', 'version historica'),
    ('photo_evidences', 'gcs_urn', 'fotografia de obra'),
    ('photo_evidences', 'gcs_url', 'fotografia de obra (url)'),
    ('lob_dataset_sources', 'gcs_urn', 'fuente de datos 4D'),
    ('upload_sessions', 'gcs_urn', 'subida en curso'),
    ('projects', 'thumbnail_url', 'miniatura de obra'),
    ('hubs', 'logo_url', 'logotipo'),
)

# Columnas que parecen apuntar a un objeto pero no lo hacen. Se declaran para que
# la comprobacion de cobertura no las cuente como olvido.
NO_SON_OBJETOS = {
    ('project_settings', 'storage_limit_bytes'),
}

# Margen antes de considerar huerfano un objeto recien subido: una subida por URL
# firmada escribe el objeto ANTES de que la aplicacion registre la fila.
GRACIA_HORAS = 6

_PATRON_COLUMNAS = (
    "column_name ILIKE '%%gcs%%' OR column_name ILIKE '%%blob%%' "
    "OR column_name ILIKE '%%storage%%' OR column_name ILIKE '%%object_name%%' "
    "OR column_name ILIKE '%%_url'"
)


def clave_de(valor, bucket=None):
    """Normaliza a nombre de objeto lo que guarde la columna.

    Las columnas no son homogeneas: unas guardan el nombre del objeto tal cual
    (`multi-tenant/<obra>/<ts>_<uuid>_<nombre>`) y otras la URL publica completa.
    Compararlas sin normalizar daria por huerfano todo lo que este guardado como
    URL, que es justo el caso de las fotografias.
    """
    if not valor:
        return None
    v = str(valor).strip()
    if not v:
        return None
    v = v.split('?', 1)[0]                       # firma y parametros fuera
    v = re.sub(r'^https?://storage\.googleapis\.com/', '', v)
    v = re.sub(r'^https?://[^/]*\.storage\.googleapis\.com/', '', v)
    v = re.sub(r'^gs://', '', v)
    if bucket and v.startswith(bucket + '/'):
        v = v[len(bucket) + 1:]
    return v.lstrip('/') or None


def columnas_no_declaradas(cursor):
    """Columnas del esquema que huelen a objeto y no estan en FUENTES.

    Es el seguro contra el fallo que tenia el guion anterior: la lista de sitios
    donde miramos se queda vieja en silencio, y lo que no miramos pasa a contarse
    como basura.
    """
    cursor.execute(
        "SELECT table_name, column_name FROM information_schema.columns "
        " WHERE table_schema = 'public' AND (" + _PATRON_COLUMNAS + ") "
        " ORDER BY table_name, column_name")
    declaradas = {(t, c) for t, c, _ in FUENTES} | NO_SON_OBJETOS
    return [(t, c) for t, c in cursor.fetchall() if (t, c) not in declaradas]


def referencias(cursor, bucket=None):
    """Todo lo que la base dice tener en el almacen: {clave: [origen, ...]}.

    Una tabla que no exista no rompe la conciliacion: se anota como fuente
    ausente. Pero una que exista y falle SI rompe, porque contar de menos aqui
    convierte objetos legitimos en huerfanos.
    """
    mapa, ausentes = {}, []
    for tabla, columna, que_es in FUENTES:
        cursor.execute("SELECT to_regclass(%s)", (f'public.{tabla}',))
        if not cursor.fetchone()[0]:
            ausentes.append(tabla)
            continue
        cursor.execute(f'SELECT {columna} FROM {tabla} WHERE {columna} IS NOT NULL')
        for (valor,) in cursor.fetchall():
            clave = clave_de(valor, bucket)
            if clave:
                mapa.setdefault(clave, []).append((tabla, columna, que_es))
    return mapa, ausentes


def conciliar(objetos, refs, ahora=None, gracia_horas=GRACIA_HORAS):
    """Cruza el listado del bucket con las referencias de la base.

    `objetos` es un iterable de (nombre, tamano_en_bytes, creado_en). Se pasa ya
    materializado a proposito: asi esta funcion es pura y se puede probar sin red.
    """
    ahora = ahora or datetime.datetime.now(datetime.timezone.utc)
    limite = ahora - datetime.timedelta(hours=gracia_horas)

    en_almacen = {}
    huerfanos, en_gracia = [], []
    bytes_huerfanos = 0
    for nombre, tamano, creado in objetos:
        if nombre.endswith('/'):        # carpeta simulada, no es un objeto
            continue
        en_almacen[nombre] = tamano
        if nombre in refs:
            continue
        if creado and creado > limite:
            en_gracia.append((nombre, tamano))
        else:
            huerfanos.append((nombre, tamano))
            bytes_huerfanos += tamano or 0

    # La direccion que de verdad importa: la base promete bytes que no estan.
    sin_bytes = []
    for clave, origenes in refs.items():
        if clave not in en_almacen:
            sin_bytes.append((clave, origenes))

    por_origen = {}
    for origenes in refs.values():
        for _tabla, _col, que_es in origenes:
            por_origen[que_es] = por_origen.get(que_es, 0) + 1

    return {
        'objetos_en_almacen': len(en_almacen),
        'referencias_en_base': len(refs),
        'huerfanos': sorted(huerfanos, key=lambda x: -(x[1] or 0)),
        'bytes_huerfanos': bytes_huerfanos,
        'en_gracia': en_gracia,
        'sin_bytes': sorted(sin_bytes),
        'por_origen': por_origen,
    }


def informe_de_texto(res, ausentes=(), no_declaradas=()):
    """El informe, escrito para que lo lea una persona que decide."""
    mb = (res['bytes_huerfanos'] or 0) / (1024 * 1024)
    lineas = [
        'CONCILIACION BASE <-> ALMACEN',
        '=' * 60,
        f"objetos en el almacen  : {res['objetos_en_almacen']}",
        f"referencias en la base : {res['referencias_en_base']}",
        '',
        'POR ORIGEN',
    ]
    for que_es, n in sorted(res['por_origen'].items(), key=lambda x: -x[1]):
        lineas.append(f'  {n:>7}  {que_es}')
    lineas += [
        '',
        f"SIN BYTES (la base los promete y no estan): {len(res['sin_bytes'])}",
        '  Es lo grave: un documento del expediente sin contenido.',
    ]
    for clave, origenes in res['sin_bytes'][:40]:
        lineas.append(f"  · {clave}  <- {', '.join(o[2] for o in origenes)}")
    if len(res['sin_bytes']) > 40:
        lineas.append(f"  ... y {len(res['sin_bytes']) - 40} mas")
    lineas += [
        '',
        f"HUERFANOS (estan y nadie los reclama): {len(res['huerfanos'])} · {mb:.2f} MB",
        f"EN PERIODO DE GRACIA ({GRACIA_HORAS} h): {len(res['en_gracia'])}",
        '',
        'Este informe NO borra nada. Borrar es una decision del dueno del',
        'expediente, y se toma sobre esta lista, no a ciegas.',
    ]
    if ausentes:
        lineas += ['', 'FUENTES AUSENTES EN ESTA BASE: ' + ', '.join(sorted(set(ausentes)))]
    if no_declaradas:
        lineas += ['', 'AVISO: columnas que apuntan a objetos y NO estan declaradas:']
        lineas += [f'  · {t}.{c}' for t, c in no_declaradas]
    return '\n'.join(lineas)


def ejecutar(escribir=print):
    """Conciliacion real contra la base y el bucket configurados."""
    from db import get_db_connection
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()

    bucket_nombre = os.environ.get('GCS_BUCKET_NAME')
    if not bucket_nombre:
        raise SystemExit('GCS_BUCKET_NAME no esta definido: no hay almacen que conciliar.')

    with get_db_connection() as conn:
        cur = conn.cursor()
        no_declaradas = columnas_no_declaradas(cur)
        if no_declaradas:
            # No es un aviso decorativo: seguir adelante contaria como huerfanos
            # objetos legitimos, y ese fue exactamente el fallo anterior.
            raise SystemExit(
                'Hay columnas que apuntan a objetos sin declarar en FUENTES:\n' +
                '\n'.join(f'  {t}.{c}' for t, c in no_declaradas) +
                '\nDeclaralas (o anotalas en NO_SON_OBJETOS) antes de conciliar.')
        refs, ausentes = referencias(cur, bucket_nombre)

    from gcs_manager import get_storage_client
    bucket = get_storage_client().bucket(bucket_nombre)
    objetos = [(b.name, b.size, b.time_created) for b in bucket.list_blobs()]

    res = conciliar(objetos, refs)
    escribir(informe_de_texto(res, ausentes, no_declaradas))
    return res


if __name__ == '__main__':
    ejecutar()
