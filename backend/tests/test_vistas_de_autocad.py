# -*- coding: utf-8 -*-
"""LAS VISTAS 2D DE UN DWG, DIBUJADAS POR AUTOCAD (21-sep-2026).

POR QUE
-------
El dueño, comparando un DWG en ALEPHIA y en ACC: «no está respetando la
configuración de vistas y las configuraciones del cadista; lo que se ve en CAD
en mi PC, que se vea lo mismo en la web». Autodesk traducía nuestros DWG con su
conversor antiguo, que los redibuja con sus propias reglas (en las
presentaciones salían capas apagadas en el DWG). ACC pide otra cosa: medido en
su visor con el mismo archivo, sus cuatro vistas 2D son PDF dibujados por el
motor de AutoCAD. La opción es `"advanced": {"2dviews": "pdf"}`.

QUÉ SE FIJA
-----------
1. La traducción de un DWG pide '2dviews': 'pdf'; la de un RVT no, y su vista
   3D completa sigue igual.
2. Va en OTRO objeto de Autodesk (otro URN): la traducción de siempre se sigue
   viendo mientras se prepara la nueva. Ningún plano se queda sin abrir.
3. El lector nuevo la pide; el anterior no, y sigue exactamente igual.
4. Si ya estaba el dibujo en Autodesk, se copia allí mismo en vez de subirlo.
5. Si Autodesk no puede con las vistas de AutoCAD, se vuelve a la de siempre.
6. Las subidas de DWG ya la piden.
"""
import sys
import types

import pytest
from flask import Flask, g

import routes.docs_cad as cad

BUCKET = 'bucket-de-prueba'
TAM = 272897021


def _nodo(nombre='PLANO_DRENAJE.dwg', meta=None, refs=None):
    return {'id': 'n-1', 'v_id': 'v-1', 'version_id': 'v-1', 'name': nombre, 'size': TAM,
            'model_urn': 'b.obra', 'gcs_urn': 'multi-tenant/b.obra/plano.dwg',
            'meta': meta or {}, 'parent_id': None, 'refs': refs or []}


URN_ANTIGUO = cad._urn_for(_nodo(), BUCKET)
URN_PDF = cad._urn_for(_nodo(), BUCKET, pdf=True)


# ── 1 · la opción de Autodesk ───────────────────────────────────────────────

@pytest.fixture
def trabajos(monkeypatch):
    enviados = []

    class _R:
        status_code = 200
        ok = True
        text = ''

        def json(self):
            return {'result': 'created'}

    def _post(url, headers=None, json=None, timeout=None):
        enviados.append({'url': url, 'payload': json, 'headers': headers})
        return _R()
    monkeypatch.setattr(cad.requests, 'post', _post)
    return enviados


def test_un_dwg_pide_sus_vistas_dibujadas_por_autocad(trabajos):
    cad._start_translation('tok', URN_PDF, root_filename='PLANO.dwg', vistas_pdf=True)
    formato = trabajos[0]['payload']['output']['formats'][0]
    assert formato == {'type': 'svf2', 'views': ['2d', '3d'], 'advanced': {'2dviews': 'pdf'}}


def test_sin_pedirlo_la_traduccion_es_la_de_siempre(trabajos):
    cad._start_translation('tok', URN_ANTIGUO, root_filename='PLANO.dwg')
    formato = trabajos[0]['payload']['output']['formats'][0]
    assert 'advanced' not in formato


def test_la_vista_3d_completa_de_un_revit_no_cambia(trabajos):
    cad._start_translation('tok', 'urn-rvt', root_filename='MODELO.rvt', master_views=True)
    formato = trabajos[0]['payload']['output']['formats'][0]
    assert formato['advanced'] == {'generateMasterViews': True}


# ── 2 · otro objeto, otro URN ───────────────────────────────────────────────

def test_las_vistas_de_autocad_van_en_otro_objeto():
    assert cad._object_key_for(_nodo()) == 'docs-v-1.dwg'
    assert cad._object_key_for(_nodo(), pdf=True) == 'docs-v-1-pdf2d.dwg'
    con_ortofoto = _nodo(refs=[{'name': 'orto.tif', 'gcs_urn': 'x', 'size': 9}])
    assert cad._object_key_for(con_ortofoto, pdf=True) == 'docs-v-1-pdf2d-pkg.zip'
    assert URN_PDF != URN_ANTIGUO


