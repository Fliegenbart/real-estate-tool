"""financed renovation capex share on financing scenarios

Revision ID: 0005_capex_financing
Revises: 0004_regions
Create Date: 2026-06-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0005_capex_financing"
down_revision = "0004_regions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "financing_scenarios",
        sa.Column("capex_financed_percent", sa.Numeric(8, 3), server_default="0.0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("financing_scenarios", "capex_financed_percent")
