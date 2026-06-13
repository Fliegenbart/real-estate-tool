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
    # Keep link targets: portal alert mails carry the expose URL only in href.
    content = re.sub(r"(?i)<a\s+[^>]*href=[\"']([^\"']+)[\"'][^>]*>", r" \1 ", content)
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
        # Drop search-agent meta lines ("Ihr Suchauftrag ... bis 80.000 €")
        # so their price limits and titles never leak into a listing.
        block = [
            line
            for line in block
            if "suchauftrag" not in line.lower() and "suchkriterien" not in line.lower()
        ]
        if not block:
            continue
        text = "\n".join(block)
        lowered = text.lower()
        # Rental hits are not purchase listings.
        if "mietwohnung" in lowered and "kauf" not in lowered:
            continue
        price = _find_purchase_price(text)
        if price is None or price < Decimal("10000"):
            continue
        url_match = URL_RE.search(text)
        if url_match is None:
            # Every real alert hit links to its expose; blocks without a URL
            # are boilerplate around the listings.
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
        url = url_match.group(0)
        listing["listing_url"] = url[:500]
        listing["external_id"] = _external_id_from_url(url)
        listings.append(listing)
    return listings


ENERGY_CLASS_RE = re.compile(
    r"(?:Energie\w*klasse|Effizienzklasse|Energieklasse)[:\s]*([A-H][+]?)", re.IGNORECASE
)
CONSTRUCTION_YEAR_RE = re.compile(r"Baujahr[:\s]*((?:1[89]|20)\d{2})", re.IGNORECASE)
HOUSE_MONEY_RE = re.compile(r"(?:Hausgeld|Wohngeld)[:\s]*([\d.,]{1,10})\s*(?:€|EUR)", re.IGNORECASE)
KAUFPREIS_RE = re.compile(r"Kaufpreis[:\s]*([\d.]{4,12}(?:,\d{2})?)\s*(?:€|EUR)", re.IGNORECASE)


def parse_single_expose(content: str, source: str = "manual") -> Optional[dict[str, Any]]:
    """Parse one pasted expose page (text or HTML) into a single listing draft.
    Unlike the alert parser this treats the whole document as one object and
    pulls extra fields (energy class, year, house money) that full exposes carry.
    Returns None if no plausible purchase price is found."""
    if "<" in content and ">" in content:
        content = _strip_html(content)

    kaufpreis = KAUFPREIS_RE.search(content)
    price = _to_decimal(kaufpreis.group(1)) if kaufpreis else _find_purchase_price(content)
    if price is None or price < Decimal("5000"):
        return None

    first_line = next((line.strip() for line in content.splitlines() if line.strip()), "Importiertes Angebot")
    draft: dict[str, Any] = {
        "source": source,
        "title": first_line[:240],
        "purchase_price": price,
        "status": "active",
    }

    area = AREA_RE.search(content)
    if area:
        value = _to_decimal(area.group(1))
        if value and Decimal("10") <= value <= Decimal("1000"):
            draft["living_area_sqm"] = value
    rooms = ROOMS_RE.search(content)
    if rooms:
        value = _to_decimal(rooms.group(1))
        if value and value < Decimal("20"):
            draft["number_of_rooms"] = value
    location = POSTAL_CITY_RE.search(content)
    if location:
        draft["postal_code"] = location.group(1)
        draft["city"] = location.group(2).strip().split(",")[0].strip()
    rent = RENT_RE.search(content)
    if rent:
        value = _to_decimal(rent.group(1))
        if value and value < Decimal("10000"):
            draft["cold_rent_monthly"] = value
            draft["is_rented"] = True
    energy = ENERGY_CLASS_RE.search(content)
    if energy:
        draft["energy_class"] = energy.group(1).upper()
    year = CONSTRUCTION_YEAR_RE.search(content)
    if year:
        draft["construction_year"] = int(year.group(1))
    house_money = HOUSE_MONEY_RE.search(content)
    if house_money:
        value = _to_decimal(house_money.group(1))
        if value and value < Decimal("5000"):
            draft["house_money_monthly"] = value
    url = URL_RE.search(content)
    if url:
        draft["listing_url"] = url.group(0)[:500]
        draft["external_id"] = _external_id_from_url(url.group(0))
    return draft


def _find_purchase_price(text: str) -> Optional[Decimal]:
    """First price that is not a search criterion like 'bis 80.000 €'."""
    for match in PRICE_RE.finditer(text):
        prefix = text[max(0, match.start() - 8) : match.start()].lower()
        if "bis" in prefix or "max" in prefix:
            continue
        value = _to_decimal(match.group(1))
        if value is not None:
            return value
    return None


def _external_id_from_url(url: str) -> Optional[str]:
    match = re.search(r"/expose/(\d+)", url)
    if match:
        return match.group(1)
    match = re.search(r"(\d{6,})", url)
    if match:
        return match.group(1)
    return None
