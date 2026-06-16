from decimal import Decimal

from app.services.scoring import (
    DealScoringInput,
    LocationMetricsInput,
    ScoreConfig,
    score_deal,
    score_region_outlook,
)


def test_scoring_exposes_red_flags_for_risky_negative_cashflow_deal():
    result = score_deal(
        DealScoringInput(
            gross_initial_yield_percent=Decimal("3.1"),
            net_initial_yield_percent=Decimal("1.8"),
            monthly_cashflow_before_tax=Decimal("-420"),
            dscr=Decimal("0.74"),
            price_per_sqm=Decimal("6200"),
            market_price_per_sqm=Decimal("4800"),
            house_money_monthly=None,
            non_recoverable_costs_monthly=Decimal("260"),
            energy_class="H",
            expected_initial_capex=Decimal("0"),
            maintenance_reserve_weg=None,
            address_complete=False,
            is_rented=True,
            current_rent_per_sqm=Decimal("16"),
            legally_plausible_target_rent_per_sqm=Decimal("12"),
            location=LocationMetricsInput(
                population_trend_score=70,
                vacancy_risk_score=65,
                purchasing_power_score=75,
                public_transport_score=60,
                employer_access_score=70,
                micro_location_score=65,
                noise_risk_score=55,
                flood_risk_score=70,
            ),
        ),
        config=ScoreConfig(minimum_dscr=Decimal("1.15")),
    )

    assert result.total_score < 50
    assert "negative_cashflow_base_case" in result.red_flags
    assert "dscr_below_threshold" in result.red_flags
    assert "missing_house_money" in result.red_flags
    assert "poor_energy_class_without_capex_buffer" in result.red_flags
    assert "rented_above_legally_plausible_rent" in result.red_flags
    assert result.next_recommended_action == "Reject or renegotiate materially before spending diligence budget."


def test_scoring_rewards_solid_explainable_deal():
    result = score_deal(
        DealScoringInput(
            gross_initial_yield_percent=Decimal("5.4"),
            net_initial_yield_percent=Decimal("4.2"),
            monthly_cashflow_before_tax=Decimal("95"),
            dscr=Decimal("1.28"),
            price_per_sqm=Decimal("3300"),
            market_price_per_sqm=Decimal("3650"),
            house_money_monthly=Decimal("230"),
            non_recoverable_costs_monthly=Decimal("85"),
            energy_class="C",
            expected_initial_capex=Decimal("8000"),
            maintenance_reserve_weg=Decimal("420000"),
            address_complete=True,
            is_rented=True,
            current_rent_per_sqm=Decimal("10.5"),
            legally_plausible_target_rent_per_sqm=Decimal("11.2"),
            location=LocationMetricsInput(
                population_trend_score=82,
                vacancy_risk_score=78,
                purchasing_power_score=76,
                public_transport_score=88,
                employer_access_score=80,
                micro_location_score=84,
                noise_risk_score=72,
                flood_risk_score=90,
            ),
        )
    )

    assert result.total_score >= 75
    assert result.red_flags == []
    assert result.category_scores["location_and_demand"] >= 75
    assert result.positive_factors
    assert "Underwrite further" in result.next_recommended_action


def test_region_outlook_includes_neutral_urban_environment_quality():
    result = score_region_outlook(
        LocationMetricsInput(
            population_trend_score=84,
            vacancy_risk_score=80,
            purchasing_power_score=78,
            public_transport_score=86,
            employer_access_score=83,
            micro_location_score=81,
            urban_environment_quality_score=79,
            noise_risk_score=70,
            flood_risk_score=74,
        ),
        source="official/manual",
    )

    assert result.total_score >= 78
    assert result.category_scores["urban_environment_quality"] >= 78
    assert any("Urban environment" in factor for factor in result.positive_factors)
    assert any(metric["name"] == "urban_environment_quality_score" for metric in result.key_metrics)
    assert any("nationality" in note for note in result.data_quality_notes)


def test_region_outlook_marks_weak_urban_environment_as_caution():
    result = score_region_outlook(
        LocationMetricsInput(
            population_trend_score=42,
            vacancy_risk_score=46,
            purchasing_power_score=49,
            public_transport_score=52,
            employer_access_score=47,
            micro_location_score=50,
            urban_environment_quality_score=38,
            noise_risk_score=44,
            flood_risk_score=41,
        )
    )

    assert result.total_score < 50
    assert result.category_scores["urban_environment_quality"] < 45
    assert any("Urban environment" in factor for factor in result.caution_factors)
