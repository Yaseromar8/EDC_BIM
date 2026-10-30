# -*- coding: utf-8 -*-
"""El itemizado de la obra para la Planilla del visor (sql/40, routes/planilla.py, planilla_itemizado.py).

Se fija:
  1. la validación: lo que se guarda está normalizado y lo inválido se rechaza diciendo por qué;
  2. la seguridad: obra resuelta en el servidor, miembros leen, solo el administrador de la obra cambia;
  3. las versiones: una sola vigente, la misma lista no crea otra versión, quitar no borra.
No conecta a una base real: una tabla de juguete entiende las sentencias de la ruta.
"""
import contextlib
import json

import pytest
from flask import Flask, g, jsonify

import planilla_itemizado as pi
import routes.planilla as rp


ITEMS = [
    {'item': '06', 'descripcion': 'DRENAJE URBANO', 'unidad': ''},
    {'item': '06.02.01.03.05', 'descripcion': 'INSTALACION DE TUBERIA  HDPE', 'unidad': 'm'},
    {'item': '06.05.02.04.03', 'descripcion': 'BUZON TIPO T2', 'unidad': 'und'},
]


# ── 1. Validación ───────────────────────────────────────────────────────────────────────────

def test_normaliza_espacios_y_conserva_el_orden():
    n = pi.validar_items(ITEMS)
    assert [x['item'] for x in n] == ['06', '06.02.01.03.05', '06.05.02.04.03']
    assert n[1]['descripcion'] == 'INSTALACION DE TUBERIA HDPE'


def test_un_titulo_puede_no_tener_unidad_ni_descripcion():
    assert pi.validar_items([{'item': '06'}]) == [{'item': '06', 'descripcion': '', 'unidad': ''}]


@pytest.mark.parametrize('items, codigo', [
    ([], 'ITEMS_VACIOS'),
    (None, 'ITEMS_VACIOS'),
    ([{'item': ''}], 'ITEM_INVALIDO'),
    ([{'item': 6}], 'ITEM_INVALIDO'),
    (['06'], 'ITEM_INVALIDO'),
    ([{'item': 'x' * (pi.MAX_ITEM + 1)}], 'ITEM_INVALIDO'),
    ([{'item': '06', 'descripcion': 'd' * (pi.MAX_DESCRIPCION + 1)}], 'ITEM_INVALIDO'),
    ([{'item': '06', 'unidad': 'u' * (pi.MAX_UNIDAD + 1)}], 'ITEM_INVALIDO'),
])
def test_rechaza_lo_invalido_con_su_codigo(items, codigo):
    with pytest.raises(pi.ItemizadoInvalido) as e:
        pi.validar_items(items)
    assert e.value.codigo == codigo


def test_un_codigo_repetido_se_rechaza_y_se_dice_cual():
    with pytest.raises(pi.ItemizadoInvalido) as e:
        pi.validar_items(ITEMS + [{'item': '06', 'descripcion': 'OTRA'}])
    assert e.value.codigo == 'ITEM_DUPLICADO' and e.value.detalle == ['06'] and '06' in e.value.mensaje


def test_demasiados_items():
    with pytest.raises(pi.ItemizadoInvalido) as e:
        pi.validar_items([{'item': str(i)} for i in range(pi.MAX_ITEMS + 1)])
    assert e.value.codigo == 'DEMASIADOS_ITEMS'


def test_el_origen_guarda_solo_el_nombre_del_archivo():
    archivo, hoja, columnas = pi.validar_origen('C:\\Users\\x\\Presupuesto_Rv00.xlsx', 'CAOV', {'item': 1, 'descripcion': 4, 'unidad': 5})
    assert archivo == 'Presupuesto_Rv00.xlsx' and hoja == 'CAOV' and columnas == {'item': 1, 'descripcion': 4, 'unidad': 5}
    with pytest.raises(pi.ItemizadoInvalido):
        pi.validar_origen('a.xlsx', columnas={'item': 'B'})
    with pytest.raises(pi.ItemizadoInvalido):
        pi.validar_origen('')


