export type PipelineStage =
  | "New"
  | "Interesting"
  | "Contacted"
  | "Documents requested"
  | "Underwriting"
  | "Offer submitted"
  | "Due diligence"
  | "Notary"
  | "Bought"
  | "Rejected";

export const PIPELINE_STAGES: PipelineStage[] = [
  "New",
  "Interesting",
  "Contacted",
  "Documents requested",
  "Underwriting",
  "Offer submitted",
  "Due diligence",
  "Notary",
  "Bought",
  "Rejected"
];

export type Listing = {
  id: number;
  source?: string | null;
  external_id?: string | null;
  title: string;
  description?: string | null;
  street?: string | null;
  house_number?: string | null;
  city?: string | null;
  postal_code?: string | null;
  federal_state?: string | null;
  purchase_price?: number | null;
  living_area_sqm?: number | null;
  number_of_rooms?: number | null;
  floor?: string | null;
  construction_year?: number | null;
  condition?: string | null;
  energy_class?: string | null;
  heating_type?: string | null;
  energy_consumption_kwh?: number | null;
  is_rented?: boolean;
  cold_rent_monthly?: number | null;
  market_rent_estimate_monthly?: number | null;
  house_money_monthly?: number | null;
  non_recoverable_costs_monthly?: number | null;
  maintenance_reserve_weg?: number | null;
  expected_initial_capex?: number | null;
  listing_url?: string | null;
  first_seen_at?: string | null;
  status?: string;
};

export type Underwriting = {
  price_per_sqm?: number | null;
  all_in_purchase_price?: number | null;
  annual_cold_rent?: number | null;
  gross_initial_yield_percent?: number | null;
  net_operating_income?: number | null;
  net_initial_yield_percent?: number | null;
  annual_debt_service?: number | null;
  monthly_cashflow_before_tax?: number | null;
  monthly_cashflow_after_tax_approx?: number | null;
  dscr?: number | null;
  loan_amount?: number | null;
  equity_required?: number | null;
  cash_on_cash_return_percent?: number | null;
  break_even_rent_monthly?: number | null;
  rent_factor?: number | null;
  maximum_purchase_price_for_target_yield?: number | null;
  simple_exit_value?: number | null;
  simple_equity_multiple?: number | null;
  simple_irr_approximation_percent?: number | null;
  annual_tax_approx?: number | null;
  tax_warning?: string;
};

export type DealScore = {
  total_score: number;
  category_scores: Record<string, number>;
  explanation: string;
  positive_factors: string[];
  negative_factors: string[];
  red_flags: string[];
  next_recommended_action: string;
};

export type Deal = {
  id: number;
  title: string;
  pipeline_stage: PipelineStage;
  status?: string;
  listing?: Listing | null;
  latest_underwriting?: Underwriting | null;
  latest_score?: DealScore | null;
  financing?: Record<string, number | string | boolean | null> | null;
  tax?: Record<string, number | string | boolean | null> | null;
  rent_law?: Record<string, number | string | boolean | string[] | null> | null;
  location?: Record<string, number | string | null> | null;
  risk_flags?: Array<Record<string, string | number | null>>;
  documents?: Array<Record<string, string | number | null>>;
};

export type Dashboard = {
  total_active_listings: number;
  active_deals: number;
  average_gross_yield: number | null;
  average_net_yield: number | null;
  red_flagged_deals: number;
  top_deals: Deal[];
  pipeline: Record<PipelineStage, number>;
};

export type InvestmentMemo = {
  deal_id: number;
  title: string;
  sections: Array<{ title: string; items: string[] }>;
};

export type ListingFilters = {
  city: string;
  rented: "all" | "rented" | "vacant";
  missingData: boolean;
  energyClass?: string;
  source?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
};
