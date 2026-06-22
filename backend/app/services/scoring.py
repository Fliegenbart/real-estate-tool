from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


MICRO_LOCATION_WEIGHTS = {
    "transit_access_score": 0.25,
    "daily_needs_score": 0.25,
    "demand_anchor_score": 0.20,
    "leisure_quality_score": 0.10,
    "short_term_rental_score": 0.05,
    "nuisance_resilience_score": 0.15,
}

DEAL_LOCATION_SCORE_FIELDS = [
    "population_trend_score",
    "vacancy_risk_score",
    "purchasing_power_score",
    "public_transport_score",
    "employer_access_score",
    "micro_location_score",
    "urban_environment_quality_score",
    "noise_risk_score",
    "flood_risk_score",
]


def clamp(value: float, lower: float = 0, upper: float = 100) -> int:
    return int(round(max(lower, min(upper, value))))


class LocationMetricsInput(BaseModel):
    population_trend_score: int = 60
    vacancy_risk_score: int = 60
    purchasing_power_score: int = 60
    public_transport_score: int = 60
    employer_access_score: int = 60
    micro_location_score: int = 60
    transit_access_score: int = 60
    daily_needs_score: int = 60
    demand_anchor_score: int = 60
    leisure_quality_score: int = 60
    short_term_rental_score: int = 60
    nuisance_resilience_score: int = 60
    urban_environment_quality_score: Optional[int] = None
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


class RegionOutlookResult(BaseModel):
    total_score: int
    category_scores: dict[str, int]
    thesis: str
    positive_factors: list[str]
    caution_factors: list[str]
    key_metrics: list[dict[str, str | int]]
    micro_location_factors: list[dict[str, str | int]]
    target_group_profiles: list[dict[str, Any]]
    data_quality_notes: list[str]
    next_recommended_action: str


