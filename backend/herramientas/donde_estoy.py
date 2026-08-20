# -*- coding: utf-8 -*-
"""¿A que base estoy apuntando, y es la del ECD?

Antes de hacer una copia, un ensayo o cualquier cosa contra una base remota,
conviene poder responder eso sin adivinar. Solo LEE: cuenta tablas y filas.

    cd backend && python herramientas/donde_estoy.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2

FALTAN = [v for v in ('DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS') if not os.getenv(v)]
if FALTAN:
    raise SystemExit('Faltan variables: %s' % ', '.join(FALTAN))

print('=' * 62)
print('DESTINO : %s:%s / %s   como %s'
      % (os.getenv('DB_HOST'), os.getenv('DB_PORT', '5432'),
         os.getenv('DB_NAME'), os.getenv('DB_USER')))
print('=' * 62)

con = psycopg2.connect(host=os.getenv('DB_HOST'), port=os.getenv('DB_PORT', '5432'),
                       dbname=os.getenv('DB_NAME'), user=os.getenv('DB_USER'),
                       password=os.getenv('DB_PASS'), connect_timeout=20)
cur = con.cursor()

cur.execute("SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','ai_brain')")
print('tablas                 : %d' % cur.fetchone()[0])

# Las senales de que esto ES el ECD y no otra base cualquiera.
for tabla, etiqueta in (('file_nodes', 'documentos y carpetas'),
                        ('users', 'usuarios'),
                        ('projects', 'obras')):
    try:
        cur.execute('SELECT count(*) FROM %s' % tabla)
        print('%-22s : %d' % (etiqueta, cur.fetchone()[0]))
    except Exception:
        con.rollback()
        print('%-22s : NO EXISTE esa tabla aqui' % etiqueta)

# El tamano, que decide si un ensayo cabe sin disparar el almacenamiento.
try:
    cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
    print('tamano de la base      : %s' % cur.fetchone()[0])
except Exception:
    con.rollback()

# Que otras bases hay en la instancia, por si el ECD vive en otra.
try:
    cur.execute("SELECT datname, pg_size_pretty(pg_database_size(datname))"
                "  FROM pg_database WHERE datistemplate = false ORDER BY 1")
    print()
    print('bases en esta instancia:')
    for nombre, tam in cur.fetchall():
        marca = '  <- a esta apunto' if nombre == os.getenv('DB_NAME') else ''
        print('   %-24s %10s%s' % (nombre, tam, marca))
except Exception:
    con.rollback()

con.close()
