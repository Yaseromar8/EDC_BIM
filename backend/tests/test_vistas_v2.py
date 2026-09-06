# -*- coding: utf-8 -*-
"""El invariante de persistibilidad v2, contra el corpus compartido.

    python -m pytest backend/tests/test_vistas_v2.py

No toca la base: `validar_v2_persistible` es logica pura y esa es justamente la
razon de que viva en su propio modulo y no dentro del manejador de la ruta.

El corpus --`corpus_persistibilidad_v2.json`-- lo recorre TAMBIEN la bateria de
Node sobre `savedViewV2.js`. Ese es el mecanismo que impide que la
comprobacion del navegador y la del servidor se separen con el tiempo: no hay
que acordarse de sincronizarlas, porque un cambio en una sola de las dos rompe
una de las dos baterias.
"""
import json
import pathlib

import pytest

import vistas_v2

CORPUS = json.loads(
    (pathlib.Path(__file__).parent / 'corpus_persistibilidad_v2.json').read_text(encoding='utf-8')
)


def _ids(casos):
    return [c['nombre'] for c in casos]


@pytest.mark.parametrize('caso', CORPUS['casos'], ids=_ids(CORPUS['casos']))
def test_veredicto_del_corpus(caso):
    ok, problemas = vistas_v2.validar_v2_persistible(caso['state'])
    motivos = sorted(set(p['motivo'] for p in problemas))
    assert ok == caso['esperado'], (
        '%s\n  esperado ok=%s, obtenido ok=%s\n  motivos: %s\n  por que: %s'
        % (caso['nombre'], caso['esperado'], ok, motivos, caso['porQue']))
    assert motivos == caso['motivos'], (
        '%s\n  motivos esperados %s, obtenidos %s' % (caso['nombre'], caso['motivos'], motivos))


def test_cada_problema_dice_donde_y_por_que():
    """Un rechazo sin campo no sirve: hay que poder arreglarlo."""
    caso = next(c for c in CORPUS['casos'] if not c['esperado'])
    _, problemas = vistas_v2.validar_v2_persistible(caso['state'])
    assert problemas
    for p in problemas:
        assert p['campo'] and p['motivo'], p


def test_el_alias_del_contrato_es_la_misma_funcion():
    """`validarSavedViewV2Persistible` es el nombre pedido, no otra copia."""
    assert vistas_v2.validarSavedViewV2Persistible is vistas_v2.validar_v2_persistible


def test_urn_real_de_aps_se_detecta_y_el_linaje_no():
    """Las dos formas reales, comprobadas contra `model_config`."""
    import base64
    urn = base64.urlsafe_b64encode(
        b'urn:adsk.wipprod:fs.file:vf.ub2xfjDiRByamkMzvQ?version=50').decode().rstrip('=')
    linaje = 'urn:adsk.wipprod:dm.lineage:ub2xfjDiRByamkMzvQ'
    assert vistas_v2.contiene_urn_de_version(urn)
    assert vistas_v2.contiene_urn_de_version('Standard::Sources::' + urn)
    assert not vistas_v2.contiene_urn_de_version(linaje)
    assert vistas_v2.es_linaje(linaje)
    assert not vistas_v2.es_linaje(urn)


def test_no_se_limpia_nada():
    """La validacion NO modifica el documento que recibe.

    Es la mitad silenciosa de «no se limpia automaticamente»: si el validador
    borrara el campo sobrante de paso, el rechazo se convertiria en una
    correccion que nadie vio.
    """
    caso = next(c for c in CORPUS['casos']
                if 'TRANSITO_V1' in c['motivos'] and isinstance(c['state'], dict))
    antes = json.dumps(caso['state'], sort_keys=True)
    vistas_v2.validar_v2_persistible(caso['state'])
    assert json.dumps(caso['state'], sort_keys=True) == antes


def test_limites_de_metadatos():
    ok, _ = vistas_v2.validar_metadatos('Vista de prueba')
    assert ok

    ok, problemas = vistas_v2.validar_metadatos('   ')
    assert not ok and problemas[0]['motivo'] == 'NOMBRE_VACIO'

    ok, problemas = vistas_v2.validar_metadatos('x' * (vistas_v2.LIM_NOMBRE + 1))
    assert not ok and problemas[0]['motivo'] == 'DEMASIADO_LARGO'

    ok, problemas = vistas_v2.validar_metadatos(
        'v', miniatura='data:image/svg+xml;base64,AAA')
    assert not ok and problemas[0]['motivo'] == 'FORMATO', 'svg lleva script'

    grande = 'data:image/png;base64,' + 'A' * (vistas_v2.LIM_MINIATURA_BYTES + 1)
    ok, problemas = vistas_v2.validar_metadatos('v', miniatura=grande)
    assert not ok and problemas[0]['motivo'] == 'DEMASIADO_GRANDE'

    # Sin nombre, cuando no es obligatorio (es lo que hace PATCH).
    ok, _ = vistas_v2.validar_metadatos(None, descripcion='solo la nota',
                                        obligatorio_nombre=False)
    assert ok
