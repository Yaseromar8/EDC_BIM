"""Contrato local de los Tableros de Docs (routes/tableros.py, docs/visor/57); no conecta a una base real."""
from datetime import datetime, timezone
import json
import uuid

from flask import Flask, g
import pytest

import routes.tableros as tb
import perimetro_de_obra as po


TAB = str(uuid.uuid4())
AHORA = datetime(2026, 10, 30, 21, 0, tzinfo=timezone.utc)


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
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(tb, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(tb.tableros_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'name': 'Ana'}))
    monkeypatch.setattr(tb, '_hay_acceso', lambda obra: obra == 'obra')
    monkeypatch.setattr(tb, '_es_admin', lambda obra: False)
    monkeypatch.setattr(tb, 'guardia_de_recurso', lambda tabla, valor: None)
    return app


_AUTOR = object()


def _fila(autor=7, archivado=False, version=3, obra='obra', acceso='obra', rol=_AUTOR):
    """La fila que lee la guardia: id, obra, nombre, archivado, autor, versión, acceso y el rol de la sesión (7) en
    el tablero. Por omisión el autor es su responsable (como deja la migración 44) y los demás no son miembros."""
    if rol is _AUTOR:
        rol = 'responsable' if autor == 7 else None
    return (TAB, obra, 'Reunión', archivado, autor, version, acceso, rol)


# ── listar y crear ─────────────────────────────────────────────────────────────────────────

def test_listar_los_tableros_de_la_obra(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[(TAB, 'Reunión', False, AHORA, AHORA, 7, 'Ana', AHORA, '<svg></svg>', 'obra', 'responsable'),
                                      (TAB, 'Otro', False, AHORA, AHORA, 9, 'Luis', None, None, 'obra', None)]])
    r = app.test_client().get('/api/docs/tableros?model_urn=obra')
    assert r.status_code == 200 and r.headers['Cache-Control'] == 'private, no-store'
    t, otro = r.get_json()['tableros']
    assert t == {'id': TAB, 'nombre': 'Reunión', 'archivado': False, 'creado_en': AHORA.isoformat(),
                 'actualizado_en': AHORA.isoformat(), 'creado_por_id': 7, 'creado_por': 'Ana',
                 'abierto_por_mi': AHORA.isoformat(), 'miniatura': '<svg></svg>', 'acceso': 'obra',
                 'mi_rol': 'responsable', 'puedo_archivar': True}
    assert otro['mi_rol'] == 'editor' and otro['puedo_archivar'] is False      # de la obra, sin rol: edita, no archiva
    sql, params = cur.queries[-1]
    assert 'ORDER BY a.abierto_en DESC NULLS LAST' in sql and params == (7, 7, 'obra', False, False)
    assert "(t.acceso = 'obra' OR m.rol IS NOT NULL OR %s)" in sql             # los de invitados, solo a sus miembros


def test_listar_archivados(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[]])
    app.test_client().get('/api/docs/tableros?model_urn=obra&archivados=1')
    assert cur.queries[-1][1] == (7, 7, 'obra', True, False)


def test_listar_otra_obra_es_403(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [])
    assert app.test_client().get('/api/docs/tableros?model_urn=otra').status_code == 403
    assert app.test_client().get('/api/docs/tableros').status_code == 403


def test_crear_un_tablero(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [(TAB,)])
    r = app.test_client().post('/api/docs/tableros', json={'model_urn': 'obra', 'nombre': '  Reunión   lunes '})
    assert r.status_code == 201
    assert r.get_json() == {'success': True, 'id': TAB, 'nombre': 'Reunión lunes', 'version': 1}
    assert 'INSERT INTO tableros' in cur.queries[0][0] and cur.queries[0][1] == ('obra', 'Reunión lunes', 7, 7)
    assert 'tableros_abiertos' in cur.queries[1][0]          # quien lo crea lo tiene «abierto por mí»
    assert 'tableros_miembros' in cur.queries[2][0] and "'responsable'" in cur.queries[2][0] and cur.queries[2][1] == (TAB, 7, 7)
    assert conn.committed


def test_crear_sin_nombre_es_sin_titulo(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [(TAB,)])
    r = app.test_client().post('/api/docs/tableros', json={'model_urn': 'obra'})
    assert r.get_json()['nombre'] == 'Sin título' and cur.queries[0][1][1] == 'Sin título'


