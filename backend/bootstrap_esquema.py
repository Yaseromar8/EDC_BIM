# -*- coding: utf-8 -*-
"""Construye el esquema COMPLETO del ECD sobre una base vacia. Paso previo al despliegue.

PARA QUE SIRVE
--------------
Hasta ahora el esquema se construia solo, en caliente, desde el propio backend. Eso
obligaba a que la aplicacion tuviera permisos de administrador sobre la base, y
mientras eso siga siendo cierto no existe separacion real de identidades: el
"usuario de aplicacion" tendria que ser propietario de las tablas, y un propietario
es indistinguible de un administrador.

Este guion invierte el orden: PRIMERO se construye el esquema con la identidad de
migracion (ecd_migrator), y DESPUES arranca la aplicacion con una identidad que solo
puede leer y escribir DATOS.

    ecd_migrator  ->  python bootstrap_esquema.py        (una vez, antes de desplegar)
    ecd_app       ->  DDL_EN_CALIENTE=false  gunicorn ...

POR QUE REUTILIZA EL CODIGO EXISTENTE
-------------------------------------
Las funciones ensure_*/asegurar_* son idempotentes y son el UNICO sitio donde vive la
definicion del esquema, ademas de estar probadas contra la base real. Reescribirlas
como migraciones antes de poder separar identidades convertiria una correccion de
seguridad en un proyecto de meses. Aqui se ejecutan tal cual, con el DDL habilitado a
proposito mediante `permitir_ddl()`.

EL ORDEN NO ES ARBITRARIO
-------------------------
Los 22 primeros pasos son EXACTAMENTE los de `_run_schema_setup()` en server.py, en
su mismo orden, que es el que funciona contra una base vacia: `esquema_base` va
primero porque crea projects, users, hubs y sessions, y sin ellas todo lo demas falla
en cascada. Detras van las rutinas que server.py NO invoca y que hoy solo se ejecutan
si alguien entra por su ruta: son las que hacen que una base recien creada quede
incompleta hasta que se usa.

USO
    python bootstrap_esquema.py [--verificar]

    --verificar   no construye: solo comprueba que no falte nada y que la aplicacion
                  no necesite DDL. Devuelve codigo 1 si algo falta.

VALVULA DE EMERGENCIA
    ESQUEMA_ESTRICTO=false  arranca aunque falte algo, gritandolo en el log.
    No es para uso normal: es para la noche en que hay que servir igual y
    reparar despues. Quitala en cuanto se repare.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _rutinas():
    """(nombre, funcion) en orden de dependencia. Import perezoso: algunos modulos
    tocan servicios externos al importarse y no deben cargarse si no hacen falta."""
    from db import (ensure_file_nodes_table, ensure_ai_brain_schema, ensure_rfi_schema,
                    ensure_redline_schema, ensure_partidas_schema,
                    ensure_asset_user_data_table, ensure_project_identity_columns)
    from esquema_base import ensure_esquema_base, ensure_columnas_pendientes
    from routes.presupuesto import ensure_presupuesto_schema
    from routes.pdf_tools import ensure_pdf_tools_tables
    from routes.reviews import ensure_reviews_table
    from routes.transmittals import ensure_transmittals_table
    from routes.attributes import ensure_attributes_tables
    from routes.sets import ensure_sets_tables
    from routes.element_docs import ensure_element_docs_table
    from routes.inventory import ensure_extraction_jobs_table, ensure_inventory_identity
    from routes.lob4d import ensure_lob4d_tables
    from routes.civil_design_automation import ensure_civil_alignments_table
    from routes.digital_twin import ensure_frentes_table, ensure_model_config_table
    from routes.documents import _ensure_share_revoked_column

    # Las que server.py NO invoca: hoy dependen de que alguien entre por su ruta.
    from routes.auth import ensure_users_tables
    from routes.projects import ensure_projects_schema
    from routes.pins import ensure_pins_table
    from routes.views import ensure_saved_views_table
    from routes.geo_control import ensure_geo_tables
    from routes.tracking import ensure_tracking_pins_table
    from routes.civil_solids import ensure_civil_surfaces_table
    from routes.link import _ensure_tables as ensure_link_tables
    from routes.dashboards import _ensure_tables as ensure_dashboards_tables
    from routes.ai import _asegurar_tabla_cache as ensure_cache_ia
    from folder_permissions import init_folder_permissions_table
    from db import ensure_reglas_del_rfi
    from integridad_referencial import ensure_claves_ajenas
    from referencias_de_obra import ensure_tabla_referencias
    from directorio_de_obra import ensure_directorio
    from encargos import ensure_encargos

    return [
        # ── Los 22 de server.py, en su orden ─────────────────────────────
        ('esquema_base', ensure_esquema_base),
        ('file_nodes', ensure_file_nodes_table),
        ('ai_brain', ensure_ai_brain_schema),
        ('rfi', ensure_rfi_schema),
        ('redline', ensure_redline_schema),
        ('partidas', ensure_partidas_schema),
        ('presupuesto', ensure_presupuesto_schema),
        ('asset_user_data', ensure_asset_user_data_table),
        ('pdf_tools', ensure_pdf_tools_tables),
        ('reviews', ensure_reviews_table),
        ('transmittals', ensure_transmittals_table),
        ('attributes', ensure_attributes_tables),
        ('sets', ensure_sets_tables),
        ('element_docs', ensure_element_docs_table),
        ('extraction_jobs', ensure_extraction_jobs_table),
        ('inventory_identity', ensure_inventory_identity),
        ('lob4d', ensure_lob4d_tables),
        ('civil_alignments', ensure_civil_alignments_table),
        ('frentes', ensure_frentes_table),
        ('share_revoked', _ensure_share_revoked_column),
        # ── Las que faltaban: DDL que hoy solo corre bajo demanda ────────
        ('users', ensure_users_tables),
        ('projects_schema', ensure_projects_schema),
        ('pins', ensure_pins_table),
        ('saved_views', ensure_saved_views_table),
        ('geo_control', ensure_geo_tables),
        ('tracking_pins', ensure_tracking_pins_table),
        ('civil_surfaces', ensure_civil_surfaces_table),
        ('model_config', ensure_model_config_table),
        ('link', ensure_link_tables),
        # ── Las tres que se descubrieron el 17-ago, al ir a apagar el DDL ──
        # No las invocaba nadie desde aqui: sus tablas e indices solo nacian
        # cuando alguien entraba por su ruta. Con el DDL congelado eso deja de
        # ocurrir, y una base restaurada se quedaba sin ellas para siempre.
        # `ia_documentos_preparados` ademas estaba EXCLUIDA de la prueba
        # guardiana con el motivo de que pertenecia al esquema `ai_brain` y que
        # «el bootstrap SI las crea». Las otras tres de esa lista van
        # cualificadas (`ai_brain.global_knowledge`, etc.); esta no: cae en
        # `public`. La exclusion tapaba precisamente el unico hueco real.
        ('permisos_de_carpeta', init_folder_permissions_table),
        ('dashboards', ensure_dashboards_tables),
        ('cache_ia', ensure_cache_ia),
        # ── Catalogos por obra: crean su tabla la primera vez ────────────
        ('nomenclatura', _tabla_nomenclatura),
        ('sensibilidad', _tablas_sensibilidad),
        ('idoneidad', _tabla_idoneidad),
        ('segundo_factor', _columnas_segundo_factor),
        ('alembic_version', _tabla_alembic),
        ('plan_de_entrega', _tabla_plan_de_entrega),
        ('emisiones', _tabla_emisiones),
        ('eje_base', _tabla_eje_base),
        # ── AL FINAL: columnas sueltas que necesitan sus tablas creadas ──
        # `project_identity` estaba arriba, antes que `tracking_pins`, y su
        # indice sobre esa tabla se perdia en silencio (la rutina se traga el
        # error). Lo que anade columnas e indices a tablas AJENAS va al final,
        # por definicion: no puede correr antes que quien las crea.
        ('project_identity', ensure_project_identity_columns),
        ('columnas_pendientes', ensure_columnas_pendientes),
        # `project_ref` traduce cada alias historico a su obra. Necesita
        # `projects` creada, porque cuelga de ella con una clave ajena.
        ('referencias_de_obra', ensure_tabla_referencias),
        # El directorio cuelga de `projects` y de `companies`; los encargos
        # de `projects` y de `users`. Van despues de que existan.
        ('directorio_de_obra', ensure_directorio),
        ('encargos', ensure_encargos),
        # Las claves ajenas van LAS ULTIMAS: no se puede referenciar una
        # tabla que todavia no existe.
        # Las reglas del RFI referencian `projects` y `users`: van con las
        # claves ajenas, al final, no donde se crea su tabla.
        ('reglas_del_rfi', ensure_reglas_del_rfi),
        ('integridad_referencial', ensure_claves_ajenas),
    ]


def _tabla_nomenclatura():
    import nomenclatura
    from db import get_db_connection
    with get_db_connection() as conn:
        nomenclatura.asegurar_tabla(conn.cursor())
        conn.commit()


def _tablas_sensibilidad():
    import sensibilidad
    from db import get_db_connection
    with get_db_connection() as conn:
        sensibilidad.asegurar_tablas(conn.cursor())
        conn.commit()


def _tabla_idoneidad():
    import idoneidad
    from db import get_db_connection
    with get_db_connection() as conn:
        idoneidad.asegurar_tabla(conn.cursor())
        conn.commit()


def _tabla_eje_base():
    """El eje base por frente. Su DDL vivia SOLO dentro del manejador HTTP, asi
    que una base restaurada no tenia la tabla hasta que alguien abria el visor y
    fijaba un eje -- y con el DDL en caliente apagado, nunca."""
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS civil_base_axis (
            scope TEXT PRIMARY KEY,
            pin JSONB,
            model_urn TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )''')
        cur.execute('ALTER TABLE civil_base_axis ADD COLUMN IF NOT EXISTS model_urn TEXT')
        conn.commit()


def _tabla_emisiones():
    import estados_ecd
    from db import get_db_connection
    with get_db_connection() as conn:
        estados_ecd.asegurar_tabla_emisiones(conn.cursor())
        conn.commit()


def _tabla_plan_de_entrega():
    import plan_de_entrega
    from db import get_db_connection
    with get_db_connection() as conn:
        plan_de_entrega.asegurar_tablas(conn.cursor())
        conn.commit()


def _tabla_alembic():
    """La libreta de Alembic. La crea Alembic, y por eso no volvia.

    Medido el 20-ago-2026, ensayando la restauracion de la copia REAL de
    produccion: 83.409 de 83.410 filas volvieron, y la que faltaba era esta --
    `alembic_version`, una sola fila con la revision en la que va la base
    (`0004_lob_linear_standard`). El constructor levanta el esquema desde las
    rutinas `ensure_*`, que no incluyen la contabilidad de Alembic, asi que la
    tabla no existia y la fila no tenia donde entrar.

    No afecta al expediente: no se perdio ni un documento. Importa el dia que
    alguien ejecute Alembic sobre una base restaurada, porque sin esta fila
    creeria que esta a cero y volveria a aplicar las migraciones desde el
    principio.

    Se crea VACIA. El valor lo pone la restauracion, que es quien lo sabe:
    inventarlo aqui seria afirmar una revision que quiza no es la suya.
    """
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alembic_version (
                version_num VARCHAR(32) NOT NULL,
                CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
            )""")
        conn.commit()


