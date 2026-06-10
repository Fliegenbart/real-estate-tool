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
  days_on_market?: number | null;
  price_events?: Array<{ id: number; price: number; recorded_at: string; source: string }>;
  price_reduction_count?: number;
  price_reduction_total_percent?: number | null;
  signals?: Signal[];
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
  amortization_schedule?: Array<{
    year: number;
    payment: number;
    interest: number;
    principal: number;
    remaining: number;
  }>;
  remaining_loan_after_holding?: number | null;
  stressed_interest_rate_percent?: number | null;
  stressed_annual_debt_service?: number | null;
  stressed_monthly_cashflow_before_tax?: number | null;
  stressed_dscr?: number | null;
  tax_warning?: string;
};

export type WegHealthInput = {
  construction_year?: number | null;
  total_units?: number | null;
  community_living_area_sqm?: number | string | null;
  reserve_total_eur?: number | string | null;
  annual_reserve_contribution_eur?: number | string | null;
  hausgeld_monthly_eur?: number | string | null;
  unit_living_area_sqm?: number | string | null;
  arrears_total_eur?: number | string | null;
  special_levies_last_5_years_eur?: number | string | null;
  planned_measures?: Array<{ title: string; estimated_cost_eur: number | string; funded_by: string }>;
  professional_management?: boolean | null;
  protocols_years_reviewed?: number;
  litigation_pending?: boolean | null;
  has_majority_owner?: boolean | null;
};

export type WegHealthResult = {
  total_score: number;
  category_scores: Record<string, number>;
  flags: string[];
  positive_factors: string[];
  negative_factors: string[];
  data_completeness_percent: number;
  confidence: string;
  summary: string;
  documents_to_request: string[];
};

export type NegotiationDossier = {
  arguments: Array<{
    code: string;
    title: string;
    evidence: string;
    estimated_discount_eur: number | null;
    script_line: string;
    strength: string;
  }>;
  leverage: string[];
  total_justified_discount_eur: number;
  price_ladder: {
    asking_price: number;
    anchor_price: number;
    target_price: number;
    walk_away_price: number;
    notes: string[];
  };
  seller_angle: string;
  opening_script: string[];
  disclaimer: string;
};

export type CapitalStackResult = {
  name: string;
  total_debt: number;
  total_equity: number;
  funding_gap: number;
  blended_interest_rate_percent: number | null;
  annual_debt_service: number;
  dscr: number | null;
  monthly_cashflow_before_tax: number;
  monthly_cashflow_after_tax_approx: number;
  annual_tax_approx: number;
  tranches: Array<{
    kind: string;
    label: string;
    amount: number;
    year_one_interest: number;
    year_one_payment: number;
  }>;
  intercompany_interest_annual: number;
  intercompany_tax_leakage_annual: number;
  intercompany_note: string | null;
  fremdvergleich_checklist: string[];
  warnings: string[];
};

export type GiftPropertyStrategy = {
  code: string;
  title: string;
  one_time_costs_eur: number;
  annual_tax_on_rent_eur: number;
  annual_afa_tax_shield_eur: number;
  liquidity_unlocked_eur: number;
  net_annual_rent_after_tax_eur: number;
  pros: string[];
  cons: string[];
  steuerberater_questions: string[];
};

export type GiftPropertyComparison = {
  assumptions: Record<string, number | string>;
  prerequisite_warning: string;
  strategies: GiftPropertyStrategy[];
  disclaimer: string;
};

export type Signal = {
  type: string;
  severity: string;
  explanation: string;
};

export type RiskMatrixItem = {
  code: string;
  title: string;
  severity: string;
  explanation: string;
  due_diligence_actions: string[];
  mitigations: string[];
  price_consequence: string | null;
};

export type RiskMatrix = {
  items: RiskMatrixItem[];
  high_count: number;
  medium_count: number;
  summary: string;
};

export type GeoContext = {
  id?: number;
  parcel_id?: string | null;
  ground_value_eur_per_sqm?: number | string | null;
  ground_value_source_id?: number | null;
  ground_value_data_date?: string | null;
  zoning_summary?: string | null;
  b_plan_available?: boolean | null;
  f_plan_summary?: string | null;
  milieu_protection_area?: boolean | null;
  redevelopment_area?: boolean | null;
  monument_protection?: boolean | null;
  notes?: string | null;
  data_confidence_percent?: number;
};

export type DataSource = {
  id: number;
  name: string;
  provider?: string | null;
  data_type: string;
  license_type?: string | null;
  commercial_use_allowed?: boolean | null;
  attribution_required?: boolean | null;
  geographic_coverage?: string | null;
  url?: string | null;
  last_import_at?: string | null;
  source_data_date?: string | null;
  update_frequency?: string | null;
  reliability_score: number;
  notes?: string | null;
};

export type TaxBriefing = {
  deal_id: number;
  title: string;
  context: Record<string, number | string | null>;
  sections: Array<{ title: string; questions: string[] }>;
  disclaimer: string;
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
  seller_motive?: string | null;
  listing?: Listing | null;
  latest_underwriting?: Underwriting | null;
  latest_score?: DealScore | null;
  weg_health?: { inputs: WegHealthInput; results: WegHealthResult; updated_at: string } | null;
  capital_stacks?: Array<{ id: number; name: string; results: CapitalStackResult }>;
  geo_context?: GeoContext | null;
  signals?: Signal[];
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
