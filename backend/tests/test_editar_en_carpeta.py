# -*- coding: utf-8 -*-
"""Quien tiene «Editar» en una carpeta puede cargar en ella; mover exige permiso en el destino.

QUE PASABA (13-sep-2026)
------------------------
1. El portal decidia «Cargar archivos» y «Nueva carpeta» con «administra esta
   obra»: a quien tenia «Editar» en la carpeta le escondia lo que el servidor si
   le deja. El listado no decia que puede hacer quien mira en la carpeta abierta;
   ahora lo dice (`current_permission_level`), con la misma regla que todo lo demas.
2. Mover solo miraba el permiso sobre lo que se mueve, no sobre el destino. Con
   la interfaz abierta a quien edita, eso habria dejado soltar documentos en
   carpetas donde no tiene permiso.

DB-free: se sustituyen la base, la pertenencia y el permiso.
"""
import contextlib

import pytest
from flask import Flask, g, jsonify

OBRA = 'b.proj_obra_editar'
CARPETA = '00000000-0000-4000-8000-00000000ed01'
DESTINO_SIN_PERMISO = '00000000-0000-4000-8000-00000000ed02'
DOCUMENTO = '00000000-0000-4000-8000-00000000ed03'


@contextlib.contextmanager
def _conexion_que_no_consulta():
    class _Cursor:
        def execute(self, *a, **k):
            raise AssertionError('esta prueba no debe llegar a la base')

    class _Conexion:
        def cursor(self):
            return _Cursor()
    yield _Conexion()


@pytest.fixture
def portal(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    # En perfil portal el listado no firma URLs: sin esto consultaria permisos de
    # descarga por su cuenta.
    monkeypatch.setenv('DEPLOY_PROFILE', 'portal')
    import db
    import routes.documents as rdoc
    monkeypatch.setattr(rdoc, 'verify_project_access', lambda usuario, obra: True)
    monkeypatch.setattr(rdoc, '_autor_verificado', lambda: 'Editor de prueba')
    monkeypatch.setattr(db, 'get_db_connection', _conexion_que_no_consulta)

    app = Flask(__name__)

    @app.before_request
    def _sesion():
        g.current_user = {'id': 7, 'email': 'editor@obra.test', 'name': 'Editor', 'role': 'user'}

    app.register_blueprint(rdoc.documents_bp)
    return app.test_client(), rdoc


# ── El listado dice que se puede hacer en la carpeta abierta ───────────────

def test_el_listado_dice_el_nivel_de_quien_mira_en_la_carpeta(portal, monkeypatch):
    cliente, _rdoc = portal
    import file_system_db
    import permiso_documental as pd
    monkeypatch.setattr(file_system_db, 'list_contents',
                        lambda *a, **k: {'folders': [], 'files': []})
    visto = {}

    def _nivel(cur, usuario, obra, nodo, **k):
        visto.update(usuario=usuario, obra=obra, nodo=str(nodo))
        return 'edit'
    monkeypatch.setattr(pd, 'permiso_efectivo', _nivel)

    r = cliente.get('/api/docs/list?id=%s&model_urn=%s' % (CARPETA, OBRA))
    assert r.status_code == 200
    assert r.get_json()['data']['current_permission_level'] == 'edit'
    assert visto['nodo'] == CARPETA and visto['obra'] == OBRA
    assert visto['usuario']['id'] == 7, 'se pregunta por quien mira, no por otro'


def test_si_el_nivel_no_se_puede_saber_no_se_ofrece_nada(portal, monkeypatch):
    cliente, _rdoc = portal
    import file_system_db
    import permiso_documental as pd
    monkeypatch.setattr(file_system_db, 'list_contents',
                        lambda *a, **k: {'folders': [], 'files': []})

    def _falla(*a, **k):
        raise RuntimeError('base caida')
    monkeypatch.setattr(pd, 'permiso_efectivo', _falla)

    r = cliente.get('/api/docs/list?id=%s&model_urn=%s' % (CARPETA, OBRA))
    assert r.status_code == 200
    assert r.get_json()['data']['current_permission_level'] == 'none'


# ── Mover exige «Editar» tambien en el destino ─────────────────────────────

def _permisos_que_anotan(llamadas, negados):
    def _permiso(user, node_id, model_urn, nivel, accion='esta acción'):
        llamadas.append((node_id, nivel, accion))
        if node_id in negados:
            return jsonify({'success': False, 'error': 'Acceso denegado'}), 403
        return None
    return _permiso


def test_mover_a_una_carpeta_sin_permiso_se_niega(portal, monkeypatch):
    cliente, rdoc = portal
    llamadas = []
    monkeypatch.setattr(rdoc, 'check_folder_permission',
                        _permisos_que_anotan(llamadas, {DESTINO_SIN_PERMISO}))
    r = cliente.put('/api/docs/move', json={'node_id': DOCUMENTO, 'destNodeId': DESTINO_SIN_PERMISO,
                                            'model_urn': OBRA})
    assert r.status_code == 403
    assert (DOCUMENTO, 'edit', 'mover archivos') in llamadas
    assert (DESTINO_SIN_PERMISO, 'edit', 'mover a esa carpeta') in llamadas


def test_sin_destino_resuelto_solo_pasa_quien_administra_la_obra(portal, monkeypatch):
    """Un destino vacio sacaba el documento fuera de toda carpeta. Para quien no
    administra la obra, el permiso sobre «ninguna carpeta» es ninguno."""
    cliente, rdoc = portal
    llamadas = []
    monkeypatch.setattr(rdoc, 'check_folder_permission',
                        _permisos_que_anotan(llamadas, {None}))
    r = cliente.put('/api/docs/move', json={'node_id': DOCUMENTO, 'destNodeId': None,
                                            'destPath': '', 'model_urn': OBRA})
    assert r.status_code == 403
    assert (None, 'edit', 'mover a esa carpeta') in llamadas
