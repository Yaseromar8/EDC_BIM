# -*- coding: utf-8 -*-
"""GAP 07 · EL MOTOR DE SINCRONIZACION DE CAMPO.

LO QUE ESTE FICHERO DEFIENDE, por orden de importancia:

1. QUE UN REENVIO NO DUPLIQUE UN ACTO. Es el fallo que se ve en obra: el movil
   envia, el servidor crea, la respuesta se pierde en el tunel, y al reintentar
   aparecen DOS punch para el mismo defecto.
2. QUE EL SERVIDOR SIGA SIENDO LA AUTORIDAD. Un acto capturado sin cobertura no
   congela los permisos de quien lo capturo.
3. QUE NUNCA HAYA `last-write-wins`. Un acta que dice «conforme» y otra que dice
   «no conforme» sobre el mismo punto no se promedian.
4. QUE NADA SE EJECUTE FUERA DE ORDEN. Marcar corregido antes de crear el issue
   es un acto sobre algo que no existe.
"""
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '21_gap07_sincronizacion_de_campo.sql'),
                   encoding='utf-8').read()


def _motor():
    return io.open(os.path.join(RAIZ, 'sincronizacion_de_campo.py'),
                   encoding='utf-8').read()


# ══ 1 · LAS DOS IDENTIDADES, SEPARADAS ═════════════════════════════════════

def test_el_OBJETO_y_el_ACTO_son_identidades_distintas():
    """Un issue tiene UN `local_object_id` y varios `operation_id`. Confundirlos
    haria que reintentar la foto reintentara la creacion."""
    sql = _sql()
    assert 'local_object_id   TEXT        NOT NULL' in sql
    assert 'operation_id      UUID        NOT NULL' in sql
    # La idempotencia es del ACTO, no del objeto.
    assert 'idx_sync_idempotencia' in sql
    assert 'ON sync_operaciones(project_id, operation_id)' in sql
    # Y el puente objeto local -> canonico vive aparte.
    assert 'idx_sync_objeto_local' in sql


def test_el_puente_local_a_canonico_esta_APARTE_de_la_idempotencia():
    import sincronizacion_de_campo as sync
    assert hasattr(sync, 'resolver_objeto')
    cuerpo = _motor().split('def resolver_objeto')[1].split('\ndef ')[0]
    assert 'local_object_id' in cuerpo
    assert 'server_object_id' in cuerpo
    assert 'operation_id' not in cuerpo, (
        'el puente del OBJETO no puede depender de la identidad del ACTO')


# ══ 2 · IDEMPOTENCIA ═══════════════════════════════════════════════════════

def test_un_reenvio_DEVUELVE_lo_consolidado_y_no_reejecuta():
    import sincronizacion_de_campo as sync

    class Cur(object):
        def __init__(self):
            self.qs = []
        def execute(self, q, a=None):
            self.qs.append(' '.join(q.split()))
        def fetchone(self):
            return ('APLICADA', 'ISS-011', {'codigo': 'ISS-011'}, None, None)

    cur = Cur()
    d = sync.ya_procesada(cur, 'obra-1', 'op-1')
    assert d.estado == 'APLICADA'
    assert d.server_object_id == 'ISS-011'
    # Se cuenta el intento, pero NO se ejecuta el acto otra vez.
    assert any('UPDATE sync_operaciones SET intentos' in q for q in cur.qs)
    assert not any('INSERT INTO doc_issues' in q for q in cur.qs)


def test_CASO_A_no_tiene_reserva_previa_porque_seria_un_estado_IMPOSIBLE():
    """DEMOSTRADO contra PostgreSQL el 26-ago-2026.

    Si la reserva y el cierre confirman juntos --que es lo correcto cuando todo
    el efecto esta en la base-- un fallo antes del COMMIT revierte LAS DOS
    COSAS: no queda fila que observar. Se habia escrito un estado `EN_CURSO`
    para ese caso y se retiro.

    Un estado imposible es peor que uno que falte: hace creer que se cubrio un
    caso que en realidad no existe.
    """
    import sincronizacion_de_campo as sync
    assert not hasattr(sync, 'EN_CURSO')
    assert 'EN_CURSO' not in sync.ESTADOS
    # `anotar` es el camino del caso A: registro y acto, misma transaccion.
    cuerpo = _motor().split('def anotar')[1].split(chr(10) + 'def ')[0]
    # Lo que importa no es que el docstring NOMBRE el commit --lo explica-- sino
    # que la funcion no lo LLAME: el acto y su registro confirman juntos, y esa
    # frontera la fija quien llama.
    assert '.commit()' not in cuerpo
    assert 'MISMA transaccion' in cuerpo


