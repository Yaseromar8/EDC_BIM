import os
import psycopg2
from psycopg2 import pool, extras
from contextlib import contextmanager

# Definimos un Connection Pool global
db_pool = None

def init_db_pool():
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
            options='-c statement_timeout=30000',  # 30s max per query
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3
        )
        print("[DB] Pool de conexiones PostgreSQL inicializado (Min:2, Max:15, Keepalive:ON)")
    except Exception as e:
        print(f"CRITICAL: Error iniciando Pool SQL a {os.environ.get('DB_HOST')}: {str(e)}")
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
            print(f"[DB] Pool agotado (intento {attempt+1}/{max_retries}): {e}")
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
        print(f"Error de Base de Datos: {e}")
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

def ensure_file_nodes_table():
    """Crea la tabla maestra de archivos/carpetas e indices de rendimiento."""
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
                CREATE INDEX IF NOT EXISTS idx_file_nodes_name_lookup
                ON file_nodes(model_urn, name, node_type)
                WHERE is_deleted = FALSE;
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

                        -- Intentar encontrar el nodo padre
                        SELECT id INTO v_current_id
                        FROM file_nodes
                        WHERE model_urn = p_model_urn
                          AND parent_id IS NOT DISTINCT FROM v_parent_id
                          AND name = v_part
                          AND node_type = 'FOLDER'
                          AND is_deleted = FALSE;

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
                                SELECT id INTO v_current_id
                                FROM file_nodes
                                WHERE model_urn = p_model_urn
                                  AND parent_id IS NOT DISTINCT FROM v_parent_id
                                  AND name = v_part
                                  AND node_type = 'FOLDER'
                                  AND is_deleted = FALSE;
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
        print(f"Error inicializando esquema maestro: {e}")

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
            cursor.execute("""
                INSERT INTO activity_log (model_urn, action, entity_type, entity_id, entity_name, performed_by, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                model_urn, action, entity_type, entity_id, entity_name,
                performed_by, _json.dumps(details or {})
            ))
            conn.commit()
    except Exception as e:
        # No romper la operacion principal si el log falla
        print(f"[ActivityLog] Warning: no se pudo registrar actividad: {e}")


