# -*- coding: utf-8 -*-
"""Cuanto hay viviendo en el espacio 'global', tabla por tabla. (N72)

POR QUE HACE FALTA ESTA HERRAMIENTA
-----------------------------------
`resolve_project_id('global')` devuelve la obra POR DEFECTO, y ese defecto SOLO
existe si hay exactamente UNA obra activa. Con dos o mas devuelve None. El
backend usa 'global' como valor por defecto en 110 sitios y los frontales lo
mandan literal cuando no hay proyecto seleccionado.

Consecuencia: hoy medio sistema resuelve obra POR ACCIDENTE. El dia que se active
una segunda obra, todas esas rutas dejan de resolver a la vez -- y con
ENFORCE_PROJECT_AUTHZ encendido, dejan de responder.

La decision (migrar lo que esta en 'global' a su obra, o declarar 'global' un
espacio legitimo con reglas propias) NO se puede tomar sin saber cuanto hay y
donde. Eso vive en la base de PRODUCCION, no en el codigo.

QUE HACE, Y QUE NO
------------------
SOLO LEE. No escribe, no borra, no migra nada: ni un UPDATE en todo el fichero.
Imprime RECUENTOS -- cuantas filas -- nunca contenido. Ninguna ruta de documento,
ningun nombre de fichero, ningun correo. Un inventario no necesita mirar dentro.

COMO SE EJECUTA
    Las credenciales van por ENTORNO, nunca por argumento: un argumento queda en
    el historial del terminal y en la lista de procesos.

        cd backend
        DB_HOST=... DB_NAME=... DB_USER=... DB_PASS=... DB_PORT=5432 \\
            python herramientas/inventario_del_espacio_global.py

    En Windows (PowerShell), definir $env:DB_HOST etc. antes de la llamada.

COMO SE LEE EL RESULTADO
    obras activas = 1   -> hoy 'global' resuelve por accidente a esa obra.
                           El dia que actives la segunda, se cae.
    obras activas > 1   -> 'global' YA no resuelve: esas filas estan fuera del
                           control por obra en este momento.
    filas en 'global'   -> lo que habria que migrar, o declarar.
"""

import os
import sys

# Tablas que declaran obra con una columna de texto que puede valer 'global'.
# Se descubren de la propia base, no de una lista escrita a mano: una lista a
# mano envejece y deja tablas nuevas fuera del inventario sin que nadie lo note.
COLUMNAS_DE_OBRA = ('model_urn', 'project_id', 'project', 'scope')


def _conexion():
    import psycopg2
    faltan = [v for v in ('DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS')
              if not (os.getenv(v) or '').strip()]
    if faltan:
        print('Faltan variables de entorno: %s' % ', '.join(faltan))
        print('Se leen del ENTORNO a proposito, nunca de un argumento.')
        sys.exit(2)
    return psycopg2.connect(
        host=os.getenv('DB_HOST'), dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASS'),
        port=os.getenv('DB_PORT', '5432'), connect_timeout=15)


def main():
    conn = _conexion()
    cur = conn.cursor()

    print('INVENTARIO DEL ESPACIO GLOBAL (N72)')
    print('=' * 72)
    print('base: %s   servidor: %s (enmascarado)'
          % (os.getenv('DB_NAME'), (os.getenv('DB_HOST') or '')[:4] + '...'))
    print()

    # 1. Cuantas obras hay, y cuantas activas. Es lo que decide si 'global'
    #    resuelve o no.
    cur.execute('SELECT COUNT(*) FROM projects')
    total_obras = cur.fetchone()[0]
    activas = None
    try:
        cur.execute("SELECT COUNT(*) FROM projects WHERE COALESCE(status,'active') = 'active'")
        activas = cur.fetchone()[0]
    except Exception:
        conn.rollback()

    print('obras registradas : %d' % total_obras)
    if activas is None:
        print('obras activas     : no se pudo determinar (columna status ausente)')
    else:
        print('obras activas     : %d' % activas)
        if activas == 1:
            print('  -> hoy \'global\' resuelve POR ACCIDENTE a esa unica obra.')
            print('     El dia que actives la segunda, todo lo que este en')
            print('     \'global\' deja de resolver a la vez.')
        elif activas > 1:
            print('  -> \'global\' YA NO RESUELVE. Esas filas estan AHORA MISMO')
            print('     fuera del control por obra.')
        else:
            print('  -> sin obras activas: \'global\' no resuelve.')
    print()

    # 2. Que tablas declaran obra. Se pregunta a la base.
    cur.execute("""
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name = ANY(%s)
           AND data_type IN ('text', 'character varying')
         ORDER BY table_name, column_name
    """, (list(COLUMNAS_DE_OBRA),))
    columnas = cur.fetchall()

    print('%-32s %10s %10s %10s' % ('tabla.columna', 'total', "'global'", 'vacio'))
    print('-' * 72)

    en_global, sin_obra, filas_totales = 0, 0, 0
    con_global = []
    for tabla, col in columnas:
        try:
            cur.execute('SELECT COUNT(*), '
                        ' COUNT(*) FILTER (WHERE %s = \'global\'), '
                        ' COUNT(*) FILTER (WHERE %s IS NULL OR btrim(%s) = \'\') '
                        ' FROM %s' % ('"%s"' % col, '"%s"' % col, '"%s"' % col, '"%s"' % tabla))
            total, glob, vacio = cur.fetchone()
        except Exception as e:
            conn.rollback()
            print('%-32s   (no se pudo leer: %s)' % ('%s.%s' % (tabla, col), str(e)[:28]))
            continue
        filas_totales += total
        en_global += glob
        sin_obra += vacio
        if glob or vacio:
            con_global.append((tabla, col, total, glob, vacio))
            print('%-32s %10d %10d %10d' % ('%s.%s' % (tabla, col), total, glob, vacio))

    print('-' * 72)
    print('%-32s %10d %10d %10d' % ('TOTAL', filas_totales, en_global, sin_obra))
    print()
    print('QUE SIGNIFICA')
    print("  filas en 'global' : %d -- viven en el espacio sin obra." % en_global)
    print('  filas vacias      : %d -- no declaran obra en absoluto.' % sin_obra)
    print()
    if en_global == 0 and sin_obra == 0:
        print('  Nada que migrar. La decision de N72 se puede tomar sin coste de datos:')
        print("  basta con dejar de aceptar 'global' como valor de obra.")
    else:
        print('  Estas filas son las que deciden N72. Migrarlas a su obra las mete')
        print('  bajo el control por obra; dejarlas exige declarar que es \'global\'')
        print('  y con que reglas se trata.')
        print()
        print('  OJO: migrar NO es trivial en todas. En file_nodes, model_urn NO')
        print('  guarda el id de la obra sino el SCOPE DEL FRENTE, y escribir el id')
        print('  ahi dejaria esas filas incompatibles con sus hermanas. Es la misma')
        print('  leccion que backfill_obra.documentos() ya tiene escrita: un dato')
        print('  sin obra es preferible a un dato en la obra equivocada.')

    cur.close()
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
