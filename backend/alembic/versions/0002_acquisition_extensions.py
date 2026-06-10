"""price events, weg health, capital stacks, seller motive

Revision ID: 0002_acquisition_extensions
Revises: 0001_initial
Create Date: 2026-06-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_acquisition_extensions"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deals", sa.Column("seller_motive", sa.String(length=80), nullable=True))

    op.create_table(
        "listing_price_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("listings.id"), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
    )

    op.create_table(
        "weg_health_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "capital_stack_scenarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("capital_stack_scenarios")
    op.drop_table("weg_health_records")
    op.drop_table("listing_price_events")
    op.drop_column("deals", "seller_motive")
