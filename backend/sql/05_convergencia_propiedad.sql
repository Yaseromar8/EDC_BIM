-- CONVERGENCIA UNICA DE LA PROPIEDAD DEL ESQUEMA
-- ==============================================
-- Se ejecuta una sola vez con la identidad administrativa de Cloud SQL,
-- DESPUES de 00_roles.sql y ANTES del primer bootstrap como ecd_migrator.
-- No cambia ni borra una fila de datos.
--
-- QUE ARREGLA ESTA VERSION (21-ago-2026)
-- --------------------------------------
-- La anterior transferia solo los objetos cuyo dueño era `ecd_app`. En una
-- instancia que NUNCA ha tenido identidades separadas -- que es el caso real de
-- produccion -- no hay ni un objeto de `ecd_app`: los tiene `postgres`. Los tres
-- bucles recorrian CERO filas.
--
-- Y la postcondicion medía LO MISMO que el bucle («¿quedan objetos de
-- ecd_app?»), asi que daba 0, la transaccion CONFIRMABA y el guion se declaraba
-- correcto habiendo dejado 95 tablas donde estaban. Reproducido en un cluster
-- desechable con el estado de partida de produccion:
--
--     OWNER INICIAL  95 tablas · 36 secuencias · 185 indices · 38 funciones : postgres
--     OWNER FINAL    lo mismo. Solo se movieron los dos schemas.
--
-- POR QUE NO BASTA CON «TODO LO QUE NO SEA DE ecd_migrator»
-- ---------------------------------------------------------
-- Porque `public` NO contiene solo cosas nuestras. Medido en el fixture: de las
-- 38 funciones del schema, **37 pertenecen a la extension `pgcrypto`** y solo
-- UNA es de la aplicacion (`resolve_folder_path`). Apropiarse de las 37 seria
-- romper el modelo de extensiones: `pg_dump` no emite esos cambios de dueño y un
-- `DROP/CREATE EXTENSION` los deshace, asi que la propiedad divergiria en
-- silencio entre la base y su copia.
--
-- La pertenencia a una extension se lee de `pg_depend` con `deptype='e'`, que es
-- lo que el propio PostgreSQL usa para que `DROP EXTENSION` se lleve el objeto.
-- NUNCA se infiere de nombres ni de prefijos.
--
-- LO QUE POSTGRESQL NO PERMITE, Y POR ESO NO SE INTENTA
-- -----------------------------------------------------
--   ALTER EXTENSION ... OWNER TO   -> no existe. Error de sintaxis. Las
--                                     extensiones conservan su dueño, y punto.
--   ALTER TYPE <tipo fila>         -> «is a table's row type». Los 95 tipos
--                                     compuestos y los 95 arrays son DERIVADOS:
--                                     siguen a su tabla solos.
--   indices                        -> siguen al dueño de su tabla. Comprobado:
--                                     ALTER TABLE arrastra el indice.
--
-- FAIL-CLOSED
-- -----------
-- Si aparece un objeto que este guion no sabe clasificar, la transaccion SE
-- DETIENE en vez de apropiarselo. Repartir propiedad adivinando es la peor
-- clase de inferencia, y esta es la unica operacion irreversible del despliegue.

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


-- ── 1 · PARADA ANTE LO DESCONOCIDO ────────────────────────────────────────
-- Antes de mover nada: ¿hay en estos schemas alguna clase de objeto que este
-- guion no sepa transferir y que no pertenezca a una extension? Si la hay, se
-- para y se dice cual. No se deja atras en silencio ni se toca a ciegas.
DO $$
DECLARE desconocidos text;
BEGIN
    SELECT string_agg(x.descripcion, ', ' ORDER BY x.descripcion) INTO desconocidos
    FROM (
        -- Relaciones de una clase que no tratamos. Se excluyen las derivadas:
        -- 'i'/'I' indices (siguen a su tabla), 't' TOAST, 'c' tipo compuesto.
        SELECT 'relacion '||n.nspname||'.'||c.relname||' (relkind='||c.relkind::text||')' AS descripcion
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                               AND d.objid=c.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND c.relkind NOT IN ('r','p','v','m','f','S','i','I','t','c')

        UNION ALL
        -- Tipos PROPIOS (enum, dominio, rango, compuesto suelto). Los derivados
        -- de una tabla o de un array no se cuentan: no son ownables aparte.
        SELECT 'tipo '||n.nspname||'.'||t.typname||' (typtype='||t.typtype::text||')'
          FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_type'::regclass
                               AND d.objid=t.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND (t.typtype IN ('e','d','r') OR (t.typtype='c' AND t.typrelid=0))

        UNION ALL
        SELECT 'operador '||n.nspname||'.'||o.oprname
          FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_operator'::regclass
                               AND d.objid=o.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'collation '||n.nspname||'.'||cl.collname
          FROM pg_collation cl JOIN pg_namespace n ON n.oid=cl.collnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_collation'::regclass
                               AND d.objid=cl.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'conversion '||n.nspname||'.'||cv.conname
          FROM pg_conversion cv JOIN pg_namespace n ON n.oid=cv.connamespace
          LEFT JOIN pg_depend d ON d.classid='pg_conversion'::regclass
                               AND d.objid=cv.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'estadistica '||n.nspname||'.'||s.stxname
          FROM pg_statistic_ext s JOIN pg_namespace n ON n.oid=s.stxnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_statistic_ext'::regclass
                               AND d.objid=s.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'diccionario de texto '||n.nspname||'.'||td.dictname
          FROM pg_ts_dict td JOIN pg_namespace n ON n.oid=td.dictnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_ts_dict'::regclass
                               AND d.objid=td.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'configuracion de texto '||n.nspname||'.'||tc.cfgname
          FROM pg_ts_config tc JOIN pg_namespace n ON n.oid=tc.cfgnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_ts_config'::regclass
                               AND d.objid=tc.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'clase de operadores '||n.nspname||'.'||oc.opcname
          FROM pg_opclass oc JOIN pg_namespace n ON n.oid=oc.opcnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_opclass'::regclass
                               AND d.objid=oc.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL

        UNION ALL
        SELECT 'familia de operadores '||n.nspname||'.'||fam.opfname
          FROM pg_opfamily fam JOIN pg_namespace n ON n.oid=fam.opfnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_opfamily'::regclass
                               AND d.objid=fam.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain') AND d.refobjid IS NULL
    ) x;

    IF desconocidos IS NOT NULL THEN
        RAISE EXCEPTION
            'CONVERGENCIA DETENIDA: hay objetos que este guion no sabe '
            'clasificar y NO se los va a apropiar. Decide sobre ellos primero: %',
            desconocidos;
    END IF;
