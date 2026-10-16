"""Foto, sello y referencias en las marcas de PDF (routes/pdf_tools.py); sin base real."""
from datetime import datetime, timezone
import json
import uuid

from flask import Flask, g
import pytest

import routes.pdf_tools as pdf


PLANO = str(uuid.uuid4())
FOTO = str(uuid.uuid4())
INFORME = str(uuid.uuid4())
AJENO = str(uuid.uuid4())
AHORA = datetime(2026, 10, 16, 15, 0, tzinfo=timezone.utc)


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
    monkeypatch.setattr(pdf, 'get_db_connection', lambda: conn)
    return cur, conn


@pytest.fixture
def prohibidos(monkeypatch):
    """Ids de documentos que el usuario NO puede abrir."""
    no = set()
    monkeypatch.setattr(pdf, 'check_folder_permission',
                        lambda user, nid, obra, nivel, accion: ('403', 403) if nid in no else None)
    return no


@pytest.fixture
def app(monkeypatch, prohibidos):
    app = Flask(__name__)
    app.register_blueprint(pdf.pdf_tools_bp)
    app.before_request(lambda: setattr(g, 'current_user', {'id': 7, 'name': 'Ana'}))
    monkeypatch.setattr(pdf, 'guardia_de_recurso', lambda tabla, valor: None)
    return app


def _marca(kind='nube', autor='Ana', estilo=None):
    return (kind, estilo or {}, {'p': [10, 20]}, autor, 'obra')


# ── Citar ─────────────────────────────────────────────────────────────────────

def test_citar_guarda_los_ids_y_devuelve_los_nombres(app, monkeypatch):
    docs = [(INFORME, 'obra', 'Informe.pdf', 'FILE')]
    cur, conn = _conectar(monkeypatch, [_marca(), docs, docs])
    r = app.test_client().patch('/api/pdf/markups/5', json={'citas': [INFORME, INFORME]})
    assert r.status_code == 200, r.get_json()
    m = r.get_json()['markup']
    assert m['style']['citas'] == [INFORME]                 # sin repetidos
    assert m['citas'] == [{'id': INFORME, 'nombre': 'Informe.pdf'}]
    update = [q for q in cur.queries if q[0].startswith('UPDATE pdf_markups')][0]
    assert json.loads(update[1][0])['citas'] == [INFORME] and conn.committed


def test_solo_el_autor_cambia_su_marca(app, monkeypatch):
    _conectar(monkeypatch, [_marca(autor='Luis')])
    r = app.test_client().patch('/api/pdf/markups/5', json={'citas': [INFORME]})
    assert r.status_code == 403


def test_no_se_cita_lo_que_no_se_puede_abrir(app, monkeypatch, prohibidos):
    prohibidos.add(INFORME)
    _, conn = _conectar(monkeypatch, [_marca(), [(INFORME, 'obra', 'Informe.pdf', 'FILE')]])
    r = app.test_client().patch('/api/pdf/markups/5', json={'citas': [INFORME]})
    assert r.status_code == 403 and not conn.committed


def test_no_se_cita_un_documento_de_otra_obra(app, monkeypatch):
    _, conn = _conectar(monkeypatch, [_marca(), [(AJENO, 'otra-obra', 'X.pdf', 'FILE')]])
    r = app.test_client().patch('/api/pdf/markups/5', json={'citas': [AJENO]})
    assert r.status_code == 400 and not conn.committed


def test_no_se_cita_una_carpeta_ni_un_documento_borrado(app, monkeypatch):
    _conectar(monkeypatch, [_marca(), [(INFORME, 'obra', 'Carpeta', 'FOLDER')]])
    assert app.test_client().patch('/api/pdf/markups/5', json={'citas': [INFORME]}).status_code == 404
    _conectar(monkeypatch, [_marca(), []])
    assert app.test_client().patch('/api/pdf/markups/5', json={'citas': [INFORME]}).status_code == 404


def test_tope_de_citas(app, monkeypatch):
    _conectar(monkeypatch, [_marca()])
    muchas = [str(uuid.uuid4()) for _ in range(pdf.TOPE_CITAS + 1)]
    r = app.test_client().patch('/api/pdf/markups/5', json={'citas': muchas})
    assert r.status_code == 400


# ── Fotos ─────────────────────────────────────────────────────────────────────

