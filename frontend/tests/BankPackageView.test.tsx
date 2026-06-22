import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BankPackageView } from "../src/components/BankPackageView";
import { getBankPackage, getDeal } from "../src/lib/api";
import { BankPackage, Deal } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getBankPackage: vi.fn(),
  getDeal: vi.fn()
}));

const getBankPackageMock = vi.mocked(getBankPackage);
const getDealMock = vi.mocked(getDeal);

function deal(): Deal {
  return {
    id: 1,
    title: "Synthetic good location but low yield - Munich",
    pipeline_stage: "Underwriting",
    listing: {
      id: 1,
      title: "Listing",
      city: "Munich",
      postal_code: "81829",
      purchase_price: 515000,
      living_area_sqm: 58,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 2010,
      expected_initial_capex: 46000
    },
    latest_renovation_case: {
      id: 41,
      inputs: {
        planned_capex: 46000,
        target_cold_rent_monthly: 2010,
        valuation_yield_percent: 5,
        refinance_ltv_percent: 65
      },
      results: {
        planned_capex: 46000,
        current_cold_rent_monthly: 1325,
        target_cold_rent_monthly: 2010,
        annual_rent_uplift: 8220,
        implied_value_uplift_from_rent: 164400,
        post_renovation_value: 679400,
        current_loan_amount: 386250,
        refinanceable_debt_after_renovation: 441610,
        potential_equity_released: 55360,
        net_equity_still_bound_after_refinance: 0,
        simple_roi_percent: 17.87,
        value_add_multiple: 3.57,
        kfw_hint: null,
        recommendation: "possible_value_add",
        warnings: []
      }
    },
    documents: []
  };
}

function bankPackage(): BankPackage {
  return {
    deal_id: 1,
    title: "Synthetic good location but low yield - Munich",
    bank_summary: {
      purchase_price: 515000,
      all_in_purchase_price: 564710.5,
      equity_required: 178460.5,
      net_operating_income: 13287,
      net_initial_yield_percent: 2.35,
      dscr: 0.57,
      monthly_cashflow_before_tax: -824,
      score: 58
    },
    financing_request: {
      requested_loan_amount: 386250,
      suggested_equity: 178460.5,
      financed_capex: 0,
      stressed_monthly_cashflow_before_tax: -849.44
    },
    development_credit: {
      status: "memo_only",
      label: "Nur Memo-Upside",
      price_credit_eur: 0,
      equity_release_eur: 55360,
      value_uplift_eur: 164400,
      planned_capex_eur: 46000,
      rule: "Entwicklungspotential ist nicht Basis-Cashflow und zaehlt im Bankenpaket erst nach Bankbewertung, Capex-Angebot und Unterlagenfreigabe.",
      next_documents: [
        "Bankbewertung oder konservativer Nachher-Wert",
        "Capex-Angebot mit Gewerken und Puffer",
        "Mietvertrag, Zielmiete und rechtliche Mietanpassung"
      ]
    },
    strengths: ["Location metrics indicate solid demand."],
    risks: ["negative_cashflow_base_case", "dscr_below_threshold"],
    missing_documents: ["energy_certificate", "weg_minutes"],
    sections: [
      {
        title: "Sanierungs-/Refi-Case",
        items: ["Kapital freisetzbar: 55360.0"]
      }
    ],
    disclaimer: "Review required."
  };
}

