import { describe, expect, it } from "vitest";

import {
  filterListings,
  formatCurrency,
  groupDealsByStage,
  rankDealsByScore,
  regionOutlookHighlights
} from "../src/lib/dealMetrics";

describe("dealMetrics frontend helpers", () => {
  it("formats German currency without hiding missing values", () => {
    expect(formatCurrency(185000)).toContain("185.000");
    expect(formatCurrency(null)).toBe("Fehlt");
  });

  it("filters listings by city, rented state and missing data", () => {
    const listings = [
      {
        id: 1,
        city: "Leipzig",
        is_rented: true,
        energy_class: "C",
        house_money_monthly: 220,
        purchase_price: 185000,
        living_area_sqm: 58
      },
      {
        id: 2,
        city: "Berlin",
        is_rented: false,
        energy_class: null,
        house_money_monthly: null,
        purchase_price: 415000,
        living_area_sqm: 49
      }
    ];

    expect(filterListings(listings, { city: "lei", rented: "rented", missingData: false })).toHaveLength(1);
    expect(filterListings(listings, { city: "", rented: "all", missingData: true })).toHaveLength(1);
  });

  it("groups deals into all pipeline stages and ranks by score", () => {
    const deals = [
      { id: 1, title: "A", pipeline_stage: "New", latest_score: { total_score: 64 } },
      { id: 2, title: "B", pipeline_stage: "Underwriting", latest_score: { total_score: 82 } }
    ];

    expect(groupDealsByStage(deals).New).toHaveLength(1);
    expect(groupDealsByStage(deals).Rejected).toEqual([]);
    expect(rankDealsByScore(deals)[0].id).toBe(2);
  });

  it("selects neutral region outlook highlights with urban environment visible", () => {
    const outlook = {
      total_score: 79,
      category_scores: {},
      thesis: "Strong positive regional development setup.",
      positive_factors: [],
      caution_factors: [],
      data_quality_notes: [],
      next_recommended_action: "Prioritize in sourcing.",
      key_metrics: [
        { name: "flood_risk_score", value: 74, interpretation: "solid signal for flood resilience" },
        { name: "urban_environment_quality_score", value: 81, interpretation: "strong signal for objective neighborhood quality" },
        { name: "employer_access_score", value: 83, interpretation: "strong signal for jobs access" },
        { name: "population_trend_score", value: 84, interpretation: "strong signal for population demand" },
        { name: "purchasing_power_score", value: 78, interpretation: "strong signal for income strength" },
        { name: "vacancy_risk_score", value: 80, interpretation: "strong signal for market tightness" }
      ]
    };

    expect(regionOutlookHighlights(outlook).map((metric) => metric.name)).toEqual([
      "population_trend_score",
      "urban_environment_quality_score",
      "employer_access_score",
      "purchasing_power_score"
    ]);
    expect(regionOutlookHighlights(null)).toEqual([]);
  });
});
