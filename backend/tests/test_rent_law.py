from decimal import Decimal

from app.services.rent_law import RentLawInput, check_rent_law_plausibility


def test_rent_control_limits_target_to_local_reference_plus_tolerance():
    result = check_rent_law_plausibility(
        RentLawInput(
            current_rent_per_sqm=Decimal("10.00"),
            market_rent_per_sqm=Decimal("14.00"),
            local_reference_rent_per_sqm=Decimal("10.00"),
            rent_control_area=True,
            tolerance_percent=Decimal("10"),
        )
    )

    assert result.legally_plausible_target_rent_per_sqm == Decimal("11.00")
    assert result.status == "limited_by_reference_rent"
    assert any("Mietpreisbremse" in note for note in result.notes)


def test_exception_allows_market_rent_but_requires_legal_verification():
    result = check_rent_law_plausibility(
        RentLawInput(
            current_rent_per_sqm=Decimal("11.00"),
            market_rent_per_sqm=Decimal("15.00"),
            local_reference_rent_per_sqm=Decimal("10.00"),
            rent_control_area=True,
            new_building_exception=True,
        )
    )

    assert result.legally_plausible_target_rent_per_sqm == Decimal("15.00")
    assert result.requires_legal_verification is True
    assert result.status == "exception_requires_verification"


def test_missing_reference_rent_creates_risk_instead_of_fake_certainty():
    result = check_rent_law_plausibility(
        RentLawInput(
            current_rent_per_sqm=Decimal("12.00"),
            market_rent_per_sqm=Decimal("14.50"),
            local_reference_rent_per_sqm=None,
            rent_control_area=True,
        )
    )

    assert result.legally_plausible_target_rent_per_sqm is None
    assert "missing_local_reference_rent" in result.risk_flags
    assert result.confidence == "low"
