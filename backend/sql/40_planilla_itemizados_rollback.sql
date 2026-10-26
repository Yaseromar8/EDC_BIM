-- Rollback de la 40. NO es el camino normal: el rollback de un despliegue es revertir el código.
-- El backend sin esta tabla sigue arrancando; solo /api/planilla/itemizado responde 503.
-- OJO: al quitarla se pierden los itemizados guardados de todas las obras y su historial.
-- Antes, si hacen falta, sácalos:  \copy (SELECT * FROM planilla_itemizados) TO 'planilla_itemizados.csv' CSV HEADER
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_ITEMIZADOS_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

DROP INDEX IF EXISTS uq_planilla_itemizado_vigente;
DROP TABLE IF EXISTS planilla_itemizados;
COMMIT;
