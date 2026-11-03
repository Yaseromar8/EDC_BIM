# -*- coding: utf-8 -*-
"""Las nubes de una incidencia (46, docs/archivos/23 y 24): papeles, actos, visibilidad y su pelota en «Mi trabajo».

La lógica es de `nubes_de_issue.py` y se prueba sin base. Lo que depende de la consulta real (la ruta entera, las
rondas en la base, los encargos) se ensaya contra PostgreSQL en el banco de la observación del plano.
"""
from flask import Flask, g, jsonify
import pytest

import nubes_de_issue as nub

REVISOR, ENCARGADO, CADISTA, OTRO, ADMIN = 1, 2, 3, 4, 9
CONTRATISTA, SUPERVISION = 40, 41
ISSUE = {'id': '7', 'autor_id': REVISOR, 'verificador_id': REVISOR, 'responsable_id': ENCARGADO,
         'responsable_empresa': None, 'estado': 'Abierto',
         'evidencia': [{'tipo': 'plano', 'documento': 'doc-1', 'version_id': 'v2'},
                       {'tipo': 'marca', 'marca': 11}, {'tipo': 'marca', 'marca': '12'}, {'tipo': 'marca', 'marca': 11}],
         'origen_tipo': 'MARCA', 'origen_id': '13'}


def u(uid):
    return {'id': uid, 'name': 'U%d' % uid}


def nube(**k):
    base = {'id': 1, 'clase': 'observacion', 'estado': nub.SIN_ASIGNAR, 'destino_usuario': None, 'destino_empresa': None}
    base.update(k)
    return base


def test_los_papeles_son_de_la_incidencia_no_cargos():
    assert nub.papeles(u(REVISOR), ISSUE) == {'revisor'}
    assert nub.papeles(u(ENCARGADO), ISSUE) == {'encargado'}
    assert nub.papeles(u(CADISTA), ISSUE, nube(destino_usuario=CADISTA)) == {'aportante'}
    assert nub.papeles(u(OTRO), ISSUE) == set()
    assert nub.papeles(u(ADMIN), ISSUE, admin=True) == {'admin'}
    # Asignada a una EMPRESA: es encargado cualquiera de ella; aportante, cualquiera de la empresa de la nube.
    issue_empresa = {**ISSUE, 'responsable_id': None, 'responsable_empresa': CONTRATISTA}
    assert 'encargado' in nub.papeles(u(OTRO), issue_empresa, empresa_del_usuario=CONTRATISTA)
    assert 'aportante' in nub.papeles(u(OTRO), ISSUE, nube(destino_empresa=SUPERVISION), empresa_del_usuario=SUPERVISION)
    # Quien revisa no aporta nunca, aunque la nube vaya a su empresa: pide y verifica (el dueño, 3-nov-2026).
    assert nub.papeles(u(REVISOR), ISSUE, nube(destino_empresa=SUPERVISION), empresa_del_usuario=SUPERVISION) == {'revisor'}
    assert nub.papeles(u(REVISOR), ISSUE, nube(destino_usuario=REVISOR)) == {'revisor'}


def test_cada_acto_tiene_su_dueno():
    sin = nube()
    assert nub.puede('asignar', sin, ISSUE, {'encargado'}) == (True, None)
    ok, por_que = nub.puede('asignar', sin, ISSUE, {'revisor'})
    assert not ok and 'encargado' in por_que
    pedida = nube(estado=nub.PEDIDA, destino_usuario=CADISTA)
    assert nub.puede('entregar', pedida, ISSUE, {'aportante'})[0]
    assert not nub.puede('entregar', pedida, ISSUE, {'encargado'})[0]       # el encargado no entrega por otro
    entregada = nube(estado=nub.ENTREGADA)
    assert nub.puede('aceptar', entregada, ISSUE, {'encargado'})[0]
    assert nub.puede('devolver', entregada, ISSUE, {'encargado'})[0]
    assert not nub.puede('aceptar', entregada, ISSUE, {'aportante'})[0]     # nadie se acepta a sí mismo
    assert nub.puede('asignar', entregada, ISSUE, {'admin'}) == (False, 'la nube está «Entregada»')


def test_devolver_abre_otra_ronda_en_la_misma_nube_y_se_vuelve_a_entregar():
    assert nub.destino('devolver') == nub.DEVUELTA
    assert nub.puede('entregar', nube(estado=nub.DEVUELTA, destino_usuario=CADISTA), ISSUE, {'aportante'})[0]
    assert nub.deudor(nube(estado=nub.DEVUELTA, destino_usuario=CADISTA)) == (CADISTA, None)


