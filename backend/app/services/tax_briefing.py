from __future__ import annotations

from typing import Any, Optional

from app.services.germany import normalize_state, transfer_tax_percent_for_state


def build_tax_briefing(deal_payload: dict[str, Any]) -> dict[str, Any]:
    """A per-deal question list for the Steuerberater meeting. The tool never
    decides tax questions - it prepares them."""

    listing = deal_payload.get("listing") or {}
    tax = deal_payload.get("tax") or {}
    underwriting = deal_payload.get("latest_underwriting") or {}
    state = normalize_state(listing.get("federal_state"))
    grest = transfer_tax_percent_for_state(listing.get("federal_state"))

    sections: list[dict[str, Any]] = []

    sections.append(
        {
            "title": "Struktur & erweiterte Gewerbesteuerkuerzung",
            "questions": [
                "Erfuellt die vvGmbH die Voraussetzungen der erweiterten Kuerzung (Paragraf 9 Nr. 1 S. 2 GewStG) - ausschliesslich Verwaltung eigenen Grundbesitzes?",
                "Welche Nebentaetigkeiten (z.B. Stellplatz an Dritte, Betriebsvorrichtungen wie PV/Aufzugssonderfaelle, Moeblierung) wuerden die Kuerzung kippen?",
                "Soll der Kauf in der bestehenden vvGmbH oder in einer Objektgesellschaft erfolgen?",
            ],
        }
    )

    afa_questions = [
        "Kaufpreisaufteilung Gebaeude/Boden: Bodenrichtwert (BORIS) heranziehen und im Notarvertrag dokumentieren - welcher Gebaeudeanteil ist hier vertretbar?",
        f"Aktueller Modellwert im Tool: {tax.get('building_share_percent', 80)}% Gebaeudeanteil, {tax.get('depreciation_rate_percent', 2)}% AfA - realistisch fuer Baujahr {listing.get('construction_year') or 'unbekannt'}?",
        "Kommt eine kuerzere Restnutzungsdauer per Gutachten in Frage (hoehere AfA)?",
        "Anschaffungsnaher Aufwand: Geplante Renovierung unter 15% der Gebaeude-Anschaffungskosten halten (Paragraf 6 Abs. 1 Nr. 1a EStG) - wo liegt hier die Grenze in Euro?",
    ]
    sections.append({"title": "AfA & Anschaffungskosten", "questions": afa_questions})

    financing_questions = [
        "Gesellschafterdarlehen von der David Wegener Marketing Consulting GmbH: Zinssatz, Laufzeit, Besicherung fremdueblich gestalten - welcher Zins ist dokumentierbar marktueblich?",
        "Steuerleck beachten: Zinsertrag bei der operativen GmbH voll steuerpflichtig (~30%), Abzug in der vvGmbH nur ~15,8% - ab welcher Groessenordnung lohnt stattdessen Ausschuettung + Einlage oder Bankfinanzierung?",
        "Rangruecktritt fuer das Gesellschafterdarlehen noetig, damit die Bank finanziert?",
        "Disagio, Bereitstellungszinsen, Finanzierungskosten: was ist sofort abziehbar?",
    ]
    sections.append({"title": "Finanzierung & Gesellschafterdarlehen", "questions": financing_questions})

    grest_text = (
        f"Grunderwerbsteuer {state}: {grest}%"
        if state and grest is not None
        else "Grunderwerbsteuer: Bundesland im Listing pflegen fuer korrekten Satz"
    )
    sections.append(
        {
            "title": "Transaktion",
            "questions": [
                grest_text + " - im Underwriting korrekt angesetzt?",
                "Instandhaltungsruecklage der WEG im Kaufvertrag separat ausweisen (mindert GrESt-Bemessungsgrundlage)?",
                "Bewegliche Mitkaeufe (Kueche, Moebel) separat ausweisen - in welchem Umfang anerkennungsfaehig?",
            ],
        }
    )

    sections.append(
        {
            "title": "Geschenkte Wohnung Chemnitz (sofern relevant fuer diesen Deal)",
            "questions": [
                "Reihenfolge bestaetigen: Schenkung an mich persoenlich (Freibetrag 400k je Elternteil), erst dann ggf. Verkauf an die vvGmbH.",
                "Verkauf an die eigene vvGmbH: privat steuerfrei wegen geerbter Haltefrist (Paragraf 23 EStG, Fussstapfentheorie) - bestaetigen.",
                "AfA-Step-up in der GmbH auf den Verkehrswert + Verkaeuferdarlehen als entnehmbares Eigenkapital - Gestaltung tragfaehig?",
                "3-Objekt-Grenze / gewerblicher Grundstueckshandel im Blick behalten.",
            ],
        }
    )

    return {
        "deal_id": deal_payload.get("id"),
        "title": f"Steuerberater-Briefing - {deal_payload.get('title')}",
        "context": {
            "purchase_price": listing.get("purchase_price"),
            "federal_state": state,
            "annual_tax_model_value": underwriting.get("annual_tax_approx"),
            "effective_tax_rate_assumed_percent": 15.825,
        },
        "sections": sections,
        "disclaimer": (
            "Dieses Briefing ist eine Fragenliste, keine Steuerberatung. Antworten des Steuerberaters "
            "im Deal dokumentieren, bevor ein Angebot abgegeben wird."
        ),
    }
