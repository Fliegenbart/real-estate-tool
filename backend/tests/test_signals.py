from app.services.signals import derive_signals


def test_market_history_signals():
    listing = {
        "days_on_market": 130,
        "price_reduction_count": 2,
        "price_reduction_total_percent": 11.5,
        "energy_class": "C",
        "maintenance_reserve_weg": 5000,
    }
    types = {signal.type: signal for signal in derive_signals(listing)}

    assert types["LONG_TIME_ON_MARKET"].severity == "high"
    assert types["PRICE_REDUCTION"].severity == "high"
    assert "MISSING_WEG_DOCUMENTS" not in types


def test_below_market_price_needs_deal_context():
    listing = {"purchase_price": 80000, "living_area_sqm": 50, "maintenance_reserve_weg": 1}
    without_deal = {signal.type for signal in derive_signals(listing)}
    with_deal = {signal.type for signal in derive_signals(listing, {"market_price_per_sqm": 2000})}

    assert "BELOW_MARKET_PRICE" not in without_deal
    assert "BELOW_MARKET_PRICE" in with_deal  # 1600 vs 2000 = -20%


def test_distress_keywords_and_rent_gap():
    listing = {
        "title": "Kapitalanlage aus Erbengemeinschaft - kurzfristig abzugeben",
        "description": "Wohnung leerstehend, Verhandlungsbasis.",
        "is_rented": True,
        "cold_rent_monthly": 300,
        "market_rent_estimate_monthly": 450,
        "energy_class": "G",
        "house_money_monthly": 300,
        "living_area_sqm": 55,
        "maintenance_reserve_weg": None,
    }
    types = {signal.type for signal in derive_signals(listing)}

    assert "POSSIBLE_DISTRESSED_SALE" in types
    assert "RENT_BELOW_MARKET" in types
    assert "ENERGY_RISK" in types
    assert "HIGH_HOUSE_MONEY" in types
    assert "MISSING_WEG_DOCUMENTS" in types


def test_clean_listing_yields_no_noise():
    listing = {
        "days_on_market": 3,
        "price_reduction_count": 0,
        "energy_class": "B",
        "maintenance_reserve_weg": 8000,
        "house_money_monthly": 180,
        "living_area_sqm": 60,
        "title": "Gepflegte Wohnung",
    }
    assert derive_signals(listing) == []