def test_las_fotos_solo_van_en_una_marca_de_foto_y_deben_ser_imagenes(app, monkeypatch):
    _conectar(monkeypatch, [_marca(kind='nube')])
    assert app.test_client().patch('/api/pdf/markups/5', json={'fotos': [FOTO]}).status_code == 400
    _conectar(monkeypatch, [_marca(kind='foto'), [(FOTO, 'obra', 'acta.pdf', 'FILE')]])
    assert app.test_client().patch('/api/pdf/markups/5', json={'fotos': [FOTO]}).status_code == 400
    docs = [(FOTO, 'obra', 'IMG_2031.JPG', 'FILE')]
    _conectar(monkeypatch, [_marca(kind='foto'), docs, docs])
    r = app.test_client().patch('/api/pdf/markups/5', json={'fotos': [FOTO], 'angulo': 450})
    assert r.status_code == 200
    m = r.get_json()['markup']
    assert m['fotos'] == [{'id': FOTO, 'nombre': 'IMG_2031.JPG'}] and m['geometry']['ang'] == 90.0


# ── Sello ─────────────────────────────────────────────────────────────────────

def test_el_sello_exige_un_estado_de_revision(app, monkeypatch):
    c = app.test_client()
    base = {'node_id': PLANO, 'model_urn': 'obra', 'page': 1, 'kind': 'sello', 'geometry': {'p': [1, 2]}}
    r = c.post('/api/pdf/markups', json={**base, 'style': {'sello': {'estado': 'aprobado'}}})
    assert r.status_code == 400                       # «Aprobado» es de Revisiones, no del sello
    cur, _ = _conectar(monkeypatch, [(41,)])
    r = c.post('/api/pdf/markups', json={**base, 'style': {
        'color': '#d97757', 'citas': [INFORME],
        'sello': {'estado': 'con_observaciones', 'titulo': 'Revisión de campo', 'comentario': 'x' * 400}}})
    assert r.status_code == 200 and r.get_json()['id'] == 41
    estilo = json.loads(cur.queries[-1][1][5])
    assert 'citas' not in estilo                      # las citas solo por el PATCH
    assert estilo['sello']['estado'] == 'con_observaciones' and len(estilo['sello']['comentario']) == 300


# ── Listar: una cita no concede acceso ────────────────────────────────────────

def test_al_listar_lo_que_no_se_puede_abrir_sale_restringido_y_sin_nombre(app, monkeypatch, prohibidos):
    prohibidos.add(AJENO)
    marcas = [(1, 1, 'nube', {}, {'citas': [INFORME, AJENO, FOTO]}, None, 'Ana', AHORA, True, AHORA)]
    docs = [(INFORME, 'obra', 'Informe.pdf', 'FILE'), (AJENO, 'obra', 'Contrato.pdf', 'FILE')]
    _conectar(monkeypatch, [marcas, docs])
    r = app.test_client().get(f'/api/pdf/markups?node_id={PLANO}')
    citas = r.get_json()['markups'][0]['citas']
    assert citas == [{'id': INFORME, 'nombre': 'Informe.pdf'},
                     {'id': AJENO, 'restringido': True},
                     {'id': FOTO, 'eliminado': True}]
    assert 'Contrato' not in r.get_data(as_text=True)


# ── Citado en: el viceversa ───────────────────────────────────────────────────

def test_citado_en_lista_las_marcas_y_oculta_los_planos_sin_permiso(app, monkeypatch, prohibidos):
    otro_plano = str(uuid.uuid4())
    prohibidos.add(otro_plano)
    filas = [(9, 'foto', 2, PLANO, 'DR-803.pdf', 'Ana', AHORA, True, True),
             (10, 'nube', 1, otro_plano, 'Secreto.pdf', 'Luis', AHORA, True, False)]
    cur, _ = _conectar(monkeypatch, [('obra',), filas])
    r = app.test_client().get(f'/api/pdf/citado-en?node_id={FOTO}')
    assert r.status_code == 200
    citas = r.get_json()['citas']
    assert len(citas) == 1 and citas[0]['plano'] == {'id': PLANO, 'nombre': 'DR-803.pdf'}
    assert citas[0]['como'] == 'foto' and citas[0]['pagina'] == 2
    sql, params = cur.queries[-1]
    assert 'm.publicado OR m.created_by' in sql and params[-1] == 'Ana'   # lo ajeno sin publicar no sale
    assert r.headers['Cache-Control'] == 'private, no-store'


def test_citado_en_exige_poder_abrir_el_documento(app, monkeypatch, prohibidos):
    prohibidos.add(FOTO)
    _conectar(monkeypatch, [('obra',)])
    assert app.test_client().get(f'/api/pdf/citado-en?node_id={FOTO}').status_code == 403
    assert app.test_client().get('/api/pdf/citado-en?node_id=nada').status_code == 400
