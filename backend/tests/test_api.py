from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import app
from tests.helpers import import_alert_listings


def test_json_listing_import_endpoint_persists_normalized_listing():
    client = TestClient(app)

    response = client.post(
        "/api/listings/import",
        json={
            "format": "json",
            "source": "unit_test_json",
            "items": [
                {
                    "title": "JSON import test apartment",
                    "city": "Leipzig",
                    "postal_code": "04109",
                    "purchase_price": "210000",
                    "living_area_sqm": "62.5",
                    "is_rented": "ja",
                    "cold_rent_monthly": "890,50",
                    "unknown_field": "ignored",
                }
            ],
        },
    )

    assert response.status_code == 201
    listing_id = response.json()["ids"][0]

    listing_response = client.get(f"/api/listings/{listing_id}")
    assert listing_response.status_code == 200
    listing = listing_response.json()
    assert listing["source"] == "unit_test_json"
    assert listing["title"] == "JSON import test apartment"
    assert listing["purchase_price"] == 210000.0
    assert listing["living_area_sqm"] == 62.5
    assert listing["is_rented"] is True
    assert "unknown_field" not in listing


def test_csv_listing_import_endpoint_persists_normalized_listing():
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "title,city,postal_code,purchase_price,living_area_sqm,is_rented,cold_rent_monthly",
            "CSV import test apartment,Dresden,01067,185000,55,true,760",
        ]
    )

    response = client.post(
        "/api/listings/import",
        json={
            "format": "csv",
            "source": "unit_test_csv",
            "content": csv_content,
        },
    )

    assert response.status_code == 201
    listing_id = response.json()["ids"][0]

    listing_response = client.get(f"/api/listings/{listing_id}")
    assert listing_response.status_code == 200
    listing = listing_response.json()
    assert listing["source"] == "unit_test_csv"
    assert listing["city"] == "Dresden"
    assert listing["purchase_price"] == 185000.0
    assert listing["is_rented"] is True


def test_demo_listing_import_endpoint_is_removed():
    client = TestClient(app)

    response = client.post("/api/listings/import/demo")

    assert response.status_code == 404


