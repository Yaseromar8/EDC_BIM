from esquema_congelado import solo_con_ddl
import os
import psycopg2
from psycopg2 import pool, extras
from contextlib import contextmanager
from app_logging import get_logger

logger = get_logger('db')

# Definimos un Connection Pool global
db_pool = None

# LAS OPCIONES DE CONEXION, EN UN SITIO Y NO DENTRO DE UNA LLAMADA.
#
# statement_timeout: ninguna consulta puede colgarse mas de 30 s.
# lock_timeout: y ninguna espera mas de 5 s por un LOCK. Sin esto, un DDL del
# arranque que choca con otra transaccion espera PARA SIEMPRE: gunicorn abre el
# puerto pero el worker nunca termina de importar, y el servicio acepta
# conexiones sin responder jamas.
#
# Estan aqui arriba porque la convergencia de propiedad necesita AÑADIR una
# opcion (`-c role=ecd_migrator`) sin PERDER estas. Escribirlas otra vez alli
# habria creado dos verdades que divergen en cuanto alguien toque una.
OPCIONES_DE_CONEXION = '-c statement_timeout=30000 -c lock_timeout=5000'


def init_db_pool(opciones=None):
    """Abre el pool. `opciones` SOLO lo usa la convergencia de propiedad.

    POR QUE UN PARAMETRO Y NO LA VARIABLE `PGOPTIONS`
    -------------------------------------------------
    Porque no funciona. libpq da precedencia al parametro `options` de la
    conexion sobre la variable de entorno, y aqui SIEMPRE se pasa uno. Medido el
    21-ago-2026 con el mismo `PGOPTIONS='-c role=ecd_migrator'` en los tres casos:

        sin `options=`                 -> ('postgres', 'ecd_migrator')
        con `options=` (lo de aqui)    -> ('postgres', 'postgres')     <-- se ignora
        con `options=` incluyendo role -> ('postgres', 'ecd_migrator')

    `converger_propiedad.py` dependia de `PGOPTIONS` y por eso su migracion
    corria como `postgres`; la guardia `exigir_identidad_migrador` lo detectaba y
    abortaba -- despues de que la transaccion de propiedad ya hubiera confirmado.

    Sin argumento, el comportamiento es exactamente el de siempre: NINGUNA
    conexion ordinaria recibe `SET ROLE`.
    """
    global db_pool
    if db_pool is not None:
        return
    try:
        # ── TCP KEEPALIVE: Evita que firewalls de Cloud SQL maten conexiones idle ──
        # keepalives=1         → Activa TCP keepalive
        # keepalives_idle=30   → Envía primer probe después de 30s de inactividad
        # keepalives_interval=10 → Re-intenta cada 10s
        # keepalives_count=3   → Declara muerta después de 3 fallos (30+30=60s max)
        db_pool = psycopg2.pool.ThreadedConnectionPool(
            2, 15,  # Min 2, Max 15 conexiones
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME"),
            connect_timeout=10,
            options=(opciones or OPCIONES_DE_CONEXION),
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3
        )
        logger.info("Pool PostgreSQL inicializado (Min:2, Max:15, Keepalive:ON)")
    except Exception as e:
        logger.critical(f"Error iniciando Pool SQL a {os.environ.get('DB_HOST')}: {e}")
        import traceback
        traceback.print_exc()


def _is_conn_alive(conn):
    """Verifica si una conexión PostgreSQL sigue viva. Rápido y no-destructivo."""
    if conn is None or conn.closed:
        return False
    try:
        # Usar status check primero (sin roundtrip de red)
        if conn.status == psycopg2.extensions.STATUS_READY:
            return True
        # Si está en transacción "idle in transaction", hacer rollback
        if conn.status != psycopg2.extensions.STATUS_BEGIN:
            conn.reset()
            return True
        # Probar con un query real ultra ligero
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        return True
    except Exception:
        return False