END $$;


-- ── 2 · SCHEMAS ───────────────────────────────────────────────────────────
-- `public` y `ai_brain` hospedan la aplicacion, y `ecd_migrator` necesita
-- poseerlos para poder crear en ellos. Condicionado para que reejecutar el
-- guion no emita DDL innecesario.
DO $$
DECLARE s record;
BEGIN
    FOR s IN
        SELECT nspname FROM pg_namespace
         WHERE nspname IN ('public','ai_brain')
           AND pg_get_userbyid(nspowner) IS DISTINCT FROM 'ecd_migrator'
    LOOP
        EXECUTE format('ALTER SCHEMA %I OWNER TO ecd_migrator', s.nspname);
    END LOOP;
END $$;


-- ── 3 · OBJETOS APLICATIVOS ───────────────────────────────────────────────
-- «Aplicativo» = esta en nuestros schemas, NO pertenece a una extension, y su
-- dueño todavia no es `ecd_migrator`. Cubre `postgres`, `ecd_app` y cualquier
-- dueño heredado de una instancia vieja.
DO $$
DECLARE o record;
BEGIN
    -- Tablas, vistas, materializadas y foraneas. Sus indices y sus tipos
    -- derivados viajan solos con la propiedad.
    FOR o IN
        SELECT n.nspname, c.relname, c.relkind
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                               AND d.objid=c.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND c.relkind IN ('r','p','v','m','f')
           AND pg_get_userbyid(c.relowner) IS DISTINCT FROM 'ecd_migrator'
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
          LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                               AND d.objid=c.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND c.relkind='S'
           AND pg_get_userbyid(c.relowner) IS DISTINCT FROM 'ecd_migrator'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO ecd_migrator',
                       o.nspname, o.relname);
    END LOOP;

    -- Funciones, procedimientos y agregados NUESTROS. Las 37 de `pgcrypto`
    -- quedan intactas: `d.refobjid IS NULL` las excluye.
    FOR o IN
        SELECT p.oid, p.prokind
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          LEFT JOIN pg_depend d ON d.classid='pg_proc'::regclass
                               AND d.objid=p.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ecd_migrator'
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


-- ── 4 · POSTCONDICION ─────────────────────────────────────────────────────
-- Mide LO QUE SE PERSIGUE --cero objetos APLICATIVOS fuera de ecd_migrator--,
-- no lo mismo que miraba el bucle. Esa era la trampa de la version anterior:
-- preguntar por `ecd_app` y dar 0 porque nunca hubo ninguno.
DO $$
DECLARE fuera text;
BEGIN
    SELECT string_agg(x.d, ', ' ORDER BY x.d) INTO fuera
    FROM (
        SELECT 'schema '||nspname||' -> '||pg_get_userbyid(nspowner) AS d
          FROM pg_namespace WHERE nspname IN ('public','ai_brain')
           AND pg_get_userbyid(nspowner) IS DISTINCT FROM 'ecd_migrator'
        UNION ALL
        SELECT 'relacion '||n.nspname||'.'||c.relname||' -> '||pg_get_userbyid(c.relowner)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass
                               AND d.objid=c.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND c.relkind IN ('r','p','v','m','f','S','i','I')
           AND pg_get_userbyid(c.relowner) IS DISTINCT FROM 'ecd_migrator'
        UNION ALL
        SELECT 'rutina '||n.nspname||'.'||p.proname||' -> '||pg_get_userbyid(p.proowner)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          LEFT JOIN pg_depend d ON d.classid='pg_proc'::regclass
                               AND d.objid=p.oid AND d.deptype='e'
         WHERE n.nspname IN ('public','ai_brain')
           AND d.refobjid IS NULL
           AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ecd_migrator'
    ) x;

    IF fuera IS NOT NULL THEN
        RAISE EXCEPTION 'Quedan objetos aplicativos fuera de ecd_migrator: %', fuera;
    END IF;

    IF has_schema_privilege('ecd_app','public','CREATE') OR
       has_schema_privilege('ecd_app','ai_brain','CREATE') THEN
        RAISE EXCEPTION 'ecd_app todavia conserva CREATE sobre un schema del ECD';
    END IF;
END $$;

COMMIT;
