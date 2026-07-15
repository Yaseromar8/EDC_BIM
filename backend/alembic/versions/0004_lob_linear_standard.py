"""LOB Linear 1.0: reusable planning standard for linear construction.

Revision ID: 0004_lob_linear_standard
Revises: 0003_lob4d_enterprise
Create Date: 2026-07-10
"""
from alembic import op


revision = '0004_lob_linear_standard'
down_revision = '0003_lob4d_enterprise'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_profiles (
            scope_urn TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            front_id TEXT,
            standard_version TEXT NOT NULL DEFAULT 'LOB-LINEAR/1.0',
            name TEXT NOT NULL,
            project_type TEXT NOT NULL
                CHECK (project_type IN ('road','rail','canal','pipeline','tunnel','transmission','other')),
            alignment_id TEXT,
            station_start DOUBLE PRECISION NOT NULL,
            station_end DOUBLE PRECISION NOT NULL,
            station_unit TEXT NOT NULL DEFAULT 'm' CHECK (station_unit IN ('m','km','ft','mi')),
            station_notation TEXT NOT NULL DEFAULT '0+000.00',
            direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
            timezone TEXT NOT NULL DEFAULT 'America/Lima',
            currency TEXT NOT NULL DEFAULT 'PEN',
            calendar JSONB NOT NULL DEFAULT jsonb_build_object(
                'work_days', jsonb_build_array(1,2,3,4,5,6),
                'hours_per_day', 8
            ),
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','ready','active','archived')),
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (station_end > station_start)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_linear_profiles_project ON lob_linear_profiles(project_id, front_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_zones (
            id TEXT PRIMARY KEY,
            scope_urn TEXT NOT NULL REFERENCES lob_linear_profiles(scope_urn) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            parent_code TEXT,
            zone_type TEXT NOT NULL DEFAULT 'production'
                CHECK (zone_type IN ('project','section','production','constraint','structure')),
            station_start DOUBLE PRECISION NOT NULL,
            station_end DOUBLE PRECISION NOT NULL,
            sequence INTEGER NOT NULL DEFAULT 0,
            alignment_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (scope_urn, code),
            CHECK (station_end > station_start)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_linear_zones_station ON lob_linear_zones(scope_urn, station_start, station_end)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_methodologies (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            scope_urn TEXT REFERENCES lob_linear_profiles(scope_urn) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            project_type TEXT NOT NULL,
            description TEXT,
            reusable BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (scope_urn, code, version)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_methodology_steps (
            methodology_id TEXT NOT NULL REFERENCES lob_linear_methodologies(id) ON DELETE CASCADE,
            step_code TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            name TEXT NOT NULL,
            cost_code_pattern TEXT,
            relation_type TEXT NOT NULL DEFAULT 'FS' CHECK (relation_type IN ('FS','SS','FF','SF')),
            lag_days DOUBLE PRECISION NOT NULL DEFAULT 0,
            production_rate DOUBLE PRECISION CHECK (production_rate IS NULL OR production_rate > 0),
            production_unit TEXT,
            crew_code TEXT,
            behavior TEXT NOT NULL DEFAULT 'construct'
                CHECK (behavior IN ('construct','demolish','temporary','neutral')),
            color TEXT NOT NULL DEFAULT '#3aa0ff',
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            PRIMARY KEY (methodology_id, step_code),
            UNIQUE (methodology_id, sequence)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_resources (
            id TEXT PRIMARY KEY,
            scope_urn TEXT NOT NULL REFERENCES lob_linear_profiles(scope_urn) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            resource_type TEXT NOT NULL
                CHECK (resource_type IN ('crew','labor','equipment','material','subcontractor')),
            capacity DOUBLE PRECISION CHECK (capacity IS NULL OR capacity > 0),
            unit TEXT,
            cost_rate DOUBLE PRECISION CHECK (cost_rate IS NULL OR cost_rate >= 0),
            availability JSONB NOT NULL DEFAULT '{}'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE (scope_urn, code)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_scenarios (
            id TEXT PRIMARY KEY,
            scope_urn TEXT NOT NULL REFERENCES lob_linear_profiles(scope_urn) ON DELETE CASCADE,
            dataset_id TEXT REFERENCES lob_datasets(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            scenario_type TEXT NOT NULL DEFAULT 'working'
                CHECK (scenario_type IN ('contractual','baseline','working','what_if','actual')),
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','active','archived')),
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            approved_by TEXT,
            approved_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_lob_linear_active_scenario ON lob_linear_scenarios(scope_urn) WHERE is_active")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_activity_relations (
            dataset_id TEXT NOT NULL REFERENCES lob_datasets(id) ON DELETE CASCADE,
            predecessor_id TEXT NOT NULL,
            successor_id TEXT NOT NULL,
            relation_type TEXT NOT NULL DEFAULT 'FS' CHECK (relation_type IN ('FS','SS','FF','SF')),
            lag_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'p6',
            PRIMARY KEY (dataset_id, predecessor_id, successor_id, relation_type)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_activity_relations_successor ON lob_activity_relations(dataset_id, successor_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS lob_linear_progress_events (
            id TEXT PRIMARY KEY,
            scope_urn TEXT NOT NULL REFERENCES lob_linear_profiles(scope_urn) ON DELETE CASCADE,
            dataset_id TEXT REFERENCES lob_datasets(id) ON DELETE SET NULL,
            codigo TEXT NOT NULL,
            zone_code TEXT,
            event_date DATE NOT NULL,
            station_start DOUBLE PRECISION,
            station_end DOUBLE PRECISION,
            quantity DOUBLE PRECISION CHECK (quantity IS NULL OR quantity >= 0),
            unit TEXT,
            percent_complete DOUBLE PRECISION
                CHECK (percent_complete IS NULL OR (percent_complete >= 0 AND percent_complete <= 100)),
            source TEXT NOT NULL DEFAULT 'field',
            note TEXT,
            evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (station_start IS NULL OR station_end IS NULL OR station_end >= station_start)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_progress_scope_date ON lob_linear_progress_events(scope_urn, event_date DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_lob_progress_code ON lob_linear_progress_events(scope_urn, codigo, event_date DESC)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS lob_linear_progress_events")
    op.execute("DROP TABLE IF EXISTS lob_activity_relations")
    op.execute("DROP TABLE IF EXISTS lob_linear_scenarios")
    op.execute("DROP TABLE IF EXISTS lob_linear_resources")
    op.execute("DROP TABLE IF EXISTS lob_linear_methodology_steps")
    op.execute("DROP TABLE IF EXISTS lob_linear_methodologies")
    op.execute("DROP TABLE IF EXISTS lob_linear_zones")
    op.execute("DROP TABLE IF EXISTS lob_linear_profiles")
