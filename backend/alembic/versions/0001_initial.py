"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("external_id", sa.String(length=160), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("street", sa.String(length=200), nullable=True),
        sa.Column("house_number", sa.String(length=40), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("federal_state", sa.String(length=80), nullable=True),
        sa.Column("latitude", sa.Numeric(10, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 6), nullable=True),
        sa.Column("purchase_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("living_area_sqm", sa.Numeric(10, 2), nullable=True),
        sa.Column("number_of_rooms", sa.Numeric(5, 2), nullable=True),
        sa.Column("floor", sa.String(length=40), nullable=True),
        sa.Column("construction_year", sa.Integer(), nullable=True),
        sa.Column("condition", sa.String(length=120), nullable=True),
        sa.Column("energy_class", sa.String(length=8), nullable=True),
        sa.Column("heating_type", sa.String(length=120), nullable=True),
        sa.Column("energy_consumption_kwh", sa.Numeric(8, 2), nullable=True),
        sa.Column("is_rented", sa.Boolean(), nullable=False),
        sa.Column("cold_rent_monthly", sa.Numeric(14, 2), nullable=True),
        sa.Column("market_rent_estimate_monthly", sa.Numeric(14, 2), nullable=True),
        sa.Column("house_money_monthly", sa.Numeric(14, 2), nullable=True),
        sa.Column("non_recoverable_costs_monthly", sa.Numeric(14, 2), nullable=True),
        sa.Column("maintenance_reserve_weg", sa.Numeric(14, 2), nullable=True),
        sa.Column("broker_fee_percent", sa.Numeric(8, 3), nullable=True),
        sa.Column("property_transfer_tax_percent", sa.Numeric(8, 3), nullable=True),
        sa.Column("notary_and_land_registry_percent", sa.Numeric(8, 3), nullable=True),
        sa.Column("expected_initial_capex", sa.Numeric(14, 2), nullable=True),
        sa.Column("listing_url", sa.String(length=500), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
    )
    op.create_table(
        "properties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("street", sa.String(length=200), nullable=True),
        sa.Column("house_number", sa.String(length=40), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("federal_state", sa.String(length=80), nullable=True),
        sa.Column("latitude", sa.Numeric(10, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("property_id", sa.Integer(), sa.ForeignKey("properties.id"), nullable=False),
        sa.Column("living_area_sqm", sa.Numeric(10, 2), nullable=True),
        sa.Column("number_of_rooms", sa.Numeric(5, 2), nullable=True),
        sa.Column("floor", sa.String(length=40), nullable=True),
        sa.Column("condition", sa.String(length=120), nullable=True),
        sa.Column("energy_class", sa.String(length=8), nullable=True),
        sa.Column("heating_type", sa.String(length=120), nullable=True),
    )
    op.create_table(
        "deals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("listings.id"), nullable=True),
        sa.Column("property_id", sa.Integer(), sa.ForeignKey("properties.id"), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("pipeline_stage", sa.String(length=80), nullable=False),
        sa.Column("purchase_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("market_price_per_sqm", sa.Numeric(14, 2), nullable=True),
        sa.Column("local_reference_rent_per_sqm", sa.Numeric(14, 2), nullable=True),
        sa.Column("rent_control_area", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table("underwriting_cases", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("name", sa.String(length=120), nullable=False), sa.Column("inputs", sa.JSON(), nullable=False), sa.Column("results", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("financing_scenarios", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("name", sa.String(length=120), nullable=False), sa.Column("interest_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("amortization_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("loan_to_value_percent", sa.Numeric(8, 3), nullable=False), sa.Column("equity_contribution", sa.Numeric(14, 2), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("tax_scenarios", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("corporate_tax_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("solidarity_surcharge_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("trade_tax_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("assumes_extended_property_deduction", sa.Boolean(), nullable=False), sa.Column("depreciation_rate_percent", sa.Numeric(8, 3), nullable=False), sa.Column("building_share_percent", sa.Numeric(8, 3), nullable=False), sa.Column("interest_deductible", sa.Boolean(), nullable=False), sa.Column("warning", sa.Text(), nullable=False))
    op.create_table("location_scores", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("population_trend_score", sa.Integer(), nullable=False), sa.Column("vacancy_risk_score", sa.Integer(), nullable=False), sa.Column("purchasing_power_score", sa.Integer(), nullable=False), sa.Column("public_transport_score", sa.Integer(), nullable=False), sa.Column("employer_access_score", sa.Integer(), nullable=False), sa.Column("micro_location_score", sa.Integer(), nullable=False), sa.Column("noise_risk_score", sa.Integer(), nullable=False), sa.Column("flood_risk_score", sa.Integer(), nullable=False), sa.Column("source", sa.String(length=80), nullable=False))
    op.create_table("risk_flags", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("code", sa.String(length=120), nullable=False), sa.Column("label", sa.String(length=240), nullable=False), sa.Column("severity", sa.String(length=40), nullable=False), sa.Column("notes", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("deal_scores", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("total_score", sa.Integer(), nullable=False), sa.Column("category_scores", sa.JSON(), nullable=False), sa.Column("explanation", sa.Text(), nullable=False), sa.Column("positive_factors", sa.JSON(), nullable=False), sa.Column("negative_factors", sa.JSON(), nullable=False), sa.Column("red_flags", sa.JSON(), nullable=False), sa.Column("next_recommended_action", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("documents", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("document_type", sa.String(length=80), nullable=False), sa.Column("file_name", sa.String(length=240), nullable=False), sa.Column("uploaded_at", sa.DateTime(), nullable=False), sa.Column("extracted_text", sa.Text(), nullable=True), sa.Column("review_status", sa.String(length=80), nullable=False), sa.Column("risk_notes", sa.Text(), nullable=True))
    op.create_table("deal_pipeline_items", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id"), nullable=False), sa.Column("stage", sa.String(length=80), nullable=False), sa.Column("notes", sa.Text(), nullable=True), sa.Column("updated_at", sa.DateTime(), nullable=False))


def downgrade() -> None:
    for table in [
        "deal_pipeline_items",
        "documents",
        "deal_scores",
        "risk_flags",
        "location_scores",
        "tax_scenarios",
        "financing_scenarios",
        "underwriting_cases",
        "deals",
        "units",
        "properties",
        "listings",
    ]:
        op.drop_table(table)
