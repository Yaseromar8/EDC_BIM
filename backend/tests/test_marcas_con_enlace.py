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
VIGENTE = str(uuid.uuid4())
ANTERIOR = str(uuid.uuid4())
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

    def rollback(self):
        self.committed = False


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
    cur, _ = _conectar(monkeypatch, [(VIGENTE,), (41,)])
    r = c.post('/api/pdf/markups', json={**base, 'style': {
        'color': '#d97757', 'citas': [INFORME],
        'sello': {'estado': 'con_observaciones', 'titulo': 'Revisión de campo', 'comentario': 'x' * 400}}})
    assert r.status_code == 200 and r.get_json()['id'] == 41
    estilo = json.loads(cur.queries[-1][1][5])
    assert cur.queries[-1][1][8] == VIGENTE            # sin version_id: nace en la vigente
    assert 'citas' not in estilo                      # las citas solo por el PATCH
    assert estilo['sello']['estado'] == 'con_observaciones' and len(estilo['sello']['comentario']) == 300


# ── Listar: una cita no concede acceso ────────────────────────────────────────

def test_al_listar_lo_que_no_se_puede_abrir_sale_restringido_y_sin_nombre(app, monkeypatch, prohibidos):
    prohibidos.add(AJENO)
    marcas = [(1, 1, 'nube', {}, {'citas': [INFORME, AJENO, FOTO]}, None, 'Ana', AHORA, True, AHORA, VIGENTE, 2, None)]
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
    filas = [(9, 'foto', 2, PLANO, 'DR-803.pdf', 'Ana', AHORA, True, True, ANTERIOR, 1, False),
             (10, 'nube', 1, otro_plano, 'Secreto.pdf', 'Luis', AHORA, True, False, VIGENTE, 2, True)]
    cur, _ = _conectar(monkeypatch, [('obra',), filas])
    r = app.test_client().get(f'/api/pdf/citado-en?node_id={FOTO}')
    assert r.status_code == 200
    citas = r.get_json()['citas']
    assert len(citas) == 1 and citas[0]['plano'] == {'id': PLANO, 'nombre': 'DR-803.pdf'}
    assert citas[0]['como'] == 'foto' and citas[0]['pagina'] == 2
    assert citas[0]['version'] == {'id': ANTERIOR, 'numero': 1, 'vigente': False}
    sql, params = cur.queries[-1]
    assert 'm.publicado OR m.created_by' in sql and params[-1] == 'Ana'   # lo ajeno sin publicar no sale
    assert r.headers['Cache-Control'] == 'private, no-store'


def test_citado_en_exige_poder_abrir_el_documento(app, monkeypatch, prohibidos):
    prohibidos.add(FOTO)
    _conectar(monkeypatch, [('obra',)])
    assert app.test_client().get(f'/api/pdf/citado-en?node_id={FOTO}').status_code == 403
    assert app.test_client().get('/api/pdf/citado-en?node_id=nada').status_code == 400


# ── Marcas por versión (migración 36) ─────────────────────────────────────────

def test_listar_por_version_filtra_y_cuenta_las_demas(app, monkeypatch):
    marcas = [(3, 1, 'cloud', {}, {}, None, 'Ana', AHORA, True, AHORA, ANTERIOR, 1, None)]
    cur, _ = _conectar(monkeypatch, [marcas, [], [(VIGENTE, 2, 4)]])
    r = app.test_client().get(f'/api/pdf/markups?node_id={PLANO}&version_id={ANTERIOR}')
    d = r.get_json()
    assert d['markups'][0]['version_number'] == 1 and d['markups'][0]['version_id'] == ANTERIOR
    assert d['en_otras_versiones'] == [{'version_id': VIGENTE, 'version_number': 2, 'marcas': 4}]
    sql, params = cur.queries[0]
    assert 'm.file_version_id = %s OR (m.file_version_id IS NULL AND n.current_version_id = %s)' in sql
    assert params == [PLANO, 'Ana', ANTERIOR, ANTERIOR]   # las de antes de la 36 cuentan como de la vigente


