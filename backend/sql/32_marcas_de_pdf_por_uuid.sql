-- 32: pdf_markups.file_node_id y pdf_calibrations.file_node_id pasan a UUID.
--     Migracion manual como ecd_migrator, ANTES de desplegar nada que dependa.
--
-- EL DEFECTO, MEDIDO EN PRODUCCION (16-sep-2026)
-- ----------------------------------------------
-- Cada apertura de un plano deja esto en el log:
--
--   ERROR [db] invalid input syntax for type integer:
--     "008db2c7-779a-4e6b-9872-7f5bf4148aca"
--     File "backend/routes/pdf_tools.py", line 134, in list_markups
--
-- Las dos tablas se crearon con `file_node_id INTEGER` y `file_nodes.id` es
-- UUID. Consecuencia: las marcas y las calibraciones de un plano no se leen ni
-- se guardan NUNCA. La herramienta esta en el visor, el usuario la ve, y el
-- servidor la rechaza siempre.
--
-- POR QUE NO SE ARREGLO SOLO
-- --------------------------
-- El codigo ya trae la conversion (`_migrar_a_uuid` en routes/pdf_tools.py),
-- pero cuelga de `ensure_pdf_tools_tables`, que lleva `@solo_con_ddl`. Con el
-- esquema congelado --que es como corre produccion-- esa funcion devuelve None
-- y la conversion no se ejecuta jamas. Por eso hace falta esto, a mano.
--
-- QUE HACE Y QUE NO
-- -----------------
-- Convierte el tipo y nada mas: no crea, no borra y no reescribe ninguna fila.
-- Si alguna fila no convierte a UUID --una huerfana con `file_node_id = 123`,
-- que no apunta a ningun documento y nunca se pudo mostrar-- ABORTA y dice
-- cuantas son. Decidir que hacer con un dato que no entendemos no es cosa de
-- una migracion.
--
-- Los indices que cuelgan de la columna (idx_pdf_markups_node_page, el unico
-- parcial de publicados de la 14, y la clave primaria de pdf_calibrations) los
-- reconstruye Postgres solo al cambiar el tipo. No hay vistas que dependan.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
    tabla    TEXT;
    tipo     TEXT;
    rebeldes BIGINT;
    ejemplos TEXT;
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PDF_UUID_ROLE_GUARD: el DDL va como ecd_migrator, no como %',
                        current_user;
    END IF;

    FOREACH tabla IN ARRAY ARRAY['pdf_markups', 'pdf_calibrations'] LOOP
        SELECT format_type(a.atttypid, a.atttypmod) INTO tipo
          FROM pg_class c
          JOIN pg_attribute a ON a.attrelid = c.oid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = tabla
           AND a.attname = 'file_node_id' AND a.attnum > 0 AND NOT a.attisdropped;

        IF tipo IS NULL THEN
            RAISE EXCEPTION 'PDF_UUID_GUARD: no existe public.%.file_node_id', tabla;
        END IF;

        IF tipo = 'uuid' THEN
            RAISE NOTICE '%.file_node_id ya es UUID: no se toca.', tabla;
            CONTINUE;
        END IF;

        EXECUTE format(
            'SELECT count(*), coalesce(string_agg(DISTINCT muestra, '', ''), '''')
               FROM (SELECT file_node_id::text AS muestra FROM public.%I
                      WHERE file_node_id::text !~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-'
                      '[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$''
                      LIMIT 5) AS m', tabla)
          INTO rebeldes, ejemplos;

        IF rebeldes > 0 THEN
            RAISE EXCEPTION 'PDF_UUID_DATOS: %.file_node_id tiene % fila(s) que no '
                            'convierten a UUID (%). NO se migra y NO se borra nada: '
                            'decide primero que hacer con esas filas.',
                            tabla, rebeldes, ejemplos;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN file_node_id '
                       'TYPE UUID USING file_node_id::text::uuid', tabla);
        RAISE NOTICE '%.file_node_id migrado a UUID.', tabla;
    END LOOP;
END $$;

COMMIT;

-- COMPROBACION (debe devolver uuid en las dos filas):
--   SELECT c.relname, format_type(a.atttypid, a.atttypmod)
--     FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
--    WHERE c.relname IN ('pdf_markups', 'pdf_calibrations')
--      AND a.attname = 'file_node_id';
