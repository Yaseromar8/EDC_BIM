# -*- coding: utf-8 -*-
"""Pone o cambia la contrasena de un usuario en la base LOCAL de desarrollo.

POR QUE HACE FALTA ESTO
-----------------------
Desde que el entorno local dejo de apuntar a la base de produccion, la base de
desarrollo (`ecd_prueba`) tiene su propia copia de los usuarios, con sus propias
contrasenas. Entrar en local con la contrasena de produccion da
"Correo o contrasena incorrectos", y es lo correcto: son dos sistemas distintos y
esa es justamente la separacion que se buscaba.

COMO SE USA
-----------
    cd backend
    python herramientas/clave_local.py omarsanchezh8@gmail.com

La contrasena se teclea y NO se ve: ni en la pantalla, ni en el historial del
shell, ni en este fichero, ni en el registro de la aplicacion.

POR QUE SE NIEGA A CORRER FUERA DE LOCAL
----------------------------------------
Porque una herramienta que cambia contrasenas y se conecta a donde diga un
fichero de configuracion acaba, un dia de prisas, apuntando a produccion. Aqui
la comprobacion es explicita y no se puede saltar con un parametro: si el host
no es la maquina, no hay nada que discutir.
"""

import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HOSTS_LOCALES = ('127.0.0.1', 'localhost', '::1')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit('Falta el correo. Ejemplo: python herramientas/clave_local.py alguien@obra.test')
    correo = sys.argv[1].strip().lower()

    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), '.env'))

    host = (os.getenv('DB_HOST') or '').strip()
    base = os.getenv('DB_NAME')
    if host not in HOSTS_LOCALES:
        raise SystemExit(
            f'NO. DB_HOST es {host!r}, que no es esta maquina.\n'
            f'Esta herramienta solo toca la base de desarrollo. Para produccion, '
            f'el propietario cambia la contrasena por la via normal de la aplicacion.')

    print(f'Base de desarrollo: {host}/{base}')

    import db
    db.init_db_pool()
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, name, role FROM users WHERE lower(email) = %s', (correo,))
        fila = cur.fetchone()
        if not fila:
            cur.execute('SELECT email FROM users ORDER BY id')
            existentes = [r[0] for r in cur.fetchall()]
            raise SystemExit(f'No hay ningun usuario {correo!r} en esta base.\n'
                             f'Los que hay: {", ".join(existentes)}')
        uid, nombre, rol = fila
        print(f'Usuario: {nombre} (id={uid}, rol={rol})')

    clave = getpass.getpass('Contrasena nueva (no se vera): ')
    if clave != getpass.getpass('Repitela para confirmar: '):
        raise SystemExit('No coinciden. No se ha cambiado nada.')

    # La misma politica que la aplicacion. Una base de desarrollo con
    # contrasenas de tres letras es la que acaba copiada a otro sitio.
    try:
        from password_policy import validar
    except ImportError:
        validar = None
    if validar is not None:
        # validar() devuelve None si la contrasena es aceptable, o el mensaje
        # que explica que corregir.
        motivo = validar(clave, correo=correo)
        if motivo:
            raise SystemExit(f'La contrasena no vale: {motivo}')
    elif len(clave) < 8:
        raise SystemExit('Al menos 8 caracteres.')

    from werkzeug.security import generate_password_hash
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE users SET password_hash = %s WHERE id = %s',
                    (generate_password_hash(clave), uid))
        conn.commit()

    # Las sesiones abiertas con la contrasena anterior dejan de valer.
    try:
        from auth_middleware import revoke_all_sessions
        revoke_all_sessions(uid)
    except Exception as e:
        print(f'(aviso: no se pudieron revocar las sesiones abiertas: {e})')

    print(f'Listo. Ya puedes entrar en local como {correo}.')


if __name__ == '__main__':
    main()
