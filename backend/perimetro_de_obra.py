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
    # OJO: saved_views NO tiene model_urn -- su columna de obra es project_id
    # (con semantica de frente, ej. '1_CANAL'; ver el CREATE en routes/views.py).
    # La entrada decia model_urn y estuvo DORMIDA: ningun endpoint de vistas
    # pasaba por aqui, asi que el error no se ejecutaba nunca. Se descubrio al
    # clasificar las rutas para ENFORCE, no por un fallo.
    'saved_views':       ('id', 'project_id'),
    'doc_reviews':       ('id', 'model_urn'),
    'transmittals':      ('id', 'model_urn'),
    # GAP 01. Sin esta linea `obra_del_recurso` LANZA ValueError --no devuelve
    # None-- y las seis rutas del submittal responderian 500 en vez de guardar
    # nada. Se registra AQUI y no en el manejador: una guardia que cada ruta
    # declara por su cuenta es como se olvidan la mitad.
    'doc_submittals':    ('id', 'model_urn'),
    # GAP 02. El plano guarda por su propia obra; el PDF al que apunta lo sigue
    # guardando `file_nodes`, que es quien tiene la autoridad sobre el permiso
    # de recurso. Dos guardias sobre dos cosas distintas, no una duplicada.
    'doc_planos':        ('id', 'model_urn'),
    'doc_actas':         ('id', 'model_urn'),
    'doc_sets':          ('id', 'model_urn'),
    # El documento en si. Comprobar contra el NODO es mas fuerte que fiarse del
    # model_urn que manda el cliente: el nodo dice de que obra es de verdad.
    'file_nodes':        ('id', 'model_urn'),
    # La sesion de subida troceada. Sin esto, conocer un id de sesion bastaba
    # para cancelar la subida de otra obra a media carga, o para falsear su
    # progreso.
    'upload_sessions':   ('id', 'model_urn'),
    # El buffer de correcciones de la IA. Lleva la obra de la consulta original.
    'ai_brain.feedback_buffer': ('id', 'model_urn'),
    # El tablero de analisis. Su columna de obra se llama 'project' (TEXT NOT
    # NULL, ver routes/dashboards.py y esquema_base.py).
    'dashboards':        ('id', 'project'),
    # El trabajo de extraccion de inventario. La columna model_urn se anadio el
    # 17-ago: antes el job no sabia de que obra era y su sondeo de estado no
    # podia resolver obra bajo ENFORCE.
    'extraction_jobs':   ('job_id', 'model_urn'),
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
    # La salida de una revision BLOQUEADA. Recibe solo el id de la
    # revision, asi que su obra sale de la fila -- igual que `act`.
    # Sin esta linea devolvia 403 PROJECT_UNRESOLVED antes de llegar a
    # sus propias comprobaciones, y una revision parada se quedaba sin
    # la unica via que tiene para desatascarse.
    'reasignar_revisor':  ('doc_reviews', 'rid'),
    'delete_set':         ('doc_sets', 'set_id'),
    'get_set_items':      ('doc_sets', 'set_id'),
    'add_set_items':      ('doc_sets', 'set_id'),
    'remove_set_item':    ('doc_sets', 'set_id'),
    'acusar_recibo':      ('transmittals', 'tid'),
    # -- Anadidas el 17-ago al preparar ENFORCE: rutas cuyo unico identificador
    # es el id del recurso en la RUTA. Sin estas entradas, bajo ENFORCE
    # devolvian 403 PROJECT_UNRESOLVED antes de llegar siquiera a su guardia
    # interior (las de uploads la tienen; dashboards tambien; el sondeo de
    # extraccion no tenia ninguna). --
    'get_upload_status':  ('upload_sessions', 'upload_id'),
    'cancel_upload':      ('upload_sessions', 'upload_id'),
    'get_dashboard':      ('dashboards', 'dash_id'),
    'update_dashboard':   ('dashboards', 'dash_id'),
    'get_extraction_status': ('extraction_jobs', 'job_id'),
    # La ficha de un documento por su id de base de datos.
    'get_document_by_id': ('file_nodes', 'node_id'),
}