def test_sin_version_se_listan_todas_como_siempre(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[]])
    d = app.test_client().get(f'/api/pdf/markups?node_id={PLANO}').get_json()
    assert d['en_otras_versiones'] == [] and 'file_version_id = %s' not in cur.queries[0][0]


def test_crear_en_una_version_ajena_al_documento_cae_en_la_vigente(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [None, (VIGENTE,), (42,)])
    r = app.test_client().post('/api/pdf/markups', json={'node_id': PLANO, 'model_urn': 'obra', 'page': 1,
                                                          'kind': 'cloud', 'geometry': {}, 'version_id': AJENO})
    assert r.status_code == 200 and cur.queries[-1][1][8] == VIGENTE


def test_crear_en_la_version_que_se_mira(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [(ANTERIOR,), (43,)])
    app.test_client().post('/api/pdf/markups', json={'node_id': PLANO, 'model_urn': 'obra', 'page': 1,
                                                     'kind': 'cloud', 'geometry': {}, 'version_id': ANTERIOR})
    assert cur.queries[0][1] == (ANTERIOR, PLANO) and cur.queries[-1][1][8] == ANTERIOR


def test_llevar_a_la_vigente_copia_en_borrador_y_dice_de_donde_viene(app, monkeypatch):
    fila = (PLANO, 'obra', 2, 'foto', {'p': [1, 2]}, {'fotos': [FOTO]}, None, ANTERIOR, VIGENTE, 1)
    cur, conn = _conectar(monkeypatch, [fila, (77,)])
    r = app.test_client().post('/api/pdf/markups/5/llevar')
    assert r.status_code == 200 and r.get_json() == {'success': True, 'id': 77, 'desde_version': 1}
    sql, p = cur.queries[-1]
    assert 'INSERT INTO pdf_markups' in sql and 'publicado' not in sql      # nace en borrador
    assert p[7] == 'Ana' and p[8] == VIGENTE and p[9] == 5 and conn.committed
    assert json.loads(p[5]) == {'fotos': [FOTO]}


def test_no_se_lleva_lo_que_ya_esta_en_la_vigente_ni_lo_ajeno_sin_publicar(app, monkeypatch):
    fila = (PLANO, 'obra', 1, 'cloud', {}, {}, None, VIGENTE, VIGENTE, 2)
    _conectar(monkeypatch, [fila])
    assert app.test_client().post('/api/pdf/markups/5/llevar').status_code == 409
    cur, _ = _conectar(monkeypatch, [None])
    assert app.test_client().post('/api/pdf/markups/5/llevar').status_code == 404
    assert 'm.publicado OR m.created_by = %s' in cur.queries[0][0]


# ── Aviso al suprimir lo citado ───────────────────────────────────────────────

def test_citas_de_cuenta_marcas_y_planos_visibles(app, monkeypatch, prohibidos):
    secreto = str(uuid.uuid4())
    prohibidos.add(secreto)
    docs = [(FOTO, 'obra', 'IMG_1.jpg', 'FILE'), (INFORME, 'obra', 'Informe.pdf', 'FILE')]
    por_plano_foto = [(PLANO, 2), (secreto, 5)]       # el plano secreto no cuenta
    _conectar(monkeypatch, [docs, por_plano_foto, []])
    d = app.test_client().get(f'/api/pdf/citas-de?ids={FOTO},{INFORME},nada').get_json()
    assert d['citas'] == {FOTO: {'nombre': 'IMG_1.jpg', 'marcas': 2, 'planos': 1}}


def test_citas_de_sin_ids_no_consulta(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [])
    assert app.test_client().get('/api/pdf/citas-de?ids=').get_json() == {'success': True, 'citas': {}}
    assert not cur.queries


