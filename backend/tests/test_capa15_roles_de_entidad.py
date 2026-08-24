# -*- coding: utf-8 -*-
"""CAPA 15 · ACCOUNT ROLES — delegación acotada, sin escalada.

El problema que cierra: solo existían `user` y Entity Admin. Quien tenía que
dar de alta gente acababa siendo custodio de la instancia entera.

LAS TRES SEPARACIONES QUE NO SE PUEDEN ROMPER, probadas aquí:

    ACCOUNT ROLE ≠ PROJECT ADMIN          no administra ninguna obra
    ACCOUNT ROLE ≠ MEMBER TOOL ACCESS     no abre ninguna herramienta
    ACCOUNT ROLE ≠ RESOURCE PERMISSION    no concede ni un documento

Y la propiedad que impide que la delegación se convierta en escalada:
REPARTIR FACULTADES NO SE DELEGA. Solo el Entity Admin.
"""
import ast
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _Cur:
    def __init__(self, facultades=None, revienta=False):
        self._f = facultades or []
        self._revienta = revienta
        self.sql = []
    def execute(self, sql, params=None):
        if self._revienta:
            raise RuntimeError('roles_de_entidad no existe')
        self.sql.append((' '.join(sql.split()).upper(), params))
    def fetchall(self):
        return [(f,) for f in self._f]
    def fetchone(self):
        return None


# ── El catálogo y las facultades efectivas ──────────────────────────────────

def test_el_catalogo_es_cerrado():
    import roles_de_entidad as rde
    assert set(rde.CODIGOS) == {'gestionar_usuarios', 'gestionar_obras',
                                'gestionar_empresas', 'gestionar_perfiles'}


def test_el_entity_admin_las_tiene_todas_sin_filas():
    """Su poder no sale de esta tabla: si saliera, borrar filas dejaría a la
    entidad sin custodio."""
    import roles_de_entidad as rde
    cur = _Cur()
    assert rde.facultades_de(cur, {'id': 2, 'role': 'admin'}) == set(rde.CODIGOS)
    assert cur.sql == [], 'no debería ni consultar la tabla'


def test_un_delegado_tiene_solo_lo_concedido():
    import roles_de_entidad as rde
    cur = _Cur(['gestionar_usuarios'])
    f = rde.facultades_de(cur, {'id': 7, 'role': 'user'})
    assert f == {'gestionar_usuarios'}
    assert not rde.puede(cur, {'id': 7, 'role': 'user'}, 'gestionar_obras')


def test_sin_filas_no_hay_ninguna_facultad():
    import roles_de_entidad as rde
    assert rde.facultades_de(_Cur(), {'id': 7, 'role': 'user'}) == set()


def test_si_no_se_puede_leer_NO_hay_facultad():
    """FAIL-CLOSED, y es la diferencia con las capas 16 y 08: aquellas
    deciden DISPONIBILIDAD y se abren ante un fallo de infraestructura para
    no dejar una obra inservible. Esta es AUTORIZACIÓN — ante la duda, no."""
    import roles_de_entidad as rde
    assert rde.facultades_de(_Cur(revienta=True), {'id': 7, 'role': 'user'}) == set()


def test_una_facultad_desconocida_no_se_escribe():
    import roles_de_entidad as rde
    with pytest.raises(ValueError):
        rde.fijar(_Cur(), 7, 'gobernar_el_mundo', True, 'admin')


def test_la_guardia_explica_que_falta():
    import roles_de_entidad as rde
    from flask import Flask
    app = Flask(__name__)
    with app.app_context():
        negativa = rde.guardia(_Cur(), {'id': 7, 'role': 'user'},
                               'gestionar_obras', 'crear una obra')
        assert negativa is not None
        cuerpo, http = negativa
        assert http == 403
        d = cuerpo.get_json()
        assert d['code'] == 'SIN_FACULTAD_DE_ENTIDAD'
        assert 'Gestionar obras' in d['error']


# ── LAS TRES SEPARACIONES ───────────────────────────────────────────────────

def test_una_facultad_no_es_project_admin_ni_permiso_ni_herramienta():
    """El módulo no toca membresía, ni permisos de carpeta, ni acceso a
    herramientas: comprobado sobre el ÁRBOL SINTÁCTICO y sobre el SQL que
    escribe. Una facultad de cuenta es un acto de ENTIDAD y termina ahí."""
    ruta = os.path.join(RAIZ, 'roles_de_entidad.py')
    arbol = ast.parse(io.open(ruta, encoding='utf-8').read())
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(a.name for a in nodo.names)
        elif isinstance(nodo, ast.ImportFrom):
            importados.add(nodo.module or '')
    for prohibido in ('permiso_documental', 'folder_permissions',
                      'acceso_a_herramientas', 'administracion_de_obra'):
        assert prohibido not in importados, (
            'la capa 15 depende de %s: dejaría de ser una facultad de cuenta' % prohibido)

    sql = ' '.join(c.value.upper() for c in ast.walk(arbol)
                   if isinstance(c, ast.Constant) and isinstance(c.value, str))
    for tabla in ('PROJECT_USERS', 'FOLDER_PERMISSIONS', 'MEMBER_TOOL_ACCESS',
                  'PROJECT_TOOLS'):
        assert tabla not in sql, 'la capa 15 escribe o lee %s' % tabla


def test_el_perimetro_de_obra_no_consulta_facultades_de_entidad():
    """Una facultad de cuenta NO puede abrir la puerta de una obra: el
    perímetro no sabe que esta capa existe."""
    for modulo in ('perimetro_de_obra.py', 'permiso_documental.py',
                   'acceso_a_herramientas.py', 'administracion_de_obra.py'):
        arbol = ast.parse(io.open(os.path.join(RAIZ, modulo), encoding='utf-8').read())
        importados = set()
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                importados.update(a.name for a in nodo.names)
            elif isinstance(nodo, ast.ImportFrom):
                importados.add(nodo.module or '')
        assert 'roles_de_entidad' not in importados, (
            '%s consulta facultades de entidad: una facultad de cuenta estaría '
            'concediendo acceso dentro de una obra' % modulo)


# ── LA ESCALADA, IMPEDIDA ───────────────────────────────────────────────────

def test_repartir_facultades_no_se_delega():
    """Si un delegado pudiera concederse facultades o dárselas a otros, la
    delegación acotada sería una escalada silenciosa. La ruta que reparte
    NO acepta `facultad=` — exige Entity Admin siempre."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'auth.py'), encoding='utf-8').read()
    i = fuente.index('def cambiar_facultad')
    cuerpo = fuente[i:i + 1200]
    assert '_require_admin("repartir facultades de la entidad")' in cuerpo
    assert 'facultad=' not in cuerpo.split('registrar_evento')[0].replace(
        "facultad not in rde.CODIGOS", '').replace("'facultad': facultad", '')


def test_las_facultades_estan_conectadas_a_actos_reales():
    """Una tabla de facultades que nadie consulta es decoración. Estos son
    los actos que la delegación abre de verdad."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'auth.py'), encoding='utf-8').read()
    for acto, facultad in [('invitar usuarios', 'gestionar_usuarios'),
                           ('reactivar un usuario', 'gestionar_usuarios'),
                           ('crear empresas en el catálogo de la entidad', 'gestionar_empresas'),
                           ('administrar los perfiles de acceso', 'gestionar_perfiles')]:
        assert "_require_admin(\"%s\", facultad='%s')" % (acto, facultad) in fuente, (
            'el acto «%s» no está conectado a la facultad %s' % (acto, facultad))
