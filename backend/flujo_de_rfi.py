# -*- coding: utf-8 -*-
"""La SEMANTICA del RFI. La mecanica esta en `flujo_de_registro.py`.

Este fichero antes contenia las dos cosas. Se separo al profesionalizar los Red
Lines, que son de la MISMA FAMILIA --registro numerado de documentos formales
con veredicto-- pero NO el mismo objeto. La mecanica se comparte; lo que
significa cada uno se declara aqui, a la vista.

EL API PUBLICA DE ESTE MODULO NO CAMBIO. `routes/rfis.py` no se toco: el RFI se
cerro en F2 y esta pieza no vuelve a abrirlo.

POR QUE EL RFI NO COPIA EL MECANISMO DE REVIEWS
-----------------------------------------------
En una revision, el revisor de un paso lo FIJA el flujo al crearse, y
sustituirlo es un rescate: por eso esta encerrado tras «solo administrador y
solo si esta bloqueada».

En un RFI, pasar la pelota ES EL FLUJO: pregunto, respondes, reviso, cierro.
Encerrarlo tras las mismas puertas convertiria la operacion ordinaria en un
tramite. Pero «sin puertas de administrador» tampoco es «cualquiera»: un miembro
cualquiera de la obra no puede quitarle un RFI a otro en silencio.

LAS TRES REGLAS, Y DE DONDE SALEN
---------------------------------
Se apoyan solo en lo que ya existe --`created_by`, `responsable_id`,
`users.role` y la membresia--. Ninguna capa de permisos nueva.

  PASAR LA PELOTA   el AUTOR, el RESPONSABLE ACTUAL, o un ADMINISTRADOR.
                    Son las tres posiciones que existen en el flujo real: quien
                    pregunto dirige su consulta y la recupera; quien la tiene
                    puede decir «esto es del proyectista»; y el administrador
                    desatasca.

  DICTAR VEREDICTO  SOLO el responsable actual. Ni el autor ni un administrador.
                    Un veredicto que puede dictar quien pregunto no prueba nada,
                    y hoy CUALQUIER miembro de la obra podia hacerlo.

  CERRAR            el AUTOR o un ADMINISTRADOR. Cierra quien pregunto, cuando
                    la respuesta le sirve.

EL RFI LEGACY
-------------
Los 25 registros reales tienen `responsable` como TEXTO ('Ing. Valeria
Barrenechea') y ningun `responsable_id`. No se convierte: seria adivinar sobre el
expediente.

  CERRADO   se conserva exactamente. Es archivo.
  ABIERTO   necesita ADOPCION antes de recibir veredicto o cierre: una persona
            elige a que usuario de la obra corresponde. El texto original se
            conserva al lado, y queda dicho QUIEN lo eligio.
"""
import logging

import flujo_de_registro as _reg
from flujo_de_registro import AUTOR, RESPONSABLE, ADMIN, entrada  # noqa: F401

logger = logging.getLogger(__name__)

ESTADOS = ('Emitido', 'En revisión', 'Respondido', 'Cerrado')

# A donde puede ir cada estado. No se inventa ninguno: son los cuatro que la
# interfaz ya ofrece y los que usan los 25 registros reales.
#
# `Respondido -> En revisión` existe a proposito: si la respuesta no sirve, el
# autor la devuelve. Sin ese camino, un RFI mal respondido solo se podria
# cerrar, que es peor.
TRANSICIONES = {
    'Emitido':     ('Emitido', 'En revisión'),
    'En revisión': ('En revisión', 'Respondido'),
    'Respondido':  ('Respondido', 'En revisión', 'Cerrado'),
    'Cerrado':     ('Cerrado',),          # cerrado es cerrado
}


