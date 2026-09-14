# -*- coding: utf-8 -*-
"""REVIEWS · E1 · el detalle de una revision y el listado filtrado, por la RUTA REAL.

QUE FIJA
--------
El blueprint real sobre Flask, con la base sustituida por un doble que REGISTRA
cada sentencia (el mismo metodo que `test_r01_motor_por_contrato`):

  · el detalle solo lee: cero escrituras y cero commits;
  · sus puertas: revision inexistente, obra ajena, ambito de otra obra y falta de
    permiso documental -- esta ultima sin titulo ni nombres;
  · `acciones` sale de las mismas funciones que `/act`: conformidad para REVISA,
    aprobar para un APRUEBA intermedio, aprobar y cerrar para el ultimo; nada
    para quien no es el revisor aunque sea administrador; sustituir solo con la
    revision BLOQUEADA y rol global de administrador; aprobar apagado por
    asociacion invalida o por version nueva en el cierre;
  · el listado aplica el permiso y el filtro ANTES de cortar la pagina, pagina
    por cursor y respeta el tope de filas examinadas;
  · E1.2: el detalle y el alta nombran las OTRAS revisiones en curso con el mismo
    documento, solo si se pueden ver; el cierre dice si los documentos ya estaban en
    su destino o si alguno volveria atras; las fechas sin zona salen con la suya.

El comportamiento contra PostgreSQL, con `/act` de verdad, se mide en
`herramientas/ensayo_de_detalle_de_revision.py`.
"""
import importlib
import io
import os

import pytest
from flask import Flask

OBRA = 'zz_urn_e1'
DOC = '0b5a3c52-7f1e-4d1a-9c3e-4e6f2a9b8d01'
VERSION = '5c2d8e41-3a6b-4f0c-8d7e-1b9a6c4e2f02'
VERSION_NUEVA = '7d3e9f52-4b7c-4a1d-9e8f-2c0b7d5f3a03'
AT, PRE = 'AUTORIDAD_TERMINAL', 'PRE'


def paso(uid, decision=None):
    p = {'user_id': uid, 'email': 'u%d@obra.pe' % uid, 'name': 'Usuario %d' % uid}
    if decision:
        p['decision'] = decision
    return p


def item(nombre='P-01.pdf', version_id=VERSION):
    return {'node_id': DOC, 'name': nombre, 'version': 1, 'version_id': version_id}


def fila(rid, contrato=AT, pasos=None, current_step=0, status='pending', history=None,
         items=None, created_by='autor@obra.pe'):
    return (rid, OBRA, 'Revisión %d' % rid,
            items if items is not None else [item()],
            pasos if pasos is not None else [paso(1, 'REVISA'), paso(2, 'APRUEBA')],
            current_step, status, 'SHARED', history or [], created_by, None,
            None, None, None, None, None, None, contrato)


class Cursor:
    def __init__(self, e):
        self.e = e
        self._uno, self._todos = None, []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self.e['sql'].append((s, params))
        self._uno, self._todos = None, []
        if s.startswith('SELECT ID, MODEL_URN, TITLE, ITEMS'):
            if 'WHERE ID = %S' in s:
                self._uno = next((f for f in self.e['filas'] if f[0] == params[0]), None)
                return
            resto = list(params)
            lote = resto.pop()
            urn = resto.pop(0)
            quien = resto.pop(0) if 'LOWER(CREATED_BY) = ANY' in s else None
            tope = resto.pop(0) if 'ID < %S' in s else None
            filas = [f for f in self.e['filas'] if f[1] == urn]
            if "= 'PENDING'" in s:
                filas = [f for f in filas if (f[6] or 'pending') == 'pending']
            if "<> 'PENDING'" in s:
                filas = [f for f in filas if (f[6] or 'pending') != 'pending']
            if quien is not None:
                filas = [f for f in filas if (f[9] or '').lower() in quien]
            if tope is not None:
                filas = [f for f in filas if f[0] < tope]
            self.e['lecturas'] += 1
            self._todos = sorted(filas, key=lambda f: -f[0])[:lote]
        elif s.startswith('SELECT ID::TEXT, CURRENT_VERSION_ID::TEXT, VERSION_NUMBER'):
            self._todos = [(DOC, self.e['vigente'], self.e['numero_vigente'],
                            self.e['estado_doc'])]
        elif s.startswith('SELECT ID, TITLE, ITEMS FROM DOC_REVIEWS'):
            urn, excluir, nodos, tope = params
            filas = [f for f in self.e['filas']
                     if f[1] == urn and (f[6] or 'pending') == 'pending' and f[0] != excluir
                     and any(isinstance(i, dict) and i.get('node_id') in nodos for i in f[3])]
            self._todos = [(f[0], f[2], f[3]) for f in sorted(filas, key=lambda f: -f[0])[:tope]]
        elif s.startswith('SELECT ID FROM USERS'):
            self._uno = (params[0],)
        elif s.startswith('SELECT 1 FROM PROJECT_USERS'):
            self._uno = None if params[1] in self.e['fuera_de_la_obra'] else (1,)
        elif s.startswith('SELECT 1 FROM FILE_VERSIONS'):
            self._uno = (1,) if params and tuple(params[:3]) == (VERSION, DOC, OBRA) else None

    def fetchone(self):
        return self._uno

    def fetchall(self):
        return self._todos