describe("BankPackageView", () => {
  beforeEach(() => {
    getBankPackageMock.mockReset();
    getDealMock.mockReset();
  });

  it("shows a real loading state before bank package data is available", () => {
    getBankPackageMock.mockReturnValueOnce(new Promise<BankPackage>(() => undefined));
    getDealMock.mockResolvedValueOnce(deal());

    render(<BankPackageView dealId="1" />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Bankenpaket wird geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Bank- oder Preisentscheidung ableiten/i);
    expect(screen.queryByText("Lade Bankenpaket...")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Bank-Cockpit/i)).not.toBeInTheDocument();
  });

  it("shows an API error state instead of an endless bank package loader", async () => {
    getBankPackageMock.mockRejectedValueOnce(new Error("Bank package API offline"));
    getDealMock.mockResolvedValueOnce(deal());

    render(<BankPackageView dealId="1" />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Bankenpaket konnte nicht geladen werden");
    expect(errorState).toHaveTextContent("Bank package API offline");
    expect(screen.queryByText("Lade Bankenpaket...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Erneut laden/i })).toBeInTheDocument();
  });

  it("shows a lender cockpit before the printable bank package", async () => {
    getBankPackageMock.mockResolvedValueOnce(bankPackage());
    getDealMock.mockResolvedValueOnce(deal());

    render(<BankPackageView dealId="1" />);

    expect(await screen.findByLabelText(/Bank-Cockpit/i)).toBeInTheDocument();
    expect(screen.getByText("Bank-Cockpit: Nicht bankfaehig")).toBeInTheDocument();
    expect(screen.getAllByText("DSCR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0,57").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("-824 €").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 fehlen")).toBeInTheDocument();
    expect(screen.getAllByText(/DSCR 0,57 liegt unter 1,10/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Entwicklung separat/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sanierungs-\/Refi-Case/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/energy certificate/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bank summary")).toBeInTheDocument();
    expect(screen.getByText("Review required.")).toBeInTheDocument();
  });

  it("shows bank-facing development potential without treating upside as base credit", async () => {
    getBankPackageMock.mockResolvedValueOnce(bankPackage());
    getDealMock.mockResolvedValueOnce(deal());

    render(<BankPackageView dealId="1" />);

    const developmentCredit = await screen.findByLabelText(/Bank-Entwicklungspotential/i);

    expect(developmentCredit).toHaveTextContent("Nur Memo-Upside");
    expect(developmentCredit).toHaveTextContent("0 €");
    expect(developmentCredit).toHaveTextContent("55.360 €");
    expect(developmentCredit).toHaveTextContent("164.400 €");
    const developmentCase = screen.getByLabelText(/Bank-Entwicklungsfall-Herkunft/i);
    expect(developmentCase).toHaveTextContent("Case #41");
    expect(developmentCase).toHaveTextContent("Zielmiete");
    expect(developmentCase).toHaveTextContent("2.010 €");
    expect(developmentCase).toHaveTextContent("Capex");
    expect(developmentCase).toHaveTextContent("46.000 €");
    expect(developmentCase).toHaveTextContent("Refi-LTV");
    expect(developmentCase).toHaveTextContent("65 %");
    expect(developmentCase).toHaveTextContent(/Bankbewertung oder konservativer Nachher-Wert/i);
    expect(developmentCredit).toHaveTextContent(/nicht Basis-Cashflow/i);
    expect(developmentCredit).toHaveTextContent(/Bankbewertung oder konservativer Nachher-Wert/i);
  });

  it("copies a lender-ready financing request with covenants and missing documents", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    getBankPackageMock.mockResolvedValueOnce(bankPackage());
    getDealMock.mockResolvedValueOnce(deal());

    render(<BankPackageView dealId="1" />);

    expect(await screen.findByLabelText(/Bankanfrage-Paket/i)).toBeInTheDocument();
    expect(screen.getByText("Finanzierungsanfrage: Synthetic good location but low yield - Munich")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Bankanfrage kopieren/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("Darlehenswunsch: 386.250 €");
    expect(copiedText).toContain("Eigenmittel: 178.461 €");
    expect(copiedText).toContain("DSCR 0,57");
    expect(copiedText).toContain("Entwicklungspotential: Nur Memo-Upside");
    expect(copiedText).toContain("Preis-Credit: 0 €");
    expect(copiedText).toContain("nicht Basis-Cashflow");
    expect(copiedText).toContain("energy certificate");
    expect(copiedText).toContain("nur als indikative Vorpruefung");
    expect(await screen.findByText("Bankanfrage kopiert")).toBeInTheDocument();
  });
});
