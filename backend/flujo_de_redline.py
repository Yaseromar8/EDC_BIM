# -*- coding: utf-8 -*-
"""La SEMANTICA del Red Line. La mecanica esta en `flujo_de_registro.py`.

QUE ES UN RED LINE AQUI, SEGUN LOS DATOS REALES
-----------------------------------------------
NO es una observacion, ni un defecto, ni un markup grafico. Los 33 registros
reales lo dicen sin ambiguedad:

    adjuntos   RL_0004_500125-SCL-CNS-RL-SKT-P08-0004_RL_BP-01_a_BP-04.pdf
                                          ^^^  SKT = SKETCH
    titulos    Reubicar_BP-04_Y_CAMBIO_DE_COTA_BP-01
               REFUERZO_EN_ABERTURAS
               INGRESO_DE_TUBERIAS_SECUNDARIAS_A_BUZON_BP-01

Es el REGISTRO DE LOS CROQUIS DE MODIFICACION DEL PROYECTO: que se cambio
respecto a lo proyectado, en que croquis numerado y firmado consta, y si la
modificacion quedo aceptada. El sufijo `_RL_OK` marca los aprobados.

Y NO ES UN «ISSUE / OBSERVACION»
--------------------------------
Se evaluo expresamente si `doc_redlines` debia evolucionar hacia un Issue
documental y la respuesta fue NO: convertirlo habria destruido un registro real
de 33 documentos formales. El Issue como objeto propio queda DIFERIDO --no
inexistente, ni sustituido por otra cosa-- para cuando tenga valor transversal
con documentos, modelos, elementos BIM, ubicaciones o Field.

Un Review rechazado con comentarios puede CONTENER observaciones y devolver un
documento a correccion, y por eso el flujo documental de V1 se cierra sin Issue.
Pero Review e Issue siguen siendo objetos DISTINTOS.

EL MARKUP GRAFICO ES OTRA COSA, Y YA EXISTE
-------------------------------------------
`pdf_markups` --geometria, pagina, estilo, atada a un `file_node_id`, dibujada
desde `PdfToolsOverlay`-- es el markup grafico. No se toca ninguna linea de
codigo en comun con este modulo, y asi debe seguir.

POR QUE LAS POSICIONES COINCIDEN CON LAS DEL RFI, Y AUN ASI SE DECLARAN APARTE
------------------------------------------------------------------------------
Porque son la misma FAMILIA --registro numerado de documentos formales con
veredicto-- y en los dos casos las posiciones del flujo son las mismas tres.
Pero SIGNIFICAN cosas distintas:

  RFI       el veredicto acepta o rechaza LA RESPUESTA a una consulta.
  RED LINE  el veredicto acepta o rechaza LA MODIFICACION DEL PROYECTO.

Que hoy coincidan no autoriza a compartirlas por referencia: si manana el Red
Line necesita que el emisor verifique antes de cerrar, esa decision tiene que
poder tomarse aqui sin tocar el RFI. `ensayo_de_desacople.py` lo comprueba.

LOS 33 HISTORICOS
-----------------
Todos CERRADOS. No se convierten, no se reconstruyen actores, no se reescribe su
historia, y NINGUNO pide adopcion --`necesita_adopcion` exige heredado Y
abierto--. Solo los Red Lines NUEVOS nacen bajo el modelo profesional.
"""
import logging

import flujo_de_registro as _reg
from flujo_de_registro import AUTOR, RESPONSABLE, ADMIN, entrada  # noqa: F401

logger = logging.getLogger(__name__)

ESTADOS = ('Emitido', 'En revisión', 'Respondido', 'Cerrado')

# Los cuatro estados que la tabla YA usa. No se inventa ninguno.
#
# `Respondido -> En revisión` es la DEVOLUCION A CORRECCION: si la modificacion
# no se acepta tal como esta, el emisor la devuelve para que se rehaga el
# croquis. Sin ese camino, un Red Line rechazado solo se podria cerrar.
TRANSICIONES = {
    'Emitido':     ('Emitido', 'En revisión'),
    'En revisión': ('En revisión', 'Respondido'),
    'Respondido':  ('Respondido', 'En revisión', 'Cerrado'),
    'Cerrado':     ('Cerrado',),          # cerrado es cerrado
}


