"""El comparador empareja por documento cuando un lado tiene varios.

LO QUE PASABA (medido en producción el 18-sep-2026)
---------------------------------------------------
El diff emparejaba solo por `external_id` (el identificador de Revit). Con A =
`…011264@011268` v64 y B = el mismo v64 + `…-ENCOFRADOS` v31 salía 1 «modificado»
que no podía serlo: el principal es la misma versión en los dos lados, y lo que
se comparaba era su elemento con la COPIA que el fichero de encofrados conserva
de él (comparten 131.833 identificadores). Y en 3D ese elemento se pintaba en
uno solo de los dos ficheros.

LO QUE FIJAN ESTAS PRUEBAS (sin base; la semántica SQL la prueba el ensayo
`herramientas/ensayo_comparador_por_documento.py` contra PostgreSQL de verdad)
------------------------------------------------------------------------------
- Con UN documento por lado, nada cambia: ni la consulta ni la respuesta.
- Con varios en algún lado, el mismo elemento es mismo identificador Y mismo
  linaje, y cada fila dice de qué documento es (índice en `fuentes`).
- El detalle de un elemento acepta un lado ausente, para no traer la copia de
  otro documento que comparta el identificador.
"""
import os
from contextlib import contextmanager

import pytest
from flask import Flask, g

os.environ.setdefault('APP_SECRET', 'x' * 32)

P64 = 'UFJJTkNJUEFMLXY2NA'      # el principal, v64
E31 = 'RU5DT0ZSQURPUy12MzE'     # los encofrados, v31
P60 = 'UFJJTkNJUEFMLXY2MA'      # el principal, v60


def _source(urn):
    return {'type': 'source', 'value': urn}


def _sources(*urns):
    return {'type': 'sources', 'values': list(urns)}


class _Cursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        self.conn.consultas.append((' '.join(str(sql).split()), list(params or [])))

    def fetchall(self):
        return self.conn.filas.pop(0)

    def fetchone(self):
        return self.conn.filas.pop(0)[0]


class _Conexion:
    def __init__(self, filas):
        self.filas = list(filas)
        self.consultas = []

    def cursor(self):
        return _Cursor(self)


@pytest.fixture
def compare(monkeypatch):
    modulo = pytest.importorskip('routes.compare')
    return modulo


def _diff(compare, monkeypatch, cuerpo, filas):
    conexion = _Conexion(filas)

    @contextmanager
    def falsa():
        yield conexion

    monkeypatch.setattr(compare, 'get_db_connection', falsa)
    app = Flask(__name__)
    with app.test_request_context('/api/compare/diff', method='POST', json=cuerpo):
        g.current_user = {'id': 1, 'role': 'admin'}
        respuesta = compare.compare_diff()
    if isinstance(respuesta, tuple):
        respuesta, codigo = respuesta
    else:
        codigo = respuesta.status_code
    return codigo, respuesta.get_json(), conexion.consultas


def test_un_documento_por_lado_se_empareja_como_siempre(compare):
    assert compare._emparejar_por_documento(_source(P60), _source(P64)) is False
    # Un modelo contra un derivado suyo (otro linaje): también por identificador.
    assert compare._emparejar_por_documento(_source(P64), _source(E31)) is False


def test_varios_documentos_en_un_lado_empareja_por_documento(compare):
    assert compare._emparejar_por_documento(_source(P64), _sources(P64, E31)) is True
    assert compare._emparejar_por_documento(_sources(P60, E31), _source(P64)) is True


def test_el_mismo_urn_escrito_de_dos_formas_es_un_solo_documento(compare):
    """El base64 estándar y el URL-safe son el mismo URN: no convierten el lado en «varios»."""
    assert compare._emparejar_por_documento(_source('ab+/cd=='), _sources('ab+/cd==', 'ab-_cd')) is False


def test_un_frente_entero_sigue_como_siempre(compare):
    assert compare._emparejar_por_documento({'type': 'frente', 'value': '1_DRENAJE'}, _sources(P64, E31)) is False


