# -*- coding: utf-8 -*-
"""Los planos CAD se abren para todo el que puede abrirlos, no solo para el admin de la entidad.

QUE PASABA (13-sep-2026, reproducido)
-------------------------------------
El visor web de planos llama a `POST /api/docs/cad/translate` con `{node_id}` en el
cuerpo y a `GET /api/docs/cad/status?node_id=`. El control central por obra no sabia
sacar la obra de ese id y, con ENFORCE_PROJECT_AUTHZ encendido, cortaba con 403
PROJECT_UNRESOLVED a todos menos al perfil `admin`, que no pasa por ese control. Al
abrir un DWG o un RVT, quien no era administrador de la entidad veia «No se pudo
determinar a que obra pertenece esta peticion».

Y las dos rutas no comprobaban nada por dentro: ensenarle la obra al perimetro sin
anadir una guardia habria dejado ver el plano de una carpeta sin acceso con solo
conocer su id. Por eso se prueban juntas las dos mitades.

DB-free: se sustituyen la base, la pertenencia y el permiso documental.
"""
import contextlib
import importlib

import pytest
from flask import Flask, jsonify

OBRA = 'b.proj_obra_de_planos'
NODO = '00000000-0000-4000-8000-0000000cad01'
NODO_DESCONOCIDO = '00000000-0000-4000-8000-0000000cad99'


class _Cursor:
    def execute(self, *a, **k):
        pass

    def fetchone(self):
        return None

    def fetchall(self):
        return []


@contextlib.contextmanager
def _conexion():
    class _Conexion:
        def cursor(self):
            return _Cursor()
    yield _Conexion()


