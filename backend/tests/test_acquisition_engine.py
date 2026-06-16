from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import import_alert_listings


def test_acquisition_command_center_prioritizes_equity_efficient_buy_box():
    client = TestClient(app)
    listings = import_alert_listings(client)

    for listing in listings[:4]:
        deal = client.post(f"/api/listings/{listing['id']}/convert-to-deal").json()
        client.patch(
            f"/api/deals/{deal['id']}/financing",
            json={
                "interest_rate_percent": 4.0,
                "amortization_rate_percent": 2.0,
                "loan_to_value_percent": 82.0,
                "capex_financed_percent": 50.0,
            },
        )
        client.post(f"/api/deals/{deal['id']}/underwrite")
        client.post(f"/api/deals/{deal['id']}/score")

    response = client.post(
        "/api/acquisition/command-center",
        json={
            "available_equity": 220000,
            "annual_new_equity": 60000,
            "target_years": 10,
            "minimum_total_score": 55,
            "minimum_dscr": 0.9,
            "maximum_equity_per_unit": 140000,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["north_star"]["metric"] == "wohnungen_pro_100k_eigenkapital"
    assert payload["deal_decisions"]
    assert payload["selected_deals_now"]
    assert payload["growth_plan"]["years"][0]["year"] == 1
    assert payload["growth_plan"]["years"][-1]["year"] == 10
    assert payload["growth_plan"]["target_years"] == 10
    assert payload["portfolio_capacity"]["available_equity"] == 220000.0
    assert payload["portfolio_capacity"]["deployable_equity_now"] <= 220000.0
    assert all(item["decision"] in {"buy", "negotiate", "watch", "reject"} for item in payload["deal_decisions"])


def test_bank_package_collects_financing_memo_and_missing_documents():
    client = TestClient(app)
    listing = import_alert_listings(client)[0]
    deal = client.post(f"/api/listings/{listing['id']}/convert-to-deal").json()
    client.post(f"/api/deals/{deal['id']}/underwrite")
    client.post(f"/api/deals/{deal['id']}/score")

    response = client.get(f"/api/deals/{deal['id']}/bank-package")

    assert response.status_code == 200
    payload = response.json()
    assert payload["deal_id"] == deal["id"]
    assert payload["title"]
    assert payload["bank_summary"]["purchase_price"] is not None
    assert payload["bank_summary"]["equity_required"] is not None
    assert payload["financing_request"]["requested_loan_amount"] is not None
    assert "energy_certificate" in payload["missing_documents"]
    assert payload["sections"][0]["title"] == "Bank summary"
