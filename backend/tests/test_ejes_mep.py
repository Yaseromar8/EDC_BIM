# -*- coding: utf-8 -*-
"""Los ejes de tuberías y conexiones que Autodesk exporta aparte no entran al inventario (ejes_mep.py).

Caso real (Interferencias, producción, 26-oct-2026): el codo «000_SYP_Codo [6967643]» y su eje
«000_SYP_Codo [6967644]» llegan con los mismos parámetros (02_02_DSI_Longitud = 1.72875, códigos de
partida); el eje sin «Nombre de tipo» y con la categoría del codo, «Uniones de tubería», que el filtro
no reconocía. 439 ejes así se guardaron como conexiones.
"""
import inspect

import ejes_mep as em

CODO = {'Datos de identidad': {'Nombre de tipo': '000_SYP_Codo'},
        'Datos': {'02_02_DSI_Longitud': '1.72875', '03_05_DSI_CodigoDePartida1': '02.05.01.01'}}
EJE = {'Datos de identidad': {},
       'Datos': {'02_02_DSI_Longitud': '1.72875', '03_05_DSI_CodigoDePartida1': '02.05.01.01'}}


def test_el_eje_de_un_codo_en_espanol_se_descarta_y_el_codo_no():
    assert em.es_eje_mep('Uniones de tubería', EJE) is True
    assert em.es_eje_mep('Uniones de tubería', CODO) is False


def test_vale_en_ingles_y_en_espanol_y_para_toda_la_familia_mep():
    for categoria in ('Pipe Fittings', 'Pipes', 'Ducts', 'Flex Pipes', 'Cable Tray Fittings',
                      'Tuberías', 'Accesorios de tuberías', 'Tuberías flexibles', 'Conductos',
                      'Uniones de conducto', 'Tubos', 'Bandejas de cables'):
        assert em.es_eje_mep(categoria, EJE), categoria


def test_revit_en_ingles_type_name():
    assert em.es_eje_mep('Pipe Fittings', {'Identity Data': {'Type Name': 'Elbow'}}) is False
    assert em.es_eje_mep('Pipe Fittings', {'Identity Data': {'Type Name': '  '}}) is True


def test_lo_que_no_es_mep_no_se_toca_aunque_no_tenga_tipo():
    # Interferencias: 56 «Generic Models» y 4 «(Unassigned)» sin tipo que NO son ejes.
    for categoria in ('Generic Models', '(Unassigned)', 'Floors', 'Suelos', 'Muros', None, ''):
        assert em.es_eje_mep(categoria, EJE) is False, categoria


def test_la_extraccion_usa_la_regla_y_cuenta_los_ejes():
    import routes.inventory as inv
    fuente = inspect.getsource(inv)
    assert 'es_eje_mep(revit_cat, merged_props)' in fuente and 'ejes_descartados += 1' in fuente
    assert "MEP_CATEGORIES = {'Pipes'" not in fuente, 'una sola lista: la de ejes_mep.py'
