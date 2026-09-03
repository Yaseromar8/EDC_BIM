# -*- coding: utf-8 -*-
"""REVIEWS-R01 · el contrato de una revision.

QUE SE PRUEBA AQUI Y QUE NO
---------------------------
Esta suite es DB-free (ver `conftest.py`), asi que aqui vive todo lo que se
puede demostrar sin base: la matriz funcional, el mapa de `emitido`, la
validacion del molde y del alta, y que el codigo y la migracion no divergen.

Lo que necesita una base --privilegio por columna, disparador de inmutabilidad,
que las filas reales no se toquen-- vive en
`backend/herramientas/ensayo_de_contrato_r01.py`, que corre contra un cluster
desechable. Las pruebas I1..I11 e I16 del contrato congelado estan alli.

LA REGLA QUE GOBIERNA CASI TODO ESTE FICHERO
--------------------------------------------
Una revision PRE tiene que comportarse EXACTAMENTE como antes de R01. No
«parecido»: igual. Hay 6 revisiones vivas en produccion que nacieron PRE y
terminan PRE, y cualquier puerta nueva que se les aplique cambia un proceso ya
en marcha. Por eso se prueba la equivalencia, no la ausencia de errores.
"""
import io
import os
import re

import pytest

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def _leer(rel):
    return io.open(os.path.join(RAIZ, rel), encoding='utf-8').read()


def _sin_comentarios(sql):
    """SQL ejecutable, sin los `--`.

    Hace falta porque una guardia que busca una construccion PROHIBIDA la
    encuentra en el comentario que explica por que no se usa, y pasa a verde
    creyendo haber encontrado el defecto. Es exactamente lo que le paso a la
    subprueba de literales del tripwire T9, que estuvo muerta desde su creacion.
    """
    return '\n'.join(re.sub(r'--.*$', '', l) for l in sql.splitlines())


# ══ 1 · LA LISTA CERRADA NO PUEDE DIVERGIR DE LA MIGRACION ═════════════════

def test_la_lista_de_contratos_del_codigo_es_la_de_la_base():
    """El defecto de la migracion 24: el codigo amplio la lista y la migracion
    no, y ninguna prueba los casaba. Aqui se casan."""
    import flujo_de_revision as flujo
    sql = _leer('sql/27_r01_contrato_de_revision.sql')
    m = re.search(r"CHECK\s*\(contrato\s+IN\s*\(([^)]*)\)\)", sql, re.I)
    assert m, 'la migracion 27 no declara ck_contrato_conocido'
    en_la_base = tuple(sorted(re.findall(r"'([A-Z_]+)'", m.group(1))))
    assert en_la_base == tuple(sorted(flujo.CONTRATOS)), (
        'la base admite %s y el codigo declara %s' % (en_la_base, flujo.CONTRATOS))


def test_la_migracion_deja_el_disparador_y_lo_verifica():
    sql = _leer('sql/27_r01_contrato_de_revision.sql')
    codigo = _sin_comentarios(sql)
    assert 'tg_contrato_inmutable' in codigo
    assert 'IS DISTINCT FROM OLD.contrato' in codigo, (
        'el disparador tiene que comparar VALORES, no usar BEFORE UPDATE OF')
    assert 'BEFORE UPDATE OF' not in codigo, (
        'BEFORE UPDATE OF se dispara cuando la columna APARECE en el SET, no '
        'cuando cambia')
    # Una migracion que no comprueba lo que dejo hecho solo comprueba que no
    # revento.
    assert "falta tg_contrato_inmutable" in sql
    assert "DESHABILITADO" in sql


def test_la_migracion_deja_todo_en_PRE_y_lo_exige():
    sql = _leer('sql/27_r01_contrato_de_revision.sql')
    assert "SET contrato = 'PRE' WHERE contrato IS NULL" in sql
    assert "contrato <> 'PRE'" in sql, (
        'la fase A tiene que verificar que no deja ningun contrato distinto de PRE')


# ══ 2 · LA BUILD B ES IDENTIFICABLE ════════════════════════════════════════

