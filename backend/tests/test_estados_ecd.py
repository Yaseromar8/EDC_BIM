"""Los estados del ECD y la unica puerta que los escribe.

EL FALLO QUE ESTOS TESTS FIJAN
------------------------------
La maquina de estados existia pero NADIE ENTRABA EN ELLA. Al subir un fichero se
le escribia 'ACTIVE' (o 'NON_CONFORMING'), la columna tenia DEFAULT 'DRAFT', y la
maquina solo entendia WIP/SHARED/PUBLISHED/ARCHIVED. Pulsar "pasar a Compartido"
devolvia 400 porque las transiciones validas de 'ACTIVE' eran el conjunto vacio.
Medido en la base real: 2.828 documentos en 'NON_CONFORMING', 194 en 'DRAFT',
3 en 'ACTIVE' y exactamente 1 que habia logrado llegar a 'SHARED'.

Y habia dos caminos hacia la misma columna con reglas distintas (el cambio por
lote validaba; la aprobacion de una revision hacia UPDATE directo), mas un tercero
accidental: renombrar escribia 'ACTIVE' encima y degradaba documentos aprobados.
"""
import pytest

import estados_ecd as ecd


# ── El vocabulario ──────────────────────────────────────────────────────────

def test_los_estados_heredados_se_leen_sin_romper_nada():
    """Una base sin migrar tiene que seguir siendo legible y operable."""
    assert ecd.normalizar('ACTIVE') == ecd.WIP
    assert ecd.normalizar('DRAFT') == ecd.WIP
    assert ecd.normalizar('NON_CONFORMING') == ecd.WIP
    assert ecd.normalizar(None) == ecd.WIP
    assert ecd.normalizar('') == ecd.WIP


def test_los_estados_propios_no_se_tocan():
    for e in ecd.ESTADOS:
        assert ecd.normalizar(e) == e


def test_un_estado_heredado_ya_no_bloquea_la_maquina():
    """Era el fallo entero: de 'ACTIVE' no se podia ir a ningun sitio."""
    permitida, motivo = ecd.transicion_permitida('ACTIVE', ecd.SHARED)
    assert permitida is True, motivo


def test_no_se_publica_sin_pasar_por_compartido():
    permitida, motivo = ecd.transicion_permitida(ecd.WIP, ecd.PUBLISHED)
    assert permitida is False
    assert 'Compartido' in motivo


def test_un_publicado_no_vuelve_a_borrador_de_golpe():
    assert ecd.transicion_permitida(ecd.PUBLISHED, ecd.WIP)[0] is False
    assert ecd.transicion_permitida(ecd.PUBLISHED, ecd.SHARED)[0] is True


def test_un_archivado_solo_se_recupera_publicandolo():
    assert ecd.transicion_permitida(ecd.ARCHIVED, ecd.PUBLISHED)[0] is True
    assert ecd.transicion_permitida(ecd.ARCHIVED, ecd.SHARED)[0] is False
    assert ecd.transicion_permitida(ecd.ARCHIVED, ecd.WIP)[0] is False


def test_un_estado_inventado_se_rechaza():
    assert ecd.transicion_permitida(ecd.WIP, 'APROBADISIMO')[0] is False


def test_los_motivos_estan_en_castellano_y_sin_jerga():
    """El mensaje se le ensena tal cual a gente de obra."""
    for (origen, destino) in ecd.MOTIVOS:
        _p, motivo = ecd.transicion_permitida(origen, destino)
        assert motivo
        for palabra in ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED', 'status', 'transition'):
            assert palabra not in motivo, f"jerga en el mensaje: {motivo}"


# ── La puerta ───────────────────────────────────────────────────────────────

