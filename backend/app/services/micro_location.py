from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

from app.services.scoring import LocationMetricsInput, clamp, normalized_location_values, weighted_score


LegalStatus = Literal["allowed", "restricted", "unclear", "prohibited"]


CORE_EVIDENCE_FIELDS = [
    "nearest_rapid_transit_meters",
    "nearest_regional_rail_meters",
    "nearest_bus_stop_meters",
    "peak_transit_departures_per_hour",
    "supermarkets_1000m",
    "pharmacies_1000m",
    "doctors_1500m",
    "schools_1500m",
    "major_employers_3000m",
    "nearest_university_meters",
    "nearest_hospital_meters",
    "nearest_trade_fair_meters",
    "parks_1000m",
    "leisure_pois_1500m",
    "cultural_pois_1500m",
    "waterfront_meters",
    "short_term_rental_occupancy_percent",
    "tourist_anchor_meters",
    "main_road_meters",
    "rail_noise_meters",
    "nightlife_pois_500m",
    "industrial_landuse_meters",
]

ENRICHMENT_EVIDENCE_FIELDS = [
    "restaurants_1000m",
    "cafes_1000m",
    "nearest_recreation_anchor_meters",
    "nearest_event_venue_meters",
    "hotels_1500m",
    "nearest_airport_meters",
]


class MicroLocationEvidenceInput(BaseModel):
    nearest_rapid_transit_meters: Optional[int] = None
    nearest_regional_rail_meters: Optional[int] = None
    nearest_bus_stop_meters: Optional[int] = None
    peak_transit_departures_per_hour: Optional[int] = None
    supermarkets_1000m: Optional[int] = None
    pharmacies_1000m: Optional[int] = None
    doctors_1500m: Optional[int] = None
    schools_1500m: Optional[int] = None
    major_employers_3000m: Optional[int] = None
    nearest_university_meters: Optional[int] = None
    nearest_hospital_meters: Optional[int] = None
    nearest_trade_fair_meters: Optional[int] = None
    parks_1000m: Optional[int] = None
    leisure_pois_1500m: Optional[int] = None
    cultural_pois_1500m: Optional[int] = None
    restaurants_1000m: Optional[int] = None
    cafes_1000m: Optional[int] = None
    nearest_recreation_anchor_meters: Optional[int] = None
    nearest_event_venue_meters: Optional[int] = None
    hotels_1500m: Optional[int] = None
    nearest_airport_meters: Optional[int] = None
    waterfront_meters: Optional[int] = None
    short_term_rental_occupancy_percent: Optional[int] = None
    tourist_anchor_meters: Optional[int] = None
    short_term_rental_legal_status: LegalStatus = "unclear"
    main_road_meters: Optional[int] = None
    rail_noise_meters: Optional[int] = None
    nightlife_pois_500m: Optional[int] = None
    industrial_landuse_meters: Optional[int] = None
    source: str = "manual_site_research"


class MicroLocationEvidenceResult(BaseModel):
    location: LocationMetricsInput
    factor_scores: dict[str, int]
    evidence_notes: list[str]
    data_completeness_percent: int
    confidence: str
    source: str


