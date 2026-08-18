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

    # 3. LA PREGUNTA QUE DECIDE: ¿lo que hay en 'global' es una COPIA de lo que
    #    ya vive bajo su frente? Si lo es, no hay nada que migrar ni que
    #    declarar: hay algo que sobra.
    print()
    print('=' * 72)
    print("¿ES 'global' UNA COPIA SOBRANTE?")
    print('=' * 72)
    print('Se compara el CONTENIDO, no el recuento: contar igual no es ser igual.')
    print()

    # (tabla, columnas que identifican una fila de verdad)
    COMPARABLES = [
        ('lob_activities', 'activity_id, start_date, finish_date, percent, status'),
        ('lob_partidas',   'codigo, descripcion, unidad, metrado, pu'),
        ('lob_avance',     'codigo, periodo, metrado_ejec'),
        ('lob_frentes',    'frente, cod_base'),
    ]
    veredictos = []
    for tabla, cols in COMPARABLES:
        try:
            cur.execute("SELECT DISTINCT model_urn FROM %s"
                        " WHERE model_urn IS NOT NULL AND model_urn <> 'global'" % tabla)
            otros = [r[0] for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            print('  %-16s (no se pudo leer: %s)' % (tabla, str(e)[:30]))
            continue
        if not otros:
            print('  %-16s no hay otro scope con el que comparar' % tabla)
            continue
        cur.execute("SELECT COUNT(*) FROM %s WHERE model_urn = 'global'" % tabla)
        en_global = cur.fetchone()[0]
        if not en_global:
            continue
        for otro in otros:
            cur.execute(
                "SELECT COUNT(*) FROM ("
                "  SELECT %s FROM %s WHERE model_urn = 'global'"
                "  EXCEPT"
                "  SELECT %s FROM %s WHERE model_urn = %%s) d"
                % (cols, tabla, cols, tabla), (otro,))
            sueltas = cur.fetchone()[0]
            estado = ('COPIA EXACTA de %s' % otro) if sueltas == 0 else (
                '%d filas que NO estan en %s' % (sueltas, otro))
            print('  %-16s %d en global -> %s' % (tabla, en_global, estado))
            veredictos.append(sueltas == 0)

    print()
    if veredictos and all(veredictos):
        print('  VEREDICTO: todo lo que hay en \'global\' esta YA, identico, bajo su')
        print('  frente real. Y las rutas de lectura de LOB rechazan el scope')
        print("  'global', asi que esas filas no se pueden leer por ninguna via de")
        print('  la API: son una copia sobrante e inalcanzable.')
        print()
        print('  Eso convierte N72 en un BORRADO, no en una migracion: no hay nada')
        print('  que atribuir, y por tanto ningun riesgo de atribuir mal.')
        print('  ANTES DE BORRAR: copia de seguridad, y este mismo informe como')
        print('  evidencia de que lo borrado estaba duplicado.')
    elif veredictos:
        print('  VEREDICTO: hay filas en \'global\' que NO estan bajo ningun frente.')
        print('  Esas SI son datos unicos: no se pueden borrar, y hay que decidir')
        print('  si se migran (solo las que demuestren su obra) o se declaran.')

    cur.close()
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
