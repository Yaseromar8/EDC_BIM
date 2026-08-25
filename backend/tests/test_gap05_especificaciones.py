# -*- coding: utf-8 -*-
"""GAP 05 · LA ESPECIFICACION COMO OBJETO.

Lo que estas pruebas defienden, por orden de importancia:

1. QUE LA MECANICA DE REVISAR SEA UNA SOLA. Planos y especificaciones revisan
   igual. Si alguien vuelve a escribir una segunda copia, esto lo dice.
2. QUE NO HAYA DOS REVISIONES VIGENTES. Contra una exigencia superada se compra
   material, y se descubre cuando ya esta en obra.
3. QUE GENERAR UN SUBMITTAL NO SEA UN SEGUNDO CAMINO DE ALTA. La propuesta se
   calcula aqui; el submittal lo sigue creando GAP 01, con su veredicto y su BIC.
4. QUE NO SE REESCRIBA LA HISTORIA. Los submittals que ya existen guardaron la
   especificacion como TEXTO escrito a mano; convertirlo en clave foranea seria
   inventarse a que seccion se referian.
"""
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '18_gap05_especificaciones.sql'),
                   encoding='utf-8').read()


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'specs.py'), encoding='utf-8').read()


# ══ 1 · UNA SOLA MECANICA DE REVISION ══════════════════════════════════════

def test_planos_y_especificaciones_usan_EL_MISMO_motor():
    """Si esto falla es que alguien escribio una segunda copia de la mecanica.

    Lo que diverge no son las dos copias el dia que se escriben: es la tercera
    vez que alguien arregla un fallo en una y no en la otra.
    """
    import planos_de_obra as pl
    import especificaciones as esp
    import revisiones_de_documento as rev
    assert pl.siguiente_revision is rev.siguiente_revision
    assert esp.siguiente_revision is rev.siguiente_revision
    assert pl.normalizar_numero is rev.normalizar_identidad


def test_la_serie_de_revisiones_respeta_la_convencion_que_ya_usa():
    """La convencion la fija el CONTRATO, no la plataforma."""
    import revisiones_de_documento as rev
    assert rev.siguiente_revision([]) == 'A'
    assert rev.siguiente_revision(['A', 'B']) == 'C'
    assert rev.siguiente_revision(['00', '01']) == '02'
    assert rev.siguiente_revision(['09']) == '10'
    # Serie MIXTA: continua la convencion de LETRAS, que es la que reconoce.
    # 'B' esta libre, asi que no pisa nada. No es adivinar: es no rendirse
    # cuando una de las dos convenciones sigue siendo legible.
    assert rev.siguiente_revision(['A', '01', 'XYZ']) == 'B'
    # Serie que no encaja en NINGUNA: no se adivina. Devolver algo aqui daria
    # una revision con un codigo que nadie reconoce en obra.
    assert rev.siguiente_revision(['XYZ']) is None
    assert rev.siguiente_revision(['Z']) is None, 'la serie de letras se agoto'


def test_el_motor_solo_escribe_en_tablas_de_una_lista_cerrada():
    """El nombre de una tabla se interpola en el SQL --no se puede parametrizar--
    asi que la lista de las que valen es una constante del codigo."""
    import revisiones_de_documento as rev
    assert {r.tabla_revisiones for r in rev.REVISABLES} == {
        'doc_plano_revisiones', 'doc_spec_revisiones'}
    falso = rev.Revisable('x', 'usuarios; DROP TABLE', 'y', 'z')
    with pytest.raises(ValueError):
        rev.emitir(None, falso, 1, 'nodo')


