"""Los estados de ACC en las incidencias (migración 45, docs/archivos/18 §3): Borrador, En curso y En disputa, cada
uno con quien lo mueve, y los opcionales que apaga cada obra. Sin base real."""
from datetime import datetime
import json

from flask import Flask, g
import pytest

import encargos
import flujo_de_issue as iss
import routes.issues as rutas

ANA, LUIS, EVA = 7, 9, 11          # Ana la levanta y verifica, Luis corrige, Eva es de la obra
VENCE = datetime(2099, 1, 15)


def fila(estado, **cambios):
    """Una fila de `_COLS` de routes/issues.py."""
    d = dict(id=55, project_id=3, model_urn='obra', codigo='ISS-020', tipo='OBSERVACION', titulo='Cotas',
             descripcion=None, revision_id=None, ubicacion=None, progresiva=None, autor_id=ANA,
             responsable_id=LUIS, verificador_id=ANA, verificado_por=None, created_by='ana@obra.pe',
             estado=estado, vence_en=VENCE, evidencia=[], evidencia_correccion=[], autoverificacion=False,
             autoverificacion_motivo=None, origen_tipo='PLANO', origen_id='plano', history=[],
             creado_en=VENCE, corregido_en=None, verificado_en=None, cerrado_en=None,
             responsable_empresa=None, observadores=[], adjuntos=[], subtipo=None, causa_raiz=None, campos={})
    d.update(cambios)
    return tuple(d.values())


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


@pytest.fixture
def quien():
    return {'id': LUIS, 'name': 'Luis', 'email': 'luis@obra.pe'}


@pytest.fixture
def app(monkeypatch, quien):
    app = Flask(__name__)
    app.register_blueprint(rutas.issues_bp, url_prefix='/api/issues')
    app.before_request(lambda: setattr(g, 'current_user', quien))
    monkeypatch.setattr(rutas, 'guardia_de_recurso', lambda tabla, valor: None)
    monkeypatch.setattr(rutas, 'guardia_de_obra', lambda obra, accion='': None)
    monkeypatch.setattr(rutas, 'resolve_project_id', lambda urn: 3 if urn == 'obra' else None)
    monkeypatch.setattr(rutas, 'log_activity', lambda *a, **k: None)
    return app


@pytest.fixture
def pelota(monkeypatch):
    hecho = {'abiertos': [], 'cerrados': 0}
    monkeypatch.setattr(encargos, 'abrir', lambda cur, *a, **k: hecho['abiertos'].append((a, k)) or 91)
    monkeypatch.setattr(encargos, 'avisar', lambda cur, eid: None)
    monkeypatch.setattr(encargos, 'cerrar_los_de', lambda cur, *a, **k: hecho.__setitem__('cerrados', hecho['cerrados'] + 1))
    return hecho


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(rutas, 'get_db_connection', lambda: conn)
    return cur, conn


def _estado_escrito(cur):
    return [q[1][0] for q in cur.queries if q[0].startswith('UPDATE doc_issues SET estado')]


# ── En curso ──────────────────────────────────────────────────────────────

def test_el_responsable_dice_que_ya_la_esta_corrigiendo(app, monkeypatch, pelota):
    cur, conn = _conectar(monkeypatch, [fila('Abierto'), None, fila('En curso')])
    r = app.test_client().post('/api/issues/55/empezar')
    assert r.status_code == 200 and r.get_json()['estado'] == 'En curso'
    assert _estado_escrito(cur) == ['En curso'] and conn.committed
    assert pelota['abiertos'] == [] and pelota['cerrados'] == 0      # la pelota sigue siendo suya


def test_nadie_mas_dice_que_la_esta_corrigiendo(app, monkeypatch, quien, pelota):
    quien['id'] = EVA
    cur, conn = _conectar(monkeypatch, [fila('Abierto')])
    assert app.test_client().post('/api/issues/55/empezar').status_code == 403
    assert _estado_escrito(cur) == [] and not conn.committed


