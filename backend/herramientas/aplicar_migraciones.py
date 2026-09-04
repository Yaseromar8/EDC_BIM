# -*- coding: utf-8 -*-
"""Aplica las migraciones de `backend/sql/` en orden. La mitad que faltaba.

POR QUE EXISTE
--------------
El 4-sep-2026 se ensayo por primera vez restaurar una copia de PRODUCCION, y el
resultado fue `CON DESCUADRES`: de 118 tablas se recuperaron 86. Las 32 que no
se recuperaron incluian `users`, `project_users` y `doc_reviews` -- es decir,
una recuperacion en la que NADIE PODRIA ENTRAR.

La causa no era la copia: la copia estaba entera. Era que el esquema de destino
se construia solo con `bootstrap_esquema.py`, y el censo demostro que las 28
tablas y las 10 columnas que faltaban vienen TODAS de ficheros de
`backend/sql/`. Ninguna de codigo Python.

Dicho de otra forma: el esquema de esta plataforma es CODIGO **mas**
MIGRACIONES, y la receta de recuperacion solo tenia la primera mitad.

POR QUE `psql -f` Y NO psycopg2
-------------------------------
Porque asi es como las aplica una persona siguiendo ARRANQUE.md, y lo que hay
que demostrar es ESE procedimiento, no una imitacion parecida. Ademas psql
entiende las ordenes con `\\` y respeta los `BEGIN`/`COMMIT` que traigan los
ficheros; psycopg2 los envolveria en su propia transaccion y cambiaria la
semantica sin avisar.

QUE APLICA Y QUE NO
-------------------
Aplica todo `NN_*.sql` con NN >= 06, en orden numerico. Se deriva del directorio
en vez de estar escrito aqui, para que una migracion nueva entre sola.

NO aplica:
  * 00-05  identidad, propiedad y permisos. Son otra operacion, necesitan
           superusuario y las cubre el procedimiento de separacion de
           identidades. `bootstrap_esquema` ya aplica `03_grants_ida.sql`.
  * *rollback*, *vuelta*   son deshacer, no avanzar. Aplicarlos "por orden"
           destruiria lo que acaba de crearse.
  * separacion_identidades.sql   sin numero: no es de la serie.

CADA FICHERO CON `ON_ERROR_STOP=1`, y cada uno se reporta. Si uno falla se
anota y se sigue con los demas: el dia de la urgencia, saber que fallaron dos
de veintitres vale mas que un mensaje de error y ninguna tabla.

    python herramientas/aplicar_migraciones.py                 # usa el entorno
    python herramientas/aplicar_migraciones.py --hasta 26       # parar en la 26
    python herramientas/aplicar_migraciones.py --listar         # no aplica nada
"""
import argparse
import os
import pathlib
import re
import shutil
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SQL = RAIZ / 'sql'

# Deshacer, no avanzar. La comprobacion es por NOMBRE porque es lo que un
# operador ve; si algun dia se anade otro, cae aqui solo.
EXCLUIR = re.compile(r'rollback|vuelta', re.I)

# 00-05 son identidad/propiedad/permisos: otra operacion, otro rol.
DESDE = 6


def migraciones(hasta=None):
    """(numero, ruta) en orden numerico. Derivado del directorio, no escrito."""
    salida = []
    for p in sorted(SQL.glob('*.sql')):
        m = re.match(r'^(\d+)_', p.name)
        if not m:
            continue                      # separacion_identidades.sql y similares
        n = int(m.group(1))
        if n < DESDE:
            continue
        if EXCLUIR.search(p.name):
            continue
        if hasta is not None and n > hasta:
            continue
        salida.append((n, p))
    return sorted(salida, key=lambda t: (t[0], t[1].name))


def _psql():
    """psql del PATH, o el de una instalacion tipica de Windows."""
    exe = shutil.which('psql')
    if exe:
        return exe
    for v in ('18', '17', '16', '15'):
        p = pathlib.Path(r'C:/Program Files/PostgreSQL/%s/bin/psql.exe' % v)
        if p.exists():
            return str(p)
    return None