# ── La marca DIBUJA; lo que hay que corregir es una OBSERVACIÓN (20-oct-2026) ──
#
# El estado libre, los asignados y los comentarios dentro de la marca se quitaron:
# eran una incidencia paralela sin actos, sin avisos y sin historial
# (docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md, opción A).

def test_la_marca_ya_no_lleva_estado_asignados_ni_comentarios(app, monkeypatch):
    for cuerpo in ({'estado': 'cerrada'}, {'comentario': 'hola'}, {'asignados': ['Luis']},
                   {'cita_corregida': INFORME}):
        _, conn = _conectar(monkeypatch, [_marca(autor='Luis')])
        r = app.test_client().patch('/api/pdf/markups/5', json=cuerpo)
        assert r.status_code == 403 and not conn.committed, cuerpo   # solo su autor, y solo lo suyo
    assert not hasattr(pdf, 'ESTADOS_DE_MARCA')


MANANA = '2099-01-15'


def _observacion_lista(monkeypatch):
    """Lo que la ruta importa al crear, sin base: obra, guardia, código, encargo y actividad."""
    import db, encargos, flujo_de_registro, perimetro_de_obra
    hecho = {'encargo': None, 'actividad': None}
    monkeypatch.setattr(db, 'resolve_project_id', lambda urn: 3 if urn == 'obra' else None)
    monkeypatch.setattr(perimetro_de_obra, 'guardia_de_obra', lambda obra, accion='': None)
    monkeypatch.setattr(flujo_de_registro, 'siguiente_codigo', lambda cur, sem, obra: 'ISS-012')
    monkeypatch.setattr(encargos, 'abrir', lambda cur, *a, **k: hecho.__setitem__('encargo', (a, k)) or 91)
    monkeypatch.setattr(encargos, 'avisar', lambda cur, eid: None)
    monkeypatch.setattr(db, 'log_activity', lambda *a, **k: hecho.__setitem__('actividad', a))
    return hecho


def _fila_marca(autor='Ana', publicado=False):
    return (autor, publicado, 2, 'cloud', PLANO, 'obra', 'DR-803.pdf', VIGENTE, 2)


def test_crear_observacion_desde_la_marca(app, monkeypatch):
    hecho = _observacion_lista(monkeypatch)
    vence = datetime(2099, 1, 15)
    cur, conn = _conectar(monkeypatch, [
        _fila_marca(), (1,), (1,), None, (55,),
        [(55, 'ISS-012', 'Abierto', 'Cota de fondo', 9, 7, vence, '5')],
        [(9, 'Luis'), (7, 'Ana')],
    ])
    r = app.test_client().post('/api/pdf/markups/5/observacion', json={
        'titulo': ' Cota de fondo ', 'responsable_id': 9, 'vence_en': MANANA})
    assert r.status_code == 201, r.get_json()
    o = r.get_json()['observacion']
    assert o['codigo'] == 'ISS-012' and o['estado'] == 'Abierto' and o['responsable'] == 'Luis'
    assert o['verificador_id'] == 7 and o['vence_en'] == MANANA and not o['vencida']
    sql, p = [q for q in cur.queries if 'INSERT INTO doc_issues' in q[0]][0]
    assert p[3] == 'OBSERVACION' and p[4] == 'Cota de fondo'
    assert (p[7], p[8], p[9]) == (7, 9, 7)        # detecta Ana, corrige Luis, verifica Ana (escrito)
    assert p[13:15] == ('MARCA', '5') and 'DR-803.pdf · V2 · hoja 2' == p[6]
    ev = json.loads(p[12])[0]
    assert ev['documento'] == PLANO and ev['version_id'] == VIGENTE and ev['pagina'] == 2
    assert any('SET publicado = TRUE' in q[0] for q in cur.queries)   # el borrador se publica en el acto
    assert hecho['encargo'][1]['destino_usuario'] == 9 and conn.committed


