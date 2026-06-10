from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel

# Turns red flags and signals into an actionable chance/risk/mitigation matrix.
# Principle: a flag is only useful if it comes with a due-diligence action, a
# mitigation and - where estimable - a price consequence.


class RiskItem(BaseModel):
    code: str
    title: str
    severity: str  # low | medium | high
    explanation: str
    financial_impact: Optional[str] = None
    due_diligence_actions: list[str] = []
    mitigations: list[str] = []
    price_consequence: Optional[str] = None


class RiskMatrix(BaseModel):
    items: list[RiskItem]
    high_count: int
    medium_count: int
    summary: str


_CATALOG: dict[str, dict[str, Any]] = {
    "negative_cashflow_base_case": {
        "title": "Negativer Cashflow im Base Case",
        "severity": "high",
        "explanation": "Bei aktueller Miete und marktueblicher Finanzierung traegt sich das Objekt nicht selbst.",
        "dd": ["Mietsteigerungspfad rechtlich pruefen (Kappungsgrenze, Mietpreisbremse)", "Finanzierungskonditionen bei 2-3 Banken anfragen"],
        "mitigation": ["Kaufpreis bis zum Max-Gebot fuer Zielrendite nachverhandeln", "Hoehere Tilgung nur bei positivem Cashflow akzeptieren"],
        "price": "Kaufpreis muss unter das berechnete Maximalgebot (siehe Underwriting).",
    },
    "dscr_below_threshold": {
        "title": "DSCR unter Bankschwelle",
        "severity": "high",
        "explanation": "Kapitaldienstdeckung unter 1,10 - Banken finanzieren so kaum oder nur mit mehr Eigenkapital.",
        "dd": ["Bankgespraech vor Angebotsabgabe", "Stresstest mit Anschlusszins +2% pruefen"],
        "mitigation": ["Mehr Eigenkapital oder Verkaeuferdarlehen strukturieren", "Kaufpreis senken bis DSCR >= 1,2"],
        "price": "Preisreduktion oder Equity-Erhoehung noetig, sonst nicht finanzierbar.",
    },
    "rented_above_legally_plausible_rent": {
        "title": "Ist-Miete ueber rechtlich plausibler Miete",
        "severity": "high",
        "explanation": "Die Bestandsmiete koennte rechtlich angreifbar sein - Ruegerisiko des Mieters, Rueckforderungen moeglich.",
        "dd": ["Mietvertrag und Mieterhoehungshistorie pruefen lassen", "Mietspiegel-Einordnung durch Anwalt verifizieren"],
        "mitigation": ["Bewertung auf rechtlich haltbare Miete abstellen, nicht auf Ist-Miete"],
        "price": "Kapitalisierte Differenz Ist-Miete vs. plausible Miete vom Preis abziehen.",
    },
    "purchase_price_materially_above_model_fair_value": {
        "title": "Preis deutlich ueber Vergleichsniveau",
        "severity": "high",
        "explanation": "Angebotspreis liegt materiell ueber dem Modell-Vergleichswert je m2.",
        "dd": ["3-5 echte Vergleichsangebote dokumentieren", "Verkaufsgrund und Preishistorie erfragen"],
        "mitigation": ["Verhandlungsdossier nutzen: Anker unter Vergleichsniveau setzen"],
        "price": "Differenz zum Vergleichsniveau ist die Verhandlungs-Zielgroesse.",
    },
    "poor_energy_class_without_capex_buffer": {
        "title": "Schlechte Energieklasse ohne Capex-Puffer",
        "severity": "high",
        "explanation": "F/G/H ohne eingeplante Sanierungskosten - regulatorisches und Vermietungsrisiko.",
        "dd": ["Energieausweis im Original pruefen", "Heizungsalter und WEG-Beschluesse zum Heizungstausch pruefen", "Sanierungskosten von Handwerker schaetzen lassen"],
        "mitigation": ["Capex-Budget ins Underwriting aufnehmen", "Sanierungskosten als Preisabschlag verhandeln (siehe Dossier)"],
        "price": "Sanierungskosten ~450-950 EUR/m2 je nach Klasse als Abschlag ansetzen.",
    },
    "very_high_non_recoverable_costs": {
        "title": "Sehr hohe nicht umlagefaehige Kosten",
        "severity": "medium",
        "explanation": "Dauerhafte Renditebelastung durch hohe Verwaltungs-/Instandhaltungsanteile im Hausgeld.",
        "dd": ["Jahresabrechnung nach Kostentreibern durchgehen", "Verwaltervertrag und Versicherungen pruefen"],
        "mitigation": ["Kapitalisierten Mehrbetrag als Preisabschlag verhandeln"],
        "price": "Mehrkosten x 12 / Zielrendite = rechnerischer Abschlag.",
    },
    "missing_house_money": {
        "title": "Hausgeld unbekannt",
        "severity": "medium",
        "explanation": "Ohne Hausgeld ist der Cashflow nicht belastbar rechenbar.",
        "dd": ["Wirtschaftsplan und letzte Jahresabrechnung anfordern"],
        "mitigation": ["Bis dahin konservativ 3,50-4,50 EUR/m2 ansetzen"],
        "price": None,
    },
    "missing_energy_data": {
        "title": "Energieausweis fehlt",
        "severity": "medium",
        "explanation": "Pflichtangabe fehlt im Inserat - moeglicherweise bewusst.",
        "dd": ["Energieausweis vor Besichtigung anfordern (Verkaeuferpflicht)"],
        "mitigation": ["Bis Vorlage Worst Case (Klasse F) ins Underwriting nehmen"],
        "price": None,
    },
    "missing_weg_reserve": {
        "title": "Instandhaltungsruecklage unbekannt",
        "severity": "medium",
        "explanation": "Ohne Ruecklagenstand ist das Sonderumlagerisiko nicht einschaetzbar.",
        "dd": ["Ruecklagenstand, Wirtschaftsplan und 3 Jahre Protokolle anfordern", "WEG-Gesundheitsscore im Tool ausfuellen"],
        "mitigation": ["Sonderumlage-Szenarien 5k/10k/20k simulieren"],
        "price": None,
    },
    "missing_address_location_data": {
        "title": "Adresse/Lagedaten unvollstaendig",
        "severity": "low",
        "explanation": "Ohne genaue Adresse keine belastbare Lage- und Vergleichsanalyse.",
        "dd": ["Adresse beim Makler erfragen (vor Besichtigungstermin)"],
        "mitigation": [],
        "price": None,
    },
    # WEG health flags
    "weg_reserve_critically_low": {
        "title": "Ruecklage kritisch niedrig",
        "severity": "high",
        "explanation": "Ruecklage liegt weit unter dem Alters-Benchmark - Sonderumlagen wahrscheinlich.",
        "dd": ["Protokolle nach vertagten Massnahmen durchsuchen", "Verwalter nach geplanten Massnahmen fragen"],
        "mitigation": ["Anteilige Sonderumlage als Preisabschlag verhandeln", "Capex-Puffer im Underwriting"],
        "price": "Anteil an absehbaren Massnahmen vom Kaufpreis abziehen.",
    },
    "weg_unfunded_measures": {
        "title": "Beschlossene Massnahmen ohne Deckung",
        "severity": "high",
        "explanation": "Massnahmen sind beschlossen oder anstehend, die Ruecklage deckt sie nicht.",
        "dd": ["Beschlusssammlung pruefen: Was ist beschlossen, was vertagt?"],
        "mitigation": ["Sonderumlage 1:1 als Preisabschlag (siehe Verhandlungsdossier)"],
        "price": "Ungedeckter Betrag x Miteigentumsanteil = Abschlag.",
    },
    "weg_high_arrears": {
        "title": "Hohe Hausgeldrueckstaende",
        "severity": "high",
        "explanation": "Zahlungsausfaelle anderer Eigentuemer treffen die Gemeinschaft - und dich mit.",
        "dd": ["Verwalterauskunft: Wie alt, wie verteilt, laufen Verfahren?"],
        "mitigation": ["Nur mit Abschlag kaufen oder Finger weg bei strukturellem Problem"],
        "price": None,
    },
    "weg_litigation_pending": {
        "title": "Laufende WEG-Rechtsstreitigkeiten",
        "severity": "medium",
        "explanation": "Prozesskosten und Blockade-Risiko in der Gemeinschaft.",
        "dd": ["Streitgegenstand und Kostenrisiko beim Verwalter erfragen"],
        "mitigation": ["Kostenrisiko anteilig einpreisen"],
        "price": None,
    },
    "weg_majority_owner": {
        "title": "Mehrheitseigentuemer in der WEG",
        "severity": "medium",
        "explanation": "Ein Eigentuemer kann Beschluesse dominieren - dein Stimmrecht ist faktisch begrenzt.",
        "dd": ["Eigentuemerstruktur und Abstimmungsverhalten aus Protokollen ablesen"],
        "mitigation": ["Nur kaufen, wenn der Mehrheitseigentuemer erkennbar investiert statt blockiert"],
        "price": None,
    },
    "weg_special_levy_history": {
        "title": "Sonderumlagen-Historie",
        "severity": "medium",
        "explanation": "Bereits Sonderumlagen in den letzten Jahren - Hinweis auf strukturelle Unterdeckung.",
        "dd": ["Wofuer waren die Umlagen? Einmaleffekt oder Muster?"],
        "mitigation": ["Zufuehrungshoehe pruefen; bei Muster: Abschlag oder Absage"],
        "price": None,
    },
    "weg_hausgeld_very_high": {
        "title": "Hausgeld sehr hoch",
        "severity": "medium",
        "explanation": "Dauerhaft hohes Hausgeld drueckt Nettorendite und Wiederverkaufswert.",
        "dd": ["Kostentreiber in der Jahresabrechnung identifizieren"],
        "mitigation": ["Kapitalisierte Mehrkosten als Abschlag verhandeln"],
        "price": "Siehe Verhandlungsdossier (nicht umlagefaehige Kosten).",
    },
    # Signals
    "POSSIBLE_DISTRESSED_SALE": {
        "title": "Hinweis auf Verkaufsdruck",
        "severity": "low",
        "explanation": "Inseratstext deutet auf Erbe, Trennung, Leerstand oder Zeitdruck hin - das ist eine Chance, kein Risiko.",
        "dd": ["Verkaufsmotiv im Erstgespraech offen erfragen", "Verkaeufermotiv im Deal setzen (steuert Dossier-Taktik)"],
        "mitigation": ["Tempo/Sicherheit als Zugestaendnis gegen Preis tauschen"],
        "price": None,
    },
}

