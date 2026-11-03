"""La OBSERVACIÓN DEL PLANO entero (routes/pdf_tools.py, docs/archivos/18): una sola observación, con responsable,
fecha límite y las marcas que se eligieron de una versión. Sin base real."""
from datetime import datetime
import json
import uuid

from flask import Flask, g
import pytest

import routes.pdf_tools as pdf

PLANO = str(uuid.uuid4())
VIGENTE = str(uuid.uuid4())
OTRA = str(uuid.uuid4())
MANANA = '2099-01-15'
VENCE = datetime(2099, 1, 15)


class Cursor:
    def __init__(self, rows):
        self.rows, self.queries = rows, []

    def execute(self, sql, params=()):
        self.queries.append((sql, params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        return self.rows.pop(0) if self.rows else []


class Connection:
    def __init__(self, cursor):
        self._cursor, self.committed = cursor, False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(pdf, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(pdf.pdf_tools_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'name': 'Ana', 'email': 'ana@obra.pe'}))
    monkeypatch.setattr(pdf, 'guardia_de_recurso', lambda tabla, valor: None)
    monkeypatch.setattr(pdf, '_negativa_para_marcar', lambda nodo: None)   # la prueba propia va aparte
    return app


@pytest.fixture
def alta(monkeypatch):
    import db, encargos, flujo_de_registro, perimetro_de_obra
    hecho = {'encargo': None, 'actividad': None}
    monkeypatch.setattr(db, 'resolve_project_id', lambda urn: 3 if urn == 'obra' else None)
    monkeypatch.setattr(perimetro_de_obra, 'guardia_de_obra', lambda obra, accion='': None)
    monkeypatch.setattr(flujo_de_registro, 'siguiente_codigo', lambda cur, sem, obra: 'ISS-020')
    monkeypatch.setattr(encargos, 'abrir', lambda cur, *a, **k: hecho.__setitem__('encargo', (a, k)) or 91)
    monkeypatch.setattr(encargos, 'avisar', lambda cur, eid: None)
    monkeypatch.setattr(db, 'log_activity', lambda *a, **k: hecho.__setitem__('actividad', a))
    # Lo que la obra decide de sus incidencias (45): aquí, nada configurado.
    import flujo_de_issue as iss
    monkeypatch.setattr(iss, 'config_de_obra', lambda cur, obra: {'opcionales': list(iss.OPCIONALES), 'subtipos': {},
                                                                  'causas': [], 'campos': []})
    return hecho


def _evidencia(*marcas):
    return [{'tipo': 'plano', 'documento': PLANO, 'version_id': VIGENTE, 'version_numero': 2}] + [
        {'tipo': 'marca', 'marca': m} for m in marcas]


def _post(app, **cuerpo):
    datos = {'titulo': 'Revisar cotas del buzón', 'responsable_id': 9, 'vence_en': MANANA, **cuerpo}
    return app.test_client().post('/api/pdf/planos/%s/observacion' % PLANO, json=datos)


def test_una_observacion_para_todo_el_plano_con_sus_marcas(app, monkeypatch, alta):
    cur, conn = _conectar(monkeypatch, [
        ('obra', 'DR-803.pdf', VIGENTE, 2),                                     # el plano y su versión
        (1,), (1,),                                                            # responsable y verificador, de la obra
        [(3, 'Ana', False, 1, 'cloud'), (4, 'Luis', True, 2, 'arrow')],        # las dos marcas
        None, None,                                                            # ninguna en otra observación abierta
        (55,),                                                                 # el alta
        [(55, 'ISS-020', 'Abierto', 'Revisar cotas del buzón', 9, 7, VENCE, PLANO, _evidencia(3, 4))],
        [(9, 'Luis'), (7, 'Ana')],
    ])
    r = _post(app, marcas=[4, 3, 3], version_id=VIGENTE)
    assert r.status_code == 201, r.get_json()
    d = r.get_json()
    o = d['observacion']
    assert o['codigo'] == 'ISS-020' and o['responsable'] == 'Luis' and o['del_plano'] is True
    assert o['marcas'] == [3, 4] and o['version_numero'] == 2
    sql, p = next(q for q in cur.queries if 'INSERT INTO doc_issues' in q[0])
    assert p[3] == 'OBSERVACION' and (p[7], p[8], p[9]) == (7, 9, 7)          # detecta Ana, corrige Luis, verifica Ana
    assert p[13:15] == ('PLANO', PLANO) and p[6] == 'DR-803.pdf · V2 · 2 marcas'
    ev = json.loads(p[12])
    assert ev[0] == {'tipo': 'plano', 'documento': PLANO, 'nombre': 'DR-803.pdf', 'version_id': VIGENTE, 'version_numero': 2}
    assert [e['marca'] for e in ev[1:]] == [3, 4] and ev[1]['pagina'] == 1 and ev[2]['clase'] == 'arrow'
    # Solo se publica el borrador propio (el 3); el 4 ya estaba publicado y es de Luis.
    pub = next(q for q in cur.queries if 'SET publicado = TRUE' in q[0])
    assert pub[1] == (7, [3], 'Ana') and d['publicadas'] == [3]
    assert alta['encargo'][1]['destino_usuario'] == 9 and conn.committed


def test_tambien_el_plano_entero_sin_marcas(app, monkeypatch, alta):
    cur, _ = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,), (56,), [], []])
    r = _post(app)
    assert r.status_code == 201, r.get_json()
    p = next(q for q in cur.queries if 'INSERT INTO doc_issues' in q[0])[1]
    assert p[6] == 'DR-803.pdf · V2 · plano entero' and len(json.loads(p[12])) == 1
    assert not any('FROM pdf_markups' in q[0] for q in cur.queries)


