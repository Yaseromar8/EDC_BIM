# -*- coding: utf-8 -*-
"""Una copia cortada en Autodesk se vuelve a subir (16-sep-2026).

QUE PASO EN PRODUCCION
----------------------
Un DWG de 260,3 MB llego mal al almacen de Autodesk. Model Derivative respondia
«Sorry, the drawing file is invalid and cannot be viewed», el usuario pulsaba
«Volver a intentarlo» y el backend contestaba `[CAD] el fichero ya estaba en
Autodesk: se lanza la traduccion sin volver a subir` — sobre la MISMA copia
mala, cinco veces seguidas en el log. El archivo quedaba muerto.

Que el fichero estaba sano se comprobo por dos caminos: ACC lo tradujo, y
subido aqui de nuevo como documento nuevo tradujo tambien (`success` a los
siete minutos). Lo unico roto era la copia depositada la primera vez.

QUE SE FIJA
-----------
`_esta_entero` compara el tamaño del objeto en Autodesk con el de esta version:

- igual: se da por subido y solo se lanza la traduccion, como hasta ahora;
- distinto o ausente: NO se da por subido, y el camino normal lo vuelve a subir.

Con referencias (ortofotos) lo que viaja es un paquete comprimido, que no pesa
lo que el dibujo: ahi no se compara nada y se conserva la conducta anterior.

DB-free: se sustituye el almacen de Autodesk.
"""
import pytest

import routes.docs_cad as cad

TAMANO = 272897021          # el DWG de 260,3 MB de la medicion
UN_BLOQUE = 94371840        # 90 MB: lo que llega si solo cuaja el primer bloque


class _Respuesta:
    def __init__(self, ok, cuerpo):
        self.ok = ok
        self._cuerpo = cuerpo

    def json(self):
        return self._cuerpo


@pytest.fixture
def almacen(monkeypatch):
    """El almacen de Autodesk: que dice que hay y que pesa."""
    estado = {'tam': TAMANO, 'ok': True, 'explota': None, 'urls': []}

    def _get(url, **kw):
        estado['urls'].append(url)
        if estado['explota']:
            raise estado['explota']
        cuerpo = {} if estado['tam'] is None else {'size': estado['tam']}
        return _Respuesta(estado['ok'], cuerpo)

    monkeypatch.setattr(cad.requests, 'get', _get)
    return estado


def _nodo(size=TAMANO, refs=None):
    return {'id': 'n-1', 'name': 'PLANO_DRENAJE.dwg', 'size': size, 'refs': refs or []}


def _entero(nodo):
    return cad._esta_entero('tok', 'bucket-de-prueba', 'clave/del/objeto', nodo)


def test_la_copia_completa_se_da_por_subida(almacen):
    assert _entero(_nodo()) is True


def test_la_copia_cortada_no_cuenta_y_lo_dice(almacen, capsys):
    almacen['tam'] = UN_BLOQUE
    assert _entero(_nodo()) is False
    salida = capsys.readouterr().out
    assert 'no coincide' in salida
    assert str(UN_BLOQUE) in salida and str(TAMANO) in salida


def test_una_copia_mas_grande_tampoco_cuenta(almacen):
    """Un intento anterior que quedo con basura pegada tampoco vale."""
    almacen['tam'] = TAMANO + 1024
    assert _entero(_nodo()) is False


def test_si_no_hay_nada_en_autodesk_no_esta_subido(almacen):
    almacen['ok'] = False
    assert _entero(_nodo()) is False


def test_si_el_almacen_no_responde_no_se_da_por_subido(almacen):
    almacen['explota'] = RuntimeError('se corto la conexion')
    assert _entero(_nodo()) is False


def test_un_paquete_con_referencias_no_compara_tamanos(almacen):
    """El ZIP con la ortofoto no pesa lo que el DWG: ahi no se compara."""
    almacen['tam'] = 12345
    assert _entero(_nodo(refs=[{'name': 'orto.tif', 'gcs_urn': 'x', 'size': 9}])) is True


