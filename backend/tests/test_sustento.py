"""Contrato local del sustento de metrados (routes/sustento.py); no conecta a una base real."""
from datetime import datetime, timezone
import json
import os
import uuid

from flask import Flask, g
import pytest

import routes.sustento as sus


PLANO = str(uuid.uuid4())
OTRO = str(uuid.uuid4())
VERSION = str(uuid.uuid4())
VINC = str(uuid.uuid4())
AHORA = datetime(2026, 10, 15, 9, 20, tzinfo=timezone.utc)


class Cursor:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def execute(self, sql, params=()):
        self.queries.append((sql, params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        return self.rows.pop(0) if self.rows else []


class Connection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(sus, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(sus.sustento_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7}))
    monkeypatch.setattr(sus, '_node', lambda nid, required='viewer':
                        ({'id': nid, 'project': 'obra', 'name': 'ES-03.pdf', 'vigente': 2}, None))
    monkeypatch.setattr(sus, '_version', lambda node, supplied: (VERSION, 2))
    monkeypatch.setattr(sus, 'guardia_de_recurso', lambda tabla, valor: None)
    return app


def _cuerpo(**cambios):
    base = {'node_id': PLANO, 'version_id': VERSION, 'pagina': 1, 'zona': [0.25, 0.2, 0.5, 0.36],
            'item': '02.01.03', 'cantidad': '30,10', 'unidad': 'm3'}
    base.update(cambios)
    return base


def test_crear_guarda_la_zona_en_fracciones_y_la_version_fijada(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(VINC,)])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo())
    assert r.status_code == 201
    assert r.get_json() == {'success': True, 'id': VINC, 'version_number': 2}
    sql, p = cur.queries[-1]
    assert 'INSERT INTO vinculos_de_sustento' in sql
    assert p[:4] == ('obra', '02.01.03', 30.1, 'm3')       # la obra es la del plano, no la del cliente
    assert p[4:7] == (PLANO, VERSION, 2)
    assert json.loads(p[8]) == [0.25, 0.2, 0.5, 0.36]
    assert p[10] == 7 and p[11] is None and conn.committed   # sin planilla de origen


@pytest.mark.parametrize('cambio, mensaje', [
    ({'item': ''}, 'ítem'),
    ({'item': '02 01; DROP'}, 'ítem'),
    ({'zona': [0.5, 0.2, 0.4, 0.3]}, 'zona'),      # x0 > x1
    ({'zona': [0, 0, 1.2, 0.5]}, 'zona'),          # fuera de la página
    ({'zona': [0, 0, True, 0.5]}, 'zona'),
    ({'zona': 'todo'}, 'zona'),
    ({'cantidad': 'mucho'}, 'cantidad'),
    ({'cantidad': True}, 'cantidad'),
    ({'pagina': 0}, 'página'),
    ({'nota': 'x' * 501}, 'nota'),
])
def test_crear_rechaza_datos_invalidos_sin_escribir(app, monkeypatch, cambio, mensaje):
    cur, conn = _conectar(monkeypatch, [])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(**cambio))
    assert r.status_code == 400
    assert mensaje in r.get_json()['error'].lower()
    assert not cur.queries and not conn.committed


def test_crear_desde_una_planilla_guarda_su_origen(app, monkeypatch):
    planilla = str(uuid.uuid4())
    cur, _ = _conectar(monkeypatch, [(VINC,)])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(planilla_node_id=planilla))
    assert r.status_code == 201
    assert cur.queries[-1][1][11] == planilla


def test_crear_con_planilla_de_otra_obra_o_sin_permiso_se_rechaza(app, monkeypatch):
    ajena, prohibida = str(uuid.uuid4()), str(uuid.uuid4())

    def nodo(nid, required='viewer'):
        if nid == prohibida:
            return None, ('sin permiso', 403)
        return ({'id': nid, 'project': 'otra' if nid == ajena else 'obra', 'name': 'x', 'vigente': 2}, None)
    monkeypatch.setattr(sus, '_node', nodo)
    cur, conn = _conectar(monkeypatch, [])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(planilla_node_id=ajena))
    assert r.status_code == 400 and 'misma obra' in r.get_json()['error']
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(planilla_node_id=prohibida))
    assert r.status_code == 403
    assert not conn.committed


def test_crear_sin_cantidad_vale(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [(VINC,)])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(cantidad=None))
    assert r.status_code == 201
    assert cur.queries[-1][1][2] is None


def test_crear_con_version_ajena_se_rechaza(app, monkeypatch):
    monkeypatch.setattr(sus, '_version', lambda node, supplied: (None, None))
    _conectar(monkeypatch, [])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo())
    assert r.status_code == 400


def _fila(vid, plano, item='02.01.03', autor=7, numero=1):
    return (vid, item, 30.1, 'm3', plano, 'ES-03.pdf', numero, 2, 1, [0.25, 0.2, 0.5, 0.36], None,
            'Luis Gómez', autor, AHORA, VERSION, None)


def test_listar_de_un_plano_dice_version_medida_y_vigente(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[_fila(VINC, PLANO)]])
    r = app.test_client().get('/api/docs/sustento?node_id=%s' % PLANO)
    assert r.status_code == 200
    v = r.get_json()['vinculos'][0]
    assert (v['version_number'], v['version_vigente']) == (1, 2)   # medido sobre V1, vigente V2
    assert v['cantidad'] == 30.1 and v['mio'] is True and v['zona'] == [0.25, 0.2, 0.5, 0.36]
    assert v['version_id'] == VERSION
    assert 'file_node_id = %s' in cur.queries[-1][0]
    assert r.headers['Cache-Control'] == 'private, no-store'