class CursorFalso:
    def __init__(self, documentos):
        # documentos: [(id, nombre, estado_guardado)]
        self.documentos = documentos
        self.ejecutadas = []
        self._ultima = []

    def execute(self, sql, params=None):
        self.ejecutadas.append((' '.join(sql.split()), params))
        s = sql.upper()
        # El catalogo de idoneidad y el historial de revisiones los sirve el
        # modulo idoneidad; aqui solo hacen falta respuestas creibles.
        if 'FROM IDONEIDAD_CATALOGO' in s:
            import idoneidad as _idn
            self._ultima = [(c, e, f, True) for c, e, f in _idn.CATALOGO_POR_DEFECTO]
        elif 'CODIGO_REVISION FROM FILE_VERSIONS' in s:
            self._ultima = []
        elif sql.strip().upper().startswith('SELECT'):
            pedidos = set(params[0]) if params else set()
            self._ultima = [d for d in self.documentos if d[0] in pedidos]
        elif 'UPDATE file_nodes' in sql and 'status' in sql:
            # Aplicar el cambio de verdad: dentro de una transaccion, la consulta
            # siguiente ve lo que acaba de escribirse. Sin esto, un recorrido de
            # dos pasos leeria dos veces el estado de partida.
            nuevo, tocados = params[0], set(params[2])
            self.documentos = [
                (i, n, nuevo if i in tocados else s) for (i, n, s) in self.documentos
            ]
            self._ultima = []
        else:
            self._ultima = []

    def fetchall(self):
        return self._ultima

    def fetchone(self):
        return self._ultima[0] if self._ultima else None

    def sql_de(self, palabra):
        return [s for s, _p in self.ejecutadas if palabra in s]


USUARIO = {'id': 7, 'email': 'ana@contratista.pe', 'role': 'admin'}


def MANDA(_node_id):
    """Autorizador de prueba: dice que si a todo."""
    return True


def test_transicionar_escribe_el_estado_nuevo():
    cur = CursorFalso([('a1', 'PLANO-01.pdf', 'ACTIVE')])
    r = ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    assert r['cambiados'] == ['a1']
    assert cur.sql_de('UPDATE file_nodes')


def test_una_transicion_invalida_no_cambia_NADA_del_lote():
    """O pasan todos o no pasa ninguno: nada de lotes a medias."""
    cur = CursorFalso([
        ('a1', 'uno.pdf', ecd.SHARED),      # este si podria
        ('a2', 'dos.pdf', ecd.WIP),         # este no: WIP -> PUBLISHED
    ])
    with pytest.raises(ecd.TransicionRechazada) as e:
        ecd.transicionar(cur, 'obra/X', ['a1', 'a2'], ecd.PUBLISHED, USUARIO,
                         autorizar=MANDA, codigo_idoneidad='A1')
    assert 'dos.pdf' in e.value.motivo
    assert not cur.sql_de('UPDATE file_nodes')


def test_pedir_documentos_de_otra_obra_no_cambia_nada():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    with pytest.raises(ecd.TransicionRechazada):
        ecd.transicionar(cur, 'obra/X', ['a1', 'de-otra-obra'], ecd.SHARED, USUARIO)
    assert not cur.sql_de('UPDATE file_nodes')


def test_el_que_ya_esta_en_ese_estado_no_se_toca():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.SHARED)])
    r = ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    assert r['cambiados'] == [] and r['sin_cambio'] == ['a1']
    assert not cur.sql_de('UPDATE file_nodes')


# ── La auditoria: lo que se le ensena a un auditor ──────────────────────────

def test_se_registra_UNA_linea_POR_DOCUMENTO():
    """Antes se escribia '12 items -> PUBLISHED' y no se sabia cuales."""
    cur = CursorFalso([
        ('a1', 'PLANO-01.pdf', ecd.WIP),
        ('a2', 'PLANO-02.pdf', ecd.WIP),
        ('a3', 'PLANO-03.pdf', ecd.WIP),
    ])
    ecd.transicionar(cur, 'obra/X', ['a1', 'a2', 'a3'], ecd.SHARED, USUARIO)
    assert len(cur.sql_de('INSERT INTO activity_log')) == 3