@pytest.mark.parametrize('cuerpo, estado', [
    ({'model_urn': 'otra', 'nombre': 'x'}, 403),
    ({'model_urn': 'obra', 'nombre': 'x' * 121}, 400),
])
def test_crear_rechaza(app, monkeypatch, cuerpo, estado):
    _, conn = _conectar(monkeypatch, [])
    assert app.test_client().post('/api/docs/tableros', json=cuerpo).status_code == estado
    assert not conn.committed


# ── abrir ──────────────────────────────────────────────────────────────────────────────────

def test_abrir_devuelve_el_contenido_y_anota_quien_lo_abrio(app, monkeypatch):
    cfg = {'notas': [{'id': 'n1', 'texto': 'Hola'}]}
    cur, conn = _conectar(monkeypatch, [_fila(), (cfg, 3, 'Reunión', False)])
    r = app.test_client().get('/api/docs/tableros/%s' % TAB)
    assert r.status_code == 200
    d = r.get_json()
    assert d['config'] == cfg and d['version'] == 3 and d['model_urn'] == 'obra'
    assert d['acceso'] == 'obra' and d['mi_rol'] == 'responsable' and d['gestiona'] is True
    assert 'INSERT INTO tableros_abiertos' in cur.queries[-1][0] and cur.queries[-1][1] == (TAB, 7)
    assert conn.committed


def test_tablero_de_otra_obra_es_403(app, monkeypatch):
    _conectar(monkeypatch, [_fila(obra='otra')])
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 403


def test_tablero_inexistente_o_id_invalido(app, monkeypatch):
    _conectar(monkeypatch, [None])
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 404
    assert app.test_client().get('/api/docs/tableros/no-es-uuid').status_code == 400


def test_la_guardia_de_recurso_manda(app, monkeypatch):
    _conectar(monkeypatch, [_fila()])
    monkeypatch.setattr(tb, 'guardia_de_recurso', lambda tabla, valor: (tb.jsonify({'error': 'x'}), 403))
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 403


# ── guardar sin pisar ──────────────────────────────────────────────────────────────────────

def test_guardar_sobre_la_version_vigente(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(), (4,)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'notas': []}, 'version': 3})
    assert r.status_code == 200 and r.get_json() == {'success': True, 'version': 4}
    sql, params = cur.queries[-1]
    assert 'WHERE id = %s AND version = %s' in sql and params[-2:] == (TAB, 3)    # guardado condicional
    assert params[1] is False                                                       # sin miniatura: no se toca
    assert conn.committed


def test_guardar_sobre_una_version_vieja_es_409_con_lo_actual(app, monkeypatch):
    actual = {'notas': [{'id': 'de-luis'}]}
    _, conn = _conectar(monkeypatch, [_fila(version=5), None, (actual, 5)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'notas': []}, 'version': 3})
    assert r.status_code == 409
    d = r.get_json()
    assert d['code'] == 'VERSION' and d['version'] == 5 and d['config'] == actual
    assert conn.rolled_back and not conn.committed


@pytest.mark.parametrize('cuerpo', [{'version': 3}, {'config': [], 'version': 3}, {'config': {}}, {'config': {}, 'version': 'x'}])
def test_guardar_rechaza_cuerpos_malos(app, monkeypatch, cuerpo):
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().put('/api/docs/tableros/%s' % TAB, json=cuerpo).status_code == 400
    assert not conn.committed


def test_no_se_guarda_un_tablero_archivado(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(archivado=True)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3})
    assert r.status_code == 409 and r.get_json()['code'] == 'ARCHIVADO' and not conn.committed


def test_no_se_guarda_un_tablero_enorme(app, monkeypatch):
    monkeypatch.setattr(tb, 'CONFIG_MAX', 50)
    _, conn = _conectar(monkeypatch, [_fila()])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {'texto': 'x' * 100}, 'version': 3})
    assert r.status_code == 413 and not conn.committed


def test_abrir_solo_la_version_no_lee_ni_anota(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(version=9)])
    r = app.test_client().get('/api/docs/tableros/%s?solo_version=1' % TAB)
    assert r.status_code == 200 and r.get_json()['version'] == 9 and 'config' not in r.get_json()
    assert len(cur.queries) == 1 and not conn.committed            # solo la guardia; nada de tableros_abiertos


