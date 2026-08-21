# -*- coding: utf-8 -*-
"""Que pasaria si se enciende ENFORCE_PROJECT_AUTHZ. Sin encenderlo.

POR QUE HACE FALTA
------------------
`ENFORCE_PROJECT_AUTHZ=true` no es un interruptor de mejora: es el momento en
que la comprobacion de obra deja de observar y empieza a negar. Encenderlo a
ciegas tiene dos formas de salir mal, y las dos se pueden medir antes:

  1. USUARIOS SIN NINGUNA MEMBRESIA. La comprobacion no falla: hace su trabajo.
     Pero si a un usuario nunca se le asigno una obra, bajo ENFORCE deja de
     poder entrar a ninguna. En la base de desarrollo se midieron 14 usuarios no
     administradores activos y solo 5 con alguna membresia.

  2. ALCANCES QUE NO RESUELVEN. Bajo ENFORCE, una peticion dirigida a una ruta
     con datos de obra cuya obra no se puede determinar recibe 403
     PROJECT_UNRESOLVED. Eso es lo correcto -- no saber de quien es una peticion
     no puede resolverse dandola por buena -- pero hay que saber CUANTAS filas
     viven bajo alcances asi antes de encenderlo, no despues.

Este guion no cambia nada. Solo lee y cuenta.

    python herramientas/antes_de_enforce.py
"""
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection, resolve_project_id


def main():
    init_db_pool()
    problemas = 0
    print()
    print('=' * 74)
    print('ANTES DE ENCENDER ENFORCE_PROJECT_AUTHZ')
    print('=' * 74)

    with get_db_connection() as conn:
        cur = conn.cursor()

        # ── 1. Quien se quedaria sin poder entrar a ninguna obra ───────────
        print()
        print('1. USUARIOS SIN NINGUNA MEMBRESIA')
        cur.execute("""SELECT u.id, u.email, u.role FROM users u
                        WHERE u.is_active AND u.role <> 'admin'
                          AND NOT EXISTS (SELECT 1 FROM project_users pu
                                           WHERE pu.user_id = u.id)
                        ORDER BY u.id""")
        sueltos = cur.fetchall()
        cur.execute("SELECT count(*) FROM users WHERE is_active AND role <> 'admin'")
        total = cur.fetchone()[0]
        if sueltos:
            problemas += 1
            print('   %d de %d usuarios no administradores activos no pertenecen a'
                  ' ninguna obra:' % (len(sueltos), total))
            for uid, email, rol in sueltos:
                print('     #%-4s %-38s %s' % (uid, email, rol))
            print()
            print('   Bajo ENFORCE no alcanzarian ningun dato de obra. Hay que')
            print('   asignarlos a su obra ANTES de encenderlo -- no despues, y no')
            print('   relajando la comprobacion.')
        else:
            print('   Ninguno: los %d usuarios activos pertenecen a alguna obra.' % total)

        # ── 2. Los administradores, que saltan la comprobacion ─────────────
        print()
        print('2. ADMINISTRADORES (saltan la comprobacion de obra, a proposito)')
        cur.execute("SELECT id, email FROM users WHERE role = 'admin' AND is_active ORDER BY id")
        admins = cur.fetchall()
        for uid, email in admins:
            print('     #%-4s %s' % (uid, email))
        print('   Con una instancia por entidad, el administrador global ES el de la')
        print('   entidad. Eso es el diseno, no un fallo -- pero cada cuenta de esta')
        print('   lista ve TODAS las obras de la instancia, asi que un participante')
        print('   externo no debe tener este rol.')

        # ── 3. Alcances que no resuelven ───────────────────────────────────
        print()
        print('3. ALCANCES QUE NO RESUELVEN A NINGUNA OBRA')
        cur.execute("""SELECT c.relname, a.attname FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_attribute a ON a.attrelid = c.oid
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND a.attnum > 0 AND NOT a.attisdropped
              AND a.attname IN ('model_urn', 'scope_urn')
            ORDER BY 1, 2""")
        columnas = cur.fetchall()
        huecos = collections.defaultdict(lambda: [0, set()])
        for tabla, col in columnas:
            try:
                cur.execute('SELECT %s::text, count(*) FROM %s '
                            ' WHERE %s IS NOT NULL GROUP BY 1' % (col, tabla, col))
                for valor, n in cur.fetchall():
                    if resolve_project_id(valor) is None:
                        huecos[valor][0] += n
                        huecos[valor][1].add(tabla)
            except Exception:
                conn.rollback()
        if huecos:
            problemas += 1
            print('   %d alcances distintos no se pueden traducir:' % len(huecos))
            for valor, (n, tablas) in sorted(huecos.items(), key=lambda x: -x[1][0]):
                print('     %-44s %7d filas  en %s' % (
                    valor[:44], n, ', '.join(sorted(tablas)[:3])))
            print()
            print('   Bajo ENFORCE, las peticiones dirigidas a estos alcances reciben')
            print('   403 PROJECT_UNRESOLVED. Se arreglan decidiendo su obra:')
            print('     python herramientas/sembrar_referencias.py --aplicar')
        else:
            print('   Ninguno: todos los alcances guardados traducen a una obra.')

        # ── 4. Las claves ajenas ───────────────────────────────────────────
        print()
        print('4. INTEGRIDAD REFERENCIAL')
        cur.execute("""SELECT conname, convalidated FROM pg_constraint
                        WHERE conname IN ('fk_project_users_project','fk_project_users_user',
                                          'fk_projects_hub','fk_project_ref_project')
                        ORDER BY conname""")
        claves = cur.fetchall()
        esperadas = {'fk_project_users_project', 'fk_project_users_user',
                     'fk_projects_hub', 'fk_project_ref_project'}
        faltan = esperadas - {c[0] for c in claves}
        for nombre, validada in claves:
            print('     %-28s %s' % (nombre, 'validada' if validada else 'SIN VALIDAR'))
        if faltan:
            problemas += 1
            print('   FALTAN: %s' % ', '.join(sorted(faltan)))
            print('   El arranque tiene que correr con la identidad de migracion:')
            print('     ecd_migrator -> python bootstrap_esquema.py')

    print()
    print('=' * 74)
    if problemas:
        print('%d asunto(s) que resolver antes de encender ENFORCE.' % problemas)
    else:
        print('Nada pendiente: ENFORCE_PROJECT_AUTHZ se puede encender.')
    print('=' * 74)
    return 1 if problemas else 0


if __name__ == '__main__':
    raise SystemExit(main())
