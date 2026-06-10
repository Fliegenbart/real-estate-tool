from decimal import Decimal

from app.services.underwriting import UnderwritingInput, calculate_underwriting


def _base_input(**overrides) -> UnderwritingInput:
    defaults = dict(
        purchase_price=Decimal("150000"),
        living_area_sqm=Decimal("60"),
        monthly_cold_rent=Decimal("1000"),
        loan_to_value_percent=Decimal("100"),
        financing_interest_rate_percent=Decimal("4.0"),
        amortization_rate_percent=Decimal("2.0"),
        interest_fixation_years=10,
    )
    defaults.update(overrides)
    return UnderwritingInput(**defaults)


def test_green_rating_when_residual_debt_below_150_rents():
    result = calculate_underwriting(_base_input())

    # Annuity 150k @ 4%/2%: remaining after 10y ~ 113.981 EUR -> factor ~ 114.
    assert result.remaining_loan_at_fixation_end == Decimal("113981.68")
    assert Decimal("113") < result.residual_debt_factor < Decimal("115")
    assert result.residual_debt_factor_rating == "green"
    assert result.amortization_gap_to_target_factor == Decimal("0.00")


def test_red_rating_and_gap_when_rent_is_too_low_for_the_debt():
    result = calculate_underwriting(_base_input(monthly_cold_rent=Decimal("500")))

    assert result.residual_debt_factor > Decimal("170")
    assert result.residual_debt_factor_rating == "red"
    # Gap = remaining - 150 x 500 = 113.981,68 - 75.000
    assert result.amortization_gap_to_target_factor == Decimal("38981.68")


def test_amber_band_between_150_and_170():
    # Choose rent so the factor lands between 150 and 170: 113981.68 / 160 = 712.39
    result = calculate_underwriting(_base_input(monthly_cold_rent=Decimal("712")))

    assert Decimal("150") < result.residual_debt_factor <= Decimal("170")
    assert result.residual_debt_factor_rating == "amber"
    assert result.amortization_gap_to_target_factor > Decimal("0")


def test_all_equity_purchase_is_green_with_factor_zero():
    result = calculate_underwriting(
        _base_input(loan_to_value_percent=Decimal("0"), financing_interest_rate_percent=Decimal("0"), amortization_rate_percent=Decimal("0"))
    )

    assert result.remaining_loan_at_fixation_end == Decimal("0.00")
    assert result.residual_debt_factor == Decimal("0.00")
    assert result.residual_debt_factor_rating == "green"