def test_listar_la_obra_quita_los_planos_sin_permiso(app, monkeypatch):
    _conectar(monkeypatch, [[_fila(VINC, PLANO), _fila(str(uuid.uuid4()), OTRO)]])
    prohibido = (None, ('no', 403))
    monkeypatch.setattr(sus, '_node', lambda nid, required='viewer':
                        prohibido if nid == OTRO else
                        ({'id': nid, 'project': 'obra', 'name': 'x', 'vigente': 2}, None))
    r = app.test_client().get('/api/docs/sustento?node_id=%s&ambito=obra' % PLANO)
    vinculos = r.get_json()['vinculos']
    assert [v['file_node_id'] for v in vinculos] == [PLANO]   # ni el nombre del otro plano sale


def test_listar_con_ambito_raro_es_400(app, monkeypatch):
    _conectar(monkeypatch, [])
    assert app.test_client().get('/api/docs/sustento?node_id=%s&ambito=todo' % PLANO).status_code == 400


def test_borrar_solo_su_autor_y_sin_perder_la_traza(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(PLANO, 7)])
    r = app.test_client().delete('/api/docs/sustento/%s' % VINC)
    assert r.status_code == 200
    assert 'SET deleted_at = now()' in cur.queries[-1][0] and conn.committed

    cur, conn = _conectar(monkeypatch, [(PLANO, 99)])
    r = app.test_client().delete('/api/docs/sustento/%s' % VINC)
    assert r.status_code == 403 and not conn.committed


def test_borrar_algo_que_no_existe_es_404(app, monkeypatch):
    _conectar(monkeypatch, [])
    assert app.test_client().delete('/api/docs/sustento/%s' % VINC).status_code == 404
    assert app.test_client().delete('/api/docs/sustento/no-es-uuid').status_code == 400


def test_el_perimetro_conoce_las_tres_rutas():
    import perimetro_de_obra as p
    assert p.RECURSOS['vinculos_de_sustento'] == ('id', 'model_urn')
    assert p.RUTAS_POR_QUERY['listar_sustento'] == ('file_nodes', 'node_id')
    assert p.RUTAS_POR_CUERPO['crear_sustento'] == ('file_nodes', 'node_id')
    assert p.RUTAS_POR_RECURSO['borrar_sustento'] == ('vinculos_de_sustento', 'vid')


def test_la_migracion_y_el_esquema_de_codigo_dicen_lo_mismo():
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sql = open(os.path.join(raiz, 'sql', '34_vinculos_de_sustento.sql'), encoding='utf-8').read()
    src = open(os.path.join(raiz, 'routes', 'sustento.py'), encoding='utf-8').read()
    columnas = lambda t: sorted(re.findall(r'^\s+(\w+) (?:UUID|TEXT|NUMERIC|INTEGER|JSONB|TIMESTAMPTZ)', t, re.M))
    assert columnas(sql) == columnas(src)
    assert os.path.exists(os.path.join(raiz, 'sql', '34_vinculos_de_sustento_rollback.sql'))

# ── DWG: la zona en coordenadas del dibujo, en una vista 2D ─────────────────────────────────

def test_en_un_dwg_la_zona_va_en_coordenadas_del_dibujo_y_con_su_vista(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(VINC,)])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(
        zona=[512000.25, 9481000.5, 512040.75, 9481020.0], vista='a1b2-c3d4.e5', vista_nombre='P08-0004'))
    assert r.status_code == 201
    sql, p = cur.queries[-1]
    assert 'vista, vista_nombre' in sql
    assert json.loads(p[8]) == [512000.25, 9481000.5, 512040.75, 9481020.0]   # coordenadas UTM, no 0-1
    assert p[12:] == ('a1b2-c3d4.e5', 'P08-0004') and conn.committed


@pytest.mark.parametrize('cambio', [
    {'vista': 'a b; DROP', 'zona': [1, 2, 3, 4]},                 # guid con caracteres raros
    {'vista': 'x' * 121, 'zona': [1, 2, 3, 4]},
    {'vista': 'guid-1', 'zona': [5, 2, 3, 4]},                    # x0 > x1, también en el dibujo
    {'vista': 'guid-1', 'zona': [0, 0, 1e11, 4]},
    {'zona': [10, 20, 30, 40]},                                   # sin vista es un PDF: fracciones 0-1
])
def test_dwg_rechaza_vista_o_zona_invalidas(app, monkeypatch, cambio):
    cur, conn = _conectar(monkeypatch, [])
    r = app.test_client().post('/api/docs/sustento', json=_cuerpo(**cambio))
    assert r.status_code == 400 and not cur.queries and not conn.committed


def test_listar_devuelve_la_vista_del_dwg(app, monkeypatch):
    _conectar(monkeypatch, [[_fila(VINC, PLANO) + ('guid-1', 'P08-0004')]])
    v = app.test_client().get('/api/docs/sustento?node_id=%s' % PLANO).get_json()['vinculos'][0]
    assert (v['vista'], v['vista_nombre']) == ('guid-1', 'P08-0004')


def test_la_migracion_y_el_esquema_de_codigo_tienen_la_vista():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sql = open(os.path.join(raiz, 'sql', '34_vinculos_de_sustento.sql'), encoding='utf-8').read()
    src = open(os.path.join(raiz, 'routes', 'sustento.py'), encoding='utf-8').read()
    for col in ('vista TEXT', 'vista_nombre TEXT'):
        assert col in sql and col in src