def _columnas_segundo_factor():
    import segundo_factor
    from db import get_db_connection
    with get_db_connection() as conn:
        segundo_factor.asegurar_columnas(conn.cursor())
        conn.commit()


def construir():
    """Ejecuta todas las rutinas con el DDL habilitado. Devuelve la lista de fallos."""
    from esquema_congelado import permitir_ddl
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()

    fallos = []
    inicio = time.time()
    with permitir_ddl():
        for nombre, fn in _rutinas():
            t0 = time.time()
            try:
                fn()
            except Exception as e:
                fallos.append((nombre, str(e)[:200]))
                print('  FALLO   %-20s %s' % (nombre, str(e)[:120]), flush=True)
                continue
            print('  ok      %-20s %.2fs' % (nombre, time.time() - t0), flush=True)
    print('\nesquema construido en %.1f s · %d fallos' % (time.time() - inicio, len(fallos)))
    return fallos


def exigir_identidad_migrador():
    """Impide construir objetos con la identidad permanente de la aplicacion.

    No basta con que Render declare ``DB_USER=ecd_migrator``: la prueba que
    importa es la identidad que PostgreSQL autentico. Si este control falla se
    detiene ANTES de ejecutar la primera sentencia DDL.
    """
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()
    with _db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT current_user')
        actual = cur.fetchone()[0]
    if actual != 'ecd_migrator':
        raise RuntimeError(
            'bootstrap constructor rechazado: PostgreSQL autentico como %s; '
            'se exige ecd_migrator' % actual)
    print('identidad de migracion verificada: ecd_migrator')


