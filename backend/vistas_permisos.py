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
    created_by IS NULL   (historica)   actualizar/renombrar/borrar/compartir -> ADMIN
    created_by == quien mira (propia)  actualizar/renombrar/borrar/compartir -> SI
    created_by != quien mira (ajena)   actualizar/renombrar/borrar/compartir -> ADMIN
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

QUE SIGNIFICA «ADMIN» AQUI
--------------------------
    ENTITY ADMIN                   atraviesa, en cualquier obra
    PROJECT ADMIN de la obra X     manda sobre las vistas de X: ajenas y legacy
    PROJECT ADMIN de A             en B no es nadie
    USUARIO NORMAL                 solo lo suyo
    VISTA HUERFANA (project_id '') solo Entity Admin

La administracion POR OBRA (CAPA 12, `es_admin_de_obra`) SI se consulta, y esto
corrige lo que decia antes este parrafo. Afirmaba que no serviria porque
`saved_views.project_id` guarda el FRENTE --`1_DRENAJE`-- y ninguno de esos
valores aparece en `projects`. Lo primero es cierto; lo segundo era una
comparacion de cadenas, y enganosa: pasados por `resolve_project_id`, `1_CANAL`
y `1_DRENAJE` resuelven a la obra `1`, que tiene 4 miembros.

La huerfana sale gratis de la misma regla, sin caso especial: `resolve_project_id('')`
no resuelve, `es_admin_de_obra` es fail-closed, y solo queda el Entity Admin. No
se inventa una obra para una vista que no dice de cual es.

QUIEN PREGUNTA POR LA OBRA, Y CUANTAS VECES
-------------------------------------------
`es_admin_de_la_obra` cuesta una consulta. Las rutas la resuelven UNA vez por
peticion y pasan el resultado como `admin_de_obra=`, en vez de dejar que cada
fila del listado la vuelva a preguntar. Por eso es un booleano y no una llamada
escondida dentro de `puede()`: el coste se ve en el sitio donde se paga.

LA INTERFAZ NO AUTORIZA
-----------------------
`permisos_de()` existe para que el panel no ofrezca un boton que va a devolver
403. Eso es cortesia, no autoridad: cada ruta vuelve a preguntar aqui, con la
fila ya bloqueada, y la bateria lo demuestra llamando a las rutas con la sesion
equivocada.
"""

from flask import jsonify

from administracion_de_obra import es_entity_admin

ACCIONES = ('actualizar', 'renombrar', 'borrar', 'compartir')

_VERBO = {
    'actualizar': 'actualizar esta vista',
    'renombrar': 'renombrar esta vista',
    'borrar': 'borrar esta vista',
    # E-4D. Emitir el enlace publico es una decision sobre QUIEN VE la vista, no
    # una lectura: pide lo mismo que modificarla. Una vista historica --sin
    # autor-- solo la comparte administracion, igual que no se puede renombrar.
    'compartir': 'crear el enlace de esta vista',
}


def autor_conocido(created_by):
    return created_by is not None


def es_suya(usuario, created_by):
    """Comparacion por texto: la sesion demo trae un id que no es numero."""
    if not usuario or created_by is None:
        return False
    return str(created_by) == str(usuario.get('id'))


def es_admin_de_la_obra(usuario, frente, cur=None):
    """Entity Admin, o Project Admin DE ESA obra. Fail-closed en todo lo demas.

    `frente` es lo que guarda `saved_views.project_id` --'1_DRENAJE'--, no un
    `projects.id`: la traduccion la hace `es_admin_de_obra` por dentro, con
    `resolve_project_id`. Sin obra resoluble responde que no, que es lo que deja
    a las vistas huerfanas en manos del Entity Admin y de nadie mas.

    Se le puede pasar un cursor cuando quien llama ya esta en una transaccion,
    para no pedir una segunda conexion mientras sostiene un bloqueo.
    """
    if es_entity_admin(usuario):
        return True
    if not usuario or not frente:
        return False
    try:
        from administracion_de_obra import es_admin_de_obra
        if cur is not None:
            return bool(es_admin_de_obra(cur, usuario, frente))
        from db import get_db_connection
        with get_db_connection() as conn:
            return bool(es_admin_de_obra(conn.cursor(), usuario, frente))
    except Exception:
        return False                      # FAIL-CLOSED


def puede(usuario, created_by, accion, admin_de_obra=False):
    """La regla, entera, en cinco lineas.

    `admin_de_obra` lo calcula quien llama con `es_admin_de_la_obra`, una vez
    por peticion. Su valor por omision es False: quien no diga nada sobre la
    obra obtiene la respuesta estrecha, no la ancha.
    """
    if accion not in ACCIONES:
        return False
    if not usuario:
        return False                      # sin sesion no se modifica nada
    if es_entity_admin(usuario) or admin_de_obra:
        return True
    return es_suya(usuario, created_by)


def motivo_de_negativa(usuario, created_by):
    if not usuario:
        return 'SIN_SESION'
    if not autor_conocido(created_by):
        return 'VISTA_HISTORICA_SIN_AUTOR'
    return 'VISTA_DE_OTRA_PERSONA'


def guardia(usuario, created_by, accion, admin_de_obra=False):
    """None si se puede seguir; `(cuerpo, 403)` si no.

    Se llama con la fila YA LEIDA y bloqueada dentro de la transaccion, no antes:
    autorizar sobre una lectura anterior es autorizar sobre datos que pueden
    haber cambiado.
    """
    if puede(usuario, created_by, accion, admin_de_obra):
        return None
    motivo = motivo_de_negativa(usuario, created_by)
    explicacion = {
        'SIN_SESION': 'Hay que iniciar sesion.',
        'VISTA_HISTORICA_SIN_AUTOR':
            'Es una vista anterior al registro de autoria: solo la administracion '
            'de esta obra puede %s. Puedes guardarla como tuya con «Guardar como».'
            % _VERBO[accion],
        'VISTA_DE_OTRA_PERSONA':
            'La guardo otra persona: solo su autor o la administracion de esta obra '
            'puede %s. Puedes guardarla como tuya con «Guardar como».' % _VERBO[accion],
    }[motivo]
    return jsonify({'error': explicacion, 'code': 'FORBIDDEN', 'motivo': motivo}), 403


def permisos_de(usuario, created_by, admin_de_obra=False):
    """Lo que la interfaz necesita para no ofrecer lo que no se va a poder.

    NO ES UNA AUTORIZACION. Es la misma regla, contada por adelantado.
    """
    return {
        'actualizar': puede(usuario, created_by, 'actualizar', admin_de_obra),
        'renombrar': puede(usuario, created_by, 'renombrar', admin_de_obra),
        'borrar': puede(usuario, created_by, 'borrar', admin_de_obra),
        'compartir': puede(usuario, created_by, 'compartir', admin_de_obra),
        # Crear una vista nueva a partir de otra no toca la original: quien
        # tiene sesion siempre puede.
        'guardarComo': bool(usuario),
        'esMia': es_suya(usuario, created_by),
        'autorConocido': autor_conocido(created_by),
    }


def con_permisos(dic, usuario, admin_de_obra=False):
    """Anade `permisos` a una respuesta ya serializada.

    Vive aqui y no en `vistas_contrato` a proposito: aquel modulo decide la
    FORMA de una respuesta y este la AUTORIDAD. Mezclarlos haria que cambiar un
    permiso pareciera un cambio de formato.
    """
    if dic is None:
        return None
    dic = dict(dic)
    dic['permisos'] = permisos_de(usuario, dic.get('createdBy'), admin_de_obra)
    return dic
