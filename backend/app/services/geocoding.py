from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel


NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search"
DEFAULT_USER_AGENT = "real-estate-tool/0.1 (contact: configure NOMINATIM_USER_AGENT)"
PUBLIC_NOMINATIM_HOST = "nominatim.openstreetmap.org"


class AddressInput(BaseModel):
    street: Optional[str] = None
    house_number: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    federal_state: Optional[str] = None
    country: str = "Germany"


class GeocodeResult(BaseModel):
    latitude: float
    longitude: float
    display_name: str
    confidence: str
    source: str = "nominatim"


def build_nominatim_search_params(address: AddressInput) -> dict[str, str | int]:
    params: dict[str, str | int] = {
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
        "countrycodes": "de",
    }
    street_parts = [address.street, address.house_number]
    street = " ".join(str(part).strip() for part in street_parts if part)
    if street:
        params["street"] = street
    if address.city:
        params["city"] = address.city
    if address.postal_code:
        params["postalcode"] = address.postal_code
    if address.federal_state:
        params["state"] = address.federal_state
    if address.country:
        params["country"] = address.country
    return params


def geocode_address(address: AddressInput) -> GeocodeResult:
    endpoint = os.getenv("NOMINATIM_API_URL", NOMINATIM_ENDPOINT)
    user_agent = require_nominatim_user_agent(os.getenv("NOMINATIM_USER_AGENT"), endpoint)
    response = httpx.get(
        endpoint,
        params=build_nominatim_search_params(address),
        headers={"User-Agent": user_agent},
        timeout=15,
    )
    response.raise_for_status()
    return geocode_result_from_nominatim(response.json())


def require_nominatim_user_agent(configured_user_agent: Optional[str], endpoint: str) -> str:
    user_agent = (configured_user_agent or "").strip()
    is_public_api = urlparse(endpoint).netloc == PUBLIC_NOMINATIM_HOST
    if is_public_api and not user_agent:
        raise RuntimeError(
            "NOMINATIM_USER_AGENT must be set before using the public Nominatim API."
        )
    return user_agent or DEFAULT_USER_AGENT


def geocode_result_from_nominatim(results: list[dict[str, Any]], source: str = "nominatim") -> GeocodeResult:
    if not results:
        raise ValueError("No geocoding result for address.")
    best = sorted(results, key=lambda item: float(item.get("importance") or 0), reverse=True)[0]
    return GeocodeResult(
        latitude=float(best["lat"]),
        longitude=float(best["lon"]),
        display_name=str(best.get("display_name") or ""),
        confidence=confidence_from_importance(float(best.get("importance") or 0)),
        source=source,
    )


def confidence_from_importance(importance: float) -> str:
    if importance >= 0.6:
        return "high"
    if importance >= 0.3:
        return "medium"
    return "low"
