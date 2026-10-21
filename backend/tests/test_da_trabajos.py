# -*- coding: utf-8 -*-
"""Trabajos de Design Automation que sobreviven a un reinicio y que ve cualquier proceso (sql/39).

Antes, la clave para cerrar la subida del resultado vivía solo en la memoria del proceso: un reinicio entre
el lanzamiento y el final perdía la extracción de Civil 3D; con dos procesos fallaría la mitad de las veces."""
import contextlib

import pytest
from flask import Flask

import db
from routes import civil_design_automation as da


class Base:
    """Una tabla da_trabajos de juguete que entiende las cuatro sentencias del módulo."""

    def __init__(self, existe=True):
        self.existe, self.filas = existe, {}

    def conexion(self):
        return contextlib.nullcontext(Conn(self))


class Cursor:
    def __init__(self, base):
        self.base, self.resultado = base, None

    def execute(self, sql, params=()):
        if not self.base.existe:
            raise RuntimeError('relation "da_trabajos" does not exist')
        s = ' '.join(sql.split())
        if s.startswith('INSERT INTO da_trabajos'):
            wid, clave, nombre = params
            self.base.filas[wid] = {'upload_key': clave, 'object_name': nombre}
        elif s.startswith('DELETE FROM da_trabajos'):
            pass
        elif s.startswith('SELECT object_name'):
            fila = self.base.filas.get(params[0])
            self.resultado = (fila['object_name'],) if fila else None
        elif s.startswith('UPDATE da_trabajos SET upload_key = NULL'):
            fila = self.base.filas.get(params[0])
            if fila and fila['upload_key'] is not None:
                self.resultado, fila['upload_key'] = (fila['upload_key'],), None
            else:
                self.resultado = None
        else:
            raise AssertionError(s)

    def fetchone(self):
        return self.resultado


class Conn:
    def __init__(self, base):
        self.base = base

    def cursor(self):
        return Cursor(self.base)

    def commit(self):
        pass


@pytest.fixture
def base(monkeypatch):
    b = Base()
    monkeypatch.setattr(db, 'get_db_connection', b.conexion)
    da.UPLOAD_KEYS.clear()
    da.RESULT_OBJECTS.clear()
    return b


def otro_proceso():
    da.UPLOAD_KEYS.clear()
    da.RESULT_OBJECTS.clear()


def test_otro_proceso_encuentra_el_trabajo(base):
    da._recordar_trabajo('wi1', 'clave-1', 'alignment_result_ab.json')
    otro_proceso()
    assert da._nombre_del_resultado('wi1') == 'alignment_result_ab.json'
    assert da._reclamar_clave_de_subida('wi1') == 'clave-1'


def test_la_clave_se_entrega_una_sola_vez(base):
    da._recordar_trabajo('wi1', 'clave-1', 'r.json')
    assert da._reclamar_clave_de_subida('wi1') == 'clave-1'
    otro_proceso()
    assert da._reclamar_clave_de_subida('wi1') is None


def test_sin_la_tabla_funciona_como_antes(base):
    base.existe = False
    da._recordar_trabajo('wi1', 'clave-1', 'r.json')
    assert da._nombre_del_resultado('wi1') == 'r.json'
    assert da._reclamar_clave_de_subida('wi1') == 'clave-1'
    assert da._reclamar_clave_de_subida('wi1') is None


def test_trabajo_anterior_a_la_tabla_usa_la_memoria(base):
    da.UPLOAD_KEYS['viejo'] = 'clave-vieja'  # lanzado antes de existir la fila
    assert da._reclamar_clave_de_subida('viejo') == 'clave-vieja'


def test_el_estado_cierra_la_subida_aunque_lo_atienda_otro_proceso(base, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # la ruta escribe last_report.txt en la carpeta actual
    da._recordar_trabajo('wi9', 'clave-9', 'sections_result_cd.json')
    otro_proceso()
    llamadas = []

    class Resp:
        def __init__(self, cuerpo):
            self.status_code, self._cuerpo, self.text, self.ok = 200, cuerpo, '', True

        def json(self):
            return self._cuerpo

    monkeypatch.setattr(da, 'get_internal_token', lambda: 'tok', raising=False)
    monkeypatch.setattr(da.requests, 'get', lambda url, **kw: Resp({'status': 'success'}))
    monkeypatch.setattr(da.requests, 'post', lambda url, **kw: (llamadas.append((url, kw.get('json'))), Resp({}))[1])
    import routes.digital_twin as dt
    monkeypatch.setattr(dt, 'get_app_bucket_key', lambda: 'bucket')
    app = Flask(__name__)
    with app.test_request_context('/api/civil/workitem-status/wi9'):
        r = da.get_workitem_status('wi9')
    assert r[1] == 200
    assert len(llamadas) == 1
    url, cuerpo = llamadas[0]
    assert '/objects/sections_result_cd.json/signeds3upload' in url and cuerpo == {'uploadKey': 'clave-9'}