def test_el_reintento_tras_el_COMMIT_devuelve_lo_consolidado():
    """El escenario clasico: el COMMIT ocurrio y la respuesta al movil se
    perdio. Comprobado tambien contra la base: el segundo INSERT choca con la
    llave de idempotencia y la fila sigue apuntando al MISMO objeto."""
    sql = _sql()
    assert 'idx_sync_idempotencia' in sql
    cuerpo = _motor().split('def ya_procesada')[1].split(chr(10) + 'def ')[0]
    assert 'SELECT estado, server_object_id, resultado' in cuerpo
    assert 'intentos = intentos + 1' in cuerpo


def test_INDETERMINADA_es_SOLO_del_caso_B_y_se_llama_por_lo_que_es():
    """«No ejecutado» y «ejecutado, respuesta desconocida» son estados distintos,
    y el movil tiene que poder distinguirlos."""
    import sincronizacion_de_campo as sync
    assert sync.INDETERMINADA in sync.ESTADOS
    fuente = _motor()
    assert 'NO EJECUTADO' in fuente and 'RESPUESTA PERDIDA' in fuente
    d = sync.indeterminada('el almacen no contesto', objeto_externo='evidencia/o/op')
    assert d.estado == sync.INDETERMINADA
    assert d.server_object_id is None
    assert d.resultado['objeto_externo'] == 'evidencia/o/op'


def test_una_INDETERMINADA_no_puede_quedarse_en_el_limbo():
    """Sin cuando empezo y sin diagnostico no hay por donde reconciliarla."""
    sql = _sql()
    assert 'iniciada_en' in sql and 'diagnostico' in sql
    assert 'ck_sync_indeterminada_con_inicio' in sql
    assert "estado <> 'INDETERMINADA' OR iniciada_en IS NOT NULL" in sql
    # Y hay una cola por antiguedad, para que nadie tenga que acordarse.
    assert 'idx_sync_indeterminadas' in sql
    assert 'intentos' in sql


def test_el_efecto_externo_tiene_SU_PROPIA_llave_idempotente():
    """Es lo unico que permite reintentar una operacion de desenlace desconocido
    sin arriesgarse a duplicar: se le PREGUNTA al almacen si el objeto existe,
    en vez de suponerlo."""
    import sincronizacion_de_campo as sync
    a = sync.nombre_del_objeto_externo('obra-1', 'op-abc')
    b = sync.nombre_del_objeto_externo('obra-1', 'op-abc')
    assert a == b, 'el nombre tiene que ser determinista'
    assert 'op-abc' in a and 'obra-1' in a
    assert sync.nombre_del_objeto_externo('obra-1', 'op-otra') != a
    assert 'objeto_externo' in _sql()


def test_la_reserva_del_caso_B_confirma_POR_SU_CUENTA():
    """Si fuera parte de la transaccion del acto, un fallo la revertiria y se
    perderia la unica constancia de que se lanzo una subida que quiza ocurrio."""
    cuerpo = _motor().split('def reservar_efecto_externo')[1].split(chr(10) + 'def ')[0]
    assert 'ON CONFLICT (project_id, operation_id) DO NOTHING' in cuerpo
    assert 'INDETERMINADA' in cuerpo
    assert 'iniciada_en' in cuerpo or 'CURRENT_TIMESTAMP' in cuerpo
    assert 'CONFIRMA POR SU CUENTA' in cuerpo


# ══ 3 · EL SERVIDOR ES LA AUTORIDAD ════════════════════════════════════════

def test_el_actor_NO_viene_del_dispositivo():
    """`actor_id` lo pone la sesion autenticada al sincronizar."""
    cuerpo = _motor().split('def reservar')[1].split('\ndef ')[0]
    # Se recibe como PARAMETRO de quien ya autentico, no del payload.
    assert 'actor_id' in cuerpo
    assert "op['actor_id']" not in cuerpo, 'el actor vendria del movil'
    assert "op.get('actor_id')" not in cuerpo
    assert "op.get('actor')" not in cuerpo


def test_las_DOS_marcas_de_tiempo_van_separadas():
    """`capturado_en` es el reloj del dispositivo y `recibida_en` el del
    servidor. Mezclarlas borraria la unica prueba de que el trabajo se hizo en
    obra y no en la oficina tres dias despues."""
    sql = _sql()
    assert 'capturado_en' in sql and 'recibida_en' in sql
    assert 'recibida_en       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP' in sql


