# -*- coding: utf-8 -*-
"""GAP 11 · CORE · ISSUE — una condición detectada que exige corrección Y verificación.

POR QUE ESTE OBJETO EXISTE, Y POR QUE NO LO ES EL RED LINE
-----------------------------------------------------------
La semántica quedó congelada por el propietario el 25-ago-2026, tras la
auditoría del doc 86:

    RED LINE  = modificación / croquis de cambio del proyecto
    ISSUE     = condición detectada que requiere corrección + verificación

    RED LINE ≠ ISSUE

El Red Line NUNCA vuelve a usarse como contenedor genérico de defectos. Se
intentó una vez —el escalado de los protocolos (GAP 03) creaba Red Lines— y era
un error semántico: el Red Line acepta o rechaza *una modificación del
proyecto*, no constata un defecto. Los 33 Red Lines históricos son croquis
firmados (`…-RL-SKT-…`), y contaminar ese registro habría sido irreparable.

LO QUE DISTINGUE A UN ISSUE DE TODO LO DEMAS DEL PRODUCTO
----------------------------------------------------------
Los otros registros formales terminan cuando alguien DICTA UN VEREDICTO. Un
issue termina cuando alguien VERIFICA QUE SE CORRIGIÓ. Son tres actos, y el
objeto tiene que poder distinguirlos o no prueba nada:

    DEFECTO DETECTADO      alguien constata que algo está mal
            ≠
    CORRECCIÓN EJECUTADA   el responsable declara que lo arregló
            ≠
    APROBACIÓN DEL CIERRE  OTRO verifica y lo da por bueno

LA REGLA QUE GOBIERNA EL OBJETO ENTERO
---------------------------------------
    QUIEN CORRIGE NO VERIFICA SU PROPIA CORRECCIÓN.

Sin eso, «verificado» significa «el responsable dice que ya está», que es lo
mismo que no verificar. Es la misma familia de invariante que la independencia
autor/revisor de las revisiones y que «nadie dicta el veredicto de su propio
submittal»: el producto entero se apoya en que un acto de conformidad tenga dos
partes distintas.

LA EXCEPCIÓN, PORQUE EN OBRA A VECES HACE FALTA
------------------------------------------------
Se admite autoverificación, pero **declarada, con motivo y auditada**: la marca
`autoverificacion` la pone un ADMINISTRADOR DE OBRA sobre un issue concreto,
nunca el propio responsable, y queda en el historial. Una excepción que se puede
leer es gobierno; una que se concede en silencio es un agujero.

QUE ES «CORE» AQUI, Y QUE SIGUE SIENDO GAP 11 GRANDE
------------------------------------------------------
Esto es EL NÚCLEO que GAP 04 necesita, no el gap entero. Fuera, a propósito:

    campos personalizados por tipo      ┐
    causa raíz y su analítica           │  siguen en
    estados configurables por obra      ├─ GAP 11 · ISSUES DE PRIMERA CLASE
    tipos configurables por admin       │  y NO se declaran COMPLETE hoy
    taxonomías y automatizaciones       ┘

Los tipos de aquí son una LISTA CERRADA precisamente porque configurarlos es lo
que pertenece al gap grande.
"""

import collections

import flujo_de_registro as reg

# ── TIPOS. Lista CERRADA — configurarlos es GAP 11 grande ──────────────────
PUNCH = 'PUNCH'                    # observación de cierre / recepción
NO_CONFORMIDAD = 'NO_CONFORMIDAD'  # punto no conforme de un protocolo
CALIDAD = 'CALIDAD'                # defecto de calidad detectado en ejecución
SEGURIDAD = 'SEGURIDAD'            # condición insegura

TIPOS = (
    (PUNCH,          'Punch / observación de cierre'),
    (NO_CONFORMIDAD, 'No conformidad de protocolo'),
    (CALIDAD,        'Calidad'),
    (SEGURIDAD,      'Seguridad'),
)
CODIGOS_TIPO = tuple(c for c, _ in TIPOS)

# Los que EXIGEN responsable desde el nacimiento. Un punch o una no conformidad
# sin nadie a quien reclamarle es un defecto que nadie va a corregir; una
# observación de calidad o seguridad puede levantarse antes de saber de quién es.
EXIGEN_RESPONSABLE = (PUNCH, NO_CONFORMIDAD)

# Los que nacen ANCLADOS a un plano. Un punch se levanta recorriendo la obra
# con la lámina en la mano: sin decir dónde, no se puede ir a corregirlo.
EXIGEN_UBICACION = (PUNCH,)


def etiqueta_tipo(codigo):
    for c, e in TIPOS:
        if c == codigo:
            return e
    return codigo or ''


# ── EL CICLO ───────────────────────────────────────────────────────────────
ABIERTO = 'Abierto'        # detectado, con responsable; falta corregir
CORREGIDO = 'Corregido'    # el responsable declara que lo arregló (Ready to Close)
VERIFICADO = 'Verificado'  # OTRO comprobó la corrección. Cerrado
REABIERTO = 'Reabierto'    # el verificador la rechazó; vuelve al responsable
ANULADO = 'Anulado'        # se levantó por error; nunca fue un defecto

