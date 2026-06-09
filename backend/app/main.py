from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import (
    Deal,
    DealPipelineItem,
    DealScore,
    Document,
    FinancingScenario,
    Listing,
    LocationScore,
    Property,
    RiskFlag,
    TaxScenario,
    UnderwritingCase,
    Unit,
)
from app.services.ingestion import normalize_listing_row, parse_import
from app.services.location import MockLocationEnrichmentService
from app.services.memo import build_investment_memo
from app.services.rent_law import RentLawInput, check_rent_law_plausibility
from app.services.scoring import DealScoringInput, LocationMetricsInput, score_deal
from app.services.seed import DEMO_LISTINGS
from app.services.underwriting import TaxAssumptions, UnderwritingInput, calculate_underwriting


PIPELINE_STAGES = [
    "New",
    "Interesting",
    "Contacted",
    "Documents requested",
    "Underwriting",
    "Offer submitted",
    "Due diligence",
    "Notary",
    "Bought",
    "Rejected",
]

DOCUMENT_TYPES = {
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
    "other",
}


app = FastAPI(title="German Real Estate Acquisition MVP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


class ListingPayload(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    source: str = "manual"
    external_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    federal_state: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    purchase_price: Optional[Decimal] = None
    living_area_sqm: Optional[Decimal] = None
    number_of_rooms: Optional[Decimal] = None
    floor: Optional[str] = None
    construction_year: Optional[int] = None
    condition: Optional[str] = None
    energy_class: Optional[str] = None
    heating_type: Optional[str] = None
    energy_consumption_kwh: Optional[Decimal] = None
    is_rented: bool = False
    cold_rent_monthly: Optional[Decimal] = None
    market_rent_estimate_monthly: Optional[Decimal] = None
    house_money_monthly: Optional[Decimal] = None
    non_recoverable_costs_monthly: Optional[Decimal] = None
    maintenance_reserve_weg: Optional[Decimal] = None
    broker_fee_percent: Optional[Decimal] = Decimal("3.57")
    property_transfer_tax_percent: Optional[Decimal] = Decimal("6.5")
    notary_and_land_registry_percent: Optional[Decimal] = Decimal("2")
    expected_initial_capex: Optional[Decimal] = Decimal("0")
    listing_url: Optional[str] = None
    status: str = "active"


class ListingImportRequest(BaseModel):
    format: Literal["csv", "json"]
    source: str = "manual"
    content: Optional[str] = None
    items: Optional[list[dict[str, Any]]] = None


class FinancingUpdate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    interest_rate_percent: Optional[Decimal] = None
    amortization_rate_percent: Optional[Decimal] = None
    loan_to_value_percent: Optional[Decimal] = None
    equity_contribution: Optional[Decimal] = None


class TaxUpdate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    corporate_tax_rate_percent: Optional[Decimal] = None
    solidarity_surcharge_rate_percent: Optional[Decimal] = None
    trade_tax_rate_percent: Optional[Decimal] = None
    assumes_extended_property_deduction: Optional[bool] = None
    depreciation_rate_percent: Optional[Decimal] = None
    building_share_percent: Optional[Decimal] = None
    interest_deductible: Optional[bool] = None


class RentLawUpdate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    local_reference_rent_per_sqm: Optional[Decimal] = None
    rent_control_area: Optional[bool] = None


class LocationUpdate(BaseModel):
    population_trend_score: Optional[int] = None
    vacancy_risk_score: Optional[int] = None
    purchasing_power_score: Optional[int] = None
    public_transport_score: Optional[int] = None
    employer_access_score: Optional[int] = None
    micro_location_score: Optional[int] = None
    noise_risk_score: Optional[int] = None
    flood_risk_score: Optional[int] = None


class RiskFlagPayload(BaseModel):
    code: str
    label: str
    severity: str = "medium"
    notes: Optional[str] = None


class DocumentPayload(BaseModel):
    document_type: str
    file_name: str
    extracted_text: Optional[str] = None
    review_status: str = "not_reviewed"
    risk_notes: Optional[str] = None


class PipelineUpdate(BaseModel):
    stage: str
    notes: Optional[str] = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/listings")
def list_listings(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    listings = db.query(Listing).order_by(Listing.first_seen_at.desc(), Listing.id.desc()).all()
    return [listing_to_dict(item) for item in listings]


@app.post("/api/listings", status_code=status.HTTP_201_CREATED)
def create_listing(payload: ListingPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    listing = Listing(**payload.model_dump(exclude_unset=True))
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing_to_dict(listing)


@app.get("/api/listings/{listing_id}")
def get_listing(listing_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return listing_to_dict(require_listing(db, listing_id))


@app.patch("/api/listings/{listing_id}")
def update_listing(listing_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    listing = require_listing(db, listing_id)
    clean = normalize_listing_row(payload)
    for key, value in clean.items():
        if hasattr(listing, key):
            setattr(listing, key, value)
    listing.last_seen_at = datetime.utcnow()
    db.commit()
    db.refresh(listing)
    return listing_to_dict(listing)


@app.delete("/api/listings/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)) -> dict[str, int]:
    listing = require_listing(db, listing_id)
    db.delete(listing)
    db.commit()
    return {"deleted": listing_id}


@app.post("/api/listings/import", status_code=status.HTTP_201_CREATED)
def import_listings(payload: ListingImportRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    raw_payload: Any = payload.content if payload.format == "csv" else payload.items
    if raw_payload is None:
        raise HTTPException(status_code=400, detail="Import content or items are required.")
    rows = parse_import(payload.format, raw_payload)
    listings = []
    for row in rows:
        row["source"] = row.get("source") or payload.source
        listing = Listing(**row)
        db.add(listing)
        listings.append(listing)
    db.commit()
    return {"imported": len(listings), "ids": [item.id for item in listings]}


@app.post("/api/listings/import/demo", status_code=status.HTTP_201_CREATED)
def import_demo_data(db: Session = Depends(get_db)) -> dict[str, Any]:
    clear_database(db)
    imported = []
    for row in DEMO_LISTINGS:
        listing = Listing(**row)
        db.add(listing)
        imported.append(listing)
    db.commit()
    for listing in imported:
        db.refresh(listing)
    return {"imported": len(imported), "ids": [listing.id for listing in imported]}


@app.post("/api/listings/{listing_id}/convert-to-deal", status_code=status.HTTP_201_CREATED)
def convert_listing_to_deal(listing_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    listing = require_listing(db, listing_id)
    existing = db.query(Deal).filter(Deal.listing_id == listing.id).first()
    if existing:
        return deal_detail_payload(db, existing)

    prop = Property(
        street=listing.street,
        house_number=listing.house_number,
        city=listing.city,
        postal_code=listing.postal_code,
        federal_state=listing.federal_state,
        latitude=listing.latitude,
        longitude=listing.longitude,
    )
    db.add(prop)
    db.flush()
    unit = Unit(
        property_id=prop.id,
        living_area_sqm=listing.living_area_sqm,
        number_of_rooms=listing.number_of_rooms,
        floor=listing.floor,
        condition=listing.condition,
        energy_class=listing.energy_class,
        heating_type=listing.heating_type,
    )
    db.add(unit)
    deal = Deal(
        listing_id=listing.id,
        property_id=prop.id,
        title=listing.title,
        purchase_price=listing.purchase_price,
        market_price_per_sqm=default_market_price_per_sqm(listing),
        local_reference_rent_per_sqm=default_reference_rent_per_sqm(listing),
        rent_control_area=True,
        pipeline_stage="New",
    )
    db.add(deal)
    db.flush()

    db.add(FinancingScenario(deal_id=deal.id))
    db.add(TaxScenario(deal_id=deal.id))
    location = MockLocationEnrichmentService().enrich(listing.city, listing.postal_code)
    db.add(LocationScore(deal_id=deal.id, **location.model_dump()))
    db.add(DealPipelineItem(deal_id=deal.id, stage="New"))
    listing.status = "converted"
    db.commit()
    db.refresh(deal)
    return deal_detail_payload(db, deal)


@app.get("/api/deals")
def list_deals(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    deals = db.query(Deal).order_by(Deal.created_at.desc(), Deal.id.desc()).all()
    return [deal_detail_payload(db, deal) for deal in deals]


@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return deal_detail_payload(db, require_deal(db, deal_id))


@app.post("/api/deals/{deal_id}/underwrite")
def underwrite_deal(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    data = build_underwriting_input(deal)
    result = calculate_underwriting(data)
    case = UnderwritingCase(
        deal_id=deal.id,
        name="Base case",
        inputs=json_safe(data.model_dump()),
        results=json_safe(result.model_dump()),
    )
    db.add(case)
    db.commit()
    return json_safe(result.model_dump())


@app.post("/api/deals/{deal_id}/score")
def score_deal_endpoint(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    latest_underwriting = latest(deal.underwriting_cases)
    if latest_underwriting is None:
        underwrite_deal(deal_id, db)
        db.refresh(deal)
        latest_underwriting = latest(deal.underwriting_cases)
    score_input = build_score_input(db, deal, latest_underwriting.results if latest_underwriting else {})
    result = score_deal(score_input)
    result_payload = result.model_dump()
    manual_flags = [flag.code for flag in deal.risk_flags]
    result_payload["red_flags"] = sorted(set(result_payload["red_flags"] + manual_flags))
    score = DealScore(
        deal_id=deal.id,
        total_score=result_payload["total_score"],
        category_scores=result_payload["category_scores"],
        explanation=result_payload["explanation"],
        positive_factors=result_payload["positive_factors"],
        negative_factors=result_payload["negative_factors"],
        red_flags=result_payload["red_flags"],
        next_recommended_action=result_payload["next_recommended_action"],
    )
    db.add(score)
    db.commit()
    return json_safe(result_payload)


@app.patch("/api/deals/{deal_id}/financing")
def update_financing(deal_id: int, payload: FinancingUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    scenario = latest(deal.financing_scenarios)
    if scenario is None:
        scenario = FinancingScenario(deal_id=deal.id)
        db.add(scenario)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(scenario, key, value)
    db.commit()
    db.refresh(scenario)
    return model_to_dict(scenario)


@app.patch("/api/deals/{deal_id}/tax")
def update_tax(deal_id: int, payload: TaxUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    scenario = latest(deal.tax_scenarios)
    if scenario is None:
        scenario = TaxScenario(deal_id=deal.id)
        db.add(scenario)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(scenario, key, value)
    db.commit()
    db.refresh(scenario)
    return model_to_dict(scenario)


@app.patch("/api/deals/{deal_id}/rent-law")
def update_rent_law(deal_id: int, payload: RentLawUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(deal, key, value)
    deal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(deal)
    return build_rent_law_payload(deal)


@app.patch("/api/deals/{deal_id}/location")
def update_location(deal_id: int, payload: LocationUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    location = latest(deal.location_scores)
    if location is None:
        location = LocationScore(deal_id=deal.id)
        db.add(location)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(location, key, value)
    location.source = "manual"
    db.commit()
    db.refresh(location)
    return model_to_dict(location)


@app.post("/api/deals/{deal_id}/risk-flags", status_code=status.HTTP_201_CREATED)
def add_risk_flag(deal_id: int, payload: RiskFlagPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    flag = RiskFlag(deal_id=deal.id, **payload.model_dump())
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return model_to_dict(flag)


@app.post("/api/deals/{deal_id}/documents", status_code=status.HTTP_201_CREATED)
def add_document(deal_id: int, payload: DocumentPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    if payload.document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported document type.")
    document = Document(deal_id=deal.id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return model_to_dict(document)


@app.patch("/api/deals/{deal_id}/pipeline")
def update_pipeline(deal_id: int, payload: PipelineUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    if payload.stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail="Unsupported pipeline stage.")
    deal.pipeline_stage = payload.stage
    deal.updated_at = datetime.utcnow()
    item = DealPipelineItem(deal_id=deal.id, stage=payload.stage, notes=payload.notes)
    db.add(item)
    db.commit()
    db.refresh(deal)
    return deal_detail_payload(db, deal)


@app.get("/api/deals/{deal_id}/investment-memo")
def investment_memo(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    payload = deal_detail_payload(db, deal)
    return build_investment_memo(payload)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    listings = db.query(Listing).all()
    deals = db.query(Deal).all()
    deal_payloads = [deal_detail_payload(db, deal) for deal in deals]
    scored = [deal for deal in deal_payloads if deal.get("latest_score")]
    underwritten = [deal for deal in deal_payloads if deal.get("latest_underwriting")]
    red_flagged = [
        deal
        for deal in scored
        if (deal.get("latest_score") or {}).get("red_flags")
    ]

    def avg(path: str) -> Optional[float]:
        values = [
            float((deal.get("latest_underwriting") or {}).get(path))
            for deal in underwritten
            if (deal.get("latest_underwriting") or {}).get(path) is not None
        ]
        return round(sum(values) / len(values), 2) if values else None

    pipeline = {stage: 0 for stage in PIPELINE_STAGES}
    for deal in deals:
        pipeline[deal.pipeline_stage] = pipeline.get(deal.pipeline_stage, 0) + 1

    top_deals = sorted(
        scored,
        key=lambda item: (item.get("latest_score") or {}).get("total_score", 0),
        reverse=True,
    )[:10]
    return {
        "total_active_listings": len([listing for listing in listings if listing.status == "active"]),
        "active_deals": len([deal for deal in deals if deal.status == "active"]),
        "average_gross_yield": avg("gross_initial_yield_percent"),
        "average_net_yield": avg("net_initial_yield_percent"),
        "red_flagged_deals": len(red_flagged),
        "top_deals": top_deals,
        "pipeline": pipeline,
    }


def require_listing(db: Session, listing_id: int) -> Listing:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found.")
    return listing


def require_deal(db: Session, deal_id: int) -> Deal:
    deal = db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found.")
    return deal


def clear_database(db: Session) -> None:
    for model in [
        Document,
        RiskFlag,
        DealScore,
        UnderwritingCase,
        FinancingScenario,
        TaxScenario,
        LocationScore,
        DealPipelineItem,
        Unit,
        Deal,
        Property,
        Listing,
    ]:
        db.query(model).delete()
    db.commit()


def latest(items: list[Any]) -> Optional[Any]:
    if not items:
        return None
    return sorted(items, key=lambda item: getattr(item, "id", 0), reverse=True)[0]


def listing_to_dict(listing: Listing) -> dict[str, Any]:
    return model_to_dict(listing)


def deal_detail_payload(db: Session, deal: Deal) -> dict[str, Any]:
    db.refresh(deal)
    latest_underwriting = latest(deal.underwriting_cases)
    latest_score = latest(deal.scores)
    financing = latest(deal.financing_scenarios)
    tax = latest(deal.tax_scenarios)
    location = latest(deal.location_scores)
    return {
        **model_to_dict(deal),
        "listing": listing_to_dict(deal.listing) if deal.listing else None,
        "property": model_to_dict(deal.property) if deal.property else None,
        "latest_underwriting": latest_underwriting.results if latest_underwriting else None,
        "latest_score": model_to_dict(latest_score) if latest_score else None,
        "financing": model_to_dict(financing) if financing else None,
        "tax": model_to_dict(tax) if tax else None,
        "rent_law": build_rent_law_payload(deal),
        "location": model_to_dict(location) if location else None,
        "risk_flags": [model_to_dict(flag) for flag in deal.risk_flags],
        "documents": [model_to_dict(document) for document in deal.documents],
        "pipeline_history": [model_to_dict(item) for item in deal.pipeline_items],
    }


def build_underwriting_input(deal: Deal) -> UnderwritingInput:
    listing = deal.listing
    if listing is None:
        raise HTTPException(status_code=400, detail="Deal has no source listing.")
    financing = latest(deal.financing_scenarios) or FinancingScenario(deal_id=deal.id)
    tax = latest(deal.tax_scenarios) or TaxScenario(deal_id=deal.id)
    living_area = listing.living_area_sqm or Decimal("1")
    return UnderwritingInput(
        purchase_price=listing.purchase_price or Decimal("0"),
        living_area_sqm=living_area,
        monthly_cold_rent=listing.cold_rent_monthly
        or listing.market_rent_estimate_monthly
        or Decimal("0"),
        market_rent_monthly=listing.market_rent_estimate_monthly,
        house_money_monthly=listing.house_money_monthly or Decimal("0"),
        non_recoverable_costs_monthly=listing.non_recoverable_costs_monthly or Decimal("0"),
        maintenance_monthly=living_area * Decimal("1.25"),
        vacancy_allowance_percent=Decimal("2.0"),
        property_management_monthly=Decimal("30"),
        broker_fee_percent=listing.broker_fee_percent or Decimal("3.57"),
        property_transfer_tax_percent=listing.property_transfer_tax_percent or Decimal("6.5"),
        notary_and_land_registry_percent=listing.notary_and_land_registry_percent or Decimal("2.0"),
        expected_initial_capex=listing.expected_initial_capex or Decimal("0"),
        financing_interest_rate_percent=financing.interest_rate_percent,
        amortization_rate_percent=financing.amortization_rate_percent,
        loan_to_value_percent=financing.loan_to_value_percent,
        equity_contribution=financing.equity_contribution,
        tax=TaxAssumptions(
            corporate_tax_rate_percent=tax.corporate_tax_rate_percent,
            solidarity_surcharge_rate_percent=tax.solidarity_surcharge_rate_percent,
            trade_tax_rate_percent=tax.trade_tax_rate_percent,
            assumes_extended_property_deduction=tax.assumes_extended_property_deduction,
            depreciation_rate_percent=tax.depreciation_rate_percent,
            building_share_percent=tax.building_share_percent,
            interest_deductible=tax.interest_deductible,
        ),
    )


def build_score_input(db: Session, deal: Deal, underwriting: dict[str, Any]) -> DealScoringInput:
    listing = deal.listing
    if listing is None:
        raise HTTPException(status_code=400, detail="Deal has no source listing.")
    rent = build_rent_law_payload(deal)
    location = latest(deal.location_scores)
    current_rent_per_sqm = divide(listing.cold_rent_monthly, listing.living_area_sqm)
    return DealScoringInput(
        gross_initial_yield_percent=to_decimal(underwriting.get("gross_initial_yield_percent")),
        net_initial_yield_percent=to_decimal(underwriting.get("net_initial_yield_percent")),
        monthly_cashflow_before_tax=to_decimal(underwriting.get("monthly_cashflow_before_tax")),
        dscr=to_decimal(underwriting.get("dscr")),
        price_per_sqm=to_decimal(underwriting.get("price_per_sqm")),
        market_price_per_sqm=deal.market_price_per_sqm,
        house_money_monthly=listing.house_money_monthly,
        non_recoverable_costs_monthly=listing.non_recoverable_costs_monthly,
        energy_class=listing.energy_class,
        expected_initial_capex=listing.expected_initial_capex,
        maintenance_reserve_weg=listing.maintenance_reserve_weg,
        address_complete=bool(listing.street and listing.city and listing.postal_code),
        is_rented=listing.is_rented,
        current_rent_per_sqm=current_rent_per_sqm,
        legally_plausible_target_rent_per_sqm=to_decimal(rent.get("legally_plausible_target_rent_per_sqm")),
        location=LocationMetricsInput(**model_to_dict(location)) if location else LocationMetricsInput(),
    )


def build_rent_law_payload(deal: Deal) -> dict[str, Any]:
    listing = deal.listing
    if listing is None:
        return {}
    result = check_rent_law_plausibility(
        RentLawInput(
            current_rent_per_sqm=divide(listing.cold_rent_monthly, listing.living_area_sqm),
            market_rent_per_sqm=divide(listing.market_rent_estimate_monthly, listing.living_area_sqm),
            local_reference_rent_per_sqm=deal.local_reference_rent_per_sqm,
            rent_control_area=deal.rent_control_area,
        )
    )
    return json_safe(result.model_dump())


def divide(value: Optional[Decimal], denominator: Optional[Decimal]) -> Optional[Decimal]:
    if value is None or denominator in (None, 0):
        return None
    return value / denominator


def default_reference_rent_per_sqm(listing: Listing) -> Optional[Decimal]:
    market = divide(listing.market_rent_estimate_monthly, listing.living_area_sqm)
    if market is None:
        return None
    return (market * Decimal("0.90")).quantize(Decimal("0.01"))


def default_market_price_per_sqm(listing: Listing) -> Optional[Decimal]:
    city_defaults = {
        "Leipzig": Decimal("3400"),
        "Berlin": Decimal("7000"),
        "Hamburg": Decimal("5900"),
        "Dortmund": Decimal("2900"),
        "Essen": Decimal("2600"),
        "Dresden": Decimal("3100"),
        "Hannover": Decimal("3100"),
        "Munich": Decimal("9200"),
    }
    return city_defaults.get(listing.city) or divide(listing.purchase_price, listing.living_area_sqm)


def model_to_dict(model: Any) -> dict[str, Any]:
    if model is None:
        return {}
    return json_safe({column.name: getattr(model, column.name) for column in model.__table__.columns})


def to_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    return value if isinstance(value, Decimal) else Decimal(str(value))


def json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    return value
