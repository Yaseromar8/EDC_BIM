# -*- coding: utf-8 -*-
"""REVIEWS-R01 · el motor, por la RUTA REAL, con dobles en lugar de base.

POR QUE EXISTE ESTE FICHERO APARTE DEL OTRO
-------------------------------------------
`test_r01_contrato_de_revision` prueba el dominio y lee la fuente. Eso no
demuestra que el MANEJADOR haga lo que el dominio dice: entre los dos hay una
ruta, un orden de comprobaciones y unas escrituras.

Aqui se ejercita `POST /api/reviews` y `POST /api/reviews/<id>/act` de verdad
--el blueprint real, montado sobre Flask-- con la base sustituida por un doble
que REGISTRA CADA SENTENCIA. Asi «cero escrituras» se puede afirmar contando, no
suponiendo.

LO QUE ESTO DEMUESTRA Y LA MEDICION CON BASE NO NECESITA REPETIR
----------------------------------------------------------------
  · La autoridad de `/act` sale del `contrato` PERSISTIDO de esa revision, no
    de `CONTRATO_VIGENTE` ni de ningun valor por defecto. Se prueba forzando el
    DESACUERDO en las dos direcciones, asi que no depende de que build sea esta.
  · El motor opera correctamente los DOS contratos, cree el que cree. Es
    obligatorio mientras queden revisiones PRE vivas -- hoy 6 en produccion --
    y ademas la build B (`f003a3b`) es el unico rollback permitido tras la
    fase D.
  · El BACKEND SOLO rechaza un alta AUTORIDAD_TERMINAL sin `decision`, aunque
    el cliente sea antiguo, manipulado o no mande el campo. El cambio del
    frontend es comodidad; la barrera esta aqui.
  · Un `REVISA` terminal llegado fuera de banda no produce NI UNA escritura.
"""
import importlib
import json

import pytest
from flask import Flask

OBRA = 'zz_urn_r01'
DOC = 'nodo-r01'

# Orden EXACTO de las columnas que piden las tres consultas de doc_reviews.
# `contrato` va al final: por eso una columna nueva no desplaza nada.
COLUMNAS = ('id', 'model_urn', 'title', 'items', 'steps', 'current_step', 'status',
            'final_status', 'history', 'created_by', 'created_at',
            'codigo_idoneidad', 'cerrada_en', 'paso_vence_en',
            'plantilla_id', 'plantilla_nombre', 'plantilla_version', 'contrato')


def fila(contrato, pasos, current_step=0, status='pending', history=None,
         items=None, rid=77):
    return (rid, OBRA, 'Revisión de ensayo',
            items if items is not None else [{'node_id': DOC, 'name': 'P-01.pdf'}],
            pasos, current_step, status, 'SHARED', history or [],
            'autor@obra.pe', None, None, None, None, None, None, None, contrato)


def paso(uid, decision=None, correo=None):
    p = {'user_id': uid, 'email': correo or ('u%d@obra.pe' % uid),
         'name': 'Usuario %d' % uid}
    if decision is not None:
        p['decision'] = decision
    return p


class Cursor:
    def __init__(self, estado):
        self.e = estado
        self._u = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self.e['sql'].append((s, params))
        if s.startswith('SELECT ID, MODEL_URN, TITLE, ITEMS'):
            self._u = self.e['fila']
        elif s.startswith('SELECT 1 FROM USERS'):
            self._u = (1,)
        elif s.startswith('SELECT ID FROM USERS'):
            self._u = (params[0] if params else 1,)
        elif s.startswith('SELECT 1 FROM PROJECT_USERS'):
            self._u = (1,)
        elif s.startswith('SELECT NAME, EMAIL FROM USERS'):
            self._u = ('Usuario', 'u@obra.pe')
        elif 'INSERT INTO DOC_REVIEWS' in s:
            self._u = (77,)
        elif 'INSERT INTO ACTIVITY_LOG' in s:
            self._u = (1,)
        else:
            self._u = None

    def fetchone(self):
        return self._u

    def fetchall(self):
        return []


