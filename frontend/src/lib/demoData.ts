import { Dashboard, Deal, InvestmentMemo, Listing, PIPELINE_STAGES } from "./types";

export const demoListings: Listing[] = [
  {
    id: 1,
    source: "demo_seed",
    title: "Synthetic strong deal - Leipzig Altbau unit",
    city: "Leipzig",
    postal_code: "04129",
    purchase_price: 165000,
    living_area_sqm: 58,
    energy_class: "C",
    is_rented: true,
    cold_rent_monthly: 925,
    market_rent_estimate_monthly: 960,
    house_money_monthly: 210,
    non_recoverable_costs_monthly: 70,
    maintenance_reserve_weg: 360000,
    expected_initial_capex: 4000,
    status: "active"
  },
  {
    id: 2,
    source: "demo_seed",
    title: "Synthetic overpriced deal - Berlin compact unit",
    city: "Berlin",
    postal_code: "10405",
    purchase_price: 415000,
    living_area_sqm: 49,
    energy_class: "B",
    is_rented: false,
    cold_rent_monthly: 1170,
    market_rent_estimate_monthly: 1250,
    house_money_monthly: 240,
    non_recoverable_costs_monthly: 90,
    maintenance_reserve_weg: 240000,
    expected_initial_capex: 5000,
    status: "active"
  },
  {
    id: 3,
    source: "demo_seed",
    title: "Synthetic poor energy class deal - Essen",
    city: "Essen",
    postal_code: "45127",
    purchase_price: 132000,
    living_area_sqm: 47,
    energy_class: "H",
    is_rented: true,
    cold_rent_monthly: 575,
    market_rent_estimate_monthly: 620,
    house_money_monthly: 210,
    non_recoverable_costs_monthly: 88,
    maintenance_reserve_weg: 42000,
    expected_initial_capex: 3000,
    status: "active"
  }
];

export const demoDeals: Deal[] = [
  {
    id: 1,
    title: "Synthetic strong deal - Leipzig Altbau unit",
    pipeline_stage: "Underwriting",
    listing: demoListings[0],
    latest_underwriting: {
      gross_initial_yield_percent: 6.73,
      net_initial_yield_percent: 5.28,
      monthly_cashflow_before_tax: 177,
      dscr: 1.34,
      price_per_sqm: 2844.83,
      all_in_purchase_price: 184621,
      equity_required: 60871,
      maximum_purchase_price_for_target_yield: 215000,
      cash_on_cash_return_percent: 3.48,
      annual_debt_service: 7425,
      annual_tax_approx: 0,
      tax_warning: "Tax calculation is simplified and must be reviewed by a Steuerberater."
    },
    latest_score: {
      total_score: 81,
      category_scores: {
        return_and_cashflow: 78,
        price_attractiveness: 75,
        location_and_demand: 76,
        object_quality: 91,
        legal_regulatory_technical_risk: 88
      },
      explanation: "Score combines return, price, location, object quality, and risk.",
      positive_factors: ["Positive monthly cashflow in base case.", "Solid location metrics."],
      negative_factors: [],
      red_flags: [],
      next_recommended_action: "Underwrite further and request full WEG/rent/energy documents."
    }
  },
  {
    id: 2,
    title: "Synthetic overpriced deal - Berlin compact unit",
    pipeline_stage: "Interesting",
    listing: demoListings[1],
    latest_underwriting: {
      gross_initial_yield_percent: 3.38,
      net_initial_yield_percent: 2.31,
      monthly_cashflow_before_tax: -610,
      dscr: 0.48,
      price_per_sqm: 8469.39,
      maximum_purchase_price_for_target_yield: 251000,
      annual_tax_approx: 0
    },
    latest_score: {
      total_score: 42,
      category_scores: {
        return_and_cashflow: 28,
        price_attractiveness: 35,
        location_and_demand: 83,
        object_quality: 88,
        legal_regulatory_technical_risk: 52
      },
      explanation: "Strong location, but the price and cashflow do not work in base case.",
      positive_factors: ["Strong location metrics."],
      negative_factors: ["Base case cashflow is negative."],
      red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
      next_recommended_action: "Reject or renegotiate materially before spending diligence budget."
    }
  }
];

export const demoDashboard: Dashboard = {
  total_active_listings: demoListings.length,
  active_deals: demoDeals.length,
  average_gross_yield: 4.4,
  average_net_yield: 3.25,
  red_flagged_deals: 1,
  top_deals: demoDeals,
  pipeline: PIPELINE_STAGES.reduce(
    (acc, stage) => ({ ...acc, [stage]: demoDeals.filter((deal) => deal.pipeline_stage === stage).length }),
    {} as Dashboard["pipeline"]
  )
};

export const demoMemo: InvestmentMemo = {
  deal_id: 1,
  title: "Investment memo - Synthetic strong deal - Leipzig Altbau unit",
  sections: [
    {
      title: "Executive summary",
      items: [
        "Recommendation: Underwrite further and request full WEG/rent/energy documents.",
        "Total score: 81",
        "Red flags: 0"
      ]
    },
    {
      title: "Key financials",
      items: ["Gross yield: 5.42", "Net yield: 4.19", "Monthly cashflow before tax: 94"]
    },
    {
      title: "Open due diligence questions",
      items: [
        "Validate Mietspiegel and rent-control assumptions.",
        "Review WEG minutes, economic plan, annual statement, and reserve statement.",
        "Confirm financing terms and simplified tax assumptions."
      ]
    }
  ]
};
