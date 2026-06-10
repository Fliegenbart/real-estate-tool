from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

# Static reference data for Germany-wide sourcing. Rates change by law;
# every consumer surfaces the as-of date and a verification note.

DATA_AS_OF = "2026-01"

# Grunderwerbsteuer per Bundesland in percent.
TRANSFER_TAX_BY_STATE: dict[str, Decimal] = {
    "Baden-Württemberg": Decimal("5.0"),
    "Bayern": Decimal("3.5"),
    "Berlin": Decimal("6.0"),
    "Brandenburg": Decimal("6.5"),
    "Bremen": Decimal("5.0"),
    "Hamburg": Decimal("5.5"),
    "Hessen": Decimal("6.0"),
    "Mecklenburg-Vorpommern": Decimal("6.0"),
    "Niedersachsen": Decimal("5.0"),
    "Nordrhein-Westfalen": Decimal("6.5"),
    "Rheinland-Pfalz": Decimal("5.0"),
    "Saarland": Decimal("6.5"),
    "Sachsen": Decimal("5.5"),
    "Sachsen-Anhalt": Decimal("5.0"),
    "Schleswig-Holstein": Decimal("6.5"),
    "Thüringen": Decimal("5.0"),
}

_STATE_ALIASES: dict[str, str] = {
    "baden-wuerttemberg": "Baden-Württemberg",
    "baden-württemberg": "Baden-Württemberg",
    "bavaria": "Bayern",
    "bayern": "Bayern",
    "berlin": "Berlin",
    "brandenburg": "Brandenburg",
    "bremen": "Bremen",
    "hamburg": "Hamburg",
    "hessen": "Hessen",
    "hesse": "Hessen",
    "mecklenburg-vorpommern": "Mecklenburg-Vorpommern",
    "niedersachsen": "Niedersachsen",
    "lower saxony": "Niedersachsen",
    "nordrhein-westfalen": "Nordrhein-Westfalen",
    "nrw": "Nordrhein-Westfalen",
    "north rhine-westphalia": "Nordrhein-Westfalen",
    "rheinland-pfalz": "Rheinland-Pfalz",
    "saarland": "Saarland",
    "sachsen": "Sachsen",
    "saxony": "Sachsen",
    "sachsen-anhalt": "Sachsen-Anhalt",
    "saxony-anhalt": "Sachsen-Anhalt",
    "schleswig-holstein": "Schleswig-Holstein",
    "thueringen": "Thüringen",
    "thüringen": "Thüringen",
    "thuringia": "Thüringen",
}

# Cities with an active Mietpreisbremse ordinance that are likely sourcing
# targets. Not exhaustive: several states designate dozens of municipalities.
RENT_CONTROL_CITIES: set[str] = {
    "berlin",
    "hamburg",
    "münchen",
    "munich",
    "nürnberg",
    "augsburg",
    "regensburg",
    "ingolstadt",
    "würzburg",
    "erlangen",
    "fürth",
    "stuttgart",
    "karlsruhe",
    "freiburg",
    "freiburg im breisgau",
    "heidelberg",
    "mannheim",
    "tübingen",
    "konstanz",
    "ulm",
    "frankfurt",
    "frankfurt am main",
    "darmstadt",
    "wiesbaden",
    "offenbach",
    "kassel",
    "marburg",
    "gießen",
    "köln",
    "düsseldorf",
    "bonn",
    "münster",
    "aachen",
    "bielefeld",
    "bochum",
    "dresden",
    "leipzig",
    "potsdam",
    "bremen",
    "hannover",
    "braunschweig",
    "göttingen",
    "oldenburg",
    "osnabrück",
    "lüneburg",
    "mainz",
    "trier",
    "speyer",
    "landau in der pfalz",
    "rostock",
    "greifswald",
    "erfurt",
    "jena",
    "kiel",
    "lübeck",
    "flensburg",
}

# States with no Mietpreisbremse ordinance at all.
STATES_WITHOUT_RENT_CONTROL: set[str] = {"Saarland", "Sachsen-Anhalt"}


class RentControlLookup(BaseModel):
    applies: Optional[bool]
    confidence: str
    note: str


def normalize_state(state: Optional[str]) -> Optional[str]:
    if not state:
        return None
    return _STATE_ALIASES.get(state.strip().lower())


def transfer_tax_percent_for_state(state: Optional[str]) -> Optional[Decimal]:
    normalized = normalize_state(state)
    if normalized is None:
        return None
    return TRANSFER_TAX_BY_STATE[normalized]


def rent_control_lookup(city: Optional[str], state: Optional[str]) -> RentControlLookup:
    normalized_state = normalize_state(state)
    city_key = (city or "").strip().lower()

    if city_key and city_key in RENT_CONTROL_CITIES:
        return RentControlLookup(
            applies=True,
            confidence="medium",
            note=(
                f"{city} steht auf der Liste bekannter Mietpreisbremse-Gebiete (Stand {DATA_AS_OF}). "
                "Geltende Landesverordnung und Laufzeit pruefen."
            ),
        )
    if normalized_state in STATES_WITHOUT_RENT_CONTROL:
        return RentControlLookup(
            applies=False,
            confidence="high",
            note=f"{normalized_state} hat keine Mietpreisbremsen-Verordnung (Stand {DATA_AS_OF}).",
        )
    if city_key:
        return RentControlLookup(
            applies=False,
            confidence="low",
            note=(
                f"{city} ist nicht auf der Liste bekannter Mietpreisbremse-Staedte. "
                "Kleinere Gemeinden koennen trotzdem in einer Landesverordnung stehen - pruefen."
            ),
        )
    return RentControlLookup(
        applies=None,
        confidence="low",
        note="Ohne Ort keine Mietpreisbremse-Einschaetzung moeglich.",
    )