def test_una_obra_que_apago_en_curso_no_lo_ofrece(app, monkeypatch, pelota):
    cur, conn = _conectar(monkeypatch, [fila('Abierto'), (['En disputa'], {}, [], [])])
    r = app.test_client().post('/api/issues/55/empezar')
    assert r.status_code == 409 and r.get_json()['code'] == 'ESTADO_APAGADO'
    assert _estado_escrito(cur) == []


# ── En disputa ────────────────────────────────────────────────────────────

def test_no_procede_exige_motivo(app, monkeypatch, pelota):
    _conectar(monkeypatch, [])
    r = app.test_client().post('/api/issues/55/disputar', json={'motivo': '  '})
    assert r.status_code == 400 and r.get_json()['code'] == 'SIN_MOTIVO'


def test_no_procede_le_pasa_la_pelota_a_quien_la_levanto(app, monkeypatch, pelota):
    cur, conn = _conectar(monkeypatch, [fila('En curso'), None, fila('En disputa')])
    r = app.test_client().post('/api/issues/55/disputar', json={'motivo': 'La cota está bien en el detalle 4'})
    assert r.status_code == 200 and _estado_escrito(cur) == ['En disputa']
    assert pelota['cerrados'] == 1
    (args, kw), = pelota['abiertos']
    assert kw['destino_usuario'] == ANA and args[2].startswith('Resolver la disputa de ISS-020')
    historial = next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET history'))
    assert '"disputed"' in historial[1][0] and 'detalle 4' in historial[1][0]


def test_una_corregida_no_se_disputa(app, monkeypatch, pelota):
    _conectar(monkeypatch, [fila('Corregido')])
    r = app.test_client().post('/api/issues/55/disputar', json={'motivo': 'x'})
    assert r.status_code == 409 and r.get_json()['code'] == 'TRANSICION_INVALIDA'


