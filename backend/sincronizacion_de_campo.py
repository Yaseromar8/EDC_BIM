# -*- coding: utf-8 -*-
"""GAP 07 · SINCRONIZAR LO QUE SE CAPTURO SIN COBERTURA.

QUE NO ES OFFLINE
-----------------
    responsive UI      ✅        no es trabajo offline
    instalacion PWA    ✅        no es trabajo offline
    cache de assets    ✅        no es trabajo offline

Las tres juntas producen una aplicacion que ABRE sin cobertura y no SIRVE para
nada. En obra lineal --que es donde este producto se usa-- eso es igual de
inutil que no abrir.

LAS DOS IDENTIDADES, SEPARADAS DESDE EL PRINCIPIO
--------------------------------------------------
    local_object_id   el OBJETO que todavia no existe en el servidor
    operation_id      el ACTO que se hizo sobre el

Un issue levantado en obra tiene UN `local_object_id` y varios `operation_id`:

    local_object_id = uuid del issue aun no creado
        operation A = CREATE
        operation B = ADD_EVIDENCE
        operation C = MARK_CORRECTED

Confundirlos haria que reintentar la foto reintentara la creacion.

LA IDEMPOTENCIA PERTENECE AL ACTO
----------------------------------
    (project_id, operation_id)

y en un reenvio se DEVUELVE EL RESULTADO YA CONSOLIDADO: no se vuelve a
ejecutar. El caso real: el movil envia, el servidor crea, la respuesta se pierde
en el tunel. Sin esto el reintento crea un segundo punch para el mismo defecto.

EL SERVIDOR SIGUE SIENDO LA AUTORIDAD
--------------------------------------
Un acto offline NO congela los permisos que el usuario tenia cuando perdio
cobertura. En cada sincronizacion se revalida TODO contra el servidor:

    autenticacion · pertenencia a la obra · herramienta activa ·
    permiso de recurso · autorizacion de flujo · responsabilidad/BIC ·
    estado actual del objeto

Y `actor_id` NO viene del dispositivo. Viene de la sesion autenticada al
sincronizar.

LAS DOS MARCAS DE TIEMPO, Y LO QUE CADA UNA VALE
-------------------------------------------------
    capturado_en   DECLARADO POR EL DISPOSITIVO. Es lo que el movil dice que
                   marcaba su reloj. Util para ordenar el trabajo de una
                   persona y para contarlo en un informe.
    recibida_en    AUTORITATIVO. Lo pone el servidor y nadie mas lo toca.

`capturado_en` NO es prueba de cuando ocurrio el acto: un reloj de movil se
puede mover, y este producto no verifica el dispositivo. Se conserva porque es
informacion util y porque perderla haria imposible reconstruir una jornada; no
porque demuestre nada. Si algun dia hiciera falta que lo demostrara, eso es
attestation del dispositivo -- otro problema, y no este.

NO SE VACIA LA COLA A LA FUERZA
--------------------------------
Si el usuario fue desactivado, salio de la obra, perdio el permiso, dejo de ser
el responsable o el objeto cambio de estado, la operacion termina RECHAZADA o en
CONFLICTO -- pero nunca se fuerza para que la cola quede limpia. Una cola limpia
a base de descartar es una cola que perdio trabajo.

LO QUE ESTE MODULO NO HACE, Y ES DELIBERADO
---------------------------------------------
No decide `last-write-wins` en ningun caso. Ante una transicion cuyo estado de
partida ya no existe, marca CONFLICTO y conserva las dos versiones para que
decida una persona. Un acta que dice «conforme» y otra que dice «no conforme»
sobre el mismo punto no se promedian.
"""

import collections
import json
import logging

logger = logging.getLogger('sync')

# ── LOS DOS DOMINIOS DE LA PRIMERA VERTICAL ────────────────────────────────
#
# Se empieza por estos dos porque ya tienen las seis cosas que hacen que
# sincronizar signifique algo: asignacion, BIC, evidencia, identidad, estados y
# auditoria. Un objeto sin ellas sincronizaria datos, no ACTOS.
PROTOCOLO = 'PROTOCOLO'
ISSUE = 'ISSUE'
OBJETOS = (PROTOCOLO, ISSUE)

