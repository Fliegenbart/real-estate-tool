"""persist renovation and refinance cases

Revision ID: 0007_renovation_cases
Revises: 0006_micro_location_factors
Create Date: 2026-06-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0007_renovation_cases"
down_revision = "0006_micro_location_factors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "renovation_cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("renovation_cases")