@contextmanager
def get_db_connection():
    """
    Context manager robusto para obtener una conexión sana del pool.
    - Verifica que la conexión esté viva antes de entregarla
    - Si la conexión está muerta, la descarta y obtiene otra
    - Siempre devuelve la conexión al pool (o la descarta si falló)
    """
    global db_pool
    if db_pool is None:
        init_db_pool()
        
    if db_pool is None:
        raise Exception("El pool de conexiones no está inicializado.")

    conn = None
    conn_is_good = True
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            conn = db_pool.getconn()
            
            # ── HEALTH CHECK: Verificar que la conexión está viva ──
            if not _is_conn_alive(conn):
                print(f"[DB] Conexión stale detectada (intento {attempt+1}/{max_retries}), descartando...")
                try:
                    db_pool.putconn(conn, close=True)  # Cerrar y descartar
                except Exception:
                    pass
                conn = None
                continue
            
            # Conexión sana — usarla
            break
            
        except pool.PoolError as e:
            logger.warning(f"Pool agotado (intento {attempt+1}/{max_retries}): {e}")
            conn = None
            if attempt == max_retries - 1:
                raise Exception(f"No hay conexiones disponibles en el pool: {e}")
            import time
            time.sleep(0.5)  # Esperar medio segundo antes de reintentar
    
    if conn is None:
        raise Exception("No se pudo obtener una conexión sana del pool después de reintentos.")

    try:
        yield conn
    except Exception as e:
        conn_is_good = False
        logger.error(f"Error de Base de Datos: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
    finally:
        if conn and db_pool:
            try:
                if conn_is_good and not conn.closed:
                    # Resetear la conexión a estado limpio antes de devolverla
                    if conn.status != psycopg2.extensions.STATUS_READY:
                        conn.rollback()
                    db_pool.putconn(conn)
                else:
                    # Conexión dañada — cerrar y descartar
                    db_pool.putconn(conn, close=True)
            except Exception:
                try:
                    db_pool.putconn(conn, close=True)
                except Exception:
                    pass

@solo_con_ddl
def _columnas_que_el_listado_necesita():
    """Las columnas nuevas, ANTES y APARTE del resto del esquema.

    El listado de carpetas ya pide codigo_idoneidad, codigo_revision y
    nomenclatura_ok. Como todo el esquema maestro va en UNA transaccion, si algo
    fallaba por el camino -- por ejemplo el lock_timeout de 5 s esperando a que
    otro worker suelte file_nodes -- se deshacia entero, las columnas no
    aparecian, y el portal se quedaba sin poder listar ni una carpeta.

    Son cuatro ALTER baratos y idempotentes: van primero y con su propio commit,
    de modo que lo demas puede fallar sin llevarse por delante lo basico.
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("ALTER TABLE IF EXISTS file_nodes "
                        "ADD COLUMN IF NOT EXISTS nomenclatura_ok BOOLEAN;")
            for tabla in ('file_nodes', 'file_versions'):
                cur.execute(f"ALTER TABLE IF EXISTS {tabla} "
                            f"ADD COLUMN IF NOT EXISTS codigo_idoneidad VARCHAR(10);")
                cur.execute(f"ALTER TABLE IF EXISTS {tabla} "
                            f"ADD COLUMN IF NOT EXISTS codigo_revision VARCHAR(10);")
            conn.commit()
    except Exception as e:
        logger.warning(f"no se pudieron asegurar las columnas del listado: {e}")


@solo_con_ddl
def ensure_file_nodes_table():
    """Crea la tabla maestra de archivos/carpetas e indices de rendimiento."""
    _columnas_que_el_listado_necesita()
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Habilitamos pgcrypto para gen_random_uuid()
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')
            
            # ── 1. Tabla maestra de archivos y carpetas ────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS file_nodes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    parent_id UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
                    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('FOLDER', 'FILE')),
                    name VARCHAR(255) NOT NULL,
                    folder_type VARCHAR(50),
                    gcs_urn TEXT,
                    size_bytes BIGINT,
                    version_number INTEGER DEFAULT 1,
                    created_by VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    mime_type VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, REVIEW, APPROVED, ARCHIVED
                    tags TEXT[],                        -- Array de etiquetas (Postgres)
                    metadata JSONB DEFAULT '{}',        -- Para datos extra de ingenieria
                    current_version_id UUID             -- Puntero a la version actual activa
                );
            """)
            
            # ── 1.1 Tabla Histórica de Versiones (ESTILO ACC / PROFESIONAL) ──
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS file_versions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    file_node_id UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
                    version_number INTEGER NOT NULL,
                    gcs_urn TEXT NOT NULL,
                    size_bytes BIGINT,
                    mime_type VARCHAR(100),
                    metadata JSONB DEFAULT '{}',        -- Atributos especificos de la version
                    created_by VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Migraciones incrementales
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS tags TEXT[];")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS description TEXT;")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS current_version_id UUID;")

            # ── 1.2 UN SOLO VOCABULARIO DE ESTADO ────────────────────────────
            # Convivian cuatro en la misma columna: 'ACTIVE' (lo que escribia la
            # subida), 'NON_CONFORMING' (nombre fuera de convencion), 'DRAFT' (el
            # DEFAULT de la columna) y los cuatro del ciclo de vida, que eran los
            # unicos que la maquina de transiciones entendia. Por eso la maquina
            # era inalcanzable: no habia forma de mover un documento real.
            #
            # La conformidad del nombre NO es un punto del ciclo de vida -- un
            # documento puede estar en borrador y ademas tener mal el nombre -- asi
            # que se lleva a su propia marca. Ademas, mezclarlas convertia el area
            # de retencion en una trampa: se entraba y solo se salia borrando.
            cursor.execute(
                "ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS nomenclatura_ok BOOLEAN;"
            )
            # La marca se DEDUCE DEL NOMBRE, no se copia del estado viejo. Copiarla
            # de 'NON_CONFORMING' dejaba fuera a los ficheros mal nombrados que en
            # su dia se renombraron: el renombrado les escribia 'ACTIVE' encima, asi
            # que habian salido de la cuarentena sin cumplir nada y no volverian a
            # aparecer. Este patron es el mismo que ISO_19650_REGEX en
            # file_system_db.py:9; si se cambia alli, hay que cambiarlo aqui.
            # A las fotos y videos de campo NO se les aplica la convencion de
            # planos. Medido en la base real: el 94,5% del ECD son fotos llegadas
            # por WhatsApp, y juzgarlas con la nomenclatura de un entregable metio
            # 2.676 imagenes en cuarentena y dejo esa pantalla sin servir para
            # nada. Quedan SIN EVALUAR (NULL), que no es lo mismo que mal
            # nombradas. Ver backend/nomenclatura.py, donde la lista es por obra.
            exentas = ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp',
                       'tif', 'tiff', 'mp4', 'mov', '3gp', 'avi', 'm4v', 'webm',
                       'ogg', 'mkv')
            cursor.execute("""
                UPDATE file_nodes SET nomenclatura_ok = NULL
                 WHERE node_type = 'FILE' AND nomenclatura_ok IS NOT NULL
                   AND lower(substring(name from '[^.]+$')) = ANY(%s);
            """, (list(exentas),))
            cursor.execute(r"""
                UPDATE file_nodes
                   SET nomenclatura_ok = (
                        UPPER(regexp_replace(name, '[.][^.]*$', '')) ~
                        '^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[0-9]{4,6}$'
                   )
                 WHERE node_type = 'FILE' AND nomenclatura_ok IS NULL
                   AND lower(substring(name from '[^.]+$')) <> ALL(%s);
            """, (list(exentas),))
            # Y ahora el estado, sin tocar los que SI llegaron legitimamente a
            # Compartido, Publicado o Archivado.
            #
            # Ojo con las mayusculas: filtrar por UPPER(status) y NO reescribir el
            # valor dejaba pasar una fila con 'shared' en minuscula (de alguno de
            # los scripts sueltos que hay en backend/). Esa fila se quedaba tal cual
            # y luego reventaba el candado, que compara sin UPPER. Aqui se
            # reescriben TODAS a su forma canonica.
            cursor.execute("""
                UPDATE file_nodes
                   SET status = CASE UPPER(COALESCE(status, ''))
                                    WHEN 'SHARED'    THEN 'SHARED'
                                    WHEN 'PUBLISHED' THEN 'PUBLISHED'
                                    WHEN 'ARCHIVED'  THEN 'ARCHIVED'
                                    WHEN 'REVIEW'    THEN 'SHARED'
                                    WHEN 'APPROVED'  THEN 'PUBLISHED'
                                    ELSE 'WIP'
                                END
                 WHERE status IS NULL
                    OR status NOT IN ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED');
            """)
            cursor.execute("ALTER TABLE file_nodes ALTER COLUMN status SET DEFAULT 'WIP';")

            # ── 1.3 CON QUE AUTORIZACION SE EMITIO, Y COMO SE LLAMA ──────────
            # El estado dice DONDE esta el documento; el codigo de idoneidad dice
            # PARA QUE se puede usar. Sin el, un documento Publicado no distingue
            # entre "apto para construir" y "solo para informacion".
            #
            # Van en la VERSION porque cada emision lleva la suya: asi se puede
            # reconstruir con que autorizacion se entrego cada cosa y cuando. En
            # file_nodes se guarda la de la version vigente, para poder listar y
            # filtrar sin unir tablas.
            for tabla in ('file_versions', 'file_nodes'):
                cursor.execute(
                    f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS codigo_idoneidad VARCHAR(10);")
                cursor.execute(
                    f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS codigo_revision VARCHAR(10);")
            # Cuando se emitio esta version y quien la autorizo.
            cursor.execute(
                "ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS emitida_en TIMESTAMP WITH TIME ZONE;")
            cursor.execute(
                "ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS emitida_por VARCHAR(255);")

            # ── 1.4 LA HUELLA DEL CONTENIDO ─────────────────────────────────
            # Sin esto no se puede sostener "este es exactamente el fichero que se
            # aprobo el dia X y no se ha modificado despues". Se sabia el tamano y
            # la fecha, que no prueban nada: dos ficheros distintos pueden pesar
            # igual, y la fecha la escribe quien sube.
            #
            # Va en la VERSION, no en el documento, y por el mismo motivo que la
            # idoneidad: cada emision tiene su contenido, y lo que se aprueba es
            # una emision concreta. Al sellar una version (estados_ecd) la huella
            # ya esta puesta, asi que la aprobacion queda atada al contenido sin
            # ningun paso extra.
            #
            # SHA-256 y no MD5: el objeto de GCS ya trae md5, pero MD5 admite
            # colisiones construidas a proposito. Para una huella que ha de servir
            # ante un auditor eso lo descalifica.
            cursor.execute(
                "ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS sha256 CHAR(64);")
            cursor.execute(
                "ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS huella_en TIMESTAMP WITH TIME ZONE;")
            # Buscar por huella permite responder "¿tenemos este fichero?" a partir
            # del fichero, que es como llega la pregunta en una comprobacion.
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_versions_sha256 ON file_versions(sha256);")

            # ── El candado (CHECK) va APARTE y NO se pone solo ───────────────
            # Aprendido a base de un susto: la primera version ponia el CHECK aqui
            # mismo, al arrancar. Como las migraciones corren al levantar CUALQUIER
            # backend contra esta base, el candado entro en produccion mientras el
            # servidor desplegado seguia con el codigo viejo, que escribe 'ACTIVE'
            # en cada subida y en cada renombrado. Es decir: la base habria
            # empezado a rechazar las subidas del servidor en produccion.
            #
            # Un candado que cierra el esquema por delante del codigo que lo usa
            # tiene que ser un acto deliberado, DESPUES de desplegar. De ahi la
            # variable: se enciende cuando el codigo nuevo ya esta arriba.
            # Ver docs/migrar-estados-del-ecd.md.
            if os.getenv('ECD_CANDADO_ESTADOS', 'false').lower() in ('true', '1', 'yes'):
                try:
                    cursor.execute("SAVEPOINT candado_estado;")
                    cursor.execute("""
                        ALTER TABLE file_nodes ADD CONSTRAINT file_nodes_status_valido
                        CHECK (status IN ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED'));
                    """)
                    cursor.execute("RELEASE SAVEPOINT candado_estado;")
                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT candado_estado;")
                    if 'already exists' not in str(e):
                        logger.warning(
                            f"No se pudo poner el candado de estados en file_nodes: {e}"
                        )

            # ── 2. Indices para consultas frecuentes (CRITICO para escalar) ─
            # Sin estos indices, con 100.000 archivos las queries se vuelven lentas
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_nodes_model_urn
                ON file_nodes(model_urn) WHERE is_deleted = FALSE;
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_nodes_parent_listing
                ON file_nodes(model_urn, parent_id, is_deleted)
                WHERE is_deleted = FALSE;
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_nodes_listing_sort
                ON file_nodes(model_urn, parent_id, node_type DESC, name)
                WHERE is_deleted = FALSE;
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_nodes_name_lookup
                ON file_nodes(model_urn, name, node_type)
                WHERE is_deleted = FALSE;
            """)
            # Busqueda por clave de almacenamiento: es lo que hace el control de
            # acceso a los bytes en CADA peticion de imagen (backend/acceso_a_blobs.py),
            # y un album de fotos las pide en rafaga. Sin indice, un barrido por
            # tabla por cada miniatura.
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_nodes_gcs_urn ON file_nodes(gcs_urn);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_versions_gcs_urn ON file_versions(gcs_urn);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_versions_node ON file_versions(file_node_id);
            """)

            # ── 2.0.1 SANEAR raíces duplicadas (PROJECT_ROOT) ────────────────
            # Una carrera al abrir Docs por primera vez podía crear DOS nodos
            # raíz para el mismo proyecto: las carpetas colgaban de una raíz y
            # el listado (LIMIT 1 sin ORDER) a veces leía la otra → "carpetas
            # que desaparecen". Curamos: conservar la raíz MÁS ANTIGUA,
            # re-colgar los hijos de las demás y soft-borrar las sobrantes.
            cursor.execute("""
                SELECT model_urn, array_agg(id ORDER BY created_at ASC, id ASC)
                FROM file_nodes
                WHERE folder_type = 'PROJECT_ROOT' AND is_deleted = FALSE
                GROUP BY model_urn HAVING count(*) > 1
            """)
            for dup_urn, root_ids in cursor.fetchall():
                # array_agg puede volver como lista o como el literal '{a,b,c}'
                # segun se haya registrado el tipo uuid[]. Si llega como texto y
                # se indexa a ciegas, keeper acaba siendo el caracter '{' y la
                # query revienta con "malformed array literal".
                if isinstance(root_ids, str):
                    root_ids = [x for x in root_ids.strip('{}').split(',') if x]
                root_ids = list(root_ids or [])
                if len(root_ids) < 2:
                    continue
                keeper, extras = root_ids[0], root_ids[1:]
                cursor.execute(
                    "UPDATE file_nodes SET parent_id = %s WHERE parent_id = ANY(%s::uuid[]) AND is_deleted = FALSE",
                    (keeper, extras))
                moved = cursor.rowcount
                cursor.execute(
                    "UPDATE file_nodes SET is_deleted = TRUE WHERE id = ANY(%s::uuid[])",
                    (extras,))
                print(f"[DB] PROJECT_ROOT duplicado sanado en '{dup_urn}': {len(extras)} raíces extra, {moved} hijos re-colgados.")

            # Índice único parcial: la carrera queda IMPOSIBLE por diseño.
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_file_nodes_project_root
                ON file_nodes(model_urn)
                WHERE folder_type = 'PROJECT_ROOT' AND is_deleted = FALSE;
            """)
            # ── 2.1 UNIQUE constraint: evitar duplicados en misma ubicación ──
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_node_in_parent
                ON file_nodes(model_urn, parent_id, name, node_type)
                WHERE is_deleted = FALSE;
            """)

            # ── 3. Activity Log — Auditoria al estilo ACC ──────────────────
            # Cada accion (subida, borrado, creacion) queda registrada
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS activity_log (
                    id BIGSERIAL PRIMARY KEY,
                    model_urn VARCHAR(255) NOT NULL,     -- Proyecto al que pertenece
                    action VARCHAR(50) NOT NULL,         -- 'upload','delete','create_folder','rename','view'
                    entity_type VARCHAR(50) NOT NULL,    -- 'file','folder','pin','photo'
                    entity_id TEXT,                      -- UUID del file_node o pin
                    entity_name TEXT,                    -- Nombre legible del archivo o folder
                    performed_by VARCHAR(255),           -- user_id o email (cuando tengamos auth)
                    details JSONB DEFAULT '{}',          -- Info extra: size, old_name, etc.
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Indice para consultas por proyecto y fecha (Activity Feed)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_activity_log_model_urn
                ON activity_log(model_urn, created_at DESC);
            """)

            # ── 3.1 LA CADENA DEL REGISTRO DE ACTIVIDAD ─────────────────────
            # Cada evento lleva la huella del anterior: alterar o borrar uno del
            # medio rompe la cadena y se puede senalar donde. No lo hace
            # inmutable -- ver auditoria_encadenada.py -- pero convierte una
            # manipulacion silenciosa en una manipulacion visible.
            #
            # VA AQUI, Y NO ANTES. Estaba en la seccion 1.5, o sea ANTES de que
            # esta misma funcion creara activity_log 100 lineas mas abajo. Sobre
            # una base que ya tiene datos no se nota -- la tabla existe de antes --
            # pero sobre una base VACIA el ALTER revienta, se lleva la transaccion
            # entera y la funcion no llega a crear nada: ni file_nodes, ni
            # file_versions, ni el propio activity_log, ni document_shares, ni
            # upload_sessions, ni app_tokens, ni project_settings.
            #
            # O sea: el arbol documental del ECD no se podia construir desde cero.
            # Medido el 15-ago-2026 reconstruyendo el esquema en un espacio vacio:
            # 13 tablas no aparecian, y 9 de ellas por esta sola linea mal puesta.
            import auditoria_encadenada as _cadena
            _cadena.asegurar_columnas(cursor)

            # ── 4. APS Tokens Storage (PROFESSIONAL / SCALABLE) ────────────
            # Mueve tokens.json a la DB para evitar perdidas en reinicios del pod
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS app_tokens (
                    id TEXT PRIMARY KEY,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT NOT NULL,
                    expires_in INTEGER,
                    token_type TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # ── 5. Share Engine (Acceso a Obra Externo) ────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS document_shares (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    file_node_id UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
                    model_urn VARCHAR(255) NOT NULL,
                    shared_by VARCHAR(255),
                    role VARCHAR(50) DEFAULT 'viewer',
                    access_type VARCHAR(50) DEFAULT 'restricted',
                    target_emails TEXT[],
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE NULL
                );
            """)

            # ── 6. Project Settings (Validaciones Enterprise / ISO 19650) ──
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS project_settings (
                    id SERIAL PRIMARY KEY,
                    model_urn VARCHAR(255) UNIQUE NOT NULL,
                    
                    -- Naming Conventions (ASCII estricto para compatibilidad BIM/Dynamo/Windows)
                    naming_pattern VARCHAR(255) DEFAULT '^[A-Za-z0-9 _\\-\\.\\(\\)]+$',
                    max_name_length INTEGER DEFAULT 100,
                    reserved_names TEXT[] DEFAULT ARRAY['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','LPT1','LPT2','LPT3','.','..'],
                    
                    -- Storage Quotas (solo archivos FILE, no metadata)
                    storage_limit_bytes BIGINT DEFAULT 268435456000,  -- 250 GB
                    
                    -- Structure Limits
                    max_folder_depth INTEGER DEFAULT 15,
                    max_children_per_folder INTEGER DEFAULT 500,
                    
                    -- Feature Flags (on/off por proyecto)
                    enforce_naming BOOLEAN DEFAULT TRUE,
                    enforce_quota BOOLEAN DEFAULT TRUE,
                    enforce_depth BOOLEAN DEFAULT TRUE,
                    
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # ── 7. Upload Sessions (Resumable Chunked Uploads) ─────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS upload_sessions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    
                    -- File metadata
                    filename VARCHAR(255) NOT NULL,
                    size_bytes BIGINT NOT NULL,
                    mime_type VARCHAR(100) DEFAULT 'application/octet-stream',
                    gcs_urn TEXT NOT NULL,
                    
                    -- GCS Resumable Session
                    session_uri TEXT NOT NULL,
                    
                    -- Progress tracking
                    bytes_uploaded BIGINT DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','completed','expired','cancelled')),
                    
                    -- Context
                    folder_path TEXT,
                    parent_node_id UUID,
                    created_by VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
                );
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_upload_sessions_user
                ON upload_sessions(created_by, status)
                WHERE status = 'active';
            """)

            # ── 8. Funciones PL/pgSQL (Rendimiento Enterprise) ────────────
            # Reemplaza el N+1 Problem de Python por una sola transaccion recursiva en memoria de DB
            cursor.execute("""
                CREATE OR REPLACE FUNCTION resolve_folder_path(
                    p_path TEXT,
                    p_model_urn VARCHAR,
                    p_created_by VARCHAR,
                    p_auto_create BOOLEAN
                ) RETURNS UUID AS $$
                DECLARE
                    v_parts TEXT[];
                    v_part TEXT;
                    v_parent_id UUID := NULL;
                    v_current_id UUID;
                BEGIN
                    -- 1. Si no hay path, retorna NULL
                    IF p_path IS NULL OR p_path = '' THEN
                        RETURN NULL;
                    END IF;

                    -- 2. Limpiar path respecto al model_urn
                    IF p_path = p_model_urn THEN
                        RETURN NULL;
                    END IF;
                    IF p_path LIKE p_model_urn || '/%' THEN
                        p_path := substr(p_path, length(p_model_urn) + 2);
                    END IF;

                    -- 3. Extraer partes eliminando slashes extras
                    v_parts := string_to_array(trim(both '/' FROM p_path), '/');

                    -- 4. Buscar PROJECT_ROOT
                    IF p_model_urn IS NOT NULL AND p_model_urn != 'global' THEN
                        SELECT id INTO v_parent_id 
                        FROM file_nodes 
                        WHERE model_urn = p_model_urn 
                          AND folder_type = 'PROJECT_ROOT' 
                          AND is_deleted = FALSE 
                        LIMIT 1;
                    END IF;

                    -- 5. Bucle sobre las partes (Concurrencia manejada con excepciones)
                    FOREACH v_part IN ARRAY v_parts LOOP
                        IF v_part = '' THEN CONTINUE; END IF;

                        -- Intentar encontrar el nodo padre usando IF para evitar Sequential Scans por IS NOT DISTINCT FROM
                        IF v_parent_id IS NULL THEN
                            SELECT id INTO v_current_id
                            FROM file_nodes
                            WHERE model_urn = p_model_urn
                              AND parent_id IS NULL
                              AND name = v_part
                              AND node_type = 'FOLDER'
                              AND is_deleted = FALSE;
                        ELSE
                            SELECT id INTO v_current_id
                            FROM file_nodes
                            WHERE model_urn = p_model_urn
                              AND parent_id = v_parent_id
                              AND name = v_part
                              AND node_type = 'FOLDER'
                              AND is_deleted = FALSE;
                        END IF;

                        -- Si no existe, decidir si se crea o se aborta
                        IF NOT FOUND THEN
                            IF NOT p_auto_create THEN
                                RETURN NULL;
                            END IF;

                            -- Crear con proteccion de concurrencia pura (Race Conditions)
                            BEGIN
                                INSERT INTO file_nodes (model_urn, parent_id, node_type, name, created_by)
                                VALUES (p_model_urn, v_parent_id, 'FOLDER', v_part, p_created_by)
                                RETURNING id INTO v_current_id;
                            EXCEPTION WHEN unique_violation THEN
                                -- Si alguien mas insertó exactamente la misma carpeta milisegundos despues de nuestra lectura
                                -- El UNIQUE INDEX detiene el fallo y volvemos a leerla:
                                IF v_parent_id IS NULL THEN
                                    SELECT id INTO v_current_id
                                    FROM file_nodes
                                    WHERE model_urn = p_model_urn
                                      AND parent_id IS NULL
                                      AND name = v_part
                                      AND node_type = 'FOLDER'
                                      AND is_deleted = FALSE;
                                ELSE
                                    SELECT id INTO v_current_id
                                    FROM file_nodes
                                    WHERE model_urn = p_model_urn
                                      AND parent_id = v_parent_id
                                      AND name = v_part
                                      AND node_type = 'FOLDER'
                                      AND is_deleted = FALSE;
                                END IF;
                            END;
                        END IF;

                        v_parent_id := v_current_id;
                    END LOOP;

                    RETURN v_parent_id;
                END;
                $$ LANGUAGE plpgsql;
            """)

            conn.commit()
            print("[DB] Tablas e indices maestros verificados/creados exitosamente.")
    except Exception as e:
        # Y SE PROPAGA. Antes se tragaba aqui con un print, asi que el informe de
        # arranque decia "0 fallos" aunque el esquema se hubiera quedado a medias:
        # el sitio donde se mira si algo fue mal afirmaba que todo estaba bien.
        print(f"Error inicializando esquema maestro: {e}")
        raise

@solo_con_ddl
def ensure_ai_brain_schema():
    """Crea el esquema y las tablas para el Cerebro de IA y HITL."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Esquema dedicado
            cursor.execute('CREATE SCHEMA IF NOT EXISTS ai_brain;')
            
            # 2. Tabla de Conocimiento Global
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ai_brain.global_knowledge (
                    id SERIAL PRIMARY KEY,
                    subject VARCHAR(255) NOT NULL,
                    rule_description TEXT NOT NULL,
                    source_project_id VARCHAR(255),
                    confidence_score FLOAT DEFAULT 1.0, 
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 3. Tabla Maestras de Triples Semánticos (Fase 4 - ETL)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ai_brain.semantic_triples (
                    id BIGSERIAL PRIMARY KEY,
                    subject TEXT NOT NULL,
                    predicate TEXT NOT NULL,
                    object TEXT,
                    value_numeric FLOAT,
                    unit VARCHAR(50),
                    context_quote TEXT,
                    source_file VARCHAR(255),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_semantic_subject ON ai_brain.semantic_triples(subject);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_semantic_predicate ON ai_brain.semantic_triples(predicate);")

            # 4. Buffer de Feedback (HITL)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ai_brain.feedback_buffer (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    device_id VARCHAR(100),
                    user_query TEXT NOT NULL,
                    ai_response TEXT NOT NULL,
                    human_correction TEXT,
                    reward_value FLOAT DEFAULT 0.0,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_fb_buffer_project ON ai_brain.feedback_buffer(model_urn);")
            
            conn.commit()
            print("[DB] Esquema ai_brain (HITL) verificado/creado exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema AI: {e}")


def log_activity(model_urn, action, entity_type, entity_id=None, entity_name=None, performed_by=None, details=None):
    """
    Registra una accion en el Activity Log.
    Llamar desde cualquier endpoint que modifique datos.
    """
    import json as _json
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            detalles = _json.dumps(details or {})

            # La fecha se fija AQUI, no en la base, porque entra en la huella y
            # hay que conocerla antes de insertar. Ver sello_para_insercion.
            import datetime as _dt
            cuando = _dt.datetime.now(_dt.timezone.utc)
            contenido = {
                'model_urn': model_urn, 'action': action, 'entity_type': entity_type,
                'entity_id': entity_id, 'entity_name': entity_name,
                'performed_by': performed_by,
                'details': _json.loads(detalles), 'created_at': cuando,
            }
            hash_anterior = h = None
            try:
                import auditoria_encadenada as cadena
                hash_anterior, h = cadena.sello_para_insercion(cursor, contenido)
            except Exception as _e:
                # Sin sello el evento se registra igual y saldra como
                # 'sin_sellar' en la verificacion, que es lo honesto. Lo que NO
                # puede pasar es que el evento se pierda: eso es lo que ocurria
                # cuando el sellado era un UPDATE posterior.
                print(f"[activity_log] sin sello: {_e}")

            cursor.execute("""
                INSERT INTO activity_log (model_urn, action, entity_type, entity_id,
                                          entity_name, performed_by, details,
                                          created_at, hash_anterior, hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                model_urn, action, entity_type, entity_id, entity_name,
                performed_by, detalles, cuando, hash_anterior, h
            ))
            fila_id = cursor.fetchone()[0]

            # El encadenado ya se hizo ARRIBA, dentro del propio INSERT.
            # Aqui vivia un segundo sellado por UPDATE que, con la identidad de
            # aplicacion separada, no solo fallaba: abortaba la transaccion y se
            # llevaba el INSERT por delante. El evento no quedaba sin sellar,
            # desaparecia.

            conn.commit()
    except Exception as e:
        # No romper la operacion principal si el log falla
        print(f"[ActivityLog] Warning: no se pudo registrar actividad: {e}")

ESTADOS_RFI = ('Emitido', 'En revisión', 'Respondido', 'Cerrado')
# Los Red Lines usan los MISMOS cuatro estados --y los 33 registros reales no
# tienen ninguno fuera de ellos-- pero la lista se declara aparte a proposito:
# si manana un Red Line necesita un estado que un RFI no tiene, esa decision no
# puede obligar a cambiar el RFI. Ver `flujo_de_redline.py`.
ESTADOS_REDLINE = ('Emitido', 'En revisión', 'Respondido', 'Cerrado')


def _reglas_del_registro(cursor, conn, tabla, singular, estados):
    """Las restricciones que hacen de un REGISTRO DOCUMENTAL un objeto fiable.

    Vale para `doc_rfis` y para `doc_redlines`: la MECANICA es la misma --la
    obra no puede ser desconocida, el codigo no puede repetirse dentro de ella,
    el estado no puede ser cualquiera-- y duplicarla habria sido pedir que las
    dos mitades divergieran. Lo que cada objeto SIGNIFICA se declara en su
    propio `flujo_de_*.py`, no aqui.

    Los nombres de las restricciones se derivan de la tabla, asi que los del RFI
    salen exactamente iguales que antes: `uq_doc_rfis_codigo`, `ck_doc_rfis_estado`.

    NINGUNA SE IMPONE ADIVINANDO. Cada una comprueba primero los datos reales y,
    si no puede aplicarse de forma segura, LO DICE y sigue. Una restriccion que
    se aplica «arreglando» filas de un cliente no es una garantia: es una
    perdida de informacion con buena intencion.
    """
    # Lo que NO se pudo aplicar. Se DEVUELVE, para que quien llama no pueda
    # anunciar «verificadas» cuando no se verifico nada.
    pendientes = []

    _fk_obra = 'fk_%s_project' % tabla
    _fk_resp = 'fk_%s_responsable' % tabla
    _uq = 'uq_%s_codigo' % tabla
    _ck = 'ck_%s_estado' % tabla

    def _existe(nombre):
        cursor.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", (nombre,))
        return cursor.fetchone() is not None

    # 1. `project_id` NO NULO -- la obra de un RFI no puede ser desconocida.
    #
    #    Y no es cosmetico: la restriccion unica de abajo es (project_id,
    #    codigo), y en SQL DOS NULL NO CHOCAN. Con `project_id` nulo, dos
    #    RL-013 se colarian por debajo de la unicidad.
    cursor.execute('SELECT count(*) FROM %s WHERE project_id IS NULL' % tabla)
    sin_obra = cursor.fetchone()[0]
    if sin_obra:
        print('[DB] AVISO: %d %s sin project_id. NO se impone NOT NULL y NO se '
              'adivina su obra: hay que decidirla a mano.' % (sin_obra, singular))
        pendientes.append('%s.project_id NOT NULL' % tabla)
    else:
        try:
            cursor.execute('ALTER TABLE %s ALTER COLUMN project_id SET NOT NULL' % tabla)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print('[DB] project_id NOT NULL no aplicado: %s' % str(e)[:90])
            pendientes.append('%s.project_id NOT NULL' % tabla)

    # 2. La obra existe de verdad.
    if not _existe(_fk_obra):
        cursor.execute('SELECT count(*) FROM %s r WHERE r.project_id IS NOT NULL '
                       '  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id)'
                       % tabla)
        if cursor.fetchone()[0]:
            conn.commit()
            print('[DB] AVISO: hay %s cuyo project_id no existe en projects. '
                  'NO se crea la clave ajena.' % singular)
            pendientes.append(_fk_obra)
        else:
            try:
                cursor.execute('ALTER TABLE %s ADD CONSTRAINT %s '
                               'FOREIGN KEY (project_id) REFERENCES projects(id)'
                               % (tabla, _fk_obra))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print('[DB] %s no creada: %s' % (_fk_obra, str(e)[:90]))
                pendientes.append(_fk_obra)

    if not _existe(_fk_resp):
        try:
            cursor.execute('ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (responsable_id) '
                           'REFERENCES users(id) ON DELETE SET NULL' % (tabla, _fk_resp))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print('[DB] %s no creada: %s' % (_fk_resp, str(e)[:90]))
            pendientes.append(_fk_resp)

    # 3. DOS RL-013 (O RFI-013) EN LA MISMA OBRA NO PUEDEN EXISTIR.
    #
    #    Por OBRA, no por `model_urn`: una obra tiene varios alcances --la obra
    #    '1' tiene OCHO alias registrados-- y agrupar por alcance dejaria pasar
    #    dos codigos iguales creados bajo alias distintos de la misma obra.
    if not _existe(_uq):
        cursor.execute('SELECT count(*) FROM (SELECT project_id, codigo FROM %s '
                       '  WHERE project_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d'
                       % tabla)
        if cursor.fetchone()[0]:
            conn.commit()
            print('[DB] AVISO: ya hay codigos de %s repetidos dentro de una obra. '
                  'NO se crea la restriccion unica; hay que renumerarlos a mano.' % singular)
            pendientes.append(_uq)
        else:
            try:
                cursor.execute('ALTER TABLE %s ADD CONSTRAINT %s UNIQUE (project_id, codigo)'
                               % (tabla, _uq))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print('[DB] %s no creada: %s' % (_uq, str(e)[:90]))
                pendientes.append(_uq)

    # 4. Los cuatro estados, y nada mas. No se inventa ninguno: son los que la
    #    interfaz ya ofrece y los que usan los registros reales --los 25 RFI y
    #    los 33 Red Lines--.
    if not _existe(_ck):
        cursor.execute('SELECT count(*) FROM %s WHERE estado IS NOT NULL '
                       '  AND estado NOT IN %%s' % tabla, (estados,))
        if cursor.fetchone()[0]:
            conn.commit()
            print('[DB] AVISO: hay %s con estados fuera de los cuatro. NO se crea '
                  'el CHECK y NO se reescribe ningun estado.' % singular)
            pendientes.append(_ck)
        else:
            try:
                cursor.execute('ALTER TABLE %s ADD CONSTRAINT %s '
                               'CHECK (estado IS NULL OR estado IN %%s)' % (tabla, _ck),
                               (estados,))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print('[DB] %s no creado: %s' % (_ck, str(e)[:90]))
                pendientes.append(_ck)

    return pendientes


def _reglas_del_rfi(cursor, conn):
    return _reglas_del_registro(cursor, conn, 'doc_rfis', 'RFI', ESTADOS_RFI)


def _reglas_del_redline(cursor, conn):
    return _reglas_del_registro(cursor, conn, 'doc_redlines', 'Red Line',
                                ESTADOS_REDLINE)


def ensure_reglas_del_redline():
    """Las restricciones del Red Line, AL FINAL del arranque.

    Igual que las del RFI, y por la misma razon: sus claves ajenas apuntan a
    `projects` y a `users`, que no existen cuando se crea su tabla. Lo que
    referencia tablas ajenas va DESPUES de quien las crea.

    Los 33 Red Lines reales admiten las cuatro restricciones sin tocar una sola
    fila: ninguno sin `project_id`, ninguno con obra inexistente, ningun codigo
    repetido y ningun estado fuera de los cuatro. Se comprobo antes de imponer.
    """
    from db import get_db_connection as _c
    try:
        with _c() as conn:
            cur = conn.cursor()
            pendientes = _reglas_del_redline(cur, conn)
            conn.commit()
        if pendientes:
            print('[DB] Reglas del Red Line INCOMPLETAS. Sin aplicar: %s'
                  % ', '.join(pendientes))
        else:
            print('[DB] Reglas del Red Line verificadas.')
    except Exception as e:
        print('Error aplicando las reglas del Red Line: %s' % e)


def ensure_reglas_del_rfi():
    """Las restricciones del RFI, en un paso PROPIO y AL FINAL del arranque.

    Estaban dentro de `ensure_rfi_schema`, que corre pronto -- y sus claves
    ajenas apuntan a `projects` y a `users`, que todavia no existen entonces.
    Sobre una base ya construida funcionaba; sobre una VACIA fallaba en
    silencio y la instancia nueva se quedaba sin la restriccion unica de
    codigos, sin el CHECK de estados y sin `project_id NOT NULL`.

    Lo encontro la regeneracion del manifiesto desde cero. Es el mismo error de
    orden que ya se pago con las claves ajenas: lo que referencia tablas ajenas
    va despues de quien las crea.
    """
    from db import get_db_connection as _c
    try:
        with _c() as conn:
            cur = conn.cursor()
            pendientes = _reglas_del_rfi(cur, conn)
            conn.commit()
        if pendientes:
            print('[DB] Reglas del RFI INCOMPLETAS. Sin aplicar: %s'
                  % ', '.join(pendientes))
        else:
            print('[DB] Reglas del RFI verificadas.')
    except Exception as e:
        print('Error aplicando las reglas del RFI: %s' % e)


@solo_con_ddl
def ensure_rfi_schema():
    """Crea la tabla principal para el modulo de Requerimiento de Informacion (RFI)."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doc_rfis (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    codigo VARCHAR(50) NOT NULL,
                    titulo VARCHAR(255),
                    estado VARCHAR(50) DEFAULT 'Emitido',
                    responsable VARCHAR(255),
                    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    adjuntos JSONB DEFAULT '[]', -- Matriz de objetos [{id: "node_id", type: "pdf/cad"}]
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(255)
                );
            """)
            
            # Indices para búsqueda rápida por proyecto
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_doc_rfis_model_urn
                ON doc_rfis(model_urn);
            """)

            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS respuesta VARCHAR(50);")
            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS fecha_respuesta TIMESTAMP WITH TIME ZONE;")

            # -- EL RFI PROFESIONAL --------------------------------------
            #
            # `responsable` (texto) NO SE TOCA: es lo que dice el documento
            # contractual, y en los datos reales vale 'Ing. Valeria Barrenechea'.
            # `responsable_id` es OTRA cosa: a quien le toca AHORA, como
            # identidad del sistema. No se exige que sean el mismo dato.
            #
            # Y esta en el OBJETO, no solo en `encargos`, por una razon concreta:
            # sin el, la conciliacion no puede detectar que FALTE un encargo de
            # RFI --del texto libre no se deduce a que usuario abrirselo--. Con
            # el, la proyeccion se vuelve RECONSTRUIBLE.
            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS "
                           "responsable_id INTEGER;")
            # El plazo vive en el OBJETO. Leccion ya pagada en Reviews: si el
            # encargo se perdia y se reconstruia, el plazo desaparecia porque el
            # objeto no sabia cual era.
            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS "
                           "vence_en TIMESTAMP;")
            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS "
                           "historial JSONB DEFAULT '[]'::jsonb;")
            cursor.execute("ALTER TABLE doc_rfis ADD COLUMN IF NOT EXISTS "
                           "cerrado_por VARCHAR(255);")
            conn.commit()
            
            conn.commit()
            print("[DB] Esquema RFI verificado/creado exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema RFI: {e}")

