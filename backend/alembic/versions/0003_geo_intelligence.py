"""data source registry and geo context

Revision ID: 0003_geo_intelligence
Revises: 0002_acquisition_extensions
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_geo_intelligence"
down_revision = "0002_acquisition_extensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("provider", sa.String(length=160), nullable=True),
        sa.Column("data_type", sa.String(length=80), nullable=False),
        sa.Column("license_type", sa.String(length=120), nullable=True),
        sa.Column("commercial_use_allowed", sa.Boolean(), nullable=True),
        sa.Column("attribution_required", sa.Boolean(), nullable=True),
        sa.Column("geographic_coverage", sa.String(length=160), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("last_import_at", sa.DateTime(), nullable=True),
        sa.Column("source_data_date", sa.String(length=40), nullable=True),
        sa.Column("update_frequency", sa.String(length=80), nullable=True),
        sa.Column("reliability_score", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "geo_contexts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False),
        sa.Column("parcel_id", sa.String(length=120), nullable=True),
        sa.Column("ground_value_eur_per_sqm", sa.Numeric(14, 2), nullable=True),
        sa.Column("ground_value_source_id", sa.Integer(), sa.ForeignKey("data_sources.id"), nullable=True),
        sa.Column("ground_value_data_date", sa.String(length=40), nullable=True),
        sa.Column("zoning_summary", sa.Text(), nullable=True),
        sa.Column("b_plan_available", sa.Boolean(), nullable=True),
        sa.Column("f_plan_summary", sa.Text(), nullable=True),
        sa.Column("milieu_protection_area", sa.Boolean(), nullable=True),
        sa.Column("redevelopment_area", sa.Boolean(), nullable=True),
        sa.Column("monument_protection", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("geo_contexts")
    op.drop_table("data_sources")
