from app.services.micro_location import MicroLocationEvidenceInput, score_micro_location_evidence
from app.services.scoring import LocationMetricsInput, score_region_outlook


def test_micro_location_evidence_turns_measured_context_into_scores():
    result = score_micro_location_evidence(
        MicroLocationEvidenceInput(
            nearest_rapid_transit_meters=350,
            nearest_regional_rail_meters=900,
            nearest_bus_stop_meters=180,
            peak_transit_departures_per_hour=18,
            supermarkets_1000m=3,
            pharmacies_1000m=2,
            doctors_1500m=6,
            schools_1500m=2,
            major_employers_3000m=4,
            nearest_university_meters=1400,
            nearest_hospital_meters=2300,
            nearest_trade_fair_meters=3800,
            parks_1000m=2,
            leisure_pois_1500m=9,
            cultural_pois_1500m=4,
            waterfront_meters=900,
            short_term_rental_occupancy_percent=78,
            tourist_anchor_meters=1200,
            short_term_rental_legal_status="restricted",
            main_road_meters=120,
            rail_noise_meters=650,
            nightlife_pois_500m=6,
            industrial_landuse_meters=1800,
            source="manual_site_research",
        )
    )

    assert result.location.transit_access_score >= 90
    assert result.location.daily_needs_score >= 85
    assert result.location.demand_anchor_score >= 80
    assert result.location.leisure_quality_score >= 80
    assert result.location.short_term_rental_score == 70
    assert result.location.nuisance_resilience_score < 60
    assert result.location.micro_location_score >= 80
    assert result.data_completeness_percent >= 90
    assert result.confidence == "high"
    assert any("Short-term rental" in note and "restricted" in note for note in result.evidence_notes)


def test_micro_location_evidence_counts_recreation_and_hospitality_anchors():
    result = score_micro_location_evidence(
        MicroLocationEvidenceInput(
            restaurants_1000m=12,
            cafes_1000m=7,
            nearest_recreation_anchor_meters=650,
            tourist_anchor_meters=900,
            short_term_rental_occupancy_percent=82,
            short_term_rental_legal_status="allowed",
        )
    )

    assert result.location.leisure_quality_score >= 80
    assert result.location.short_term_rental_score >= 85
    assert any("recreation" in note.lower() or "hospitality" in note.lower() for note in result.evidence_notes)


def test_micro_location_evidence_counts_messe_hotels_airport_and_event_anchors():
    result = score_micro_location_evidence(
        MicroLocationEvidenceInput(
            nearest_rapid_transit_meters=280,
            nearest_event_venue_meters=900,
            nearest_trade_fair_meters=1800,
            hotels_1500m=6,
            nearest_airport_meters=4200,
            nearest_recreation_anchor_meters=1300,
            short_term_rental_occupancy_percent=76,
            short_term_rental_legal_status="allowed",
        )
    )

    assert result.location.demand_anchor_score >= 78
    assert result.location.short_term_rental_score >= 82
    assert result.location.leisure_quality_score >= 70
    assert any("Messe" in note or "Event" in note for note in result.evidence_notes)
    assert any("Hotel" in note or "Tourismus" in note for note in result.evidence_notes)


def test_region_outlook_explains_target_group_fit_from_micro_location():
    result = score_region_outlook(
        LocationMetricsInput(
            population_trend_score=78,
            vacancy_risk_score=82,
            purchasing_power_score=74,
            public_transport_score=90,
            employer_access_score=84,
            micro_location_score=60,
            transit_access_score=92,
            daily_needs_score=88,
            demand_anchor_score=86,
            leisure_quality_score=84,
            short_term_rental_score=78,
            nuisance_resilience_score=48,
            noise_risk_score=48,
            flood_risk_score=84,
        ),
        source="manual_site_research",
    )

    profiles = {profile["name"]: profile for profile in result.target_group_profiles}

    assert profiles["commuter"]["score"] >= 80
    assert profiles["family"]["score"] >= 75
    assert profiles["student"]["score"] >= 75
    assert profiles["short_term_guest"]["score"] >= 75
    assert "Laerm" in profiles["family"]["risks"][0]
    assert "Airbnb" in profiles["short_term_guest"]["next_check"]
