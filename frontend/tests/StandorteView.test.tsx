import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StandorteView } from "../src/components/StandorteView";
import { getRegion, getRegions, refreshOwnRegionMetrics, seedRegionDefaults } from "../src/lib/api";
import { RegionPayload } from "../src/lib/types";

vi.mock("../src/lib/api", () => ({
  getRegion: vi.fn(),
  getRegions: vi.fn(),
  refreshOwnRegionMetrics: vi.fn(),
  seedRegionDefaults: vi.fn()
}));

const getRegionMock = vi.mocked(getRegion);
const getRegionsMock = vi.mocked(getRegions);
const refreshOwnRegionMetricsMock = vi.mocked(refreshOwnRegionMetrics);
const seedRegionDefaultsMock = vi.mocked(seedRegionDefaults);

function region(): RegionPayload {
  return {
    id: 1,
    name: "Messestadt",
    level: "city",
    federal_state: "Bayern",
    population: 42000,
    metrics: {
      vacancy_rate_percent: 3.2,
      population_forecast_2040_percent: 4.5,
      unemployment_rate_percent: 4.1,
      price_eur_sqm: 4200,
      own_listing_count: 5
    },
    score: {
      total_score: 78,
      category_scores: {
        yield_power: 65,
        demand_stability: 82,
        economic_base: 76,
        exit_liquidity: 70
      },
      gross_yield_percent: 4.7,
      rent_factor: 21.3,
      red_flags: [],
      positive_factors: ["Gute Nachfrage."],
      negative_factors: [],
      recommendation: "Weiter pruefen.",
      data_completeness_percent: 74,
      explanation: "Solide Datenlage."
    }
  };
}

describe("StandorteView", () => {
  beforeEach(() => {
    getRegionMock.mockReset();
    getRegionsMock.mockReset();
    refreshOwnRegionMetricsMock.mockReset();
    seedRegionDefaultsMock.mockReset();
  });

  it("shows a real loading state before region data is available", () => {
    getRegionsMock.mockReturnValueOnce(new Promise<RegionPayload[]>(() => undefined));

    render(<StandorteView />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Standorte werden geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Standort- oder Portfolioentscheidung ableiten/i);
    expect(screen.queryByText(/Keine Regionen/i)).not.toBeInTheDocument();
  });

  it("shows an API error state with retry before any location decision is shown", async () => {
    getRegionsMock
      .mockRejectedValueOnce(new Error("Regionen API offline"))
      .mockResolvedValueOnce([region()]);

    render(<StandorteView />);

    const errorState = await screen.findByRole("alert");

    expect(errorState).toHaveTextContent("Standorte konnten nicht geladen werden");
    expect(errorState).toHaveTextContent("Regionen API offline");
    expect(errorState).toHaveTextContent(/Keine Standort-, Score- oder Portfolioentscheidung ableiten/i);
    expect(screen.queryByText(/Keine Regionen/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByText("Messestadt")).toBeInTheDocument();
    expect(getRegionsMock).toHaveBeenCalledTimes(2);
  });
});
