from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import (
    CapitalStackScenario,
    DataSource,
    Deal,
    DealPipelineItem,
    DealScore,
    Document,
    FinancingScenario,
    GeoContext,
    Listing,
    ListingPriceEvent,
    LocationScore,
    Property,
    Region,
    RegionMetric,
    RenovationCase,
    RiskFlag,
    TaxScenario,
    UnderwritingCase,
    Unit,
    WegHealthRecord,
)
from app.services.data_sources import DEFAULT_DATA_SOURCES
from app.services.email_ingest import parse_alert_email, parse_single_expose
from app.services.risk_engine import build_risk_matrix
from app.services.signals import derive_signals
from app.services.acquisition import (
    AcquisitionAssumptions,
    build_bank_package,
    build_command_center,
)
from app.services.financing import (
    CapitalStackInput,
    GiftPropertyInput,
    analyze_capital_stack,
    compare_gift_property_strategies,
)
from app.services.geocoding import AddressInput, GeocodeResult, geocode_address
from app.services.germany import rent_control_lookup, transfer_tax_percent_for_state
from app.services.ingestion import normalize_listing_row, parse_import
from app.services.location import MockLocationEnrichmentService
from app.services.memo import build_investment_memo
from app.services.memo_pdf import build_investment_memo_pdf
from app.services.micro_location import MicroLocationEvidenceInput, score_micro_location_evidence
from app.services.negotiation import NegotiationContext, build_negotiation_dossier
from app.services.osm_micro_location import OsmMicroLocationInput, evidence_from_osm_input
from app.services.region_data import REGION_DATA_SOURCES, SEED_CITIES, SEED_METRIC_COLUMNS, SEED_SOURCE_NAME
from app.services.region_import import (
    RegionImportConfig,
    find_or_create_region,
    get_or_create_source,
    import_region_csv,
    refresh_own_market_metrics,
    set_metric,
)
from app.services.region_score import score_region
from app.services.rent_law import RentLawInput, check_rent_law_plausibility
from app.services.renovation import RenovationPlanInput, analyze_renovation_plan
from app.services.scoring import (
    DealScoringInput,
    LocationMetricsInput,
    normalized_location_values,
    score_deal,
    score_region_outlook,
)
from app.services.tax_briefing import build_tax_briefing
from app.services.underwriting import TaxAssumptions, UnderwritingInput, calculate_underwriting
from app.services.weg_health import WegHealthInput, assess_weg_health


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

GATED_PIPELINE_STAGES = {
    "Offer submitted",
    "Due diligence",
    "Notary",
    "Bought",
}

REQUIRED_DUE_DILIGENCE_DOCUMENTS = {
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
}

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
DOCUMENT_REVIEW_STATUSES = {"not_reviewed", "reviewed", "approved", "rejected"}

LOCATION_SCORE_FIELDS = [
    "population_trend_score",
    "vacancy_risk_score",
    "purchasing_power_score",
    "public_transport_score",
    "employer_access_score",
    "micro_location_score",
    "transit_access_score",
    "daily_needs_score",
    "demand_anchor_score",
    "leisure_quality_score",
    "short_term_rental_score",
    "nuisance_resilience_score",
    "noise_risk_score",
    "flood_risk_score",
    "climate_resilience_score",
]
MICRO_LOCATION_EVIDENCE_UPDATE_FIELDS = [
    "public_transport_score",
    "employer_access_score",
    "micro_location_score",
    "transit_access_score",
    "daily_needs_score",
    "demand_anchor_score",
    "leisure_quality_score",
    "short_term_rental_score",
    "nuisance_resilience_score",
    "noise_risk_score",
]


app = FastAPI(title="German Real Estate Acquisition MVP", version="0.1.0")

_cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """Hosted deployments set API_KEY; without it (local dev) the API is open.
    Health stays public for monitoring, OPTIONS for CORS preflights."""
    expected = os.environ.get("API_KEY")
    if (
        expected
        and request.method != "OPTIONS"
        and request.url.path.startswith("/api")
        and request.url.path != "/api/health"
        and request.headers.get("x-api-key") != expected
    ):
        return JSONResponse(status_code=401, content={"detail": "API key required."})
    return await call_next(request)


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
    capex_financed_percent: Optional[Decimal] = None
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
    transit_access_score: Optional[int] = None
    daily_needs_score: Optional[int] = None
    demand_anchor_score: Optional[int] = None
    leisure_quality_score: Optional[int] = None
    short_term_rental_score: Optional[int] = None
    nuisance_resilience_score: Optional[int] = None
    noise_risk_score: Optional[int] = None
    flood_risk_score: Optional[int] = None


class AddressOsmRefreshRequest(BaseModel):
    geocode_result: Optional[GeocodeResult] = None
    osm_elements: Optional[list[dict[str, Any]]] = None
    radius_meters: int = 3000
    allow_external_geocoding: bool = False


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


class DocumentReviewUpdate(BaseModel):
    review_status: Optional[str] = None
    risk_notes: Optional[str] = None
    extracted_text: Optional[str] = None


class PipelineUpdate(BaseModel):
    stage: str
    notes: Optional[str] = None


SELLER_MOTIVES = {"inheritance", "divorce", "financing_pressure", "tired_landlord", "relocation", "unknown"}


class DealUpdate(BaseModel):
    seller_motive: Optional[str] = None


class EmailImportRequest(BaseModel):
    content: str
    source: str = "email_alert"


class ExposeParseRequest(BaseModel):
    content: str
    source: str = "manual"


class CapitalStackRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = "Stack A"
    tranches: list[dict[str, Any]]
    lender_effective_tax_rate_percent: Decimal = Decimal("30.0")


