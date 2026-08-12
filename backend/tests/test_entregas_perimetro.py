"""Transmittals y Conjuntos: la obra manda, y una emisión avisa de verdad.

LOS FALLOS QUE ESTOS TESTS FIJAN
--------------------------------
1) NADIE SE ENTERABA DE UNA EMISIÓN. `create_transmittal` no llamaba al correo
   en ninguna de sus líneas, aunque `mailer` funciona y lo usa el login. El
   registro decía "emitido a Fulano" y a Fulano no le llegaba nada. Para una
   pieza cuyo único trabajo es demostrar «yo te entregué esto», eso es peor que
   no tener el módulo: tu equipo cree que entregó.

2) EL AUTOR LO PONÍA EL CLIENTE. `u.get('name') or d.get('user')`: bastaba con
   que la sesión no trajera nombre para firmar una evidencia contractual con el
   nombre de otro.

3) LOS CONJUNTOS NO SABÍAN DE QUÉ OBRA ERAN. Cuatro de los seis endpoints sólo
   reciben `set_id`, un entero secuencial. Sin obra que comprobar, el guardia de
   autorización caía en su rama de "hueco" y dejaba pasar — incluso con
   ENFORCE_PROJECT_AUTHZ activado. Se podían recorrer los números y leerse los
   conjuntos de otras obras.

Hoy nada de esto muerde porque los cinco usuarios son administradores de la
única obra. Muerde el día que se invite a alguien.
"""
import importlib
import json

import pytest
from flask import Flask, g


