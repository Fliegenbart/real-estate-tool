import pytest

from app.services.geocoding import (
    AddressInput,
    GeocodeResult,
    build_nominatim_search_params,
    geocode_result_from_nominatim,
    require_nominatim_user_agent,
)


def test_build_nominatim_search_params_uses_structured_german_address():
    params = build_nominatim_search_params(
        AddressInput(
            street="Lageblick",
            house_number="18",
            postal_code="80796",
            city="Munich",
            federal_state="Bayern",
        )
    )

    assert params["street"] == "Lageblick 18"
    assert params["postalcode"] == "80796"
    assert params["city"] == "Munich"
    assert params["state"] == "Bayern"
    assert params["countrycodes"] == "de"
    assert params["format"] == "jsonv2"
    assert params["limit"] == 1


def test_geocode_result_from_nominatim_selects_best_result():
    result = geocode_result_from_nominatim(
        [
            {"lat": "52.50", "lon": "13.30", "importance": 0.2, "display_name": "Weak match"},
            {"lat": "52.51720765", "lon": "13.3978344", "importance": 0.8, "display_name": "Strong match"},
        ],
        source="nominatim_fixture",
    )

    assert result == GeocodeResult(
        latitude=52.51720765,
        longitude=13.3978344,
        display_name="Strong match",
        confidence="high",
        source="nominatim_fixture",
    )


def test_geocode_result_from_nominatim_rejects_empty_results():
    with pytest.raises(ValueError, match="No geocoding result"):
        geocode_result_from_nominatim([])


def test_require_nominatim_user_agent_blocks_public_api_placeholder():
    with pytest.raises(RuntimeError, match="NOMINATIM_USER_AGENT"):
        require_nominatim_user_agent(None, "https://nominatim.openstreetmap.org/search")

    assert (
        require_nominatim_user_agent("real-estate-tool/0.1 ops@example.com", "https://nominatim.openstreetmap.org/search")
        == "real-estate-tool/0.1 ops@example.com"
    )
