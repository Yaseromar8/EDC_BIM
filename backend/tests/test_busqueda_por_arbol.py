"""La busqueda de documentos filtra por el ARBOL de la obra, no por su id.

En produccion la obra es `projects.id = '1'` y sus documentos viven bajo
`file_nodes.model_urn = 'proyectos/PQT8_TALARA'`. Hasta el 14-oct-2026 la
consulta comparaba el id con el model_urn y no encontraba nada; el ensayo usaba
el mismo texto para los dos y lo tapaba. Estas pruebas usan valores DISTINTOS.
"""
import io
import os
import re

import busqueda_de_documentos as busqueda
import permiso_documental as pd

OBRA = '1'
ARBOL = 'proyectos/PQT8_TALARA'


class _Cur:
    def __init__(self):
        self.params = None

    def execute(self, sql, params=None):
        if 'WITH RECURSIVE cand' in sql:
            self.params = params

    def fetchall(self):
        return []


def _usuario():
    return {'id': 7, 'role': 'admin'}


def test_la_consulta_filtra_por_el_arbol(monkeypatch):
    monkeypatch.setattr(pd, 'sujetos_de', lambda cur, usuario, obra: {pd.USER: '7'})
    cur = _Cur()
    busqueda.buscar(cur, OBRA, 'RFI', _usuario(), arbol=ARBOL)
    assert cur.params['arbol'] == ARBOL, 'los documentos viven bajo el arbol, no bajo el id'


def test_los_permisos_siguen_preguntandose_por_la_obra(monkeypatch):
    vistas = []
    monkeypatch.setattr(pd, 'sujetos_de',
                        lambda cur, usuario, obra: vistas.append(obra) or {pd.USER: '7'})
    busqueda.buscar(_Cur(), OBRA, 'RFI', _usuario(), arbol=ARBOL)
    assert vistas == [OBRA]


def test_el_sql_compara_model_urn_con_el_arbol():
    assert re.search(r"n\.model_urn\s*=\s*%\(arbol\)s", busqueda._BUSCAR)
    assert '%(obra)s' not in busqueda._BUSCAR


def test_la_ruta_resuelve_el_arbol_y_se_lo_pasa():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fuente = io.open(os.path.join(raiz, 'routes', 'documents.py'), encoding='utf-8').read()
    cuerpo = fuente.split("def buscar_documentos():", 1)[1].split('\n@documents_bp.route', 1)[0]
    assert 'resolve_project_document_tree(obra)' in cuerpo
    assert 'arbol=arbol' in cuerpo
