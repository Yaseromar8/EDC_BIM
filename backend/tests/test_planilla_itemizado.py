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


# ── 2 y 3. Rutas, con una tabla de juguete ──────────────────────────────────────────────────

class Tabla:
    """planilla_itemizados en memoria; entiende las sentencias de routes/planilla.py."""

    def __init__(self, existe=True):
        self.existe, self.filas, self.locks = existe, [], []

    def conexion(self):
        return contextlib.nullcontext(Conn(self))


class Cursor:
    def __init__(self, t):
        self.t, self.res = t, []

    def execute(self, sql, params=()):
        s = ' '.join(sql.split())
        if 'planilla_itemizados' in s and not self.t.existe:
            raise RuntimeError('relation "planilla_itemizados" does not exist')
        if s.startswith('SELECT pg_advisory_xact_lock'):
            self.t.locks.append(params[0]); self.res = [(None,)]
        elif s.startswith('SELECT i.version, i.archivo, i.hoja'):
            v = [f for f in self.t.filas if f['project_id'] == params[0] and f['vigente']]
            self.res = [(f['version'], f['archivo'], f['hoja'], f['columnas'], f['items'], f['n_items'], f['huella'],
                         None, 'Ana') for f in v]
        elif s.startswith('SELECT i.version, i.archivo, i.n_items'):
            v = sorted((f for f in self.t.filas if f['project_id'] == params[0]), key=lambda f: -f['version'])[:params[1]]
            self.res = [(f['version'], f['archivo'], f['n_items'], None, 'Ana', f['vigente'], f['retirado_en']) for f in v]
        elif s.startswith('SELECT version, huella FROM planilla_itemizados'):
            self.res = [(f['version'], f['huella']) for f in self.t.filas if f['project_id'] == params[0] and f['vigente']]
        elif s.startswith('UPDATE planilla_itemizados SET vigente = false'):
            uid, obra = params
            hechas = []
            for f in self.t.filas:
                if f['project_id'] == obra and f['vigente']:
                    f.update(vigente=False, retirado_por=uid, retirado_en='ahora'); hechas.append((f['version'],))
            self.res = hechas
        elif s.startswith('SELECT COALESCE(MAX(version), 0) + 1'):
            self.res = [(max([f['version'] for f in self.t.filas if f['project_id'] == params[0]], default=0) + 1,)]
        elif s.startswith('INSERT INTO planilla_itemizados'):
            obra, version, archivo, hoja, columnas, items, n, huella, uid = params
            assert not any(f['project_id'] == obra and f['vigente'] for f in self.t.filas), 'dos vigentes'
            self.t.filas.append({'project_id': obra, 'version': version, 'archivo': archivo, 'hoja': hoja,
                                 'columnas': json.loads(columnas), 'items': json.loads(items), 'n_items': n,
                                 'huella': huella, 'creado_por': uid, 'vigente': True, 'retirado_en': None})
            self.res = []
        else:
            raise AssertionError(s)

    def fetchone(self):
        return self.res[0] if self.res else None

    def fetchall(self):
        return list(self.res)


class Conn:
    def __init__(self, t):
        self.t, self.commits = t, 0

    def cursor(self):
        return Cursor(self.t)

    def commit(self):
        self.commits += 1


USUARIO = {'id': 7, 'name': 'Ana'}


@pytest.fixture
def entorno(monkeypatch):
    t = Tabla()
    estado = {'miembro': True, 'admin': True, 'usuario': dict(USUARIO)}
    app = Flask(__name__)
    app.register_blueprint(rp.planilla_bp)
    app.before_request(lambda: setattr(g, 'current_user', estado['usuario']))
    monkeypatch.setattr(rp, 'get_db_connection', t.conexion)
    # Frente → obra canónica, como resolve_project_id; lo desconocido no resuelve.
    monkeypatch.setattr(rp, 'resolve_project_id', lambda v: {'PQT8_TALARA_CANAL': 'PQT8', 'PQT8_TALARA_DRENAJE': 'PQT8',
                                                               'OTRA_OBRA': 'OTRA'}.get(v))
    monkeypatch.setattr(rp, 'guardia_de_obra', lambda valor, accion='':
                        None if estado['miembro'] else (jsonify({'error': 'Sin acceso', 'code': 'PROJECT_FORBIDDEN'}), 403))
    monkeypatch.setattr(rp, '_es_admin', lambda cur, obra: estado['admin'])
    return app.test_client(), t, estado