class Conn:
    def __init__(self, estado):
        self.e = estado

    def cursor(self):
        return Cursor(self.e)

    def commit(self):
        self.e['commits'] += 1
        # Se anota EN LA MISMA LISTA que las sentencias. Asi «el testigo va
        # dentro de la transaccion» se demuestra comparando posiciones, en vez
        # de suponerlo por como esta escrito el codigo.
        self.e['sql'].append(('COMMIT', None))

    def rollback(self):
        self.e['rollbacks'] += 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def escrituras(estado):
    """Las sentencias que TOCAN doc_reviews. Es lo que hay que contar para
    poder afirmar «cero mutaciones» en vez de suponerlo."""
    return [s for s, _ in estado['sql']
            if 'INSERT INTO DOC_REVIEWS' in s
            or 'UPDATE DOC_REVIEWS' in s
            or 'DELETE FROM DOC_REVIEWS' in s]


def busca_el_testigo(estado):
    """(posicion, detalles) del registro de alta. None si no se escribio."""
    for i, (s, p) in enumerate(estado['sql']):
        if 'INSERT INTO ACTIVITY_LOG' in s and p and p[1] == 'review_created':
            return i, p[6]          # detalles va 7º en el INSERT
    return None


def posicion_del_commit(estado):
    for i, (s, _) in enumerate(estado['sql']):
        if s == 'COMMIT':
            return i
    return None


@pytest.fixture
def motor(monkeypatch):
    """La ruta real de revisiones, con la base sustituida.

    Se apartan las piezas que NO se estan midiendo --permisos de carpeta,
    idoneidad, encargos, transicion de estados-- porque cada una ya tiene su
    propia suite. Lo que NO se aparta es nada del contrato: ni `_pasos_validos`,
    ni `acto_permitido`, ni `emitido_de`, ni la eleccion de rama.
    """
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.reviews as rv
    importlib.reload(rv)
    import flujo_de_revision as flujo

    estado = {'fila': None, 'sql': [], 'commits': 0, 'rollbacks': 0,
              'actividad': [], 'transiciones': []}

    monkeypatch.setattr(rv, 'get_db_connection', lambda: Conn(estado))
    monkeypatch.setattr(rv, 'log_activity',
                        lambda *a, **k: estado['actividad'].append((a, k)))
    monkeypatch.setattr(rv, 'guardia_de_obra', lambda *a, **k: None)
    monkeypatch.setattr(rv, 'resolve_project_id', lambda urn: OBRA)
    monkeypatch.setattr(rv, '_puede_con_estos_documentos', lambda *a, **k: None)
    # El turno se aparta: abre encargos, que son el reflejo del proceso y no su
    # motor. Devuelve el historial TAL CUAL para que las aserciones sobre
    # `emitido` midan el acto y no el arranque del turno siguiente.
    monkeypatch.setattr(rv, '_empieza_el_turno',
                        lambda cur, rid, steps, i, actor, titulo, history: (None, history))
    import idoneidad
    monkeypatch.setattr(idoneidad, 'validar_para', lambda *a, **k: (True, ''))
    import routes.documents as rd
    monkeypatch.setattr(rd, 'verify_project_access', lambda usuario, urn: True)
    import folder_permissions as fp
    monkeypatch.setattr(fp, 'check_folder_permission', lambda *a, **k: None)
    import estados_ecd as ecd
    monkeypatch.setattr(ecd, 'transicionar_recorriendo',
                        lambda *a, **k: estado['transiciones'].append(a) or [])

    import auth_middleware as am
    usuario = {'id': 9, 'name': 'Autor', 'email': 'autor@obra.pe', 'role': 'editor'}
    estado['usuario'] = usuario
    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])

    app = Flask(__name__)
    am.init_auth_middleware(app)
    app.register_blueprint(rv.reviews_bp)
    cli = app.test_client()
    cli.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return {'cli': cli, 'estado': estado, 'flujo': flujo, 'rv': rv}


def crear(m, pasos, **extra):
    cuerpo = {'model_urn': OBRA, 'title': 'Revisión', 'final_status': 'SHARED',
              'items': [{'node_id': DOC, 'name': 'P-01.pdf'}], 'steps': pasos}
    cuerpo.update(extra)
    return m['cli'].post('/api/reviews', json=cuerpo)


