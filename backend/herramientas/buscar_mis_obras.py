# -*- coding: utf-8 -*-
"""Busca en QUE base de datos local estan tus obras.

POR QUE
-------
En este PostgreSQL local hay varias bases (ecd_dr12, ecd_dr12b, ecd_dr12c,
ecd_dr12d, ecd_prueba...). El backend lee la que diga DB_NAME en el .env, y si
apunta a la equivocada la aplicacion se ve vacia aunque los datos esten ahi al
lado, intactos.

El rol de desarrollo (ecd_app) NO puede leer las otras bases -- y eso es
correcto: es la separacion que impide que un experimento toque lo que no debe.
Por eso esta herramienta pide la contrasena del administrador de PostgreSQL, que
solo tiene el dueno.

QUE HACE
--------
Recorre todas las bases, y en cada una cuenta obras, documentos y modelos, y
busca por nombre lo que le digas. NO modifica NADA: solo lee.

    cd backend
    python herramientas/buscar_mis_obras.py talara interferencias
"""

import getpass
import sys

try:
    import psycopg2
except ImportError:
    raise SystemExit('Falta psycopg2. Actívate el entorno del proyecto (.venv).')

HOST = '127.0.0.1'


def main():
    buscar = [a.lower() for a in sys.argv[1:]] or ['talara', 'interferencia']
    puerto = input('Puerto de PostgreSQL [5433]: ').strip() or '5433'
    usuario = input('Usuario administrador [postgres]: ').strip() or 'postgres'
    clave = getpass.getpass(f'Contrasena de {usuario} (no se vera): ')

    try:
        c = psycopg2.connect(host=HOST, port=puerto, dbname='postgres',
                             user=usuario, password=clave, connect_timeout=8,
                             options='-c client_encoding=UTF8')
    except Exception as e:
        raise SystemExit(f'No se pudo conectar: {str(e)[:120]}')

    cur = c.cursor()
    cur.execute("""SELECT datname FROM pg_database
                    WHERE NOT datistemplate ORDER BY pg_database_size(datname) DESC""")
    bases = [r[0] for r in cur.fetchall()]
    c.close()

    print(f'\nRevisando {len(bases)} bases en {HOST}:{puerto}\n' + '=' * 66)
    encontradas = []
    for base in bases:
        try:
            cc = psycopg2.connect(host=HOST, port=puerto, dbname=base, user=usuario,
                                  password=clave, connect_timeout=8,
                                  options='-c client_encoding=UTF8')
        except Exception as e:
            print(f'{base:20} (no se pudo abrir: {str(e)[:40].strip()})')
            continue
        k = cc.cursor()
        try:
            k.execute("SELECT to_regclass('public.projects')")
            if not k.fetchone()[0]:
                print(f'{base:20} sin tabla projects')
                cc.close()
                continue

            def cuenta(tabla):
                try:
                    k.execute(f'SELECT count(*) FROM {tabla}')
                    return k.fetchone()[0]
                except Exception:
                    return 0

            k.execute('SELECT id, name FROM projects ORDER BY name')
            obras = k.fetchall()
            print(f'\n{base}  ->  {len(obras)} obras · {cuenta("file_nodes")} documentos · '
                  f'{cuenta("model_config")} modelos · {cuenta("inventory_assets")} elementos')
            for oid, nombre in obras:
                marca = ''
                if any(t in (nombre or '').lower() for t in buscar):
                    marca = '   <<< AQUI ESTA'
                    encontradas.append((base, nombre))
                print(f'      {nombre or "(sin nombre)":45} {oid}{marca}')
        except Exception as e:
            print(f'{base:20} error leyendo: {str(e)[:60].strip()}')
        finally:
            cc.close()

    print('\n' + '=' * 66)
    if encontradas:
        print('ENCONTRADO:')
        for base, nombre in encontradas:
            print(f'   "{nombre}"  esta en la base  {base}')
        base = encontradas[0][0]
        print(f'\nPara que el backend lea esa base, en el .env de la raiz del proyecto:')
        print(f'   DB_NAME={base}')
        print('y reinicia el backend. No hace falta tocar nada mas.')
    else:
        print('No aparecio ninguna obra con esos nombres en las bases LOCALES.')
        print('Entonces estan en produccion (Cloud SQL), no en esta maquina.')


if __name__ == '__main__':
    main()
