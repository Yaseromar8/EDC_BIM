# -*- coding: utf-8 -*-
"""Abrir un plano o un documento no repite trabajo ya hecho (lote P1, 15-sep-2026).

QUE SE MIDIO EN PRODUCCION
--------------------------
- `POST /api/docs/cad/translate` en CADA apertura de un CAD ya traducido: creaba el
  bucket y leia el manifiesto en Autodesk, y reescribia en la base el mismo estado.
  De 0,9 a 1,2 s antes de que el visor empezara siquiera a cargar.
- `POST /api/docs/miniaturas/urls` listaba la obra ENTERA para resolver la silueta de
  un solo plano: de 0,7 a 1,3 s por apertura, en el unico proceso que atiende todo.

QUE SE FIJA
-----------
1. translate contesta con lo guardado, sin tocar Autodesk ni la base, SOLO si el URN
   guardado es el de esta version y este empaquetado. Version nueva, referencias
   nuevas, `verificar`, `force` o `vista_3d_completa` de admin, o un estado que no es
   'success', siguen el camino de siempre. La guardia de permisos va antes de todo.
2. miniaturas mira SOLO los documentos pedidos, con su propio nombre como prefijo y
   con tope de objetos; lo de fuera de la obra queda pendiente sin mirar, como antes;
   sella la cache solo de lo mirado.

DB-free: se sustituyen la carga del nodo, la guardia, Autodesk y el almacen.
"""
import threading

import pytest
from flask import Flask, g, jsonify

import gcs_manager
import routes.docs_cad as cad
import routes.documents as doc

NODO = '00000000-0000-4000-8000-0000000cad01'
VERSION_ACTUAL = '00000000-0000-4000-8000-00000000fe02'
VERSION_ANTERIOR = '00000000-0000-4000-8000-00000000fe01'
EDITOR = {'id': 7, 'email': 'residente@obra.test', 'role': 'editor'}
ADMIN = {'id': 1, 'email': 'entidad@obra.test', 'role': 'admin'}


def _respuesta(r):
    resp, codigo = r if isinstance(r, tuple) else (r, r.status_code)
    return codigo, resp.get_json()


# ── 1. cad/translate ────────────────────────────────────────────────────────

def _nodo(cad_guardado=None, v_id=VERSION_ACTUAL, refs=None):
    meta = {'cad': cad_guardado} if cad_guardado is not None else {}
    return {'id': NODO, 'name': 'PLANO_DRENAJE.dwg', 'model_urn': 'b.proj_obra',
            'gcs_urn': 'multi-tenant/b.proj_obra/1787962081_db5f2537_PLANO_DRENAJE.dwg',
            'version_id': v_id, 'size': 2100000, 'meta': meta, 'v_id': v_id,
            'parent_id': None, 'refs': refs or []}


def _urn(nodo):
    """El URN que el servidor calcula para ese nodo: bucket + version + empaquetado."""
    return cad._urn_for(nodo, cad._bucket_key())


@pytest.fixture
def traducir(monkeypatch):
    estado = {'nodo': _nodo(), 'negar': False, 'credenciales': True}
    llamadas = {'token': 0, 'bucket': 0, 'manifiesto': 0, 'guardado': []}

    monkeypatch.setattr(cad, '_load_node',
                        lambda node_id: estado['nodo'] if node_id == NODO else None)

    def _guardia(node):
        if estado['negar']:
            return jsonify({'success': False, 'error': 'No tienes permiso.',
                            'code': 'SIN_PERMISO_DOCUMENTAL'}), 403
        return None
    monkeypatch.setattr(cad, '_guardia_del_plano', _guardia)

    def _token():
        llamadas['token'] += 1
        return ('tok', None) if estado['credenciales'] else (None, 'sin credenciales en la prueba')
    monkeypatch.setattr(cad, 'get_internal_token', _token)

    def _bucket(token):
        llamadas['bucket'] += 1
        return cad._bucket_key(), None
    monkeypatch.setattr(cad, '_ensure_bucket', _bucket)

    def _manifiesto(token, urn):
        llamadas['manifiesto'] += 1
        return {'status': 'success'}, None
    monkeypatch.setattr(cad, '_manifest', _manifiesto)

    def _guardar(node, patch):
        llamadas['guardado'].append(patch)
        return patch
    monkeypatch.setattr(cad, '_save_cad_meta', _guardar)

    app = Flask(__name__)

    def pedir(cuerpo, usuario=EDITOR):
        with app.test_request_context('/api/docs/cad/translate', method='POST', json=cuerpo):
            g.current_user = usuario
            return _respuesta(cad.translate_cad())
    return pedir, estado, llamadas


