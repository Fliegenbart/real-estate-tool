from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def percent(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


class RenovationPlanInput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    purchase_price: Decimal
    current_cold_rent_monthly: Decimal
    current_loan_amount: Decimal = Decimal("0")
    planned_capex: Decimal = Field(default=Decimal("0"), ge=0)
    target_cold_rent_monthly: Decimal = Field(default=Decimal("0"), ge=0)
    valuation_yield_percent: Decimal = Field(default=Decimal("4.5"), gt=0)
    refinance_ltv_percent: Decimal = Field(default=Decimal("75"), gt=0, le=100)
    current_energy_class: Optional[str] = None
    target_energy_class: Optional[str] = None


class RenovationPlanResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    planned_capex: Decimal
    current_cold_rent_monthly: Decimal
    target_cold_rent_monthly: Decimal
    annual_rent_uplift: Decimal
    implied_value_uplift_from_rent: Decimal
    post_renovation_value: Decimal
    current_loan_amount: Decimal
    refinanceable_debt_after_renovation: Decimal
    potential_equity_released: Decimal
    net_equity_still_bound_after_refinance: Decimal
    simple_roi_percent: Decimal
    value_add_multiple: Decimal
    kfw_hint: Optional[str]
    recommendation: Literal["strong_value_add", "possible_value_add", "weak_value_add"]
    warnings: list[str]


def analyze_renovation_plan(data: RenovationPlanInput) -> RenovationPlanResult:
    warnings: list[str] = []
    monthly_uplift = max(data.target_cold_rent_monthly - data.current_cold_rent_monthly, Decimal("0"))
    annual_uplift = monthly_uplift * Decimal("12")
    implied_value_uplift = annual_uplift / (data.valuation_yield_percent / Decimal("100"))
    post_value = data.purchase_price + implied_value_uplift
    refinanceable_debt = post_value * data.refinance_ltv_percent / Decimal("100")
    equity_release = max(refinanceable_debt - data.current_loan_amount, Decimal("0"))
    net_equity_bound = max(data.planned_capex - equity_release, Decimal("0"))
    roi = (annual_uplift / data.planned_capex * Decimal("100")) if data.planned_capex > 0 else Decimal("0")
    multiple = (implied_value_uplift / data.planned_capex) if data.planned_capex > 0 else Decimal("0")

    if annual_uplift <= 0:
        warnings.append("Keine Mietsteigerung angesetzt - Wertsteigerung kommt so nur aus Energie/Marktannahmen.")
    if data.target_cold_rent_monthly < data.current_cold_rent_monthly:
        warnings.append("Zielmiete liegt unter aktueller Miete.")
    if multiple < Decimal("1"):
        warnings.append("Wertsteigerung aus Miete deckt die Sanierungskosten nicht.")
    if equity_release < data.planned_capex:
        warnings.append("Refinanzierung setzt voraussichtlich nicht das komplette Sanierungskapital frei.")

    recommendation: Literal["strong_value_add", "possible_value_add", "weak_value_add"]
    if multiple >= Decimal("1.8") and roi >= Decimal("8") and equity_release >= data.planned_capex:
        recommendation = "strong_value_add"
    elif multiple >= Decimal("1.0") and roi >= Decimal("4"):
        recommendation = "possible_value_add"
    else:
        recommendation = "weak_value_add"

    kfw_hint = None
    energy_class = (data.current_energy_class or "").upper()
    if energy_class in {"F", "G", "H"} or data.target_energy_class:
        kfw_hint = "BEG/KfW mit Energieeffizienz-Experten pruefen; Foerderung ist nicht automatisch sicher."

    return RenovationPlanResult(
        planned_capex=money(data.planned_capex),
        current_cold_rent_monthly=money(data.current_cold_rent_monthly),
        target_cold_rent_monthly=money(data.target_cold_rent_monthly),
        annual_rent_uplift=money(annual_uplift),
        implied_value_uplift_from_rent=money(implied_value_uplift),
        post_renovation_value=money(post_value),
        current_loan_amount=money(data.current_loan_amount),
        refinanceable_debt_after_renovation=money(refinanceable_debt),
        potential_equity_released=money(equity_release),
        net_equity_still_bound_after_refinance=money(net_equity_bound),
        simple_roi_percent=percent(roi),
        value_add_multiple=percent(multiple),
        kfw_hint=kfw_hint,
        recommendation=recommendation,
        warnings=warnings,
    )
