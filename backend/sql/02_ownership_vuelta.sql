-- IDA/VUELTA de la propiedad: ecd_migrator -> postgres
-- Generado el 12-ago-2026 desde el inventario REAL de produccion.
-- Revisado y CORREGIDO el 13-ago-2026: ver "lo que estaba mal" mas abajo.
--
-- Objetos propios del ECD unicamente: las 37 funciones de pgcrypto y las 4 de
-- plpgsql NO aparecen aqui a proposito, porque pertenecen a una extension y
-- moverlas rompe su vinculo con ella. Por eso no se usa REASSIGN OWNED.
-- Idempotente: ALTER ... OWNER TO sobre un objeto que ya pertenece al destino
-- no falla. Se ejecuta dentro de UNA transaccion.
--
-- LO QUE ESTABA MAL, Y SE COMPROBO EJECUTANDO
-- -------------------------------------------
-- 1. EMPEZABA CON 34 "ALTER SEQUENCE ... OWNER TO". Las 32 secuencias de esta
--    base son DEPENDIENTES: pertenecen a la columna serial de su tabla, y
--    PostgreSQL rechaza cambiarles el dueno por separado
--        cannot change owner of sequence "x_id_seq"
--        DETAIL: Sequence "x_id_seq" is linked to table "x".
--    Como todo va dentro de BEGIN...COMMIT, el guion abortaba en su PRIMERA
--    sentencia y no hacia absolutamente nada. La propiedad de una secuencia
--    dependiente viaja sola con la de su tabla, asi que esas lineas sobran.
-- 2. EL "ALTER SCHEMA" ESTABA AL FINAL. Tiene que ir al principio: el nuevo
--    dueno necesita mandar en el esquema antes de tocar lo que hay dentro.
-- 3. NADIE CREABA LOS ROLES. Ver 00_roles.sql.
-- 4. FALTABA LA PERTENENCIA AL ROL DESTINO. Desde PostgreSQL 16 hay que ser
--    miembro del rol al que se cede, y en Cloud SQL 'postgres' NO es
--    superusuario: sin esto, "must be member of role" y vuelta a empezar.

\set ON_ERROR_STOP on

-- Si los roles no existen, parar aqui con un mensaje claro en vez de fallar
-- treinta lineas mas abajo con un error de PostgreSQL.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        RAISE EXCEPTION 'Falta el rol ecd_app. Ejecuta antes 00_roles.sql.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_migrator') THEN
        RAISE EXCEPTION 'Falta el rol ecd_migrator. Ejecuta antes 00_roles.sql.';
    END IF;
END $$;

BEGIN;

-- Que una tabla bloqueada no deje la migracion colgada esperando para siempre.
SET LOCAL lock_timeout = '5s';

-- Ser miembro del rol destino: obligatorio desde PostgreSQL 16 para cederle
-- objetos, y en Cloud SQL no se hereda de ningun sitio.
GRANT postgres TO CURRENT_USER WITH SET TRUE;


-- El esquema PRIMERO: sin mandar en el, lo de dentro no se puede ceder.
ALTER SCHEMA ai_brain OWNER TO postgres;
ALTER SCHEMA public   OWNER TO postgres;