def actuar(m, contrato, pasos, accion, current_step=0, **kw):
    m['estado']['fila'] = fila(contrato, pasos, current_step=current_step, **kw)
    m['estado']['usuario'] = {'id': pasos[current_step]['user_id'], 'name': 'R',
                              'email': pasos[current_step]['email'], 'role': 'editor'}
    del m['estado']['sql'][:]
    m['estado']['commits'] = 0
    return m['cli'].post('/api/reviews/77/act', json={'action': accion,
                                                      'comment': 'c'})


# ══ 1 · LA AUTORIDAD DE /act SALE DEL CONTRATO PERSISTIDO ══════════════════

@pytest.mark.parametrize('persistido,vigente', [
    ('AUTORIDAD_TERMINAL', 'PRE'),
    ('PRE', 'AUTORIDAD_TERMINAL'),
])
def test_act_usa_el_contrato_PERSISTIDO_y_no_el_vigente(motor, monkeypatch,
                                                        persistido, vigente):
    """La constante se pone SIEMPRE al contrario del contrato persistido.

    Antes esta prueba se apoyaba en que la build era la B --`CONTRATO_VIGENTE`
    valia PRE-- y por tanto dejaba de discriminar en cuanto la fase D girara la
    constante. Ahora fuerza el desacuerdo en LAS DOS DIRECCIONES, asi que
    discrimina venga de la build que venga y sobreviva a cualquier giro futuro.

    Mismo par de pasos, mismo indice, mismo acto: lo unico que cambia es el
    contrato PERSISTIDO. Si la autoridad saliera de la constante, los dos casos
    darian el mismo resultado.
    """
    flujo = motor['flujo']
    monkeypatch.setattr(flujo, 'CONTRATO_VIGENTE', vigente)
    pasos = [paso(1, 'APRUEBA'), paso(2, 'REVISA')]
    r = actuar(motor, persistido, pasos, 'approve', current_step=1)

    if persistido == flujo.AUTORIDAD_TERMINAL:
        # Ultimo paso REVISA: no puede cerrar. Rechazo, cero escrituras.
        d = r.get_json()
        assert r.status_code == 409, d
        assert d['code'] == 'CONTRATO_NO_PERMITE_EL_ACTO'
        assert escrituras(motor['estado']) == []
    else:
        # PRE cierra por POSICION, sin mirar `decision`.
        assert r.status_code == 200, r.get_json()
        assert any("STATUS='APPROVED'" in s for s in escrituras(motor['estado']))


def test_una_review_PRE_persistida_cierra_por_POSICION(motor):
    """El mismo par de pasos, el mismo indice, el mismo acto: solo cambia el
    contrato persistido. Bajo PRE el ultimo paso cierra aunque diga REVISA."""
    flujo = motor['flujo']
    pasos = [paso(1, 'APRUEBA'), paso(2, 'REVISA')]
    r = actuar(motor, flujo.PRE, pasos, 'approve', current_step=1)
    assert r.status_code == 200, r.get_json()
    escritas = escrituras(motor['estado'])
    assert any("STATUS='APPROVED'" in s for s in escritas), escritas


@pytest.mark.parametrize('contrato', [None, '', 'pre', 'INVENTADO'])
def test_un_contrato_persistido_desconocido_se_rechaza_sin_escribir(motor, contrato):
    """Nunca «si falta o no lo entiendo, uso PRE»."""
    r = actuar(motor, contrato, [paso(1, 'APRUEBA')], 'approve')
    d = r.get_json()
    assert r.status_code == 409, d
    assert 'no entiende' in d['error']
    assert escrituras(motor['estado']) == []
    assert motor['estado']['commits'] == 0


def test_el_dominio_revienta_si_alguien_se_salta_la_puerta(motor):
    """La puerta de `/act` es la que protege. Pero si un llamador futuro se la
    salta, el dominio no debe degradar a PRE: revienta."""
    flujo = motor['flujo']
    for contrato in (None, 'INVENTADO'):
        with pytest.raises(flujo.ContratoDesconocido):
            flujo.cierra_positivamente(contrato, [paso(1, 'APRUEBA')], 0)
        with pytest.raises(flujo.ContratoDesconocido):
            flujo.emitido_de(contrato, paso(1, 'APRUEBA'), 'approve')


