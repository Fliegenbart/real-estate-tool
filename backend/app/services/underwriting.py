from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


CENT = Decimal("0.01")
PERCENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def percent(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def safe_div(numerator: Decimal, denominator: Decimal) -> Optional[Decimal]:
    if denominator == 0:
        return None
    return numerator / denominator


class TaxAssumptions(BaseModel):
    """Simplified GmbH tax assumptions. This is not tax advice."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    corporate_tax_rate_percent: Decimal = Decimal("15.0")
    solidarity_surcharge_rate_percent: Decimal = Decimal("5.5")
    trade_tax_rate_percent: Decimal = Decimal("0.0")
    assumes_extended_property_deduction: bool = True
    depreciation_rate_percent: Decimal = Decimal("2.0")
    building_share_percent: Decimal = Decimal("80.0")
    interest_deductible: bool = True

    @property
    def effective_tax_rate_percent(self) -> Decimal:
        solidarity_on_corporate_tax = self.corporate_tax_rate_percent * (
            self.solidarity_surcharge_rate_percent / Decimal("100")
        )
        trade_tax = Decimal("0") if self.assumes_extended_property_deduction else self.trade_tax_rate_percent
        return self.corporate_tax_rate_percent + solidarity_on_corporate_tax + trade_tax


class UnderwritingInput(BaseModel):
    """All key assumptions for a simple acquisition underwriting case."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    purchase_price: Decimal
    living_area_sqm: Decimal
    monthly_cold_rent: Decimal
    market_rent_monthly: Optional[Decimal] = None
    house_money_monthly: Decimal = Decimal("0")
    non_recoverable_costs_monthly: Decimal = Decimal("0")
    maintenance_monthly: Decimal = Decimal("0")
    vacancy_allowance_percent: Decimal = Decimal("2.0")
    property_management_monthly: Decimal = Decimal("30")
    broker_fee_percent: Decimal = Decimal("3.57")
    property_transfer_tax_percent: Decimal = Decimal("6.5")
    notary_and_land_registry_percent: Decimal = Decimal("2.0")
    expected_initial_capex: Decimal = Decimal("0")
    financing_interest_rate_percent: Decimal = Decimal("4.0")
    amortization_rate_percent: Decimal = Decimal("2.0")
    loan_to_value_percent: Decimal = Field(default=Decimal("75.0"), ge=0, le=100)
    equity_contribution: Optional[Decimal] = None
    tax: TaxAssumptions = Field(default_factory=TaxAssumptions)
    holding_period_years: int = 10
    exit_cap_rate_percent: Optional[Decimal] = None
    exit_value_growth_percent: Decimal = Decimal("1.0")
    target_net_yield_percent: Decimal = Decimal("4.0")


class UnderwritingResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    price_per_sqm: Decimal
    all_in_purchase_price: Decimal
    annual_cold_rent: Decimal
    gross_initial_yield_percent: Decimal
    net_operating_income: Decimal
    net_initial_yield_percent: Decimal
    annual_debt_service: Decimal
    monthly_cashflow_before_tax: Decimal
    monthly_cashflow_after_tax_approx: Decimal
    dscr: Optional[Decimal]
    loan_amount: Decimal
    equity_required: Decimal
    cash_on_cash_return_percent: Decimal
    break_even_rent_monthly: Decimal
    rent_factor: Decimal
    maximum_purchase_price_for_target_yield: Decimal
    simple_exit_value: Decimal
    simple_equity_multiple: Decimal
    simple_irr_approximation_percent: Optional[Decimal]
    annual_taxable_income_approx: Decimal
    annual_tax_approx: Decimal
    formulas: dict[str, str]
    tax_warning: str


def calculate_underwriting(data: UnderwritingInput) -> UnderwritingResult:
    acquisition_cost_percent = (
        data.broker_fee_percent
        + data.property_transfer_tax_percent
        + data.notary_and_land_registry_percent
    )
    acquisition_costs = data.purchase_price * acquisition_cost_percent / Decimal("100")
    all_in_purchase_price = data.purchase_price + acquisition_costs + data.expected_initial_capex
    annual_cold_rent = data.monthly_cold_rent * Decimal("12")
    price_per_sqm = safe_div(data.purchase_price, data.living_area_sqm) or Decimal("0")
    gross_initial_yield = safe_div(annual_cold_rent, data.purchase_price) or Decimal("0")

    vacancy_cost = annual_cold_rent * data.vacancy_allowance_percent / Decimal("100")
    annual_non_recoverable = data.non_recoverable_costs_monthly * Decimal("12")
    annual_maintenance = data.maintenance_monthly * Decimal("12")
    annual_management = data.property_management_monthly * Decimal("12")
    net_operating_income = annual_cold_rent - annual_non_recoverable - annual_maintenance - vacancy_cost - annual_management
    net_initial_yield = safe_div(net_operating_income, all_in_purchase_price) or Decimal("0")

    loan_amount = data.purchase_price * data.loan_to_value_percent / Decimal("100")
    equity_required = all_in_purchase_price - loan_amount
    annual_interest = loan_amount * data.financing_interest_rate_percent / Decimal("100")
    annual_amortization = loan_amount * data.amortization_rate_percent / Decimal("100")
    annual_debt_service = annual_interest + annual_amortization
    dscr_value = safe_div(net_operating_income, annual_debt_service)

    taxable_income = net_operating_income
    if data.tax.interest_deductible:
        taxable_income -= annual_interest
    annual_depreciation = (
        data.purchase_price
        * data.tax.building_share_percent
        / Decimal("100")
        * data.tax.depreciation_rate_percent
        / Decimal("100")
    )
    taxable_income -= annual_depreciation
    annual_tax = max(taxable_income, Decimal("0")) * data.tax.effective_tax_rate_percent / Decimal("100")

    cashflow_before_tax = net_operating_income - annual_debt_service
    cashflow_after_tax = cashflow_before_tax - annual_tax
    cash_on_cash = safe_div(cashflow_after_tax, equity_required) or Decimal("0")

    annual_operating_expenses = annual_non_recoverable + annual_maintenance + vacancy_cost + annual_management
    break_even_rent_monthly = (annual_operating_expenses + annual_debt_service) / Decimal("12")
    rent_factor = safe_div(data.purchase_price, annual_cold_rent) or Decimal("0")

    target_yield = data.target_net_yield_percent / Decimal("100")
    if target_yield > 0:
        target_all_in_price = net_operating_income / target_yield
        max_purchase = (target_all_in_price - data.expected_initial_capex) / (
            Decimal("1") + acquisition_cost_percent / Decimal("100")
        )
    else:
        max_purchase = Decimal("0")

    if data.exit_cap_rate_percent and data.exit_cap_rate_percent > 0:
        simple_exit_value = net_operating_income / (data.exit_cap_rate_percent / Decimal("100"))
    else:
        simple_exit_value = data.purchase_price * (
            Decimal("1") + data.exit_value_growth_percent / Decimal("100")
        ) ** data.holding_period_years

    remaining_loan = max(loan_amount - annual_amortization * data.holding_period_years, Decimal("0"))
    final_equity_value = simple_exit_value - remaining_loan
    total_equity_cashflows = cashflow_after_tax * data.holding_period_years + final_equity_value
    equity_multiple = safe_div(total_equity_cashflows, equity_required) or Decimal("0")
    irr = approximate_irr(
        [-equity_required]
        + [cashflow_after_tax for _ in range(max(data.holding_period_years - 1, 0))]
        + [cashflow_after_tax + final_equity_value]
    )

    return UnderwritingResult(
        price_per_sqm=money(price_per_sqm),
        all_in_purchase_price=money(all_in_purchase_price),
        annual_cold_rent=money(annual_cold_rent),
        gross_initial_yield_percent=percent(gross_initial_yield * Decimal("100")),
        net_operating_income=money(net_operating_income),
        net_initial_yield_percent=percent(net_initial_yield * Decimal("100")),
        annual_debt_service=money(annual_debt_service),
        monthly_cashflow_before_tax=money(cashflow_before_tax / Decimal("12")),
        monthly_cashflow_after_tax_approx=money(cashflow_after_tax / Decimal("12")),
        dscr=percent(dscr_value) if dscr_value is not None else None,
        loan_amount=money(loan_amount),
        equity_required=money(equity_required),
        cash_on_cash_return_percent=percent(cash_on_cash * Decimal("100")),
        break_even_rent_monthly=money(break_even_rent_monthly),
        rent_factor=percent(rent_factor),
        maximum_purchase_price_for_target_yield=money(max_purchase),
        simple_exit_value=money(simple_exit_value),
        simple_equity_multiple=percent(equity_multiple),
        simple_irr_approximation_percent=percent(irr * Decimal("100")) if irr is not None else None,
        annual_taxable_income_approx=money(taxable_income),
        annual_tax_approx=money(annual_tax),
        formulas={
            "all_in_purchase_price": "purchase_price + broker_fee + transfer_tax + notary_land_registry + initial_capex",
            "net_operating_income": "annual_cold_rent - non_recoverable_costs - maintenance - vacancy_allowance - property_management",
            "annual_debt_service": "loan_amount * (interest_rate + amortization_rate)",
            "dscr": "net_operating_income / annual_debt_service",
            "maximum_purchase_price_for_target_yield": "target NOI price adjusted down for capex and acquisition cost percentages",
            "tax": "simplified GmbH tax on positive taxable income after interest and AfA assumptions",
        },
        tax_warning="Tax calculation is simplified and must be reviewed by a Steuerberater.",
    )


def approximate_irr(cashflows: list[Decimal]) -> Optional[Decimal]:
    if not cashflows or not any(c < 0 for c in cashflows) or not any(c > 0 for c in cashflows):
        return None

    low = Decimal("-0.95")
    high = Decimal("1.00")

    def npv(rate: Decimal) -> Decimal:
        total = Decimal("0")
        for year, cashflow in enumerate(cashflows):
            total += cashflow / ((Decimal("1") + rate) ** year)
        return total

    low_npv = npv(low)
    high_npv = npv(high)
    if low_npv * high_npv > 0:
        return None

    for _ in range(80):
        mid = (low + high) / Decimal("2")
        mid_npv = npv(mid)
        if abs(mid_npv) < Decimal("0.0001"):
            return mid
        if low_npv * mid_npv <= 0:
            high = mid
            high_npv = mid_npv
        else:
            low = mid
            low_npv = mid_npv
    return (low + high) / Decimal("2")