class DataSourcePayload(BaseModel):
    name: str
    provider: Optional[str] = None
    data_type: str = "other"
    license_type: Optional[str] = None
    commercial_use_allowed: Optional[bool] = None
    attribution_required: Optional[bool] = None
    geographic_coverage: Optional[str] = None
    url: Optional[str] = None
    source_data_date: Optional[str] = None
    update_frequency: Optional[str] = None
    reliability_score: int = 50
    notes: Optional[str] = None


class GeoContextUpdate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    parcel_id: Optional[str] = None
    ground_value_eur_per_sqm: Optional[Decimal] = None
    ground_value_source_id: Optional[int] = None
    ground_value_data_date: Optional[str] = None
    zoning_summary: Optional[str] = None
    b_plan_available: Optional[bool] = None
    f_plan_summary: Optional[str] = None
    milieu_protection_area: Optional[bool] = None
    redevelopment_area: Optional[bool] = None
    monument_protection: Optional[bool] = None
    notes: Optional[str] = None


class RenovationPlanRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    planned_capex: Decimal
    target_cold_rent_monthly: Decimal
    valuation_yield_percent: Decimal = Decimal("4.5")
    refinance_ltv_percent: Decimal = Decimal("75")
    target_energy_class: Optional[str] = None


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
    apply_state_defaults(listing)
    db.add(listing)
    db.flush()
    record_price_event(db, listing)
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
    price_changed = (
        "purchase_price" in clean
        and clean["purchase_price"] is not None
        and clean["purchase_price"] != listing.purchase_price
    )
    for key, value in clean.items():
        if hasattr(listing, key):
            setattr(listing, key, value)
    listing.last_seen_at = datetime.utcnow()
    if price_changed:
        record_price_event(db, listing)
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
    return upsert_listing_rows(db, rows, payload.source)


@app.post("/api/listings/parse-expose")
def parse_expose(payload: ExposeParseRequest) -> dict[str, Any]:
    """Parse a pasted expose into a listing draft for review - does not save."""
    draft = parse_single_expose(payload.content, source=payload.source)
    if draft is None:
        raise HTTPException(
            status_code=400,
            detail="Kein Kaufpreis erkennbar. Bitte Kerndaten manuell ergaenzen.",
        )
    return json_safe(draft)


