# -*- coding: utf-8 -*-
"""`project_ref`: la tabla que dice a que obra pertenece cada alias.

EL PROBLEMA QUE RESUELVE
------------------------
El sistema no direcciona las cosas por `projects.id`. Las direcciona por una
cadena de alcance que a lo largo de los anos ha tomado SIETE formas distintas,
medidas sobre la base:

    1  entero heredado             '1'
    2  ruta-slug                   'proyectos/PQT8_TALARA'
    3  compuesto obra+modelo       '1_CANAL', '1_DRENAJE'
    4  nombre desnudo              'PQT8_TALARA'
    5  acunado aqui                'b.proj_pqt8_interferencias_4852'
    6  id de Autodesk              'b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d'
    7  UUID de dataset             '653fea31-fad8-43ab-9ad2-7b597153e574'

Hasta hoy la traduccion se hacia por CONVENCION: prefijo antes del '_',
coincidencia por nombre, y «si hay una sola obra activa, esa». Tres heuristicas,
y las tres fallan en cuanto hay una segunda obra:

  - La coincidencia por NOMBRE es ambigua. `projects` no tiene UNIQUE sobre
    `name` y hoy hay CUATRO obras llamadas 'HOSPITAL_MATUCANA': el alias
    'proyectos/HOSPITAL_MATUCANA' resolvia a una de las cuatro segun el orden en
    que la base devolviera las filas.
  - «Una sola obra activa» resuelve TODO por accidente mientras solo hay una, y
    cambia el comportamiento de medio sistema el dia que entra la segunda. Lo
    dice el propio comentario de `resolve_project_id`.

QUE CAMBIA
----------
La traduccion pasa de ser una regla a ser un DATO: una fila por alias, escrita
una vez, auditable, y con la obra decidida explicitamente. Lo que no esta en la
tabla no se adivina: no resuelve.

Las heuristicas no desaparecen del todo -- se degradan a AYUDA DE SIEMBRA. Se
usan una vez, al poblar la tabla, para proponer a que obra pertenece cada alias
observado; y lo que proponen de forma ambigua NO se escribe, se informa para que
lo decida una persona.

QUE NO HACE
-----------
No reescribe un solo alias historico. Los `model_urn` de las 36 tablas se quedan
exactamente como estan, para siempre. Esta tabla los TRADUCE; no los sustituye.

SOBRE `account_id`
------------------
Hoy vale siempre '' y significa «esta instancia». Es deliberado y esta aqui por
una razon concreta: hoy la frontera de aislamiento es FISICA (una instancia por
entidad), y mientras eso sea cierto no hace falta distinguir cuentas. Pero el
alias 'proyectos/EXPEDIENTE_TECNICO' es un nombre que dos entidades distintas
pueden usar a la vez, asi que el dia que dos cuentas compartan base, la unicidad
del alias tiene que ser POR CUENTA o se pisan.

Ponerlo ahora en la clave primaria cuesta cero y deja esa puerta abierta.
Ponerlo despues obliga a rehacer la clave primaria de la unica tabla de la que
depende toda la autorizacion. Es la decision de «instancia = entidad» hecha
explicita en vez de enterrada.
"""
import logging
import os

logger = logging.getLogger(__name__)

# Hoy: una instancia, una entidad. Ver el docstring.
CUENTA_DE_ESTA_INSTANCIA = ''

# Para que sirve cada tipo. No decide la busqueda -- la busqueda es por alias --
# pero dice de donde salio cada fila, que es lo que permite auditarla despues.
TIPOS = (
    'PROJECT',       # el propio projects.id
    'LEGACY_NAME',   # el nombre de la obra, tal cual
    'LEGACY_PATH',   # 'proyectos/NOMBRE', acunado por el navegador
    'MODEL',         # '<obra>_<MODELO>'
    'FRONT',         # '<obra>_<FRENTE>'
    'EXTERNAL',      # id de un sistema ajeno (ACC)
    'GLOBAL',        # el cajon sin obra
)

_TABLA = """
CREATE TABLE IF NOT EXISTS project_ref (
    account_id   TEXT NOT NULL DEFAULT '',
    alias        TEXT NOT NULL,
    kind         TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    model_code   TEXT,
    es_escritura BOOLEAN NOT NULL DEFAULT FALSE,
    origen       TEXT NOT NULL DEFAULT 'desconocido',
    creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, alias)
)
"""

