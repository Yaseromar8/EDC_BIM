# -*- coding: utf-8 -*-
"""GAP 03 · PROTOCOLOS E INSPECCIONES — la conformidad, con consecuencia.

QUE ES ESTO EN OBRA PUBLICA PERUANA, Y POR QUE NO SE LLAMA «FORMULARIO»
-----------------------------------------------------------------------
El benchmark los llama Forms e Inspections. Aquí el objeto real tiene nombre
propio y consecuencia contractual: es el **PROTOCOLO DE LIBERACIÓN**. Antes de
vaciar un concreto, la supervisión libera el encofrado y el acero contra una
lista de comprobación firmada. Si no está liberado, no se vacía — y si se vació
sin liberar, eso es lo que se discute después.

    PLANTILLA   el protocolo en abstracto: qué hay que comprobar
                («Liberación de encofrado y acero — losas»)
    ACTA        UNA aplicación: qué se comprobó, dónde, cuándo, quién firmó,
                y si quedó LIBERADO o NO

Un «formulario» sugiere recoger datos. Un protocolo AUTORIZA O IMPIDE una
actividad, y esa es la diferencia que el objeto tiene que sostener.

LA REGLA QUE GOBIERNA TODO ESTE GAP
------------------------------------
    UN ACTA CON UN ÍTEM NO CONFORME NO PUEDE CERRARSE COMO LIBERADA.

Y no es una comprobación amable de la interfaz: está en el manejador y en la
base. Si un acta pudiera declararse liberada con un punto en rojo dentro, la
firma no probaría nada — y la firma es todo lo que este objeto produce.

Es el mismo razonamiento que en los submittals: allí NADIE dicta el veredicto
desde fuera del paso; aquí NADIE declara conforme lo que un ítem dice que no
lo está.

LO NO CONFORME NO SE QUEDA DENTRO DEL ACTA
-------------------------------------------
Procore escala un ítem fallado a una Observación. Aquí escala a **ISSUE**, con
su responsable, su plazo, su corrección y su verificación.

    ítem NO CONFORME  ──▶  ISSUE(tipo=NO_CONFORMIDAD)
                           (y el acta guarda a cuál escaló)

CORRECCIÓN SEMÁNTICA DEL 25-ago-2026: la primera versión escalaba a **Red
Line**, y era un error. El Red Line es la MODIFICACIÓN DEL PROYECTO —un croquis
firmado— y su veredicto acepta o rechaza esa modificación; un punto no conforme
no es una modificación, es una condición que hay que corregir y verificar. La
auditoría del doc 86 lo demostró y el propietario congeló la separación:

    RED LINE ≠ ISSUE

Los puntos escalados ANTES del cambio conservan su `redline_id` y no se
reescriben: falsificar cómo ocurrieron sería peor que la incoherencia.

LA FIRMA ES UNA IDENTIDAD, NO UN NOMBRE ESCRITO
------------------------------------------------
`firmas` guarda `user_id`, no un texto. Un acta firmada por «Ing. Pérez» en un
proyecto con dos Pérez no prueba quién firmó, y este documento existe
precisamente para probarlo. Es la misma corrección que ya costó un rediseño en
los pasos de revisión (`flujo_de_revision`, la regla del `user_id`).

QUE NO ENTRA EN ESTE GAP, Y DONDE ESTA
---------------------------------------
    móvil y trabajo sin conexión ................. GAP 07
    punch list / observaciones de cierre ......... GAP 04
    plantillas al nivel de la ENTIDAD ............ existe capa 14; aquí las
                                                   plantillas son de obra
"""

import collections

import flujo_de_registro as reg

# ── RESULTADO DE UN ÍTEM. Lista cerrada ────────────────────────────────────
CONFORME = 'Conforme'
NO_CONFORME = 'No conforme'
NO_APLICA = 'No aplica'
PENDIENTE = 'Pendiente'          # todavía no se comprobó
RESULTADOS = (CONFORME, NO_CONFORME, NO_APLICA, PENDIENTE)

# Los que IMPIDEN liberar. `Pendiente` también: un acta con puntos sin
# comprobar no está terminada, y firmarla sería firmar en blanco.
IMPIDEN_LIBERAR = (NO_CONFORME, PENDIENTE)


# ── TIPOS DE PREGUNTA ──────────────────────────────────────────────────────
#
# Lista CERRADA, y corta a propósito. Cada tipo que se añade es un tipo que
# hay que saber pintar, validar, exportar y comparar dentro de dos años.
TIPOS_ITEM = (
    ('conformidad', 'Conforme / No conforme / No aplica'),
    ('texto',       'Texto libre'),
    ('numero',      'Valor numérico'),
    ('fecha',       'Fecha'),
    ('opcion',      'Una de varias opciones'),
)
CODIGOS_TIPO = tuple(c for c, _ in TIPOS_ITEM)

# Lo que un ítem puede EXIGIR según cómo se responda. Es la capacidad que
# Procore llama «require photo/observation/signature on response».
EXIGENCIAS = ('foto', 'observacion', 'firma')


# ── ESTADOS DEL ACTA ───────────────────────────────────────────────────────
BORRADOR = 'Borrador'        # se está llenando en campo
FIRMADA = 'Firmada'          # completa y firmada por quien correspondía
LIBERADO = 'Liberado'        # veredicto: la actividad puede seguir
NO_LIBERADO = 'No liberado'  # veredicto: no puede seguir. Hay no conformes
ANULADA = 'Anulada'

