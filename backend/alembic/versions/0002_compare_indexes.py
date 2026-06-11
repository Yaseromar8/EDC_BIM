"""indices para el comparador: lookups por source_urn/model_urn + external_id

El diff compara scopes por external_id con anti-joins; estos indices compuestos
hacen que added/removed/modified usen index scans en vez de seq scans cuando
los frentes crezcan (hoy 19k filas, manana 100k+).

Revision ID: 0002_compare_indexes
Revises: 0001_baseline
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_compare_indexes'
down_revision = '0001_baseline'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_assets_source_ext ON inventory_assets(source_urn, external_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_assets_model_ext ON inventory_assets(model_urn, external_id)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_inventory_assets_source_ext")
    op.execute("DROP INDEX IF EXISTS idx_inventory_assets_model_ext")
