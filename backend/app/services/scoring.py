from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


def clamp(value: float, lower: float = 0, upper: float = 100) -> int:
    return int(round(max(lower, min(upper, value))))


class LocationMetricsInput(BaseModel):
    population_trend_score: int = 60
    vacancy_risk_score: int = 60
    purchasing_power_score: int = 60
    public_transport_score: int = 60
    employer_access_score: int = 60
    micro_location_score: int = 60
    noise_risk_score: int = 60
    flood_risk_score: int = 60


class ScoreConfig(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    minimum_dscr: Decimal = Decimal("1.10")
    high_non_recoverable_costs_monthly: Decimal = Decimal("220")
    material_overpricing_threshold_percent: Decimal = Decimal("15")


class DealScoringInput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    gross_initial_yield_percent: Optional[Decimal] = None
    net_initial_yield_percent: Optional[Decimal] = None
    monthly_cashflow_before_tax: Optional[Decimal] = None
    dscr: Optional[Decimal] = None
    price_per_sqm: Optional[Decimal] = None
    market_price_per_sqm: Optional[Decimal] = None
    house_money_monthly: Optional[Decimal] = None
    non_recoverable_costs_monthly: Optional[Decimal] = None
    energy_class: Optional[str] = None
    expected_initial_capex: Optional[Decimal] = None
    maintenance_reserve_weg: Optional[Decimal] = None
    address_complete: bool = False
    is_rented: bool = False
    current_rent_per_sqm: Optional[Decimal] = None
    legally_plausible_target_rent_per_sqm: Optional[Decimal] = None
    location: LocationMetricsInput = LocationMetricsInput()


class DealScoreResult(BaseModel):
    total_score: int
    category_scores: dict[str, int]
    explanation: str
    positive_factors: list[str]
    negative_factors: list[str]
    red_flags: list[str]
    next_recommended_action: str


def score_deal(data: DealScoringInput, config: ScoreConfig = ScoreConfig()) -> DealScoreResult:
    red_flags = find_red_flags(data, config)
    positive_factors: list[str] = []
    negative_factors: list[str] = []

    gross = float(data.gross_initial_yield_percent or 0)
    net = float(data.net_initial_yield_percent or 0)
    cashflow = float(data.monthly_cashflow_before_tax or 0)
    dscr = float(data.dscr or 0)

    return_cashflow = clamp((gross / 6.0) * 30 + (net / 4.5) * 35 + min(max(cashflow, -250), 250) / 250 * 15 + (dscr / 1.35) * 20)
    if cashflow > 0:
        positive_factors.append("Positive monthly cashflow in base case.")
    else:
        negative_factors.append("Base case cashflow is negative.")

    price_score = 50
    if data.price_per_sqm and data.market_price_per_sqm and data.market_price_per_sqm > 0:
        ratio = float(data.price_per_sqm / data.market_price_per_sqm)
        price_score = clamp(120 - ratio * 70)
        if ratio < 0.95:
            positive_factors.append("Purchase price per sqm is below the market benchmark.")
        elif ratio > 1.15:
            negative_factors.append("Purchase price is materially above the model market benchmark.")
    else:
        negative_factors.append("Market price benchmark is missing.")

    loc_values = data.location.model_dump().values()
    location_score = clamp(sum(loc_values) / len(data.location.model_dump()))
    if location_score >= 75:
        positive_factors.append("Location metrics indicate solid demand and infrastructure.")
    elif location_score < 55:
        negative_factors.append("Location metrics are weak or incomplete.")

    object_quality = object_quality_score(data)
    if data.energy_class in {"A", "B", "C"}:
        positive_factors.append("Energy class does not indicate immediate high energy risk.")
    if data.energy_class in {"F", "G", "H"}:
        negative_factors.append("Energy class indicates elevated capex or letting risk.")

    risk_score = clamp(100 - len(red_flags) * 12)
    if red_flags:
        negative_factors.append(f"{len(red_flags)} hard red flag(s) need review.")

    category_scores = {
        "return_and_cashflow": return_cashflow,
        "price_attractiveness": price_score,
        "location_and_demand": location_score,
        "object_quality": object_quality,
        "legal_regulatory_technical_risk": risk_score,
    }
    weighted = (
        return_cashflow * 0.35
        + price_score * 0.20
        + location_score * 0.20
        + object_quality * 0.15
        + risk_score * 0.10
    )
    total_score = clamp(weighted)

    if any(flag in red_flags for flag in {"negative_cashflow_base_case", "dscr_below_threshold", "rented_above_legally_plausible_rent"}):
        next_action = "Reject or renegotiate materially before spending diligence budget."
    elif total_score >= 75:
        next_action = "Underwrite further and request full WEG/rent/energy documents."
    elif total_score >= 60:
        next_action = "Request missing documents and validate rent, WEG, energy, and financing assumptions."
    else:
        next_action = "Keep on watchlist only if price, rent, or capex assumptions improve."

    explanation = (
        "Score combines return/cashflow (35%), price attractiveness (20%), "
        "location/demand (20%), object quality (15%), and legal/technical risk (10%). "
        "Hard red flags are listed separately and can override the next action."
    )

    return DealScoreResult(
        total_score=total_score,
        category_scores=category_scores,
        explanation=explanation,
        positive_factors=positive_factors,
        negative_factors=negative_factors,
        red_flags=red_flags,
        next_recommended_action=next_action,
    )


def find_red_flags(data: DealScoringInput, config: ScoreConfig) -> list[str]:
    flags: list[str] = []
    if data.house_money_monthly is None:
        flags.append("missing_house_money")
    if not data.energy_class:
        flags.append("missing_energy_data")
    if data.monthly_cashflow_before_tax is not None and data.monthly_cashflow_before_tax < 0:
        flags.append("negative_cashflow_base_case")
    if data.dscr is not None and data.dscr < config.minimum_dscr:
        flags.append("dscr_below_threshold")
    if (
        data.non_recoverable_costs_monthly is not None
        and data.non_recoverable_costs_monthly > config.high_non_recoverable_costs_monthly
    ):
        flags.append("very_high_non_recoverable_costs")
    if (
        data.energy_class
        and data.energy_class.upper() in {"F", "G", "H"}
        and (data.expected_initial_capex is None or data.expected_initial_capex < Decimal("10000"))
    ):
        flags.append("poor_energy_class_without_capex_buffer")
    if data.maintenance_reserve_weg is None:
        flags.append("missing_weg_reserve")
    if (
        data.is_rented
        and data.current_rent_per_sqm is not None
        and data.legally_plausible_target_rent_per_sqm is not None
        and data.current_rent_per_sqm > data.legally_plausible_target_rent_per_sqm
    ):
        flags.append("rented_above_legally_plausible_rent")
    if data.price_per_sqm and data.market_price_per_sqm and data.market_price_per_sqm > 0:
        overpricing = (data.price_per_sqm / data.market_price_per_sqm - Decimal("1")) * Decimal("100")
        if overpricing > config.material_overpricing_threshold_percent:
            flags.append("purchase_price_materially_above_model_fair_value")
    if not data.address_complete:
        flags.append("missing_address_location_data")
    return flags


def object_quality_score(data: DealScoringInput) -> int:
    energy_scores = {
        "A+": 95,
        "A": 92,
        "B": 84,
        "C": 76,
        "D": 65,
        "E": 52,
        "F": 38,
        "G": 25,
        "H": 15,
    }
    score = energy_scores.get((data.energy_class or "").upper(), 45)
    if data.maintenance_reserve_weg is not None:
        score += 10
    if data.house_money_monthly is not None:
        score += 5
    if data.expected_initial_capex and data.expected_initial_capex > 0:
        score += 5
    return clamp(score)