@pytest.fixture
def entorno(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    monkeypatch.setenv('ALLOW_DEMO_TOKEN', 'false')

    import auth_middleware as am
    importlib.reload(am)
    import db
    import perimetro_de_obra as po
    import permiso_documental as pd
    import routes.docs_cad as cad

    estado = {
        'usuario': {'id': 7, 'email': 'residente@obra.test', 'role': 'editor'},
        'miembro': True,
        # ¿Tiene al menos «Ver» en la carpeta del plano?
        've_la_carpeta': True,
    }
    monkeypatch.setattr(am, 'validate_session', lambda t: estado['usuario'])
    monkeypatch.setattr(am, '_user_in_project',
                        lambda uid, obra: estado['miembro'] and obra == OBRA)
    monkeypatch.setattr(am, 'ENFORCE_PROJECT_AUTHZ', True)

    # La base: el nodo conocido es de OBRA; el desconocido no existe.
    monkeypatch.setattr(db, 'get_db_connection', _conexion)
    monkeypatch.setattr(cad, 'get_db_connection', _conexion)
    monkeypatch.setattr(po, 'obra_del_recurso',
                        lambda cur, tabla, valor: OBRA if (tabla, str(valor)) == ('file_nodes', NODO) else None)
    monkeypatch.setattr(po, 'obra_del_documento',
                        lambda cur, node_id, gcs_urn=None: OBRA if str(node_id) == NODO else None)
    monkeypatch.setattr(cad, '_load_node', lambda node_id: (
        {'id': NODO, 'name': 'PLANO_DRENAJE.dwg', 'model_urn': OBRA,
         'gcs_urn': OBRA + '/PLANO_DRENAJE.dwg', 'meta': {}, 'refs': []}
        if str(node_id) == NODO else None))

    def _guardia(cur, usuario, obra, accion, minimo='viewer', node_id=None,
                 version_id=None, gcs_urn=None):
        if estado['ve_la_carpeta']:
            return None
        return jsonify({'success': False, 'error': 'No tienes permiso para %s.' % accion,
                        'code': 'SIN_PERMISO_DOCUMENTAL'}), 403
    monkeypatch.setattr(pd, 'guardia', _guardia)

    # Sin Autodesk: si la peticion llega hasta aqui, ya paso todas las puertas.
    monkeypatch.setattr(cad, 'get_internal_token', lambda: (None, 'sin credenciales en la prueba'))

    app = Flask(__name__)
    am.init_auth_middleware(app)
    app.register_blueprint(cad.docs_cad_bp)
    cliente = app.test_client()
    cliente.environ_base['HTTP_AUTHORIZATION'] = 'Bearer sesion-de-prueba'
    return cliente, estado, po


def _traducir(cliente, node_id=NODO):
    return cliente.post('/api/docs/cad/translate', json={'node_id': node_id})


def _estado(cliente, node_id=NODO):
    return cliente.get('/api/docs/cad/status?node_id=%s' % node_id)


def _llego_a_autodesk(respuesta):
    """502 «Sin credenciales APS»: la peticion paso el perimetro y la guardia."""
    return respuesta.status_code == 502 and 'APS' in (respuesta.get_json() or {}).get('error', '')


# ── Lo que fallaba ─────────────────────────────────────────────────────────

def test_quien_no_es_admin_de_la_entidad_puede_traducir_un_plano(entorno):
    cliente, _e, _po = entorno
    assert _llego_a_autodesk(_traducir(cliente))


def test_y_puede_consultar_como_va_la_traduccion(entorno):
    cliente, _e, _po = entorno
    assert _llego_a_autodesk(_estado(cliente))


def test_con_rol_ver_tambien(entorno):
    cliente, estado, _po = entorno
    estado['usuario'] = {'id': 8, 'email': 'lector@obra.test', 'role': 'viewer'}
    assert _llego_a_autodesk(_traducir(cliente))
    assert _llego_a_autodesk(_estado(cliente))


def test_el_admin_de_la_entidad_sigue_pudiendo(entorno):
    cliente, estado, _po = entorno
    estado['usuario'] = {'id': 1, 'email': 'entidad@obra.test', 'role': 'admin'}
    estado['miembro'] = False
    assert _llego_a_autodesk(_traducir(cliente))


# ── Lo que no se puede abrir de paso ───────────────────────────────────────

def test_sin_permiso_en_la_carpeta_no_se_traduce_ni_se_consulta(entorno):
    cliente, estado, _po = entorno
    estado['ve_la_carpeta'] = False
    for r in (_traducir(cliente), _estado(cliente)):
        assert r.status_code == 403
        assert r.get_json()['code'] == 'SIN_PERMISO_DOCUMENTAL'


def test_quien_no_es_de_la_obra_no_pasa(entorno):
    cliente, estado, _po = entorno
    estado['miembro'] = False
    for r in (_traducir(cliente), _estado(cliente)):
        assert r.status_code == 403
        assert r.get_json()['code'] == 'PROJECT_FORBIDDEN'


def test_un_plano_que_no_existe_no_es_un_pase(entorno):
    cliente, _e, _po = entorno
    for r in (_traducir(cliente, NODO_DESCONOCIDO), _estado(cliente, NODO_DESCONOCIDO)):
        assert r.status_code == 403
        assert r.get_json()['code'] == 'PROJECT_UNRESOLVED'


def test_un_id_que_no_es_un_valor_simple_no_se_interpreta(entorno):
    cliente, _e, _po = entorno
    for raro in ({'id': NODO}, [NODO], True):
        r = cliente.post('/api/docs/cad/translate', json={'node_id': raro})
        assert r.status_code == 403, raro
        assert r.get_json()['code'] == 'PROJECT_UNRESOLVED'


# ── El resolutor ───────────────────────────────────────────────────────────

def test_el_resolutor_por_cuerpo_solo_mira_sus_rutas(entorno):
    _c, _e, po = entorno
    assert po.obra_por_cuerpo('docs_cad.translate_cad', {'node_id': NODO}) == OBRA
    assert po.obra_por_cuerpo('docs_cad.otra_ruta', {'node_id': NODO}) is None
    assert po.obra_por_cuerpo('docs_cad.translate_cad', None) is None
    assert po.obra_por_cuerpo('docs_cad.translate_cad', {'node_id': ''}) is None
    assert po.obra_por_cuerpo(None, {'node_id': NODO}) is None


def test_las_dos_rutas_de_planos_estan_declaradas():
    import perimetro_de_obra as po
    assert po.RUTAS_POR_QUERY.get('cad_status') == ('file_nodes', 'node_id')
    assert po.RUTAS_POR_CUERPO.get('translate_cad') == ('file_nodes', 'node_id')