def test_la_huella_es_la_de_la_lista_normalizada():
    a = pi.huella(pi.validar_items(ITEMS))
    b = pi.huella(pi.validar_items([dict(x, descripcion=x['descripcion'].replace('  ', ' ')) for x in ITEMS]))
    assert a == b and len(a) == 64
    assert pi.huella(pi.validar_items(ITEMS[:2])) != a


# ── 2 y 3. Rutas, con una base de juguete (tests/planilla_base_de_juguete.py) ─────────────────

from tests.planilla_base_de_juguete import Base, ITEMIZADOS  # noqa: E402

USUARIO = {'id': 7, 'name': 'Ana'}


# La obra PQT8 registra dos frentes; OTRA no registra ninguno.
OBRAS = {'PQT8': 'PQT8', 'PQT8_CANAL': 'PQT8', 'PQT8_DRENAJE': 'PQT8', 'PQT8_OTRO': 'PQT8', 'OTRA_OBRA': 'OTRA'}


@pytest.fixture
def entorno(monkeypatch):
    t = Base(ITEMIZADOS, frentes={'PQT8': ['CANAL', 'DRENAJE']})
    estado = {'miembro': True, 'admin': True, 'usuario': dict(USUARIO)}
    app = Flask(__name__)
    app.register_blueprint(rp.planilla_bp)
    app.before_request(lambda: setattr(g, 'current_user', estado['usuario']))
    monkeypatch.setattr(rp, 'get_db_connection', t.conexion)
    # Frente → obra canónica, como resolve_project_id; lo desconocido no resuelve.
    monkeypatch.setattr(rp, 'resolve_project_id', OBRAS.get)
    monkeypatch.setattr(rp, 'guardia_de_obra', lambda valor, accion='':
                        None if estado['miembro'] else (jsonify({'error': 'Sin acceso', 'code': 'PROJECT_FORBIDDEN'}), 403))
    monkeypatch.setattr(rp, '_es_admin', lambda cur, obra: estado['admin'])
    return app.test_client(), t, estado


def _subir(cli, items=ITEMS, project='PQT8_CANAL', **extra):
    return cli.post('/api/planilla/itemizado', json={'project': project, 'archivo': 'Presupuesto_Rv00.xlsx', 'hoja': 'CAOV',
                                                     'columnas': {'item': 1, 'descripcion': 4, 'unidad': 5}, 'items': items, **extra})


def test_sin_itemizado_la_obra_responde_vacio(entorno):
    cli, _, _ = entorno
    r = cli.get('/api/planilla/itemizado?project=PQT8_CANAL')
    assert r.status_code == 200 and r.get_json()['vigente'] is None and r.get_json()['versiones'] == []


def test_guardar_desde_un_frente_crea_la_version_1_de_ese_frente(entorno):
    cli, t, _ = entorno
    r = _subir(cli)
    assert r.status_code == 201 and r.get_json()['version'] == 1 and r.get_json()['n_items'] == 3
    assert t.filas[0]['project_id'] == 'PQT8' and t.filas[0]['frente'] == 'CANAL' and t.filas[0]['creado_por'] == 7
    assert t.filas[0]['items'][1]['descripcion'] == 'INSTALACION DE TUBERIA HDPE', 'se guarda normalizado'
    assert t.locks == ['planilla_itemizado:PQT8:CANAL']
    j = cli.get('/api/planilla/itemizado?project=PQT8_CANAL').get_json()
    assert j['vigente']['version'] == 1 and j['frente'] == 'CANAL' and j['heredado'] is False and j['por_frente'] is True
    # El OTRO frente de la misma obra NO lo ve: cada frente tiene el suyo (docs/visor/51).
    assert cli.get('/api/planilla/itemizado?project=PQT8_DRENAJE').get_json()['vigente'] is None


def test_la_misma_lista_no_crea_otra_version(entorno):
    cli, t, _ = entorno
    _subir(cli)
    r = _subir(cli, items=[dict(x) for x in ITEMS])
    assert r.status_code == 200 and r.get_json() == {'success': True, 'version': 1, 'sin_cambios': True, 'n_items': 3}
    assert len(t.filas) == 1


