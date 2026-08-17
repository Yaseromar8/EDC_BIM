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
        if 'to_regclass' in s:
            # listar() pregunta si existe el arbol documental antes de decidir
            # si hace el JOIN. Aqui se dice que SI, que es el caso con datos.
            self._r = [('file_nodes',)]
        elif s.startswith('SELECT p.id, p.tipo'):
            self._r = [(
                f['id'], f.get('tipo', 'MIDP'), f['identificador'], f.get('titulo'),
                f.get('disciplina'), f.get('volumen'), f.get('formato'),
                f.get('idoneidad_prevista'), f.get('revision_prevista'),
                f.get('responsable'), f.get('fecha'), f.get('hito'),
                f.get('node_id'), f.get('doc_nombre'), f.get('doc_estado'),
                f.get('doc_idoneidad'), f.get('doc_revision'),
                # El COMO: descripcion, escala, lamina, LOD, LOI, documentacion,
                # predecesores, paquete, y las piezas del codigo.
                f.get('descripcion'), f.get('escala'), f.get('formato_lamina'),
                f.get('lod'), f.get('loi'), f.get('documentacion_asociada'),
                f.get('predecesores'), f.get('paquete_trabajo'),
                f.get('proyecto'), f.get('originador'), f.get('nivel'),
                f.get('tipo_doc'), f.get('numeracion'),
            ) for f in self.filas]

    def fetchall(self):
        return self._r

    def fetchone(self):
        return self._r[0] if self._r else None


def _fila(**kw):
    # Codigo bien formado (7 partes) y coherente con la disciplina: asi el ruido
    # de los avisos de nomenclatura no se cuela en las pruebas que miran otra cosa.
    base = {'id': 1, 'identificador': '500125-CSSP001-000-XX-DR-TP-000800',
            'titulo': 'Planta', 'disciplina': 'TP'}
    base.update(kw)
    return base


# ── El estado se calcula, no se guarda ─────────────────────────────────────

def test_sin_documento_y_con_fecha_futura_esta_comprometido():
    cur = CursorFalso([_fila(fecha=MANANA)])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['estado'] == plan.COMPROMETIDO


def test_sin_documento_y_con_la_fecha_pasada_el_PLAZO_esta_vencido():
    """Es la fila que hay que llevar a la reunion."""
    cur = CursorFalso([_fila(fecha=AYER)])
    assert plan.listar(cur, 'obra/X', hoy=HOY)[0]['estado'] == plan.VENCIDO


def test_el_plazo_vencido_NO_se_puede_llamar_no_entregado():
    """La primera version escribia "Vencido" y "vencidos sin entregar", y con eso
    la pantalla acusaba a la obra de haber incumplido 1.108 entregas cuando lo
    unico cierto era que nadie habia cotejado todavia. Falta de documento
    vinculado != falta de entrega. Lo unico que consta es el calendario."""
    assert plan.ETIQUETAS[plan.VENCIDO] == 'Plazo vencido'
    for etiqueta in plan.ETIQUETAS.values():
        assert 'entrega' not in etiqueta.lower() or etiqueta == 'Entregado', (
            'una etiqueta de estado no puede afirmar nada sobre la entrega sin '
            'documento que lo respalde')


def test_un_plan_recien_importado_se_declara_sin_cotejar():
    """Con cero vinculos, el porcentaje de entrega no mide la obra: mide nuestro
    propio trabajo de vinculacion. La pantalla tiene que poder decirlo."""
    r = plan.resumen(CursorFalso([_fila(id=1, fecha=AYER), _fila(id=2, fecha=AYER)]),
                     'obra/X', hoy=HOY)
    assert r['plan_sin_cotejar'] is True
    assert r['cotejados'] == 0 and r['sin_cotejar'] == 2

    # En cuanto hay UN cotejo, las cifras vuelven a hablar de la obra.
    r = plan.resumen(CursorFalso([_fila(id=1, fecha=AYER),
                                  _fila(id=2, node_id='a', doc_estado='PUBLISHED')]),
                     'obra/X', hoy=HOY)
    assert r['plan_sin_cotejar'] is False
    assert r['cotejados'] == 1


def test_un_plan_vacio_no_se_declara_sin_cotejar():
    """Sin filas no hay nada que cotejar: el aviso sobraria."""
    assert plan.resumen(CursorFalso([]), 'obra/X')['plan_sin_cotejar'] is False


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


# ── El plan tiene que decir QUE se entrega y COMO ──────────────────────────

def test_la_idoneidad_distingue_compartido_de_autorizado():
    """Con un S3 no se construye. Meterlo en el mismo saco que un A1 borra la
    unica distincion que le importa al que va a ejecutar en obra."""
    assert plan.familia_idoneidad('S3') == 'compartido'
    assert plan.familia_idoneidad('A1') == 'autorizado'
    assert plan.familia_idoneidad('B1') == 'autorizado'
    assert plan.familia_idoneidad('CR') == 'registro'
    assert plan.familia_idoneidad('HD') == 'fuera de vocabulario'
    assert plan.familia_idoneidad('') is None


