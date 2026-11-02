"""Contrato local de observaciones_en_lista (el aviso junto al nombre del plano en Archivos); sin base real."""
from datetime import datetime

import observaciones_en_lista as obs


class Cursor:
    def __init__(self, filas):
        self.filas, self.consultas = list(filas), []

    def execute(self, sql, params=()):
        self.consultas.append((sql, params))

    def fetchall(self):
        return self.filas.pop(0) if self.filas else []


def test_sin_planos_no_pregunta_nada():
    cur = Cursor([])
    assert obs.resumen(cur, []) == {} and cur.consultas == []


def test_cuenta_abiertas_vencidas_y_cerradas_y_la_proxima():
    vence = datetime(2026, 11, 5, 12, 0)
    cur = Cursor([[('a', 2, 1, 0), ('b', 0, 0, 3), ('c', 0, 0, 0)],
                  [('a', vence, 'Ana Torres')]])
    r = obs.resumen(cur, ['a', 'b', 'c'])
    assert r == {'a': {'abiertas': 2, 'vencidas': 1, 'cerradas': 0, 'vence': vence.isoformat(), 'responsable': 'Ana Torres'},
                 'b': {'abiertas': 0, 'vencidas': 0, 'cerradas': 3, 'vence': None, 'responsable': None}}
    # «c» no tiene nada vivo ni cerrado (p. ej. solo anuladas): no se pinta aviso.
    sql, params = cur.consultas[0]
    assert params[:6] == ('MARCA', 'OBSERVACION', ['a', 'b', 'c'], 'PLANO', 'OBSERVACION', ['a', 'b', 'c'])
    assert set(params[6]) == {'Abierto', 'En curso', 'En disputa', 'Corregido', 'Reabierto'}  # vivas (45)
    # La próxima en vencer solo se pregunta por los planos con abiertas.
    assert cur.consultas[1][1][2] == ['a'] and cur.consultas[1][1][5] == ['a']


def test_cuentan_las_de_una_marca_y_las_del_plano_entero():
    cur = Cursor([[]])
    obs.resumen(cur, ['a'])
    sql, params = cur.consultas[0]
    assert "i.origen_tipo = %s AND i.origen_id = m.id::text" in sql and params[0] == 'MARCA'
    # La del plano entero (docs/archivos/18): su origen es el documento y su versión, la primera evidencia.
    assert "i.origen_tipo = %s AND i.tipo = %s AND i.origen_id = ANY(%s)" in sql and params[3] == 'PLANO'
    assert "i.evidencia->0->>'version_id'" in sql
