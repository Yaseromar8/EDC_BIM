# -*- coding: utf-8 -*-
"""CAPA 16 · TOOL ACTIVATION — disponibilidad de la herramienta EN LA OBRA.

    TOOL OFF  →  nadie del proyecto puede usarla,
                 no importa qué acceso personal tenga.

Lo que estas pruebas fijan, y que es TODA la capa:

  · apagada bloquea a cualquiera — incluido el Entity Admin, que la enciende
    en vez de atravesarla (si pudiera atravesarla, «apagada» no significaría
    nada y la capa sería decorativa);
  · encendida NO concede nada por sí sola: las capas de dentro
    (membresía, permiso de recurso) siguen decidiendo;
  · el catálogo es una lista CERRADA y sus prefijos existen de verdad en las
    rutas registradas — si un blueprint se muda, esto revienta;
  · las rutas que administran la activación NO se gobiernan a sí mismas:
    apagar una herramienta no puede ser irreversible desde la interfaz.
"""
import importlib

import pytest
from flask import Flask, jsonify

OBRA = 'b.proj_prueba'


# ── El catálogo y el mapeo de rutas ─────────────────────────────────────────

def test_el_catalogo_es_una_lista_cerrada():
    import herramientas_de_obra as hdo
    assert set(hdo.CODIGOS) == {
        'rfi', 'redlines', 'reviews', 'transmittals',
        'plan_entregas', 'conjuntos', 'fotos', 'visor'}
    # DOCUMENTOS no está: es el substrato del producto y no se apaga.
    # Diferencia deliberada con ACC, documentada en el módulo.
    assert 'documentos' not in hdo.CODIGOS
    assert 'docs' not in hdo.CODIGOS


def test_cada_ruta_cae_en_su_herramienta():
    import herramientas_de_obra as hdo
    assert hdo.herramienta_de_ruta('/api/rfis') == 'rfi'
    assert hdo.herramienta_de_ruta('/api/rfis/proyectos/X') == 'rfi'
    assert hdo.herramienta_de_ruta('/api/redlines/12') == 'redlines'
    assert hdo.herramienta_de_ruta('/api/reviews') == 'reviews'
    assert hdo.herramienta_de_ruta('/api/transmittals/3/acuse') == 'transmittals'
    assert hdo.herramienta_de_ruta('/api/plan/importar') == 'plan_entregas'
    assert hdo.herramienta_de_ruta('/api/sets/1/items') == 'conjuntos'
    assert hdo.herramienta_de_ruta('/api/pins') == 'fotos'
    assert hdo.herramienta_de_ruta('/api/modelos/publicar-desde-ecd') == 'visor'


def test_lo_que_no_es_herramienta_no_pasa_por_esta_capa():
    """El expediente, la identidad y la administración no se activan ni se
    desactivan: no hay nada que gobernar en ellas."""
    import herramientas_de_obra as hdo
    for ruta in ('/api/docs/list', '/api/users', '/api/auth/login',
                 '/api/projects', '/api/companies',
                 '/api/projects/X/herramientas',
                 '/api/projects/X/herramientas/rfi'):
        assert hdo.herramienta_de_ruta(ruta) is None, ruta


def test_los_prefijos_del_catalogo_no_se_pisan_entre_si():
    import herramientas_de_obra as hdo
    vistos = []
    for h in hdo.CATALOGO:
        for p in h['prefijos']:
            for otro in vistos:
                assert not p.startswith(otro + '/'), '%s cae dentro de %s' % (p, otro)
            vistos.append(p)


# ── El estado: defecto declarado, no implícito ──────────────────────────────

class _Cur:
    def __init__(self, filas=None, revienta=False):
        self._filas = filas or []
        self._revienta = revienta
    def execute(self, sql, params=None):
        if self._revienta:
            raise RuntimeError('project_tools no existe')
    def fetchall(self):
        return self._filas


def test_sin_filas_manda_el_catalogo():
    import herramientas_de_obra as hdo
    estado = hdo.estado_de_obra(_Cur(), OBRA)
    assert set(estado) == set(hdo.CODIGOS)
    assert all(estado.values()), 'el defecto declarado hoy es: todas encendidas'


def test_la_fila_manda_sobre_el_catalogo():
    import herramientas_de_obra as hdo
    estado = hdo.estado_de_obra(_Cur([('rfi', False), ('visor', False)]), OBRA)
    assert estado['rfi'] is False and estado['visor'] is False
    assert estado['reviews'] is True


