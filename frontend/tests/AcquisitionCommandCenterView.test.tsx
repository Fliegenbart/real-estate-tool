import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcquisitionCommandCenterView } from "../src/components/AcquisitionCommandCenterView";
import { getAcquisitionCommandCenter } from "../src/lib/api";
import { AcquisitionCommandCenter } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getAcquisitionCommandCenter: vi.fn()
}));

const getAcquisitionCommandCenterMock = vi.mocked(getAcquisitionCommandCenter);

function commandCenter(): AcquisitionCommandCenter {
  return {
    north_star: {
      metric: "wohnungen_pro_100k_eigenkapital",
      current_value: 0,
      explanation: "Keine kaufbaren Deals im aktuellen Szenario."
    },
    portfolio_capacity: {
      available_equity: 250000,
      deployable_equity_now: 180000,
      remaining_equity_after_selected_deals: 70000,
      bought_units: 4,
      active_pipeline_units: 3,
      selected_units_now: 0,
      average_equity_per_selected_unit: 125000
    },
    selected_deals_now: [],
    deal_decisions: [
      {
        deal_id: 1,
        title: "Munich cashflow gap",
        city: "Munich",
        pipeline_stage: "Underwriting",
        decision: "negotiate",
        decision_label: "Nachverhandeln / Annahmen klaeren",
        priority_score: 64,
        unit_count: 1,
        total_score: 72,
        equity_required: 110000,
        equity_per_unit: 110000,
        loan_amount: 410000,
        monthly_cashflow_before_tax: -310,
        stressed_monthly_cashflow_before_tax: -450,
        dscr: 0.94,
        stressed_dscr: 0.88,
        residual_debt_factor_rating: "amber",
        kfw_opportunity: null,
        constraints: ["DSCR unter Zielwert.", "Monatlicher Cashflow unter Zielwert."],
        next_action: "Preis, Finanzierung oder fehlende Unterlagen klaeren: DSCR unter Zielwert."
      },
      {
        deal_id: 2,
        title: "Leipzig data gap",
        city: "Leipzig",
        pipeline_stage: "New",
        decision: "watch",
        decision_label: "Beobachten / Daten vervollstaendigen",
        priority_score: 45,
        unit_count: 1,
        total_score: null,
        equity_required: 0,
        equity_per_unit: 0,
        loan_amount: 0,
        monthly_cashflow_before_tax: 0,
        stressed_monthly_cashflow_before_tax: null,
        dscr: null,
        stressed_dscr: null,
        residual_debt_factor_rating: null,
        kfw_opportunity: null,
        constraints: ["Score fehlt - Deal erst bewerten.", "DSCR fehlt - Finanzierung pruefen."],
        next_action: "Fehlende Daten erfassen, dann Underwriting und Score starten."
      }
    ],
    deal_radar: [
      {
        id: 10,
        title: "Kiel price cut listing",
        city: "Kiel",
        source: "immoscout_alert",
        purchase_price: 165000,
        gross_yield_percent: 5.8,
        days_on_market: 71,
        price_reduction_count: 2,
        price_reduction_total_percent: 7.5,
        priority_score: 68,
        next_action: "In Deal wandeln und voll unterwriten",
        signals: ["price_reduction"]
      }
    ],
    growth_plan: {
      target_years: 10,
      average_equity_per_unit_assumption: 125000,
      years: [
        {
          year: 1,
          starting_units: 4,
          acquisition_equity_available: 250000,
          estimated_units_added: 2,
          equity_used: 250000,
          ending_units: 6,
          ending_equity: 0
        }
      ],
      planning_warning: "Planungsmodell mit vereinfachten Annahmen."
    }
  };
}

function commandCenterWithCapitalProductivity(): AcquisitionCommandCenter {
  const center = commandCenter();
  const efficientBuy = {
    deal_id: 3,
    title: "Dresden efficient buy",
    city: "Dresden",
    pipeline_stage: "Underwriting",
    decision: "buy" as const,
    decision_label: "Kaufen / Bankpaket vorbereiten",
    priority_score: 88,
    unit_count: 1,
    total_score: 84,
    equity_required: 60000,
    equity_per_unit: 60000,
    loan_amount: 180000,
    monthly_cashflow_before_tax: 240,
    stressed_monthly_cashflow_before_tax: 80,
    dscr: 1.28,
    stressed_dscr: 1.12,
    residual_debt_factor_rating: "green" as const,
    kfw_opportunity: null,
    constraints: [],
    next_action: "Bankpaket, Unterlagen und Angebot vorbereiten."
  };

  return {
    ...center,
    portfolio_capacity: {
      ...center.portfolio_capacity,
      selected_units_now: 1,
      remaining_equity_after_selected_deals: 120000
    },
    selected_deals_now: [efficientBuy],
    deal_decisions: [efficientBuy, ...center.deal_decisions]
  };
}