ESTADOS = (BORRADOR, FIRMADA, LIBERADO, NO_LIBERADO, ANULADA)

TRANSICIONES = {
    BORRADOR:    (FIRMADA, ANULADA),
    FIRMADA:     (LIBERADO, NO_LIBERADO, ANULADA),
    LIBERADO:    (),
    NO_LIBERADO: (),        # se levanta con OTRA acta, no reabriendo esta
    ANULADA:     (),
}


def veredicto_que_corresponde(items):
    """El veredicto que los ÍTEMS obligan. Nadie lo elige a mano.

    Devuelve (estado, motivo). Esta función es la que impide que una firma
    diga lo contrario de lo que dicen los puntos comprobados: el manejador la
    llama y NO acepta un veredicto que venga de fuera.

    Un acta sin ítems no libera nada: liberar contra una lista vacía es firmar
    que se comprobó algo que nadie definió.
    """
    items = list(items or [])
    if not items:
        return NO_LIBERADO, 'el acta no tiene ni un punto que comprobar'

    pendientes = [i for i in items if (i or {}).get('resultado', PENDIENTE) == PENDIENTE
                  and (i or {}).get('tipo', 'conformidad') == 'conformidad']
    if pendientes:
        return NO_LIBERADO, ('quedan %d punto(s) sin comprobar; un acta a medias '
                             'no se firma' % len(pendientes))

    no_conformes = [i for i in items if (i or {}).get('resultado') == NO_CONFORME]
    if no_conformes:
        return NO_LIBERADO, ('hay %d punto(s) NO CONFORMES' % len(no_conformes))

    return LIBERADO, ''


def exigencias_incumplidas(items):
    """Qué ítems exigen algo que no se les dio. Lista de (indice, exigencia).

    Un ítem puede exigir foto, observación o firma SEGÚN CÓMO SE RESPONDA —
    típicamente al marcar «No conforme»: sin la foto, la no conformidad es la
    palabra de alguien contra la de otro dentro de un año.
    """
    faltan = []
    for n, i in enumerate(items or []):
        i = i or {}
        exige = i.get('exige_si_no_conforme') or []
        if i.get('resultado') != NO_CONFORME or not exige:
            continue
        if 'foto' in exige and not (i.get('fotos') or []):
            faltan.append((n, 'foto'))
        if 'observacion' in exige and not (i.get('observacion') or '').strip():
            faltan.append((n, 'observacion'))
    return faltan


def items_a_escalar(items):
    """Los ítems no conformes que TODAVIA no escalaron. [(indice, item)].

    Escalar es crear un ISSUE (tipo NO_CONFORMIDAD): un defecto que vive solo dentro del acta no
    tiene a quién reclamarle ni cuándo. Los que ya escalaron llevan
    `issue_id` y no se duplican.
    """
    # Se reconoce TAMBIEN `redline_id`: los puntos escalados ANTES del cambio
    # semantico del 25-ago-2026 lo llevan. Reescribirlos seria falsificar como
    # ocurrieron; reconocerlos evita escalarlos dos veces.
    return [(n, i) for n, i in enumerate(items or [])
            if (i or {}).get('resultado') == NO_CONFORME
            and not (i or {}).get('issue_id')
            and not (i or {}).get('redline_id')]


# ── LA SEMANTICA, declarada como DATO ──────────────────────────────────────
SEMANTICA = collections.namedtuple('Semantica', reg.Semantica._fields)(
    clave='PROTOCOLO',
    tabla='doc_actas',
    prefijo='PL',                 # PL de «protocolo de liberación»
    singular='acta',
    estados=ESTADOS,
    transiciones=TRANSICIONES,

    # QUIEN HACE QUE.
    #
    # - llena y firma el AUTOR: quien fue a campo y comprobó los puntos.
    # - el VEREDICTO no lo dicta nadie: LO DICTAN LOS ÍTEMS
    #   (`veredicto_que_corresponde`). Por eso esta tupla está VACÍA, igual que
    #   en el submittal — y por una razón todavía más dura: allí un revisor
    #   humano decide; aquí la decisión ya está tomada por lo comprobado, y
    #   dejar que alguien la sobrescriba convertiría el protocolo en un trámite.
    # - anula el RESPONSABLE o el ADMIN de obra.
    quien_pasa_la_pelota=(reg.RESPONSABLE, reg.ADMIN),
    quien_dicta_veredicto=(),
    quien_cierra=(reg.RESPONSABLE, reg.ADMIN),
    quien_adopta=(reg.AUTOR,),

    restriccion_unica=None,
    asunto_encargo='Levantar %s: %s',

    msg_no_reasigna='Solo el responsable del protocolo o un administrador de la obra pueden reasignarlo.',
    msg_no_adopta='Solo quien levanta el acta puede firmarla: la firma es de quien comprobó.',
    msg_no_veredicto='El veredicto de un acta lo dictan sus puntos comprobados. Nadie lo escribe a mano.',
    msg_no_cierra='Solo el responsable o un administrador de la obra pueden anularla.',
    msg_falta_veredicto='Un acta no se cierra sin haber comprobado sus puntos.',
    msg_cerrado='Esta acta ya tiene veredicto y no se modifica.',
    msg_necesita_adopcion='Esta acta está en borrador: quien la levanta tiene que firmarla.',
    msg_bloqueado_fuera='Esta acta pertenece a otra obra.',
)
