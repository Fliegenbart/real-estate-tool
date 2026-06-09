from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from decimal import Decimal
from typing import Any, Iterable


LISTING_FIELDS = {
    "source",
    "external_id",
    "title",
    "description",
    "street",
    "house_number",
    "city",
    "postal_code",
    "federal_state",
    "latitude",
    "longitude",
    "purchase_price",
    "living_area_sqm",
    "number_of_rooms",
    "floor",
    "construction_year",
    "condition",
    "energy_class",
    "heating_type",
    "energy_consumption_kwh",
    "is_rented",
    "cold_rent_monthly",
    "market_rent_estimate_monthly",
    "house_money_monthly",
    "non_recoverable_costs_monthly",
    "maintenance_reserve_weg",
    "broker_fee_percent",
    "property_transfer_tax_percent",
    "notary_and_land_registry_percent",
    "expected_initial_capex",
    "listing_url",
    "first_seen_at",
    "last_seen_at",
    "status",
}

DECIMAL_FIELDS = {
    "latitude",
    "longitude",
    "purchase_price",
    "living_area_sqm",
    "number_of_rooms",
    "energy_consumption_kwh",
    "cold_rent_monthly",
    "market_rent_estimate_monthly",
    "house_money_monthly",
    "non_recoverable_costs_monthly",
    "maintenance_reserve_weg",
    "broker_fee_percent",
    "property_transfer_tax_percent",
    "notary_and_land_registry_percent",
    "expected_initial_capex",
}


class ListingAdapter:
    name = "base"

    def parse(self, payload: Any) -> list[dict[str, Any]]:
        raise NotImplementedError


class CsvListingAdapter(ListingAdapter):
    name = "manual_csv"

    def parse(self, payload: str) -> list[dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(payload))
        return [normalize_listing_row(row) for row in reader]


class JsonListingAdapter(ListingAdapter):
    name = "manual_json"

    def parse(self, payload: str | list[dict[str, Any]]) -> list[dict[str, Any]]:
        raw = json.loads(payload) if isinstance(payload, str) else payload
        if isinstance(raw, dict):
            raw = raw.get("items", [])
        return [normalize_listing_row(row) for row in raw]


def normalize_listing_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        if key not in LISTING_FIELDS:
            continue
        if value in ("", None):
            normalized[key] = None
        elif key in DECIMAL_FIELDS:
            normalized[key] = Decimal(str(value).replace(",", "."))
        elif key in {"is_rented"}:
            normalized[key] = str(value).lower() in {"1", "true", "yes", "ja"}
        elif key in {"construction_year"}:
            normalized[key] = int(value)
        elif key in {"first_seen_at", "last_seen_at"} and isinstance(value, str):
            normalized[key] = datetime.fromisoformat(value)
        else:
            normalized[key] = value
    normalized.setdefault("source", "manual")
    normalized.setdefault("status", "active")
    return normalized


def parse_import(format_name: str, payload: Any) -> list[dict[str, Any]]:
    adapters: dict[str, ListingAdapter] = {
        "csv": CsvListingAdapter(),
        "json": JsonListingAdapter(),
    }
    if format_name not in adapters:
        raise ValueError("Unsupported import format. Use 'csv' or 'json'.")
    return adapters[format_name].parse(payload)
