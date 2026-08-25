# -*- coding: utf-8 -*-
"""Las dos invariantes del motor de encargo.

  1. UN ENCARGO NUNCA AMPLIA ACCESO.
     Dirigir una tarea a alguien no le mete en la obra. `abrir()` se niega a
     crear un encargo para quien no es miembro, y la bandeja parte siempre de la
     membresia.

  2. `encargos` NO ES UNA SEGUNDA FUENTE DE VERDAD.
     Se abre y se cierra solo desde las transiciones del objeto de origen. No
     existe --y no debe existir-- ninguna ruta que lo escriba por separado.

Lo que se puede comprobar SIN base de datos esta aqui. Lo que depende de la
consulta real (que la bandeja filtre por pertenencia, el aislamiento cruzado,
las tres funciones contractuales conviviendo) se demuestra contra PostgreSQL en
`herramientas/ensayo_de_encargos.py`, porque una consulta con JOIN solo la puede
juzgar una base de datos.
"""
import io
import os
import re

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class CursorFalso:
    """Responde distinto segun la consulta. Registra lo que se escribe."""

    def __init__(self, obra_del_objeto='obra_a', es_miembro=True, id_nuevo=99):
        self.obra_del_objeto = obra_del_objeto
        self.es_miembro = es_miembro
        self.id_nuevo = id_nuevo
        self.escrituras = []
        self._ultima = None
        self.rowcount = 0

    def execute(self, sql, params=None):
        self._ultima = sql
        if sql.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')):
            self.escrituras.append(sql)
            self.rowcount = 1

    def fetchone(self):
        s = (self._ultima or '')
        if 'FROM project_users' in s:
            return (1,) if self.es_miembro else None
        if s.strip().upper().startswith('SELECT MODEL_URN') or 'model_urn FROM' in s:
            return (self.obra_del_objeto,) if self.obra_del_objeto else None
        if s.strip().upper().startswith('INSERT'):
            return (self.id_nuevo,)
        return None


@pytest.fixture(autouse=True)
def sin_base(monkeypatch):
    """`abrir` traduce el alcance con el resolutor: se fija a la identidad."""
    import db
    monkeypatch.setattr(db, 'resolve_project_id', lambda x: x)


# ── Invariante 1: un encargo no da acceso ──────────────────────────────────

def test_no_se_abre_un_encargo_a_quien_no_es_miembro_de_la_obra():
    """La comprobacion clave, y va en el momento de CREAR.

    Si se pudiera abrir un encargo a alguien de fuera, esa persona vería en su
    bandeja el asunto y el vinculo de una obra a la que no pertenece. Que luego
    el guardia del recurso le negara el documento no arregla la fuga: el asunto
    ya cuenta algo.
    """
    import encargos as enc
    cur = CursorFalso(es_miembro=False)
    eid = enc.abrir(cur, 'RFI', '7', 'Responder RFI-001', destino_usuario=42)
    assert eid is None
    assert not cur.escrituras, 'se escribio un encargo para alguien de fuera de la obra'


def test_a_un_miembro_si_se_le_abre():
    import encargos as enc
    cur = CursorFalso(es_miembro=True)
    assert enc.abrir(cur, 'RFI', '7', 'Responder RFI-001', destino_usuario=42) == 99


def test_la_consulta_de_la_bandeja_parte_de_la_membresia():
    """El `JOIN project_users` no es un filtro mas: es la invariante.

    Sin el, un encargo dirigido a una funcion contractual alcanzaria a cualquier
    persona de esa empresa, perteneciera o no a la obra. Se comprueba aqui la
    ESTRUCTURA de la consulta, y su EFECTO en el ensayo contra PostgreSQL.
    """
    import encargos as enc
    sql = enc._MI_TRABAJO
    assert 'JOIN project_users' in sql
    assert 'pu.user_id = %(uid)s' in sql, (
        'la bandeja no exige que quien pregunta sea miembro de la obra')
    assert "e.estado = 'abierto'" in sql, 'la bandeja devolveria encargos cerrados'


# ── Invariante 1 (bis): no se abre sobre lo que no existe ──────────────────

def test_no_se_abre_un_encargo_sobre_un_objeto_inexistente():
    """Un encargo huerfano apunta a algo que nadie puede abrir, y ensucia la
    bandeja de alguien para siempre."""
    import encargos as enc
    cur = CursorFalso(obra_del_objeto=None)
    assert enc.abrir(cur, 'RFI', 'no-existe', 'x', destino_usuario=1) is None
    assert not cur.escrituras