def test_el_motor_entiende_los_DOS_contratos_sea_cual_sea_el_vigente():
    """Que el motor NUNCA deje de entender PRE.

    Antes esta prueba exigia `CONTRATO_VIGENTE == PRE` para identificar la build
    B. Con la fase D aplicada eso deja de ser cierto, y mantenerlo habria
    obligado a borrar la prueba -- perdiendo lo que de verdad protege.

    La build B se identifica por su COMMIT (`f003a3b`), que es lo que se
    despliega si hay que volver. Lo que esta prueba fija es la propiedad que
    tiene que sobrevivir a cualquier giro: mientras queden revisiones PRE vivas
    --hoy 6 en produccion-- el motor tiene que seguir entendiendolas.
    """
    import flujo_de_revision as flujo
    assert flujo.contrato_conocido(flujo.PRE), (
        'el motor dejo de entender PRE: las 6 revisiones vivas quedarian sin motor')
    assert flujo.contrato_conocido(flujo.AUTORIDAD_TERMINAL)
    assert flujo.CONTRATO_VIGENTE in flujo.CONTRATOS, (
        'se crea con un contrato que no esta en la lista cerrada')


def test_el_contrato_vigente_es_constante_de_codigo_no_variable_de_entorno():
    """Para que el giro de la fase D deje un commit y no una configuracion."""
    fuente = _leer('flujo_de_revision.py')
    bloque = fuente[fuente.index('CONTRATO_VIGENTE'):]
    assert not re.match(r"CONTRATO_VIGENTE\s*=\s*os\.", bloque)
    assert 'getenv' not in fuente and 'environ' not in fuente


def test_la_fase_D_es_UNA_linea_y_esta_localizada():
    """LAS FASES B Y D NO SE PUEDEN COLAPSAR, y esta prueba es lo que lo
    sostiene: la build D es la build B con UNA asignacion cambiada.

    Si hubiera dos asignaciones, o si el valor se calculara, «volver a la build
    B» dejaria de ser una operacion identificable y el rollback de la fase D se
    quedaria sin destino reproducible.
    """
    fuente = _leer('flujo_de_revision.py')
    asignaciones = re.findall(r'^CONTRATO_VIGENTE\s*=\s*(\S+)\s*$', fuente, re.M)
    assert asignaciones == ['AUTORIDAD_TERMINAL'], (
        'la fase D tiene que ser UNA sola linea; encontradas: %r' % (asignaciones,))
    # Y no se reasigna en ningun otro sitio del backend.
    for rel in ('routes/reviews.py', 'plantillas_de_revision.py'):
        assert not re.search(r'CONTRATO_VIGENTE\s*=', _leer(rel)), (
            '%s reasigna CONTRATO_VIGENTE: la fase D dejaria de estar en un sitio'
            % rel)


# ══ 3 · PRE SE COMPORTA EXACTAMENTE COMO ANTES DE R01 ══════════════════════

FORMAS = [
    [{'decision': 'APRUEBA'}],
    [{'decision': 'REVISA'}],
    [{}],
    [{'decision': 'REVISA'}, {'decision': 'APRUEBA'}],
    [{'decision': 'APRUEBA'}, {'decision': 'REVISA'}],
    [{}, {}, {}],
    [{'decision': 'REVISA'}, {}, {'decision': 'APRUEBA'}],
]


@pytest.mark.parametrize('pasos', FORMAS)
def test_PRE_cierra_por_POSICION_y_por_nada_mas(pasos):
    """La condicion anterior era `current_step + 1 < len(steps)` -> avanza.

    Se comprueba la equivalencia LITERAL con esa expresion, para cada indice y
    cada forma de paso, incluidos pasos sin `decision`.
    """
    import flujo_de_revision as flujo
    for i in range(len(pasos)):
        avanzaba_antes = (i + 1) < len(pasos)
        avanza_ahora = not flujo.cierra_positivamente(flujo.PRE, pasos, i)
        assert avanza_ahora == avanzaba_antes, (
            'paso %d de %r: antes avanzaba=%s, ahora=%s'
            % (i, pasos, avanzaba_antes, avanza_ahora))


