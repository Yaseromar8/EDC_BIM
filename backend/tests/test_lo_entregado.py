# -*- coding: utf-8 -*-
"""LO QUE UNA PERSONA YA ENTREGO Y ESPERA RESPUESTA (13-nov-2026), sin base de datos.

El dueño: «al inicio, agregar un resumen de cada usuario de lo que está pendiente, vencido y entregado». Y sobre
las nubes: «dice Entregar, pero ¿qué pasa si solo es mover o actualizar?».

QUE FIJA
  · qué cuenta como entregado: una nube suya (o de su empresa) entregada, y una incidencia suya corregida;
  · que solo sale lo de obras de las que la persona ES miembro, y nada de incidencias cerradas o descartadas;
  · que una respuesta sin adjuntos se dice «Resuelto», no «Entregado»;
  · que la ruta lo añade a «Mi trabajo» como ULTIMA lectura, y que si falla lo pendiente sale igual.

Contra PostgreSQL: herramientas/ensayo_de_lo_entregado.py.
"""
import datetime

import pytest

import lo_entregado as le

DOC = '0b5a3c52-7f1e-4d1a-9c3e-4e6f2a9b8d01'
EVIDENCIA = [{'tipo': 'plano', 'documento': DOC, 'version_id': 'v-1'}]
CUANDO = datetime.datetime(2026, 11, 13, 9, 30)


class Cursor:
    def __init__(self, nubes=(), incidencias=(), falla=None):
        self.nubes, self.incidencias, self.falla = list(nubes), list(incidencias), falla
        self.sql, self._todos = [], []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self.sql.append((s, params))
        if self.falla and self.falla in s:
            raise RuntimeError('la tabla no responde')
        self._todos = self.nubes if 'FROM DOC_ISSUE_NUBES' in s else self.incidencias

    def fetchall(self):
        return list(self._todos)


def nube(nid=7, rondas=None, pedido='Fotos de la junta', cuando=CUANDO):
    return (nid, 'obra-1', 'PQT8 TALARA', 40, 'ISS-002', pedido, 91,
            rondas if rondas is not None else [{'n': 1, 'entregas': [{'tipo': 'documento', 'documento': 'x'}]}],
            cuando, EVIDENCIA)


def incidencia(iid=41, cuando=CUANDO):
    return (iid, 'obra-1', 'PQT8 TALARA', 'ISS-003', 'La cota de fondo no cuadra', cuando, EVIDENCIA)


# ══ «RESUELTO» O «ENTREGADO» ═══════════════════════════════════════════════

def test_una_respuesta_sin_adjuntos_es_resuelto_y_con_adjuntos_entregado():
    nota = [{'n': 1, 'entregas': [{'tipo': 'nota', 'texto': 'Movido el cuadro de areas'}]}]
    docs = [{'n': 1, 'entregas': [{'tipo': 'nota', 'texto': 'Van las fotos'}, {'tipo': 'documento', 'documento': 'x'}]}]
    assert le.solo_con_nota(nota) is True and le.solo_con_nota(docs) is False
    assert le.asunto_de_nube_entregada('ISS-002', 'Mover el cuadro', nota) == 'Resuelto en ISS-002: Mover el cuadro'
    assert le.asunto_de_nube_entregada('ISS-002', 'Fotos de la junta', docs) == 'Entregado en ISS-002: Fotos de la junta'


def test_manda_la_ultima_ronda_no_las_anteriores():
    rondas = [{'n': 1, 'entregas': [{'tipo': 'documento', 'documento': 'x'}]},
              {'n': 2, 'entregas': [{'tipo': 'nota', 'texto': 'Corregido el rotulo'}]}]
    assert le.solo_con_nota(rondas) is True


@pytest.mark.parametrize('rondas', [None, [], [{}], [{'n': 1, 'entregas': []}], 'texto', [{'n': 1}]])
def test_sin_entregas_no_se_dice_resuelto(rondas):
    assert le.solo_con_nota(rondas) is False
    assert le.asunto_de_nube_entregada('ISS-1', '', rondas) == 'Entregado en ISS-1'


def test_un_pedido_largo_se_recorta():
    assert len(le.asunto_de_nube_entregada('ISS-1', 'x' * 500, [])) < 150


# ══ QUE SALE ═══════════════════════════════════════════════════════════════

