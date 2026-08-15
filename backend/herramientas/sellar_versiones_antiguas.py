# -*- coding: utf-8 -*-
"""Calcula la huella de las versiones que se subieron antes de que se sellara.

RESIDUAL DE C6. Desde `6e2fb23` toda subida sella su SHA-256 al entrar. Las
versiones ANTERIORES a ese cambio no tienen huella, y sin huella no se puede
decir si un fichero es el mismo que estaba el dia que se aprobo.

LO PRIMERO, PORQUE SI NO ESTO HACE MAS MAL QUE BIEN
---------------------------------------------------
Una huella calculada HOY **no demuestra que el fichero sea el que se aprobo**.
Demuestra lo que el fichero es hoy. Si alguien lo cambio el mes pasado, esta
herramienta sella tranquilamente la version cambiada y a partir de ahi todo
cuadra: el expediente pareceria integro justo donde no lo es.

O sea: esto NO recupera la cadena de custodia del pasado. Eso no se puede. Lo
que hace es cerrar la puerta hacia delante -- desde el sello, cualquier cambio
posterior se detecta -- y por eso cada huella retroactiva se marca como tal.

    huella_retroactiva = TRUE   ->  vale desde hoy, no dice nada del pasado
    huella_retroactiva = FALSE  ->  sellada al subir; esa si es evidencial

Sin esa distincion, dentro de un año nadie sabria cuales de las huellas
significan algo, y una auditoria las trataria todas igual. Marcarlas es lo unico
que impide que esta herramienta se convierta en tranquilidad falsa.

COMO SE USA
-----------
    python herramientas/sellar_versiones_antiguas.py                 # solo mira
    python herramientas/sellar_versiones_antiguas.py --aplicar       # escribe
    python herramientas/sellar_versiones_antiguas.py --aplicar --limite 200

Por defecto NO escribe: enseña cuantas versiones faltan y cuanto ocuparia
leerlas. Nunca sobrescribe una huella que ya existe.
"""
import argparse
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _columna_de_marca(cursor):
    """La marca de «huella puesta despues», sin la cual esto engaña."""
    cursor.execute("ALTER TABLE file_versions "
                   "ADD COLUMN IF NOT EXISTS huella_retroactiva BOOLEAN DEFAULT FALSE")


def pendientes(cursor, limite=None):
    sql = """SELECT v.id, v.gcs_urn, v.size_bytes, n.model_urn, n.name
               FROM file_versions v
               LEFT JOIN file_nodes n ON n.id = v.file_node_id
              WHERE v.sha256 IS NULL AND v.gcs_urn IS NOT NULL
              ORDER BY v.created_at"""
    if limite:
        sql += ' LIMIT %d' % int(limite)
    cursor.execute(sql)
    return cursor.fetchall()


def huella_del_objeto(gcs_urn):
    """SHA-256 del objeto, leido a trozos. Devuelve None si no se puede leer."""
    from gcs_manager import get_storage_client
    bucket_name = os.environ.get('GCS_BUCKET_NAME')
    if not bucket_name:
        raise RuntimeError('GCS_BUCKET_NAME no esta configurado')
    blob = get_storage_client().bucket(bucket_name).blob(gcs_urn)
    h = hashlib.sha256()
    try:
        # A trozos: hay RVT de cientos de MB y no caben comodos en memoria.
        with blob.open('rb') as f:
            for trozo in iter(lambda: f.read(1024 * 1024), b''):
                h.update(trozo)
    except Exception as e:
        print('   no se pudo leer %s: %s' % (gcs_urn, str(e)[:100]))
        return None
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--aplicar', action='store_true', help='escribir las huellas')
    ap.add_argument('--limite', type=int, default=None, help='procesar solo N versiones')
    a = ap.parse_args()

    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), '.env'))

    import db
    db.init_db_pool()

    with db.get_db_connection() as conn:
        cur = conn.cursor()
        filas = pendientes(cur, a.limite)

    total_bytes = sum((f[2] or 0) for f in filas)
    print('versiones sin huella : %d' % len(filas))
    print('bytes a leer         : %.1f MB' % (total_bytes / 1048576.0))
    if not filas:
        print('\nNo hay nada que sellar.')
        return 0
    if not a.aplicar:
        print('\n(solo mirando; usa --aplicar para escribir)')
        for f in filas[:10]:
            print('   %s  %s' % ((f[3] or '?')[:28], (f[4] or f[1])[:60]))
        if len(filas) > 10:
            print('   ... y %d mas' % (len(filas) - 10))
        return 0

    print('\nSellando. Cada huella queda marcada como RETROACTIVA: vale desde hoy,')
    print('no dice nada de si el fichero es el que se aprobo en su dia.\n')
    sellados = ilegibles = 0
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        _columna_de_marca(cur)
        conn.commit()

    for vid, gcs_urn, _tam, obra, nombre in filas:
        h = huella_del_objeto(gcs_urn)
        if not h:
            ilegibles += 1
            continue
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            # `sha256 IS NULL` en el WHERE: si otro proceso la sello mientras
            # tanto, no se pisa. Una huella ya puesta no se toca NUNCA.
            cur.execute("""UPDATE file_versions
                              SET sha256 = %s, huella_en = CURRENT_TIMESTAMP,
                                  huella_retroactiva = TRUE
                            WHERE id = %s AND sha256 IS NULL""", (h, vid))
            escrito = cur.rowcount
            conn.commit()
        if escrito:
            sellados += 1
            print('   %s  %s' % (h[:12], (nombre or gcs_urn)[:60]))

    print('\nselladas %d · ilegibles %d' % (sellados, ilegibles))
    if ilegibles:
        print('Las ilegibles son objetos que la base declara y el almacen no tiene.')
        print('Eso es el hallazgo C7, no un fallo de esta herramienta: '
              'conciliacion_almacen.py los lista.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