def test_la_revalidacion_completa_esta_ESCRITA_como_contrato():
    fuente = _motor()
    for capa in ('pertenencia a la obra', 'herramienta activa',
                 'permiso de recurso', 'autorizacion de flujo',
                 'responsabilidad', 'estado actual del objeto'):
        assert capa in fuente, 'falta declarar la revalidacion de: %s' % capa


def test_la_cola_NO_se_vacia_a_la_fuerza():
    fuente = _motor()
    assert 'nunca se fuerza' in fuente
    import sincronizacion_de_campo as sync
    # Rechazo y conflicto NO se reintentan solos.
    assert sync.RECHAZADA in sync.DEFINITIVOS
    assert sync.CONFLICTO in sync.DEFINITIVOS
    assert sync.APLICADA not in sync.DEFINITIVOS


# ══ 4 · NUNCA last-write-wins ══════════════════════════════════════════════

def test_no_hay_last_write_wins_en_ninguna_parte():
    import sincronizacion_de_campo as sync
    fuente = _motor()
    assert 'last-write-wins' in fuente, 'se declara que NO se hace'
    assert 'no se promedian' in fuente
    # El conflicto CONSERVA lo que decia el servidor, no lo descarta.
    d = sync.en_conflicto('el objeto cambio', 'CONFLICTO_DE_ESTADO',
                          estado_servidor={'estado': 'Verificado'})
    assert d.estado == sync.CONFLICTO
    assert d.resultado['servidor'] == {'estado': 'Verificado'}
    assert d.motivo


def test_un_conflicto_NO_lleva_server_object_id_de_aplicado():
    import sincronizacion_de_campo as sync
    d = sync.en_conflicto('x', 'y')
    assert d.server_object_id is None
    sql = _sql()
    assert "estado <> 'APLICADA' OR server_object_id IS NOT NULL" in sql


def test_lo_que_no_se_aplica_DICE_por_que():
    """«Rechazada» sin motivo obliga a quien perdio su trabajo a adivinar si
    puede recuperarlo."""
    import sincronizacion_de_campo as sync
    assert sync.rechazada('te sacaron de la obra', 'ACCESO_REVOCADO').motivo
    assert sync.bloqueada('su predecesora fallo').motivo
    assert 'ck_sync_negativa_con_motivo' in _sql()


# ══ 5 · ORDEN Y DEPENDENCIAS ═══════════════════════════════════════════════

def test_lo_dependiente_NO_se_ejecuta_si_su_predecesora_no_salio():
    import sincronizacion_de_campo as sync

    class Cur(object):
        def __init__(self, estado):
            self.estado = estado
        def execute(self, q, a=None):
            pass
        def fetchone(self):
            return (self.estado,) if self.estado else None

    op = {'depende_de': 'op-A'}
    ok, motivo = sync.dependencia_satisfecha(Cur('APLICADA'), 'obra', op)
    assert ok
    for malo in ('RECHAZADA', 'CONFLICTO', 'BLOQUEADA', 'EN_CURSO'):
        ok, motivo = sync.dependencia_satisfecha(Cur(malo), 'obra', op)
        assert not ok, malo
        assert motivo
    # Y si ni siquiera ha llegado, tampoco se ejecuta fuera de orden.
    ok, motivo = sync.dependencia_satisfecha(Cur(None), 'obra', op)
    assert not ok and 'fuera de orden' in motivo


def test_sin_dependencia_declarada_no_se_bloquea():
    import sincronizacion_de_campo as sync
    ok, _ = sync.dependencia_satisfecha(None, 'obra', {})
    assert ok


def test_el_orden_es_FIFO_ESTRICTO_POR_OBJETO():
    """Entre objetos distintos da igual; dentro de uno, no."""
    import sincronizacion_de_campo as sync
    ops = [
        {'local_object_id': 'A', 'object_type': 'ISSUE', 'action': 'CREATE'},
        {'local_object_id': 'B', 'object_type': 'ISSUE', 'action': 'CREATE'},
        {'local_object_id': 'A', 'object_type': 'ISSUE', 'action': 'ADD_EVIDENCE'},
        {'local_object_id': 'A', 'object_type': 'ISSUE', 'action': 'MARK_CORRECTED'},
    ]
    salida = sync.ordenar(ops)
    de_a = [o['action'] for o in salida if o['local_object_id'] == 'A']
    assert de_a == ['CREATE', 'ADD_EVIDENCE', 'MARK_CORRECTED']
    assert len(salida) == len(ops), 'no se pierde ninguna'