@solo_con_ddl
def ensure_redline_schema():
    """Crea la tabla principal para el modulo de Red Lines."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doc_redlines (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    codigo VARCHAR(50) NOT NULL,
                    titulo VARCHAR(255),
                    estado VARCHAR(50) DEFAULT 'Emitido',
                    responsable VARCHAR(255),
                    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    adjuntos JSONB DEFAULT '[]',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(255),
                    respuesta VARCHAR(50),
                    fecha_respuesta TIMESTAMP WITH TIME ZONE
                );
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_doc_redlines_model_urn
                ON doc_redlines(model_urn);
            """)
            
            # -- EL RED LINE PROFESIONAL ---------------------------------
            #
            # `responsable` (texto) NO SE TOCA: es lo que dice el registro
            # historico, y en las 33 filas reales vale siempre lo mismo.
            # `responsable_id` es OTRA cosa: a quien le toca AHORA pronunciarse
            # sobre la modificacion, como identidad del sistema. No se exige que
            # sean el mismo dato, y el texto historico NO se convierte.
            #
            # Y esta en el OBJETO, no solo en `encargos`, por una razon concreta:
            # sin el, la conciliacion solo podia detectar que SOBRARA un encargo
            # de Red Line, nunca que FALTARA --del texto libre no se deduce a que
            # usuario abrirselo--. Con el, la proyeccion se vuelve RECONSTRUIBLE.
            cursor.execute("ALTER TABLE doc_redlines ADD COLUMN IF NOT EXISTS "
                           "responsable_id INTEGER;")
            # El plazo vive en el OBJETO. Leccion ya pagada en Reviews: si el
            # encargo se perdia y se reconstruia, el plazo desaparecia porque el
            # objeto no sabia cual era. Se cuenta en DIAS CALENDARIO.
            cursor.execute("ALTER TABLE doc_redlines ADD COLUMN IF NOT EXISTS "
                           "vence_en TIMESTAMP;")
            cursor.execute("ALTER TABLE doc_redlines ADD COLUMN IF NOT EXISTS "
                           "historial JSONB DEFAULT '[]'::jsonb;")
            cursor.execute("ALTER TABLE doc_redlines ADD COLUMN IF NOT EXISTS "
                           "cerrado_por VARCHAR(255);")
            conn.commit()
            print("[DB] Esquema Red Lines verificado/creado exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema Red Lines: {e}")