def score_micro_location_evidence(evidence: MicroLocationEvidenceInput) -> MicroLocationEvidenceResult:
    transit_access_score = weighted_score(
        {
            "rapid_transit": distance_score(evidence.nearest_rapid_transit_meters, excellent=400, poor=1600),
            "regional_rail": distance_score(evidence.nearest_regional_rail_meters, excellent=800, poor=3000, high=90, low=40),
            "bus": distance_score(evidence.nearest_bus_stop_meters, excellent=250, poor=900, high=85, low=45),
            "frequency": count_score(evidence.peak_transit_departures_per_hour, excellent=12, poor=2),
        },
        {"rapid_transit": 0.40, "regional_rail": 0.20, "bus": 0.15, "frequency": 0.25},
    )
    daily_needs_score = weighted_score(
        {
            "supermarkets": count_score(evidence.supermarkets_1000m, excellent=2),
            "pharmacies": count_score(evidence.pharmacies_1000m, excellent=1),
            "doctors": count_score(evidence.doctors_1500m, excellent=4),
            "schools": count_score(evidence.schools_1500m, excellent=2),
        },
        {"supermarkets": 0.35, "pharmacies": 0.20, "doctors": 0.25, "schools": 0.20},
    )
    trade_fair_event_score = max(
        distance_score(evidence.nearest_trade_fair_meters, excellent=4000, poor=12000, high=80, low=45),
        distance_score(evidence.nearest_event_venue_meters, excellent=1200, poor=6000, high=92, low=45),
    )
    airport_access_score = distance_score(evidence.nearest_airport_meters, excellent=5000, poor=18000, high=85, low=45)
    base_demand_anchor_score = weighted_score(
        {
            "employers": count_score(evidence.major_employers_3000m, excellent=3),
            "university": distance_score(evidence.nearest_university_meters, excellent=1500, poor=6500, high=90, low=45),
            "hospital": distance_score(evidence.nearest_hospital_meters, excellent=2500, poor=8000, high=85, low=45),
            "trade_fair_event": trade_fair_event_score,
        },
        {"employers": 0.30, "university": 0.22, "hospital": 0.18, "trade_fair_event": 0.30},
    )
    event_demand_anchor_score = weighted_score(
        {
            "trade_fair_event": trade_fair_event_score,
            "airport": airport_access_score,
            "employers": count_score(evidence.major_employers_3000m, excellent=3),
        },
        {"trade_fair_event": 0.55, "airport": 0.25, "employers": 0.20},
    )
    demand_anchor_score = max(base_demand_anchor_score, event_demand_anchor_score)
    base_leisure_score = weighted_score(
        {
            "parks": count_score(evidence.parks_1000m, excellent=2),
            "leisure": count_score(evidence.leisure_pois_1500m, excellent=6),
            "culture": count_score(evidence.cultural_pois_1500m, excellent=3, high=90),
            "waterfront": distance_score(evidence.waterfront_meters, excellent=1000, poor=5000, high=85, low=45),
        },
        {"parks": 0.30, "leisure": 0.30, "culture": 0.20, "waterfront": 0.20},
    )
    hospitality_recreation_score = weighted_score(
        {
            "restaurants": count_score(evidence.restaurants_1000m, excellent=8),
            "cafes": count_score(evidence.cafes_1000m, excellent=4),
            "recreation_anchor": distance_score(
                evidence.nearest_recreation_anchor_meters,
                excellent=1000,
                poor=7000,
                high=92,
                low=40,
            ),
            "event_venue": distance_score(evidence.nearest_event_venue_meters, excellent=1200, poor=6000, high=90, low=40),
            "hotels": count_score(evidence.hotels_1500m, excellent=5, high=88),
        },
        {"restaurants": 0.18, "cafes": 0.12, "recreation_anchor": 0.35, "event_venue": 0.22, "hotels": 0.13},
    )
    leisure_quality_score = max(
        base_leisure_score,
        hospitality_recreation_score,
        weighted_score(
            {"base_leisure": base_leisure_score, "hospitality_recreation": hospitality_recreation_score},
            {"base_leisure": 0.35, "hospitality_recreation": 0.65},
        ),
    )
    short_term_rental_score = short_term_score(evidence)
    nuisance_resilience_score = weighted_score(
        {
            "main_road": farther_distance_score(evidence.main_road_meters, excellent=600, poor=50),
            "rail_noise": farther_distance_score(evidence.rail_noise_meters, excellent=1200, poor=100),
            "nightlife": inverse_count_score(evidence.nightlife_pois_500m, excellent=0, poor=8),
            "industrial": farther_distance_score(evidence.industrial_landuse_meters, excellent=1500, poor=200),
        },
        {"main_road": 0.35, "rail_noise": 0.20, "nightlife": 0.30, "industrial": 0.15},
    )

    factor_scores = {
        "transit_access_score": transit_access_score,
        "daily_needs_score": daily_needs_score,
        "demand_anchor_score": demand_anchor_score,
        "leisure_quality_score": leisure_quality_score,
        "short_term_rental_score": short_term_rental_score,
        "nuisance_resilience_score": nuisance_resilience_score,
    }
    location_values = normalized_location_values(
        LocationMetricsInput(
            public_transport_score=transit_access_score,
            employer_access_score=demand_anchor_score,
            noise_risk_score=nuisance_resilience_score,
            **factor_scores,
        )
    )

    notes = evidence_notes(evidence, factor_scores)
    completeness = data_completeness_percent(evidence)
    return MicroLocationEvidenceResult(
        location=LocationMetricsInput(**location_values),
        factor_scores=factor_scores,
        evidence_notes=notes,
        data_completeness_percent=completeness,
        confidence=confidence_from_completeness(completeness),
        source=evidence.source,
    )