def test_no_se_reordena_globalmente_por_fecha():
    """Dos dispositivos con el reloj movido reordenarian actos ajenos entre si."""
    cuerpo = _motor().split('def ordenar')[1].split('\ndef ')[0]
    assert 'capturado_en' not in cuerpo
    assert 'sort' not in cuerpo


# ══ 6 · LA FORMA DE UNA OPERACION ══════════════════════════════════════════

def test_la_forma_se_valida_ANTES_de_tocar_nada():
    import sincronizacion_de_campo as sync
    base = {'operation_id': 'o1', 'local_object_id': 'l1',
            'object_type': 'ISSUE', 'action': 'CREATE'}
    assert sync.forma_valida(base) is None
    for falta in ('operation_id', 'local_object_id', 'object_type', 'action'):
        malo = dict(base)
        malo.pop(falta)
        assert sync.forma_valida(malo), falta
    assert sync.forma_valida(dict(base, object_type='PLANO'))
    assert sync.forma_valida(dict(base, action='BORRAR_TODO'))
    # A un protocolo no se le marca «corregido»: eso es de un issue.
    assert sync.forma_valida(dict(base, object_type='PROTOCOLO',
                                  action='MARK_CORRECTED'))


def test_un_acto_sobre_un_objeto_ajeno_tiene_que_decir_SOBRE_CUAL():
    import sincronizacion_de_campo as sync
    huerfano = {'operation_id': 'o2', 'local_object_id': 'l2',
                'object_type': 'ISSUE', 'action': 'MARK_CORRECTED'}
    assert sync.forma_valida(huerfano)
    assert sync.forma_valida(dict(huerfano, server_object_id='11')) is None
    assert sync.forma_valida(dict(huerfano, depende_de='o1')) is None


def test_la_primera_vertical_son_DOS_dominios_y_es_una_lista_cerrada():
    """No se construye sincronizacion universal del CDE: se demuestra la
    arquitectura sobre protocolos e issues y despues se extiende."""
    import sincronizacion_de_campo as sync
    assert sync.OBJETOS == ('PROTOCOLO', 'ISSUE', 'FOTO')  # NG-02: tercera vertical, mismo motor
    assert sync.ACTOS_DE['ISSUE'] == ('CREATE', 'ADD_EVIDENCE', 'MARK_CORRECTED')
    assert sync.ACTOS_DE['PROTOCOLO'] == ('CREATE', 'SET_ITEMS', 'SIGN')
    sql = _sql()
    assert "object_type IN ('PROTOCOLO','ISSUE')" in sql


# ══ 7 · LA MIGRACION ES EXPAND ═════════════════════════════════════════════

def test_la_migracion_solo_anade():
    sql = _sql()
    assert 'CREATE TABLE IF NOT EXISTS sync_operaciones' in sql
    for destructivo in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE'):
        assert destructivo not in sql.upper(), destructivo
    assert 'UPDATE ' not in sql.upper(), 'no toca ni una fila existente'


def test_local_object_id_es_TEXT_porque_lo_pone_el_dispositivo():
    """El error que esta prueba impide volvio REINTENTABLE cada acto de campo
    en produccion: la migracion tipaba `local_object_id` como UUID y el cliente
    manda `loc_<uuid>` -- texto con prefijo, a proposito. Las 1438 pruebas no
    lo vieron porque nadie CASABA el tipo de la columna con lo que el cliente
    genera. Esta lo casa."""
    import io as _io
    import os as _os
    raiz = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    m21 = _io.open(_os.path.join(raiz, 'sql',
                   '21_gap07_sincronizacion_de_campo.sql'), encoding='utf-8').read()
    fila = [l for l in m21.splitlines() if 'local_object_id' in l and 'NOT NULL' in l]
    assert fila and 'TEXT' in fila[0] and 'UUID' not in fila[0], (
        'local_object_id tiene que ser TEXT: el dispositivo manda loc_<uuid>')
    # Y el cliente de verdad manda el prefijo -- si alguien lo quita, esta
    # prueba obliga a decidir el tipo a la vez.
    cap = _io.open(_os.path.join(_os.path.dirname(raiz), 'frontend-docs', 'src',
                   'offline', 'captura.js'), encoding='utf-8').read()
    assert "'loc_' + local.uuid()" in cap
    # La migracion 22 existe para las instalaciones donde la 21 ya corrio.
    assert _os.path.exists(_os.path.join(raiz, 'sql',
                           '22_local_object_id_es_del_dispositivo.sql'))
