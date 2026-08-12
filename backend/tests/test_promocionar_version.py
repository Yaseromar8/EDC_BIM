"""Promocionar una version antigua es cambiar el contenido del documento.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
Subir una version nueva estaba bien resuelto: devolvia el documento a WIP, le
quitaba la idoneidad y la revision, y dejaba dicho por que. Promocionar una
version antigua hacia lo mismo por dentro -cambiar los bytes del documento- y
no tocaba nada de eso.

Resultado: un plano PUBLICADO con «A1 / C01» grabado seguia diciendo PUBLICADO
y «A1 / C01» cuando su contenido ya era el de otra version. Es el escenario
exacto que el comentario de create_file_record dice querer evitar, entrando por
la puerta de al lado.

Y no se quedaba ahi. Los tres modulos de Entregas (revisiones, transmittals,
conjuntos) apuntan al DOCUMENTO y no a la VERSION, asi que una promocion
silenciosa envenenaba a los tres a la vez: el transmittal seguia diciendo «V3»,
el conjunto seguia diciendo «V3 congelada», y la revision aprobada apuntaba a un
contenido cambiado sin enterarse.

Estaba limitado a administradores. Los cinco usuarios de la obra son
administradores.
"""
import json

import pytest

import bloqueo_de_edicion as bloq
import estados_ecd as ecd
import file_system_db as fs


OBRA = 'urn:adsk.obra:PQT8'
DOC = 'nodo-1'
V_VIEJA = 'ver-2'

ANA = 'ana@contratista.pe'
LUIS = 'luis@contratista.pe'


class Cursor:
    """Habla lo justo para que promote_version haga su recorrido."""

    def __init__(self, estado='PUBLISHED', reservado_por=None, obra=OBRA,
                 existe_nodo=True, version_es_suya=True):
        self.estado, self.reservado_por, self.obra = estado, reservado_por, obra
        self.existe_nodo, self.version_es_suya = existe_nodo, version_es_suya
        self.sql = []
        self._ultima = None

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.sql.append((s, params))
        su = s.upper()
        if su.startswith('SELECT VERSION_NUMBER, STATUS, NAME, MODEL_URN'):
            self._ultima = (3, self.estado, 'PQT8-DRE-PLA-001.pdf', self.obra) \
                if self.existe_nodo else None
        elif su.startswith('SELECT BLOQUEADO_POR, BLOQUEADO_EN'):
            self._ultima = (self.reservado_por, None)
        elif su.startswith('SELECT GCS_URN, SIZE_BYTES, MIME_TYPE, METADATA, VERSION_NUMBER'):
            self._ultima = ('gcs/abc-de-la-v2', 1024, 'application/pdf', None, 2) \
                if self.version_es_suya else None
        elif su.startswith('INSERT INTO FILE_VERSIONS'):
            self._ultima = ('ver-nueva',)
        else:
            self._ultima = None

    def fetchone(self):
        return self._ultima

    # ── ayudas de lectura ──
    def de(self, trozo):
        return [(s, p) for s, p in self.sql if trozo.upper() in s.upper()]

    @property
    def update_del_nodo(self):
        u = self.de('UPDATE file_nodes SET version_number')
        return u[0] if u else None

    @property
    def auditoria(self):
        a = self.de('INSERT INTO activity_log')
        return json.loads(a[0][1][-1]) if a else None


class Conn:
    def __init__(self, cursor):
        self._c, self.comiteado = cursor, False

    def cursor(self):
        return self._c

    def commit(self):
        self.comiteado = True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def promover(monkeypatch):
    """Devuelve (llamar, cursor) para promocionar sin tocar Postgres."""
    def montar(**kw):
        cur = Cursor(**kw)
        monkeypatch.setattr(fs, 'get_db_connection', lambda: Conn(cur))

        def llamar(model_urn=OBRA, node_id=DOC, version_id=V_VIEJA, quien=ANA):
            return fs.promote_version(model_urn, node_id, version_id, performed_by=quien)
        return llamar, cur
    return montar


# ── Lo esencial: promocionar retira la aprobacion ───────────────────────────

def test_el_documento_vuelve_a_borrador(promover):
    llamar, cur = promover(estado='PUBLISHED')
    assert llamar() is True
    assert ecd.WIP in cur.update_del_nodo[1]


def test_se_le_cae_la_idoneidad_y_la_revision(promover):
    """Son de la EMISION, no del fichero: lo que se autorizo fue otro contenido."""
    llamar, cur = promover(estado='PUBLISHED')
    llamar()
    sql = cur.update_del_nodo[0]
    assert 'codigo_idoneidad = NULL' in sql
    assert 'codigo_revision = NULL' in sql


