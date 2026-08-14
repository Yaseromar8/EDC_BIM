# -*- coding: utf-8 -*-
"""El plan de entrega (MIDP/TIDP) como compromiso, antes que como documento.

LO QUE FIJA ESTO
----------------
Un compromiso NO es un documento. El plan dice que se prometio entregar; el ECD
dice que hay. Hasta ahora el plan vivia en un Excel fuera del sistema y nadie
podia contestar "¿vamos al dia?" sin cotejar a mano.

Las reglas que no se pueden romper:
  · el plan entra SIN tocar ficheros: un entregable existe como compromiso
    meses antes de que exista el PDF, y ese periodo es el que hay que ver;
  · reimportar un plan corregido NO puede deshacer los vinculos ya hechos;
  · un compromiso no se puede atar a un documento de OTRA obra;
  · "entregado" es PUBLICADO. Compartido es todavia revision, no entrega.

DB-free: cursor de mentira.
"""
import datetime

import pytest

import plan_de_entrega as plan

HOY = datetime.date(2026, 8, 13)
AYER = datetime.date(2026, 8, 12)
MANANA = datetime.date(2026, 8, 14)


class CursorFalso:
    """Simula plan_entregas + el LEFT JOIN con file_nodes."""

    def __init__(self, filas=()):
        # cada fila: dict con las claves que devuelve listar()
        self.filas = list(filas)
        self._r = []
        self.ejecutadas = []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.ejecutadas.append((s, params))
        self._r = []
        if s.startswith('SELECT p.id, p.tipo'):
            self._r = [(
                f['id'], f.get('tipo', 'MIDP'), f['identificador'], f.get('titulo'),
                f.get('disciplina'), f.get('volumen'), f.get('formato'),
                f.get('idoneidad_prevista'), f.get('revision_prevista'),
                f.get('responsable'), f.get('fecha'), f.get('hito'),
                f.get('node_id'), f.get('doc_nombre'), f.get('doc_estado'),
                f.get('doc_idoneidad'), f.get('doc_revision'),
            ) for f in self.filas]

    def fetchall(self):
        return self._r

    def fetchone(self):
        return self._r[0] if self._r else None


def _fila(**kw):
    base = {'id': 1, 'identificador': '500125-PQ08-DRE-PLA-0010', 'titulo': 'Planta',
            'disciplina': 'DRE'}
    base.update(kw)
    return base


# ── El estado se calcula, no se guarda ─────────────────────────────────────

def test_sin_documento_y_con_fecha_futura_esta_comprometido():
    cur = CursorFalso([_fila(fecha=MANANA)])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['estado'] == plan.COMPROMETIDO


def test_sin_documento_y_con_la_fecha_pasada_esta_vencido():
    """Es la fila que hay que llevar a la reunion."""
    cur = CursorFalso([_fila(fecha=AYER)])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['estado'] == plan.VENCIDO


def test_con_documento_compartido_esta_vinculado_pero_NO_entregado():
    """Compartido es revision. Contarlo como entregado inflaria el avance del
    expediente, que es justo el numero que se lleva a una valorizacion."""
    cur = CursorFalso([_fila(fecha=MANANA, node_id='abc', doc_estado='SHARED')])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['estado'] == plan.VINCULADO


def test_con_documento_publicado_esta_entregado():
    cur = CursorFalso([_fila(fecha=AYER, node_id='abc', doc_estado='PUBLISHED')])
    r = plan.listar(cur, 'obra/X', hoy=HOY)[0]
    assert r['estado'] == plan.ENTREGADO
    # Y aunque la fecha haya pasado, ya no cuenta como vencido: esta entregado.
    assert r['estado'] != plan.VENCIDO


