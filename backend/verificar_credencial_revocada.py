# -*- coding: utf-8 -*-
"""Comprueba que una credencial ya NO sirve, y deja constancia con fecha.

POR QUE EXISTE
--------------
Rotar una contrasena y decir que se ha rotado son dos cosas distintas. Un hallazgo
de credencial expuesta no se cierra con "ya la cambiamos": se cierra con una prueba
de que la anterior fue rechazada, con fecha, hora y el mensaje del servidor.

Este guion INTENTA conectar con la credencial vieja y espera que falle. Si conecta,
la rotacion no surtio efecto y lo dice sin adornos.

NO GUARDA LA CONTRASENA EN NINGUN SITIO. Se pide por teclado y solo se conserva su
huella SHA-256 truncada, que sirve para demostrar que la probada era la que estaba
publicada -comparandola con la huella del commit- sin volver a escribirla.

USO
    python verificar_credencial_revocada.py
    python verificar_credencial_revocada.py --salida docs/entidad/evidencias/
"""

import argparse
import getpass
import hashlib
import os
import sys
from datetime import datetime, timezone


def huella(texto):
    return hashlib.sha256(texto.encode()).hexdigest()[:12]


def probar(host, puerto, base, usuario, password):
    """Devuelve (conecto, detalle). Nunca levanta.

    El mensaje de rechazo llega en la codificacion del SERVIDOR, que en un Windows
    en castellano no es UTF-8. Sin forzar client_encoding, psycopg2 revienta con un
    UnicodeDecodeError al construir el error y la evidencia queda ilegible: el
    fichero decia 'invalid continuation byte' en vez de decir que la contrasena fue
    rechazada. Se fuerza UTF-8 y ademas se decodifica a la defensiva, porque un
    documento de evidencia que no se entiende no sirve de evidencia.
    """
    import psycopg2

    def legible(e):
        for pieza in (getattr(e, 'args', None) or [None])[:1]:
            if isinstance(pieza, bytes):
                return pieza.decode('utf-8', errors='replace').strip()
        try:
            return str(e).strip()
        except UnicodeDecodeError:
            return '(el servidor respondio en una codificacion no legible)'

    try:
        conn = psycopg2.connect(host=host, port=puerto, dbname=base,
                                user=usuario, password=password, connect_timeout=10,
                                options='-c client_encoding=UTF8')
        conn.close()
        return True, 'la conexion SE ESTABLECIO'
    except psycopg2.OperationalError as e:
        return False, legible(e).split('\n')[0][:200]
    except UnicodeDecodeError:
        # El rechazo llego, pero en una codificacion que no se puede leer. Sigue
        # siendo un rechazo: lo que NO ocurrio es una conexion.
        return False, 'conexion rechazada por el servidor (mensaje no decodificable)'
    except Exception as e:                                    # pragma: no cover
        return False, f'{type(e).__name__}: {legible(e)[:180]}'


def main():
    ap = argparse.ArgumentParser(description='Comprueba que una credencial ya no sirve.')
    ap.add_argument('--host', default=os.getenv('DB_HOST'))
    ap.add_argument('--puerto', default=os.getenv('DB_PORT', '5432'))
    ap.add_argument('--base', default=os.getenv('DB_NAME', 'postgres'))
    ap.add_argument('--usuario', default=os.getenv('DB_USER', 'postgres'))
    ap.add_argument('--salida', help='carpeta donde escribir la evidencia')
    a = ap.parse_args()

    if not a.host:
        print('Falta --host (o DB_HOST en el entorno).')
        return 2

    print('Se va a INTENTAR conectar con la contrasena ANTIGUA.')
    print('Lo correcto es que FALLE.\n')
    print('  destino : %s:%s/%s  como %s' % (a.host, a.puerto, a.base, a.usuario))
    vieja = getpass.getpass('  contrasena antigua (no se muestra ni se guarda): ')
    if not vieja:
        print('No se introdujo nada.')
        return 2

    conecto, detalle = probar(a.host, a.puerto, a.base, a.usuario, vieja)
    cuando = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

    lineas = [
        'EVIDENCIA DE REVOCACION DE CREDENCIAL',
        '=' * 52,
        'fecha            : %s' % cuando,
        'servidor         : %s:%s' % (a.host, a.puerto),
        'base             : %s' % a.base,
        'usuario          : %s' % a.usuario,
        'huella probada   : %s   (SHA-256 truncada; la contrasena no se guarda)' % huella(vieja),
        '',
        'RESULTADO        : %s' % ('*** LA CREDENCIAL SIGUE SIENDO VALIDA ***' if conecto
                                   else 'RECHAZADA — la credencial ya no sirve'),
        'detalle          : %s' % detalle,
    ]
    if conecto:
        lineas += ['', 'La rotacion NO ha surtido efecto. Repetir el cambio en la consola',
                   'de Cloud SQL y volver a ejecutar esta comprobacion.']
    texto = '\n'.join(lineas)
    print('\n' + texto)

    if a.salida:
        os.makedirs(a.salida, exist_ok=True)
        nombre = 'revocacion-%s-%s.txt' % (a.usuario,
                                           datetime.now(timezone.utc).strftime('%Y%m%d-%H%M'))
        ruta = os.path.join(a.salida, nombre)
        with open(ruta, 'w', encoding='utf-8') as f:
            f.write(texto + '\n')
        print('\nevidencia escrita en %s' % ruta)

    # Codigo 0 solo si la credencial vieja fue RECHAZADA, que es el resultado bueno.
    return 1 if conecto else 0


if __name__ == '__main__':
    raise SystemExit(main())
