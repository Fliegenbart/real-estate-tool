import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListingsView } from "../src/components/ListingsView";
import { clearDemoData, convertListing, getListings, importEmailListings, updateListingStatus } from "../src/lib/api";
import { Listing } from "../src/lib/types";

vi.mock("../src/components/AddListingPanel", () => ({
  AddListingPanel: () => <div>Listing manuell erfassen</div>
}));

vi.mock("../src/lib/api", () => ({
  clearDemoData: vi.fn(),
  convertListing: vi.fn(),
  getListings: vi.fn(),
  importEmailListings: vi.fn(),
  updateListingStatus: vi.fn()
}));

const getListingsMock = vi.mocked(getListings);

function listings(): Listing[] {
  return [
    {
      id: 1,
      title: "Kiel price cut yield",
      city: "Kiel",
      source: "immoscout_alert",
      purchase_price: 165000,
      living_area_sqm: 54,
      cold_rent_monthly: 875,
      house_money_monthly: 230,
      energy_class: "C",
      status: "active",
      days_on_market: 72,
      price_reduction_count: 2,
      price_reduction_total_percent: 7.5,
      signals: [{ type: "price_reduction", severity: "medium", explanation: "Preis wurde mehrfach reduziert." }]
    },
    {
      id: 2,
      title: "Dortmund missing basics",
      city: "Dortmund",
      source: "manual",
      purchase_price: 145000,
      living_area_sqm: null,
      cold_rent_monthly: 610,
      house_money_monthly: null,
      energy_class: null,
      status: "active",
      days_on_market: 12,
      price_reduction_count: 0,
      price_reduction_total_percent: null,
      signals: []
    },
    {
      id: 3,
      title: "Berlin low yield",
      city: "Berlin",
      source: "immowelt_alert",
      purchase_price: 415000,
      living_area_sqm: 49,
      cold_rent_monthly: 990,
      house_money_monthly: 280,
      energy_class: "B",
      status: "active",
      days_on_market: 18,
      price_reduction_count: 0,
      price_reduction_total_percent: null,
      signals: []
    }
  ];
}

