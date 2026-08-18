"""Las tablas que el codigo NO sabia crear.

POR QUE EXISTE ESTE FICHERO
---------------------------
Se descubrio probando una restauracion de verdad, que es exactamente para lo que
sirve probarlas. La copia de seguridad guardaba los datos dando por hecho que "el
esquema es codigo": base vacia, arrancar el backend, y la aplicacion crea sus
tablas. Se creo una base desechable, se arranco la aplicacion contra ella y salio
esto:

    tablas en produccion .................. 81
    tablas que el codigo sabe crear ....... 34
    tablas que NADIE crea ................. 47

Entre las que faltaban: projects, users, hubs, project_users, folder_permissions
y sessions. Es decir, quienes son tus usuarios, que obras existen y quien puede
ver que. Ninguna tiene un CREATE TABLE en el repositorio: se crearon a mano hace
tiempo y el proyecto llevaba desde entonces viviendo de eso. La propia migracion
base de Alembic lo admite por escrito.

Consecuencia, hasta hoy: SI SE PERDIA LA BASE, NO SE PODIA RECONSTRUIR. Se
tuvieran las copias que se tuvieran, no habia donde cargarlas. Y el arranque en
Render (alembic upgrade head) tampoco levantaba sobre una base vacia.

Estas definiciones se extrajeron de la base real en produccion, asi que son
exactamente las que hay. Se crean ANTES que nada en el arranque, porque el resto
del esquema depende de ellas.

Se mantiene a mano: si anades una tabla, ponla tambien aqui, o volveras a tener
una plataforma que no se puede reconstruir.
"""
from esquema_congelado import solo_con_ddl

from app_logging import get_logger

logger = get_logger('esquema')

