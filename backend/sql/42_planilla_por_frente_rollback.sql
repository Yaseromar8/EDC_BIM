-- Rollback de la 42. NO es el camino normal: el rollback de un despliegue es revertir el código
-- (el backend anterior no mira la columna `frente` y sigue funcionando con ella puesta).
-- Este rollback solo procede si NINGUNA fila es de un frente: volver a «una vigente por obra» con
-- itemizados de frente guardados mezclaría los de los frentes en uno solo. Si hay filas de frente,
-- se detiene y lo dice; decidir antes qué hacer con ellas.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_POR_FRENTE_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
    IF EXISTS (SELECT 1 FROM planilla_itemizados WHERE frente <> '')
       OR EXISTS (SELECT 1 FROM planilla_criterios_medida WHERE frente <> '') THEN
        RAISE EXCEPTION 'PLANILLA_POR_FRENTE_CON_DATOS: hay itemizados o criterios guardados por frente; no se vuelve a «uno por obra» sin decidir qué hacer con ellos';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente
    ON planilla_itemizados (project_id) WHERE vigente;
DROP INDEX IF EXISTS uq_planilla_itemizado_vigente_frente;
CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_criterios_medida_vigente
    ON planilla_criterios_medida (project_id) WHERE vigente;
DROP INDEX IF EXISTS uq_planilla_criterios_medida_vigente_frente;

ALTER TABLE planilla_itemizados DROP COLUMN IF EXISTS frente;
ALTER TABLE planilla_criterios_medida DROP COLUMN IF EXISTS frente;
COMMIT;
