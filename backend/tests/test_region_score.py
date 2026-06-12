from decimal import Decimal

from app.services.region_score import score_region


def test_strong_cashflow_city_scores_well():
    # Leipzig-like: decent yield, moderate vacancy, growing
    result = score_region(
        {
            "price_eur_sqm": Decimal("2650"),
            "rent_eur_sqm": Decimal("7.8"),
            "vacancy_rate_percent": Decimal("5.5"),
            "population_forecast_2040_percent": Decimal("8"),
            "unemployment_rate_percent": Decimal("8.5"),
        },
        population=620000,
    )
    assert result.total_score >= 50
    assert result.category_scores["demand_stability"] >= 65
    assert result.data_completeness_percent == 100
    assert "structural_decline_risk" not in result.red_flags
    assert result.rent_factor is not None


def test_structural_decline_interaction_caps_demand_score():
    # High yield but shrinking hard with high vacancy
    result = score_region(
        {
            "price_eur_sqm": Decimal("1000"),
            "rent_eur_sqm": Decimal("5.2"),
            "vacancy_rate_percent": Decimal("11.5"),
            "population_forecast_2040_percent": Decimal("-10"),
            "unemployment_rate_percent": Decimal("9.5"),
        },
        population=64000,
    )
    assert "structural_decline_risk" in result.red_flags
    assert "very_high_vacancy" in result.red_flags
    assert result.category_scores["demand_stability"] <= 25
    assert "Meiden" in result.recommendation


def test_expensive_a_city_flags_weak_yield():
    result = score_region(
        {
            "price_eur_sqm": Decimal("8400"),
            "rent_eur_sqm": Decimal("20.0"),
            "vacancy_rate_percent": Decimal("1.0"),
            "population_forecast_2040_percent": Decimal("7"),
            "unemployment_rate_percent": Decimal("4.5"),
        },
        population=1488000,
    )
    assert "weak_yield_market" in result.red_flags
    assert result.category_scores["yield_power"] < 30
    assert result.category_scores["demand_stability"] > 80


def test_own_flow_data_overrides_seed_estimates():
    base = {
        "price_eur_sqm": Decimal("2000"),
        "rent_eur_sqm": Decimal("6"),
    }
    seed_only = score_region(dict(base), population=200000)
    with_own = score_region(
        {**base, "own_median_price_eur_sqm": Decimal("1400"), "own_median_rent_eur_sqm": Decimal("6")},
        population=200000,
    )
    assert with_own.gross_yield_percent > seed_only.gross_yield_percent
    assert with_own.rent_factor < seed_only.rent_factor


def test_missing_data_yields_neutral_scores_and_low_completeness():
    result = score_region({}, population=None)
    assert result.total_score == 48  # neutral 50s minus liquidity 40 at 15%
    assert result.data_completeness_percent == 0
