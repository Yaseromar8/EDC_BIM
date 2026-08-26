# -*- coding: utf-8 -*-
"""GAP 06 · PLANTILLAS DE FLUJO DE REVISION.

LA INVARIANTE QUE ESTE FICHERO DEFIENDE POR ENCIMA DE TODO

    PLANTILLA  --aplicar-->  REVISION        SI
    PLANTILLA  --gobierna->  REVISION        NUNCA

Cambiar una plantilla no puede tocar una revision ya iniciada ni una cerrada. Si
la gobernara en vivo, editar el molde reescribiria retroactivamente procesos ya
firmados -- que en obra publica significa cambiar quien tenia que aprobar algo
DESPUES de que se aprobara.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '19_gap06_plantillas_revision.sql'),
                   encoding='utf-8').read()


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'plantillas_revision.py'),
                   encoding='utf-8').read()


def _reviews():
    return io.open(os.path.join(RAIZ, 'routes', 'reviews.py'), encoding='utf-8').read()


# ══ 1 · LA PLANTILLA NO GOBIERNA NADA ══════════════════════════════════════

def test_modificar_una_plantilla_NO_escribe_en_ninguna_revision():
    """La invariante, comprobada sobre el codigo y no sobre la intencion.

    El manejador que cambia el molde toca `doc_review_plantillas` y NADA MAS.
    """
    cuerpo = _rutas().split('def modificar')[1].split('\n@')[0]
    assert 'UPDATE doc_review_plantillas' in cuerpo
    for prohibido in ('UPDATE doc_reviews', 'INSERT INTO doc_reviews',
                      'DELETE FROM doc_reviews'):
        assert prohibido not in cuerpo, (
            'modificar la plantilla escribe en las revisiones: %s' % prohibido)


def test_ningun_manejador_de_plantillas_escribe_en_doc_reviews():
    """Ni el de modificar, ni el de activar, ni ninguno. El fichero entero."""
    fuente = _rutas()
    for prohibido in ('UPDATE doc_reviews', 'INSERT INTO doc_reviews',
                      'DELETE FROM doc_reviews'):
        assert prohibido not in fuente, prohibido
    # Leer para CONTAR cuantas se abrieron con ella si vale: es lectura.
    assert 'SELECT count(*) FROM doc_reviews' in fuente


def test_la_revision_NO_tiene_clave_foranea_viva_a_la_plantilla():
    """Con una FK viva, borrar o editar el molde arrastraria procesos firmados.

    `plantilla_id` es un numero suelto A PROPOSITO.
    """
    sql = _sql()
    assert 'ADD COLUMN IF NOT EXISTS plantilla_id BIGINT' in sql
    assert 'REFERENCES doc_review_plantillas' not in sql, (
        'hay una clave foranea de doc_reviews a la plantilla: editar el molde '
        'podria arrastrar revisiones ya firmadas')


def test_la_revision_guarda_NOMBRE_y_VERSION_aplicados_no_solo_el_id():
    """«Plantilla 4» dejaria de decir nada el dia que esa plantilla se renombre."""
    sql = _sql()
    assert 'plantilla_nombre TEXT' in sql
    assert 'plantilla_version INTEGER' in sql
    import plantillas_de_revision as plt
    p = plt.procedencia({'id': '4', 'nombre': 'Aprobación de planos', 'version': 2})
    assert p == {'plantilla_id': '4', 'plantilla_nombre': 'Aprobación de planos',
                 'plantilla_version': 2}


def test_modificar_SUBE_LA_VERSION_y_lo_deja_en_el_historial():
    cuerpo = _rutas().split('def modificar')[1].split('\n@')[0]
    assert 'nueva_version = version + 1' in cuerpo
    assert "'event': 'modified'" in cuerpo
    assert "'by': _actor()" in cuerpo


# ══ 2 · NO HAY UN SEGUNDO MOTOR NI UN SEGUNDO CAMINO DE ALTA ═══════════════

def test_aplicar_una_plantilla_pasa_por_EL_ALTA_DE_SIEMPRE():
    """Un segundo camino de alta acabaria saltandose la independencia
    autor/revisor, el permiso sobre los documentos o la idoneidad."""
    assert 'INSERT INTO doc_reviews' not in _rutas(), (
        'el modulo de plantillas crea revisiones por su cuenta')
    cuerpo = _reviews().split('def create_review')[1].split('\ndef ')[0]
    assert "d.get('plantilla_id')" in cuerpo, 'el alta de siempre no sabe aplicar'
    # Y la expansion ocurre ANTES de las comprobaciones, para que los pasos que
    # salen del molde pasen por las mismas que los escritos a mano.
    i_exp = cuerpo.index("plt.resolver")
    for guardia in ('_revision_independiente', '_pasos_validos',
                    '_puede_con_estos_documentos'):
        assert cuerpo.index(guardia) > i_exp, (
            '%s se comprueba ANTES de expandir la plantilla: los pasos del molde '
            'se la saltarian' % guardia)


def test_la_plantilla_produce_una_COPIA_y_desaparece():
    fuente = io.open(os.path.join(RAIZ, 'plantillas_de_revision.py'),
                     encoding='utf-8').read()
    assert 'import copy' in fuente
    assert 'copy.deepcopy' in fuente, (
        'sin copia profunda, dos revisiones abiertas con la misma plantilla '
        'compartirian los mismos objetos de paso')


def test_NO_se_adopta_el_paralelo_y_se_DICE():
    """El benchmark lo lista como «secuencial/paralelo SI SE ADOPTA». El motor
    es secuencial; la plantilla no finge ofrecer lo que no hay."""
    fuente = io.open(os.path.join(RAIZ, 'plantillas_de_revision.py'),
                     encoding='utf-8').read()
    assert 'NO se adopta' in fuente
    assert "'paralelo': False" in _rutas(), 'el catalogo tiene que decirlo'


# ══ 3 · EL MOLDE SE VALIDA AL CREARLO ══════════════════════════════════════

def test_un_paso_sin_sujeto_no_pasa():
    import plantillas_de_revision as plt
    assert plt.validar_pasos([], plt.OBRA)
    assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'APRUEBA'}], plt.OBRA)
    assert plt.validar_pasos([{'etiqueta': '', 'decision': 'APRUEBA',
                               'user_id': 3}], plt.OBRA)
    assert plt.validar_pasos([{'etiqueta': 'x', 'user_id': 3}], plt.OBRA), (
        'un paso que no dice si revisa o aprueba')
    assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'INVENTADA',
                               'user_id': 3}], plt.OBRA)
    assert plt.validar_pasos(
        [{'etiqueta': 'x', 'decision': 'APRUEBA', 'user_id': 3}], plt.OBRA) is None


def test_una_persona_Y_una_funcion_a_la_vez_no_pasa():
    """Al aplicar no se sabria cual manda."""
    import plantillas_de_revision as plt
    assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'REVISA',
                               'user_id': 3, 'funcion': 'SUPERVISION'}], plt.OBRA)


def test_una_plantilla_de_ENTIDAD_no_puede_designar_a_una_PERSONA():
    """Esa persona no significa nada en otra obra, y una plantilla de entidad
    existe justamente para servir en veinte."""
    import plantillas_de_revision as plt
    mal = plt.validar_pasos([{'etiqueta': 'x', 'decision': 'APRUEBA', 'user_id': 3}],
                            plt.ENTIDAD)
    assert mal and 'función' in mal
    assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'APRUEBA',
                               'funcion': 'SUPERVISION'}], plt.ENTIDAD) is None
    assert plt.validar_pasos([{'etiqueta': 'x', 'decision': 'APRUEBA',
                               'funcion': 'INVENTADA'}], plt.ENTIDAD)


def test_el_plazo_por_paso_tiene_que_ser_un_numero():
    import plantillas_de_revision as plt
    base = {'etiqueta': 'x', 'decision': 'REVISA', 'user_id': 3}
    assert plt.validar_pasos([dict(base, dias='pronto')], plt.OBRA)
    assert plt.validar_pasos([dict(base, dias=-1)], plt.OBRA)
    assert plt.validar_pasos([dict(base, dias=5)], plt.OBRA) is None
    assert plt.validar_pasos([dict(base, dias=None)], plt.OBRA) is None


def test_hay_un_techo_de_pasos_y_esta_razonado():
    import plantillas_de_revision as plt
    seis = [{'etiqueta': 'p%d' % i, 'decision': 'REVISA', 'user_id': 3}
            for i in range(6)]
    assert plt.validar_pasos(seis, plt.OBRA) is None
    assert plt.validar_pasos(seis + [seis[0]], plt.OBRA)


def test_la_base_impide_una_plantilla_SIN_PASOS():
    """La validacion fina vive en el modulo, pero «al menos un paso» se
    garantiza en la base: es lo que impide que una escritura directa deje una
    plantilla que se aplica y no hace nada."""
    sql = _sql()
    assert 'ck_rev_plantilla_con_pasos' in sql
    assert 'jsonb_array_length(pasos) >= 1' in sql


def test_el_alcance_y_la_obra_tienen_que_cuadrar():
    """Una de OBRA sin obra no se aplicaria en ninguna parte; una de ENTIDAD con
    obra seria una de obra disfrazada."""
    sql = _sql()
    assert 'ck_rev_plantilla_alcance_coherente' in sql
    assert "alcance = 'OBRA'    AND project_id IS NOT NULL" in sql
    assert "alcance = 'ENTIDAD' AND project_id IS NULL" in sql


# ══ 4 · RESOLVER AL APLICAR ════════════════════════════════════════════════

def test_con_VARIOS_candidatos_no_elige_por_su_cuenta():
    """Elegir «el primero» seria repartir responsabilidad contractual por orden
    alfabetico."""
    import plantillas_de_revision as plt

    class Cur(object):
        def execute(self, q, args=None):
            self.q = q
        def fetchall(self):
            return [(7, 'Ana', 'a@x', 'SUPERVISA SA'),
                    (9, 'Beto', 'b@x', 'SUPERVISA SA')]
        def fetchone(self):
            return None

    p = {'pasos': [{'etiqueta': 'Supervisión', 'decision': 'APRUEBA',
                    'funcion': 'SUPERVISION'}]}
    res = plt.resolver(Cur(), p, 'obra-1')
    assert res.pasos is None
    assert res.code == 'ELIGE_REVISOR'
    assert len(res.opciones['0']) == 2


def test_sin_ningun_candidato_lo_dice_en_vez_de_abrir_una_revision_rota():
    import plantillas_de_revision as plt

    class Cur(object):
        def execute(self, q, args=None): pass
        def fetchall(self): return []
        def fetchone(self): return None

    p = {'pasos': [{'etiqueta': 'Supervisión', 'decision': 'APRUEBA',
                    'funcion': 'SUPERVISION'}]}
    res = plt.resolver(Cur(), p, 'obra-1')
    assert res.code == 'SIN_CANDIDATO'


def test_la_funcion_se_lee_de_project_companies_y_no_de_una_tabla_nueva():
    """No se crea una segunda fuente de autoridad sobre quien es que en la obra."""
    fuente = io.open(os.path.join(RAIZ, 'plantillas_de_revision.py'),
                     encoding='utf-8').read()
    cuerpo = fuente.split('def miembros_con_funcion')[1]
    assert 'project_companies' in cuerpo
    assert 'project_users' in cuerpo
    import plantillas_de_revision as plt
    import directorio_de_obra as dir_obra
    assert plt.FUNCIONES is dir_obra.FUNCIONES, (
        'las funciones se han copiado en vez de reutilizarse')


def test_el_paso_resuelto_lleva_user_id_y_el_resto_es_INSTANTANEA():
    """La identidad es `user_id` y solo `user_id`; nombre y correo dicen a quien
    se le pidio y con que nombre, aunque cambie."""
    fuente = io.open(os.path.join(RAIZ, 'plantillas_de_revision.py'),
                     encoding='utf-8').read()
    cuerpo = fuente.split('def resolver')[1].split('\ndef ')[0]
    assert "paso['user_id'] = fila[0]" in cuerpo
    assert "paso['name']" in cuerpo and "paso['email']" in cuerpo
    assert "paso['de_funcion']" in cuerpo, 'de donde salio el paso es traza util'
    assert 'INSTANTANEA' in cuerpo


def test_un_revisor_que_ya_no_esta_en_la_obra_para_la_aplicacion():
    fuente = io.open(os.path.join(RAIZ, 'plantillas_de_revision.py'),
                     encoding='utf-8').read()
    assert 'REVISOR_NO_MIEMBRO' in fuente
    assert 'REVISOR_INACTIVO' in fuente


# ══ 5 · HABILITADA / DESHABILITADA ═════════════════════════════════════════

def test_una_plantilla_DESHABILITADA_no_abre_revisiones_nuevas():
    cuerpo = _reviews().split('def create_review')[1].split('\ndef ')[0]
    assert 'PLANTILLA_DESACTIVADA' in cuerpo
    assert 'siguen su curso' in cuerpo, (
        'hay que decir que las ya abiertas NO se paran: si no, «deshabilitada» '
        'se lee como «cancelada»')


def test_deshabilitar_NO_borra():
    """Una plantilla aplicada a treinta revisiones es parte de como se goberno
    esta obra."""
    fuente = _rutas()
    assert 'DELETE FROM doc_review_plantillas' not in fuente
    cuerpo = fuente.split('def activar')[1].split('\n@')[0]
    assert 'UPDATE doc_review_plantillas SET activa' in cuerpo
    assert "'event': 'enabled' if quiere else 'disabled'" in cuerpo


def test_una_plantilla_de_OTRA_obra_no_se_aplica_aqui():
    cuerpo = _reviews().split('def create_review')[1].split('\ndef ')[0]
    assert 'OTRA_OBRA' in cuerpo


# ══ 6 · AUTORIDAD, SIN INVENTAR UNA SEGUNDA FUENTE ═════════════════════════

def test_la_de_OBRA_la_define_quien_ADMINISTRA_la_obra():
    fuente = _rutas()
    cuerpo = fuente.split('def _puede_definir')[1].split('\n\n\n')[0]
    assert 'guardia_administrativa' in cuerpo


def test_la_de_ENTIDAD_reutiliza_gestionar_perfiles():
    """«Crear y editar los perfiles reutilizables; aplicarlos sigue siendo un
    acto de cada obra». Una plantilla de flujo es exactamente eso: inventarle
    una facultad propia habria creado una segunda fuente de autoridad para la
    misma clase de decision."""
    cuerpo = _rutas().split('def _puede_definir')[1].split('\n\n\n')[0]
    assert "'gestionar_perfiles'" in cuerpo
    import roles_de_entidad as roles
    assert 'gestionar_perfiles' in roles.CODIGOS


def test_toda_ruta_de_escritura_de_plantillas_tiene_guardia():
    fuente = _rutas()
    for vista in ('crear', 'modificar', 'activar'):
        cuerpo = fuente.split('def %s(' % vista)[1].split('\n@')[0]
        assert '_puede_definir' in cuerpo, vista


def test_la_procedencia_se_DEVUELVE_y_no_solo_se_guarda():
    """Lo encontro la EXP contra produccion: la revision guardaba de donde salio
    su flujo y la API no lo devolvia, asi que ninguna pantalla podia ensenarlo.

    Es la misma clase de capacidad muerta que «existe en el backend no cuenta
    como implementado», solo que un nivel mas abajo: existe en la BASE y no
    llega a salir.
    """
    fuente = _reviews()
    cuerpo = fuente.split('def _row_to_dict')[1].split('\ndef ')[0]
    for campo in ('plantilla_id', 'plantilla_nombre', 'plantilla_version'):
        assert campo in cuerpo, campo
    # Y las tres consultas que alimentan `_row_to_dict` tienen que traerlas.
    assert fuente.count('plantilla_id, plantilla_nombre, plantilla_version') >= 3, (
        'alguna consulta de revisiones no trae la procedencia: `_row_to_dict` '
        'leeria fuera de la fila')
