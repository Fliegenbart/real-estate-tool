from __future__ import annotations


REQUIRED_DUE_DILIGENCE_DOCUMENTS = [
    ("expose", "Expose"),
    ("energy_certificate", "Energieausweis"),
    ("declaration_of_division", "Teilungserklaerung"),
    ("weg_minutes", "WEG-Protokolle"),
    ("economic_plan", "Wirtschaftsplan"),
    ("annual_statement", "Jahresabrechnung"),
    ("maintenance_reserve_statement", "Ruecklagenstand"),
    ("rental_contract", "Mietvertrag"),
    ("floor_plan", "Grundriss"),
    ("land_register_excerpt", "Grundbuchauszug"),
]


def build_investment_memo(deal_payload: dict) -> dict:
    listing = deal_payload.get("listing") or {}
    underwriting = deal_payload.get("latest_underwriting") or {}
    score = deal_payload.get("latest_score") or {}
    rent = deal_payload.get("rent_law") or {}
    weg = (deal_payload.get("weg_health") or {}).get("results") or {}
    renovation = (deal_payload.get("latest_renovation_case") or {}).get("results") or {}

    recommendation = score.get("next_recommended_action") or "Run underwriting and scoring before making an offer."
    red_flags = score.get("red_flags") or []
    ic_gate = build_ic_gate(deal_payload)
    offer_release = build_offer_release(deal_payload, ic_gate)

    sections = [
        {
            "title": "Executive summary",
            "items": [
                f"IC decision: {ic_gate['decision_label']}",
                f"Offer release: {offer_release['release_label']} - Walk-away {format_int(ic_gate['walk_away_price'])} EUR",
                f"Recommendation: {recommendation}",
                f"Total score: {score.get('total_score', 'not scored')}",
                f"Red flags: {len(red_flags)}",
            ],
        },
        ic_gate,
        offer_release,
        build_development_evidence(deal_payload, ic_gate),
        build_micro_location_evidence(deal_payload.get("location") or {}),
        build_blockers_and_next_evidence(deal_payload, ic_gate),
        {
            "title": "Deal overview",
            "items": [
                f"City: {listing.get('city')}",
                f"Purchase price: {listing.get('purchase_price')}",
                f"Living area sqm: {listing.get('living_area_sqm')}",
                f"Status: {deal_payload.get('pipeline_stage')}",
            ],
        },
        {
            "title": "Key financials",
            "items": [
                f"Gross yield: {underwriting.get('gross_initial_yield_percent')}",
                f"Net yield: {underwriting.get('net_initial_yield_percent')}",
                f"Monthly cashflow before tax: {underwriting.get('monthly_cashflow_before_tax')}",
                f"DSCR: {underwriting.get('dscr')}",
                f"Max purchase price for target yield: {underwriting.get('maximum_purchase_price_for_target_yield')}",
            ],
        },
        {
            "title": "Rent assumptions",
            "items": [
                f"Current rent: {listing.get('cold_rent_monthly')}",
                f"Market rent estimate: {listing.get('market_rent_estimate_monthly')}",
                f"Legally plausible target per sqm: {rent.get('legally_plausible_target_rent_per_sqm')}",
                f"Rent-law status: {rent.get('status')}",
            ],
        },
        {
            "title": "Financing assumptions",
            "items": [
                f"Loan amount: {underwriting.get('loan_amount')}",
                f"Equity required: {underwriting.get('equity_required')}",
                f"Annual debt service: {underwriting.get('annual_debt_service')}",
            ],
        },
        {
            "title": "Tax assumptions",
            "items": [
                underwriting.get("tax_warning")
                or "Tax calculation is simplified and must be reviewed by a Steuerberater.",
                f"Annual tax approx: {underwriting.get('annual_tax_approx')}",
            ],
        },
        {
            "title": "Location assessment",
            "items": [
                f"Location score: {(score.get('category_scores') or {}).get('location_and_demand')}",
                "MVP location data is mock/manual and must be replaced with validated sources for investment decisions.",
            ],
        },
        {
            "title": "Technical/WEG/energy risks",
            "items": [
                f"Energy class: {listing.get('energy_class')}",
                f"House money: {listing.get('house_money_monthly')}",
                f"Maintenance reserve WEG: {listing.get('maintenance_reserve_weg')}",
                f"WEG health score: {weg.get('total_score', 'not assessed')} ({weg.get('confidence', 'no data')})",
                weg.get("summary") or "WEG-Gesundheit noch nicht erfasst - Dokumente anfordern.",
            ],
        },
        {
            "title": "Financing stress test",
            "items": [
                f"Remaining loan after holding period: {underwriting.get('remaining_loan_after_holding')}",
                f"Refi stress rate: {underwriting.get('stressed_interest_rate_percent')}%",
                f"Stressed monthly cashflow: {underwriting.get('stressed_monthly_cashflow_before_tax')}",
                f"Stressed DSCR: {underwriting.get('stressed_dscr')}",
                (
                    f"Residual debt factor at fixation end: {underwriting.get('residual_debt_factor')} monthly rents "
                    f"({underwriting.get('residual_debt_factor_rating')}; target <= 150). "
                    f"Gap to target: {underwriting.get('amortization_gap_to_target_factor')}"
                ),
            ],
        },
        {
            "title": "Opportunity signals",
            "items": [
                f"[{signal.get('severity')}] {signal.get('type')}: {signal.get('explanation')}"
                for signal in (deal_payload.get("signals") or [])
            ]
            or ["No signals derived - listing history may be too fresh."],
        },
        {"title": "Red flags", "items": red_flags or ["No hard red flags from current model."]},
        {
            "title": "Risks & mitigations",
            "items": [
                f"[{item.get('severity')}] {item.get('title')}: {item.get('explanation')} "
                f"Mitigation: {'; '.join(item.get('mitigations') or ['-'])}"
                for item in ((deal_payload.get("risk_matrix") or {}).get("items") or [])
            ]
            or ["Risk matrix not computed - run scoring first."],
        },
        {"title": "Recommendation", "items": [recommendation]},
        {
            "title": "Open due diligence questions",
            "items": [
                "Validate Mietspiegel and rent-control exceptions with counsel.",
                "Review WEG minutes, economic plan, annual statement, and reserve statement.",
                "Confirm energy certificate, heating replacement risk, and capex budget.",
                "Confirm financing terms and tax assumptions with bank and Steuerberater.",
            ],
        },
    ]
    if renovation:
        sections.insert(
            6,
            {
                "title": "Sanierungs-/Refi-Case",
                "items": [
                    f"Geplantes Sanierungsbudget: {renovation.get('planned_capex')}",
                    f"Wertsteigerung aus Miete: {renovation.get('implied_value_uplift_from_rent')}",
                    f"Post-Sanierungswert: {renovation.get('post_renovation_value')}",
                    f"Kapital freisetzbar: {renovation.get('potential_equity_released')}",
                    f"Nach Refi gebundenes Sanierungskapital: {renovation.get('net_equity_still_bound_after_refinance')}",
                    f"Sanierungs-ROI: {renovation.get('simple_roi_percent')}%",
                    f"Empfehlung: {renovation.get('recommendation')}",
                ]
                + [
                    f"Hinweis: {warning}"
                    for warning in (renovation.get("warnings") or [])
                ],
            },
        )

    return {
        "deal_id": deal_payload.get("id"),
        "title": f"Investment memo - {deal_payload.get('title')}",
        "sections": sections,
    }


