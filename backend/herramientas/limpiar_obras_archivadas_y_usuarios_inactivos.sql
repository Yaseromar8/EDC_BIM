-- LIMPIAR LAS OBRAS ARCHIVADAS Y LOS USUARIOS DESACTIVADOS (5-nov-2026). El dueño: «quiero borrar las obras archivadas,
-- todas, y también los usuarios que no están activos; limpiemos Docs de lo que usamos para probar».
--
-- NO ES UNA MIGRACIÓN: no cambia el esquema, borra datos. Una vez, a mano, como ecd_migrator, cuando el dueño lo
-- decide. No hay vuelta atrás salvo la copia de seguridad.
--
-- QUÉ BORRA
--   1. Cada obra con status = 'archived': sus filas en TODAS las tablas que la nombran (model_urn, project_id,
--      scope_urn, project, obra), y al final la obra. Por pasadas: una tabla que aún no se puede vaciar (otra depende
--      de ella) se reintenta en la pasada siguiente, cada intento en su propio punto de guardado.
--   2. Cada usuario desactivado que no sea admin. Si dejó huella que la base protege (incidencias, submittals,
--      protocolos, cuaderno de otra obra viva), NO se borra y se dice: esa historia no se rompe.
--
-- QUÉ NO TOCA
--   · activity_log y auth_events: son el registro encadenado (auditoria_encadenada.py). Borrar una fila del medio
--     rompería la verificación de todo lo posterior. La historia de lo que pasó se conserva.
--   · Ninguna obra activa ni ningún usuario activo o admin.
--   · Los ficheros del almacenamiento: al final se listan sus `gcs_urn` para borrarlos en la consola de Cloud Storage.
--
-- Al final se ve: qué se borró de cada tabla, qué no se pudo y por qué, y los ficheros a quitar del almacenamiento.
BEGIN;

CREATE TEMP TABLE zz_obras ON COMMIT DROP AS
    SELECT id::text AS id, model_urn::text AS model_urn, name FROM projects WHERE status = 'archived';
CREATE TEMP TABLE zz_claves ON COMMIT DROP AS
    SELECT id AS clave FROM zz_obras UNION SELECT model_urn FROM zz_obras WHERE model_urn IS NOT NULL;
CREATE TEMP TABLE zz_ficheros ON COMMIT DROP AS
    SELECT f.gcs_urn FROM file_nodes f WHERE f.model_urn IN (SELECT clave FROM zz_claves) AND f.gcs_urn IS NOT NULL
    UNION
    SELECT v.gcs_urn FROM file_versions v JOIN file_nodes f ON f.id = v.file_node_id
     WHERE f.model_urn IN (SELECT clave FROM zz_claves) AND v.gcs_urn IS NOT NULL;
CREATE TEMP TABLE zz_informe (paso TEXT, tabla TEXT, filas BIGINT, nota TEXT) ON COMMIT DROP;

DO $$
DECLARE
    t RECORD;
    n BIGINT;
    pasada INT;
    pendientes INT;
    claves TEXT[] := ARRAY(SELECT clave FROM zz_claves);
BEGIN
    IF array_length(claves, 1) IS NULL THEN
        INSERT INTO zz_informe VALUES ('obras', '-', 0, 'no hay obras archivadas');
    ELSE
        FOR pasada IN 1..8 LOOP
            pendientes := 0;
            FOR t IN
                SELECT c.table_schema AS esquema, c.table_name AS tabla, c.column_name AS columna
                  FROM information_schema.columns c
                  JOIN information_schema.tables tb
                    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
                 WHERE c.column_name IN ('model_urn', 'project_id', 'scope_urn', 'project', 'obra')
                   AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
                   AND c.table_name NOT IN ('activity_log', 'auth_events', 'projects')
                   AND c.table_name NOT LIKE 'zz\_%'
                 ORDER BY c.table_schema, c.table_name, c.column_name
            LOOP
                BEGIN
                    EXECUTE format('DELETE FROM %I.%I WHERE %I::text = ANY($1)', t.esquema, t.tabla, t.columna)
                      USING claves;
                    GET DIAGNOSTICS n = ROW_COUNT;
                    IF n > 0 THEN
                        INSERT INTO zz_informe VALUES ('obras', t.esquema || '.' || t.tabla || '.' || t.columna, n,
                                                       'pasada ' || pasada);
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    pendientes := pendientes + 1;
                    IF pasada = 8 THEN
                        INSERT INTO zz_informe VALUES ('obras', t.esquema || '.' || t.tabla || '.' || t.columna, NULL,
                                                       'NO SE PUDO: ' || SQLERRM);
                    END IF;
                END;
            END LOOP;
            EXIT WHEN pendientes = 0;
        END LOOP;
        BEGIN
            DELETE FROM projects WHERE id::text IN (SELECT id FROM zz_obras);
            GET DIAGNOSTICS n = ROW_COUNT;
            INSERT INTO zz_informe VALUES ('obras', 'projects', n, 'las obras');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO zz_informe VALUES ('obras', 'projects', NULL, 'NO SE PUDO: ' || SQLERRM);
        END;
    END IF;

    -- 2 · Usuarios desactivados, no admin, uno a uno.
    FOR t IN SELECT id, email FROM users WHERE NOT COALESCE(is_active, TRUE) AND COALESCE(role, '') <> 'admin' ORDER BY id LOOP
        BEGIN
            DELETE FROM users WHERE id = t.id;
            INSERT INTO zz_informe VALUES ('usuarios', t.email, 1, 'borrado');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO zz_informe VALUES ('usuarios', t.email, 0, 'SE QUEDA (tiene huella): ' || SQLERRM);
        END;
    END LOOP;
END $$;

-- Un solo resultado (Studio enseña el último): el informe y, debajo, los ficheros a quitar del almacenamiento.
INSERT INTO zz_informe SELECT 'z ficheros', gcs_urn, NULL, 'quitar del almacenamiento' FROM zz_ficheros;
SELECT paso, tabla, filas, nota FROM zz_informe ORDER BY paso, (filas IS NULL) DESC, tabla;

COMMIT;
