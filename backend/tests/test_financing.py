from decimal import Decimal

from app.services.financing import (
    CapitalStackInput,
    GiftPropertyInput,
    Tranche,
    analyze_capital_stack,
    compare_gift_property_strategies,
)


def test_capital_stack_blends_tranches_and_quantifies_intercompany_leakage():
    result = analyze_capital_stack(
        CapitalStackInput(
            name="Bank + GmbH-Darlehen",
            all_in_purchase_price=Decimal("200000"),
            net_operating_income=Decimal("9000"),
            tranches=[
                Tranche(kind="bank_loan", amount=Decimal("140000"), interest_rate_percent=Decimal("4.0"), amortization_rate_percent=Decimal("2.0")),
                Tranche(kind="shareholder_loan", label="DW Marketing GmbH", amount=Decimal("40000"), interest_rate_percent=Decimal("3.0"), amortization_rate_percent=Decimal("0")),
                Tranche(kind="equity", amount=Decimal("20000")),
            ],
            annual_depreciation=Decimal("3000"),
        )
    )

    assert result.total_debt == Decimal("180000.00")
    assert result.total_equity == Decimal("20000.00")
    assert result.funding_gap == Decimal("0.00")
    assert result.annual_debt_service == Decimal("9600.00")
    assert result.intercompany_interest_annual == Decimal("1200.00")
    # 1200 EUR interest x (30% - 15.825%) = 170.10 EUR net group tax cost
    assert result.intercompany_tax_leakage_annual == Decimal("170.10")
    assert result.fremdvergleich_checklist
    assert result.intercompany_note is not None
    assert any("DSCR" in warning for warning in result.warnings)


def test_capital_stack_reports_funding_gap():
    result = analyze_capital_stack(
        CapitalStackInput(
            all_in_purchase_price=Decimal("150000"),
            net_operating_income=Decimal("7000"),
            tranches=[Tranche(kind="bank_loan", amount=Decimal("100000"), interest_rate_percent=Decimal("4"), amortization_rate_percent=Decimal("2"))],
        )
    )
    assert result.funding_gap == Decimal("50000.00")
    assert any("Finanzierungsluecke" in warning for warning in result.warnings)
    assert result.fremdvergleich_checklist == []


def test_gift_property_comparison_quantifies_step_up_and_warns_on_gift_routing():
    comparison = compare_gift_property_strategies(
        GiftPropertyInput(
            market_value=Decimal("80000"),
            achievable_cold_rent_monthly=Decimal("420"),
            non_recoverable_costs_monthly=Decimal("60"),
        )
    )

    assert "PERSOENLICH" in comparison.prerequisite_warning
    codes = [strategy.code for strategy in comparison.strategies]
    assert codes == ["keep_private", "sell_to_gmbh", "contribute_to_gmbh", "pledge_as_collateral"]

    sell = next(s for s in comparison.strategies if s.code == "sell_to_gmbh")
    # GrESt Sachsen 5.5% + Notar 1.5% on 80k = 5600
    assert sell.one_time_costs_eur == Decimal("5600.00")
    # New AfA: 80000 x 80% x 2% = 1280/year
    assert comparison.assumptions["new_afa_annual"] == 1280.0
    assert sell.liquidity_unlocked_eur == Decimal("80000.00")
    assert sell.steuerberater_questions

    keep = next(s for s in comparison.strategies if s.code == "keep_private")
    # GmbH route must tax the rent more lightly than the private route
    assert sell.annual_tax_on_rent_eur < keep.annual_tax_on_rent_eur