def test_latido_anota_que_sigo_y_dice_quien_esta(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(version=9), [(7, 'Ana'), (8, '')]])
    r = app.test_client().get('/api/docs/tableros/%s?solo_version=1&latido=1' % TAB)
    d = r.get_json()
    assert r.status_code == 200 and d['version'] == 9 and 'config' not in d
    assert d['presentes'] == [{'id': 7, 'nombre': 'Ana'}, {'id': 8, 'nombre': ''}]
    anotar, quien = cur.queries[1], cur.queries[2]
    assert 'tableros_abiertos' in anotar[0] and anotar[1] == (TAB, 7) and conn.committed
    assert 'make_interval' in quien[0] and quien[1] == (TAB, tb.PRESENTE_SEGUNDOS)


def test_latido_pasa_por_la_guardia(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(obra='otra')])
    r = app.test_client().get('/api/docs/tableros/%s?solo_version=1&latido=1' % TAB)
    assert r.status_code == 403 and len(cur.queries) == 1 and not conn.committed


def test_abrir_sin_apertura_no_anota(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(), ({'notas': []}, 3, 'Reunión', False)])
    r = app.test_client().get('/api/docs/tableros/%s?sin_apertura=1' % TAB)
    assert r.status_code == 200 and r.get_json()['version'] == 3
    assert not any('tableros_abiertos' in q[0] for q in cur.queries) and not conn.committed


def test_guardar_con_miniatura(app, monkeypatch):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="4" height="4" fill="#FBE8A6"/></svg>'
    cur, conn = _conectar(monkeypatch, [_fila(), (4,)])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': svg})
    assert r.status_code == 200
    params = cur.queries[-1][1]
    assert params[1] is True and params[2] == svg and conn.committed


def test_miniatura_vacia_la_borra(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_fila(), (4,)])
    app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': ''})
    params = cur.queries[-1][1]
    assert params[1] is True and params[2] is None


@pytest.mark.parametrize('svg', [
    '<svg onload="alert(1)"></svg>', '<svg><script>alert(1)</script></svg>', '<svg><a href="https://x"><rect/></a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>', '<svg><image href="https://x"/></svg>', '<svg style="fill:url(https://x)"></svg>',
    '<svg><animate attributeName="x"/></svg>', '<p>no es svg</p>', '<svg>' + 'x' * 30000 + '</svg>', 42,
])
def test_miniatura_peligrosa_o_rara_se_rechaza(app, monkeypatch, svg):
    _, conn = _conectar(monkeypatch, [_fila()])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3, 'miniatura': svg})
    assert r.status_code == 400 and not conn.committed


# ── renombrar y archivar ───────────────────────────────────────────────────────────────────

def test_renombrar(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(autor=99)])          # cualquiera de la obra lo renombra
    r = app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'nombre': '  Comité   de obra '})
    assert r.status_code == 200
    sql, params = cur.queries[-1]
    assert sql.startswith('UPDATE tableros SET nombre = %s, updated_by_id = %s') and params == ('Comité de obra', 7, TAB)
    assert conn.committed


def test_archivar_solo_responsable_o_administrador(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(autor=99)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': True}).status_code == 403
    assert not conn.committed
    cur, conn = _conectar(monkeypatch, [_fila(autor=7)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': True}).status_code == 200
    assert cur.queries[-1][1] == (True, 7, TAB) and conn.committed
    monkeypatch.setattr(tb, '_es_admin', lambda obra: True)
    _, conn = _conectar(monkeypatch, [_fila(autor=99)])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': False}).status_code == 200


@pytest.mark.parametrize('cuerpo', [{}, {'nombre': ''}, {'nombre': 'x' * 121}])
def test_patch_rechaza(app, monkeypatch, cuerpo):
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json=cuerpo).status_code == 400
    assert not conn.committed


# ── miembros y acceso (doc 66) ────────────────────────────────────────────────────────────

def test_un_lector_mira_pero_no_guarda_ni_renombra(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='lector')])
    r = app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3})
    assert r.status_code == 403 and r.get_json()['code'] == 'LECTOR' and not conn.committed
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='lector')])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'nombre': 'x'}).status_code == 403
    cur, _ = _conectar(monkeypatch, [_fila(autor=99, rol='lector'), ({'notas': []}, 3, 'Reunión', False)])
    d = app.test_client().get('/api/docs/tableros/%s' % TAB).get_json()
    assert d['mi_rol'] == 'lector' and d['gestiona'] is False


