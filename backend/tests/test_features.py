"""Tests de los modulos nuevos (reviews, transmittals, sets, attributes, element_docs).

DB-free: solo ejercitan las rutas que retornan ANTES de tocar la BD —
validacion de campos (400) y gates de permiso (403). Eso fija el contrato
(que campos son obligatorios, quien puede hacer que) y atrapa regresiones
sin necesitar Postgres. Corre en CI sin BD.
"""
import importlib
from flask import Flask, g


def _make_app(role='admin', name='Tester', email='t@t.com'):
    """App minima con los blueprints nuevos y un current_user inyectado."""
    app = Flask(__name__)
    app.config['TESTING'] = True

    for mod_name, bp_attr in [
        ('routes.reviews', 'reviews_bp'),
        ('routes.transmittals', 'transmittals_bp'),
        ('routes.sets', 'sets_bp'),
        ('routes.attributes', 'attributes_bp'),
        ('routes.element_docs', 'element_docs_bp'),
    ]:
        mod = importlib.import_module(mod_name)
        app.register_blueprint(getattr(mod, bp_attr))

    @app.before_request
    def _inject_user():
        g.current_user = None if role is None else {'role': role, 'name': name, 'email': email}

    return app.test_client()


# ── Reviews ──────────────────────────────────────────────────────────
def test_review_create_requiere_campos():
    c = _make_app()
    r = c.post('/api/reviews', json={})
    assert r.status_code == 400


def test_review_act_valida_accion():
    c = _make_app()
    r = c.post('/api/reviews/1/act', json={'action': 'lo-que-sea'})
    assert r.status_code == 400  # action debe ser approve|reject


# ── Transmittals ─────────────────────────────────────────────────────
def test_transmittal_create_requiere_campos():
    c = _make_app()
    r = c.post('/api/transmittals', json={'subject': 'solo asunto'})
    assert r.status_code == 400


# ── Sets ─────────────────────────────────────────────────────────────
def test_set_create_requiere_nombre():
    c = _make_app()
    r = c.post('/api/sets', json={'model_urn': 'x'})  # falta name
    assert r.status_code == 400


def test_set_delete_solo_admin():
    c = _make_app(role='user')  # no admin
    r = c.delete('/api/sets/1')
    assert r.status_code == 403


# ── Atributos personalizados ─────────────────────────────────────────
def test_attr_def_create_solo_admin():
    c = _make_app(role='user')
    r = c.post('/api/attrs/defs', json={'model_urn': 'x', 'name': 'Disciplina'})
    assert r.status_code == 403


def test_attr_def_tipo_invalido():
    c = _make_app(role='admin')
    r = c.post('/api/attrs/defs', json={'model_urn': 'x', 'name': 'D', 'attr_type': 'inventado'})
    assert r.status_code == 400


def test_attr_def_delete_solo_admin():
    c = _make_app(role='user')
    r = c.delete('/api/attrs/defs/1')
    assert r.status_code == 403


# ── Documentos de elemento (reemplazo del mutate-bind roto) ──────────
def test_element_doc_requiere_url():
    c = _make_app()
    r = c.post('/api/element-docs', json={'external_id': 'abc'})  # falta url
    assert r.status_code == 400


def test_element_doc_get_requiere_external_id():
    c = _make_app()
    r = c.get('/api/element-docs')  # falta external_id
    assert r.status_code == 400


# ── Niveles de permiso (regresion del bug frontend/backend desalineados) ──
def test_niveles_de_permiso_validos():
    """El modal de permisos de frontend-docs DEBE ofrecer exactamente estos
    niveles. Si alguien los cambia en backend sin actualizar el frontend,
    otorgar permisos vuelve a fallar con 'Nivel invalido' (bug ya corregido)."""
    from folder_permissions import PERMISSION_LEVELS
    esperados = {'none', 'viewer', 'view_download', 'view_markup', 'edit', 'admin'}
    assert set(PERMISSION_LEVELS.keys()) == esperados
    # Los que ofrece el modal (sin 'none', que es ausencia de permiso)
    del_modal = {'viewer', 'view_download', 'view_markup', 'edit', 'admin'}
    assert del_modal <= set(PERMISSION_LEVELS.keys())


# ── PDF tools (anotaciones) ──────────────────────────────────────────
def test_pdf_markup_requiere_campos():
    import importlib
    from flask import Flask, g
    app = Flask(__name__)
    mod = importlib.import_module('routes.pdf_tools')
    app.register_blueprint(mod.pdf_tools_bp)

    @app.before_request
    def _u():
        g.current_user = {'role': 'admin', 'name': 'T'}

    c = app.test_client()
    assert c.post('/api/pdf/markups', json={'node_id': 1}).status_code == 400  # faltan campos
    assert c.get('/api/pdf/markups').status_code == 400  # falta node_id