@app.post("/api/listings/import/email", status_code=status.HTTP_201_CREATED)
def import_email_listings(payload: EmailImportRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = parse_alert_email(payload.content, source=payload.source)
    if not rows:
        raise HTTPException(status_code=400, detail="No listings with a price found in the email content.")
    return upsert_listing_rows(db, rows, payload.source)


@app.delete("/api/demo-data")
def clear_demo_data(db: Session = Depends(get_db)) -> dict[str, int]:
    """Remove demo seed listings and everything hanging off them - real data
    stays untouched."""
    listings = db.query(Listing).filter(Listing.source == "demo_seed").all()
    listing_ids = [listing.id for listing in listings]
    deals = (
        db.query(Deal).filter(Deal.listing_id.in_(listing_ids)).all() if listing_ids else []
    )
    deal_ids = [deal.id for deal in deals]
    property_ids = [deal.property_id for deal in deals if deal.property_id is not None]
    if deal_ids:
        for model in [
            UnderwritingCase,
            FinancingScenario,
            TaxScenario,
            LocationScore,
            RiskFlag,
            DealScore,
            Document,
            DealPipelineItem,
            WegHealthRecord,
            CapitalStackScenario,
            GeoContext,
        ]:
            db.query(model).filter(model.deal_id.in_(deal_ids)).delete(synchronize_session=False)
        db.query(Deal).filter(Deal.id.in_(deal_ids)).delete(synchronize_session=False)
    if property_ids:
        db.query(Unit).filter(Unit.property_id.in_(property_ids)).delete(synchronize_session=False)
        db.query(Property).filter(Property.id.in_(property_ids)).delete(synchronize_session=False)
    if listing_ids:
        db.query(ListingPriceEvent).filter(ListingPriceEvent.listing_id.in_(listing_ids)).delete(
            synchronize_session=False
        )
        db.query(Listing).filter(Listing.id.in_(listing_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted_listings": len(listing_ids), "deleted_deals": len(deals)}


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
    rent_control = rent_control_lookup(listing.city, listing.federal_state)
    deal = Deal(
        listing_id=listing.id,
        property_id=prop.id,
        title=listing.title,
        purchase_price=listing.purchase_price,
        market_price_per_sqm=default_market_price_per_sqm(listing),
        local_reference_rent_per_sqm=default_reference_rent_per_sqm(listing),
        rent_control_area=bool(rent_control.applies),
        pipeline_stage="New",
    )
    db.add(deal)
    db.flush()

    db.add(FinancingScenario(deal_id=deal.id))
    db.add(TaxScenario(deal_id=deal.id))
    location = MockLocationEnrichmentService().enrich(listing.city, listing.postal_code)
    location_score = LocationScore(
        deal_id=deal.id,
        **location_score_values(location),
    )
    region = find_region_for_city(db, listing.city)
    if region is not None:
        region_result = score_region(region_metrics_dict(region), region.population)
        location_score.population_trend_score = region_result.category_scores["demand_stability"]
        location_score.vacancy_risk_score = region_result.category_scores["demand_stability"]
        location_score.purchasing_power_score = region_result.category_scores["economic_base"]
        location_score.employer_access_score = region_result.category_scores["economic_base"]
        location_score.source = "region_data"
    db.add(location_score)
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
    weg_record = latest(deal.weg_health_records)
    weg_flags = (weg_record.results or {}).get("flags", []) if weg_record else []
    result_payload["red_flags"] = sorted(set(result_payload["red_flags"] + manual_flags + weg_flags))
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
    apply_derived_location_scores(location)
    location.source = "manual"
    db.commit()
    db.refresh(location)
    return model_to_dict(location)


@app.patch("/api/deals/{deal_id}/location/evidence")
def update_location_from_evidence(
    deal_id: int, payload: MicroLocationEvidenceInput, db: Session = Depends(get_db)
) -> dict[str, Any]:
    return apply_micro_location_evidence_to_deal(deal_id, payload, db)


def apply_micro_location_evidence_to_deal(
    deal_id: int, evidence: MicroLocationEvidenceInput, db: Session
) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    result = score_micro_location_evidence(evidence)
    stored_evidence_inputs = json_safe(evidence.model_dump())
    location = latest(deal.location_scores)
    if location is None:
        location = LocationScore(deal_id=deal.id)
        db.add(location)
    for field in MICRO_LOCATION_EVIDENCE_UPDATE_FIELDS:
        setattr(location, field, getattr(result.location, field))
    apply_derived_location_scores(location)
    location.source = result.source
    location.evidence_confidence = result.confidence
    location.evidence_data_completeness_percent = result.data_completeness_percent
    location.evidence_notes = result.evidence_notes
    location.evidence_inputs = stored_evidence_inputs
    db.commit()
    db.refresh(location)
    evidence_payload = dict(stored_evidence_inputs)
    evidence_payload["confidence"] = result.confidence
    evidence_payload["data_completeness_percent"] = result.data_completeness_percent
    evidence_payload["evidence_notes"] = result.evidence_notes
    return {
        "location": model_to_dict(location),
        "evidence": json_safe(evidence_payload),
        "evidence_result": json_safe(result.model_dump()),
        "region_outlook": build_region_outlook_payload(location),
    }


def resolve_deal_geocode(deal: Deal, payload: AddressOsmRefreshRequest) -> GeocodeResult:
    if payload.geocode_result is not None:
        return payload.geocode_result
    existing = existing_deal_geocode(deal)
    if existing is not None:
        return existing
    if not payload.allow_external_geocoding:
        raise HTTPException(
            status_code=400,
            detail="No coordinates available. Provide geocode_result or set allow_external_geocoding=true.",
        )
    try:
        return geocode_address(address_input_for_deal(deal))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def existing_deal_geocode(deal: Deal) -> Optional[GeocodeResult]:
    for source_name, obj in [("listing", deal.listing), ("property", deal.property)]:
        if obj is not None and obj.latitude is not None and obj.longitude is not None:
            return GeocodeResult(
                latitude=float(obj.latitude),
                longitude=float(obj.longitude),
                display_name=f"Existing {source_name} coordinates",
                confidence="high",
                source=f"{source_name}_coordinates",
            )
    return None


def address_input_for_deal(deal: Deal) -> AddressInput:
    obj = deal.listing or deal.property
    if obj is None:
        raise HTTPException(status_code=400, detail="Deal has no listing or property address.")
    return AddressInput(
        street=obj.street,
        house_number=obj.house_number,
        postal_code=obj.postal_code,
        city=obj.city,
        federal_state=obj.federal_state,
    )


def persist_deal_coordinates(deal: Deal, geocode: GeocodeResult) -> None:
    lat = Decimal(str(geocode.latitude))
    lon = Decimal(str(geocode.longitude))
    if deal.listing is not None:
        deal.listing.latitude = lat
        deal.listing.longitude = lon
    if deal.property is not None:
        deal.property.latitude = lat
        deal.property.longitude = lon


@app.patch("/api/deals/{deal_id}/location/osm")
def update_location_from_osm(
    deal_id: int, payload: OsmMicroLocationInput, db: Session = Depends(get_db)
) -> dict[str, Any]:
    evidence = evidence_from_osm_input(payload)
    return apply_micro_location_evidence_to_deal(deal_id, evidence, db)


@app.patch("/api/deals/{deal_id}/location/osm-from-address")
def update_location_from_address_osm(
    deal_id: int, payload: AddressOsmRefreshRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    geocode = resolve_deal_geocode(deal, payload)
    persist_deal_coordinates(deal, geocode)
    db.flush()
    evidence = evidence_from_osm_input(
        OsmMicroLocationInput(
            latitude=geocode.latitude,
            longitude=geocode.longitude,
            radius_meters=payload.radius_meters,
            elements=payload.osm_elements,
        )
    )
    result = apply_micro_location_evidence_to_deal(deal_id, evidence, db)
    db.refresh(deal)
    result["geocode"] = json_safe(geocode.model_dump())
    result["listing"] = listing_to_dict(deal.listing) if deal.listing else None
    result["property"] = model_to_dict(deal.property) if deal.property else None
    return result


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
    if payload.review_status not in DOCUMENT_REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported document review status.")
    document = Document(deal_id=deal.id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return model_to_dict(document)


@app.patch("/api/deals/{deal_id}/documents/{document_id}")
def update_document_review(
    deal_id: int, document_id: int, payload: DocumentReviewUpdate, db: Session = Depends(get_db)
) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    document = db.get(Document, document_id)
    if document is None or document.deal_id != deal.id:
        raise HTTPException(status_code=404, detail="Document not found for deal.")
    update_data = payload.model_dump(exclude_unset=True)
    review_status = update_data.get("review_status")
    if review_status is not None and review_status not in DOCUMENT_REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported document review status.")
    for key, value in update_data.items():
        setattr(document, key, value)
    deal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(deal)
    return deal_detail_payload(db, deal)


@app.patch("/api/deals/{deal_id}/pipeline")
def update_pipeline(deal_id: int, payload: PipelineUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    if payload.stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail="Unsupported pipeline stage.")
    pipeline_gate = pipeline_stage_gate_summary(deal, payload.stage)
    if pipeline_gate["blocked"]:
        raise HTTPException(status_code=409, detail=pipeline_gate["message"])
    deal.pipeline_stage = payload.stage
    deal.updated_at = datetime.utcnow()
    item = DealPipelineItem(deal_id=deal.id, stage=payload.stage, notes=payload.notes)
    db.add(item)
    db.commit()
    db.refresh(deal)
    return deal_detail_payload(db, deal)


def pipeline_stage_gate_summary(deal: Deal, target_stage: str) -> dict[str, Any]:
    if target_stage not in GATED_PIPELINE_STAGES or target_stage == deal.pipeline_stage or target_stage == "Rejected":
        return {"blocked": False, "ready_count": 6, "total": 6, "blockers": [], "message": ""}

    blockers = pipeline_stage_gate_blockers(deal)
    ready_count = 6 - len(blockers)
    if not blockers:
        return {"blocked": False, "ready_count": ready_count, "total": 6, "blockers": [], "message": ""}

    message = (
        f"Ankaufsfreigabe blockiert {target_stage}: {ready_count}/6 Gates bestanden. "
        f"Offen: {', '.join(blockers)}."
    )
    return {
        "blocked": True,
        "ready_count": ready_count,
        "total": 6,
        "blockers": blockers,
        "message": message,
    }


def pipeline_stage_gate_blockers(deal: Deal) -> list[str]:
    blockers: list[str] = []
    latest_underwriting = latest(deal.underwriting_cases)
    latest_score = latest(deal.scores)
    latest_location = latest(deal.location_scores)

    underwriting_results = latest_underwriting.results if latest_underwriting else {}
    cashflow = to_decimal(underwriting_results.get("monthly_cashflow_before_tax"))
    dscr = to_decimal(underwriting_results.get("dscr"))
    if latest_underwriting is None or cashflow is None or cashflow < 0 or dscr is None or dscr < Decimal("1.10"):
        blockers.append("Wirtschaftlichkeit")

    reviewed_documents = {
        document.document_type
        for document in deal.documents
        if document.review_status in {"reviewed", "approved"}
    }
    if not REQUIRED_DUE_DILIGENCE_DOCUMENTS.issubset(reviewed_documents):
        blockers.append("Unterlagen")

    location_score = latest_location.micro_location_score if latest_location else None
    location_completeness = latest_location.evidence_data_completeness_percent if latest_location else None
    location_confidence = latest_location.evidence_confidence if latest_location else None
    if (
        latest_location is None
        or location_score is None
        or location_score < 70
        or location_completeness is None
        or location_completeness < 70
        or location_confidence == "low"
    ):
        blockers.append("Mikrolage")

    weg = latest(deal.weg_health_records)
    weg_results = weg.results if weg else {}
    if (
        weg is None
        or int(weg_results.get("total_score") or 0) < 60
        or int(weg_results.get("data_completeness_percent") or 0) < 70
    ):
        blockers.append("WEG")

    geo_payload = geo_context_payload(latest(deal.geo_contexts))
    geo_confidence = int(geo_payload.get("data_confidence_percent") or 0) if geo_payload else 0
    geo_has_special_topic = bool(
        geo_payload
        and (
            geo_payload.get("milieu_protection_area")
            or geo_payload.get("redevelopment_area")
            or geo_payload.get("monument_protection")
        )
    )
    if geo_payload is None or geo_confidence < 70 or geo_has_special_topic:
        blockers.append("Geo/Baurecht")

    red_flags = set(latest_score.red_flags if latest_score else [])
    high_risk_flags = {
        flag.code
        for flag in deal.risk_flags
        if flag.severity.lower() in {"high", "critical", "red", "block"}
    }
    if red_flags or high_risk_flags:
        blockers.append("Risiken")

    return blockers


@app.patch("/api/deals/{deal_id}")
def update_deal(deal_id: int, payload: DealUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    if payload.seller_motive is not None:
        if payload.seller_motive not in SELLER_MOTIVES:
            raise HTTPException(status_code=400, detail=f"seller_motive must be one of {sorted(SELLER_MOTIVES)}")
        deal.seller_motive = payload.seller_motive
    deal.updated_at = datetime.utcnow()
    db.commit()
    return deal_detail_payload(db, deal)


@app.put("/api/deals/{deal_id}/weg-health")
def update_weg_health(deal_id: int, payload: WegHealthInput, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    result = assess_weg_health(payload)
    record = latest(deal.weg_health_records)
    if record is None:
        record = WegHealthRecord(deal_id=deal.id)
        db.add(record)
    record.inputs = json_safe(payload.model_dump())
    record.results = json_safe(result.model_dump())
    record.updated_at = datetime.utcnow()
    db.commit()
    return record.results


@app.get("/api/deals/{deal_id}/negotiation-dossier")
def negotiation_dossier(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    listing = deal.listing
    if listing is None or listing.purchase_price is None:
        raise HTTPException(status_code=400, detail="Deal needs a listing with a purchase price.")
    payload = deal_detail_payload(db, deal)
    underwriting = payload.get("latest_underwriting") or {}
    rent_law = payload.get("rent_law") or {}
    weg = (payload.get("weg_health") or {}).get("results") or {}
    weg_inputs = (payload.get("weg_health") or {}).get("inputs") or {}
    listing_dict = payload.get("listing") or {}

    unfunded = None
    measures = weg_inputs.get("planned_measures") or []
    if measures:
        unfunded_total = sum(
            Decimal(str(m.get("estimated_cost_eur") or 0))
            for m in measures
            if m.get("funded_by") != "reserve"
        )
        reserve = Decimal(str(weg_inputs.get("reserve_total_eur") or 0))
        if unfunded_total > reserve:
            unfunded = unfunded_total - reserve

    ctx = NegotiationContext(
        asking_price=listing.purchase_price,
        living_area_sqm=listing.living_area_sqm,
        energy_class=listing.energy_class,
        construction_year=listing.construction_year,
        price_per_sqm=to_decimal(underwriting.get("price_per_sqm")) or divide(listing.purchase_price, listing.living_area_sqm),
        market_price_per_sqm=deal.market_price_per_sqm,
        monthly_cold_rent=listing.cold_rent_monthly,
        market_rent_monthly=listing.market_rent_estimate_monthly,
        legally_plausible_target_rent_per_sqm=to_decimal(rent_law.get("legally_plausible_target_rent_per_sqm")),
        rent_control_area=deal.rent_control_area,
        house_money_monthly=listing.house_money_monthly,
        non_recoverable_costs_monthly=listing.non_recoverable_costs_monthly,
        maintenance_reserve_weg=listing.maintenance_reserve_weg,
        expected_initial_capex=listing.expected_initial_capex,
        monthly_cashflow_before_tax=to_decimal(underwriting.get("monthly_cashflow_before_tax")),
        dscr=to_decimal(underwriting.get("dscr")),
        maximum_purchase_price_for_target_yield=to_decimal(
            underwriting.get("maximum_purchase_price_for_target_yield")
        ),
        days_on_market=listing_dict.get("days_on_market"),
        price_reduction_total_percent=to_decimal(listing_dict.get("price_reduction_total_percent")),
        price_reduction_count=listing_dict.get("price_reduction_count") or 0,
        weg_health_score=weg.get("total_score"),
        weg_flags=weg.get("flags") or [],
        weg_unfunded_measures_eur=unfunded,
        seller_motive=deal.seller_motive,
    )
    return json_safe(build_negotiation_dossier(ctx).model_dump())


@app.post("/api/deals/{deal_id}/capital-stack")
def create_capital_stack(deal_id: int, payload: CapitalStackRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    underwriting = latest(deal.underwriting_cases)
    if underwriting is None:
        raise HTTPException(status_code=400, detail="Run underwriting first - the stack needs NOI and all-in price.")
    results = underwriting.results or {}
    tax = latest(deal.tax_scenarios)
    effective_rate = Decimal("15.825")
    if tax is not None:
        solidarity = tax.corporate_tax_rate_percent * tax.solidarity_surcharge_rate_percent / Decimal("100")
        trade = Decimal("0") if tax.assumes_extended_property_deduction else tax.trade_tax_rate_percent
        effective_rate = tax.corporate_tax_rate_percent + solidarity + trade

    annual_depreciation = Decimal("0")
    if deal.listing and deal.listing.purchase_price and tax is not None:
        annual_depreciation = (
            deal.listing.purchase_price
            * tax.building_share_percent
            / Decimal("100")
            * tax.depreciation_rate_percent
            / Decimal("100")
        )

    stack_input = CapitalStackInput(
        name=payload.name,
        all_in_purchase_price=to_decimal(results.get("all_in_purchase_price")) or Decimal("0"),
        net_operating_income=to_decimal(results.get("net_operating_income")) or Decimal("0"),
        tranches=payload.tranches,
        borrower_effective_tax_rate_percent=effective_rate,
        lender_effective_tax_rate_percent=payload.lender_effective_tax_rate_percent,
        annual_depreciation=annual_depreciation,
    )
    result = analyze_capital_stack(stack_input)
    scenario = CapitalStackScenario(
        deal_id=deal.id,
        name=payload.name,
        inputs=json_safe(stack_input.model_dump()),
        results=json_safe(result.model_dump()),
    )
    db.add(scenario)
    db.commit()
    return scenario.results


@app.get("/api/deals/{deal_id}/capital-stacks")
def list_capital_stacks(deal_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    deal = require_deal(db, deal_id)
    return [
        {"id": item.id, "name": item.name, "created_at": json_safe(item.created_at), "results": item.results}
        for item in sorted(deal.capital_stacks, key=lambda s: s.id, reverse=True)
    ]


@app.get("/api/deals/{deal_id}/tax-briefing")
def tax_briefing(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    return build_tax_briefing(deal_detail_payload(db, deal))


@app.post("/api/financing/gift-property-strategies")
def gift_property_strategies(payload: GiftPropertyInput) -> dict[str, Any]:
    return json_safe(compare_gift_property_strategies(payload).model_dump())


@app.get("/api/deals/{deal_id}/risk-matrix")
def risk_matrix(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    payload = deal_detail_payload(db, deal)
    score = payload.get("latest_score") or {}
    signal_types = [signal["type"] for signal in payload.get("signals") or []]
    matrix = build_risk_matrix(score.get("red_flags") or [], signal_types)
    return json_safe(matrix.model_dump())


@app.patch("/api/deals/{deal_id}/geo-context")
def update_geo_context(deal_id: int, payload: GeoContextUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    if payload.ground_value_source_id is not None and db.get(DataSource, payload.ground_value_source_id) is None:
        raise HTTPException(status_code=400, detail="ground_value_source_id does not reference a data source.")
    context = latest(deal.geo_contexts)
    if context is None:
        context = GeoContext(deal_id=deal.id)
        db.add(context)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(context, key, value)
    context.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(context)
    return geo_context_payload(context)


@app.get("/api/data-sources")
def list_data_sources(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    sources = db.query(DataSource).order_by(DataSource.data_type, DataSource.name).all()
    return [model_to_dict(source) for source in sources]


@app.post("/api/data-sources", status_code=status.HTTP_201_CREATED)
def create_data_source(payload: DataSourcePayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    source = DataSource(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return model_to_dict(source)


@app.post("/api/data-sources/seed-defaults", status_code=status.HTTP_201_CREATED)
def seed_default_data_sources(db: Session = Depends(get_db)) -> dict[str, Any]:
    existing_names = {name for (name,) in db.query(DataSource.name).all()}
    created = 0
    for row in DEFAULT_DATA_SOURCES:
        if row["name"] in existing_names:
            continue
        db.add(DataSource(**row))
        created += 1
    db.commit()
    return {"created": created, "skipped": len(DEFAULT_DATA_SOURCES) - created}


@app.patch("/api/data-sources/{source_id}")
def update_data_source(source_id: int, payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    source = db.get(DataSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Data source not found.")
    for key, value in payload.items():
        if key != "id" and hasattr(source, key):
            setattr(source, key, value)
    db.commit()
    db.refresh(source)
    return model_to_dict(source)


@app.delete("/api/data-sources/{source_id}")
def delete_data_source(source_id: int, db: Session = Depends(get_db)) -> dict[str, int]:
    source = db.get(DataSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Data source not found.")
    db.delete(source)
    db.commit()
    return {"deleted": source_id}


@app.get("/api/regions")
def list_regions(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    regions = db.query(Region).order_by(Region.name).all()
    payloads = [region_payload(region) for region in regions]
    payloads.sort(key=lambda item: item["score"]["total_score"], reverse=True)
    return payloads


@app.get("/api/regions/{region_id}")
def get_region(region_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    region = db.get(Region, region_id)
    if region is None:
        raise HTTPException(status_code=404, detail="Region not found.")
    payload = region_payload(region)
    payload["metrics_detail"] = [
        {
            "metric": metric.metric,
            "value": json_safe(metric.value),
            "year": metric.year,
            "source_id": metric.source_id,
        }
        for metric in sorted(region.metrics, key=lambda m: m.metric)
    ]
    return payload


@app.post("/api/regions/seed-defaults", status_code=status.HTTP_201_CREATED)
def seed_region_defaults(db: Session = Depends(get_db)) -> dict[str, Any]:
    existing_sources = {name for (name,) in db.query(DataSource.name).all()}
    for row in REGION_DATA_SOURCES:
        if row["name"] not in existing_sources:
            db.add(DataSource(**row))
    db.flush()
    source = get_or_create_source(db, SEED_SOURCE_NAME)

    created = 0
    for name, state, population, price, rent, vacancy, unemployment, forecast, climate in SEED_CITIES:
        region = find_or_create_region(
            db, name=name, level="gemeinde", federal_state=state, population=population
        )
        values = [price, rent, vacancy, unemployment, forecast, climate]
        for metric_name, value in zip(SEED_METRIC_COLUMNS, values):
            existing = (
                db.query(RegionMetric)
                .filter(RegionMetric.region_id == region.id, RegionMetric.metric == metric_name)
                .first()
            )
            # Seed never overwrites real imports or own flow data.
            if existing is not None and existing.source_id != source.id:
                continue
            set_metric(db, region, metric_name, Decimal(str(value)), source.id)
        created += 1
    db.commit()
    return {"regions": created}


@app.post("/api/regions/import", status_code=status.HTTP_201_CREATED)
def import_regions(config: RegionImportConfig, db: Session = Depends(get_db)) -> dict[str, Any]:
    return import_region_csv(db, config)


@app.post("/api/regions/refresh-own-metrics")
def refresh_own_metrics(db: Session = Depends(get_db)) -> dict[str, Any]:
    return refresh_own_market_metrics(db)


def region_metrics_dict(region: Region) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for metric in sorted(region.metrics, key=lambda m: m.id):
        metrics[metric.metric] = metric.value
    return metrics


def region_payload(region: Region) -> dict[str, Any]:
    metrics = region_metrics_dict(region)
    score = score_region(metrics, region.population)
    return {
        "id": region.id,
        "ags": region.ags,
        "name": region.name,
        "level": region.level,
        "federal_state": region.federal_state,
        "population": region.population,
        "metrics": json_safe(metrics),
        "score": json_safe(score.model_dump()),
    }


def find_region_for_city(db: Session, city: Optional[str]) -> Optional[Region]:
    if not city:
        return None
    return (
        db.query(Region)
        .filter(Region.level.in_(["gemeinde", "kreis"]))
        .filter(Region.name.ilike(city.strip()))
        .first()
    )


@app.get("/api/deals/{deal_id}/investment-memo")
def investment_memo(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return investment_memo_payload(deal_id, db)


@app.get("/api/deals/{deal_id}/investment-memo.pdf")
def investment_memo_pdf(deal_id: int, db: Session = Depends(get_db)) -> Response:
    memo = investment_memo_payload(deal_id, db)
    pdf_bytes = build_investment_memo_pdf(memo)
    filename = f"investment-memo-deal-{deal_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def investment_memo_payload(deal_id: int, db: Session) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    payload = deal_detail_payload(db, deal)
    score = payload.get("latest_score") or {}
    signal_types = [signal["type"] for signal in payload.get("signals") or []]
    payload["risk_matrix"] = json_safe(
        build_risk_matrix(score.get("red_flags") or [], signal_types).model_dump()
    )
    return build_investment_memo(payload)


@app.get("/api/deals/{deal_id}/bank-package")
def bank_package(deal_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    payload = deal_detail_payload(db, deal)
    if payload.get("latest_underwriting") is None:
        result = calculate_underwriting(build_underwriting_input(deal))
        case = UnderwritingCase(
            deal_id=deal.id,
            name="Base case",
            inputs=json_safe(build_underwriting_input(deal).model_dump()),
            results=json_safe(result.model_dump()),
        )
        db.add(case)
        db.commit()
        payload = deal_detail_payload(db, deal)
    if payload.get("latest_score") is None:
        score_deal_endpoint(deal_id, db)
        payload = deal_detail_payload(db, deal)
    return json_safe(build_bank_package(payload).model_dump())


@app.post("/api/deals/{deal_id}/renovation-plan")
def renovation_plan(
    deal_id: int,
    payload: RenovationPlanRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    deal = require_deal(db, deal_id)
    listing = deal.listing
    if listing is None:
        raise HTTPException(status_code=400, detail="Deal has no source listing.")
    underwriting = latest(deal.underwriting_cases)
    if underwriting is None:
        result = calculate_underwriting(build_underwriting_input(deal))
        case = UnderwritingCase(
            deal_id=deal.id,
            name="Base case",
            inputs=json_safe(build_underwriting_input(deal).model_dump()),
            results=json_safe(result.model_dump()),
        )
        db.add(case)
        db.commit()
        db.refresh(deal)
        underwriting = latest(deal.underwriting_cases)
    underwriting_results = underwriting.results if underwriting else {}
    current_loan = to_decimal(underwriting_results.get("loan_amount")) or Decimal("0")
    current_rent = listing.cold_rent_monthly or listing.market_rent_estimate_monthly or Decimal("0")
    plan_input = RenovationPlanInput(
        purchase_price=listing.purchase_price or deal.purchase_price or Decimal("0"),
        current_cold_rent_monthly=current_rent,
        current_loan_amount=current_loan,
        planned_capex=payload.planned_capex,
        target_cold_rent_monthly=payload.target_cold_rent_monthly,
        valuation_yield_percent=payload.valuation_yield_percent,
        refinance_ltv_percent=payload.refinance_ltv_percent,
        current_energy_class=listing.energy_class,
        target_energy_class=payload.target_energy_class,
    )
    result = analyze_renovation_plan(plan_input)
    db.add(
        RenovationCase(
            deal_id=deal.id,
            inputs=json_safe(plan_input.model_dump()),
            results=json_safe(result.model_dump()),
        )
    )
    db.commit()
    return json_safe(result.model_dump())


@app.post("/api/acquisition/command-center")
def acquisition_command_center(
    assumptions: AcquisitionAssumptions,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    deals = db.query(Deal).order_by(Deal.created_at.desc(), Deal.id.desc()).all()
    listings = db.query(Listing).order_by(Listing.first_seen_at.desc(), Listing.id.desc()).all()
    deal_payloads = [deal_detail_payload(db, deal) for deal in deals]
    listing_payloads = [listing_to_dict(listing) for listing in listings]
    return build_command_center(deal_payloads, listing_payloads, assumptions)


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


def apply_state_defaults(listing: Listing) -> None:
    if listing.federal_state and listing.property_transfer_tax_percent in (None, Decimal("6.5")):
        state_rate = transfer_tax_percent_for_state(listing.federal_state)
        if state_rate is not None:
            listing.property_transfer_tax_percent = state_rate


def record_price_event(db: Session, listing: Listing, source: Optional[str] = None) -> None:
    if listing.purchase_price is None:
        return
    db.add(
        ListingPriceEvent(
            listing_id=listing.id,
            price=listing.purchase_price,
            source=source or listing.source or "manual",
        )
    )


def upsert_listing_rows(db: Session, rows: list[dict[str, Any]], source: str) -> dict[str, Any]:
    created: list[int] = []
    updated: list[int] = []
    for row in rows:
        if row.get("source") in (None, "manual"):
            row["source"] = source
        existing: Optional[Listing] = None
        if row.get("external_id"):
            existing = (
                db.query(Listing)
                .filter(Listing.source == row["source"], Listing.external_id == row["external_id"])
                .first()
            )
        if existing is not None:
            new_price = row.get("purchase_price")
            price_changed = new_price is not None and new_price != existing.purchase_price
            for key, value in row.items():
                if value is not None and hasattr(existing, key):
                    setattr(existing, key, value)
            existing.last_seen_at = datetime.utcnow()
            if price_changed:
                record_price_event(db, existing)
            updated.append(existing.id)
        else:
            listing = Listing(**row)
            apply_state_defaults(listing)
            db.add(listing)
            db.flush()
            record_price_event(db, listing)
            created.append(listing.id)
    db.commit()
    return {"imported": len(created), "updated": len(updated), "ids": created + updated}


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
        WegHealthRecord,
        CapitalStackScenario,
        RenovationCase,
        GeoContext,
        ListingPriceEvent,
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
    data = model_to_dict(listing)
    if listing.first_seen_at:
        data["days_on_market"] = max((datetime.utcnow() - listing.first_seen_at).days, 0)
    else:
        data["days_on_market"] = None
    events = sorted(listing.price_events, key=lambda event: event.id)
    data["price_events"] = [model_to_dict(event) for event in events]
    data["price_reduction_count"] = sum(
        1 for previous, current in zip(events, events[1:]) if current.price < previous.price
    )
    if events and events[0].price and events[-1].price < events[0].price:
        data["price_reduction_total_percent"] = float(
            round((Decimal("1") - events[-1].price / events[0].price) * Decimal("100"), 1)
        )
    else:
        data["price_reduction_total_percent"] = None
    data["signals"] = [signal.model_dump() for signal in derive_signals(data)]
    return data


def deal_detail_payload(db: Session, deal: Deal) -> dict[str, Any]:
    db.refresh(deal)
    latest_underwriting = latest(deal.underwriting_cases)
    latest_score = latest(deal.scores)
    financing = latest(deal.financing_scenarios)
    tax = latest(deal.tax_scenarios)
    location = latest(deal.location_scores)
    renovation_case = latest(deal.renovation_cases)
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
        "region_outlook": build_region_outlook_payload(location),
        "risk_flags": [model_to_dict(flag) for flag in deal.risk_flags],
        "documents": [model_to_dict(document) for document in deal.documents],
        "pipeline_history": [model_to_dict(item) for item in deal.pipeline_items],
        "audit_log": build_deal_audit_log(deal),
        "weg_health": weg_health_payload(deal),
        "capital_stacks": [
            {"id": item.id, "name": item.name, "results": item.results}
            for item in sorted(deal.capital_stacks, key=lambda s: s.id, reverse=True)
        ],
        "latest_renovation_case": model_to_dict(renovation_case) if renovation_case else None,
        "geo_context": geo_context_payload(latest(deal.geo_contexts)),
        "region": deal_region_summary(db, deal),
        "signals": [
            signal.model_dump()
            for signal in derive_signals(
                listing_to_dict(deal.listing) if deal.listing else {},
                {"market_price_per_sqm": deal.market_price_per_sqm},
            )
        ],
    }


def build_deal_audit_log(deal: Deal) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for item in deal.pipeline_items:
        events.append(
            {
                "id": f"pipeline-{item.id}",
                "event_type": "pipeline",
                "label": f"Pipeline: {item.stage}",
                "detail": item.notes or "Pipeline-Stufe gesetzt.",
                "metric_label": "Stage",
                "metric_value": item.stage,
                "created_at": json_safe(item.updated_at),
                "tone": "watch" if item.stage not in {"Bought", "Rejected"} else ("good" if item.stage == "Bought" else "risk"),
                "_sort_at": item.updated_at,
                "_sort_id": item.id,
            }
        )

    for case in deal.underwriting_cases:
        cashflow = case.results.get("monthly_cashflow_before_tax") if case.results else None
        dscr = case.results.get("dscr") if case.results else None
        events.append(
            {
                "id": f"underwriting-{case.id}",
                "event_type": "underwriting",
                "label": "Underwriting gerechnet",
                "detail": f"DSCR {dscr}" if dscr is not None else "Cashflow, DSCR und Kaufpreisanker gerechnet.",
                "metric_label": "Cashflow",
                "metric_value": cashflow,
                "created_at": json_safe(case.created_at),
                "tone": audit_metric_tone(cashflow, positive_is_good=True),
                "_sort_at": case.created_at,
                "_sort_id": case.id,
            }
        )

    for score in deal.scores:
        events.append(
            {
                "id": f"score-{score.id}",
                "event_type": "score",
                "label": f"Score gerechnet: {score.total_score}",
                "detail": score.next_recommended_action,
                "metric_label": "Score",
                "metric_value": score.total_score,
                "created_at": json_safe(score.created_at),
                "tone": "good" if score.total_score >= 75 else "watch" if score.total_score >= 60 else "risk",
                "_sort_at": score.created_at,
                "_sort_id": score.id,
            }
        )

    events.sort(key=lambda event: (event["_sort_at"], event["_sort_id"]), reverse=True)
    return [{key: value for key, value in event.items() if not key.startswith("_")} for event in events]


def audit_metric_tone(value: Any, positive_is_good: bool) -> str:
    numeric = to_decimal(value)
    if numeric is None:
        return "empty"
    if numeric >= 0:
        return "good" if positive_is_good else "risk"
    return "risk" if positive_is_good else "good"


def deal_region_summary(db: Session, deal: Deal) -> Optional[dict[str, Any]]:
    region = find_region_for_city(db, deal.listing.city if deal.listing else None)
    if region is None:
        return None
    score = score_region(region_metrics_dict(region), region.population)
    return {
        "id": region.id,
        "name": region.name,
        "total_score": score.total_score,
        "rent_factor": json_safe(score.rent_factor),
        "red_flags": score.red_flags,
        "recommendation": score.recommendation,
    }


def build_region_outlook_payload(location: Optional[LocationScore]) -> dict[str, Any]:
    if location is None:
        result = score_region_outlook(LocationMetricsInput())
    else:
        location_payload = model_to_dict(location)
        result = score_region_outlook(
            LocationMetricsInput(**location_payload),
            source=str(location_payload.get("source") or "mock/manual"),
        )
    return json_safe(result.model_dump())


def location_score_values(location: LocationMetricsInput) -> dict[str, int]:
    values = normalized_location_values(location)
    return {field: values[field] for field in LOCATION_SCORE_FIELDS}


def apply_derived_location_scores(location: LocationScore) -> None:
    values = location_score_values(LocationMetricsInput(**model_to_dict(location)))
    for field, value in values.items():
        setattr(location, field, value)


def weg_health_payload(deal: Deal) -> Optional[dict[str, Any]]:
    record = latest(deal.weg_health_records)
    if record is None:
        return None
    return {"inputs": record.inputs, "results": record.results, "updated_at": json_safe(record.updated_at)}


def geo_context_payload(context: Optional[GeoContext]) -> Optional[dict[str, Any]]:
    if context is None:
        return None
    data = model_to_dict(context)
    core_fields = [
        "ground_value_eur_per_sqm",
        "zoning_summary",
        "b_plan_available",
        "milieu_protection_area",
        "redevelopment_area",
        "monument_protection",
    ]
    filled = sum(1 for field in core_fields if data.get(field) is not None)
    data["data_confidence_percent"] = int(round(filled / len(core_fields) * 100))
    return data


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
        capex_financed_percent=financing.capex_financed_percent or Decimal("0"),
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