def aplicar(hasta=None, silencioso=False):
    exe = _psql()
    if not exe:
        print('NEGADO: no encuentro psql. Sin el no se pueden aplicar las migraciones.')
        return 2

    faltan = [k for k in ('DB_HOST', 'DB_NAME', 'DB_USER') if not os.getenv(k)]
    if faltan:
        print('NEGADO: faltan %s en el entorno.' % ', '.join(faltan))
        return 2

    entorno = dict(os.environ)
    if os.getenv('DB_PASS'):
        entorno['PGPASSWORD'] = os.environ['DB_PASS']

    # LA IDENTIDAD IMPORTA, Y NO ES UN DETALLE DE ESTILO.
    # ARRANQUE.md dice que las migraciones corren como `ecd_migrator`. No es una
    # preferencia: `26_ng04_avance.sql` empieza con
    #     ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator ...
    # y esa sentencia SOLO la puede ejecutar ese rol. Aplicadas como `ecd_app`
    # pasan veintidos y falla la veintitres -- comprobado el 4-sep-2026-- y el
    # esquema queda a un privilegio de reproducir produccion sin que nadie lo
    # note hasta el dia que haga falta.
    migrador = (os.getenv('ROL_MIGRADOR') or 'ecd_migrator').strip()
    if (os.getenv('DB_USER') or '').strip() != migrador:
        print('AVISO: aplicando como `%s`, no como `%s`.' % (os.getenv('DB_USER'), migrador))
        print('       ARRANQUE.md exige el rol de migracion. Espera fallos en las')
        print('       migraciones que tocan privilegios por omision.')
        print()

    lista = migraciones(hasta)
    destino = '%s:%s/%s como %s' % (os.getenv('DB_HOST'), os.getenv('DB_PORT', '5432'),
                                    os.getenv('DB_NAME'), os.getenv('DB_USER'))
    print('Destino : %s' % destino)
    print('Aplicar : %d migraciones (de la %02d en adelante)\n' % (len(lista), DESDE))

    fallos = []
    for n, p in lista:
        r = subprocess.run(
            [exe, '-v', 'ON_ERROR_STOP=1', '-q',
             '-h', os.getenv('DB_HOST'), '-p', os.getenv('DB_PORT', '5432'),
             '-U', os.getenv('DB_USER'), '-d', os.getenv('DB_NAME'),
             '-f', str(p)],
            env=entorno, capture_output=True, text=True, errors='replace')
        if r.returncode == 0:
            if not silencioso:
                print('   ok       %s' % p.name)
        else:
            motivo = (r.stderr or r.stdout or '').strip().splitlines()
            motivo = motivo[0][:110] if motivo else 'codigo %d' % r.returncode
            print('   FALLO    %-44s %s' % (p.name, motivo))
            fallos.append((p.name, motivo))

    print()
    print('%d de %d aplicadas.' % (len(lista) - len(fallos), len(lista)))
    if fallos:
        print('NO aplicadas:')
        for nombre, motivo in fallos:
            print('   %-44s %s' % (nombre, motivo))
    return 1 if fallos else 0


def main():
    ap = argparse.ArgumentParser(description='Aplica backend/sql/*.sql en orden.')
    ap.add_argument('--hasta', type=int, default=None,
                    help='numero de la ultima migracion a aplicar')
    ap.add_argument('--listar', action='store_true',
                    help='ensena que se aplicaria, sin tocar la base')
    a = ap.parse_args()

    if a.listar:
        for n, p in migraciones(a.hasta):
            print('   %02d  %s' % (n, p.name))
        excluidas = [p.name for p in sorted(SQL.glob('*.sql'))
                     if EXCLUIR.search(p.name) or not re.match(r'^(\d+)_', p.name)
                     or int(re.match(r'^(\d+)_', p.name).group(1)) < DESDE]
        print('\n   fuera (a proposito): %s' % ', '.join(excluidas))
        return 0
    return aplicar(a.hasta)


if __name__ == '__main__':
    raise SystemExit(main())
