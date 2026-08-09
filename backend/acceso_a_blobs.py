"""Quien es el dueno de un objeto del almacenamiento, y por tanto quien puede leerlo.

EL PROBLEMA QUE RESUELVE
------------------------
Las rutas que sirven bytes (/api/docs/proxy, /api/docs/view, /api/docs/signed-url)
identificaban al fichero por su clave de almacenamiento y resolvian la obra duena
mirando UNA sola tabla, file_nodes. Si ahi no aparecia, permitian:

    if obra_real is None:
        return None   # "el fichero no esta en el arbol: no hay obra que proteger"

Esa suposicion era falsa. file_nodes solo guarda la clave de la version VIGENTE de
cada documento: al subir la V2, la clave de la V1 deja de estar en file_nodes y pasa
a vivir solo en file_versions. Y ademas hay otras cuatro tablas que poseen objetos.
Resultado: los bytes de cualquier version anterior de cualquier documento de
cualquier obra eran descargables por cualquiera con sesion valida.

No se podia arreglar simplemente denegando cuando file_nodes no lo reconoce: las
fotos de campo de la APK y los adjuntos de los puntos de control tampoco estan en
file_nodes, y se sirven por la misma ruta. Denegar a lo bruto habria dejado sin
fotos al equipo en obra.

COMO LO RESUELVE
----------------
Preguntando a TODAS las tablas que pueden poseer un objeto, en una sola consulta, y
denegando solo cuando NINGUNA lo reconoce (fail-closed). La lista de tablas se
verifico contra la base real; si manana aparece otra, se anade aqui y todas las
rutas que sirven bytes quedan cubiertas a la vez.

Nota sobre upload_sessions: una subida en curso ya tiene su objeto escrito pero aun
no tiene fila en file_nodes. Sin contemplarla habria una ventana de carrera en la
que el que acaba de subir un fichero no puede leerlo.
"""

from app_logging import get_logger

logger = get_logger('acceso_blobs')


# Cada entrada: (tabla_a_comprobar, SQL que devuelve ambito y obra_id, prioridad).
# La prioridad decide quien manda cuando el mismo objeto aparece en dos sitios: la
# fila vigente de file_nodes es la mas fiable, la subida en curso la que menos.
_FUENTES = [
    (
        'file_nodes',
        """SELECT model_urn AS ambito, NULL::text AS obra_id, 'file_nodes' AS origen, 1 AS prio
             FROM file_nodes
            WHERE gcs_urn = %(urn)s AND %(urn)s <> ''""",
        1,
    ),
    (
        'file_versions',
        """SELECT n.model_urn, NULL::text, 'file_versions', 2
             FROM file_versions v JOIN file_nodes n ON n.id = v.file_node_id
            WHERE v.gcs_urn = %(urn)s AND %(urn)s <> ''""",
        2,
    ),
    (
        'photo_evidences',
        """SELECT model_urn, project_id::text, 'photo_evidences', 3
             FROM photo_evidences
            WHERE gcs_urn = %(urn)s AND %(urn)s <> ''""",
        3,
    ),
    (
        'control_pins',
        """SELECT NULL::character varying, project_id::text, 'control_pins', 4
             FROM control_pins
            WHERE attachment_urn = %(urn)s AND %(urn)s <> ''""",
        4,
    ),
    (
        'lob_dataset_sources',
        """SELECT d.scope_urn::character varying, NULL::text, 'lob_dataset_sources', 5
             FROM lob_dataset_sources s JOIN lob_datasets d ON d.id = s.dataset_id
            WHERE s.gcs_urn = %(urn)s AND %(urn)s <> ''""",
        5,
    ),
    (
        'upload_sessions',
        """SELECT model_urn, NULL::text, 'upload_sessions', 6
             FROM upload_sessions
            WHERE gcs_urn = %(urn)s AND %(urn)s <> ''""",
        6,
    ),
]

# Que tablas existen de verdad. Se calcula una vez: en una base recien creada
# algunas se crean de forma perezosa (photo_evidences la crea tracking.py al
# primer uso), y una consulta a una tabla inexistente aborta la transaccion
# entera de psycopg2, no solo esa rama.
_tablas_presentes = None


def _tablas(cursor):
    global _tablas_presentes
    if _tablas_presentes is None:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        )
        _tablas_presentes = {r[0] for r in cursor.fetchall()}
    return _tablas_presentes


def olvidar_tablas():
    """Rehace el censo de tablas. Para las pruebas y para tras una migracion."""
    global _tablas_presentes
    _tablas_presentes = None


# Un objeto no cambia de dueno nunca: la clave lleva un uuid dentro y no se
# reutiliza. Asi que la respuesta se puede guardar sin miedo a servirla rancia, y
# un album de fotos deja de pagar una consulta por miniatura. Solo se guardan los
# aciertos: un "no lo reconoce nadie" puede ser una subida a medio terminar, y ese
# si tiene que volver a preguntarse.
_CACHE_MAX = 5000
_cache_duenos = {}


def olvidar_duenos():
    """Vacia la cache. Para las pruebas."""
    _cache_duenos.clear()


def obra_del_blob(cursor, gcs_urn=None, node_id=None):
    """Quien es el dueno de este objeto.

    Devuelve (ambito, obra_id, origen):
      ambito  -- el model_urn del dueno (que en este proyecto es un ambito de
                 frente, no un id de obra), o None
      obra_id -- id de obra (texto, como projects.id), para las tablas que no
                 guardan model_urn
      origen  -- la tabla que lo reconocio, o '' si NINGUNA. Ese '' es la senal
                 de denegar: un objeto que nadie reclama no se sirve.
    """
    # Por id de nodo la respuesta es directa y no hace falta barrer nada.
    if node_id:
        cursor.execute(
            "SELECT model_urn FROM file_nodes WHERE id = %s", (str(node_id),)
        )
        fila = cursor.fetchone()
        if fila:
            return fila[0], None, 'file_nodes'
        return None, None, ''

    urn = str(gcs_urn or '')
    if not urn:
        return None, None, ''

    guardado = _cache_duenos.get(urn)
    if guardado:
        return guardado

    ramas = [sql for (tabla, sql, _p) in _FUENTES if tabla in _tablas(cursor)]
    if not ramas:
        return None, None, ''

    consulta = (
        "SELECT ambito, obra_id, origen FROM (\n"
        + "\n            UNION ALL\n".join(ramas)
        + "\n) AS duenos ORDER BY prio LIMIT 1"
    )
    cursor.execute(consulta, {'urn': urn})
    fila = cursor.fetchone()
    if not fila:
        return None, None, ''

    resultado = (fila[0], fila[1], fila[2])
    if len(_cache_duenos) >= _CACHE_MAX:
        _cache_duenos.clear()   # de golpe: es una cache de aciertos, no un LRU
    _cache_duenos[urn] = resultado
    return resultado


def acceso_por_obra_id(cursor, user, obra_id):
    """Membresia directa por id de obra, para los duenos que no guardan model_urn."""
    if not obra_id:
        return False
    if isinstance(user, dict):
        if user.get('role') == 'admin':
            return True
        user_id = user.get('id')
    else:
        user_id = user
    if not user_id:
        return False  # FAIL-CLOSED
    cursor.execute(
        "SELECT 1 FROM project_users WHERE user_id = %s AND project_id = %s LIMIT 1",
        (user_id, obra_id),
    )
    return cursor.fetchone() is not None