def test_una_nube_entregada_sale_con_lo_necesario_para_abrir_su_plano():
    cur = Cursor(nubes=[nube()])
    fila, = le.entregado_por(cur, 9)
    assert fila == {'id': 'nube-7', 'project_id': 'obra-1', 'project_name': 'PQT8 TALARA', 'objeto_tipo': 'NUBE',
                    'objeto_id': '7', 'asunto': 'Entregado en ISS-002: Fotos de la junta',
                    'entregado_en': '2026-11-13T09:30:00', 'incidencia': 40, 'documento': DOC, 'version': 'v-1',
                    'marca': 91, 'espera': 'que lo acepten'}


def test_una_incidencia_corregida_sale_esperando_verificacion():
    cur = Cursor(incidencias=[incidencia()])
    fila, = le.entregado_por(cur, 9)
    assert fila['objeto_tipo'] == 'ISSUE' and fila['objeto_id'] == '41' and fila['incidencia'] == 41
    assert fila['asunto'] == 'Corregido en ISS-003: La cota de fondo no cuadra'
    assert fila['espera'] == 'que lo verifiquen' and fila['documento'] == DOC


def test_lo_mas_reciente_primero_mezclando_nubes_e_incidencias():
    antes, despues = CUANDO, CUANDO + datetime.timedelta(hours=2)
    cur = Cursor(nubes=[nube(7, cuando=antes)], incidencias=[incidencia(41, cuando=despues)])
    assert [f['id'] for f in le.entregado_por(cur, 9)] == ['incidencia-41', 'nube-7']


def test_las_dos_consultas_piden_solo_lo_suyo_de_obras_donde_es_miembro():
    import flujo_de_issue as iss
    import nubes_de_issue as nubes
    cur = Cursor()
    le.entregado_por(cur, 9)
    (s_nubes, p), (s_inc, _p) = cur.sql
    assert p['uid'] == 9 and p['entregada'] == nubes.ENTREGADA and p['corregido'] == iss.CORREGIDO
    assert sorted(p['cerradas']) == sorted([iss.VERIFICADO, iss.ANULADO, iss.BORRADOR])
    for s in (s_nubes, s_inc):
        assert 'JOIN PROJECT_USERS PU ON PU.PROJECT_ID = I.PROJECT_ID AND PU.USER_ID = %(UID)S' in s
        assert 'DISCARDED' in s                       # una incidencia descartada no cuenta
        assert not s.startswith(('INSERT', 'UPDATE', 'DELETE'))
    assert 'N.ESTADO = %(ENTREGADA)S' in s_nubes and 'I.ESTADO <> ALL(%(CERRADAS)S)' in s_nubes
    # La nube puede ser suya o de SU empresa.
    assert 'N.DESTINO_USUARIO = %(UID)S' in s_nubes and 'U.COMPANY_ID = N.DESTINO_EMPRESA' in s_nubes
    assert 'I.ESTADO = %(CORREGIDO)S' in s_inc and 'I.RESPONSABLE_ID = %(UID)S' in s_inc


def test_con_una_obra_se_limita_a_ella():
    cur = Cursor()
    le.entregado_por(cur, 9, 'obra-1')
    for s, p in cur.sql:
        assert 'AND I.PROJECT_ID = %(PID)S' in s and p['pid'] == 'obra-1'
    cur = Cursor()
    le.entregado_por(cur, 9)
    assert all('%(PID)S' not in s for s, _ in cur.sql)


# ══ LA RUTA ════════════════════════════════════════════════════════════════

def test_mi_trabajo_lo_anade_lo_ultimo_y_no_se_cae_si_falla():
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'routes', 'directorio.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def mi_trabajo():'):]
    assert cuerpo.index('enc.con_su_documento(cur, pendientes)') < cuerpo.index('_lo_entregado(cur, u[\'id\'], obra)'), \
        'lo entregado se lee despues de todo lo pendiente'
    assert "'entregados': entregados" in cuerpo and "'pendientes': pendientes" in cuerpo

    from routes import directorio as d
    assert d._lo_entregado(Cursor(nubes=[nube()]), 9, None)[0]['id'] == 'nube-7'
    assert d._lo_entregado(Cursor(falla='FROM DOC_ISSUE_NUBES'), 9, None) == []
