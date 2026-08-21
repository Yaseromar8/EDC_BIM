# -*- coding: utf-8 -*-
"""El nucleo minimo: identidad determinista, y que la frontera bloquee.

QUE SE ARREGLO EL 20-ago-2026
-----------------------------
El sistema no direcciona por `projects.id`: direcciona por una cadena de alcance
que ha tomado SIETE formas a lo largo de los anos. Traducirlas era cosa de tres
heuristicas aplicadas EN CADA PETICION, y dos de ellas daban respuestas que
dependian del estado de la base -- el nombre de la obra (hay cuatro obras
llamadas 'HOSPITAL_MATUCANA') y «si hay una sola obra activa, esa».

Ahora la traduccion es un DATO (`project_ref`), y estas pruebas fijan las tres
consecuencias que importan:

  1. El 4D LOB se puede autorizar. Once de sus tablas solo tienen `dataset_id`,
     y esa clave no estaba en `_CLAVES_OBRA`: con ENFORCE encendido el modulo
     entero habria contestado 403 a todo el que no fuera administrador.
  2. Crear una cartera que choca ya no responde «201 Creado» devolviendo la
     cartera de otro.
  3. El alcance con el que se GUARDA lo decide el servidor, no el navegador a
     partir del nombre visible de la obra.

DB-free: se inyecta el mapa del resolutor y se falsean cursor y sesion.
"""
import importlib

import pytest
from flask import Flask, jsonify

OBRA_A = 'b.proj_obra_a_1'
OBRA_B = 'b.proj_obra_b_2'
DATASET_DE_B = '9c12f449-ac67-4b80-a21c-5208da591b52'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')
    monkeypatch.setenv('ENFORCE_PROJECT_AUTHZ', 'true')

    import db
    importlib.reload(db)
    db._project_resolver_cache['map'] = {
        'by_ref': {'proyectos/OBRA_A': OBRA_A},
        'by_id': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
        'by_urn': {},
        'by_dataset': {DATASET_DE_B: OBRA_B},
        'prefijables': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
    }
    db._project_resolver_cache['ts'] = 10 ** 12

    import auth_middleware as am
    importlib.reload(am)

    estado = {'usuario': {'id': 7, 'email': 'a@obra.test', 'role': 'user'},
              'obras_del_usuario': {OBRA_A}}
    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])
    monkeypatch.setattr(am, '_user_in_project',
                        lambda uid, pid: pid in estado['obras_del_usuario'])

    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/lob/timeline', methods=['GET'])
    def lob_timeline():
        return jsonify({'datos': 'cronograma 4D'})

    cliente = app.test_client()
    cliente.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion-de-prueba'
    return cliente, am, estado


# ── 1. El 4D LOB entra en el perimetro ─────────────────────────────────────

def test_el_dataset_de_otra_obra_se_bloquea(entorno):
    """El caso que motivo la clave: `/api/lob` esta en las rutas con datos de
    obra, pero su unico identificador es el UUID del dataset. Sin traducirlo, la
    obra salia None."""
    cliente, _am, _e = entorno
    r = cliente.get('/api/lob/timeline?dataset_id=%s' % DATASET_DE_B)
    assert r.status_code == 403, (
        'un usuario que solo pertenece a la obra A alcanza el 4D de la obra B')
    assert r.get_json().get('code') == 'PROJECT_FORBIDDEN'


def test_el_dataset_de_la_propia_obra_pasa(entorno):
    cliente, _am, estado = entorno
    estado['obras_del_usuario'] = {OBRA_B}
    r = cliente.get('/api/lob/timeline?dataset_id=%s' % DATASET_DE_B)
    assert r.status_code == 200


def test_un_dataset_que_no_resuelve_se_niega_bajo_enforce(entorno):
    """Fail-closed. Que el sistema no sepa de que obra es una peticion no puede
    resolverse dandola por buena."""
    cliente, _am, _e = entorno
    r = cliente.get('/api/lob/timeline?dataset_id=00000000-0000-0000-0000-000000000000')
    assert r.status_code == 403
    assert r.get_json().get('code') == 'PROJECT_UNRESOLVED'


# ── 2. Crear una cartera que choca ─────────────────────────────────────────