ESTADOS = (ABIERTO, CORREGIDO, VERIFICADO, REABIERTO, ANULADO)

TRANSICIONES = {
    ABIERTO:    (CORREGIDO, ANULADO),
    CORREGIDO:  (VERIFICADO, REABIERTO),
    REABIERTO:  (CORREGIDO, ANULADO),
    VERIFICADO: (),          # cerrado. Un defecto nuevo es un issue nuevo
    ANULADO:    (),
}

# Los estados en los que el issue TODAVÍA PESA sobre alguien.
VIVOS = (ABIERTO, CORREGIDO, REABIERTO)


def esta_cerrado(estado):
    return estado in (VERIFICADO, ANULADO)


# ── LAS TRES IDENTIDADES ───────────────────────────────────────────────────

def puede_corregir(usuario, issue):
    """Corrige el RESPONSABLE, y nadie más.

    Ni el administrador: un administrador que pudiera declarar corregido lo
    ajeno estaría firmando por otro que algo se arregló, sin haberlo hecho.
    """
    uid = (usuario or {}).get('id')
    return bool(uid) and uid == (issue or {}).get('responsable_id')


def puede_verificar(usuario, issue, es_admin_de_obra=False):
    """Verifica QUIEN NO CORRIGIÓ. Devuelve (puede, motivo_si_no).

    LA INVARIANTE DEL OBJETO. Sin ella «verificado» significa «el responsable
    dice que ya está», que es lo mismo que no verificar.

    La excepción `autoverificacion` es un dato del issue, puesta por un
    administrador de obra con motivo y auditada. No se infiere de nada.
    """
    issue = issue or {}
    uid = (usuario or {}).get('id')
    if not uid:
        return False, 'sesión sin identidad'
    es_el_responsable = uid == issue.get('responsable_id')

    # LA EXCEPCIÓN, PRIMERO Y APARTE. Existe precisamente para que el CORRECTOR
    # pueda verificar lo suyo cuando un administrador lo ha autorizado por
    # escrito. Comprobarla después de exigir «detector o admin» la dejaba
    # inservible: un responsable que no fuera ninguna de las dos cosas quedaba
    # bloqueado igual, y la autorización no autorizaba nada.
    if es_el_responsable:
        if issue.get('autoverificacion'):
            return True, ''
        return False, ('quien corrige no verifica su propia corrección; hace falta '
                       'una autorización explícita de autoverificación')

    # Verifica quien lo detectó, o un administrador de la obra. No cualquiera:
    # un tercero sin relación con el issue no aporta garantía ninguna.
    if (uid == issue.get('autor_id')) or es_admin_de_obra:
        return True, ''
    return False, ('la verificación la hace quien detectó el defecto o un '
                   'administrador de la obra')


# ── EVIDENCIA ──────────────────────────────────────────────────────────────

def falta_evidencia_de_correccion(issue):
    """¿Se está declarando corregido sin enseñar nada?

    Un «ya está arreglado» sin prueba obliga al verificador a ir a mirar, y
    cuando la obra ya avanzó encima puede ser imposible. La evidencia es lo que
    hace que la verificación se pueda hacer desde el expediente.
    """
    return not ((issue or {}).get('evidencia_correccion') or [])


# ── LA SEMANTICA, declarada como DATO ──────────────────────────────────────
SEMANTICA = collections.namedtuple('Semantica', reg.Semantica._fields)(
    clave='ISSUE',
    tabla='doc_issues',
    prefijo='ISS',
    singular='issue',
    estados=ESTADOS,
    transiciones=TRANSICIONES,

    # - la pelota la mueve quien detectó o el ADMIN: reasignar el responsable de
    #   un defecto es un acto de obra, no del que lo tiene que arreglar.
    # - el VEREDICTO —verificar— no lo dicta ninguna posición del registro: lo
    #   decide `puede_verificar`, que es lo único que sabe de la separación
    #   corrector/verificador. Por eso esta tupla está VACÍA, igual que en el
    #   submittal y en el protocolo.
    quien_pasa_la_pelota=(reg.AUTOR, reg.ADMIN),
    quien_dicta_veredicto=(),
    quien_cierra=(reg.AUTOR, reg.ADMIN),
    quien_adopta=(reg.RESPONSABLE,),

    restriccion_unica=None,
    asunto_encargo='Corregir %s: %s',

    msg_no_reasigna='Solo quien detectó el defecto o un administrador de la obra pueden reasignarlo.',
    msg_no_adopta='Solo el responsable puede declarar que corrigió.',
    msg_no_veredicto='La verificación la hace quien no corrigió.',
    msg_no_cierra='Solo quien detectó el defecto o un administrador de la obra pueden anularlo.',
    msg_falta_veredicto='Un issue no se cierra sin verificar la corrección.',
    msg_cerrado='Este issue ya está cerrado. Un defecto nuevo es un issue nuevo.',
    msg_necesita_adopcion='Este issue espera a que su responsable corrija.',
    msg_bloqueado_fuera='Este issue pertenece a otra obra.',
)
