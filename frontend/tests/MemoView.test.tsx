import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoView } from "../src/components/MemoView";
import { getDeal, getInvestmentMemo } from "../src/lib/api";
import { Deal, InvestmentMemo } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getDeal: vi.fn(),
  getInvestmentMemo: vi.fn()
}));

const getDealMock = vi.mocked(getDeal);
const getInvestmentMemoMock = vi.mocked(getInvestmentMemo);

function memo(): InvestmentMemo {
  return {
    deal_id: 9,
    title: "Investment Memo",
    sections: [
      {
        title: "Executive summary",
        items: ["Static backend memo remains visible."]
      }
    ]
  };
}

function deal(): Deal {
  return {
    id: 9,
    title: "Messestadt value-add candidate",
    pipeline_stage: "New",
    listing: {
      id: 3,
      title: "Listing",
      city: "Munich",
      postal_code: "81829",
      purchase_price: 520000,
      living_area_sqm: 58,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      house_money_monthly: 360,
      non_recoverable_costs_monthly: 130,
      expected_initial_capex: 45000,
      latitude: 48.131,
      longitude: 11.691
    },
    latest_score: {
      total_score: 58,
      category_scores: { location_and_demand: 84 },
      explanation: "Good location but weak debt coverage.",
      positive_factors: [],
      negative_factors: ["Base case cashflow is negative."],
      red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
      next_recommended_action: "Reject or renegotiate materially before diligence."
    },
    latest_underwriting: {
      monthly_cashflow_before_tax: -824,
      dscr: 0.57,
      max_purchase_price_for_neutral_cashflow: 295266.67,
      maximum_purchase_price_for_target_yield: 301801.6,
      residual_debt_factor_rating: "red"
    },
    location: {
      micro_location_score: 86,
      transit_access_score: 92,
      daily_needs_score: 88,
      demand_anchor_score: 84,
      leisure_quality_score: 81,
      short_term_rental_score: 78,
      nuisance_resilience_score: 55,
      evidence_confidence: "high",
      evidence_data_completeness_percent: 82,
      evidence_inputs: {
        nearest_rapid_transit_meters: 280,
        nearest_trade_fair_meters: 1800,
        nearest_recreation_anchor_meters: 1300,
        hotels_1500m: 6,
        short_term_rental_occupancy_percent: 76,
        short_term_rental_legal_status: "restricted",
        main_road_meters: 120
      },
      evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
    },
    latest_renovation_case: {
      id: 5,
      inputs: {
        planned_capex: 45000,
        target_cold_rent_monthly: 1900,
        valuation_yield_percent: 5,
        refinance_ltv_percent: 65
      },
      results: {
        planned_capex: 45000,
        current_cold_rent_monthly: 1325,
        target_cold_rent_monthly: 1900,
        annual_rent_uplift: 6900,
        implied_value_uplift_from_rent: 138000,
        post_renovation_value: 653000,
        current_loan_amount: 386250,
        refinanceable_debt_after_renovation: 424450,
        potential_equity_released: 38200,
        net_equity_still_bound_after_refinance: 6800,
        simple_roi_percent: 15.33,
        value_add_multiple: 3.07,
        kfw_hint: null,
        recommendation: "possible_value_add",
        warnings: []
      }
    },
    documents: [
      { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed" },
      { id: 2, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed" }
    ],
    signals: []
  };
}

describe("MemoView", () => {
  beforeEach(() => {
    getDealMock.mockReset();
    getInvestmentMemoMock.mockReset();
  });

  it("shows a real loading state before memo and deal data are available", () => {
    getInvestmentMemoMock.mockReturnValueOnce(new Promise<InvestmentMemo>(() => undefined));
    getDealMock.mockResolvedValueOnce(deal());

    render(<MemoView dealId="9" />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Investment-Memo wird geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Investment- oder Preisentscheidung ableiten/i);
    expect(screen.queryByText("Lade Memo...")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Memo-Cockpit/i)).not.toBeInTheDocument();
  });

  it("shows an API error state with retry instead of an endless memo loader", async () => {
    getInvestmentMemoMock
      .mockRejectedValueOnce(new Error("Memo API offline"))
      .mockResolvedValueOnce(memo());
    getDealMock.mockResolvedValueOnce(deal()).mockResolvedValueOnce(deal());

    render(<MemoView dealId="9" />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Investment-Memo konnte nicht geladen werden");
    expect(errorState).toHaveTextContent("Memo API offline");
    expect(screen.queryByText("Lade Memo...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByLabelText(/Memo-Cockpit/i)).toBeInTheDocument();
    expect(getInvestmentMemoMock).toHaveBeenCalledTimes(2);
  });

  it("shows a committee memo cockpit before the static memo sections", async () => {
    getInvestmentMemoMock.mockResolvedValueOnce(memo());
    getDealMock.mockResolvedValueOnce(deal());

    render(<MemoView dealId="9" />);

    expect(await screen.findByLabelText(/Memo-Cockpit/i)).toBeInTheDocument();
    expect(screen.getByText("Memo-Cockpit: Nicht bieten")).toBeInTheDocument();
    expect(screen.getAllByText("Walk-away").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("295.000 €")).toBeInTheDocument();
    expect(screen.getByText("Lage-Alpha")).toBeInTheDocument();
    expect(screen.getByText("Stark / Memo")).toBeInTheDocument();
    expect(screen.getByText("Entwicklung")).toBeInTheDocument();
    expect(screen.getByText("0 € Preis-Credit")).toBeInTheDocument();
    expect(screen.getByText(/kein Lageaufschlag im Walk-away/i)).toBeInTheDocument();
    expect(screen.getByText(/0 € im Walk-away/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Airbnb/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/WEG- und Geo-Check/i)).toBeInTheDocument();
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByText("Static backend memo remains visible.")).toBeInTheDocument();
  });

  it("shows the object development thesis inside the investment memo", async () => {
    getInvestmentMemoMock.mockResolvedValueOnce(memo());
    getDealMock.mockResolvedValueOnce(deal());

    render(<MemoView dealId="9" />);

    const developmentThesis = await screen.findByLabelText(/Memo-Entwicklungsthese/i);
    const developmentCommand = within(developmentThesis).getByLabelText(/Memo-Entwicklungs-Kompass/i);

    expect(developmentCommand).toHaveTextContent(/Entwicklungs-Kompass:/i);
    expect(developmentCommand).toHaveTextContent(/Fokushebel/i);
    expect(developmentCommand).toHaveTextContent(/Preisfreigabe/i);
    expect(developmentCommand).toHaveTextContent(/Freigabe-Sperre/i);
    expect(developmentCommand).toHaveTextContent(/0 € im Kaufpreis/i);
    expect(developmentCommand).toHaveTextContent(/Mietvertrag oder rechtlich plausible Zielmiete fehlt/i);
    expect(within(developmentThesis).getByText(/Entwicklungspotential:/i)).toBeInTheDocument();
    const developmentCase = within(developmentThesis).getByLabelText(/Memo-Entwicklungsfall-Herkunft/i);
    expect(developmentCase).toHaveTextContent("Case #5");
    expect(developmentCase).toHaveTextContent("Zielmiete");
    expect(developmentCase).toHaveTextContent("1.900 €");
    expect(developmentCase).toHaveTextContent("Capex");
    expect(developmentCase).toHaveTextContent("45.000 €");
    expect(developmentCase).toHaveTextContent("Refi-LTV");
    expect(developmentCase).toHaveTextContent("65 %");
    expect(developmentCase).toHaveTextContent(/Nicht blind in Kaufpreis oder Finanzierung einrechnen/i);
    expect(within(developmentThesis).getAllByText("Top-Hebel").length).toBeGreaterThanOrEqual(1);
    expect(within(developmentThesis).getAllByText("Memo-Upside").length).toBeGreaterThanOrEqual(1);
    expect(within(developmentThesis).getAllByText(/Mietanpassung/i).length).toBeGreaterThanOrEqual(1);
    expect(within(developmentThesis).getByText("Preis-Regel")).toBeInTheDocument();
    expect(within(developmentThesis).getByText(/Memo-Upside: Nicht in den Kaufpreis einrechnen/i)).toBeInTheDocument();
    expect(within(developmentThesis).getAllByText("Naechste Belege").length).toBeGreaterThanOrEqual(1);
    expect(within(developmentThesis).getAllByText(/Mietvertrag oder rechtlich plausible Zielmiete fehlt/i).length).toBeGreaterThanOrEqual(1);
  });
});
