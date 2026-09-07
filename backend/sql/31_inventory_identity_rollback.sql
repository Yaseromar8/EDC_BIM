-- 31 rollback only for an EMPTY canonical namespace. Normal rollback is code.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
    candidate_table TEXT;
    has_rows BOOLEAN;
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'B1_ROLE_GUARD: rollback requires ecd_migrator';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname = 'inventory_identity_b1' AND r.rolname <> current_user
    ) THEN
        RAISE EXCEPTION 'B1_OWNER_GUARD: unexpected owner of candidate namespace';
    END IF;
    -- Lock BEFORE testing emptiness, in one caller transaction. Otherwise an
    -- app INSERT between the test and DROP could silently lose candidate data.
    FOR candidate_table IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'inventory_identity_b1'
        ORDER BY tablename
    LOOP
        EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',
                       'inventory_identity_b1', candidate_table);
    END LOOP;
    FOR candidate_table IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'inventory_identity_b1'
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)',
                       'inventory_identity_b1', candidate_table) INTO has_rows;
        IF has_rows THEN
            RAISE EXCEPTION 'B1_DATA_PRESENT: rollback refused; preserve/archive %.% first',
                'inventory_identity_b1', candidate_table;
        END IF;
    END LOOP;
END $$;

DROP VIEW IF EXISTS inventory_identity_b1.inventory_assets;
DROP FUNCTION IF EXISTS inventory_identity_b1.compose_properties(JSONB,JSONB);
ALTER TABLE IF EXISTS inventory_identity_b1.sources
    DROP CONSTRAINT IF EXISTS sources_active_snapshot_fk;
DROP TABLE IF EXISTS inventory_identity_b1.legacy_user_quarantine;
DROP TABLE IF EXISTS inventory_identity_b1.user_data;
DROP TABLE IF EXISTS inventory_identity_b1.occurrences;
DROP TABLE IF EXISTS inventory_identity_b1.snapshots;
DROP TABLE IF EXISTS inventory_identity_b1.elements;
DROP TABLE IF EXISTS inventory_identity_b1.sources;
-- Deliberately no CASCADE: unexpected objects cause a fail-closed rollback.
DROP SCHEMA IF EXISTS inventory_identity_b1;

COMMIT;