def aplicar_grants_aplicacion():
    """Concede al runtime acceso a datos, nunca DDL, tras cada migracion.

    Los permisos por defecto protegen objetos futuros, pero solo a partir del
    momento en que se instalaron. Ejecutar tambien los GRANT sobre todos los
    objetos existentes hace que este paso sea idempotente y cubra una base que
    se esta convergiendo por primera vez.
    """
    import db as _db
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'sql', '03_grants_ida.sql')
    with open(ruta, encoding='utf-8') as f:
        sql = f.read()
    if any(line.lstrip().startswith('\\') for line in sql.splitlines()):
        raise RuntimeError('03_grants_ida.sql contiene una orden exclusiva de psql')
    with _db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
    print('permisos de ecd_app aplicados: datos SI, DDL NO')


def _manifiesto():
    """Las tablas que un bootstrap completo deja construidas."""
    import io as _io
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'esquema_manifiesto.txt')
    try:
        return {l.strip().lower() for l in _io.open(ruta, encoding='utf-8')
                if l.strip() and not l.startswith('#')}
    except OSError:
        return set()


# ── El manifiesto de OBJETOS, no solo de tablas ────────────────────────────
# POR QUE EXISTE ESTE SEGUNDO FICHERO
# -----------------------------------
# La primera version de verificar() comparaba TABLAS y nada mas, y por eso pudo
# imprimir «88 de 88 · el esquema quedo COMPLETO» sobre una base a la que le
# faltaba `totp_recuperacion.pimienta`. La tabla estaba; la columna no. Resultado
# medido: activar el segundo factor devolvia HTTP 500, y el fallo no aparecia el
# dia del despliegue sino meses despues, el dia que un administrador intenta
# protegerse la cuenta. Contar tablas es contar cajas sin mirar dentro.
#
# Lo que se exige aqui es el esquema MINIMO PARA OPERAR: tablas, columnas,
# restricciones, indices, funciones y extensiones. Se genera midiendo una
# reconstruccion real sobre una base vacia (--regenerar-manifiesto), igual que el
# de tablas, para que no se escriba a mano ni se quede atras solo.
_TIPOS = ('tabla', 'columna', 'restriccion', 'indice', 'funcion', 'extension')
_PLURAL = {'tabla': 'tablas', 'columna': 'columnas', 'restriccion': 'restricciones',
           'indice': 'indices', 'funcion': 'funciones', 'extension': 'extensiones'}