def test_emitir_SUPERA_la_anterior_en_la_misma_transaccion():
    """Las dos cosas juntas o ninguna. Si se insertara la nueva antes de superar
    la anterior habria un instante con DOS vigentes -- y si el proceso muriera
    ahi, ese instante seria permanente."""
    import revisiones_de_documento as rev

    class Cur(object):
        def __init__(self):
            self.sql = []
            self._cola = [[('A',)], (7,), (99,)]
        def execute(self, q, args=None):
            self.sql.append(' '.join(q.split()))
        def fetchall(self):
            return self._cola.pop(0)
        def fetchone(self):
            return self._cola.pop(0)

    cur = Cur()
    rid, codigo, anterior = rev.emitir(cur, rev.SECCION, 5, 'nodo-1',
                                       emitida_por=3)
    assert codigo == 'B', 'sigue la serie del documento'
    assert rid == 99 and anterior == 7
    ordenados = [q for q in cur.sql if 'UPDATE' in q or 'INSERT' in q]
    assert 'UPDATE' in ordenados[0] and 'Superada' not in ordenados[0]
    assert "INSERT INTO doc_spec_revisiones" in ordenados[1], ordenados
    # y la anterior queda apuntando a la que la sustituyo
    assert 'superada_por_id' in ordenados[2]


def test_una_sola_revision_vigente_lo_garantiza_LA_BASE():
    sql = _sql()
    assert 'idx_spec_una_sola_vigente' in sql
    assert "ON doc_spec_revisiones(seccion_id) WHERE estado = 'Vigente'" in sql
    # y con la misma forma que planos, que es lo que permite el motor comun
    plano = io.open(os.path.join(RAIZ, 'sql', '14_gap02_planos.sql'),
                    encoding='utf-8').read()
    assert 'idx_plano_una_sola_vigente' in plano


def test_una_superada_tiene_que_decir_CUANDO():
    """Sin fecha, «superada» es una etiqueta que no permite reconstruir que
    exigencia se miraba en una fecha dada."""
    assert 'ck_spec_rev_superada_con_fecha' in _sql()


# ══ 2 · LA IDENTIDAD ═══════════════════════════════════════════════════════

def test_el_numero_de_seccion_admite_LAS_DOS_convenciones():
    """MasterFormat y partida conviven, y las dos son legitimas. Convertir una
    en la otra seria inventarle al contrato una codificacion que no usa."""
    import especificaciones as esp
    # LOS BLOQUES SE RELLENAN A DOS DIGITOS. Lo encontro la EXP contra
    # produccion el 25-ago-2026: la primera version solo reconocia bloques que
    # YA venian con dos digitos, asi que '3 30 00' pasaba tal cual y '033000'
    # creaba una SEGUNDA seccion para la misma exigencia. El numero dejaba de
    # ser la identidad justo en la forma que mas se teclea.
    for crudo in ('03 30 00', '033000', '03-30-00', ' 03 30 00 ',
                  '3 30 00', '3-30-0'):
        assert esp.normalizar_seccion(crudo) == '03 30 00', crudo
    assert esp.normalizar_seccion('3.2.1') == '03.02.01'
    assert esp.normalizar_seccion('03.02.01') == '03.02.01'
    # Lo que no encaja en ninguna se respeta tal cual, en mayusculas.
    assert esp.normalizar_seccion('ET-CONCRETO') == 'ET-CONCRETO'
    assert esp.normalizar_seccion('') == ''
    # Rellenar NO es convertir: la partida se queda en partida.
    assert esp.normalizar_seccion('3.2.1') != esp.normalizar_seccion('3 2 1')


def test_todas_las_formas_de_escribir_un_numero_son_LA_MISMA_seccion():
    """La invariante que la EXP demostro rota. Si vuelve a romperse, dos
    personas registran la misma exigencia dos veces y cada una somete
    materiales contra la suya."""
    import especificaciones as esp
    formas = ('3 30 00', '033000', '03 30 00', '03-30-00', '3-30-0', ' 3 30 0 ')
    assert len({esp.normalizar_seccion(f) for f in formas}) == 1, {
        f: esp.normalizar_seccion(f) for f in formas}


def test_la_division_se_deduce_pero_NO_se_impone():
    import especificaciones as esp
    assert esp.division_de('03 30 00') == '03'
    assert esp.division_de('03.02.01') == '03'
    assert esp.division_de('ET-CONCRETO') is None
    assert esp.normalizar_division('3') == '03'


def test_el_numero_es_la_identidad_una_por_obra():
    assert 'idx_spec_sec_numero' in _sql()
    assert 'ON doc_spec_secciones(project_id, numero)' in _sql()


