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
    assert "'status': 'REINTENTABLE'" in cuerpo
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
    assert rs.HERRAMIENTA_DE == {'PROTOCOLO': 'protocolos', 'ISSUE': 'issues'}
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
    # Hoy: los tres actos del issue. Los del protocolo, declarados y pendientes.
    assert set(rs.DESPACHO) == {(s.ISSUE, s.CREATE), (s.ISSUE, s.MARK_CORRECTED),
                                (s.ISSUE, s.ADD_EVIDENCE)}


def test_hay_un_techo_de_lote():
    cuerpo = _cuerpo('sincronizar')
    assert 'MAX_POR_LOTE' in cuerpo
    assert 'LOTE_DEMASIADO_GRANDE' in cuerpo
