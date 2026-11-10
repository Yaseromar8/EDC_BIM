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

    def resolver(version):
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
