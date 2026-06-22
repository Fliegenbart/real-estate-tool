from app.services.memo import build_investment_memo


def test_investment_memo_adds_ic_gate_offer_release_and_development_evidence():
    memo = build_investment_memo(
        {
            "id": 77,
            "title": "Messestadt value-add candidate",
            "pipeline_stage": "New",
            "listing": {
                "city": "Munich",
                "purchase_price": 520000,
                "living_area_sqm": 58,
                "cold_rent_monthly": 1325,
                "market_rent_estimate_monthly": 1900,
                "expected_initial_capex": 45000,
            },
            "latest_underwriting": {
                "monthly_cashflow_before_tax": -824,
                "dscr": 0.57,
                "max_purchase_price_for_neutral_cashflow": 295266.67,
                "maximum_purchase_price_for_target_yield": 301801.6,
                "equity_required": 178460.5,
                "loan_amount": 386250,
                "residual_debt_factor_rating": "red",
            },
            "latest_score": {
                "total_score": 58,
                "category_scores": {"location_and_demand": 84},
                "red_flags": ["negative_cashflow_base_case", "dscr_below_threshold"],
                "next_recommended_action": "Reject or renegotiate materially before diligence.",
            },
            "location": {
                "micro_location_score": 86,
                "transit_access_score": 92,
                "daily_needs_score": 88,
                "demand_anchor_score": 84,
                "leisure_quality_score": 81,
                "short_term_rental_score": 78,
                "nuisance_resilience_score": 55,
                "evidence_confidence": "high",
                "evidence_data_completeness_percent": 82,
                "evidence_inputs": {
                    "nearest_rapid_transit_meters": 280,
                    "nearest_trade_fair_meters": 1800,
                    "nearest_recreation_anchor_meters": 1300,
                    "hotels_1500m": 6,
                    "short_term_rental_occupancy_percent": 76,
                    "short_term_rental_legal_status": "restricted",
                    "main_road_meters": 120,
                },
            },
            "latest_renovation_case": {
                "results": {
                    "planned_capex": 45000,
                    "annual_rent_uplift": 6900,
                    "implied_value_uplift_from_rent": 138000,
                    "post_renovation_value": 653000,
                    "potential_equity_released": 38200,
                    "net_equity_still_bound_after_refinance": 6800,
                    "simple_roi_percent": 15.33,
                    "value_add_multiple": 3.07,
                    "recommendation": "possible_value_add",
                    "warnings": [],
                }
            },
            "documents": [
                {"document_type": "expose", "review_status": "reviewed"},
                {"document_type": "rental_contract", "review_status": "reviewed"},
            ],
        }
    )

    titles = [section["title"] for section in memo["sections"]]
    assert titles[:4] == [
        "Executive summary",
        "IC Entscheidungs-Gate",
        "Angebotsfreigabe",
        "Entwicklungspotential & Belege",
    ]
    assert "Mikrolage-Belege" in titles
    assert "Stopper & naechste Belege" in titles

    summary = memo["sections"][0]["items"]
    assert any("Nicht bieten" in item for item in summary)
    assert any("Walk-away 295267" in item for item in summary)

    offer = next(section for section in memo["sections"] if section["title"] == "Angebotsfreigabe")
    assert any("Nicht senden" in item for item in offer["items"])
    assert any("Walk-away bleibt intern" in item for item in offer["items"])
    assert any("kein Notartermin" in item for item in offer["items"])

    development = next(section for section in memo["sections"] if section["title"] == "Entwicklungspotential & Belege")
    assert any("138000" in item for item in development["items"])
    assert any("0 EUR Preis-Credit" in item for item in development["items"])
    assert any("WEG, Geo, Capex" in item for item in development["items"])
    assert any("Entwicklungs-Kompass" in item for item in development["items"])
    assert any("Preisfreigabe" in item and "0 EUR" in item for item in development["items"])
    assert any("nicht als Preisargument" in item for item in development["items"])

    location = next(section for section in memo["sections"] if section["title"] == "Mikrolage-Belege")
    assert any("OePNV 280 m" in item for item in location["items"])
    assert any("Messe 1800 m" in item for item in location["items"])
    assert any("Airbnb 76%" in item for item in location["items"])
    assert any("restricted" in item for item in location["items"])

    blockers = next(section for section in memo["sections"] if section["title"] == "Stopper & naechste Belege")
    assert any("8 Pflichtunterlagen fehlen" in item for item in blockers["items"])
    assert any("Kein finales Angebot" in item for item in blockers["items"])