# `es_escritura`: cual de los alias de una obra se usa para GUARDAR lo nuevo.
#
# POR QUE EXISTE. El navegador fabricaba el alcance a partir del nombre visible
# de la obra (frontend-react/src/App.jsx): `proyectos/${baseName}`. Eso tiene dos
# problemas -- renombrar la obra cambia el alcance de todo lo que se escriba
# despues, y dos entidades distintas con una obra del mismo nombre producen el
# mismo alias.
#
# La correccion evidente seria que el navegador mandase `projects.id`. NO SE
# PUEDE, y esto se midio antes de intentarlo: los documentos de la obra real
# viven bajo 'proyectos/PQT8_TALARA' -- `file_nodes`, `doc_sets`, `doc_rfis`,
# `doc_redlines`, `doc_reviews`, `transmittals`, `plan_entregas`,
# `doc_partidas`. Si lo nuevo se guardara bajo '1', el arbol documental QUEDARIA
# PARTIDO EN DOS: la obra seguiria teniendo su historia, y los usuarios verian
# una carpeta vacia al lado.
#
# Asi que el alcance de escritura no se deduce ni se cambia: se MIDE una vez
# (que alias usan de verdad los documentos de esa obra), se guarda, y el
# servidor se lo dice al cliente. Renombrar la obra deja de mover nada, y las
# obras NUEVAS -- que no tienen historia que partir -- escriben con su
# `projects.id`, que es inmutable. Lo viejo se conserva, lo nuevo no hereda el
# defecto.

_UNICO_ESCRITURA = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_ref_escritura
    ON project_ref(account_id, project_id) WHERE es_escritura