class Conn:
    def __init__(self, e):
        self.e = e

    def cursor(self):
        return Cursor(self.e)

    def commit(self):
        self.e['commits'] += 1

    def rollback(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def ruta(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.reviews as rv
    importlib.reload(rv)
    import flujo_de_revision as flujo
    import permiso_documental as pd
    import routes.documents as rd
    import auth_middleware as am

    e = {'filas': [], 'sql': [], 'commits': 0, 'lecturas': 0, 'vigente': VERSION,
         'numero_vigente': 1, 'estado_doc': 'WIP', 'fuera_de_la_obra': set(),
         'con_acceso': set(),
         'acceso_obra': True,
         'usuario': {'id': 1, 'name': 'Usuario 1', 'email': 'u1@obra.pe', 'role': 'editor'}}

    monkeypatch.setattr(rv, 'get_db_connection', lambda: Conn(e))
    obra_de = lambda urn: 'obra-e1' if urn == OBRA else ('obra-otra' if urn else None)  # noqa: E731
    monkeypatch.setattr(rv, 'resolve_project_id', obra_de)
    # `estado_del_flujo` resuelve la obra por su cuenta, desde `db`.
    import db
    monkeypatch.setattr(db, 'resolve_project_id', obra_de)
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: e['acceso_obra'])
    monkeypatch.setattr(pd, 'contexto_de_permisos', lambda *a, **k: {})

    def puede_consultar(cur, usuario, urn, items, *a, **k):
        # Los documentos «RESERVADO» solo los consulta quien esta en `con_acceso`.
        reservado = any((i or {}).get('name', '').startswith('RESERVADO') for i in items or [])
        return not reservado or (usuario or {}).get('id') in e['con_acceso']

    monkeypatch.setattr(flujo, 'puede_consultar_la_revision', puede_consultar)
    monkeypatch.setattr(flujo, 'persona', lambda cur, uid: {
        'id': uid, 'email': 'u%s@obra.pe' % uid, 'name': 'Usuario %s' % uid, 'role': 'editor'})
    monkeypatch.setattr(am, 'validate_session', lambda t: e['usuario'])

    app = Flask(__name__)
    am.init_auth_middleware(app)
    app.register_blueprint(rv.reviews_bp)
    cli = app.test_client()
    cli.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return {'cli': cli, 'e': e, 'rv': rv}


def como(r, uid, role='editor'):
    r['e']['usuario'] = {'id': uid, 'name': 'Usuario %d' % uid,
                         'email': 'u%d@obra.pe' % uid, 'role': role}


def detalle(r, rid=5, **query):
    q = '&'.join('%s=%s' % kv for kv in query.items())
    resp = r['cli'].get('/api/reviews/%d%s' % (rid, ('?' + q) if q else ''))
    return resp.status_code, resp.get_json()


def listado(r, **query):
    query.setdefault('model_urn', OBRA)
    q = '&'.join('%s=%s' % kv for kv in query.items())
    resp = r['cli'].get('/api/reviews?' + q)
    return resp.status_code, resp.get_json()


def escrituras(e):
    return [s for s, _ in e['sql']
            if s.startswith(('INSERT', 'UPDATE', 'DELETE')) or ' INSERT INTO ' in s]


# ══ DETALLE · PUERTAS ═════════════════════════════════════════════════════

def test_una_revision_que_no_existe_da_404(ruta):
    s, b = detalle(ruta, 999)
    assert s == 404 and b['code'] == 'REVISION_NO_ENCONTRADA'


def test_sin_acceso_a_la_obra_da_403(ruta):
    ruta['e']['filas'] = [fila(5)]
    ruta['e']['acceso_obra'] = False
    s, b = detalle(ruta)
    assert s == 403 and b['code'] == 'SIN_ACCESO_A_LA_OBRA'


def test_una_revision_de_otra_obra_no_se_ensena_en_esta(ruta):
    ruta['e']['filas'] = [fila(5)]
    s, b = detalle(ruta, model_urn='otra_obra')
    assert s == 404 and b['code'] == 'REVISION_DE_OTRA_OBRA'
    s, _b = detalle(ruta, model_urn=OBRA)
    assert s == 200


def test_sin_permiso_documental_da_403_sin_titulo_ni_nombres(ruta):
    ruta['e']['filas'] = [fila(5, items=[item('RESERVADO-7.pdf')],
                               history=[{'event': 'approve', 'step': 0, 'comment': 'secreto'}])]
    s, b = detalle(ruta)
    crudo = repr(b)
    assert s == 403 and b['code'] == 'SIN_PERMISO_DOCUMENTAL'
    for fuga in ('Revisión 5', 'RESERVADO', 'secreto'):
        assert fuga not in crudo


def test_el_detalle_solo_lee(ruta):
    ruta['e']['filas'] = [fila(5)]
    s, _b = detalle(ruta)
    assert s == 200
    assert escrituras(ruta['e']) == [] and ruta['e']['commits'] == 0


def test_el_detalle_trae_pasos_historial_version_vigente_y_enlace(ruta):
    historia = [{'event': 'created', 'by': 'autor@obra.pe', 'at': 't0'},
                {'event': 'step_started', 'step': 0, 'due': 'd0', 'at': 't1'},
                {'event': 'approve', 'step': 0, 'by': 'u1@obra.pe', 'comment': 'ok',
                 'emitido': 'CONFORME', 'at': 't2'},
                {'event': 'step_started', 'step': 1, 'due': 'd1', 'at': 't3'}]
    ruta['e']['filas'] = [fila(5, current_step=1, history=historia)]
    ruta['e']['numero_vigente'] = 3
    como(ruta, 2)
    s, b = detalle(ruta)
    rev = b['revision']
    assert s == 200 and rev['codigo'] == 'RV-005' and rev['obra_id'] == 'obra-e1'
    assert rev['history'] == historia
    p1, p2 = rev['pasos']
    assert (p1['estado'], p1['decision'], p1['acto']['emitido'], p1['acto']['comment']) == \
        ('hecho', 'REVISA', 'CONFORME', 'ok')
    assert (p2['estado'], p2['decision'], p2['terminal'], p2['inicio']) == \
        ('actual', 'APRUEBA', True, 't3')
    assert rev['items'][0]['version_vigente_numero'] == 3
    assert rev['items'][0]['es_version_vigente'] is True
    assert rev['me_toca'] is True


# ══ DETALLE · ACCIONES CON LAS REGLAS DE /act ════════════════════════════

@pytest.mark.parametrize('contrato,pasos,actual,uid,tipo', [
    (AT, [paso(1, 'REVISA'), paso(2, 'APRUEBA')], 0, 1, 'conformidad'),
    (AT, [paso(1, 'APRUEBA'), paso(2, 'APRUEBA')], 0, 1, 'aprobar'),
    (AT, [paso(1, 'REVISA'), paso(2, 'APRUEBA')], 1, 2, 'aprobar_y_cerrar'),
    (PRE, [paso(1), paso(2)], 0, 1, 'aprobar'),
    (PRE, [paso(1), paso(2)], 1, 2, 'aprobar_y_cerrar'),
])
def test_el_boton_se_llama_como_lo_que_hace(ruta, contrato, pasos, actual, uid, tipo):
    ruta['e']['filas'] = [fila(5, contrato=contrato, pasos=pasos, current_step=actual,
                               items=[item()] if contrato == AT else [{'node_id': DOC,
                                                                      'name': 'P.pdf'}])]
    como(ruta, uid)
    _s, b = detalle(ruta)
    acciones = b['revision']['acciones']
    assert acciones['aprobar']['disponible'] is True
    assert acciones['aprobar']['tipo'] == tipo
    assert acciones['rechazar']['disponible'] is True
    if tipo == 'aprobar_y_cerrar':
        assert acciones['aprobar']['destino'] == 'SHARED'
        assert acciones['aprobar']['siguiente_paso'] is None
    else:
        assert acciones['aprobar']['siguiente_paso'] == {'numero': actual + 2,
                                                         'persona': 'Usuario %d' % (uid + 1)}


def test_quien_no_es_el_revisor_no_ve_actos_aunque_administre(ruta):
    ruta['e']['filas'] = [fila(5)]
    como(ruta, 9, role='admin')
    _s, b = detalle(ruta)
    acciones = b['revision']['acciones']
    assert not acciones['aprobar']['disponible'] and not acciones['rechazar']['disponible']
    assert acciones['sustituir'] is False
    assert 'Usuario 1' in acciones['motivo']


@pytest.mark.parametrize('role,sustituir', [('admin', True), ('editor', False)])
def test_una_revision_bloqueada_solo_ofrece_sustituir_al_administrador_global(ruta, role,
                                                                              sustituir):
    ruta['e']['filas'] = [fila(5)]
    ruta['e']['fuera_de_la_obra'] = {1}
    como(ruta, 9, role=role)
    _s, b = detalle(ruta)
    rev = b['revision']
    assert rev['flujo'] == 'BLOQUEADA'
    assert rev['acciones']['sustituir'] is sustituir
    assert not rev['acciones']['aprobar']['disponible']


def test_una_revision_terminada_no_ofrece_nada(ruta):
    ruta['e']['filas'] = [fila(5, status='approved', current_step=1)]
    como(ruta, 2)
    _s, b = detalle(ruta)
    rev = b['revision']
    assert [p['estado'] for p in rev['pasos']] == ['hecho', 'hecho']
    assert not rev['acciones']['aprobar']['disponible']
    assert not rev['acciones']['rechazar']['disponible']


def test_una_rechazada_marca_el_paso_que_rechazo(ruta):
    ruta['e']['filas'] = [fila(5, status='rejected', current_step=0)]
    _s, b = detalle(ruta)
    assert [p['estado'] for p in b['revision']['pasos']] == ['rechazado', 'no_alcanzado']


def test_asociacion_invalida_apaga_aprobar_y_deja_rechazar(ruta):
    ruta['e']['filas'] = [fila(5, items=[item(version_id=VERSION_NUEVA)])]
    _s, b = detalle(ruta)
    acciones = b['revision']['acciones']
    assert b['revision']['items'][0]['asociacion_valida'] is False
    assert acciones['aprobar']['disponible'] is False and acciones['aprobar']['motivo_no']
    assert acciones['rechazar']['disponible'] is True


def test_una_version_nueva_apaga_aprobar_solo_en_el_cierre(ruta):
    ruta['e']['vigente'] = VERSION_NUEVA
    ruta['e']['numero_vigente'] = 2
    ruta['e']['filas'] = [fila(5, current_step=1)]
    como(ruta, 2)
    _s, b = detalle(ruta)
    acciones = b['revision']['acciones']
    assert b['revision']['items'][0]['es_version_vigente'] is False
    assert acciones['aprobar']['disponible'] is False
    assert 'versión nueva' in acciones['aprobar']['motivo_no']
    assert acciones['rechazar']['disponible'] is True

    ruta['e']['filas'] = [fila(5, current_step=0)]
    como(ruta, 1)
    _s, b = detalle(ruta)
    assert b['revision']['acciones']['aprobar']['disponible'] is True


# ══ LISTADO · FILTROS Y PAGINAS ═══════════════════════════════════════════

@pytest.mark.parametrize('query,codigo', [
    ({'filtro': 'inventado'}, 'FILTRO_DESCONOCIDO'),
    ({'limite': '0'}, 'PAGINACION_NO_VALIDA'),
    ({'limite': '101'}, 'PAGINACION_NO_VALIDA'),
    ({'limite': 'veinte'}, 'PAGINACION_NO_VALIDA'),
    ({'antes_de': 'x'}, 'PAGINACION_NO_VALIDA'),
])
def test_un_filtro_o_una_pagina_invalidos_dan_400(ruta, query, codigo):
    s, b = listado(ruta, **query)
    assert s == 400 and b['code'] == codigo


def test_las_paginas_no_salen_cortas_por_revisiones_invisibles(ruta):
    reservadas = {12, 10, 8}
    ruta['e']['filas'] = [fila(i, items=[item('RESERVADO.pdf' if i in reservadas else 'P.pdf')])
                          for i in range(1, 13)]
    vistas, cursor = [], None
    for _pagina in range(4):
        query = {'limite': '3'}
        if cursor:
            query['antes_de'] = str(cursor)
        s, b = listado(ruta, **query)
        assert s == 200
        ids = [x['id'] for x in b['reviews']]
        if b['siguiente'] is not None:
            assert len(ids) == 3
        vistas.append(ids)
        cursor = b['siguiente']
        if cursor is None:
            break
    assert vistas == [[11, 9, 7], [6, 5, 4], [3, 2, 1]]
    assert escrituras(ruta['e']) == []


def test_quien_puede_ver_las_reservadas_las_recibe(ruta):
    ruta['e']['filas'] = [fila(i, items=[item('RESERVADO.pdf' if i % 2 else 'P.pdf')])
                          for i in range(1, 5)]
    ruta['e']['con_acceso'] = {1}
    _s, b = listado(ruta)
    assert [x['id'] for x in b['reviews']] == [4, 3, 2, 1]
    assert all(x['codigo'] == 'RV-%03d' % x['id'] for x in b['reviews'])


def test_me_toca_bloqueadas_en_curso_y_terminadas(ruta):
    ruta['e']['filas'] = [
        fila(1, current_step=0),                                  # le toca a 1
        fila(2, current_step=1),                                  # le toca a 2
        fila(3, pasos=[paso(7, 'REVISA'), paso(2, 'APRUEBA')]),   # 7 fuera: bloqueada
        fila(4, status='approved', current_step=1),
        fila(5, status='rejected'),
    ]
    ruta['e']['fuera_de_la_obra'] = {7}
    como(ruta, 1)
    ids = lambda f: [x['id'] for x in listado(ruta, filtro=f)[1]['reviews']]  # noqa: E731
    assert ids('me_toca') == [1]
    assert ids('bloqueadas') == [3]
    assert ids('en_curso') == [3, 2, 1]
    assert ids('terminadas') == [5, 4]
    assert ids('todas') == [5, 4, 3, 2, 1]
    _s, b = listado(ruta)
    assert {x['id']: x['me_toca'] for x in b['reviews']} == {5: False, 4: False, 3: False,
                                                             2: False, 1: True}


def test_iniciadas_por_mi_compara_correo_o_nombre_sin_mayusculas(ruta):
    ruta['e']['filas'] = [fila(1, created_by='U1@OBRA.PE'), fila(2, created_by='Usuario 1'),
                          fila(3, created_by='otro@obra.pe')]
    como(ruta, 1)
    _s, b = listado(ruta, filtro='iniciadas_por_mi')
    assert [x['id'] for x in b['reviews']] == [2, 1]


def test_el_tope_de_filas_examinadas_devuelve_por_donde_seguir(ruta, monkeypatch):
    monkeypatch.setattr(ruta['rv'], '_LOTE_DE_LECTURA', 2)
    monkeypatch.setattr(ruta['rv'], '_TOPE_DE_FILAS_EXAMINADAS', 4)
    ruta['e']['filas'] = [fila(i, items=[item('RESERVADO.pdf' if i > 2 else 'P.pdf')])
                          for i in range(1, 11)]
    # Cada peticion examina como mucho 4 filas: 10-7, 6-3 y por fin 2-1.
    s, b = listado(ruta, limite='3')
    assert s == 200 and b['reviews'] == [] and b['siguiente'] == 7
    s, b = listado(ruta, limite='3', antes_de='7')
    assert b['reviews'] == [] and b['siguiente'] == 3
    s, b = listado(ruta, limite='3', antes_de='3')
    assert [x['id'] for x in b['reviews']] == [2, 1] and b['siguiente'] is None


# ══ FUENTE · MISMAS REGLAS, SOLO LECTURA, OBRA RESUELTA ═══════════════════

def _fuente(rel):
    raiz = os.path.join(os.path.dirname(__file__), '..')
    return io.open(os.path.join(raiz, rel), encoding='utf-8').read()


def test_el_detalle_esta_en_el_mapa_de_rutas_por_recurso():
    import perimetro_de_obra as po
    assert po.RUTAS_POR_RECURSO.get('get_review') == ('doc_reviews', 'rid')


def test_el_detalle_tiene_sus_puertas_y_no_escribe():
    fuente = _fuente('routes/reviews.py')
    cuerpo = fuente[fuente.index('def get_review'):fuente.index('def _revision_independiente')]
    for puerta in ('verify_project_access(', '_puede_ver_la_revision(', 'contexto_de_permisos('):
        assert puerta in cuerpo, puerta
    for efecto in ('UPDATE ', 'INSERT ', 'DELETE ', '.commit(', 'log_activity(',
                   'registrar_actividad(', 'cerrar_los_de(', '_empieza_el_turno('):
        assert efecto not in cuerpo, efecto


def test_las_acciones_preguntan_lo_mismo_que_act():
    fuente = _fuente('routes/reviews.py')
    cuerpo = fuente[fuente.index('def _acciones_para'):fuente.index('def list_reviews')]
    for regla in ('flujo.puede_actuar(', 'flujo.puede_consultar_la_revision(',
                  'flujo.acto_permitido(', 'flujo.cierra_positivamente('):
        assert regla in cuerpo, regla
    # Antes de la sustitucion: lo que va detras de ella no puede leer el contrato.
    assert fuente.index('def _acciones_para') < fuente.index('def reasignar_revisor')
    assert fuente.index('def get_review') < fuente.index('def reasignar_revisor')


# ══ E1.2 · DOCUMENTOS EN OTRA REVISION EN CURSO (H7-A) ═══════════════════════

def en_curso(r, *nodos, **query):
    query.setdefault('model_urn', OBRA)
    partes = ['%s=%s' % kv for kv in query.items()] + ['node_id=%s' % n for n in nodos]
    resp = r['cli'].get('/api/reviews/en-curso?' + '&'.join(partes))
    return resp.status_code, resp.get_json()


def test_el_detalle_nombra_las_otras_revisiones_en_curso_con_el_mismo_documento(ruta):
    ruta['e']['filas'] = [
        fila(5), fila(6),                                    # en curso, mismo documento
        fila(7, status='approved', current_step=1),          # terminada: no se nombra
        fila(8, items=[item(), item('RESERVADO-8.pdf')]),    # no la puede ver: no se nombra
    ]
    s, b = detalle(ruta, 5)
    assert s == 200
    assert b['revision']['items'][0]['tambien_en'] == [
        {'id': 6, 'codigo': 'RV-006', 'title': 'Revisión 6'}]
    # Quien puede ver la reservada la ve nombrada, de la mas reciente a la mas antigua.
    ruta['e']['con_acceso'] = {1}
    _s, b = detalle(ruta, 5)
    assert [x['id'] for x in b['revision']['items'][0]['tambien_en']] == [8, 6]
    assert escrituras(ruta['e']) == [] and ruta['e']['commits'] == 0


def test_una_revision_terminada_no_busca_otras(ruta):
    ruta['e']['filas'] = [fila(5, status='approved', current_step=1), fila(6)]
    como(ruta, 2)
    _s, b = detalle(ruta, 5)
    assert 'tambien_en' not in b['revision']['items'][0]
    assert not any(s.startswith('SELECT ID, TITLE, ITEMS') for s, _ in ruta['e']['sql'])


@pytest.mark.parametrize('estado,ya,todos,retroceden', [
    ('WIP', [], False, []),
    ('SHARED', ['P-01.pdf'], True, []),
    ('PUBLISHED', [], False, [{'name': 'P-01.pdf', 'estado': 'PUBLISHED'}]),
])
def test_el_cierre_dice_que_pasa_con_los_documentos(ruta, estado, ya, todos, retroceden):
    ruta['e']['estado_doc'] = estado
    ruta['e']['filas'] = [fila(5, current_step=1)]
    como(ruta, 2)
    _s, b = detalle(ruta)
    aprobar = b['revision']['acciones']['aprobar']
    # Avisa, no decide: aprobar sigue disponible (impedirlo seria la opcion B).
    assert aprobar['tipo'] == 'aprobar_y_cerrar' and aprobar['disponible'] is True
    assert (aprobar['ya_en_destino'], aprobar['todos_en_destino'],
            aprobar['retroceden']) == (ya, todos, retroceden)
    assert b['revision']['items'][0]['estado_documento'] == estado


def test_un_paso_que_no_cierra_no_habla_del_estado_de_los_documentos(ruta):
    ruta['e']['estado_doc'] = 'SHARED'
    ruta['e']['filas'] = [fila(5)]
    _s, b = detalle(ruta)
    aprobar = b['revision']['acciones']['aprobar']
    assert aprobar['tipo'] == 'conformidad'
    assert (aprobar['ya_en_destino'], aprobar['todos_en_destino'], aprobar['retroceden']) == \
        ([], False, [])


def test_el_alta_pregunta_en_que_revisiones_en_curso_estan_sus_documentos(ruta):
    ruta['e']['filas'] = [fila(5), fila(6, status='rejected'),
                          fila(7, items=[item('RESERVADO.pdf')])]
    s, b = en_curso(ruta, DOC)
    assert s == 200
    assert b['documentos'] == {DOC: [{'id': 5, 'codigo': 'RV-005', 'title': 'Revisión 5'}]}
    assert escrituras(ruta['e']) == [] and ruta['e']['commits'] == 0


@pytest.mark.parametrize('nodos,query', [
    ((DOC,), {'model_urn': ''}),
    ((), {}),
    (('no-es-un-uuid',), {}),
])
def test_el_alta_con_una_pregunta_mal_formada_da_400(ruta, nodos, query):
    s, b = en_curso(ruta, *nodos, **query)
    assert s == 400 and b['success'] is False


def test_sin_acceso_a_la_obra_el_alta_no_sabe_nada(ruta):
    ruta['e']['filas'] = [fila(5)]
    ruta['e']['acceso_obra'] = False
    s, b = en_curso(ruta, DOC)
    assert s == 403 and 'documentos' not in b


def test_la_pregunta_del_alta_tiene_su_puerta_y_no_escribe():
    fuente = _fuente('routes/reviews.py')
    cuerpo = fuente[fuente.index('def revisiones_en_curso_con'):
                    fuente.index('def _revision_independiente')]
    assert 'verify_project_access(' in cuerpo and '_otras_en_curso(' in cuerpo
    ayuda = fuente[fuente.index('def _otras_en_curso'):fuente.index('def _pasos_para_mostrar')]
    assert '_puede_ver_la_revision(' in ayuda
    for efecto in ('UPDATE ', 'INSERT ', 'DELETE ', '.commit(', 'log_activity('):
        assert efecto not in cuerpo and efecto not in ayuda, efecto


# ══ E1.2 · FECHAS CON SU ZONA (H9) ════════════════════════════════════════════

def test_las_fechas_sin_zona_se_leen_con_la_zona_de_la_base():
    fuente = _fuente('routes/reviews.py')
    inicio = fuente.index('_COLUMNAS_DE_REVISION = """')
    bloque = fuente[inicio:fuente.index('"""', inicio + 30)]
    assert "created_at AT TIME ZONE current_setting('TimeZone')" in bloque
    assert "paso_vence_en AT TIME ZONE current_setting('TimeZone')" in bloque
    # `cerrada_en` ya es TIMESTAMP WITH TIME ZONE: convertirla la estropearia.
    assert 'cerrada_en AT TIME ZONE' not in bloque


def test_una_fecha_con_zona_sale_como_instante(ruta):
    import datetime as dt
    creada = dt.datetime(2026, 9, 14, 0, 15, 8, tzinfo=dt.timezone.utc)
    f = list(fila(5))
    f[10], f[13] = creada, creada + dt.timedelta(days=1)
    ruta['e']['filas'] = [tuple(f)]
    _s, b = detalle(ruta)
    assert b['revision']['created_at'] == '2026-09-14T00:15:08+00:00'
    assert b['revision']['paso_vence_en'] == '2026-09-15T00:15:08+00:00'
