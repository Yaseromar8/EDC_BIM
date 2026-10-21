"""Inventario «una vez por revisión» (docs/rendimiento/01 §P1).

El cuerpo comprimido se reutiliza mientras la clave de estado no cambie; la autorización y la comprobación
de lectura siguen corriendo en CADA petición; con varias a la vez sin caché, solo una construye."""
import contextlib
import gzip
import json
import threading
import time

import pytest
from flask import Flask

import inventory_http as ih
from inventory_identity import IdentityError


@pytest.fixture
def entorno(monkeypatch):
    estado = {'clave': 'r1', 'consultas': 0, 'denegar': False, 'espera': 0.0}

    class Repo:
        def __init__(self, conn):
            pass

        def get_inventory(self, scope, *, allowed_scopes, include_props=True):
            estado['consultas'] += 1
            time.sleep(estado['espera'])
            return [{'scope_id': scope, 'external_id': 'e1', 'clave': estado['clave'], 'props': include_props}]

    def leer_scopes(conn, forced):
        if estado['denegar']:
            raise IdentityError('FORBIDDEN_SCOPE')
        return ['urn:canal']

    monkeypatch.setattr(ih, 'get_db_connection', contextlib.nullcontext)
    monkeypatch.setattr(ih, 'InventoryIdentityRepository', Repo)
    monkeypatch.setattr(ih, '_read_scopes', leer_scopes)
    monkeypatch.setattr(ih, '_ensure_readable', lambda conn, scopes: None)
    monkeypatch.setattr(ih, '_clave_de_cache', lambda conn, scopes, include_props: (estado['clave'], tuple(scopes), include_props))
    ih._cache.clear()
    ih._construcciones.clear()
    monkeypatch.setattr(ih, '_cache_bytes', 0)
    return estado


app = Flask(__name__)


def pedir(gzip_ok=True, props='true'):
    cabeceras = {'Accept-Encoding': 'gzip'} if gzip_ok else {}
    with app.test_request_context(f'/api/inventory?model_urn=urn:canal&include_props={props}', headers=cabeceras):
        r = ih.read_inventory_request()
        datos = r.get_data()
        if r.headers.get('Content-Encoding') == 'gzip':
            datos = gzip.decompress(datos)
        return r.status_code, r.headers.get('X-Inventory-Cache'), json.loads(datos)


def test_misma_revision_se_construye_una_vez(entorno):
    assert pedir()[:2] == (200, 'miss')
    estado, origen, filas = pedir()
    assert (estado, origen) == (200, 'hit')
    assert filas == [{'scope_id': 'urn:canal', 'external_id': 'e1', 'clave': 'r1', 'props': True}]
    assert entorno['consultas'] == 1


def test_revision_nueva_reconstruye(entorno):
    pedir()
    entorno['clave'] = 'r2'
    _, origen, filas = pedir()
    assert origen == 'miss' and filas[0]['clave'] == 'r2'
    assert entorno['consultas'] == 2


def test_la_autorizacion_corre_aunque_haya_cache(entorno):
    pedir()
    entorno['denegar'] = True
    with app.test_request_context('/api/inventory?model_urn=urn:canal', headers={'Accept-Encoding': 'gzip'}):
        r = ih.read_inventory_request()
    codigo = r[1] if isinstance(r, tuple) else r.status_code
    assert codigo == 403
    assert entorno['consultas'] == 1


def test_include_props_no_comparte_cuerpo(entorno):
    pedir(props='true')
    _, origen, filas = pedir(props='false')
    assert origen == 'miss' and filas[0]['props'] is False


def test_cliente_sin_gzip_recibe_el_mismo_json(entorno):
    _, _, comprimido = pedir()
    _, origen, plano = pedir(gzip_ok=False)
    assert origen == 'hit' and plano == comprimido


def test_varias_a_la_vez_solo_una_construye(entorno):
    entorno['espera'] = 0.3
    salida = []
    hilos = [threading.Thread(target=lambda: salida.append(pedir()[:2])) for _ in range(6)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert entorno['consultas'] == 1
    assert sorted(salida) == [(200, 'hit')] * 5 + [(200, 'miss')]


def test_la_cache_tiene_techo_de_memoria(entorno, monkeypatch):
    monkeypatch.setattr(ih, '_CACHE_MAX_BYTES', 10)
    pedir()
    assert ih._cache_bytes <= 10
    assert pedir()[1] == 'miss'  # demasiado grande para guardarlo: se sirve igual, no se retiene


class _Cursor:
    def __init__(self, respuestas):
        self.respuestas = respuestas

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.sql = sql

    def fetchall(self):
        return [('urn:canal', 'urn:lin', 'urn:v7', 3)]

    def fetchone(self):
        return self.respuestas.pop(0)


class _Conn:
    def __init__(self, respuestas):
        self.respuestas = respuestas

    def cursor(self):
        return _Cursor(self.respuestas)


def test_version_conserva_su_forma(monkeypatch):
    monkeypatch.setattr(ih, 'get_db_connection', lambda: contextlib.nullcontext(_Conn([(19889, '2026-10-20'), ('2026-10-19',)])))
    monkeypatch.setattr(ih, '_read_scopes', lambda conn, forced: ['urn:canal'])
    monkeypatch.setattr(ih, '_ensure_readable', lambda conn, scopes: None)
    with app.test_request_context('/api/inventory/version?model_urn=urn:canal'):
        cuerpo = ih.inventory_version_request().get_json()
    assert set(cuerpo) == {'count', 'last_updated', 'user_updated', 'identity_format', 'revision'}
    assert cuerpo['count'] == 19889 and cuerpo['last_updated'] == cuerpo['revision']
    assert cuerpo['user_updated'] == '2026-10-19'


def test_clave_mas_estricta_que_la_revision():
    clave = ih._clave_de_cache(_Conn([(1, 'a'), ('b',), (5,), (2, 1)]), ['urn:canal'], True)
    otra = ih._clave_de_cache(_Conn([(1, 'a'), ('b',), (4,), (2, 1)]), ['urn:canal'], True)
    assert clave[0] == otra[0] and clave != otra  # un borrado de user_data cambia la clave
