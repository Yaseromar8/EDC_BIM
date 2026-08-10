"""Reservar un documento mientras se edita, para que dos personas no se pisen.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
No había nada. Dos personas abrían el mismo Word, cada una editaba dos horas, y
la segunda que subía pisaba a la primera.

El matiz importa, porque cambia lo que hay que arreglar: el versionado NO pierde
el dato — la versión anterior sobrevive y se recupera. Lo que se pierde es el
TRABAJO de quien fue pisado, y el rato de averiguar cuál de las dos versiones
vale. Esa es la forma más común de que alguien deje de fiarse de una plataforma.
"""
from datetime import datetime, timedelta, timezone

import pytest

import bloqueo_de_edicion as bloq


ANA = {'id': 7, 'email': 'ana@contratista.pe', 'role': 'user'}
LUIS = {'id': 9, 'email': 'luis@contratista.pe', 'role': 'user'}
JEFE = {'id': 2, 'email': 'jefe@obra.pe', 'role': 'admin'}


class CursorFalso:
    def __init__(self, por=None, desde=None, nombre='PLANO-01.pdf', tipo='FILE'):
        self.por, self.desde, self.nombre, self.tipo = por, desde, nombre, tipo
        self.ejecutadas = []
        self._ultima = []

    def execute(self, sql, params=None):
        self.ejecutadas.append((' '.join(sql.split()), params))
        s = ' '.join(sql.split())
        if s.startswith('SELECT bloqueado_por, bloqueado_en'):
            self._ultima = [(self.por, self.desde)] if self.por else [(None, None)]
        elif s.startswith('SELECT name, node_type, bloqueado_por'):
            self._ultima = [(self.nombre, self.tipo, self.por)]
        elif s.startswith('SELECT name FROM file_nodes'):
            self._ultima = [(self.nombre,)]
        elif 'UPDATE file_nodes SET bloqueado_por = %s' in s:
            self.por = params[0]
            self._ultima = []
        elif 'bloqueado_por = NULL' in s:
            self.por = None
            self._ultima = []
        else:
            self._ultima = []

    def fetchone(self):
        return self._ultima[0] if self._ultima else None

    def sql_de(self, palabra):
        return [s for s, _p in self.ejecutadas if palabra in s]


# ── Lo esencial ─────────────────────────────────────────────────────────────

def test_reservar_deja_el_documento_a_nombre_de_quien_lo_pide():
    cur = CursorFalso()
    r = bloq.reservar(cur, 'obra/X', 'a1', ANA)
    assert r['bloqueado_por'] == 'ana@contratista.pe'


def test_otro_no_puede_subir_encima():
    """Es el caso entero: Luis no puede pisar lo que Ana está editando."""
    cur = CursorFalso(por='ana@contratista.pe')
    with pytest.raises(bloq.DocumentoReservado) as e:
        bloq.comprobar_libre(cur, 'a1', LUIS, 'subir una versión nueva')
    assert 'ana@contratista.pe' in e.value.motivo
    assert 'subir una versión nueva' in e.value.motivo


def test_quien_la_tiene_SI_puede_trabajar():
    """Reservar es para poder trabajar, no para bloquearse a uno mismo."""
    cur = CursorFalso(por='ana@contratista.pe')
    bloq.comprobar_libre(cur, 'a1', ANA)   # no debe lanzar


def test_un_documento_libre_no_estorba_a_nadie():
    cur = CursorFalso()
    bloq.comprobar_libre(cur, 'a1', LUIS)


def test_no_se_puede_reservar_lo_que_ya_tiene_otro():
    cur = CursorFalso(por='ana@contratista.pe')
    with pytest.raises(bloq.DocumentoReservado):
        bloq.reservar(cur, 'obra/X', 'a1', LUIS)


def test_reservar_dos_veces_lo_mismo_no_molesta():
    cur = CursorFalso(por='ana@contratista.pe')
    r = bloq.reservar(cur, 'obra/X', 'a1', ANA)
    assert r['bloqueado_por'] == 'ana@contratista.pe'


def test_las_carpetas_no_se_reservan():
    """Bloquear la carpeta daría falsa sensación de reserva sobre todo lo de dentro."""
    cur = CursorFalso(tipo='FOLDER', nombre='02_Compartido')
    with pytest.raises(bloq.DocumentoReservado) as e:
        bloq.reservar(cur, 'obra/X', 'c1', ANA)
    assert 'carpetas' in e.value.motivo.lower()


# ── Salir de un bloqueo olvidado: la pregunta que hunde estos sistemas ──────

