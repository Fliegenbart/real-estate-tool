from decimal import Decimal

from app.services.negotiation import NegotiationContext, build_negotiation_dossier


def test_dossier_quantifies_energy_capex_and_builds_price_ladder():
    dossier = build_negotiation_dossier(
        NegotiationContext(
            asking_price=Decimal("180000"),
            living_area_sqm=Decimal("60"),
            energy_class="F",
            expected_initial_capex=Decimal("8000"),
            price_per_sqm=Decimal("3000"),
            market_price_per_sqm=Decimal("2700"),
            monthly_cashflow_before_tax=Decimal("-150"),
            dscr=Decimal("0.95"),
            maximum_purchase_price_for_target_yield=Decimal("150000"),
            days_on_market=95,
            price_reduction_count=1,
            price_reduction_total_percent=Decimal("5.0"),
            seller_motive="inheritance",
        )
    )

    codes = {arg.code for arg in dossier.arguments}
    assert "energy_retrofit" in codes
    assert "initial_capex" in codes
    assert "above_market_price" in codes
    assert "negative_cashflow" in codes

    energy = next(arg for arg in dossier.arguments if arg.code == "energy_retrofit")
    assert energy.estimated_discount_eur == Decimal("650") * Decimal("60")

    ladder = dossier.price_ladder
    assert ladder.walk_away_price <= Decimal("150000")
    assert ladder.target_price <= ladder.walk_away_price
    assert ladder.anchor_price < ladder.target_price
    assert ladder.anchor_price % Decimal("500") == 0

    assert dossier.total_justified_discount_eur > 0
    assert any("95 Tagen" in line for line in dossier.leverage)
    assert "Erbengemeinschaften" in dossier.seller_angle


def test_dossier_caps_discount_and_handles_sparse_data():
    dossier = build_negotiation_dossier(
        NegotiationContext(
            asking_price=Decimal("100000"),
            living_area_sqm=Decimal("50"),
            energy_class="H",
        )
    )

    # H-class retrofit alone (47.500) exceeds the 30% credibility cap.
    assert dossier.price_ladder.target_price >= Decimal("100000") * Decimal("0.70") - Decimal("500")
    assert dossier.leverage  # fallback hint to ask for market history


def test_rent_cap_argument_only_in_rent_control_areas():
    base = dict(
        asking_price=Decimal("200000"),
        living_area_sqm=Decimal("50"),
        market_rent_monthly=Decimal("700"),
        legally_plausible_target_rent_per_sqm=Decimal("11"),
    )
    controlled = build_negotiation_dossier(NegotiationContext(rent_control_area=True, **base))
    uncontrolled = build_negotiation_dossier(NegotiationContext(rent_control_area=False, **base))

    assert any(arg.code == "rent_legally_capped" for arg in controlled.arguments)
    assert not any(arg.code == "rent_legally_capped" for arg in uncontrolled.arguments)