# ══ 2 · LA BUILD B OPERA LOS DOS CONTRATOS ═════════════════════════════════

def test_el_alta_persiste_EL_CONTRATO_VIGENTE(motor):
    """Sea cual sea. Antes exigia literalmente 'PRE' y por tanto se rompia con
    la fase D; ahora compara contra la constante, asi que vale en las dos
    builds y sigue detectando que el alta persista otra cosa.

    Los pasos llevan `decision` porque bajo AUTORIDAD_TERMINAL es obligatorio y
    bajo PRE es inerte: el mismo alta vale para los dos contratos.
    """
    flujo = motor['flujo']
    vigente = flujo.CONTRATO_VIGENTE
    r = crear(motor, [paso(1, 'REVISA'), paso(2, 'APRUEBA')])
    d = r.get_json()
    assert r.status_code == 200 and d['success'], d
    assert d['contrato'] == vigente
    # I10 · columna y testigo dicen lo mismo, porque salen de la misma variable.
    inserta = [(s, p) for s, p in motor['estado']['sql']
               if 'INSERT INTO DOC_REVIEWS' in s]
    assert len(inserta) == 1
    assert inserta[0][1][-1] == vigente, 'el ultimo parametro del INSERT'
    t = busca_el_testigo(motor["estado"])
    assert t, 'no se escribio el registro de alta'
    assert json.loads(t[1]) == {'contrato': vigente}
    # G1 · Y va DENTRO de la transaccion: antes del commit, con el mismo cursor.
    assert t[0] < posicion_del_commit(motor['estado']), (
        'el testigo se escribio DESPUES del commit: no es atomico')


def test_build_B_opera_una_review_PRE_de_dos_pasos(motor):
    """PRE: avanza por posicion y no adquiere `emitido`. I23."""
    flujo = motor['flujo']
    pasos = [paso(1), paso(2)]                      # sin `decision`, como siempre
    r = actuar(motor, flujo.PRE, pasos, 'approve', current_step=0)
    assert r.status_code == 200, r.get_json()
    escritas = [(s, p) for s, p in motor['estado']['sql'] if 'UPDATE DOC_REVIEWS' in s]
    assert any('CURRENT_STEP=%S' in s for s, _ in escritas), escritas
    hist = json.loads([p for s, p in escritas if 'CURRENT_STEP=%S' in s][0][1])
    assert all('emitido' not in h for h in hist), hist


def test_build_B_opera_una_review_AUTORIDAD_TERMINAL_completa(motor):
    """I17 + I19 sobre la BUILD B, que es el requisito del punto 2: despues de
    la fase D esta build es el rollback permitido, asi que tiene que saber
    terminar los expedientes del contrato nuevo."""
    flujo = motor['flujo']
    pasos = [paso(1, 'REVISA'), paso(2, 'APRUEBA')]

    # I17 · REVISA intermedio -> CONFORME y avanza, sin cerrar.
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, pasos, 'approve', current_step=0)
    assert r.status_code == 200, r.get_json()
    upd = [(s, p) for s, p in motor['estado']['sql'] if 'UPDATE DOC_REVIEWS' in s]
    assert any('CURRENT_STEP=%S' in s for s, _ in upd), upd
    assert not any("STATUS='APPROVED'" in s for s, _ in upd), 'no debe cerrar'
    hist = json.loads([p for s, p in upd if 'CURRENT_STEP=%S' in s][0][1])
    assert [h.get('emitido') for h in hist if h['event'] == 'approve'] == ['CONFORME']

    # I19 · APRUEBA terminal -> cierra, con efecto documental.
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, pasos, 'approve', current_step=1)
    assert r.status_code == 200, r.get_json()
    upd = [(s, p) for s, p in motor['estado']['sql'] if 'UPDATE DOC_REVIEWS' in s]
    cierre = [(s, p) for s, p in upd if "STATUS='APPROVED'" in s]
    assert cierre, upd
    assert 'CERRADA_EN=CURRENT_TIMESTAMP' in cierre[0][0]
    hist = json.loads(cierre[0][1][0])
    assert [h.get('emitido') for h in hist if h['event'] == 'approve'] == ['APRUEBA']
    assert motor['estado']['transiciones'], 'no hubo efecto documental'


