from decimal import Decimal

from app.services.weg_health import PlannedMeasure, WegHealthInput, assess_weg_health


def test_healthy_weg_scores_high_with_positive_factors():
    result = assess_weg_health(
        WegHealthInput(
            construction_year=1995,
            total_units=24,
            community_living_area_sqm=Decimal("1600"),
            reserve_total_eur=Decimal("48000"),
            annual_reserve_contribution_eur=Decimal("17000"),
            hausgeld_monthly_eur=Decimal("210"),
            unit_living_area_sqm=Decimal("62"),
            arrears_total_eur=Decimal("0"),
            special_levies_last_5_years_eur=Decimal("0"),
            professional_management=True,
            protocols_years_reviewed=3,
            litigation_pending=False,
            has_majority_owner=False,
        )
    )

    assert result.total_score >= 70
    assert result.confidence == "high"
    assert "weg_reserve_critically_low" not in result.flags
    assert result.positive_factors


def test_sick_weg_flags_unfunded_measures_and_low_reserve():
    result = assess_weg_health(
        WegHealthInput(
            construction_year=1972,
            total_units=40,
            community_living_area_sqm=Decimal("2400"),
            reserve_total_eur=Decimal("8000"),
            annual_reserve_contribution_eur=Decimal("4000"),
            hausgeld_monthly_eur=Decimal("380"),
            unit_living_area_sqm=Decimal("60"),
            arrears_total_eur=Decimal("22000"),
            planned_measures=[
                PlannedMeasure(title="Dachsanierung", estimated_cost_eur=Decimal("120000"), funded_by="unknown"),
            ],
            special_levies_last_5_years_eur=Decimal("60000"),
            professional_management=False,
            protocols_years_reviewed=2,
            litigation_pending=True,
        )
    )

    assert result.total_score < 45
    assert "weg_reserve_critically_low" in result.flags
    assert "weg_unfunded_measures" in result.flags
    assert "weg_special_levy_history" in result.flags
    assert "weg_litigation_pending" in result.flags


def test_missing_data_requests_documents_with_low_confidence():
    result = assess_weg_health(WegHealthInput())

    assert result.confidence == "low"
    assert result.documents_to_request
    assert "weg_reserve_unknown" in result.flags