# ── LA SEMANTICA DEL RFI, DECLARADA ───────────────────────────────────────
#
# Quien puede que, escrito como POSICIONES DEL FLUJO. Se lee de un vistazo, y
# `ensayo_de_desacople.py` comprueba que cambiar esto NO cambia el Red Line.
SEMANTICA = _reg.Semantica(
    clave='RFI',
    tabla='doc_rfis',
    prefijo='RFI',
    singular='RFI',
    estados=ESTADOS,
    transiciones=TRANSICIONES,
    quien_pasa_la_pelota=(AUTOR, RESPONSABLE, ADMIN),
    quien_dicta_veredicto=(RESPONSABLE,),      # ni el autor ni un administrador
    quien_cierra=(AUTOR, ADMIN),
    quien_adopta=(AUTOR, ADMIN),
    restriccion_unica='uq_doc_rfis_codigo',
    asunto_encargo='Responder %s: %s',
    msg_no_reasigna=('Solo quien creó el RFI, quien lo tiene ahora o un '
                     'administrador pueden cambiar el responsable.'),
    msg_no_adopta=('Solo quien creó el RFI o un administrador puede '
                   'incorporarlo al flujo.'),
    msg_no_veredicto='Solo quien tiene el RFI puede responderlo.',
    msg_no_cierra='Cierra el RFI quien lo creó, o un administrador.',
    msg_falta_veredicto='Responder exige un veredicto (Aceptado o Rechazado).',
    msg_cerrado='Un RFI cerrado ya no se modifica.',
    msg_necesita_adopcion=('Este RFI viene del registro anterior y todavía no '
                           'tiene responsable del sistema. Asígnalo antes de '
                           'responderlo o cerrarlo.'),
    msg_bloqueado_fuera=('%s ya no pertenece a esta obra, así que nadie puede '
                         'responder este RFI'),
)


# ── El API de siempre, ahora sobre la mecanica comun ──────────────────────
# Las firmas no cambiaron: `routes/rfis.py` y sus 49 pruebas siguen igual.

es_el_autor = _reg.es_el_autor
es_el_responsable = _reg.es_el_responsable
# `cur` en las cuatro reglas: la posicion ADMIN pasa a significar
# «administrador DE ESTA OBRA», y eso hay que preguntarlo a la base.
# Sin cursor cae al Entity Admin, que conserva alcance global.
es_admin = _reg.es_admin
es_legacy = _reg.es_legacy
necesita_adopcion = _reg.necesita_adopcion
exige_veredicto = _reg.exige_veredicto


def puede_pasar_la_pelota(usuario, rfi, cur=None):
    return _reg.puede_pasar_la_pelota(SEMANTICA, usuario, rfi, cur)


def puede_dictar_veredicto(usuario, rfi, cur=None):
    """SOLO el responsable actual.

    Ni el autor ni un administrador: un veredicto que puede dictar quien
    pregunto no prueba nada. Un administrador que necesite intervenir se asigna
    el RFI primero --y eso queda escrito en el historial--.
    """
    return _reg.puede_dictar_veredicto(SEMANTICA, usuario, rfi, cur)


def puede_cerrar(usuario, rfi, cur=None):
    return _reg.puede_cerrar(SEMANTICA, usuario, rfi, cur)


def puede_adoptar(usuario, rfi, cur=None):
    """Quien incorpora un legacy al flujo estructurado.

    El autor o un administrador. El «responsable actual» no puede: todavia no
    existe como identidad -- es justamente lo que falta.
    """
    return _reg.puede_adoptar(SEMANTICA, usuario, rfi, cur)


def transicion_valida(actual, nuevo):
    return _reg.transicion_valida(SEMANTICA, actual, nuevo)


def estado_del_flujo(cur, rfi, project_id=None):
    return _reg.estado_del_flujo(cur, SEMANTICA, rfi, project_id)


def siguiente_codigo(cur, project_id, prefijo='RFI'):
    """El siguiente numero DENTRO DE LA OBRA. Ver `flujo_de_registro`.

    `prefijo` sigue en la firma porque estaba: si alguien pasa otro, manda ese.
    """
    sem = SEMANTICA if prefijo == 'RFI' else SEMANTICA._replace(prefijo=prefijo)
    return _reg.siguiente_codigo(cur, sem, project_id)