def test_el_registro_guarda_de_donde_venia_cada_documento():
    """'quien saco este plano de publicado' tiene que poder contestarse."""
    cur = CursorFalso([('a1', 'PLANO-01.pdf', ecd.PUBLISHED)])
    ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    inserts = [p for s, p in cur.ejecutadas if 'INSERT INTO activity_log' in s]
    assert len(inserts) == 1
    # El detalle ya no es el ultimo parametro: detras van created_at y los dos
    # campos de la cadena de auditoria.
    detalle = [p for p in inserts[0] if isinstance(p, str) and 'estado_anterior' in p][0]
    assert '"estado_anterior": "PUBLISHED"' in detalle
    assert '"estado_nuevo": "SHARED"' in detalle
    assert 'PLANO-01.pdf' in inserts[0]


def test_el_cambio_de_estado_entra_en_la_cadena_de_auditoria():
    """Estas filas -- quien publico que plano -- son las mas probatorias del
    expediente, y eran justo las que se insertaban salteando el encadenado.
    Medido tras un recorrido ECD completo: 19 filas, 0 selladas."""
    cur = CursorFalso([('a1', 'PLANO-01.pdf', ecd.PUBLISHED)])
    ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    sql = [s for s, _p in cur.ejecutadas if 'INSERT INTO activity_log' in s][0]
    assert 'hash_anterior' in sql and 'hash' in sql, (
        'el INSERT del cambio de estado tiene que llevar los campos de la cadena')


def test_el_autor_sale_de_la_sesion_y_no_de_la_peticion():
    """Cualquiera con sesion podia firmar un cambio con el nombre de otro."""
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    inserts = [p for s, p in cur.ejecutadas if 'INSERT INTO activity_log' in s]
    assert 'ana@contratista.pe' in inserts[0]


def test_sin_identidad_no_se_inventa_un_autor():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, None)
    inserts = [p for s, p in cur.ejecutadas if 'INSERT INTO activity_log' in s]
    assert inserts[0][5] is None


def test_si_no_se_puede_dejar_constancia_no_se_hace_el_cambio():
    """Un ECD sin rastro de quien publico que no sirve para una auditoria."""
    class CursorQueNoRegistra(CursorFalso):
        def execute(self, sql, params=None):
            if 'INSERT INTO activity_log' in sql:
                raise RuntimeError('tabla de auditoria caida')
            super().execute(sql, params)

    cur = CursorQueNoRegistra([('a1', 'uno.pdf', ecd.WIP)])
    with pytest.raises(ecd.TransicionRechazada):
        ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)


# ── Detalles que se olvidan ─────────────────────────────────────────────────

def test_no_hace_commit_ni_abre_conexion():
    """Comparte transaccion con quien la llama: si el cambio se deshace, el
    registro se deshace con el."""
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    assert not hasattr(cur, 'commit')
    ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)  # no debe fallar


def test_lista_vacia_no_hace_nada():
    cur = CursorFalso([])
    r = ecd.transicionar(cur, 'obra/X', [], ecd.SHARED, USUARIO)
    assert r == {'cambiados': [], 'sin_cambio': [], 'emisiones': {}}
    assert cur.ejecutadas == []


def test_el_resultado_tiene_siempre_la_misma_forma():
    """Que quien llama no tenga que defenderse de dos formas del mismo resultado."""
    claves = {'cambiados', 'sin_cambio', 'emisiones'}
    sin_nada = CursorFalso([])
    ya_esta = CursorFalso([('a1', 'uno.pdf', ecd.SHARED)])
    cambia = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    assert set(ecd.transicionar(sin_nada, 'obra/X', [], ecd.SHARED, USUARIO)) == claves
    assert set(ecd.transicionar(ya_esta, 'obra/X', ['a1'], ecd.SHARED, USUARIO)) == claves
    assert set(ecd.transicionar(cambia, 'obra/X', ['a1'], ecd.SHARED, USUARIO)) == claves