def test_levantada_solo_la_dice_el_revisor_y_con_version_corregida():
    obs = nube(estado=nub.ACEPTADA)
    ok, por_que = nub.puede('verificar', obs, ISSUE, {'revisor'})
    assert not ok and 'versión corregida' in por_que                         # sin «Corregida» no hay qué verificar
    corregida = {**ISSUE, 'estado': 'Corregido'}
    assert nub.puede('verificar', obs, corregida, {'revisor'})[0]
    assert not nub.puede('verificar', obs, corregida, {'encargado'})[0]      # el encargado no se verifica
    ok, por_que = nub.puede('verificar', nube(clase='encargo', estado=nub.ACEPTADA), corregida, {'revisor'})
    assert not ok and 'encargo' in por_que                                   # el revisor juzga la observación
    assert nub.destino('verificar', nub.LEVANTADA) == nub.LEVANTADA
    assert nub.destino('verificar', 'cualquier cosa') == nub.NO_LEVANTADA
    assert not nub.puede('verificar', nube(estado=nub.LEVANTADA), corregida, {'revisor'})[0]


def test_por_verificar_es_derivado_de_la_incidencia_corregida():
    corregida = {**ISSUE, 'estado': 'Corregido'}
    assert nub.por_verificar(nube(estado=nub.ACEPTADA), corregida)
    assert nub.por_verificar(nube(estado=nub.NO_LEVANTADA), corregida)       # tras corregir otra vez, se vuelve a mirar
    assert not nub.por_verificar(nube(estado=nub.LEVANTADA), corregida)
    assert not nub.por_verificar(nube(estado=nub.ACEPTADA), ISSUE)
    assert not nub.por_verificar(nube(clase='encargo'), corregida)


def test_las_nubes_de_encargo_son_trabajo_en_proceso_del_equipo():
    enc = nube(clase='encargo', empresa_equipo=CONTRATISTA, destino_usuario=CADISTA)
    assert nub.visible(enc, {'revisor'}, SUPERVISION)                        # «el revisor principal debe ver todo»
    assert not nub.visible(enc, set(), SUPERVISION)                          # otro de fuera del equipo, no
    assert nub.visible(enc, {'encargado'}, CONTRATISTA)
    assert nub.visible(enc, {'aportante'}, None)
    assert nub.visible(enc, set(), CONTRATISTA)                              # su equipo, aunque no tenga papel
    assert nub.visible(enc, {'admin'}, None)
    assert nub.visible(nube(), {'revisor'}, SUPERVISION)                     # una observación la ve todo el que ve
    assert nub.puede_crear_encargo({'encargado'}) and not nub.puede_crear_encargo({'revisor', 'aportante'})


def test_la_pelota_la_tiene_quien_debe_entregar():
    assert nub.deudor(nube(estado=nub.PEDIDA, destino_empresa=CONTRATISTA)) == (None, CONTRATISTA)
    for estado in (nub.SIN_ASIGNAR, nub.ENTREGADA, nub.ACEPTADA, nub.LEVANTADA, nub.NO_LEVANTADA):
        assert nub.deudor(nube(estado=estado, destino_usuario=CADISTA)) == (None, None), estado


def test_marcas_y_plano_de_la_incidencia():
    assert nub.marcas_de_la_incidencia(ISSUE) == [11, 12, 13]                # sin repetir, con la de origen
    assert nub.documento_de_la_incidencia(ISSUE) == ('doc-1', 'v2')
    assert nub.observaciones_sin_levantar([nube(estado=nub.LEVANTADA), nube(estado=nub.ACEPTADA),
                                           nube(clase='encargo')]) == [nube(estado=nub.ACEPTADA)]


def test_lo_que_se_entrega_son_documentos_de_docs_o_notas():
    ok, error = nub.entregas_validas([{'tipo': 'documento', 'documento': 'abc', 'vista3d': 1},
                                      {'tipo': 'nota', 'texto': '  la junta va a 45°  '}])
    assert error is None and ok == [{'tipo': 'documento', 'documento': 'abc', 'version_id': None, 'vista3d': True},
                                    {'tipo': 'nota', 'texto': 'la junta va a 45°'}]
    for mal in ([], None, [{'tipo': 'enlace', 'url': 'https://wa.me/'}], [{'tipo': 'nota', 'texto': ''}],
                [{'tipo': 'documento'}], [{'tipo': 'nota', 'texto': 'x'}] * (nub.TOPE_ENTREGAS + 1)):
        assert nub.entregas_validas(mal)[0] is None, mal


