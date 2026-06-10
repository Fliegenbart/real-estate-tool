from decimal import Decimal

from app.services.germany import rent_control_lookup, transfer_tax_percent_for_state


def test_transfer_tax_per_state():
    assert transfer_tax_percent_for_state("Sachsen") == Decimal("5.5")
    assert transfer_tax_percent_for_state("Bayern") == Decimal("3.5")
    assert transfer_tax_percent_for_state("NRW") == Decimal("6.5")
    assert transfer_tax_percent_for_state("Atlantis") is None
    assert transfer_tax_percent_for_state(None) is None


def test_rent_control_lookup_distinguishes_known_cases():
    assert rent_control_lookup("Chemnitz", "Sachsen").applies is False
    assert rent_control_lookup("Leipzig", "Sachsen").applies is True
    assert rent_control_lookup("Berlin", "Berlin").applies is True
    # States without any ordinance are a confident "no".
    saarland = rent_control_lookup("Saarbruecken", "Saarland")
    assert saarland.applies is False
    assert saarland.confidence == "high"
    assert rent_control_lookup(None, None).applies is None
