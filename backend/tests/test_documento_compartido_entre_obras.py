"""Compartir un documento de Autodesk con OTRA obra (24-oct-2026).

LO QUE PASABA
-------------
El frente de interferencias (PQT8_INTERFERENCIAS) necesita el modelo HD
`…DR-HD-011264@011268`, que ya está vinculado en `1_DRENAJE` (PQT8_TALARA). Al
importarlo, `_extraction_source_context` respondía SOURCE_PROJECT_CONFLICT: un
documento que el registro ya atribuye a una obra no se admitía en otra.

LO QUE FIJAN ESTAS PRUEBAS
--------------------------
Se comparte SOLO si quien lo pide puede entrar en una obra donde el documento ya
está vinculado (prueba de autoridad sobre el modelo). Sin eso, la regla de antes
sigue igual: nadie se lleva el modelo de una obra en la que no está.
"""
import os
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from flask import Flask, g

os.environ.setdefault('APP_SECRET', 'x' * 32)

OBRA_TALARA = '1'
OBRA_INTERFERENCIAS = '9'
DRENAJE = '1_DRENAJE'
INTERFERENCIAS = 'b.proj_interferencias_DRENAJE_URBANO'
FRENTES = {DRENAJE: OBRA_TALARA, INTERFERENCIAS: OBRA_INTERFERENCIAS}
LINAJE = 'urn:adsk.wipprod:dm.lineage:HD011264'
HD_V5 = 'urn:adsk.wipprod:fs.file:vf.HD011264?version=5'
HD_V6 = 'urn:adsk.wipprod:fs.file:vf.HD011264?version=6'
REGISTRO = [(DRENAJE, HD_V5, LINAJE)]          # solo en PQT8_TALARA


class _Cursor:
    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def execute(self, _sql, _args=None):
        pass

    def fetchall(self):
        return list(REGISTRO)


class _Conexion:
    def cursor(self, **_k):
        return _Cursor()


@pytest.fixture
def inventario(monkeypatch):
    inventory = pytest.importorskip('routes.inventory')
    import db
    monkeypatch.setattr(db, 'resolve_project_id', lambda frente: FRENTES.get(frente))
    return inventory


def _contexto(inventario, **kw):
    return inventario._extraction_source_context(_Conexion(), HD_V6, INTERFERENCIAS, **kw)


def test_sin_prueba_de_autoridad_sigue_rechazandose(inventario):
    from inventory_identity import IdentityError
    with pytest.raises(IdentityError) as error:
        _contexto(inventario)
    assert error.value.code == 'SOURCE_PROJECT_CONFLICT'


def test_quien_no_puede_entrar_en_la_obra_duena_no_se_lo_lleva(inventario):
    from inventory_identity import IdentityError
    with pytest.raises(IdentityError) as error:
        _contexto(inventario, puede_entrar=lambda frente: False)
    assert error.value.code == 'SOURCE_PROJECT_CONFLICT'


def test_quien_puede_entrar_en_la_obra_duena_lo_comparte(inventario):
    vistos = []
    ctx = _contexto(inventario, puede_entrar=lambda frente: vistos.append(frente) or frente == DRENAJE)
    assert vistos == [DRENAJE]
    assert ctx['compartido'] is True
    assert ctx['project_id'] == OBRA_INTERFERENCIAS
    # El destino sigue siendo el frente de interferencias, y el documento, el mismo.
    assert ctx['authorization_scopes'] == [INTERFERENCIAS]
    assert ctx['item_id'] == LINAJE and ctx['linked_in_scope'] is False


def test_el_hilo_comparte_con_la_marca_que_le_pasa_la_ruta(inventario):
    ctx = _contexto(inventario, compartir=True)
    assert ctx['compartido'] is True


def test_en_su_propia_obra_no_es_compartir(inventario):
    ctx = inventario._extraction_source_context(_Conexion(), HD_V6, DRENAJE)
    assert ctx['compartido'] is False and ctx['linked_in_scope'] is True


@pytest.fixture
def ruta(inventario, monkeypatch):
    import db
    import inventory_http
    from inventory_identity import IdentityError

    @contextmanager
    def conexion():
        yield _Conexion()

    permitidos = set()
    pedidos = []

    def autorizar(_conn, frente, **_k):
        pedidos.append(frente)
        if frente not in permitidos:
            raise IdentityError('FORBIDDEN_SCOPE')
        return FRENTES.get(frente)

    monkeypatch.setattr(db, 'get_db_connection', conexion)
    monkeypatch.setattr(inventory_http, 'authorize_scope', autorizar)
    monkeypatch.setattr(inventario, 'set_job', lambda job_id, data: None)
    hilos = []

    class _Hilo:
        def __init__(self, target=None, args=(), kwargs=None):
            hilos.append({'args': args, 'kwargs': kwargs or {}})
            self.daemon = False

        def start(self):
            pass

    monkeypatch.setattr(inventario, 'threading', SimpleNamespace(Thread=_Hilo))
    return Flask(__name__), inventario, permitidos, pedidos, hilos


def _importar(app, inventario):
    with app.test_request_context('/api/inventory/extract', method='POST',
                                  json={'urn': HD_V6, 'target_urn': INTERFERENCIAS}):
        g.current_user = {'id': 7, 'role': 'user'}
        return inventario.start_extraction()


def test_la_ruta_comparte_si_el_usuario_esta_en_las_dos_obras(ruta):
    app, inventario, permitidos, pedidos, hilos = ruta
    permitidos.update({INTERFERENCIAS, DRENAJE})
    respuesta, codigo = _importar(app, inventario)
    assert codigo == 202, respuesta.get_json()
    assert pedidos == [INTERFERENCIAS, DRENAJE]
    assert len(hilos) == 1 and hilos[0]['kwargs'].get('compartir') is True
    assert hilos[0]['args'][1] == INTERFERENCIAS


def test_la_ruta_rechaza_si_el_usuario_solo_esta_en_interferencias(ruta):
    app, inventario, permitidos, _pedidos, hilos = ruta
    permitidos.add(INTERFERENCIAS)
    respuesta, codigo = _importar(app, inventario)
    assert codigo == 403
    assert respuesta.get_json()['code'] == 'SOURCE_PROJECT_CONFLICT'
    assert hilos == []


def test_la_ruta_rechaza_antes_si_no_puede_entrar_en_el_destino(ruta):
    app, inventario, permitidos, pedidos, hilos = ruta
    permitidos.add(DRENAJE)
    respuesta, codigo = _importar(app, inventario)
    assert codigo == 403 and respuesta.get_json()['code'] == 'FORBIDDEN_SCOPE'
    assert pedidos == [INTERFERENCIAS] and hilos == []