def test_los_requisitos_recogen_el_LOIN_el_formato_y_la_escala():
    """El «como» de la entrega: sin esto el plan es una lista de codigos."""
    cur = CursorFalso([
        _fila(id=1, formato='.ifc', escala='Sin escala', lod='300', loi='3',
              idoneidad_prevista='S3', responsable='Ana', hito='Etapa RIBA 4',
              fecha=MANANA, proyecto='500125', numeracion='001008'),
        _fila(id=2, formato='.ifc', escala='1:100', lod='300', loi='3',
              idoneidad_prevista='S3', responsable='Ana', hito='Etapa RIBA 4',
              fecha=MANANA, proyecto='500125', numeracion='001009'),
    ])
    r = plan.requisitos(cur, 'obra/X', hoy=HOY)
    assert r['formatos'] == [{'valor': '.ifc', 'n': 2}]
    assert r['loin'] == [{'lod': '300', 'loi': '3', 'n': 2}]
    assert {e['valor'] for e in r['escalas']} == {'Sin escala', '1:100'}
    assert r['hitos'][0]['hito'] == 'Etapa RIBA 4'
    assert r['hitos'][0]['total'] == 2
    assert r['nomenclatura']['ejemplo']


def test_avisa_si_el_plan_no_compromete_nada_como_autorizado():
    """Un plan entero en familia S no entrega nada apto para construir. Es un
    agujero del plan, y es mejor verlo ahora que el dia de la entrega."""
    cur = CursorFalso([_fila(idoneidad_prevista='S3', fecha=MANANA, responsable='Ana',
                             lod='300', loi='3')])
    textos = ' '.join(a['texto'] for a in plan.requisitos(cur, 'obra/X', hoy=HOY)['avisos'])
    assert 'autorizada' in textos

    cur = CursorFalso([_fila(idoneidad_prevista='A1', fecha=MANANA, responsable='Ana',
                             lod='300', loi='3')])
    textos = ' '.join(a['texto'] for a in plan.requisitos(cur, 'obra/X', hoy=HOY)['avisos'])
    assert 'autorizada' not in textos


def test_avisa_de_los_codigos_que_no_siguen_la_nomenclatura():
    """En el MIDP real hay codigos a los que les falta el volumen
    («500125-CSSP001-XX-RP-TP-001008», 6 partes en vez de 7). Un fichero
    entregado con ese nombre no casara NUNCA con su compromiso, y el plan se
    quedaria diciendo «sin cotejar» para siempre sin que nadie sepa por que."""
    cur = CursorFalso([_fila(identificador='500125-CSSP001-XX-RP-TP-001008',
                             disciplina='TP', fecha=MANANA, responsable='Ana',
                             lod='300', loi='3', idoneidad_prevista='A1')])
    r = plan.requisitos(cur, 'obra/X', hoy=HOY)
    assert r['codigos_mal_formados'] == 1
    assert any('nomenclatura' in a['texto'] for a in r['avisos'])


def test_avisa_si_el_codigo_y_la_disciplina_declarada_no_concuerdan():
    """El codigo dice HD y la columna dice TP. Uno de los dos esta mal, y elegir
    en silencio cual vale seria inventarse el dato."""
    cur = CursorFalso([_fila(identificador='500125-CSSP001-000-XX-DR-HD-000800',
                             disciplina='TP', fecha=MANANA, responsable='Ana',
                             lod='300', loi='3', idoneidad_prevista='A1')])
    r = plan.requisitos(cur, 'obra/X', hoy=HOY)
    assert r['codigos_discrepantes'] == 1
    assert r['codigos_mal_formados'] == 0


def test_un_codigo_bien_formado_no_genera_aviso():
    cur = CursorFalso([_fila(identificador='500125-CSSP001-000-XX-DR-TP-000800',
                             disciplina='TP', fecha=MANANA, responsable='Ana',
                             lod='300', loi='3', idoneidad_prevista='A1')])
    r = plan.requisitos(cur, 'obra/X', hoy=HOY)
    assert r['codigos_mal_formados'] == 0 and r['codigos_discrepantes'] == 0
    assert not r['avisos']


def test_avisa_de_los_contenedores_sin_responsable_y_sin_LOIN():
    cur = CursorFalso([_fila(id=1, idoneidad_prevista='A1', fecha=MANANA),
                       _fila(id=2, idoneidad_prevista='A1', fecha=MANANA,
                             responsable='Ana', lod='300', loi='3')])
    avisos = ' '.join(a['texto'] for a in plan.requisitos(cur, 'obra/X', hoy=HOY)['avisos'])
    assert 'responsable' in avisos
    assert 'LOD/LOI' in avisos


