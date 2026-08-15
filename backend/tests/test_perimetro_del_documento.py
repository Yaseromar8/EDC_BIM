# -*- coding: utf-8 -*-
"""La IA no puede leerte en voz alta un documento de otra obra.

BASELINE 0 · C8, segunda tanda. La fuga de bytes no necesita el boton de
descarga: `/api/ai/ask` recibia un `nodeId` o una ruta de objeto, se bajaba el
PDF del almacen, lo leia y lo resumia -- sin mirar nunca de que obra era el
documento. Lo mismo `/api/ai/warmup`, que ademas lo dejaba cacheado, y
`/api/ai/analyze-title`, que le saca el membrete.

Tres de las cuatro puertas de la IA aceptaban ademas la ruta del objeto en
crudo (`fullPath`), asi que ni siquiera hacia falta un identificador de la
base: bastaba una ruta del almacen.

Esta guardia resuelve la obra desde el NODO -- que es quien dice de verdad de
quien es el fichero -- y no desde el `model_urn` que manda el cliente, que es
justo el dato que un atacante controla.

DB-free: se sustituye la conexion y la comprobacion de pertenencia.
"""
import importlib

import pytest
from flask import Flask, g, jsonify

OBRA_A = 'b.proj_obra_a_1'
OBRA_B = 'b.proj_obra_b_2'

NODO_A = 'nodo-de-la-obra-a'
NODO_B = 'nodo-de-la-obra-b'
RUTA_A = 'multi-tenant/obra_a/planos/PL-001.pdf'
RUTA_B = 'multi-tenant/obra_b/planos/PL-001.pdf'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')

    import db
    importlib.reload(db)
    db._project_resolver_cache['map'] = {
        'by_id': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
        'by_name': {}, 'by_urn': {'urn:MODELO_A': OBRA_A, 'urn:MODELO_B': OBRA_B},
        'default': None,
    }
    db._project_resolver_cache['ts'] = 10 ** 12

    import perimetro_de_obra as pm
    importlib.reload(pm)

    estado = {
        'usuario': {'id': 7, 'email': 'a@obra.test', 'role': 'user'},
        'obras_del_usuario': {OBRA_A},
        'nodos': {NODO_A: 'urn:MODELO_A', NODO_B: 'urn:MODELO_B'},
        'objetos': {RUTA_A: 'urn:MODELO_A', RUTA_B: 'urn:MODELO_B'},
    }

    class Cursor:
        def __init__(self):
            self._r = None

        def execute(self, sql, params=None):
            self._r = None
            clave = params[0] if params else None
            fuente = estado['objetos'] if 'gcs_urn' in sql else estado['nodos']
            if clave in fuente:
                self._r = (fuente[clave],)

        def fetchone(self):
            return self._r

    class Conn:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    import auth_middleware as am
    monkeypatch.setattr(am, '_user_in_project',
                        lambda uid, pid: pid in estado['obras_del_usuario'])

    app = Flask(__name__)

    @app.before_request
    def _sesion():
        g.current_user = estado['usuario']

    @app.route('/prueba', methods=['POST'])
    def leer():
        from flask import request
        d = request.get_json() or {}
        negativa = pm.guardia_del_documento(d.get('nodeId'), d.get('fullPath'))
        if negativa:
            return negativa
        return jsonify({'leido': True})

    return app.test_client(), estado, pm


def _post(c, **cuerpo):
    return c.post('/prueba', json=cuerpo)


# ── Lo que se demostro explotable ──────────────────────────────────────────

def test_no_se_puede_preguntar_por_un_documento_de_otra_obra(entorno):
    c, _e, _pm = entorno
    r = _post(c, nodeId=NODO_B)
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_FORBIDDEN'


def test_tampoco_dando_la_ruta_del_objeto_en_crudo(entorno):
    """Es el camino que se saltaba la base entera: `fullPath` no pasa por
    ningun identificador nuestro."""
    c, _e, _pm = entorno
    assert _post(c, fullPath=RUTA_B).status_code == 403


def test_el_documento_propio_se_sigue_pudiendo_leer(entorno):
    """Una guardia que tambien bloquea al dueno no se puede desplegar."""
    c, _e, _pm = entorno
    assert _post(c, nodeId=NODO_A).status_code == 200
    assert _post(c, fullPath=RUTA_A).status_code == 200


# ── Fail-closed ────────────────────────────────────────────────────────────

def test_un_objeto_sin_nodo_no_se_atribuye_a_nadie(entorno):
    """Un fichero suelto en el almacen sin fila en `file_nodes` no se puede
    atribuir a una obra. No saber de quien es no se resuelve dandolo por bueno:
    es justo el caso de los 721 objetos sin correspondencia del baseline."""
    c, _e, _pm = entorno
    assert _post(c, fullPath='multi-tenant/huerfano/suelto.pdf').status_code == 404


def test_sin_documento_no_se_adivina(entorno):
    c, _e, _pm = entorno
    assert _post(c).status_code == 400


def test_sin_sesion_no_se_lee_nada(entorno):
    c, e, _pm = entorno
    e['usuario'] = None
    assert _post(c, nodeId=NODO_A).status_code == 401


def test_si_no_se_puede_comprobar_no_se_pasa(entorno, monkeypatch):
    """Ante un fallo de base NO se sigue adelante."""
    c, _e, _pm = entorno
    import db

    def revienta():
        raise RuntimeError('base caida')

    monkeypatch.setattr(db, 'get_db_connection', revienta)
    assert _post(c, nodeId=NODO_A).status_code == 503


def test_el_administrador_no_queda_atrapado(entorno):
    c, e, _pm = entorno
    e['usuario'] = {'id': 1, 'email': 'admin@obra.test', 'role': 'admin'}
    assert _post(c, nodeId=NODO_B).status_code == 200


# ── Que las cuatro puertas de la IA la lleven puesta ───────────────────────

def test_las_cuatro_puertas_de_la_IA_comprueban_la_obra():
    """La guardia solo sirve si esta puesta. Se mira el fichero: no se puede
    importar `routes/ai.py` sin vertexai ni pdfplumber."""
    import io
    import os
    import re
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'ai.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    trozos = re.split(r'@ai_bp\.route', fuente)[1:]
    esperado = {
        '/api/ai/warmup': 'guardia_del_documento',
        '/api/ai/ask': 'guardia_del_documento',
        '/api/ai/analyze-title': 'guardia_del_documento',
        '/api/ai/feedback': 'guardia_de_recurso',
        # Sin `model_urn` cae por defecto en la obra '1': un usuario de otra
        # obra que preguntara sin decir cual recibia contenido de Talara.
        '/api/ai/universal-search': 'guardia_de_obra',
    }
    for trozo in trozos:
        m = re.match(r"\(\s*'([^']+)'", trozo.strip())
        if not m or m.group(1) not in esperado:
            continue
        url = m.group(1)
        assert esperado[url] in trozo, f'{url} no comprueba la obra'


def test_la_guardia_no_se_fia_del_model_urn_que_manda_el_cliente():
    """Resolver la obra desde el dato que controla el atacante no es una
    comprobacion. Tiene que salir de `file_nodes`."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'perimetro_de_obra.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def obra_del_documento'):fuente.index('def guardia_del_documento')]
    assert 'FROM file_nodes' in cuerpo
    assert cuerpo.count('SELECT model_urn') == 2  # por nodo y por ruta del objeto