def test_sin_tamano_conocido_se_conserva_la_conducta_anterior(almacen):
    """Un documento antiguo sin tamaño anotado no se queda sin poder abrirse."""
    almacen['tam'] = 12345
    assert _entero(_nodo(size=0)) is True


def test_un_objeto_de_cero_bytes_nunca_cuenta(almacen):
    almacen['tam'] = 0
    assert _entero(_nodo()) is False


# ── El endpoint: con una copia cortada, vuelve a subir en vez de traducir ────

def test_translate_vuelve_a_subir_cuando_la_copia_no_coincide(monkeypatch, almacen):
    from flask import Flask, g

    nodo = _nodo()
    nodo.update({'model_urn': 'b.obra', 'gcs_urn': 'multi-tenant/b.obra/plano.dwg',
                 'version_id': 'v1', 'v_id': 'v1', 'meta': {}, 'parent_id': None})
    almacen['tam'] = UN_BLOQUE          # la copia rota que hay hoy en Autodesk
    hecho = {'encolado': 0, 'traducciones': 0}

    monkeypatch.setattr(cad, '_load_node', lambda _id: nodo)
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _n: None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(cad, '_ensure_bucket', lambda _t: (cad._bucket_key(), None))
    monkeypatch.setattr(cad, '_manifest', lambda _t, _u: ({'status': 'failed'}, None))
    monkeypatch.setattr(cad, '_save_cad_meta', lambda _n, _p: _p)

    def _encolar(node_id, forzar=False, master=False):
        hecho['encolado'] += 1
        return True
    monkeypatch.setattr(cad, 'encolar_pretraduccion', _encolar)

    def _traducir(*a, **k):
        hecho['traducciones'] += 1
        return {'result': 'ok'}, None
    monkeypatch.setattr(cad, '_start_translation', _traducir)

    app = Flask(__name__)
    with app.test_request_context('/api/docs/cad/translate', method='POST',
                                  json={'node_id': nodo['id']}):
        g.current_user = {'id': 7, 'role': 'editor'}
        r = cad.translate_cad()
    cuerpo = (r[0] if isinstance(r, tuple) else r).get_json()

    assert cuerpo['success'] is True
    assert cuerpo['status'] == 'inprogress'
    assert hecho['encolado'] == 1, 'tenia que volver a subir el fichero'
    assert hecho['traducciones'] == 0, 'no puede traducir sobre la copia mala'


def test_translate_no_resubre_cuando_la_copia_esta_entera(monkeypatch, almacen):
    """El caso bueno de siempre: el fichero esta entero, solo falta traducir."""
    from flask import Flask, g

    nodo = _nodo()
    nodo.update({'model_urn': 'b.obra', 'gcs_urn': 'multi-tenant/b.obra/plano.dwg',
                 'version_id': 'v1', 'v_id': 'v1', 'meta': {}, 'parent_id': None})
    hecho = {'encolado': 0, 'traducciones': 0}

    monkeypatch.setattr(cad, '_load_node', lambda _id: nodo)
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _n: None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(cad, '_ensure_bucket', lambda _t: (cad._bucket_key(), None))
    monkeypatch.setattr(cad, '_manifest', lambda _t, _u: (None, None))
    monkeypatch.setattr(cad, '_save_cad_meta', lambda _n, _p: _p)
    monkeypatch.setattr(cad, 'encolar_pretraduccion',
                        lambda *a, **k: hecho.__setitem__('encolado', hecho['encolado'] + 1))

    def _traducir(*a, **k):
        hecho['traducciones'] += 1
        return {'result': 'ok'}, None
    monkeypatch.setattr(cad, '_start_translation', _traducir)

    app = Flask(__name__)
    with app.test_request_context('/api/docs/cad/translate', method='POST',
                                  json={'node_id': nodo['id']}):
        g.current_user = {'id': 7, 'role': 'editor'}
        r = cad.translate_cad()
    cuerpo = (r[0] if isinstance(r, tuple) else r).get_json()

    assert cuerpo['status'] == 'inprogress'
    assert hecho['traducciones'] == 1, 'con el fichero entero se traduce sin volver a subir'
    assert hecho['encolado'] == 0


