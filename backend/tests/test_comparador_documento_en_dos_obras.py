"""El comparador no podía extraer una versión histórica de un documento vinculado en dos obras.

LO QUE PASABA
-------------
Comparar dos versiones de un modelo pide extraer la que no está en Postgres a
un scope temporal (`__cmp__`). Para eso `_extraction_source_context` busca el
linaje del documento en `model_config` y exige que pertenezca a UNA obra. Los
modelos HD de drenaje están vinculados en `1_DRENAJE` (PQT8_TALARA) y en el
frente de interferencias de OTRA obra: dos obras -> `SOURCE_SCOPE_AMBIGUOUS`,
409, y el comparador moría con «No se pudo iniciar la extracción de lado A».
Reproducido en producción el 18-sep-2026 con `…DR-HD-011259@011263` v23 vs v24.

LO QUE FIJAN ESTAS PRUEBAS
--------------------------
El comparador dice DESDE QUÉ FRENTE compara (`scope`). Ese frente NO es una
prueba de propiedad: solo elige entre las obras que el registro ya conoce para
ese linaje. Un frente que no esté registrado para el documento no cambia nada,
y sin frente la ambigüedad se sigue rechazando igual que antes.
"""
import os
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from flask import Flask, g

os.environ.setdefault('APP_SECRET', 'x' * 32)

OBRA_TALARA = '1'
OBRA_INTERFERENCIAS = '9'
FRENTES = {
    '1_DRENAJE': OBRA_TALARA,
    '1_CANAL': OBRA_TALARA,
    'b.proj_interferencias_DRENAJE_URBANO': OBRA_INTERFERENCIAS,
}
LINAJE_HD = 'urn:adsk.wipprod:dm.lineage:HD1'
HD_V24 = 'urn:adsk.wipprod:fs.file:vf.HD1?version=24'
HD_V22 = 'urn:adsk.wipprod:fs.file:vf.HD1?version=22'
HD_V23 = 'urn:adsk.wipprod:fs.file:vf.HD1?version=23'     # la histórica que se compara
ST_V41 = 'urn:adsk.wipprod:fs.file:vf.ST1?version=41'
ST_V40 = 'urn:adsk.wipprod:fs.file:vf.ST1?version=40'

# model_config: (app_project_id, urn, item_id). El HD está en dos obras; el ST en una.
REGISTRO = [
    ('1_DRENAJE', HD_V24, LINAJE_HD),
    ('b.proj_interferencias_DRENAJE_URBANO', HD_V22, None),
    ('1_DRENAJE', ST_V41, None),
]


class _Cursor:
    def __init__(self, filas):
        self._filas = filas

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def execute(self, _sql, _args=None):
        pass

    def fetchall(self):
        return list(self._filas)


class _Conexion:
    def __init__(self, filas=REGISTRO):
        self.filas = filas

    def cursor(self, **_k):
        return _Cursor(self.filas)


@pytest.fixture
def inventario(monkeypatch):
    inventory = pytest.importorskip('routes.inventory')
    import db
    monkeypatch.setattr(db, 'resolve_project_id', lambda frente: FRENTES.get(frente))
    return inventory


def _contexto(inventario, urn, **kw):
    return inventario._extraction_source_context(_Conexion(), urn, '__cmp__', **kw)


def test_sin_frente_la_ambiguedad_se_sigue_rechazando(inventario):
    """Lo de antes no cambia: sin decir desde dónde, no se adivina la obra."""
    from inventory_identity import IdentityError
    with pytest.raises(IdentityError) as error:
        _contexto(inventario, HD_V23)
    assert error.value.code == 'SOURCE_SCOPE_AMBIGUOUS'


def test_el_frente_desde_el_que_se_compara_resuelve_la_obra(inventario):
    ctx = _contexto(inventario, HD_V23, scope_hint='1_DRENAJE')
    assert ctx['project_id'] == OBRA_TALARA
    # Solo hay que poder entrar en la obra elegida, no en las dos.
    assert ctx['authorization_scopes'] == ['1_DRENAJE']
    assert ctx['source_lineage'] == LINAJE_HD
    assert ctx['item_id'] == LINAJE_HD
    assert ctx['registered_source'] is True


def test_desde_la_otra_obra_tambien_se_puede(inventario):
    ctx = _contexto(inventario, HD_V23, scope_hint='b.proj_interferencias_DRENAJE_URBANO')
    assert ctx['project_id'] == OBRA_INTERFERENCIAS
    assert ctx['authorization_scopes'] == ['b.proj_interferencias_DRENAJE_URBANO']


