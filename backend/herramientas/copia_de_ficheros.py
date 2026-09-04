# -*- coding: utf-8 -*-
"""Saca los ficheros del expediente FUERA de Google. La otra mitad del respaldo.

POR QUE EXISTE
--------------
`copia_de_seguridad.py` copia la BASE y lo dice claro en su cabecera: los bytes
de los planos, las fotos y los modelos viven en Google Cloud Storage, no en la
base. La copia guarda la FICHA de cada documento; no el PDF.

El 4-sep-2026 se audito la nube y quedo asi:

    Cloud SQL   copias automaticas + PITR, 7 dias, funcionando
    bucket      borrado reversible 90 dias
    la base     ademas, copia local demostrada (restaurada y cotejada)
    LOS FICHEROS   ninguna copia fuera de Google        <-- el unico hueco

Todo lo de arriba vive dentro del MISMO proyecto de Google. Si la cuenta se
pierde o la facturacion entra en mora --que ya paso una vez-- se van los
backups, el bucket y la copia Nearline a la vez. La base ya esta fuera. Los
ficheros no.

Magnitud medida desde la propia copia: **~8 GB** en 3.180 versiones
(`file_versions.size_bytes`). Es cota inferior: el bucket lleva ademas
`multimedia-whatsapp/`, `evidencia/` y `prueba-aislamiento/`.

POR QUE NO BORRA NUNCA EN EL DESTINO
------------------------------------
`gcloud storage rsync` sabe borrar en destino lo que ya no esta en origen. Aqui
NO se usa, a proposito. Un respaldo que replica los borrados no protege del
borrado: si alguien vacia una carpeta del bucket el lunes, el sincronizador la
vaciaria aqui el martes y el respaldo habria colaborado en la perdida. Esto es
una copia de seguridad, no un espejo. Crece; se poda a mano y con criterio.

REQUISITO
---------
`gcloud` instalado y con sesion (`gcloud auth login`). No se instala solo ni
desde aqui: instalar software es decision del propietario.

    python herramientas/copia_de_ficheros.py --destino G:/copias-ecd/ficheros
    python herramientas/copia_de_ficheros.py --destino ... --verificar
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

# Observado en la consola el 4-sep-2026. Se puede sobrescribir por entorno para
# no tener que tocar el fichero en otra instancia.
BUCKET_POR_DEFECTO = os.getenv('GCS_BUCKET_NAME') or 'yaser-pqt08-talara'


def _gcloud():
    exe = shutil.which('gcloud')
    if exe:
        return exe
    for p in (r'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd',
              r'C:/Program Files/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'):
        if pathlib.Path(p).exists():
            return p
    return None


def _correr(exe, args):
    return subprocess.run([exe] + args, capture_output=True, text=True, errors='replace')


def censo_del_bucket(exe, bucket):
    """Cuantos objetos y cuantos bytes hay en el origen. Sin listar nombres."""
    r = _correr(exe, ['storage', 'du', '--summarize', 'gs://%s' % bucket])
    if r.returncode != 0:
        return None, (r.stderr or '').strip().splitlines()[:1]
    partes = (r.stdout or '').split()
    return (int(partes[0]) if partes and partes[0].isdigit() else None), None


def censo_local(destino):
    n, b = 0, 0
    for p in pathlib.Path(destino).rglob('*'):
        if p.is_file():
            n += 1
            b += p.stat().st_size
    return n, b


def main():
    ap = argparse.ArgumentParser(description='Copia el bucket de documentos a disco.')
    ap.add_argument('--destino', required=True, help='carpeta donde dejar los ficheros')
    ap.add_argument('--bucket', default=BUCKET_POR_DEFECTO)
    ap.add_argument('--verificar', action='store_true',
                    help='no copia: solo compara lo que hay a los dos lados')
    a = ap.parse_args()

    exe = _gcloud()
    if not exe:
        print('NEGADO: no encuentro `gcloud`.')
        print('  Instalalo desde https://cloud.google.com/sdk/docs/install y')
        print('  entra con `gcloud auth login`. No lo instalo yo: instalar')
        print('  software es tu decision, no la mia.')
        return 2

    destino = pathlib.Path(a.destino)
    destino.mkdir(parents=True, exist_ok=True)

    print('Origen  : gs://%s' % a.bucket)
    print('Destino : %s' % destino)
    print()

    bytes_origen, error = censo_del_bucket(exe, a.bucket)
    if error:
        print('No pude censar el bucket: %s' % (error[0] if error else '?'))
        print('Comprueba que has entrado con `gcloud auth login` y que la')
        print('cuenta tiene acceso al proyecto.')
        return 2
    print('  en el bucket   %.2f GB' % (bytes_origen / 1024.0 ** 3))

    if not a.verificar:
        print('\nCopiando (no se borra nada en destino, a proposito)...')
        t0 = time.time()
        # Sin --delete-unmatched-destination-objects. Ver la cabecera.
        r = subprocess.run([exe, 'storage', 'rsync', '--recursive',
                            'gs://%s' % a.bucket, str(destino)],
                           text=True, errors='replace')
        if r.returncode != 0:
            print('\nLA COPIA FALLO (codigo %d). No des por bueno el destino.' % r.returncode)
            return 1
        print('  terminado en %.0f s' % (time.time() - t0))

    n, b = censo_local(destino)
    print()
    print('  en el disco    %.2f GB en %d ficheros' % (b / 1024.0 ** 3, n))

    # El destino puede pesar MAS que el origen y estar bien: aqui no se borra,
    # asi que conserva lo que el bucket ya no tiene. Lo que NO puede es pesar
    # menos, porque eso significa que falta algo por traer.
    falta = bytes_origen - b
    if falta > 0:
        print('  FALTAN %.2f GB por traer. La copia esta incompleta.'
              % (falta / 1024.0 ** 3))
    else:
        print('  COMPLETA (el disco conserva ademas lo que el bucket ya borro)')

    manifiesto = destino.parent / ('ficheros_%s.manifiesto.json'
                                   % time.strftime('%Y%m%d_%H%M%S'))
    manifiesto.write_text(json.dumps({
        'cuando': time.strftime('%Y-%m-%d %H:%M:%S'),
        'bucket': a.bucket,
        'destino': str(destino),
        'bytes_en_bucket': bytes_origen,
        'bytes_en_disco': b,
        'ficheros_en_disco': n,
        'completa': falta <= 0,
        'nota': 'no se borra en destino: es respaldo, no espejo',
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nmanifiesto: %s' % manifiesto.name)
    return 0 if falta <= 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
