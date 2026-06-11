"""Comparador 5D: pivot de parametros DSI por slot y agregacion por partida. DB-free."""
from routes.compare import _pivot_dsi_rows, _aggregate_por_partida, _scope_filter


ROWS = [
    # elemento e1: slot 1 completo (partida + metrado)
    ('e1', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida1', '05.03.02.08'),
    ('e1', 'SCL_Datos_Metrados - 03_06_DSI_Metrado1', '10.452'),
    # e1: slot 2 con otra partida
    ('e1', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida2', '05.03.01.01'),
    ('e1', 'SCL_Datos_Metrados - 03_06_DSI_Metrado2', '3,5'),
    # e2: misma partida que e1-slot1 (debe sumar)
    ('e2', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida1', '05.03.02.08'),
    ('e2', 'SCL_Datos_Metrados - 03_06_DSI_Metrado1', '2.0 m3'),
    # e3: codigo sin metrado ni unidad -> 0
    ('e3', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida1', '99.99'),
    # e4: SIN Metrado explicito pero Unidad1=m3 -> fallback al Volume nativo (caso real CANAL)
    ('e4', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida1', '05.03.02.08'),
    ('e4', 'SCL_Datos_Metrados - 02_01_DSI_Unidad1', 'm3'),
    ('e4', 'SCL_Datos_Metrados - Volume', '7.5 m^3'),
    # e5: unidad de conteo -> 1
    ('e5', 'SCL_Datos_Metrados - 03_05_DSI_CodigoDePartida1', '07.01.01'),
    ('e5', 'SCL_Datos_Metrados - 02_01_DSI_Unidad1', 'und'),
    # ruido: claves no-DSI se ignoran
    ('e1', 'SCL_Datos_Metrados - Volume', '10.452 m^3'),
    ('e1', 'SCL_Datos_Metrados - 01_13_DSI_Zona', 'CANAL'),
]


def test_pivot_empareja_slots():
    out = _pivot_dsi_rows(ROWS)
    assert out['e1']['05.03.02.08'] == 10.452
    assert out['e1']['05.03.01.01'] == 3.5          # coma decimal soportada
    assert out['e2']['05.03.02.08'] == 2.0          # extrae el numero aunque tenga unidad
    assert out['e3']['99.99'] == 0.0                # codigo sin metrado ni unidad -> 0, no crashea


def test_fallback_nativo_por_unidad():
    out = _pivot_dsi_rows(ROWS)
    assert out['e4']['05.03.02.08'] == 7.5          # sin Metrado1 -> Volume nativo (unidad m3)
    assert out['e5']['07.01.01'] == 1.0             # unidad 'und' -> conteo


def test_agrega_por_partida():
    agg = _aggregate_por_partida(_pivot_dsi_rows(ROWS))
    assert round(agg['05.03.02.08'], 3) == 19.952   # e1 (10.452) + e2 (2.0) + e4 (7.5)
    assert agg['05.03.01.01'] == 3.5


def test_scope_filter():
    cond, params = _scope_filter({'type': 'frente', 'value': '1_CANAL'}, 'ia')
    assert 'model_urn' in cond and params == ['1_CANAL']
    cond, params = _scope_filter({'type': 'source', 'value': 'abc+/='}, 'ia')
    assert 'source_urn' in cond and len(params) == 2
    assert _scope_filter(None, 'ia') == (None, None)
    assert _scope_filter({'type': 'frente'}, 'ia') == (None, None)