def test_la_observacion_la_levanta_quien_dibujo_la_marca(app, monkeypatch):
    _observacion_lista(monkeypatch)
    cuerpo = {'titulo': 'X', 'responsable_id': 9, 'vence_en': MANANA}
    _conectar(monkeypatch, [_fila_marca(autor='Luis', publicado=True)])
    assert app.test_client().post('/api/pdf/markups/5/observacion', json=cuerpo).status_code == 403
    _conectar(monkeypatch, [_fila_marca(autor='Luis', publicado=False)])
    assert app.test_client().post('/api/pdf/markups/5/observacion', json=cuerpo).status_code == 404


def test_observacion_exige_responsable_distinto_y_fecha_futura(app, monkeypatch):
    _observacion_lista(monkeypatch)
    cliente = app.test_client()
    for cuerpo, codigo in (({'titulo': 'X', 'responsable_id': 7, 'vence_en': MANANA}, 409),   # Ana se verificaría
                           ({'titulo': 'X', 'vence_en': MANANA}, 400),
                           ({'titulo': '', 'responsable_id': 9, 'vence_en': MANANA}, 400),
                           ({'titulo': 'X', 'responsable_id': 9, 'vence_en': '2001-01-01'}, 400),
                           ({'titulo': 'X', 'responsable_id': 9}, 400)):
        cur, _ = _conectar(monkeypatch, [])
        assert cliente.post('/api/pdf/markups/5/observacion', json=cuerpo).status_code == codigo, cuerpo
        assert not cur.queries


def test_observacion_solo_con_miembros_y_una_viva_por_marca(app, monkeypatch):
    _observacion_lista(monkeypatch)
    cuerpo = {'titulo': 'X', 'responsable_id': 9, 'vence_en': MANANA}
    _, conn = _conectar(monkeypatch, [_fila_marca(), None])
    r = app.test_client().post('/api/pdf/markups/5/observacion', json=cuerpo)
    assert r.status_code == 409 and r.get_json()['code'] == 'RESPONSABLE_NO_MIEMBRO' and not conn.committed
    cur, conn = _conectar(monkeypatch, [_fila_marca(), (1,), (1,), ('ISS-004',)])
    r = app.test_client().post('/api/pdf/markups/5/observacion', json=cuerpo)
    assert r.status_code == 409 and 'ISS-004' in r.get_json()['error'] and not conn.committed
    assert not any('INSERT' in q[0] for q in cur.queries)


def test_al_listar_cada_marca_trae_su_observacion_y_si_vencio(app, monkeypatch):
    marcas = [(5, 1, 'cloud', {}, {}, None, 'Ana', AHORA, True, AHORA, VIGENTE, 2, None),
              (6, 1, 'arrow', {}, {}, None, 'Ana', AHORA, True, AHORA, VIGENTE, 2, None)]
    obs = [(55, 'ISS-012', 'Abierto', 'Cota', 9, 7, datetime(2001, 1, 1), '5')]
    cur, _ = _conectar(monkeypatch, [marcas, obs, [(9, 'Luis'), (7, 'Ana')]])
    d = app.test_client().get(f'/api/pdf/markups?node_id={PLANO}').get_json()
    o = d['markups'][0]['observacion']
    assert o['codigo'] == 'ISS-012' and o['vencida'] is True and o['responsable'] == 'Luis'
    assert d['markups'][1]['observacion'] is None
    sql, params = [q for q in cur.queries if 'FROM doc_issues' in q[0]][0]
    assert params == ('MARCA', ['5', '6'], 'OBSERVACION')                 # una consulta para toda la hoja