def test_una_marca_de_otro_plano_o_version_no_entra(app, monkeypatch, alta):
    cur, conn = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,), [(3, 'Ana', True, 1, 'cloud')]])
    r = _post(app, marcas=[3, 99])
    assert r.status_code == 400 and r.get_json()['code'] == 'MARCA_AJENA'
    assert not any('INSERT INTO doc_issues' in q[0] for q in cur.queries) and not conn.committed


def test_una_marca_que_ya_esta_en_una_observacion_abierta_no_entra(app, monkeypatch, alta):
    cur, conn = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,),
                                        [(3, 'Ana', True, 1, 'cloud')], ('ISS-007',)])
    r = _post(app, marcas=[3])
    assert r.status_code == 409 and 'ISS-007' in r.get_json()['error']
    assert not any('INSERT INTO doc_issues' in q[0] for q in cur.queries)


def test_la_version_tiene_que_ser_del_plano(app, monkeypatch, alta):
    _conectar(monkeypatch, [('obra', 'DR-803.pdf', None, None)])
    assert _post(app, version_id=OTRA).status_code == 400


@pytest.mark.parametrize('cambio, estado', [
    ({'responsable_id': 7}, 409), ({'vence_en': '2000-01-01'}, 400), ({'titulo': '  '}, 400), ({'marcas': ['x']}, 400),
])
def test_rechaza_lo_que_no_es_una_observacion_valida(app, monkeypatch, alta, cambio, estado):
    cur, conn = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,)])
    assert _post(app, **cambio).status_code == estado and not conn.committed


def test_el_responsable_tiene_que_ser_de_la_obra(app, monkeypatch, alta):
    _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), None])
    r = _post(app)
    assert r.status_code == 409 and r.get_json()['code'] == 'RESPONSABLE_NO_MIEMBRO'


def test_un_plano_que_no_es_uuid(app):
    assert app.test_client().post('/api/pdf/planos/nada/observacion', json={}).status_code == 400


def test_una_marca_en_una_observacion_del_plano_abierta_no_se_retira():
    cur = Cursor([('ISS-020',)])
    assert pdf._observacion_viva(cur, 3) == 'ISS-020'
    sql, params = cur.queries[0]
    assert 'evidencia @> %s::jsonb' in sql and params[3] == 'PLANO' and json.loads(params[4]) == [{'marca': 3}]


def test_al_listar_la_marca_trae_la_observacion_del_plano_que_la_incluye():
    filas_plano = [(55, 'ISS-020', 'Abierto', 'Cotas', 9, 7, VENCE, PLANO, _evidencia(3))]
    cur = Cursor([[], filas_plano, [(9, 'Luis'), (7, 'Ana')]])
    marcas = pdf._con_observacion(cur, [{'id': 3}, {'id': 4}])
    assert marcas[0]['observacion']['codigo'] == 'ISS-020' and marcas[0]['observacion']['del_plano'] is True
    assert marcas[1]['observacion'] is None
    sql, params = cur.queries[1]
    assert 'evidencia @> ANY(%s::jsonb[])' in sql and params[0] == 'PLANO'


# ── Migración 45: borrador, y leer las del plano ──────────────────────────

def test_un_borrador_del_plano_no_publica_marcas_ni_avisa(app, monkeypatch, alta):
    import flujo_de_issue as iss
    monkeypatch.setattr(iss, 'opcionales_de_obra', lambda cur, obra: list(iss.OPCIONALES))
    cur, conn = _conectar(monkeypatch, [
        ('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,),
        [(3, 'Ana', False, 1, 'cloud')], None,
        (57,),
        [(57, 'ISS-021', 'Borrador', 'Revisar cotas del buzón', 9, 7, VENCE, PLANO, _evidencia(3))],
        [(9, 'Luis'), (7, 'Ana')],
    ])
    r = _post(app, marcas=[3], borrador=True)
    assert r.status_code == 201, r.get_json()
    assert r.get_json()['publicadas'] == [] and alta['encargo'] is None
    assert ('Borrador', 57) in [q[1] for q in cur.queries if q[0].startswith('UPDATE doc_issues SET estado')]
    assert not any('SET publicado = TRUE' in q[0] for q in cur.queries)


def test_una_obra_sin_borradores_no_lo_admite(app, monkeypatch, alta):
    import flujo_de_issue as iss
    monkeypatch.setattr(iss, 'opcionales_de_obra', lambda cur, obra: ['En curso'])
    cur, conn = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,)])
    r = _post(app, borrador=True)
    assert r.status_code == 409 and r.get_json()['code'] == 'ESTADO_APAGADO' and not conn.committed


