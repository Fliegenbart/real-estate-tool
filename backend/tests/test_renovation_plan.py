from fastapi.testclient import TestClient

from app.main import app


def test_renovation_plan_quantifies_value_uplift_and_refinance_potential():
    client = TestClient(app)
    client.post("/api/listings/import/demo")
    listing = next(
        item
        for item in client.get("/api/listings").json()
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