@pytest.mark.parametrize('pasos', FORMAS)
@pytest.mark.parametrize('accion', ['approve', 'reject'])
def test_PRE_no_gana_ninguna_puerta_nueva(pasos, accion):
    """Bajo PRE `acto_permitido` NUNCA rechaza. Una puerta nueva sobre PRE
    cambiaria el comportamiento de las 6 revisiones vivas."""
    import flujo_de_revision as flujo
    for i in range(len(pasos)):
        vale, motivo = flujo.acto_permitido(flujo.PRE, pasos, i, accion)
        assert vale, 'PRE rechazo un acto: %s' % motivo


@pytest.mark.parametrize('pasos', FORMAS)
@pytest.mark.parametrize('accion', ['approve', 'reject'])
def test_PRE_no_adquiere_emitido_nunca(pasos, accion):
    """I23. Una revision PRE conserva su historial anterior y no gana un campo
    que su proceso nunca tuvo."""
    import flujo_de_revision as flujo
    for paso in pasos:
        assert flujo.emitido_de(flujo.PRE, paso, accion) is None


# ══ 4 · LA MATRIZ DE AUTORIDAD_TERMINAL ════════════════════════════════════

def test_REVISA_intermedio_aprueba_como_CONFORME_y_avanza():
    """I17."""
    import flujo_de_revision as flujo
    pasos = [{'decision': 'REVISA'}, {'decision': 'APRUEBA'}]
    vale, _ = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 0, 'approve')
    assert vale
    assert not flujo.cierra_positivamente(flujo.AUTORIDAD_TERMINAL, pasos, 0)
    assert flujo.emitido_de(flujo.AUTORIDAD_TERMINAL, pasos[0],
                            'approve') == flujo.EMITIDO_CONFORME


def test_APRUEBA_intermedio_avanza_sin_cerrar():
    """I18. Un APRUEBA que no es el ultimo completa su paso y da paso."""
    import flujo_de_revision as flujo
    pasos = [{'decision': 'APRUEBA'}, {'decision': 'APRUEBA'}]
    vale, _ = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 0, 'approve')
    assert vale
    assert not flujo.cierra_positivamente(flujo.AUTORIDAD_TERMINAL, pasos, 0), (
        'un APRUEBA intermedio no puede cerrar anticipadamente')
    assert flujo.emitido_de(flujo.AUTORIDAD_TERMINAL, pasos[0],
                            'approve') == flujo.EMITIDO_APRUEBA


def test_APRUEBA_terminal_cierra():
    """I19."""
    import flujo_de_revision as flujo
    pasos = [{'decision': 'REVISA'}, {'decision': 'APRUEBA'}]
    vale, _ = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 1, 'approve')
    assert vale
    assert flujo.cierra_positivamente(flujo.AUTORIDAD_TERMINAL, pasos, 1)
    assert flujo.emitido_de(flujo.AUTORIDAD_TERMINAL, pasos[1],
                            'approve') == flujo.EMITIDO_APRUEBA


def test_REVISA_terminal_NO_cierra_y_el_acto_se_rechaza():
    """I20 y la decision final del dueno (§15.1).

    Aprobar un ultimo paso que solo revisa se RECHAZA. No se cierra, no se
    convierte a `rejected` --el actor no ejecuto `reject`-- y no se muta nada.
    """
    import flujo_de_revision as flujo
    pasos = [{'decision': 'APRUEBA'}, {'decision': 'REVISA'}]
    assert not flujo.cierra_positivamente(flujo.AUTORIDAD_TERMINAL, pasos, 1)
    vale, motivo = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 1, 'approve')
    assert not vale
    assert 'aprob' in motivo.lower()
    # Pero rechazarlo si se puede: `reject` es terminal en cualquier paso.
    vale, _ = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 1, 'reject')
    assert vale