def test_build_B_APRUEBA_intermedio_avanza_sin_cerrar(motor):
    """I18."""
    flujo = motor['flujo']
    pasos = [paso(1, 'APRUEBA'), paso(2, 'APRUEBA')]
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, pasos, 'approve', current_step=0)
    assert r.status_code == 200, r.get_json()
    upd = [(s, p) for s, p in motor['estado']['sql'] if 'UPDATE DOC_REVIEWS' in s]
    assert not any("STATUS='APPROVED'" in s for s, _ in upd), (
        'un APRUEBA intermedio cerro la revision anticipadamente')
    hist = json.loads([p for s, p in upd if 'CURRENT_STEP=%S' in s][0][1])
    assert [h.get('emitido') for h in hist if h['event'] == 'approve'] == ['APRUEBA']


@pytest.mark.parametrize('contrato,esperado', [('PRE', None), ('AUTORIDAD_TERMINAL', 'RECHAZA')])
def test_reject_es_terminal_en_los_dos_contratos(motor, contrato, esperado):
    """I21. Y `emitido` solo aparece bajo el contrato nuevo."""
    pasos = [paso(1, 'REVISA'), paso(2, 'APRUEBA')]
    r = actuar(motor, contrato, pasos, 'reject', current_step=0)
    assert r.status_code == 200, r.get_json()
    upd = [(s, p) for s, p in motor['estado']['sql'] if 'UPDATE DOC_REVIEWS' in s]
    rech = [(s, p) for s, p in upd if "STATUS='REJECTED'" in s]
    assert rech, upd
    hist = json.loads(rech[0][1][0])
    emit = [h.get('emitido') for h in hist if h['event'] == 'reject']
    assert emit == [esperado]


# ══ 3 · EL BACKEND SOLO CIERRA EL BYPASS DEL CAMINO MANUAL ═════════════════

def test_el_backend_rechaza_un_alta_sin_decision_aunque_el_cliente_no_lo_mande(motor,
                                                                              monkeypatch):
    """PUNTO 4 DE LA AUDITORIA. Se simula un cliente ANTIGUO: manda exactamente
    lo que mandaba antes de R01, sin `decision`. Y la build D lo rechaza sin
    escribir nada."""
    flujo = motor['flujo']
    monkeypatch.setattr(flujo, 'CONTRATO_VIGENTE', flujo.AUTORIDAD_TERMINAL)
    r = crear(motor, [paso(1), paso(2)])            # cliente antiguo: sin decision
    d = r.get_json()
    assert r.status_code == 400, d
    assert d['code'] == 'PASO_SIN_DECISION'
    assert '1, 2' in d['error'], 'tiene que decir QUE pasos'
    assert escrituras(motor['estado']) == []
    assert motor['estado']['commits'] == 0


def test_el_backend_rechaza_un_alta_con_decision_manipulada(motor, monkeypatch):
    """Cliente MANIPULADO: manda un valor que no esta en la lista cerrada."""
    flujo = motor['flujo']
    monkeypatch.setattr(flujo, 'CONTRATO_VIGENTE', flujo.AUTORIDAD_TERMINAL)
    r = crear(motor, [paso(1, 'APRUEBA'), paso(2, 'FIRMA_TOTAL')])
    d = r.get_json()
    assert r.status_code == 400 and d['code'] == 'PASO_SIN_DECISION', d
    assert escrituras(motor['estado']) == []


def test_el_backend_rechaza_un_flujo_que_no_puede_cerrarse(motor, monkeypatch):
    """I15 en el alta: terminal REVISA no entra, venga de donde venga."""
    flujo = motor['flujo']
    monkeypatch.setattr(flujo, 'CONTRATO_VIGENTE', flujo.AUTORIDAD_TERMINAL)
    r = crear(motor, [paso(1, 'APRUEBA'), paso(2, 'REVISA')])
    d = r.get_json()
    assert r.status_code == 400 and d['code'] == 'FLUJO_SIN_CIERRE', d
    assert escrituras(motor['estado']) == []