def test_un_codigo_de_idoneidad_inventado_se_marca_como_error():
    """En el MIDP real hay dos contenedores con «HD» en la casilla de idoneidad.
    Es un codigo de disciplina colado donde no va, y callarlo deja el plan con
    dos entregables cuyo estado no significa nada."""
    cur = CursorFalso([_fila(idoneidad_prevista='HD', fecha=MANANA,
                             responsable='Ana', lod='300', loi='3')])
    r = plan.requisitos(cur, 'obra/X', hoy=HOY)
    errores = [a for a in r['avisos'] if a['nivel'] == 'error']
    assert any('idoneidad' in e['texto'] and 'HD' in e['texto'] for e in errores)


# ── Reglas de la importacion y del vinculo ─────────────────────────────────

def test_reimportar_el_plan_no_puede_deshacer_los_vinculos():
    """Corregir el MIDP no puede tirar por tierra el trabajo de haber atado
    cada compromiso con su documento."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    conflicto = fuente[fuente.index('ON CONFLICT ON CONSTRAINT'):]
    conflicto = conflicto[:conflicto.index('RETURNING')]
    for prohibido in ('file_node_id', 'vinculado_en', 'vinculado_por'):
        assert prohibido not in conflicto, (
            f'la reimportacion pisa {prohibido}: perderia los vinculos ya hechos')


def test_el_mismo_contenedor_en_dos_etapas_son_DOS_compromisos():
    """El MIDP entrega el mismo contenedor en RIBA 3B y en RIBA 4, con fechas y
    LOIN distintos. Si la clave no lleva la etapa, la segunda entrega machaca a
    la primera: el TIDP de PQT8 leia 622 filas y guardaba 512."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'plan_de_entrega.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def asegurar_tablas'):fuente.index('def _fecha')]
    assert 'UNIQUE (model_urn, tipo, identificador, hito)' in cuerpo, (
        'la clave del compromiso tiene que incluir la etapa')


def test_el_identificador_no_puede_llevar_pegada_la_etapa():
    """Es el nombre ISO del contenedor y hay que poder cotejarlo contra el
    nombre del fichero. La primera version le pegaba « · Etapa RIBA X» para
    fabricar unicidad, y con eso ninguna sugerencia de vinculo casaba nunca."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'plan_entregas.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert " · " not in fuente.split('def vincular_compromiso')[0], (
        'la importacion no puede ensuciar el identificador con la etapa')


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


# ── La obra de la GUARDIA tiene que llegar al WHERE ───────────────────────
#
# Encontrado el 17-ago-2026 en un repaso adversarial de mi propio trabajo.
#
# La guardia comprueba el `model_urn` que manda el CLIENTE -- un dato que el
# cliente controla -- y el UPDATE iba por `plan_id`, que es un entero
# correlativo y por tanto enumerable. Nada cruzaba las dos cosas: un usuario de
# la obra A, pasando SU propia obra para que la guardia le dejara pasar y el id
# de un compromiso de la obra B, escribia sobre el plan de la obra B.
#
# `vincular` exigia `n.model_urn = p.model_urn`, que solo dice que el documento
# y el compromiso son coherentes ENTRE SI. Eso no dice nada sobre quien esta
# autorizado a tocarlos.

OBRA_GUARDIA = 'proyectos/PQT8_TALARA'


class CursorQueRecuerda:
    """Guarda el SQL y los parametros para poder mirar el WHERE."""

    def __init__(self):
        self.sql = ''
        self.params = ()

    def execute(self, sql, params=None):
        self.sql = ' '.join(sql.split())
        self.params = params or ()

    def fetchone(self):
        return None


def test_desvincular_ata_el_compromiso_a_la_obra_autorizada():
    cur = CursorQueRecuerda()
    plan.desvincular(cur, 42, 'ana@obra.test', model_urn=OBRA_GUARDIA)
    assert 'model_urn' in cur.sql, 'el UPDATE no cruza el plan_id con la obra'
    assert OBRA_GUARDIA in cur.params


def test_vincular_ata_el_compromiso_a_la_obra_autorizada():
    cur = CursorQueRecuerda()
    plan.vincular(cur, 42, 'nodo-1', 'ana@obra.test', model_urn=OBRA_GUARDIA)
    assert 'p.model_urn = %s' in cur.sql, (
        'no basta con que documento y compromiso sean de la misma obra: esa obra '
        'tiene que ser la que autorizo la guardia')
    assert OBRA_GUARDIA in cur.params


def test_las_rutas_pasan_la_obra_que_comprobo_la_guardia():
    """Una regla en el modulo que la ruta no usa no protege de nada."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'plan_entregas.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert 'plan.vincular(cur, plan_id, node_id, _autor(), model_urn=model_urn)' in fuente
    assert 'plan.desvincular(cur, plan_id, _autor(), model_urn=model_urn)' in fuente
