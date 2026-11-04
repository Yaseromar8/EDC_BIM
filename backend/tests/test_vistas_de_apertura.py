# -*- coding: utf-8 -*-
"""Vistas de apertura de un CAD o un PDF por carpeta (5-nov-2026, docs/archivos/28): lo que se guarda se valida campo a
campo y lo demás se descarta. La ruta entera (contexto, enlaces, permisos de carpeta) se ensaya contra PostgreSQL."""
import json
import math

import pytest

import vistas_de_apertura as vda


def cad(**cambios):
    v = {'presentacion': {'guid': 'g-layout-3', 'nombre': 'PLANTA-SA', 'viewable_id': 'Layout3'},
         'camara': {'name': '', 'eye': [10.0, 20.0, 30.0], 'target': [10.0, 20.0, 0.0], 'up': [0.0, 1.0, 0.0],
                    'worldUpVector': [0.0, 0.0, 1.0], 'pivotPoint': [10.0, 20.0, 0.0], 'distanceToOrbit': 30.0,
                    'aspectRatio': 1.6, 'projection': 'orthographic', 'isOrthographic': True,
                    'orthographicHeight': 42.5, 'fieldOfView': 45}}
    v.update(cambios)
    return v


def test_tipo_del_documento():
    assert vda.tipo_de('PLANO.DWG') == 'cad' and vda.tipo_de('a.dxf') == 'cad'
    assert vda.tipo_de('LAMINAS.PDF') == 'pdf'
    assert vda.tipo_de('modelo.rvt') is None and vda.tipo_de('hoja.xlsx') is None and vda.tipo_de(None) is None


def test_una_vista_de_cad_se_guarda_limpia_y_sin_lo_que_no_es_de_una_vista():
    v = cad()
    v['camara']['inyectado'] = '<script>'
    v['otra_cosa'] = 1
    limpia = vda.validar(v, 'plano.dwg')
    assert limpia['tipo'] == 'cad'
    assert limpia['presentacion'] == {'guid': 'g-layout-3', 'nombre': 'PLANTA-SA', 'viewable_id': 'Layout3'}
    assert 'inyectado' not in limpia['camara'] and 'otra_cosa' not in limpia
    assert limpia['camara']['eye'] == [10.0, 20.0, 30.0] and limpia['camara']['isOrthographic'] is True


@pytest.mark.parametrize('roto', [
    {'presentacion': None},
    {'presentacion': {'guid': '', 'nombre': 'X'}},
    {'presentacion': {'guid': 'g', 'nombre': 'x' * 201}},
    {'camara': {'eye': [1, 2], 'target': [0, 0, 0]}},
    {'camara': {'eye': [1, 2, float('nan')], 'target': [0, 0, 0]}},
    {'camara': {'eye': [1, 2, math.inf], 'target': [0, 0, 0]}},
    {'camara': {'eye': [1, 2, '3'], 'target': [0, 0, 0]}},
    {'camara': {'eye': [1, 2, True], 'target': [0, 0, 0]}},
    {'camara': {'target': [0, 0, 0]}},                                     # sin el ojo no hay encuadre
    {'camara': {'eye': [0, 0, 1], 'target': [0, 0, 0], 'isOrthographic': 'sí'}},
])
def test_una_vista_de_cad_rota_no_entra(roto):
    with pytest.raises(vda.Negativa) as e:
        vda.validar(cad(**roto), 'plano.dwg')
    assert e.value.http == 400


def test_una_vista_de_pdf_es_pagina_zoom_y_centro():
    assert vda.validar({'pagina': 7, 'zoom': 3.2, 'centro': [0.25, 0.8], 'escala': 999}, 'laminas.pdf') == \
        {'tipo': 'pdf', 'pagina': 7, 'zoom': 3.2, 'centro': [0.25, 0.8]}
    for roto in ({'pagina': 0, 'zoom': 1, 'centro': [0.5, 0.5]}, {'pagina': 1.5, 'zoom': 1, 'centro': [0.5, 0.5]},
                 {'pagina': True, 'zoom': 1, 'centro': [0.5, 0.5]}, {'pagina': 1, 'zoom': 0, 'centro': [0.5, 0.5]},
                 {'pagina': 1, 'zoom': 5000, 'centro': [0.5, 0.5]}, {'pagina': 1, 'zoom': 1, 'centro': [0.5]},
                 {'pagina': 1, 'zoom': 1, 'centro': [9, 0.5]}, {'pagina': 1, 'zoom': float('nan'), 'centro': [0.5, 0.5]}):
        with pytest.raises(vda.Negativa):
            vda.validar(roto, 'laminas.pdf')


def test_la_forma_la_decide_el_documento_no_quien_llama():
    with pytest.raises(vda.Negativa):                                      # una vista de PDF en un DWG
        vda.validar({'pagina': 1, 'zoom': 1, 'centro': [0.5, 0.5]}, 'plano.dwg')
    with pytest.raises(vda.Negativa):                                      # una de CAD en un PDF
        vda.validar(cad(), 'laminas.pdf')
    with pytest.raises(vda.Negativa) as e:                                 # ni en lo que no es CAD ni PDF
        vda.validar(cad(), 'modelo.rvt')
    assert e.value.codigo == 'NO_ADMITE_VISTA'


def test_cabe_en_lo_que_la_base_admite():
    limpia = vda.validar(cad(), 'plano.dwg')
    assert len(json.dumps(limpia)) <= vda.TOPE_BYTES
