-- CONVERGENCIA UNICA DE OBJETOS CREADOS POR LA APLICACION
-- ======================================================
-- Se ejecuta una sola vez con la identidad administrativa de Cloud SQL,
-- DESPUES de 00_roles.sql y ANTES del primer bootstrap como ecd_migrator.
--
-- El inventario estatico 01_ownership_ida.sql reflejaba una fotografia. Desde
-- entonces el DDL en caliente creo tablas nuevas bajo ecd_app. Este guion no
-- adivina nombres: transfiere todos los objetos que ecd_app aun posea dentro de
-- los dos schemas del ECD. No cambia ni borra una fila de datos.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Cloud SQL exige pertenencia al rol destino para transferir propiedad. Este
-- GRANT requiere la identidad administrativa y falla antes de tocar objetos si
-- se intenta ejecutar como ecd_app.
GRANT ecd_app, ecd_migrator TO CURRENT_USER WITH SET TRUE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecd_app') OR
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecd_migrator') THEN
        RAISE EXCEPTION 'Faltan ecd_app/ecd_migrator; ejecuta antes 00_roles.sql';
    END IF;
    IF NOT pg_has_role(current_user, 'ecd_app', 'MEMBER') OR
       NOT pg_has_role(current_user, 'ecd_migrator', 'MEMBER') THEN
        RAISE EXCEPTION 'La identidad administrativa debe ser miembro de ecd_app y ecd_migrator';
    END IF;
END $$;

ALTER SCHEMA public   OWNER TO ecd_migrator;
ALTER SCHEMA ai_brain OWNER TO ecd_migrator;

DO $$
DECLARE o record;
BEGIN
    -- Tablas primero: sus secuencias dependientes viajan con la propiedad.
    FOR o IN
        SELECT n.nspname, c.relname, c.relkind
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND pg_get_userbyid(c.relowner)='ecd_app'
           AND c.relkind IN ('r','p','v','m','f')
         ORDER BY n.nspname, c.relname
    LOOP
        EXECUTE format('ALTER %s %I.%I OWNER TO ecd_migrator',
            CASE o.relkind
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'f' THEN 'FOREIGN TABLE'
              ELSE 'TABLE'
            END,
            o.nspname, o.relname);
    END LOOP;

    -- Secuencias independientes que no viajaron con una tabla.
    FOR o IN
        SELECT n.nspname, c.relname
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND pg_get_userbyid(c.relowner)='ecd_app'
           AND c.relkind='S'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO ecd_migrator',
                       o.nspname, o.relname);
    END LOOP;

    -- Funciones, procedimientos y agregados escritos por la aplicacion.
    FOR o IN
        SELECT p.oid, p.prokind
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','ai_brain')
           AND pg_get_userbyid(p.proowner)='ecd_app'
    LOOP
        EXECUTE format('ALTER %s %s OWNER TO ecd_migrator',
                       CASE o.prokind
                         WHEN 'p' THEN 'PROCEDURE'
                         WHEN 'a' THEN 'AGGREGATE'
                         ELSE 'FUNCTION'
                       END,
                       (o.oid)::regprocedure);
    END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public, ai_brain FROM PUBLIC;
REVOKE CREATE ON SCHEMA public, ai_brain FROM ecd_app;

-- La transaccion no puede quedar verde si sobrevive un objeto de aplicacion.
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
      FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
     WHERE s.nspname IN ('public','ai_brain')
       AND pg_get_userbyid(c.relowner)='ecd_app'
       AND c.relkind IN ('r','p','v','m','f','S');
    IF n <> 0 THEN
        RAISE EXCEPTION 'Quedan % objetos poseidos por ecd_app', n;
    END IF;
    SELECT count(*) INTO n
      FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
     WHERE s.nspname IN ('public','ai_brain')
       AND pg_get_userbyid(p.proowner)='ecd_app';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Quedan % rutinas poseidas por ecd_app', n;
    END IF;
    IF has_schema_privilege('ecd_app','public','CREATE') OR
       has_schema_privilege('ecd_app','ai_brain','CREATE') THEN
        RAISE EXCEPTION 'ecd_app todavia conserva CREATE sobre un schema del ECD';
    END IF;
END $$;

COMMIT;
