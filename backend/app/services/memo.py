from __future__ import annotations


def build_investment_memo(deal_payload: dict) -> dict:
    listing = deal_payload.get("listing") or {}
    underwriting = deal_payload.get("latest_underwriting") or {}
    score = deal_payload.get("latest_score") or {}
    rent = deal_payload.get("rent_law") or {}

    recommendation = score.get("next_recommended_action") or "Run underwriting and scoring before making an offer."
    red_flags = score.get("red_flags") or []

    return {
        "deal_id": deal_payload.get("id"),
        "title": f"Investment memo - {deal_payload.get('title')}",
        "sections": [
            {
                "title": "Executive summary",
                "items": [
                    f"Recommendation: {recommendation}",
                    f"Total score: {score.get('total_score', 'not scored')}",
                    f"Red flags: {len(red_flags)}",
                ],
            },
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
                ],
            },
            {"title": "Red flags", "items": red_flags or ["No hard red flags from current model."]},
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
        ],
    }
