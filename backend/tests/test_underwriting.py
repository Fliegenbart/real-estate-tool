from decimal import Decimal

from app.services.underwriting import (
    TaxAssumptions,
    UnderwritingInput,
    calculate_underwriting,
)


def test_underwriting_calculates_core_purchase_financing_and_return_metrics():
    result = calculate_underwriting(
        UnderwritingInput(
            purchase_price=Decimal("240000"),
            living_area_sqm=Decimal("60"),
            monthly_cold_rent=Decimal("900"),
            market_rent_monthly=Decimal("960"),
            house_money_monthly=Decimal("260"),
            non_recoverable_costs_monthly=Decimal("90"),
            maintenance_monthly=Decimal("75"),
            vacancy_allowance_percent=Decimal("2.0"),
            property_management_monthly=Decimal("30"),
            broker_fee_percent=Decimal("3.57"),
            property_transfer_tax_percent=Decimal("6.5"),
            notary_and_land_registry_percent=Decimal("2.0"),
            expected_initial_capex=Decimal("12000"),
            financing_interest_rate_percent=Decimal("4.0"),
            amortization_rate_percent=Decimal("2.0"),
            loan_to_value_percent=Decimal("75"),
            tax=TaxAssumptions(
                corporate_tax_rate_percent=Decimal("15"),
                solidarity_surcharge_rate_percent=Decimal("5.5"),
                trade_tax_rate_percent=Decimal("0"),
                depreciation_rate_percent=Decimal("2"),
            ),
            holding_period_years=10,
            exit_value_growth_percent=Decimal("1.5"),
            target_net_yield_percent=Decimal("4.0"),
        )
    )

    assert result.price_per_sqm == Decimal("4000.00")
    assert result.all_in_purchase_price == Decimal("280968.00")
    assert result.annual_cold_rent == Decimal("10800.00")
    assert result.gross_initial_yield_percent == Decimal("4.50")
    assert result.loan_amount == Decimal("180000.00")
    assert result.equity_required == Decimal("100968.00")
    assert result.annual_debt_service == Decimal("10800.00")
    assert result.net_operating_income == Decimal("8244.00")
    assert result.monthly_cashflow_before_tax == Decimal("-213.00")
    assert result.dscr == Decimal("0.76")
    assert result.rent_factor == Decimal("22.22")
    assert result.maximum_purchase_price_for_target_yield == Decimal("173195.32")
    assert result.simple_equity_multiple > Decimal("1.00")


def _cashflow_case(capex_financed_percent: Decimal):
    return calculate_underwriting(
        UnderwritingInput(
            purchase_price=Decimal("100000"),
            living_area_sqm=Decimal("50"),
            monthly_cold_rent=Decimal("600"),
            vacancy_allowance_percent=Decimal("0"),
            property_management_monthly=Decimal("0"),
            maintenance_monthly=Decimal("0"),
            non_recoverable_costs_monthly=Decimal("0"),
            broker_fee_percent=Decimal("0"),
            property_transfer_tax_percent=Decimal("0"),
            notary_and_land_registry_percent=Decimal("0"),
            expected_initial_capex=Decimal("20000"),
            capex_financed_percent=capex_financed_percent,
            financing_interest_rate_percent=Decimal("4"),
            amortization_rate_percent=Decimal("2"),
            loan_to_value_percent=Decimal("100"),
        )
    )


def test_financing_renovation_via_loan_raises_debt_service_and_lowers_equity():
    from_equity = _cashflow_case(Decimal("0"))
    from_loan = _cashflow_case(Decimal("100"))

    assert from_equity.loan_amount == Decimal("100000.00")
    assert from_loan.loan_amount == Decimal("120000.00")
    assert from_loan.financed_capex == Decimal("20000.00")

    # Financing the 20k renovation adds 6% debt service = 1200/yr = 100/month.
    assert from_equity.monthly_cashflow_before_tax == Decimal("100.00")
    assert from_loan.monthly_cashflow_before_tax == Decimal("0.00")
    # ...but frees 20k of equity.
    assert from_equity.equity_required - from_loan.equity_required == Decimal("20000.00")
    assert from_loan.is_cashflow_positive_before_tax is True


def test_max_purchase_price_for_neutral_cashflow():
    result = _cashflow_case(Decimal("100"))
    assert result.max_purchase_price_for_neutral_cashflow == Decimal("100000.00")


def test_underwriting_handles_all_equity_case_without_dscr_division_error():
    result = calculate_underwriting(
        UnderwritingInput(
            purchase_price=Decimal("180000"),
            living_area_sqm=Decimal("45"),
            monthly_cold_rent=Decimal("760"),
            market_rent_monthly=Decimal("780"),
            house_money_monthly=Decimal("180"),
            non_recoverable_costs_monthly=Decimal("55"),
            maintenance_monthly=Decimal("45"),
            vacancy_allowance_percent=Decimal("1.5"),
            property_management_monthly=Decimal("25"),
            broker_fee_percent=Decimal("0"),
            property_transfer_tax_percent=Decimal("5"),
            notary_and_land_registry_percent=Decimal("2"),
            expected_initial_capex=Decimal("5000"),
            financing_interest_rate_percent=Decimal("0"),
            amortization_rate_percent=Decimal("0"),
            loan_to_value_percent=Decimal("0"),
        )
    )

    assert result.loan_amount == Decimal("0.00")
    assert result.annual_debt_service == Decimal("0.00")
    assert result.dscr is None
    assert result.monthly_cashflow_before_tax > Decimal("0")