def test_no_se_abre_un_encargo_de_un_tipo_o_funcion_desconocidos():
    """El tipo de ejemplo era 'SUBMITTAL' hasta que el submittal EXISTIO (GAP 01).

    Se cambia por uno que de verdad no se sabe cotejar. La invariante que este
    test protege no ha cambiado ni un ápice: lo que no se sabe interpretar no se
    escribe. Lo que cambió es cuál es el ejemplo honesto de «desconocido» — y
    dejarlo en SUBMITTAL habría convertido el guardia en un test que pasa por
    casualidad.
    """
    import encargos as enc
    cur = CursorFalso()
    assert 'PUNCH' not in enc.TIPOS, 'elige otro ejemplo: este ya existe'
    assert enc.abrir(cur, 'PUNCH', '1', 'x', destino_usuario=1) is None
    assert enc.abrir(cur, 'RFI', '1', 'x', destino_funcion='JEFAZO') is None
    assert not cur.escrituras


def test_un_encargo_sin_destinatario_no_es_un_encargo():
    import encargos as enc
    cur = CursorFalso()
    assert enc.abrir(cur, 'RFI', '1', 'x') is None
    assert not cur.escrituras


def test_la_obra_del_encargo_sale_del_OBJETO_no_de_quien_llama():
    """`abrir()` no recibe `project_id`: lo deduce de la fila del objeto.

    Si lo aceptara como parametro, bastaria con equivocarse --o mentir-- para
    dejar un encargo de la obra B colgado dentro de la obra A.
    """
    import inspect

    import encargos as enc
    firma = inspect.signature(enc.abrir).parameters
    assert 'project_id' not in firma, (
        'abrir() acepta la obra de fuera: podria colocarse un encargo en otra obra')


# ── Invariante 2: no es una segunda fuente de verdad ───────────────────────

def test_no_existe_ninguna_ruta_que_escriba_encargos():
    """Ata la invariante 2 al codigo, no a la buena intencion.

    Si un dia aparece `PATCH /api/encargos/<id>`, la bandeja podria decir una
    cosa y el RFI otra sobre quien debe que. La respuesta no seria anadir la
    ruta: seria reasignar EL OBJETO y que el encargo lo siga.
    """
    culpables = []
    rutas = os.path.join(BACKEND, 'routes')
    for fichero in sorted(os.listdir(rutas)):
        if not fichero.endswith('.py'):
            continue
        src = io.open(os.path.join(rutas, fichero), encoding='utf-8', errors='ignore').read()
        for m in re.finditer(r'(INSERT INTO|UPDATE|DELETE FROM)\s+encargos', src, re.I):
            culpables.append('%s: %s' % (fichero, m.group(0)))
    assert not culpables, (
        'una ruta escribe en `encargos` directamente; solo el modulo `encargos` '
        'debe hacerlo, y solo desde una transicion del objeto:\n  '
        + '\n  '.join(culpables))


def test_el_modulo_de_rutas_no_expone_crear_ni_editar_encargos():
    """La unica ruta del bloque que toca encargos es de LECTURA."""
    src = io.open(os.path.join(BACKEND, 'routes', 'directorio.py'), encoding='utf-8').read()
    metodos = re.findall(r"@directorio_bp\.route\('([^']+)'[^)]*methods=\[([^\]]+)\]", src)
    for ruta, verbos in metodos:
        if 'encargo' in ruta or 'mi-trabajo' in ruta:
            assert 'POST' not in verbos and 'PATCH' not in verbos and 'DELETE' not in verbos, (
                'la ruta %s puede escribir encargos: %s' % (ruta, verbos))


def test_los_cuatro_objetos_cierran_su_encargo_al_resolverse():
    """Cada transicion que resuelve el objeto tiene que cerrar la deuda.

    Se comprueba que la llamada EXISTE en cada uno de los cuatro manejadores; el
    efecto sobre datos reales lo demuestra el ensayo contra PostgreSQL.
    """
    faltan = []
    for fichero in ('reviews.py', 'rfis.py', 'redlines.py', 'transmittals.py'):
        src = io.open(os.path.join(BACKEND, 'routes', fichero), encoding='utf-8').read()
        if 'cerrar_los_de' not in src:
            faltan.append(fichero)
    assert not faltan, (
        'estos objetos abren encargos y no los cierran nunca, asi que la deuda '
        'se quedaria abierta para siempre: ' + ', '.join(faltan))


# ── Que este bloque no toca nada de lo que ya estaba ───────────────────────