def test_un_editor_guarda_pero_no_archiva_ni_decide_el_acceso(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor'), (4,)])
    assert app.test_client().put('/api/docs/tableros/%s' % TAB, json={'config': {}, 'version': 3}).status_code == 200
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor')])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'archivado': True}).status_code == 403
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor')])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'acceso': 'invitados'}).status_code == 403
    assert not conn.committed


def test_solo_invitados_cierra_el_tablero_a_quien_no_es_miembro(app, monkeypatch):
    _conectar(monkeypatch, [_fila(autor=99, acceso='invitados', rol=None)])
    r = app.test_client().get('/api/docs/tableros/%s?solo_version=1' % TAB)
    assert r.status_code == 403 and r.get_json()['code'] == 'SOLO_MIEMBROS'
    _conectar(monkeypatch, [_fila(autor=99, acceso='invitados', rol='lector')])
    assert app.test_client().get('/api/docs/tableros/%s?solo_version=1' % TAB).status_code == 200
    monkeypatch.setattr(tb, '_es_admin', lambda obra: True)                 # el administrador de la obra entra en todos
    _conectar(monkeypatch, [_fila(autor=99, acceso='invitados', rol=None)])
    assert app.test_client().get('/api/docs/tableros/%s?solo_version=1' % TAB).status_code == 200


def test_el_responsable_decide_quien_puede_entrar(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'acceso': 'invitados'}).status_code == 200
    assert cur.queries[-1][0].startswith('UPDATE tableros SET acceso = %s') and cur.queries[-1][1] == ('invitados', 7, TAB)
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().patch('/api/docs/tableros/%s' % TAB, json={'acceso': 'todos'}).status_code == 400
    assert not conn.committed


def test_miembros_se_listan_con_su_rol(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_fila(), [(7, 'Ana', 'responsable'), (8, '', 'lector')]])
    r = app.test_client().get('/api/docs/tableros/%s/miembros' % TAB)
    d = r.get_json()
    assert r.status_code == 200 and d['miembros'] == [{'id': 7, 'nombre': 'Ana', 'rol': 'responsable'}, {'id': 8, 'nombre': '', 'rol': 'lector'}]
    assert d['acceso'] == 'obra' and d['gestiona'] is True and d['soy_miembro'] is True and d['mi_rol'] == 'responsable'


def test_invitar_a_alguien_de_la_obra(app, monkeypatch):
    monkeypatch.setattr(tb, '_pertenece', lambda uid, obra: uid == 8 and obra == 'obra')
    cur, conn = _conectar(monkeypatch, [_fila(), (1,), [(7, 'Ana', 'responsable'), (8, 'Luis', 'editor')]])   # 1 responsable además de Luis
    r = app.test_client().post('/api/docs/tableros/%s/miembros' % TAB, json={'user_id': 8, 'rol': 'editor'})
    assert r.status_code == 200 and len(r.get_json()['miembros']) == 2
    sql, params = next(q for q in cur.queries if 'INSERT INTO tableros_miembros' in q[0])
    assert 'ON CONFLICT (tablero_id, user_id) DO UPDATE SET rol' in sql and params == (TAB, 8, 'editor', 7) and conn.committed


@pytest.mark.parametrize('cuerpo, estado', [({'user_id': 9, 'rol': 'editor'}, 400), ({'user_id': 8, 'rol': 'jefe'}, 400), ({'rol': 'editor'}, 400)])
def test_invitar_rechaza(app, monkeypatch, cuerpo, estado):
    monkeypatch.setattr(tb, '_pertenece', lambda uid, obra: uid == 8)
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().post('/api/docs/tableros/%s/miembros' % TAB, json=cuerpo).status_code == estado
    assert not conn.committed