def distance_score(value: Optional[int], excellent: int, poor: int, high: int = 95, low: int = 35) -> int:
    if value is None:
        return 60
    if value <= excellent:
        return high
    if value >= poor:
        return low
    share = (value - excellent) / (poor - excellent)
    return clamp(high - share * (high - low))


def farther_distance_score(value: Optional[int], excellent: int, poor: int, high: int = 95, low: int = 35) -> int:
    if value is None:
        return 60
    if value >= excellent:
        return high
    if value <= poor:
        return low
    share = (value - poor) / (excellent - poor)
    return clamp(low + share * (high - low))


def count_score(value: Optional[int], excellent: int, poor: int = 0, high: int = 95, low: int = 40) -> int:
    if value is None:
        return 60
    if value >= excellent:
        return high
    if value <= poor:
        return low
    share = (value - poor) / (excellent - poor)
    return clamp(low + share * (high - low))


def inverse_count_score(value: Optional[int], excellent: int, poor: int, high: int = 95, low: int = 35) -> int:
    if value is None:
        return 60
    if value <= excellent:
        return high
    if value >= poor:
        return low
    share = (value - excellent) / (poor - excellent)
    return clamp(high - share * (high - low))


def short_term_score(evidence: MicroLocationEvidenceInput) -> int:
    tourism_score = max(
        distance_score(evidence.tourist_anchor_meters, excellent=1500, poor=8000, high=90, low=40),
        distance_score(evidence.nearest_recreation_anchor_meters, excellent=1500, poor=8000, high=88, low=40),
        distance_score(evidence.nearest_event_venue_meters, excellent=1500, poor=8000, high=90, low=40),
        distance_score(evidence.nearest_airport_meters, excellent=5000, poor=18000, high=82, low=40),
        count_score(evidence.hotels_1500m, excellent=5, high=90),
    )
    raw_score = weighted_score(
        {
            "occupancy": percentage_score(evidence.short_term_rental_occupancy_percent, excellent=75, poor=35),
            "tourism": tourism_score,
        },
        {"occupancy": 0.50, "tourism": 0.50},
    )
    caps = {"allowed": 100, "restricted": 70, "unclear": 60, "prohibited": 35}
    return min(raw_score, caps[evidence.short_term_rental_legal_status])


def percentage_score(value: Optional[int], excellent: int, poor: int, high: int = 95, low: int = 35) -> int:
    if value is None:
        return 60
    if value >= excellent:
        return high
    if value <= poor:
        return low
    share = (value - poor) / (excellent - poor)
    return clamp(low + share * (high - low))


def data_completeness_percent(evidence: MicroLocationEvidenceInput) -> int:
    values = evidence.model_dump()
    present_core = sum(1 for field in CORE_EVIDENCE_FIELDS if values.get(field) is not None)
    enrichment_bonus = sum(1 for field in ENRICHMENT_EVIDENCE_FIELDS if values.get(field) is not None) * 3
    return clamp((present_core / len(CORE_EVIDENCE_FIELDS)) * 100 + enrichment_bonus)


def confidence_from_completeness(completeness: int) -> str:
    if completeness >= 80:
        return "high"
    if completeness >= 50:
        return "medium"
    return "low"


def evidence_notes(evidence: MicroLocationEvidenceInput, factors: dict[str, int]) -> list[str]:
    notes = [
        "Scores are derived from measured micro-location evidence and can be replaced by OSM, GTFS, tourism, or licensed data later.",
        f"Short-term rental legal status is {evidence.short_term_rental_legal_status}; optional upside is capped accordingly.",
    ]
    if factors["nuisance_resilience_score"] < 60:
        notes.append("Nuisance evidence is material: validate road, rail, nightlife, and industrial exposure before bidding.")
    if factors["transit_access_score"] >= 80 and factors["daily_needs_score"] >= 80:
        notes.append("Transit and daily-needs evidence supports broad tenant demand.")
    if evidence.restaurants_1000m or evidence.cafes_1000m or evidence.nearest_recreation_anchor_meters:
        notes.append("Recreation and hospitality anchors support leisure quality; validate visitor pressure and noise separately.")
    if evidence.nearest_trade_fair_meters or evidence.nearest_event_venue_meters or evidence.nearest_airport_meters:
        notes.append("Messe-/Event-Anker or airport access can support business and short-stay demand; validate seasonality.")
    if evidence.hotels_1500m:
        notes.append("Hotel-/Tourismusumfeld can support short-term rental optionality, but it is not a base-case rent assumption.")
    return notes
