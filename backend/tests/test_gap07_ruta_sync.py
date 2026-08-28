# -*- coding: utf-8 -*-
"""GAP 07 · POST /api/sync — atomicidad, revalidacion y desenlaces.

Lo que se defiende aqui NO es que la ruta «funcione»: es que se comporte bien
cuando las cosas van mal, que es cuando una cola de campo se pierde.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ruta():
    return io.open(os.path.join(RAIZ, 'routes', 'sync.py'), encoding='utf-8').read()


def _cuerpo(nombre):
    return _ruta().split('def %s(' % nombre)[1].split(chr(10) + 'def ')[0]


# ══ 1 · ATOMICIDAD POR OPERACION, NO POR LOTE ══════════════════════════════

def test_cada_operacion_va_en_SU_PROPIA_transaccion():
    """Quien sincroniza tras una jornada sin cobertura trae quince cosas. Que
    una mal formada tire las otras catorce seria perder trabajo por un
    detalle."""
    cuerpo = _cuerpo('sincronizar')
    # La conexion se abre DENTRO del bucle, una por acto.
    i_bucle = cuerpo.index('for op in sync.ordenar')
    i_conexion = cuerpo.index('with get_db_connection()')
    assert i_conexion > i_bucle, (
        'la conexion se abre fuera del bucle: un fallo tumbaria el lote entero')
    assert cuerpo.count('conn.commit()') >= 4, (
        'cada desenlace tiene que confirmar el suyo')


def test_la_respuesta_va_POR_operacion_y_no_es_un_sync_failed():
    cuerpo = _cuerpo('_respuesta')
    for campo in ('operation_id', 'status', 'canonical_object_id',
                  'canonical_result', 'error_code'):
        assert "'%s'" % campo in cuerpo, campo
    assert "'dependency_blocker'" in cuerpo
    assert "'conflict_state'" in cuerpo
    # Y la respuesta de la ruta es una LISTA de desenlaces, no un veredicto
    # unico del lote.
    fin = _cuerpo('sincronizar')[-400:]
    assert "'resultados': resultados" in fin
    assert "'total': len(resultados)" in fin


def test_un_fallo_de_servidor_NO_se_reporta_como_rechazo():
    """«Rechazada» le diria al movil que descarte trabajo que en realidad nunca
    se proceso. Si la transaccion no confirmo, el acto no ocurrio."""
    cuerpo = _cuerpo('sincronizar')
    assert "'status': sync.REINTENTABLE" in cuerpo, (
        'se responde con la constante, no con un literal suelto que pueda '
        'divergir del motor')
    assert 'ERROR_DE_SERVIDOR' in cuerpo
    # Y no se anota nada en ese camino: no hubo desenlace que anotar.
    tramo = cuerpo.split('except Exception as e:')[-1]
    assert 'sync.anotar' not in tramo


# ══ 2 · LAS SIETE REVALIDACIONES ═══════════════════════════════════════════

def test_la_identidad_se_comprueba_y_NO_viene_del_movil():
    cuerpo = _cuerpo('sincronizar')
    assert "'NO_TOKEN'" in cuerpo
    assert 'actor_id = _usuario().get(' in cuerpo
    # El payload no puede aportar el actor por ninguna via.
    fuente = _ruta()
    for colado in ("p.get('actor_id')", "op.get('actor_id')", "p['actor_id']",
                   "op['actor_id']"):
        assert colado not in fuente, colado


def test_pertenencia_y_herramienta_se_revalidan_POR_OPERACION():
    """Un envio trae actos de varias obras. Una guardia unica al principio
    aprobaria el lote entero por la obra de su primera operacion."""
    cuerpo = _cuerpo('_puede_operar_en_la_obra')
    assert 'guardia_de_obra' in cuerpo          # 2
    assert '_hdo.esta_activa' in cuerpo         # 3 · capa 16
    assert '_ath.puede_entrar' in cuerpo        # 3 · capa 08
    assert 'ACCESO_REVOCADO' in cuerpo
    # Y se llama desde dentro del bucle.
    bucle = _cuerpo('sincronizar')
    assert bucle.index('_puede_operar_en_la_obra') > bucle.index('for op in sync.ordenar')


def test_capa16_no_se_salta_por_sincronizar():
    """`/api/sync` no cae bajo ninguna herramienta segun la RUTA, asi que el
    middleware no la gobierna. Si no se comprobara aqui, sincronizar seria la
    puerta que se salta la capa 16."""
    fuente = _ruta()
    assert 'HERRAMIENTA_DE' in fuente
    import routes.sync as rs
    assert rs.HERRAMIENTA_DE == {'PROTOCOLO': 'protocolos', 'ISSUE': 'issues',
                                 'FOTO': 'fotos',                    # NG-02
                                 'PARTE': 'cuaderno', 'ASIENTO': 'cuaderno'}  # NG-03
    import herramientas_de_obra as hdo
    for codigo in rs.HERRAMIENTA_DE.values():
        assert codigo in hdo.CODIGOS, codigo


def test_las_capas_que_dependen_del_ESTADO_van_con_la_fila_bloqueada():
    """Sin `FOR UPDATE`, dos sincronizaciones simultaneas leerian el mismo
    estado y las dos se creerian legitimadas. Y validar fuera de la transaccion
    dejaria la ventana clasica: validar -> esperar -> mutar."""
    cuerpo = _cuerpo('_issue_leer_bloqueando')
    assert 'FOR UPDATE' in cuerpo
    # El acto de corregir lee bloqueando ANTES de decidir nada.
    corregir = _cuerpo('_issue_mark_corrected')
    assert corregir.index('_issue_leer_bloqueando') < corregir.index('puede_corregir')
    assert corregir.index('_issue_leer_bloqueando') < corregir.index('transicion_valida')
    # Y ni una confirmacion en medio de las comprobaciones.
    assert 'commit' not in corregir


def test_responsabilidad_y_transicion_se_revalidan_en_el_acto():
    corregir = _cuerpo('_issue_mark_corrected')
    assert 'iss.puede_corregir' in corregir      # 6
    assert 'reg.transicion_valida' in corregir   # 7
    assert 'NO_RESPONSABLE' in corregir
    assert 'SIN_EVIDENCIA' in corregir


def test_los_designados_tienen_que_SEGUIR_en_la_obra():
    """Pudieron salir mientras no habia cobertura."""
    crear = _cuerpo('_issue_create')
    assert 'FROM project_users WHERE project_id=%s AND user_id=%s' in crear
    assert '_NO_MIEMBRO' in crear


# ══ 3 · CONFLICTO, NUNCA last-write-wins ═══════════════════════════════════

def test_el_estado_esperado_produce_CONFLICTO_y_conserva_las_dos_versiones():
    cuerpo = _cuerpo('_estado_esperado')
    assert 'base_version' in cuerpo
    assert 'expected_state' in cuerpo
    assert 'CONFLICTO_DE_ESTADO' in cuerpo
    assert 'estado_servidor' in cuerpo
    assert 'No se ha tocado nada' in cuerpo


def test_no_se_reinterpreta_la_intencion():
    """Ante un estado distinto del esperado, el unico desenlace es CONFLICTO:
    no hay ninguna rama que intente adivinar que queria hacer el usuario."""
    cuerpo = _cuerpo('_estado_esperado')
    assert 'en_conflicto' in cuerpo
    # No hay ninguna via que aplique el acto igualmente.
    assert 'UPDATE' not in cuerpo
    assert 'aplicada' not in cuerpo
    # Y el estado del servidor se CONSERVA, no se descarta.
    assert 'estado_servidor=' in cuerpo


def test_una_transicion_imposible_es_CONFLICTO_y_no_rechazo():
    """Que el issue ya este verificado no es culpa de quien lo capturo: es que
    el mundo se movio. Rechazarlo le diria que hizo algo mal."""
    corregir = _cuerpo('_issue_mark_corrected')
    tramo = corregir.split('transicion_valida')[1][:400]
    assert 'en_conflicto' in tramo
    assert 'rechazada' not in tramo


# ══ 4 · DEPENDENCIAS ═══════════════════════════════════════════════════════

def test_lo_dependiente_queda_BLOQUEADA_y_no_RECHAZADA():
    """Y vuelve a ser elegible cuando su predecesora se resuelva."""
    cuerpo = _cuerpo('sincronizar')
    assert 'sync.bloqueada' in cuerpo
    assert 'vuelve a ser elegible' in cuerpo
    assert 'dependency_blocker' in _ruta()


def test_la_dependencia_se_mira_primero_en_el_LOTE_y_despues_en_la_base():
    """La predecesora puede acabar de procesarse en este mismo envio."""
    cuerpo = _cuerpo('sincronizar')
    assert 'en_este_lote' in cuerpo
    assert 'sync.dependencia_satisfecha' in cuerpo
    assert cuerpo.index('en_este_lote.get(dep)') < cuerpo.index('sync.dependencia_satisfecha')


def test_un_acto_sobre_un_objeto_local_sin_resolver_no_se_ejecuta():
    cuerpo = _cuerpo('sincronizar')
    assert 'OBJETO_LOCAL_SIN_RESOLVER' in cuerpo
    assert 'sync.resolver_objeto' in cuerpo


def test_el_orden_NO_usa_capturado_en():
    """Dos relojes movidos reordenarian actos ajenos entre si."""
    cuerpo = _cuerpo('sincronizar')
    assert 'sync.ordenar(operaciones)' in cuerpo
    import sincronizacion_de_campo as s
    orden = io.open(os.path.join(RAIZ, 'sincronizacion_de_campo.py'),
                    encoding='utf-8').read().split('def ordenar')[1].split(chr(10) + 'def ')[0]
    assert 'capturado_en' not in orden


# ══ 5 · IDEMPOTENCIA ═══════════════════════════════════════════════════════

def test_un_reenvio_devuelve_lo_consolidado_ANTES_de_cualquier_otra_cosa():
    """Diez envios del mismo `operation_id` producen UN solo efecto."""
    cuerpo = _cuerpo('sincronizar')
    i_previo = cuerpo.index('sync.ya_procesada')
    for despues in ('_puede_operar_en_la_obra', 'DESPACHO.get'):
        assert cuerpo.index(despues) > i_previo, (
            '%s se ejecuta antes de mirar si es un reenvio' % despues)


def test_el_acto_y_su_registro_CONFIRMAN_JUNTOS():
    cuerpo = _cuerpo('sincronizar')
    tramo = cuerpo.split('# El acto y su registro CONFIRMAN JUNTOS.')[1][:200]
    assert 'sync.anotar' in tramo
    assert 'conn.commit()' in tramo
    assert tramo.index('sync.anotar') < tramo.index('conn.commit()')


def test_mismo_objeto_local_con_actos_DISTINTOS_son_actos_distintos():
    """`local_object_id` identifica el OBJETO; `operation_id` el ACTO. Tres
    actos sobre el mismo issue son tres operaciones validas, no un duplicado."""
    import sincronizacion_de_campo as sync
    base = {'local_object_id': 'L1', 'object_type': 'ISSUE',
            'server_object_id': '9'}
    for accion in ('ADD_EVIDENCE', 'MARK_CORRECTED'):
        op = dict(base, operation_id='op-%s' % accion, action=accion)
        assert sync.forma_valida(op) is None, accion
    # Y el registro los distingue: la llave unica es por operacion.
    sql = io.open(os.path.join(RAIZ, 'sql', '21_gap07_sincronizacion_de_campo.sql'),
                  encoding='utf-8').read()
    assert 'ON sync_operaciones(project_id, operation_id)' in sql
    # El del OBJETO no es UNICO: un objeto tiene varios actos, y hacerlo
    # unico impediria adjuntar una foto a un issue que ya se creo.
    assert 'ON sync_operaciones(project_id, local_object_id)' in sql
    assert 'CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_objeto_local' not in sql
    assert 'CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_objeto_local' not in sql


# ══ 6 · EL BLOB NO ES LA AUTORIDAD ═════════════════════════════════════════

def test_que_exista_el_objeto_externo_NO_significa_que_el_acto_se_aplicara():
    """La autoridad sigue en PostgreSQL. Una foto en el almacen no corrige un
    issue ni cierra un punch."""
    cuerpo = _cuerpo('_issue_add_evidence')
    assert 'EXISTE EL OBJETO EXTERNO' in cuerpo
    assert 'La autoridad sigue en PostgreSQL' in cuerpo
    assert 'DESACOPLADO' in cuerpo
    # El vinculo se escribe DESPUES de revalidar, no antes.
    assert cuerpo.index('_issue_leer_bloqueando') < cuerpo.index('UPDATE doc_issues SET evidencia')
    assert cuerpo.index('_estado_esperado') < cuerpo.index('UPDATE doc_issues SET evidencia')


def test_adjuntar_evidencia_tambien_tiene_su_autoridad():
    cuerpo = _cuerpo('_issue_add_evidence')
    assert 'NO_PUEDE_ADJUNTAR' in cuerpo
    assert 'OTRA_OBRA' in cuerpo


def test_el_nombre_del_objeto_externo_es_determinista_y_no_lo_elige_el_movil():
    """Si el movil pudiera elegirlo, dos operaciones distintas podrian escribir
    el mismo objeto -- o una podria pisar la evidencia de otra."""
    cuerpo = _cuerpo('_issue_add_evidence')
    assert 'sync.nombre_del_objeto_externo' in cuerpo


# ══ 7 · LA VERTICAL DECLARADA ══════════════════════════════════════════════

def test_lo_que_TODAVIA_no_se_sincroniza_lo_dice_en_vez_de_fallar_raro():
    cuerpo = _cuerpo('sincronizar')
    assert 'ACTO_NO_SINCRONIZABLE' in cuerpo
    import routes.sync as rs
    import sincronizacion_de_campo as s
    # DOS DOMINIOS sobre el MISMO motor, que es lo que demuestra que esto es
    # infraestructura y no «offline para issues» disfrazado.
    assert set(rs.DESPACHO) == {(s.ISSUE, s.CREATE), (s.ISSUE, s.MARK_CORRECTED),
                                (s.ISSUE, s.ADD_EVIDENCE),
                                (s.PROTOCOLO, s.CREATE), (s.PROTOCOLO, s.SET_ITEMS),
                                (s.FOTO, s.CREATE),                    # NG-02
                                (s.PARTE, s.CREATE), (s.ASIENTO, s.CREATE),  # NG-03
                                    (s.AVANCE, s.CREATE)}                  # NG-04
    # Firmar se hace CON conexion, a proposito, y se dice. Y aprobar, cerrar la
    # jornada y emitir instrucciones igual (doc 96 §H): CREATE es lo unico que
    # el cuaderno sincroniza.
    assert (s.PROTOCOLO, s.SIGN) not in rs.DESPACHO


def test_hay_un_techo_de_lote():
    cuerpo = _cuerpo('sincronizar')
    assert 'MAX_POR_LOTE' in cuerpo
    assert 'LOTE_DEMASIADO_GRANDE' in cuerpo


# ══ 8 · LA FRONTERA REINTENTABLE / INDETERMINADA ═══════════════════════════

def test_un_acto_que_pudo_tocar_el_EXTERIOR_no_cae_en_REINTENTABLE():
    """El agujero seria un `except` generico devolviendo «reintentalo» sobre un
    efecto que quiza ya ocurrio. Los actos que pueden tocar el exterior estan
    DECLARADOS, y ese camino pasa por la semantica de efecto externo."""
    import sincronizacion_de_campo as s
    assert s.puede_tocar_el_exterior('ISSUE', 'ADD_EVIDENCE')
    assert not s.puede_tocar_el_exterior('ISSUE', 'CREATE')
    assert not s.puede_tocar_el_exterior('PROTOCOLO', 'SET_ITEMS')

    cuerpo = _cuerpo('sincronizar')
    tramo = cuerpo.split('except Exception as e:')[-1]
    # La bifurcacion existe y va ANTES de responder REINTENTABLE.
    assert 'puede_tocar_el_exterior' in tramo
    assert '_registrar_indeterminada' in tramo
    # La bifurcacion va ANTES de la respuesta REINTENTABLE, y sale con `continue`
    # para que un acto con efecto externo posible nunca llegue a ella.
    assert tramo.index('puede_tocar_el_exterior') < tramo.index('sync.REINTENTABLE')
    salida = tramo.split('puede_tocar_el_exterior')[1]
    assert salida.index('continue') < salida.index('sync.REINTENTABLE')


def test_la_constancia_del_efecto_externo_va_en_conexion_NUEVA():
    """La del acto acaba de fallar y su transaccion esta envenenada: escribir
    ahi no dejaria constancia de nada."""
    cuerpo = _cuerpo('_registrar_indeterminada')
    assert 'with get_db_connection()' in cuerpo
    assert 'reservar_efecto_externo' in cuerpo
    assert 'conn.commit()' in cuerpo
    # Y si ni eso se pudiera, se responde INDETERMINADA igualmente: lo que NO se
    # puede es decir «reintentalo» sin saber.
    assert 'SIN registrar' in cuerpo


def test_REINTENTABLE_no_es_un_estado_del_REGISTRO():
    """No deja fila: en PostgreSQL, que la transaccion no confirme significa
    literalmente que no paso nada."""
    import sincronizacion_de_campo as s
    assert s.REINTENTABLE not in s.ESTADOS
    sql = io.open(os.path.join(RAIZ, 'sql', '21_gap07_sincronizacion_de_campo.sql'),
                  encoding='utf-8').read()
    assert "'REINTENTABLE'" not in sql


def test_capturado_en_NO_se_describe_como_prueba_autoritativa():
    """Un reloj de movil se puede mover, y aqui no se verifica el dispositivo.
    Describirlo como prueba seria sobrevender lo que el dato vale."""
    for fichero in ('sincronizacion_de_campo.py',
                    'sql/21_gap07_sincronizacion_de_campo.sql'):
        fuente = io.open(os.path.join(RAIZ, fichero), encoding='utf-8').read()
        assert 'unica prueba' not in fuente, fichero
        assert 'DECLARADO' in fuente.upper(), fichero
    motor = io.open(os.path.join(RAIZ, 'sincronizacion_de_campo.py'),
                    encoding='utf-8').read()
    assert 'AUTORITATIVO' in motor
    assert 'NO es prueba de cuando ocurrio el acto' in motor


# ══ 9 · LA VERTICAL DE PROTOCOLOS · MISMO MOTOR, OTRO DOMINIO ══════════════

def test_el_protocolo_usa_EL_MISMO_motor_y_no_uno_paralelo():
    """Mismo `operation_id`, mismo modelo de cola, misma revalidacion, misma
    idempotencia. Lo unico distinto es la semantica."""
    fuente = _ruta()
    # UNA sola tabla de operaciones y UNA sola llave de idempotencia: los actos
    # de protocolo no tienen un registro propio ni un camino paralelo.
    assert 'sync_operaciones' not in fuente, (
        'la ruta escribe en la tabla del motor por su cuenta en vez de usarlo')
    assert fuente.count('sync.ya_procesada') == 1, 'una sola puerta de reenvio'
    assert fuente.count('sync.ordenar') == 1, 'un solo orden'
    # `sync.anotar` aparece una vez por camino de salida --y eso es correcto--
    # pero SIEMPRE es el mismo registro del mismo motor.
    assert 'import sincronizacion_de_campo as sync' in fuente
    # Y los actos de protocolo entran por el MISMO despacho.
    import routes.sync as rs
    import sincronizacion_de_campo as s
    assert rs.DESPACHO[(s.PROTOCOLO, s.CREATE)].__name__ == '_protocolo_create'
    assert rs.DESPACHO[(s.PROTOCOLO, s.SET_ITEMS)].__name__ == '_protocolo_set_items'


def test_el_acta_se_lee_BLOQUEANDO_igual_que_el_issue():
    cuerpo = _cuerpo('_acta_leer_bloqueando')
    assert 'FOR UPDATE' in cuerpo
    marcar = _cuerpo('_protocolo_set_items')
    assert marcar.index('_acta_leer_bloqueando') < marcar.index("d['estado'] != pro.BORRADOR")


def test_una_acta_FIRMADA_no_se_edita_desde_campo():
    """Es lo que la hace valer algo. Y el desenlace es CONFLICTO, no rechazo: no
    es culpa de quien la marco que el mundo se moviera."""
    cuerpo = _cuerpo('_protocolo_set_items')
    assert 'ACTA_NO_EDITABLE' in cuerpo
    assert 'en_conflicto' in cuerpo.split('ACTA_NO_EDITABLE')[0][-400:]
    assert 'no se ha perdido' in cuerpo.lower()


def test_la_plantilla_se_COPIA_tambien_cuando_el_acta_nace_sin_cobertura():
    """Si la plantilla cambia manana, esta acta seguira diciendo lo que se
    comprobo hoy. Que se levantara en campo no cambia esa regla."""
    cuerpo = _cuerpo('_protocolo_create')
    assert 'protocolo_nombre' in cuerpo and 'protocolo_version' in cuerpo
    assert "'resultado': pro.PENDIENTE" in cuerpo
    assert 'PLANTILLA_DESACTIVADA' in cuerpo
    assert 'PLANTILLA_SIN_PUNTOS' in cuerpo


def test_los_puntos_que_llegan_tienen_que_CUADRAR_con_los_del_acta():
    """Si no cuadran, la plantilla cambio o el acta no es la que el movil cree.
    Escribirlos igualmente machacaria puntos que no son los mismos."""
    cuerpo = _cuerpo('_protocolo_set_items')
    assert 'PUNTOS_NO_CUADRAN' in cuerpo
    assert 'RESULTADO_DESCONOCIDO' in cuerpo


def test_la_semantica_del_protocolo_NO_se_reescribe_en_sync():
    """Vive donde siempre: `flujo_de_protocolo`."""
    fuente = _ruta()
    assert 'import flujo_de_protocolo as pro' in fuente
    assert 'pro.RESULTADOS' in fuente
    assert 'pro.veredicto_que_corresponde' in fuente
    assert 'pro.BORRADOR' in fuente


# ══ 9 · LAS VERSIONES HISTORICAS FORMAN PARTE DE LA INTENCION ══════════════
#
# Lo que alguien comprobo en obra lo comprobo contra UN documento concreto. Al
# sincronizar, el servidor NO puede sustituir ese documento por el vigente:
# haria decir a esa persona algo que no dijo.

def test_el_acta_declara_CONTRA_QUE_VERSION_se_lleno():
    """Un acta que no dice contra que version se lleno es irreconstruible. Se
    rechaza en vez de suponer que fue la de hoy."""
    cuerpo = _cuerpo('_protocolo_create')
    assert "p.get('protocolo_version')" in cuerpo, (
        'la version tiene que venir del acto, no leerse de la plantilla')
    assert 'SIN_VERSION_DE_PLANTILLA' in cuerpo
    # Y se comprueba ANTES de tocar nada.
    assert (cuerpo.index('SIN_VERSION_DE_PLANTILLA')
            < cuerpo.index('INSERT INTO doc_actas'))


def test_una_version_que_ya_no_se_puede_reconstruir_es_CONFLICTO():
    """No rechazo: nadie hizo nada mal. Y no aplicarlo contra la vigente: eso
    reinterpretaria respuestas ajenas. Es una decision de persona."""
    cuerpo = _cuerpo('_protocolo_create')
    assert 'VERSION_DE_PLANTILLA_NO_RECONSTRUIBLE' in cuerpo
    i = cuerpo.index('VERSION_DE_PLANTILLA_NO_RECONSTRUIBLE')
    antes = cuerpo[:i]
    assert 'sync.en_conflicto(' in antes[-500:], (
        'una version irreconstruible NO es un rechazo ni un exito')
    # Y se le dice al usuario que estaba viendo y que hay ahora.
    assert "'version_vigente'" in cuerpo and "'version_usada'" in cuerpo


def test_la_version_NO_se_toma_de_la_plantilla_vigente():
    """El bug que esta prueba impide: `version = pl[2]`. Silencioso, comodo, y
    convierte un acta de la v1 en un acta de la v2 sin que nadie lo note."""
    cuerpo = _cuerpo('_protocolo_create')
    guardado = cuerpo.split('INSERT INTO doc_actas')[1][:900]
    assert 'version_pedida' in guardado, (
        'lo que se guarda tiene que ser la version que se uso en campo')


def test_el_anclaje_del_issue_conserva_la_revision_VISTA_EN_CAMPO():
    """Si mientras no habia cobertura salio una revision nueva, la observacion
    NO se muda a ella: se levanto sobre una lamina concreta."""
    cuerpo = _cuerpo('_issue_create')
    assert "revision_id = p.get('revision_id')" in cuerpo
    # NUNCA se busca la vigente para sustituirla.
    assert 'vigente' not in cuerpo.lower().split('revision_id')[1][:600], (
        'no se puede reanclar a la revision vigente')
    assert 'es_vigente' not in cuerpo


def test_una_revision_mas_nueva_NO_convierte_la_observacion_en_CONFLICTO():
    """Nadie hizo nada incompatible. Marcarlo conflicto obligaria a decidir algo
    que no hay que decidir, y la gente acaba descartando trabajo bueno."""
    cuerpo = _cuerpo('_issue_create')
    trozo = cuerpo.split("revision_id = p.get('revision_id')")[1].split('for intento')[0]
    assert 'en_conflicto' not in trozo, (
        'el anclaje historico no es un conflicto')
    # Lo unico que se comprueba de esa revision es que sea de ESTA obra.
    assert "'REVISION_NO_EXISTE'" in trozo
    assert "'OTRA_OBRA'" in trozo


def test_el_anclaje_que_se_GUARDA_es_el_comprobado():
    """Comprobar una cosa y guardar otra seria peor que no comprobar: daria
    confianza falsa."""
    cuerpo = _cuerpo('_issue_create')
    guardado = cuerpo.split('INSERT INTO doc_issues')[1]
    assert "p.get('revision_id')" not in guardado, (
        'se vuelve a leer del payload en vez de usar el ya validado')
    assert 'revision_id,' in guardado


# ══ 10 · EL CASO EXTERNO MAS DURO ══════════════════════════════════════════
#
#   la foto sube  ->  la respuesta se pierde  ->  el movil reintenta
#
# Lo que se defiende: que ese reintento RECUPERE el resultado en vez de crear
# un segundo objeto.

def test_la_evidencia_se_CONSULTA_antes_de_subirse():
    """Preguntar primero es lo que convierte un reintento a ciegas en una
    consulta con respuesta. Subir primero duplicaria."""
    cuerpo = _cuerpo('subir_evidencia')
    i_consulta = cuerpo.index('gcs.describir_blob')
    i_subida = cuerpo.index('gcs.upload_file_to_gcs')
    assert i_consulta < i_subida, (
        'se sube antes de preguntar: un reintento crearia otro objeto')
    assert "'ya_existia': True" in cuerpo


def test_si_el_almacen_NO_RESPONDE_no_se_finge_que_no_existe():
    """«No pude preguntar» y «no existe» son cosas distintas. Confundirlas
    convierte una consulta fallida en una subida duplicada."""
    cuerpo = _cuerpo('subir_evidencia')
    assert 'ALMACEN_NO_RESPONDE' in cuerpo
    assert '503' in cuerpo


def test_el_nombre_del_objeto_NO_lo_elige_el_movil():
    """Si lo eligiera, dos reintentos podrian escribir en sitios distintos y la
    idempotencia externa se acabaria."""
    cuerpo = _cuerpo('subir_evidencia')
    assert 'sync.nombre_del_objeto_externo(obra, operation_id)' in cuerpo
    assert "request.form.get('objeto_externo')" not in cuerpo
    assert "request.form.get('destino')" not in cuerpo


def test_subir_la_foto_NO_la_convierte_en_evidencia_del_issue():
    """EXISTE EL OBJETO EXTERNO ≠ LA OPERACION SE APLICO. Vincularla aqui se
    saltaria la revalidacion del acto."""
    cuerpo = _cuerpo('subir_evidencia')
    assert 'UPDATE doc_issues' not in cuerpo
    assert 'INSERT INTO doc_issues' not in cuerpo
    assert 'conn.commit()' not in cuerpo, (
        'esta ruta no escribe estado de negocio')


def test_subir_evidencia_pasa_por_las_MISMAS_capas_que_el_acto():
    """Un binario en la carpeta de una obra es entrar en esa obra."""
    cuerpo = _cuerpo('subir_evidencia')
    assert '_puede_operar_en_la_obra(' in cuerpo
    assert "_usuario().get('id')" in cuerpo
    assert 'resolve_project_id' in cuerpo
    # Y ANTES de tocar el almacen.
    assert cuerpo.index('_puede_operar_en_la_obra') < cuerpo.index('describir_blob')


def test_una_subida_fallida_NO_se_responde_como_exito():
    """Devolver el nombre de un objeto que quiza no existe haria que el movil
    borrara su copia local."""
    cuerpo = _cuerpo('subir_evidencia')
    assert 'SUBIDA_FALLIDA' in cuerpo
    assert '502' in cuerpo
    assert 'EVIDENCIA_DEMASIADO_GRANDE' in cuerpo