def test_solo_quien_gestiona_invita_o_quita(app, monkeypatch):
    monkeypatch.setattr(tb, '_pertenece', lambda uid, obra: True)
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor')])
    assert app.test_client().post('/api/docs/tableros/%s/miembros' % TAB, json={'user_id': 8, 'rol': 'lector'}).status_code == 403
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor')])
    assert app.test_client().delete('/api/docs/tableros/%s/miembros?user_id=8' % TAB).status_code == 403
    assert not conn.committed


def test_siempre_queda_un_responsable(app, monkeypatch):
    monkeypatch.setattr(tb, '_pertenece', lambda uid, obra: True)
    _, conn = _conectar(monkeypatch, [_fila(), (0,)])                         # bajarme a editor siendo el único
    r = app.test_client().post('/api/docs/tableros/%s/miembros' % TAB, json={'user_id': 7, 'rol': 'editor'})
    assert r.status_code == 409 and r.get_json()['code'] == 'ULTIMO_RESPONSABLE' and not conn.committed
    _, conn = _conectar(monkeypatch, [_fila(), (0,), ('responsable',)])      # salir siendo el único
    r = app.test_client().delete('/api/docs/tableros/%s/miembros?user_id=7' % TAB)
    assert r.status_code == 409 and not conn.committed


def test_salir_del_tablero(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_fila(autor=99, rol='editor'), (1,), [(99, 'Luis', 'responsable')]])
    r = app.test_client().delete('/api/docs/tableros/%s/miembros?user_id=7' % TAB)
    assert r.status_code == 200 and r.get_json()['miembros'] == [{'id': 99, 'nombre': 'Luis', 'rol': 'responsable'}]
    assert any(q[0].startswith('DELETE FROM tableros_miembros') and q[1] == (TAB, 7) for q in cur.queries) and conn.committed


def test_miembros_pasa_por_la_guardia(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_fila(obra='otra')])
    assert app.test_client().get('/api/docs/tableros/%s/miembros' % TAB).status_code == 403
    _, conn = _conectar(monkeypatch, [_fila(autor=99, acceso='invitados', rol=None)])
    assert app.test_client().get('/api/docs/tableros/%s/miembros' % TAB).status_code == 403


# ── gráficas que llegan de View (doc 68) ──────────────────────────────────────────────────

def _grafica(**cambios):
    g = {'origen': {'frente': '1_CANAL', 'obra': '1', 'frenteId': 'CANAL', 'frenteNombre': 'Canal', 'tablero': '42', 'grafica': 'c7'},
         'titulo': 'Tubería por material', 'subtitulo': 'Canal · contar', 'tipo': 'bar', 'metrica': 'count', 'campo': 'Material',
         'grupos': [{'k': 'PVC', 'v': 340, 'n': 340, 'c': '#d97757'}, {'k': 'Concreto', 'v': 120, 'n': 120}], 'total': 460, 'elementos': 460}
    g.update(cambios)
    return g


@pytest.fixture
def con_frente(monkeypatch):
    monkeypatch.setattr(tb, '_hay_acceso', lambda obra: obra in ('obra', '1_CANAL'))
    monkeypatch.setattr(tb, '_misma_obra', lambda frente, obra: frente == '1_CANAL' and obra == 'obra')


def test_una_grafica_de_view_entra_a_la_derecha_de_lo_que_hay(app, monkeypatch, con_frente):
    cfg = {'notas': [{'id': 'n1', 'tipo': 'nota', 'x': 0, 'y': 50, 'w': 200, 'h': 200}], 'secciones': [{'id': 's', 'x': -100, 'y': 10, 'w': 600, 'h': 400}]}
    cur, conn = _conectar(monkeypatch, [_fila(), (cfg,), (8,)])
    r = app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': _grafica()})
    d = r.get_json()
    assert r.status_code == 200 and d['reemplazada'] is False and d['version'] == 8
    assert 'FOR UPDATE' in cur.queries[1][0] and conn.committed
    guardada = json.loads(cur.queries[2][1][0])['notas'][-1]
    assert guardada['tipo'] == 'grafica' and guardada['id'] == d['id'] and (guardada['x'], guardada['y']) == (580, 10)
    assert guardada['nombre'] == 'Tubería por material' and guardada['grupos'][0] == {'k': 'PVC', 'v': 340.0, 'n': 340, 'c': '#d97757'}
    assert guardada['enviadaPor'] == 'Ana' and guardada['fecha'] and guardada['origen']['frenteNombre'] == 'Canal'