def test_plano_ya_traducido_se_abre_con_lo_guardado_sin_ir_a_autodesk(traducir):
    pedir, estado, llamadas = traducir
    urn = _urn(_nodo())
    estado['nodo'] = _nodo({'urn': urn, 'status': 'success'})

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 200
    assert d == {'success': True, 'status': 'success', 'urn': urn,
                 'cached': True, 'origen': 'guardado'}
    assert (llamadas['token'], llamadas['bucket'], llamadas['manifiesto']) == (0, 0, 0)
    assert llamadas['guardado'] == [], 'abrir no reescribe en la base el estado que ya estaba'


def test_version_nueva_no_hereda_el_urn_de_la_anterior(traducir):
    """Meta heredada de otra version: el URN guardado no es el de esta."""
    pedir, estado, llamadas = traducir
    urn_anterior = _urn(_nodo(v_id=VERSION_ANTERIOR))
    estado['nodo'] = _nodo({'urn': urn_anterior, 'status': 'success'})

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 200
    assert llamadas['manifiesto'] == 1, 'se pregunta a Autodesk como siempre'
    assert d['urn'] == _urn(estado['nodo']) != urn_anterior
    assert 'origen' not in d
    assert llamadas['guardado'] == [{'urn': d['urn'], 'status': 'success'}]


def test_ortofoto_nueva_en_la_carpeta_tampoco_toma_el_atajo(traducir):
    """Con referencias el objeto es el paquete: otro URN, otra traduccion."""
    pedir, estado, llamadas = traducir
    urn_suelto = _urn(_nodo())
    estado['nodo'] = _nodo({'urn': urn_suelto, 'status': 'success'},
                           refs=[{'name': 'ORTO.tif', 'gcs_urn': 'x', 'size': 1}])

    _codigo, d = pedir({'node_id': NODO})

    assert llamadas['manifiesto'] == 1
    assert d['urn'] != urn_suelto


def test_si_lo_guardado_no_abre_verificar_pregunta_a_autodesk(traducir):
    pedir, estado, llamadas = traducir
    estado['nodo'] = _nodo({'urn': _urn(_nodo()), 'status': 'success'})

    codigo, d = pedir({'node_id': NODO, 'verificar': True})

    assert codigo == 200
    assert (llamadas['token'], llamadas['bucket'], llamadas['manifiesto']) == (1, 1, 1)
    assert 'origen' not in d


@pytest.mark.parametrize('cuerpo', [
    {'node_id': NODO, 'force': True},
    {'node_id': NODO, 'vista_3d_completa': True},
])
def test_forzar_y_vista_3d_de_admin_no_toman_el_atajo(traducir, cuerpo):
    pedir, estado, llamadas = traducir
    estado['nodo'] = _nodo({'urn': _urn(_nodo()), 'status': 'success'})
    estado['credenciales'] = False    # basta con ver que llega a Autodesk

    codigo, _d = pedir(cuerpo, ADMIN)

    assert codigo == 502
    assert llamadas['token'] == 1


def test_force_de_quien_no_es_admin_no_cuenta_y_abre_lo_guardado(traducir):
    pedir, estado, llamadas = traducir
    estado['nodo'] = _nodo({'urn': _urn(_nodo()), 'status': 'success'})

    codigo, d = pedir({'node_id': NODO, 'force': True, 'vista_3d_completa': True}, EDITOR)

    assert codigo == 200 and d.get('origen') == 'guardado'
    assert llamadas['token'] == 0