def test_leer_la_observacion_nombra_la_correccion_sin_dar_acceso(app, monkeypatch, prohibidos):
    prohibidos.add(AJENO)
    fila = (55, 'ISS-012', 'Corregido', 'Cota', 9, 7, datetime(2099, 1, 15), '5', 'Detalle', 7,
            [{'documento': INFORME, 'por': 'luis@obra.pe'}, {'documento': AJENO, 'por': 'luis@obra.pe'}],
            [{'event': 'detected', 'by': 'ana@obra.pe'}, {'event': 'commented', 'texto': 'Va'}], False, AHORA)
    docs = [(INFORME, 'obra', 'DR-803-Rev2.pdf', 'FILE'), (AJENO, 'obra', 'Contrato.pdf', 'FILE')]
    _conectar(monkeypatch, [('Ana', True), fila, [(9, 'Luis'), (7, 'Ana')], docs])
    r = app.test_client().get('/api/pdf/markups/5/observacion')
    o = r.get_json()['observacion']
    assert o['estado'] == 'Corregido' and o['autor'] == 'Ana' and len(o['historial']) == 2
    assert o['evidencia_correccion'][0]['nombre'] == 'DR-803-Rev2.pdf'
    assert o['evidencia_correccion'][1] == {'por': 'luis@obra.pe', 'comentario': None, 'id': AJENO,
                                            'restringido': True}
    assert 'Contrato' not in r.get_data(as_text=True)
    assert r.headers['Cache-Control'] == 'private, no-store'


def test_leer_la_observacion_del_borrador_de_otro_no_existe(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [('Luis', False)])
    assert app.test_client().get('/api/pdf/markups/5/observacion').status_code == 404
    assert len(cur.queries) == 1


def test_con_observacion_abierta_la_marca_no_se_retira_ni_se_borra(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [('ISS-012',)])
    r = app.test_client().post('/api/pdf/markups/5/publicar', json={'publicado': False})
    assert r.status_code == 409 and r.get_json()['code'] == 'OBSERVACION_ABIERTA' and not conn.committed
    assert not any(q[0].lstrip().startswith('UPDATE') for q in cur.queries)
    cur, conn = _conectar(monkeypatch, [('ISS-012',)])
    r = app.test_client().delete('/api/pdf/markups/5')
    assert r.status_code == 409 and not any('DELETE' in q[0] for q in cur.queries)
    cur, _ = _conectar(monkeypatch, [None, (True,)])                  # cerrada o sin observación: como siempre
    assert app.test_client().post('/api/pdf/markups/5/publicar', json={'publicado': False}).status_code == 200


# ── Editar la figura: mover, tamaño, color y texto (29-oct-2026) ─────────────

def _figura(kind='cloud', geo=None, autor='Ana'):
    return (kind, {'color': '#b93535'}, geo or {'x': 10, 'y': 20, 'w': 30, 'h': 40}, autor, 'obra')


def _update(cur):
    return [q for q in cur.queries if q[0].lstrip().startswith('UPDATE pdf_markups')]


def test_mover_y_redimensionar_un_borrador_guarda_la_nueva_caja(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_figura(), (False,), None])
    r = app.test_client().patch('/api/pdf/markups/5', json={'geometria': {'x': 15.5, 'y': 22, 'w': 50, 'h': 10}})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['markup']['geometry'] == {'x': 15.5, 'y': 22.0, 'w': 50.0, 'h': 10.0}
    assert json.loads(_update(cur)[0][1][1]) == {'x': 15.5, 'y': 22.0, 'w': 50.0, 'h': 10.0} and conn.committed


def test_una_marca_publicada_no_se_mueve_ni_se_recolorea(app, monkeypatch):
    for cuerpo in ({'geometria': {'x': 1, 'y': 2, 'w': 3, 'h': 4}}, {'color': '#507294'}):
        cur, conn = _conectar(monkeypatch, [_figura(), (True,)])
        r = app.test_client().patch('/api/pdf/markups/5', json=cuerpo)
        assert r.status_code == 409 and r.get_json()['code'] == 'MARCA_PUBLICADA'
        assert not _update(cur) and not conn.committed