@solo_con_ddl
def ensure_partidas_schema():
    """Crea la tabla principal para el modulo de Partidas / Metrados."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doc_partidas (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    model_urn VARCHAR(255) NOT NULL,
                    item VARCHAR(50),
                    descripcion VARCHAR(500) NOT NULL,
                    unidad VARCHAR(50),
                    metrado NUMERIC,
                    precio_unitario NUMERIC,
                    precio NUMERIC,
                    incidencia NUMERIC,
                    metodologia VARCHAR(50),
                    software VARCHAR(50),
                    avance NUMERIC DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(255)
                );
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_doc_partidas_model_urn
                ON doc_partidas(model_urn);
            """)
            
            conn.commit()
            print("[DB] Esquema Partidas (Metrados) verificado/creado exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema Partidas: {e}")


@solo_con_ddl
def ensure_asset_user_data_table():
    """Familia de datos de USUARIO, separada del inventario nativo de Revit.

    Equivale a la 'column family z' (DtProperties) de Autodesk Tandem: la data que
    el usuario autora desde la app (estado, material, nº de vaciado, clasificación y
    campos custom) vive aquí, anclada SOLO por external_id (identidad estable entre
    versiones). Así, cuando un modelo se actualiza/relinkea y se re-extrae el
    inventario nativo, esta data NO se toca y persiste para siempre.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS asset_user_data (
                    external_id    TEXT PRIMARY KEY,
                    model_urn      TEXT,
                    status         TEXT,
                    material       TEXT,
                    vaciado_nro    TEXT,
                    classification TEXT,
                    extras         JSONB NOT NULL DEFAULT '{}'::jsonb,
                    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_by     VARCHAR(255)
                );
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_asset_user_data_model_urn
                ON asset_user_data(model_urn);
            """)

            conn.commit()
            print("[DB] Esquema asset_user_data (familia de usuario, persistente) verificado/creado exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema asset_user_data: {e}")