def test_con_un_documento_por_lado_ni_la_consulta_ni_la_respuesta_cambian(compare, monkeypatch):
    codigo, cuerpo, consultas = _diff(compare, monkeypatch, {'a': _source(P60), 'b': _source(P64)}, [
        [('p5', 'Muro 5')],                 # agregados
        [('p6', 'Muro 6')],                 # eliminados
        [('p2', 'Muro 2')],                 # modificados
        [(5,)], [(5,)],                     # totales
    ])
    assert codigo == 200
    assert 'source_lineage' not in ' '.join(sql for sql, _ in consultas)
    assert cuerpo['added'] == [{'id': 'p5', 'name': 'Muro 5'}]
    assert cuerpo['removed'] == [{'id': 'p6', 'name': 'Muro 6'}]
    assert cuerpo['modified'] == [{'id': 'p2', 'name': 'Muro 2'}]
    assert 'fuentes' not in cuerpo and 'por_documento' not in cuerpo
    assert cuerpo['summary'] == {'total_a': 5, 'total_b': 5, 'added': 1, 'removed': 1,
                                 'modified': 1, 'unchanged': 3}


def test_con_varios_documentos_empareja_por_linaje_y_dice_de_que_documento_es_cada_fila(compare, monkeypatch):
    codigo, cuerpo, consultas = _diff(compare, monkeypatch, {'a': _source(P60), 'b': _sources(P64, E31)}, [
        [('p5', 'Muro 5', P64), ('e1', 'Encofrado 1', E31), ('p2', 'Muro 2 (copia)', E31)],
        [('p6', 'Muro 6', P60)],
        [('p2', 'Muro 2', P60, P64)],
        [(5,)], [(9,)],
    ])
    assert codigo == 200
    diff = [sql for sql, _ in consultas if 'inventory_assets' in sql and 'COUNT' not in sql]
    assert len(diff) == 3
    for sql in diff:
        assert 'a.external_id = b.external_id AND a.source_lineage = b.source_lineage' in sql, sql
    assert cuerpo['por_documento'] is True
    assert cuerpo['fuentes'] == {'a': [P60], 'b': [P64, E31]}
    assert cuerpo['added'] == [{'id': 'p5', 'name': 'Muro 5', 'fb': 0},
                               {'id': 'e1', 'name': 'Encofrado 1', 'fb': 1},
                               {'id': 'p2', 'name': 'Muro 2 (copia)', 'fb': 1}]
    assert cuerpo['removed'] == [{'id': 'p6', 'name': 'Muro 6', 'fa': 0}]
    assert cuerpo['modified'] == [{'id': 'p2', 'name': 'Muro 2', 'fa': 0, 'fb': 0}]
    assert cuerpo['summary']['unchanged'] == 9 - 3 - 1


def _detalle(compare, monkeypatch, cuerpo):
    conexion = _Conexion([[('Muro 2 (copia)', {'Datos': {'Marca': 'E'}})], [('Muro 2', {'Datos': {'Marca': 'P'}})]])

    @contextmanager
    def falsa():
        yield conexion

    monkeypatch.setattr(compare, 'get_db_connection', falsa)
    app = Flask(__name__)
    with app.test_request_context('/api/compare/element', method='POST', json=cuerpo):
        g.current_user = {'id': 1, 'role': 'admin'}
        respuesta = compare.compare_element()
    if isinstance(respuesta, tuple):
        respuesta, codigo = respuesta
    else:
        codigo = respuesta.status_code
    return codigo, respuesta.get_json(), conexion.consultas


def test_el_detalle_acepta_un_lado_ausente_y_no_lo_consulta(compare, monkeypatch):
    codigo, cuerpo, consultas = _detalle(compare, monkeypatch,
                                         {'external_id': 'p2', 'a': None, 'b': _source(E31)})
    assert codigo == 200
    assert cuerpo['a'] is None
    assert cuerpo['b'] == {'name': 'Muro 2 (copia)', 'properties': {'Datos': {'Marca': 'E'}}}
    assert len(consultas) == 1


def test_el_detalle_sin_ningun_lado_o_con_un_lado_invalido_es_400(compare, monkeypatch):
    assert _detalle(compare, monkeypatch, {'external_id': 'p2', 'a': None, 'b': None})[0] == 400
    assert _detalle(compare, monkeypatch, {'external_id': 'p2', 'a': {'type': 'frente'}, 'b': _source(E31)})[0] == 400
    assert _detalle(compare, monkeypatch, {'a': _source(P64), 'b': _source(E31)})[0] == 400
