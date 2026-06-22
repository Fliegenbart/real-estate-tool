"""micro location factor scores

Revision ID: 0006_micro_location_factors
Revises: 0005_capex_financing
Create Date: 2026-06-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0006_micro_location_factors"
down_revision = "0005_capex_financing"
branch_labels = None
depends_on = None


MICRO_LOCATION_COLUMNS = [
    "transit_access_score",
    "daily_needs_score",
    "demand_anchor_score",
    "leisure_quality_score",
    "short_term_rental_score",
    "nuisance_resilience_score",
]


def upgrade() -> None:
    existing_columns = _location_score_columns()
    for column_name in MICRO_LOCATION_COLUMNS:
        if column_name not in existing_columns:
            op.add_column(
                "location_scores",
                sa.Column(column_name, sa.Integer(), server_default="60", nullable=False),
            )
    _add_column_if_missing(
        existing_columns,
        "evidence_confidence",
        sa.Column("evidence_confidence", sa.String(length=20), nullable=True),
    )
    _add_column_if_missing(
        existing_columns,
        "evidence_data_completeness_percent",
        sa.Column("evidence_data_completeness_percent", sa.Integer(), nullable=True),
    )
    _add_column_if_missing(
        existing_columns,
        "evidence_notes",
        sa.Column("evidence_notes", sa.JSON(), nullable=True),
    )
    _add_column_if_missing(
        existing_columns,
        "evidence_inputs",
        sa.Column("evidence_inputs", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    existing_columns = _location_score_columns()
    for column_name in [
        "evidence_inputs",
        "evidence_notes",
        "evidence_data_completeness_percent",
        "evidence_confidence",
    ]:
        if column_name in existing_columns:
            op.drop_column("location_scores", column_name)
    for column_name in reversed(MICRO_LOCATION_COLUMNS):
        if column_name in existing_columns:
            op.drop_column("location_scores", column_name)


def _location_score_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("location_scores")}


def _add_column_if_missing(existing_columns: set[str], column_name: str, column: sa.Column) -> None:
    if column_name not in existing_columns:
        op.add_column("location_scores", column)
