# -*- coding: utf-8 -*-
"""RECUPERACIÓN DE EMERGENCIA DE LA CUSTODIA DE LA ENTIDAD.

QUÉ PROBLEMA RESUELVE
---------------------
La instancia tiene UN Entity Admin (decisión A del PASO 14, 22-ago-2026). El
producto ya impide quedarse sin administrador -- «Es el único administrador
activo: asigna otro antes» -- pero esa guardia protege del descuido, no de la
PÉRDIDA DE ACCESO: contraseña olvidada, teléfono del segundo factor perdido,
cuenta desactivada por error. En ese caso no hay puerta de vuelta desde la
interfaz, y la entidad se queda sin quien invite, cree obras o administre.

Este guion es esa puerta. No es un atajo cómodo: es el cristal que se rompe.

ANTES DE USARLO: LOS CÓDIGOS DE RECUPERACIÓN
--------------------------------------------
Si lo único perdido es el TELÉFONO, no hace falta esto. La cuenta tiene códigos
de recuperación de un solo uso, emitidos al activar el segundo factor: se
escribe uno en lugar del código de 6 cifras y se entra. Este guion es el nivel
siguiente, para cuando ESO tampoco está disponible.

QUÉ CREDENCIAL PIDE, Y CUÁL NO
------------------------------
Corre con el usuario de APLICACIÓN (`ecd_app`) -- comprobado el 22-ago-2026:
tiene UPDATE sobre `users`, SELECT sobre `totp_recuperacion` y DELETE sobre
`sessions`, que es todo lo que hace falta. **NO necesita el superusuario de la
base**, ni ningún permiso de DDL. Esa es una propiedad deliberada: la
recuperación de la custodia no debe depender de una credencial que se usa para
migrar esquemas.

QUÉ HACE, Y EN QUÉ ORDEN
------------------------
    1. Localiza la cuenta por ADMIN_EMAIL (nunca la adivina).
    2. Enseña su estado ANTES: rol, activa, 2FA, sesiones vivas.
    3. Repone la contraseña -- tecleada, nunca por argumento ni por entorno:
       un argumento queda en el historial del terminal y en la lista de
       procesos, y esto se ejecuta el peor día del año.
    4. Con --retirar-2fa: apaga el segundo factor y borra sus códigos.
    5. Con --reactivar: devuelve `is_active` si estaba retirada.
    6. REVOCA TODAS LAS SESIONES. Si se llegó aquí, hay que echar a quien
       estuviera dentro -- incluida la sesión del propio incidente.
    7. Deja rastro en `auth_events` y enseña el estado DESPUÉS.

    python herramientas/recuperar_custodia.py --diagnostico     (no cambia nada)
    python herramientas/recuperar_custodia.py
    python herramientas/recuperar_custodia.py --retirar-2fa --reactivar

LO QUE NO HACE
--------------
No crea administradores. No cambia el rol de nadie. No toca otra cuenta que la
de ADMIN_EMAIL. Si esa cuenta no existe, se detiene: nombrar un custodio nuevo
es una decisión del propietario, no de un guion de emergencia.
"""
import argparse
import getpass
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from werkzeug.security import generate_password_hash
from db import init_db_pool, get_db_connection
from password_policy import validar as validar_password


def _estado(cur, correo):
    cur.execute("""SELECT u.id, u.name, u.role, COALESCE(u.is_active, TRUE),
                          (u.password_hash = ''), u.totp_activo,
                          (SELECT count(*) FROM sessions s WHERE s.user_id = u.id),
                          (SELECT count(*) FROM totp_recuperacion r
                            WHERE r.user_id = u.id AND r.usado_en IS NULL)
                     FROM users u WHERE lower(u.email) = lower(%s)""", (correo,))
    return cur.fetchone()


def _pintar(fila, momento):
    if not fila:
        print('   %s: la cuenta NO existe.' % momento)
        return
    uid, nombre, rol, activa, pendiente, totp, sesiones, codigos = fila
    print('   %s:' % momento)
    print('     id %s · %s · rol=%s' % (uid, nombre, rol))
    print('     activa=%s · invitación pendiente=%s' % (activa, pendiente))
    print('     2FA=%s · códigos de recuperación sin usar=%s' % (totp, codigos))
    print('     sesiones vivas=%s' % sesiones)


