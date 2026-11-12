# -*- coding: utf-8 -*-
"""Modelos de ALEPHIA Docs en el visor (10-nov-2026, docs/archivos/29, F2 y F3): las reglas sin base de datos."""
import pytest

import modelos_de_docs as md

DOC = '2f6e8a1c-0b3d-4c5e-9f7a-1b2c3d4e5f60'
URN_V3 = 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6Y3ViZXRhL3YzLnJ2dA'


def nodo(**cambios):
    n = {'id': DOC, 'name': 'DRENAJE_SECTOR1.rvt', 'v_id': 'v-3', 'model_urn': 'proyectos/PQT8_TALARA',
         'meta': {'cad': {'status': 'success', 'urn': URN_V3}}}
    n.update(cambios)
    return n


def test_el_linaje_es_el_documento_y_se_reconoce():
    linaje = md.linaje_de(DOC.upper())
    assert linaje == 'urn:alephia:docs.lineage:' + DOC
    assert md.es_linaje_de_docs(linaje) and md.documento_del_linaje(linaje) == DOC
    assert not md.es_linaje_de_docs('urn:adsk.wipprod:dm.lineage:abc')          # uno de ACC no lo es
    assert md.documento_del_linaje('urn:adsk.wipprod:dm.lineage:abc') is None
    with pytest.raises(md.Negativa):
        md.linaje_de('no-es-un-id')


def test_un_modelo_es_de_docs_por_su_fuente_y_su_linaje_juntos():
    assert md.es_de_docs({'source': 'ALEPHIA', 'itemId': md.linaje_de(DOC)})
    assert not md.es_de_docs({'source': 'ALEPHIA', 'itemId': 'urn:adsk.wipprod:dm.lineage:x'})
    assert not md.es_de_docs({'source': 'DOCS', 'itemId': md.linaje_de(DOC)})   # el de ACC se llama 'DOCS'
    assert not md.es_de_docs({'source': 'LOCAL'}) and not md.es_de_docs(None)


def test_los_formatos_que_el_visor_federa():
    for n in ('a.rvt', 'B.DWG', 'c.dxf', 'd.nwd', 'e.nwc', 'f.ifc'):
        assert md.admite(n), n
    for n in ('a.pdf', 'b.rfa', 'c.dgn', 'd.xlsx', '', None):
        assert not md.admite(n), n


def test_se_vincula_lo_traducido_de_la_misma_obra_y_una_sola_vez():
    assert md.comprobar(nodo(), '1', '1', URN_V3, []) == md.linaje_de(DOC)
    casos = [
        (dict(n=None), 'NO_ENCONTRADO', 404),
        (dict(n=nodo(name='plano.pdf')), 'FORMATO', 400),
        (dict(obra_doc='2'), 'OTRA_OBRA', 403),
        (dict(obra_frente=None), 'OTRA_OBRA', 403),
        (dict(modelos=[{'itemId': md.linaje_de(DOC)}]), 'DUPLICADO', 409),
        (dict(n=nodo(meta={'cad': {'status': 'inprogress', 'urn': URN_V3}})), 'SIN_TRADUCIR', 409),
        (dict(n=nodo(meta={'cad': {'status': 'success', 'urn': 'urn-de-la-v2'}})), 'SIN_TRADUCIR', 409),
        (dict(n=nodo(meta={})), 'SIN_TRADUCIR', 409),
    ]
    for c, codigo, http in casos:
        with pytest.raises(md.Negativa) as e:
            md.comprobar(c.get('n', nodo()) if 'n' in c else nodo(), c.get('obra_frente', '1'),
                         c.get('obra_doc', '1'), URN_V3, c.get('modelos', []))
        assert (e.value.codigo, e.value.http) == (codigo, http), c


def test_la_ficha_la_pone_el_servidor_con_su_linaje_y_sin_proyecto_de_acc():
    f = md.ficha(nodo(), 3, '1_DRENAJE', URN_V3, 'g-3d', '{3D}', ahora='2026-11-10T10:00:00', model_id='77')
    assert f == {'id': '77', 'name': 'DRENAJE_SECTOR1.rvt', 'urn': URN_V3, 'source': 'ALEPHIA', 'region': 'US',
                 'projectId': None, 'itemId': md.linaje_de(DOC), 'versionId': 'v-3', 'versionNumber': 3,
                 'lastModifiedTime': '2026-11-10T10:00:00', 'added_at': '2026-11-10T10:00:00',
                 'appProjectId': '1_DRENAJE', 'defaultViewGuid': 'g-3d', 'defaultViewName': '{3D}'}
    assert md.es_de_docs(f)


