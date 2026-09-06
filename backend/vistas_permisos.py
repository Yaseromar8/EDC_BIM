# -*- coding: utf-8 -*-
"""Quien puede tocar una Saved View. La decision, en el servidor.

DE DONDE VIENE ESTO
-------------------
Hasta esta etapa `DELETE /api/views/<id>` no preguntaba nada: bastaba una sesion
--cualquiera-- para borrar la vista de cualquier persona en cualquier obra, y la
ruta respondia `{'success': true}` aunque la vista no existiera. No habia a quien
preguntar: la tabla no tenia autor. La columna `created_by` llego en E-0.

LA POLITICA, APROBADA POR EL DUENO
----------------------------------
    created_by IS NULL   (historica)   actualizar/renombrar/borrar -> ADMIN
    created_by == quien mira (propia)  actualizar/renombrar/borrar -> SI
    created_by != quien mira (ajena)   actualizar/renombrar/borrar -> ADMIN
    «Guardar como»                     cualquiera con sesion, siempre

NULL NO ES «DE NADIE»: ES «DE LA OBRA»
--------------------------------------
Las 14 vistas que existen se guardaron antes de que hubiera autor. Rellenar ese
hueco con alguien seria inventar historia, asi que no se rellena --E-0 lo dice y
no hay backfill--. Pero «autor desconocido» tampoco puede leerse como «mia»:
eso convertiria a cualquiera en dueno de todas las vistas viejas de la obra. Se
lee como lo contrario: solo administracion las modifica, y cualquiera puede
llevarse una copia con «Guardar como».

Por eso mismo, desde E-4B las vistas NUEVAS nacen firmadas --tambien las v1--:
si no, esta politica dejaria a la gente sin poder borrar su propia vista recien
guardada, y NULL pasaria a significar dos cosas.

QUE ES «ADMIN» AQUI, Y QUE NO
-----------------------------
`es_entity_admin`: el custodio de la instancia. NO se consulta la administracion
POR OBRA (CAPA 12, `es_admin_de_obra`) y la razon es medible, no de gusto:
`saved_views.project_id` no guarda `projects.id`, guarda el FRENTE --`1_DRENAJE`,
`1_CANAL`, y en tres filas la cadena vacia--. Comprobado sobre las 14 vistas de
la base de trabajo: NINGUNA casa con una fila de `projects`. `es_admin_de_obra`
resuelve la obra antes de decidir y sin obra resoluble responde que no, asi que
un Project Admin quedaria fuera igualmente. Aplicarlo aqui daria una impresion
de granularidad que los datos no sostienen. Queda anotado como decision
pendiente para cuando las vistas guarden la obra canonica.

LA INTERFAZ NO AUTORIZA
-----------------------
`permisos_de()` existe para que el panel no ofrezca un boton que va a devolver
403. Eso es cortesia, no autoridad: cada ruta vuelve a preguntar aqui, con la
fila ya bloqueada, y la bateria lo demuestra llamando a las rutas con la sesion
equivocada.
"""

from flask import jsonify

from administracion_de_obra import es_entity_admin

ACCIONES = ('actualizar', 'renombrar', 'borrar')

_VERBO = {
    'actualizar': 'actualizar esta vista',
    'renombrar': 'renombrar esta vista',
    'borrar': 'borrar esta vista',
}


def autor_conocido(created_by):
    return created_by is not None


def es_suya(usuario, created_by):
    """Comparacion por texto: la sesion demo trae un id que no es numero."""
    if not usuario or created_by is None:
        return False
    return str(created_by) == str(usuario.get('id'))


def puede(usuario, created_by, accion):
    """La regla, entera, en cuatro lineas."""
    if accion not in ACCIONES:
        return False
    if not usuario:
        return False                      # sin sesion no se modifica nada
    if es_entity_admin(usuario):
        return True
    return es_suya(usuario, created_by)


def motivo_de_negativa(usuario, created_by):
    if not usuario:
        return 'SIN_SESION'
    if not autor_conocido(created_by):
        return 'VISTA_HISTORICA_SIN_AUTOR'
    return 'VISTA_DE_OTRA_PERSONA'


def guardia(usuario, created_by, accion):
    """None si se puede seguir; `(cuerpo, 403)` si no.

    Se llama con la fila YA LEIDA y bloqueada dentro de la transaccion, no antes:
    autorizar sobre una lectura anterior es autorizar sobre datos que pueden
    haber cambiado.
    """
    if puede(usuario, created_by, accion):
        return None
    motivo = motivo_de_negativa(usuario, created_by)
    explicacion = {
        'SIN_SESION': 'Hay que iniciar sesion.',
        'VISTA_HISTORICA_SIN_AUTOR':
            'Es una vista anterior al registro de autoria: solo un administrador '
            'puede %s. Puedes guardarla como tuya con «Guardar como».' % _VERBO[accion],
        'VISTA_DE_OTRA_PERSONA':
            'La guardo otra persona: solo su autor o un administrador puede %s. '
            'Puedes guardarla como tuya con «Guardar como».' % _VERBO[accion],
    }[motivo]
    return jsonify({'error': explicacion, 'code': 'FORBIDDEN', 'motivo': motivo}), 403


def permisos_de(usuario, created_by):
    """Lo que la interfaz necesita para no ofrecer lo que no se va a poder.

    NO ES UNA AUTORIZACION. Es la misma regla, contada por adelantado.
    """
    return {
        'actualizar': puede(usuario, created_by, 'actualizar'),
        'renombrar': puede(usuario, created_by, 'renombrar'),
        'borrar': puede(usuario, created_by, 'borrar'),
        # Crear una vista nueva a partir de otra no toca la original: quien
        # tiene sesion siempre puede.
        'guardarComo': bool(usuario),
        'esMia': es_suya(usuario, created_by),
        'autorConocido': autor_conocido(created_by),
    }


def con_permisos(dic, usuario):
    """Anade `permisos` a una respuesta ya serializada.

    Vive aqui y no en `vistas_contrato` a proposito: aquel modulo decide la
    FORMA de una respuesta y este la AUTORIDAD. Mezclarlos haria que cambiar un
    permiso pareciera un cambio de formato.
    """
    if dic is None:
        return None
    dic = dict(dic)
    dic['permisos'] = permisos_de(usuario, dic.get('createdBy'))
    return dic
