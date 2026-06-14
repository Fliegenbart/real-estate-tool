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
