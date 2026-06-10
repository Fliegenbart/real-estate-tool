from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

# Tolerant parser for portal alert e-mails (ImmoScout/Immowelt/Kleinanzeigen
# Suchagenten). Paste the mail body (text or HTML); every block that mentions a
# price becomes a listing draft. No scraping - the portal sent us the data.

PRICE_RE = re.compile(r"(?:Kaufpreis[:\s]*)?([\d.]{4,12}(?:,\d{2})?)\s*(?:€|EUR)", re.IGNORECASE)
AREA_RE = re.compile(r"([\d.,]{1,8})\s*(?:m²|m2|qm)", re.IGNORECASE)
ROOMS_RE = re.compile(r"([\d.,]{1,4})\s*Zimmer", re.IGNORECASE)
POSTAL_CITY_RE = re.compile(r"\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .()-]{2,60})")
URL_RE = re.compile(r"https?://[^\s\"'<>]+")
TAG_RE = re.compile(r"<[^>]+>")
RENT_RE = re.compile(r"(?:Kaltmiete|Miete)[:\s]*([\d.,]{1,10})\s*(?:€|EUR)", re.IGNORECASE)


def _to_decimal(raw: str) -> Optional[Decimal]:
    cleaned = raw.strip().replace(".", "").replace(",", ".")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    return value


def _strip_html(content: str) -> str:
    content = re.sub(r"(?is)<(script|style).*?</\1>", " ", content)
    content = re.sub(r"(?i)<br\s*/?>", "\n", content)
    content = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", content)
    return TAG_RE.sub(" ", content)


def parse_alert_email(content: str, source: str = "email_alert") -> list[dict[str, Any]]:
    if "<" in content and ">" in content:
        content = _strip_html(content)

    lines = [line.strip() for line in content.splitlines()]
    blocks: list[list[str]] = []
    current: list[str] = []
    blank_streak = 0
    for line in lines:
        if not line:
            blank_streak += 1
            if blank_streak >= 2 and current:
                blocks.append(current)
                current = []
            continue
        blank_streak = 0
        current.append(line)
        if URL_RE.search(line):
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)

    listings: list[dict[str, Any]] = []
    for block in blocks:
        text = "\n".join(block)
        price_match = PRICE_RE.search(text)
        if not price_match:
            continue
        price = _to_decimal(price_match.group(1))
        if price is None or price < Decimal("10000"):
            continue

        listing: dict[str, Any] = {
            "source": source,
            "title": block[0][:240],
            "purchase_price": price,
            "status": "active",
        }
        area_match = AREA_RE.search(text)
        if area_match:
            area = _to_decimal(area_match.group(1))
            if area and Decimal("10") <= area <= Decimal("1000"):
                listing["living_area_sqm"] = area
        rooms_match = ROOMS_RE.search(text)
        if rooms_match:
            rooms = _to_decimal(rooms_match.group(1))
            if rooms and rooms < Decimal("20"):
                listing["number_of_rooms"] = rooms
        location_match = POSTAL_CITY_RE.search(text)
        if location_match:
            listing["postal_code"] = location_match.group(1)
            listing["city"] = location_match.group(2).strip().split(",")[0].strip()
        rent_match = RENT_RE.search(text)
        if rent_match:
            rent = _to_decimal(rent_match.group(1))
            if rent and rent < Decimal("10000"):
                listing["cold_rent_monthly"] = rent
                listing["is_rented"] = True
        url_match = URL_RE.search(text)
        if url_match:
            url = url_match.group(0)
            listing["listing_url"] = url[:500]
            listing["external_id"] = _external_id_from_url(url)
        listings.append(listing)
    return listings


def _external_id_from_url(url: str) -> Optional[str]:
    match = re.search(r"/expose/(\d+)", url)
    if match:
        return match.group(1)
    match = re.search(r"(\d{6,})", url)
    if match:
        return match.group(1)
    return None
