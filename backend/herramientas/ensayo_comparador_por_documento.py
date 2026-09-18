# -*- coding: utf-8 -*-
"""El diff del comparador contra PostgreSQL de verdad: emparejar por documento.

    python herramientas/ensayo_comparador_por_documento.py

POR QUÉ ES UN ENSAYO Y NO UN TEST
---------------------------------
`tests/test_comparador_por_documento.py` comprueba sin base QUÉ consulta se lanza
y QUÉ se devuelve. Que la consulta HAGA lo que dice —que el `NOT EXISTS`
correlacionado y el `JOIN` por linaje den los agregados, eliminados y
modificados correctos— solo se ve ejecutándola. Esto pasa por la ruta real
(`routes.compare.compare_diff` y `compare_element`, con su `get_db_connection`,
su pool y su `search_path`) contra un PostgreSQL de verdad.

DÓNDE CORRE
-----------
En un cluster DESECHABLE que el propio ensayo crea en una carpeta temporal
(`initdb`), arranca en un puerto libre y borra al terminar. No toca ninguna otra
base. La vista `inventory_identity_b1.inventory_assets` se reduce a las columnas
que lee el comparador, con el mismo nombre, esquema, tipo (vista) y permiso
(SELECT para `ecd_app`) que exige `db._configure_inventory_path`.

    PG_BIN   carpeta de initdb/pg_ctl (por defecto C:/Program Files/PostgreSQL/18/bin)

LOS DATOS: el caso medido en producción el 18-sep-2026, en pequeño
------------------------------------------------------------------
    P = el principal (linaje PRINCIPAL), versiones 60 y 64
        v60: p1 p2(A) p3 p4 p6
        v64: p1 p2(B) p3 p4 p5          <- p2 cambió, p5 nuevo, p6 quitado
    E = los encofrados (linaje ENCOFRADOS) v31, derivado de P:
        p2(E) p3 e1 e2                  <- conserva p2 (con otra marca) y p3 (igual)
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PG_BIN = os.getenv('PG_BIN', r'C:/Program Files/PostgreSQL/18/bin')
BASE = 'ecd_ensayo_comparador'
CLAVE = 'clave_desechable_comparador'


def urn(nombre, version):
    claro = f'urn:adsk.wipprod:fs.file:vf.{nombre}?version={version}'
    return base64.urlsafe_b64encode(claro.encode()).decode().rstrip('=')


P60, P64, E31 = urn('PRINCIPAL', 60), urn('PRINCIPAL', 64), urn('ENCOFRADOS', 31)
LP, LE = 'urn:adsk.wipprod:dm.lineage:PRINCIPAL', 'urn:adsk.wipprod:dm.lineage:ENCOFRADOS'
FILAS = [
    # (source_urn, linaje, external_id, nombre, propiedades)
    (P60, LP, 'p1', 'Muro 1', {'Marca': '1'}), (P60, LP, 'p2', 'Muro 2', {'Marca': 'A'}),
    (P60, LP, 'p3', 'Muro 3', {'Marca': '3'}), (P60, LP, 'p4', 'Muro 4', {'Marca': '4'}),
    (P60, LP, 'p6', 'Muro 6', {'Marca': '6'}),
    (P64, LP, 'p1', 'Muro 1', {'Marca': '1'}), (P64, LP, 'p2', 'Muro 2', {'Marca': 'B'}),
    (P64, LP, 'p3', 'Muro 3', {'Marca': '3'}), (P64, LP, 'p4', 'Muro 4', {'Marca': '4'}),
    (P64, LP, 'p5', 'Muro 5', {'Marca': '5'}),
    (E31, LE, 'p2', 'Muro 2 (copia)', {'Marca': 'E'}), (E31, LE, 'p3', 'Muro 3', {'Marca': '3'}),
    (E31, LE, 'e1', 'Encofrado 1', {'Marca': 'e1'}), (E31, LE, 'e2', 'Encofrado 2', {'Marca': 'e2'}),
]

resultados = []


def paso(ok, que, detalle=''):
    resultados.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + que + (f'  · {detalle}' if detalle else ''))


def puerto_libre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def ejecutar(*args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'{args[0]} falló: {r.stderr.strip()[:400]}')
    return r.stdout


def arrancar(datos, carpeta, puerto):
    """`pg_ctl start` SIN tuberías. En Windows el servidor hereda la salida de
    pg_ctl: capturándola, Python espera a que se cierre, y no se cierra hasta
    que se apaga el servidor (el primer intento se quedó colgado así). La salida
    del servidor va a `pg.log`."""
    r = subprocess.run([os.path.join(PG_BIN, 'pg_ctl'), '-D', datos, '-l', os.path.join(carpeta, 'pg.log'),
                        '-o', f'-p {puerto} -c listen_addresses=127.0.0.1', '-w', 'start'],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        raise RuntimeError('pg_ctl start falló; ver ' + os.path.join(carpeta, 'pg.log'))


def preparar_cluster(carpeta, puerto):
    datos = os.path.join(carpeta, 'datos')
    ejecutar(os.path.join(PG_BIN, 'initdb'), '-D', datos, '-U', 'postgres', '--auth=trust',
             '-E', 'UTF8', '--no-instructions')
    arrancar(datos, carpeta, puerto)
    import psycopg2
    raiz = psycopg2.connect(host='127.0.0.1', port=puerto, user='postgres', dbname='postgres')
    raiz.autocommit = True
    with raiz.cursor() as cur:
        cur.execute(f"CREATE ROLE ecd_app LOGIN PASSWORD '{CLAVE}'")
        cur.execute(f'CREATE DATABASE {BASE}')
    raiz.close()
    con = psycopg2.connect(host='127.0.0.1', port=puerto, user='postgres', dbname=BASE)
    with con, con.cursor() as cur:
        cur.execute('CREATE SCHEMA inventory_identity_b1')
        cur.execute("""CREATE TABLE inventory_identity_b1.filas (
            external_id TEXT NOT NULL, name TEXT NOT NULL, properties JSONB,
            source_urn TEXT NOT NULL, model_urn TEXT NOT NULL, source_lineage TEXT NOT NULL)""")
        cur.execute("""CREATE VIEW inventory_identity_b1.inventory_assets AS
            SELECT external_id, name, properties, source_urn, model_urn, source_lineage
              FROM inventory_identity_b1.filas""")
        cur.execute('GRANT USAGE ON SCHEMA inventory_identity_b1 TO ecd_app')
        cur.execute('GRANT SELECT ON inventory_identity_b1.inventory_assets TO ecd_app')
        for source, linaje, ext, nombre, props in FILAS:
            cur.execute("""INSERT INTO inventory_identity_b1.filas
                (external_id, name, properties, source_urn, model_urn, source_lineage)
                VALUES (%s, %s, %s, %s, '1_DRENAJE', %s)""", (ext, nombre, json.dumps(props), source, linaje))
    con.close()
    return datos


def main():
    carpeta = tempfile.mkdtemp(prefix='ensayo_cmp_')
    puerto = puerto_libre()
    datos = os.path.join(carpeta, 'datos')
    try:
        preparar_cluster(carpeta, puerto)
        print(f'cluster desechable en 127.0.0.1:{puerto} ({carpeta})')

        # La ruta real, apuntando al cluster desechable. ANTES de importar nada
        # que abra el pool.
        os.environ.update({'DB_HOST': '127.0.0.1', 'DB_PORT': str(puerto), 'DB_NAME': BASE,
                           'DB_USER': 'ecd_app', 'DB_PASS': CLAVE, 'DDL_EN_CALIENTE': 'false'})
        os.environ.setdefault('APP_SECRET', 'x' * 32)
        os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
        from flask import Flask, g
        import routes.compare as compare
        app = Flask(__name__)

        def llamar(funcion, ruta, cuerpo):
            with app.test_request_context(ruta, method='POST', json=cuerpo):
                g.current_user = {'id': 1, 'role': 'admin'}
                r = funcion()
            if isinstance(r, tuple):
                r, codigo = r
            else:
                codigo = r.status_code
            return codigo, r.get_json()

        def diff(a, b):
            return llamar(compare.compare_diff, '/api/compare/diff', {'a': a, 'b': b})

        def ids(lista, campo=None, fuentes=None):
            if campo:
                return sorted((x['id'], fuentes[x[campo]]) for x in lista)
            return sorted(x['id'] for x in lista)

        uno = lambda u: {'type': 'source', 'value': u}          # noqa: E731
        varios = lambda *u: {'type': 'sources', 'values': list(u)}  # noqa: E731

        # ── 1 · El caso medido: el principal contra el principal + encofrados ──
        codigo, d = diff(uno(P64), varios(P64, E31))
        f = d.get('fuentes') or {}
        paso(codigo == 200 and d.get('por_documento') is True, '1 · varios documentos en B: se empareja por documento',
             json.dumps(d['summary']))
        paso(ids(d['added'], 'fb', f.get('b')) == sorted([('p2', E31), ('p3', E31), ('e1', E31), ('e2', E31)]),
             '1 · agregados = el fichero de encofrados ENTERO, cada fila con su documento',
             str(ids(d['added'])))
        paso(d['modified'] == [] and d['removed'] == [],
             '1 · 0 modificados y 0 eliminados (el principal es la misma versión en los dos lados)')
        paso(d['summary'] == {'total_a': 5, 'total_b': 9, 'added': 4, 'removed': 0, 'modified': 0, 'unchanged': 5},
             '1 · resumen coherente', json.dumps(d['summary']))

        # El «antes» sobre los mismos datos: la consulta de siempre, solo por
        # identificador. Es la que daba el modificado falso en producción.
        import psycopg2
        con = psycopg2.connect(host='127.0.0.1', port=puerto, user='ecd_app', password=CLAVE, dbname=BASE)
        with con.cursor() as cur:
            cur.execute('SET search_path TO pg_catalog,inventory_identity_b1,public')
            cur.execute("""SELECT DISTINCT a.external_id FROM inventory_assets a
                JOIN inventory_assets b ON b.external_id = a.external_id AND b.source_urn IN (%s, %s)
                WHERE a.source_urn IN (%s) AND md5(a.properties::text) IS DISTINCT FROM md5(b.properties::text)""",
                        (P64, E31, P64))
            antes_mod = sorted(r[0] for r in cur.fetchall())
            cur.execute("""SELECT b.external_id FROM inventory_assets b WHERE b.source_urn IN (%s, %s)
                AND NOT EXISTS (SELECT 1 FROM inventory_assets a WHERE a.source_urn IN (%s)
                AND a.external_id = b.external_id)""", (P64, E31, P64))
            antes_add = sorted(r[0] for r in cur.fetchall())
        con.close()
        paso(antes_mod == ['p2'] and antes_add == ['e1', 'e2'],
             '1 · ANTES (solo por identificador) sobre los mismos datos: el modificado falso reproducido',
             f'modificados {antes_mod}, agregados {antes_add}')

        # ── 2 · Otra versión del principal contra principal + encofrados ──
        codigo, d = diff(uno(P60), varios(P64, E31))
        f = d.get('fuentes') or {}
        paso(ids(d['removed'], 'fa', f.get('a')) == [('p6', P60)], '2 · eliminado p6 (quitado del principal)')
        paso(ids(d['added'], 'fb', f.get('b')) == sorted([('p5', P64), ('p2', E31), ('p3', E31), ('e1', E31), ('e2', E31)]),
             '2 · agregados: p5 del principal + los encofrados enteros', str(ids(d['added'])))
        paso([(x['id'], f['a'][x['fa']], f['b'][x['fb']]) for x in d['modified']] == [('p2', P60, P64)],
             '2 · modificado p2, del principal v60 al v64 (y no contra su copia)')

        # ── 3 · Un documento por lado, versiones del mismo: como siempre ──
        codigo, d = diff(uno(P60), uno(P64))
        paso('fuentes' not in d and ids(d['added']) == ['p5'] and ids(d['removed']) == ['p6']
             and ids(d['modified']) == ['p2'], '3 · un documento por lado (v60 → v64): igual que antes')

        # ── 4 · Un documento por lado, el principal contra su derivado: como siempre ──
        codigo, d = diff(uno(P64), uno(E31))
        paso('fuentes' not in d and ids(d['added']) == ['e1', 'e2'] and ids(d['removed']) == ['p1', 'p4', 'p5']
             and ids(d['modified']) == ['p2'],
             '4 · el principal contra su derivado sigue emparejando por identificador (p3 igual, p2 cambia)')

        # ── 5 · El detalle, solo en el documento del elemento ──
        codigo, e = llamar(compare.compare_element, '/api/compare/element',
                           {'external_id': 'p2', 'a': None, 'b': uno(E31)})
        paso(codigo == 200 and e['a'] is None and e['b']['name'] == 'Muro 2 (copia)',
             '5 · detalle de un agregado: A ausente, B = su copia en encofrados')
        codigo, e = llamar(compare.compare_element, '/api/compare/element',
                           {'external_id': 'p2', 'a': uno(P64), 'b': varios(P64, E31)})
        paso(codigo == 200 and e['b'] is None,
             '5 · con B entero el detalle de p2 es ambiguo (dos documentos): por eso se pide solo el suyo')
    finally:
        if datos and os.path.isdir(datos):
            subprocess.run([os.path.join(PG_BIN, 'pg_ctl'), '-D', datos, '-m', 'fast', '-w', 'stop'],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(carpeta, ignore_errors=True)

    print(f'\n{sum(resultados)}/{len(resultados)} pasos en verde')
    return 0 if all(resultados) else 1


if __name__ == '__main__':
    sys.exit(main())
