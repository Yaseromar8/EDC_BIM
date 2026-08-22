# -*- coding: utf-8 -*-
"""Nombra a una persona ADMINISTRADORA DE UNA OBRA, con la política de 2FA.

POR QUÉ EXISTE ESTE GUION Y NO SE HACE POR LA INTERFAZ
------------------------------------------------------
Por la interfaz se puede: Participantes → «Administra esta obra». Este guion
existe para el caso del PASO 14, donde el nombramiento va ATADO A UNA CONDICIÓN
que la interfaz no comprueba todavía:

    POLÍTICA ADOPTADA (propietario, 22-ago-2026):
    un administrador de OBRA REAL debe tener 2FA activo ANTES del nombramiento.

Es una política de seguridad de esta entidad, **no** una exigencia del modelo
ACC/Procore: el organigrama no dice nada del segundo factor. Se escribe aquí para
que quede en un sitio donde se pueda leer, y se COMPRUEBA en vez de confiarse.

QUÉ COMPRUEBA ANTES DE ESCRIBIR (todo o nada)
---------------------------------------------
    · la persona existe, está activa y reclamó su cuenta;
    · tiene `totp_activo` -- la condición del propietario;
    · ES MIEMBRO de esa obra (la administración vive en la fila de membresía:
      sin fila, no hay nada que marcar);
    · la obra existe.

QUÉ NO HACE
-----------
No toca `users.role`: administrar una obra **no** convierte a nadie en Entity
Admin. `ENTITY ADMIN != PROJECT ADMIN` es el principio que este guion respeta al
no ofrecer siquiera la posibilidad.

    python herramientas/nombrar_admin_de_obra.py --usuario 17 --obra 1 --verificar
    python herramientas/nombrar_admin_de_obra.py --usuario 17 --obra 1 --aplicar
"""
import argparse
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection


def main():
    ap = argparse.ArgumentParser(description='Nombrar administrador DE UNA OBRA.')
    ap.add_argument('--usuario', type=int, required=True)
    ap.add_argument('--obra', required=True)
    ap.add_argument('--aplicar', action='store_true', help='sin esto, solo comprueba')
    ap.add_argument('--verificar', action='store_true', help='alias de solo comprobar')
    a = ap.parse_args()

    init_db_pool()
    print('\n' + '=' * 74)
    print('NOMBRAMIENTO DE ADMINISTRADOR DE OBRA   %s'
          % ('APLICAR' if a.aplicar else 'COMPROBACIÓN (no escribe)'))
    print('=' * 74)

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT u.email, u.name, u.role, COALESCE(u.is_active, TRUE),
                              (u.password_hash = ''), u.totp_activo
                         FROM users u WHERE u.id = %s""", (a.usuario,))
        fila = cur.fetchone()
        if not fila:
            raise SystemExit('No existe el usuario %s.' % a.usuario)
        correo, nombre, rol, activa, pendiente, totp = fila

        cur.execute('SELECT name FROM projects WHERE id = %s', (a.obra,))
        obra = cur.fetchone()
        if not obra:
            raise SystemExit('No existe la obra %s.' % a.obra)

        cur.execute('SELECT es_admin FROM project_users '
                    ' WHERE project_id = %s AND user_id = %s', (a.obra, a.usuario))
        membresia = cur.fetchone()

        print('Persona : %s · %s (id %s)' % (nombre, correo, a.usuario))
        print('Obra    : %s · %s' % (obra[0], a.obra))
        print()
        controles = [
            ('cuenta activa', activa),
            ('invitación reclamada', not pendiente),
            ('2FA activo  (política del propietario)', bool(totp)),
            ('es miembro de la obra', membresia is not None),
            ('NO es Entity Admin  (no debe serlo por esto)', rol != 'admin'),
        ]
        for etiqueta, ok in controles:
            print('   %-45s %s' % (etiqueta, 'SI' if ok else '** NO **'))
        if membresia is not None and membresia[0]:
            print('\n   Ya era administradora de esta obra. Nada que hacer.')
            return 0

        faltan = [e for e, ok in controles if not ok]
        if faltan:
            print('\nNO SE NOMBRA. Falta: %s' % ', '.join(faltan))
            return 1
        if not a.aplicar:
            print('\nTodo en regla. Para nombrar de verdad: --aplicar')
            return 0

        cur.execute('UPDATE project_users SET es_admin = TRUE '
                    ' WHERE project_id = %s AND user_id = %s RETURNING user_id',
                    (a.obra, a.usuario))
        if not cur.fetchone():
            raise SystemExit('No se pudo actualizar la membresía.')
        # Mismo asiento que emite la ruta de la interfaz: el rastro no distingue
        # por dónde entró la decisión, y así debe ser.
        cur.execute("""INSERT INTO activity_log (model_urn, action, entity_type,
                                                 entity_id, performed_by, details)
                       VALUES (%s, 'project_admin_concedido', 'user', %s, %s, %s)""",
                    (a.obra, str(a.usuario), 'PASO 14 · adjudicación del propietario',
                     '{"via": "herramienta", "politica_2fa": "verificada"}'))
        conn.commit()
        print('\n   NOMBRADA administradora de %s.' % obra[0])

        cur.execute("""SELECT pu.project_id, pu.es_admin FROM project_users pu
                        WHERE pu.user_id = %s ORDER BY 1""", (a.usuario,))
        print('\n   Alcance final de esta persona:')
        for pid, es in cur.fetchall():
            print('     %-46s admin=%s' % (pid[:46], es))
        cur.execute('SELECT role FROM users WHERE id = %s', (a.usuario,))
        print('     rol de entidad: %s   (debe seguir siendo «user»)' % cur.fetchone()[0])
    print()
    return 0


if __name__ == '__main__':
    sys.exit(main())