def test_con_observacion_abierta_la_figura_no_cambia(app, monkeypatch):
    cur, conn = _conectar(monkeypatch, [_figura(), (False,), ('ISS-012',)])
    r = app.test_client().patch('/api/pdf/markups/5', json={'geometria': {'x': 1, 'y': 2, 'w': 3, 'h': 4}})
    assert r.status_code == 409 and r.get_json()['code'] == 'OBSERVACION_ABIERTA' and not _update(cur)


def test_solo_el_autor_mueve_su_marca(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_figura(autor='Beto')])
    r = app.test_client().patch('/api/pdf/markups/5', json={'geometria': {'x': 1, 'y': 2, 'w': 3, 'h': 4}})
    assert r.status_code == 403 and not _update(cur)


@pytest.mark.parametrize('kind, geo', [
    ('cloud', {'x': 1, 'y': 2, 'w': 0, 'h': 4}),                 # sin ancho
    ('cloud', {'x': 1, 'y': 2, 'w': True, 'h': 4}),              # un booleano no es un número
    ('cloud', {'x': 'a', 'y': 2, 'w': 3, 'h': 4}),
    ('arrow', {'p1': [1, 2]}),                                   # falta la punta
    ('area', {'points': [[0, 0], [1, 1]]}),                      # un área necesita tres vértices
    ('measure', {'points': [[0, 0], [1e9, 1]]}),                 # fuera de cualquier hoja
    ('count', {'p': [1, 2, 3]}),
])
def test_la_geometria_debe_tener_la_forma_de_su_tipo(app, monkeypatch, kind, geo):
    cur, _ = _conectar(monkeypatch, [_figura(kind=kind, geo={}), (False,), None])
    r = app.test_client().patch('/api/pdf/markups/5', json={'geometria': geo})
    assert r.status_code == 400, r.get_json()
    assert not _update(cur)


def test_mover_una_foto_no_la_gira(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_figura(kind='foto', geo={'p': [1, 2], 'ang': 90}), (False,), None])
    r = app.test_client().patch('/api/pdf/markups/5', json={'geometria': {'p': [30, 40], 'ang': 0}})
    assert r.status_code == 200
    assert r.get_json()['markup']['geometry'] == {'p': [30.0, 40.0], 'ang': 90}


def test_recolorear_un_borrador(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_figura(), (False,), None])
    r = app.test_client().patch('/api/pdf/markups/5', json={'color': '#507294'})
    assert r.status_code == 200 and r.get_json()['markup']['style']['color'] == '#507294'
    assert json.loads(_update(cur)[0][1][0])['color'] == '#507294'
    for malo in ('rojo', '#12345', '#12345g', 'url(x)'):
        cur, _ = _conectar(monkeypatch, [_figura(), (False,), None])
        assert app.test_client().patch('/api/pdf/markups/5', json={'color': malo}).status_code == 400
        assert not _update(cur)
    cur, _ = _conectar(monkeypatch, [_figura(kind='sello', geo={'p': [1, 2]}), (False,), None])
    assert app.test_client().patch('/api/pdf/markups/5', json={'color': '#507294'}).status_code == 400


def test_reescribir_el_texto_solo_en_una_marca_de_texto(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [_figura(kind='text', geo={'p': [1, 2]}), (False,), None])
    r = app.test_client().patch('/api/pdf/markups/5', json={'texto': '  Falta la cota de fondo  '})
    assert r.status_code == 200 and r.get_json()['markup']['text'] == 'Falta la cota de fondo'
    up = _update(cur)[0]
    assert 'text_content' in up[0] and up[1][2] == 'Falta la cota de fondo'
    for kind, texto in (('cloud', 'hola'), ('text', '   '), ('text', 'x' * 501)):
        cur, _ = _conectar(monkeypatch, [_figura(kind=kind, geo={'p': [1, 2]}), (False,), None])
        assert app.test_client().patch('/api/pdf/markups/5', json={'texto': texto}).status_code == 400
        assert not _update(cur)
