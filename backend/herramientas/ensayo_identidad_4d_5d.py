#!/usr/bin/env python
"""Identidad de Source en 4D/5D, en un cluster NUEVO, local y desechable.

Se ejecutan el SQL y las rutas REALES de `routes/compare.py` y `routes/lob4d.py`
--el DDL de `inventory_assets` se extrae por AST de `esquema_base.py`, no se
copia-- contra filas sinteticas. No toca produccion, no lee `.env` y no prueba
APS, red ni autenticacion HTTP: la sesion es un doble de administrador.

Lo que se mide es UNA cosa: que dos Sources que comparten `external_id` no se
funden ni se heredan. No se cambia ninguna formula 4D ni regla de metrados.
"""
import argparse
import ast
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

sys.dont_write_bytecode = True

import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[2]
EVIDENCIA = ROOT / 'docs/filters/evidencias/IDENTIDAD_4D_5D.json'


def literal_unico(arbol, predicado, etiqueta):
    valores = [n.value for n in ast.walk(arbol)
               if isinstance(n, ast.Constant) and isinstance(n.value, str) and predicado(n.value)]
    if len(valores) != 1:
        raise RuntimeError('Fuente ambigua o cambiada: ' + etiqueta)
    return valores[0]


def ddl_inventory():
    fuente = (ROOT / 'backend/esquema_base.py').read_text(encoding='utf-8-sig')
    return literal_unico(ast.parse(fuente),
                         lambda s: 'CREATE TABLE IF NOT EXISTS "inventory_assets"' in s,
                         'DDL inventory_assets')


