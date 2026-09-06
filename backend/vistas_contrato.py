# -*- coding: utf-8 -*-
"""Que se devuelve de una Saved View, y a quien. Nada mas.

EL PROBLEMA QUE RESUELVE
------------------------
Habia UNA sola forma de una Saved View y se usaba para todo. `GET /api/views`
devolvia el documento COMPLETO de cada vista para pintar una lista de nombres:

    14 vistas en la base de trabajo
    74.526 bytes de viewer_state + filter_state + config
    de los que el panel usa `id` y `name`   (ViewsPanel.jsx:163-165)

Es decir, mas del 99 % del listado se descarga para no mirarlo. Y no es solo
peso: el listado tambien entregaba el estado de camara, los filtros y las
columnas de CADA vista a cualquiera que pudiera listar, cuando solo hacia falta
para la que se abre.

Aqui hay TRES formas, y cada una existe porque tiene un lector distinto:

    listado    galeria y panel. Metadatos. NUNCA el documento.
    detalle    quien abre una vista CON SESION. El documento entero.
    publico    quien abre un ENLACE COMPARTIDO, sin sesion. Lo justo para
               restaurar, y ni un dato de persona.

LA REGLA QUE LO GOBIERNA
------------------------
El listado no puede devolver el documento AUNQUE la consulta lo traiga. Por eso
las columnas pesadas no se nombran en el SQL del listado: no se filtran al
serializar --eso seria confiar en que nadie se equivoque mas tarde--, es que no
se leen de la base. `COLUMNAS_LISTADO` es la unica lista que el listado usa.

v1 Y v2 CONVIVEN, Y NINGUNA SE CONVIERTE AL LEERLA
--------------------------------------------------
Una vista v1 se devuelve como v1, con sus tres columnas. Una v2, con `state`.
Leer una vista NO la migra: la migracion es un acto de su autor, no un efecto
de que alguien la abriera. Ver `vistas_v2.py`.

EL ENLACE COMPARTIDO NO CAMBIA
------------------------------
La forma publica de una vista v1 es, campo por campo, la que devolvia el
endpoint antes de esta etapa mas `schemaVersion`. Los enlaces que ya estan
repartidos siguen abriendo. Lo unico que se anade es el discriminador, porque
sin el un cliente no puede saber si lo que recibe es v1 o v2.
"""

# Columnas que el LISTADO lee. No estan `viewer_state`, `filter_state`, `config`
# ni `state`, y esa ausencia es el contrato: lo que no se lee no se puede filtrar
# mal ni devolver por descuido.
COLUMNAS_LISTADO = (
    'id', 'name', 'project_id', 'schema_version', 'description',
    'thumbnail', 'created_at', 'updated_at', 'created_by',
)

# El DETALLE si las lee: es el unico sitio donde el documento sale de la base.
COLUMNAS_DETALLE = COLUMNAS_LISTADO + ('viewer_state', 'filter_state', 'config', 'state')

SQL_LISTADO = ', '.join(COLUMNAS_LISTADO)
SQL_DETALLE = ', '.join(COLUMNAS_DETALLE)


def _fecha(v):
    return v.isoformat() if v is not None and hasattr(v, 'isoformat') else v


def _dic(fila, columnas):
    """La fila de psycopg2 (tupla) a diccionario por nombre de columna."""
    return dict(zip(columnas, fila))


def es_v2(d):
    """Un documento es v2 cuando la BASE lo dice, no cuando lo parece."""
    return int(d.get('schema_version') or 1) == 2


def _mia(d, usuario):
    """¿La firmo quien esta mirando? `None` no es de nadie: es historica."""
    autor = d.get('created_by')
    if autor is None or not usuario:
        return False
    return str(autor) == str(usuario.get('id'))


def _cabecera(d, usuario):
    return {
        'id': d.get('id'),
        'name': d.get('name'),
        'projectId': d.get('project_id'),
        'schemaVersion': int(d.get('schema_version') or 1),
        'description': d.get('description'),
        'createdAt': _fecha(d.get('created_at')),
        'updatedAt': _fecha(d.get('updated_at')),
        # El identificador del autor, no su nombre ni su correo. Sale SOLO por
        # endpoint con sesion, y sirve para que la interfaz sepa distinguir «mia»
        # de «ajena» --que es lo que gobierna que botones ofrece--. Quien es esa
        # persona no se dice aqui.
        'createdBy': d.get('created_by'),
        'esMia': _mia(d, usuario),
    }


def fila_de_listado(fila, usuario=None, columnas=COLUMNAS_LISTADO):
    """Galeria y panel. Metadatos y la miniatura; jamas el documento."""
    d = _dic(fila, columnas) if not isinstance(fila, dict) else fila
    salida = _cabecera(d, usuario)
    salida['thumbnail'] = d.get('thumbnail')
    return salida


def fila_de_detalle(fila, usuario=None, columnas=COLUMNAS_DETALLE):
    """Quien abre una vista con sesion. Aqui SI sale el documento."""
    d = _dic(fila, columnas) if not isinstance(fila, dict) else fila
    salida = _cabecera(d, usuario)
    salida['thumbnail'] = d.get('thumbnail')
    if es_v2(d):
        salida['state'] = d.get('state') or {}
    else:
        salida['viewerState'] = d.get('viewer_state') or {}
        salida['filterState'] = d.get('filter_state') or {}
        salida['config'] = d.get('config') or {}
    return salida


def fila_publica(fila, columnas=COLUMNAS_DETALLE):
    """El enlace compartido. Sin sesion, sin autor, sin nada de personas.

    En v1 la forma es la de siempre --los enlaces repartidos siguen abriendo--
    mas `schemaVersion`. En v2, exactamente lo que hace falta para restaurar.
    """
    d = _dic(fila, columnas) if not isinstance(fila, dict) else fila
    if es_v2(d):
        return {
            'id': d.get('id'),
            'name': d.get('name'),
            'projectId': d.get('project_id'),
            'schemaVersion': 2,
            'state': d.get('state') or {},
        }
    return {
        'id': d.get('id'),
        'name': d.get('name'),
        'projectId': d.get('project_id'),
        'schemaVersion': 1,
        'viewerState': d.get('viewer_state') or {},
        'filterState': d.get('filter_state') or {},
        'config': d.get('config') or {},
        'createdAt': _fecha(d.get('created_at')),
    }


# Lo que NINGUNA respuesta publica puede contener. Lo comprueba la bateria: una
# lista escrita es una promesa; una lista que ademas se verifica es un limite.
CAMPOS_PROHIBIDOS_EN_PUBLICO = ('createdBy', 'created_by', 'email', 'esMia',
                                'description', 'thumbnail', 'updatedAt')

# Y lo que ningun LISTADO puede contener, por pesado y por innecesario.
CAMPOS_PROHIBIDOS_EN_LISTADO = ('viewerState', 'filterState', 'config', 'state',
                                'viewer_state', 'filter_state')