def test_se_leen_las_observaciones_del_plano(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [
        [(55, 'ISS-020', 'En disputa', 'Cotas', 9, 7, VENCE, PLANO, _evidencia(3, 4))], [(9, 'Luis'), (7, 'Ana')]])
    d = app.test_client().get('/api/pdf/planos/%s/observacion' % PLANO).get_json()
    o, = d['observaciones']
    assert o['estado_etiqueta'] == 'En disputa' and o['marcas'] == [3, 4] and o['version_numero'] == 2
    sql, params = cur.queries[0]
    assert "estado <> 'Borrador' OR autor_id = %s" in sql and params[-1] == 7


def test_y_el_detalle_de_una(app, monkeypatch):
    fila = (55, 'ISS-020', 'Corregido', 'Cotas', 9, 7, VENCE, PLANO, 'Mira el eje 4', 7, [],
            [{'event': 'detected', 'by': 'ana@obra.pe'}], False, VENCE, _evidencia(3))
    _conectar(monkeypatch, [fila, [(9, 'Luis'), (7, 'Ana')], []])
    d = app.test_client().get('/api/pdf/planos/%s/observacion?id=55' % PLANO).get_json()
    o = d['observacion']
    assert o['estado_etiqueta'] == 'En revisión' and o['autor'] == 'Ana' and o['del_plano'] is True
    assert o['marcas'] == [3] and o['historial'][0]['event'] == 'detected'


def test_el_detalle_ajeno_o_de_otro_plano_no_existe(app, monkeypatch):
    _conectar(monkeypatch, [None])
    assert app.test_client().get('/api/pdf/planos/%s/observacion?id=55' % PLANO).status_code == 404
    assert app.test_client().get('/api/pdf/planos/%s/observacion?id=x' % PLANO).status_code == 400


# ── El pin en la hoja (como la herramienta «Incidencia» de ACC) ────────────

def test_una_observacion_con_su_pin_en_la_hoja(app, monkeypatch, alta):
    cur, _ = _conectar(monkeypatch, [('obra', 'DR-803.pdf', VIGENTE, 2), (1,), (1,), (57,), [], []])
    r = _post(app, pin={'pagina': 3, 'p': [410.5, 220]})
    assert r.status_code == 201, r.get_json()
    p = next(q for q in cur.queries if 'INSERT INTO doc_issues' in q[0])[1]
    assert p[6] == 'DR-803.pdf · V2 · pág. 3'
    assert json.loads(p[12])[0]['pin'] == {'pagina': 3, 'p': [410.5, 220.0]}


@pytest.mark.parametrize('pin', [{'pagina': 0, 'p': [1, 2]}, {'pagina': 2, 'p': [1]}, {'pagina': True, 'p': [1, 2]},
                                 {'pagina': 2, 'p': ['a', 2]}, 'centro'])
def test_un_pin_mal_formado_no_entra(app, monkeypatch, alta, pin):
    cur, conn = _conectar(monkeypatch, [])
    assert _post(app, pin=pin).status_code == 400 and not conn.committed


def test_la_lista_del_plano_trae_el_pin():
    ev = [{'tipo': 'plano', 'documento': PLANO, 'version_id': VIGENTE, 'version_numero': 2, 'pin': {'pagina': 1, 'p': [5, 6]}}]
    cur = Cursor([[(55, 'ISS-020', 'Abierto', 'Cotas', 9, 7, VENCE, PLANO, ev)], [(9, 'Luis'), (7, 'Ana')]])
    o, = pdf._observaciones_del_plano(cur, PLANO)
    assert o['pin'] == {'pagina': 1, 'p': [5, 6]}


def test_un_borrador_del_plano_se_guarda_sin_responsable(app, monkeypatch):
    # El panel deja guardar un borrador sin responsable (como el resto de incidencias); el plano y la marca lo
    # rechazaban con SIN_RESPONSABLE. Se exige al ENVIARLO (routes.issues._falta_para_enviar).
    from datetime import date
    monkeypatch.setattr(pdf, '_hoy_en_obra', lambda: date(2026, 11, 2))
    with app.test_request_context():
        campos, error = pdf._campos_de_observacion({'titulo': 'Cotas', 'borrador': True, 'vence_en': '2026-11-20'}, 7)
        assert error is None and campos[2] is None
        campos, error = pdf._campos_de_observacion({'titulo': 'Cotas', 'vence_en': '2026-11-20'}, 7)
        assert campos is None and error[0].get_json()['code'] == 'SIN_RESPONSABLE'