_CONSULTAS = {
    'tabla': """SELECT tablename FROM pg_tables
                 WHERE schemaname IN ('public','ai_brain')""",
    # EL CATALOGO, NO information_schema.
    # `information_schema` FILTRA POR PRIVILEGIOS: solo enseña las columnas de las
    # tablas sobre las que el usuario actual tiene algo concedido. Medido: contra
    # la base de desarrollo, `ecd_app` no tiene permiso sobre el esquema
    # `ai_brain`, asi que information_schema devolvia CERO columnas de
    # global_knowledge, semantic_triples y feedback_buffer -- y esta comprobacion
    # cantaba 26 columnas ausentes que estaban perfectamente ahi. Es decir,
    # tomaba la separacion de identidades por un esquema roto y habria tumbado el
    # despliegue justo por hacer las cosas bien. `pg_attribute` es el catalogo y
    # no filtra: dice lo que hay, lo pueda leer quien pregunta o no.
    'columna': """SELECT c.relname || '.' || a.attname
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    JOIN pg_attribute a ON a.attrelid = c.oid
                   WHERE n.nspname IN ('public','ai_brain')
                     AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped""",
    # POR LA DEFINICION, NO POR EL NOMBRE.
    # Una misma regla puede llamarse de dos maneras segun como nacio la tabla.
    # Paso de verdad, y tumbo el despliegue de produccion el 20-ago-2026:
    #   base nueva  -> `UNIQUE (model_urn, external_id)` dentro del CREATE TABLE
    #                  (esquema_base.py:241), y Postgres la autonombra
    #                  `inventory_assets_model_urn_external_id_key`
    #   produccion  -> la misma regla puesta despues por una migracion con nombre
    #                  explicito, `inventory_assets_modelext_key`
    #                  (routes/inventory.py:50)
    # Misma garantia, dos nombres. Comparando nombres, produccion "faltaba" algo
    # que tenia, y el arranque se nego a servir. Comparando la DEFINICION, las dos
    # dicen `UNIQUE (model_urn, external_id)` y son lo que son: iguales.
    'restriccion': """SELECT c.conrelid::regclass::text || ' ' || pg_get_constraintdef(c.oid)
                        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                       WHERE n.nspname IN ('public','ai_brain')""",
    # Igual con los indices, y ademas uno de UNIQUE hereda el nombre de su
    # restriccion, asi que arrastraba el mismo falso positivo. Se quita el nombre
    # de la sentencia y queda lo unico que importa: sobre que tabla y por que
    # columnas.
    'indice': """SELECT regexp_replace(indexdef, ' INDEX [^ ]+ ON ', ' INDEX ON ')
                   FROM pg_indexes WHERE schemaname IN ('public','ai_brain')""",
    'funcion': """SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public'""",
    'extension': "SELECT extname FROM pg_extension",
}

