from sqlalchemy import create_engine, inspect, text

from app.database import ensure_schema_compatibility


def test_ensure_schema_compatibility_adds_missing_capex_financing_column(tmp_path):
    db_path = tmp_path / "old_dev.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE financing_scenarios (
                    id INTEGER PRIMARY KEY,
                    deal_id INTEGER NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    interest_rate_percent NUMERIC(8, 3) NOT NULL,
                    amortization_rate_percent NUMERIC(8, 3) NOT NULL,
                    loan_to_value_percent NUMERIC(8, 3) NOT NULL,
                    equity_contribution NUMERIC(14, 2),
                    created_at DATETIME NOT NULL
                )
                """
            )
        )

    ensure_schema_compatibility(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("financing_scenarios")}
    assert "capex_financed_percent" in columns
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO financing_scenarios (
                    id, deal_id, name, interest_rate_percent, amortization_rate_percent,
                    loan_to_value_percent, created_at
                )
                VALUES (1, 1, 'Base financing', 4.0, 2.0, 75.0, '2026-06-14 10:00:00')
                """
            )
        )
        value = conn.execute(
            text("SELECT capex_financed_percent FROM financing_scenarios WHERE id = 1")
        ).scalar_one()
    assert value == 0


def test_ensure_schema_compatibility_adds_missing_climate_location_column(tmp_path):
    db_path = tmp_path / "old_location.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE financing_scenarios (
                    id INTEGER PRIMARY KEY,
                    deal_id INTEGER NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    interest_rate_percent NUMERIC(8, 3) NOT NULL,
                    amortization_rate_percent NUMERIC(8, 3) NOT NULL,
                    loan_to_value_percent NUMERIC(8, 3) NOT NULL,
                    capex_financed_percent NUMERIC(8, 3) NOT NULL DEFAULT 0,
                    equity_contribution NUMERIC(14, 2),
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE location_scores (
                    id INTEGER PRIMARY KEY,
                    deal_id INTEGER NOT NULL,
                    population_trend_score INTEGER NOT NULL,
                    vacancy_risk_score INTEGER NOT NULL,
                    purchasing_power_score INTEGER NOT NULL,
                    public_transport_score INTEGER NOT NULL,
                    employer_access_score INTEGER NOT NULL,
                    micro_location_score INTEGER NOT NULL,
                    transit_access_score INTEGER NOT NULL DEFAULT 60,
                    daily_needs_score INTEGER NOT NULL DEFAULT 60,
                    demand_anchor_score INTEGER NOT NULL DEFAULT 60,
                    leisure_quality_score INTEGER NOT NULL DEFAULT 60,
                    short_term_rental_score INTEGER NOT NULL DEFAULT 60,
                    nuisance_resilience_score INTEGER NOT NULL DEFAULT 60,
                    noise_risk_score INTEGER NOT NULL,
                    flood_risk_score INTEGER NOT NULL,
                    source VARCHAR(80) NOT NULL,
                    evidence_inputs JSON
                )
                """
            )
        )

    ensure_schema_compatibility(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("location_scores")}
    assert "climate_resilience_score" in columns
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO location_scores (
                    id, deal_id, population_trend_score, vacancy_risk_score,
                    purchasing_power_score, public_transport_score, employer_access_score,
                    micro_location_score, noise_risk_score, flood_risk_score, source
                )
                VALUES (1, 1, 60, 60, 60, 60, 60, 60, 60, 60, 'old')
                """
            )
        )
        value = conn.execute(
            text("SELECT climate_resilience_score FROM location_scores WHERE id = 1")
        ).scalar_one()
    assert value == 60
