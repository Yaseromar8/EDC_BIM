"""Propiedades por identificadores: tandas de 1000, tres a la vez (docs/rendimiento/09, 27-nov-2026).

Medido con el PL de Sechura (157.332 objetos): tandas de 500 = ~17 min solo en pedir; de 1000 = ~5,5 min. Lo que no
puede cambiar al ir en paralelo: los MISMOS datos, entregados EN ORDEN y desde el hilo que llama (`recibir` escribe en
estructuras que no son seguras entre hilos), con un tope de respuestas en memoria, y un fallo que para y dice su motivo.
"""
import threading
import time

import pytest

import routes.inventory as inv


class _Resp:
    def __init__(self, status, coleccion=None, texto=''):
        self.status_code = status
        self._c = coleccion
        self.text = texto

    def json(self):
        return {'data': {'type': 'properties', 'collection': self._c}}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f'HTTP {self.status_code}')


def _autodesk(monkeypatch, *, rechaza_mayores_de=None, falla_en=None, demora=0.01):
    """Un Autodesk de mentira: devuelve un objeto por id; anota cuántas peticiones hubo a la vez."""
    estado = {'a_la_vez': 0, 'maximo': 0, 'peticiones': 0, 'tamanos': []}
    cerrojo = threading.Lock()

    def aps(metodo, url, **kw):
        ids = kw['json']['query']['$in'][1:]
        with cerrojo:
            estado['a_la_vez'] += 1
            estado['maximo'] = max(estado['maximo'], estado['a_la_vez'])
            estado['peticiones'] += 1
            estado['tamanos'].append(len(ids))
        try:
            # Las primeras tandas tardan MÁS: si la entrega no respetara el orden, se notaría.
            time.sleep(demora * (3 if ids and ids[0] < 2000 else 1))
            if falla_en is not None and falla_en in ids:
                return _Resp(500, texto='{"diagnostic":"fallo simulado"}')
            if rechaza_mayores_de and len(ids) > rechaza_mayores_de:
                return _Resp(400, texto='{"diagnostic":"demasiados"}')
            return _Resp(200, [{'objectid': i, 'name': f'pieza {i}', 'properties': {}} for i in ids])
        finally:
            with cerrojo:
                estado['a_la_vez'] -= 1

    monkeypatch.setattr(inv, '_aps', aps)
    monkeypatch.setattr(inv, 'set_job', lambda *a, **k: None)
    monkeypatch.setattr(inv, '_fallo_con_motivo', lambda r: (_ for _ in ()).throw(
        Exception(f'Autodesk respondió {r.status_code}: {r.text}')) if r.status_code >= 400 else None)
    return estado


def _extraer(ids):
    recibidos, hilos = [], set()

    def recibir(coleccion):
        hilos.add(threading.get_ident())
        recibidos.extend(o['objectid'] for o in coleccion)

    inv._propiedades_por_identificadores('u', {}, ids, recibir, 'job', lambda: len(recibidos))
    return recibidos, hilos


def test_tandas_de_1000_y_tres_a_la_vez(monkeypatch):
    estado = _autodesk(monkeypatch)
    ids = list(range(1, 7501))
    recibidos, _ = _extraer(ids)
    assert estado['peticiones'] == 8                      # 7.500 ids / 1000 = 8 tandas, no 15
    assert max(estado['tamanos']) == 1000
    assert estado['maximo'] == 3                          # en paralelo, pero nunca más de tres


def test_los_datos_llegan_completos_y_en_orden(monkeypatch):
    _autodesk(monkeypatch)
    ids = list(range(1, 5432))
    recibidos, _ = _extraer(ids)
    assert recibidos == ids                               # mismos ids, sin repetir ni perder, en el orden pedido


def test_se_entregan_desde_el_hilo_que_llama(monkeypatch):
    _autodesk(monkeypatch)
    _, hilos = _extraer(list(range(1, 4001)))
    assert hilos == {threading.get_ident()}


def test_una_tanda_rechazada_se_parte_y_sigue_en_orden(monkeypatch):
    estado = _autodesk(monkeypatch, rechaza_mayores_de=300)
    ids = list(range(1, 3001))
    recibidos, _ = _extraer(ids)
    assert recibidos == ids
    assert max(t for t in estado['tamanos'] if t <= 300) <= 300


def test_un_fallo_para_y_dice_su_motivo(monkeypatch):
    _autodesk(monkeypatch, falla_en=2500)
    with pytest.raises(Exception, match='fallo simulado'):
        _extraer(list(range(1, 9001)))


def test_un_modelo_pequeno_es_una_sola_tanda(monkeypatch):
    estado = _autodesk(monkeypatch)
    recibidos, _ = _extraer(list(range(1, 41)))
    assert recibidos == list(range(1, 41)) and estado['peticiones'] == 1