def test_el_alta_valida_bajo_el_contrato_nuevo_pasa_y_persiste_el_contrato(motor,
                                                                           monkeypatch):
    """I11 + I12."""
    flujo = motor['flujo']
    monkeypatch.setattr(flujo, 'CONTRATO_VIGENTE', flujo.AUTORIDAD_TERMINAL)
    r = crear(motor, [paso(1, 'REVISA'), paso(2, 'APRUEBA')])
    d = r.get_json()
    assert r.status_code == 200 and d['success'], d
    assert d['contrato'] == 'AUTORIDAD_TERMINAL'
    inserta = [p for s, p in motor['estado']['sql'] if 'INSERT INTO DOC_REVIEWS' in s]
    assert inserta[0][-1] == 'AUTORIDAD_TERMINAL'
    t = busca_el_testigo(motor["estado"])
    assert t and json.loads(t[1]) == {'contrato': 'AUTORIDAD_TERMINAL'}, (
        'columna y testigo tienen que decir lo mismo')
    assert t[0] < posicion_del_commit(motor['estado'])


def test_el_contrato_que_manda_el_cliente_se_ignora(motor):
    """El motor con el que se cierra un expediente no lo elige quien lo abre.

    El cliente manda SIEMPRE el contrario del vigente, asi que la prueba
    discrimina en cualquier build. Antes mandaba 'AUTORIDAD_TERMINAL' literal y
    dejaba de discriminar en cuanto ese pasara a ser el vigente.
    """
    flujo = motor['flujo']
    vigente = flujo.CONTRATO_VIGENTE
    el_otro = (flujo.PRE if vigente == flujo.AUTORIDAD_TERMINAL
               else flujo.AUTORIDAD_TERMINAL)
    r = crear(motor, [paso(1, 'REVISA'), paso(2, 'APRUEBA')], contrato=el_otro)
    d = r.get_json()
    assert r.status_code == 200 and d['contrato'] == vigente, d
    inserta = [p for s, p in motor['estado']['sql'] if 'INSERT INTO DOC_REVIEWS' in s]
    assert inserta[0][-1] == vigente


# ══ 4 · EL CASO FUERA DE BANDA · CERO MUTACIONES ═══════════════════════════

def test_REVISA_terminal_fuera_de_banda_no_produce_NI_UNA_escritura(motor):
    """§15.1, contando. Una revision AUTORIDAD_TERMINAL cuyo ultimo paso solo
    revisa no puede crearse: si existe, entro fuera de banda."""
    flujo = motor['flujo']
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, [paso(1, 'REVISA')], 'approve')
    d = r.get_json()
    assert r.status_code == 409 and d['code'] == 'CONTRATO_NO_PERMITE_EL_ACTO', d
    assert escrituras(motor['estado']) == [], motor['estado']['sql']
    assert motor['estado']['commits'] == 0, 'hubo commit'
    # Ni encargos: la puerta va ANTES de cerrar el del paso.
    assert not any('ENCARGO' in s for s, _ in motor['estado']['sql'])
    # Y NO se convierte a rejected: nadie ejecuto reject.
    assert not any('REJECTED' in s for s, _ in motor['estado']['sql'])


def test_pero_rechazarla_si_se_puede(motor):
    """La salida existe: `reject` es terminal en cualquier paso."""
    flujo = motor['flujo']
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, [paso(1, 'REVISA')], 'reject')
    assert r.status_code == 200, r.get_json()
    assert any("STATUS='REJECTED'" in s for s in escrituras(motor['estado']))


def test_un_paso_sin_decision_fuera_de_banda_congela_el_acto(motor):
    """Consecuencia derivada declarada: approve Y reject se rechazan."""
    flujo = motor['flujo']
    for accion in ('approve', 'reject'):
        r = actuar(motor, flujo.AUTORIDAD_TERMINAL, [paso(1)], accion)
        assert r.status_code == 409, r.get_json()
        assert escrituras(motor['estado']) == []


# ══ 4b · EL TESTIGO DEL ALTA ES ATOMICO (G1) ═══════════════════════════════

