# -*- coding: utf-8 -*-
"""Audita, sin escribir, la separación entre migrador y aplicación.

Lee los catálogos de PostgreSQL y responde qué identidad está conectada, quién
posee los objetos y si la identidad actual puede crear objetos en los schemas
del ECD. No muestra contraseñas, host ni otros secretos.

    python herramientas/auditar_identidades_db.py
    python herramientas/auditar_identidades_db.py --esperar app
    python herramientas/auditar_identidades_db.py --esperar migrator
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

from db import get_db_connection  # noqa: E402


def auditar(cur):
    cur.execute("""
        SELECT current_user,
               current_database(),
               current_setting('server_version'),
               has_schema_privilege(current_user, 'public', 'CREATE'),
               has_schema_privilege(current_user, 'ai_brain', 'CREATE'),
               CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecd_migrator')
                    THEN pg_has_role(current_user, 'ecd_migrator', 'USAGE')
                    ELSE FALSE END
    """)
    usuario, base, version, crea_public, crea_ai, usa_migrador = cur.fetchone()

    cur.execute("""
        SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
          FROM pg_roles
         WHERE rolname IN ('ecd_app', 'ecd_migrator')
         ORDER BY rolname
    """)
    roles = cur.fetchall()

    cur.execute("""
        SELECT tableowner, count(*)
          FROM pg_tables
         WHERE schemaname IN ('public', 'ai_brain')
         GROUP BY tableowner ORDER BY tableowner
    """)
    propietarios = cur.fetchall()

    cur.execute("""
        SELECT schemaname || '.' || tablename
          FROM pg_tables
         WHERE schemaname IN ('public', 'ai_brain')
           AND tableowner = current_user
         ORDER BY 1
    """)
    tablas_propias = [r[0] for r in cur.fetchall()]

    cur.execute("""
        SELECT count(*)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND pg_get_userbyid(c.relowner)=current_user
           AND c.relkind IN ('r','p','v','m','f','S')
    """)
    objetos_propios = cur.fetchone()[0]

    cur.execute("""
        SELECT count(*)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND pg_get_userbyid(p.proowner)=current_user
    """)
    rutinas_propias = cur.fetchone()[0]

    cur.execute("""
        SELECT n.nspname, r.rolname
          FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
         WHERE n.nspname IN ('public', 'ai_brain') ORDER BY n.nspname
    """)
    schemas = cur.fetchall()

    cur.execute("""
        SELECT count(*) FROM information_schema.table_privileges
         WHERE grantee = current_user
    """)
    permisos_tabla = cur.fetchone()[0]

    return {
        'usuario': usuario, 'base': base, 'version': version,
        'crea_public': crea_public, 'crea_ai': crea_ai,
        'usa_migrador': usa_migrador,
        'roles': roles, 'propietarios': propietarios,
        'tablas_propias': tablas_propias, 'objetos_propios': objetos_propios,
        'rutinas_propias': rutinas_propias, 'schemas': schemas,
        'permisos_tabla': permisos_tabla,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--esperar', choices=('app', 'migrator'))
    a = ap.parse_args()

    with get_db_connection() as conn:
        datos = auditar(conn.cursor())

    print('Identidad conectada : %s' % datos['usuario'])
    print('Base / PostgreSQL   : %s / %s' % (datos['base'], datos['version']))
    print('CREATE en public    : %s' % ('SI' if datos['crea_public'] else 'no'))
    print('CREATE en ai_brain  : %s' % ('SI' if datos['crea_ai'] else 'no'))
    print('Puede usar migrator : %s' % ('SI' if datos['usa_migrador'] else 'no'))
    print('Roles ECD           :')
    for rol, login, superuser, createdb, createrole in datos['roles']:
        print('  %-16s login=%s super=%s createdb=%s createrole=%s' %
              (rol, login, superuser, createdb, createrole))
    print('Propietarios tablas : %s' %
          (', '.join('%s=%s' % x for x in datos['propietarios']) or 'ninguno'))
    if datos['tablas_propias']:
        print('Tablas de identidad : %s' % ', '.join(datos['tablas_propias']))
    print('Propietarios schema : %s' %
          (', '.join('%s=%s' % x for x in datos['schemas']) or 'ninguno'))
    print('Grants identidad    : %s' % datos['permisos_tabla'])
    print('Objetos propios     : %s' % datos['objetos_propios'])
    print('Rutinas propias     : %s' % datos['rutinas_propias'])

    if a.esperar == 'app':
        ok = (datos['usuario'].startswith('ecd_app') and
              not datos['crea_public'] and not datos['crea_ai'] and
              not datos['usa_migrador'] and not datos['objetos_propios'] and
              not datos['rutinas_propias'] and
              all(owner != datos['usuario'] for owner, _n in datos['propietarios']))
        print('VEREDICTO APP       : %s' % ('CORRECTO' if ok else 'INCORRECTO'))
        return 0 if ok else 1
    if a.esperar == 'migrator':
        ok = (datos['usuario'] == 'ecd_migrator' and
              datos['crea_public'] and datos['crea_ai'])
        print('VEREDICTO MIGRADOR  : %s' % ('CORRECTO' if ok else 'INCORRECTO'))
        return 0 if ok else 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
