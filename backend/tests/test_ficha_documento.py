"""Lo conectado a un documento: la pestaña «Relacionados» de la ficha (14-oct-2026).

Fija que cada bloque busca por el ID del documento en los dos formatos de las
listas JSONB, que una tabla que falta o falla no deja sin datos a las demás, y
que el plan de entregas dice el estado con el mismo cálculo que su pantalla.
"""
import datetime as dt
import json

import ficha_documento as f

OBRA = 'obra/PQT8'


class Cur:
    def __init__(self, tablas=('doc_reviews', 'transmittals', 'doc_rfis', 'plan_entregas', 'cad_review_marks'),
                 falla=None):
        self.tablas, self.falla = set(tablas), falla
        self.sql, self.r = [], []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sql.append((s, params))
        if s.startswith('SELECT to_regclass'):
            self.r = [('x',)] if params[0].split('.')[-1] in self.tablas else [(None,)]
        elif self.falla and f'FROM {self.falla}' in s:
            raise RuntimeError('columna inexistente')
        elif 'FROM doc_reviews' in s:
            self.r = [(41, 'Planos de drenaje', 'approved', 'PUBLISHED', dt.datetime(2026, 10, 12), None)]
        elif 'FROM transmittals' in s:
            self.r = [(12, 12, 'Entrega a Supervisión', 'eva', dt.datetime(2026, 9, 22), 1)]
        elif 'FROM doc_rfis' in s:
            self.r = [('u-7', 'RFI-007', 'Cota de fondo', 'Respondido', dt.datetime(2026, 9, 15))]
        elif 'FROM plan_entregas' in s:
            self.r = [('MIDP', '500125-X', 'Etapa 2', dt.date(2026, 10, 1))]
        elif 'FROM cad_review_marks' in s:
            self.r = [(2,)]
        else:
            self.r = []

    def fetchone(self):
        return self.r[0] if self.r else None

    def fetchall(self):
        return self.r


def test_trae_cada_bloque_por_el_id_del_documento():
    c = Cur()
    r = f.relacionados(c, OBRA, 'nodo-1', 'PUBLISHED')
    assert r['revisiones'][0]['id'] == 41 and r['revisiones'][0]['resultado'] == 'PUBLISHED'
    assert r['envios'][0]['numero'] == 12 and r['envios'][0]['acuses'] == 1
    assert r['rfis'][0]['codigo'] == 'RFI-007'
    assert r['plan'][0]['estado'] == 'entregado'          # vinculado y publicado
    assert r['marcas'] == {'publicadas': 2}
    # Los dos formatos JSONB: {"node_id": …} y el antiguo {"id": …}.
    s, p = next(x for x in c.sql if 'FROM doc_reviews' in x[0])
    assert p[0] == OBRA and json.loads(p[1]) == [{'node_id': 'nodo-1'}] and json.loads(p[2]) == [{'id': 'nodo-1'}]
    # Las marcas: solo las publicadas y no borradas.
    s, _ = next(x for x in c.sql if 'FROM cad_review_marks' in x[0])
    assert 'published' in s and 'deleted_at IS NULL' in s


def test_una_tabla_que_falta_sale_vacia_y_las_demas_siguen():
    r = f.relacionados(Cur(tablas=('doc_reviews',)), OBRA, 'nodo-1')
    assert len(r['revisiones']) == 1
    assert r['envios'] == [] and r['rfis'] == [] and r['plan'] == [] and r['marcas'] == {'publicadas': 0}


def test_una_consulta_que_falla_no_aborta_las_otras():
    c = Cur(falla='transmittals')
    r = f.relacionados(c, OBRA, 'nodo-1', 'WIP')
    assert r['envios'] == []
    assert r['rfis'][0]['codigo'] == 'RFI-007'
    assert r['plan'][0]['estado'] == 'vinculado'          # vinculado y sin publicar
    # El fallo se deshizo con su SAVEPOINT, sin tocar la transacción de la ruta.
    assert any(s == 'ROLLBACK TO SAVEPOINT relacionados' for s, _ in c.sql)