def test_solo_los_dwg_admiten_las_vistas_de_autocad():
    assert cad._admite_vistas_pdf(_nodo('A.dwg')) and cad._admite_vistas_pdf(_nodo('A.DWG'))
    assert not cad._admite_vistas_pdf(_nodo('A.rvt'))
    assert not cad._admite_vistas_pdf(_nodo('A.dxf'))


# ── 3 · el lector nuevo las pide ────────────────────────────────────────────

@pytest.fixture
def servidor(monkeypatch):
    """/translate y /status con Autodesk de mentira."""
    estado = {'nodo': _nodo(), 'manifiestos': {}, 'encolados': [], 'guardado': [],
              'token_pedido': 0}

    def _token():
        estado['token_pedido'] += 1
        return 'tok', None
    monkeypatch.setattr(cad, '_load_node', lambda _id: estado['nodo'])
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _n: None)
    monkeypatch.setattr(cad, 'get_internal_token', _token)
    monkeypatch.setattr(cad, '_ensure_bucket', lambda _t: (BUCKET, None))
    monkeypatch.setattr(cad, '_bucket_key', lambda: BUCKET)
    monkeypatch.setattr(cad, '_manifest', lambda _t, urn: (estado['manifiestos'].get(urn), None))
    monkeypatch.setattr(cad, '_save_cad_meta',
                        lambda n, p: estado['guardado'].append(p) or dict((n['meta'].get('cad') or {}), **p))
    monkeypatch.setattr(cad, 'encolar_pretraduccion',
                        lambda node_id, forzar=False, master=False, vistas_pdf=False:
                        estado['encolados'].append({'forzar': forzar, 'vistas_pdf': vistas_pdf}) or True)
    monkeypatch.setattr(cad, '_start_translation', lambda *a, **k: ({'result': 'ok'}, None))
    monkeypatch.setattr(cad, '_esta_entero', lambda *a, **k: True)

    app = Flask(__name__)

    def traducir(cuerpo, rol='editor'):
        with app.test_request_context('/api/docs/cad/translate', method='POST', json=cuerpo):
            g.current_user = {'id': 7, 'role': rol}
            r = cad.translate_cad()
        return (r[0] if isinstance(r, tuple) else r).get_json()

    def consultar(consulta):
        with app.test_request_context('/api/docs/cad/status?' + consulta):
            g.current_user = {'id': 7, 'role': 'editor'}
            r = cad.cad_status()
        return (r[0] if isinstance(r, tuple) else r).get_json()
    return estado, traducir, consultar


NUEVO = {'node_id': 'n-1', 'vistas': 'autocad'}


def test_ya_preparadas_se_dan_sin_preguntar_a_autodesk(servidor):
    estado, traducir, _c = servidor
    estado['nodo']['meta'] = {'cad': {'vistas_pdf': {'status': 'success', 'urn': URN_PDF}}}
    d = traducir(NUEVO)
    assert (d['status'], d['urn'], d['vistas'], d['origen']) == ('success', URN_PDF, 'autocad', 'guardado')
    assert estado['token_pedido'] == 0


def test_mientras_se_preparan_se_ve_la_de_siempre_y_se_encola_una_vez(servidor):
    estado, traducir, _c = servidor
    estado['nodo']['meta'] = {'cad': {'status': 'success', 'urn': URN_ANTIGUO}}
    d = traducir(NUEVO)
    assert (d['status'], d['urn'], d['vistas']) == ('success', URN_ANTIGUO, 'anteriores')
    assert d['preparando_vistas'] is True
    assert estado['encolados'] == [{'forzar': False, 'vistas_pdf': True}]
    # La segunda apertura, con la nueva ya en curso, no la vuelve a encolar.
    estado['manifiestos'][URN_PDF] = {'status': 'inprogress', 'progress': '40%'}
    d = traducir(NUEVO)
    assert d['urn'] == URN_ANTIGUO and len(estado['encolados']) == 1


def test_en_cuanto_estan_se_da_la_nueva(servidor):
    estado, traducir, _c = servidor
    estado['nodo']['meta'] = {'cad': {'status': 'success', 'urn': URN_ANTIGUO,
                                      'vistas_pdf': {'status': 'inprogress', 'urn': URN_PDF}}}
    estado['manifiestos'][URN_PDF] = {'status': 'success'}
    d = traducir(NUEVO)
    assert (d['status'], d['urn'], d['vistas']) == ('success', URN_PDF, 'autocad')
    assert {'vistas_pdf': {'status': 'success', 'urn': URN_PDF}} in estado['guardado']