# ── LOS ACTOS. Lista CERRADA ───────────────────────────────────────────────
CREATE = 'CREATE'
SET_ITEMS = 'SET_ITEMS'
SIGN = 'SIGN'
ADD_EVIDENCE = 'ADD_EVIDENCE'
MARK_CORRECTED = 'MARK_CORRECTED'

ACTOS_DE = {
    PROTOCOLO: (CREATE, SET_ITEMS, SIGN),
    ISSUE: (CREATE, ADD_EVIDENCE, MARK_CORRECTED),
}
ACCIONES = tuple(sorted({a for v in ACTOS_DE.values() for a in v}))

# ── ESTADOS ────────────────────────────────────────────────────────────────
#
# PENDING y SYNCING son del CLIENTE: describen una operacion que el servidor
# todavia no ha visto. Aqui solo se anota lo que el servidor ya decidio.
APLICADA = 'APLICADA'
RECHAZADA = 'RECHAZADA'          # no entra, y no se reintenta sola
CONFLICTO = 'CONFLICTO'          # el servidor se movio; decide una persona
BLOQUEADA = 'BLOQUEADA'          # su predecesora no salio adelante
INDETERMINADA = 'INDETERMINADA'  # el efecto EXTERNO ocurrio o no; no se sabe
ESTADOS = (APLICADA, RECHAZADA, CONFLICTO, BLOQUEADA, INDETERMINADA)

# ══ LOS DOS CASOS, Y POR QUE NO SE PUEDEN CONFUNDIR ═══════════════════════
#
# CASO A · EFECTO ENTERAMENTE EN POSTGRESQL   (crear un issue, firmar un acta)
#
#   Revalidacion + mutacion + resultado canonico + estado, en UNA transaccion:
#
#       crash ANTES del COMMIT    -> cero efecto durable; el reintento ejecuta
#       crash DESPUES del COMMIT  -> la llave de idempotencia devuelve lo ya
#                                    consolidado; el acto NO se repite
#
#   DEMOSTRADO contra la base el 26-ago-2026 dentro de una transaccion
#   revertida. Y con ello se demostro tambien que un estado intermedio de
#   «reservado» NO SE OBSERVA NUNCA aqui: si la reserva y el cierre confirman
#   juntos, un fallo antes del COMMIT revierte las dos cosas y no queda fila
#   que mirar. Se habia escrito uno --`EN_CURSO`-- y se retiro. Un estado
#   imposible es peor que uno que falte: hace creer que se cubrio un caso que
#   en realidad no existe.
#
# CASO B · EFECTO FUERA DE LA BASE            (subir la foto de evidencia)
#
#   La fila y el objeto del almacen no son atomicos. Si la subida no responde,
#   el efecto es DESCONOCIDO, y eso NO es «no ejecutado»:
#
#       NO EJECUTADO                    se reintenta sin pensar
#       EJECUTADO, RESPUESTA PERDIDA    reintentar a ciegas duplicaria
#
#   El movil necesita distinguirlos, asi que el estado se llama por lo que es:
#   INDETERMINADA. Y se puede SALIR de el sin adivinar, porque el objeto
#   externo lleva un nombre DETERMINISTA derivado del `operation_id`: se le
#   pregunta al almacen si existe. Eso es lo que permite reintentar sin
#   duplicar.

# Los que NO se reintentan solos. Reintentar un rechazo es insistir contra una
# decision; reintentar un conflicto es pisar lo que otro hizo.
DEFINITIVOS = (RECHAZADA, CONFLICTO)