OBRA = 'urn:obra:PQT8'
AJENA = 'urn:obra:OTRA'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')

    import routes.transmittals as rt
    import routes.sets as rs
    importlib.reload(rt)
    importlib.reload(rs)

    escrito = {'insert': None, 'notificado': None, 'items_puestos': [], 'borrados': []}
    correos = []
    obras_permitidas = {OBRA}
    conjuntos = {7: OBRA, 9: AJENA}          # id del conjunto -> obra a la que pertenece

    class Cursor:
        def __init__(self):
            self._u = None

        def execute(self, sql, params=None):
            s = ' '.join(sql.split())
            su = s.upper()
            if 'COALESCE(MAX(NUMBER), 0) + 1' in su:
                self._u = (4,)
            elif su.startswith('INSERT INTO TRANSMITTALS'):
                escrito['insert'] = params
                self._u = (55,)
            elif su.startswith('UPDATE TRANSMITTALS SET NOTIFICADO'):
                escrito['notificado'] = json.loads(params[0])
                self._u = None
            elif su.startswith('SELECT ID, NUMBER, SUBJECT'):
                self._u = None
            elif su.startswith('SELECT MODEL_URN FROM DOC_SETS'):
                obra = conjuntos.get(params[0])
                self._u = (obra,) if obra else None
            elif su.startswith('INSERT INTO DOC_SET_ITEMS'):
                escrito['items_puestos'].append(params)
                self._u = None
            elif su.startswith('DELETE FROM DOC_SET_ITEMS'):
                escrito['borrados'].append(params)
                self._u = None
            else:
                self._u = None

        def fetchone(self):
            return self._u

        def fetchall(self):
            return []

    class Conn:
        def cursor(self):
            return Cursor()

        def commit(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(rt, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(rs, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(rt, 'log_activity', lambda *a, **k: None)
    monkeypatch.setattr(rs, 'log_activity', lambda *a, **k: None)

    import routes.documents as rd
    monkeypatch.setattr(rd, 'verify_project_access',
                        lambda usuario, urn: urn in obras_permitidas)

    import mailer
    def _enviar(destino, asunto, titulo, cuerpo, enlace=None, texto_boton='Abrir'):
        correos.append({'destino': destino, 'asunto': asunto, 'cuerpo': cuerpo})
        return True, 'ok'
    monkeypatch.setattr(mailer, 'enviar', _enviar)

    app = Flask(__name__)
    app.register_blueprint(rt.transmittals_bp)
    app.register_blueprint(rs.sets_bp)

    @app.before_request
    def _sesion():
        from flask import request
        quien = request.headers.get('X-Quien')
        if quien == 'anonimo':
            return
        g.current_user = {'id': 2, 'role': request.headers.get('X-Rol', 'admin'),
                          'email': 'ana@obra.pe',
                          'name': None if quien == 'sin-nombre' else 'Ana Torres'}

    return app.test_client(), escrito, correos, mailer


def _emitir(cli, urn=OBRA, **extra):
    cuerpo = {'model_urn': urn, 'subject': 'Entrega 3 · drenaje',
              'message': 'Para su revisión',
              'items': [{'node_id': 'n1', 'name': 'PQT8-DRE-PLA-001.pdf', 'version': 2}],
              'recipients': [{'email': 'supervision@cliente.pe', 'name': 'Supervisión'}]}
    cuerpo.update(extra)
    return cli.post('/api/transmittals', json=cuerpo)


# ── Transmittals: que el destinatario se entere ─────────────────────────────

def test_emitir_manda_el_correo(entorno):
    """Era el fallo entero: se emitia y no salia nada."""
    cli, _e, correos, _m = entorno
    r = _emitir(cli)
    assert r.status_code == 200
    assert len(correos) == 1
    assert correos[0]['destino'] == 'supervision@cliente.pe'


def test_el_correo_lleva_el_numero_y_los_documentos(entorno):
    cli, _e, correos, _m = entorno
    _emitir(cli)
    assert 'TR-004' in correos[0]['asunto']
    assert 'PQT8-DRE-PLA-001.pdf' in correos[0]['cuerpo']


def test_queda_escrito_a_quien_se_aviso_de_verdad(entorno):
    """La lista de destinatarios es una intencion; esto es lo que ocurrio."""
    cli, escrito, _c, _m = entorno
    r = _emitir(cli)
    assert escrito['notificado'] == [{'destino': 'supervision@cliente.pe',
                                      'enviado': True, 'detalle': 'ok'}]
    assert r.get_json()['avisados'] == 1


def test_si_el_correo_falla_la_emision_NO_se_pierde(entorno):
    """Perder una emision porque el proveedor de correo tuvo un mal dia seria
    peor que el fallo original."""
    cli, escrito, _c, mailer = entorno
    mailer.enviar = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('resend caido'))
    r = _emitir(cli)
    assert r.status_code == 200
    assert r.get_json()['avisados'] == 0
    assert escrito['notificado'][0]['enviado'] is False


def test_un_destinatario_sin_correo_se_marca_como_no_avisado(entorno):
    cli, escrito, correos, _m = entorno
    _emitir(cli, recipients=[{'name': 'Juan', 'email': ''}])
    assert correos == []
    assert escrito['notificado'][0]['detalle'] == 'no tiene correo'


def test_la_respuesta_dice_cuantos_de_cuantos(entorno):
    """Para que la pantalla no de por hecha una entrega que no ocurrio."""
    cli, _e, _c, _m = entorno
    d = _emitir(cli, recipients=[{'email': 'a@b.pe'}, {'email': 'roto'}]).get_json()
    assert (d['avisados'], d['destinatarios']) == (1, 2)


# ── Transmittals: el autor y la obra ────────────────────────────────────────

def test_el_autor_sale_de_la_sesion_y_no_del_cuerpo(entorno):
    cli, escrito, _c, _m = entorno
    _emitir(cli, user='Pedro el Impostor')
    assert escrito['insert'][-1] == 'Ana Torres'


def test_sin_nombre_en_sesion_se_firma_con_el_correo_no_con_lo_que_mande_el_cliente(entorno):
    cli, escrito, _c, _m = entorno
    r = cli.post('/api/transmittals', headers={'X-Quien': 'sin-nombre'},
                 json={'model_urn': OBRA, 'subject': 'x', 'items': [{'node_id': 'n1'}],
                       'recipients': [{'email': 'a@b.pe'}], 'user': 'Pedro el Impostor'})
    assert r.status_code == 200
    assert escrito['insert'][-1] == 'ana@obra.pe'


def test_no_se_emite_en_una_obra_ajena(entorno):
    cli, escrito, correos, _m = entorno
    assert _emitir(cli, urn=AJENA).status_code == 403
    assert escrito['insert'] is None
    assert correos == []


def test_no_se_leen_los_transmittals_de_una_obra_ajena(entorno):
    """Dicen que se entrego, a quien y cuando: se leian cambiando el ?model_urn."""
    cli, _e, _c, _m = entorno
    assert cli.get('/api/transmittals?model_urn=' + AJENA).status_code == 403
    assert cli.get('/api/transmittals?model_urn=' + OBRA).status_code == 200


# ── Conjuntos: la obra se resuelve por el conjunto ──────────────────────────

def test_no_se_leen_los_documentos_de_un_conjunto_ajeno(entorno):
    cli, _e, _c, _m = entorno
    assert cli.get('/api/sets/9/items').status_code == 403
    assert cli.get('/api/sets/7/items').status_code == 200


def test_no_se_meten_documentos_en_un_conjunto_ajeno(entorno):
    cli, escrito, _c, _m = entorno
    r = cli.post('/api/sets/9/items', json={'items': [{'node_id': 'n1', 'version': 1}]})
    assert r.status_code == 403
    assert escrito['items_puestos'] == []


def test_no_se_sacan_documentos_de_un_conjunto_ajeno(entorno):
    cli, escrito, _c, _m = entorno
    assert cli.delete('/api/sets/9/items/n1').status_code == 403
    assert escrito['borrados'] == []


def test_no_se_borra_un_conjunto_ajeno_aunque_seas_admin(entorno):
    cli, _e, _c, _m = entorno
    assert cli.delete('/api/sets/9').status_code == 403


def test_un_conjunto_que_no_existe_da_404_y_no_403(entorno):
    """Distinguirlo importa: 403 sobre un id inexistente delata cuales existen."""
    cli, _e, _c, _m = entorno
    assert cli.get('/api/sets/999/items').status_code == 404


def test_en_la_obra_propia_todo_sigue_funcionando(entorno):
    cli, escrito, _c, _m = entorno
    assert cli.post('/api/sets/7/items',
                    json={'items': [{'node_id': 'n1', 'name': 'a.pdf', 'version': 3}]}
                    ).status_code == 200
    assert escrito['items_puestos'][0][1] == 'n1'
    assert cli.delete('/api/sets/7/items/n1').status_code == 200


def test_no_se_listan_los_conjuntos_de_una_obra_ajena(entorno):
    cli, _e, _c, _m = entorno
    assert cli.get('/api/sets?model_urn=' + AJENA).status_code == 403


def test_no_se_crea_un_conjunto_en_una_obra_ajena(entorno):
    cli, _e, _c, _m = entorno
    assert cli.post('/api/sets', json={'model_urn': AJENA, 'name': 'Entrega'}).status_code == 403