def build_ic_gate(deal_payload: dict) -> dict:
    listing = deal_payload.get("listing") or {}
    underwriting = deal_payload.get("latest_underwriting") or {}
    score = deal_payload.get("latest_score") or {}
    red_flags = score.get("red_flags") or []

    monthly_cashflow = number_or_none(underwriting.get("monthly_cashflow_before_tax"))
    dscr = number_or_none(underwriting.get("dscr"))
    total_score = number_or_none(score.get("total_score"))
    walk_away_price = (
        number_or_none(underwriting.get("max_purchase_price_for_neutral_cashflow"))
        or number_or_none(underwriting.get("maximum_purchase_price_for_target_yield"))
        or number_or_none(listing.get("purchase_price"))
    )

    blockers: list[str] = []
    review_items: list[str] = []
    if monthly_cashflow is None:
        review_items.append("Cashflow fehlt.")
    elif monthly_cashflow < 0:
        blockers.append(f"Cashflow {format_int(monthly_cashflow)} EUR ist negativ.")
    if dscr is None:
        review_items.append("DSCR fehlt.")
    elif dscr < 1.1:
        blockers.append(f"DSCR {format_decimal(dscr)} liegt unter 1.10.")
    if total_score is None:
        review_items.append("Score fehlt.")
    elif total_score < 60:
        blockers.append(f"Gesamtscore {format_int(total_score)} liegt unter Buy-Box.")
    if underwriting.get("residual_debt_factor_rating") == "red":
        blockers.append("Restschuld-Faktor ist rot.")
    if red_flags:
        review_items.append(f"{len(red_flags)} rote Flaggen im Score pruefen.")

    if blockers:
        decision_label = "Nicht bieten"
    elif review_items:
        decision_label = "Nur indikativ pruefen"
    else:
        decision_label = "Komitee-reif pruefen"

    return {
        "title": "IC Entscheidungs-Gate",
        "decision_label": decision_label,
        "walk_away_price": walk_away_price,
        "blocker_count": len(blockers),
        "review_count": len(review_items),
        "items": [
            f"Entscheidung: {decision_label}.",
            f"Walk-away: {format_int(walk_away_price)} EUR intern als harte Preisgrenze fuehren.",
            f"Wirtschaftlichkeit: Cashflow {format_value(monthly_cashflow)} EUR, DSCR {format_value(dscr)}.",
            f"Score: {format_value(total_score)}; rote Flaggen: {len(red_flags)}.",
        ]
        + blockers
        + review_items,
    }