def test_reject_es_terminal_y_emite_RECHAZA_en_cualquier_paso():
    """I21."""
    import flujo_de_revision as flujo
    pasos = [{'decision': 'REVISA'}, {'decision': 'APRUEBA'}]
    for i, paso in enumerate(pasos):
        vale, _ = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, i, 'reject')
        assert vale
        assert flujo.emitido_de(flujo.AUTORIDAD_TERMINAL, paso,
                                'reject') == flujo.EMITIDO_RECHAZA


def test_emitido_corresponde_exactamente_al_tipo_de_paso_y_al_acto():
    """I22. El mapa completo, sin huecos."""
    import flujo_de_revision as flujo
    T = flujo.AUTORIDAD_TERMINAL
    assert flujo.emitido_de(T, {'decision': 'REVISA'}, 'approve') == 'CONFORME'
    assert flujo.emitido_de(T, {'decision': 'APRUEBA'}, 'approve') == 'APRUEBA'
    assert flujo.emitido_de(T, {'decision': 'REVISA'}, 'reject') == 'RECHAZA'
    assert flujo.emitido_de(T, {'decision': 'APRUEBA'}, 'reject') == 'RECHAZA'
    assert set(flujo.EMITIDOS) == {'CONFORME', 'APRUEBA', 'RECHAZA'}


def test_un_paso_sin_decision_bajo_el_contrato_nuevo_congela_el_acto():
    """CONSECUENCIA DERIVADA, declarada: un paso que no dice que se le pidio no
    esta en la matriz de §2. El alta lo impide, asi que si aparece es porque
    entro fuera de banda, y entonces el motor no puede interpretarlo.

    Se rechazan approve Y reject: tomar una accion terminal sobre un expediente
    que el motor admite no entender seria peor que pararse.
    """
    import flujo_de_revision as flujo
    pasos = [{'decision': 'REVISA'}, {}]
    for accion in ('approve', 'reject'):
        vale, motivo = flujo.acto_permitido(flujo.AUTORIDAD_TERMINAL, pasos, 1, accion)
        assert not vale
        assert 'revisar o aprobar' in motivo


def test_un_contrato_desconocido_falla_cerrado_y_no_se_trata_como_PRE():
    """I8. Nunca «asume PRE»: suponer seria aplicar la regla posicional a un
    expediente que declaro otra."""
    import flujo_de_revision as flujo
    for contrato in (None, '', 'PREV', 'AUTORIDAD', 'pre', 'INVENTADO'):
        vale, motivo = flujo.acto_permitido(contrato, [{'decision': 'APRUEBA'}],
                                            0, 'approve')
        assert not vale, 'se acepto el contrato %r' % contrato
        assert 'no entiende' in motivo


# ══ 5 · EL ALTA: MANUAL Y PLANTILLA, EL MISMO CONTRATO DE PASO ═════════════

def test_pasos_sin_decision_los_senala_todos_por_posicion():
    import flujo_de_revision as flujo
    pasos = [{'decision': 'REVISA'}, {}, {'decision': 'INVENTADA'},
             {'decision': 'aprueba'}]
    assert flujo.pasos_sin_decision(pasos) == [2, 3]
    assert flujo.pasos_sin_decision([]) == []


def test_el_camino_MANUAL_del_frontend_declara_la_decision_de_cada_paso():
    """I12/I13 en el lado del cliente. El bypass estaba aqui: el camino de
    plantilla mandaba `decision` y el de a mano no."""
    jsx = io.open(os.path.join(RAIZ, '..', 'frontend-docs', 'src', 'components',
                               'ReviewsModule.jsx'), encoding='utf-8').read()
    envio = jsx[jsx.index('steps: steps.map('):]
    envio = envio[:envio.index('final_status')]
    assert 'decision: decisionDe(' in envio, (
        'el alta a mano no manda `decision`: el bypass sigue abierto')
    # Y el valor por defecto es el flujo canonico, no una casilla vacia.
    assert "(i === total - 1 ? 'APRUEBA' : 'REVISA')" in jsx