def test_la_misma_grafica_se_reemplaza_sin_moverla(app, monkeypatch, con_frente):
    vieja = {**_grafica(), 'id': 'g1', 'tipo': 'grafica', 'x': 900, 'y': 40, 'w': 600, 'h': 400, 'nombre': 'vieja', 'origen': _grafica()['origen']}
    cur, conn = _conectar(monkeypatch, [_fila(), ({'notas': [vieja]},), (9,)])
    r = app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': _grafica(grupos=[{'k': 'PVC', 'v': 400}])})
    d = r.get_json()
    assert d['reemplazada'] is True and d['id'] == 'g1'
    notas = json.loads(cur.queries[2][1][0])['notas']
    assert len(notas) == 1 and (notas[0]['x'], notas[0]['y'], notas[0]['w'], notas[0]['h']) == (900, 40, 600, 400)
    assert notas[0]['grupos'] == [{'k': 'PVC', 'v': 400.0}] and notas[0]['nombre'] == 'Tubería por material'


@pytest.mark.parametrize('mala', [
    None, {}, _grafica(origen={}), _grafica(tipo='qa'), _grafica(metrica='mediana'), _grafica(grupos='x'),
    _grafica(grupos=[{'k': 'a', 'v': 'diez'}]), _grafica(grupos=[{'k': str(i), 'v': i} for i in range(61)]),
    _grafica(origen={'frente': '1_CANAL', 'grafica': '<script>'}),
])
def test_una_grafica_con_forma_rara_se_rechaza(app, monkeypatch, con_frente, mala):
    _, conn = _conectar(monkeypatch, [_fila()])
    assert app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': mala}).status_code == 400
    assert not conn.committed


def test_una_grafica_de_otra_obra_no_entra(app, monkeypatch, con_frente):
    monkeypatch.setattr(tb, '_misma_obra', lambda frente, obra: False)
    _, conn = _conectar(monkeypatch, [_fila()])
    r = app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': _grafica()})
    assert r.status_code == 400 and 'otra obra' in r.get_json()['error'] and not conn.committed


def test_grafica_ni_lector_ni_archivado(app, monkeypatch, con_frente):
    _, conn = _conectar(monkeypatch, [_fila(autor=99, rol='lector')])
    assert app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': _grafica()}).status_code == 403
    _, conn = _conectar(monkeypatch, [_fila(archivado=True)])
    assert app.test_client().post('/api/docs/tableros/%s/graficas' % TAB, json={'grafica': _grafica()}).status_code == 409
    assert not conn.committed


def test_view_lista_los_tableros_de_la_obra_de_su_frente(app, monkeypatch, con_frente):
    cur, _ = _conectar(monkeypatch, [[('obra',), ('otra',)], [(TAB, 'Reunión', False, AHORA, AHORA, 7, 'Ana', None, None, 'obra', 'responsable')]])
    r = app.test_client().get('/api/docs/tableros?frente=1_CANAL')
    d = r.get_json()
    assert r.status_code == 200 and d['obra'] == 'obra' and [t['nombre'] for t in d['tableros']] == ['Reunión']
    assert cur.queries[-1][1][2] == 'obra'
    assert app.test_client().get('/api/docs/tableros?frente=9_OTRO').status_code == 403


# ── perímetro ──────────────────────────────────────────────────────────────────────────────

def test_el_perimetro_sabe_de_que_obra_es_un_tablero():
    assert po.RECURSOS['tableros'] == ('id', 'model_urn')
    assert po.RUTAS_POR_RECURSO['tablero'] == ('tableros', 'tid')
    assert po.RUTAS_POR_RECURSO['miembros_del_tablero'] == ('tableros', 'tid')      # y la de sus miembros
    assert po.RUTAS_POR_RECURSO['graficas_del_tablero'] == ('tableros', 'tid')      # y la de las gráficas de View


def test_sin_sesion_es_401(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(tb.tableros_bp)
    _conectar(monkeypatch, [])
    assert app.test_client().get('/api/docs/tableros?model_urn=obra').status_code == 401
    assert app.test_client().get('/api/docs/tableros/%s' % TAB).status_code == 401