function commandCenterWithoutHardBlockers(): AcquisitionCommandCenter {
  const center = commandCenter();
  return {
    ...center,
    deal_decisions: [],
    selected_deals_now: []
  };
}

describe("AcquisitionCommandCenterView", () => {
  beforeEach(() => {
    getAcquisitionCommandCenterMock.mockReset();
  });

  it("shows an API error state with retry before any acquisition decision is shown", async () => {
    getAcquisitionCommandCenterMock
      .mockRejectedValueOnce(new Error("Kaufmaschine API offline"))
      .mockResolvedValueOnce(commandCenter());

    render(<AcquisitionCommandCenterView />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Kaufmaschine konnte nicht geladen werden");
    expect(errorState).toHaveTextContent("Kaufmaschine API offline");
    expect(errorState).toHaveTextContent(/Noch keine Kauf- oder Kapitalentscheidung ableiten/i);
    expect(screen.queryByText("Buy-Box-Check")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByText("Buy-Box-Check")).toBeInTheDocument();
    expect(getAcquisitionCommandCenterMock).toHaveBeenCalledTimes(2);
  });

  it("shows a buy-box health check with bottlenecks and weekly work orders", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenter());

    render(<AcquisitionCommandCenterView />);

    expect(await screen.findByText("Buy-Box-Check")).toBeInTheDocument();
    expect(screen.getByText("Wirtschaftlichkeit blockiert die Kaufmaschine")).toBeInTheDocument();
    expect(screen.getByText(/0 kaufbare Deals aus 2 geprueften Deals/i)).toBeInTheDocument();
    expect(screen.getByText(/70.000 € Kapital bleibt nach Auswahl frei/i)).toBeInTheDocument();
    expect(screen.getByText("Deal-Bremse")).toBeInTheDocument();
    expect(screen.getAllByText(/DSCR unter Zielwert/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Listing-Auftrag")).toBeInTheDocument();
    expect(screen.getAllByText(/Kiel price cut listing/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Diese Woche").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 Deal hart nachverhandeln/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Listing in Deal wandeln/i)).toBeInTheDocument();
  });

  it("shows a mixed daily priority queue across deals and listings", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenter());

    render(<AcquisitionCommandCenterView />);

    const queue = within(await screen.findByLabelText(/Tages-Prioritaetsqueue/i));

    expect(queue.getByText(/Heute zuerst/i)).toBeInTheDocument();
    expect(queue.getByText(/2 Aufgaben aus Deals und Listings/i)).toBeInTheDocument();
    expect(queue.getByText(/Nachverhandeln/i)).toBeInTheDocument();
    expect(queue.getByText(/Munich cashflow gap/i)).toBeInTheDocument();
    expect(queue.getByText(/DSCR unter Zielwert/i)).toBeInTheDocument();
    expect(queue.getByText(/Deal oeffnen/i)).toBeInTheDocument();
    expect(queue.getByText(/Listing wandeln/i)).toBeInTheDocument();
    expect(queue.getByText(/Kiel price cut listing/i)).toBeInTheDocument();
    expect(queue.getByText(/In Deal wandeln und voll unterwriten/i)).toBeInTheDocument();
    expect(queue.getByText(/Listing pruefen/i)).toBeInTheDocument();
  });

  it("shows a decision leverage board for the checks that unlock the most acquisition value", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenter());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/Entscheidungshebel/i));

    expect(board.getByText("Entscheidungshebel")).toBeInTheDocument();
    expect(board.getByText(/Groesster Hebel: Preis\/Finanzierung/i)).toBeInTheDocument();
    expect(board.getByText("Preis/Finanzierung")).toBeInTheDocument();
    expect(board.getAllByText(/DSCR unter Zielwert/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText("Daten/Belege")).toBeInTheDocument();
    expect(board.getByText(/Score fehlt/i)).toBeInTheDocument();
    expect(board.getByText("Listing-Zufluss")).toBeInTheDocument();
    expect(board.getByText(/In Deal wandeln und voll unterwriten/i)).toBeInTheDocument();
    expect(board.getAllByText(/Ankauf/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows weekly owner-ready work orders with blocker and proof", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenterWithCapitalProductivity());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/Wochen-Arbeitsauftraege/i));

    expect(board.getByText("Wochen-Arbeitsauftraege")).toBeInTheDocument();
    expect(board.getByText(/Arbeitsauftraege: 4 konkrete naechste Schritte/i)).toBeInTheDocument();
    expect(board.getByText("Preis/Finanzierung reparieren")).toBeInTheDocument();
    expect(board.getAllByText("Ankauf/Bank").length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText(/Munich cashflow gap/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/DSCR 0,94/i)).toBeInTheDocument();
    expect(board.getByText(/Cashflow -310/i)).toBeInTheDocument();
    expect(board.getByText("Freigabe bauen")).toBeInTheDocument();
    expect(board.getAllByText(/Dresden efficient buy/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText("Listing in Deal wandeln")).toBeInTheDocument();
    expect(board.getByText(/71 Tage online/i)).toBeInTheDocument();
    expect(board.getAllByRole("link", { name: /Oeffnen/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a 48h blocker board with owner, proof and stop rule", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenterWithCapitalProductivity());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/48h-Blockerboard/i));

    expect(board.getByText("48h-Blockerboard")).toBeInTheDocument();
    expect(board.getByText(/48h-Fokus: Preis\/Finanzierung reparieren/i)).toBeInTheDocument();
    expect(board.getByText(/1 kritisch/i)).toBeInTheDocument();
    expect(board.getAllByText("48h").length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText("Ankauf/Bank").length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/Munich cashflow gap/i)).toBeInTheDocument();
    expect(board.getAllByText(/DSCR unter Zielwert/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/DSCR 0,94/i)).toBeInTheDocument();
    expect(board.getByText(/Kein Kapital reservieren/i)).toBeInTheDocument();
    expect(board.getByRole("link", { name: /Jetzt oeffnen/i })).toHaveAttribute("href", "/deals/1");
  });

  it("does not escalate normal weekly work into a fake 48h blocker", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenterWithoutHardBlockers());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/48h-Blockerboard/i));

    expect(board.getByText(/48h-Fokus: keine harten Blocker/i)).toBeInTheDocument();
    expect(board.getByText(/0 kritisch/i)).toBeInTheDocument();
    expect(board.getByText(/kein harter 48h-Blocker/i)).toBeInTheDocument();
    expect(board.getAllByText("Diese Woche").length).toBeGreaterThanOrEqual(1);
    expect(board.queryByRole("link", { name: /Jetzt oeffnen/i })).not.toBeInTheDocument();
  });

  it("shows capital productivity so equity goes to the strongest deal first", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenterWithCapitalProductivity());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/Kapitalproduktivitaet/i));

    expect(board.getByText("Kapitalproduktivitaet")).toBeInTheDocument();
    expect(board.getByText(/Bester Einsatz: Dresden efficient buy/i)).toBeInTheDocument();
    expect(board.getAllByText(/Cashflow je 100k EK/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText(/400 €\/100k EK/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/^Kapitalfalle$/i)).toBeInTheDocument();
    expect(board.getByText(/Munich cashflow gap/i)).toBeInTheDocument();
    expect(board.getAllByText(/-282 €\/100k EK/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/Kapital zuerst in Deals mit positivem Cashflow je 100k EK/i)).toBeInTheDocument();
  });

  it("shows a capital repair target before equity is reserved for a capital trap", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenter());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/Kapitalproduktivitaet/i));

    expect(board.getByText("Kapital-Reparatur")).toBeInTheDocument();
    expect(board.getAllByText(/Munich cashflow gap/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/Cashflow-Luecke: 310 €\/Monat/i)).toBeInTheDocument();
    expect(board.getByText(/DSCR-Ziel: 1,10/i)).toBeInTheDocument();
    expect(board.getByText(/Monatscashflow auf 0 € bringen/i)).toBeInTheDocument();
    expect(board.getByText(/Preis, Miete oder Finanzierung so reparieren/i)).toBeInTheDocument();
  });

  it("does not frame a negative capital productivity deal as the best equity use", async () => {
    getAcquisitionCommandCenterMock.mockResolvedValue(commandCenter());

    render(<AcquisitionCommandCenterView />);

    const board = within(await screen.findByLabelText(/Kapitalproduktivitaet/i));

    expect(board.getByText(/Kapital nicht binden: Munich cashflow gap/i)).toBeInTheDocument();
    expect(board.queryByText(/Bester Einsatz: Munich cashflow gap/i)).not.toBeInTheDocument();
    expect(board.getAllByText(/-282 €\/100k EK/i).length).toBeGreaterThanOrEqual(1);
  });
});
