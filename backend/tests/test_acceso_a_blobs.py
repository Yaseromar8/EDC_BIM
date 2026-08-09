"""De quien es cada objeto del almacenamiento, y quien puede por tanto leerlo.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
Las rutas que sirven bytes resolvian la obra duena mirando SOLO file_nodes, y
cuando ahi no aparecia el objeto, PERMITIAN:

    if obra_real is None:
        return None   # "no esta en el arbol: no hay obra que proteger"

Pero file_nodes solo guarda la clave de la version VIGENTE. Al subir la V2, la
clave de la V1 sale de file_nodes y se queda solo en file_versions. Es decir: las
versiones anteriores de todos los documentos de todas las obras eran descargables
por cualquiera con una sesion valida. En la base real habia 5 objetos en esa
situacion cuando se descubrio.

Lo que no se podia hacer era denegar sin mas cuando file_nodes no lo reconoce: las
fotos de campo de la APK y los adjuntos de los puntos de control tampoco viven en
file_nodes y se sirven por la misma ruta. Denegar a lo bruto = equipo en obra sin
fotos.
"""
import pytest

import acceso_a_blobs


class CursorFalso:
    """Cursor de mentira que responde lo que se le diga y apunta lo que le piden."""

    def __init__(self, tablas=None, respuesta=None):
        self.tablas = tablas if tablas is not None else {
            'file_nodes', 'file_versions', 'photo_evidences',
            'control_pins', 'lob_dataset_sources', 'upload_sessions',
        }
        self.respuesta = respuesta
        self.consultas = []
        self._ultima = None

    def execute(self, sql, params=None):
        self.consultas.append((sql, params))
        if 'information_schema.tables' in sql:
            self._ultima = [(t,) for t in sorted(self.tablas)]
        elif callable(self.respuesta):
            self._ultima = self.respuesta(sql, params)
        else:
            self._ultima = [self.respuesta] if self.respuesta else []

    def fetchall(self):
        return self._ultima or []

    def fetchone(self):
        filas = self._ultima or []
        return filas[0] if filas else None


@pytest.fixture(autouse=True)
def limpio():
    """Cada test parte sin cache y sin censo de tablas."""
    acceso_a_blobs.olvidar_tablas()
    acceso_a_blobs.olvidar_duenos()
    yield
    acceso_a_blobs.olvidar_tablas()
    acceso_a_blobs.olvidar_duenos()


# ── Lo esencial: un objeto que nadie reclama NO se sirve ────────────────────

def test_objeto_que_nadie_reclama_se_deniega():
    """Es el fallo original al reves: antes esto devolvia 'adelante'."""
    cur = CursorFalso(respuesta=None)
    ambito, obra_id, origen = acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-inventado')
    assert origen == '', "un objeto sin dueno tiene que quedar sin origen para que la ruta deniegue"
    assert ambito is None


def test_una_version_antigua_conserva_la_obra_de_su_documento():
    """El agujero concreto: la V1 sale de file_nodes al subir la V2."""
    cur = CursorFalso(respuesta=('proyectos/PQT8_TALARA', None, 'file_versions'))
    ambito, _obra, origen = acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-de-la-v1')
    assert ambito == 'proyectos/PQT8_TALARA'
    assert origen == 'file_versions'


def test_pregunta_a_todas_las_tablas_que_pueden_poseer_el_objeto():
    """Si manana alguien quita una rama del UNION, que se entere aqui."""
    cur = CursorFalso(respuesta=None)
    acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-x')
    consulta = cur.consultas[-1][0]
    for tabla in ('file_nodes', 'file_versions', 'photo_evidences',
                  'control_pins', 'lob_dataset_sources', 'upload_sessions'):
        assert tabla in consulta, f"{tabla} puede poseer bytes y no se esta consultando"


def test_una_foto_de_campo_no_se_queda_fuera():
    """Las fotos de la APK viven en photo_evidences, no en file_nodes."""
    cur = CursorFalso(respuesta=('proyectos/PQT8_TALARA', '1', 'photo_evidences'))
    ambito, obra_id, origen = acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-foto')
    assert origen == 'photo_evidences'
    assert ambito == 'proyectos/PQT8_TALARA'


