# -*- coding: utf-8 -*-
"""La SEMANTICA del SUBMITTAL. La mecanica ya existe y no se vuelve a escribir.

QUE ES UN SUBMITTAL, Y POR QUE NO ES NINGUNA DE LAS COSAS QUE YA TENIAMOS
-------------------------------------------------------------------------
Un submittal es el acto por el que el CONTRATISTA somete a aprobacion un
material, un equipo o un plano de taller ANTES de incorporarlo a la obra, y la
supervision se pronuncia CONTRA LA ESPECIFICACION. Lo que queda registrado no
es una opinion: es que tal producto concreto quedo aprobado para tal partida.

    RFI          PREGUNTA algo que el proyecto no aclara.
    RED LINE     PROPONE modificar lo proyectado (croquis numerado).
    REVIEW       APRUEBA UN DOCUMENTO del expediente y lo transiciona de estado.
    SUBMITTAL    SOMETE UN PRODUCTO a aprobacion contra la especificacion.

La diferencia con REVIEW es la que mas cuesta ver y la que mas importa: una
revision recae sobre un fichero del expediente y termina cambiandole el estado
ISO. Un submittal recae sobre ALGO QUE SE VA A INSTALAR; sus adjuntos son la
prueba (ficha tecnica, certificado, plano de taller), no el objeto. Por eso un
submittal RECHAZADO no deja el documento en un estado peor: deja el PRODUCTO
fuera de la obra hasta que se reenvie otra revision.

LOS TRES PAPELES, QUE NO SON TRES PERMISOS
-------------------------------------------
El benchmark congelado (doc 82 §4.1) los nombra en los dos fabricantes:

    CONTRATISTA RESPONSABLE   prepara y ENVIA. Es el `autor`.
    SUBMITTAL MANAGER         recibe, DISTRIBUYE a revision y CIERRA.
    REVISORES                 se pronuncian, cada uno en su paso.

Son POSICIONES DEL FLUJO, exactamente como AUTOR/RESPONSABLE/ADMIN del RFI: no
hicieron falta permisos nuevos para gobernarlas, y no los hacen falta aqui.
El `manager` se materializa como el `responsable` del registro, y los revisores
como los pasos -- que es la forma que ESTE producto ya sabe manejar.

    PERMISSION      ¿alcanzas la herramienta y el expediente?   capas 16/08/09
    WORKFLOW AUTH.  ¿ocupas la posicion que ejecuta este acto?   ESTO
    RESPONSIBILITY  ¿la pelota es tuya AHORA MISMO?              encargos

QUE SE REUTILIZA, Y QUE NO SE CLONA
------------------------------------
    numeracion por obra, identidad, posiciones,
    validacion de transicion, historial ............. flujo_de_registro   (as-is)
    quien revisa este paso, cuando vence su turno,
    independencia autor/revisor, flujo bloqueado .... flujo_de_revision   (as-is)
    la pelota .................................... encargos (tipo nuevo)

No se ha copiado una sola linea de `routes/reviews.py`. Los pasos de un
submittal SON la misma estructura que los de una revision --y por eso los
resuelve el MISMO modulo--, porque si se resolvieran por su cuenta acabarian
discrepando sobre a quien le toca, que es el defecto que `flujo_de_revision`
existe para impedir.

LA ESPECIFICACION, HOY TEXTO Y MANANA OBJETO
---------------------------------------------
`spec_seccion` es hoy un texto libre con su etiqueta. Cuando exista GAP 05
(Especificaciones como objeto) pasara a apuntar a una seccion real y podra
generarse el submittal DESDE la especificacion, como hacen los dos fabricantes.
Se deja el campo desde el principio para que ese dia sea una clave foranea y no
una migracion de datos inventados.
"""

import collections

import flujo_de_registro as reg

# ── ESTADOS ────────────────────────────────────────────────────────────────
#
# Lista CERRADA. Cada uno responde «donde esta este producto en su camino a la
# obra», y ninguno es un adorno.
BORRADOR = 'Borrador'        # el contratista lo prepara; no ha salido de su mano
ENVIADO = 'Enviado'          # sometido. La pelota es del MANAGER
EN_REVISION = 'En revision'  # distribuido. La pelota es del revisor del paso
RESPONDIDO = 'Respondido'    # hay veredicto final; falta cerrar y distribuir
CERRADO = 'Cerrado'          # cerrado y distribuido. Fin del camino
ANULADO = 'Anulado'          # se retira sin veredicto (se pidio por error)

ESTADOS = (BORRADOR, ENVIADO, EN_REVISION, RESPONDIDO, CERRADO, ANULADO)