def test_quien_la_levanto_la_reafirma_y_vuelve_al_responsable(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    cur, _ = _conectar(monkeypatch, [fila('En disputa'), fila('Abierto')])
    r = app.test_client().post('/api/issues/55/reafirmar', json={'motivo': 'Mira la lámina 3'})
    assert r.status_code == 200 and _estado_escrito(cur) == ['Abierto']
    (args, kw), = pelota['abiertos']
    assert kw['destino_usuario'] == LUIS and pelota['cerrados'] == 1


def test_el_responsable_no_resuelve_su_propia_disputa(app, monkeypatch, pelota):
    monkeypatch.setattr(rutas.reg, 'puede_cerrar', lambda *a, **k: False)
    cur, _ = _conectar(monkeypatch, [fila('En disputa')])
    r = app.test_client().post('/api/issues/55/reafirmar', json={'motivo': 'x'})
    assert r.status_code == 403 and _estado_escrito(cur) == []


# ── Borrador ──────────────────────────────────────────────────────────────

def test_un_borrador_se_guarda_sin_lo_que_se_exige_al_enviar_y_sin_avisar(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas.reg, 'siguiente_codigo', lambda cur, sem, obra: 'ISS-021')
    cur, _ = _conectar(monkeypatch, [None, (56,), fila('Borrador', id=56, responsable_id=None)] * 2)
    r = app.test_client().post('/api/issues', json={'model_urn': 'obra', 'tipo': 'PUNCH', 'titulo': 'Junta abierta',
                                                    'borrador': True})
    assert r.status_code == 201, r.get_json()
    assert 'Borrador' in [q[1][0] for q in cur.queries if q[0].startswith('UPDATE doc_issues SET estado')]
    assert pelota['abiertos'] == []


def test_sin_borrador_un_punch_sigue_exigiendo_responsable(app, monkeypatch, pelota):
    _conectar(monkeypatch, [])
    r = app.test_client().post('/api/issues', json={'model_urn': 'obra', 'tipo': 'PUNCH', 'titulo': 'Junta'})
    assert r.status_code == 409 and r.get_json()['code'] == 'SIN_RESPONSABLE'


def test_enviar_el_borrador_lo_abre_publica_sus_marcas_y_avisa(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    evidencia = [{'tipo': 'plano', 'documento': 'plano'}, {'tipo': 'marca', 'marca': 3}, {'tipo': 'marca', 'marca': 4}]
    cur, _ = _conectar(monkeypatch, [fila('Borrador', evidencia=evidencia), [(3,)], fila('Abierto')])
    r = app.test_client().post('/api/issues/55/enviar')
    assert r.status_code == 200 and _estado_escrito(cur) == ['Abierto']
    pub = next(q for q in cur.queries if 'UPDATE pdf_markups' in q[0])
    assert pub[1] == (ANA, [3, 4], 'Ana')                          # las marcas guardan el NOMBRE de su autor
    (args, kw), = pelota['abiertos']
    assert kw['destino_usuario'] == LUIS


def test_un_borrador_incompleto_no_se_envia(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    cur, _ = _conectar(monkeypatch, [fila('Borrador', tipo='PUNCH', responsable_id=None)])
    r = app.test_client().post('/api/issues/55/enviar')
    assert r.status_code == 409 and r.get_json()['code'] == 'SIN_RESPONSABLE' and _estado_escrito(cur) == []


def test_el_borrador_ajeno_no_existe(app, monkeypatch, pelota):
    _conectar(monkeypatch, [fila('Borrador')])
    assert app.test_client().post('/api/issues/55/enviar').status_code == 404
    _conectar(monkeypatch, [fila('Borrador')])
    assert app.test_client().get('/api/issues/55').status_code == 404


def test_descartar_un_borrador_lo_quita_para_todos_sin_borrar_la_fila(app, monkeypatch, quien, pelota):
    # Un borrador nunca llegó a nadie: desaparece (antes quedaba «Anulada» a la vista de toda la obra). La fila no se
    # borra: la aplicación no tiene DELETE sobre doc_issues desde la migración 26.
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    cur, conn = _conectar(monkeypatch, [fila('Borrador')])
    r = app.test_client().post('/api/issues/55/descartar')
    assert r.status_code == 200 and r.get_json()['descartada'] == 55 and conn.committed
    assert not [q for q in cur.queries if q[0].startswith('DELETE')]
    pasa, = [q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET estado')]
    assert pasa[1] == ('Anulado', 55, 'Borrador')                 # solo si sigue siendo borrador
    historia, = [q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET history')]
    assert json.loads(historia[1][0])[-1]['event'] == 'discarded'


def test_un_borrador_descartado_no_existe_para_nadie(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    _conectar(monkeypatch, [fila('Anulado', history=[{'event': 'discarded', 'by': 'Ana'}])])
    assert app.test_client().get('/api/issues/55').status_code == 404
    cur, _ = _conectar(monkeypatch, [[], []])
    assert app.test_client().get('/api/issues?model_urn=obra').status_code == 200
    assert all(iss.SQL_NO_DESCARTADA in sql for sql, _ in cur.queries)


def test_lo_enviado_no_se_descarta_se_anula(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    cur, _ = _conectar(monkeypatch, [fila('Abierto')])
    r = app.test_client().post('/api/issues/55/descartar')
    assert r.status_code == 409 and r.get_json()['code'] == 'TRANSICION_INVALIDA'
    assert not [q for q in cur.queries if q[0].startswith('DELETE')]


def test_el_borrador_ajeno_no_se_descarta(app, monkeypatch, pelota):
    cur, _ = _conectar(monkeypatch, [fila('Borrador')])       # quien pide es Luis, no la autora
    assert app.test_client().post('/api/issues/55/descartar').status_code == 404
    assert not [q for q in cur.queries if q[0].startswith('DELETE')]


def test_la_lista_esconde_los_borradores_ajenos(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [[], []])
    assert app.test_client().get('/api/issues?model_urn=obra').status_code == 200
    for sql, params in cur.queries:
        assert "estado <> 'Borrador' OR autor_id = %s" in sql and params[-1] == LUIS


# ── Los opcionales de la obra ─────────────────────────────────────────────

def _admin(monkeypatch, es):
    from flask import jsonify
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: es)
    monkeypatch.setattr(rutas, 'guardia_administrativa',
                        lambda cur, u, obra, accion='': None if es else (jsonify({'code': 'FORBIDDEN'}), 403))


def test_solo_el_administrador_configura_los_estados(app, monkeypatch):
    _admin(monkeypatch, False)
    cur, conn = _conectar(monkeypatch, [])
    r = app.test_client().put('/api/issues/configuracion', json={'model_urn': 'obra', 'opcionales': []})
    assert r.status_code == 403 and not conn.committed


def test_el_administrador_apaga_y_enciende(app, monkeypatch):
    _admin(monkeypatch, True)
    cur, conn = _conectar(monkeypatch, [None, (['Borrador', 'En disputa'], {}, [], [])])
    r = app.test_client().put('/api/issues/configuracion',
                              json={'model_urn': 'obra', 'opcionales': ['En disputa', 'Borrador']})
    assert r.status_code == 200 and r.get_json() == {'opcionales': ['Borrador', 'En disputa'], 'subtipos': {},
                                                     'causas': [], 'campos': [], 'admin': True}
    alta = next(q for q in cur.queries if 'INSERT INTO issue_config_de_obra' in q[0])
    assert alta[1] == (3, ['Borrador', 'En disputa'], '{}', '[]', '[]', LUIS) and conn.committed


def test_no_se_apaga_un_estado_que_no_es_opcional(app, monkeypatch):
    _admin(monkeypatch, True)
    _conectar(monkeypatch, [None])
    r = app.test_client().put('/api/issues/configuracion', json={'model_urn': 'obra', 'opcionales': ['Corregido']})
    assert r.status_code == 400


def test_sin_configurar_la_obra_usa_todos(app, monkeypatch):
    _admin(monkeypatch, False)
    _conectar(monkeypatch, [None])
    r = app.test_client().get('/api/issues/configuracion?model_urn=obra')
    assert r.get_json() == {'opcionales': list(iss.OPCIONALES), 'subtipos': {}, 'causas': [], 'campos': [],
                            'admin': False}


# ── A quién le toca ───────────────────────────────────────────────────────

@pytest.mark.parametrize('estado, deudor', [
    ('Borrador', None), ('Abierto', LUIS), ('En curso', LUIS), ('En disputa', ANA), ('Reabierto', LUIS),
    ('Corregido', ANA), ('Verificado', None), ('Anulado', None),
])
def test_a_quien_le_toca_cada_estado(estado, deudor):
    assert encargos.deudor_de_issue(None, (55, 'ISS-020', 'Cotas', estado, ANA, LUIS, ANA, VENCE))[0] == deudor


# ── La 45 completa: empresa, observadores, adjuntos, clasificación ─────────

CONTRATISTA = 40


def test_asignada_a_una_empresa_corrige_cualquiera_de_ella_y_nadie_de_ella_verifica():
    d = {'responsable_id': None, 'responsable_empresa': CONTRATISTA, 'verificador_id': ANA, 'autoverificacion': False}
    assert iss.puede_corregir({'id': LUIS}, d, empresa_del_usuario=CONTRATISTA)
    assert not iss.puede_corregir({'id': EVA}, d, empresa_del_usuario=99)
    puede, _ = iss.puede_verificar({'id': ANA}, d, False, empresa_del_usuario=CONTRATISTA)
    assert not puede                                   # Ana es de la contratista: no verifica lo de su empresa
    puede, _ = iss.puede_verificar({'id': ANA}, d, False, empresa_del_usuario=7)
    assert puede


def test_la_empresa_deudora():
    fila_ = (55, 'ISS-020', 'Cotas', 'En curso', ANA, None, ANA, VENCE, CONTRATISTA)
    assert encargos.deudor_de_issue(None, fila_)[0] is None
    assert encargos.empresa_deudora_de_issue(fila_)[0] == CONTRATISTA
    assert encargos.empresa_deudora_de_issue(fila_[:3] + ('Corregido',) + fila_[4:])[0] is None   # le toca a quien verifica


def test_el_encargo_de_la_empresa_sigue_vigente_mientras_le_toca():
    cur = Cursor([(55, 'ISS-020', 'Cotas', 'Abierto', ANA, None, ANA, VENCE, CONTRATISTA)])
    assert encargos._sigue_debiendose(cur, 'ISSUE', 55, None) is True
    cur = Cursor([(55, 'ISS-020', 'Cotas', 'Verificado', ANA, None, ANA, VENCE, CONTRATISTA)])
    assert encargos._sigue_debiendose(cur, 'ISSUE', 55, None) is False


def test_alta_asignada_a_una_empresa_le_abre_el_encargo_a_la_empresa(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas.reg, 'siguiente_codigo', lambda cur, sem, obra: 'ISS-021')
    creada = fila('Abierto', id=56, tipo='CALIDAD', responsable_id=None, responsable_empresa=CONTRATISTA)
    # config (sin fila) · Ana es de la obra · la empresa participa · empresa de quien verifica (7) · alta · lecturas
    _conectar(monkeypatch, [None, (1,), (1,), (7,), (56,), creada, creada, creada])
    r = app.test_client().post('/api/issues', json={'model_urn': 'obra', 'tipo': 'CALIDAD', 'titulo': 'Fisura',
                                                    'responsable_empresa': CONTRATISTA, 'verificador_id': ANA})
    assert r.status_code == 201, r.get_json()
    (args, kw), = pelota['abiertos']
    assert kw['destino_empresa'] == CONTRATISTA and kw['destino_usuario'] is None
    assert r.get_json()['a_quien_le_toca_empresa'] == CONTRATISTA


def test_persona_y_empresa_a_la_vez_no(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    _conectar(monkeypatch, [None, (1,)])
    r = app.test_client().post('/api/issues', json={'model_urn': 'obra', 'tipo': 'CALIDAD', 'titulo': 'x',
                                                    'responsable_id': LUIS, 'responsable_empresa': CONTRATISTA})
    assert r.status_code == 400 and r.get_json()['code'] == 'UN_SOLO_RESPONSABLE'


def test_quien_la_levanto_la_reasigna_y_la_pelota_se_va_con_ella(app, monkeypatch, quien, pelota):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    nueva = fila('Abierto', responsable_id=EVA)
    cur, _ = _conectar(monkeypatch, [fila('Abierto'), (1,), nueva, nueva])
    r = app.test_client().post('/api/issues/55/editar', json={'responsable_id': EVA})
    assert r.status_code == 200, r.get_json()
    assert pelota['cerrados'] == 1 and pelota['abiertos'][0][1]['destino_usuario'] == EVA
    sql, params = next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET responsable_id'))
    assert params == (EVA, None, 55)


def test_el_responsable_no_se_reasigna(app, monkeypatch, pelota):
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    monkeypatch.setattr(rutas.reg, 'puede_pasar_la_pelota', lambda *a, **k: False)
    _conectar(monkeypatch, [fila('Abierto')])
    assert app.test_client().post('/api/issues/55/editar', json={'responsable_id': EVA}).status_code == 403


def test_cualquiera_de_la_obra_la_sigue(app, monkeypatch, quien):
    quien.update(id=EVA, name='Eva', email='eva@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    monkeypatch.setattr(rutas.reg, 'puede_pasar_la_pelota', lambda *a, **k: False)
    cur, _ = _conectar(monkeypatch, [fila('Abierto', observadores=[ANA]), (1,), fila('Abierto', observadores=[ANA, EVA])])
    r = app.test_client().post('/api/issues/55/editar', json={'seguir': True})
    assert r.status_code == 200 and r.get_json()['observadores'] == [ANA, EVA]
    assert next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET observadores'))[1] == ([ANA, EVA], 55)


def test_los_observadores_reciben_aviso_de_cada_paso_menos_quien_actua(app, monkeypatch, pelota):
    import mailer
    enviados = []
    monkeypatch.setattr(mailer, 'enviar', lambda correo, asunto, *a, **k: enviados.append((correo, asunto)) or (True, ''))
    cur, _ = _conectar(monkeypatch, [fila('Abierto', observadores=[EVA, LUIS]), None, [('eva@obra.pe',)],
                                     fila('En curso', observadores=[EVA, LUIS])])
    assert app.test_client().post('/api/issues/55/empezar').status_code == 200
    assert enviados == [('eva@obra.pe', 'Novedad en ISS-020')]
    consulta = next(q for q in cur.queries if 'FROM users WHERE id = ANY' in q[0])
    assert consulta[1] == ([EVA],)                       # Luis actúa: a él no


def test_la_clasificacion_respeta_las_listas_de_la_obra(app, monkeypatch, quien):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    config = (['Borrador'], {'OBSERVACION': ['Cotas', 'Acabados']}, ['Diseño', 'Ejecución'],
              [{'clave': 'partida', 'etiqueta': 'Partida', 'tipo': 'lista', 'opciones': ['01', '02'], 'obligatorio': False}])
    _conectar(monkeypatch, [fila('Abierto'), config])
    r = app.test_client().post('/api/issues/55/editar', json={'subtipo': 'Pintura'})
    assert r.status_code == 400 and r.get_json()['code'] == 'SUBTIPO_DESCONOCIDO'
    cur, _ = _conectar(monkeypatch, [fila('Abierto'), config, fila('Abierto')])
    r = app.test_client().post('/api/issues/55/editar', json={'subtipo': 'Cotas', 'causa_raiz': 'Diseño',
                                                             'campos': {'partida': '02'}})
    assert r.status_code == 200, r.get_json()
    sql, params = next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET subtipo'))
    assert params == ('Cotas', 'Diseño', '{"partida": "02"}', 55)


def test_cerrada_solo_se_apunta_la_causa_raiz(app, monkeypatch, quien):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    _conectar(monkeypatch, [fila('Verificado')])
    assert app.test_client().post('/api/issues/55/editar', json={'subtipo': 'Cotas'}).status_code == 409


def test_un_campo_obligatorio_se_exige_al_levantar_y_se_valida_su_clase():
    defs, motivo = iss.definiciones_validas([{'etiqueta': 'Metrado', 'tipo': 'numero', 'obligatorio': True},
                                             {'etiqueta': 'Inspección', 'tipo': 'fecha'}])
    assert motivo is None and [d['clave'] for d in defs] == ['metrado', 'inspeccion']
    assert iss.valores_validos(defs, {})[1] == 'Falta «Metrado».'
    assert iss.valores_validos(defs, {}, exigir_obligatorios=False) == ({}, None)
    assert iss.valores_validos(defs, {'metrado': 'mucho'})[1] == '«Metrado» tiene que ser un número.'
    assert iss.valores_validos(defs, {'metrado': '12.5', 'otra': 'x'}) == ({'metrado': 12.5}, None)
    assert iss.definiciones_validas([{'etiqueta': 'X', 'tipo': 'lista'}])[1]


def test_adjunta_un_documento_de_la_obra_y_solo_lo_quita_quien_lo_puso(app, monkeypatch, quien):
    quien.update(id=LUIS, name='Luis', email='luis@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    doc = '33333333-3333-4333-8333-333333333333'
    cur, _ = _conectar(monkeypatch, [fila('Abierto'), [(doc, 'foto-1.jpg', 'obra')], fila('Abierto')])
    r = app.test_client().post('/api/issues/55/adjuntar', json={'documento': doc})
    assert r.status_code == 200, r.get_json()
    guardado = json.loads(next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET adjuntos'))[1][0])
    assert guardado == [{'documento': doc, 'nombre': 'foto-1.jpg', 'por': 'luis@obra.pe', 'por_id': LUIS}]
    _conectar(monkeypatch, [fila('Abierto'), [(doc, 'foto-1.jpg', 'otra-obra')]])
    r = app.test_client().post('/api/issues/55/adjuntar', json={'documento': doc})
    assert r.status_code == 400 and r.get_json()['code'] == 'ADJUNTO_AJENO'
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    _conectar(monkeypatch, [fila('Abierto', adjuntos=guardado)])
    assert app.test_client().post('/api/issues/55/adjuntar', json={'quitar': doc}).status_code == 403


def test_nadie_ajeno_adjunta(app, monkeypatch, quien):
    quien.update(id=EVA, name='Eva', email='eva@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    _conectar(monkeypatch, [fila('Abierto')])
    assert app.test_client().post('/api/issues/55/adjuntar', json={'documento': 'x'}).status_code == 403


# ── Quitar un adjunto (5-nov-2026) ─────────────────────────────────────────
# El dueño: «probé cargar una imagen y tampoco me permite deshacerla; debe quedar en el historial quién eliminó».
# Los adjuntos que se subían AL LEVANTAR la incidencia solo guardaban `por` (el correo), sin `por_id`, y la pantalla
# exigía `por_id`: nadie podía quitarlos. Ahora la regla es una sola, la del servidor, y la pantalla la recibe.

def test_un_adjunto_del_alta_lo_quita_quien_lo_subio_y_queda_en_el_historial(app, monkeypatch, quien):
    quien.update(id=ANA, name='Ana', email='ana@obra.pe')
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    doc = '44444444-4444-4444-8444-444444444444'
    del_alta = [{'documento': doc, 'nombre': 'foto-alta.jpg', 'por': 'ana@obra.pe'}]       # sin por_id
    cur, _ = _conectar(monkeypatch, [fila('Abierto', adjuntos=del_alta), fila('Abierto')])
    r = app.test_client().post('/api/issues/55/adjuntar', json={'quitar': doc})
    assert r.status_code == 200, r.get_json()
    escrito = json.loads(next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET adjuntos'))[1][0])
    assert escrito == []
    evento = json.loads(next(q for q in cur.queries if 'SET history' in q[0])[1][0])[0]
    assert evento['event'] == 'detached' and evento['nombre'] == 'foto-alta.jpg' and evento['by'] == 'ana@obra.pe'


def test_la_pantalla_recibe_que_adjuntos_puede_quitar_quien_mira(app, monkeypatch, quien):
    suyo = {'documento': 'a', 'nombre': 'a.jpg', 'por': 'luis@obra.pe', 'por_id': LUIS}
    de_otro = {'documento': 'b', 'nombre': 'b.jpg', 'por': 'ana@obra.pe', 'por_id': ANA}
    del_alta = {'documento': 'c', 'nombre': 'c.jpg', 'por': 'luis@obra.pe'}
    _conectar(monkeypatch, [fila('Abierto', adjuntos=[suyo, de_otro, del_alta])])
    assert app.test_client().get('/api/issues/55').get_json()['adjuntos_que_puedo_quitar'] == ['a', 'c']
    # Cerrada, ninguno: sus adjuntos ya no cambian.
    _conectar(monkeypatch, [fila('Verificado', adjuntos=[suyo, del_alta])])
    assert app.test_client().get('/api/issues/55').get_json()['adjuntos_que_puedo_quitar'] == []
    # Y lo que se guarda no lleva esa lista: es de quien mira, no de la incidencia.
    cur, _ = _conectar(monkeypatch, [fila('Abierto', adjuntos=[suyo, de_otro]), fila('Abierto')])
    monkeypatch.setattr(rutas, 'es_admin_de_obra', lambda cur, u, obra: False)
    assert app.test_client().post('/api/issues/55/adjuntar', json={'quitar': 'a'}).status_code == 200
    escrito = json.loads(next(q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET adjuntos'))[1][0])
    assert escrito == [de_otro]
