# -*- coding: utf-8 -*-
"""Un recurso pertenece a una obra, y quien lo toca tiene que estar en ella.

QUE PROBLEMA ATACA
------------------
BASELINE 0 · C8. Hay un patron repetido por todo el backend: la ruta recibe el
identificador de un recurso -- un RFI, una marca de dibujo, un pin, una partida --
y actua sobre el sin mirar de que obra es. El identificador es unico y global, asi
que basta conocerlo (o probar) para escribir en el expediente de otra obra.

Medido el 13-ago-2026 con sesiones reales: un usuario que solo pertenecia a la
obra A modifico un RFI de la obra B con
    PATCH /api/rfis/96f75097-...  ->  200 "Updated successfully"
y la relectura en PostgreSQL confirmo el cambio sobre la fila de la obra B.

POR QUE UN MODULO Y NO UNA GUARDIA EN CADA SITIO
------------------------------------------------
Porque escribir la comprobacion a mano en cada ruta es exactamente como se llego
aqui: veintitantas rutas, cada una con su version, y las que se olvidaron no se
notan hasta que alguien las prueba. Aqui la unica decision -- de que obra es esta
fila y puede el usuario entrar -- se toma en un solo sitio.

LO QUE ESTO NO CUBRE
--------------------
Las rutas que reciben la obra por parametro (`?model_urn=`) las cubre el control
central del middleware. Esto es solo para las que reciben el ID DEL RECURSO, que
el middleware no puede resolver sin consultar la base.
"""

from flask import g, jsonify

from app_logging import get_logger

logger = get_logger('perimetro')

# tabla -> (columna del id, columna que dice de que obra es)
# Lista blanca a proposito: los nombres de tabla y columna NUNCA vienen de la
# peticion, se eligen aqui. Interpolar en SQL algo que llegue de fuera seria
# cambiar un agujero de autorizacion por uno de inyeccion.
RECURSOS = {
    'doc_rfis':          ('id', 'model_urn'),
    'doc_redlines':      ('id', 'model_urn'),
    'doc_partidas':      ('id', 'model_urn'),
    'control_pins':      ('id', 'project_id'),
    'element_docs':      ('id', 'model_urn'),
    'pdf_markups':       ('id', 'model_urn'),
    'custom_attr_defs':  ('id', 'model_urn'),
    'saved_views':       ('id', 'model_urn'),
    'doc_reviews':       ('id', 'model_urn'),
    'transmittals':      ('id', 'model_urn'),
    'doc_sets':          ('id', 'model_urn'),
}


# Rutas que reciben el ID DE UN RECURSO y no la obra. El middleware no puede
# adivinar de que obra son sin consultar la base; aqui se le dice donde mirar.
#
# Sin esto, encender ENFORCE_PROJECT_AUTHZ las bloqueaba TODAS con
# PROJECT_UNRESOLVED -- incluida POST /api/reviews/<id>/act, es decir, el camino
# a Publicado. Medido: encender el control cortaba el flujo ECD.
# nombre de la vista -> (tabla, nombre del parametro de ruta)
RUTAS_POR_RECURSO = {
    'update_rfi':         ('doc_rfis', 'rfi_id'),
    'update_redline':     ('doc_redlines', 'redline_id'),
    'update_partida':     ('doc_partidas', 'partida_id'),
    'delete_partida':     ('doc_partidas', 'partida_id'),
    'delete_element_doc': ('element_docs', 'doc_id'),
    'update_pin':         ('control_pins', 'pin_id'),
    'delete_pin':         ('control_pins', 'pin_id'),
    'delete_def':         ('custom_attr_defs', 'attr_id'),
    'delete_markup':      ('pdf_markups', 'markup_id'),
    'act_on_review':      ('doc_reviews', 'rid'),
    'delete_set':         ('doc_sets', 'set_id'),
    'get_set_items':      ('doc_sets', 'set_id'),
    'add_set_items':      ('doc_sets', 'set_id'),
    'remove_set_item':    ('doc_sets', 'set_id'),
    'acusar_recibo':      ('transmittals', 'tid'),
}


def obra_de_la_peticion(nombre_vista, view_args):
    """La obra de una peticion dirigida por id de recurso. None si no aplica."""
    if not nombre_vista or not view_args:
        return None
    corto = nombre_vista.rsplit('.', 1)[-1]
    if corto not in RUTAS_POR_RECURSO:
        return None
    tabla, param = RUTAS_POR_RECURSO[corto]
    valor = view_args.get(param)
    if valor is None:
        return None
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            return obra_del_recurso(conn.cursor(), tabla, valor)
    except Exception as e:
        logger.warning(f'no se pudo resolver la obra de {corto}: {e}')
        return None


def obra_del_recurso(cursor, tabla, valor_id):
    """De que obra es esta fila. None si no existe o no se puede saber."""
    if tabla not in RECURSOS:
        raise ValueError(f'tabla no declarada en RECURSOS: {tabla}')
    col_id, col_obra = RECURSOS[tabla]
    try:
        cursor.execute(f'SELECT {col_obra} FROM {tabla} WHERE {col_id}::text = %s',
                       (str(valor_id),))
        fila = cursor.fetchone()
    except Exception as e:
        logger.warning(f'no se pudo leer la obra de {tabla}:{valor_id}: {e}')
        return None
    if not fila or not fila[0]:
        return None
    from db import resolve_project_id
    return resolve_project_id(fila[0])


def guardia_de_recurso(tabla, valor_id):
    """None si se puede seguir; (respuesta, codigo) si hay que cortar.

    Fail-closed en lo que importa: si el recurso no existe se responde 404 sin
    decir nada mas -- confirmar que un id existe pero es de otra obra ya es
    filtrar informacion.
    """
    usuario = getattr(g, 'current_user', None)
    if not usuario:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    if usuario.get('role') == 'admin':
        return None

    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            obra = obra_del_recurso(conn.cursor(), tabla, valor_id)
    except Exception as e:
        # Un fallo aqui NO puede abrir la puerta: si no se sabe de quien es, no
        # se toca. Es lo contrario de lo que hacia el codigo anterior, que ante
        # la duda seguia adelante.
        logger.error(f'perimetro {tabla}:{valor_id}: {e}')
        return jsonify({'error': 'No se pudo comprobar el acceso al recurso.'}), 503

    if obra is None:
        return jsonify({'error': 'No encontrado'}), 404

    from auth_middleware import _user_in_project
    if not _user_in_project(usuario.get('id'), obra):
        logger.warning(f'[perimetro BLOQUEADO] user={usuario.get("id")} '
                       f'{tabla}:{valor_id} es de la obra {obra}')
        return jsonify({'error': 'Sin acceso a este proyecto', 'code': 'PROJECT_FORBIDDEN'}), 403
    return None
