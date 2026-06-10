"""baseline: esquema preexistente (creado por las funciones ensure_* de la app)

Esta es la migracion BASELINE. El esquema actual (26+ tablas: inventory_assets,
asset_user_data, projects, model_config, tracking_*, presupuesto_maestro, etc.)
NO se crea aqui: ya existe en la BD, creado historicamente por las funciones
ensure_*() que corren al arrancar el backend.

En una BD que YA tiene el esquema: `alembic stamp head` marca este punto sin
ejecutar nada. En una BD nueva/vacia: el esquema lo siguen creando las ensure_*()
al arrancar; este baseline solo fija el punto de partida del versionado.

A partir de aqui, TODO cambio de esquema debe ir en una nueva migracion
(`alembic revision -m "..."`), no en un ensure_* nuevo.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_baseline'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Baseline: no-op. El esquema ya existe (ver docstring).
    pass


def downgrade():
    # No revertimos el baseline (destruiria el esquema preexistente).
    pass