# ── Y DESPUES DE VOLVER A SUBIR, HAY QUE FORZAR LA TRADUCCION ──────────────
#
# Defecto encontrado en produccion el 16-sep, con el arreglo de arriba ya
# desplegado: la copia se rehacia, pero el dibujo seguia dando «the drawing
# file is invalid». La clave del objeto es estable, asi que el URN de despues
# es el MISMO de antes, y Autodesk conserva por URN el resultado anterior --el
# `failed` de la copia mala--. Una peticion de traduccion sin `x-ads-force`
# responde 200 y se limita a informar de ese trabajo viejo, de modo que los
# bytes buenos que acabamos de depositar no se miraban nunca.

class _FicheroDeMentira:
    def __init__(self):
        self.name = 'temporal'

    def seek(self, *a):
        pass

    def close(self):
        pass


@pytest.fixture
def subida(monkeypatch):
    """Todo el viaje a Autodesk, de mentira, anotando como se lanza la traduccion."""
    import sys
    import types

    visto = {'traducciones': [], 'subidas': 0}
    nodo = {'id': 'n-1', 'v_id': 'v-1', 'name': 'PLANO_DRENAJE.dwg',
            'size': TAMANO, 'refs': [], 'gcs_urn': 'gs://obra/plano.dwg', 'meta': {}}

    falso_gcs = types.ModuleType('gcs_manager')
    falso_gcs.descargar_a_fichero = lambda urn, fichero: TAMANO
    monkeypatch.setitem(sys.modules, 'gcs_manager', falso_gcs)

    monkeypatch.setattr(cad, '_load_node', lambda node_id: nodo)
    monkeypatch.setattr(cad, '_save_cad_meta', lambda node, patch: None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(cad, '_ensure_bucket', lambda token: ('bucket-de-prueba', None))
    # Autodesk guarda el resultado de la copia mala.
    monkeypatch.setattr(cad, '_manifest', lambda token, urn: ({'status': 'failed'}, None))
    monkeypatch.setattr(cad, '_esta_entero', lambda *a, **kw: False)
    monkeypatch.setattr(cad, 'tempfile', types.SimpleNamespace(
        NamedTemporaryFile=lambda **kw: _FicheroDeMentira()))
    monkeypatch.setattr(cad.os, 'unlink', lambda ruta: None)

    def _subir(token, bucket, clave, fichero, size=None):
        visto['subidas'] += 1
        return 'urn:adsk.objects:os.object:%s/%s' % (bucket, clave), None
    monkeypatch.setattr(cad, '_upload_to_oss', _subir)

    def _traducir(token, urn, force=False, root_filename=None, master_views=False):
        visto['traducciones'].append({'force': force, 'urn': urn})
        return {'result': 'ok'}, None
    monkeypatch.setattr(cad, '_start_translation', _traducir)

    return visto, nodo


def test_tras_rehacer_la_copia_se_fuerza_la_traduccion(subida):
    """Sin esto, volver a subir no arregla nada: gana el resultado viejo."""
    visto, _nodo_ = subida
    cad.pretraducir_en_fondo('n-1')
    assert visto['subidas'] == 1
    assert len(visto['traducciones']) == 1
    assert visto['traducciones'][0]['force'] is True


def test_el_urn_de_despues_es_el_mismo_de_antes(subida):
    """La razon por la que hay que forzar: el trabajo viejo vive en ese URN."""
    visto, nodo = subida
    antes = cad._urn_for(nodo, 'bucket-de-prueba')
    cad.pretraducir_en_fondo('n-1')
    assert visto['traducciones'][0]['urn'] == antes
