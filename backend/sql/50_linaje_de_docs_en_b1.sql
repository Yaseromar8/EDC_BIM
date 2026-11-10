-- 50 · El inventario B1 acepta el linaje de ALEPHIA Docs (10-nov-2026, docs/archivos/29, F4).
--
-- El dueño autorizó abrir la identidad del inventario SOLO para que acepte el linaje de un documento de Docs,
-- `urn:alephia:docs.lineage:<uuid>`, además del de Autodesk («SI A LOS PUNTOS 1. 2 Y 3»). El código ya lo acepta
-- (inventory_identity.py); la base no: la migración 31 puso en `inventory_identity_b1.sources` un CHECK que solo deja
-- pasar `urn:adsk.<hub>:dm.lineage:<id>`. Sin esta migración, extraer el inventario de un modelo de Docs falla al
-- escribir y no se puede quitar uno del frente (medido en la base desechable el 10-nov-2026).
--
-- Solo cambia ese CHECK: los demás de B1 llegan a `sources` por clave ajena. La expresión nueva es la de
-- `vistas_v2.RE_LINAJE`: ACC igual que antes, y Docs en una sola forma (uuid en minúsculas).
--
-- Aplicar a mano como ecd_migrator ANTES de desplegar el backend que vincula modelos de Docs. Aditiva: el conjunto de
-- valores admitidos crece y toda fila de hoy lo sigue cumpliendo. El CHECK nuevo entra NOT VALID y se valida después,
-- para no tener la tabla bloqueada mientras se revisan sus filas. Rollback: 50_linaje_de_docs_en_b1_rollback.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
    viejo record;
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'B1_ROLE_GUARD: DDL requires ecd_migrator';
    END IF;
    -- El CHECK de la 31 se busca por lo que dice, no por su nombre: el nombre lo puso PostgreSQL.
    FOR viejo IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'inventory_identity_b1.sources'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%source_lineage%'
          AND pg_get_constraintdef(oid) LIKE '%dm%lineage%'
          AND pg_get_constraintdef(oid) NOT LIKE '%alephia%'
    LOOP
        EXECUTE format('ALTER TABLE inventory_identity_b1.sources DROP CONSTRAINT %I', viejo.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'inventory_identity_b1.sources'::regclass
                     AND conname = 'sources_source_lineage_check') THEN
        ALTER TABLE inventory_identity_b1.sources ADD CONSTRAINT sources_source_lineage_check
            CHECK (source_lineage ~ '^(urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+|urn:alephia:docs\.lineage:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
            NOT VALID;
    END IF;
END $$;

ALTER TABLE inventory_identity_b1.sources VALIDATE CONSTRAINT sources_source_lineage_check;

COMMIT;

-- Comprobación (debe dar una fila, con «alephia» en la definición y convalidated = true):
-- SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'inventory_identity_b1.sources'::regclass AND contype = 'c';