def test_buscar_actualizaciones_tiene_la_forma_de_acc():
    m = {'id': '77', 'name': 'DRENAJE_SECTOR1.rvt', 'versionId': 'v-3', 'versionNumber': 3}
    assert md.comprobacion_de_version(m, 'v-3', 3)['has_update'] is False
    nueva = md.comprobacion_de_version(m, 'v-4', 4)
    assert nueva['has_update'] is True and nueva['latest_version'] == 4 and nueva['current_version'] == 3
    ida = md.comprobacion_de_version(m, None, None, existe=False)
    assert ida['has_update'] is False and ida['reason'] == 'not_in_docs'


# ── F4 · el inventario (B1) reconoce la versión de un documento de Docs (autorizado: «SI A LOS PUNTOS 1. 2 Y 3») ──
import base64  # noqa: E402

import inventory_identity as b1  # noqa: E402

VERSION = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111'


def _urn_de_docs(bucket, clave):
    return base64.urlsafe_b64encode(('urn:adsk.objects:os.object:%s/%s' % (bucket, clave)).encode()).decode().rstrip('=')


@pytest.fixture
def docs(monkeypatch):
    monkeypatch.setenv('APS_DOCS_BUCKET', 'ecd-docs-cad-banco')
    pedidas = []

    def resolver(version, urn):
        pedidas.append(version)
        return DOC.upper() if version == VERSION else None
    monkeypatch.setattr(b1, 'resolver_documento_de_docs', resolver)
    monkeypatch.setattr(b1, '_docs_por_version', {})
    return pedidas


def test_b1_la_version_de_docs_tiene_el_linaje_de_su_documento(docs):
    for clave in ('docs-%s.rvt' % VERSION, 'docs-%s-pkg.zip' % VERSION, 'docs-%s-pdf2d.dwg' % VERSION):
        urn = _urn_de_docs('ecd-docs-cad-banco', clave)
        assert b1.source_identity(urn) == (urn, md.linaje_de(DOC)), clave
    assert docs == [VERSION]                                 # la base se consulta una vez: versión→documento no cambia
    urn = _urn_de_docs('ecd-docs-cad-banco', 'docs-%s.rvt' % VERSION)
    assert b1.source_identity(urn, md.linaje_de(DOC))[1] == md.linaje_de(DOC)
    with pytest.raises(b1.IdentityError) as e:
        b1.source_identity(urn, md.linaje_de('11111111-2222-4333-8444-555566667777'))
    assert e.value.code == 'ITEM_LINEAGE_CONFLICT'
    with pytest.raises(b1.IdentityError) as e:
        b1.source_identity(urn, 'urn:adsk.wipprod:dm.lineage:abc')
    assert e.value.code == 'ITEM_LINEAGE_CONFLICT'


def test_b1_sigue_rechazando_cualquier_otro_oss(docs):
    casos = [
        (_urn_de_docs('otro-bucket', 'docs-%s.rvt' % VERSION), 'INVALID_SOURCE_URN'),        # no es el de Docs
        (_urn_de_docs('ecd-docs-cad-banco', 'docs-%s.rvt' % DOC[::-1][:36]), 'INVALID_SOURCE_URN'),
        (_urn_de_docs('ecd-docs-cad-banco', 'docs-99999999-2222-4333-8444-555566667777.rvt'),
         'UNKNOWN_DOCS_VERSION'),                                                             # no está en la base
        (_urn_de_docs('ecd-docs-cad-banco', 'local-subida.rvt'), 'INVALID_SOURCE_URN'),      # una subida «LOCAL»
        (_urn_de_docs('wip.dm.prod', 'modelo.rvt'), 'INVALID_SOURCE_URN'),
    ]
    for urn, codigo in casos:
        with pytest.raises(b1.IdentityError) as e:
            b1.source_identity(urn)
        assert e.value.code == codigo, urn
    # Y el de ACC, igual que siempre.
    acc = base64.urlsafe_b64encode(b'urn:adsk.wipprod:fs.file:vf.ub2xfjDiRByamkMzvCD7zg?version=50').decode().rstrip('=')
    assert b1.source_identity(acc)[1] == 'urn:adsk.wipprod:dm.lineage:ub2xfjDiRByamkMzvCD7zg'


def test_b1_y_docs_calculan_el_mismo_bucket(monkeypatch):
    from routes import docs_cad
    monkeypatch.delenv('APS_DOCS_BUCKET', raising=False)
    for cid in ('AbC123xyz-Q_99longlonglonglong', None):
        if cid:
            monkeypatch.setenv('APS_CLIENT_ID', cid)
        else:
            monkeypatch.delenv('APS_CLIENT_ID', raising=False)
        assert b1.bucket_de_docs() == docs_cad._bucket_key()
    monkeypatch.setenv('APS_DOCS_BUCKET', 'propio')
    assert b1.bucket_de_docs() == docs_cad._bucket_key() == 'propio'