def test_otra_lista_crea_la_version_2_y_la_1_queda_en_el_historial(entorno):
    cli, t, _ = entorno
    _subir(cli)
    r = _subir(cli, items=ITEMS[:2])
    assert r.status_code == 201 and r.get_json()['version'] == 2
    assert [f['vigente'] for f in t.filas] == [False, True] and t.filas[0]['retirado_por'] == 7
    j = cli.get('/api/planilla/itemizado?project=PQT8_CANAL').get_json()
    assert j['vigente']['version'] == 2 and [v['version'] for v in j['versiones']] == [2, 1]
    assert [v['vigente'] for v in j['versiones']] == [True, False]


def test_quitar_deja_la_obra_sin_vigente_pero_no_borra(entorno):
    cli, t, _ = entorno
    _subir(cli)
    r = cli.delete('/api/planilla/itemizado?project=PQT8_CANAL')
    assert r.status_code == 200 and r.get_json()['retirada'] == 1
    assert len(t.filas) == 1 and not t.filas[0]['vigente']
    assert cli.get('/api/planilla/itemizado?project=PQT8_CANAL').get_json()['vigente'] is None
    assert cli.delete('/api/planilla/itemizado?project=PQT8_CANAL').get_json()['retirada'] is None


def test_quien_no_es_de_la_obra_no_lee_ni_escribe(entorno):
    cli, t, estado = entorno
    estado['miembro'] = False
    assert cli.get('/api/planilla/itemizado?project=PQT8_CANAL').status_code == 403
    assert _subir(cli).status_code == 403
    assert cli.delete('/api/planilla/itemizado?project=PQT8_CANAL').status_code == 403
    assert t.filas == []


def test_un_miembro_que_no_administra_lee_pero_no_cambia(entorno):
    cli, t, estado = entorno
    _subir(cli)
    estado['admin'] = False
    j = cli.get('/api/planilla/itemizado?project=PQT8_CANAL').get_json()
    assert j['vigente']['version'] == 1 and j['puede_editar'] is False
    r = _subir(cli, items=ITEMS[:1])
    assert r.status_code == 403 and r.get_json()['code'] == 'NOT_PROJECT_ADMIN'
    assert cli.delete('/api/planilla/itemizado?project=PQT8_CANAL').status_code == 403
    assert len(t.filas) == 1 and t.filas[0]['vigente']


def test_una_obra_que_no_se_resuelve_no_se_adivina(entorno):
    cli, t, _ = entorno
    # La guardia deja pasar (como al Entity Admin), pero sin obra canónica no se guarda nada.
    r = _subir(cli, project='global')
    assert r.status_code == 403 and r.get_json()['code'] == 'PROJECT_UNRESOLVED' and t.filas == []
    assert cli.get('/api/planilla/itemizado').status_code == 403


def test_las_obras_no_se_mezclan(entorno):
    cli, t, _ = entorno
    _subir(cli)
    _subir(cli, project='OTRA_OBRA', items=ITEMS[:1])
    assert sorted((f['project_id'], f['version']) for f in t.filas) == [('OTRA', 1), ('PQT8', 1)]
    assert cli.get('/api/planilla/itemizado?project=OTRA_OBRA').get_json()['vigente']['n_items'] == 1


def test_lo_invalido_se_rechaza_sin_tocar_la_base(entorno):
    cli, t, _ = entorno
    r = _subir(cli, items=ITEMS + [{'item': '06'}])
    assert r.status_code == 400 and r.get_json()['code'] == 'ITEM_DUPLICADO' and r.get_json()['detalle'] == ['06']
    assert _subir(cli, items=[]).status_code == 400
    assert cli.post('/api/planilla/itemizado', data='no es json', content_type='application/json').status_code == 400
    assert t.filas == []


def test_un_cuerpo_demasiado_grande_se_corta_antes_de_leerlo(entorno, monkeypatch):
    cli, t, _ = entorno
    monkeypatch.setattr(rp, 'LIMITE_CUERPO', 100)
    r = _subir(cli)
    assert r.status_code == 413 and t.filas == []