def test_email_import_convert_underwrite_score_and_memo_flow():
    client = TestClient(app)

    listings = import_alert_listings(client)
    first_listing_id = listings[0]["id"]

    convert_response = client.post(f"/api/listings/{first_listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    converted_deal = convert_response.json()
    deal_id = converted_deal["id"]
    assert converted_deal["region_outlook"]["category_scores"]["urban_environment_quality"] > 0
    assert any(
        metric["name"] == "urban_environment_quality_score"
        for metric in converted_deal["region_outlook"]["key_metrics"]
    )

    location_response = client.patch(
        f"/api/deals/{deal_id}/location",
        json={
            "transit_access_score": 92,
            "daily_needs_score": 88,
            "demand_anchor_score": 90,
            "leisure_quality_score": 78,
            "short_term_rental_score": 70,
            "nuisance_resilience_score": 52,
        },
    )
    assert location_response.status_code == 200
    patched_location = location_response.json()
    assert patched_location.get("transit_access_score") == 92
    assert patched_location.get("micro_location_score") == 82

    deal_response = client.get(f"/api/deals/{deal_id}")
    assert deal_response.status_code == 200
    deal_payload = deal_response.json()
    key_metrics = {metric["name"]: metric["value"] for metric in deal_payload["region_outlook"]["key_metrics"]}
    assert key_metrics["micro_location_score"] == 82
    assert key_metrics["short_term_rental_score"] == 70
    assert len(deal_payload["region_outlook"]["micro_location_factors"]) == 6
    profile_names = {profile["name"] for profile in deal_payload["region_outlook"]["target_group_profiles"]}
    assert {"commuter", "family", "student", "short_term_guest"}.issubset(profile_names)

    evidence_response = client.patch(
        f"/api/deals/{deal_id}/location/evidence",
        json={
            "nearest_rapid_transit_meters": 350,
            "nearest_regional_rail_meters": 900,
            "nearest_bus_stop_meters": 180,
            "peak_transit_departures_per_hour": 18,
            "supermarkets_1000m": 3,
            "pharmacies_1000m": 2,
            "doctors_1500m": 6,
            "schools_1500m": 2,
            "major_employers_3000m": 4,
            "nearest_university_meters": 1400,
            "nearest_hospital_meters": 2300,
            "nearest_trade_fair_meters": 3800,
            "parks_1000m": 2,
            "leisure_pois_1500m": 9,
            "cultural_pois_1500m": 4,
            "waterfront_meters": 900,
            "short_term_rental_occupancy_percent": 78,
            "tourist_anchor_meters": 1200,
            "short_term_rental_legal_status": "restricted",
            "main_road_meters": 120,
            "rail_noise_meters": 650,
            "nightlife_pois_500m": 6,
            "industrial_landuse_meters": 1800,
            "source": "manual_site_research",
        },
    )
    assert evidence_response.status_code == 200
    evidence_payload = evidence_response.json()
    assert evidence_payload["location"]["source"] == "manual_site_research"
    assert evidence_payload["location"]["short_term_rental_score"] == 70
    assert evidence_payload["location"]["nuisance_resilience_score"] < 60
    assert evidence_payload["location"]["evidence_confidence"] == "high"
    assert evidence_payload["location"]["evidence_data_completeness_percent"] >= 80
    assert any("Transit and daily-needs" in note for note in evidence_payload["location"]["evidence_notes"])
    assert evidence_payload["location"]["evidence_inputs"]["nearest_rapid_transit_meters"] == 350
    assert evidence_payload["location"]["evidence_inputs"]["nearest_trade_fair_meters"] == 3800
    assert evidence_payload["location"]["evidence_inputs"]["short_term_rental_legal_status"] == "restricted"
    assert evidence_payload["evidence"]["confidence"] == "high"
    assert evidence_payload["region_outlook"]["micro_location_factors"][0]["name"] == "transit_access_score"
    assert evidence_payload["region_outlook"]["target_group_profiles"][0]["label"]

    deal_after_evidence_response = client.get(f"/api/deals/{deal_id}")
    assert deal_after_evidence_response.status_code == 200
    deal_after_evidence = deal_after_evidence_response.json()
    assert deal_after_evidence["location"]["evidence_confidence"] == "high"
    assert deal_after_evidence["location"]["evidence_data_completeness_percent"] >= 80
    assert any("Transit and daily-needs" in note for note in deal_after_evidence["location"]["evidence_notes"])
    assert deal_after_evidence["location"]["evidence_inputs"]["nearest_rapid_transit_meters"] == 350
    assert deal_after_evidence["location"]["evidence_inputs"]["nearest_trade_fair_meters"] == 3800

    osm_response = client.patch(
        f"/api/deals/{deal_id}/location/osm",
        json={
            "latitude": 52.0,
            "longitude": 13.0,
            "elements": [
                {"type": "node", "id": 1, "lat": 52.003, "lon": 13.0, "tags": {"railway": "station"}},
                {"type": "node", "id": 2, "lat": 52.001, "lon": 13.0, "tags": {"highway": "bus_stop"}},
                {"type": "node", "id": 3, "lat": 52.002, "lon": 13.0, "tags": {"shop": "supermarket"}},
                {"type": "node", "id": 4, "lat": 52.004, "lon": 13.0, "tags": {"amenity": "pharmacy"}},
                {"type": "node", "id": 5, "lat": 52.012, "lon": 13.0, "tags": {"amenity": "university"}},
                {"type": "node", "id": 6, "lat": 52.004, "lon": 13.001, "tags": {"leisure": "park"}},
                {"type": "node", "id": 7, "lat": 52.001, "lon": 13.001, "tags": {"amenity": "bar"}},
                {"type": "way", "id": 8, "center": {"lat": 52.001, "lon": 13.0}, "tags": {"highway": "primary"}},
            ],
        },
    )
    assert osm_response.status_code == 200
    osm_payload = osm_response.json()
    assert osm_payload["location"]["source"] == "openstreetmap/overpass"
    assert osm_payload["evidence"]["nearest_rapid_transit_meters"] <= 340
    assert osm_payload["evidence"]["supermarkets_1000m"] == 1
    assert osm_payload["location"]["evidence_inputs"]["nearest_rapid_transit_meters"] <= 340
    assert osm_payload["location"]["evidence_inputs"]["supermarkets_1000m"] == 1
    assert osm_payload["region_outlook"]["micro_location_factors"]

    address_osm_response = client.patch(
        f"/api/deals/{deal_id}/location/osm-from-address",
        json={
            "geocode_result": {
                "latitude": 52.51720765,
                "longitude": 13.3978344,
                "display_name": "Unter den Linden 1, Berlin",
                "confidence": "high",
                "source": "nominatim_fixture",
            },
            "osm_elements": [
                {"type": "node", "id": 1, "lat": 52.520, "lon": 13.3978344, "tags": {"railway": "station"}},
                {"type": "node", "id": 2, "lat": 52.518, "lon": 13.3978344, "tags": {"shop": "supermarket"}},
                {"type": "node", "id": 3, "lat": 52.518, "lon": 13.398, "tags": {"amenity": "pharmacy"}},
                {"type": "node", "id": 4, "lat": 52.518, "lon": 13.398, "tags": {"leisure": "park"}},
            ],
        },
    )
    assert address_osm_response.status_code == 200
    address_osm_payload = address_osm_response.json()
    assert address_osm_payload["geocode"]["source"] == "nominatim_fixture"
    assert address_osm_payload["listing"]["latitude"] == 52.517208
    assert address_osm_payload["property"]["longitude"] == 13.397834
    assert address_osm_payload["location"]["source"] == "openstreetmap/overpass"
    assert address_osm_payload["evidence"]["nearest_rapid_transit_meters"] <= 320

    underwriting_response = client.post(f"/api/deals/{deal_id}/underwrite")
    assert underwriting_response.status_code == 200
    assert "gross_initial_yield_percent" in underwriting_response.json()

    score_response = client.post(f"/api/deals/{deal_id}/score")
    assert score_response.status_code == 200
    assert "total_score" in score_response.json()

    memo_response = client.get(f"/api/deals/{deal_id}/investment-memo")
    assert memo_response.status_code == 200
    assert memo_response.json()["sections"][0]["title"] == "Executive summary"


def test_deal_payload_contains_audit_log_for_underwriting_score_and_pipeline():
    client = TestClient(app)
    listings = import_alert_listings(client)
    listing_id = listings[0]["id"]

    convert_response = client.post(f"/api/listings/{listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    deal_id = convert_response.json()["id"]

    assert client.post(f"/api/deals/{deal_id}/underwrite").status_code == 200
    assert client.post(f"/api/deals/{deal_id}/score").status_code == 200
    pipeline_response = client.patch(
        f"/api/deals/{deal_id}/pipeline",
        json={"stage": "Underwriting", "notes": "Zahlen liegen vor - Underwriting pruefen."},
    )
    assert pipeline_response.status_code == 200

    deal_payload = client.get(f"/api/deals/{deal_id}").json()
    audit_log = deal_payload["audit_log"]

    assert [item["event_type"] for item in audit_log[:4]] == [
        "pipeline",
        "score",
        "underwriting",
        "pipeline",
    ]
    assert audit_log[0]["label"] == "Pipeline: Underwriting"
    assert audit_log[0]["detail"] == "Zahlen liegen vor - Underwriting pruefen."
    assert audit_log[1]["label"].startswith("Score gerechnet")
    assert audit_log[1]["metric_label"] == "Score"
    assert audit_log[1]["metric_value"] is not None
    assert audit_log[2]["label"] == "Underwriting gerechnet"
    assert audit_log[2]["metric_label"] == "Cashflow"
    assert audit_log[2]["metric_value"] is not None
    assert audit_log[3]["label"] == "Pipeline: New"
    assert all(item["created_at"] for item in audit_log)


def test_investment_memo_pdf_endpoint_returns_real_pdf_with_memo_content():
    client = TestClient(app)
    listings = import_alert_listings(client)
    listing_id = listings[0]["id"]

    convert_response = client.post(f"/api/listings/{listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    deal_id = convert_response.json()["id"]
    assert client.post(f"/api/deals/{deal_id}/underwrite").status_code == 200
    assert client.post(f"/api/deals/{deal_id}/score").status_code == 200

    pdf_response = client.get(f"/api/deals/{deal_id}/investment-memo.pdf")

    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert "investment-memo" in pdf_response.headers["content-disposition"]
    assert pdf_response.content.startswith(b"%PDF")
    reader = PdfReader(BytesIO(pdf_response.content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Investment memo" in text
    assert "Executive summary" in text
    assert "IC Entscheidungs-Gate" in text
    assert "Angebotsfreigabe" in text
    assert "Open due diligence questions" in text


def test_document_review_update_returns_refreshed_deal_payload():
    client = TestClient(app)
    listings = import_alert_listings(client)
    listing_id = listings[0]["id"]

    convert_response = client.post(f"/api/listings/{listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    deal_id = convert_response.json()["id"]

    document_response = client.post(
        f"/api/deals/{deal_id}/documents",
        json={
            "document_type": "energy_certificate",
            "file_name": "Energieausweis.pdf",
            "review_status": "not_reviewed",
            "risk_notes": "Heizung und Endenergiebedarf pruefen.",
        },
    )
    assert document_response.status_code == 201
    document_id = document_response.json()["id"]

    update_response = client.patch(
        f"/api/deals/{deal_id}/documents/{document_id}",
        json={
            "review_status": "reviewed",
            "risk_notes": "Energieausweis fachlich geprueft; keine Sofortmassnahme.",
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    updated_document = next(item for item in payload["documents"] if item["id"] == document_id)
    assert updated_document["review_status"] == "reviewed"
    assert updated_document["risk_notes"] == "Energieausweis fachlich geprueft; keine Sofortmassnahme."
    assert payload["id"] == deal_id


def test_pipeline_blocks_offer_stage_until_acquisition_gates_are_ready():
    client = TestClient(app)

    listings = import_alert_listings(client)
    first_listing_id = listings[0]["id"]
    convert_response = client.post(f"/api/listings/{first_listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    deal_id = convert_response.json()["id"]

    underwriting_response = client.post(f"/api/deals/{deal_id}/underwrite")
    assert underwriting_response.status_code == 200
    score_response = client.post(f"/api/deals/{deal_id}/score")
    assert score_response.status_code == 200

    blocked_response = client.patch(
        f"/api/deals/{deal_id}/pipeline",
        json={"stage": "Offer submitted"},
    )

    assert blocked_response.status_code == 409
    assert "Ankaufsfreigabe" in blocked_response.json()["detail"]
    assert "Offer submitted" in blocked_response.json()["detail"]
    assert "Gates bestanden" in blocked_response.json()["detail"]
    assert "Unterlagen" in blocked_response.json()["detail"]
    assert "Geo/Baurecht" in blocked_response.json()["detail"]

    rejected_response = client.patch(
        f"/api/deals/{deal_id}/pipeline",
        json={"stage": "Rejected", "notes": "Cashflow gate failed."},
    )
    assert rejected_response.status_code == 200
    assert rejected_response.json()["pipeline_stage"] == "Rejected"


def test_osm_from_address_requires_public_geocoding_user_agent(monkeypatch):
    monkeypatch.delenv("NOMINATIM_API_URL", raising=False)
    monkeypatch.delenv("NOMINATIM_USER_AGENT", raising=False)
    client = TestClient(app, raise_server_exceptions=False)

    listings = import_alert_listings(client)
    first_listing_id = listings[0]["id"]
    convert_response = client.post(f"/api/listings/{first_listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    deal_id = convert_response.json()["id"]

    response = client.patch(
        f"/api/deals/{deal_id}/location/osm-from-address",
        json={"allow_external_geocoding": True, "osm_elements": []},
    )

    assert response.status_code == 400
    assert "NOMINATIM_USER_AGENT" in response.json()["detail"]
