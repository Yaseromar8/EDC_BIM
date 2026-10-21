# -*- coding: utf-8 -*-
"""Presencia de la web para el plugin de Revit (docs/rendimiento/01 §H2).

Antes: latido cada 5 s sobre UNA fila por obra (project, 'web'); con 20 usuarios, escrituras que se
bloqueaban entre sí y el último pisaba el user_id del resto. Ahora: una fila por usuario ('web:<id>') y una
ventana de presencia de 150 s, compatible con el latido de 30–60 s del visor y con el plugin ya compilado."""
import contextlib

import pytest
from flask import Flask, g

import db
from routes import link


class Cursor:
    def __init__(self, registro, filas):
        self.registro, self.filas = registro, filas

    def execute(self, sql, params=None):
        self.registro.append((' '.join(sql.split()), params))

    def fetchall(self):
        return self.filas


class Conn:
    def __init__(self, registro, filas):
        self.registro, self.filas = registro, filas

    def cursor(self):
        return Cursor(self.registro, self.filas)

    def commit(self):
        self.registro.append(('COMMIT', None))


@pytest.fixture
def banco(monkeypatch):
    registro, filas = [], []
    monkeypatch.setattr(db, 'get_db_connection', lambda: contextlib.nullcontext(Conn(registro, filas)))
    monkeypatch.setattr(link, '_check_project_access', lambda project: None)
    monkeypatch.setattr(link, '_ensure_tables', lambda: None)
    app = Flask(__name__)
    app.register_blueprint(link.link_bp)

    def llamar(metodo, ruta, usuario='19', **kw):
        with app.test_request_context(ruta, method=metodo, **kw):
            g.current_user = {'id': usuario} if usuario else None
            vista = app.view_functions[app.url_map.bind('x').match(ruta.split('?')[0], method=metodo)[0]]
            r = vista()
            return r[0].get_json(), r[1]

    return registro, filas, llamar


def test_cada_usuario_late_su_propia_fila(banco):
    registro, _, llamar = banco
    assert llamar('POST', '/api/link/web-presence', json={'project': 'proyectos/PQT8'})[1] == 200
    sql, params = next(x for x in registro if x[0].startswith('INSERT INTO link_presence'))
    assert params == ('proyectos/PQT8', 'web:19', '19')
    assert 'ON CONFLICT (project, agent)' in sql


def test_sin_usuario_conserva_la_fila_antigua(banco):
    registro, _, llamar = banco
    llamar('POST', '/api/link/web-presence', usuario=None, json={'project': 'p'})
    _, params = next(x for x in registro if x[0].startswith('INSERT INTO link_presence'))
    assert params == ('p', 'web', None)


def test_frentes_activos_del_usuario_con_ventana_de_150_s(banco):
    registro, filas, llamar = banco
    filas.extend([('proyectos/PQT8',), ('proyectos/OTRA',)])
    cuerpo, codigo = llamar('GET', '/api/link/active-frentes')
    assert codigo == 200 and cuerpo['active'] == 'proyectos/PQT8'
    sql, params = registro[0]
    assert params == (150, 'web:19', '19')
    assert 'GROUP BY project' in sql  # la fila nueva y la antigua no duplican el frente


def test_web_conectado_mira_cualquier_fila_web_reciente(banco):
    _, filas, llamar = banco
    filas.extend([('web:19', 40.0), ('web:7', 400.0), ('revit', 3.0)])
    cuerpo, _ = llamar('GET', '/api/link/status?project=p')
    assert cuerpo['web_connected'] is True and cuerpo['revit_connected'] is True
    filas[:] = [('web:19', 200.0), ('web', 500.0)]
    cuerpo, _ = llamar('GET', '/api/link/status?project=p')
    assert cuerpo['web_connected'] is False and cuerpo['revit_connected'] is False