def test_una_sesion_sin_id_numerico_guarda_sin_autor_y_nunca_responde_401(entorno):
    # La identidad demo del desarrollo local es {'id': 'demo'}. Un 401 haría que el visor cerrara la
    # sesión y volviera a la lista de proyectos (visto en el 5173 el 25-oct); se guarda sin autor.
    cli, t, estado = entorno
    estado['usuario'] = {'id': 'demo', 'name': 'Demo User'}
    r = _subir(cli)
    assert r.status_code == 201 and t.filas[0]['creado_por'] is None
    assert cli.delete('/api/planilla/itemizado?project=PQT8_CANAL').status_code == 200


def test_sin_la_migracion_se_dice_cual_falta(entorno):
    cli, t, _ = entorno
    t.existe[ITEMIZADOS] = False
    for r in (cli.get('/api/planilla/itemizado?project=PQT8_CANAL'), _subir(cli),
              cli.delete('/api/planilla/itemizado?project=PQT8_CANAL')):
        assert r.status_code == 503 and r.get_json()['code'] == 'MIGRATION_MISSING' and '40' in r.get_json()['error']


# ── Por frente (migración 42, docs/visor/51) ────────────────────────────────────────────────

def _leer(cli, project):
    return cli.get('/api/planilla/itemizado?project=' + project).get_json()


def test_cada_frente_tiene_el_suyo_y_la_version_es_unica_en_la_obra(entorno):
    cli, t, _ = entorno
    assert _subir(cli, project='PQT8_CANAL').get_json()['version'] == 1
    assert _subir(cli, project='PQT8_DRENAJE', items=ITEMS[:2]).get_json()['version'] == 2
    assert [(f['frente'], f['version'], f['vigente']) for f in t.filas] == [('CANAL', 1, True), ('DRENAJE', 2, True)]
    canal, drenaje = _leer(cli, 'PQT8_CANAL'), _leer(cli, 'PQT8_DRENAJE')
    assert canal['vigente']['n_items'] == 3 and [v['version'] for v in canal['versiones']] == [1]
    assert drenaje['vigente']['n_items'] == 2 and [v['version'] for v in drenaje['versiones']] == [2]
    # Cambiar el de un frente no retira el del otro.
    _subir(cli, project='PQT8_CANAL', items=ITEMS[:1])
    assert _leer(cli, 'PQT8_DRENAJE')['vigente']['version'] == 2 and _leer(cli, 'PQT8_CANAL')['vigente']['version'] == 3


def test_un_frente_sin_el_suyo_usa_el_de_la_obra_hasta_que_suba_el_suyo(entorno):
    cli, t, _ = entorno
    r = _subir(cli, project='PQT8')            # el de la obra entera, como antes de la 42
    assert r.status_code == 201 and t.filas[0]['frente'] == '' and t.locks == ['planilla_itemizado:PQT8']
    j = _leer(cli, 'PQT8_CANAL')
    assert j['vigente']['version'] == 1 and j['heredado'] is True and j['frente'] == 'CANAL'
    assert [v['version'] for v in j['versiones']] == [1], 'el historial es el del itemizado que se usa'
    _subir(cli, project='PQT8_CANAL', items=ITEMS[:2])
    j = _leer(cli, 'PQT8_CANAL')
    assert j['vigente']['version'] == 2 and j['heredado'] is False
    assert _leer(cli, 'PQT8_DRENAJE')['heredado'] is True and _leer(cli, 'PQT8')['vigente']['version'] == 1


def test_quitar_el_de_un_frente_no_toca_el_de_la_obra(entorno):
    cli, t, _ = entorno
    _subir(cli, project='PQT8')
    _subir(cli, project='PQT8_CANAL', items=ITEMS[:2])
    r = cli.delete('/api/planilla/itemizado?project=PQT8_CANAL')
    assert r.status_code == 200 and r.get_json()['retirada'] == 2
    assert [(f['frente'], f['vigente']) for f in t.filas] == [('', True), ('CANAL', False)]
    j = _leer(cli, 'PQT8_CANAL')
    assert j['vigente']['version'] == 1 and j['heredado'] is True


