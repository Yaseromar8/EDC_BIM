# -*- coding: utf-8 -*-
"""UNA SOLA SEMANTICA DE RESOLUCION DEL ARBOL DOCUMENTAL.

    CANONICAL TREE   autoridad para toda obra nueva
    DERIVED TREE     compatibilidad legacy, y solo eso

EL DEFECTO QUE ESTE FICHERO IMPIDE QUE VUELVA
----------------------------------------------
El expediente vivia en dos arboles y nadie sabia cual mandaba. Seis sitios del
portal DEDUCIAN la ruta del NOMBRE de la obra:

    `proyectos/${project.name.replace(/ /g, '_')}`

Medido en produccion el 25-ago-2026: las obras antiguas guardan su expediente
ahi (PQT8_TALARA, 118 nodos; PQT8_INTERFERENCIAS, 2 481) y las creadas despues
bajo su id canonico. Con la ruta deducida, la pantalla **Archivos** ensenaba una
obra VACIA que no lo estaba -- y con ella se caia el selector de documentos, y
con el emitir revisiones y aplicar plantillas.

Y ademas el nombre es EDITABLE: renombrar una obra movia el alcance de todo lo
que se escribiera despues.

LA DECISION YA ESTABA TOMADA Y ESCRITA. `project_ref.es_escritura` marca cual de
los alias de cada obra es su alcance de escritura, y `GET /api/projects` ya
devolvia `scope_escritura` con esa respuesta. Nadie la leia.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTAL = os.path.join(os.path.dirname(BACKEND), 'frontend-docs', 'src')


def _ficheros_del_portal():
    for raiz, _d, ficheros in os.walk(PORTAL):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if f.endswith(('.jsx', '.js')):
                yield os.path.join(raiz, f)


# ══ 1 · NINGUN CODIGO DERIVA EL ARBOL DEL NOMBRE ═══════════════════════════

def test_ningun_codigo_deriva_el_arbol_documental_del_NOMBRE_de_la_obra():
    """La regla que el propietario fijo: ningun codigo nuevo puede hacerlo.

    Se admite UNA aparicion: la del propio modulo que explica por que no se
    hace. Documentar el defecto no es cometerlo.
    """
    patron = re.compile(r'proyectos/\$\{')
    culpables = []
    for camino in _ficheros_del_portal():
        fuente = io.open(camino, encoding='utf-8', errors='ignore').read()
        for n, linea in enumerate(fuente.split('\n'), 1):
            if not patron.search(linea):
                continue
            # La linea de dentro del propio resolvedor, que lo cita para
            # explicarlo, va en un comentario.
            if camino.endswith('arbolDocumental.js') and linea.strip().startswith('*'):
                continue
            culpables.append('%s:%d  %s'
                             % (os.path.relpath(camino, PORTAL), n, linea.strip()[:70]))
    assert not culpables, (
        'hay codigo que deduce el expediente del NOMBRE de la obra. El nombre es '
        'editable y solo acierta por coincidencia; usa `arbolDocumental(project)`:'
        '\n  ' + '\n  '.join(culpables))


def test_los_consumidores_usan_EL_MISMO_resolvedor():
    """Explorer, selector de documentos, RFI/Red Line, fotos y partidas."""
    esperados = ('hooks/useFileExplorer.js', 'components/SelectorDeDocumento.jsx',
                 'components/IssueModule.jsx', 'components/MultimediaModule.jsx',
                 'components/PartidasModule.jsx')
    for rel in esperados:
        fuente = io.open(os.path.join(PORTAL, rel), encoding='utf-8').read()
        assert 'arbolDocumental' in fuente, (
            '%s no resuelve el expediente por la via unica' % rel)


def test_el_resolvedor_del_cliente_NO_cae_en_la_ruta_derivada():
    """Ni como ultimo recurso: acertaria en las legacy y fallaria en las nuevas,
    que es justo el reparto que produjo el problema."""
    fuente = io.open(os.path.join(PORTAL, 'utils', 'arbolDocumental.js'),
                     encoding='utf-8').read()
    cuerpo = fuente.split('export function arbolDocumental')[1]
    assert 'scope_escritura' in cuerpo
    assert 'project.name' not in cuerpo, 'el nombre no participa en la resolucion'
    assert 'replace' not in cuerpo


# ══ 2 · EL RESOLVEDOR DEL SERVIDOR ═════════════════════════════════════════

def test_el_resolvedor_existe_y_no_es_una_segunda_fuente_de_verdad():
    import db
    assert hasattr(db, 'resolve_project_document_tree')
    fuente = io.open(os.path.join(BACKEND, 'db.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def resolve_project_document_tree')[1].split('\ndef ')[0]
    # Lee el mapa que ya construye el resolvedor de siempre; no abre su propia
    # consulta ni mantiene su propia tabla.
    assert '_load_project_resolver' in cuerpo
    assert 'CREATE TABLE' not in cuerpo
    # Lo que importa no es que NOMBRE la tabla --su docstring explica de donde
    # sale la autoridad, y eso es bueno-- sino que no abra su propia consulta.
    codigo = cuerpo.split('\"\"\"')[2] if cuerpo.count('\"\"\"') >= 2 else cuerpo
    assert 'cur.execute' not in codigo
    assert 'SELECT' not in codigo
    assert 'get_db_connection' not in codigo


def test_el_mapa_se_construye_desde_project_ref_es_escritura():
    fuente = io.open(os.path.join(BACKEND, 'db.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def _load_project_resolver')[1].split('\ndef ')[0]
    assert 'arbol_documental' in cuerpo
    assert 'es_escritura' in cuerpo


def test_dos_alcances_de_escritura_NO_producen_uno_elegido_al_azar():
    """Si una obra tuviera dos filas de escritura se deja fuera y se cae en el
    canonico. Elegir una por orden de la base seria decidir donde se escribe
    segun como salgan las filas."""
    fuente = io.open(os.path.join(BACKEND, 'db.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def _load_project_resolver')[1].split('\ndef ')[0]
    assert 'GROUP BY project_id' in cuerpo
    assert 'cuantos == 1' in cuerpo


def test_FALLA_CERRADO_y_no_hay_respaldo():
    """EXACTAMENTE UNO -> resuelve. CERO o MAS DE UNO -> None.

    La primera version caia en el canonico cuando no habia fila. El propietario
    lo cerro el 25-ago-2026: devolver el canonico «por si acaso» ante una
    escritura ambigua mandaria documentos a un arbol que quiza no es el que esa
    obra usa -- que es justo lo que le pasaria a una legacy.

    Un documento guardado en el arbol equivocado NO da error: da un expediente
    partido, y eso no se nota hasta que alguien lo busca y no esta.
    """
    fuente = io.open(os.path.join(BACKEND, 'db.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def resolve_project_document_tree')[1].split(chr(10) + 'def ')[0]
    assert 'or str(project_id)' not in cuerpo, 'volvio el respaldo al canonico'
    assert 'FALLA CERRADO' in cuerpo
    assert 'proyectos/' not in cuerpo.replace('`proyectos/', '')

    import db
    assert db.resolve_project_document_tree('b.proj_que_no_existe_123') is None


def test_la_ambiguedad_es_IMPOSIBLE_desde_la_base():
    """Una guardia en el codigo protege de los errores de hoy; una en la base
    protege tambien de la escritura directa y del script de mantenimiento."""
    sql = io.open(os.path.join(BACKEND, 'sql', '20_un_solo_alcance_de_escritura.sql'),
                  encoding='utf-8').read()
    assert 'idx_project_ref_un_solo_alcance' in sql
    assert 'WHERE es_escritura' in sql, 'tiene que ser un indice PARCIAL'
    # Una fila de escritura sin obra ya la impide `project_id NOT NULL`, que
    # la tabla trae desde su creacion. No se anade un CHECK que lo repita.
    assert 'NOT NULL' in sql
    assert 'DELETE' not in sql.upper()
    assert 'UPDATE ' not in sql.upper()


def test_nunca_lanza_y_None_para_lo_vacio():
    import db
    assert db.resolve_project_document_tree(None) is None
    assert db.resolve_project_document_tree('') is None


# ══ 3 · UNA OBRA NUEVA NACE CANONICA ═══════════════════════════════════════

def test_una_obra_nueva_escribe_con_su_PROPIO_id():
    """Requisito del propietario: nueva obra -> SOLO estructura canonica.

    `registrar_obra` sigue anotando el alias LEGACY_PATH --un alias no es un
    arbol: sirve para que una peticion antigua siga resolviendo-- pero la marca
    de ESCRITURA va al id canonico.
    """
    fuente = io.open(os.path.join(BACKEND, 'referencias_de_obra.py'),
                     encoding='utf-8').read()
    cuerpo = fuente.split('def registrar_obra')[1].split('\ndef ')[0]
    assert 'marcar_escritura(cur, project_id, project_id)' in cuerpo, (
        'una obra nueva ya no escribe con su propio id')
    # Y no se marca escritura sobre la ruta derivada.
    assert 'marcar_escritura(cur, project_id, ruta)' not in cuerpo
    assert "marcar_escritura(cur, project_id, nombre)" not in cuerpo


def test_la_siembra_de_estructura_usa_el_alcance_de_escritura():
    """Si la estructura inicial se sembrara bajo la ruta derivada, cada obra
    nueva volveria a nacer partida en dos."""
    for nombre in ('routes/projects.py',):
        fuente = io.open(os.path.join(BACKEND, nombre), encoding='utf-8').read()
        assert not re.search(r"'proyectos/'\s*\+\s*.*name", fuente), nombre
        assert not re.search(r'"proyectos/"\s*\+\s*.*name', fuente), nombre


def test_las_DOS_implementaciones_del_alcance_no_pueden_divergir():
    """Hay dos por rendimiento, no por diseno: `mapa_de_escritura` resuelve
    TODAS las obras de una consulta --lo que pide la pantalla de aterrizaje-- y
    `resolve_project_document_tree` resuelve UNA con la cache del resolvedor.

    Las dos leen `project_ref.es_escritura`, asi que la fuente es una. Esta
    prueba fija que sigan leyendo lo mismo: el dia que una anada un criterio y
    la otra no, la pantalla y el servidor discreparian sobre donde vive el
    expediente -- y eso es exactamente el fallo que se acaba de cerrar.
    """
    fuente = io.open(os.path.join(BACKEND, 'referencias_de_obra.py'),
                     encoding='utf-8').read()
    bulk = fuente.split('def mapa_de_escritura')[1].split(chr(10)+'def ')[0]
    assert 'es_escritura' in bulk
    assert 'project_ref' in bulk

    db_src = io.open(os.path.join(BACKEND, 'db.py'), encoding='utf-8').read()
    carga = db_src.split('def _load_project_resolver')[1].split(chr(10)+'def ')[0]
    assert 'es_escritura' in carga

    # Y el mismo respaldo cuando una obra no tiene fila: su propio id.
    proj = io.open(os.path.join(BACKEND, 'routes', 'projects.py'),
                   encoding='utf-8').read()
    assert '_escritura.get(r[0]) or r[0]' in proj, (
        'la lista de obras dejo de caer en el id canonico cuando no hay fila')


def test_el_resolvedor_es_el_punto_de_entrada_nombrado_para_lo_que_viene():
    """`resolve_project_document_tree` es la forma en que GAP 07 va a pedir el
    alcance: la cola offline usara `project_id + identidad canonica + local_id`,
    y no puede heredar la ambiguedad historica preguntandole al nombre.

    Se deja escrito aqui para que no parezca codigo sin consumidor: lo tiene, y
    es el siguiente gap.
    """
    import db
    assert callable(db.resolve_project_document_tree)
    # Contrato: lo desconocido NO se inventa. Falla cerrado.
    assert db.resolve_project_document_tree('b.proj_que_no_existe_123') is None