@pytest.mark.parametrize('guardado', [
    {'status': 'inprogress'}, {'status': 'pending'}, {'status': 'failed'},
    {'status': 'timeout'}, {'status': 'success'}, {},
])
def test_lo_que_no_esta_terminado_con_su_urn_no_se_da_por_hecho(traducir, guardado):
    pedir, estado, llamadas = traducir
    cad_guardado = dict(guardado)
    if guardado.get('status') != 'success':
        cad_guardado['urn'] = _urn(_nodo())   # con URN correcto pero sin terminar
    estado['nodo'] = _nodo(cad_guardado)
    estado['credenciales'] = False

    codigo, _d = pedir({'node_id': NODO})

    assert codigo == 502
    assert llamadas['token'] == 1


def test_la_guardia_de_permisos_va_antes_que_el_atajo(traducir):
    pedir, estado, llamadas = traducir
    estado['nodo'] = _nodo({'urn': _urn(_nodo()), 'status': 'success'})
    estado['negar'] = True

    codigo, d = pedir({'node_id': NODO})

    assert codigo == 403
    assert d['code'] == 'SIN_PERMISO_DOCUMENTAL'
    assert llamadas['token'] == 0


# ── 2. miniaturas/urls ──────────────────────────────────────────────────────

OBRA = 'b.proj_obra'
P = 'multi-tenant/%s/' % OBRA
SELLO = gcs_manager.CACHE_INMUTABLE
A = P + '1787962081_aaaaaaaa_A.pdf'          # con miniatura, ya sellado
B = P + '1787962082_bbbbbbbb_B.pdf'          # con miniatura, subido antes del sello
C = P + '1787962083_cccccccc_C.pdf'          # sin miniatura todavia
OTRO = P + '1787962084_dddddddd_OTRO.pdf'    # de la obra, sin sello, NO pedido
FOTO = P + 'avance/foto.jpg'                 # se sobrescribe: nunca se sella


class _Blob:
    def __init__(self, name, cache_control):
        self.name = name
        self.cache_control = cache_control


class _Almacen:
    """Cliente, bucket y listado de mentira. Anota cada listado que se le pide."""

    def __init__(self, objetos):
        self.objetos = dict(objetos)
        self.listados = []
        self.fallar = set()
        self._candado = threading.Lock()

    def bucket(self, _nombre):
        return self

    def list_blobs(self, prefix=None, max_results=None, **_):
        with self._candado:
            self.listados.append((prefix, max_results))
        if prefix in self.fallar:
            raise RuntimeError('almacen caido')
        nombres = sorted(n for n in self.objetos if n.startswith(prefix or ''))
        if max_results is not None:
            nombres = nombres[:max_results]
        return iter([_Blob(n, self.objetos[n]) for n in nombres])


@pytest.fixture
def miniaturas(monkeypatch):
    almacen = _Almacen({
        A: SELLO, A + '__thumb420.jpg': SELLO,
        B: None, B + '__thumb420.jpg': None,
        C: SELLO,
        OTRO: None, OTRO + '__thumb420.jpg': None,
        FOTO: None,
    })
    monkeypatch.setattr(gcs_manager, 'get_storage_client', lambda: almacen)
    monkeypatch.setattr(gcs_manager, 'generate_signed_url',
                        lambda nombre, *a, **k: 'https://firmada.test/' + nombre.rsplit('/', 1)[-1])
    acceso = {'ok': True}
    monkeypatch.setattr(doc, 'verify_project_access',
                        lambda usuario, obra: acceso['ok'] and obra == OBRA)
    encoladas, selladas = [], []
    monkeypatch.setattr(doc, '_encolar_miniaturas', lambda urns: encoladas.extend(urns) or len(urns))
    monkeypatch.setattr(doc, '_encolar_cache_miniaturas',
                        lambda blobs: selladas.extend(b.name for b in blobs))
    app = Flask(__name__)

    def pedir(urns, obra=OBRA):
        with app.test_request_context('/api/docs/miniaturas/urls', method='POST',
                                      json={'model_urn': obra, 'urns': urns}):
            g.current_user = EDITOR
            return _respuesta(doc.urls_de_miniaturas())
    return pedir, almacen, acceso, encoladas, selladas


