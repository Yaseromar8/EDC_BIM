# -*- coding: utf-8 -*-
"""Toda ruta que actúa sobre UNA MARCA de un plano tiene que saber de qué obra es.

11-nov-2026, visto por el dueño en producción: «No se pudo determinar a que obra pertenece esta peticion» en el
lector de planos. Las rutas `/api/pdf/markups/<id>...` solo traen el id de la marca; el control por obra
(`auth_middleware`, bajo ENFORCE_PROJECT_AUTHZ) necesita que `perimetro_de_obra.RUTAS_POR_RECURSO` le diga dónde
mirar, y solo estaba registrada la de borrar. A quien no es administrador de la entidad se le cortaba, antes de
llegar al manejador: ver la observación de una marca, comentarla, editarla, publicarla y llevarla a la vigente.

Sin base de datos: se sustituye la lectura de la fila.
"""
import re
from pathlib import Path

import perimetro_de_obra as pm

FUENTE = Path(__file__).resolve().parents[1] / 'routes' / 'pdf_tools.py'
DE_MARCA = re.compile(r"@pdf_tools_bp\.route\('(/api/pdf/markups/<int:markup_id>[^']*)'[^\n]*\n(?:@[^\n]*\n)*def (\w+)\(")


def _rutas_de_marca():
    return DE_MARCA.findall(FUENTE.read_text(encoding='utf-8'))


def test_hay_rutas_de_marca_que_vigilar():
    nombres = {nombre for _ruta, nombre in _rutas_de_marca()}
    assert {'delete_markup', 'publicar_markup', 'editar_markup', 'comentar_marca', 'llevar_a_la_vigente',
            'crear_observacion', 'leer_observacion'} <= nombres


def test_cada_ruta_de_marca_resuelve_su_obra_por_la_fila_de_la_marca():
    """También las que se añadan después: una ruta nueva sobre una marca sin registrar falla aquí, no en producción."""
    sin_registrar = [f'{nombre} ({ruta})' for ruta, nombre in _rutas_de_marca()
                     if pm.RUTAS_POR_RECURSO.get(nombre) != ('pdf_markups', 'markup_id')]
    assert sin_registrar == []


def test_la_obra_sale_de_la_fila_y_no_de_lo_que_diga_el_cliente(monkeypatch):
    leidas = []

    class Cursor:
        def execute(self, sql, args=None):
            leidas.append((' '.join(sql.split()), args))

        def fetchone(self):
            return ('proyectos/PQT8_TALARA',)

    class Conexion:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return Cursor()

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conexion())
    monkeypatch.setattr(db, 'resolve_project_id', lambda valor: 'obra-7' if valor == 'proyectos/PQT8_TALARA' else None)
    for nombre in ('leer_observacion', 'crear_observacion', 'comentar_marca', 'editar_markup', 'publicar_markup',
                   'llevar_a_la_vigente'):
        leidas.clear()
        assert pm.obra_de_la_peticion('pdf_tools.' + nombre, {'markup_id': 41}) == 'obra-7', nombre
        assert leidas == [('SELECT model_urn FROM pdf_markups WHERE id::text = %s', ('41',))], nombre


def test_una_marca_que_no_existe_no_resuelve_obra(monkeypatch):
    class Cursor:
        def execute(self, *a):
            pass

        def fetchone(self):
            return None

    class Conexion:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def cursor(self):
            return Cursor()

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conexion())
    assert pm.obra_de_la_peticion('pdf_tools.leer_observacion', {'markup_id': 999}) is None
