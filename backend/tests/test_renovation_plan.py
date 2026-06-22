from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import import_alert_listings


def test_renovation_plan_quantifies_value_uplift_and_refinance_potential():
    client = TestClient(app)
    listings = import_alert_listings(client)
    listing = next(
        item
        for item in listings
        if "Leipzig" in item["title"]
    )
    deal = client.post(f"/api/listings/{listing['id']}/convert-to-deal").json()
    client.patch(
        f"/api/deals/{deal['id']}/financing",
        json={
            "loan_to_value_percent": 80,
            "capex_financed_percent": 50,
            "interest_rate_percent": 4,
            "amortization_rate_percent": 2,
        },
    )
    client.post(f"/api/deals/{deal['id']}/underwrite")

    response = client.post(
        f"/api/deals/{deal['id']}/renovation-plan",
        json={
            "planned_capex": 25000,
            "target_cold_rent_monthly": 1100,
            "valuation_yield_percent": 4.5,
            "refinance_ltv_percent": 75,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["planned_capex"] == 25000.0
    assert payload["annual_rent_uplift"] > 0
    assert payload["implied_value_uplift_from_rent"] > payload["planned_capex"]
    assert payload["refinanceable_debt_after_renovation"] > payload["current_loan_amount"]
    assert payload["potential_equity_released"] > 0
    assert payload["simple_roi_percent"] > 0
    assert payload["recommendation"] in {"strong_value_add", "possible_value_add", "weak_value_add"}


def test_renovation_plan_is_saved_for_deal_bank_package_and_memo():
    client = TestClient(app)
    listing = import_alert_listings(client)[0]
    deal = client.post(f"/api/listings/{listing['id']}/convert-to-deal").json()
    client.post(f"/api/deals/{deal['id']}/underwrite")
    client.post(f"/api/deals/{deal['id']}/score")

    response = client.post(
        f"/api/deals/{deal['id']}/renovation-plan",
        json={
            "planned_capex": 25000,
            "target_cold_rent_monthly": 1100,
            "valuation_yield_percent": 4.5,
            "refinance_ltv_percent": 75,
        },
    )

    assert response.status_code == 200
    result = response.json()

    detail = client.get(f"/api/deals/{deal['id']}").json()
    saved_case = detail["latest_renovation_case"]
    assert saved_case["inputs"]["planned_capex"] == 25000.0
    assert saved_case["results"]["potential_equity_released"] == result["potential_equity_released"]
    assert saved_case["results"]["recommendation"] == result["recommendation"]

    bank_package = client.get(f"/api/deals/{deal['id']}/bank-package").json()
    development_credit = bank_package["development_credit"]
    assert development_credit["status"] in {"bank_review", "memo_only"}
    assert development_credit["label"]
    assert development_credit["price_credit_eur"] >= 0
    assert development_credit["equity_release_eur"] == result["potential_equity_released"]
    assert development_credit["value_uplift_eur"] == result["implied_value_uplift_from_rent"]
    assert "nicht Basis-Cashflow" in development_credit["rule"]
    assert any("Bankbewertung" in item for item in development_credit["next_documents"])

    renovation_section = next(
        section for section in bank_package["sections"] if section["title"] == "Sanierungs-/Refi-Case"
    )
    assert any("Kapital freisetzbar" in item for item in renovation_section["items"])
    assert any(str(result["potential_equity_released"]) in item for item in renovation_section["items"])

    memo = client.get(f"/api/deals/{deal['id']}/investment-memo").json()
    memo_section = next(
        section for section in memo["sections"] if section["title"] == "Sanierungs-/Refi-Case"
    )
    assert any("Wertsteigerung aus Miete" in item for item in memo_section["items"])
