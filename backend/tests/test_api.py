from fastapi.testclient import TestClient

from app.main import app


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
    deal_id = convert_response.json()["id"]

    underwriting_response = client.post(f"/api/deals/{deal_id}/underwrite")
    assert underwriting_response.status_code == 200
    assert "gross_initial_yield_percent" in underwriting_response.json()

    score_response = client.post(f"/api/deals/{deal_id}/score")
    assert score_response.status_code == 200
    assert "total_score" in score_response.json()

    memo_response = client.get(f"/api/deals/{deal_id}/investment-memo")
    assert memo_response.status_code == 200
    assert memo_response.json()["sections"][0]["title"] == "Executive summary"