# ── LA SEMANTICA DEL RED LINE, DECLARADA ──────────────────────────────────
SEMANTICA = _reg.Semantica(
    clave='REDLINE',
    tabla='doc_redlines',
    prefijo='RL',
    singular='Red Line',
    estados=ESTADOS,
    transiciones=TRANSICIONES,
    # EL EMISOR dirige su croquis y lo recupera; quien lo tiene puede derivarlo;
    # el administrador desatasca.
    quien_pasa_la_pelota=(AUTOR, RESPONSABLE, ADMIN),
    # SOLO el responsable actual acepta o rechaza LA MODIFICACION. Que la
    # aceptara quien la propuso no probaria nada -- y hasta hoy cualquier
    # miembro de la obra podia hacerlo.
    quien_dicta_veredicto=(RESPONSABLE,),
    # Cierra y devuelve a correccion QUIEN LO EMITIO, cuando el croquis
    # aprobado le sirve. O un administrador, para que un Red Line cuyo emisor
    # salio de la obra no quede abierto para siempre.
    quien_cierra=(AUTOR, ADMIN),
    quien_adopta=(AUTOR, ADMIN),
    restriccion_unica='uq_doc_redlines_codigo',
    # «Revisar», no «Responder»: lo que se pide no es contestar una consulta,
    # es pronunciarse sobre una modificacion del proyecto.
    asunto_encargo='Revisar %s: %s',
    msg_no_reasigna=('Solo quien emitió el Red Line, quien lo tiene ahora o un '
                     'administrador pueden cambiar el responsable.'),
    msg_no_adopta=('Solo quien emitió el Red Line o un administrador puede '
                   'incorporarlo al flujo.'),
    msg_no_veredicto=('Solo quien tiene el Red Line puede aceptar o rechazar '
                      'la modificación.'),
    msg_no_cierra='Cierra el Red Line quien lo emitió, o un administrador.',
    msg_falta_veredicto=('Pronunciarse sobre la modificación exige un veredicto '
                         '(Aceptado o Rechazado).'),
    msg_cerrado='Un Red Line cerrado ya no se modifica.',
    msg_necesita_adopcion=('Este Red Line viene del registro anterior y todavía '
                           'no tiene responsable del sistema. Asígnalo antes de '
                           'darle veredicto o cerrarlo.'),
    msg_bloqueado_fuera=('%s ya no pertenece a esta obra, así que nadie puede '
                         'pronunciarse sobre este Red Line'),
)


# ── El API del objeto ─────────────────────────────────────────────────────

es_el_autor = _reg.es_el_autor
es_el_responsable = _reg.es_el_responsable
es_admin = _reg.es_admin
es_legacy = _reg.es_legacy
necesita_adopcion = _reg.necesita_adopcion
exige_veredicto = _reg.exige_veredicto


def puede_pasar_la_pelota(usuario, rl):
    return _reg.puede_pasar_la_pelota(SEMANTICA, usuario, rl)


def puede_dictar_veredicto(usuario, rl):
    """SOLO el responsable actual acepta o rechaza la modificacion."""
    return _reg.puede_dictar_veredicto(SEMANTICA, usuario, rl)


def puede_cerrar(usuario, rl):
    """El emisor o un administrador. Tambien es quien puede DEVOLVER."""
    return _reg.puede_cerrar(SEMANTICA, usuario, rl)


def puede_adoptar(usuario, rl):
    return _reg.puede_adoptar(SEMANTICA, usuario, rl)


def transicion_valida(actual, nuevo):
    return _reg.transicion_valida(SEMANTICA, actual, nuevo)


def estado_del_flujo(cur, rl, project_id=None):
    return _reg.estado_del_flujo(cur, SEMANTICA, rl, project_id)


def siguiente_codigo(cur, project_id):
    """El siguiente `RL-###` DENTRO DE LA OBRA. Ver `flujo_de_registro`."""
    return _reg.siguiente_codigo(cur, SEMANTICA, project_id)
