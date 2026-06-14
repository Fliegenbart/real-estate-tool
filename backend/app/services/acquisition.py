from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from math import floor
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def dec(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    return value if isinstance(value, Decimal) else Decimal(str(value))


class AcquisitionAssumptions(BaseModel):
    """Growth assumptions for the vvGmbH acquisition cockpit.

    This is a planning model, not investment, tax, or legal advice.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    available_equity: Decimal = Decimal("100000")
    annual_new_equity: Decimal = Decimal("50000")
    target_years: int = Field(default=10, ge=1, le=30)
    minimum_total_score: int = Field(default=60, ge=0, le=100)
    minimum_dscr: Decimal = Decimal("1.10")
    minimum_monthly_cashflow_before_tax: Decimal = Decimal("0")
    maximum_equity_per_unit: Decimal = Decimal("125000")


class DealDecision(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    deal_id: int
    title: str
    city: Optional[str]
    pipeline_stage: str
    decision: Literal["buy", "negotiate", "watch", "reject"]
    decision_label: str
    priority_score: int
    unit_count: int
    total_score: Optional[int]
    equity_required: Decimal
    equity_per_unit: Decimal
    loan_amount: Decimal
    monthly_cashflow_before_tax: Decimal
    stressed_monthly_cashflow_before_tax: Optional[Decimal]
    dscr: Optional[Decimal]
    stressed_dscr: Optional[Decimal]
    residual_debt_factor_rating: Optional[str]
    kfw_opportunity: Optional[str]
    constraints: list[str]
    next_action: str


class ListingOpportunity(BaseModel):
    id: int
    title: str
    city: Optional[str]
    source: Optional[str]
    purchase_price: Optional[Decimal]
    gross_yield_percent: Optional[Decimal]
    days_on_market: Optional[int]
    price_reduction_count: int
    price_reduction_total_percent: Optional[Decimal]
    priority_score: int
    next_action: str
    signals: list[str]


class GrowthYear(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    year: int
    starting_units: int
    acquisition_equity_available: Decimal
    estimated_units_added: int
    equity_used: Decimal
    ending_units: int
    ending_equity: Decimal


class BankPackage(BaseModel):
    deal_id: int
    title: str
    bank_summary: dict[str, Any]
    financing_request: dict[str, Any]
    strengths: list[str]
    risks: list[str]
    missing_documents: list[str]
    sections: list[dict[str, Any]]
    disclaimer: str


REQUIRED_BANK_DOCUMENTS = [
    "expose",
    "energy_certificate",
    "declaration_of_division",
    "weg_minutes",
    "economic_plan",
    "annual_statement",
    "maintenance_reserve_statement",
    "rental_contract",
    "floor_plan",
    "land_register_excerpt",
]


def build_command_center(
    deal_payloads: list[dict[str, Any]],
    listing_payloads: list[dict[str, Any]],
    assumptions: AcquisitionAssumptions,
) -> dict[str, Any]:
    decisions = [build_deal_decision(deal, assumptions) for deal in deal_payloads]
    decisions.sort(key=lambda item: item.priority_score, reverse=True)

    selected: list[DealDecision] = []
    remaining_equity = assumptions.available_equity
    for decision in decisions:
        if decision.decision not in {"buy", "negotiate"}:
            continue
        if decision.equity_required <= 0 or decision.equity_required > remaining_equity:
            continue
        selected.append(decision)
        remaining_equity -= decision.equity_required

    selected_units = sum(item.unit_count for item in selected)
    deployed = assumptions.available_equity - remaining_equity
    units_per_100k = (
        Decimal(selected_units) / assumptions.available_equity * Decimal("100000")
        if assumptions.available_equity > 0
        else Decimal("0")
    )

    bought_units = sum(
        infer_unit_count(deal)
        for deal in deal_payloads
        if (deal.get("pipeline_stage") == "Bought" or deal.get("status") == "bought")
    )
    active_pipeline_units = sum(
        infer_unit_count(deal)
        for deal in deal_payloads
        if deal.get("pipeline_stage") not in {"Bought", "Rejected"} and deal.get("status") != "bought"
    )

    average_equity_per_unit = average_selected_equity_per_unit(selected, assumptions)
    growth_years = build_growth_years(
        starting_units=bought_units,
        starting_equity=assumptions.available_equity,
        annual_new_equity=assumptions.annual_new_equity,
        target_years=assumptions.target_years,
        average_equity_per_unit=average_equity_per_unit,
    )

    return {
        "north_star": {
            "metric": "wohnungen_pro_100k_eigenkapital",
            "current_value": float(units_per_100k.quantize(Decimal("0.01"))),
            "explanation": "Wie viele Wohnungen die vvGmbH mit 100.000 EUR Eigenkapital aus den aktuell kaufbaren Deals bekommen koennte.",
        },
        "portfolio_capacity": {
            "available_equity": float(money(assumptions.available_equity)),
            "deployable_equity_now": float(money(deployed)),
            "remaining_equity_after_selected_deals": float(money(remaining_equity)),
            "bought_units": bought_units,
            "active_pipeline_units": active_pipeline_units,
            "selected_units_now": selected_units,
            "average_equity_per_selected_unit": float(money(average_equity_per_unit)),
        },
        "selected_deals_now": [json_ready(item.model_dump()) for item in selected],
        "deal_decisions": [json_ready(item.model_dump()) for item in decisions],
        "deal_radar": [
            json_ready(item.model_dump())
            for item in sorted(
                [build_listing_opportunity(listing) for listing in listing_payloads],
                key=lambda item: item.priority_score,
                reverse=True,
            )
        ],
        "growth_plan": {
            "target_years": assumptions.target_years,
            "average_equity_per_unit_assumption": float(money(average_equity_per_unit)),
            "years": [json_ready(year.model_dump()) for year in growth_years],
            "planning_warning": "Planungsmodell mit vereinfachten Annahmen; echte Kaufentscheidung, Finanzierung, Steuern und Recht separat pruefen.",
        },
    }


def build_deal_decision(deal: dict[str, Any], assumptions: AcquisitionAssumptions) -> DealDecision:
    underwriting = deal.get("latest_underwriting") or {}
    score = deal.get("latest_score") or {}
    listing = deal.get("listing") or {}

    total_score = score.get("total_score")
    equity_required = money(dec(underwriting.get("equity_required")))
    loan_amount = money(dec(underwriting.get("loan_amount")))
    monthly_cashflow = money(dec(underwriting.get("monthly_cashflow_before_tax")))
    dscr = optional_dec(underwriting.get("dscr"))
    stressed_cashflow = optional_dec(underwriting.get("stressed_monthly_cashflow_before_tax"))
    stressed_dscr = optional_dec(underwriting.get("stressed_dscr"))
    unit_count = infer_unit_count(deal)
    equity_per_unit = money(equity_required / Decimal(unit_count)) if unit_count else equity_required
    residual_rating = underwriting.get("residual_debt_factor_rating")

    constraints: list[str] = []
    if total_score is None:
        constraints.append("Score fehlt - Deal erst bewerten.")
    elif total_score < assumptions.minimum_total_score:
        constraints.append("Score unter Buy-Box.")
    if dscr is None:
        constraints.append("DSCR fehlt - Finanzierung pruefen.")
    elif dscr < assumptions.minimum_dscr:
        constraints.append("DSCR unter Zielwert.")
    if monthly_cashflow < assumptions.minimum_monthly_cashflow_before_tax:
        constraints.append("Monatlicher Cashflow unter Zielwert.")
    if equity_per_unit > assumptions.maximum_equity_per_unit:
        constraints.append("Zu viel Eigenkapital pro Wohnung gebunden.")
    if residual_rating == "red":
        constraints.append("Restschuld-Faktor nach Zinsbindung rot.")
    red_flags = score.get("red_flags") or []
    if len(red_flags) >= 4:
        constraints.append("Mehrere harte rote Flaggen.")

    decision: Literal["buy", "negotiate", "watch", "reject"]
    if total_score is None or not underwriting:
        decision = "watch"
    elif (
        total_score >= assumptions.minimum_total_score
        and dscr is not None
        and dscr >= assumptions.minimum_dscr
        and monthly_cashflow >= assumptions.minimum_monthly_cashflow_before_tax
        and equity_per_unit <= assumptions.maximum_equity_per_unit
        and residual_rating != "red"
    ):
        decision = "buy"
    elif total_score < assumptions.minimum_total_score - 12 or len(red_flags) >= 5:
        decision = "reject"
    elif monthly_cashflow < assumptions.minimum_monthly_cashflow_before_tax - Decimal("250"):
        decision = "reject"
    else:
        decision = "negotiate"

    priority_score = calculate_priority_score(
        total_score=total_score,
        equity_per_unit=equity_per_unit,
        maximum_equity_per_unit=assumptions.maximum_equity_per_unit,
        monthly_cashflow=monthly_cashflow,
        constraints=constraints,
        decision=decision,
    )

    return DealDecision(
        deal_id=int(deal["id"]),
        title=deal.get("title") or "Unbenannter Deal",
        city=listing.get("city"),
        pipeline_stage=deal.get("pipeline_stage") or "New",
        decision=decision,
        decision_label={
            "buy": "Kaufen / Angebot vorbereiten",
            "negotiate": "Nachverhandeln / Annahmen klaeren",
            "watch": "Beobachten / Daten vervollstaendigen",
            "reject": "Ablehnen",
        }[decision],
        priority_score=priority_score,
        unit_count=unit_count,
        total_score=total_score,
        equity_required=equity_required,
        equity_per_unit=equity_per_unit,
        loan_amount=loan_amount,
        monthly_cashflow_before_tax=monthly_cashflow,
        stressed_monthly_cashflow_before_tax=money(stressed_cashflow) if stressed_cashflow is not None else None,
        dscr=dscr.quantize(CENT) if dscr is not None else None,
        stressed_dscr=stressed_dscr.quantize(CENT) if stressed_dscr is not None else None,
        residual_debt_factor_rating=residual_rating,
        kfw_opportunity=detect_kfw_opportunity(listing),
        constraints=constraints,
        next_action=next_action_for_decision(decision, constraints),
    )


def build_listing_opportunity(listing: dict[str, Any]) -> ListingOpportunity:
    purchase_price = optional_dec(listing.get("purchase_price"))
    monthly_rent = optional_dec(listing.get("cold_rent_monthly") or listing.get("market_rent_estimate_monthly"))
    gross_yield = (
        monthly_rent * Decimal("12") / purchase_price * Decimal("100")
        if purchase_price and purchase_price > 0 and monthly_rent is not None
        else None
    )
    days = listing.get("days_on_market")
    price_drop = optional_dec(listing.get("price_reduction_total_percent"))
    signals = [signal.get("type", "") for signal in (listing.get("signals") or []) if signal.get("type")]

    priority = 0
    if gross_yield is not None:
        priority += int(min(gross_yield * Decimal("12"), Decimal("60")))
    if price_drop is not None:
        priority += int(min(price_drop * Decimal("2"), Decimal("25")))
    if days is not None and days >= 45:
        priority += 12
    if "price_reduction" in signals:
        priority += 10
    if not listing.get("purchase_price") or not listing.get("living_area_sqm"):
        priority -= 25

    next_action = "In Deal wandeln und voll unterwriten" if priority >= 55 else "Daten nachfordern oder beobachten"
    return ListingOpportunity(
        id=int(listing["id"]),
        title=listing.get("title") or "Unbenanntes Listing",
        city=listing.get("city"),
        source=listing.get("source"),
        purchase_price=purchase_price,
        gross_yield_percent=gross_yield.quantize(CENT) if gross_yield is not None else None,
        days_on_market=days,
        price_reduction_count=int(listing.get("price_reduction_count") or 0),
        price_reduction_total_percent=price_drop.quantize(CENT) if price_drop is not None else None,
        priority_score=max(0, min(100, priority)),
        next_action=next_action,
        signals=signals,
    )


def build_bank_package(deal: dict[str, Any]) -> BankPackage:
    underwriting = deal.get("latest_underwriting") or {}
    score = deal.get("latest_score") or {}
    listing = deal.get("listing") or {}
    documents = deal.get("documents") or []
    present_documents = {doc.get("document_type") for doc in documents}
    missing_documents = [doc for doc in REQUIRED_BANK_DOCUMENTS if doc not in present_documents]

    bank_summary = {
        "purchase_price": listing.get("purchase_price"),
        "all_in_purchase_price": underwriting.get("all_in_purchase_price"),
        "city": listing.get("city"),
        "living_area_sqm": listing.get("living_area_sqm"),
        "annual_cold_rent": underwriting.get("annual_cold_rent"),
        "net_operating_income": underwriting.get("net_operating_income"),
        "net_initial_yield_percent": underwriting.get("net_initial_yield_percent"),
        "dscr": underwriting.get("dscr"),
        "monthly_cashflow_before_tax": underwriting.get("monthly_cashflow_before_tax"),
        "equity_required": underwriting.get("equity_required"),
        "score": score.get("total_score"),
    }
    financing_request = {
        "requested_loan_amount": underwriting.get("loan_amount"),
        "suggested_equity": underwriting.get("equity_required"),
        "financed_capex": underwriting.get("financed_capex"),
        "remaining_loan_at_fixation_end": underwriting.get("remaining_loan_at_fixation_end"),
        "stressed_monthly_cashflow_before_tax": underwriting.get("stressed_monthly_cashflow_before_tax"),
    }

    strengths = score.get("positive_factors") or []
    risks = (score.get("negative_factors") or []) + (score.get("red_flags") or [])
    sections = [
        {
            "title": "Bank summary",
            "items": [
                f"Kaufpreis: {bank_summary['purchase_price']}",
                f"All-in: {bank_summary['all_in_purchase_price']}",
                f"Nettoanfangsrendite: {bank_summary['net_initial_yield_percent']}%",
                f"DSCR: {bank_summary['dscr']}",
                f"Eigenkapitalbedarf: {bank_summary['equity_required']}",
            ],
        },
        {
            "title": "Financing request",
            "items": [
                f"Angefragtes Darlehen: {financing_request['requested_loan_amount']}",
                f"Geplanter Eigenkapitaleinsatz: {financing_request['suggested_equity']}",
                f"Stress-Cashflow nach Zinsbindung: {financing_request['stressed_monthly_cashflow_before_tax']}",
            ],
        },
        {
            "title": "Diligence documents",
            "items": missing_documents,
        },
    ]

    return BankPackage(
        deal_id=int(deal["id"]),
        title=deal.get("title") or "Unbenannter Deal",
        bank_summary=bank_summary,
        financing_request=financing_request,
        strengths=strengths,
        risks=risks,
        missing_documents=missing_documents,
        sections=sections,
        disclaimer="Bankenpaket ist eine strukturierte Arbeitsvorlage; Finanzierung, Bewertung, Steuern und Recht muessen fachlich geprueft werden.",
    )


def infer_unit_count(deal: dict[str, Any]) -> int:
    listing = deal.get("listing") or {}
    explicit = listing.get("unit_count") or deal.get("unit_count")
    if explicit:
        return max(1, int(explicit))
    return 1


def calculate_priority_score(
    *,
    total_score: Optional[int],
    equity_per_unit: Decimal,
    maximum_equity_per_unit: Decimal,
    monthly_cashflow: Decimal,
    constraints: list[str],
    decision: str,
) -> int:
    score = total_score or 35
    if maximum_equity_per_unit > 0:
        capital_efficiency = max(
            Decimal("0"),
            Decimal("1") - (equity_per_unit / maximum_equity_per_unit),
        )
        score += int(capital_efficiency * Decimal("30"))
    if monthly_cashflow > 0:
        score += int(min(monthly_cashflow / Decimal("25"), Decimal("12")))
    score -= len(constraints) * 5
    if decision == "buy":
        score += 10
    elif decision == "reject":
        score -= 25
    return max(0, min(100, score))


def detect_kfw_opportunity(listing: dict[str, Any]) -> Optional[str]:
    energy_class = (listing.get("energy_class") or "").upper()
    capex = dec(listing.get("expected_initial_capex"))
    construction_year = listing.get("construction_year")
    if energy_class in {"F", "G", "H"} and capex > 0:
        return "KfW/BEG Sanierung pruefen: schwache Energieklasse plus Capex-Budget."
    if construction_year and int(construction_year) >= 2024:
        return "Klimafreundlicher Neubau / Erstkauf-Foerderung pruefen."
    return None


def next_action_for_decision(decision: str, constraints: list[str]) -> str:
    if decision == "buy":
        return "Bankenpaket erzeugen, Unterlagen anfordern, Angebot vorbereiten."
    if decision == "negotiate":
        if constraints:
            return "Preis, Finanzierung oder fehlende Unterlagen klaeren: " + constraints[0]
        return "Nachverhandeln und Annahmen schaerfen."
    if decision == "reject":
        return "Ablehnen oder nur bei deutlich besserem Preis neu pruefen."
    return "Fehlende Daten erfassen, dann Underwriting und Score starten."


def average_selected_equity_per_unit(
    selected: list[DealDecision],
    assumptions: AcquisitionAssumptions,
) -> Decimal:
    if not selected:
        return assumptions.maximum_equity_per_unit
    total_equity = sum((item.equity_required for item in selected), Decimal("0"))
    total_units = sum(item.unit_count for item in selected)
    if total_units <= 0:
        return assumptions.maximum_equity_per_unit
    return money(total_equity / Decimal(total_units))


def build_growth_years(
    *,
    starting_units: int,
    starting_equity: Decimal,
    annual_new_equity: Decimal,
    target_years: int,
    average_equity_per_unit: Decimal,
) -> list[GrowthYear]:
    rows: list[GrowthYear] = []
    units = starting_units
    equity = starting_equity
    for year in range(1, target_years + 1):
        if year > 1:
            equity += annual_new_equity
        units_added = floor(equity / average_equity_per_unit) if average_equity_per_unit > 0 else 0
        equity_used = average_equity_per_unit * Decimal(units_added)
        rows.append(
            GrowthYear(
                year=year,
                starting_units=units,
                acquisition_equity_available=money(equity),
                estimated_units_added=units_added,
                equity_used=money(equity_used),
                ending_units=units + units_added,
                ending_equity=money(equity - equity_used),
            )
        )
        units += units_added
        equity -= equity_used
    return rows


def optional_dec(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    return value if isinstance(value, Decimal) else Decimal(str(value))


def json_ready(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value
