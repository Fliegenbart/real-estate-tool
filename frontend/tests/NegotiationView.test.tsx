import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NegotiationView } from "../src/components/NegotiationView";
import { getDeal, getNegotiationDossier, updateSellerMotive } from "../src/lib/api";
import { Deal, NegotiationDossier } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getDeal: vi.fn(),
  getNegotiationDossier: vi.fn(),
  updateSellerMotive: vi.fn()
}));

const getDealMock = vi.mocked(getDeal);
const getNegotiationDossierMock = vi.mocked(getNegotiationDossier);
const updateSellerMotiveMock = vi.mocked(updateSellerMotive);

function deal(): Deal {
  return {
    id: 1,
    title: "Synthetic good location but low yield - Munich",
    pipeline_stage: "New",
    seller_motive: null,
    listing: {
      id: 8,
      title: "Listing",
      city: "Munich",
      postal_code: "80796",
      purchase_price: 515000,
      living_area_sqm: 58,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    },
    latest_underwriting: {
      annual_cold_rent: 15900,
      net_operating_income: 13287,
      annual_debt_service: 12300,
      monthly_cashflow_before_tax: -824,
      dscr: 0.57,
      stressed_monthly_cashflow_before_tax: -957,
      stressed_dscr: 0.48,
      loan_amount: 386250,
      max_purchase_price_for_neutral_cashflow: 295266.67,
      maximum_purchase_price_for_target_yield: 301801.6,
      equity_required: 178460.5
    },
    latest_score: {
      total_score: 58,
      category_scores: {},
      explanation: "Weak economics.",
      positive_factors: [],
      negative_factors: [],
      red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
      next_recommended_action: "Reject or renegotiate materially before diligence."
    },
    latest_renovation_case: {
      id: 26,
      inputs: { planned_capex: 45000 },
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
        recommendation: "possible_value_add",
        warnings: []
      }
    },
    documents: []
  };
}

function dossier(): NegotiationDossier {
  return {
    arguments: [
      {
        code: "cashflow_gap",
        title: "Cashflow-Luecke",
        evidence: "Der Kapitaldienst traegt sich im Stressfall nicht.",
        estimated_discount_eur: 120000,
        script_line: "Wir brauchen einen deutlichen Preishebel.",
        strength: "high"
      }
    ],
    leverage: ["Inseratsdauer und schwacher Cashflow stuetzen eine harte Preislinie."],
    total_justified_discount_eur: 120000,
    price_ladder: {
      asking_price: 515000,
      anchor_price: 265500,
      target_price: 286000,
      walk_away_price: 295000,
      notes: ["Walk-away bleibt intern."]
    },
    seller_angle: "Interessiert bleiben, aber nur mit belegtem Reparaturpfad.",
    opening_script: ["Danke fuer die Unterlagen, wir pruefen weiter."],
    disclaimer: "Keine Steuer- oder Rechtsberatung."
  };
}

describe("NegotiationView", () => {
  beforeEach(() => {
    getDealMock.mockReset();
    getNegotiationDossierMock.mockReset();
    updateSellerMotiveMock.mockReset();
  });

  it("shows a real loading state before dossier and deal data are available", () => {
    getDealMock.mockResolvedValueOnce(deal());
    getNegotiationDossierMock.mockReturnValueOnce(new Promise<NegotiationDossier>(() => undefined));

    render(<NegotiationView dealId="1" />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Verhandlungsdossier wird geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Preis- oder LOI-Entscheidung ableiten/i);
    expect(screen.queryByText("Lade Verhandlungsdossier...")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/LOI-Angebotspaket/i)).not.toBeInTheDocument();
  });

  it("shows an API error state with retry instead of a dead dossier page", async () => {
    getDealMock.mockResolvedValueOnce(deal()).mockResolvedValueOnce(deal());
    getNegotiationDossierMock
      .mockRejectedValueOnce(new Error("Dossier API offline"))
      .mockResolvedValueOnce(dossier());

    render(<NegotiationView dealId="1" />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Verhandlungsdossier konnte nicht geladen werden");
    expect(errorState).toHaveTextContent("Dossier API offline");
    expect(screen.queryByText("Lade Verhandlungsdossier...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByLabelText(/LOI-Angebotspaket/i)).toBeInTheDocument();
    expect(getNegotiationDossierMock).toHaveBeenCalledTimes(2);
  });

  it("shows a copy-ready LOI package inside the negotiation dossier", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    getDealMock.mockResolvedValueOnce(deal());
    getNegotiationDossierMock.mockResolvedValueOnce(dossier());

    render(<NegotiationView dealId="1" />);

    expect(await screen.findByRole("heading", { name: /Verhandlungsdossier -/i })).toBeInTheDocument();
    expect(await screen.findByLabelText(/LOI-Angebotspaket/i)).toBeInTheDocument();
    expect(screen.getByText(/LOI-Paket: nur unverbindliche Reparatur-Indikation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nicht senden/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Preis-\/Debt-Hebel/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Kein LOI und keine Reservierung/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /LOI-Text kopieren/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("kein LOI und keine Reservierung");
    expect(copiedText).toContain("Preis-/Debt-Hebel");
    expect(copiedText).toContain("Cashflow-Luecke");
    expect(await screen.findByText("LOI-Text kopiert")).toBeInTheDocument();
  });
});