def test_el_testigo_va_en_la_MISMA_transaccion_que_el_INSERT(motor):
    """La garantia congelada: «toda revisión nueva produce un registro de alta
    cuyo contrato coincide exactamente con doc_reviews.contrato».

    Se demuestra por POSICION en la secuencia de sentencias del mismo cursor:
    la revision, el testigo, y solo entonces el commit.
    """
    r = crear(motor, [paso(1, 'REVISA'), paso(2, 'APRUEBA')])
    assert r.status_code == 200, r.get_json()
    sql = [s for s, _ in motor['estado']['sql']]
    i_rev = next(i for i, s in enumerate(sql) if 'INSERT INTO DOC_REVIEWS' in s)
    i_tes = busca_el_testigo(motor["estado"])[0]
    i_com = posicion_del_commit(motor['estado'])
    assert i_rev < i_tes < i_com, (
        'orden esperado revision -> testigo -> commit; obtenido %s' % [i_rev, i_tes, i_com])
    assert motor['estado']['commits'] == 1


def test_si_el_TESTIGO_no_se_puede_escribir_la_REVIEW_NO_NACE(motor, monkeypatch):
    """FALLO PROVOCADO. Antes, `log_activity` tragaba el fallo despues del
    commit y quedaba una revision sin testigo, en silencio. Ahora el fallo del
    testigo deshace el alta entera."""
    def revienta(*a, **k):
        raise RuntimeError('activity_log no disponible')
    monkeypatch.setattr(motor['rv'], 'registrar_actividad', revienta)

    r = crear(motor, [paso(1, 'REVISA'), paso(2, 'APRUEBA')])
    assert r.status_code == 500, r.get_json()
    assert posicion_del_commit(motor['estado']) is None, (
        'hubo commit: la revision habria quedado sin testigo')
    assert motor['estado']['commits'] == 0


