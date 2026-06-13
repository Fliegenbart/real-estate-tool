from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


Money = Numeric(14, 2)
Percent = Numeric(8, 3)
Area = Numeric(10, 2)


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(80), default="manual")
    external_id: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    street: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    house_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    federal_state: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    purchase_price: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    living_area_sqm: Mapped[Optional[Decimal]] = mapped_column(Area, nullable=True)
    number_of_rooms: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    floor: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    construction_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    energy_class: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    heating_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    energy_consumption_kwh: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    is_rented: Mapped[bool] = mapped_column(Boolean, default=False)
    cold_rent_monthly: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    market_rent_estimate_monthly: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    house_money_monthly: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    non_recoverable_costs_monthly: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    maintenance_reserve_weg: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    broker_fee_percent: Mapped[Optional[Decimal]] = mapped_column(Percent, nullable=True)
    property_transfer_tax_percent: Mapped[Optional[Decimal]] = mapped_column(Percent, nullable=True)
    notary_and_land_registry_percent: Mapped[Optional[Decimal]] = mapped_column(Percent, nullable=True)
    expected_initial_capex: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    listing_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(40), default="active")

    deals: Mapped[list["Deal"]] = relationship(back_populates="listing")
    price_events: Mapped[list["ListingPriceEvent"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )


class ListingPriceEvent(Base):
    __tablename__ = "listing_price_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"))
    price: Mapped[Decimal] = mapped_column(Money)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    source: Mapped[str] = mapped_column(String(80), default="manual")

    listing: Mapped[Listing] = relationship(back_populates="price_events")


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    street: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    house_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    federal_state: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    units: Mapped[list["Unit"]] = relationship(back_populates="property")
    deals: Mapped[list["Deal"]] = relationship(back_populates="property")


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    living_area_sqm: Mapped[Optional[Decimal]] = mapped_column(Area, nullable=True)
    number_of_rooms: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    floor: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    energy_class: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    heating_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    property: Mapped[Property] = relationship(back_populates="units")


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    listing_id: Mapped[Optional[int]] = mapped_column(ForeignKey("listings.id"), nullable=True)
    property_id: Mapped[Optional[int]] = mapped_column(ForeignKey("properties.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(40), default="active")
    pipeline_stage: Mapped[str] = mapped_column(String(80), default="New")
    purchase_price: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    market_price_per_sqm: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    local_reference_rent_per_sqm: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    rent_control_area: Mapped[bool] = mapped_column(Boolean, default=True)
    seller_motive: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    listing: Mapped[Optional[Listing]] = relationship(back_populates="deals")
    property: Mapped[Optional[Property]] = relationship(back_populates="deals")
    underwriting_cases: Mapped[list["UnderwritingCase"]] = relationship(back_populates="deal")
    financing_scenarios: Mapped[list["FinancingScenario"]] = relationship(back_populates="deal")
    tax_scenarios: Mapped[list["TaxScenario"]] = relationship(back_populates="deal")
    location_scores: Mapped[list["LocationScore"]] = relationship(back_populates="deal")
    risk_flags: Mapped[list["RiskFlag"]] = relationship(back_populates="deal")
    scores: Mapped[list["DealScore"]] = relationship(back_populates="deal")
    documents: Mapped[list["Document"]] = relationship(back_populates="deal")
    pipeline_items: Mapped[list["DealPipelineItem"]] = relationship(back_populates="deal")
    weg_health_records: Mapped[list["WegHealthRecord"]] = relationship(back_populates="deal")
    capital_stacks: Mapped[list["CapitalStackScenario"]] = relationship(back_populates="deal")
    geo_contexts: Mapped[list["GeoContext"]] = relationship(back_populates="deal")


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ags: Mapped[Optional[str]] = mapped_column(String(12), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(160))
    level: Mapped[str] = mapped_column(String(40), default="gemeinde")  # kreis | gemeinde | stadtteil
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("regions.id"), nullable=True)
    federal_state: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    population: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    metrics: Mapped[list["RegionMetric"]] = relationship(
        back_populates="region", cascade="all, delete-orphan"
    )


class RegionMetric(Base):
    __tablename__ = "region_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"))
    metric: Mapped[str] = mapped_column(String(80))
    value: Mapped[Decimal] = mapped_column(Numeric(14, 4))
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("data_sources.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    region: Mapped[Region] = relationship(back_populates="metrics")


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    provider: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    data_type: Mapped[str] = mapped_column(String(80), default="other")
    license_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    commercial_use_allowed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    attribution_required: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    geographic_coverage: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_import_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source_data_date: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    update_frequency: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    reliability_score: Mapped[int] = mapped_column(Integer, default=50)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class GeoContext(Base):
    __tablename__ = "geo_contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    parcel_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    ground_value_eur_per_sqm: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    ground_value_source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("data_sources.id"), nullable=True)
    ground_value_data_date: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    zoning_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    b_plan_available: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    f_plan_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    milieu_protection_area: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    redevelopment_area: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    monument_protection: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship(back_populates="geo_contexts")


class WegHealthRecord(Base):
    __tablename__ = "weg_health_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship(back_populates="weg_health_records")


class CapitalStackScenario(Base):
    __tablename__ = "capital_stack_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    name: Mapped[str] = mapped_column(String(120), default="Stack A")
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship(back_populates="capital_stacks")


class UnderwritingCase(Base):
    __tablename__ = "underwriting_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    name: Mapped[str] = mapped_column(String(120), default="Base case")
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped[Deal] = relationship(back_populates="underwriting_cases")


class FinancingScenario(Base):
    __tablename__ = "financing_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    name: Mapped[str] = mapped_column(String(120), default="Base financing")
    interest_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("4.0"))
    amortization_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("2.0"))
    loan_to_value_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("75.0"))
    capex_financed_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("0.0"))
    equity_contribution: Mapped[Optional[Decimal]] = mapped_column(Money, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped[Deal] = relationship(back_populates="financing_scenarios")


class TaxScenario(Base):
    __tablename__ = "tax_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    corporate_tax_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("15.0"))
    solidarity_surcharge_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("5.5"))
    trade_tax_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("0.0"))
    assumes_extended_property_deduction: Mapped[bool] = mapped_column(Boolean, default=True)
    depreciation_rate_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("2.0"))
    building_share_percent: Mapped[Decimal] = mapped_column(Percent, default=Decimal("80.0"))
    interest_deductible: Mapped[bool] = mapped_column(Boolean, default=True)
    warning: Mapped[str] = mapped_column(
        Text,
        default="Tax calculation is simplified and must be reviewed by a Steuerberater.",
    )

    deal: Mapped[Deal] = relationship(back_populates="tax_scenarios")


