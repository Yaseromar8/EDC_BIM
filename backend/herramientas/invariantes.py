# -*- coding: utf-8 -*-
"""Huella del estado que NO debe cambiar. Se ejecuta antes y despues del nucleo.

QUE MIDE Y POR QUE
------------------
El compromiso del nucleo minimo es que no se reescribe informacion historica.
Eso no se demuestra prometiendolo: se demuestra tomando una huella antes, otra
despues, y comparandolas. Lo que se mide:

  - documentos y versiones: cuantos, y la huella COMBINADA de todos sus
    (id, version_number, gcs_urn, sha256). Si alguien reescribe una ruta de
    objeto o una huella de contenido, este numero cambia.
  - auditoria: cuantas filas. `activity_log` es de solo anexar; puede crecer,
    nunca menguar.
  - alcances: el conjunto de valores distintos de model_urn por tabla. Si una
    migracion reescribiera un alcance historico, cambiaria.

Uso:  python herramientas/invariantes.py [etiqueta]
"""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection


def _huella(filas):
    """SHA-256 de una lista de filas, en orden estable."""
    h = hashlib.sha256()
    for f in sorted(filas):
        h.update(('\x1f'.join('' if v is None else str(v) for v in f) + '\x1e').encode())
    return h.hexdigest()


def tomar():
    inv = {}
    with get_db_connection() as conn:
        cur = conn.cursor()

        # -- Documentos y versiones: identidad, almacenamiento y contenido --
        cur.execute("SELECT id::text, model_urn, gcs_urn, is_deleted FROM file_nodes")
        nodos = cur.fetchall()
        inv['file_nodes'] = {'filas': len(nodos), 'huella': _huella(nodos)}

        cur.execute("""SELECT id::text, file_node_id::text, version_number,
                              gcs_urn, sha256 FROM file_versions""")
        versiones = cur.fetchall()
        inv['file_versions'] = {'filas': len(versiones), 'huella': _huella(versiones)}
        inv['versiones_con_sha256'] = sum(1 for v in versiones if v[4])

        # -- Auditoria: solo puede crecer --
        for tabla in ('activity_log', 'auth_events'):
            try:
                cur.execute('SELECT count(*) FROM ' + tabla)
                inv[tabla] = {'filas': cur.fetchone()[0]}
            except Exception:
                conn.rollback()

        # -- Alcances historicos por tabla: ninguno debe reescribirse --
        cur.execute("""SELECT c.relname, a.attname FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_attribute a ON a.attrelid = c.oid
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND a.attnum > 0 AND NOT a.attisdropped
              AND a.attname IN ('model_urn', 'scope_urn')
            ORDER BY 1, 2""")
        alcances = {}
        for tabla, col in cur.fetchall():
            try:
                cur.execute('SELECT DISTINCT %s::text FROM %s' % (col, tabla))
                alcances['%s.%s' % (tabla, col)] = _huella(cur.fetchall())
            except Exception:
                conn.rollback()
        inv['alcances'] = alcances
    return inv


if __name__ == '__main__':
    etiqueta = sys.argv[1] if len(sys.argv) > 1 else 'ahora'
    init_db_pool()
    inv = tomar()
    destino = pathlib.Path(__file__).resolve().parent.parent.parent / 'docs' / 'entidad' / 'evidencias'
    destino.mkdir(parents=True, exist_ok=True)
    fichero = destino / ('invariantes-%s.json' % etiqueta)
    fichero.write_text(json.dumps(inv, indent=2, sort_keys=True), encoding='utf-8')
    print('Invariantes (%s):' % etiqueta)
    print('  file_nodes      %6d filas  huella %s' % (inv['file_nodes']['filas'], inv['file_nodes']['huella'][:16]))
    print('  file_versions   %6d filas  huella %s' % (inv['file_versions']['filas'], inv['file_versions']['huella'][:16]))
    print('  con SHA-256     %6d' % inv['versiones_con_sha256'])
    print('  activity_log    %6d filas' % inv.get('activity_log', {}).get('filas', -1))
    print('  alcances medidos en %d columnas' % len(inv['alcances']))
    print('  -> %s' % fichero)
