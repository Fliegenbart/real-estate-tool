from __future__ import annotations

import math
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

# Region score for a 20-year buy-and-hold with portfolio exit: yield power
# carries the cashflow, demand stability insures it (forecast horizon 2040
# sits right at the planned exit), economic base explains both, and exit
# liquidity matters because the GmbH portfolio is meant to be sold.

WEIGHTS = {
    "yield_power": 0.35,
    "demand_stability": 0.30,
    "economic_base": 0.20,
    "exit_liquidity": 0.15,
}

CORE_METRICS = [
    "price_eur_sqm",
    "rent_eur_sqm",
    "vacancy_rate_percent",
    "population_forecast_2040_percent",
    "unemployment_rate_percent",
]


def clamp(value: float, lower: float = 0, upper: float = 100) -> int:
    return int(round(max(lower, min(upper, value))))


class RegionScoreResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    total_score: int
    category_scores: dict[str, int]
    gross_yield_percent: Optional[Decimal]
    rent_factor: Optional[Decimal]
    red_flags: list[str]
    positive_factors: list[str]
    negative_factors: list[str]
    recommendation: str
    data_completeness_percent: int
    explanation: str


def score_region(metrics: dict[str, Decimal], population: Optional[int]) -> RegionScoreResult:
    red_flags: list[str] = []
    positives: list[str] = []
    negatives: list[str] = []

    def get(name: str) -> Optional[Decimal]:
        value = metrics.get(name)
        return Decimal(str(value)) if value is not None else None

    # Own listing-flow data beats static estimates when available.
    price = get("own_median_price_eur_sqm") or get("price_eur_sqm")
    rent = get("own_median_rent_eur_sqm") or get("rent_eur_sqm")

    gross_yield: Optional[Decimal] = None
    factor: Optional[Decimal] = None
    yield_score = 50
    if price and rent and price > 0 and rent > 0:
        annual_rent = rent * Decimal("12")
        gross_yield = (annual_rent / price * Decimal("100")).quantize(Decimal("0.01"))
        factor = (price / annual_rent).quantize(Decimal("0.1"))
        # 3% gross -> 15, 7% -> 95. Medians understate the deal segment; the
        # own listing flow corrects this over time.
        yield_score = clamp((float(gross_yield) - 3.0) / 4.0 * 80 + 15)
        if gross_yield >= Decimal("6.0"):
            positives.append(f"Bruttomietrendite ~{gross_yield}% (Faktor {factor}) traegt Cashflow-Strategien.")
        elif gross_yield < Decimal("3.5"):
            red_flags.append("weak_yield_market")
            negatives.append(f"Bruttomietrendite ~{gross_yield}%: kein Cashflow-Markt, nur Wertsteigerungswette.")

    vacancy = get("vacancy_rate_percent")
    forecast = get("population_forecast_2040_percent")
    vacancy_score = clamp(95 - float(vacancy) * 7.5) if vacancy is not None else 50
    forecast_score = clamp(60 + float(forecast) * 4) if forecast is not None else 50
    demand_score = clamp(vacancy_score * 0.5 + forecast_score * 0.5)

    if vacancy is not None and vacancy > Decimal("10"):
        red_flags.append("very_high_vacancy")
        negatives.append(f"Leerstand ~{vacancy}%: Vermietungsdauer und Mietausfall einpreisen.")
    if forecast is not None and forecast < Decimal("-8"):
        red_flags.append("strong_population_decline_forecast")
        negatives.append(f"Bevoelkerungsprognose 2040: {forecast}% - Nachfrage schrumpft bis zum geplanten Exit.")
    # Interaction: high vacancy in a shrinking market is structural, not cyclical.
    if vacancy is not None and forecast is not None and vacancy > Decimal("8") and forecast < Decimal("-6"):
        red_flags.append("structural_decline_risk")
        demand_score = min(demand_score, 25)
        negatives.append("Leerstand + Schrumpfungsprognose wirken zusammen: strukturelles Nachfragerisiko.")
    if vacancy is not None and vacancy <= Decimal("4") and forecast is not None and forecast >= Decimal("0"):
        positives.append("Niedriger Leerstand bei stabiler/positiver Prognose: belastbare Dauernachfrage.")

    unemployment = get("unemployment_rate_percent")
    purchasing_power = get("purchasing_power_index")
    economic_parts: list[float] = []
    if unemployment is not None:
        economic_parts.append(clamp(110 - float(unemployment) * 7.5))
        if unemployment >= Decimal("12"):
            negatives.append(f"Arbeitslosenquote ~{unemployment}%: Mieterbonitaet und Fluktuation beachten.")
    if purchasing_power is not None:
        economic_parts.append(clamp(50 + (float(purchasing_power) - 100) * 2))
    economic_score = clamp(sum(economic_parts) / len(economic_parts)) if economic_parts else 50

    if population:
        liquidity_score = clamp((math.log10(max(population, 1)) - 4.3) / 2.0 * 80 + 15)
    else:
        liquidity_score = 40
    own_count = get("own_listing_count")
    if own_count is not None and own_count >= 20:
        liquidity_score = clamp(liquidity_score + 10)
        positives.append("Eigener Listing-Zufluss zeigt aktiven Angebotsmarkt.")
    if population is not None and population < 30000:
        red_flags.append("tiny_market")
        negatives.append("Sehr kleiner Markt: Exit-Liquiditaet in 20 Jahren fraglich.")

    category_scores = {
        "yield_power": int(yield_score),
        "demand_stability": int(demand_score),
        "economic_base": int(economic_score),
        "exit_liquidity": int(liquidity_score),
    }
    total = clamp(sum(category_scores[key] * weight for key, weight in WEIGHTS.items()))
    # The strategy is cashflow: a market that cannot yield is out, no matter
    # how stable - symmetric to the structural-decline cap on the other side.
    if "weak_yield_market" in red_flags:
        total = min(total, 45)

    present = sum(1 for metric in CORE_METRICS if metrics.get(metric) is not None)
    completeness = clamp(present / len(CORE_METRICS) * 100)

    if "structural_decline_risk" in red_flags:
        recommendation = "Meiden oder nur Einzellagen mit nachgewiesener Nachfrage (Uni/Klinik-Naehe) - kein Suchagent."
    elif "weak_yield_market" in red_flags:
        recommendation = "Kein Cashflow-Markt: Faktor zu hoch fuer die Strategie - nur bei Sonderpreisen anschauen."
    elif total >= 62:
        recommendation = "Suchagent anlegen und Listing-Zufluss aufbauen - Datenlage je Deal verifizieren."
    elif total >= 48:
        recommendation = "Beobachten: Suchagent lohnt, aber nur mit striktem Preis-/WEG-Filter kaufen."
    else:
        recommendation = "Niedrige Prioritaet - Kapital in staerkere Standorte lenken."

    return RegionScoreResult(
        total_score=total,
        category_scores=category_scores,
        gross_yield_percent=gross_yield,
        rent_factor=factor,
        red_flags=red_flags,
        positive_factors=positives,
        negative_factors=negatives,
        recommendation=recommendation,
        data_completeness_percent=completeness,
        explanation=(
            "Gewichtung fuer 20-Jahre-Halten mit Portfolio-Exit: Ertragskraft 35%, "
            "Nachfragestabilitaet 30% (Prognose 2040 = Exit-Horizont), Wirtschaftsbasis 20%, "
            "Exit-Liquiditaet 15%. Eigene Marktdaten aus dem Listing-Zufluss ueberschreiben Schaetzwerte."
        ),
    )
