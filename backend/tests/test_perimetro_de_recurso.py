# -*- coding: utf-8 -*-
"""Conocer el id de un recurso no puede bastar para escribir en otra obra.

BASELINE 0 · C8. Hay un patron repetido por todo el backend: la ruta recibe el
identificador de un RFI, una marca de dibujo, un pin o una partida, y actua sobre
el sin mirar de que obra es. Los identificadores son unicos y globales, asi que
basta conocer uno para escribir en el expediente ajeno.

Medido el 13-ago-2026 con sesiones reales sobre la base local:
    PATCH /api/rfis/96f75097-...  ->  200 "Updated successfully"
y la relectura en PostgreSQL confirmo el cambio sobre la fila de la obra B, con
un usuario que solo pertenecia a la obra A.

DB-free: se sustituye la conexion y la comprobacion de pertenencia.
"""
import importlib

import pytest
from flask import Flask, g, jsonify

OBRA_A = 'b.proj_obra_a_1'
OBRA_B = 'b.proj_obra_b_2'


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')

    import db
    importlib.reload(db)
    db._project_resolver_cache['map'] = {
        'by_ref': {}, 'by_id': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
        'by_urn': {'urn:MODELO_B': OBRA_B, 'urn:MODELO_A': OBRA_A},
        'by_dataset': {}, 'prefijables': {OBRA_A: OBRA_A, OBRA_B: OBRA_B},
    }
    db._project_resolver_cache['ts'] = 10 ** 12

    import perimetro_de_obra as pm
    importlib.reload(pm)

    estado = {
        'usuario': {'id': 7, 'email': 'a@obra.test', 'role': 'user'},
        'obras_del_usuario': {OBRA_A},
        # id del recurso -> lo que guarda su columna de obra
        'filas': {'rfi-de-la-obra-b': 'urn:MODELO_B',
                  'rfi-de-la-obra-a': 'urn:MODELO_A'},
    }

    class Cursor:
        def __init__(self): self._r = None
        def execute(self, sql, params=None):
            self._r = None
            clave = params[0] if params else None
            if clave in estado['filas']:
                self._r = (estado['filas'][clave],)
        def fetchone(self): return self._r

    class Conn:
        def cursor(self): return Cursor()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    import auth_middleware as am
    monkeypatch.setattr(am, '_user_in_project',
                        lambda uid, pid: pid in estado['obras_del_usuario'])

    app = Flask(__name__)

    @app.before_request
    def _sesion():
        g.current_user = estado['usuario']

    @app.route('/prueba/<rid>', methods=['PATCH'])
    def tocar(rid):
        negativa = pm.guardia_de_recurso('doc_rfis', rid)
        if negativa:
            return negativa
        return jsonify({'tocado': rid})

    return app.test_client(), estado, pm


def test_no_se_puede_tocar_un_recurso_de_otra_obra(entorno):
    c, _e, _pm = entorno
    r = c.patch('/prueba/rfi-de-la-obra-b')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_FORBIDDEN'


def test_el_recurso_propio_se_sigue_pudiendo_tocar(entorno):
    """Una guardia que tambien bloquea al dueno no se puede desplegar."""
    c, _e, _pm = entorno
    assert c.patch('/prueba/rfi-de-la-obra-a').status_code == 200


def test_un_recurso_que_no_existe_responde_404_y_no_dice_mas(entorno):
    """Distinguir 'no existe' de 'existe pero es de otra obra' ya seria filtrar:
    permitiria descubrir que identificadores son validos."""
    c, _e, _pm = entorno
    assert c.patch('/prueba/inventado').status_code == 404


def test_sin_sesion_no_se_toca_nada(entorno):
    c, e, _pm = entorno
    e['usuario'] = None
    assert c.patch('/prueba/rfi-de-la-obra-a').status_code == 401


def test_el_administrador_no_queda_atrapado(entorno):
    c, e, _pm = entorno
    e['usuario'] = {'id': 1, 'email': 'admin@obra.test', 'role': 'admin'}
    assert c.patch('/prueba/rfi-de-la-obra-b').status_code == 200


def test_si_no_se_puede_comprobar_no_se_pasa(entorno, monkeypatch):
    """Fail-closed: ante un fallo de base NO se sigue adelante. Es lo contrario
    de lo que hacia el codigo anterior, que ante la duda dejaba pasar."""
    c, _e, pm = entorno
    import db
    def revienta():
        raise RuntimeError('base caida')
    monkeypatch.setattr(db, 'get_db_connection', revienta)
    assert c.patch('/prueba/rfi-de-la-obra-a').status_code == 503


def test_la_tabla_nunca_sale_de_la_peticion(entorno):
    """Los nombres de tabla y columna se eligen de una lista blanca. Si vinieran
    de fuera, cambiariamos un agujero de autorizacion por uno de inyeccion."""
    _c, _e, pm = entorno
    with pytest.raises(ValueError):
        pm.obra_del_recurso(None, 'tabla_que_no_esta_declarada', 1)


# ── Que no vuelva a haber rutas por id de recurso sin guardia ──────────────

def test_las_rutas_por_id_de_recurso_llevan_guardia():
    """Barrido: toda ruta que reciba <algo_id> y escriba en una tabla de obra
    tiene que comprobar de que obra es."""
    import os
    import re
    backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rutas = os.path.join(backend, 'routes')
    import perimetro_de_obra as pm

    sin_guardia = []
    for nombre in sorted(os.listdir(rutas)):
        if not nombre.endswith('.py'):
            continue
        lineas = open(os.path.join(rutas, nombre), encoding='utf-8',
                      errors='ignore').read().split('\n')
        i = 0
        while i < len(lineas):
            m = re.match(r"@\w+\.route\(\s*['\"]([^'\"]+)['\"].*?(PATCH|PUT|DELETE)",
                         lineas[i].strip())
            if not m:
                i += 1
                continue
            url = m.group(1)
            if not re.search(r'<(?:\w+:)?\w*_?id>', url):
                i += 1
                continue
            j, cuerpo = i + 1, ''
            while j < len(lineas) and not re.match(r'^(@|def )', lineas[j]) or j == i + 1:
                cuerpo += lineas[j] + '\n'
                j += 1
                if j < len(lineas) and re.match(r'^@', lineas[j]):
                    break
            toca_obra = any(re.search(r'\b' + t + r'\b', cuerpo) for t in pm.RECURSOS)
            # Vale cualquier guardia que resuelva la obra del recurso, no solo
            # la generica: sets.py ya tenia la suya y funciona.
            otras = ('_guardia_del_conjunto', '_guardia_del_nodo', '_acceso_al_recurso',
                     'obra_del_blob', '_obra_del_conjunto',
                     # El tablero de analisis lee la obra de su propia fila y
                     # llama a _check_project_access, que es fail-closed
                     # (routes/dashboards.py). Aparecio al declarar 'dashboards'
                     # en RECURSOS el 17-ago: la guardia existia desde antes, lo
                     # que faltaba era que este barrido supiera reconocerla.
                     '_check_project_access')
            tiene = 'guardia_de_recurso' in cuerpo or any(o in cuerpo for o in otras)
            if toca_obra and not tiene:
                sin_guardia.append(f'{nombre}  {url}')
            i = j
    assert not sin_guardia, ('rutas que reciben el id de un recurso de obra y no '
                             'comprueban de que obra es:\n  ' + '\n  '.join(sin_guardia))