def test_la_estructura_la_fija_la_OBRA_y_no_una_lista_del_codigo():
    """Los dos fabricantes usan MasterFormat. En obra publica peruana manda la
    estructura del PRESUPUESTO. Imponer una obligaria a la entidad a mantener
    dos estructuras paralelas del mismo proyecto."""
    sql = _sql()
    assert 'CREATE TABLE IF NOT EXISTS doc_spec_divisiones' in sql
    creacion = sql.split('CREATE TABLE IF NOT EXISTS doc_spec_divisiones')[1][:400]
    assert 'project_id' in creacion, 'las divisiones son POR OBRA'
    import especificaciones as esp
    assert len(esp.CATALOGO_SUGERIDO) > 20, 'el catalogo estandar se OFRECE'
    assert esp.titulo_sugerido('03') == 'Concreto'
    assert esp.titulo_sugerido('99') is None, 'lo que no esta, no se inventa'


def test_borrar_una_division_no_se_lleva_por_delante_sus_secciones():
    """Una seccion tiene submittals apuntandola."""
    sql = _sql()
    assert 'fk_spec_sec_division' in sql
    bloque = sql.split('fk_spec_sec_division')[1][:200]
    assert 'ON DELETE RESTRICT' in bloque


# ══ 3 · NO HAY SEGUNDO ALMACEN ═════════════════════════════════════════════

def test_la_revision_APUNTA_al_fichero_del_expediente():
    """Ni un byte copiado: el permiso se hereda y capa 09 sigue mandando."""
    sql = _sql()
    assert 'file_node_id     UUID        NOT NULL' in sql
    assert 'REFERENCES file_nodes(id) ON DELETE RESTRICT' in sql


def test_borrar_el_fichero_de_una_revision_emitida_esta_prohibido():
    """Dejaria el expediente diciendo que existe un texto que ya no existe."""
    sql = _sql()
    bloque = sql.split('fk_spec_rev_nodo')[1][:200]
    assert 'ON DELETE RESTRICT' in bloque


# ══ 4 · LO QUE ESTE GAP EXISTE PARA HABILITAR ══════════════════════════════

def test_generar_un_submittal_NO_es_un_segundo_camino_de_alta():
    """La propuesta se calcula; el submittal lo sigue creando GAP 01.

    Un alta paralela acabaria dejando de comprobar algo que la primera si
    comprueba -- el veredicto, la BIC, el permiso -- y nadie se daria cuenta
    hasta que hiciera falta.
    """
    fuente = _rutas()
    cuerpo = fuente.split('def submittal_propuesto')[1].split('\n@')[0]
    assert 'INSERT INTO doc_submittals' not in cuerpo
    assert 'INSERT' not in cuerpo, 'la ruta de propuesta no escribe NADA'
    decorador = fuente.split("@specs_bp.route('/secciones/<int:sid>/submittal-propuesto'")[1][:60]
    assert "methods=['GET']" in decorador, 'proponer es LEER, no crear'


def test_la_propuesta_apunta_a_la_SECCION_y_no_a_la_revision():
    """Un submittal se somete contra «03 30 00 Concreto». Cuando esa seccion se
    revise, tiene que seguir apuntando a la EXIGENCIA y no a un soporte
    superado; cual era la revision vigente ese dia se reconstruye por fecha."""
    import especificaciones as esp
    p = esp.submittal_desde_seccion({'id': '4', 'numero': '03 30 00',
                                     'titulo': 'Concreto vaciado in situ'}, revision='B')
    assert p['spec_section_id'] == '4'
    assert p['spec_seccion'] == '03 30 00'
    assert 'revision_id' not in p
    assert '03 30 00' in p['titulo']


def test_avisa_cuando_la_seccion_no_tiene_revision_vigente():
    """Someter un material contra una especificacion sin texto vigente es
    exactamente el error que este objeto existe para hacer visible."""
    assert 'sin_revision_vigente' in _rutas()


