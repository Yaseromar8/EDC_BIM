# -*- coding: utf-8 -*-
"""La lista puede decir como va la preparacion de un plano (16-sep-2026).

QUE SE VIO
----------
Al subir un CAD, ACC pone «Procesando» y un circulo en la fila, y la fecha que
muestra es la del fin de ese proceso. En ALEPHIA no se veia nada: ni preparando,
ni listo, ni fallido. El dueno concluyo que «no se traduce al subir, solo al
abrir» — y el log demostro que si se traducia. Lo que faltaba era contarlo.

QUE SE FIJA
-----------
`POST /api/docs/cad/estados` contesta, para los documentos pedidos:

- 'subiendo'      el fichero viaja a Autodesk (lo anota la pre-traduccion al empezar);
- 'inprogress'    Autodesk lo esta traduciendo;
- 'success'       listo;
- 'failed'        Autodesk no pudo;
- 'atascado'      empezo y lleva mas de una hora sin terminar;
- 'sin_preparar'  nadie lo ha preparado todavia.

Reglas: solo documentos CAD, solo de obras a las que el usuario tiene acceso, y
sin preguntar a Autodesk (se contesta con lo guardado en la version). Si la
consulta falla, se devuelve vacio y la lista se pinta como antes.

DB-free: se sustituyen la base y la comprobacion de acceso a la obra.
"""
import time

import pytest
from flask import Flask, g

import routes.docs_cad as cad
import routes.documents as doc

OBRA = 'b.obra_mia'
AJENA = 'b.obra_de_otro'


class _Cursor:
    def __init__(self, filas):
        self._filas = filas
        self.sql = None
        self.params = None

    def execute(self, sql, params=None):
        self.sql, self.params = sql, params

    def fetchall(self):
        return self._filas


class _Conexion:
    def __init__(self, filas, explota=None):
        self._cur = _Cursor(filas)
        self._explota = explota

    def cursor(self):
        if self._explota:
            raise self._explota
        return self._cur

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def pedir(monkeypatch):
    estado = {'filas': [], 'explota': None, 'cursor': None}

    def _conexion():
        c = _Conexion(estado['filas'], estado['explota'])
        estado['cursor'] = c._cur
        return c
    monkeypatch.setattr(cad, 'get_db_connection', _conexion)
    monkeypatch.setattr(doc, 'verify_project_access',
                        lambda usuario, model_urn: model_urn == OBRA)

    app = Flask(__name__)

    def _pedir(node_ids):
        with app.test_request_context('/api/docs/cad/estados', method='POST',
                                      json={'node_ids': node_ids}):
            g.current_user = {'id': 7, 'role': 'editor'}
            r = cad.cad_estados()
        return r.get_json()
    return _pedir, estado


def _fila(node_id, nombre='PLANO.dwg', obra=OBRA, cad_meta=None):
    meta = {'cad': cad_meta} if cad_meta is not None else {}
    return (node_id, nombre, obra, meta)


def test_dice_lo_que_esta_traduciendose(pedir):
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1', cad_meta={'status': 'inprogress'})]
    assert _pedir(['n1'])['estados'] == {'n1': 'inprogress'}


def test_el_viaje_a_autodesk_tambien_se_cuenta(pedir):
    """Sin esto, un plano grande pasaba minutos sin nada que ensenar."""
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1', cad_meta={'status': 'subiendo', 'started_at': time.time()})]
    assert _pedir(['n1'])['estados'] == {'n1': 'subiendo'}


def test_lo_que_nadie_preparo_se_dice_asi(pedir):
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1')]
    assert _pedir(['n1'])['estados'] == {'n1': 'sin_preparar'}


def test_lo_que_empezo_y_no_termino_en_una_hora_esta_atascado(pedir):
    _pedir, estado = pedir
    viejo = time.time() - cad.STALE_SECONDS - 60
    estado['filas'] = [_fila('n1', cad_meta={'status': 'inprogress', 'started_at': viejo}),
                       _fila('n2', cad_meta={'status': 'subiendo', 'started_at': viejo})]
    assert _pedir(['n1', 'n2'])['estados'] == {'n1': 'atascado', 'n2': 'atascado'}


def test_lo_terminado_y_lo_fallido_se_dicen_tal_cual(pedir):
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1', cad_meta={'status': 'success'}),
                       _fila('n2', cad_meta={'status': 'failed'})]
    assert _pedir(['n1', 'n2'])['estados'] == {'n1': 'success', 'n2': 'failed'}


def test_un_pdf_no_sale_en_la_respuesta(pedir):
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1', nombre='MEMORIA.pdf', cad_meta={'status': 'success'})]
    assert _pedir(['n1'])['estados'] == {}


def test_no_se_filtran_planos_de_una_obra_ajena(pedir):
    _pedir, estado = pedir
    estado['filas'] = [_fila('n1', cad_meta={'status': 'inprogress'}),
                       _fila('n2', obra=AJENA, cad_meta={'status': 'success'})]
    assert _pedir(['n1', 'n2'])['estados'] == {'n1': 'inprogress'}


def test_sin_documentos_no_se_toca_la_base(pedir):
    _pedir, estado = pedir
    estado['explota'] = AssertionError('no tendria que consultar')
    assert _pedir([])['estados'] == {}


def test_si_la_base_falla_la_lista_se_pinta_igual(pedir):
    _pedir, estado = pedir
    estado['explota'] = RuntimeError('base caida')
    respuesta = _pedir(['n1'])
    assert respuesta['success'] is True and respuesta['estados'] == {}


def test_se_pide_como_mucho_de_trescientos_en_trescientos(pedir):
    _pedir, estado = pedir
    estado['filas'] = []
    _pedir(['n%d' % i for i in range(400)])
    assert len(estado['cursor'].params[0]) == 300
