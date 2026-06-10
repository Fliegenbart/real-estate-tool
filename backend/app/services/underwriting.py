from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


CENT = Decimal("0.01")
PERCENT = Decimal("0.01")

# Residual-debt rule of thumb: at the end of the fixed-interest period the
# remaining loan should not exceed 150 monthly cold rents (annual rent = 8% of
# debt -> carries ~5% refi interest + 1% amortization + tax + reserve).
RESIDUAL_DEBT_TARGET_FACTOR = Decimal("150")
RESIDUAL_DEBT_AMBER_FACTOR = Decimal("170")


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
    interest_fixation_years: int = 10
    refi_stress_interest_delta_percent: Decimal = Decimal("2.0")
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
    amortization_schedule: list[dict]
    remaining_loan_after_holding: Decimal
    remaining_loan_at_fixation_end: Decimal
    residual_debt_factor: Optional[Decimal]
    residual_debt_factor_rating: Optional[str]
    amortization_gap_to_target_factor: Optional[Decimal]
    stressed_interest_rate_percent: Optional[Decimal]
    stressed_annual_debt_service: Optional[Decimal]
    stressed_monthly_cashflow_before_tax: Optional[Decimal]
    stressed_dscr: Optional[Decimal]
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

    schedule = build_amortization_schedule(
        loan_amount,
        data.financing_interest_rate_percent,
        data.amortization_rate_percent,
        max(data.holding_period_years, data.interest_fixation_years),
    )

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

    holding_rows = schedule[: data.holding_period_years]
    remaining_loan = holding_rows[-1]["remaining"] if holding_rows else loan_amount
    final_equity_value = simple_exit_value - remaining_loan

    # Year-by-year after-tax cashflows: interest declines along the annuity
    # schedule, so taxable income and cash taxes rise over the holding period.
    yearly_after_tax_cashflows: list[Decimal] = []
    for row in holding_rows:
        year_taxable = net_operating_income - annual_depreciation
        if data.tax.interest_deductible:
            year_taxable -= row["interest"]
        year_tax = max(year_taxable, Decimal("0")) * data.tax.effective_tax_rate_percent / Decimal("100")
        yearly_after_tax_cashflows.append(net_operating_income - row["payment"] - year_tax)
    if not yearly_after_tax_cashflows:
        yearly_after_tax_cashflows = [cashflow_after_tax for _ in range(max(data.holding_period_years, 1))]

    total_equity_cashflows = sum(yearly_after_tax_cashflows) + final_equity_value
    equity_multiple = safe_div(total_equity_cashflows, equity_required) or Decimal("0")
    irr = approximate_irr(
        [-equity_required]
        + yearly_after_tax_cashflows[:-1]
        + [yearly_after_tax_cashflows[-1] + final_equity_value]
    )

    # Refinancing stress: remaining loan at the end of the fixed-interest
    # period is refinanced at the stressed rate with unchanged amortization.
    fixation_rows = schedule[: data.interest_fixation_years]
    remaining_at_refi = fixation_rows[-1]["remaining"] if fixation_rows else loan_amount

    stressed_rate: Optional[Decimal] = None
    stressed_debt_service: Optional[Decimal] = None
    stressed_cashflow_monthly: Optional[Decimal] = None
    stressed_dscr: Optional[Decimal] = None
    if remaining_at_refi > 0 and data.interest_fixation_years > 0:
        stressed_rate = data.financing_interest_rate_percent + data.refi_stress_interest_delta_percent
        stressed_debt_service = remaining_at_refi * (
            stressed_rate + data.amortization_rate_percent
        ) / Decimal("100")
        stressed_cashflow_monthly = (net_operating_income - stressed_debt_service) / Decimal("12")
        stressed_dscr = safe_div(net_operating_income, stressed_debt_service)

    # Residual-debt factor: remaining loan at fixation end in monthly cold rents.
    residual_debt_factor: Optional[Decimal] = None
    residual_debt_rating: Optional[str] = None
    amortization_gap: Optional[Decimal] = None
    if data.monthly_cold_rent > 0:
        residual_debt_factor = remaining_at_refi / data.monthly_cold_rent
        if residual_debt_factor <= RESIDUAL_DEBT_TARGET_FACTOR:
            residual_debt_rating = "green"
        elif residual_debt_factor <= RESIDUAL_DEBT_AMBER_FACTOR:
            residual_debt_rating = "amber"
        else:
            residual_debt_rating = "red"
        amortization_gap = max(
            remaining_at_refi - RESIDUAL_DEBT_TARGET_FACTOR * data.monthly_cold_rent,
            Decimal("0"),
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
        amortization_schedule=[
            {
                "year": row["year"],
                "payment": money(row["payment"]),
                "interest": money(row["interest"]),
                "principal": money(row["principal"]),
                "remaining": money(row["remaining"]),
            }
            for row in holding_rows
        ],
        remaining_loan_after_holding=money(remaining_loan),
        remaining_loan_at_fixation_end=money(remaining_at_refi),
        residual_debt_factor=percent(residual_debt_factor) if residual_debt_factor is not None else None,
        residual_debt_factor_rating=residual_debt_rating,
        amortization_gap_to_target_factor=money(amortization_gap) if amortization_gap is not None else None,
        stressed_interest_rate_percent=percent(stressed_rate) if stressed_rate is not None else None,
        stressed_annual_debt_service=money(stressed_debt_service) if stressed_debt_service is not None else None,
        stressed_monthly_cashflow_before_tax=money(stressed_cashflow_monthly)
        if stressed_cashflow_monthly is not None
        else None,
        stressed_dscr=percent(stressed_dscr) if stressed_dscr is not None else None,
        formulas={
            "all_in_purchase_price": "purchase_price + broker_fee + transfer_tax + notary_land_registry + initial_capex",
            "net_operating_income": "annual_cold_rent - non_recoverable_costs - maintenance - vacancy_allowance - property_management",
            "annual_debt_service": "loan_amount * (interest_rate + amortization_rate)",
            "dscr": "net_operating_income / annual_debt_service",
            "maximum_purchase_price_for_target_yield": "target NOI price adjusted down for capex and acquisition cost percentages",
            "tax": "simplified GmbH tax on positive taxable income after interest and AfA assumptions",
            "residual_debt_factor": "remaining loan at end of interest fixation / monthly cold rent (target <= 150, amber <= 170)",
        },
        tax_warning="Tax calculation is simplified and must be reviewed by a Steuerberater.",
    )


def build_amortization_schedule(
    loan_amount: Decimal,
    interest_rate_percent: Decimal,
    amortization_rate_percent: Decimal,
    years: int,
) -> list[dict]:
    """German annuity loan: constant payment, declining interest share."""
    rows: list[dict] = []
    if loan_amount <= 0 or years <= 0:
        return rows
    interest_rate = interest_rate_percent / Decimal("100")
    annual_payment = loan_amount * (interest_rate_percent + amortization_rate_percent) / Decimal("100")
    remaining = loan_amount
    for year in range(1, years + 1):
        interest = remaining * interest_rate
        principal = max(min(annual_payment - interest, remaining), Decimal("0"))
        payment = interest + principal
        remaining = remaining - principal
        rows.append(
            {
                "year": year,
                "payment": payment,
                "interest": interest,
                "principal": principal,
                "remaining": remaining,
            }
        )
    return rows


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
