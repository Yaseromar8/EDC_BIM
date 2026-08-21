# -*- coding: utf-8 -*-
"""El control central de obra tiene que bloquear de verdad.

QUE PASO
--------
BASELINE 0 · C8. El middleware estaba bien construido, pero se apoyaba en
`resolve_project_id`, y ese resolutor solo entendia tres cosas: el id de la obra,
el scope '<id>_<frente>' y el nombre de la obra. NO entendia el `model_urn`, que
es como se direcciona casi todo el sistema.

Consecuencia medida el 13-ago-2026 con sesiones reales sobre la base local: un
usuario que solo pertenecia a la obra A leia y ESCRIBIA datos de la obra B en once
familias de rutas (RFIs, redlines, pins, inventario, partidas, atributos...), y
encender ENFORCE_PROJECT_AUTHZ no lo impedia, porque la obra salia None y la
comprobacion de pertenencia ni llegaba a ejecutarse.

Eran dos fallos, y hacen falta los dos arreglos:
  1. el resolutor aprende a traducir el urn del modelo, desde `model_config`;
  2. cuando la obra NO se puede determinar en una ruta de obra, bajo ENFORCE se
     niega. Que el sistema no sepa de quien es una peticion no puede resolverse
     dandola por buena.

DB-free: se inyecta el mapa del resolutor y se sustituye la comprobacion de
pertenencia; no hace falta PostgreSQL para demostrar la decision.
"""
import importlib

import pytest
from flask import Flask, jsonify

URN_B = 'urn:adsk.wipprod:fs.file:vf.OBRA_B_MODELO?version=3'
OBRA_A = 'b.proj_obra_a_1'
OBRA_B = 'b.proj_obra_b_2'


@pytest.fixture
def entorno(monkeypatch):
    """App minima con el middleware puesto y el resolutor cargado a mano."""
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')

    import db
    importlib.reload(db)
    # El mapa que el cargador sacaria de projects + model_config.
    db._project_resolver_cache['map'] = {
        'by_ref': {},
        'by_id': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
        'by_urn': {v: OBRA_B for v in db._variantes_de_urn(URN_B)},
        'by_dataset': {},
        'prefijables': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
    }
    db._project_resolver_cache['ts'] = 10 ** 12   # que no caduque durante la prueba

    import auth_middleware as am
    importlib.reload(am)

    estado = {'usuario': {'id': 7, 'email': 'a@obra.test', 'role': 'user'},
              'obras_del_usuario': {OBRA_A}}

    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])
    monkeypatch.setattr(am, '_user_in_project',
                        lambda uid, pid: pid in estado['obras_del_usuario'])

    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/inventory', methods=['GET', 'POST'])
    def inventario():
        return jsonify({'datos': 'inventario de la obra'})

    @app.route('/api/partidas/all/<path:model_urn>', methods=['DELETE'])
    def borrar_partidas(model_urn):
        return jsonify({'borrado': model_urn})

    @app.route('/api/projects', methods=['GET'])
    def lista_obras():
        return jsonify({'obras': []})

    cliente = app.test_client()
    cliente.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion-de-prueba'
    return cliente, am, estado


# ── El resolutor, que era la causa raiz ────────────────────────────────────

def test_el_resolutor_traduce_el_urn_del_modelo(entorno):
    _c, _am, _e = entorno
    from db import resolve_project_id
    assert resolve_project_id(URN_B) == OBRA_B


def test_el_mismo_modelo_resuelve_venga_como_venga_escrito(entorno):
    """Con y sin sufijo de version, y con los dos alfabetos de base64. Que a
    veces resolviera y a veces no era peor que no resolver: daba una falsa
    sensacion de control."""
    _c, _am, _e = entorno
    from db import resolve_project_id
    assert resolve_project_id(URN_B.split('?')[0]) == OBRA_B
    assert resolve_project_id(URN_B + '&otro=1') == OBRA_B


def test_un_urn_desconocido_no_se_atribuye_a_ninguna_obra(entorno):
    """Lo no resoluble sigue siendo None: adivinar seria peor que no saber."""
    _c, _am, _e = entorno
    from db import resolve_project_id
    assert resolve_project_id('urn:adsk.wipprod:fs.file:vf.NO_REGISTRADO') is None


# ── El bloqueo, que era lo que no ocurria ──────────────────────────────────

def test_con_el_control_encendido_no_se_leen_datos_de_otra_obra(entorno, monkeypatch):
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    r = c.get(f'/api/inventory?model_urn={URN_B}')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_FORBIDDEN'