# ══ LA FRONTERA QUE NO SE PUEDE DEGRADAR ═══════════════════════════════════
#
#     REINTENTABLE    sabemos que NINGUN efecto durable ocurrio
#     INDETERMINADA   pudo ocurrir un efecto externo y no conocemos su desenlace
#
# No son grados de lo mismo. Reintentar lo primero es correcto; reintentar lo
# segundo a ciegas duplica.
#
# `REINTENTABLE` no es un estado del registro --no deja fila-- sino lo que se le
# responde al movil cuando la transaccion no confirmo: en PostgreSQL eso
# significa literalmente que no paso nada.
#
# EL PELIGRO ESTA EN EL `except` GENERICO. Si un acto pudo lanzar un efecto
# fuera de la base y su fallo se atrapa con un catch que responde REINTENTABLE,
# el movil reintentaria sobre un efecto que quiza ya ocurrio. Por eso los actos
# que pueden tocar el exterior estan DECLARADOS, y quien los ejecuta tiene que
# pasar por la semantica de efecto externo -- reserva durable, objeto
# determinista, INDETERMINADA cuando toca, reconciliacion despues.
REINTENTABLE = 'REINTENTABLE'   # respuesta al movil; NO se anota en el registro

# Actos que PUEDEN iniciar un efecto fuera de PostgreSQL. Lista CERRADA: si
# alguien anade uno nuevo que suba, descargue o llame a un tercero, tiene que
# declararlo aqui -- y hay un tripwire que lo comprueba.
CON_EFECTO_EXTERNO = frozenset({
    (ISSUE, ADD_EVIDENCE),
})


def puede_tocar_el_exterior(object_type, action):
    """¿Este acto puede haber dejado algo fuera de la base?

    Si la respuesta es si, un fallo NO se puede resolver con «reintentalo»: hay
    que dejar constancia y averiguar despues si el efecto ocurrio.
    """
    return (object_type, action) in CON_EFECTO_EXTERNO


Desenlace = collections.namedtuple(
    'Desenlace', ('estado', 'server_object_id', 'resultado', 'motivo', 'code'))


def aplicada(server_object_id, resultado=None):
    return Desenlace(APLICADA, str(server_object_id), resultado or {}, None, None)


def rechazada(motivo, code):
    return Desenlace(RECHAZADA, None, None, motivo, code)


def en_conflicto(motivo, code, estado_servidor=None):
    return Desenlace(CONFLICTO, None, {'servidor': estado_servidor}, motivo, code)


def bloqueada(motivo, code='DEPENDENCIA_NO_APLICADA'):
    return Desenlace(BLOQUEADA, None, None, motivo, code)


def indeterminada(motivo, code='EFECTO_EXTERNO_DESCONOCIDO', objeto_externo=None):
    """SOLO para el caso B. El efecto externo pudo ocurrir o no.

    No es un fallo: es la respuesta honesta cuando el almacen no contesta. Lo
    que la hace reconciliable --y no un limbo-- es que el objeto externo tiene
    un nombre determinista: se le puede preguntar despues si existe.
    """
    return Desenlace(INDETERMINADA, None, {'objeto_externo': objeto_externo},
                     motivo, code)


def nombre_del_objeto_externo(project_id, operation_id):
    """La llave de idempotencia DEL EFECTO EXTERNO.

    Derivar el nombre del `operation_id` hace que subir dos veces escriba el
    MISMO objeto --no dos-- y, sobre todo, permite PREGUNTAR si la subida
    ocurrio en vez de suponerlo. Sin esto, una operacion de desenlace
    desconocido no se podria reintentar nunca sin arriesgarse a duplicar la
    evidencia.
    """
    return 'evidencia/%s/%s' % (project_id, operation_id)


# ── LA LLAVE DE IDEMPOTENCIA ───────────────────────────────────────────────

def ya_procesada(cur, project_id, operation_id):
    """El desenlace anterior de este ACTO, o None si es la primera vez.

    Devolver lo ya consolidado es lo que convierte un reenvio en una consulta.
    Se cuenta el intento --interesa saber cuantas veces se reintento algo-- pero
    NO se vuelve a ejecutar nada.
    """
    cur.execute("""SELECT estado, server_object_id, resultado, motivo, code
                     FROM sync_operaciones
                    WHERE project_id = %s AND operation_id = %s""",
                (str(project_id), str(operation_id)))
    f = cur.fetchone()
    if not f:
        return None
    cur.execute("""UPDATE sync_operaciones SET intentos = intentos + 1
                    WHERE project_id = %s AND operation_id = %s""",
                (str(project_id), str(operation_id)))
    return Desenlace(f[0], f[1], f[2], f[3], f[4])