def test_si_la_tabla_no_existe_la_obra_sigue_funcionando():
    """FAIL-OPEN DELIBERADO Y ACOTADO A ESTA CAPA: es disponibilidad, no
    autorización. Cerrar ante un fallo de infraestructura dejaría una obra
    entera sin herramientas. La autorización real sigue fail-closed aparte."""
    import herramientas_de_obra as hdo
    estado = hdo.estado_de_obra(_Cur(revienta=True), OBRA)
    assert all(estado.values())


# ── La compuerta del middleware ─────────────────────────────────────────────

@pytest.fixture
def perimetro(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import auth_middleware as am
    importlib.reload(am)

    estado = {'usuario': {'id': 7, 'email': 'a@o.pe', 'role': 'user'},
              'apagadas': set()}

    class Cursor:
        def execute(self, sql, params=None): self._p = params
        def fetchall(self):
            return [(c, False) for c in estado['apagadas']]

    class Conn:
        def cursor(self): return Cursor()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])
    monkeypatch.setattr(am, '_request_project_id', lambda: OBRA)
    monkeypatch.setattr(am, '_user_in_project', lambda uid, pid: True)

    app = Flask(__name__)
    am.init_auth_middleware(app)

    @app.route('/api/rfis', methods=['GET'])
    def _rfis(): return jsonify({'datos': 'rfis'})

    @app.route('/api/reviews', methods=['GET'])
    def _rev(): return jsonify({'datos': 'reviews'})

    @app.route('/api/docs/list', methods=['GET'])
    def _docs(): return jsonify({'datos': 'expediente'})

    @app.route('/api/projects/<pid>/herramientas', methods=['GET'])
    def _admin_tools(pid): return jsonify({'ok': True})

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion'
    return c, estado


def test_apagada_bloquea_a_un_miembro(perimetro):
    c, e = perimetro
    e['apagadas'] = {'rfi'}
    r = c.get('/api/rfis')
    assert r.status_code == 403
    d = r.get_json()
    assert d['code'] == 'HERRAMIENTA_NO_ACTIVA' and d['herramienta'] == 'rfi'
    assert 'RFI' in d['error']


def test_apagada_bloquea_TAMBIEN_AL_ENTITY_ADMIN(perimetro):
    """EL CORAZÓN DE LA CAPA. Si el administrador la atravesara, «apagada» no
    significaría nada: significaría «apagada para los demás». La enciende y
    entonces la usa — acto explícito y auditado."""
    c, e = perimetro
    e['usuario'] = {'id': 2, 'email': 'admin@o.pe', 'role': 'admin'}
    e['apagadas'] = {'rfi'}
    assert c.get('/api/rfis').status_code == 403


def test_encendida_deja_pasar(perimetro):
    c, e = perimetro
    e['apagadas'] = set()
    assert c.get('/api/rfis').status_code == 200


def test_apagar_una_no_apaga_las_otras(perimetro):
    c, e = perimetro
    e['apagadas'] = {'rfi'}
    assert c.get('/api/rfis').status_code == 403
    assert c.get('/api/reviews').status_code == 200


def test_el_expediente_no_depende_de_esta_capa(perimetro):
    """Documentos es el substrato: no está en el catálogo y ninguna
    combinación de apagados lo toca."""
    c, e = perimetro
    e['apagadas'] = set(__import__('herramientas_de_obra').CODIGOS)
    assert c.get('/api/docs/list').status_code == 200


def test_la_administracion_de_herramientas_no_se_apaga_a_si_misma(perimetro):
    """Si apagar «RFI» apagara la pantalla que lo enciende, la operación sería
    irreversible desde la interfaz."""
    c, e = perimetro
    e['apagadas'] = set(__import__('herramientas_de_obra').CODIGOS)
    assert c.get('/api/projects/%s/herramientas' % OBRA).status_code == 200


# ── Las separaciones que no se pueden romper ────────────────────────────────

def test_activacion_no_es_permiso_de_persona(perimetro):
    """Encendida, la herramienta NO concede nada: el que no es miembro sigue
    fuera. La capa 16 abre la puerta del edificio, no la de tu despacho."""
    import auth_middleware as am
    c, e = perimetro
    e['apagadas'] = set()
    am._user_in_project = lambda uid, pid: False
    am.ENFORCE_PROJECT_AUTHZ = True
    r = c.get('/api/rfis')
    assert r.status_code == 403
    assert r.get_json()['code'] == 'PROJECT_FORBIDDEN', (
        'la membresía debe decidir ANTES; encender una herramienta no la sustituye')