def test_con_el_control_encendido_no_se_borra_el_presupuesto_de_otra_obra(entorno, monkeypatch):
    """La peticion mas destructiva que se encontro: vaciar las partidas de una
    obra ajena, con el identificador en la propia ruta."""
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    r = c.delete(f'/api/partidas/all/{URN_B}')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_FORBIDDEN'


def test_la_propia_obra_se_sigue_pudiendo_usar(entorno, monkeypatch):
    """Un control que tambien bloquea al dueno de la obra no se puede encender."""
    c, am, e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    e['obras_del_usuario'] = {OBRA_A, OBRA_B}
    assert c.get(f'/api/inventory?model_urn={URN_B}').status_code == 200


def test_un_identificador_que_no_resuelve_ya_no_es_un_pase_libre(entorno, monkeypatch):
    """El agujero de verdad: bastaba direccionar la peticion con algo que el
    resolutor no supiera traducir para saltarse la comprobacion entera."""
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    r = c.get('/api/inventory?model_urn=urn:adsk.wipprod:fs.file:vf.INVENTADO')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_UNRESOLVED'


def test_omitir_el_identificador_tampoco_es_un_pase_libre(entorno, monkeypatch):
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    assert c.get('/api/inventory').status_code == 403


def test_las_rutas_sin_obra_justificadas_siguen_pasando(entorno, monkeypatch):
    """Listar obras no habla de UNA obra: bloquearla dejaria al usuario sin
    poder ver siquiera cuales son las suyas."""
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    assert c.get('/api/projects').status_code == 200


def test_el_administrador_no_queda_atrapado(entorno, monkeypatch):
    c, am, e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    e['usuario'] = {'id': 1, 'email': 'admin@obra.test', 'role': 'admin'}
    assert c.get(f'/api/inventory?model_urn={URN_B}').status_code == 200


# ── Lo que NO cambia mientras el control siga apagado ──────────────────────

def test_apagado_se_comporta_como_hoy_y_solo_deja_constancia(entorno, monkeypatch):
    """Produccion tiene el control apagado. Este cambio no debe alterar nada
    alli hasta que se encienda a proposito."""
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', False)
    assert c.get(f'/api/inventory?model_urn={URN_B}').status_code == 200
    assert c.get('/api/inventory?model_urn=urn:no-existe').status_code == 200


def test_cada_exencion_lleva_su_motivo_escrito(entorno):
    """La lista de rutas que pasan sin obra solo puede encoger, y cada entrada
    tiene que decir por que."""
    _c, am, _e = entorno
    for ruta, motivo in am._SIN_OBRA_JUSTIFICADO.items():
        assert motivo and len(motivo) > 20, f'{ruta} no tiene motivo escrito'


# ── El atajo: nombrar DOS obras y que gane la mia ─────────────────────────

def test_colgar_mi_obra_en_la_url_no_abre_la_ajena(entorno, monkeypatch):
    """La peticion nombra dos obras: la ajena en la ruta, la propia en la query.

    El resolutor recorre las fuentes en orden [args, view_args, cuerpo] y
    acumula todas las obras que resuelvan. Cuando salian dos, el comentario
    decia «no se elige, se niega» y el codigo hacia `return encontradas[0]`:
    ganaba la de la query, que es la que pone quien llama. Bastaba con
    `?project_id=<mi_obra>` para que la comprobacion de pertenencia se hiciera
    contra la mia mientras el manejador trabajaba sobre la ajena.

    Con el interruptor apagado no se notaba, porque no se bloquea a nadie. El
    dia de encenderlo, el control habria nacido ya sorteable -- que es la peor
    forma de tener un control: la que se cree que existe.
    """
    c, am, _e = entorno
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)
    r = c.delete(f'/api/partidas/all/{URN_B}&project_id={OBRA_A}')
    assert r.status_code == 403, (
        'la obra propia colgada en la query abrio la ajena: %s' % r.get_json())


def test_la_ambiguedad_no_es_una_obra(entorno):
    """Ante dos obras se devuelve una negativa, no la primera de la lista."""
    c, am, _e = entorno
    with am_contexto(am, f'/api/partidas/all/{URN_B}&project_id={OBRA_A}'):
        assert am._request_project_id() == am.OBRA_EN_CONFLICTO
    assert am._user_in_project(7, am.OBRA_EN_CONFLICTO) is False


def am_contexto(am, ruta):
    """Contexto de peticion sobre una app pelada, para probar el resolutor."""
    from flask import Flask
    app = Flask(__name__)

    @app.route('/api/partidas/all/<path:model_urn>', methods=['DELETE'])
    def _r(model_urn):
        return ''

    return app.test_request_context(ruta, method='DELETE')
