import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineView } from "../src/components/PipelineView";
import { getDeals, updatePipeline } from "../src/lib/api";
import { Deal } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/lib/api", () => ({
  getDeals: vi.fn(),
  updatePipeline: vi.fn()
}));

const getDealsMock = vi.mocked(getDeals);
const updatePipelineMock = vi.mocked(updatePipeline);

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

describe("PipelineView", () => {
  beforeEach(() => {
    getDealsMock.mockReset();
    updatePipelineMock.mockReset();
  });

  it("shows a real loading state before pipeline data is available", () => {
    getDealsMock.mockReturnValueOnce(new Promise<Deal[]>(() => undefined));

    render(<PipelineView />);

    const loadingState = within(screen.getByRole("status"));

    expect(loadingState.getByText("Pipeline wird geladen")).toBeInTheDocument();
    expect(loadingState.getByText(/Noch keine Pipeline-Entscheidung ableiten/i)).toBeInTheDocument();
    expect(screen.queryByText("0 aktive Pipeline-Eintraege")).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("shows an API error state instead of an empty pipeline verdict", async () => {
    getDealsMock.mockRejectedValueOnce(new Error("Deals API offline"));

    render(<PipelineView />);

    const errorState = within(await screen.findByRole("alert"));

    expect(errorState.getByText("Pipeline konnte nicht geladen werden")).toBeInTheDocument();
    expect(errorState.getByText("Deals API offline")).toBeInTheDocument();
    expect(screen.queryByText("0 aktive Pipeline-Eintraege")).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("turns pipeline cards into decision-ready work items", async () => {
    getDealsMock.mockResolvedValueOnce(deals());

    render(<PipelineView />);

    const riskCard = await screen.findByLabelText("Pipeline-Deal-Karte: Looks good, numbers fail");
    const card = within(riskCard);

    expect(card.getByText("Ablehnen oder hart nachverhandeln")).toBeInTheDocument();
    expect(card.getByText(/Maximalpreis fuer neutralen Cashflow als harte Grenze nutzen/i)).toBeInTheDocument();
    expect(card.getByText(/Freigabe 0\/6/i)).toBeInTheDocument();
    expect(card.getByText(/Beleg-Score 20 %/i)).toBeInTheDocument();
    expect(card.getByText("Cashflow")).toBeInTheDocument();
    expect(card.getByText("-824 €")).toBeInTheDocument();
    expect(card.getByText("DSCR")).toBeInTheDocument();
    expect(card.getByText("0,57")).toBeInTheDocument();
    expect(card.getByText("Preisanker")).toBeInTheDocument();
    expect(card.getByText("295.267 €")).toBeInTheDocument();
    expect(screen.getByText("In Due Diligence nehmen")).toBeInTheDocument();
    expect(screen.getByText("Healthy buy candidate")).toBeInTheDocument();
  });

  it("shows a pipeline release cockpit with offer-ready count and the top blocker", async () => {
    getDealsMock.mockResolvedValueOnce(deals());

    render(<PipelineView />);

    const cockpit = within(await screen.findByLabelText(/Pipeline-Freigabe-Cockpit/i));

    expect(cockpit.getByText("Pipeline-Freigabe-Cockpit")).toBeInTheDocument();
    expect(cockpit.getByText(/Pipeline-Freigabe: 0 angebotsreif/i)).toBeInTheDocument();
    expect(cockpit.getByText(/2 gesperrt, 0 in Pruefung/i)).toBeInTheDocument();
    expect(cockpit.getByText("Angebotsreif")).toBeInTheDocument();
    expect(cockpit.getByText("Gesperrt")).toBeInTheDocument();
    expect(cockpit.getAllByText("Top-Blocker").length).toBeGreaterThanOrEqual(1);
    expect(cockpit.getAllByText(/Unterlagen/i).length).toBeGreaterThanOrEqual(1);
    expect(cockpit.getByText(/Fehlende Bank- und Due-Diligence-Unterlagen/i)).toBeInTheDocument();
    expect(cockpit.getByText(/Keine Offer- oder Notarverschiebung/i)).toBeInTheDocument();
  });

  it("blocks offer, diligence and notary stages until acquisition gates are ready", async () => {
    getDealsMock.mockResolvedValueOnce(deals());

    render(<PipelineView />);

    const riskCard = await screen.findByLabelText("Pipeline-Deal-Karte: Looks good, numbers fail");
    const card = within(riskCard);
    const stageSelect = card.getByLabelText("Pipeline-Stage fuer Looks good, numbers fail");

    expect(card.getByText("Stage-Gate")).toBeInTheDocument();
    expect(card.getByText(/Angebot, Due Diligence und Notar gesperrt/i)).toBeInTheDocument();
    expect(card.getByText(/0\/6 Gates bestanden/i)).toBeInTheDocument();
    expect(within(stageSelect).getByRole("option", { name: "Offer submitted" })).toBeDisabled();
    expect(within(stageSelect).getByRole("option", { name: "Due diligence" })).toBeDisabled();
    expect(within(stageSelect).getByRole("option", { name: "Notary" })).toBeDisabled();
    expect(within(stageSelect).getByRole("option", { name: "Bought" })).toBeDisabled();
    expect(within(stageSelect).getByRole("option", { name: "Rejected" })).not.toBeDisabled();
  });

  it("shows the API stage-gate error and keeps the card in its current stage", async () => {
    getDealsMock.mockResolvedValueOnce(deals());
    updatePipelineMock.mockRejectedValueOnce(
      new Error("Ankaufsfreigabe blockiert Offer submitted: 1/6 Gates bestanden.")
    );

    render(<PipelineView />);

    const healthyCard = await screen.findByLabelText("Pipeline-Deal-Karte: Healthy buy candidate");
    const stageSelect = within(healthyCard).getByLabelText("Pipeline-Stage fuer Healthy buy candidate");

    fireEvent.change(stageSelect, { target: { value: "Offer submitted" } });

    expect(updatePipelineMock).toHaveBeenCalledWith(2, "Offer submitted");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ankaufsfreigabe blockiert Offer submitted: 1/6 Gates bestanden."
    );
    await waitFor(() => expect(stageSelect).toHaveValue("Underwriting"));
  });
});