_FICHERO_OBJETOS = 'esquema_objetos.txt'

# OBJETOS QUE SOLO EXISTEN SI SU INTERRUPTOR ESTA PUESTO.
# El manifiesto se congela midiendo una base construida con la configuracion
# recomendada, asi que un objeto condicional queda dentro como si fuera
# obligatorio siempre. Medido: el CHECK de estados solo lo crea
# ECD_CANDADO_ESTADOS=true, y exigirlo sin mirar el interruptor tumbaba la
# comprobacion en cualquier instancia que legitimamente corra sin el.
# Exigir de mas es tan malo como exigir de menos: la primera vez que una
# comprobacion falla por algo que no esta mal, se empieza a ignorar.
# (tipo, fragmento que lo identifica, interruptor que lo enciende)
_CONDICIONALES = (
    ('restriccion', "file_nodes CHECK (((status)::text = ANY", 'ECD_CANDADO_ESTADOS'),
)


def _exigible(tipo, nombre):
    """¿Este objeto hace falta con la configuracion de AHORA?

    SIN MIRAR MAYUSCULAS. Los manifiestos se guardan y se comparan en
    minusculas, asi que un fragmento escrito con la mayuscula de SQL --CHECK,
    ANY, ARRAY-- no casaba NUNCA y el objeto condicional se exigia siempre.
    Volvio a tumbar el despliegue de produccion el 20-ago-2026, y la prueba no
    lo vio porque le pasaba el fragmento a mano, en mayusculas, en vez del valor
    que produce el propio inventario.
    """
    nombre = (nombre or '').lower()
    for t, fragmento, interruptor in _CONDICIONALES:
        if t == tipo and fragmento.lower() in nombre:
            return (os.getenv(interruptor) or '').strip().lower() in ('true', '1', 'yes')
    return True


def _ruta(nombre):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), nombre)


def _objetos_esperados():
    """Lee `esquema_objetos.txt`. Formato: `tipo<TAB>nombre`, una linea por objeto."""
    import io as _io
    esperado = {t: set() for t in _TIPOS}
    try:
        for linea in _io.open(_ruta(_FICHERO_OBJETOS), encoding='utf-8'):
            linea = linea.strip()
            if not linea or linea.startswith('#'):
                continue
            partes = linea.split('\t', 1)
            if len(partes) == 2 and partes[0] in esperado:
                esperado[partes[0]].add(partes[1].strip().lower())
    except OSError:
        return None
    return esperado


def _objetos_presentes(cur):
    presente = {}
    for tipo, sql in _CONSULTAS.items():
        cur.execute(sql)
        presente[tipo] = {r[0].lower() for r in cur.fetchall()}
    return presente