def test_el_estado_no_se_guarda_en_la_base():
    """Un estado guardado se queda viejo en cuanto pasa la medianoche."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def asegurar_tablas'):fuente.index('def _fecha')]
    assert 'estado' not in cuerpo.replace('idoneidad', '').replace('_estado', ''), \
        'la tabla no debe tener columna de estado: se calcula al leer'


# ── Lo prometido frente a lo entregado ─────────────────────────────────────

def test_se_ve_si_lo_entregado_cumple_la_idoneidad_prometida():
    """Que el documento exista no significa que cumpla: se puede haber entregado
    con una idoneidad menor que la comprometida."""
    cur = CursorFalso([_fila(node_id='abc', doc_estado='PUBLISHED',
                             idoneidad_prevista='A1', doc_idoneidad='S3')])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['cumple_idoneidad'] is False

    cur = CursorFalso([_fila(node_id='abc', doc_estado='PUBLISHED',
                             idoneidad_prevista='A1', doc_idoneidad='A1')])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['cumple_idoneidad'] is True


def test_sin_documento_no_se_opina_sobre_la_idoneidad():
    cur = CursorFalso([_fila(idoneidad_prevista='A1')])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['cumple_idoneidad'] is None


# ── El resumen, que es la cifra de la reunion ──────────────────────────────

def test_el_resumen_cuenta_por_estado_y_da_el_porcentaje():
    cur = CursorFalso([
        _fila(id=1, fecha=MANANA),                                    # comprometido
        _fila(id=2, fecha=AYER),                                      # vencido
        _fila(id=3, node_id='a', doc_estado='PUBLISHED'),             # entregado
        _fila(id=4, node_id='b', doc_estado='SHARED'),                # vinculado
    ])
    r = plan.resumen(cur, 'obra/X', hoy=HOY)
    assert r['total'] == 4
    assert r['entregados'] == 1
    assert r['vencidos'] == 1
    assert r['porcentaje_entregado'] == 25.0


def test_un_plan_vacio_no_divide_entre_cero():
    assert plan.resumen(CursorFalso([]), 'obra/X')['porcentaje_entregado'] == 0.0


# ── Reglas de la importacion y del vinculo ─────────────────────────────────

def test_reimportar_el_plan_no_puede_deshacer_los_vinculos():
    """Corregir el MIDP no puede tirar por tierra el trabajo de haber atado
    cada compromiso con su documento."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    conflicto = fuente[fuente.index('ON CONFLICT (model_urn, tipo, identificador)'):]
    conflicto = conflicto[:conflicto.index('RETURNING')]
    for prohibido in ('file_node_id', 'vinculado_en', 'vinculado_por'):
        assert prohibido not in conflicto, (
            f'la reimportacion pisa {prohibido}: perderia los vinculos ya hechos')


def test_no_se_puede_atar_un_compromiso_a_un_documento_de_otra_obra():
    """Ademas de convertir el plan en una mentira, seria una fuga entre obras."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def vincular('):fuente.index('def desvincular(')]
    assert 'n.model_urn = p.model_urn' in cuerpo, (
        'vincular() tiene que exigir que el documento sea de la MISMA obra')


def test_las_sugerencias_no_vinculan_solas():
    """El nombre de un fichero se parece al codigo pero no ES el codigo. Atar
    automaticamente por parecido acabaria atando el plano equivocado."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def sugerir_vinculos('):]
    assert 'UPDATE' not in cuerpo, 'sugerir_vinculos no puede escribir nada'


# ── Fechas de Excel ────────────────────────────────────────────────────────

@pytest.mark.parametrize('entrada,esperado', [
    (datetime.datetime(2026, 8, 13, 10, 30), datetime.date(2026, 8, 13)),
    (datetime.date(2026, 8, 13), datetime.date(2026, 8, 13)),
    ('2026-08-13', datetime.date(2026, 8, 13)),
    ('13/08/2026', datetime.date(2026, 8, 13)),
    ('', None),
    (None, None),
    ('cuando se pueda', None),
])
def test_las_fechas_del_excel_se_entienden_o_se_dejan_vacias(entrada, esperado):
    """Una fecha mal leida es peor que ninguna: convierte en 'vencido' algo que
    no lo esta, o al reves."""
    assert plan._fecha(entrada) == esperado


# ── La API nace con la guardia puesta ──────────────────────────────────────

def test_todos_los_manejadores_del_plan_comprueban_la_obra():
    """El resto de la plataforma se escribio sin guardia y costo un dia entero
    cerrarlo ruta por ruta. Una familia nueva no puede repetir eso."""
    import io
    import os
    import re
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'plan_entregas.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    trozos = re.split(r'@plan_bp\.route', fuente)[1:]
    assert trozos, 'no se encontro ninguna ruta'
    for t in trozos:
        url = re.match(r"\(\s*'([^']+)'", t.strip())
        assert 'guardia_de_obra' in t, f'la ruta {url.group(1) if url else "?"} no comprueba la obra'