def test_publicar_y_archivar_estan_marcados_como_actos_de_autoridad():
    assert ecd.REQUIEREN_AUTORIDAD == {ecd.PUBLISHED, ecd.ARCHIVED}


# ── El camino de la aprobacion de una revision ──────────────────────────────
# Revisar un borrador y aprobarlo como Publicado es el camino NORMAL de un ECD.
# Antes, la aprobacion hacia UPDATE directo y saltaba de Borrador a Publicado sin
# rastro. Ahora recorre la maquina paso a paso y cada salto queda registrado.

def test_de_borrador_a_publicado_se_pasa_por_compartido():
    assert ecd.camino_hasta(ecd.WIP, ecd.PUBLISHED) == [ecd.SHARED, ecd.PUBLISHED]


def test_un_estado_heredado_tambien_encuentra_camino():
    assert ecd.camino_hasta('ACTIVE', ecd.PUBLISHED) == [ecd.SHARED, ecd.PUBLISHED]


def test_si_ya_esta_en_el_destino_el_camino_esta_vacio():
    assert ecd.camino_hasta(ecd.SHARED, ecd.SHARED) == []


def test_un_destino_inventado_no_tiene_camino():
    assert ecd.camino_hasta(ecd.WIP, 'BENDECIDO') is None


def test_recorrer_registra_cada_salto_por_separado():
    """El historial tiene que poder contar Borrador->Compartido->Publicado."""
    cur = CursorFalso([('a1', 'PLANO-01.pdf', 'ACTIVE')])
    r = ecd.transicionar_recorriendo(cur, 'obra/X', ['a1'], ecd.PUBLISHED, USUARIO,
                                     autorizar=MANDA, codigo_idoneidad='A1')
    assert r['pasos'] == [ecd.SHARED, ecd.PUBLISHED]
    assert len(cur.sql_de('INSERT INTO activity_log')) == 2


# ── Publicar exige comprobar autoridad. Sin excepciones ─────────────────────
# En este mismo proyecto ya hubo un @requiere_rol('admin') que no bloqueaba nada
# y daba sensacion de guardia. Declarar REQUIEREN_AUTORIDAD y no usarlo seria
# exactamente el mismo fallo.

def test_publicar_sin_forma_de_comprobar_autoridad_se_rechaza():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.SHARED)])
    with pytest.raises(ecd.TransicionRechazada) as e:
        ecd.transicionar(cur, 'obra/X', ['a1'], ecd.PUBLISHED, USUARIO)  # sin autorizar
    assert 'autoridad' in e.value.motivo
    assert not cur.sql_de('UPDATE file_nodes')


def test_archivar_tambien_exige_comprobarla():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.PUBLISHED)])
    with pytest.raises(ecd.TransicionRechazada):
        ecd.transicionar(cur, 'obra/X', ['a1'], ecd.ARCHIVED, USUARIO)


def test_compartir_no_la_exige():
    """Compartir es trabajo normal del equipo; no debe pedir permiso de mando."""
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    r = ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO)
    assert r['cambiados'] == ['a1']


def test_por_la_via_de_la_revision_tampoco_se_publica_sin_comprobarla():
    """Era la puerta de atras: la aprobacion no comprobaba permiso ninguno."""
    cur = CursorFalso([('a1', 'uno.pdf', ecd.WIP)])
    with pytest.raises(ecd.TransicionRechazada) as e:
        ecd.transicionar_recorriendo(cur, 'obra/X', ['a1'], ecd.PUBLISHED, USUARIO)
    assert 'autoridad' in e.value.motivo


def test_si_el_autorizador_dice_que_no_no_se_publica():
    cur = CursorFalso([('a1', 'uno.pdf', ecd.SHARED)])
    with pytest.raises(ecd.TransicionRechazada):
        ecd.transicionar(cur, 'obra/X', ['a1'], ecd.PUBLISHED, USUARIO,
                         autorizar=lambda _n: False, codigo_idoneidad='A1')
    assert not cur.sql_de('UPDATE file_nodes')