def verificar():
    """Comprueba que el esquema esta completo. Devuelve (completo, faltan).

    No se fia de que las rutinas 'no fallaran': mira los objetos que de verdad
    quedaron en la base. Una rutina puede tragarse su propia excepcion y dejar la
    tabla sin crear, y eso solo se ve mirando.

    Y no cuenta: COMPARA CON NOMBRE contra los manifiestos. Contar engaña -- 81
    tablas suena a completo y puede faltar justo `file_nodes`, que es lo unico que
    importa. La primera version contaba, e imprimia «resolve_folder_path: FALTA»
    mientras devolvia codigo 0: una comprobacion que siempre dice que si no es una
    comprobacion.

    Y no mira solo tablas: una tabla presente con una columna ausente es un fallo
    DIFERIDO, que es la peor clase. Ver el comentario de _TIPOS.
    """
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        presente = _objetos_presentes(cur)

    esperadas_tablas = _manifiesto()
    esperado = _objetos_esperados()

    faltan_por_tipo = {}
    if esperado is None:
        # Sin el manifiesto de objetos se comprueba lo de siempre, y SE DICE.
        # Callarselo seria repetir el «COMPLETO» que no comprobaba nada.
        print('AVISO: no se encuentra %s -- solo se comprueban tablas.' % _FICHERO_OBJETOS)
        faltan_por_tipo['tabla'] = sorted(esperadas_tablas - presente['tabla']) if esperadas_tablas else []
    else:
        if esperadas_tablas:
            esperado['tabla'] |= esperadas_tablas
        for tipo in _TIPOS:
            faltan_por_tipo[tipo] = sorted(n for n in (esperado[tipo] - presente[tipo])
                                           if _exigible(tipo, n))

    for tipo in _TIPOS:
        if tipo not in faltan_por_tipo:
            continue
        total = len(esperado[tipo]) if esperado else len(esperadas_tablas)
        faltan_n = len(faltan_por_tipo[tipo])
        print('%-14s : %d de %d%s' % (_PLURAL[tipo], total - faltan_n, total,
                                      '   *** FALTAN %d ***' % faltan_n if faltan_n else ''))

    todo_lo_que_falta = []
    for tipo in _TIPOS:
        for n in faltan_por_tipo.get(tipo, []):
            todo_lo_que_falta.append('%s %s' % (tipo, n))

    if todo_lo_que_falta:
        print('')
        print('FALTAN %d OBJETO(S) OBLIGATORIO(S):' % len(todo_lo_que_falta))
        for n in todo_lo_que_falta[:60]:
            print('   ·', n)
        if len(todo_lo_que_falta) > 60:
            print('   ... y %d mas' % (len(todo_lo_que_falta) - 60))

    return (not todo_lo_que_falta), todo_lo_que_falta


def regenerar_manifiesto():
    """Congela el esquema que hay AHORA como el minimo exigible.

    Se ejecuta contra una base recien construida por este mismo guion sobre un
    espacio VACIO, y con la configuracion recomendada para una instancia nueva.
    Regenerarlo contra una base cualquiera congelaria sus taras.
    """
    import io as _io
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()
    from db import get_db_connection
    with get_db_connection() as conn:
        presente = _objetos_presentes(conn.cursor())

    lineas = ['# Esquema MINIMO para operar una instancia. Tablas, columnas,',
              '# restricciones, indices, funciones y extensiones.',
              '# No se edita a mano: se regenera midiendo una reconstruccion real',
              '# sobre una base VACIA:  python bootstrap_esquema.py --regenerar-manifiesto',
              '']
    for tipo in _TIPOS:
        for nombre in sorted(presente[tipo]):
            lineas.append('%s\t%s' % (tipo, nombre))
    _io.open(_ruta(_FICHERO_OBJETOS), 'w', encoding='utf-8').write('\n'.join(lineas) + '\n')

    _io.open(_ruta('esquema_manifiesto.txt'), 'w', encoding='utf-8').write(
        '# Tablas que deja construidas `python bootstrap_esquema.py`.\n'
        '# Generado midiendo una reconstruccion real en un espacio vacio.\n'
        '# No se edita a mano: se regenera cuando cambia el esquema.\n\n'
        + '\n'.join(sorted(presente['tabla'])) + '\n')

    for tipo in _TIPOS:
        print('  %-14s %d' % (_PLURAL[tipo], len(presente[tipo])))
    print('manifiestos regenerados.')