def _subir(cli, items=ITEMS, project='PQT8_TALARA_CANAL', **extra):
    return cli.post('/api/planilla/itemizado', json={'project': project, 'archivo': 'Presupuesto_Rv00.xlsx', 'hoja': 'CAOV',
                                                     'columnas': {'item': 1, 'descripcion': 4, 'unidad': 5}, 'items': items, **extra})


def test_sin_itemizado_la_obra_responde_vacio(entorno):
    cli, _, _ = entorno
    r = cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL')
    assert r.status_code == 200 and r.get_json()['vigente'] is None and r.get_json()['versiones'] == []


def test_guardar_crea_la_version_1_y_es_de_la_obra_no_del_frente(entorno):
    cli, t, _ = entorno
    r = _subir(cli)
    assert r.status_code == 201 and r.get_json()['version'] == 1 and r.get_json()['n_items'] == 3
    assert t.filas[0]['project_id'] == 'PQT8' and t.filas[0]['creado_por'] == 7
    assert t.filas[0]['items'][1]['descripcion'] == 'INSTALACION DE TUBERIA HDPE', 'se guarda normalizado'
    assert t.locks == ['planilla_itemizado:PQT8']
    # Desde el OTRO frente de la misma obra se lee el mismo itemizado.
    v = cli.get('/api/planilla/itemizado?project=PQT8_TALARA_DRENAJE').get_json()['vigente']
    assert v['version'] == 1 and v['archivo'] == 'Presupuesto_Rv00.xlsx' and len(v['items']) == 3 and v['creado_por'] == 'Ana'


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
    j = cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').get_json()
    assert j['vigente']['version'] == 2 and [v['version'] for v in j['versiones']] == [2, 1]
    assert [v['vigente'] for v in j['versiones']] == [True, False]


def test_quitar_deja_la_obra_sin_vigente_pero_no_borra(entorno):
    cli, t, _ = entorno
    _subir(cli)
    r = cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL')
    assert r.status_code == 200 and r.get_json()['retirada'] == 1
    assert len(t.filas) == 1 and not t.filas[0]['vigente']
    assert cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').get_json()['vigente'] is None
    assert cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').get_json()['retirada'] is None


def test_quien_no_es_de_la_obra_no_lee_ni_escribe(entorno):
    cli, t, estado = entorno
    estado['miembro'] = False
    assert cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').status_code == 403
    assert _subir(cli).status_code == 403
    assert cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').status_code == 403
    assert t.filas == []


def test_un_miembro_que_no_administra_lee_pero_no_cambia(entorno):
    cli, t, estado = entorno
    _subir(cli)
    estado['admin'] = False
    j = cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').get_json()
    assert j['vigente']['version'] == 1 and j['puede_editar'] is False
    r = _subir(cli, items=ITEMS[:1])
    assert r.status_code == 403 and r.get_json()['code'] == 'NOT_PROJECT_ADMIN'
    assert cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').status_code == 403
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
    assert cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL').status_code == 200


def test_sin_la_migracion_se_dice_cual_falta(entorno):
    cli, t, _ = entorno
    t.existe = False
    for r in (cli.get('/api/planilla/itemizado?project=PQT8_TALARA_CANAL'), _subir(cli),
              cli.delete('/api/planilla/itemizado?project=PQT8_TALARA_CANAL')):
        assert r.status_code == 503 and r.get_json()['code'] == 'MIGRATION_MISSING'


# ── La migración y el esquema base dicen lo mismo ───────────────────────────────────────────

def test_la_migracion_40_y_esquema_base_crean_la_misma_tabla_con_una_sola_vigente():
    import io
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mig = io.open(os.path.join(raiz, 'sql', '40_planilla_itemizados.sql'), encoding='utf-8').read()
    rollback = io.open(os.path.join(raiz, 'sql', '40_planilla_itemizados_rollback.sql'), encoding='utf-8').read()
    import esquema_base
    base = dict(esquema_base.TABLAS)['planilla_itemizados']
    columnas = lambda sql: set(re.findall(r'^\s*"?(\w+)"?\s+(?:BIGSERIAL|TEXT|INTEGER|JSONB|BOOLEAN|TIMESTAMP)', sql, re.M | re.I))
    assert columnas(mig) == columnas(base) and 'items' in columnas(mig)
    for sql in (mig, base):
        assert re.search(r'UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente\s+ON planilla_itemizados \(project_id\) WHERE vigente', sql)
    assert "current_user <> 'ecd_migrator'" in mig and "current_user <> 'ecd_migrator'" in rollback
    assert 'DROP TABLE IF EXISTS planilla_itemizados' in rollback and 'DROP' not in mig