@pytest.mark.parametrize('frente', ['1_CANAL', 'obra-pirata', '', None, 7])
def test_un_frente_no_registrado_para_el_documento_no_desambigua(inventario, frente):
    """`1_CANAL` es de la misma obra, pero el documento no está vinculado ahí:
    declarar un frente no crea propiedad, solo elige entre las registradas."""
    from inventory_identity import IdentityError
    with pytest.raises(IdentityError) as error:
        _contexto(inventario, HD_V23, scope_hint=frente)
    assert error.value.code == 'SOURCE_SCOPE_AMBIGUOUS'


def test_un_documento_de_una_sola_obra_no_necesita_frente(inventario):
    """El camino que ya funcionaba (ST v40 vs v41) sigue igual, con o sin frente."""
    sin = _contexto(inventario, ST_V40)
    con = _contexto(inventario, ST_V40, scope_hint='cualquier-cosa')
    assert sin['project_id'] == con['project_id'] == OBRA_TALARA
    assert sin['authorization_scopes'] == con['authorization_scopes'] == ['1_DRENAJE']


@pytest.fixture
def ruta(inventario, monkeypatch):
    """La ruta real, con dobles en la base, la ACL, el registro de jobs y el hilo."""
    import db
    import inventory_http

    @contextmanager
    def conexion():
        yield _Conexion()

    autorizados = []
    monkeypatch.setattr(db, 'get_db_connection', conexion)
    monkeypatch.setattr(inventory_http, 'authorize_scope',
                        lambda _conn, scope, **_k: autorizados.append(scope) or FRENTES.get(scope))
    jobs = {}
    monkeypatch.setattr(inventario, 'set_job', lambda job_id, data: jobs.update({job_id: data}))
    hilos = []

    class _Hilo:
        def __init__(self, target=None, args=(), kwargs=None):
            hilos.append({'args': args, 'kwargs': kwargs or {}})
            self.daemon = False

        def start(self):
            pass

    monkeypatch.setattr(inventario, 'threading', SimpleNamespace(Thread=_Hilo))
    app = Flask(__name__)
    return app, inventario, autorizados, jobs, hilos


def test_la_ruta_lleva_el_frente_hasta_el_hilo_y_autoriza_solo_esa_obra(ruta):
    app, inventario, autorizados, jobs, hilos = ruta
    with app.test_request_context('/api/inventory/extract', method='POST',
                                  json={'urn': HD_V23, 'target_urn': '__cmp__', 'scope': '1_DRENAJE'}):
        g.current_user = {'id': 7, 'role': 'user'}
        respuesta, codigo = inventario.start_extraction()
    assert codigo == 202, respuesta.get_json()
    assert autorizados == ['1_DRENAJE']
    assert len(hilos) == 1 and hilos[0]['kwargs'] == {'scope_hint': '1_DRENAJE'}
    assert hilos[0]['args'][1] == '__cmp__'
    # El job queda atribuido a la obra elegida (es lo que autoriza el sondeo de estado).
    assert list(jobs.values())[0]['model_urn'] == OBRA_TALARA


def test_la_ruta_sin_frente_contesta_409_como_antes(ruta):
    app, inventario, autorizados, _jobs, hilos = ruta
    with app.test_request_context('/api/inventory/extract', method='POST',
                                  json={'urn': HD_V23, 'target_urn': '__cmp__'}):
        g.current_user = {'id': 7, 'role': 'user'}
        respuesta, codigo = inventario.start_extraction()
    assert codigo == 409
    assert respuesta.get_json()['code'] == 'SOURCE_SCOPE_AMBIGUOUS'
    assert hilos == [] and autorizados == []


def test_el_frente_no_se_lee_fuera_del_comparador(ruta):
    """Una extracción normal apunta a su frente: `scope` no pinta nada ahí y no
    debe llegar al hilo, para que el destino siga siendo el que autoriza la ruta."""
    app, inventario, autorizados, _jobs, hilos = ruta
    with app.test_request_context('/api/inventory/extract', method='POST',
                                  json={'urn': ST_V41, 'target_urn': '1_DRENAJE', 'scope': 'obra-pirata'}):
        g.current_user = {'id': 7, 'role': 'user'}
        respuesta, codigo = inventario.start_extraction()
    assert codigo == 202, respuesta.get_json()
    assert autorizados == ['1_DRENAJE']
    assert hilos[0]['kwargs'] == {'scope_hint': None}