def test_la_validacion_del_alta_exige_decision_y_cierre_bajo_el_contrato_nuevo():
    """I13/I15 en el backend, leidos en la fuente: la puerta esta en
    `_pasos_validos`, que atraviesan los DOS caminos de alta."""
    fuente = _leer('routes/reviews.py')
    cuerpo = fuente[fuente.index('def _pasos_validos'):fuente.index('@solo_con_ddl')]
    assert 'PASO_SIN_DECISION' in cuerpo
    assert 'FLUJO_SIN_CIERRE' in cuerpo
    assert 'AUTORIDAD_TERMINAL' in cuerpo
    # Y la llamada le pasa el contrato: una puerta que no se invoca no es puerta.
    assert '_pasos_validos(cur, obra, steps, contrato)' in fuente


# ══ 6 · LAS PLANTILLAS ═════════════════════════════════════════════════════

def test_una_plantilla_terminal_REVISA_no_se_guarda_bajo_el_contrato_nuevo():
    """I15."""
    import plantillas_de_revision as plt
    import flujo_de_revision as flujo
    solo_revisa = [{'etiqueta': 'a', 'decision': 'REVISA', 'user_id': 3}]
    mal = plt.validar_pasos(solo_revisa, plt.OBRA, contrato=flujo.AUTORIDAD_TERMINAL)
    assert mal and 'aprobación' in mal
    # Y bajo PRE se guarda igual que siempre: no se toca lo que ya existe.
    assert plt.validar_pasos(solo_revisa, plt.OBRA, contrato=flujo.PRE) is None


def test_una_plantilla_que_termina_en_APRUEBA_vale_con_los_dos_contratos():
    import plantillas_de_revision as plt
    import flujo_de_revision as flujo
    pasos = [{'etiqueta': 'a', 'decision': 'REVISA', 'user_id': 3},
             {'etiqueta': 'b', 'decision': 'APRUEBA', 'user_id': 4}]
    for contrato in (flujo.PRE, flujo.AUTORIDAD_TERMINAL):
        assert plt.validar_pasos(pasos, plt.OBRA, contrato=contrato) is None


def test_editar_una_plantilla_pasa_por_la_MISMA_validacion_que_crearla():
    """§5: editar produce configuracion nueva y tiene que satisfacer el contrato
    vigente. Si `modificar` no llamara al mismo validador, una plantilla
    incompatible podria entrar por la puerta de atras."""
    rutas = _leer('routes/plantillas_revision.py')
    assert rutas.count('plt.validar_pasos(pasos, alcance)') == 2, (
        'crear y modificar tienen que validar con la misma funcion')


def test_el_molde_y_el_motor_responden_con_la_MISMA_funcion():
    """El molde pregunta «¿puede cerrarse?» con `cierra_positivamente`, la misma
    que usa `/act`. Dos respuestas distintas permitirian guardar una plantilla
    que despues no se puede terminar."""
    assert 'flujo.cierra_positivamente(' in _leer('plantillas_de_revision.py')
    assert 'flujo.cierra_positivamente(' in _leer('routes/reviews.py')


# ══ 6b · FASE E · NADIE PUEDE OMITIR EL CONTRATO ═══════════════════════════

ESCRITORES = [
    ('routes/reviews.py', 1),
    ('herramientas/ensayo_de_revisiones.py', 3),
    ('herramientas/ensayo_de_participantes.py', 1),
    ('herramientas/ensayo_del_expediente.py', 1),
]