def build_offer_release(deal_payload: dict, ic_gate: dict) -> dict:
    listing = deal_payload.get("listing") or {}
    underwriting = deal_payload.get("latest_underwriting") or {}
    purchase_price = number_or_none(listing.get("purchase_price"))
    walk_away = ic_gate.get("walk_away_price")
    start_offer = None
    if isinstance(walk_away, (float, int)):
        start_offer = walk_away * 0.9

    release_label = "Nicht senden" if ic_gate.get("blocker_count", 0) else "Nur indikativ"
    if not underwriting:
        release_label = "Nicht senden"

    seller_line = (
        f"Der aktuelle Preis {format_int(purchase_price)} EUR liegt ueber meinem belegbaren "
        f"Walk-away {format_int(walk_away)} EUR; ich pruefe nur weiter, wenn der Preis in diesen Rahmen kommt."
    )

    return {
        "title": "Angebotsfreigabe",
        "release_label": release_label,
        "items": [
            f"Freigabe: {release_label}.",
            f"Externer Satz: {seller_line}",
            f"Startindikation: {format_int(start_offer)} EUR; Walk-away bleibt intern bei {format_int(walk_away)} EUR.",
            "Nur unverbindliche Preisindikation, kein bindendes Angebot und kein Notartermin.",
            "Vor Versand Unterlagen, Finanzierung und fachliche Due Diligence pruefen.",
        ],
    }


def build_development_evidence(deal_payload: dict, ic_gate: dict) -> dict:
    listing = deal_payload.get("listing") or {}
    renovation = (deal_payload.get("latest_renovation_case") or {}).get("results") or {}

    value_uplift = number_or_none(renovation.get("implied_value_uplift_from_rent"))
    equity_release = number_or_none(renovation.get("potential_equity_released"))
    capex = number_or_none(renovation.get("planned_capex")) or number_or_none(listing.get("expected_initial_capex"))
    roi = number_or_none(renovation.get("simple_roi_percent"))

    price_credit = "0 EUR Preis-Credit"
    if ic_gate.get("blocker_count", 0) == 0 and value_uplift and equity_release and equity_release > 0:
        capped_credit = min(equity_release, value_uplift * 0.25)
        price_credit = f"max. {format_int(capped_credit)} EUR Preis-Credit"

    if renovation:
        items = [
            f"Rechnerischer Werthebel aus Miete: {format_int(value_uplift)} EUR.",
            f"Kapital freisetzbar nach Refi: {format_int(equity_release)} EUR.",
            f"Capex-Annahme: {format_int(capex)} EUR; Sanierungs-ROI {format_value(roi)}%.",
            f"Kaufpreisdisziplin: {price_credit}, bis WEG, Geo, Capex und Bank-Case belegt sind.",
        ]
    else:
        items = [
            "Kein gespeicherter Sanierungs-/Refi-Case.",
            "Kaufpreisdisziplin: 0 EUR Preis-Credit, bis WEG, Geo, Capex und Bank-Case belegt sind.",
        ]

    return {
        "title": "Entwicklungspotential & Belege",
        "items": items
        + [
            f"Entwicklungs-Kompass: Entwicklung intern als Upside pruefen; Preisfreigabe bleibt {price_credit}, bis WEG, Geo, Capex und Bank-Case geschlossen sind.",
            "Externe Kommunikation: Entwicklungspotential nicht als Preisargument an Makler oder Verkaeufer senden.",
            "Entwicklungspotential ist Memo-Chance, nicht Basis-Cashflow.",
            "Vor Preisaufschlag: Grundriss, WEG-Beschlusslage, Energieausweis, Capex-Angebot und Bankbewertung belegen.",
        ],
    }