# Pilar Identidad: tablas de datos que deben anclarse a una obra canonica (projects.id).
# El 'frente' (model_urn / app_project_id, ej. '1_CANAL') queda como columna de agrupacion.
#
# EXCLUIDAS porque su columna project_id YA EXISTE con OTRA semantica (no tocar):
#   - model_config.project_id  = ACC Project ID ('b.3fcc...') usado por update/relink
#   - saved_views.project_id   = frente ('1_CANAL'), contrato actual del API de vistas
#   - control_pins.project_id  = frente, contrato del API de pins
# Para esas, la obra se deriva del frente via resolve_project_id().
PROJECT_SCOPED_TABLES = [
    'inventory_assets', 'asset_user_data',
    'tracking_pins', 'tracking_progress', 'tracking_details',
    'photo_evidences', 'presupuesto_maestro', 'doc_partidas',
    'doc_rfis', 'doc_redlines', 'daily_reports',
]


@solo_con_ddl
def ensure_project_identity_columns():
    """Agrega project_id TEXT (+ indice) a todas las tablas de datos.

    Aditivo e idempotente: ancla cada fila a una obra canonica (projects.id) sin
    tocar el 'frente'. No cambia el comportamiento en runtime (ninguna query lo
    lee todavia); es el cimiento del Pilar Identidad. El backfill lo hace
    migrate_project_identity.py.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            done = 0
            for t in PROJECT_SCOPED_TABLES:  # whitelist fija (no inyectable)
                try:
                    cursor.execute(f"ALTER TABLE IF EXISTS {t} ADD COLUMN IF NOT EXISTS project_id TEXT")
                    cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{t}_project_id ON {t}(project_id)")
                    conn.commit()
                    done += 1
                except Exception as te:
                    conn.rollback()
                    print(f"[DB]  (project_id saltado en {t}: {te})")
            print(f"[DB] Columna project_id verificada en {done} tablas (Pilar Identidad).")
    except Exception as e:
        print(f"Error agregando columnas project_id: {e}")


# ── Resolver frente → obra canonica (projects.id) ──────────────────────────
# El frontend opera por 'frente' ('1_CANAL', 'proyectos/PQT8_TALARA', 'global').
# Convencion: el prefijo antes del primer '_' es el projects.id. Fallbacks:
# match por nombre, match exacto, y si hay UNA sola obra activa, esa.
# Cache en memoria con TTL para no pegarle a la BD en cada write.
_project_resolver_cache = {'map': None, 'ts': 0}
_PROJECT_RESOLVER_TTL = 300  # 5 min


def _variantes_de_urn(valor):
    """Formas en que el mismo modelo llega escrito desde los clientes.

    El mismo URN viaja con y sin sufijo de version, y a veces en base64 con el
    alfabeto seguro para URL (- _) en vez del estandar (+ /). Compararlos en
    crudo hacia que el mismo modelo resolviera unas veces si y otras no, que es
    peor que no resolver nunca: da una falsa sensacion de control.
    """
    if not valor:
        return ()
    v = str(valor).strip()
    if not v:
        return ()
    salida = {v}
    base = v.split('?')[0]
    salida.add(base)
    salida.add(base.rstrip('='))
    salida.add(base.replace('-', '+').replace('_', '/'))
    salida.add(base.replace('+', '-').replace('/', '_'))
    return tuple(x for x in salida if x)


def _load_project_resolver():
    """Carga los mapas de traduccion. La AUTORIDAD es `project_ref`.

    Cuatro fuentes, todas deterministas, en orden de autoridad:

      by_ref     `project_ref`: una fila por alias, decidida explicitamente.
      by_id      los propios `projects.id`.
      by_urn     `model_config`: el REGISTRO de modelos por obra.
      by_dataset `lob_datasets`: el REGISTRO de datasets 4D por obra.

    Lo que se QUITO respecto de la version anterior, y por que:

      by_name    La coincidencia por nombre de obra. `projects` no tiene UNIQUE
                 sobre `name`, y hoy hay CUATRO obras llamadas
                 'HOSPITAL_MATUCANA': el resultado dependia del orden en que la
                 base devolviera las filas. Los nombres que de verdad hacen
                 falta estan ahora en `project_ref` como LEGACY_NAME, uno a uno
                 y decididos, no adivinados.

      default    «Si hay UNA sola obra activa, esa». Resolvia todo por accidente
                 mientras solo hubiera una obra, y cambiaba el comportamiento de
                 medio sistema el dia que entrara la segunda.

    Se sigue SIN deducir obras de las tablas de datos (inventory_assets,
    doc_partidas, tracking_pins...): quien pueda escribir una fila ahi elegiria
    a que obra pertenece su peticion.
    """
    import time as _time
    now = _time.time()
    if _project_resolver_cache['map'] is not None and now - _project_resolver_cache['ts'] < _PROJECT_RESOLVER_TTL:
        return _project_resolver_cache['map']
    by_id, by_ref, by_urn, by_dataset, prefijables = {}, {}, {}, {}, {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM projects")
            for (pid,) in cur.fetchall():
                by_id[pid] = pid
                prefijables[pid] = pid

            # -- La tabla de referencias: manda sobre todo lo demas --------
            cur.execute("SELECT to_regclass('public.project_ref')")
            if cur.fetchone()[0]:
                from referencias_de_obra import cargar, CUENTA_DE_ESTA_INSTANCIA
                by_ref, solo_proyectos = cargar(cur, CUENTA_DE_ESTA_INSTANCIA)
                prefijables.update(solo_proyectos)

            # Base determinista para traducir lo que traen los registros. Se
            # deja `by_urn` vacio a proposito: si el propio registro se
            # consultara mientras se construye, el resultado dependeria del
            # orden en que la base devolviera las filas.
            base = {'by_ref': by_ref, 'by_id': by_id, 'by_urn': {},
                    'by_dataset': {}, 'prefijables': prefijables}

            # -- Registro de modelos: URN DEL MODELO -> OBRA ---------------
            # Sin esto el resolutor no entendia el identificador con el que se
            # direcciona CASI TODO el sistema. Medido en su dia: un usuario de
            # la obra A leia y ESCRIBIA en 11 familias de rutas de la obra B.
            cur.execute("SELECT to_regclass('public.model_config')")
            if cur.fetchone()[0]:
                cur.execute("SELECT urn, model_id, app_project_id, project_id FROM model_config")
                for urn, model_id, app_pid, acc_pid in cur.fetchall():
                    # `app_project_id` no siempre es un `projects.id`: en los
                    # datos reales vale '1_DRENAJE', que es un FRENTE. Exigir
                    # que estuviera en `by_id` descartaba el registro entero, y
                    # con el se perdia la traduccion del id de ACC que guarda
                    # `model_config.project_id`. Ahora se traduce como cualquier
                    # otro alcance.
                    obra = _traducir(base, app_pid)
                    if not obra:
                        continue
                    for clave in (urn, model_id, acc_pid):
                        for variante in _variantes_de_urn(clave):
                            by_urn[variante] = obra

            parcial = dict(base, by_urn=by_urn)

            # -- Registro de datasets 4D: UUID -> OBRA ---------------------
            # Once tablas del 4D LOB (mas de 40.000 filas medidas) NO tienen
            # ninguna columna de obra: solo `dataset_id`. Sin esta traduccion,
            # con ENFORCE encendido el modulo entero contestaba 403 porque su
            # alcance no era resoluble.
            #
            # SE EXIGE QUE LAS DOS SENALES COINCIDAN. `lob_datasets.project_id`
            # sale de `request.form.get('project_id')` (routes/lob4d.py:373):
            # lo declara quien llama. Esta gateado por pertenencia
            # (`_assert_project_access`), asi que nadie puede atribuirle una
            # obra ajena -- pero quien sea miembro de DOS obras si podria
            # declarar una y traer el alcance de la otra. Cuando el alcance y
            # la obra declarada no dicen lo mismo, no se elige: no resuelve.
            cur.execute("SELECT to_regclass('public.lob_datasets')")
            if cur.fetchone()[0]:
                cur.execute("SELECT id, project_id, scope_urn FROM lob_datasets")
                for ds_id, declarada, alcance in cur.fetchall():
                    obra_declarada = _traducir(parcial, declarada)
                    obra_del_alcance = _traducir(parcial, alcance)
                    if obra_declarada and obra_declarada == obra_del_alcance:
                        by_dataset[str(ds_id)] = obra_declarada
                    elif obra_declarada or obra_del_alcance:
                        logger.warning(
                            '[resolver] dataset %s no resuelve: declara obra %s '
                            'y su alcance %s apunta a %s', ds_id, obra_declarada,
                            alcance, obra_del_alcance)
    except Exception as e:
        print(f"[DB] resolve_project_id: no se pudo cargar projects: {e}")
        return _project_resolver_cache['map'] or {
            'by_ref': {}, 'by_id': {}, 'by_urn': {}, 'by_dataset': {}, 'prefijables': {}}
    resolved = {'by_ref': by_ref, 'by_id': by_id, 'by_urn': by_urn,
                'by_dataset': by_dataset, 'prefijables': prefijables}
    _project_resolver_cache['map'] = resolved
    _project_resolver_cache['ts'] = now
    return resolved


def _traducir(m, texto):
    """Traduccion determinista con los mapas ya cargados. None si no se sabe.

    Nunca elige entre candidatos empatados y nunca cae en un valor por defecto:
    o hay una respuesta unica, o no hay respuesta.
    """
    if not texto:
        return None
    texto = str(texto).strip()
    if not texto:
        return None

    # Se leen los mapas con `.get`, y `prefijables` cae en `by_id`.
    #
    # No es por comodidad: si a este diccionario le falta una clave, un acceso
    # directo lanza KeyError, `resolve_project_id` lo atrapa en su `except` y
    # devuelve None -- es decir, DEJA DE RESOLVER TODO, en silencio, y el
    # sintoma que se ve es «nadie tiene acceso a nada». Un mapa incompleto tiene
    # que degradar lo que le falte, no apagar la traduccion entera.
    by_ref = m.get('by_ref') or {}
    by_id = m.get('by_id') or {}
    by_urn = m.get('by_urn') or {}
    by_dataset = m.get('by_dataset') or {}
    prefijables = m.get('prefijables')
    if prefijables is None:
        prefijables = by_id

    # 1. La tabla de referencias manda.
    for variante in _variantes_de_urn(texto):
        if variante in by_ref:
            return by_ref[variante]

    # 2. El alcance ES el id de una obra.
    if texto in by_id:
        return texto

    # 3. Registro de modelos.
    for variante in _variantes_de_urn(texto):
        if variante in by_urn:
            return by_urn[variante]

    # 4. Registro de datasets 4D.
    if texto in by_dataset:
        return by_dataset[texto]

    # 5. Prefijo mas largo: la convencion de alcance es '<obra>_<FRENTE>'.
    #    Se busca el MAS LARGO porque los ids reales
    #    ('b.proj_<slug>_<sufijo>') ya contienen guiones bajos: partir por el
    #    primero devolvia siempre 'b.proj', que no es ninguna obra.
    candidatos = [alias for alias in prefijables if texto.startswith(alias + '_')]
    if candidatos:
        return prefijables[max(candidatos, key=len)]

    return None


def resolve_project_id(frente):
    """Resuelve un alcance (model_urn / scope_urn / dataset_id) a `projects.id`.

    Devuelve None si no se puede resolver. Nunca lanza.

    'global' YA NO resuelve. Antes caia en «la unica obra activa», y por eso
    parecia funcionar: mientras hubiera una sola obra, cualquier cosa
    desconocida acababa en ella. Hay mas de 4.000 filas de datos reales
    guardadas bajo 'global', y esa deuda no se salda adivinando: se salda
    atribuyendolas a su obra en `project_ref`, que es una decision y queda
    escrita. Mientras no se haga, esas peticiones aparecen como hueco en los
    registros de autorizacion, que es donde tienen que verse.
    """
    try:
        return _traducir(_load_project_resolver(), frente)
    except Exception:
        return None