# Un submittal RECHAZADO no vuelve atras: se crea una REVISION, que es una fila
# nueva con su propio numero de revision. Reabrir la misma fila borraria que
# hubo un rechazo, y el rechazo es justo lo que hay que poder demostrar.
TRANSICIONES = {
    BORRADOR:    (ENVIADO, ANULADO),
    ENVIADO:     (EN_REVISION, ANULADO),
    EN_REVISION: (RESPONDIDO, ANULADO),
    RESPONDIDO:  (CERRADO,),
    CERRADO:     (),
    ANULADO:     (),
}

# ── VEREDICTOS ─────────────────────────────────────────────────────────────
#
# El catalogo profesional estandar. Los dos fabricantes permiten respuestas
# personalizadas; aqui es una lista cerrada A PROPOSITO: un veredicto de
# submittal tiene consecuencia contractual, y un catalogo que cada obra reescribe
# hace que «aprobado» signifique cosas distintas en dos obras de la misma
# entidad. Si alguna vez hace falta ampliarlo, se amplia AQUI y se ve.
APROBADO = 'Aprobado'
APROBADO_CON_OBS = 'Aprobado con observaciones'
REVISAR_Y_REENVIAR = 'Revisar y reenviar'
RECHAZADO = 'Rechazado'
SOLO_INFORMACION = 'Solo para informacion'

VEREDICTOS = (APROBADO, APROBADO_CON_OBS, REVISAR_Y_REENVIAR,
              RECHAZADO, SOLO_INFORMACION)

# Los que DEJAN EL PRODUCTO FUERA hasta que llegue otra revision. Es la unica
# lectura del veredicto que el sistema hace por su cuenta, y por eso se declara.
EXIGEN_REVISION = (REVISAR_Y_REENVIAR, RECHAZADO)


def habilita_instalacion(veredicto):
    """¿Este veredicto deja el producto APTO para incorporarse a la obra?

    «Solo para informacion» NO habilita: es exactamente lo que significa. Y
    devolver False para un veredicto desconocido es deliberado: ante algo que no
    se sabe leer, no se autoriza instalar nada.
    """
    return veredicto in (APROBADO, APROBADO_CON_OBS)


# ── LA SEMANTICA, declarada como DATO ──────────────────────────────────────
SEMANTICA = collections.namedtuple('Semantica', reg.Semantica._fields)(
    clave='SUBMITTAL',
    tabla='doc_submittals',
    prefijo='SUB',
    singular='submittal',
    estados=ESTADOS,
    transiciones=TRANSICIONES,

    # QUIEN HACE QUE. Cada tupla es una regla de gobierno, no una comodidad:
    #
    # - envia el AUTOR (el contratista responsable). El manager no envia por el:
    #   si pudiera, el sometimiento dejaria de tener autor.
    # - distribuye y cierra el RESPONSABLE (el manager) o el ADMIN de la obra
    #   --el admin RESCATA un flujo atascado, no dicta el veredicto.
    # - el VEREDICTO no sale de aqui: lo dictan los REVISORES, paso a paso, y
    #   quien puede firmar cada paso lo decide `flujo_de_revision.puede_actuar`.
    #   Por eso esta tupla esta VACIA y no contiene ADMIN: un administrador que
    #   pudiera aprobar un submittal convertiria la revision tecnica en un
    #   tramite, que es justo lo que un submittal existe para impedir.
    quien_pasa_la_pelota=(reg.RESPONSABLE, reg.ADMIN),
    quien_dicta_veredicto=(),
    quien_cierra=(reg.RESPONSABLE, reg.ADMIN),
    quien_adopta=(reg.AUTOR,),

    restriccion_unica=None,
    asunto_encargo='Revisar %s: %s',

    msg_no_reasigna='Solo el gestor de submittals o un administrador de la obra pueden distribuirlo a revision.',
    msg_no_adopta='Solo el contratista responsable puede enviar su propio submittal.',
    msg_no_veredicto='El veredicto de un submittal lo dictan sus revisores, paso a paso. Nadie lo dicta desde fuera del flujo.',
    msg_no_cierra='Solo el gestor de submittals o un administrador de la obra pueden cerrarlo y distribuirlo.',
    msg_falta_veredicto='Un submittal no se cierra sin veredicto final.',
    msg_cerrado='Este submittal ya esta cerrado.',
    msg_necesita_adopcion='Este submittal esta en borrador: su contratista responsable tiene que enviarlo.',
    msg_bloqueado_fuera='Este submittal pertenece a otra obra.',
)
