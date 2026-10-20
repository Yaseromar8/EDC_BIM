"""Observación de documento (migración 37) en /api/issues; sin base real.

La observación nace de una MARCA del lector (routes/pdf_tools.py, probado en
test_marcas_con_enlace.py). Aquí, lo que cambia en las incidencias: el alta
genérica no la acepta sin su marca, y el comentario solo se añade.
"""
from flask import Flask, g
import pytest

import routes.issues as issues


class Cursor:
    def __init__(self, rows):
        self.rows, self.queries = rows, []

    def execute(self, sql, params=()):
        self.queries.append((sql, params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


class Connection:
    def __init__(self, cur):
        self.cur, self.committed = cur, False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def cursor(self):
        return self.cur

    def commit(self):
        self.committed = True


def _issue(history=None):
    """Una fila de doc_issues en el orden de issues._COLS."""
    fila = [None] * 28
    fila[0], fila[1], fila[2], fila[3], fila[4], fila[5] = 55, 3, 'obra', 'ISS-012', 'OBSERVACION', 'Cota'
    fila[10], fila[11], fila[12], fila[15] = 7, 9, 7, 'Abierto'
    fila[23] = history or []
    return tuple(fila)


@pytest.fixture
def app(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(issues.issues_bp, url_prefix='/api/issues')
    app.before_request(lambda: setattr(g, 'current_user', {'id': 9, 'name': 'Luis', 'email': 'luis@obra.pe'}))
    monkeypatch.setattr(issues, 'guardia_de_recurso', lambda tabla, valor: None)
    monkeypatch.setattr(issues, 'guardia_de_obra', lambda obra, accion='': None)
    monkeypatch.setattr(issues, 'resolve_project_id', lambda urn: 3)
    return app


def _conectar(monkeypatch, rows):
    cur = Cursor(rows)
    conn = Connection(cur)
    monkeypatch.setattr(issues, 'get_db_connection', lambda: conn)
    return cur, conn


def test_el_alta_generica_no_crea_una_observacion_sin_su_marca(app, monkeypatch):
    cur, _ = _conectar(monkeypatch, [])
    r = app.test_client().post('/api/issues', json={'model_urn': 'obra', 'tipo': 'observacion',
                                                     'titulo': 'X', 'responsable_id': 7, 'verificador_id': 9})
    assert r.status_code == 409 and r.get_json()['code'] == 'OBSERVACION_DESDE_MARCA'
    assert not cur.queries


def test_comentar_solo_anade_al_historial(app, monkeypatch):
    previo = [{'event': 'detected', 'by': 'ana@obra.pe'}]
    cur, conn = _conectar(monkeypatch, [_issue(previo), _issue()])
    r = app.test_client().post('/api/issues/55/comentar', json={'texto': '  Ya subí la Rev 2  '})
    assert r.status_code == 200 and conn.committed
    sql, params = [q for q in cur.queries if q[0].startswith('UPDATE doc_issues SET history')][0]
    import json
    h = json.loads(params[0])
    assert h[0] == previo[0]                                   # lo anterior no se toca
    assert h[1]['event'] == 'commented' and h[1]['texto'] == 'Ya subí la Rev 2' and h[1]['by'] == 'luis@obra.pe'
    assert not any(q[0].startswith('UPDATE') and 'estado' in q[0] for q in cur.queries)     # comentar no mueve el estado


def test_comentar_vacio_o_largo_no_escribe(app, monkeypatch):
    for texto in ('   ', 'x' * 2001):
        cur, conn = _conectar(monkeypatch, [_issue()])
        assert app.test_client().post('/api/issues/55/comentar', json={'texto': texto}).status_code == 400
        assert not cur.queries and not conn.committed
