# -*- coding: utf-8 -*-
"""Demuestra que el secreto APS publicado ya NO sirve y que el nuevo SI. (N19)

POR QUE ASI, Y NO «ya lo rote»
------------------------------
Rotar una credencial y decir que se ha rotado son dos cosas distintas. Un
hallazgo de credencial expuesta no se cierra con una afirmacion: se cierra con
la prueba de que la anterior fue RECHAZADA por el servidor, con fecha, hora y el
mensaje que devolvio.

NADIE TIENE QUE PEGAR NINGUN SECRETO
------------------------------------
El secreto viejo se lee del propio repositorio publico, del blob donde lleva
meses expuesto. No se revela nada que no este ya publicado, y a cambio se puede
probar con exactitud EL MISMO valor que esta comprometido, no uno parecido.

El secreto nuevo se lee del entorno (.env local o la variable del servicio). No
se teclea, no se pasa por argumento -- un argumento queda en el historial del
terminal y en la lista de procesos -- y no se imprime.

Lo unico que sale por pantalla y por la evidencia son VEREDICTOS y huellas
SHA-256 truncadas: bastan para demostrar que lo probado era lo publicado, sin
volver a escribirlo.

USO
    cd backend
    python herramientas/verificar_rotacion_aps.py

QUE SIGNIFICA CADA RESULTADO
    viejo RECHAZADO + nuevo ACEPTADO -> rotacion correcta. N19 se puede cerrar.
    viejo ACEPTADO                   -> la rotacion NO surtio efecto. Sigue abierto.
    nuevo RECHAZADO                  -> el servicio se va a quedar sin visor.
"""

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
BLOB_PUBLICADO = 'ffa9d177'      # el .env que quedo publicado en ambos repos
AUTH = 'https://developer.api.autodesk.com/authentication/v2/token'


def huella(v):
    return hashlib.sha256((v or '').encode()).hexdigest()[:12]


def _del_blob():
    """(client_id, secreto) tal y como quedaron publicados. Nada nuevo se expone."""
    r = subprocess.run(['git', 'cat-file', '-p', BLOB_PUBLICADO], cwd=str(RAIZ),
                       capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if r.returncode != 0:
        return None, None
    cid = sec = None
    for linea in r.stdout.split('\n'):
        if linea.startswith('APS_CLIENT_ID='):
            cid = linea.split('=', 1)[1].strip()
        elif linea.startswith('APS_CLIENT_SECRET='):
            sec = linea.split('=', 1)[1].strip()
    return cid, sec


def _pedir_token(client_id, client_secret):
    """(aceptado, detalle). Nunca devuelve el token ni el secreto."""
    import requests
    try:
        r = requests.post(AUTH, timeout=30,
                          headers={'Content-Type': 'application/x-www-form-urlencoded'},
                          data={'grant_type': 'client_credentials',
                                'client_id': client_id,
                                'client_secret': client_secret,
                                'scope': 'data:read'})
    except Exception as e:
        return None, 'no se pudo conectar con Autodesk: %s' % str(e)[:80]
    if r.status_code == 200:
        return True, 'HTTP 200, token emitido'
    detalle = ''
    try:
        d = r.json()
        detalle = d.get('error') or d.get('errorCode') or ''
    except Exception:
        pass
    return False, 'HTTP %d %s' % (r.status_code, detalle)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--salida', default=None)
    a = ap.parse_args()

    from dotenv import load_dotenv
    load_dotenv(RAIZ / '.env')

    cid_viejo, sec_viejo = _del_blob()
    cid_nuevo = os.getenv('APS_CLIENT_ID')
    sec_nuevo = os.getenv('APS_CLIENT_SECRET')

    print('VERIFICACION DE LA ROTACION DEL SECRETO APS (N19)')
    print('=' * 60)
    if not sec_viejo:
        print('No se pudo leer el blob publicado %s.' % BLOB_PUBLICADO)
        return 2
    if not sec_nuevo:
        print('No hay APS_CLIENT_SECRET en el entorno: nada que comparar.')
        return 2

    mismo = huella(sec_viejo) == huella(sec_nuevo)
    print('client_id                 : %s...%s' % (cid_nuevo[:6], cid_nuevo[-4:]))
    print('huella del secreto viejo  : %s   (el del repositorio publico)' % huella(sec_viejo))
    print('huella del secreto en uso : %s' % huella(sec_nuevo))
    print('¿son el MISMO?            : %s' % ('SI -- todavia no se ha rotado' if mismo else 'no'))
    print()

    print('1. Probando el secreto PUBLICADO contra Autodesk (deberia RECHAZARSE)')
    viejo_ok, det_viejo = _pedir_token(cid_viejo or cid_nuevo, sec_viejo)
    print('   -> %s   %s' % ('ACEPTADO' if viejo_ok else 'rechazado', det_viejo))

    print('2. Probando el secreto EN USO (deberia ACEPTARSE)')
    nuevo_ok, det_nuevo = _pedir_token(cid_nuevo, sec_nuevo)
    print('   -> %s   %s' % ('aceptado' if nuevo_ok else 'RECHAZADO', det_nuevo))

    print()
    if viejo_ok:
        veredicto = 'NO ROTADO: el secreto publicado SIGUE SIENDO VALIDO'
    elif not nuevo_ok:
        veredicto = 'ROTADO PERO MAL CONFIGURADO: el secreto en uso no vale'
    else:
        veredicto = 'ROTACION CORRECTA: el publicado ya no sirve, el nuevo si'
    print('VEREDICTO: %s' % veredicto)

    destino = pathlib.Path(a.salida) if a.salida else (RAIZ / 'docs' / 'entidad' / 'evidencias')
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / ('rotacion-aps-%s.json' % time.strftime('%Y%m%d-%H%M'))
    # La evidencia lleva huellas y veredictos. Nunca valores.
    ruta.write_text(json.dumps({
        'cuando': time.strftime('%Y-%m-%d %H:%M:%S'),
        'hallazgo': 'N19',
        'blob_publicado': BLOB_PUBLICADO,
        'huella_secreto_publicado': huella(sec_viejo),
        'huella_secreto_en_uso': huella(sec_nuevo),
        'son_el_mismo': mismo,
        'publicado_aceptado_por_autodesk': viejo_ok,
        'detalle_publicado': det_viejo,
        'en_uso_aceptado_por_autodesk': nuevo_ok,
        'detalle_en_uso': det_nuevo,
        'veredicto': veredicto,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print('evidencia: %s' % ruta)
    return 0 if (not viejo_ok and nuevo_ok) else 1


if __name__ == '__main__':
    sys.exit(main())
