from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./real_estate_mvp.db")

engine_kwargs = {"future": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    if DATABASE_URL in {"sqlite://", "sqlite:///:memory:"}:
        engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility(engine)


def ensure_schema_compatibility(target_engine: Engine) -> None:
    """Patch small additive schema gaps in long-lived local/dev databases.

    Alembic remains the source of truth for production migrations. This helper
    keeps SQLite fallback databases from crashing after additive columns are
    introduced while older local files are still present.
    """
    inspector = inspect(target_engine)
    if not inspector.has_table("financing_scenarios"):
        return

    financing_columns = {column["name"] for column in inspector.get_columns("financing_scenarios")}
    location_columns = (
        {column["name"] for column in inspector.get_columns("location_scores")}
        if inspector.has_table("location_scores")
        else set()
    )

    with target_engine.begin() as conn:
        if "capex_financed_percent" not in financing_columns:
            conn.execute(
                text(
                    "ALTER TABLE financing_scenarios "
                    "ADD COLUMN capex_financed_percent NUMERIC(8, 3) NOT NULL DEFAULT 0"
                )
            )

        if location_columns:
            for column_name in [
                "transit_access_score",
                "daily_needs_score",
                "demand_anchor_score",
                "leisure_quality_score",
                "short_term_rental_score",
                "nuisance_resilience_score",
                "climate_resilience_score",
            ]:
                if column_name not in location_columns:
                    conn.execute(
                        text(
                            f"ALTER TABLE location_scores "
                            f"ADD COLUMN {column_name} INTEGER NOT NULL DEFAULT 60"
                        )
                    )
            if "evidence_confidence" not in location_columns:
                conn.execute(
                    text("ALTER TABLE location_scores ADD COLUMN evidence_confidence VARCHAR(20)")
                )
            if "evidence_data_completeness_percent" not in location_columns:
                conn.execute(
                    text(
                        "ALTER TABLE location_scores "
                        "ADD COLUMN evidence_data_completeness_percent INTEGER"
                    )
                )
            if "evidence_notes" not in location_columns:
                conn.execute(text("ALTER TABLE location_scores ADD COLUMN evidence_notes JSON"))
            if "evidence_inputs" not in location_columns:
                conn.execute(text("ALTER TABLE location_scores ADD COLUMN evidence_inputs JSON"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