def reservar_efecto_externo(cur, op, actor_id, actor_visible, objeto_externo):
    """SOLO PARA EL CASO B. Deja constancia ANTES de tocar el almacen.

    True si la reserva es nuestra; False si otro envio ya la hizo --entonces es
    un reenvio y hay que devolver lo guardado, no volver a subir--.

    ESTA RESERVA CONFIRMA POR SU CUENTA, y ahi esta la diferencia con el caso A:
    si fuera parte de la transaccion del acto, un fallo la revertiria y
    perderiamos la unica constancia de que se lanzo una subida que quiza
    ocurrio. En el caso A eso da igual --si no confirma, no paso nada-- pero
    aqui no, porque el almacen no participa de nuestra transaccion.

    `ON CONFLICT DO NOTHING` hace de la llave de idempotencia una carrera que
    gana uno solo. Comprobar con un SELECT y despues insertar dejaria una
    ventana entre las dos consultas, y dos envios simultaneos del mismo movil
    reconectando no son hipoteticos: pasan cuando la red va y viene.
    """
    cur.execute("""INSERT INTO sync_operaciones
                     (operation_id, project_id, object_type, local_object_id,
                      action, payload, base_version, capturado_en,
                      actor_id, actor_visible, estado, depende_de,
                      iniciada_en, objeto_externo, motivo, code)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                           CURRENT_TIMESTAMP,%s,%s,%s)
              ON CONFLICT (project_id, operation_id) DO NOTHING
                   RETURNING id""",
                (op['operation_id'], str(op['project_id']), op['object_type'],
                 op['local_object_id'], op['action'],
                 json.dumps(op.get('payload') or {}), op.get('base_version'),
                 op.get('capturado_en'), actor_id, actor_visible, INDETERMINADA,
                 op.get('depende_de'), objeto_externo,
                 'subida de evidencia lanzada; desenlace todavia desconocido',
                 'EFECTO_EXTERNO_EN_VUELO'))
    return cur.fetchone() is not None


def cerrar(cur, project_id, operation_id, desenlace, diagnostico=None):
    """Cierra una reserva del CASO B con su desenlace, ya conocido.

    En el caso A no se usa: alli no hay reserva que cerrar, porque el acto y su
    registro confirman juntos con `anotar`.
    """
    cur.execute("""UPDATE sync_operaciones
                      SET estado = %s, server_object_id = %s, resultado = %s,
                          motivo = %s, code = %s
                    WHERE project_id = %s AND operation_id = %s""",
                (desenlace.estado, desenlace.server_object_id,
                 json.dumps(desenlace.resultado or {}), desenlace.motivo,
                 desenlace.code, str(project_id), str(operation_id)))
    if diagnostico:
        cur.execute('UPDATE sync_operaciones SET diagnostico = %s '
                    ' WHERE project_id = %s AND operation_id = %s',
                    (diagnostico, str(project_id), str(operation_id)))


def anotar(cur, op, actor_id, actor_visible, desenlace):
    """EL CAMINO DEL CASO A: el registro va en la MISMA transaccion que el acto.

    No hay reserva previa, porque no hace falta y porque seria un estado
    imposible de observar: si el COMMIT no llega se revierten las dos cosas y el
    reintento vuelve a ejecutar con toda la razon; si llega, la llave de
    idempotencia devuelve lo consolidado.

    Quien llama NO hace commit hasta tener el acto y su registro. Separarlos
    dejaria un instante en que uno ocurrio sin el otro: o un acto sin registrar
    --que se duplicaria al reintentar-- o un registro de algo que no paso.
    """
    cur.execute("""INSERT INTO sync_operaciones
                     (operation_id, project_id, object_type, local_object_id,
                      server_object_id, action, payload, base_version,
                      capturado_en, actor_id, actor_visible, estado, resultado,
                      motivo, code, depende_de)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id""",
                (op['operation_id'], str(op['project_id']), op['object_type'],
                 op['local_object_id'], desenlace.server_object_id, op['action'],
                 json.dumps(op.get('payload') or {}), op.get('base_version'),
                 op.get('capturado_en'), actor_id, actor_visible,
                 desenlace.estado, json.dumps(desenlace.resultado or {}),
                 desenlace.motivo, desenlace.code, op.get('depende_de')))
    return cur.fetchone()[0]


