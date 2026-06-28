"""add climate resilience score

Revision ID: 0008_climate_resilience_score
Revises: 0007_renovation_cases
Create Date: 2026-06-28
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0008_climate_resilience_score"
down_revision = "0007_renovation_cases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "location_scores",
        sa.Column("climate_resilience_score", sa.Integer(), nullable=False, server_default="60"),
    )
    op.alter_column("location_scores", "climate_resilience_score", server_default=None)


def downgrade() -> None:
    op.drop_column("location_scores", "climate_resilience_score")