def main():
    ap = argparse.ArgumentParser(description='Recuperación de emergencia de la custodia.')
    ap.add_argument('--diagnostico', action='store_true',
                    help='solo mira: no cambia absolutamente nada')
    ap.add_argument('--retirar-2fa', action='store_true', dest='retirar_2fa',
                    help='apaga el segundo factor y borra sus códigos (teléfono perdido)')
    ap.add_argument('--reactivar', action='store_true',
                    help='devuelve is_active si la cuenta estaba retirada')
    a = ap.parse_args()

    correo = (os.getenv('ADMIN_EMAIL') or '').strip()
    if not correo:
        raise SystemExit('Define ADMIN_EMAIL. Este guion no adivina de quién es la custodia.')

    init_db_pool()
    print('\n' + '=' * 74)
    print('RECUPERACIÓN DE CUSTODIA   %s' % ('DIAGNÓSTICO (no cambia nada)' if a.diagnostico else 'EN CALIENTE'))
    print('=' * 74)
    print('Cuenta  : %s' % correo)

    with get_db_connection() as conn:
        cur = conn.cursor()
        antes = _estado(cur, correo)
        _pintar(antes, 'ANTES')
        if not antes:
            raise SystemExit('\nNo existe esa cuenta. Nombrar un custodio nuevo es una '
                             'decisión del propietario, no de este guion.')
        uid, _n, rol, _act, _pend, totp, _ses, codigos = antes

        if rol != 'admin':
            print('\n   AVISO: esa cuenta NO es Entity Admin (rol=%s). Este guion repone '
                  'el acceso, no concede autoridad.' % rol)

        if a.diagnostico:
            if totp and codigos:
                print('\n   Antes de romper el cristal: quedan %d códigos de recuperación '
                      'sin usar.\n   Si solo perdiste el teléfono, entra con uno de ellos.' % codigos)
            print('\nDiagnóstico. No se cambió nada.\n')
            return 0

        clave = getpass.getpass('\n   contraseña NUEVA (no se muestra): ')
        if clave != getpass.getpass('   repítela: '):
            raise SystemExit('No coinciden. Nada cambiado.')
        fallo = validar_password(clave, correo=correo)
        if fallo:
            raise SystemExit('Contraseña rechazada: %s' % fallo)

        cur.execute('UPDATE users SET password_hash = %s WHERE id = %s',
                    (generate_password_hash(clave), uid))
        del clave
        hecho = ['contraseña repuesta']

        if a.retirar_2fa:
            cur.execute('UPDATE users SET totp_activo = FALSE, totp_secreto = NULL, '
                        '       totp_activado_en = NULL WHERE id = %s', (uid,))
            cur.execute('DELETE FROM totp_recuperacion WHERE user_id = %s', (uid,))
            hecho.append('segundo factor retirado')

        if a.reactivar:
            cur.execute('UPDATE users SET is_active = TRUE WHERE id = %s', (uid,))
            hecho.append('cuenta reactivada')

        # Si se llegó hasta aquí, hay que echar a todo el mundo: incluida la
        # sesión de quien pudo causar el incidente.
        cur.execute('DELETE FROM sessions WHERE user_id = %s', (uid,))
        hecho.append('todas las sesiones revocadas')

        cur.execute('INSERT INTO auth_events (evento, email, user_id, ip, detalle) '
                    ' VALUES (%s, %s, %s, %s, %s)',
                    ('recuperacion_de_custodia', correo, uid, 'guion-local',
                     ' · '.join(hecho)))
        conn.commit()

        print('\n   Hecho: %s' % ' · '.join(hecho))
        _pintar(_estado(cur, correo), 'DESPUÉS')

    print('\n   Entra ahora y, si retiraste el segundo factor, VUELVE A ACTIVARLO')
    print('   desde Seguridad. Una custodia sin 2FA no se deja así.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