# Como RUTAS_POR_RECURSO, pero para rutas cuyo id de recurso viaja en la QUERY
# (?node_id=...) y no en la ruta. Mismo mecanismo, otra fuente.
RUTAS_POR_QUERY = {
    'get_values':      ('file_nodes', 'node_id'),   # GET /api/attrs/values
    'list_markups':    ('file_nodes', 'node_id'),   # GET /api/pdf/markups
    'get_calibration': ('file_nodes', 'node_id'),   # GET /api/pdf/calibration
    # -- Segunda tanda. Las tres resuelven la obra por el NODO, no por el
    # model_urn que declare el cliente. Los tres manejadores ya lo hacen asi por
    # dentro (documents.py lo dice: «desconfia del model_urn del cliente»), y el
    # control central tenia que igualarlo: si el middleware se fiara del dato
    # del cliente mientras el manejador mira la fila, serian dos verdades
    # distintas sobre la misma peticion. --
    'trazabilidad_de_documento': ('file_nodes', 'id'),        # ?id=
    'get_versions': ('file_nodes', 'id'),                     # ?id=
    'download_folder_urls': ('file_nodes', 'folder_id'),      # ?folder_id=
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


def obra_por_query(nombre_vista, args):
    """La obra de una peticion cuyo id de recurso viaja en la query string."""
    if not nombre_vista or not args:
        return None
    corto = nombre_vista.rsplit('.', 1)[-1]
    if corto not in RUTAS_POR_QUERY:
        return None
    tabla, param = RUTAS_POR_QUERY[corto]
    valor = args.get(param)
    if not valor:
        return None
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            return obra_del_recurso(conn.cursor(), tabla, valor)
    except Exception as e:
        logger.warning(f'no se pudo resolver la obra de {corto} por query: {e}')
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


def _entidad(usuario):
    """ENTITY ADMIN: el custodio de la instancia. Alcance global mientras
    1 instancia = 1 cliente."""
    from administracion_de_obra import es_entity_admin
    return es_entity_admin(usuario)


def _es_admin_de_esta_obra(usuario, valor_obra):
    """ENTITY ADMIN, o PROJECT ADMIN **de esta obra concreta**.

    Se abre su propia conexion porque las guardias se llaman desde manejadores
    que todavia no tienen cursor. El Entity Admin se resuelve ANTES, sin tocar
    la base: es el caso mayoritario y no merece una consulta.
    """
    if _entidad(usuario):
        return True
    try:
        from administracion_de_obra import es_admin_de_obra
        from db import get_db_connection
        with get_db_connection() as conn:
            return es_admin_de_obra(conn.cursor(), usuario, valor_obra)
    except Exception as e:
        logger.error('[perimetro] administracion no resuelta: %s', e)
        return False                      # FAIL-CLOSED


def guardia_de_obra(valor_obra, accion='esta operación'):
    """None si se puede seguir; (respuesta, codigo) si hay que cortar.

    Para los manejadores que reciben la obra DIRECTAMENTE (?model_urn=, project_id
    en el cuerpo, en la ruta...). Es defensa en profundidad: el control central
    del middleware ya deberia haber cortado, pero hoy ese control depende de una
    variable de entorno, y la separacion entre obras no puede colgar de una
    variable. Medido el 13-ago-2026: con el control apagado -- que es como esta
    produccion -- un usuario ajeno falsificaba puntos de control geodesico,
    vaciaba el presupuesto de otra obra y borraba sus frentes.

    Se llama DESPUES de comprobar el rol, si la ruta comprueba rol: asi quien no
    tiene permiso recibe un 403 limpio en vez del error de esta comprobacion.
    """
    usuario = getattr(g, 'current_user', None)
    if not usuario:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    # ADMINISTRADOR **DE ESTA OBRA**, no cualquier `admin`.
    #
    # Aqui decia `role == 'admin'`, y con eso un administrador que ni siquiera
    # era miembro leia el arbol, sacaba el indice del expediente y emitia un RFI
    # en una obra ajena. El Entity Admin sigue pasando --conserva alcance global
    # mientras 1 instancia = 1 cliente-- pero ahora se dice POR QUE pasa.
    if _es_admin_de_esta_obra(usuario, valor_obra):
        return None

    from db import resolve_project_id
    obra = resolve_project_id(valor_obra) if valor_obra else None
    if not obra:
        # No saber de que obra es una peticion que escribe no puede resolverse
        # dandola por buena.
        logger.warning(f'[perimetro] obra indeterminable en {accion}: {valor_obra!r}')
        return jsonify({'error': 'No se pudo determinar a qué obra pertenece esta petición.',
                        'code': 'PROJECT_UNRESOLVED'}), 403

    from auth_middleware import _user_in_project
    if not _user_in_project(usuario.get('id'), obra):
        logger.warning(f'[perimetro BLOQUEADO] user={usuario.get("id")} obra={obra} {accion}')
        return jsonify({'error': 'Sin acceso a este proyecto', 'code': 'PROJECT_FORBIDDEN'}), 403
    return None


def obra_del_documento(cursor, node_id=None, gcs_urn=None):
    """De que obra es un documento, por id de nodo o por ruta del objeto."""
    if node_id:
        cursor.execute('SELECT model_urn FROM file_nodes WHERE id::text = %s',
                       (str(node_id),))
    elif gcs_urn:
        cursor.execute('SELECT model_urn FROM file_nodes WHERE gcs_urn = %s '
                       'AND NOT is_deleted LIMIT 1', (str(gcs_urn),))
    else:
        return None
    fila = cursor.fetchone()
    if not fila or not fila[0]:
        return None
    from db import resolve_project_id
    return resolve_project_id(fila[0])


def guardia_del_documento(node_id=None, gcs_urn=None, accion='abrir este documento'):
    """None si se puede seguir; (respuesta, codigo) si hay que cortar.

    Para los manejadores que reciben un DOCUMENTO -- por id de nodo o por la
    ruta del objeto en el almacen -- y no la obra. Es el caso de la IA: se le
    pasa un `nodeId` y se descarga el PDF, se lee y se resume. Sin esta
    comprobacion bastaba conocer el id de un nodo ajeno para que la propia
    plataforma te leyera un documento de otra obra en voz alta: una fuga de
    bytes por una puerta distinta de la de descarga.

    Fail-closed: si la ruta del objeto no corresponde a ningun nodo vivo, se
    corta. Un objeto del almacen sin nodo no se puede atribuir a una obra, y no
    saber de quien es no puede resolverse dandolo por bueno.
    """
    usuario = getattr(g, 'current_user', None)
    if not usuario:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    # La obra del blob se resuelve mas abajo; aqui solo puede atravesar quien
    # administra la INSTANCIA. Un Project Admin pasara por la via normal, que ya
    # sabe de que obra es el objeto.
    if _entidad(usuario):
        return None
    if not node_id and not gcs_urn:
        return jsonify({'error': 'Falta el documento sobre el que operar.'}), 400

    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            obra = obra_del_documento(conn.cursor(), node_id, gcs_urn)
    except Exception as e:
        logger.error(f'perimetro documento {node_id or gcs_urn}: {e}')
        return jsonify({'error': 'No se pudo comprobar el acceso al documento.'}), 503

    if obra is None:
        return jsonify({'error': 'No encontrado'}), 404

    from auth_middleware import _user_in_project
    if not _user_in_project(usuario.get('id'), obra):
        logger.warning(f'[perimetro BLOQUEADO] user={usuario.get("id")} '
                       f'documento={node_id or gcs_urn} obra={obra} {accion}')
        return jsonify({'error': 'Sin acceso a este proyecto', 'code': 'PROJECT_FORBIDDEN'}), 403
    return None


def guardia_de_recurso(tabla, valor_id):
    """None si se puede seguir; (respuesta, codigo) si hay que cortar.

    Fail-closed en lo que importa: si el recurso no existe se responde 404 sin
    decir nada mas -- confirmar que un id existe pero es de otra obra ya es
    filtrar informacion.
    """
    usuario = getattr(g, 'current_user', None)
    if not usuario:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    # La obra del recurso se averigua abajo, leyendo su fila. El Entity Admin
    # atraviesa; el Project Admin lo hara al comprobarse su obra.
    if _entidad(usuario):
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
