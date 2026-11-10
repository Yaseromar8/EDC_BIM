-- 50 · ROLLBACK. Vuelve al CHECK de la migración 31 (solo el linaje de Autodesk).
--
-- El rollback NORMAL de un despliegue es revertir el código, no esto (AGENTS.md §4.3). Y esto solo se puede si no hay
-- todavía ninguna fila de un modelo de Docs en B1: si las hay, se para y lo dice, en vez de borrar inventario de obra.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'B1_ROLE_GUARD: DDL requires ecd_migrator';
    END IF;
    IF EXISTS (SELECT 1 FROM inventory_identity_b1.sources WHERE source_lineage LIKE 'urn:alephia:%') THEN
        RAISE EXCEPTION 'B1_ROLLBACK_50: hay inventario de modelos de ALEPHIA Docs en B1; revertir el código basta';
    END IF;
END $$;

ALTER TABLE inventory_identity_b1.sources DROP CONSTRAINT IF EXISTS sources_source_lineage_check;
ALTER TABLE inventory_identity_b1.sources ADD CONSTRAINT sources_source_lineage_check
    CHECK (source_lineage ~ '^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+$');

COMMIT;
