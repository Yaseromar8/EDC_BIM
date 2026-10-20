"""Llamadas a Autodesk con plazo y «404 = sin traducir» (20-oct-2026); sin red ni base.

Lo que protegen, medido en producción ese día:
  - una extracción del RVT más pesado de 1_DRENAJE se quedó en «intento 1» para siempre
    (petición sin timeout) y dejó el frente bloqueado (409);
  - Actualizar cambió un modelo de 1_CANAL a una v5 sin traducir porque el 404 del
    manifiesto se tomaba como «listo».
"""
import requests

import routes.digital_twin as dt
import routes.inventory as inv


class Resp:
    def __init__(self, status, cuerpo=None):
        self.status_code = status
        self.ok = 200 <= status < 300
        self._cuerpo = cuerpo or {}

    def json(self):
        return self._cuerpo


def _guion(monkeypatch, pasos):
    """`requests.request` devuelve (o lanza) cada paso en orden; se apuntan las llamadas."""
    llamadas = []
    pasos = list(pasos)

    def falso(metodo, url, **kw):
        llamadas.append((metodo, url, kw))
        paso = pasos.pop(0)
        if isinstance(paso, Exception):
            raise paso
        return paso
    monkeypatch.setattr(inv.requests, 'request', falso)
    monkeypatch.setattr(inv.time, 'sleep', lambda s: None)
    return llamadas


def test_toda_llamada_lleva_plazo(monkeypatch):
    llamadas = _guion(monkeypatch, [Resp(200)])
    assert inv._aps('GET', 'https://aps/x', headers={}).status_code == 200
    assert llamadas[0][2]['timeout'] == inv.APS_PLAZO


def test_un_corte_o_un_plazo_vencido_se_reintentan(monkeypatch):
    llamadas = _guion(monkeypatch, [requests.Timeout(), requests.ConnectionError(), Resp(200)])
    assert inv._aps('POST', 'https://aps/q', json={}).status_code == 200
    assert len(llamadas) == 3


def test_si_autodesk_nunca_contesta_falla_en_vez_de_colgarse(monkeypatch):
    _guion(monkeypatch, [requests.Timeout()] * 3)
    try:
        inv._aps('GET', 'https://aps/x')
    except requests.Timeout:
        pass
    else:
        raise AssertionError('debía fallar con su motivo, no devolver nada')


def test_5xx_y_429_se_reintentan_pero_un_404_no(monkeypatch):
    llamadas = _guion(monkeypatch, [Resp(503), Resp(429), Resp(200)])
    assert inv._aps('GET', 'https://aps/x').status_code == 200 and len(llamadas) == 3
    llamadas = _guion(monkeypatch, [Resp(404)])
    assert inv._aps('GET', 'https://aps/x').status_code == 404 and len(llamadas) == 1
    llamadas = _guion(monkeypatch, [Resp(503)] * 3)
    assert inv._aps('GET', 'https://aps/x').status_code == 503 and len(llamadas) == 3   # el último se entrega


def test_el_arbol_se_pide_como_grande(monkeypatch):
    fuente = open(inv.__file__, encoding='utf-8').read()
    assert '/metadata/{guid}?forceget=true' in fuente
    assert "hier_resp = requests.get(" not in fuente


def test_la_extraccion_ya_no_llama_a_autodesk_sin_plazo():
    fuente = open(inv.__file__, encoding='utf-8').read()
    inicio = fuente.index('def extract_metadata_task')
    fin = fuente.index("@inventory_bp.route('/api/inventory/extract', methods=['POST'])")
    cuerpo = fuente[inicio:fin]
    for linea in cuerpo.splitlines():
        if 'requests.get(' in linea or 'requests.post(' in linea:
            assert 'timeout=' in linea, linea.strip()


def _manifiesto(monkeypatch, resp):
    monkeypatch.setattr(dt.requests, 'get', lambda *a, **k: resp)


def test_un_404_del_manifiesto_es_que_no_esta_traducido(monkeypatch):
    _manifiesto(monkeypatch, Resp(404))
    assert dt._is_model_translated('urn', 'tok') is False


def test_lo_demas_no_cambia(monkeypatch):
    _manifiesto(monkeypatch, Resp(200, {'status': 'success'}))
    assert dt._is_model_translated('urn', 'tok') is True
    _manifiesto(monkeypatch, Resp(200, {'status': 'inprogress'}))
    assert dt._is_model_translated('urn', 'tok') is False
    _manifiesto(monkeypatch, Resp(500))
    assert dt._is_model_translated('urn', 'tok') is True        # una duda sigue sin bloquear
