"""Quién pidió cada documento y cuándo.

EL HUECO QUE ESTOS TESTS FIJAN
------------------------------
No había ni una fila que dijera que alguien se había llevado un plano. Es la
primera pregunta de una supervisión y la que casi nunca está registrada.

Y hay una honestidad que estos tests protegen: lo que la plataforma entrega es
una URL firmada del almacenamiento, y los bytes viajan después contra Google sin
volver a pasar por el backend. Así que se registra "se entregó el acceso", no
"completó la descarga". Por eso la acción se llama 'acceso_a_documento'.
"""
import pytest

import registro_de_descargas as reg


class ConexionFalsa:
    def __init__(self, nombre='PLANO-01.pdf'):
        self.nombre = nombre
        self.insertados = []
        self._ultima = []

    # -- protocolo de gestor de contexto --
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def cursor(self):
        return self

    def commit(self):
        pass

    # -- cursor --
    def execute(self, sql, params=None):
        if 'INSERT INTO activity_log' in sql:
            self.insertados.append(params)
            self._ultima = []
        else:
            # (id, nombre, obra): de la misma consulta salen las tres cosas.
            self._ultima = [('doc-1', self.nombre, 'obra/X')] if self.nombre else []

    def fetchone(self):
        return self._ultima[0] if self._ultima else None


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    reg.olvidar()
    yield
    reg.olvidar()


def _con(monkeypatch, conexion):
    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: conexion)
    return conexion


USUARIO = {'id': 7, 'email': 'ana@contratista.pe', 'role': 'user'}


def test_se_registra_quien_pidio_el_documento(monkeypatch):
    c = _con(monkeypatch, ConexionFalsa())
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1') is True
    assert len(c.insertados) == 1
    fila = c.insertados[0]
    assert 'ana@contratista.pe' in fila
    assert 'acceso_a_documento' in fila


def test_el_administrador_tambien_queda_registrado(monkeypatch):
    """Un registro que se salta a quien más puede no responde 'quién tuvo acceso'."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar({'id': 2, 'email': 'jefe@obra.pe', 'role': 'admin'}, 'obra/X', 'sesión', node_id='n1')
    assert 'jefe@obra.pe' in c.insertados[0]


def test_no_dice_descarga_porque_no_puede_saberlo(monkeypatch):
    """Los bytes viajan contra el almacenamiento: afirmar 'se lo descargó' sería
    mentir. Se afirma lo que sí consta: que se entregó el acceso."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1')
    fila = c.insertados[0]
    assert 'acceso_a_documento' in fila
    assert 'descarga' not in str(fila[1])


def test_guarda_la_via_y_la_ip(monkeypatch):
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, 'obra/X', 'enlace firmado', node_id='n1', ip='190.1.2.3')
    detalle = c.insertados[0][-1]
    assert 'enlace firmado' in detalle
    assert '190.1.2.3' in detalle


def test_un_acceso_por_enlace_firmado_se_registra_sin_persona(monkeypatch):
    """El permiso se emitió a alguien, pero quien lo usa no se identifica: eso es
    justo lo que hay que poder ver."""
    c = _con(monkeypatch, ConexionFalsa())
    assert reg.registrar(None, 'obra/X', 'enlace firmado', node_id='n1') is True
    assert c.insertados[0][5] is None


# ── El freno: sin él el registro deja de leerse ─────────────────────────────

def test_hojear_un_pdf_no_escribe_veinte_lineas(monkeypatch):
    """Un lector de PDF pide el mismo fichero por trozos."""
    c = _con(monkeypatch, ConexionFalsa())
    for _ in range(20):
        reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1')
    assert len(c.insertados) == 1


def test_pasada_la_ventana_vuelve_a_registrarse(monkeypatch):
    """Volver a por el mismo plano por la tarde es un acceso distinto."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1000)
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1000 + reg.VENTANA + 1)
    assert len(c.insertados) == 2


def test_el_freno_es_por_persona(monkeypatch):
    """Que uno abra el plano no puede tapar que lo abra otro."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1000)
    reg.registrar({'id': 9, 'email': 'otro@obra.pe'}, 'obra/X', 'sesión', node_id='n1', ahora=1000)
    assert len(c.insertados) == 2