def test_un_dwg_sin_ninguna_traduccion_espera_a_la_nueva(servidor):
    estado, traducir, _c = servidor
    d = traducir(NUEVO)
    assert (d['status'], d['urn']) == ('inprogress', URN_PDF)
    assert estado['encolados'] == [{'forzar': False, 'vistas_pdf': True}]


def test_si_autodesk_no_puede_con_ellas_se_vuelve_a_la_de_siempre(servidor):
    estado, traducir, _c = servidor
    estado['nodo']['meta'] = {'cad': {'status': 'success', 'urn': URN_ANTIGUO,
                                      'vistas_pdf': {'status': 'failed', 'urn': URN_PDF}}}
    d = traducir(NUEVO)
    assert (d['status'], d['urn']) == ('success', URN_ANTIGUO)
    assert 'vistas' not in d, 'es el camino de siempre, sin tocar'
    assert estado['encolados'] == [], 'no se reintenta sola: solo un administrador con force'


def test_el_lector_anterior_sigue_exactamente_igual(servidor):
    estado, traducir, _c = servidor
    estado['nodo']['meta'] = {'cad': {'status': 'success', 'urn': URN_ANTIGUO}}
    d = traducir({'node_id': 'n-1'})
    assert (d['status'], d['urn'], d['origen']) == ('success', URN_ANTIGUO, 'guardado')
    assert estado['encolados'] == []


def test_un_revit_no_cambia_aunque_el_lector_las_pida(servidor):
    estado, traducir, _c = servidor
    estado['nodo'] = _nodo('MODELO.rvt', meta={'cad': {'status': 'success'}})
    estado['nodo']['meta']['cad']['urn'] = cad._urn_for(estado['nodo'], BUCKET)
    d = traducir(NUEVO)
    assert d['status'] == 'success' and 'vistas' not in d and estado['encolados'] == []


def test_el_estado_de_la_nueva_y_su_vuelta_atras(servidor):
    estado, _t, consultar = servidor
    estado['nodo']['meta'] = {'cad': {'vistas_pdf': {'status': 'inprogress', 'urn': URN_PDF}}}
    d = consultar('node_id=n-1&vistas=autocad')
    assert (d['status'], d['fase'], d['urn']) == ('inprogress', 'subiendo', URN_PDF)
    estado['manifiestos'][URN_PDF] = {'status': 'success'}
    assert consultar('node_id=n-1&vistas=autocad')['urn'] == URN_PDF
    estado['manifiestos'][URN_PDF] = {'status': 'failed', 'derivatives': []}
    assert consultar('node_id=n-1&vistas=autocad')['status'] == 'retry_legacy'


# ── 4 · en segundo plano: copiar en Autodesk en vez de subir ────────────────

@pytest.fixture
def fondo(monkeypatch):
    visto = {'copias': [], 'subidas': [], 'traducciones': [], 'guardado': [], 'descargas': 0}
    nodo = _nodo()

    falso_gcs = types.ModuleType('gcs_manager')

    def _descargar(urn, fichero):
        visto['descargas'] += 1
        return TAM
    falso_gcs.descargar_a_fichero = _descargar
    monkeypatch.setitem(sys.modules, 'gcs_manager', falso_gcs)
    monkeypatch.setattr(cad, '_load_node', lambda _id: nodo)
    monkeypatch.setattr(cad, '_save_cad_meta', lambda n, p: visto['guardado'].append(p) or p)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: ('tok', None))
    monkeypatch.setattr(cad, '_ensure_bucket', lambda _t: (BUCKET, None))
    monkeypatch.setattr(cad, '_manifest', lambda _t, _u: (None, None))
    # En Autodesk esta el objeto de la traduccion de siempre, y no el nuevo.
    monkeypatch.setattr(cad, '_esta_entero', lambda t, b, clave, n: clave == 'docs-v-1.dwg')
    monkeypatch.setattr(cad, '_copiar_en_oss',
                        lambda t, b, o, d: visto['copias'].append((o, d)) or visto.get('copia_ok', True))

    class _F:
        name = 'tmp'

        def seek(self, *a):
            pass

        def close(self):
            pass
    monkeypatch.setattr(cad, 'tempfile', types.SimpleNamespace(NamedTemporaryFile=lambda **k: _F()))
    monkeypatch.setattr(cad.os, 'unlink', lambda ruta: None)

    def _subir(token, bucket, clave, fichero, size=None, avisar=None):
        visto['subidas'].append(clave)
        return 'urn:adsk.objects:os.object:%s/%s' % (bucket, clave), None
    monkeypatch.setattr(cad, '_upload_to_oss', _subir)

    def _traducir(token, urn, force=False, root_filename=None, master_views=False, vistas_pdf=False):
        visto['traducciones'].append({'urn': urn, 'force': force, 'vistas_pdf': vistas_pdf})
        return {'result': 'ok'}, None
    monkeypatch.setattr(cad, '_start_translation', _traducir)
    return visto, nodo