_GENERIC = {
    "title": "Manuelle Pruefung erforderlich",
    "severity": "medium",
    "explanation": "Geflaggter Punkt ohne Katalogeintrag - manuell bewerten.",
    "dd": ["Flag manuell pruefen und Ergebnis als Notiz am Deal dokumentieren"],
    "mitigation": [],
    "price": None,
}


def build_risk_matrix(red_flags: list[str], signal_types: Optional[list[str]] = None) -> RiskMatrix:
    items: list[RiskItem] = []
    seen: set[str] = set()
    for code in list(red_flags) + list(signal_types or []):
        if code in seen:
            continue
        seen.add(code)
        entry = _CATALOG.get(code)
        if entry is None and code in {"LONG_TIME_ON_MARKET", "PRICE_REDUCTION", "BELOW_MARKET_PRICE", "RENT_BELOW_MARKET"}:
            # Pure opportunity signals are leverage, not risk - skip here.
            continue
        if entry is None and code in {"ENERGY_RISK"}:
            entry = _CATALOG["poor_energy_class_without_capex_buffer"]
        if entry is None and code in {"MISSING_ENERGY_CERTIFICATE"}:
            entry = _CATALOG["missing_energy_data"]
        if entry is None and code in {"MISSING_WEG_DOCUMENTS", "weg_reserve_unknown", "weg_arrears_unknown", "weg_no_protocols_reviewed"}:
            entry = _CATALOG["missing_weg_reserve"]
        if entry is None and code == "weg_reserve_contribution_too_low":
            entry = _CATALOG["weg_reserve_critically_low"]
        if entry is None:
            entry = _GENERIC
        items.append(
            RiskItem(
                code=code,
                title=entry["title"],
                severity=entry["severity"],
                explanation=entry["explanation"],
                due_diligence_actions=entry["dd"],
                mitigations=entry["mitigation"],
                price_consequence=entry["price"],
            )
        )

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda item: severity_rank.get(item.severity, 3))
    high = sum(1 for item in items if item.severity == "high")
    medium = sum(1 for item in items if item.severity == "medium")

    if high >= 3:
        summary = f"{high} schwere Risiken: Nur mit deutlichem Abschlag weiterverfolgen oder absagen."
    elif high >= 1:
        summary = f"{high} schweres Risiko / {medium} mittlere: Vor Angebot gezielt entkraeften oder einpreisen."
    elif medium >= 1:
        summary = f"Keine schweren Risiken, {medium} mittlere Punkte fuer die Due Diligence."
    else:
        summary = "Keine geflaggten Risiken im aktuellen Modell - Datenluecken trotzdem pruefen."

    return RiskMatrix(items=items, high_count=high, medium_count=medium, summary=summary)