def sql_progresivas():
    """El SELECT real de `_derive_locations_from_model`, con su GROUP BY."""
    fuente = (ROOT / 'backend/routes/lob4d.py').read_text(encoding='utf-8-sig')
    arbol = ast.parse(fuente)
    fn = [n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)
          and n.name == '_derive_locations_from_model']
    if len(fn) != 1:
        raise RuntimeError('No se encontro _derive_locations_from_model')
    return literal_unico(fn[0], lambda s: 'DSI_Progresiva' in s and 'GROUP BY' in s,
                         'consulta de progresivas')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pg-bin', required=True)
    ap.add_argument('--confirm-disposable-only', action='store_true')
    args = ap.parse_args()
    if not args.confirm_disposable_only:
        ap.error('Requiere --confirm-disposable-only; nunca acepta una base existente.')
    pg_bin = Path(args.pg_bin).resolve()
    for nombre in ['initdb.exe', 'pg_ctl.exe']:
        if not (pg_bin / nombre).is_file():
            ap.error('Falta el binario local: ' + nombre)

    for clave in list(os.environ):
        if clave.startswith('PG'):
            del os.environ[clave]

    carpeta = Path(tempfile.mkdtemp(prefix='alephia_identidad_4d5d_')).resolve()
    datos, log = carpeta / 'data', carpeta / 'postgres.log'
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        puerto = s.getsockname()[1]
    base = 'ecd_ensayo_identidad_4d5d_' + uuid.uuid4().hex[:10]
    banderas = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

    informe = {'verdict': 'NOT_RUN', 'createdAt': datetime.now(timezone.utc).isoformat(),
               'environment': {'host': '127.0.0.1', 'port': puerto, 'database': base,
                               'clusterDirectory': str(datos), 'newCluster': True},
               'limitations': ['Filas sinteticas: ni APS, ni importacion real, ni produccion.',
                               'Sesion de administrador simulada: no prueba autenticacion HTTP.',
                               'No se ejecutan formulas 4D ni reglas de metrados: solo identidad.'],
               'cases': [], 'clusterStopped': False}

    def orden(nombre, *argv):
        arranca = nombre == 'pg_ctl.exe' and 'start' in argv
        salida = ({'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
                  if arranca else {'capture_output': True})
        r = subprocess.run([str(pg_bin / nombre), *map(str, argv)], **salida,
                           stdin=subprocess.DEVNULL, text=True, errors='replace',
                           timeout=55, creationflags=banderas)
        if r.returncode:
            raise RuntimeError(nombre + ': ' + (r.stderr or r.stdout or 'ver el log retenido')[-2000:])
        return r.stdout

    @contextmanager
    def conexion(db=base):
        c = psycopg2.connect(host='127.0.0.1', port=puerto, dbname=db, user='ecd_migrator',
                             password='', connect_timeout=5,
                             application_name='identidad_4d5d_desechable')
        try:
            with c:
                yield c
        finally:
            c.close()

    def caso(nombre, fn):
        try:
            informe['cases'].append({'case': nombre, 'status': 'PASS', **(fn() or {})})
        except Exception as exc:
            informe['cases'].append({'case': nombre, 'status': 'FAIL',
                                     'error': type(exc).__name__ + ': ' + str(exc)})

    arrancado, codigo = False, 1
    try:
        orden('initdb.exe', '-D', datos, '-U', 'ecd_migrator', '--auth=trust',
              '--encoding=UTF8', '--locale=C')
        arrancado = True
        orden('pg_ctl.exe', '-D', datos, '-l', log,
              '-o', '-h 127.0.0.1 -p ' + str(puerto), '-w', '-t', '30', 'start')
        admin = psycopg2.connect(host='127.0.0.1', port=puerto, dbname='postgres',
                                 user='ecd_migrator', password='', connect_timeout=5)
        admin.autocommit = True
        with admin.cursor() as cur:
            cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(base)))
        admin.close()

        with conexion() as c:
            with c.cursor() as cur:
                cur.execute(ddl_inventory())
                # Catalogo de precios: no es objeto de esta prueba, pero las
                # rutas de metrados lo consultan. Vacio y minimo a proposito.
                cur.execute('CREATE TABLE doc_partidas (item TEXT, descripcion TEXT,'
                            ' precio_unitario NUMERIC, unidad TEXT)')

        # ── Filas sinteticas ──────────────────────────────────────────────
        # DOS frentes, cada uno con SU documento, y un external_id compartido.
        # Es lo que el censo B1 midio de verdad: 2.146 externalIds en dos frentes.
        A, B = 'urn-doc-A-v1', 'urn-doc-B-v1'
        F1, F2 = 'FRENTE_1', 'FRENTE_2'
        props = lambda cod, met, pk: json.dumps(
            {'PROPERTY SETS': {'DSI_CodigoDePartida1': cod, 'DSI_Metrado1': met,
                               'DSI_Unidad1': 'm3', 'DSI_Progresiva': pk}})
        filas = [
            # (external_id, name, model_urn, source_urn, properties)
            ('COMPARTIDO', 'Elemento de A', F1, A, props('01.01', '10', '0+100.00')),
            ('COMPARTIDO', 'Elemento de B', F2, B, props('01.01', '99', '0+900.00')),
            ('SOLO_A', 'Unico de A', F1, A, props('01.02', '5', '0+110.00')),
            ('SOLO_B', 'Unico de B', F2, B, props('01.03', '7', '0+910.00')),
        ]
        with conexion() as c:
            with c.cursor() as cur:
                cur.executemany(
                    'INSERT INTO inventory_assets (external_id,name,model_urn,source_urn,properties)'
                    ' VALUES (%s,%s,%s,%s,%s::jsonb)', filas)

        # ── Rutas reales de compare ───────────────────────────────────────
        os.environ.update(DB_HOST='127.0.0.1', DB_PORT=str(puerto), DB_NAME=base,
                          DB_USER='ecd_migrator', DB_PASS='', PGSSLMODE='disable')
        os.environ.setdefault('APP_SECRET', 'x' * 32)
        sys.path.insert(0, str(ROOT / 'backend'))
        from flask import Flask, g                                    # noqa: E402
        from routes.compare import compare_bp                          # noqa: E402

        app = Flask(__name__)
        app.register_blueprint(compare_bp)

        @app.before_request
        def _sesion_de_prueba():
            g.current_user = {'id': 0, 'email': 'zz@ejemplo.invalido', 'role': 'admin'}

        cli = app.test_client()

        def compare(ruta, cuerpo):
            r = cli.post(ruta, json=cuerpo)
            assert r.status_code == 200, '%s -> %s %s' % (ruta, r.status_code, r.get_data(as_text=True)[:200])
            return r.get_json()

        lado_a = {'type': 'source', 'value': A}
        lado_b = {'type': 'source', 'value': B}
        ambas = {'type': 'sources', 'values': [A, B]}

        # ── 1 · CONTROL ───────────────────────────────────────────────────
        def control():
            r = compare('/api/compare/metrados', {'a': lado_a, 'b': lado_b})
            por_cod = {p['codigo']: p for p in r['partidas']}
            assert por_cod['01.01']['metrado_a'] == 10.0, por_cod['01.01']
            assert por_cod['01.01']['metrado_b'] == 99.0, por_cod['01.01']
            assert por_cod['01.02']['metrado_a'] == 5.0 and not por_cod['01.02'].get('metrado_b')
            return {'partidas': len(r['partidas']), 'ladoA': 10.0, 'ladoB': 99.0}
        caso('1-control-ids-distintos-mismo-resultado', control)

        # ── 2 · COLISION dentro de un lado ────────────────────────────────
        def colision():
            r = compare('/api/compare/metrados', {'a': ambas, 'b': lado_b, 'include_elements': True})
            por_cod = {p['codigo']: p for p in r['partidas']}
            # A(10) y B(99) comparten external_id: el lado debe sumar los DOS.
            # Con la clave vieja uno sustituia al otro y el total era 10 o 99.
            assert por_cod['01.01']['metrado_a'] == 109.0, por_cod['01.01']
            elementos = r.get('byElement') or {}
            assert 'COMPARTIDO' not in elementos, 'un externalId ambiguo no puede publicarse'
            assert 'SOLO_A' in elementos and 'SOLO_B' in elementos
            return {'sumaDeLasDosSources': 109.0, 'ambiguoOmitidoDeByElement': True,
                    'inequivocosPresentes': 2}
        caso('2-dos-sources-mismo-ext-cada-una-conserva-lo-suyo', colision)

        # ── 3 · ORDEN ─────────────────────────────────────────────────────
        def orden_indiferente():
            ab = compare('/api/compare/metrados', {'a': {'type': 'sources', 'values': [A, B]}, 'b': lado_b})
            ba = compare('/api/compare/metrados', {'a': {'type': 'sources', 'values': [B, A]}, 'b': lado_b})
            assert ab['partidas'] == ba['partidas'], (ab['partidas'], ba['partidas'])
            det1 = compare('/api/compare/element', {'external_id': 'COMPARTIDO', 'a': ambas, 'b': lado_b})
            det2 = compare('/api/compare/element', {'external_id': 'COMPARTIDO', 'a': {'type': 'sources', 'values': [B, A]}, 'b': lado_b})
            assert det1 == det2, (det1, det2)
            return {'metradosIdenticos': True, 'detalleIdentico': True}
        caso('3-orden-de-las-sources-no-cambia-el-resultado', orden_indiferente)

        # ── 4 · SIN HERENCIA ──────────────────────────────────────────────
        def sin_herencia():
            solo_a = compare('/api/compare/element', {'external_id': 'SOLO_A', 'a': lado_a, 'b': lado_b})
            assert solo_a['a']['name'] == 'Unico de A', solo_a
            assert solo_a['b'] is None, 'B no puede heredar un elemento de A'
            met = compare('/api/compare/element-metrados',
                          {'external_id': 'SOLO_A', 'a': lado_a, 'b': lado_b})
            assert met['a'] and not met['b'], met
            ambiguo = compare('/api/compare/element',
                              {'external_id': 'COMPARTIDO', 'a': ambas, 'b': lado_b})
            assert ambiguo['a'] is None, 'con dos Sources no hay un detalle que dar'
            metAmb = compare('/api/compare/element-metrados',
                             {'external_id': 'COMPARTIDO', 'a': ambas, 'b': lado_b})
            assert metAmb['a'] == {}, metAmb
            return {'noHerenciaEntreLados': True, 'ambiguoNoResuelto': True}
        caso('4-dato-solo-en-A-no-aparece-en-B', sin_herencia)

        # ── 5 · LOB backend: el GROUP BY no colapsa Sources ───────────────
        def lob_group_by():
            consulta = sql_progresivas()
            assert 'GROUP BY ia.source_urn, ia.external_id' in consulta, \
                'la consulta real ya no agrupa por (Source, externalId)'
            with conexion() as c:
                with c.cursor() as cur:
                    # El UNIQUE(model_urn, external_id) del esquema ACTUAL impide
                    # fisicamente tener dos Sources con el mismo externalId en un
                    # frente: por eso este defecto es latente y no reproducible en
                    # produccion hoy. Se retira SOLO en esta base desechable para
                    # modelar el esquema con identidad cualificada, que es la
                    # condicion en la que el GROUP BY viejo se rompia.
                    cur.execute('ALTER TABLE inventory_assets DROP CONSTRAINT'
                                ' inventory_assets_model_urn_external_id_key')
                    cur.execute("UPDATE inventory_assets SET model_urn=%s WHERE source_urn=%s", (F1, B))
                    cur.execute(consulta, (F1,))
                    filas_agrupadas = cur.fetchall()
                    cur.execute("UPDATE inventory_assets SET model_urn=%s WHERE source_urn=%s", (F2, B))
                    cur.execute('ALTER TABLE inventory_assets ADD CONSTRAINT'
                                ' inventory_assets_model_urn_external_id_key'
                                ' UNIQUE (model_urn, external_id)')
            compartidos = [f for f in filas_agrupadas if f[0] == 'COMPARTIDO']
            assert len(compartidos) == 2, 'las dos Sources se fundieron: %r' % (compartidos,)
            progresivas = sorted(f[1] for f in compartidos)
            assert progresivas == ['0+100.00', '0+900.00'], progresivas
            return {'gruposParaElExtCompartido': 2, 'progresivas': progresivas}
        caso('5-lob-group-by-no-colapsa-dos-sources', lob_group_by)

        # ── 6 · Compare/5D: los dos lados siguen distinguibles ────────────
        def lados_distinguibles():
            r = compare('/api/compare/diff', {'a': lado_a, 'b': lado_b})
            ids = {'added': {x['id'] for x in r['added']},
                   'removed': {x['id'] for x in r['removed']},
                   'modified': {x['id'] for x in r['modified']}}
            assert 'SOLO_B' in ids['added'] and 'SOLO_A' in ids['removed'], ids
            # El emparejamiento entre lados por externalId es el algoritmo del
            # comparador y NO se toca: COMPARTIDO sigue saliendo como modificado.
            assert 'COMPARTIDO' in ids['modified'], ids
            det = compare('/api/compare/element', {'external_id': 'COMPARTIDO', 'a': lado_a, 'b': lado_b})
            assert det['a']['name'] == 'Elemento de A' and det['b']['name'] == 'Elemento de B', det
            return {'algoritmoDeDiffIntacto': True,
                    'cadaLadoConservaSuNombre': [det['a']['name'], det['b']['name']]}
        caso('6-compare-5d-cada-lado-mantiene-su-identidad', lados_distinguibles)

        # ── 7 · Regresion: sin colision, todo igual ───────────────────────
        def regresion():
            r = compare('/api/compare/metrados', {'a': lado_a, 'b': lado_b, 'include_elements': True})
            por_cod = {p['codigo']: p for p in r['partidas']}
            assert por_cod['01.01']['metrado_a'] == 10.0 and por_cod['01.01']['metrado_b'] == 99.0
            assert por_cod['01.02']['metrado_a'] == 5.0
            assert por_cod['01.03']['metrado_b'] == 7.0
            elementos = r['byElement']
            assert set(elementos) == {'COMPARTIDO', 'SOLO_A', 'SOLO_B'}, sorted(elementos)
            assert elementos['COMPARTIDO']['a'] == {'01.01': 10.0}, elementos['COMPARTIDO']
            assert elementos['COMPARTIDO']['b'] == {'01.01': 99.0}, elementos['COMPARTIDO']
            met = compare('/api/compare/element-metrados',
                          {'external_id': 'COMPARTIDO', 'a': lado_a, 'b': lado_b})
            assert met['a'] == {'01.01': 10.0} and met['b'] == {'01.01': 99.0}, met
            return {'byElementCompleto': 3, 'metradosPorElementoIntactos': True}
        caso('7-regresion-sin-colision-comportamiento-identico', regresion)

        fallos = sum(c['status'] != 'PASS' for c in informe['cases'])
        informe['summary'] = {'passed': len(informe['cases']) - fallos, 'failed': fallos,
                              'total': len(informe['cases'])}
        informe['verdict'] = 'IDENTITY PASS' if fallos == 0 else 'IDENTITY FAIL'
        codigo = 0 if fallos == 0 else 1
    except Exception as exc:
        informe['verdict'] = 'HARNESS ERROR'
        informe['error'] = type(exc).__name__ + ': ' + str(exc)
        codigo = 1
    finally:
        if arrancado:
            try:
                orden('pg_ctl.exe', '-D', datos, '-m', 'fast', '-w', '-t', '30', 'stop')
                informe['clusterStopped'] = True
            except Exception as exc:
                informe['shutdownError'] = str(exc)
                codigo = 1
        informe['clusterRetained'] = str(carpeta)
        informe['exitCode'] = codigo
        EVIDENCIA.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCIA.write_text(json.dumps(informe, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(informe, ensure_ascii=False, indent=2))
    return codigo


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
