from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _prepare_deal() -> int:
    client.post("/api/listings/import/demo")
    listing_id = client.get("/api/listings").json()[0]["id"]
    deal = client.post(f"/api/listings/{listing_id}/convert-to-deal").json()
    client.post(f"/api/deals/{deal['id']}/underwrite")
    return deal["id"]


def test_underwriting_includes_schedule_and_stress_test():
    deal_id = _prepare_deal()
    result = client.post(f"/api/deals/{deal_id}/underwrite").json()

    assert len(result["amortization_schedule"]) == 10
    first, last = result["amortization_schedule"][0], result["amortization_schedule"][-1]
    assert first["interest"] > last["interest"]
    assert result["remaining_loan_after_holding"] == last["remaining"]
    assert result["stressed_interest_rate_percent"] is not None
    assert result["stressed_dscr"] is not None


def test_weg_health_roundtrip_feeds_score_red_flags():
    deal_id = _prepare_deal()
    response = client.put(
        f"/api/deals/{deal_id}/weg-health",
        json={
            "construction_year": 1970,
            "community_living_area_sqm": "2000",
            "reserve_total_eur": "5000",
            "litigation_pending": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_score"] <= 60
    assert "weg_reserve_critically_low" in body["flags"]

    score = client.post(f"/api/deals/{deal_id}/score").json()
    assert "weg_litigation_pending" in score["red_flags"]

    deal = client.get(f"/api/deals/{deal_id}").json()
    assert deal["weg_health"]["results"]["total_score"] == body["total_score"]


def test_negotiation_dossier_endpoint():
    deal_id = _prepare_deal()
    client.patch(f"/api/deals/{deal_id}", json={"seller_motive": "inheritance"})
    dossier = client.get(f"/api/deals/{deal_id}/negotiation-dossier").json()

    assert dossier["price_ladder"]["walk_away_price"] > 0
    assert dossier["price_ladder"]["anchor_price"] <= dossier["price_ladder"]["target_price"]
    assert dossier["opening_script"]
    assert "Erbengemeinschaften" in dossier["seller_angle"]


def test_capital_stack_and_tax_briefing_endpoints():
    deal_id = _prepare_deal()
    response = client.post(
        f"/api/deals/{deal_id}/capital-stack",
        json={
            "name": "Bank + GmbH",
            "tranches": [
                {"kind": "bank_loan", "amount": "150000", "interest_rate_percent": "4.0", "amortization_rate_percent": "2.0"},
                {"kind": "shareholder_loan", "amount": "30000", "interest_rate_percent": "3.0"},
                {"kind": "equity", "amount": "20000"},
            ],
        },
    )
    assert response.status_code == 200
    stack = response.json()
    assert stack["intercompany_interest_annual"] == 900.0
    assert stack["fremdvergleich_checklist"]

    stacks = client.get(f"/api/deals/{deal_id}/capital-stacks").json()
    assert len(stacks) == 1

    briefing = client.get(f"/api/deals/{deal_id}/tax-briefing").json()
    titles = [section["title"] for section in briefing["sections"]]
    assert any("Gewerbesteuerkuerzung" in title for title in titles)
    assert any("Chemnitz" in title for title in titles)


def test_gift_property_strategies_endpoint():
    response = client.post(
        "/api/financing/gift-property-strategies",
        json={"market_value": "80000", "achievable_cold_rent_monthly": "420"},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["strategies"]) == 4
    sell = next(s for s in body["strategies"] if s["code"] == "sell_to_gmbh")
    assert sell["liquidity_unlocked_eur"] == 80000.0


def test_email_import_creates_listings_with_price_history():
    mail = (
        "Neue Treffer:\n\n"
        "2-Zimmer-Wohnung Kassberg\n"
        "2 Zimmer | 58 m² | Kaufpreis: 98.000 €\n"
        "09112 Chemnitz\n"
        "https://www.immobilienscout24.de/expose/555111222\n"
    )
    response = client.post("/api/listings/import/email", json={"content": mail})
    assert response.status_code == 201
    assert response.json()["imported"] == 1
    listing_id = response.json()["ids"][0]

    listing = client.get(f"/api/listings/{listing_id}").json()
    assert listing["days_on_market"] == 0
    assert len(listing["price_events"]) == 1

    # Same expose with a lower price arrives again: upsert + reduction tracked.
    cheaper = mail.replace("98.000", "92.000")
    response = client.post("/api/listings/import/email", json={"content": cheaper})
    assert response.json()["updated"] == 1

    listing = client.get(f"/api/listings/{listing_id}").json()
    assert listing["purchase_price"] == 92000.0
    assert listing["price_reduction_count"] == 1
    assert listing["price_reduction_total_percent"] > 5


def test_clear_demo_data_removes_only_demo_records():
    deal_id = _prepare_deal()  # demo listing converted to a deal
    mail = (
        "Echte Wohnung zum Kauf\n"
        "2 Zimmer | 50 m² | Kaufpreis: 85.000 €\n"
        "09111 Chemnitz\n"
        "https://www.immobilienscout24.de/expose/909090901\n"
    )
    client.post("/api/listings/import/email", json={"content": mail})

    response = client.request("DELETE", "/api/demo-data")
    assert response.status_code == 200
    assert response.json()["deleted_listings"] >= 8
    assert response.json()["deleted_deals"] >= 1

    remaining = client.get("/api/listings").json()
    assert all(listing["source"] != "demo_seed" for listing in remaining)
    assert any(listing["external_id"] == "909090901" for listing in remaining)
    assert client.get(f"/api/deals/{deal_id}").status_code == 404
    assert client.get("/api/deals").json() == []
