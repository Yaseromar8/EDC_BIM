-- ============================================================================
-- LOTE DEL MIGRADOR · PRODUCTION STABILIZATION (PREPARADO, NO EJECUTADO)
-- ============================================================================
-- Se ejecuta como `ecd_migrator` (SET ROLE desde la conexión administrativa,
-- igual que la convergencia). NO lo ejecuta la aplicación: `ecd_app` no puede
-- DDL y ese es el diseño.
--
-- Origen: el arranque del 22-ago dejó dicho, con el congelador funcionando:
--   [DB] project_id NOT NULL no aplicado: must be owner of table doc_redlines
--
-- Verificado antes de preparar esto (22-ago, producción):
--   SELECT count(*) FILTER (WHERE project_id IS NULL) FROM doc_redlines;  -- 0
--
-- Idempotente: si la restricción ya está, no hace nada.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- La regla del Red Line que faltaba: toda observación pertenece a una obra.
-- Con 0 nulos medidos, el SET NOT NULL es un cambio de contrato, no de datos.
ALTER TABLE doc_redlines ALTER COLUMN project_id SET NOT NULL;

-- Postcondición: la columna quedó NOT NULL.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'doc_redlines'
                  AND column_name = 'project_id' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'doc_redlines.project_id sigue admitiendo NULL';
    END IF;
END $$;

COMMIT;