describe("ListingsView", () => {
  beforeEach(() => {
    getListingsMock.mockReset();
    vi.mocked(clearDemoData).mockReset();
    vi.mocked(convertListing).mockReset();
    vi.mocked(importEmailListings).mockReset();
    vi.mocked(updateListingStatus).mockReset();
  });

  it("shows a real loading state before listing data is available", () => {
    getListingsMock.mockReturnValueOnce(new Promise<Listing[]>(() => undefined));

    render(<ListingsView />);

    const loadingState = within(screen.getByRole("status"));
    const activeInsight = screen.getByText("Aktive Angebote").closest(".listing-insight");
    const hitInsight = screen.getByText("Aktueller Trefferraum").closest(".listing-insight");

    expect(loadingState.getByText("Listings werden geladen")).toBeInTheDocument();
    expect(loadingState.getByText(/Akquise-Liste bleibt bewusst ohne Null-Urteil/i)).toBeInTheDocument();
    expect(activeInsight).not.toBeNull();
    expect(hitInsight).not.toBeNull();
    expect(within(activeInsight as HTMLElement).getByText("Laden")).toBeInTheDocument();
    expect(within(hitInsight as HTMLElement).getByText("Laden")).toBeInTheDocument();
    expect(screen.queryByText("0 Treffer")).not.toBeInTheDocument();
    expect(screen.queryByText("Keine Listings.")).not.toBeInTheDocument();
  });

  it("shows an API error state instead of an empty listing verdict", async () => {
    getListingsMock.mockRejectedValueOnce(new Error("Backend offline"));

    render(<ListingsView />);

    const errorState = within(await screen.findByRole("alert"));
    const activeInsight = screen.getByText("Aktive Angebote").closest(".listing-insight");

    expect(errorState.getByText("Listings konnten nicht geladen werden")).toBeInTheDocument();
    expect(errorState.getByText("Backend offline")).toBeInTheDocument();
    expect(activeInsight).not.toBeNull();
    expect(within(activeInsight as HTMLElement).getByText("Fehler")).toBeInTheDocument();
    expect(screen.queryByText("Keine Listings.")).not.toBeInTheDocument();
  });

  it("shows a triage inbox that prioritizes listings before they become deals", async () => {
    getListingsMock.mockResolvedValueOnce(listings());

    render(<ListingsView />);

    expect(await screen.findByLabelText("Listing-Triage")).toBeInTheDocument();
    expect(screen.getByText("Listing-Eingang")).toBeInTheDocument();
    expect(screen.getByText(/1 Sofort-Deal · 1 Datenbremse · 1 Beobachten/i)).toBeInTheDocument();
    expect(screen.getByText("Top-Auftrag")).toBeInTheDocument();
    expect(screen.getAllByText("Kiel price cut yield").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sofort in Deal wandeln").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bruttorendite 6,36 %/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Preisbewegung 7,5 %/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Datenbremse")).toBeInTheDocument();
    expect(screen.getAllByText(/Dortmund missing basics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Flaeche, Hausgeld, Energie/i)).toBeInTheDocument();
    expect(screen.getByText("Diese Woche")).toBeInTheDocument();
    expect(screen.getByText(/1 Listing sofort in Deal wandeln/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Listing mit Datenluecken nachfassen/i)).toBeInTheDocument();
  });

  it("shows a conversion work order for the strongest listing", async () => {
    getListingsMock.mockResolvedValueOnce(listings());

    render(<ListingsView />);

    const workOrder = within(await screen.findByLabelText("Deal-Wandlungsauftrag"));

    expect(workOrder.getByText("Deal-Wandlungsauftrag")).toBeInTheDocument();
    expect(workOrder.getByText("Kiel price cut yield")).toBeInTheDocument();
    expect(workOrder.getByText("Sofort in Deal wandeln")).toBeInTheDocument();
    expect(workOrder.getByText("Warum jetzt")).toBeInTheDocument();
    expect(workOrder.getByText(/Bruttorendite 6,36 %/i)).toBeInTheDocument();
    expect(workOrder.getByText(/Preisbewegung 7,5 %/i)).toBeInTheDocument();
    expect(workOrder.getByText("Vor Wandlung pruefen")).toBeInTheDocument();
    expect(workOrder.getByText(/Kaufpreis, Flaeche, Miete, Hausgeld und Energie liegen vor/i)).toBeInTheDocument();
    expect(workOrder.getByText("Nach Wandlung")).toBeInTheDocument();
    expect(workOrder.getByText(/Underwriting, Score und Mikrolage sofort rechnen/i)).toBeInTheDocument();
  });

  it("does not ask for missing data when a complete listing should only be watched", async () => {
    getListingsMock.mockResolvedValueOnce([listings()[2]]);

    render(<ListingsView />);

    const workOrder = within(await screen.findByLabelText("Deal-Wandlungsauftrag"));

    expect(workOrder.getByText("Berlin low yield")).toBeInTheDocument();
    expect(workOrder.getByText("Beobachten und bei Preisbewegung neu pruefen")).toBeInTheDocument();
    expect(workOrder.getByRole("button", { name: /Noch beobachten/i })).toBeDisabled();
  });

  it("marks already converted listings as handled in the row actions", async () => {
    getListingsMock.mockResolvedValueOnce([
      {
        ...listings()[0],
        id: 10,
        title: "Kiel already converted",
        status: "converted"
      },
      {
        ...listings()[0],
        id: 11,
        title: "Kiel fresh candidate",
        status: "active"
      }
    ]);

    render(<ListingsView />);

    const convertedRow = within(await screen.findByRole("row", { name: /Kiel already converted/i }));
    const activeRow = within(screen.getByRole("row", { name: /Kiel fresh candidate/i }));

    expect(convertedRow.getByRole("button", { name: /Bereits gewandelt/i })).toBeDisabled();
    expect(convertedRow.queryByRole("button", { name: /In Deal wandeln/i })).not.toBeInTheDocument();
    expect(convertedRow.getByRole("button", { name: /Nicht mehr ablehnen/i })).toBeDisabled();
    expect(convertedRow.queryByRole("button", { name: /^Ablehnen$/i })).not.toBeInTheDocument();
    expect(activeRow.getByRole("button", { name: /In Deal wandeln/i })).not.toBeDisabled();
    expect(activeRow.getByRole("button", { name: /^Ablehnen$/i })).not.toBeDisabled();
  });

  it("keeps already converted listings out of the triage work order", async () => {
    getListingsMock.mockResolvedValueOnce([
      {
        ...listings()[0],
        id: 10,
        title: "Kiel already converted",
        status: "converted"
      },
      {
        ...listings()[2],
        id: 11,
        title: "Berlin still active",
        status: "active"
      }
    ]);

    render(<ListingsView />);

    const triage = within(await screen.findByLabelText("Listing-Triage"));
    const workOrder = within(screen.getByLabelText("Deal-Wandlungsauftrag"));

    expect(triage.getByText(/0 Sofort-Deals? · 0 Datenbremse · 1 Beobachten/i)).toBeInTheDocument();
    expect(triage.getByText("Berlin still active")).toBeInTheDocument();
    expect(triage.queryByText("Kiel already converted")).not.toBeInTheDocument();
    expect(workOrder.getByText("Berlin still active")).toBeInTheDocument();
    expect(workOrder.queryByText("Kiel already converted")).not.toBeInTheDocument();
    expect(workOrder.getByRole("button", { name: /Noch beobachten/i })).toBeDisabled();
  });

  it("keeps completed listing data gaps out of the workload metrics", async () => {
    getListingsMock.mockResolvedValueOnce([
      {
        ...listings()[1],
        id: 20,
        title: "Converted missing basics",
        status: "converted"
      },
      {
        ...listings()[2],
        id: 21,
        title: "Active complete listing",
        status: "active"
      }
    ]);

    render(<ListingsView />);

    const gapInsight = (await screen.findByText("Datenluecken")).closest(".listing-insight");

    expect(gapInsight).not.toBeNull();
    expect(within(gapInsight as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(gapInsight).not.toHaveClass("needs-work");
    expect(screen.getByText(/0 Sofort-Deals? · 0 Datenbremse · 1 Beobachten/i)).toBeInTheDocument();
  });

  it("flags listings without rent as not cashflow-ready", async () => {
    getListingsMock.mockResolvedValueOnce([
      {
        id: 30,
        title: "Essen rent missing",
        city: "Essen",
        source: "immoscout_alert",
        purchase_price: 185000,
        living_area_sqm: 58,
        cold_rent_monthly: null,
        house_money_monthly: 220,
        energy_class: "C",
        status: "active",
        days_on_market: 22,
        price_reduction_count: 0,
        price_reduction_total_percent: null,
        signals: []
      }
    ]);

    render(<ListingsView />);

    const triage = within(await screen.findByLabelText("Listing-Triage"));
    const gapInsight = screen.getByText("Datenluecken").closest(".listing-insight");
    const listingRow = within(screen.getByRole("row", { name: /Essen rent missing/i }));

    expect(triage.getByText(/0 Sofort-Deals? · 1 Datenbremse · 0 Beobachten/i)).toBeInTheDocument();
    expect(triage.getAllByText(/Miete/i).length).toBeGreaterThanOrEqual(1);
    expect(gapInsight).not.toBeNull();
    expect(within(gapInsight as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(listingRow.getByText(/1 Luecke/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Miete nachfassen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("updates workload metrics when the city filter narrows the working set", async () => {
    getListingsMock.mockResolvedValueOnce(listings());

    render(<ListingsView />);

    await screen.findByLabelText("Listing-Triage");
    fireEvent.change(screen.getByLabelText(/Stadt oder Lage/i), { target: { value: "Berlin" } });

    const activeInsight = screen.getByText("Aktive Angebote").closest(".listing-insight");
    const gapInsight = screen.getByText("Datenluecken").closest(".listing-insight");

    expect(activeInsight).not.toBeNull();
    expect(gapInsight).not.toBeNull();
    expect(within(activeInsight as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(gapInsight as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(gapInsight).not.toHaveClass("needs-work");
    expect(screen.getByText(/0 Sofort-Deals? · 0 Datenbremse · 1 Beobachten/i)).toBeInTheDocument();
    expect(screen.getAllByText("Berlin low yield").length).toBeGreaterThanOrEqual(1);
  });
});