def test_el_permiso_se_pregunta_por_CADA_documento():
    """Se comprobaba solo sobre el primero de la lista: con mando en una carpeta
    se movian documentos de cualquier otra metiendolos en la misma peticion."""
    cur = CursorFalso([
        ('a1', 'mio.pdf', ecd.WIP),
        ('a2', 'de-otra-carpeta.pdf', ecd.WIP),
    ])
    preguntados = []

    def autorizar(node_id):
        preguntados.append(node_id)
        return node_id == 'a1'

    with pytest.raises(ecd.TransicionRechazada) as e:
        ecd.transicionar(cur, 'obra/X', ['a1', 'a2'], ecd.SHARED, USUARIO, autorizar=autorizar)
    assert 'de-otra-carpeta.pdf' in e.value.motivo
    assert preguntados == ['a1', 'a2']
    assert not cur.sql_de('UPDATE file_nodes')


def test_recorrer_no_lo_usa_el_cambio_manual():
    """Publicar a mano un borrador tiene que avisar, no colarse por detras."""
    cur = CursorFalso([('a1', 'PLANO-01.pdf', ecd.WIP)])
    with pytest.raises(ecd.TransicionRechazada):
        ecd.transicionar(cur, 'obra/X', ['a1'], ecd.PUBLISHED, USUARIO)


# ── Lo que el ataque encontró ───────────────────────────────────────────────

def test_una_carpeta_no_se_emite():
    """La interfaz no lo ofrece, pero la API sí lo aceptaba: una carpeta no tiene
    versiones, así que el sello no encontraba dónde grabarse y el número de
    revisión salía siempre 'C01', llamándose igual en cada publicación."""
    class SoloCarpetas(CursorFalso):
        def execute(self, sql, params=None):
            super().execute(sql, params)
            if 'count(*)' in sql and "node_type = 'FOLDER'" in sql:
                self._ultima = [(1,)]

    cur = SoloCarpetas([])   # el SELECT ya filtra node_type='FILE': no devuelve nada
    with pytest.raises(ecd.TransicionRechazada) as e:
        ecd.transicionar(cur, 'obra/X', ['una-carpeta'], ecd.SHARED, USUARIO)
    assert "node_type = 'FILE'" in cur.sql_de('SELECT id, name, status')[0]
    # Y el motivo tiene que decir la verdad: decirle "no esta en esta obra" a
    # quien selecciono una carpeta de SU obra manda a buscar donde no es.
    assert 'carpetas' in e.value.motivo.lower()


def test_el_codigo_se_graba_normalizado():
    """Lo que se sella tiene que ser el código del catálogo, no la cadena que
    llegó por HTTP."""
    cur = CursorFalso([('a1', 'PLANO-01.pdf', ecd.WIP)])
    r = ecd.transicionar(cur, 'obra/X', ['a1'], ecd.SHARED, USUARIO,
                         codigo_idoneidad='  s3  ')
    assert r['emisiones']['a1']['idoneidad'] == 'S3'


def test_un_documento_archivado_no_se_desarchiva_subiendole_un_fichero():
    """Medido en el recorrido ECD: create_file_record hacia ARCHIVED -> WIP con
    un UPDATE directo, una transicion que la propia maquina prohibe y que tiene
    hasta mensaje escrito. Archivar es un acto formal del expediente; deshacerlo
    por la puerta de atras lo vacia de sentido."""
    import io
    import os
    backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fuente = io.open(os.path.join(backend, 'file_system_db.py'), encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def create_file_record('):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 10)]
    assert 'ecd.ARCHIVED' in cuerpo, 'create_file_record no mira si venia archivado'
    assert 'TransicionRechazada' in cuerpo, 'y tiene que rechazarlo, no seguir'


def test_la_maquina_sigue_prohibiendo_archivado_a_borrador():
    assert ecd.WIP not in ecd.TRANSICIONES[ecd.ARCHIVED]