def test_el_linaje_de_docs_vale_para_las_vistas_guardadas():
    import vistas_v2
    muestras = [md.linaje_de(DOC), 'urn:alephia:docs.lineage:' + DOC.upper(), 'urn:alephia:docs.lineage:modelo-1',
                'urn:alephia:docs.lineage:' + DOC + 'x', 'urn:alephia:otra.lineage:' + DOC]
    # Las dos reglas (la del módulo y la de las vistas guardadas) dicen lo mismo de un linaje de Docs.
    assert [md.es_linaje_de_docs(m) for m in muestras] == [vistas_v2.es_linaje(m) for m in muestras] \
        == [True, False, False, False, False]


# ── Revisión (10-nov-2026): el estado de la traducción se pregunta a Autodesk, y quien no ve no se entera ──
def test_quien_no_ve_el_documento_no_se_entera_de_sus_versiones():
    m = {'id': '77', 'name': 'DRENAJE_SECTOR1.rvt', 'urn': URN_V3, 'versionId': 'v-3', 'versionNumber': 3}
    oculto = md.comprobacion_de_version(m, 'v-4', 4, visible=False)
    assert oculto['has_update'] is False and oculto['reason'] == 'forbidden' and 'latest_version' not in oculto
    assert md.comprobacion_de_version(m, 'v-4', 4)['urn'] == URN_V3       # el visor limpia el aviso por urn


@pytest.fixture
def traduccion(monkeypatch):
    from routes import docs_cad
    import routes.digital_twin as dt
    estado = {'manifiesto': None, 'guardado': [], 'encolados': []}
    monkeypatch.setattr(docs_cad, '_manifest', lambda tok, urn: (estado['manifiesto'], None))
    monkeypatch.setattr(docs_cad, '_save_cad_meta', lambda nodo, patch: estado['guardado'].append(patch))
    monkeypatch.setattr(docs_cad, 'encolar_pretraduccion', lambda *a, **k: estado['encolados'].append(a[0]))
    monkeypatch.setattr(dt, 'get_internal_token', lambda: ('tok', None))
    return estado, dt._estado_de_traduccion


def test_la_traduccion_se_pregunta_a_autodesk_si_la_base_no_la_sabe(traduccion):
    estado, consultar = traduccion
    # La base lo sabe: ni se pregunta.
    assert consultar(nodo(), URN_V3) == ('lista', None)
    # La base dice «en curso» (la pretraducción no vuelve a escribir) y Autodesk ya terminó: lista, y se apunta.
    estado['manifiesto'] = {'status': 'success'}
    en_curso = nodo(meta={'cad': {'status': 'inprogress', 'urn': URN_V3, 'started_at': 9e12}})
    assert consultar(en_curso, URN_V3)[0] == 'lista' and estado['guardado'][-1]['status'] == 'success'
    estado['manifiesto'] = {'status': 'inprogress', 'progress': '40% complete'}
    assert consultar(en_curso, URN_V3, preparar=True) == ('preparando', '40% complete') and not estado['encolados']


def test_una_traduccion_fallida_no_se_relanza_sola_y_el_puente_no_se_toca(traduccion):
    estado, consultar = traduccion
    estado['manifiesto'] = {'status': 'failed', 'derivatives': [{'messages': [{'type': 'error', 'message': 'Tr fail'}]}]}
    assert consultar(nodo(meta={}), URN_V3, preparar=True)[0] == 'fallida' and not estado['encolados']
    estado['manifiesto'] = None
    puente = nodo(meta={'acc_emergency_bridge': True})
    assert consultar(puente, URN_V3, preparar=True)[0] == 'puente' and not estado['encolados']


def test_sin_manifiesto_se_prepara_una_sola_vez(traduccion):
    estado, consultar = traduccion
    import time as _time
    subiendo = nodo(meta={'cad': {'status': 'subiendo', 'started_at': _time.time()}})
    assert consultar(subiendo, URN_V3, preparar=True)[0] == 'preparando' and not estado['encolados']
    assert consultar(nodo(meta={}), URN_V3)[0] == 'preparando' and not estado['encolados']   # sin `preparar`
    assert consultar(nodo(meta={}), URN_V3, preparar=True)[0] == 'preparando' and estado['encolados'] == [DOC]
    # Una subida que se quedó colgada hace horas ya no cuenta como «en curso».
    colgada = nodo(meta={'cad': {'status': 'subiendo', 'started_at': _time.time() - 3 * 3600}})
    consultar(colgada, URN_V3, preparar=True)
    assert estado['encolados'] == [DOC, DOC]