def build_micro_location_evidence(location: dict) -> dict:
    evidence = location.get("evidence_inputs") or {}
    legal_status = evidence.get("short_term_rental_legal_status") or "unbekannt"
    items = [
        (
            f"Mikrolage-Score: {format_value(location.get('micro_location_score'))}; "
            f"Beleglage {format_value(location.get('evidence_data_completeness_percent'))}%."
        ),
        f"OePNV {format_distance(evidence.get('nearest_rapid_transit_meters'))}; Alltagsscore {format_value(location.get('daily_needs_score'))}.",
        f"Messe {format_distance(evidence.get('nearest_trade_fair_meters'))}; Freizeit {format_distance(evidence.get('nearest_recreation_anchor_meters'))}.",
        f"Airbnb {format_percent(evidence.get('short_term_rental_occupancy_percent'))} ({legal_status}) nur als Upside-Memo, nicht als Basis-Cashflow.",
        f"Stoerfaktoren: Hauptstrasse {format_distance(evidence.get('main_road_meters'))}; Resilienzscore {format_value(location.get('nuisance_resilience_score'))}.",
    ]
    if location.get("evidence_confidence"):
        items.append(f"Lage-Evidenz: {location.get('evidence_confidence')}.")
    return {"title": "Mikrolage-Belege", "items": items}


def build_blockers_and_next_evidence(deal_payload: dict, ic_gate: dict) -> dict:
    missing_documents = missing_due_diligence_documents(deal_payload.get("documents") or [])
    items = [
        f"{len(missing_documents)} Pflichtunterlagen fehlen: {', '.join(missing_documents) or 'keine'}.",
        "Kein finales Angebot, solange Wirtschaftlichkeit, Unterlagen, WEG, Geo/Baurecht und Bank-Case nicht freigegeben sind.",
    ]
    if ic_gate.get("blocker_count", 0):
        items.append(f"{ic_gate.get('blocker_count')} harte IC-Blocker vor Wiedervorlage klaeren.")
    items.extend(
        [
            "Naechster Schritt: fehlende Unterlagen anfordern und Preisanker gegen Walk-away spiegeln.",
            "Entwicklung erst nach belastbaren Belegen in Kaufpreis, LTV oder Komitee-Freigabe einrechnen.",
        ]
    )
    return {"title": "Stopper & naechste Belege", "items": items}


def missing_due_diligence_documents(documents: list[dict]) -> list[str]:
    present = {document.get("document_type") for document in documents}
    return [label for document_type, label in REQUIRED_DUE_DILIGENCE_DOCUMENTS if document_type not in present]


def number_or_none(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def format_int(value) -> str:
    number = number_or_none(value)
    if number is None:
        return "n/a"
    return str(int(round(number)))


def format_decimal(value) -> str:
    number = number_or_none(value)
    if number is None:
        return "n/a"
    return f"{number:.2f}"


def format_value(value) -> str:
    number = number_or_none(value)
    if number is None:
        return "n/a"
    if abs(number - round(number)) < 0.005:
        return str(int(round(number)))
    return f"{number:.2f}"


def format_distance(value) -> str:
    number = number_or_none(value)
    if number is None:
        return "n/a"
    return f"{int(round(number))} m"


def format_percent(value) -> str:
    number = number_or_none(value)
    if number is None:
        return "n/a"
    return f"{int(round(number))}%"