def test_el_alta_NO_usa_log_activity_para_el_testigo(motor):
    """`log_activity` abre otra conexion, confirma sola y traga los fallos. Si
    el testigo saliera por ahi, la garantia no seria atomica aunque las pruebas
    de arriba pasaran por casualidad."""
    import io
    import os
    fuente = io.open(os.path.join(os.path.dirname(__file__), '..',
                                  'routes', 'reviews.py'), encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def create_review'):fuente.index('def act_on_review')]
    assert 'registrar_actividad(cur,' in cuerpo
    assert 'log_activity(' not in cuerpo, (
        'create_review sigue usando log_activity: el testigo no es atomico')


def test_las_transiciones_NO_llevan_emitido_al_registro_de_actividad(motor):
    """G3. El testigo se congelo para EL ALTA. `emitido` vive en `history`, que
    es donde el contrato lo puso; ampliar activity_log seria ampliar su
    proposito dentro de R01."""
    flujo = motor['flujo']
    pasos = [paso(1, 'REVISA'), paso(2, 'APRUEBA')]
    actuar(motor, flujo.AUTORIDAD_TERMINAL, pasos, 'approve', current_step=0)
    detalles = [k.get('details') for a, k in motor['estado']['actividad']
                if str(a[1]).startswith('review_')]
    assert detalles, 'no se registro la transicion'
    for det in detalles:
        assert 'emitido' not in (det or {}), det


# ══ 4c · PASO CORRUPTO · DECISION CONGELADA (G2) ═══════════════════════════

CORRUPTOS = [
    {'user_id': 1, 'email': 'u1@obra.pe', 'name': 'U'},                    # sin clave
    {'user_id': 1, 'email': 'u1@obra.pe', 'name': 'U', 'decision': ''},    # vacia
    {'user_id': 1, 'email': 'u1@obra.pe', 'name': 'U', 'decision': None},
    {'user_id': 1, 'email': 'u1@obra.pe', 'name': 'U', 'decision': 'FIRMA'},
    {'user_id': 1, 'email': 'u1@obra.pe', 'name': 'U', 'decision': 'revisa '},
]


@pytest.mark.parametrize('malo', CORRUPTOS)
@pytest.mark.parametrize('accion', ['approve', 'reject'])
def test_un_paso_CORRUPTO_congela_los_DOS_actos(motor, malo, accion):
    """DECISION CONGELADA: en una revision AUTORIDAD_TERMINAL, si el paso actual
    carece de una `decision` valida, tanto `approve` como `reject` son rechazo
    tecnico con cero mutaciones. Un paso corrupto NO se interpreta.

    `'revisa '` con espacio y minusculas SI es valido --se normaliza-- y por eso
    esta en la lista: distinguir «mal escrito» de «no declarado» es justo lo que
    hay que probar, no suponer.
    """
    flujo = motor['flujo']
    valido = (malo.get('decision') or '').strip().upper() in ('REVISA', 'APRUEBA')
    r = actuar(motor, flujo.AUTORIDAD_TERMINAL, [malo, paso(2, 'APRUEBA')],
               accion, current_step=0)
    if valido:
        assert r.status_code == 200, r.get_json()
        return
    assert r.status_code == 409, r.get_json()
    assert r.get_json()['code'] == 'CONTRATO_NO_PERMITE_EL_ACTO'
    assert escrituras(motor['estado']) == []
    assert motor['estado']['commits'] == 0
    assert not any('REJECTED' in s for s, _ in motor['estado']['sql']), (
        'un paso corrupto no se convierte a rejected')


@pytest.mark.parametrize('malo', CORRUPTOS)
@pytest.mark.parametrize('accion', ['approve', 'reject'])
def test_un_paso_corrupto_bajo_PRE_NO_CAMBIA_NADA(motor, malo, accion):
    """La decision de G2 no afecta a PRE. Una revision PRE nunca miro
    `decision`, y seguir su semantica historica significa que un paso sin ella
    --que es lo NORMAL en PRE-- se resuelve igual que siempre."""
    flujo = motor['flujo']
    r = actuar(motor, flujo.PRE, [malo, paso(2)], accion, current_step=0)
    assert r.status_code == 200, r.get_json()
    assert escrituras(motor['estado']), 'PRE dejo de escribir'


def test_reject_sigue_siendo_terminal_en_pasos_VALIDOS(motor):
    """La regla «reject es terminal» no se toca: aplica a REVISA y a APRUEBA."""
    flujo = motor['flujo']
    for decision in ('REVISA', 'APRUEBA'):
        pasos = [paso(1, decision), paso(2, 'APRUEBA')]
        r = actuar(motor, flujo.AUTORIDAD_TERMINAL, pasos, 'reject', current_step=0)
        assert r.status_code == 200, r.get_json()
        assert any("STATUS='REJECTED'" in s for s in escrituras(motor['estado']))


# ══ 5 · /reasignar PRESERVA `decision` ═════════════════════════════════════

def test_reasignar_preserva_decision_y_todo_lo_que_no_entiende():
    """El contrato lo declara agnostico. Aqui se cuenta campo por campo."""
    import flujo_de_revision as flujo
    pasos = [{'user_id': 1, 'email': 'a@o.pe', 'name': 'A', 'decision': 'REVISA',
              'etiqueta': 'Supervisión', 'dias': 3, 'de_funcion': 'SUPERVISION'},
             {'user_id': 2, 'decision': 'APRUEBA'}]
    nuevos, entrada = flujo.sustituir_revisor(
        pasos, 0, {'id': 5, 'email': 'n@o.pe', 'name': 'N'}, 'admin', 'se fue')
    assert nuevos[0]['decision'] == 'REVISA', 'perdio la decision'
    assert nuevos[0]['etiqueta'] == 'Supervisión' and nuevos[0]['dias'] == 3
    assert nuevos[0]['de_funcion'] == 'SUPERVISION'
    assert nuevos[0]['user_id'] == 5 and nuevos[0]['reasignado_de']['user_id'] == 1
    assert nuevos[1] == pasos[1], 'toco un paso que no era el suyo'
    assert entrada['event'] == 'step_reassigned'
    # Y el original no se muto: `sustituir_revisor` hace copia.
    assert pasos[0]['user_id'] == 1


def test_reasignar_no_consulta_el_contrato():
    """Si lo consultara, dejaria de ser agnostico y el rollback a build B no
    podria reasignar expedientes del contrato nuevo."""
    import io
    import os
    fuente = io.open(os.path.join(os.path.dirname(__file__), '..',
                                  'routes', 'reviews.py'), encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def reasignar_revisor'):]
    assert 'acto_permitido' not in cuerpo
    assert 'cierra_positivamente' not in cuerpo
    assert "rev['contrato']" not in cuerpo