def test_la_silueta_de_un_plano_no_lista_la_obra(miniaturas):
    pedir, almacen, _acceso, encoladas, _selladas = miniaturas

    codigo, d = pedir([A])

    assert codigo == 200
    assert d == {'success': True, 'urls': {A: 'https://firmada.test/1787962081_aaaaaaaa_A.pdf__thumb420.jpg'},
                 'pendientes': []}
    assert almacen.listados == [(A, doc._OBJETOS_POR_DOCUMENTO)], 'un listado, con el documento como prefijo'
    assert encoladas == []


def test_varias_se_miran_cada_una_y_solo_esas(miniaturas):
    pedir, almacen, _acceso, encoladas, _selladas = miniaturas

    codigo, d = pedir([A, B, C])

    assert codigo == 200
    assert sorted(prefijo for prefijo, _ in almacen.listados) == sorted([A, B, C])
    assert all(prefijo not in (P, 'multi-tenant/') for prefijo, _ in almacen.listados)
    assert set(d['urls']) == {A, B}
    assert d['pendientes'] == [C]
    assert encoladas == [C]


def test_sella_la_cache_solo_de_lo_mirado_y_solo_si_es_inmutable(miniaturas):
    pedir, _almacen, _acceso, encoladas, selladas = miniaturas

    _codigo, d = pedir([A, B, C, FOTO])

    assert sorted(selladas) == sorted([B, B + '__thumb420.jpg']), \
        'ni lo ya sellado, ni lo que se sobrescribe, ni lo que nadie pidio (OTRO)'
    assert d['pendientes'] == [C, FOTO] and encoladas == [C, FOTO], 'igual que antes'


def test_lo_de_fuera_de_la_obra_queda_pendiente_sin_mirar(miniaturas):
    pedir, almacen, _acceso, _encoladas, _selladas = miniaturas
    ajenos = ['multi-tenant/otra_obra/1787962081_aaaaaaaa_A.pdf', P, 'multi-tenant/', P + 'carpeta/']

    codigo, d = pedir(ajenos)

    assert codigo == 200
    assert almacen.listados == [], 'nunca un listado con un prefijo que no sea de un documento'
    assert d['urls'] == {} and d['pendientes'] == ajenos


def test_un_urn_que_no_es_texto_no_rompe_la_peticion(miniaturas):
    pedir, almacen, _acceso, _encoladas, _selladas = miniaturas

    codigo, d = pedir([12345, A])

    assert codigo == 200
    assert set(d['urls']) == {A} and d['pendientes'] == [12345]
    assert [prefijo for prefijo, _ in almacen.listados] == [A]


def test_sin_acceso_a_la_obra_no_se_toca_el_almacen(miniaturas):
    pedir, almacen, acceso, _encoladas, _selladas = miniaturas
    acceso['ok'] = False

    codigo, _d = pedir([A])

    assert codigo == 403
    assert almacen.listados == []


def test_si_falla_un_documento_los_demas_se_resuelven(miniaturas):
    pedir, almacen, _acceso, _encoladas, _selladas = miniaturas
    almacen.fallar = {B}

    codigo, d = pedir([A, B])

    assert codigo == 200
    assert set(d['urls']) == {A}
    assert d['pendientes'] == [B]


def test_una_carpeta_grande_se_mira_entera_y_una_vez_cada_documento(miniaturas):
    pedir, almacen, _acceso, _encoladas, _selladas = miniaturas
    muchos = [P + '17879621%02d_%08x_L%02d.pdf' % (i, i, i) for i in range(40)]

    codigo, d = pedir(muchos)

    assert codigo == 200
    assert sorted(prefijo for prefijo, _ in almacen.listados) == sorted(muchos)
    assert d['pendientes'] == muchos


def test_sin_urns_no_se_toca_nada(miniaturas):
    pedir, almacen, _acceso, _encoladas, _selladas = miniaturas

    codigo, d = pedir([])

    assert codigo == 200 and d == {'success': True, 'urls': {}, 'pendientes': []}
    assert almacen.listados == []
