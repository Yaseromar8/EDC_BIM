# -*- coding: utf-8 -*-
"""CAPA 14 · PROJECT TEMPLATES — configuración reproducible, historia jamás.

LA PREGUNTA QUE DECIDE TODO:

    ¿Esto es CONFIGURACIÓN de la obra, o es su HISTORIA?

La configuración se reproduce. La historia es de UNA obra: copiarla sería
fabricar un pasado falso — documentos que nadie subió, revisiones que nadie
hizo, recibos que nadie firmó. Un expediente público con historia inventada
no es un expediente.

Y LOS MIEMBROS TAMPOCO, que es la tentación evidente («la obra nueva tiene
el mismo equipo»): si una plantilla copiara membresías, crear una obra desde
plantilla concedería acceso a personas que nadie invitó a ESA obra, y el
acceso dejaría de nacer de un acto con autor.

    la estructura se hereda; la gente se incorpora
"""
import ast
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _Cur:
    """Doble que registra TODO el SQL: lo que una plantilla lee y escribe es
    precisamente lo que hay que poder auditar."""
    def __init__(self, respuestas=None):
        self.sql = []
        self._r = respuestas or {}
        self._ultimo = ''
    def execute(self, sql, params=None):
        self._ultimo = ' '.join(sql.split()).upper()
        self.sql.append((self._ultimo, params))
    def fetchall(self):
        for clave, filas in self._r.items():
            if clave in self._ultimo:
                return filas
        return []
    def fetchone(self):
        return None


# ── QUÉ SE CAPTURA ──────────────────────────────────────────────────────────

def test_las_partes_son_una_lista_cerrada():
    import plantillas_de_obra as pdo
    assert set(pdo.PARTES) == {'carpetas', 'herramientas', 'empresas', 'idoneidad'}
    # Ninguna parte con nombre de historia.
    for prohibida in ('miembros', 'documentos', 'auditoria', 'encargos',
                      'sesiones', 'permisos', 'rfis', 'revisiones'):
        assert prohibida not in pdo.PARTES


def test_capturar_solo_lee_configuracion():
    """LA PRUEBA CENTRAL: se registra cada tabla que `capturar` consulta y se
    exige que ninguna sea de historia."""
    import plantillas_de_obra as pdo
    cur = _Cur({'FILE_NODES': [], 'PROJECT_TOOLS': [], 'PROJECT_COMPANIES': [],
                'IDONEIDAD_CATALOGO': []})
    pdo.capturar(cur, 'b.proj_x')
    leido = ' '.join(s for s, _ in cur.sql)
    for tabla in ('DOC_REVIEWS', 'DOC_RFIS', 'DOC_REDLINES', 'TRANSMITTALS',
                  'ENCARGOS', 'ACTIVITY_LOG', 'AUTH_EVENTS', 'SESSIONS',
                  'FOLDER_PERMISSIONS', 'PROJECT_USERS', 'FILE_VERSIONS'):
        assert tabla not in leido, (
            'capturar() lee %s: eso es historia o identidad, no configuración' % tabla)


def test_capturar_toma_solo_carpetas_no_ficheros():
    """El esqueleto documental, VACÍO."""
    import plantillas_de_obra as pdo
    cur = _Cur({'FILE_NODES': []})
    pdo.capturar(cur, 'b.proj_x')
    consulta = next(s for s, _ in cur.sql if 'FILE_NODES' in s)
    assert "NODE_TYPE = 'FOLDER'" in consulta


# ── QUÉ SE ESCRIBE AL APLICAR ───────────────────────────────────────────────

def test_aplicar_no_escribe_historia_ni_miembros():
    import plantillas_de_obra as pdo
    cur = _Cur()
    molde = {'carpetas': [{'id': 'a', 'padre': None, 'nombre': '01_Gestion', 'tipo': None},
                          {'id': 'b', 'padre': 'a', 'nombre': '01_Actas', 'tipo': None}],
             'herramientas': {'rfi': True, 'visor': False},
             'empresas': [{'company_id': 4, 'funcion': 'SUPERVISION'}],
             'idoneidad': [{'codigo': 'A1', 'descripcion': 'Apto'}]}
    creado = pdo.aplicar(cur, molde, 'b.proj_nueva', 'proyectos/NUEVA', 'admin@o.pe')
    assert creado['carpetas'] == 2 and creado['herramientas'] == 2
    assert creado['empresas'] == 1

    escrituras = ' '.join(s for s, _ in cur.sql
                          if s.startswith(('INSERT', 'UPDATE', 'DELETE')))
    for tabla in ('PROJECT_USERS', 'FOLDER_PERMISSIONS', 'MEMBER_TOOL_ACCESS',
                  'DOC_REVIEWS', 'DOC_RFIS', 'TRANSMITTALS', 'ENCARGOS',
                  'ACTIVITY_LOG', 'FILE_VERSIONS'):
        assert tabla not in escrituras, (
            'aplicar() escribe %s: estaría fabricando historia o concediendo '
            'acceso que nadie otorgó' % tabla)