def test_el_dwg_que_ya_estaba_en_autodesk_se_copia_alli(fondo):
    visto, _n = fondo
    cad.pretraducir_en_fondo('n-1', vistas_pdf=True)
    assert visto['copias'] == [('docs-v-1.dwg', 'docs-v-1-pdf2d.dwg')]
    assert visto['subidas'] == [] and visto['descargas'] == 0
    assert visto['traducciones'] == [{'urn': URN_PDF, 'force': True, 'vistas_pdf': True}]
    # Su estado va aparte: la traduccion de siempre no se toca.
    assert all(list(p) == ['vistas_pdf'] for p in visto['guardado'])


def test_si_autodesk_no_copia_se_sube_como_siempre(fondo):
    visto, _n = fondo
    visto['copia_ok'] = False
    cad.pretraducir_en_fondo('n-1', vistas_pdf=True)
    assert visto['subidas'] == ['docs-v-1-pdf2d.dwg'] and visto['descargas'] == 1
    assert visto['traducciones'][0]['vistas_pdf'] is True


def test_sin_pedirlas_el_trabajo_es_el_de_siempre(fondo):
    visto, _n = fondo
    cad.pretraducir_en_fondo('n-1')
    assert visto['copias'] == []
    assert visto['traducciones'] == [{'urn': URN_ANTIGUO, 'force': False, 'vistas_pdf': False}]


def test_un_revit_con_vistas_pedidas_sigue_el_camino_de_siempre(fondo):
    visto, nodo = fondo
    nodo['name'] = 'MODELO.rvt'
    cad.pretraducir_en_fondo('n-1', vistas_pdf=True)
    assert visto['copias'] == [] and visto['traducciones'][0]['vistas_pdf'] is False


# ── 5 · la cola y las subidas ───────────────────────────────────────────────

def test_la_cola_solo_pasa_las_vistas_si_se_piden(monkeypatch):
    llamadas = []

    class _Cola:
        def submit(self, fn, *args):
            llamadas.append(args)
    monkeypatch.setattr(cad, '_COLA_TRADUCCION', _Cola())
    cad.encolar_pretraduccion('n-1')
    cad.encolar_pretraduccion('n-1', vistas_pdf=True)
    assert llamadas == [('n-1', False, False), ('n-1', False, False, True)]


def test_las_subidas_de_dwg_piden_las_vistas_de_autocad():
    import io
    import os
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for fichero, variable in (('routes/documents.py', 'file_id'), ('routes/uploads.py', 'node_id')):
        texto = io.open(os.path.join(raiz, fichero), encoding='utf-8').read()
        assert ("encolar_pretraduccion(%s, vistas_pdf=filename.lower().endswith('.dwg'))" % variable) in texto, fichero


# ── 6 · la lista dice lo que se puede abrir ─────────────────────────────────

def test_la_lista_no_dice_procesando_si_ya_se_abre_con_la_de_siempre(monkeypatch):
    filas = [
        ('n-a', 'A.dwg', 'b.obra', {'cad': {'status': 'success', 'vistas_pdf': {'status': 'inprogress'}}}),
        ('n-b', 'B.dwg', 'b.obra', {'cad': {'vistas_pdf': {'status': 'inprogress', 'started_at': 9e12}}}),
        ('n-c', 'C.dwg', 'b.obra', {'cad': {'vistas_pdf': {'status': 'success'}}}),
    ]

    class _Cur:
        def execute(self, *a):
            pass

        def fetchall(self):
            return filas

    class _Con:
        def cursor(self):
            return _Cur()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False
    monkeypatch.setattr(cad, 'get_db_connection', lambda: _Con())
    import routes.documents as docs
    monkeypatch.setattr(docs, 'verify_project_access', lambda u, m: True)
    app = Flask(__name__)
    with app.test_request_context('/api/docs/cad/estados', method='POST',
                                  json={'node_ids': ['n-a', 'n-b', 'n-c']}):
        g.current_user = {'id': 7, 'role': 'editor'}
        r = cad.cad_estados()
    estados = (r[0] if isinstance(r, tuple) else r).get_json()['estados']
    assert estados == {'n-a': 'success', 'n-b': 'inprogress', 'n-c': 'success'}
