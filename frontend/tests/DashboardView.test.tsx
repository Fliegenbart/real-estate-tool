import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardView } from "../src/components/DashboardView";
import { getDashboard, getDeals } from "../src/lib/api";
import { Dashboard, Deal } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getDashboard: vi.fn(),
  getDeals: vi.fn()
}));

const getDashboardMock = vi.mocked(getDashboard);
const getDealsMock = vi.mocked(getDeals);

function dashboard(): Dashboard {
  return {
    total_active_listings: 2,
    active_deals: 2,
    average_gross_yield: 4.1,
    average_net_yield: 3.2,
    red_flagged_deals: 1,
    top_deals: [],
    pipeline: {
      New: 1,
      Screening: 0,
      Underwriting: 1,
      Offer: 0,
      Closing: 0,
      Owned: 0,
      Rejected: 0
    }
  };
}

function deals(): Deal[] {
  return [
    {
      id: 1,
      title: "Looks good, numbers fail",
      pipeline_stage: "New",
      listing: { id: 1, title: "Listing 1", city: "Munich", purchase_price: 520000 },
      latest_score: {
        total_score: 58,
        category_scores: {},
        explanation: "",
        positive_factors: [],
        negative_factors: [],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        equity_required: 130000,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        residual_debt_factor_rating: "red"
      },
      location: { micro_location_score: 86 }
    },
    {
      id: 2,
      title: "Healthy buy candidate",
      pipeline_stage: "Underwriting",
      listing: { id: 2, title: "Listing 2", city: "Leipzig", purchase_price: 240000 },
      latest_score: {
        total_score: 86,
        category_scores: {},
        explanation: "",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Continue."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: 210,
        dscr: 1.22,
        equity_required: 75000,
        max_purchase_price_for_neutral_cashflow: 331000,
        residual_debt_factor_rating: "green"
      },
      location: { micro_location_score: 78 }
    }
  ];
}

function dealsWithOwnedAssetRisk(): Deal[] {
  return [
    ...deals(),
    {
      id: 3,
      title: "Hamburg Bestand mit Stress",
      pipeline_stage: "Bought",
      listing: {
        id: 3,
        title: "Listing 3",
        city: "Hamburg",
        house_money_monthly: 360,
        expected_initial_capex: 12000
      },
      latest_score: {
        total_score: 72,
        category_scores: {},
        explanation: "",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Monitor."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -130,
        stressed_monthly_cashflow_before_tax: -180,
        dscr: 0.96,
        stressed_dscr: 0.91,
        equity_required: 90000,
        remaining_loan_after_holding: 210000,
        residual_debt_factor_rating: "amber"
      },
      weg_health: {
        inputs: {},
        updated_at: "2026-06-22",
        results: {
          total_score: 48,
          category_scores: {},
          flags: ["reserve_low"],
          positive_factors: [],
          negative_factors: ["Ruecklage niedrig."],
          data_completeness_percent: 62,
          confidence: "medium",
          summary: "WEG braucht Nacharbeit.",
          documents_to_request: ["Ruecklagenstand"]
        }
      }
    },
    {
      id: 4,
      title: "Leipzig stabiler Bestand",
      pipeline_stage: "Bought",
      listing: {
        id: 4,
        title: "Listing 4",
        city: "Leipzig",
        house_money_monthly: 210
      },
      latest_score: {
        total_score: 81,
        category_scores: {},
        explanation: "",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Hold."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: 180,
        stressed_monthly_cashflow_before_tax: 90,
        dscr: 1.24,
        stressed_dscr: 1.12,
        equity_required: 78000,
        remaining_loan_after_holding: 145000,
        residual_debt_factor_rating: "green"
      },
      weg_health: {
        inputs: {},
        updated_at: "2026-06-22",
        results: {
          total_score: 78,
          category_scores: {},
          flags: [],
          positive_factors: [],
          negative_factors: [],
          data_completeness_percent: 88,
          confidence: "high",
          summary: "WEG unauffaellig.",
          documents_to_request: []
        }
      }
    }
  ];
}

