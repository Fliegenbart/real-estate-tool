from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel

# Opportunity signals derived from data we already track. Inspired by
# geo-intelligence tools (days on market, price cuts, distress wording) but
# computed purely from our own listing observations - no scraping.

DISTRESS_KEYWORDS = [
    "zwangsversteigerung",
    "erbengemeinschaft",
    "nachlass",
    "erbe",
    "scheidung",
    "trennung",
    "kurzfristig abzugeben",
    "schnellentschlossene",
    "schnellverkauf",
    "leerstehend",
    "leerstand",
    "raeumungsverkauf",
    "unter wert",
    "verhandlungsbasis",
    "dringend",
]

HIGH_HOUSE_MONEY_PER_SQM = Decimal("4.5")


class Signal(BaseModel):
    type: str
    severity: str  # info | medium | high
    explanation: str


def _to_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return value if isinstance(value, Decimal) else Decimal(str(value))
    except Exception:
        return None


def derive_signals(listing: dict[str, Any], deal: Optional[dict[str, Any]] = None) -> list[Signal]:
    signals: list[Signal] = []

    days = listing.get("days_on_market")
    if isinstance(days, (int, float)) and days >= 60:
        severity = "high" if days >= 120 else "medium"
        signals.append(
            Signal(
                type="LONG_TIME_ON_MARKET",
                severity=severity,
                explanation=f"Seit {int(days)} Tagen am Markt - Verhandlungsspielraum wahrscheinlich.",
            )
        )

    reductions = listing.get("price_reduction_count") or 0
    total_cut = listing.get("price_reduction_total_percent")
    if reductions > 0:
        signals.append(
            Signal(
                type="PRICE_REDUCTION",
                severity="high" if (total_cut or 0) >= 10 else "medium",
                explanation=f"{reductions}x reduziert, insgesamt {total_cut or '?'}% - Verkaeufer ist im Preisrueckzug.",
            )
        )

    price = _to_decimal(listing.get("purchase_price"))
    sqm = _to_decimal(listing.get("living_area_sqm"))
    market_per_sqm = _to_decimal((deal or {}).get("market_price_per_sqm"))
    if price and sqm and sqm > 0 and market_per_sqm and market_per_sqm > 0:
        ratio = (price / sqm) / market_per_sqm
        if ratio <= Decimal("0.90"):
            signals.append(
                Signal(
                    type="BELOW_MARKET_PRICE",
                    severity="high",
                    explanation=f"Angebot liegt ~{int((1 - ratio) * 100)}% unter dem Vergleichsniveau - Ursache klaeren (Zustand? WEG?).",
                )
            )

    cold_rent = _to_decimal(listing.get("cold_rent_monthly"))
    market_rent = _to_decimal(listing.get("market_rent_estimate_monthly"))
    if listing.get("is_rented") and cold_rent and market_rent and market_rent > 0:
        rent_ratio = cold_rent / market_rent
        if rent_ratio <= Decimal("0.85"):
            signals.append(
                Signal(
                    type="RENT_BELOW_MARKET",
                    severity="medium",
                    explanation=(
                        f"Ist-Miete ~{int((1 - rent_ratio) * 100)}% unter Marktmiete - Steigerungspotenzial, "
                        "aber Mietrecht (Kappungsgrenze/Mietpreisbremse) pruefen."
                    ),
                )
            )

    energy = (listing.get("energy_class") or "").upper()
    if energy in {"F", "G", "H"}:
        signals.append(
            Signal(
                type="ENERGY_RISK",
                severity="high",
                explanation=f"Energieklasse {energy}: Sanierungskosten einpreisen, als Verhandlungsargument nutzen.",
            )
        )
    elif not energy:
        signals.append(
            Signal(
                type="MISSING_ENERGY_CERTIFICATE",
                severity="medium",
                explanation="Kein Energieausweis im Inserat - vor Besichtigung anfordern (Pflichtangabe).",
            )
        )

    house_money = _to_decimal(listing.get("house_money_monthly"))
    if house_money and sqm and sqm > 0:
        per_sqm = house_money / sqm
        if per_sqm > HIGH_HOUSE_MONEY_PER_SQM:
            signals.append(
                Signal(
                    type="HIGH_HOUSE_MONEY",
                    severity="medium",
                    explanation=f"Hausgeld {per_sqm.quantize(Decimal('0.01'))} EUR/m2 ist erhoeht - Jahresabrechnung pruefen.",
                )
            )

    if listing.get("maintenance_reserve_weg") is None:
        signals.append(
            Signal(
                type="MISSING_WEG_DOCUMENTS",
                severity="medium",
                explanation="Keine Angabe zur Instandhaltungsruecklage - WEG-Unterlagen anfordern.",
            )
        )

    text = f"{listing.get('title') or ''} {listing.get('description') or ''}".lower()
    hits = [keyword for keyword in DISTRESS_KEYWORDS if keyword in text]
    if hits:
        signals.append(
            Signal(
                type="POSSIBLE_DISTRESSED_SALE",
                severity="high",
                explanation=f"Inseratstext deutet auf Verkaufsdruck hin ({', '.join(hits[:3])}) - Motiv im Erstgespraech verifizieren.",
            )
        )

    return signals