def test_la_suelta_quien_la_tiene():
    cur = CursorFalso(por='ana@contratista.pe')
    r = bloq.liberar(cur, 'obra/X', 'a1', ANA)
    assert r['bloqueado_por'] is None
    assert cur.por is None


def test_otro_NO_puede_soltar_la_reserva_de_alguien():
    cur = CursorFalso(por='ana@contratista.pe', desde=datetime.now(timezone.utc))
    with pytest.raises(bloq.DocumentoReservado):
        bloq.liberar(cur, 'obra/X', 'a1', LUIS)
    assert cur.por == 'ana@contratista.pe'


def test_un_administrador_siempre_puede_soltarla():
    """Alguien reserva un viernes y se va de vacaciones: la obra no puede pararse."""
    cur = CursorFalso(por='ana@contratista.pe', desde=datetime.now(timezone.utc))
    r = bloq.liberar(cur, 'obra/X', 'a1', JEFE)
    assert r['era_de'] == 'ana@contratista.pe'
    assert cur.por is None


def test_una_reserva_vieja_la_puede_forzar_cualquiera():
    vieja = datetime.now(timezone.utc) - timedelta(days=bloq.DIAS_HASTA_OLVIDADO + 1)
    cur = CursorFalso(por='ana@contratista.pe', desde=vieja)
    r = bloq.liberar(cur, 'obra/X', 'a1', LUIS, forzar=True)
    assert cur.por is None
    assert r['era_de'] == 'ana@contratista.pe'


def test_una_reserva_reciente_NO_se_puede_forzar():
    cur = CursorFalso(por='ana@contratista.pe', desde=datetime.now(timezone.utc))
    with pytest.raises(bloq.DocumentoReservado):
        bloq.liberar(cur, 'obra/X', 'a1', LUIS, forzar=True)


def test_la_reserva_NO_caduca_sola():
    """Soltarla por detrás haría creer a quien la tenía que seguía en pie, y
    entonces la reserva no protegería de nada."""
    vieja = datetime.now(timezone.utc) - timedelta(days=90)
    cur = CursorFalso(por='ana@contratista.pe', desde=vieja)
    with pytest.raises(bloq.DocumentoReservado):
        bloq.comprobar_libre(cur, 'a1', LUIS)
    assert cur.por == 'ana@contratista.pe'


def test_al_usuario_se_le_avisa_de_que_puede_forzarla():
    vieja = datetime.now(timezone.utc) - timedelta(days=bloq.DIAS_HASTA_OLVIDADO + 2)
    cur = CursorFalso(por='ana@contratista.pe', desde=vieja)
    with pytest.raises(bloq.DocumentoReservado) as e:
        bloq.comprobar_libre(cur, 'a1', LUIS)
    assert 'forzar' in e.value.motivo


def test_soltar_algo_que_ya_estaba_libre_no_es_un_error():
    cur = CursorFalso()
    r = bloq.liberar(cur, 'obra/X', 'a1', ANA)
    assert r['ya_estaba_libre'] is True


# ── El rastro ───────────────────────────────────────────────────────────────

def test_reservar_y_soltar_quedan_registrados():
    cur = CursorFalso()
    bloq.reservar(cur, 'obra/X', 'a1', ANA)
    bloq.liberar(cur, 'obra/X', 'a1', ANA)
    assert len(cur.sql_de('INSERT INTO activity_log')) == 2


def test_quitarle_la_reserva_a_otro_deja_dicho_a_quien():
    """No es lo mismo soltar la tuya que quitársela a alguien, y es lo que se
    pregunta después."""
    cur = CursorFalso(por='ana@contratista.pe', desde=datetime.now(timezone.utc))
    bloq.liberar(cur, 'obra/X', 'a1', JEFE)
    inserts = [p for s, p in cur.ejecutadas if 'INSERT INTO activity_log' in s]
    assert 'reserva_retirada' in inserts[0]
    detalle = inserts[0][-1]
    assert 'ana@contratista.pe' in detalle
    assert 'jefe@obra.pe' in detalle


def test_sin_sesion_no_se_reserva_nada():
    cur = CursorFalso()
    with pytest.raises(bloq.DocumentoReservado):
        bloq.reservar(cur, 'obra/X', 'a1', None)


# ── Lo que la reserva NO hace ───────────────────────────────────────────────

def test_un_administrador_no_se_queda_fuera_de_su_obra():
    cur = CursorFalso(por='ana@contratista.pe')
    bloq.comprobar_libre(cur, 'a1', JEFE)   # no debe lanzar


def test_el_aviso_de_olvido_es_de_una_semana():
    """Si alguien lo sube a un mes, que se vea en la revisión del cambio."""
    assert bloq.DIAS_HASTA_OLVIDADO == 7