def score_region_outlook(location: LocationMetricsInput, source: str = "mock/manual") -> RegionOutlookResult:
    values = normalized_location_values(location)
    category_scores = {
        "growth_and_demand": weighted_score(
            values,
            {
                "population_trend_score": 0.35,
                "vacancy_risk_score": 0.20,
                "employer_access_score": 0.20,
                "public_transport_score": 0.15,
                "micro_location_score": 0.10,
            },
        ),
        "jobs_and_income": weighted_score(
            values,
            {
                "employer_access_score": 0.35,
                "purchasing_power_score": 0.35,
                "public_transport_score": 0.15,
                "population_trend_score": 0.15,
            },
        ),
        "housing_tightness": weighted_score(
            values,
            {
                "vacancy_risk_score": 0.45,
                "population_trend_score": 0.30,
                "micro_location_score": 0.15,
                "purchasing_power_score": 0.10,
            },
        ),
        "connectivity_and_micro_location": weighted_score(
            values,
            {
                "public_transport_score": 0.35,
                "employer_access_score": 0.25,
                "micro_location_score": 0.25,
                "noise_risk_score": 0.15,
            },
        ),
        "urban_environment_quality": weighted_score(
            values,
            {
                "urban_environment_quality_score": 0.50,
                "micro_location_score": 0.20,
                "vacancy_risk_score": 0.15,
                "noise_risk_score": 0.15,
            },
        ),
        "risk_resilience": weighted_score(
            values,
            {
                "flood_risk_score": 0.45,
                "noise_risk_score": 0.25,
                "micro_location_score": 0.15,
                "vacancy_risk_score": 0.15,
            },
        ),
    }
    total_score = weighted_score(
        category_scores,
        {
            "growth_and_demand": 0.30,
            "jobs_and_income": 0.23,
            "housing_tightness": 0.17,
            "connectivity_and_micro_location": 0.15,
            "urban_environment_quality": 0.10,
            "risk_resilience": 0.05,
        },
    )

    positive_factors: list[str] = []
    caution_factors: list[str] = []
    data_quality_notes: list[str] = []

    if values["population_trend_score"] >= 75:
        positive_factors.append("Population trend supports long-term housing demand.")
    elif values["population_trend_score"] < 55:
        caution_factors.append("Weak population trend can limit long-term demand.")

    if values["employer_access_score"] >= 75 and values["public_transport_score"] >= 75:
        positive_factors.append("Jobs access and transport connectivity support future demand.")
    elif values["employer_access_score"] < 55:
        caution_factors.append("Weak employer access reduces the regional growth case.")

    if values["purchasing_power_score"] >= 75:
        positive_factors.append("Purchasing power suggests households can absorb rent or price growth.")
    elif values["purchasing_power_score"] < 55:
        caution_factors.append("Weak purchasing power can cap rent and resale growth.")

    if values["vacancy_risk_score"] >= 75:
        positive_factors.append("Vacancy signal suggests housing demand is not only theoretical.")
    elif values["vacancy_risk_score"] < 55:
        caution_factors.append("Vacancy signal is weak and needs external validation.")

    if values["micro_location_score"] >= 75:
        positive_factors.append("Micro-location supports liquidity and exit optionality.")
    elif values["micro_location_score"] < 55:
        caution_factors.append("Micro-location is not yet strong enough for a growth premium.")

    if (
        values["transit_access_score"] >= 75
        and values["daily_needs_score"] >= 75
        and values["demand_anchor_score"] >= 75
    ):
        positive_factors.append("Transit, daily needs, and local demand anchors make the micro-location more liquid.")
    if values["short_term_rental_score"] >= 75:
        positive_factors.append("Short-term rental demand can be optional upside, subject to local rules.")
    elif values["short_term_rental_score"] < 45:
        caution_factors.append("Short-term rental demand is weak; do not underwrite Airbnb upside.")
    if values["nuisance_resilience_score"] < 55:
        caution_factors.append("Street-level nuisance factors weaken the micro-location despite nearby amenities.")

    if values["urban_environment_quality_score"] >= 75:
        positive_factors.append("Urban environment quality supports a stable, investable neighborhood thesis.")
    elif values["urban_environment_quality_score"] < 55:
        caution_factors.append("Urban environment quality is weak and should be validated before assuming neighborhood upside.")

    if values["noise_risk_score"] < 55 or values["flood_risk_score"] < 55:
        caution_factors.append("Noise or flood risk weakens the resilience of the location thesis.")

    source_lower = source.lower()
    if "mock" in source_lower or "manual" in source_lower:
        data_quality_notes.append(
            "Mock/manual location inputs: validate with official population, jobs, income, vacancy, construction, and risk data before bidding."
        )
    else:
        data_quality_notes.append("Location inputs are treated as reviewed external or official data.")
    data_quality_notes.append(
        "Urban environment quality uses objective neighborhood signals only; nationality, ethnicity, religion, or origin are not used."
    )
    data_quality_notes.append(
        "Short-term rental signals are optional upside only; validate local rules before treating Airbnb or tourism demand as investment evidence."
    )

    if total_score >= 75:
        thesis = "Strong positive regional development setup."
        next_action = "Prioritize in sourcing; validate official data before paying a growth premium."
    elif total_score >= 65:
        thesis = "Promising regional outlook with validation needed."
        next_action = "Keep active; compare with nearby districts and verify the main demand indicators."
    elif total_score >= 50:
        thesis = "Mixed regional outlook."
        next_action = "Use only with price discount or specific micro-location evidence."
    else:
        thesis = "Weak regional outlook."
        next_action = "Do not pay for a growth story until external data improves."

    key_metrics = [
        {
            "name": name,
            "value": int(value),
            "interpretation": metric_interpretation(name, int(value)),
        }
        for name, value in values.items()
    ]

    return RegionOutlookResult(
        total_score=total_score,
        category_scores=category_scores,
        thesis=thesis,
        positive_factors=positive_factors,
        caution_factors=caution_factors,
        key_metrics=key_metrics,
        micro_location_factors=micro_location_factor_payload(values),
        target_group_profiles=target_group_profile_payload(values),
        data_quality_notes=data_quality_notes,
        next_recommended_action=next_action,
    )


def weighted_score(values: dict[str, int], weights: dict[str, float]) -> int:
    weighted = sum(float(values[key]) * weight for key, weight in weights.items())
    return clamp(weighted / sum(weights.values()))