describe("DashboardView", () => {
  beforeEach(() => {
    getDashboardMock.mockReset();
    getDealsMock.mockReset();
  });

  it("shows a real loading state before dashboard data is available", () => {
    getDashboardMock.mockReturnValueOnce(new Promise<Dashboard>(() => undefined));
    getDealsMock.mockResolvedValueOnce(deals());

    render(<DashboardView />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Dashboard wird geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Portfolio- oder Akquiseentscheidung ableiten/i);
    expect(screen.queryByText("Lade Dashboard...")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Portfolio-Leitstand/i)).not.toBeInTheDocument();
  });

  it("shows an API error state with retry instead of a dead dashboard", async () => {
    getDashboardMock
      .mockRejectedValueOnce(new Error("Dashboard API offline"))
      .mockResolvedValueOnce(dashboard());
    getDealsMock.mockResolvedValueOnce(deals()).mockResolvedValueOnce(deals());

    render(<DashboardView />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Dashboard konnte nicht geladen werden");
    expect(errorState).toHaveTextContent("Dashboard API offline");
    expect(screen.queryByText("Lade Dashboard...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByLabelText(/Portfolio-Leitstand/i)).toBeInTheDocument();
    expect(getDashboardMock).toHaveBeenCalledTimes(2);
  });

  it("shows an acquisition focus queue based on deal decisions", async () => {
    getDashboardMock.mockResolvedValueOnce(dashboard());
    getDealsMock.mockResolvedValueOnce(deals());

    render(<DashboardView />);

    expect(await screen.findByText(/Akquise-Fokus heute/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Portfolio-Leitstand/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 Kaufkandidat/i)).toBeInTheDocument();
    expect(screen.getAllByText(/205.000 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/-614 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Diese Woche/i)).toBeInTheDocument();
    expect(screen.getByText(/Bankpaket, Unterlagen und Angebot vorbereiten/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Deal bindet Kapital bei negativem Cashflow/i)).toBeInTheDocument();
    expect(screen.getByText(/Ablehnen oder hart nachverhandeln/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Looks good, numbers fail/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Preis-Luecke/i)).toBeInTheDocument();
    expect(screen.getByText(/224.733/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Preisanker/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Naechste Aktion/i)).toHaveLength(2);
    expect(screen.getAllByText(/Maximalpreis fuer neutralen Cashflow als harte Grenze nutzen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Freigabe 0\/6/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Beleg-Score/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/In Due Diligence nehmen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Healthy buy candidate/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Ablehnen\/hart verhandeln/i)).toBeInTheDocument();
  });

  it("shows dashboard capital steering before the focus queue", async () => {
    getDashboardMock.mockResolvedValueOnce(dashboard());
    getDealsMock.mockResolvedValueOnce(deals());

    render(<DashboardView />);

    const board = within(await screen.findByLabelText(/Dashboard-Kapitalsteuerung/i));

    expect(board.getByText("Eigenkapital-Steuerung")).toBeInTheDocument();
    expect(board.getByText(/Bester Kapitaleinsatz: Healthy buy candidate/i)).toBeInTheDocument();
    expect(board.getAllByText(/280 €\/100k EK/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText(/Kapitalfalle/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/Looks good, numbers fail/i)).toBeInTheDocument();
    expect(board.getAllByText(/-634 €\/100k EK/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByRole("link", { name: /Kaufmaschine oeffnen/i })).toHaveAttribute("href", "/akquise");
  });

  it("shows a dashboard release radar with top blockers before capital is committed", async () => {
    getDashboardMock.mockResolvedValueOnce(dashboard());
    getDealsMock.mockResolvedValueOnce(deals());

    render(<DashboardView />);

    const radar = within(await screen.findByLabelText(/Dashboard-Freigaberadar/i));

    expect(radar.getByText("Freigaberadar")).toBeInTheDocument();
    expect(radar.getByText(/0 von 2 Deals angebotsreif/i)).toBeInTheDocument();
    expect(radar.getByText(/2 gesperrt, 0 in Pruefung/i)).toBeInTheDocument();
    expect(radar.getByText("Top-Blocker")).toBeInTheDocument();
    expect(radar.getAllByText(/Looks good, numbers fail/i).length).toBeGreaterThanOrEqual(1);
    expect(radar.getAllByText(/Beleg-Score/i).length).toBeGreaterThanOrEqual(1);
    expect(radar.getAllByText(/Kein Angebot und keine Notarzeit/i).length).toBeGreaterThanOrEqual(1);
    expect(radar.getAllByRole("link", { name: /Deal pruefen/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an asset monitor for bought deals after acquisition", async () => {
    getDashboardMock.mockResolvedValueOnce(dashboard());
    getDealsMock.mockResolvedValueOnce(dealsWithOwnedAssetRisk());

    render(<DashboardView />);

    const monitor = within(await screen.findByLabelText(/Bestands-Asset-Monitor/i));

    expect(monitor.getByText("Bestands-Asset-Monitor")).toBeInTheDocument();
    expect(monitor.getByText(/Bestands-Alarm: 1 Objekt kritisch/i)).toBeInTheDocument();
    expect(monitor.getByText(/2 gekaufte Objekte/i)).toBeInTheDocument();
    expect(monitor.getByText("Kritisch")).toBeInTheDocument();
    expect(monitor.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(monitor.getByText(/Hamburg Bestand mit Stress/i)).toBeInTheDocument();
    expect(monitor.getByText(/Stress-Cashflow -180 €/i)).toBeInTheDocument();
    expect(monitor.getByText(/Mieteingang, Hausgeld, Ruecklage und Bank-Covenants pruefen/i)).toBeInTheDocument();
    expect(monitor.getByText(/Leipzig stabiler Bestand/i)).toBeInTheDocument();
    expect(monitor.getAllByRole("link", { name: /Objekt pruefen/i })[0]).toHaveAttribute("href", "/deals/3");
  });
});