def test_el_bloque_no_toca_documentos_ni_permisos():
    """Ni una escritura sobre el expediente, las versiones o los permisos.

    Es la promesa del alcance: este bloque solo AÑADE una proyeccion de trabajo
    pendiente. Si alguna de sus piezas escribiera en `file_nodes`,
    `file_versions`, `folder_permissions` o `project_users`, estaria cambiando
    quien ve que -- que es justo lo que no debe hacer.
    """
    prohibidas = ('file_nodes', 'file_versions', 'folder_permissions',
                  'project_users', 'document_shares')
    culpables = []
    for fichero in ('encargos.py', 'directorio_de_obra.py',
                    os.path.join('routes', 'directorio.py')):
        src = io.open(os.path.join(BACKEND, fichero), encoding='utf-8', errors='ignore').read()
        for tabla in prohibidas:
            for m in re.finditer(r'(INSERT INTO|UPDATE|DELETE FROM)\s+%s' % tabla, src, re.I):
                culpables.append('%s: %s' % (fichero, m.group(0)))
    assert not culpables, (
        'el bloque escribe en tablas que no le corresponden:\n  ' + '\n  '.join(culpables))


# ── Consistencia eventual: detectar la divergencia de ESTADO ───────────────
#
# Se acepto que un fallo de la proyeccion nunca impida una transicion
# contractual del objeto. Eso abre exactamente un caso: RFI = RESPONDIDO con su
# encargo = ABIERTO. `huerfanos()` no lo veia: solo miraba si el objeto existia.

class _CursorGuion:
    """Responde segun una lista de (fragmento_de_sql, resultado)."""

    def __init__(self, guion):
        self.guion = guion
        self._r = None
        self.rowcount = 0

    def execute(self, sql, params=None):
        self._r = None
        for fragmento, resultado in self.guion:
            if fragmento in sql:
                self._r = resultado
                return

    def fetchone(self):
        return self._r[0] if isinstance(self._r, list) and self._r else self._r

    def fetchall(self):
        return self._r if isinstance(self._r, list) else []


def test_un_rfi_respondido_deja_de_deberse():
    """La pregunta se la hace AL OBJETO, que es la fuente de verdad."""
    import encargos as enc
    resuelto = _CursorGuion([('FROM doc_rfis', ('Cerrado', 'Ya esta respondido'))])
    vivo = _CursorGuion([('FROM doc_rfis', ('En revision', None))])
    assert enc._sigue_debiendose(resuelto, 'RFI', '1', 5) is False
    assert enc._sigue_debiendose(vivo, 'RFI', '1', 5) is True


def test_un_rfi_con_respuesta_escrita_tambien_deja_de_deberse():
    """No hace falta que el estado diga 'Cerrado': si hay respuesta, esta hecho."""
    import encargos as enc
    cur = _CursorGuion([('FROM doc_rfis', ('En revision', 'La respuesta es esta'))])
    assert enc._sigue_debiendose(cur, 'RFI', '1', 5) is False


def test_una_revision_ya_aprobada_deja_de_deberse():
    import encargos as enc
    cur = _CursorGuion([('FROM doc_reviews', ('approved', 0, [{'email': 'a@b.c'}]))])
    assert enc._sigue_debiendose(cur, 'REVIEW', '1', 5) is False


def test_no_se_concilia_un_tipo_que_no_se_sabe_cotejar():
    """Cerrar por no entender seria peor que no conciliar.

    En la base lo impide ademas `ck_encargos_tipo`; este guardia es la segunda
    linea, para una base antigua que no tenga la restriccion.
    """
    import encargos as enc
    # Mismo cambio de ejemplo que arriba: 'SUBMITTAL' dejó de ser desconocido
    # cuando se implementó GAP 01, y un guardia cuyo ejemplo el sistema ya sabe
    # cotejar deja de guardar nada.
    assert 'PUNCH' not in enc.TIPOS, 'elige otro ejemplo: este ya existe'
    cur = _CursorGuion([('DISTINCT objeto_tipo', [('PUNCH',)])])
    with pytest.raises(enc.TipoNoInterpretable):
        enc.divergencias(cur)


def test_los_motivos_de_sobrante_son_constantes_distinguibles():
    """`huerfanos()` filtra por motivo, y la primera version comparaba el
    PREFIJO del texto: «el objeto ya esta resuelto» empieza igual que «el objeto
    no existe», asi que la divergencia de estado se colaba como si fuera un
    huerfano. Lo encontro el ensayo contra PostgreSQL.

    Un filtro por la forma del texto no distingue significados.
    """
    import encargos as enc
    assert enc.YA_RESUELTO not in enc._DE_EXISTENCIA, (
        'la divergencia de ESTADO se cuenta como huerfano: son cosas distintas')
    assert enc.SIN_OBJETO in enc._DE_EXISTENCIA