def test_una_subida_en_curso_no_deja_al_que_sube_sin_su_fichero():
    """Ventana de carrera: el objeto ya esta escrito, la fila de file_nodes aun no."""
    cur = CursorFalso(respuesta=('proyectos/PQT8_TALARA', None, 'upload_sessions'))
    _ambito, _obra, origen = acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-subiendose')
    assert origen == 'upload_sessions'


def test_una_tabla_que_todavia_no_existe_no_tumba_la_consulta():
    """photo_evidences se crea al primer uso; consultarla antes aborta la transaccion."""
    cur = CursorFalso(tablas={'file_nodes', 'file_versions'}, respuesta=None)
    acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-x')
    consulta = cur.consultas[-1][0]
    assert 'photo_evidences' not in consulta
    assert 'file_versions' in consulta


def test_sin_urn_y_sin_id_se_deniega():
    cur = CursorFalso(respuesta=None)
    assert acceso_a_blobs.obra_del_blob(cur)[2] == ''
    assert acceso_a_blobs.obra_del_blob(cur, gcs_urn='')[2] == ''


def test_por_id_de_nodo_desconocido_tambien_se_deniega():
    cur = CursorFalso(respuesta=None)
    assert acceso_a_blobs.obra_del_blob(cur, node_id='no-existe')[2] == ''


# ── La cache no debe convertirse en un agujero ──────────────────────────────

def test_no_se_cachea_el_no_encontrado():
    """Un objeto recien subido puede no estar aun: si se cachea el 'no', queda
    denegado durante toda la vida del worker."""
    estado = {'llamadas': 0}

    def responder(sql, params):
        if 'information_schema' in sql:
            return None
        estado['llamadas'] += 1
        return [] if estado['llamadas'] == 1 else [('proyectos/X', None, 'file_nodes')]

    cur = CursorFalso(respuesta=responder)
    assert acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-tardio')[2] == ''
    assert acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-tardio')[2] == 'file_nodes'


def test_la_cache_ahorra_la_consulta_repetida():
    cur = CursorFalso(respuesta=('proyectos/X', None, 'file_nodes'))
    acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-foto-1')
    n = len(cur.consultas)
    for _ in range(20):
        acceso_a_blobs.obra_del_blob(cur, gcs_urn='urn-foto-1')
    assert len(cur.consultas) == n, "un album de 20 miniaturas no debe pagar 20 consultas"


def test_la_cache_esta_acotada():
    """Que no crezca sin limite en un worker de larga vida."""
    cur = CursorFalso(respuesta=('proyectos/X', None, 'file_nodes'))
    for i in range(acceso_a_blobs._CACHE_MAX + 10):
        acceso_a_blobs.obra_del_blob(cur, gcs_urn=f'urn-{i}')
    assert len(acceso_a_blobs._cache_duenos) <= acceso_a_blobs._CACHE_MAX


# ── Membresia por id de obra (los puntos de control no guardan model_urn) ───

def test_sin_identidad_no_hay_acceso_por_id_de_obra():
    cur = CursorFalso(respuesta=('algo',))
    assert acceso_a_blobs.acceso_por_obra_id(cur, None, '1') is False
    assert acceso_a_blobs.acceso_por_obra_id(cur, {'id': None}, '1') is False


def test_el_admin_entra_y_el_socio_solo_en_su_obra():
    con_membresia = CursorFalso(respuesta=(1,))
    sin_membresia = CursorFalso(respuesta=None)
    assert acceso_a_blobs.acceso_por_obra_id(con_membresia, {'role': 'admin'}, '1') is True
    assert acceso_a_blobs.acceso_por_obra_id(con_membresia, {'id': 7, 'role': 'user'}, '1') is True
    assert acceso_a_blobs.acceso_por_obra_id(sin_membresia, {'id': 7, 'role': 'user'}, '2') is False


def test_sin_obra_no_se_concede_nada():
    cur = CursorFalso(respuesta=(1,))
    assert acceso_a_blobs.acceso_por_obra_id(cur, {'role': 'admin'}, None) is False
