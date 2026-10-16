-- 32 rollback: devuelve file_node_id a INTEGER en pdf_markups y pdf_calibrations.
--
-- LEE ESTO ANTES DE EJECUTARLO
-- ----------------------------
-- El rollback normal de un despliegue es REVERTIR EL CODIGO, no la migracion
-- (AGENTS.md 4.3). Aqui, ademas, volver atras solo es posible si NO se ha
-- escrito nada nuevo: un UUID no cabe en un INTEGER. Y no se habia podido
-- escribir nada ANTES de la 32 --ese era justamente el defecto--, asi que
-- cualquier fila que exista es de despues y se perderia.
--
-- Por eso esto ABORTA si hay filas, en vez de vaciarlas. Si de verdad quieres
-- tirar esas marcas, borralas tu a mano y a conciencia, y vuelve a correr esto.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
    tabla TEXT;
    tipo  TEXT;
    filas BIGINT;
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

        IF tipo IS DISTINCT FROM 'uuid' THEN
            RAISE NOTICE '%.file_node_id no es UUID: no hay nada que deshacer.', tabla;
            CONTINUE;
        END IF;

        EXECUTE format('SELECT count(*) FROM public.%I', tabla) INTO filas;
        IF filas > 0 THEN
            RAISE EXCEPTION 'PDF_UUID_ROLLBACK: % tiene % fila(s) con UUID. Volver a '
                            'INTEGER las perderia. Borralas a mano si de verdad '
                            'quieres tirarlas.', tabla, filas;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN file_node_id '
                       'TYPE INTEGER USING NULL', tabla);
        RAISE NOTICE '%.file_node_id devuelto a INTEGER (estaba vacia).', tabla;
    END LOOP;
END $$;

COMMIT;
