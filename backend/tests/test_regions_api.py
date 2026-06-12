from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_seed_list_and_detail_roundtrip():
    response = client.post("/api/regions/seed-defaults")
    assert response.status_code == 201
    assert response.json()["regions"] >= 40

    regions = client.get("/api/regions").json()
    assert len(regions) >= 40
    # Sorted by score: a structurally declining small city must rank below Leipzig.
    names = [region["name"] for region in regions]
    assert names.index("Leipzig") < names.index("Pirmasens")

    leipzig = next(region for region in regions if region["name"] == "Leipzig")
    assert leipzig["score"]["total_score"] >= 50
    assert leipzig["score"]["rent_factor"] is not None

    detail = client.get(f"/api/regions/{leipzig['id']}").json()
    assert any(metric["metric"] == "vacancy_rate_percent" for metric in detail["metrics_detail"])

    chemnitz = next(region for region in regions if region["name"] == "Chemnitz")
    assert "very_high_vacancy" not in chemnitz["score"]["red_flags"]


def test_csv_import_with_column_mapping():
    csv_content = "AGS;Gemeinde;Land;EW;ALQ\n14511000;Chemnitz;Sachsen;248000;9,2\n"
    response = client.post(
        "/api/regions/import",
        json={
            "content": csv_content,
            "delimiter": ";",
            "source_name": "INKAR (BBSR)",
            "name_column": "Gemeinde",
            "ags_column": "AGS",
            "state_column": "Land",
            "population_column": "EW",
            "metrics": [{"column": "ALQ", "metric": "unemployment_rate_percent", "year": 2025}],
        },
    )
    assert response.status_code == 201
    assert response.json()["metrics"] == 1

    regions = client.get("/api/regions").json()
    chemnitz = next(region for region in regions if region["name"] == "Chemnitz")
    # Import matched the seeded region by name and attached the AGS + new value.
    assert chemnitz["ags"] == "14511000"
    assert chemnitz["metrics"]["unemployment_rate_percent"] == 9.2


def test_own_metrics_refresh_and_deal_region_link():
    client.post("/api/regions/seed-defaults")
    # Three Chemnitz listings via email import (non-demo source)
    for i, (price, sqm, rent) in enumerate([(98000, 58, 360), (112000, 64, 410), (87000, 52, 330)]):
        mail = (
            f"Wohnung zum Kauf {i}\n"
            f"2 Zimmer | {sqm} m² | Kaufpreis: {price:,} €\n".replace(",", ".")
            + "Kaltmiete: "
            + str(rent)
            + " €\n09112 Chemnitz\n"
            f"https://www.immobilienscout24.de/expose/77711{i}\n"
        )
        client.post("/api/listings/import/email", json={"content": mail})

    refreshed = client.post("/api/regions/refresh-own-metrics").json()
    assert refreshed["cities_updated"] >= 1

    regions = client.get("/api/regions").json()
    chemnitz = next(region for region in regions if region["name"] == "Chemnitz")
    assert chemnitz["metrics"]["own_listing_count"] == 3.0
    assert chemnitz["metrics"]["own_median_price_eur_sqm"] > 1000

    listing_id = [
        listing for listing in client.get("/api/listings").json() if listing["city"] == "Chemnitz"
    ][0]["id"]
    deal = client.post(f"/api/listings/{listing_id}/convert-to-deal").json()
    assert deal["region"]["name"] == "Chemnitz"
    assert deal["region"]["total_score"] > 0
    assert deal["location"]["source"] == "region_data"