class LocationScore(Base):
    __tablename__ = "location_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    population_trend_score: Mapped[int] = mapped_column(Integer, default=60)
    vacancy_risk_score: Mapped[int] = mapped_column(Integer, default=60)
    purchasing_power_score: Mapped[int] = mapped_column(Integer, default=60)
    public_transport_score: Mapped[int] = mapped_column(Integer, default=60)
    employer_access_score: Mapped[int] = mapped_column(Integer, default=60)
    micro_location_score: Mapped[int] = mapped_column(Integer, default=60)
    noise_risk_score: Mapped[int] = mapped_column(Integer, default=60)
    flood_risk_score: Mapped[int] = mapped_column(Integer, default=60)
    source: Mapped[str] = mapped_column(String(80), default="mock/manual")

    deal: Mapped[Deal] = relationship(back_populates="location_scores")


class RiskFlag(Base):
    __tablename__ = "risk_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    code: Mapped[str] = mapped_column(String(120))
    label: Mapped[str] = mapped_column(String(240))
    severity: Mapped[str] = mapped_column(String(40), default="medium")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped[Deal] = relationship(back_populates="risk_flags")


class DealScore(Base):
    __tablename__ = "deal_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    total_score: Mapped[int] = mapped_column(Integer)
    category_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    explanation: Mapped[str] = mapped_column(Text)
    positive_factors: Mapped[list] = mapped_column(JSON, default=list)
    negative_factors: Mapped[list] = mapped_column(JSON, default=list)
    red_flags: Mapped[list] = mapped_column(JSON, default=list)
    next_recommended_action: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped[Deal] = relationship(back_populates="scores")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    document_type: Mapped[str] = mapped_column(String(80))
    file_name: Mapped[str] = mapped_column(String(240))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(80), default="not_reviewed")
    risk_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    deal: Mapped[Deal] = relationship(back_populates="documents")


class DealPipelineItem(Base):
    __tablename__ = "deal_pipeline_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id"))
    stage: Mapped[str] = mapped_column(String(80), default="New")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped[Deal] = relationship(back_populates="pipeline_items")