def test_es_urn_de_docs_no_pregunta_a_nadie(monkeypatch):
    monkeypatch.setattr(b1, 'resolver_documento_de_docs', lambda *a: pytest.fail('no debía tocar la base'))
    assert b1.es_urn_de_docs(_urn_de_docs('cualquier-bucket', 'docs-%s.rvt' % VERSION))
    acc = base64.urlsafe_b64encode(b'urn:adsk.wipprod:fs.file:vf.ub2xfjDiRByamkMzvCD7zg?version=50').decode()
    assert not b1.es_urn_de_docs(acc.rstrip('=')) and not b1.es_urn_de_docs('') and not b1.es_urn_de_docs(None)
    assert not b1.es_urn_de_docs('%%%no-es-base64')


# ══ EL SELECTOR LISTA DOCS CON EL ALCANCE DE DOCS (12-nov-2026) ═════════════
# Visto en produccion el dia que se publico: «Importar modelo → ALEPHIA Docs» salia vacio en la raiz. La ruta
# mandaba `projects.model_urn`, y Docs guarda y lista su expediente bajo el alcance de ESCRITURA de la obra
# (`project_ref.es_escritura`; sin ninguno, el id). Ninguna prueba lo vio porque en todas el id, el `model_urn` y el
# alcance eran la misma cadena: aqui son tres distintas, a proposito.

class _CursorDeObra:
    def __init__(self, e):
        self.e, self._uno = e, None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self.e['sql'].append(s)
        if s.startswith('SELECT NAME FROM PROJECTS'):
            self._uno = (self.e['nombre'],) if self.e['nombre'] else None
        elif s.startswith('SELECT ALIAS FROM PROJECT_REF'):
            self._uno = (self.e['alias'],) if self.e['alias'] else None
        elif 'MODEL_URN' in s and 'FROM PROJECTS' in s:
            self._uno = ('urn-del-modelo-3d-que-no-es-el-de-docs', self.e['nombre'])
        else:
            self._uno = None

    def fetchone(self):
        return self._uno


class _ConexionDeObra:
    def __init__(self, e):
        self.e = e

    def cursor(self):
        return _CursorDeObra(self.e)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def selector(monkeypatch):
    from flask import Flask
    import db
    from routes import digital_twin as dt
    e = {'sql': [], 'nombre': 'PQT8_TALARA', 'alias': 'proyectos/PQT8_TALARA', 'obra': 'obra-17'}
    monkeypatch.setattr(dt, 'guardia_de_obra', lambda frente, accion='': None)
    monkeypatch.setattr(db, 'resolve_project_id', lambda frente: e['obra'])
    monkeypatch.setattr(db, 'get_db_connection', lambda: _ConexionDeObra(e))
    app = Flask(__name__)

    def pedir(frente='frente-1'):
        with app.test_request_context('/api/config/project/docs-obra?project=' + frente):
            r = dt.docs_de_la_obra_del_frente()
            cuerpo, estado = (r[0], r[1]) if isinstance(r, tuple) else (r, 200)
            return estado, cuerpo.get_json()

    return e, pedir


def test_el_selector_lista_docs_con_el_alcance_de_escritura_de_la_obra(selector):
    e, pedir = selector
    estado, cuerpo = pedir()
    assert estado == 200 and cuerpo['success'] is True
    # Lo que `/api/docs/list` espera en `model_urn`: donde Docs guarda el expediente.
    assert cuerpo['model_urn'] == 'proyectos/PQT8_TALARA'
    assert cuerpo['nombre'] == 'PQT8_TALARA'
    assert cuerpo['formatos'] == list(md.FORMATOS)


def test_una_obra_sin_historia_se_lista_por_su_id(selector):
    e, pedir = selector
    e['alias'] = None
    estado, cuerpo = pedir()
    assert estado == 200 and cuerpo['model_urn'] == 'obra-17'


def test_el_selector_no_usa_el_model_urn_de_la_ficha_de_la_obra(selector):
    e, pedir = selector
    _, cuerpo = pedir()
    assert cuerpo['model_urn'] != 'urn-del-modelo-3d-que-no-es-el-de-docs'
    assert not any('MODEL_URN' in s and 'FROM PROJECTS' in s for s in e['sql'])


def test_un_frente_sin_obra_o_una_obra_que_ya_no_existe_lo_dicen(selector):
    e, pedir = selector
    e['nombre'] = None
    estado, cuerpo = pedir()
    assert estado == 404 and cuerpo['success'] is False
    e['nombre'], e['obra'] = 'PQT8_TALARA', None
    estado, cuerpo = pedir()
    assert estado == 404 and cuerpo['success'] is False
