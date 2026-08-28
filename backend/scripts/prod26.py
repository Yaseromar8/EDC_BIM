# -*- coding: utf-8 -*-
"""PROD 26 · NG-04 avance físico + PRIVILEGE SWEEP — el botón del dueño.

Corre la migración 26 contra producción COMO ecd_migrator, con la clave del
fichero local (jamás se imprime). El ensayo con ROLLBACK ya pasó completo el
28-ago-2026: estructura, checks vetando auto-aprobado y magnitud negativa,
sweep 110→53 tablas con DELETE, lista blanca intacta y ACL por defecto sin
`d`. Este script hace LO MISMO y termina en COMMIT.

Ejecutar UNA vez:  python backend/scripts/prod26.py
"""
import io
import sys

import psycopg2

SQL = io.open('D:/VISOR_APS_TL/backend/sql/26_ng04_avance.sql',
              encoding='utf-8').read()
pwd = io.open('D:/copias-ecd/clave-migrator.txt',
              encoding='utf-8').read().strip()

conn = psycopg2.connect(host='34.86.206.187', port=5432, dbname='postgres',
                        user='ecd_migrator', password=pwd, sslmode='require',
                        connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()
try:
    cur.execute("SELECT to_regclass('avance_campo')")
    if cur.fetchone()[0]:
        print('avance_campo ya existe: la 26 parece aplicada. No se repite.')
        sys.exit(0)
    cur.execute(SQL)

    # verificación ANTES del commit: si algo no cuadra, rollback y se avisa
    cur.execute("""SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_name = 'avance_campo'""")
    columnas = cur.fetchone()[0]
    cur.execute("""SELECT COUNT(*) FROM (SELECT tablename FROM pg_tables
                    WHERE schemaname='public' OFFSET 0) t
                   WHERE has_table_privilege('ecd_app',
                         format('public.%I', t.tablename), 'DELETE')""")
    con_delete = cur.fetchone()[0]
    cur.execute("SELECT has_table_privilege('ecd_app', 'encargos', 'DELETE')")
    blanca_ok = cur.fetchone()[0]
    if columnas != 40 or con_delete > 60 or not blanca_ok:
        conn.rollback()
        print('VERIFICACION FALLIDA (columnas=%s, con_delete=%s, '
              'lista_blanca=%s): ROLLBACK, nada cambió. Avisa a Claude.'
              % (columnas, con_delete, blanca_ok))
        sys.exit(1)

    conn.commit()
    print('MIGRACION 26 APLICADA Y VERIFICADA.')
    print('  avance_campo: %s columnas · tablas con DELETE: %s (antes 110)'
          % (columnas, con_delete))
    print('Siguiente paso: Manual Deploy del backend en Render.')
except SystemExit:
    raise
except Exception as e:
    conn.rollback()
    print('ERROR — ROLLBACK ejecutado, nada cambió:')
    print('  %s' % str(e)[:400])
    sys.exit(1)
finally:
    conn.close()