-- 88 objetos. Las secuencias NO aparecen: su propiedad viaja
-- con la de su tabla (se quitaron 34 lineas que abortaban el guion).
ALTER TABLE ai_brain."feedback_buffer" OWNER TO postgres;
ALTER TABLE ai_brain."global_knowledge" OWNER TO postgres;
ALTER TABLE ai_brain."semantic_triples" OWNER TO postgres;
ALTER TABLE public."activity_log" OWNER TO postgres;
ALTER TABLE public."alembic_version" OWNER TO postgres;
ALTER TABLE public."app_tokens" OWNER TO postgres;
ALTER TABLE public."asset_user_data" OWNER TO postgres;
ALTER TABLE public."auth_events" OWNER TO postgres;
ALTER TABLE public."civil_alignments" OWNER TO postgres;
ALTER TABLE public."civil_base_axis" OWNER TO postgres;
ALTER TABLE public."civil_sections" OWNER TO postgres;
ALTER TABLE public."civil_surfaces" OWNER TO postgres;
ALTER TABLE public."companies" OWNER TO postgres;
ALTER TABLE public."control_pins" OWNER TO postgres;
ALTER TABLE public."custom_attr_defs" OWNER TO postgres;
ALTER TABLE public."custom_attr_values" OWNER TO postgres;
ALTER TABLE public."daily_reports" OWNER TO postgres;
ALTER TABLE public."dashboards" OWNER TO postgres;
ALTER TABLE public."doc_partidas" OWNER TO postgres;
ALTER TABLE public."doc_redlines" OWNER TO postgres;
ALTER TABLE public."doc_reviews" OWNER TO postgres;
ALTER TABLE public."doc_rfis" OWNER TO postgres;
ALTER TABLE public."doc_set_items" OWNER TO postgres;
ALTER TABLE public."doc_sets" OWNER TO postgres;
ALTER TABLE public."document_shares" OWNER TO postgres;
ALTER TABLE public."element_docs" OWNER TO postgres;
ALTER TABLE public."extraction_jobs" OWNER TO postgres;
ALTER TABLE public."file_nodes" OWNER TO postgres;
ALTER TABLE public."file_versions" OWNER TO postgres;
ALTER TABLE public."folder_permissions" OWNER TO postgres;
ALTER TABLE public."gemelo_assets" OWNER TO postgres;
ALTER TABLE public."gemelo_ingestion_status" OWNER TO postgres;
ALTER TABLE public."gemelo_properties" OWNER TO postgres;
ALTER TABLE public."geo_control_points" OWNER TO postgres;
ALTER TABLE public."geo_model_georef" OWNER TO postgres;
ALTER TABLE public."handoff_tickets" OWNER TO postgres;
ALTER TABLE public."hubs" OWNER TO postgres;
ALTER TABLE public."inventory_assets" OWNER TO postgres;
ALTER TABLE public."job_titles" OWNER TO postgres;
ALTER TABLE public."link_commands" OWNER TO postgres;
ALTER TABLE public."link_presence" OWNER TO postgres;
ALTER TABLE public."link_reports" OWNER TO postgres;
ALTER TABLE public."lob_activities" OWNER TO postgres;
ALTER TABLE public."lob_activity_relations" OWNER TO postgres;
ALTER TABLE public."lob_activity_schedule" OWNER TO postgres;
ALTER TABLE public."lob_avance" OWNER TO postgres;
ALTER TABLE public."lob_config" OWNER TO postgres;
ALTER TABLE public."lob_cost_items" OWNER TO postgres;
ALTER TABLE public."lob_dataset_audit" OWNER TO postgres;
ALTER TABLE public."lob_dataset_sources" OWNER TO postgres;
ALTER TABLE public."lob_datasets" OWNER TO postgres;
ALTER TABLE public."lob_element_links" OWNER TO postgres;
ALTER TABLE public."lob_frentes" OWNER TO postgres;
ALTER TABLE public."lob_front_map" OWNER TO postgres;
ALTER TABLE public."lob_linear_methodologies" OWNER TO postgres;
ALTER TABLE public."lob_linear_methodology_steps" OWNER TO postgres;
ALTER TABLE public."lob_linear_profiles" OWNER TO postgres;
ALTER TABLE public."lob_linear_progress_events" OWNER TO postgres;
ALTER TABLE public."lob_linear_resources" OWNER TO postgres;
ALTER TABLE public."lob_linear_scenarios" OWNER TO postgres;
ALTER TABLE public."lob_linear_zones" OWNER TO postgres;
ALTER TABLE public."lob_locations" OWNER TO postgres;
ALTER TABLE public."lob_partidas" OWNER TO postgres;
ALTER TABLE public."lob_progress_entries" OWNER TO postgres;
ALTER TABLE public."lob_schedule_tasks" OWNER TO postgres;
ALTER TABLE public."lob_schedule_tasks_v2" OWNER TO postgres;
ALTER TABLE public."model_config" OWNER TO postgres;
ALTER TABLE public."nomenclatura_config" OWNER TO postgres;
ALTER TABLE public."otp_codes" OWNER TO postgres;
ALTER TABLE public."pdf_calibrations" OWNER TO postgres;
ALTER TABLE public."pdf_markups" OWNER TO postgres;
ALTER TABLE public."photo_evidences" OWNER TO postgres;
ALTER TABLE public."presupuesto_maestro" OWNER TO postgres;
ALTER TABLE public."project_frentes" OWNER TO postgres;
ALTER TABLE public."project_settings" OWNER TO postgres;
ALTER TABLE public."project_users" OWNER TO postgres;
ALTER TABLE public."projects" OWNER TO postgres;
ALTER TABLE public."saved_views" OWNER TO postgres;
ALTER TABLE public."sensibilidad_catalogo" OWNER TO postgres;
ALTER TABLE public."sessions" OWNER TO postgres;
ALTER TABLE public."tracking_details" OWNER TO postgres;
ALTER TABLE public."tracking_pins" OWNER TO postgres;
ALTER TABLE public."tracking_progress" OWNER TO postgres;
ALTER TABLE public."transmittals" OWNER TO postgres;
ALTER TABLE public."triaje_seguridad" OWNER TO postgres;
ALTER TABLE public."upload_sessions" OWNER TO postgres;
ALTER TABLE public."users" OWNER TO postgres;
ALTER FUNCTION public.resolve_folder_path(p_path text, p_model_urn character varying, p_created_by character varying, p_auto_create boolean) OWNER TO postgres;

COMMIT;
