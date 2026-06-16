from fastapi.testclient import TestClient

from app.main import app


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


def test_demo_import_convert_underwrite_score_and_memo_flow():
    client = TestClient(app)

    import_response = client.post("/api/listings/import/demo")
    assert import_response.status_code == 201
    assert import_response.json()["imported"] >= 8

    listings_response = client.get("/api/listings")
    assert listings_response.status_code == 200
    first_listing_id = listings_response.json()[0]["id"]

    convert_response = client.post(f"/api/listings/{first_listing_id}/convert-to-deal")
    assert convert_response.status_code == 201
    converted_deal = convert_response.json()
    deal_id = converted_deal["id"]
    assert converted_deal["region_outlook"]["category_scores"]["urban_environment_quality"] > 0
    assert any(
        metric["name"] == "urban_environment_quality_score"
        for metric in converted_deal["region_outlook"]["key_metrics"]
    )

    underwriting_response = client.post(f"/api/deals/{deal_id}/underwrite")
    assert underwriting_response.status_code == 200
    assert "gross_initial_yield_percent" in underwriting_response.json()

    score_response = client.post(f"/api/deals/{deal_id}/score")
    assert score_response.status_code == 200
    assert "total_score" in score_response.json()

    memo_response = client.get(f"/api/deals/{deal_id}/investment-memo")
    assert memo_response.status_code == 200
    assert memo_response.json()["sections"][0]["title"] == "Executive summary"