# ── Marcar exige «Ver, descargar y marcar» en la carpeta (D2) ──────────────────────────────────────────────────

def test_marcar_pide_el_nivel_de_marcar_con_la_obra_del_nodo(monkeypatch):
    import routes.pdf_tools as pdf

    class Cur:
        def execute(self, sql, params=()):
            self.params = params

        def fetchone(self):
            return ('obra-del-nodo',)

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def cursor(self):
            return Cur()

    llamadas = []
    monkeypatch.setattr(pdf, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(pdf, 'check_folder_permission',
                        lambda user, nid, obra, nivel, accion: llamadas.append((nid, obra, nivel)) or None)
    app = Flask(__name__)
    with app.test_request_context():
        g.current_user = {'id': 5, 'name': 'Ana'}
        assert pdf._negativa_para_marcar('nodo-1') is None
    assert llamadas == [('nodo-1', 'obra-del-nodo', 'view_markup')]


# ── La pelota en «Mi trabajo» y en la conciliación ──────────────────────────────────────────────────────────

class CursorGuion:
    def __init__(self, filas):
        self.filas = list(filas)
        self.q = []

    def execute(self, sql, params=None):
        self.q.append((sql, params))

    def fetchone(self):
        return self.filas.pop(0) if self.filas else None

    def fetchall(self):
        return self.filas.pop(0) if self.filas else []


def test_la_conciliacion_entiende_las_nubes():
    import encargos as enc
    assert 'NUBE' in enc.TIPOS and enc._ORIGEN['NUBE'] == ('doc_issue_nubes', 'model_urn')
    assert "'NUBE'" in dict(enc._CHECKS)['ck_encargos_tipo']
    assert enc._sigue_debiendose(CursorGuion([('pedida', CADISTA, None)]), 'NUBE', 5, CADISTA) is True
    assert enc._sigue_debiendose(CursorGuion([('pedida', CADISTA, None)]), 'NUBE', 5, OTRO) is False
    assert enc._sigue_debiendose(CursorGuion([('entregada', CADISTA, None)]), 'NUBE', 5, CADISTA) is False
    assert enc._sigue_debiendose(CursorGuion([('devuelta', None, CONTRATISTA)]), 'NUBE', 5, None) is True
    assert enc._sigue_debiendose(CursorGuion([None]), 'NUBE', 5, CADISTA) is None


def test_el_asunto_de_una_nube_dice_que_hay_que_aportar():
    import encargos as enc
    assert enc.asunto_de_nube('ISS-002', 'Imagen 3D de la junta') == 'Aportar en ISS-002: Imagen 3D de la junta'
    assert enc.asunto_de_nube('ISS-002', '') == 'Aportar en ISS-002'
    assert len(enc.asunto_de_nube('ISS-1', 'x' * 500)) < 140


def test_una_nube_en_mi_trabajo_lleva_a_su_incidencia_y_su_plano():
    import encargos as enc
    cur = CursorGuion([[(8, 7, [{'tipo': 'plano', 'documento': 'doc-1', 'version_id': 'v2'}])]])
    salida = enc._nubes_con_su_documento(cur, [{'objeto_tipo': 'NUBE', 'objeto_id': '8'},
                                               {'objeto_tipo': 'RFI', 'objeto_id': '8'}])
    assert salida[0] == {'objeto_tipo': 'NUBE', 'objeto_id': '8', 'incidencia': '7', 'documento': 'doc-1',
                         'version': 'v2'}
    assert 'incidencia' not in salida[1]


def test_la_funcion_subcontratista_existe_en_codigo_migracion_y_manifiesto():
    import io
    import os
    import directorio_de_obra as dir_obra
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assert 'SUBCONTRATISTA' in dir_obra.FUNCIONES
    sql = io.open(os.path.join(raiz, 'sql', '46_nubes_de_issue.sql'), encoding='utf-8').read()
    assert "'SUBCONTRATISTA'" in sql and "'NUBE'" in sql and 'GRANT SELECT, INSERT, UPDATE ON doc_issue_nubes' in sql
    assert 'DELETE ON doc_issue_nubes' not in sql                            # como doc_issues desde la 26
    manifiesto = io.open(os.path.join(raiz, 'esquema_objetos.txt'), encoding='utf-8').read()
    assert "'subcontratista'::text" in manifiesto and "'nube'::text" in manifiesto