def test_el_freno_es_por_documento(monkeypatch):
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1000)
    reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n2', ahora=1000)
    assert len(c.insertados) == 2


def test_el_freno_esta_acotado(monkeypatch):
    _con(monkeypatch, ConexionFalsa())
    for i in range(reg._ANOTADOS_MAX + 50):
        reg.registrar(USUARIO, 'obra/X', 'sesión', node_id=f'n{i}')
    assert len(reg._anotados) <= reg._ANOTADOS_MAX


# ── Lo que NO se registra ───────────────────────────────────────────────────

def test_las_miniaturas_de_fotos_no_ensucian_el_historial(monkeypatch):
    """Las fotos de campo entran por la misma ruta. Mil líneas de miniaturas
    taparían la única línea que importa."""
    c = _con(monkeypatch, ConexionFalsa(nombre=None))   # no está en el árbol
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', gcs_urn='urn-foto') is False
    assert c.insertados == []


# ── Nunca puede dejar a nadie sin abrir un plano ────────────────────────────

def test_si_el_registro_falla_no_revienta_al_llamante(monkeypatch):
    class ConexionRota(ConexionFalsa):
        def execute(self, sql, params=None):
            raise RuntimeError('base caída')

    _con(monkeypatch, ConexionRota())
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1') is False


# ── Lo que el ataque encontró: el filtro no filtraba ────────────────────────

def test_una_foto_del_arbol_TAMPOCO_se_registra(monkeypatch):
    """El razonamiento original estaba mal. Se supuso que las fotos vivían solo
    en photo_evidences y quedaban fuera solas; pero en esta obra las fotos de
    WhatsApp SÍ están en file_nodes (2.676 de 2.831), así que el filtro no
    filtraba nada y el historial se habría llenado de miniaturas."""
    c = _con(monkeypatch, ConexionFalsa(nombre='IMG-20260420-WA0031.jpg'))
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1') is False
    assert c.insertados == []


def test_un_video_de_obra_tampoco(monkeypatch):
    c = _con(monkeypatch, ConexionFalsa(nombre='VID-20260101-WA0002.mp4'))
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1') is False


def test_un_plano_si(monkeypatch):
    c = _con(monkeypatch, ConexionFalsa(nombre='500125-SCL-OT-GEN-RFI-023.pdf'))
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1') is True


def test_la_fila_lleva_el_id_del_documento(monkeypatch):
    """Se escribía con entity_id vacío, así que el expediente del documento
    —que busca por id— no encontraba ni uno de sus accesos."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, None, 'sesión', gcs_urn='urn-de-un-plano')
    assert c.insertados[0][3] == 'doc-1'


def test_la_fila_lleva_la_obra_del_documento(monkeypatch):
    """Se escribía 'global' en tres de los cuatro caminos, así que el acceso no
    salía en el historial de la obra, que es donde se le busca."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(USUARIO, None, 'sesión', node_id='n1')
    assert c.insertados[0][0] == 'obra/X'


def test_dos_enlaces_firmados_distintos_se_registran_los_dos(monkeypatch):
    """Sin discriminante compartían clave de freno y la segunda persona no
    quedaba registrada: el freno tapaba justo lo que hay que ver."""
    c = _con(monkeypatch, ConexionFalsa())
    reg.registrar(None, 'obra/X', 'enlace firmado', node_id='n1', ahora=1000, discriminante='aaa')
    reg.registrar(None, 'obra/X', 'enlace firmado', node_id='n1', ahora=1000, discriminante='bbb')
    assert len(c.insertados) == 2


def test_si_falla_la_escritura_NO_se_silencian_los_5_minutos(monkeypatch):
    """Marcar el freno antes de escribir perdía el acceso Y además tapaba el
    hueco: el peor de los dos mundos."""
    class ConexionIntermitente(ConexionFalsa):
        def __init__(self):
            super().__init__()
            self.fallar = True

        def execute(self, sql, params=None):
            if 'INSERT INTO activity_log' in sql and self.fallar:
                self.fallar = False
                raise RuntimeError('base caída un momento')
            super().execute(sql, params)

    c = _con(monkeypatch, ConexionIntermitente())
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1000) is False
    assert reg.registrar(USUARIO, 'obra/X', 'sesión', node_id='n1', ahora=1001) is True
