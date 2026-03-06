import os
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager

# Definimos un Connection Pool global
db_pool = None

def init_db_pool():
    global db_pool
    if db_pool is None:
        try:
            db_pool = psycopg2.pool.SimpleConnectionPool(
                1, 20, # Min, Max conexiones
                user=os.environ.get("DB_USER"),
                password=os.environ.get("DB_PASS"),
                host=os.environ.get("DB_HOST"),
                port=os.environ.get("DB_PORT", "5432"),
                database=os.environ.get("DB_NAME")
            )
            print("Pool de conexiones a PostgreSQL inicializado correctamente.")
        except Exception as e:
            print(f"Error iniciando Pool SQL: {str(e)}")

@contextmanager
def get_db_connection():
    """
    Context manager para obtener una conexion segura del pool
    y devolverla automaticamente despues de usarla.
    """
    global db_pool
    if db_pool is None:
        init_db_pool()
        
    if db_pool is None:
        raise Exception("El pool de conexiones no está inicializado. No se puede conectar a la base de datos.")

    conn = None
    try:
        conn = db_pool.getconn()
        yield conn
    except Exception as e:
        print(f"Error de Base de Datos: {e}")
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn and db_pool:
            db_pool.putconn(conn)

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
                    metadata JSONB DEFAULT '{}'         -- Para datos extra de ingenieria
                );
            """)
            # Migraciones incrementales
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS tags TEXT[];")
            cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';")

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

            conn.commit()
            print("[DB] Tablas e indices maestros verificados/creados exitosamente.")
    except Exception as e:
        print(f"Error inicializando esquema maestro: {e}")


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