def _codigo_de_salida(completo):
    """0 o 1, y la valvula de emergencia.

    POR DEFECTO BLOQUEA, Y ESO NO SE TOCA. Un servicio que arranca sobre un
    esquema que no es el que su codigo espera hace daño en silencio: asi
    aparecio el HTTP 500 del segundo factor, meses despues de desplegarse.

    Pero `ESQUEMA_ESTRICTO=false` existe, y existe a proposito. El 20-ago-2026
    esta comprobacion bloqueo DOS despliegues seguidos por dos errores MIOS --
    comparar nombres de restricciones autogenerados, y comparar mayusculas con
    minusculas-- sin que hubiera un solo problema real en la base. A las once de
    la noche, con un cliente esperando, alguien tiene que poder decir «arranca
    igual, yo asumo». Lo que no seria profesional es que eso fuera el defecto.

    Por eso, cuando la valvula esta abierta, se grita en CADA arranque: una
    excepcion silenciosa deja de ser excepcion y pasa a ser la nueva normalidad.
    """
    if completo:
        return 0
    if (os.getenv('ESQUEMA_ESTRICTO') or 'true').strip().lower() in ('false', '0', 'no'):
        print('')
        print('!' * 70)
        print('!!  ESQUEMA INCOMPLETO Y SE ARRANCA IGUAL (ESQUEMA_ESTRICTO=false).')
        print('!!  Los objetos de arriba NO estan. Lo que dependa de ellos fallara,')
        print('!!  y fallara mas tarde y peor que aqui. Esto es una excepcion')
        print('!!  temporal: quita la variable en cuanto se reparen.')
        print('!' * 70)
        return 0
    return 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Construye el esquema del ECD. No mueve datos.')
    ap.add_argument('--verificar', action='store_true',
                    help='solo comprobar, sin construir')
    ap.add_argument('--regenerar-manifiesto', action='store_true',
                    help='congela el esquema actual como el minimo exigible '
                         '(solo sobre una base recien construida desde vacio)')
    a = ap.parse_args()
    if a.regenerar_manifiesto:
        regenerar_manifiesto()
        raise SystemExit(0)
    if a.verificar:
        completo, _faltan = verificar()
        # Lo que el propio guion promete en su ayuda: codigo 1 si algo falta.
        # Devolver siempre 0 convertia esto en un adorno -- y si alguien lo
        # enchufa a un despliegue o a integracion continua, en un adorno que
        # ademas da tranquilidad falsa.
        raise SystemExit(_codigo_de_salida(completo))
    try:
        exigir_identidad_migrador()
    except Exception as e:
        print('FALLO DE IDENTIDAD: %s' % e)
        raise SystemExit(1)
    print('BOOTSTRAP DEL ESQUEMA · destino: %s' % os.getenv('DB_HOST'))
    fallos = construir()
    print()
    completo, _faltan = verificar()
    grants_ok = False
    if completo:
        try:
            aplicar_grants_aplicacion()
            grants_ok = True
        except Exception as e:
            print('FALLO DE PERMISOS: %s' % e)

    # LO QUE DECIDE EL CODIGO DE SALIDA ES EL RESULTADO, NO EL PROCESO.
    #
    # Una rutina puede fallar por algo CORRECTO: con las identidades separadas,
    # `ecd_app` no es dueña de todas las tablas y sus ALTER son rechazados. Eso
    # es exactamente lo que se persigue, y medido en local da 8 «fallos» con el
    # esquema COMPLETO (87 de 87). Si el codigo de salida mirara los fallos, este
    # guion tumbaria cada despliegue justo cuando la separacion empiece a
    # funcionar -- castigando la correccion.
    #
    # Al reves tambien seria malo: dar por bueno un esquema incompleto porque
    # ninguna rutina «fallo» es como se llego al agujero de N57, donde una
    # funcion se tragaba su error y dejaba sin crear medio ECD.
    #
    # Asi que la pregunta es una sola: ¿ESTA EL ESQUEMA COMPLETO? Los fallos se
    # imprimen siempre, uno a uno, para que se puedan leer en el log.
    if fallos and completo:
        print('')
        print('%d rutina(s) fallaron pero el esquema quedo COMPLETO.' % len(fallos))
        print('Normalmente significa que esta identidad no es dueña de esas '
              'tablas, que es lo correcto. Revisa las lineas FALLO de arriba.')
    if completo and not grants_ok:
        raise SystemExit(1)
    raise SystemExit(_codigo_de_salida(completo))