# En este orden: primero las que otras referencian.
TABLAS = [
    ("companies", """
        CREATE TABLE IF NOT EXISTS "companies" (
        "id" SERIAL,
        "name" character varying(255) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (name)
        )
    """),
    ("job_titles", """
        CREATE TABLE IF NOT EXISTS "job_titles" (
        "id" SERIAL,
        "name" character varying(255) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (name)
        )
    """),
    ("hubs", """
        CREATE TABLE IF NOT EXISTS "hubs" (
        "id" text NOT NULL,
        "name" character varying(255) NOT NULL,
        "region" character varying(100),
        "logo_url" text,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        "is_active" boolean DEFAULT true,
        PRIMARY KEY (id)
        )
    """),
    ("projects", """
        CREATE TABLE IF NOT EXISTS "projects" (
        "id" text NOT NULL,
        "name" character varying(255) NOT NULL,
        "number" character varying(50),
        "location" character varying(255),
        "account" character varying(100) DEFAULT 'Plataforma BIM'::character varying,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "hub_id" text,
        "description" text,
        "model_urn" text,
        "thumbnail_url" text,
        "status" character varying(50) DEFAULT 'active'::character varying,
        "project_type" character varying(100),
        "start_date" date,
        "end_date" date,
        "metadata" jsonb DEFAULT '{}'::jsonb,
        "invite_code" character varying(10),
        PRIMARY KEY (id),
        UNIQUE (invite_code)
        )
    """),
    ("users", """
        CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL,
        "name" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" character varying(50) DEFAULT 'user'::character varying,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "company_id" integer,
        "job_title_id" integer,
        "is_active" boolean DEFAULT true,
        "last_login_at" timestamp without time zone,
        PRIMARY KEY (id),
        UNIQUE (email)
        )
    """),
    ("project_users", """
        CREATE TABLE IF NOT EXISTS "project_users" (
        "project_id" text NOT NULL,
        "user_id" integer NOT NULL,
        "assigned_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id)
        )
    """),
    ("sessions", """
        CREATE TABLE IF NOT EXISTS "sessions" (
        "token" character varying(128) NOT NULL,
        "user_id" integer,
        "created_at" timestamp without time zone DEFAULT now(),
        "expires_at" timestamp without time zone NOT NULL,
        "is_active" boolean DEFAULT true,
        PRIMARY KEY (token)
        )
    """),
    ("folder_permissions", """
        CREATE TABLE IF NOT EXISTS "folder_permissions" (
        "id" SERIAL,
        "folder_node_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "permission_level" character varying(20) DEFAULT 'view_only'::character varying NOT NULL,
        "granted_by" integer,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE (folder_node_id, user_id)
        )
    """),
    ("auth_events", """
        CREATE TABLE IF NOT EXISTS "auth_events" (
        "id" SERIAL,
        "creado_en" timestamp without time zone DEFAULT now(),
        "evento" character varying(40) NOT NULL,
        "email" character varying(255),
        "user_id" integer,
        "ip" character varying(64),
        "user_agent" text,
        "detalle" text,
        PRIMARY KEY (id)
        )
    """),
    ("civil_base_axis", """
        CREATE TABLE IF NOT EXISTS "civil_base_axis" (
        "scope" text NOT NULL,
        "pin" jsonb,
        "updated_at" timestamp with time zone DEFAULT now(),
        PRIMARY KEY (scope)
        )
    """),
    ("civil_surfaces", """
        CREATE TABLE IF NOT EXISTS "civil_surfaces" (
        "scope_urn" text NOT NULL,
        "urn" text NOT NULL,
        "data" jsonb NOT NULL,
        "display_name" text,
        "updated_at" timestamp with time zone DEFAULT now(),
        PRIMARY KEY (scope_urn, urn)
        )
    """),
    ("dashboards", """
        CREATE TABLE IF NOT EXISTS "dashboards" (
        "id" SERIAL,
        "project" text NOT NULL,
        "name" text DEFAULT 'General'::text NOT NULL,
        "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
        )
    """),
    ("gemelo_assets", """
        CREATE TABLE IF NOT EXISTS "gemelo_assets" (
        "id" SERIAL,
        "urn" text NOT NULL,
        "project_id" text NOT NULL,
        "element_id" text NOT NULL,
        "name" text,
        "category" text,
        "native_props" jsonb,
        "added_at" timestamp without time zone DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (urn, project_id, element_id)
        )
    """),
    ("gemelo_ingestion_status", """
        CREATE TABLE IF NOT EXISTS "gemelo_ingestion_status" (
        "urn" text NOT NULL,
        "project_id" text NOT NULL,
        "status" text NOT NULL,
        "progress" integer DEFAULT 0,
        "message" text,
        "updated_at" timestamp without time zone DEFAULT now(),
        PRIMARY KEY (urn)
        )
    """),
    ("gemelo_properties", """
        CREATE TABLE IF NOT EXISTS "gemelo_properties" (
        "id" SERIAL,
        "urn" text NOT NULL,
        "element_id" text NOT NULL,
        "project_id" text NOT NULL,
        "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "updated_at" timestamp without time zone DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (urn, element_id, project_id)
        )
    """),
    ("handoff_tickets", """
        CREATE TABLE IF NOT EXISTS "handoff_tickets" (
        "ticket" character varying(64) NOT NULL,
        "session_token" character varying(128) NOT NULL,
        "expires_at" timestamp without time zone NOT NULL,
        "used_at" timestamp without time zone,
        PRIMARY KEY (ticket)
        )
    """),
    ("inventory_assets", """
        CREATE TABLE IF NOT EXISTS "inventory_assets" (
        "id" SERIAL,
        "external_id" character varying(255) NOT NULL,
        "name" character varying(255) NOT NULL,
        "material" character varying(255),
        "installation_status" character varying(100),
        "last_updated" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "properties" jsonb,
        "model_urn" character varying(255),
        "source_urn" character varying(255),
        "vaciado_nro" character varying(50),
        "project_id" text,
        "physical_station_range" numrange,
        PRIMARY KEY (id),
        UNIQUE (model_urn, external_id)
        )
    """),
    ("link_commands", """
        CREATE TABLE IF NOT EXISTS "link_commands" (
        "id" SERIAL,
        "project" text NOT NULL,
        "action" text NOT NULL,
        "payload" jsonb,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
        )
    """),
    ("link_presence", """
        CREATE TABLE IF NOT EXISTS "link_presence" (
        "project" text NOT NULL,
        "agent" text NOT NULL,
        "last_seen" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        "user_id" text,
        PRIMARY KEY (project, agent)
        )
    """),
    ("link_reports", """
        CREATE TABLE IF NOT EXISTS "link_reports" (
        "project" text NOT NULL,
        "kind" text NOT NULL,
        "payload" jsonb,
        "version" bigint DEFAULT 1 NOT NULL,
        "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project, kind)
        )
    """),
    ("lob_activities", """
        CREATE TABLE IF NOT EXISTS "lob_activities" (
        "model_urn" text NOT NULL,
        "activity_id" text NOT NULL,
        "nombre" text,
        "start_date" date,
        "finish_date" date,
        "percent" double precision,
        "status" text,
        PRIMARY KEY (model_urn, activity_id)
        )
    """),
    ("lob_activity_relations", """
        CREATE TABLE IF NOT EXISTS "lob_activity_relations" (
        "dataset_id" text NOT NULL,
        "predecessor_id" text NOT NULL,
        "successor_id" text NOT NULL,
        "relation_type" text DEFAULT 'FS'::text NOT NULL,
        "lag_hours" double precision DEFAULT 0 NOT NULL,
        "source" text DEFAULT 'p6'::text NOT NULL,
        PRIMARY KEY (dataset_id, predecessor_id, successor_id, relation_type)
        )
    """),
    ("lob_activity_schedule", """
        CREATE TABLE IF NOT EXISTS "lob_activity_schedule" (
        "dataset_id" text NOT NULL,
        "activity_id" text NOT NULL,
        "nombre" text,
        "planned_start" date,
        "planned_finish" date,
        "actual_start" date,
        "actual_finish" date,
        "percent" double precision,
        "status" text,
        PRIMARY KEY (dataset_id, activity_id)
        )
    """),
    ("lob_avance", """
        CREATE TABLE IF NOT EXISTS "lob_avance" (
        "model_urn" text NOT NULL,
        "codigo" text NOT NULL,
        "periodo" integer NOT NULL,
        "metrado_ejec" double precision,
        PRIMARY KEY (model_urn, codigo, periodo)
        )
    """),
    ("lob_config", """
        CREATE TABLE IF NOT EXISTS "lob_config" (
        "model_urn" text NOT NULL,
        "fecha_inicio" date,
        "dias_por_periodo" integer DEFAULT 30,
        "updated_at" timestamp without time zone DEFAULT now(),
        PRIMARY KEY (model_urn)
        )
    """),
    ("lob_cost_items", """
        CREATE TABLE IF NOT EXISTS "lob_cost_items" (
        "dataset_id" text NOT NULL,
        "codigo" text NOT NULL,
        "parent_codigo" text,
        "descripcion" text,
        "unidad" text,
        "metrado" double precision,
        "pu" double precision,
        "rendimiento" double precision,
        "duracion" double precision,
        "activity_id" text,
        "frente_label" text,
        "orden" integer DEFAULT 0 NOT NULL,
        "tipo" text DEFAULT 'partida'::text NOT NULL,
        PRIMARY KEY (dataset_id, codigo)
        )
    """),
    ("lob_dataset_audit", """
        CREATE TABLE IF NOT EXISTS "lob_dataset_audit" (
        "id" BIGSERIAL,
        "dataset_id" text,
        "scope_urn" text NOT NULL,
        "action" text NOT NULL,
        "performed_by" text,
        "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (id)
        )
    """),
    ("lob_dataset_sources", """
        CREATE TABLE IF NOT EXISTS "lob_dataset_sources" (
        "dataset_id" text NOT NULL,
        "source_type" text NOT NULL,
        "original_name" text NOT NULL,
        "gcs_urn" text,
        "sha256" text NOT NULL,
        "size_bytes" bigint NOT NULL,
        "content_type" text,
        "archived" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (dataset_id, source_type)
        )
    """),
    ("lob_datasets", """
        CREATE TABLE IF NOT EXISTS "lob_datasets" (
        "id" text NOT NULL,
        "project_id" text NOT NULL,
        "front_id" text,
        "scope_urn" text NOT NULL,
        "version" integer NOT NULL,
        "name" text NOT NULL,
        "status" text DEFAULT 'processing'::text NOT NULL,
        "data_date" date,
        "is_active" boolean DEFAULT false NOT NULL,
        "source_fingerprint" text,
        "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "activated_by" text,
        "activated_at" timestamp with time zone,
        PRIMARY KEY (id),
        UNIQUE (scope_urn, version)
        )
    """),
    ("lob_element_links", """
        CREATE TABLE IF NOT EXISTS "lob_element_links" (
        "dataset_id" text NOT NULL,
        "source_urn" text NOT NULL,
        "external_id" text NOT NULL,
        "codigo" text NOT NULL,
        "activity_id" text,
        "link_method" text DEFAULT 'property_exact'::text NOT NULL,
        "confidence" double precision DEFAULT 1 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (dataset_id, source_urn, external_id, codigo)
        )
    """),
    ("lob_frentes", """
        CREATE TABLE IF NOT EXISTS "lob_frentes" (
        "model_urn" text NOT NULL,
        "frente" text NOT NULL,
        "cod_base" text NOT NULL,
        PRIMARY KEY (model_urn, frente, cod_base)
        )
    """),
    ("lob_front_map", """
        CREATE TABLE IF NOT EXISTS "lob_front_map" (
        "dataset_id" text NOT NULL,
        "frente" text NOT NULL,
        "cod_base" text NOT NULL,
        PRIMARY KEY (dataset_id, frente, cod_base)
        )
    """),
    ("lob_linear_methodologies", """
        CREATE TABLE IF NOT EXISTS "lob_linear_methodologies" (
        "id" text NOT NULL,
        "project_id" text NOT NULL,
        "scope_urn" text,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "project_type" text NOT NULL,
        "description" text,
        "reusable" boolean DEFAULT true NOT NULL,
        "is_default" boolean DEFAULT false NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (scope_urn, code, version)
        )
    """),
    ("lob_linear_methodology_steps", """
        CREATE TABLE IF NOT EXISTS "lob_linear_methodology_steps" (
        "methodology_id" text NOT NULL,
        "step_code" text NOT NULL,
        "sequence" integer NOT NULL,
        "name" text NOT NULL,
        "cost_code_pattern" text,
        "relation_type" text DEFAULT 'FS'::text NOT NULL,
        "lag_days" double precision DEFAULT 0 NOT NULL,
        "production_rate" double precision,
        "production_unit" text,
        "crew_code" text,
        "behavior" text DEFAULT 'construct'::text NOT NULL,
        "color" text DEFAULT '#3aa0ff'::text NOT NULL,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
        PRIMARY KEY (methodology_id, step_code),
        UNIQUE (methodology_id, sequence)
        )
    """),
    ("lob_linear_profiles", """
        CREATE TABLE IF NOT EXISTS "lob_linear_profiles" (
        "scope_urn" text NOT NULL,
        "project_id" text NOT NULL,
        "front_id" text,
        "standard_version" text DEFAULT 'LOB-LINEAR/1.0'::text NOT NULL,
        "name" text NOT NULL,
        "project_type" text NOT NULL,
        "alignment_id" text,
        "station_start" double precision NOT NULL,
        "station_end" double precision NOT NULL,
        "station_unit" text DEFAULT 'm'::text NOT NULL,
        "station_notation" text DEFAULT '0+000.00'::text NOT NULL,
        "direction" smallint DEFAULT 1 NOT NULL,
        "timezone" text DEFAULT 'America/Lima'::text NOT NULL,
        "currency" text DEFAULT 'PEN'::text NOT NULL,
        "calendar" jsonb DEFAULT jsonb_build_object('work_days', jsonb_build_array(1, 2, 3, 4, 5, 6), 'hours_per_day', 8) NOT NULL,
        "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "status" text DEFAULT 'setup'::text NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_by" text,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (scope_urn)
        )
    """),
    ("lob_linear_progress_events", """
        CREATE TABLE IF NOT EXISTS "lob_linear_progress_events" (
        "id" text NOT NULL,
        "scope_urn" text NOT NULL,
        "dataset_id" text,
        "codigo" text NOT NULL,
        "zone_code" text,
        "event_date" date NOT NULL,
        "station_start" double precision,
        "station_end" double precision,
        "quantity" double precision,
        "unit" text,
        "percent_complete" double precision,
        "source" text DEFAULT 'field'::text NOT NULL,
        "note" text,
        "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (id)
        )
    """),
    ("lob_linear_resources", """
        CREATE TABLE IF NOT EXISTS "lob_linear_resources" (
        "id" text NOT NULL,
        "scope_urn" text NOT NULL,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "resource_type" text NOT NULL,
        "capacity" double precision,
        "unit" text,
        "cost_rate" double precision,
        "availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (scope_urn, code)
        )
    """),
    ("lob_linear_scenarios", """
        CREATE TABLE IF NOT EXISTS "lob_linear_scenarios" (
        "id" text NOT NULL,
        "scope_urn" text NOT NULL,
        "dataset_id" text,
        "name" text NOT NULL,
        "scenario_type" text DEFAULT 'working'::text NOT NULL,
        "status" text DEFAULT 'draft'::text NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "approved_by" text,
        "approved_at" timestamp with time zone,
        PRIMARY KEY (id)
        )
    """),
    ("lob_linear_zones", """
        CREATE TABLE IF NOT EXISTS "lob_linear_zones" (
        "id" text NOT NULL,
        "scope_urn" text NOT NULL,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "parent_code" text,
        "zone_type" text DEFAULT 'production'::text NOT NULL,
        "station_start" double precision NOT NULL,
        "station_end" double precision NOT NULL,
        "sequence" integer DEFAULT 0 NOT NULL,
        "alignment_id" text,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (scope_urn, code)
        )
    """),
    ("lob_locations", """
        CREATE TABLE IF NOT EXISTS "lob_locations" (
        "dataset_id" text NOT NULL,
        "codigo" text NOT NULL,
        "alignment_id" text,
        "station_start" double precision,
        "station_end" double precision,
        "direction" smallint DEFAULT 1 NOT NULL,
        "source" text DEFAULT 'manual'::text NOT NULL,
        PRIMARY KEY (dataset_id, codigo)
        )
    """),
    ("lob_partidas", """
        CREATE TABLE IF NOT EXISTS "lob_partidas" (
        "model_urn" text NOT NULL,
        "codigo" text NOT NULL,
        "descripcion" text,
        "unidad" text,
        "metrado" double precision,
        "pu" double precision,
        "rendimiento" double precision,
        "duracion" double precision,
        "activity_id" text,
        "frente_label" text,
        "orden" integer,
        "updated_at" timestamp without time zone DEFAULT now(),
        "tipo" text DEFAULT 'partida'::text,
        PRIMARY KEY (model_urn, codigo)
        )
    """),
    ("lob_progress_entries", """
        CREATE TABLE IF NOT EXISTS "lob_progress_entries" (
        "dataset_id" text NOT NULL,
        "codigo" text NOT NULL,
        "periodo" integer NOT NULL,
        "metrado_ejec" double precision DEFAULT 0 NOT NULL,
        "period_start" date,
        "period_end" date,
        PRIMARY KEY (dataset_id, codigo, periodo)
        )
    """),
    ("lob_schedule_tasks", """
        CREATE TABLE IF NOT EXISTS "lob_schedule_tasks" (
        "id" SERIAL,
        "task_name" text NOT NULL,
        "color" text DEFAULT '#ff0000'::text,
        "project_id" text,
        "time_domain" tsrange,
        "station_domain" numrange,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
        )
    """),
    ("lob_schedule_tasks_v2", """
        CREATE TABLE IF NOT EXISTS "lob_schedule_tasks_v2" (
        "id" SERIAL,
        "task_name" character varying(255) NOT NULL,
        "color" character varying(50) DEFAULT '#ffffff'::character varying,
        "date_range" daterange,
        "pk_range" numrange,
        PRIMARY KEY (id)
        )
    """),
    ("otp_codes", """
        CREATE TABLE IF NOT EXISTS "otp_codes" (
        "id" SERIAL,
        "email" character varying(255) NOT NULL,
        "code" character varying(10) NOT NULL,
        "expires_at" timestamp without time zone NOT NULL,
        "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
        )
    """),
    ("project_frentes", """
        CREATE TABLE IF NOT EXISTS "project_frentes" (
        "id" SERIAL,
        "base_project_id" text NOT NULL,
        "front_id" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "icon" text DEFAULT '📌'::text,
        "created_at" timestamp without time zone DEFAULT now(),
        "front_type" text,
        PRIMARY KEY (id),
        UNIQUE (base_project_id, front_id)
        )
    """),]


