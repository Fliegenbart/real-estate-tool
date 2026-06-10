from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _prepare_deal() -> int:
    client.post("/api/listings/import/demo")
    listing_id = client.get("/api/listings").json()[0]["id"]
    deal = client.post(f"/api/listings/{listing_id}/convert-to-deal").json()
    client.post(f"/api/deals/{deal['id']}/underwrite")
    return deal["id"]


def test_data_source_registry_seed_and_crud():
    seed = client.post("/api/data-sources/seed-defaults").json()
    assert seed["created"] >= 1

    # Seeding twice must not duplicate.
    second = client.post("/api/data-sources/seed-defaults").json()
    assert second["created"] == 0

    sources = client.get("/api/data-sources").json()
    names = [source["name"] for source in sources]
    assert "BORIS-D Bodenrichtwerte" in names

    boris = next(source for source in sources if source["name"] == "BORIS-D Bodenrichtwerte")
    updated = client.patch(f"/api/data-sources/{boris['id']}", json={"source_data_date": "2026-01-01"}).json()
    assert updated["source_data_date"] == "2026-01-01"


def test_geo_context_roundtrip_with_source_reference_and_confidence():
    deal_id = _prepare_deal()
    client.post("/api/data-sources/seed-defaults")
    boris = next(
        source for source in client.get("/api/data-sources").json() if source["name"] == "BORIS-D Bodenrichtwerte"
    )

    response = client.patch(
        f"/api/deals/{deal_id}/geo-context",
        json={
            "ground_value_eur_per_sqm": "850",
            "ground_value_source_id": boris["id"],
            "ground_value_data_date": "2025-12-31",
            "milieu_protection_area": False,
            "b_plan_available": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ground_value_eur_per_sqm"] == 850.0
    assert body["data_confidence_percent"] == 50  # 3 of 6 core fields filled

    deal = client.get(f"/api/deals/{deal_id}").json()
    assert deal["geo_context"]["ground_value_source_id"] == boris["id"]

    invalid = client.patch(f"/api/deals/{deal_id}/geo-context", json={"ground_value_source_id": 999999})
    assert invalid.status_code == 400


def test_risk_matrix_endpoint_and_memo_sections():
    deal_id = _prepare_deal()
    client.post(f"/api/deals/{deal_id}/score")

    matrix = client.get(f"/api/deals/{deal_id}/risk-matrix").json()
    assert "items" in matrix
    assert matrix["summary"]
    for item in matrix["items"]:
        assert item["title"]
        assert item["severity"] in {"low", "medium", "high"}

    memo = client.get(f"/api/deals/{deal_id}/investment-memo").json()
    titles = [section["title"] for section in memo["sections"]]
    assert "Opportunity signals" in titles
    assert "Risks & mitigations" in titles


def test_listing_payload_contains_signals():
    client.post("/api/listings/import/demo")
    listing = client.get("/api/listings").json()[0]
    assert "signals" in listing
    assert isinstance(listing["signals"], list)
