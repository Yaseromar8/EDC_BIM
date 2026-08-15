# -*- coding: utf-8 -*-
"""Un transmittal no puede certificar una entrega que no ocurrio.

AREA 13 · flujo ECD. El transmittal es la evidencia de que unos documentos SE
ENTREGARON: se numera (TR-014), se firma con el emisor de la sesion, se avisa
por correo a los destinatarios y se acusa recibo con la fecha del servidor. En
una discusion de plazos es la prueba.

Y aceptaba cualquier lista. Se podia emitir un TR que listara un plano que no
existe, uno de OTRA obra, o un borrador en WIP. El que lo recibe no tiene forma
de saberlo: le llega un correo con el nombre del fichero y la marca de la
plataforma.

Lo del borrador es ademas un rodeo a la puerta de estados: se emitiria
formalmente sin pasar por compartir ni publicar, o sea sin idoneidad y sin
numero de revision. La emision quedaria en el expediente sin nada detras.

DB-free: cursor de mentira.
"""
import importlib

import pytest
from flask import Flask, g

OBRA = 'proyectos/PQT8_TALARA'


class CursorFalso:
    """file_nodes de una obra, con su estado."""

    def __init__(self, nodos):
        # nodos: {id: (nombre, estado)}
        self.nodos = nodos
        self._r = []

    def execute(self, sql, params=None):
        pedidos, obra = params
        self._r = [(i, self.nodos[i][0], self.nodos[i][1])
                   for i in pedidos if i in self.nodos and obra == OBRA]

    def fetchall(self):
        return self._r


@pytest.fixture
def tr(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.transmittals as m
    importlib.reload(m)
    app = Flask(__name__)
    return app, m


NODOS = {
    'aaa': ('PL-001 Planta general.pdf', 'PUBLISHED'),
    'bbb': ('PL-002 Perfil.pdf', 'SHARED'),
    'ccc': ('PL-003 Borrador.pdf', 'WIP'),
    'ddd': ('PL-004 Superado.pdf', 'ARCHIVED'),
}


def _comprobar(app, m, items, nodos=None, obra=OBRA):
    with app.test_request_context('/'):
        g.current_user = {'id': 1, 'role': 'user'}
        return m._items_emisibles(CursorFalso(nodos or NODOS), obra, items)


def _codigo(r):
    cuerpo, estado = r
    return cuerpo.get_json()['code'], estado


# ── Lo que debe pasar ─────────────────────────────────────────────────────

def test_documentos_compartidos_y_publicados_se_pueden_emitir(tr):
    app, m = tr
    items = [{'node_id': 'aaa'}, {'node_id': 'bbb'}]
    assert _comprobar(app, m, items) is None


def test_un_documento_archivado_se_puede_emitir(tr):
    """Archivado es el registro historico, no un borrador: entregarlo como
    constancia de lo que hubo es legitimo."""
    app, m = tr
    assert _comprobar(app, m, [{'node_id': 'ddd'}]) is None


def test_una_lista_vacia_no_es_asunto_de_esta_comprobacion(tr):
    """El manejador ya exige items antes de llegar aqui."""
    app, m = tr
    assert _comprobar(app, m, []) is None


# ── Lo que no ─────────────────────────────────────────────────────────────

def test_no_se_emite_un_documento_que_no_existe(tr):
    """Certificaria una entrega que no ocurrio."""
    app, m = tr
    assert _codigo(_comprobar(app, m, [{'node_id': 'no-existe'}])) == (
        'TRANSMITTAL_ITEM_INEXISTENTE', 400)


def test_no_se_emite_un_documento_de_otra_obra(tr):
    """Ademas de mentir, filtraria el nombre de los documentos de una obra a los
    destinatarios de la otra."""
    app, m = tr
    r = _comprobar(app, m, [{'node_id': 'aaa'}], obra='proyectos/OTRA')
    assert _codigo(r) == ('TRANSMITTAL_ITEM_INEXISTENTE', 400)


def test_no_se_emite_un_borrador(tr):
    """WIP es trabajo en curso: por definicion no emitido. Y emitirlo rodearia
    la puerta de estados -- sin idoneidad y sin numero de revision."""
    app, m = tr
    assert _codigo(_comprobar(app, m, [{'node_id': 'ccc'}])) == (
        'TRANSMITTAL_ITEM_EN_BORRADOR', 400)


def test_un_borrador_entre_documentos_buenos_tambien_para_la_emision(tr):
    """Emitir «los que se puedan» dejaria un TR que dice menos de lo que su
    autor cree haber enviado."""
    app, m = tr
    items = [{'node_id': 'aaa'}, {'node_id': 'ccc'}, {'node_id': 'bbb'}]
    assert _codigo(_comprobar(app, m, items)) == ('TRANSMITTAL_ITEM_EN_BORRADOR', 400)


def test_un_item_sin_identificador_se_rechaza(tr):
    """Un transmittal solo emite documentos del ECD, no lineas de texto."""
    app, m = tr
    assert _codigo(_comprobar(app, m, [{'name': 'algo suelto'}])) == (
        'TRANSMITTAL_ITEM_SIN_NODO', 400)


def test_no_se_dice_si_no_existe_o_si_es_de_otra_obra(tr):
    """Distinguirlo permitiria descubrir que identificadores son validos."""
    app, m = tr
    a = _comprobar(app, m, [{'node_id': 'no-existe'}])[0].get_json()
    b = _comprobar(app, m, [{'node_id': 'aaa'}], obra='proyectos/OTRA')[0].get_json()
    assert a['code'] == b['code']


def test_la_comprobacion_esta_puesta_antes_de_numerar():
    """Si se comprobara despues, un transmittal rechazado ya habria consumido un
    numero de la serie y quedaria un hueco sin explicacion."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'transmittals.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def create_transmittal'):]
    assert cuerpo.index('_items_emisibles') < cuerpo.index('COALESCE(MAX(number)')