def test_un_publicado_no_puede_seguir_publicado_con_contenido_nuevo(promover):
    """El caso entero, dicho de una vez."""
    llamar, cur = promover(estado='PUBLISHED')
    llamar()
    parametros = cur.update_del_nodo[1]
    assert ecd.PUBLISHED not in parametros
    assert ecd.WIP in parametros


# ── El rastro ───────────────────────────────────────────────────────────────

def test_queda_dicho_que_esta_promocion_retiro_la_aprobacion(promover):
    llamar, cur = promover(estado='PUBLISHED')
    llamar()
    d = cur.auditoria
    assert d['estado_anterior'] == ecd.PUBLISHED
    assert d['estado_nuevo'] == ecd.WIP
    assert 'promocion' in d['motivo'].lower()


def test_el_motivo_dice_que_version_se_promociono_y_como_cual(promover):
    """Un auditor pregunta 'que paso aqui', no 'cambio el estado'."""
    llamar, cur = promover(estado='SHARED')
    llamar()
    assert 'versión 2' in cur.auditoria['motivo']
    assert '4' in cur.auditoria['motivo']   # 3 + 1


def test_lo_que_ya_estaba_en_borrador_no_ensucia_la_auditoria(promover):
    """No se retiro ninguna aprobacion: no hay nada que contar."""
    llamar, cur = promover(estado='WIP')
    llamar()
    assert cur.auditoria is None


# ── La reserva de edicion ───────────────────────────────────────────────────

def test_no_se_promociona_lo_que_otro_tiene_reservado(promover):
    """Cambiarle el contenido por debajo a quien esta editando es justo lo que
    la reserva existe para impedir."""
    llamar, cur = promover(reservado_por=ANA)
    with pytest.raises(bloq.DocumentoReservado):
        llamar(quien=LUIS)
    assert cur.update_del_nodo is None


def test_quien_la_tiene_si_puede_promocionar(promover):
    llamar, cur = promover(reservado_por=ANA)
    assert llamar(quien=ANA) is True


def test_la_reserva_se_mira_ANTES_de_crear_la_version(promover):
    """Si se mirara despues, quedaria una version huerfana por cada intento."""
    llamar, cur = promover(reservado_por=ANA)
    with pytest.raises(bloq.DocumentoReservado):
        llamar(quien=LUIS)
    assert cur.de('INSERT INTO file_versions') == []


# ── La obra la decide el documento, no el cliente ───────────────────────────

def test_no_se_promociona_un_documento_de_otra_obra(promover):
    """El model_urn llega en el cuerpo de la peticion: no puede mandar el."""
    llamar, cur = promover(obra='urn:adsk.obra:OTRA')
    assert llamar(model_urn=OBRA) is False
    assert cur.update_del_nodo is None


def test_la_auditoria_se_escribe_contra_la_obra_de_verdad(promover):
    llamar, cur = promover(estado='PUBLISHED', obra=OBRA)
    llamar(model_urn=OBRA)
    assert cur.de('INSERT INTO activity_log')[0][1][0] == OBRA


# ── Lo que ya funcionaba, que siga funcionando ──────────────────────────────

def test_la_version_nueva_lleva_el_contenido_de_la_vieja(promover):
    llamar, cur = promover()
    llamar()
    insert = cur.de('INSERT INTO file_versions')[0]
    assert 'gcs/abc-de-la-v2' in insert[1]
    assert 4 in insert[1]          # numero de version nuevo: 3 + 1


def test_el_documento_apunta_a_la_version_recien_creada(promover):
    llamar, cur = promover()
    llamar()
    assert 'ver-nueva' in cur.update_del_nodo[1]


def test_una_version_que_no_es_de_ese_documento_no_se_promociona(promover):
    llamar, cur = promover(version_es_suya=False)
    assert llamar() is False
    assert cur.update_del_nodo is None


def test_un_documento_que_no_existe_no_revienta(promover):
    llamar, cur = promover(existe_nodo=False)
    assert llamar() is False


def test_no_se_promociona_nada_de_la_papelera(promover):
    """El SELECT del documento tiene que filtrar los borrados."""
    llamar, cur = promover()
    llamar()
    assert 'is_deleted' in cur.de('SELECT version_number, status')[0][0]


def test_el_que_promociona_queda_como_quien_actualizo(promover):
    """Antes se escribia en created_by y se perdia quien creo el documento."""
    llamar, cur = promover()
    llamar(quien=LUIS)
    assert 'updated_by' in cur.update_del_nodo[0]
    assert LUIS in cur.update_del_nodo[1]
