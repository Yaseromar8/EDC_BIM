"""La convención de nombres de cada obra, y a qué ficheros se le aplica.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
Había un único patrón escrito a mano en el código —siete campos y correlativo de
4 a 6 dígitos— aplicado a TODO lo que se subiera. Medido contra la base real de
la obra: de 2.831 ficheros lo cumplían DOS. Los otros 2.829 estaban en cuarentena.

Y al mirar qué eran: el 94,5% son fotos de campo llegadas por WhatsApp. A una
foto de una zanja no se le puede exigir la nomenclatura de un plano — no es un
entregable, es evidencia. Una regla que rechaza al 99,9% no es una regla: es
ruido, y deja la cuarentena sin servir para lo único que sirve, que es ver de un
vistazo lo que hay que corregir.

Tras calibrarla, la cuarentena de esa obra pasa de 2.829 a 73 documentos reales.
"""
import pytest

import nomenclatura as nom


POR_DEFECTO = {'patron': nom.PATRON_POR_DEFECTO,
               'exentas': nom.EXENTAS_POR_DEFECTO,
               'modo': nom.AVISO}


# ── Lo esencial: a una foto no se le aplica la regla de los planos ──────────

def test_una_foto_de_campo_no_se_juzga_con_la_regla_de_los_planos():
    """None no es 'mal nombrada': es 'esta regla no le corresponde'."""
    for foto in ('IMG-20260420-WA0031.jpg',
                 'WhatsApp Image 2026-07-02 at 11.08.13 AM.jpeg',
                 'VID-20260101-WA0002.mp4',
                 'foto de la zanja.HEIC'):
        assert nom.evaluar(POR_DEFECTO, foto) is None, foto


def test_un_documento_si_se_juzga():
    """Lo que sí es un entregable tiene que cumplir la convención."""
    assert nom.evaluar(POR_DEFECTO, '500125-SCL-OT-GEN-RFI-023.pdf') is False
    assert nom.evaluar(POR_DEFECTO, '100005-CSRC001-000-XX-MD-PL-000001.rvt') is True


def test_el_correlativo_tiene_que_ser_numerico():
    """Un caso real de la obra: siete campos pero el último es 'C02'."""
    assert nom.evaluar(POR_DEFECTO, '500125-CSSP001-740-XX-DR-HD-004142-C02.dwg') is False


def test_la_extension_no_distingue_mayusculas():
    assert nom.evaluar(POR_DEFECTO, 'foto.JPG') is None
    assert nom.evaluar(POR_DEFECTO, 'foto.JpEg') is None


def test_un_fichero_sin_extension_se_evalua():
    assert nom.evaluar(POR_DEFECTO, 'PRJ-ORG-VOL-LVL-TYP-RL-0001') is True


def test_sin_nombre_no_se_evalua_nada():
    assert nom.evaluar(POR_DEFECTO, '') is None
    assert nom.evaluar(POR_DEFECTO, None) is None


# ── El patrón es de la obra ─────────────────────────────────────────────────

def test_una_obra_puede_usar_SU_convencion():
    """La real de este proyecto: seis campos y correlativo de tres dígitos."""
    suyo = {'patron': r"^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[0-9]{3}$",
            'exentas': nom.EXENTAS_POR_DEFECTO, 'modo': nom.AVISO}
    assert nom.evaluar(suyo, '500125-SCL-OT-GEN-RFI-023.pdf') is True
    # Y con el patrón de partida, el mismo fichero no pasaba:
    assert nom.evaluar(POR_DEFECTO, '500125-SCL-OT-GEN-RFI-023.pdf') is False


def test_una_obra_puede_eximir_mas_tipos():
    cfg = dict(POR_DEFECTO, exentas=['jpg', 'xlsx'])
    assert nom.evaluar(cfg, 'metrados.xlsx') is None
    assert nom.evaluar(cfg, 'plano.dwg') is False   # dwg ya no está exento


def test_la_exencion_admite_el_punto_delante():
    cfg = dict(POR_DEFECTO, exentas=['.pdf'])
    assert nom.evaluar(cfg, 'lo-que-sea.pdf') is None


# ── Un control no puede apagarse solo y en silencio ─────────────────────────

def test_un_patron_roto_deja_sin_evaluar_pero_no_revienta():
    """Si el patrón está mal escrito no podemos decir que el nombre está mal:
    no lo sabemos. Se avisa en el log y se deja sin evaluar."""
    cfg = dict(POR_DEFECTO, patron='([sin cerrar')
    assert nom.evaluar(cfg, 'PLANO-01.pdf') is None


