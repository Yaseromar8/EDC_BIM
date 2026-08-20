# -*- coding: utf-8 -*-
"""Declara el CORS del bucket. PASO OBLIGATORIO al aprovisionar una instancia.

POR QUE HACE FALTA
------------------
El portal no descarga los documentos a traves del backend: pide una URL firmada
y el NAVEGADOR va directo a `storage.googleapis.com`. Si el bucket no declara
CORS, el navegador bloquea esa lectura y **no se abre ni un PDF**.

Medido el 20-ago-2026 sobre la instancia de ensayo, mirando la pantalla:

    Access to fetch at 'https://storage.googleapis.com/...' from origin
    'http://localhost:5174' has been blocked by CORS policy: No
    'Access-Control-Allow-Origin' header is present on the requested resource.

El lector abria y mostraba su pantalla de error. Ninguna prueba de API lo veia,
porque por API el backend firma la URL correctamente y ahi acaba su trabajo: el
que se estrella es el navegador, despues.

QUIEN LO EJECUTA
----------------
El PROPIETARIO, una vez, al crear el bucket -- no la aplicacion. Cambiar la
configuracion de un bucket exige `storage.buckets.update`, que NO esta en
`Storage Object Admin` y que la cuenta de servicio de la aplicacion no debe
tener: su credencial vive en un servidor y solo necesita mover objetos.

    cd backend && python apply_cors.py

USA GOOGLE_APPLICATION_CREDENTIALS del entorno, asi que hay que ejecutarlo con
una identidad que sí pueda administrar el bucket.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gcs_manager import get_storage_client


def origenes_declarados():
    """Los origenes del portal, de CORS_ORIGINS. NUNCA '*'.

    Estaba fijo a ["*"]: cualquier web del mundo podia hacer peticiones de
    navegador contra el bucket de una municipalidad. El riesgo practico es
    limitado --sin una URL firmada valida no se lee nada-- pero declarar
    "cualquiera" sobre el almacen documental de una entidad publica es
    exactamente lo que un auditor subraya, y no hay ninguna razon para hacerlo:
    los origenes ya estan declarados en CORS_ORIGINS.
    """
    crudo = (os.getenv('CORS_ORIGINS') or '').strip()
    origenes = [o.strip().rstrip('/') for o in crudo.split(',')
                if o.strip().startswith('http')]
    return origenes


def set_bucket_cors():
    bucket_name = os.environ.get('GCS_BUCKET_NAME')
    if not bucket_name:
        raise SystemExit('Falta GCS_BUCKET_NAME.')

    origenes = origenes_declarados()
    if not origenes:
        raise SystemExit(
            'Falta CORS_ORIGINS, y sin ella este guion tendria que abrir el '
            'bucket a cualquier origen. Declara los del portal y vuelve.')

    politica = [{
        'origin': origenes,
        # GET y HEAD para leer; el resto para las subidas reanudables, que el
        # navegador hace directo contra el bucket con una URL firmada.
        'method': ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
        'responseHeader': [
            'Content-Type', 'Content-Length', 'Content-Range', 'Content-Disposition',
            'Authorization', 'User-Agent',
            'x-goog-resumable', 'x-goog-content-length-range',
        ],
        'maxAgeSeconds': 3600,
    }]

    bucket = get_storage_client().bucket(bucket_name)
    bucket.cors = politica
    bucket.patch()
    print('CORS declarado en gs://%s' % bucket_name)
    for o in origenes:
        print('   origen permitido: %s' % o)
    print()
    print('Si alguna vez cambia la URL del portal, hay que volver a ejecutarlo:')
    print('el navegador dejara de poder abrir documentos y el lector mostrara')
    print('su pantalla de error sin decir por que.')


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    set_bucket_cors()