# Columnas que la base de produccion tiene y que ninguna rutina crea. Salieron de
# comparar, columna a columna, la base real con una reconstruida desde cero: la
# restauracion no cargaba esas tres tablas porque la copia traia columnas que en
# el destino no existian. Es el mismo problema que las tablas que faltaban, en
# pequeno, y con el mismo efecto: la plataforma no se puede reproducir.
COLUMNAS_PENDIENTES = [
    # Reserva de edicion: quien tiene el documento cogido y desde cuando. Ver
    # backend/bloqueo_de_edicion.py.
    ('file_nodes', 'bloqueado_por', 'VARCHAR(255)'),
    ('file_nodes', 'bloqueado_en', 'TIMESTAMP WITH TIME ZONE'),
    ('tracking_progress', 'fecha_actualizacion',
     'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'),
    ('tracking_details', 'tracking_id', 'INTEGER'),
    ('model_config', 'default_view_guid', 'TEXT'),
    # Vivia SOLO dentro del manejador que publica un modelo al visor, sin
    # condicionar al interruptor: era el ultimo DDL sin guardia en camino de
    # peticion, y con DDL_EN_CALIENTE=false la columna no se habria creado
    # nunca en una base restaurada -- publicar habria fallado con «no existe
    # la columna urn_aps». Su sitio es este.
    ('file_nodes', 'urn_aps', 'TEXT'),
]