@pytest.mark.parametrize('rel,cuantos', ESCRITORES)
def test_todos_los_INSERT_de_doc_reviews_aportan_contrato(rel, cuantos):
    """La fase E retira el `DEFAULT 'PRE'`: desde entonces un INSERT que omita
    `contrato` FALLA. Esta prueba es lo que impide que la fase E rompa un
    escritor -- o que uno nuevo nazca omitiendolo.

    Se cuenta sobre la lista de columnas de cada INSERT, no sobre el fichero
    entero: que la palabra `contrato` aparezca en un comentario no vale.
    """
    fuente = _leer(rel)
    # Cada INSERT INTO doc_reviews (...) con su lista de columnas.
    listas = re.findall(r'INSERT INTO doc_reviews\s*\((.*?)\)',
                        re.sub(r'"\s*\n\s*"', '', fuente), re.S)
    assert len(listas) == cuantos, (
        '%s: esperados %d INSERT, encontrados %d' % (rel, cuantos, len(listas)))
    for i, lista in enumerate(listas, 1):
        columnas = [c.strip() for c in lista.replace('\n', ' ').split(',')]
        assert 'contrato' in columnas, (
            '%s, INSERT %d: no aporta `contrato`. Tras la fase E ese INSERT '
            'falla.\n  columnas: %s' % (rel, i, columnas))


def test_la_migracion_28_retira_el_default_y_lo_verifica():
    sql = _sin_comentarios(_leer('sql/28_r01_fase_e_sin_default.sql'))
    assert 'ALTER COLUMN contrato DROP DEFAULT' in sql
    assert 'el DEFAULT sigue puesto' in sql, 'no verifica que lo retiro'
    # Y se niega si la fase A no esta completa: retirar la red sin tener la
    # otra puesta seria dejar la columna sin ninguna.
    assert 'ME NIEGO' in sql
    assert 'ck_contrato_conocido' in sql and 'tg_contrato_inmutable' in sql
    # No toca ni una fila.
    for prohibido in ('UPDATE doc_reviews', 'DELETE FROM doc_reviews',
                      'INSERT INTO doc_reviews'):
        assert prohibido not in sql, '%s escribe filas: %s' % ('la 28', prohibido)


# ══ 7 · LA PUERTA VA ANTES DE LA PRIMERA MUTACION ══════════════════════════

def test_el_contrato_se_comprueba_antes_de_tocar_nada():
    """El primer efecto de `/act` es cerrar el encargo del paso. Si la puerta
    del contrato estuviera despues, un acto rechazado dejaria el encargo
    cerrado y la revision sin avanzar: un efecto parcial.
    """
    fuente = _leer('routes/reviews.py')
    cuerpo = fuente[fuente.index('def act_on_review'):
                    fuente.index('def reasignar_revisor')]
    puerta = cuerpo.index('acto_permitido')
    assert puerta < cuerpo.index('cerrar_los_de'), (
        'la puerta del contrato esta despues de la primera mutacion')
    assert puerta < cuerpo.index("entry = {"), (
        'la puerta del contrato esta despues de construir la entrada')
    # Y el rechazo no convierte la revision a rejected.
    rechazo = cuerpo[puerta:cuerpo.index('cerrar_los_de')]
    assert "status='rejected'" not in rechazo


def test_el_alta_no_deja_elegir_el_contrato_al_cliente():
    """El motor con el que se cierra un expediente no lo elige quien lo abre."""
    fuente = _leer('routes/reviews.py')
    cuerpo = fuente[fuente.index('def create_review'):
                    fuente.index('def act_on_review')]
    assert 'contrato = flujo.CONTRATO_VIGENTE' in cuerpo
    assert "d.get('contrato')" not in cuerpo and "d['contrato']" not in cuerpo


def test_el_alta_escribe_el_contrato_y_su_testigo():
    """I10/I11 en la fuente: la columna y el registro de actividad tienen que
    decir lo mismo, y para eso los dos salen de la misma variable."""
    fuente = _leer('routes/reviews.py')
    cuerpo = fuente[fuente.index('def create_review'):
                    fuente.index('def act_on_review')]
    assert 'plantilla_version, contrato)' in cuerpo
    assert 'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)' in cuerpo
    assert 'details={"contrato": contrato}' in cuerpo


def test_las_consultas_leen_el_contrato():
    """Sin esto `/act` no podria saber con que reglas cerrar, y `_row_to_dict`
    devolveria None -> fallo cerrado en cada acto."""
    fuente = _leer('routes/reviews.py')
    assert fuente.count('plantilla_version,\n                                  contrato') == 3
    assert '"contrato": r[17] if len(r) > 17 else None' in fuente
