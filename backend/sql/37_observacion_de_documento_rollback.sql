-- Rollback de la 37. NO es el camino normal: el rollback de un despliegue es revertir el código
-- (el backend anterior no crea observaciones). Solo si hay que quitar el tipo de verdad.
-- FALLA a propósito si ya existe alguna OBSERVACION: no se borran actos de obra para deshacer DDL.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS idx_issues_origen;
ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS ck_issues_tipo;
ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_tipo
    CHECK (tipo IN ('PUNCH','NO_CONFORMIDAD','CALIDAD','SEGURIDAD'));
COMMIT;
