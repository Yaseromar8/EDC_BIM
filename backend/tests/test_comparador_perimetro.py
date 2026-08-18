"""El comparador de versiones no comprobaba de qué obra eran los scopes.

EL AGUJERO QUE ESTAS PRUEBAS FIJAN
----------------------------------
Cuatro rutas -- `/api/compare/diff`, `/metrados`, `/element` y
`/element-metrados` -- recibían los dos lados de la comparación como scopes
ANIDADOS en el cuerpo:

    {"a": {"type": "frente", "value": "<obra ajena>"}, "b": {...}}

y no comprobaban NADA. Con una sesión válida y un `external_id`, se leían el
nombre y las propiedades COMPLETAS de elementos de cualquier obra, y los metrados
de cualquier frente.

No era un agujero que fuera a abrir ENFORCE: era de hoy. Y el control central
tampoco lo tapaba, porque `_request_project_id` solo mira las claves de PRIMER
NIVEL del cuerpo, y estos scopes van dentro de un objeto.

POR QUÉ LA GUARDIA RESUELVE LA OBRA DEL DATO
--------------------------------------------
Hay dos formas de scope. `{type:'frente'}` lleva el `model_urn`, y ahí la obra la
dice el valor. Pero `{type:'source'}` lleva un urn de VERSIÓN del modelo, que no
es una obra: esa hay que sacarla de `inventory_assets`. Aceptar el urn como si
fuera la obra sería volver a validar lo que el cliente DECLARA en vez de lo que
el dato ES -- que es exactamente la forma de C8.
"""
import os

import pytest
from flask import Flask, g

os.environ.setdefault('APP_SECRET', 'x' * 32)

OBRA_PROPIA = 'b.proj_talara'
OBRA_AJENA = 'b.proj_interferencias'


@pytest.fixture
def entorno(monkeypatch):
    compare = pytest.importorskip('routes.compare')

    estado = {'obras_del_usuario': {OBRA_PROPIA}}

    # La obra de un scope 'frente' se resuelve por su valor; aquí el mapa es
    # directo para no depender de la base.
    import db
    monkeypatch.setattr(db, 'resolve_project_id',
                        lambda v: v if v in (OBRA_PROPIA, OBRA_AJENA) else None)

    import perimetro_de_obra as pm
    monkeypatch.setattr(pm, 'resolve_project_id',
                        lambda v: v if v in (OBRA_PROPIA, OBRA_AJENA) else None,
                        raising=False)

    def falso_user_in_project(uid, pid):
        return pid in estado['obras_del_usuario']

    import auth_middleware as am
    monkeypatch.setattr(am, '_user_in_project', falso_user_in_project, raising=False)

    # `guardia_de_obra` consulta la pertenencia por su cuenta: se sustituye por
    # una que mira el mismo estado, para que la prueba hable de autorización y
    # no de cómo se consulta la base.
    from flask import jsonify

    def falsa_guardia(valor_obra, accion='esta operación'):
        usuario = getattr(g, 'current_user', None)
        if not usuario:
            return jsonify({'error': 'Autenticación requerida'}), 401
        if usuario.get('role') == 'admin':
            return None
        if valor_obra in estado['obras_del_usuario']:
            return None
        return jsonify({'error': 'Sin acceso a este proyecto'}), 403

    monkeypatch.setattr(pm, 'guardia_de_obra', falsa_guardia)

    app = Flask(__name__)
    return app, compare, estado


def _scope(obra):
    return {'type': 'frente', 'value': obra}


def test_no_se_comparan_elementos_de_una_obra_ajena(entorno):
    """El caso que hoy funcionaba: nombrar la obra ajena en el cuerpo."""
    app, compare, _e = entorno
    with app.test_request_context('/api/compare/element', method='POST'):
        g.current_user = {'id': 7, 'role': 'user'}
        negada = compare._guardia_scopes(
            {'external_id': 'abc', 'a': _scope(OBRA_AJENA), 'b': _scope(OBRA_AJENA)})
    assert negada is not None, 'se leyeron elementos de una obra ajena'
    _cuerpo, codigo = negada
    assert codigo == 403


def test_mezclar_la_propia_con_la_ajena_tampoco_cuela(entorno):
    """Comparar mezcla DOS scopes: bastaría con que uno fuera propio."""
    app, compare, _e = entorno
    with app.test_request_context('/api/compare/diff', method='POST'):
        g.current_user = {'id': 7, 'role': 'user'}
        negada = compare._guardia_scopes(
            {'a': _scope(OBRA_PROPIA), 'b': _scope(OBRA_AJENA)})
    assert negada is not None, (
        'poner la obra propia en un lado abrio la ajena en el otro: es la misma '
        'forma del hallazgo C8')


def test_la_propia_se_sigue_pudiendo_comparar(entorno):
    """Una guardia que también bloquea al dueño no se puede desplegar."""
    app, compare, _e = entorno
    with app.test_request_context('/api/compare/diff', method='POST'):
        g.current_user = {'id': 7, 'role': 'user'}
        negada = compare._guardia_scopes(
            {'a': _scope(OBRA_PROPIA), 'b': _scope(OBRA_PROPIA)})
    assert negada is None, 'el usuario no pudo comparar su propia obra'


def test_un_scope_que_no_resuelve_obra_se_niega(entorno):
    """No saber de qué obra es no puede resolverse dándolo por bueno."""
    app, compare, _e = entorno
    with app.test_request_context('/api/compare/diff', method='POST'):
        g.current_user = {'id': 7, 'role': 'user'}
        negada = compare._guardia_scopes(
            {'a': _scope('obra-que-no-existe'), 'b': _scope(OBRA_PROPIA)})
    assert negada is not None
    _cuerpo, codigo = negada
    assert codigo == 403


def test_sin_sesion_no_se_compara_nada(entorno):
    app, compare, _e = entorno
    with app.test_request_context('/api/compare/diff', method='POST'):
        g.current_user = None
        negada = compare._guardia_scopes({'a': _scope(OBRA_PROPIA), 'b': _scope(OBRA_PROPIA)})
    assert negada is not None
    _cuerpo, codigo = negada
    assert codigo == 401


def test_las_cuatro_rutas_llaman_a_la_guardia():
    """Escribir la guardia y no llamarla desde alguna ruta es el fallo de esta
    plataforma que más veces ha aparecido: un control que existe y no se invoca."""
    import ast
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'compare.py')
    src = io.open(ruta, encoding='utf-8').read()
    arbol = ast.parse(src)
    sin_guardia = []
    for n in ast.walk(arbol):
        if not isinstance(n, ast.FunctionDef):
            continue
        deco = ' '.join(ast.get_source_segment(src, d) or '' for d in n.decorator_list)
        if '.route(' not in deco:
            continue
        cuerpo = ast.get_source_segment(src, n) or ''
        # Las que reciben scopes son las que mandan 'a'/'b' al filtro.
        if '_scope_filter(' not in cuerpo:
            continue
        if '_guardia_scopes(' not in cuerpo:
            sin_guardia.append(n.name)
    assert not sin_guardia, (
        'estas rutas del comparador usan scopes y no comprueban de qué obra son: '
        + ', '.join(sin_guardia))