def normalized_location_values(location: LocationMetricsInput) -> dict[str, int]:
    values = location.model_dump()
    if any(int(values[key] or 60) != 60 for key in MICRO_LOCATION_WEIGHTS):
        values["micro_location_score"] = derive_micro_location_score(values)
    if values["urban_environment_quality_score"] is None:
        values["urban_environment_quality_score"] = derive_urban_environment_quality_score(values)
    return {key: int(value) for key, value in values.items() if value is not None}


def derive_micro_location_score(values: dict[str, Optional[int]]) -> int:
    return weighted_score(
        {key: int(values[key] or 60) for key in MICRO_LOCATION_WEIGHTS},
        MICRO_LOCATION_WEIGHTS,
    )


def derive_urban_environment_quality_score(values: dict[str, Optional[int]]) -> int:
    return weighted_score(
        {
            "micro_location_score": int(values["micro_location_score"] or 60),
            "vacancy_risk_score": int(values["vacancy_risk_score"] or 60),
            "public_transport_score": int(values["public_transport_score"] or 60),
            "noise_risk_score": int(values["noise_risk_score"] or 60),
            "flood_risk_score": int(values["flood_risk_score"] or 60),
        },
        {
            "micro_location_score": 0.35,
            "vacancy_risk_score": 0.20,
            "public_transport_score": 0.20,
            "noise_risk_score": 0.15,
            "flood_risk_score": 0.10,
        },
    )


def metric_interpretation(name: str, value: int) -> str:
    if value >= 75:
        direction = "strong"
    elif value >= 60:
        direction = "solid"
    elif value >= 50:
        direction = "mixed"
    else:
        direction = "weak"
    labels = {
        "population_trend_score": "population and household demand",
        "vacancy_risk_score": "vacancy and market tightness",
        "purchasing_power_score": "income and affordability strength",
        "public_transport_score": "transport connectivity",
        "employer_access_score": "jobs access",
        "micro_location_score": "street-level location quality",
        "transit_access_score": "transit access",
        "daily_needs_score": "everyday amenities",
        "demand_anchor_score": "demand anchors",
        "leisure_quality_score": "leisure and green quality",
        "short_term_rental_score": "short-term rental optionality",
        "nuisance_resilience_score": "nuisance resilience",
        "urban_environment_quality_score": "objective neighborhood quality",
        "noise_risk_score": "noise resilience",
        "flood_risk_score": "flood resilience",
    }
    return f"{direction} signal for {labels.get(name, name.replace('_', ' '))}"


def micro_location_factor_payload(values: dict[str, int]) -> list[dict[str, str | int]]:
    return [
        {
            "name": name,
            "value": int(values[name]),
            "weight": int(weight * 100),
            "interpretation": metric_interpretation(name, int(values[name])),
        }
        for name, weight in MICRO_LOCATION_WEIGHTS.items()
    ]


