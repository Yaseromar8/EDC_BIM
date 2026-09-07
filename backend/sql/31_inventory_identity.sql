-- 31: canonical Inventory identity. Manual migration as ecd_migrator before code.
-- Additive; public legacy data is neither read nor rewritten. No human backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'B1_ROLE_GUARD: DDL requires ecd_migrator';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        RAISE EXCEPTION 'B1_ROLE_GUARD: runner must provision ecd_app separately';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname = 'inventory_identity_b1' AND r.rolname <> current_user
    ) THEN
        RAISE EXCEPTION 'B1_OWNER_GUARD: unexpected owner of candidate namespace';
    END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS inventory_identity_b1 AUTHORIZATION ecd_migrator;
REVOKE ALL ON SCHEMA inventory_identity_b1 FROM PUBLIC;
REVOKE CREATE ON SCHEMA inventory_identity_b1 FROM ecd_app;
GRANT USAGE ON SCHEMA inventory_identity_b1 TO ecd_app;

CREATE TABLE IF NOT EXISTS inventory_identity_b1.sources (
    scope_id TEXT NOT NULL CHECK (length(scope_id) > 0),
    source_lineage TEXT NOT NULL
        CHECK (source_lineage ~ '^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+$'),
    active_urn TEXT,
    generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_id, source_lineage)
);

CREATE TABLE IF NOT EXISTS inventory_identity_b1.elements (
    scope_id TEXT NOT NULL,
    source_lineage TEXT NOT NULL,
    external_id TEXT NOT NULL CHECK (length(external_id) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_id, source_lineage, external_id),
    FOREIGN KEY (scope_id, source_lineage)
        REFERENCES inventory_identity_b1.sources (scope_id, source_lineage)
);

CREATE TABLE IF NOT EXISTS inventory_identity_b1.snapshots (
    scope_id TEXT NOT NULL,
    source_lineage TEXT NOT NULL,
    source_urn TEXT NOT NULL CHECK (length(source_urn) > 0),
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    is_complete BOOLEAN NOT NULL DEFAULT true CHECK (is_complete),
    read_visible BOOLEAN NOT NULL DEFAULT true,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_id, source_lineage, source_urn),
    FOREIGN KEY (scope_id, source_lineage)
        REFERENCES inventory_identity_b1.sources (scope_id, source_lineage)
);

-- Circular pointer is added after snapshots. NULL denotes no published version.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'inventory_identity_b1.sources'::regclass
          AND conname = 'sources_active_snapshot_fk'
    ) THEN
        ALTER TABLE inventory_identity_b1.sources
            ADD CONSTRAINT sources_active_snapshot_fk
            FOREIGN KEY (scope_id, source_lineage, active_urn)
            REFERENCES inventory_identity_b1.snapshots (scope_id, source_lineage, source_urn)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_identity_b1.occurrences (
    scope_id TEXT NOT NULL,
    source_lineage TEXT NOT NULL,
    source_urn TEXT NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(properties) = 'object'),
    material TEXT,
    installation_status TEXT,
    vaciado_nro TEXT,
    classification TEXT,
    -- Preserve known native metadata without replacing the authorization scope.
    project_id TEXT,
    last_updated TEXT,
    native_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(native_metadata) = 'object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_id, source_lineage, source_urn, external_id),
    FOREIGN KEY (scope_id, source_lineage, source_urn)
        REFERENCES inventory_identity_b1.snapshots (scope_id, source_lineage, source_urn),
    FOREIGN KEY (scope_id, source_lineage, external_id)
        REFERENCES inventory_identity_b1.elements (scope_id, source_lineage, external_id)
);

CREATE TABLE IF NOT EXISTS inventory_identity_b1.user_data (
    scope_id TEXT NOT NULL,
    source_lineage TEXT NOT NULL,
    external_id TEXT NOT NULL,
    material TEXT,
    status TEXT,
    vaciado_nro TEXT,
    classification TEXT,
    extras JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extras) = 'object'),
    original_payload JSONB,
    -- Promotion provenance. Same vocabulary as legacy_user_quarantine, so a
    -- promoted row and a quarantined one are read the same way. NULL on rows
    -- created by ordinary qualified edits: those are not promotions.
    promotion_coverage_complete BOOLEAN,
    promotion_candidates JSONB
        CHECK (promotion_candidates IS NULL OR jsonb_typeof(promotion_candidates) = 'array'),
    promoted_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Half-recorded provenance would be worse than none: it would look auditable.
    CONSTRAINT user_data_promotion_provenance_complete CHECK (
        num_nonnulls(promotion_coverage_complete, promotion_candidates, promoted_by) IN (0, 3)),
    PRIMARY KEY (scope_id, source_lineage, external_id),
    FOREIGN KEY (scope_id, source_lineage, external_id)
        REFERENCES inventory_identity_b1.elements (scope_id, source_lineage, external_id)
);