@solo_con_ddl
def ensure_columnas_pendientes():
    """Anade las columnas sueltas que faltan. Va AL FINAL del arranque, cuando las
    tablas que las llevan ya existen."""
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        for tabla, columna, tipo in COLUMNAS_PENDIENTES:
            try:
                cur.execute("SAVEPOINT c")
                cur.execute(f'ALTER TABLE IF EXISTS "{tabla}" '
                            f'ADD COLUMN IF NOT EXISTS "{columna}" {tipo}')
                cur.execute("RELEASE SAVEPOINT c")
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT c")
                logger.warning(f"columna {tabla}.{columna}: {str(e)[:100]}")
        conn.commit()


@solo_con_ddl
def ensure_esquema_base():
    """Crea las tablas que ninguna otra rutina crea. Idempotente."""
    from db import get_db_connection
    creadas, fallos = 0, []
    with get_db_connection() as conn:
        cur = conn.cursor()
        for nombre, sentencia in TABLAS:
            try:
                cur.execute("SAVEPOINT t")
                cur.execute(sentencia)
                cur.execute("RELEASE SAVEPOINT t")
                creadas += 1
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT t")
                fallos.append(f"{nombre}: {str(e)[:120]}")
        conn.commit()
    if fallos:
        # Se avisa alto: si falta una tabla base, lo que viene detras fallara en
        # cascada y el mensaje de ese fallo no dira cual fue la causa.
        logger.error(f"esquema base: {len(fallos)} tablas no se pudieron crear")
        for f in fallos:
            logger.error(f"   {f}")
    return creadas, fallos