def target_group_profile_payload(values: dict[str, int]) -> list[dict[str, Any]]:
    profiles = [
        target_group_profile(
            "commuter",
            "Pendler",
            weighted_score(
                values,
                {
                    "transit_access_score": 0.45,
                    "employer_access_score": 0.25,
                    "demand_anchor_score": 0.20,
                    "nuisance_resilience_score": 0.10,
                },
            ),
            reasons_for_profile(
                values,
                [
                    ("transit_access_score", "Bahnhof/U-Bahn/S-Bahn und Taktung stuetzen Pendlernachfrage."),
                    ("employer_access_score", "Arbeitsplatznaehe macht die Lage fuer Berufspendler fluessiger."),
                    ("demand_anchor_score", "Messe, Uni, Klinik oder grosse Arbeitgeber liefern Nachfrage-Anker."),
                ],
            ),
            nuisance_risks(values),
            "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen.",
        ),
        target_group_profile(
            "family",
            "Familien",
            weighted_score(
                values,
                {
                    "daily_needs_score": 0.35,
                    "leisure_quality_score": 0.20,
                    "vacancy_risk_score": 0.20,
                    "nuisance_resilience_score": 0.15,
                    "flood_risk_score": 0.10,
                },
            ),
            reasons_for_profile(
                values,
                [
                    ("daily_needs_score", "Schule, Kita, Arzt und Einkauf sind fuer Familien alltagsrelevant."),
                    ("leisure_quality_score", "Parks und Freizeitangebote erhoehen die Wohnqualitaet."),
                    ("vacancy_risk_score", "Niedriger Leerstand spricht fuer stabile Wohnnachfrage."),
                ],
            ),
            nuisance_risks(values),
            "Schul-/Kita-Lage, Laerm und sichere Wege vor Gebot pruefen.",
        ),
        target_group_profile(
            "student",
            "Studierende",
            weighted_score(
                values,
                {
                    "demand_anchor_score": 0.35,
                    "transit_access_score": 0.35,
                    "daily_needs_score": 0.15,
                    "leisure_quality_score": 0.15,
                },
            ),
            reasons_for_profile(
                values,
                [
                    ("demand_anchor_score", "Uni, Klinik, Messe oder grosse Arbeitgeber koennen junge Nachfrage stuetzen."),
                    ("transit_access_score", "Guter OePNV macht kleinere Wohnungen leichter vermietbar."),
                    ("daily_needs_score", "Alltagsversorgung reduziert praktische Vermietungshuerden."),
                ],
            ),
            nuisance_risks(values),
            "Wohnungsgroesse, WG-Tauglichkeit und lokale Mietregeln pruefen.",
        ),
        target_group_profile(
            "short_term_guest",
            "Kurzzeitgaeste",
            weighted_score(
                values,
                {
                    "short_term_rental_score": 0.35,
                    "transit_access_score": 0.20,
                    "demand_anchor_score": 0.20,
                    "leisure_quality_score": 0.15,
                    "nuisance_resilience_score": 0.10,
                },
            ),
            reasons_for_profile(
                values,
                [
                    ("short_term_rental_score", "Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."),
                    ("demand_anchor_score", "Messe, Klinik, Uni oder Arbeitgeber sind relevante Kurzaufenthaltsgruende."),
                    ("leisure_quality_score", "Freizeit, Gastro und Kultur staerken Besucherattraktivitaet."),
                ],
            ),
            ["Airbnb nur als optionalen Bonus rechnen; Rechtslage und WEG-Regeln koennen den Nutzen stark begrenzen."]
            + nuisance_risks(values),
            "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.",
        ),
    ]
    return sorted(profiles, key=lambda profile: int(profile["score"]), reverse=True)


def target_group_profile(
    name: str,
    label: str,
    score: int,
    reasons: list[str],
    risks: list[str],
    next_check: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "label": label,
        "score": score,
        "verdict": target_group_verdict(score),
        "reasons": reasons[:3] or ["Datenlage ist noch neutral; Zielgruppenfit nicht ueberinterpretieren."],
        "risks": risks[:3],
        "next_check": next_check,
    }


def reasons_for_profile(values: dict[str, int], candidates: list[tuple[str, str]]) -> list[str]:
    return [reason for field, reason in candidates if values[field] >= 75]


def nuisance_risks(values: dict[str, int]) -> list[str]:
    risks: list[str] = []
    if values["nuisance_resilience_score"] < 60 or values["noise_risk_score"] < 60:
        risks.append("Laerm, Hauptstrasse, Bahn, Nachtleben oder Industrie koennen die Wohnqualitaet druecken.")
    if values["flood_risk_score"] < 55:
        risks.append("Hochwasser-/Umweltrisiko vor Ankauf separat pruefen.")
    return risks


def target_group_verdict(score: int) -> str:
    if score >= 80:
        return "Sehr passend"
    if score >= 70:
        return "Passend mit Pruefung"
    if score >= 60:
        return "Moeglich, aber nicht Hauptthese"
    return "Nur mit Abschlag oder Spezialthese"


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

    normalized_location = normalized_location_values(data.location)
    loc_values = [normalized_location[field] for field in DEAL_LOCATION_SCORE_FIELDS]
    location_score = clamp(sum(loc_values) / len(loc_values))
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