def test_las_carpetas_nacen_con_identidad_nueva():
    """Reutilizar los ids del origen haría que dos obras compartieran nodos y
    el aislamiento se rompería en el acto."""
    import plantillas_de_obra as pdo
    cur = _Cur()
    molde = {'carpetas': [{'id': 'origen-1', 'padre': None, 'nombre': 'X', 'tipo': None}],
             'herramientas': {}, 'empresas': [], 'idoneidad': []}
    pdo.aplicar(cur, molde, 'b.proj_nueva', 'proyectos/NUEVA', 'admin@o.pe')
    insercion = next(p for s, p in cur.sql if s.startswith('INSERT INTO FILE_NODES'))
    assert insercion[0] != 'origen-1', 'reutilizó el id de la obra origen'
    assert len(insercion[0]) == 36, 'debería ser un UUID nuevo'
    assert insercion[1] == 'proyectos/NUEVA', 'debe colgar del expediente destino'


def test_la_jerarquia_se_conserva_con_los_ids_nuevos():
    import plantillas_de_obra as pdo
    cur = _Cur()
    # A propósito EN ORDEN INVERSO: la hija antes que el padre.
    molde = {'carpetas': [{'id': 'hija', 'padre': 'padre', 'nombre': 'B', 'tipo': None},
                          {'id': 'padre', 'padre': None, 'nombre': 'A', 'tipo': None}],
             'herramientas': {}, 'empresas': [], 'idoneidad': []}
    creado = pdo.aplicar(cur, molde, 'b.proj_n', 'proyectos/N', 'a@o.pe')
    assert creado['carpetas'] == 2, 'un árbol puede venir en cualquier orden'
    inserciones = [p for s, p in cur.sql if s.startswith('INSERT INTO FILE_NODES')]
    ids = {p[3]: p[0] for p in inserciones}          # nombre -> id nuevo
    padres = {p[3]: p[2] for p in inserciones}       # nombre -> padre nuevo
    assert padres['A'] is None
    assert padres['B'] == ids['A'], 'la hija debe colgar del padre NUEVO'


def test_un_arbol_con_padre_irresoluble_se_para_no_adivina():
    import plantillas_de_obra as pdo
    cur = _Cur()
    molde = {'carpetas': [{'id': 'x', 'padre': 'fantasma', 'nombre': 'X', 'tipo': None}],
             'herramientas': {}, 'empresas': [], 'idoneidad': []}
    creado = pdo.aplicar(cur, molde, 'b.proj_n', 'proyectos/N', 'a@o.pe')
    assert creado['carpetas'] == 0, 'no debe colgarla de la raíz por su cuenta'


# ── EL CONTRATO DE ESQUEMA ──────────────────────────────────────────────────

def test_el_esquema_prohibe_partes_de_historia():
    sql = io.open(os.path.join(RAIZ, 'sql', '12_capa14_project_templates.sql'),
                  encoding='utf-8').read()
    for prohibida in ('miembros', 'documentos', 'auditoria', 'encargos', 'sesiones'):
        assert "'%s'" % prohibida in sql, (
            'el guardián del esquema no vigila la parte «%s»' % prohibida)


def test_el_modulo_no_importa_nada_de_historia():
    arbol = ast.parse(io.open(os.path.join(RAIZ, 'plantillas_de_obra.py'),
                              encoding='utf-8').read())
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(a.name for a in nodo.names)
        elif isinstance(nodo, ast.ImportFrom):
            importados.add(nodo.module or '')
    for prohibido in ('encargos', 'flujo_de_registro', 'permiso_documental',
                      'folder_permissions', 'acceso_a_herramientas'):
        assert prohibido not in importados, (
            'plantillas_de_obra importa %s' % prohibido)