def test_un_frente_que_no_es_de_la_obra_no_lee_ni_escribe(entorno):
    cli, t, _ = entorno
    for r in (cli.get('/api/planilla/itemizado?project=PQT8_OTRO'), _subir(cli, project='PQT8_OTRO'),
              cli.delete('/api/planilla/itemizado?project=PQT8_OTRO')):
        assert r.status_code == 404 and r.get_json()['code'] == 'FRONT_UNKNOWN'
    assert t.filas == []


def test_una_obra_sin_registro_de_frentes_acepta_su_frente(entorno):
    cli, t, _ = entorno
    t.registro_de_frentes = False             # base sin project_frentes
    assert _subir(cli, project='PQT8_OTRO').status_code == 201 and t.filas[0]['frente'] == 'OTRO'


def test_sin_la_42_se_lee_y_se_guarda_como_antes_y_no_se_pisa_la_obra_desde_un_frente(entorno):
    cli, t, _ = entorno
    t.con_frente = False                      # base sin la migración 42
    assert _subir(cli, project='PQT8').status_code == 201, 'la obra entera se guarda como antes'
    j = _leer(cli, 'PQT8_CANAL')
    assert j['vigente']['version'] == 1 and j['por_frente'] is False and j['heredado'] is False and j['frente'] == ''
    for r in (_subir(cli, project='PQT8_CANAL', items=ITEMS[:1]), cli.delete('/api/planilla/itemizado?project=PQT8_CANAL')):
        assert r.status_code == 503 and r.get_json()['code'] == 'MIGRATION_MISSING' and '42' in r.get_json()['error']
    assert [(f['version'], f['vigente']) for f in t.filas] == [(1, True)], 'el de la obra queda intacto'
    assert cli.delete('/api/planilla/itemizado?project=PQT8').get_json()['retirada'] == 1


# ── La migración y el esquema base dicen lo mismo ───────────────────────────────────────────

def test_las_migraciones_40_y_42_y_esquema_base_dicen_lo_mismo():
    import io
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    leer = lambda n: io.open(os.path.join(raiz, 'sql', n), encoding='utf-8').read()
    mig, rollback = leer('40_planilla_itemizados.sql'), leer('40_planilla_itemizados_rollback.sql')
    mig42, rollback42 = leer('42_planilla_por_frente.sql'), leer('42_planilla_por_frente_rollback.sql')
    import esquema_base
    base = dict(esquema_base.TABLAS)['planilla_itemizados']
    columnas = lambda sql: set(re.findall(r'^\s*"?(\w+)"?\s+(?:BIGSERIAL|TEXT|INTEGER|JSONB|BOOLEAN|TIMESTAMP)', sql, re.M | re.I))
    # La base nueva = la 40 más la columna que añade la 42.
    assert columnas(mig) | {'frente'} == columnas(base) and 'items' in columnas(mig)
    assert "ALTER TABLE planilla_itemizados ADD COLUMN IF NOT EXISTS frente TEXT NOT NULL DEFAULT ''" in mig42
    # Una vigente por obra en la 40; por obra y frente en la 42 y en la base nueva.
    assert re.search(r'UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente\s+ON planilla_itemizados \(project_id\) WHERE vigente', mig)
    for sql in (mig42, base):
        assert re.search(r'UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente_frente\s+ON planilla_itemizados \(project_id, frente\) WHERE vigente', sql)
    assert not re.search(r'uq_planilla_itemizado_vigente\s', base), 'la base nueva no lleva el índice viejo'
    # La 42 crea el índice nuevo ANTES de quitar el viejo, y no borra datos.
    assert mig42.index('uq_planilla_itemizado_vigente_frente') < mig42.index('DROP INDEX IF EXISTS uq_planilla_itemizado_vigente;')
    assert 'DROP TABLE' not in mig42 and 'DROP COLUMN' not in mig42 and 'DELETE' not in mig42
    for sql in (mig, rollback, mig42, rollback42):
        assert "current_user <> 'ecd_migrator'" in sql
    assert 'DROP TABLE IF EXISTS planilla_itemizados' in rollback and 'DROP' not in mig
    # Su vuelta atrás se niega si ya hay itemizados de frente: no los mezcla en uno.
    assert "WHERE frente <> ''" in rollback42 and 'PLANILLA_POR_FRENTE_CON_DATOS' in rollback42