def test_el_submittal_acepta_la_clave_foranea_que_GAP01_dejo_prevista():
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'),
                     encoding='utf-8').read()
    assert 'spec_section_id' in fuente
    cuerpo = fuente.split('def crear')[1].split('\ndef ')[0]
    assert "data.get('spec_section_id')" in cuerpo


# ══ 5 · NO SE REESCRIBE LA HISTORIA ════════════════════════════════════════

def test_la_migracion_NO_convierte_el_texto_viejo_en_clave_foranea():
    """Los submittals que ya existen escribieron esa seccion a mano. No hay
    forma de saber a cual se referian sin inventarselo, y este proyecto tiene
    prohibido reescribir historia para que cuadre un modelo nuevo."""
    sql = _sql()
    assert 'ADD COLUMN IF NOT EXISTS spec_section_id' in sql
    assert 'UPDATE doc_submittals' not in sql, 'no se toca ni una fila existente'
    assert 'DROP COLUMN' not in sql
    # la columna de texto sigue viva
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'),
                     encoding='utf-8').read()
    assert 'spec_seccion' in fuente and 'spec_titulo' in fuente


def test_desenlazar_una_seccion_no_borra_el_submittal():
    sql = _sql()
    bloque = sql.split('fk_submittal_spec_section')[1][:220]
    assert 'ON DELETE SET NULL' in bloque, (
        'CASCADE aqui borraria submittals --actos contractuales-- por tocar la '
        'especificacion')


# ══ 6 · EL OCR SUGIERE, NO AFIRMA ══════════════════════════════════════════

def test_un_escaneo_sin_capa_de_texto_se_DICE_no_se_finge():
    """Devolver campos vacios pareceria un formulario mal rellenado."""
    import especificaciones as esp
    s = esp.leer_encabezado(b'no soy un pdf')
    assert s['tiene_texto'] is False
    assert s['numero'] is None and s['titulo'] is None


def test_el_ocr_devuelve_SUGERENCIAS_y_quien_crea_confirma():
    fuente = io.open(os.path.join(RAIZ, 'especificaciones.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def leer_encabezado')[1].split('\ndef ')[0]
    assert 'sugerencia' in cuerpo
    assert 'NUNCA VERDAD' in cuerpo


# ══ 7 · PERMISOS ═══════════════════════════════════════════════════════════

def test_la_estructura_la_define_quien_ADMINISTRA_la_obra():
    """Si cualquiera pudiera crear divisiones, en un mes habria '03 Concreto',
    '3 - CONCRETO' y 'Concretos', y el filtro dejaria de decir nada."""
    cuerpo = _rutas().split('def crear_division')[1].split('\ndef ')[0]
    assert 'guardia_administrativa' in cuerpo
    # Y ADEMAS la de obra: sin ella un ajeno recibiria «no eres administrador de
    # esta obra», que es confirmarle que la obra existe.
    assert 'guardia_de_obra' in cuerpo


def test_cada_ruta_de_escritura_tiene_su_guardia():
    fuente = _rutas()
    for vista in ('crear', 'emitir_revision', 'crear_set', 'crear_division',
                  'leer_encabezado'):
        cuerpo = fuente.split('def %s(' % vista)[1].split('\ndef ')[0]
        assert ('guardia_de_obra' in cuerpo or 'guardia_de_recurso' in cuerpo), vista


def test_el_documento_tiene_que_ser_de_ESTA_obra():
    """Sin esto se podria clavar como revision un documento de otra obra con
    solo conocer su id."""
    fuente = _rutas()
    assert fuente.count('OTRA_OBRA') >= 3


def test_la_seccion_es_un_recurso_del_perimetro():
    """`obra_del_recurso` LEVANTA si la tabla no esta declarada, asi que sin
    esto las rutas por id devolverian 500 en vez de proteger."""
    import perimetro_de_obra as pm
    assert 'doc_spec_secciones' in pm.RECURSOS


def test_la_herramienta_esta_en_el_catalogo_y_sembrada():
    import herramientas_de_obra as hdo
    assert 'especificaciones' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/specs') == 'especificaciones'
    assert "'especificaciones'" in _sql(), 'sembrada en las obras que ya existen'
