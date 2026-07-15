"""4D LOB empresarial: datasets versionados, fuentes y vinculos BIM.

Revision ID: 0003_lob4d_enterprise
Revises: 0002_compare_indexes
Create Date: 2026-07-10
"""
from alembic import op


revision = '0003_lob4d_enterprise'
down_revision = '0002_compare_indexes'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_config (
            model_urn TEXT PRIMARY KEY,
            fecha_inicio DATE,
            dias_por_periodo INTEGER NOT NULL DEFAULT 30 CHECK (dias_por_periodo > 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_datasets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            front_id TEXT,
            scope_urn TEXT NOT NULL,
            version INTEGER NOT NULL CHECK (version > 0),
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'validated', 'active', 'superseded', 'failed')),
            data_date DATE,
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            source_fingerprint TEXT,
            stats JSONB NOT NULL DEFAULT '{}'::jsonb,
            validation JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            activated_by TEXT,
            activated_at TIMESTAMPTZ,
            UNIQUE (scope_urn, version)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_lob_datasets_active_scope
        ON lob_datasets(scope_urn) WHERE is_active
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_datasets_project_front ON lob_datasets(project_id, front_id, created_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_dataset_sources (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            source_type TEXT NOT NULL CHECK (source_type IN ('duraciones', 'metrados', 'cronograma')),
            original_name TEXT NOT NULL,
            gcs_urn TEXT,
            sha256 TEXT NOT NULL,
            size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
            content_type TEXT,
            archived BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (dataset_id, source_type)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_cost_items (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            codigo TEXT NOT NULL,
            parent_codigo TEXT,
            descripcion TEXT,
            unidad TEXT,
            metrado DOUBLE PRECISION CHECK (metrado IS NULL OR metrado >= 0),
            pu DOUBLE PRECISION CHECK (pu IS NULL OR pu >= 0),
            rendimiento DOUBLE PRECISION,
            duracion DOUBLE PRECISION,
            activity_id TEXT,
            frente_label TEXT,
            orden INTEGER NOT NULL DEFAULT 0,
            tipo TEXT NOT NULL DEFAULT 'partida' CHECK (tipo IN ('partida', 'titulo')),
            PRIMARY KEY (dataset_id, codigo)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_cost_items_activity ON lob_cost_items(dataset_id, activity_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_progress_entries (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            codigo TEXT NOT NULL,
            periodo INTEGER NOT NULL CHECK (periodo > 0),
            metrado_ejec DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (metrado_ejec >= 0),
            period_start DATE,
            period_end DATE,
            PRIMARY KEY (dataset_id, codigo, periodo),
            FOREIGN KEY (dataset_id, codigo) REFERENCES lob_cost_items(dataset_id, codigo) ON DELETE CASCADE
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_activity_schedule (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            activity_id TEXT NOT NULL,
            nombre TEXT,
            planned_start DATE,
            planned_finish DATE,
            actual_start DATE,
            actual_finish DATE,
            percent DOUBLE PRECISION CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100)),
            status TEXT,
            PRIMARY KEY (dataset_id, activity_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_front_map (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            frente TEXT NOT NULL,
            cod_base TEXT NOT NULL,
            PRIMARY KEY (dataset_id, frente, cod_base)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_locations (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            codigo TEXT NOT NULL,
            alignment_id TEXT,
            station_start DOUBLE PRECISION,
            station_end DOUBLE PRECISION,
            direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
            source TEXT NOT NULL DEFAULT 'manual',
            PRIMARY KEY (dataset_id, codigo),
            FOREIGN KEY (dataset_id, codigo) REFERENCES lob_cost_items(dataset_id, codigo) ON DELETE CASCADE,
            CHECK (station_start IS NULL OR station_end IS NULL OR station_start <> station_end)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_element_links (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            source_urn TEXT NOT NULL,
            external_id TEXT NOT NULL,
            codigo TEXT NOT NULL,
            activity_id TEXT,
            link_method TEXT NOT NULL DEFAULT 'property_exact',
            confidence DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (dataset_id, source_urn, external_id, codigo),
            FOREIGN KEY (dataset_id, codigo) REFERENCES lob_cost_items(dataset_id, codigo) ON DELETE CASCADE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_element_links_code ON lob_element_links(dataset_id, codigo)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_element_links_external ON lob_element_links(dataset_id, source_urn, external_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_dataset_audit (
            id BIGSERIAL PRIMARY KEY,
            dataset_id TEXT REFERENCES lob_datasets(id) ON DELETE CASCADE,
            scope_urn TEXT NOT NULL,
            action TEXT NOT NULL,
            performed_by TEXT,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_dataset_audit_scope ON lob_dataset_audit(scope_urn, created_at DESC)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS lob_dataset_audit")
    op.execute("DROP TABLE IF EXISTS lob_element_links")
    op.execute("DROP TABLE IF EXISTS lob_locations")
    op.execute("DROP TABLE IF EXISTS lob_front_map")
    op.execute("DROP TABLE IF EXISTS lob_activity_schedule")
    op.execute("DROP TABLE IF EXISTS lob_progress_entries")
    op.execute("DROP TABLE IF EXISTS lob_cost_items")
    op.execute("DROP TABLE IF EXISTS lob_dataset_sources")
    op.execute("DROP TABLE IF EXISTS lob_datasets")
    # lob_config predates this migration in existing deployments and is retained.
