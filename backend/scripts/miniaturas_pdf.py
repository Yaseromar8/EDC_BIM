# -*- coding: utf-8 -*-
"""Genera las miniaturas de los PDF que YA estaban subidos — el botón del dueño.

Los PDF subidos antes del 28-ago-2026 no tienen miniatura: nadie la había
pedido nunca. La tira de documentos del lector las generaba al vuelo, todas a
la vez, y se quedaban en blanco. A partir de ahora cada PDF nuevo la deja
hecha al subir; este script hace lo mismo con los viejos, DE UNO EN UNO y sin
prisa, para no perturbar el servicio.

Ejecutar:  python backend/scripts/miniaturas_pdf.py [model_urn]
Es seguro repetirlo: lo que ya tiene miniatura se salta en una consulta.
"""
import io
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# EL .env DE LA RAÍZ, como hace server.py. Sin esto el script arrancaba y
# moría en la primera miniatura con «default credentials were not found»:
# las claves de Google Cloud (y el nombre del bucket) viven ahí, no en el
# fichero de la base. Es exactamente lo que le pasó al dueño al ejecutarlo.
try:
    from dotenv import load_dotenv
    _raiz = pathlib.Path(__file__).resolve().parent.parent.parent
    if not load_dotenv():
        load_dotenv(_raiz / '.env')
        load_dotenv(_raiz / 'backend' / '.env')
except Exception as _e:
    print('aviso: no se pudo cargar el .env (%s)' % str(_e)[:80])

if not os.environ.get('GCS_BUCKET_NAME'):
    print('FALTA GCS_BUCKET_NAME: sin eso no se puede leer ni escribir en el '
          'almacén. Revisa el .env de la raíz del proyecto.')
    sys.exit(1)

pwd = io.open('D:/copias-ecd/clave-migrator.txt', encoding='utf-8').read().strip()
os.environ.setdefault('DB_HOST', '34.86.206.187')
os.environ.setdefault('DB_PORT', '5432')
os.environ.setdefault('DB_NAME', 'postgres')
os.environ.setdefault('DB_USER', 'ecd_migrator')
os.environ.setdefault('DB_PASS', pwd)
os.environ.setdefault('PGSSLMODE', 'require')

import db as _db                                    # noqa: E402
from gcs_manager import get_or_create_thumbnail, get_storage_client  # noqa: E402

obra = sys.argv[1] if len(sys.argv) > 1 else None

_db.init_db_pool()
with _db.get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT n.gcs_urn, n.name, n.model_urn
          FROM file_nodes n
         WHERE n.is_deleted = FALSE
           AND n.node_type = 'FILE'
           AND n.gcs_urn IS NOT NULL
           AND (lower(n.name) LIKE '%%.pdf' OR lower(n.name) LIKE '%%.pdfx')
           AND (%s IS NULL OR n.model_urn = %s)
         ORDER BY n.model_urn, n.name
    """, (obra, obra))
    documentos = cur.fetchall()

print('PDF en el expediente%s: %d'
      % ((' de %s' % obra) if obra else '', len(documentos)))

bucket_name = os.environ.get('GCS_BUCKET_NAME')
cliente = get_storage_client()
bucket = cliente.bucket(bucket_name) if bucket_name else None

hechas = saltadas = fallidas = 0
for i, (urn, nombre, _obra) in enumerate(documentos, start=1):
    # ¿Ya la tiene? Una consulta barata evita bajar el PDF entero.
    if bucket is not None:
        try:
            if bucket.blob('%s__thumb420.jpg' % urn).exists():
                saltadas += 1
                continue
        except Exception:
            pass
    datos, _tipo = get_or_create_thumbnail(urn, 420)
    if datos:
        hechas += 1
        print('  [%d/%d] %s — %d KB' % (i, len(documentos), nombre[:58], len(datos) // 1024))
    else:
        fallidas += 1
        print('  [%d/%d] %s — SIN miniatura (pesado o ilegible)'
              % (i, len(documentos), nombre[:58]))

print('\nhechas: %d · ya estaban: %d · sin miniatura: %d'
      % (hechas, saltadas, fallidas))
print('Abre la tira de documentos en el lector: deben aparecer al instante.')