"""

_COLUMNA_ESCRITURA = """
ALTER TABLE project_ref ADD COLUMN IF NOT EXISTS es_escritura BOOLEAN NOT NULL DEFAULT FALSE
"""

# La clave primaria es (account_id, alias) y NO (account_id, kind, alias).
# Motivo: la busqueda llega con una cadena y sin tipo -- `resolve_project_id`
# recibe 'proyectos/PQT8_TALARA' y nada mas. Si el mismo alias pudiera existir
# bajo dos tipos apuntando a obras distintas, la busqueda por alias volveria a
# ser ambigua, que es justo lo que esta tabla existe para eliminar. `kind` es
# descriptivo.

_INDICE = """
CREATE INDEX IF NOT EXISTS idx_project_ref_project ON project_ref(project_id)
"""

_CLAVE_AJENA = """
ALTER TABLE project_ref ADD CONSTRAINT fk_project_ref_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
"""


def ensure_tabla_referencias():
    """Crea `project_ref`. Idempotente. Punto de entrada del bootstrap."""
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(_TABLA)
            cur.execute(_COLUMNA_ESCRITURA)   # para tablas creadas antes de que existiera
            cur.execute(_INDICE)
            cur.execute(_UNICO_ESCRITURA)
            conn.commit()
            cur.execute("SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_ref_project'")
            if not cur.fetchone():
                try:
                    cur.execute(_CLAVE_AJENA)
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning('[referencias] clave ajena no creada: %s', e)
            print('[DB] Tabla project_ref verificada/creada.')
    except Exception as e:
        print('Error creando project_ref: %s' % e)


# ── Escritura ──────────────────────────────────────────────────────────────

def anotar(cur, alias, project_id, kind, origen, model_code=None,
           account_id=CUENTA_DE_ESTA_INSTANCIA):
    """Registra un alias. NO pisa uno que ya exista.

    No sobrescribir es deliberado. Si un alias ya esta atribuido a una obra y
    llega otra atribucion distinta, eso no es una correccion automatica: es una
    contradiccion que alguien tiene que mirar. Pisarla en silencio moveria datos
    historicos de obra sin dejar rastro.

    Y «que alguien tiene que mirar» exige que alguien PUEDA mirarlo. Eso es lo
    que faltaba: el `ON CONFLICT DO NOTHING` descartaba la atribucion nueva sin
    dejar ni una linea, asi que la contradiccion que este docstring prometia
    sacar a la luz era invisible. La decision no cambia --sigue mandando la
    atribucion que ya estaba, que es lo correcto porque los datos historicos
    cuelgan de ella-- pero ahora se dice.

    El caso real: crear una segunda obra con el MISMO nombre que otra. Su alias
    por nombre se queda apuntando a la primera. La obra nueva funciona igual
    (resuelve y escribe por su propio `projects.id`, que es unico), pero quien
    la creo merece saber que su nombre ya estaba cogido.
    """
    if not alias or not project_id:
        return False
    cur.execute(
        'INSERT INTO project_ref (account_id, alias, kind, project_id, model_code, origen) '
        'VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (account_id, alias) DO NOTHING',
        (account_id, str(alias), kind, str(project_id), model_code, origen))
    if cur.rowcount > 0:
        return True
    de_quien = conflicto(cur, alias, project_id, account_id)
    if de_quien:
        logger.warning(
            '[referencias] el alias «%s» NO se atribuye a la obra %s: ya es de '
            '%s, y ahi se queda. La obra %s sigue resolviendo por su propio id.',
            alias, project_id, de_quien, project_id)
    return False


def conflicto(cur, alias, project_id, account_id=CUENTA_DE_ESTA_INSTANCIA):
    """¿Este alias ya esta atribuido a OTRA obra? Devuelve la obra o None."""
    cur.execute('SELECT project_id FROM project_ref WHERE account_id = %s AND alias = %s',
                (account_id, str(alias)))
    fila = cur.fetchone()
    if fila and fila[0] != str(project_id):
        return fila[0]
    return None


def marcar_escritura(cur, project_id, alias, account_id=CUENTA_DE_ESTA_INSTANCIA):
    """Fija cual de los alias de la obra se usa para guardar lo nuevo.

    Es exclusivo: una obra escribe en UN alcance. El indice unico parcial lo
    garantiza tambien en la base, no solo aqui.
    """
    cur.execute('UPDATE project_ref SET es_escritura = FALSE '
                ' WHERE account_id = %s AND project_id = %s AND es_escritura',
                (account_id, str(project_id)))
    cur.execute('UPDATE project_ref SET es_escritura = TRUE '
                ' WHERE account_id = %s AND alias = %s AND project_id = %s',
                (account_id, str(alias), str(project_id)))
    return cur.rowcount > 0


def scope_de_escritura(cur, project_id, account_id=CUENTA_DE_ESTA_INSTANCIA):
    """El alcance con el que hay que GUARDAR lo nuevo de esta obra.

    Si no hay ninguno marcado, el propio `projects.id`: es inmutable y es lo
    correcto para una obra que aun no tiene historia que respetar.
    """
    cur.execute('SELECT alias FROM project_ref '
                ' WHERE account_id = %s AND project_id = %s AND es_escritura',
                (account_id, str(project_id)))
    fila = cur.fetchone()
    return fila[0] if fila else str(project_id)


def mapa_de_escritura(cur, account_id=CUENTA_DE_ESTA_INSTANCIA):
    """{project_id: alias de escritura} de una sola consulta.

    Existe para no hacer una consulta por obra al construir la lista de obras,
    que es lo que pide la pantalla de aterrizaje.
    """
    try:
        cur.execute('SELECT project_id, alias FROM project_ref '
                    ' WHERE account_id = %s AND es_escritura', (account_id,))
        return dict(cur.fetchall())
    except Exception:
        return {}


def registrar_obra(cur, project_id, nombre=None, model_urn=None,
                   origen='alta de obra'):
    """Los alias que una obra tiene desde que nace.

    Se llama al CREAR una obra, para que no haya un momento en que exista una
    obra cuyos alias todavia no estan registrados -- ahi es donde reaparecerian
    las heuristicas.
    """
    hechos = []
    if anotar(cur, project_id, project_id, 'PROJECT', origen):
        hechos.append(project_id)
    if nombre:
        if anotar(cur, nombre, project_id, 'LEGACY_NAME', origen):
            hechos.append(nombre)
        ruta = 'proyectos/%s' % str(nombre).replace(' ', '_')
        if anotar(cur, ruta, project_id, 'LEGACY_PATH', origen):
            hechos.append(ruta)
    if model_urn and model_urn != project_id:
        tipo = 'EXTERNAL' if str(model_urn).startswith('b.') and '-' in str(model_urn) else 'PROJECT'
        if anotar(cur, model_urn, project_id, tipo, origen):
            hechos.append(model_urn)

    # Una obra que nace escribe con su propio id. No tiene historia que partir,
    # asi que no hay ninguna razon para heredar el alcance derivado del nombre.
    # Si ya tenia un alcance de escritura medido, no se toca.
    cur.execute('SELECT 1 FROM project_ref WHERE account_id = %s AND project_id = %s '
                '   AND es_escritura', (CUENTA_DE_ESTA_INSTANCIA, str(project_id)))
    if not cur.fetchone():
        marcar_escritura(cur, project_id, project_id)
    return hechos


# ── Lectura ────────────────────────────────────────────────────────────────

def cargar(cur, account_id=CUENTA_DE_ESTA_INSTANCIA):
    """{alias: project_id} y {alias: project_id} solo de los de tipo PROJECT."""
    cur.execute('SELECT alias, project_id, kind FROM project_ref WHERE account_id = %s',
                (account_id,))
    todos, proyectos = {}, {}
    for alias, pid, kind in cur.fetchall():
        todos[alias] = pid
        if kind == 'PROJECT':
            proyectos[alias] = pid
    return todos, proyectos