def test_un_patron_roto_no_se_puede_guardar():
    """Mejor que ni llegue a la base: reventaría en cada subida."""
    class CursorFalso:
        def __init__(self): self._u = [(nom.PATRON_POR_DEFECTO, [], nom.AVISO)]
        def execute(self, sql, params=None): pass
        def fetchone(self): return self._u[0]

    with pytest.raises(ValueError):
        nom.guardar_config(CursorFalso(), 'obra/X', patron='([sin cerrar')


def test_un_modo_inventado_no_se_puede_guardar():
    class CursorFalso:
        def __init__(self): self._u = [(nom.PATRON_POR_DEFECTO, [], nom.AVISO)]
        def execute(self, sql, params=None): pass
        def fetchone(self): return self._u[0]

    with pytest.raises(ValueError):
        nom.guardar_config(CursorFalso(), 'obra/X', modo='estrictisimo')


# ── Los valores de partida ──────────────────────────────────────────────────

def test_se_arranca_en_modo_aviso():
    """Encender el estricto sobre un ECD sin calibrar deja el portal vacío."""
    assert POR_DEFECTO['modo'] == nom.AVISO


def test_las_exentas_cubren_lo_que_llega_de_campo():
    for ext in ('jpg', 'jpeg', 'png', 'heic', 'mp4', 'mov'):
        assert ext in nom.EXENTAS_POR_DEFECTO


def test_los_planos_y_modelos_NO_estan_exentos():
    """Son entregables: ahí la convención sí tiene que aplicarse."""
    for ext in ('pdf', 'dwg', 'rvt', 'ifc', 'docx'):
        assert ext not in nom.EXENTAS_POR_DEFECTO


# ── Cambiar la convencion tiene que recalcular lo ya marcado ────────────────
#
# EL FALLO QUE ESTOS TESTS FIJAN
# ------------------------------
# guardar_config escribia el patron nuevo y dejaba intacta la marca
# nomenclatura_ok de cada fichero, calculada con el patron VIEJO. El 12-ago-2026,
# al calibrar PQT8_TALARA con su MIDP, la Sala de Cuarentena siguio senalando 51
# de 52 documentos como mal nombrados cuando ya cumplian. Es la pantalla que se
# ensena para demostrar que hay control: mintiendo, hace justo lo contrario.

class _CursorRecalculo:
    """Cursor de mentira que guarda lo que se escribe, para poder comprobarlo."""

    def __init__(self, ficheros):
        # ficheros: [(id, nombre, marca_actual)]
        self.ficheros = ficheros
        self.escrituras = []          # [(veredicto, [ids])]
        self._ultima = []

    def execute(self, sql, params=None):
        if 'SELECT id, name, nomenclatura_ok' in sql:
            self._ultima = self.ficheros
        elif 'UPDATE file_nodes SET nomenclatura_ok' in sql:
            self.escrituras.append((params[0], list(params[1])))
            self._ultima = []
        else:
            self._ultima = []

    def fetchall(self):
        return self._ultima or []

    def fetchone(self):
        return self._ultima[0] if self._ultima else None


def test_recalcular_corrige_las_marcas_viejas():
    cfg = {'patron': r'^BUENO-\d+$', 'exentas': ['jpg'], 'modo': 'aviso'}
    # los tres estaban marcados como NO conformes con el patron anterior
    ficheros = [('id1', 'BUENO-001.pdf', False),
                ('id2', 'BUENO-002.pdf', False),
                ('id3', 'CUALQUIERCOSA.pdf', False),
                ('id4', 'foto.jpg', False)]
    cur = _CursorRecalculo(ficheros)
    cambiadas = nom.recalcular_obra(cur, 'obra', cfg)

    escrito = {v: ids for v, ids in cur.escrituras}
    assert sorted(escrito[True]) == ['id1', 'id2']   # ahora si cumplen
    assert escrito[False] == ['id3']                 # este sigue mal, y es cierto
    assert escrito[None] == ['id4']                  # exento por extension
    assert cambiadas == 3                            # id3 ya estaba en False


def test_recalcular_no_toca_nada_si_ya_estaba_bien():
    cfg = {'patron': r'^BUENO-\d+$', 'exentas': [], 'modo': 'aviso'}
    cur = _CursorRecalculo([('id1', 'BUENO-001.pdf', True),
                            ('id2', 'MALO.pdf', False)])
    assert nom.recalcular_obra(cur, 'obra', cfg) == 0


def test_recalcular_escribe_en_bloque_y_no_uno_por_fichero():
    """Con 2.824 documentos, un UPDATE por cada uno son 2.824 viajes a la base."""
    cfg = {'patron': r'^BUENO-\d+$', 'exentas': [], 'modo': 'aviso'}
    muchos = [(f'id{i}', f'BUENO-{i:03d}.pdf', False) for i in range(500)]
    cur = _CursorRecalculo(muchos)
    nom.recalcular_obra(cur, 'obra', cfg)
    assert len(cur.escrituras) <= 3, 'debe escribir por cubos, no por fichero'
