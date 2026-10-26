-- Rollback de la 41. NO es el camino normal: el rollback de un despliegue es revertir el código.
-- El backend sin esta tabla sigue arrancando; solo /api/planilla/criterios-medida responde 503 (y el
-- visor usa los criterios solo en el navegador).
-- OJO: al quitarla se pierden los criterios de medida guardados de todas las obras y su historial.
-- Antes, si hacen falta, sácalos:  \copy (SELECT * FROM planilla_criterios_medida) TO 'planilla_criterios_medida.csv' CSV HEADER
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_CRITERIOS_MEDIDA_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

DROP INDEX IF EXISTS uq_planilla_criterios_medida_vigente;
DROP TABLE IF EXISTS planilla_criterios_medida;
COMMIT;