class _CursorFalso:
    """Un cursor que se comporta como si el INSERT hubiera chocado."""

    def __init__(self, devuelve=None):
        self._devuelve = devuelve
        self.sentencias = []

    def execute(self, sql, params=None):
        self.sentencias.append(sql)

    def fetchone(self):
        return self._devuelve

    def close(self):
        pass


def _app_con_carteras(monkeypatch, cursor):
    """Monta el blueprint de obras con la base falseada."""
    import contextlib
    import routes.projects as rp
    importlib.reload(rp)

    class _Conn:
        def cursor(self):
            return cursor

        def commit(self):
            pass

        def rollback(self):
            pass

    @contextlib.contextmanager
    def _conexion():
        yield _Conn()

    monkeypatch.setattr(rp, 'get_db_connection', _conexion)
    monkeypatch.setattr(rp, '_solo_admin', lambda *a, **k: None)
    monkeypatch.setattr(rp, '_auditar', lambda *a, **k: None)

    app = Flask(__name__)
    app.register_blueprint(rp.projects_bp)
    return app.test_client()


def test_una_cartera_que_choca_no_dice_creada(monkeypatch):
    """El id se acuna con `int(time.time()) % 100000`, un sufijo que da la
    vuelta cada 27,7 horas. Con `ON CONFLICT DO NOTHING` y un 201 incondicional,
    la segunda cartera del mismo nombre no se creaba y la respuesta devolvia el
    id de la PRIMERA: quien la creaba se quedaba trabajando dentro de la cartera
    de otro, sin error y sin rastro."""
    cliente = _app_con_carteras(monkeypatch, _CursorFalso(devuelve=None))
    r = cliente.post('/api/hubs', json={'name': 'Municipalidad X'})
    assert r.status_code == 409, 'sigue diciendo que creo una cartera que no creo'
    assert r.get_json().get('code') == 'HUB_DUPLICADO'


def test_una_cartera_nueva_si_dice_creada(monkeypatch):
    cliente = _app_con_carteras(monkeypatch, _CursorFalso(devuelve=('b.mdc_x_1',)))
    r = cliente.post('/api/hubs', json={'name': 'Municipalidad X'})
    assert r.status_code == 201


# ── 3. El alcance de escritura ─────────────────────────────────────────────

def test_el_alcance_de_escritura_sale_de_la_tabla_no_del_nombre():
    """Se mide sobre el expediente que ya existe. Renombrar la obra no lo mueve.

    Sin esto, el navegador construia el alcance como
    `proyectos/${nombre.replace(' ','_')}`: renombrar la obra partia su historia
    en dos, y dos entidades con una obra del mismo nombre producian el mismo
    identificador.
    """
    import referencias_de_obra as ref

    class _Cur:
        def __init__(self, fila):
            self.fila = fila

        def execute(self, sql, params=None):
            pass

        def fetchone(self):
            return self.fila

    # Obra con historia: escribe donde ya vive su expediente.
    assert ref.scope_de_escritura(_Cur(('proyectos/PQT8_TALARA',)), '1') == 'proyectos/PQT8_TALARA'
    # Obra nueva: escribe con su propio id, que es inmutable.
    assert ref.scope_de_escritura(_Cur(None), 'b.proj_nueva_1') == 'b.proj_nueva_1'


def test_el_navegador_ya_no_deriva_el_alcance_del_nombre():
    """La correccion vive en el frontend, asi que se comprueba ahi.

    No es una asercion sobre el estilo del codigo: es sobre QUE VALOR se manda.
    Si alguien vuelve a construir el `modelUrn` a partir del nombre visible,
    todo lo que se escriba despues de un renombrado cambia de alcance.
    """
    import io
    import os
    import re
    raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    app_jsx = os.path.join(raiz, 'frontend-react', 'src', 'App.jsx')
    if not os.path.exists(app_jsx):
        import pytest as _pytest
        _pytest.skip('frontend-react no esta presente')
    fuente = io.open(app_jsx, encoding='utf-8', errors='ignore').read()

    derivados = re.findall(r'modelUrn=\{[^}]*proyectos/\$\{[^}]*\}', fuente)
    assert not derivados, (
        'el alcance con el que se GUARDA se vuelve a derivar del nombre visible '
        'de la obra: ' + ' | '.join(d[:90] for d in derivados))
    assert 'scope_escritura' in fuente, (
        'el frontend ya no usa el alcance que le da el servidor')
