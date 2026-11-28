"""El 409 del inventario dice QUÉ modelos del frente no tienen inventario (26-nov-2026, docs/rendimiento/05 §7).

Antes, «El inventario necesita reextracción cualificada» sin nombre: con 7 modelos en el frente del Centro de
Salud no había forma de saber cuál lo bloqueaba. La regla no cambia (un frente con un modelo sin inventario no
se sirve a medias); solo se dice cuál falta.
"""
from flask import Flask

import inventory_http as ih
from inventory_identity import IdentityError, source_identity

URN_A = 'urn:adsk.wipprod:fs.file:vf.AAAA?version=1'
URN_B = 'urn:adsk.wipprod:fs.file:vf.BBBB?version=1'
URN_C = 'urn:adsk.wipprod:fs.file:vf.CCCC?version=1'


class _Cursor:
    def __init__(self, fuentes, modelos):
        self.fuentes, self.modelos, self._r = fuentes, modelos, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self._r = self.fuentes if 'inventory_identity_b1.sources' in sql else self.modelos

    def fetchall(self):
        return self._r


class _Conn:
    def __init__(self, cursor):
        self._c = cursor

    def cursor(self):
        return self._c


def _con_inventario(urn):
    version, linaje = source_identity(urn)
    return (linaje, version, 1)


def test_dice_cuales_faltan_y_no_solo_el_primero():
    cur = _Cursor(fuentes=[_con_inventario(URN_A)],
                  modelos=[(URN_A, None, 'AR.nwc'), (URN_B, None, 'PL.nwc'), (URN_C, None, None)])
    try:
        ih._ensure_readable(_Conn(cur), ['1_CENTRO_SALUD'])
    except IdentityError as exc:
        assert exc.code == 'INVENTORY_REEXTRACTION_REQUIRED'
        assert exc.details['modelos'] == ['PL.nwc', URN_C]          # sin nombre, su URN
    else:
        raise AssertionError('debía negarse: dos modelos sin inventario')


def test_la_respuesta_nombra_los_modelos_en_lenguaje_claro():
    app = Flask(__name__)
    with app.app_context():
        cuerpo, estado = ih.identity_error_response(
            IdentityError('INVENTORY_REEXTRACTION_REQUIRED', modelos=['PL.nwc']))
        datos = cuerpo.get_json()
    assert estado == 409 and datos['code'] == 'INVENTORY_REEXTRACTION_REQUIRED'
    assert datos['modelos'] == ['PL.nwc']
    assert 'El inventario de PL.nwc no está listo' in datos['error'] and 'Reextraer inventario' in datos['error']


def test_sin_nombres_el_mensaje_es_el_de_siempre():
    app = Flask(__name__)
    with app.app_context():
        cuerpo, estado = ih.identity_error_response(IdentityError('INVENTORY_REEXTRACTION_REQUIRED'))
        datos = cuerpo.get_json()
    assert estado == 409 and 'modelos' not in datos
    assert datos['error'].startswith('El inventario necesita reextracción')
