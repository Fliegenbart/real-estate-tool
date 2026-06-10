from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


def clamp(value: float, lower: float = 0, upper: float = 100) -> int:
    return int(round(max(lower, min(upper, value))))


class PlannedMeasure(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    title: str
    estimated_cost_eur: Decimal = Decimal("0")
    funded_by: str = "unknown"  # reserve | special_levy | unknown


class WegHealthInput(BaseModel):
    """Manually captured facts from WEG documents (Protokolle, Wirtschaftsplan,
    Jahresabrechnung, Rücklagenstand). Everything is optional: missing data
    lowers confidence and triggers a document request, not a guess."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    construction_year: Optional[int] = None
    total_units: Optional[int] = None
    community_living_area_sqm: Optional[Decimal] = None
    reserve_total_eur: Optional[Decimal] = None
    annual_reserve_contribution_eur: Optional[Decimal] = None
    hausgeld_monthly_eur: Optional[Decimal] = None
    unit_living_area_sqm: Optional[Decimal] = None
    arrears_total_eur: Optional[Decimal] = None
    owners_in_arrears: Optional[int] = None
    planned_measures: list[PlannedMeasure] = []
    special_levies_last_5_years_eur: Optional[Decimal] = None
    owner_occupier_share_percent: Optional[Decimal] = None
    has_majority_owner: Optional[bool] = None
    professional_management: Optional[bool] = None
    protocols_years_reviewed: int = 0
    litigation_pending: Optional[bool] = None
    notes: Optional[str] = None


class WegHealthResult(BaseModel):
    total_score: int
    category_scores: dict[str, int]
    flags: list[str]
    positive_factors: list[str]
    negative_factors: list[str]
    data_completeness_percent: int
    confidence: str
    summary: str
    documents_to_request: list[str]


def reserve_benchmark_per_sqm(construction_year: Optional[int]) -> Decimal:
    """Rough target for the accumulated reserve stock per sqm community area."""
    if construction_year is None:
        return Decimal("25")
    age = 2026 - construction_year
    if age <= 15:
        return Decimal("12")
    if age <= 35:
        return Decimal("25")
    return Decimal("40")


def contribution_benchmark_per_sqm_year(construction_year: Optional[int]) -> Decimal:
    """Rough target for the yearly reserve contribution per sqm (Peterssche Formel, stark vereinfacht)."""
    if construction_year is None:
        return Decimal("10")
    age = 2026 - construction_year
    if age <= 15:
        return Decimal("7")
    if age <= 35:
        return Decimal("10")
    return Decimal("13")


def assess_weg_health(data: WegHealthInput) -> WegHealthResult:
    flags: list[str] = []
    positives: list[str] = []
    negatives: list[str] = []
    documents: list[str] = []

    tracked_fields = [
        data.construction_year,
        data.community_living_area_sqm,
        data.reserve_total_eur,
        data.annual_reserve_contribution_eur,
        data.hausgeld_monthly_eur,
        data.unit_living_area_sqm,
        data.arrears_total_eur,
        data.special_levies_last_5_years_eur,
        data.professional_management,
        data.litigation_pending,
    ]
    provided = sum(1 for value in tracked_fields if value is not None)
    provided += 1 if data.planned_measures else 0
    provided += 1 if data.protocols_years_reviewed > 0 else 0
    completeness = clamp(provided / 12 * 100)

    # --- 1. Reserve strength (stock + contribution vs. age benchmark) ---
    reserve_score = 50
    if data.reserve_total_eur is not None and data.community_living_area_sqm:
        per_sqm = data.reserve_total_eur / data.community_living_area_sqm
        benchmark = reserve_benchmark_per_sqm(data.construction_year)
        ratio = float(per_sqm / benchmark)
        reserve_score = clamp(ratio * 70)
        if ratio < Decimal("0.34"):
            flags.append("weg_reserve_critically_low")
            negatives.append(
                f"Ruecklage {per_sqm.quantize(Decimal('0.01'))} EUR/m2 liegt weit unter dem Alters-Benchmark von {benchmark} EUR/m2."
            )
        elif ratio >= 1:
            positives.append("Instandhaltungsruecklage liegt ueber dem Alters-Benchmark.")
    else:
        flags.append("weg_reserve_unknown")
        documents.append("Aktueller Ruecklagenstand (Jahresabrechnung / Verwalterauskunft)")

    if data.annual_reserve_contribution_eur is not None and data.community_living_area_sqm:
        contribution_per_sqm = data.annual_reserve_contribution_eur / data.community_living_area_sqm
        benchmark = contribution_benchmark_per_sqm_year(data.construction_year)
        contribution_score = clamp(float(contribution_per_sqm / benchmark) * 70)
        reserve_score = clamp(reserve_score * 0.6 + contribution_score * 0.4)
        if contribution_per_sqm < benchmark / 2:
            flags.append("weg_reserve_contribution_too_low")
            negatives.append("Die jaehrliche Zufuehrung zur Ruecklage ist deutlich zu niedrig fuer das Gebaeudealter.")
    elif data.annual_reserve_contribution_eur is None:
        documents.append("Wirtschaftsplan mit Zufuehrung zur Instandhaltungsruecklage")

    # --- 2. Cost structure (Hausgeld per sqm) ---
    cost_score = 50
    if data.hausgeld_monthly_eur is not None and data.unit_living_area_sqm:
        hausgeld_per_sqm = data.hausgeld_monthly_eur / data.unit_living_area_sqm
        # Typical band 2.50-4.50 EUR/m2 incl. reserve; above 5.50 is a cost problem.
        value = float(hausgeld_per_sqm)
        if value <= 3.5:
            cost_score = 85
            positives.append("Hausgeld je m2 liegt im unauffaelligen Bereich.")
        elif value <= 4.5:
            cost_score = 65
        elif value <= 5.5:
            cost_score = 40
            negatives.append("Hausgeld je m2 ist erhoeht; Kostentreiber in der Jahresabrechnung pruefen.")
        else:
            cost_score = 20
            flags.append("weg_hausgeld_very_high")
            negatives.append("Hausgeld je m2 ist sehr hoch und drueckt dauerhaft die Nettorendite.")
    else:
        documents.append("Hausgeldaufstellung mit Umlageschluessel")

    # --- 3. Payment morale (arrears vs. yearly hausgeld volume) ---
    morale_score = 50
    annual_volume: Optional[Decimal] = None
    if data.hausgeld_monthly_eur is not None and data.total_units and data.unit_living_area_sqm and data.community_living_area_sqm:
        per_sqm = data.hausgeld_monthly_eur / data.unit_living_area_sqm
        annual_volume = per_sqm * data.community_living_area_sqm * Decimal("12")
    if data.arrears_total_eur is not None:
        if annual_volume and annual_volume > 0:
            arrears_ratio = float(data.arrears_total_eur / annual_volume)
            morale_score = clamp(100 - arrears_ratio * 800)
            if arrears_ratio > 0.05:
                flags.append("weg_high_arrears")
                negatives.append("Hausgeldrueckstaende uebersteigen 5% des Jahresvolumens - Ausfallrisiko fuer die Gemeinschaft.")
            elif arrears_ratio < 0.01:
                positives.append("Kaum Hausgeldrueckstaende in der Gemeinschaft.")
        elif data.arrears_total_eur == 0:
            morale_score = 90
            positives.append("Keine Hausgeldrueckstaende gemeldet.")
        else:
            morale_score = 35
            negatives.append("Es bestehen Hausgeldrueckstaende; Volumen im Verhaeltnis zum Wirtschaftsplan pruefen.")
    else:
        flags.append("weg_arrears_unknown")
        documents.append("Verwalterauskunft zu Hausgeldrueckstaenden")

    # --- 4. Maintenance backlog (planned measures vs. reserve, levy history) ---
    backlog_score = 60
    backlog_total = sum((m.estimated_cost_eur for m in data.planned_measures), Decimal("0"))
    unfunded = sum(
        (m.estimated_cost_eur for m in data.planned_measures if m.funded_by != "reserve"),
        Decimal("0"),
    )
    if data.planned_measures:
        reserve = data.reserve_total_eur or Decimal("0")
        if unfunded > 0 and unfunded > reserve:
            backlog_score = 20
            flags.append("weg_unfunded_measures")
            negatives.append(
                f"Beschlossene/anstehende Massnahmen ({backlog_total} EUR) sind nicht durch die Ruecklage gedeckt - Sonderumlage wahrscheinlich."
            )
        elif backlog_total > 0:
            backlog_score = 55
            negatives.append("Anstehende Massnahmen vorhanden; Finanzierung ueber Ruecklage plausibel, Beschluesse pruefen.")
    elif data.protocols_years_reviewed >= 2:
        backlog_score = 80
        positives.append("Protokolle der letzten Jahre zeigen keine grossen offenen Massnahmen.")
    else:
        documents.append("WEG-Protokolle der letzten 3 Jahre (beschlossene und vertagte Massnahmen)")

    if data.special_levies_last_5_years_eur is not None and data.special_levies_last_5_years_eur > 0:
        backlog_score = clamp(backlog_score - 15)
        flags.append("weg_special_levy_history")
        negatives.append("In den letzten 5 Jahren gab es bereits Sonderumlagen.")

    # --- 5. Governance ---
    governance_score = 50
    if data.professional_management is True:
        governance_score += 15
        positives.append("Professionelle Hausverwaltung vorhanden.")
    elif data.professional_management is False:
        governance_score -= 10
        negatives.append("Keine professionelle Verwaltung - Selbstverwaltung erhoeht das Konfliktrisiko.")
    if data.protocols_years_reviewed >= 3:
        governance_score += 15
    elif data.protocols_years_reviewed == 0:
        flags.append("weg_no_protocols_reviewed")
    if data.litigation_pending is True:
        governance_score -= 25
        flags.append("weg_litigation_pending")
        negatives.append("Laufende Rechtsstreitigkeiten in der WEG.")
    if data.has_majority_owner is True:
        governance_score -= 15
        flags.append("weg_majority_owner")
        negatives.append("Ein Mehrheitseigentuemer kann Beschluesse dominieren (Stimmrechtsmacht pruefen).")
    governance_score = clamp(governance_score)

    category_scores = {
        "reserve_strength": int(reserve_score),
        "cost_structure": int(cost_score),
        "payment_morale": int(morale_score),
        "maintenance_backlog": int(backlog_score),
        "governance": int(governance_score),
    }
    total = clamp(
        reserve_score * 0.30
        + cost_score * 0.15
        + morale_score * 0.15
        + backlog_score * 0.25
        + governance_score * 0.15
    )

    if completeness >= 75:
        confidence = "high"
    elif completeness >= 40:
        confidence = "medium"
    else:
        confidence = "low"

    if total >= 75:
        summary = "WEG wirkt gesund: Ruecklage, Kosten und Governance sind im Rahmen."
    elif total >= 55:
        summary = "WEG ist tragfaehig, hat aber Schwachstellen - gezielt Dokumente nachfordern."
    else:
        summary = "WEG-Risiko ist hoch: Sonderumlagen oder Konflikte wahrscheinlich. Nur mit Preisabschlag oder gar nicht."

    return WegHealthResult(
        total_score=total,
        category_scores=category_scores,
        flags=flags,
        positive_factors=positives,
        negative_factors=negatives,
        data_completeness_percent=completeness,
        confidence=confidence,
        summary=summary,
        documents_to_request=sorted(set(documents)),
    )