CREATE TABLE IF NOT EXISTS inventory_identity_b1.legacy_user_quarantine (
    id BIGSERIAL PRIMARY KEY,
    external_id TEXT,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    reason TEXT NOT NULL,
    candidates JSONB NOT NULL CHECK (jsonb_typeof(candidates) = 'array'),
    coverage_complete BOOLEAN NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS b1_elements_external_scope_idx
    ON inventory_identity_b1.elements (external_id, scope_id);
CREATE INDEX IF NOT EXISTS b1_snapshots_scope_urn_idx
    ON inventory_identity_b1.snapshots (scope_id, source_urn);
CREATE INDEX IF NOT EXISTS b1_occurrences_logical_idx
    ON inventory_identity_b1.occurrences (scope_id, source_lineage, external_id);
CREATE INDEX IF NOT EXISTS b1_quarantine_external_idx
    ON inventory_identity_b1.legacy_user_quarantine (external_id);

REVOKE ALL ON ALL TABLES IN SCHEMA inventory_identity_b1 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inventory_identity_b1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA inventory_identity_b1 FROM ecd_app;
GRANT SELECT, INSERT, UPDATE ON
    inventory_identity_b1.sources,
    inventory_identity_b1.elements,
    inventory_identity_b1.snapshots TO ecd_app;
-- user_data is column-scoped for the runtime: it edits the human fields and
-- cannot write, forge or erase promotion provenance or the original payload.
-- Only the migrator promotes, so only the migrator records why it was safe.
GRANT SELECT ON inventory_identity_b1.user_data TO ecd_app;
GRANT INSERT (scope_id, source_lineage, external_id, material, status,
              vaciado_nro, classification, extras, updated_at)
    ON inventory_identity_b1.user_data TO ecd_app;
GRANT UPDATE (material, status, vaciado_nro, classification, extras, updated_at)
    ON inventory_identity_b1.user_data TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON inventory_identity_b1.occurrences TO ecd_app;
REVOKE ALL ON inventory_identity_b1.legacy_user_quarantine FROM ecd_app;
REVOKE ALL ON SEQUENCE inventory_identity_b1.legacy_user_quarantine_id_seq FROM ecd_app;

-- Converge an earlier isolated candidate without rewriting native/user rows.
ALTER TABLE inventory_identity_b1.sources ADD COLUMN IF NOT EXISTS generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE inventory_identity_b1.snapshots ADD COLUMN IF NOT EXISTS read_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE inventory_identity_b1.user_data ADD COLUMN IF NOT EXISTS promotion_coverage_complete BOOLEAN;
ALTER TABLE inventory_identity_b1.user_data ADD COLUMN IF NOT EXISTS promotion_candidates JSONB;
ALTER TABLE inventory_identity_b1.user_data ADD COLUMN IF NOT EXISTS promoted_by TEXT;

CREATE OR REPLACE FUNCTION inventory_identity_b1.compose_properties(native JSONB, extras JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER AS $$
DECLARE live JSONB;
BEGIN
    IF extras = '{}'::jsonb THEN RETURN native; END IF;
    live := COALESCE(native->'Live Edit','{}'::jsonb);
    IF jsonb_typeof(live) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_LIVE_EDIT_GROUP: cannot overwrite native properties';
    END IF;
    RETURN jsonb_set(native, ARRAY['Live Edit'], live || extras, true);
END $$;
REVOKE ALL ON FUNCTION inventory_identity_b1.compose_properties(JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory_identity_b1.compose_properties(JSONB,JSONB) TO ecd_app;

-- Compatibility projection only, not a copied/second authority.
CREATE OR REPLACE VIEW inventory_identity_b1.inventory_assets AS
SELECT '[' || to_jsonb(o.scope_id)::text || ',' || to_jsonb(o.source_lineage)::text || ',' || to_jsonb(o.external_id)::text || ']' AS id,
       o.external_id,o.name,COALESCE(u.material,o.material) AS material,
       COALESCE(u.status,o.installation_status) AS installation_status,
       o.last_updated,inventory_identity_b1.compose_properties(o.properties,COALESCE(u.extras,'{}'::jsonb)) AS properties,
       o.scope_id AS model_urn,o.source_urn,
       COALESCE(u.vaciado_nro,o.vaciado_nro) AS vaciado_nro,o.project_id,
       NULLIF(o.native_metadata->>'physical_station_range','')::numrange AS physical_station_range,
       COALESCE(u.classification,o.classification) AS classification,
       o.scope_id,o.source_lineage,
       '[' || to_jsonb(o.scope_id)::text || ',' || to_jsonb(o.source_lineage)::text || ',' || to_jsonb(o.external_id)::text || ']' AS element_key
FROM inventory_identity_b1.occurrences o
JOIN inventory_identity_b1.sources s USING(scope_id,source_lineage)
JOIN inventory_identity_b1.snapshots x USING(scope_id,source_lineage,source_urn)
LEFT JOIN inventory_identity_b1.user_data u USING(scope_id,source_lineage,external_id)
WHERE (o.scope_id <> '__cmp__' AND o.source_urn=s.active_urn)
   OR (o.scope_id='__cmp__' AND x.read_visible);
REVOKE ALL ON inventory_identity_b1.inventory_assets FROM PUBLIC,ecd_app;
GRANT SELECT ON inventory_identity_b1.inventory_assets TO ecd_app;
COMMENT ON VIEW inventory_identity_b1.inventory_assets IS
'Projection of canonical active Sources and visible temporary comparison snapshots.';
DO $$
BEGIN
    IF to_regclass('public.inventory_assets') IS NOT NULL THEN
        REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.inventory_assets FROM ecd_app;
    END IF;
    IF to_regclass('public.asset_user_data') IS NOT NULL THEN
        REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.asset_user_data FROM ecd_app;
    END IF;
END $$;
COMMIT;