# ── ORDEN Y DEPENDENCIAS ───────────────────────────────────────────────────

def resolver_objeto(cur, project_id, local_object_id):
    """El id canonico del objeto que nacio con ese `local_object_id`, o None.

    Es el puente `local_object_id ↔ canonical_server_id`, y vive APARTE de la
    idempotencia del acto: un objeto tiene un id local y varios actos.
    """
    cur.execute("""SELECT server_object_id FROM sync_operaciones
                    WHERE project_id = %s AND local_object_id = %s
                      AND estado = %s AND server_object_id IS NOT NULL
                    ORDER BY id LIMIT 1""",
                (str(project_id), str(local_object_id), APLICADA))
    f = cur.fetchone()
    return f[0] if f else None


def dependencia_satisfecha(cur, project_id, op):
    """(ok, motivo). Una operacion no se ejecuta antes que aquella de la que
    depende, ni DESPUES de que aquella fracase.

    Es imposible marcar corregido un issue que no se creo. Y si la creacion
    fracaso definitivamente, la correccion no puede colarse en silencio: se
    queda BLOQUEADA y se ve.
    """
    dep = op.get('depende_de')
    if not dep:
        return True, ''
    cur.execute("""SELECT estado FROM sync_operaciones
                    WHERE project_id = %s AND operation_id = %s""",
                (str(project_id), str(dep)))
    f = cur.fetchone()
    if not f:
        return False, ('la operación de la que depende todavía no ha llegado; '
                       'esta queda a la espera y no se ejecuta fuera de orden')
    if f[0] != APLICADA:
        return False, ('la operación de la que depende terminó en %s, así que '
                       'esta no se ejecuta: sería un acto sobre algo que no '
                       'llegó a existir' % f[0])
    return True, ''


def ordenar(operaciones):
    """FIFO ESTRICTO POR OBJETO, conservando el orden de captura.

    Entre objetos distintos el orden da igual --son actos independientes-- pero
    dentro de un mismo objeto NO: crear, adjuntar y corregir tienen un orden y
    ejecutarlos al reves produce errores que parecen de permisos.

    No se reordena globalmente por fecha: dos dispositivos con el reloj movido
    reordenarian actos ajenos entre si.
    """
    orden = []
    vistos = []
    for op in operaciones or []:
        clave = (str(op.get('local_object_id')), str(op.get('object_type')))
        if clave not in vistos:
            vistos.append(clave)
    for clave in vistos:
        for i, op in enumerate(operaciones):
            if (str(op.get('local_object_id')), str(op.get('object_type'))) == clave:
                orden.append((i, op))
    return [op for _i, op in orden]


# ── VALIDACION DE LA FORMA ─────────────────────────────────────────────────

def forma_valida(op):
    """None si la operacion es utilizable; un motivo si no.

    Se comprueba ANTES de tocar nada. Una operacion mal formada que llegara a la
    mitad del proceso dejaria la cola del cliente sin saber si se aplico.
    """
    if not isinstance(op, dict):
        return 'la operación no es un objeto'
    for campo in ('operation_id', 'local_object_id', 'object_type', 'action'):
        if not op.get(campo):
            return 'falta %s' % campo
    if op['object_type'] not in OBJETOS:
        return ('objeto desconocido: %s. La primera vertical son %s'
                % (op['object_type'], ' y '.join(OBJETOS)))
    if op['action'] not in ACTOS_DE[op['object_type']]:
        return ('a un %s no se le puede hacer «%s»; se admite %s'
                % (op['object_type'], op['action'],
                   ', '.join(ACTOS_DE[op['object_type']])))
    if op['action'] != CREATE and not (op.get('server_object_id')
                                       or op.get('depende_de')):
        return ('un acto sobre un objeto que no se creó aquí tiene que decir '
                'sobre cuál: server_object_id, o de qué operación depende')
    return None
