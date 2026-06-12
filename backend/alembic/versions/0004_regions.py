"""regions and region metrics

Revision ID: 0004_regions
Revises: 0003_geo_intelligence
Create Date: 2026-06-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0004_regions"
down_revision = "0003_geo_intelligence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ags", sa.String(length=12), nullable=True, unique=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("level", sa.String(length=40), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("regions.id"), nullable=True),
        sa.Column("federal_state", sa.String(length=80), nullable=True),
        sa.Column("population", sa.Integer(), nullable=True),
    )

    op.create_table(
        "region_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("region_id", sa.Integer(), sa.ForeignKey("regions.id"), nullable=False),
        sa.Column("metric", sa.String(length=80), nullable=False),
        sa.Column("value", sa.Numeric(14, 4), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("data_sources.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_region_metrics_region_metric", "region_metrics", ["region_id", "metric"])


def downgrade() -> None:
    op.drop_index("ix_region_metrics_region_metric", table_name="region_metrics")
    op.drop_table("region_metrics")
    op.drop_table("regions")
