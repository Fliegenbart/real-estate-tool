import { describe, expect, it } from "vitest";

import {
  acquisitionReadinessSummary,
  acquisitionWorkOrderBrief,
  assetManagementBrief,
  bankPackageCreditBrief,
  acquisitionDecisionLeverageBrief,
  dealAssumptionAuditBrief,
  dealActionPlanBrief,
  dealBidStackBrief,
  dealBrokerPriceCommunicationBrief,
  dealComparableEvidenceBrief,
  dealDecisionBrief,
  dealDecisionCounts,
  dealDossierCockpitBrief,
  dealUnlockPlanBrief,
  developmentCaseHandoffBrief,
  dealDevelopmentPotentialMapBrief,
  dealDevelopmentEvidencePackBrief,
  dealDevelopmentPricingDisciplineBrief,
  dealEvidenceQualityBrief,
  dealExecutionSprintBrief,
  dealExitLiquidityBrief,
  dealInvestmentCommitteeBrief,
  dealMemoCockpitBrief,
  dealSiteVisitBrief,
  dealAcquisitionThesisBrief,
  dealMarketComparisonBrief,
  dealLocationOfferDisciplineBrief,
  dealMicroLocationAlphaBrief,
  dealMicroLocationPriceGateBrief,
  dealMicroLocationTargetGroupBrief,
  dealLoiConditionsBrief,
  dealNegotiationCommandBrief,
  dealOfferBandBrief,
  dealOfferDecisionBrief,
  dealClosingCommandBrief,
  dealOfferReleasePackageBrief,
  dealPricingBrief,
  dealRepairPlanBrief,
  dealRiskAdjustedOfferBrief,
  dealScenarioStressBrief,
  dealStrategyBrief,
  dataSourcesHealthBrief,
  dueDiligenceDocumentSummary,
  filterListings,
  formatCurrency,
  groupDealsByStage,
  hasMissingCoreData,
  locationPanelSummary,
  microLocationFactorRows,
  microLocationCoordinateReadinessBrief,
  microLocationDecisionBrief,
  microLocationEvidenceRows,
  microLocationPotentialRows,
  microLocationProfileRows,
  microLocationReadinessBrief,
  objectDevelopmentPotentialBrief,
  openStreetMapSearchUrl,
  parseCoordinatePaste,
  portfolioCommandBrief,
  rankDealsByDecision,
  rankDealsByScore,
  regionOutlookHighlights
} from "../src/lib/dealMetrics";
import { BankPackage, Deal } from "../src/lib/types";

describe("dealMetrics frontend helpers", () => {
  it("formats German currency without hiding missing values", () => {
    expect(formatCurrency(185000)).toContain("185.000");
    expect(formatCurrency(null)).toBe("Fehlt");
  });

  it("creates a saved development case handoff for memo and bank package", () => {
    const brief = developmentCaseHandoffBrief({
      id: 41,
      title: "Saved development source",
      pipeline_stage: "Underwriting",
      listing: {
        id: 41,
        title: "Listing",
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
          recommendation: "possible_value_add",
          warnings: []
        }
      }
    });

    expect(brief).not.toBeNull();
    if (!brief) {
      throw new Error("Expected saved development case handoff.");
    }

    expect(brief.headline).toBe("Gespeicherter Entwicklungsfall Case #41");
    expect(brief.summary).toContain("Memo, Bankpaket und Preisdisziplin");
    expect(brief.guardrail).toContain("Nicht blind in Kaufpreis oder Finanzierung einrechnen");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Zielmiete", value: expect.stringContaining("2.010") }),
        expect.objectContaining({ label: "Capex", value: expect.stringContaining("46.000") }),
        expect.objectContaining({ label: "Refi-LTV", value: "65 %" }),
        expect.objectContaining({ label: "Werthebel", value: expect.stringContaining("164.400") }),
        expect.objectContaining({ label: "Kapital frei", value: expect.stringContaining("55.360") })
      ])
    );
    expect(brief.requiredProofs).toEqual(
      expect.arrayContaining([
        "Bankbewertung oder konservativer Nachher-Wert",
        "Capex-Angebot mit Gewerken und Puffer",
        "Mietvertrag, Zielmiete und rechtliche Mietanpassung"
      ])
    );
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
        living_area_sqm: 58,
        cold_rent_monthly: 760
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

  it("treats missing rent as a core listing data gap", () => {
    const listing = {
      id: 3,
      city: "Essen",
      purchase_price: 185000,
      living_area_sqm: 58,
      cold_rent_monthly: null,
      house_money_monthly: 220,
      energy_class: "C"
    };

    expect(hasMissingCoreData(listing)).toBe(true);
    expect(filterListings([listing], { city: "", rented: "all", missingData: true })).toHaveLength(1);
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

  it("prioritizes dashboard decisions by real action need instead of score only", () => {
    const rejectDeal = {
      id: 1,
      title: "Looks good, numbers fail",
      pipeline_stage: "New",
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
        residual_debt_factor_rating: "red"
      },
      location: { micro_location_score: 86 }
    };
    const buyDeal = {
      id: 2,
      title: "Healthy buy candidate",
      pipeline_stage: "Underwriting",
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
        residual_debt_factor_rating: "green"
      },
      location: { micro_location_score: 78 }
    };
    const watchDeal = {
      id: 3,
      title: "Missing underwriting",
      pipeline_stage: "New",
      latest_score: {
        total_score: 72,
        category_scores: {},
        explanation: "",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Underwrite."
      }
    };

    expect(rankDealsByDecision([buyDeal, watchDeal, rejectDeal]).map((deal) => deal.id)).toEqual([1, 2, 3]);
    expect(dealDecisionCounts([buyDeal, watchDeal, rejectDeal])).toEqual({
      buy: 1,
      negotiate: 0,
      watch: 1,
      reject: 1
    });
  });

  it("calculates a cashflow-neutral negotiation anchor from the current purchase price", () => {
    const weakBrief = dealPricingBrief({
      id: 1,
      title: "Too expensive",
      pipeline_stage: "New",
      listing: { id: 1, title: "Listing", purchase_price: 520000 },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 295266.67
      }
    });
    const healthyBrief = dealPricingBrief({
      id: 2,
      title: "Below anchor",
      pipeline_stage: "Underwriting",
      listing: { id: 2, title: "Listing", purchase_price: 298000 },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 331000
      }
    });

    expect(weakBrief.status).toBe("gap");
    expect(weakBrief.label).toBe("Preis-Luecke");
    expect(weakBrief.value).toContain("224.733");
    expect(weakBrief.anchor).toContain("295.267");
    expect(weakBrief.tone).toBe("risk");
    expect(weakBrief.summary).toContain("ueber neutralem Cashflow-Preis");

    expect(healthyBrief.status).toBe("buffer");
    expect(healthyBrief.label).toBe("Preis-Puffer");
    expect(healthyBrief.value).toContain("33.000");
    expect(healthyBrief.tone).toBe("good");
  });

  it("builds a deal unlock plan with concrete price, rent and evidence levers", () => {
    const brief = dealUnlockPlanBrief({
      id: 91,
      title: "Strong location, weak economics",
      pipeline_stage: "New",
      listing: {
        id: 91,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        house_money_monthly: 360
      },
      latest_score: {
        total_score: 58,
        category_scores: { location_and_demand: 84 },
        explanation: "Good location but weak debt coverage.",
        positive_factors: ["Strong micro location."],
        negative_factors: ["Base case cashflow is negative."],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject or renegotiate materially before diligence."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        stressed_monthly_cashflow_before_tax: -849,
        dscr: 0.57,
        stressed_dscr: 0.55,
        annual_debt_service: 23800,
        loan_amount: 390000,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        residual_debt_factor_rating: "red"
      },
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        daily_needs_score: 88,
        short_term_rental_score: 70,
        nuisance_resilience_score: 52
      },
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Deal-Unlock: 3 harte Hebel bis kaufbar");
    expect(brief.summary).toContain("Aktuell kein Kaufkandidat");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Entscheidung", value: "Ablehnen/hart nachverhandeln" }),
        expect.objectContaining({ label: "Cashflow-Luecke", value: expect.stringContaining("/Monat") }),
        expect.objectContaining({ label: "Preis-/Debt-Hebel", value: expect.stringContaining("€") }),
        expect.objectContaining({ label: "Freigabe", value: expect.stringContaining("/6 Gates") })
      ])
    );
    expect(brief.levers.map((lever) => lever.label)).toEqual([
      "Preis/Finanzierung reparieren",
      "Miethebel belegen",
      "Freigabe-Belege schliessen"
    ]);
    expect(brief.levers[0]).toEqual(
      expect.objectContaining({
        key: "price_financing",
        statusLabel: "Pflichthebel",
        impact: expect.stringContaining("Preis-/Debt-Hebel")
      })
    );
    expect(brief.levers[1]).toEqual(
      expect.objectContaining({
        key: "rent_proof",
        proof: expect.stringContaining("Mietrecht"),
        action: expect.stringContaining("Zielmiete")
      })
    );
    expect(brief.levers[2]).toEqual(
      expect.objectContaining({
        key: "evidence_readiness",
        action: expect.stringContaining("Unterlagen")
      })
    );
    expect(brief.stopRule).toContain("Kein bindendes Angebot");
    expect(brief.nextActions[0]).toContain("Preis");
  });

  it("builds a conservative offer band from cashflow and yield anchors", () => {
    const brief = dealOfferBandBrief({
      id: 9,
      title: "Strong location, weak economics",
      pipeline_stage: "New",
      listing: { id: 9, title: "Listing", purchase_price: 520000 },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
      },
      latest_renovation_case: {
        id: 3,
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
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      }
    });

    expect(brief.status).toBe("price_gap");
    expect(brief.startOfferPrice).toBe(265500);
    expect(brief.targetOfferPrice).toBe(286000);
    expect(brief.walkAwayPrice).toBe(295000);
    expect(brief.gapToAskEur).toBe(225000);
    expect(brief.developmentCreditEur).toBe(0);
    expect(brief.warnings).toContain("Entwicklungspotential erst nach WEG-, Geo- und Capex-Belegen in den Kaufpreis einrechnen.");
  });

  it("compares asking price, rent and market anchors before pricing a deal", () => {
    const brief = dealMarketComparisonBrief({
      id: 12,
      title: "Market gap deal",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 17.5,
      listing: {
        id: 12,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        days_on_market: 71,
        price_reduction_count: 1,
        price_reduction_total_percent: 3.5
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 18.1,
        status: "review",
        confidence: "medium"
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.status).toBe("overpriced");
    expect(brief.headline).toBe("Preis ueber Marktanker");
    expect(brief.askingPricePerSqm).toBe(8966);
    expect(brief.marketPricePerSqm).toBe(7800);
    expect(brief.marketGapPercent).toBe(15);
    expect(brief.marketGapEur).toBe(67500);
    expect(brief.marketValueEstimateEur).toBe(452400);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Angebot", value: "8.966 €/m2" }),
        expect.objectContaining({ label: "Marktanker", value: "7.800 €/m2" }),
        expect.objectContaining({ label: "Markt-Gap", value: "+15 %" }),
        expect.objectContaining({ label: "Gap EUR", value: "67.500 €" })
      ])
    );
    expect(brief.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Kaufpreis",
          statusLabel: "Ueber Markt",
          value: "8.966 €/m2",
          benchmark: "7.800 €/m2"
        }),
        expect.objectContaining({
          label: "Ist-Miete",
          value: "16,9 €/m2",
          benchmark: "17,5 €/m2"
        }),
        expect.objectContaining({
          label: "Marktmiet-These",
          value: "19,8 €/m2",
          benchmark: "18,1 €/m2 rechtlich plausibel"
        }),
        expect.objectContaining({
          label: "Marktdynamik",
          value: "71 Tage",
          benchmark: "1 Preisreduktion"
        })
      ])
    );
    expect(brief.guardrails).toContain("67.500 € Markt-Gap nicht als Upside behandeln; entweder Kaufpreis senken oder echte Comps belegen.");
    expect(brief.nextActions).toContain("Echte Vergleichsangebote und, wenn moeglich, Abschlussdaten fuer PLZ 81829 nachziehen.");
  });

  it("separates proxy market anchors from real comparable evidence", () => {
    const brief = dealComparableEvidenceBrief({
      id: 18,
      title: "Proxy comps only",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 17.5,
      listing: {
        id: 18,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        source: "immoscout_alert",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        days_on_market: 71,
        price_reduction_count: 1,
        price_reduction_total_percent: 3.5
      },
      latest_underwriting: {
        price_per_sqm: 8965.52
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 18.1,
        status: "review",
        confidence: "medium"
      },
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.status).toBe("proxy_only");
    expect(brief.headline).toBe("Comparable Evidence: Proxy-Anker, echte Comps fehlen");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Comp-Status", value: "Proxy-Anker" }),
        expect.objectContaining({ label: "Echte Comps", value: "0/3" }),
        expect.objectContaining({ label: "Proxy-Anker", value: "4/4" })
      ])
    );
    expect(brief.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "asking_price",
          label: "Angebotspreis",
          source: "immoscout_alert",
          value: "8.966 €/m2",
          statusLabel: "Proxy"
        }),
        expect.objectContaining({
          key: "market_price_anchor",
          label: "Marktpreisanker",
          source: "Interner Marktanker",
          value: "7.800 €/m2"
        }),
        expect.objectContaining({
          key: "external_comps",
          label: "Echte Vergleichsobjekte",
          statusLabel: "Fehlen",
          value: "0/3"
        })
      ])
    );
    expect(brief.guardrails).toContain("Proxy-Anker sind keine Abschlussliste; Kaufpreis erst mit mindestens 3 passenden Vergleichsobjekten freigeben.");
    expect(brief.nextActions[0]).toBe("Mindestens 3 echte Vergleichsangebote oder Abschlussdaten fuer PLZ 81829 nachziehen.");
  });

  it("adds a risk-adjusted bid ceiling below walk-away when diligence is weak", () => {
    const brief = dealRiskAdjustedOfferBrief({
      id: 19,
      title: "Strong location, weak proof",
      pipeline_stage: "Underwriting",
      listing: {
        id: 19,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        house_money_monthly: 360,
        energy_class: "E"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
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
      location: {
        micro_location_score: 82,
        transit_access_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        nuisance_resilience_score: 52,
        short_term_rental_score: 72,
        evidence_data_completeness_percent: 42,
        evidence_confidence: "low",
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          short_term_rental_occupancy_percent: 72,
          short_term_rental_legal_status: "restricted"
        }
      },
      geo_context: {
        milieu_protection_area: true,
        data_confidence_percent: 62
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Risiko-Puffer blockiert bindendes Angebot");
    expect(brief.baseWalkAwayPrice).toBe(295000);
    expect(brief.reservePercent).toBe(15);
    expect(brief.requiredReserveEur).toBe(44500);
    expect(brief.riskAdjustedCeilingPrice).toBe(250500);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Interner Walk-away", value: "295.000 €" }),
        expect.objectContaining({ label: "Sicherheitsabschlag", value: "44.500 €" }),
        expect.objectContaining({ label: "Risiko-Deckel", value: "250.500 €" }),
        expect.objectContaining({ label: "Reserve", value: "15 %" })
      ])
    );
    expect(brief.drivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Exit-Liquiditaet",
          reservePercent: 4,
          reason: expect.stringContaining("Enger Kaeuferkreis")
        }),
        expect.objectContaining({
          label: "Annahmen-Audit",
          reservePercent: 5,
          reason: expect.stringContaining("preisrelevante Annahmen")
        }),
        expect.objectContaining({
          label: "Finanzierung",
          reservePercent: 3,
          reason: expect.stringContaining("Cashflow oder DSCR")
        })
      ])
    );
    expect(brief.guardrails).toContain("Kein bindendes Angebot oberhalb 250.500 €, solange die offenen Risiko-Treiber nicht geschlossen sind.");
    expect(brief.nextActions).toContain("Risiko-Puffer im IC-Memo zeigen: Basis-Walk-away, Sicherheitsabschlag und Risiko-Deckel getrennt ausweisen.");
  });

  it("builds a bid stack from asking price, anchors, development credit and risk ceiling", () => {
    const brief = dealBidStackBrief({
      id: 22,
      title: "Blocked stack deal",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      listing: {
        id: 22,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        house_money_monthly: 360,
        energy_class: "E"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -1200,
        stressed_dscr: 0.42,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
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
      location: {
        micro_location_score: 82,
        transit_access_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        nuisance_resilience_score: 52,
        short_term_rental_score: 72,
        evidence_data_completeness_percent: 42,
        evidence_confidence: "low",
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          short_term_rental_occupancy_percent: 72,
          short_term_rental_legal_status: "restricted"
        }
      },
      geo_context: {
        milieu_protection_area: true,
        data_confidence_percent: 62
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.headline).toBe("Gebot nur als Preisanker, nicht bindend");
    expect(brief.tone).toBe("risk");
    expect(brief.finalCeilingPrice).toBe(250500);
    expect(brief.negotiationRange).toContain("Risiko-Deckel 250.500 € liegt unter Startgebot 265.500 €");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Forderung", value: "520.000 €" }),
        expect.objectContaining({ label: "Risiko-Deckel", value: "250.500 €" }),
        expect.objectContaining({ label: "Abstand", value: "269.500 €" }),
        expect.objectContaining({ label: "Sendestatus", value: "Pausieren" })
      ])
    );
    expect(brief.rows.map((row) => row.label)).toEqual([
      "Forderung",
      "Marktwert",
      "Cashflow-Anker",
      "Zielrendite-Anker",
      "Basis-Walk-away",
      "Entwicklungs-Credit",
      "Interner Walk-away",
      "Risiko-Reserve",
      "Risiko-Deckel",
      "Gebotsband"
    ]);
    expect(brief.rows.find((row) => row.label === "Marktwert")?.value).toBe("452.400 €");
    expect(brief.rows.find((row) => row.label === "Entwicklungs-Credit")?.value).toBe("0 €");
    expect(brief.rows.find((row) => row.label === "Risiko-Reserve")?.value).toBe("-44.500 €");
    expect(brief.rows.find((row) => row.label === "Gebotsband")?.value).toBe("Pausieren");
    expect(brief.guardrails).toContain("Kein Angebot senden: Risiko-Deckel liegt unter dem rechnerischen Startgebot.");
    expect(brief.guardrails).toContain("0 € Entwicklung im Gebot: Upside bleibt Memo-Chance, bis WEG, Geo, Capex und Bank-Case belegt sind.");
  });

  it("stress-tests the deal against interest, rent, capex and exit downside before a binding bid", () => {
    const brief = dealScenarioStressBrief({
      id: 23,
      title: "Stress-sensitive value-add deal",
      pipeline_stage: "Underwriting",
      listing: {
        id: 23,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        annual_cold_rent: 15900,
        net_operating_income: 13287,
        annual_debt_service: 12300,
        monthly_cashflow_before_tax: 120,
        dscr: 1.08,
        stressed_monthly_cashflow_before_tax: -310,
        stressed_dscr: 0.88,
        loan_amount: 386250,
        equity_required: 178460.5,
        simple_exit_value: 653000,
        remaining_loan_after_holding: 350000
      },
      latest_renovation_case: {
        id: 23,
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
      }
    });

    expect(brief.status).toBe("breaks");
    expect(brief.headline).toBe("Stress-Test blockiert Angebotsfreigabe");
    expect(brief.summary).toContain("2 harte Brueche");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Schlimmster Cashflow", value: "-310 €" }),
        expect.objectContaining({ label: "Schwaechster DSCR", value: "0,88" }),
        expect.objectContaining({ label: "Harte Brueche", value: "2" }),
        expect.objectContaining({ label: "Exit-Puffer", value: "41.609 €" })
      ])
    );
    expect(brief.scenarios.map((scenario) => scenario.label)).toEqual(["Base Case", "Zins +2 %", "Miete -10 %", "Capex +15 %", "Exit -10 %"]);
    expect(brief.scenarios.find((scenario) => scenario.label === "Zins +2 %")).toMatchObject({
      status: "breaks",
      statusLabel: "Bricht",
      cashflowBeforeTax: -310,
      dscr: 0.88
    });
    expect(brief.scenarios.find((scenario) => scenario.label === "Miete -10 %")).toMatchObject({
      status: "breaks",
      statusLabel: "Bricht",
      cashflowBeforeTax: -13,
      dscr: 0.95
    });
    expect(brief.scenarios.find((scenario) => scenario.label === "Capex +15 %")).toMatchObject({
      status: "watch",
      statusLabel: "Puffer pruefen",
      liquidityImpactEur: 6750
    });
    expect(brief.guardrails).toContain("Kein finales Gebot, wenn ein Pflicht-Stress Cashflow oder DSCR bricht.");
    expect(brief.nextActions).toContain("Zins-, Miet- und Capex-Stress in Bankpaket, IC-Memo und Angebotsfreigabe sichtbar dokumentieren.");
  });

  it("turns failed stress scenarios into a quantified deal repair plan", () => {
    const brief = dealRepairPlanBrief({
      id: 24,
      title: "Repairable but broken deal",
      pipeline_stage: "Underwriting",
      listing: {
        id: 24,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        annual_cold_rent: 15900,
        net_operating_income: 13287,
        annual_debt_service: 12300,
        monthly_cashflow_before_tax: 120,
        dscr: 1.08,
        stressed_monthly_cashflow_before_tax: -310,
        stressed_dscr: 0.88,
        loan_amount: 386250,
        equity_required: 178460.5,
        simple_exit_value: 653000,
        remaining_loan_after_holding: 350000
      },
      latest_renovation_case: {
        id: 24,
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
      }
    });

    expect(brief.status).toBe("needs_repair");
    expect(brief.headline).toBe("Deal reparieren oder nicht bieten");
    expect(brief.summary).toContain("410 €/Monat");
    expect(brief.summary).toContain("2 Stress-Brueche");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Cashflow-Luecke", value: "410 €/Monat" }),
        expect.objectContaining({ label: "Kaufpreis-Hebel", value: "154.500 €" }),
        expect.objectContaining({ label: "Miethebel", value: "410 €/Monat" }),
        expect.objectContaining({ label: "Zins-Hebel", value: "1,27 %-Punkte" })
      ])
    );
    expect(brief.levers.map((lever) => lever.label)).toEqual([
      "Kaufpreis senken",
      "Miete belegen",
      "Mehr Eigenkapital",
      "Zins/Finanzierung verbessern",
      "Capex-Reserve sichern"
    ]);
    expect(brief.levers.find((lever) => lever.label === "Kaufpreis senken")).toMatchObject({
      amount: "154.500 €",
      status: "must_fix",
      memoLine: "Kaufpreisabschlag oder Debt-Reduktion von ca. 154.500 € noetig, um den schlimmsten Cashflow-Stress auf 100 €/Monat zu bringen."
    });
    expect(brief.levers.find((lever) => lever.label === "Miete belegen")).toMatchObject({
      amount: "410 €/Monat",
      status: "must_fix"
    });
    expect(brief.levers.find((lever) => lever.label === "Capex-Reserve sichern")).toMatchObject({
      amount: "6.750 €",
      status: "watch"
    });
    expect(brief.stopRules).toContain("Kein bindendes Angebot, solange Cashflow-Luecke 410 €/Monat und DSCR-Bruch nicht repariert sind.");
    expect(brief.nextActions).toContain("Mit Makler/Verkaeufer Reparaturpfad testen: Preisabschlag, Mietbeleg, Finanzierungsstruktur oder Capex-Reserve.");
  });

  it("turns the repair plan into a concrete negotiation command", () => {
    const brief = dealNegotiationCommandBrief({
      id: 25,
      title: "Negotiation ready repair case",
      pipeline_stage: "Underwriting",
      listing: {
        id: 25,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        annual_cold_rent: 15900,
        net_operating_income: 13287,
        annual_debt_service: 12300,
        monthly_cashflow_before_tax: 120,
        dscr: 1.08,
        stressed_monthly_cashflow_before_tax: -310,
        stressed_dscr: 0.88,
        loan_amount: 386250,
        equity_required: 178460.5,
        simple_exit_value: 653000,
        remaining_loan_after_holding: 350000
      },
      latest_renovation_case: {
        id: 25,
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
      }
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Verhandlungsauftrag: Reparaturpfad testen");
    expect(brief.internalLine).toContain("Kein bindendes Angebot");
    expect(brief.internalLine).toContain("410 €/Monat");
    expect(brief.sellerLine).toContain("410 €/Monat");
    expect(brief.copyText).toContain("unverbindlich");
    expect(brief.copyText).toContain("154.500");
    expect(brief.copyText).toContain("410 €/Monat");
    expect(brief.copyText).toContain("6.750");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Sendestatus", value: "Nicht senden" }),
        expect.objectContaining({ label: "Cashflow-Luecke", value: "410 €/Monat" }),
        expect.objectContaining({ label: "Preis-/Debt-Hebel", value: expect.stringContaining("154.500") }),
        expect.objectContaining({ label: "Verkaeuferlinie", value: "Reparaturpfad" })
      ])
    );
    expect(brief.asks.map((ask) => ask.label)).toEqual([
      "Preis-/Debt-Hebel",
      "Mietbeleg",
      "Finanzierungsstruktur",
      "Capex-Reserve",
      "Unterlagenpaket"
    ]);
    expect(brief.asks[0].value).toContain("154.500");
    expect(brief.asks[1].value).toBe("410 €/Monat");
    expect(brief.asks[3].value).toContain("6.750");
    expect(brief.stopRules).toContain("Kein bindendes Angebot, solange der Reparaturpfad nicht belegt ist.");
    expect(brief.nextActions).toContain("Verhandlungsauftrag in Dossier, Bankpaket und IC-Memo uebernehmen.");
  });

  it("turns the negotiation command into LOI conditions", () => {
    const brief = dealLoiConditionsBrief({
      id: 26,
      title: "LOI repair case",
      pipeline_stage: "Underwriting",
      listing: {
        id: 26,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        annual_cold_rent: 15900,
        net_operating_income: 13287,
        annual_debt_service: 12300,
        monthly_cashflow_before_tax: 120,
        dscr: 1.08,
        stressed_monthly_cashflow_before_tax: -310,
        stressed_dscr: 0.88,
        loan_amount: 386250,
        equity_required: 178460.5,
        simple_exit_value: 653000,
        remaining_loan_after_holding: 350000
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
      }
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("LOI-Paket: nur unverbindliche Reparatur-Indikation");
    expect(brief.loiMode).toContain("Kein LOI/keine Reservierung");
    expect(brief.copyText).toContain("unverbindlich");
    expect(brief.copyText).toContain("154.500");
    expect(brief.copyText).toContain("410 €/Monat");
    expect(brief.copyText).toContain("6.750");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "LOI-Status", value: "Nicht senden" }),
        expect.objectContaining({ label: "Preis-/Debt-Hebel", value: expect.stringContaining("154.500") }),
        expect.objectContaining({ label: "Cashflow-Luecke", value: "410 €/Monat" }),
        expect.objectContaining({ label: "Capex-Reserve", value: expect.stringContaining("6.750") })
      ])
    );
    expect(brief.conditions.map((condition) => condition.label)).toEqual([
      "Preis-/Debt-Hebel",
      "Mietbeleg",
      "Finanzierungsvorbehalt",
      "Capex-/Sanierungsvorbehalt",
      "Unterlagenvorbehalt"
    ]);
    expect(brief.killClauses).toContain("Kein LOI und keine Reservierung, solange der Reparaturpfad nicht belegt ist.");
    expect(brief.killClauses).toContain("Keine Notarvorbereitung ohne Bank- und Unterlagenfreigabe.");
    expect(brief.nextActions).toContain("LOI-Paket erst nach geloestem Verhandlungsauftrag an Makler/Verkaeufer geben.");
  });

  it("turns the offer band and readiness gates into a concrete bid decision", () => {
    const brief = dealOfferDecisionBrief({
      id: 9,
      title: "Strong location, weak economics",
      pipeline_stage: "New",
      listing: { id: 9, title: "Listing", purchase_price: 520000 },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6,
        residual_debt_factor_rating: "red"
      },
      latest_score: {
        total_score: 58,
        category_scores: {},
        explanation: "Weak economics.",
        positive_factors: [],
        negative_factors: [],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject or renegotiate materially before diligence."
      }
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Kein bindendes Angebot");
    expect(brief.offerMode).toContain("Nur als Nachverhandlungsrahmen");
    expect(brief.sellerLine).toContain("520.000");
    expect(brief.sellerLine).toContain("unverbindliche Preisindikation");
    expect(brief.sellerLine).not.toContain("Walk-away");
    expect(brief.sellerLine).not.toContain("295.000");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Startgebot", value: "265.500 €" }),
        expect.objectContaining({ label: "Zielpreis", value: "286.000 €" }),
        expect.objectContaining({ label: "Walk-away", value: "295.000 €" }),
        expect.objectContaining({ label: "Luecke", value: "225.000 €" })
      ])
    );
    expect(brief.conditions).toContain("Kein finales Angebot und kein Notartermin, solange 0/6 Freigabe-Gates bestanden sind.");
    expect(brief.conditions).toContain("Entwicklungspotential erst nach WEG-, Geo- und Capex-Belegen in den Kaufpreis einrechnen.");
    expect(brief.nextActions).toContain("Verhandlungsdossier oeffnen und Verkaeufermotiv setzen.");
  });

  it("builds broker-facing price communication without leaking internal upside arguments", () => {
    const brief = dealBrokerPriceCommunicationBrief({
      id: 13,
      title: "Messe location with upside stories",
      pipeline_stage: "Underwriting",
      listing: {
        id: 13,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1100,
        living_area_sqm: 58,
        market_rent_estimate_monthly: 1600,
        house_money_monthly: 340,
        expected_initial_capex: 45000,
        city: "Munich"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -1200,
        stressed_dscr: 0.42,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
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
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        short_term_rental_score: 78,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 82,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted"
        }
      },
      region_outlook: {
        total_score: 84,
        category_scores: {},
        thesis: "Strong local demand.",
        positive_factors: [],
        caution_factors: [],
        data_quality_notes: [],
        next_recommended_action: "Validate target groups.",
        key_metrics: [],
        micro_location_factors: [],
        target_group_profiles: [
          {
            name: "short_term_guest",
            label: "Kurzzeitgaeste",
            score: 78,
            verdict: "Passend mit Pruefung",
            reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
            risks: ["Airbnb nur als optionalen Bonus rechnen."],
            next_check: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
          }
        ]
      },
      latest_renovation_case: {
        id: 13,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 1100,
          target_cold_rent_monthly: 1600,
          annual_rent_uplift: 6000,
          implied_value_uplift_from_rent: 120000,
          post_renovation_value: 640000,
          current_loan_amount: 390000,
          refinanceable_debt_after_renovation: 416000,
          potential_equity_released: 26000,
          net_equity_still_bound_after_refinance: 19000,
          simple_roi_percent: 13.33,
          value_add_multiple: 2.67,
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [{ id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed", risk_notes: null }]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Maklertext ohne interne Upside-Argumente");
    expect(brief.externalLine).toContain("520.000");
    expect(brief.externalLine).toContain("unverbindliche Preisindikation");
    expect(brief.copyText).toContain("Betreff: Unverbindliche Preisindikation");
    for (const text of [brief.externalLine, brief.copyText]) {
      expect(text).not.toMatch(/Walk-away|Airbnb|Kurzzeitgaeste|Lage-Credit|Entwicklungsbonus|intern/i);
      expect(text).not.toMatch(/Entwicklungs-Kompass|Mietanpassung|Memo-Upside|Preisfreigabe/i);
    }
    expect(brief.internalGuardrails).toContain("Walk-away 295.000 € bleibt intern; nicht als Zielpreis an Makler oder Verkaeufer senden.");
    expect(brief.internalGuardrails).toContain("Airbnb/Kurzzeitgaeste, Lage-Credit und Entwicklungspotential nicht als Preisargument senden.");
    expect(brief.internalGuardrails).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Entwicklungs-Kompass intern:"),
        expect.stringContaining("Mietanpassung"),
        expect.stringContaining("Memo-Upside")
      ])
    );
    expect(brief.internalGuardrails).toEqual(expect.arrayContaining([expect.stringContaining("Entwicklung extern sperren:")]));
    expect(brief.externalConditions).toContain("Nur unverbindliche Preisindikation, kein bindendes Angebot und kein Notartermin.");
  });

  it("adds only a capped development credit when the value-add case is backed by object checks", () => {
    const brief = dealOfferBandBrief({
      id: 10,
      title: "Healthy value add",
      pipeline_stage: "Underwriting",
      listing: { id: 10, title: "Listing", purchase_price: 298000 },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 331000,
        maximum_purchase_price_for_target_yield: 340000
      },
      weg_health: {
        inputs: {},
        results: { total_score: 76, confidence: "high" } as never,
        updated_at: "2026-06-21T00:00:00"
      },
      geo_context: { data_confidence_percent: 80 },
      latest_renovation_case: {
        id: 4,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 900,
          target_cold_rent_monthly: 1400,
          annual_rent_uplift: 6000,
          implied_value_uplift_from_rent: 120000,
          post_renovation_value: 370000,
          current_loan_amount: 260000,
          refinanceable_debt_after_renovation: 240500,
          potential_equity_released: 32000,
          net_equity_still_bound_after_refinance: 13000,
          simple_roi_percent: 13.33,
          value_add_multiple: 2.67,
          kfw_hint: null,
          recommendation: "strong_value_add",
          warnings: []
        }
      }
    });

    expect(brief.status).toBe("within_band");
    expect(brief.developmentCreditEur).toBe(16000);
    expect(brief.walkAwayPrice).toBe(347000);
    expect(brief.targetOfferPrice).toBe(298000);
    expect(brief.reasons).toContain("Entwicklungsbonus konservativ angesetzt: 16.000 € von 32.000 € moeglicher Kapitalfreisetzung.");
  });

  it("builds a copy-ready offer release package with internal guardrails", () => {
    const brief = dealOfferReleasePackageBrief({
      id: 12,
      title: "Blocked bid",
      pipeline_stage: "Underwriting",
      listing: {
        id: 12,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1100,
        living_area_sqm: 60,
        house_money_monthly: 300,
        energy_class: "D",
        city: "Munich"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -1200,
        stressed_dscr: 0.42,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
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
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Angebot gesperrt - nur Nachverhandlungsrahmen");
    expect(brief.releaseLabel).toBe("Nicht senden");
    expect(brief.sellerMessage).toContain("520.000");
    expect(brief.sellerMessage).toContain("unverbindliche Preisindikation");
    expect(brief.sellerMessage).not.toContain("Walk-away");
    expect(brief.sellerMessage).not.toContain("295.000");
    expect(brief.internalGuardrails).toContain("Walk-away 295.000 € bleibt intern; nicht als Zielpreis an Makler oder Verkaeufer senden.");
    expect(brief.internalGuardrails.some((guardrail) => guardrail.includes("Kein finales Angebot"))).toBe(true);
    expect(brief.externalConditions).toContain("Nur unverbindliche Preisindikation, kein bindendes Angebot und kein Notartermin.");
    expect(brief.externalConditions).toContain("Vorbehaltlich vollstaendiger Due-Diligence-Unterlagen und fachlicher Pruefung.");
    expect(brief.nextActions).toContain("Verhandlungsdossier oeffnen und Verkaeufermotiv setzen.");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Freigabe", value: "Nicht senden" }),
        expect.objectContaining({ label: "Walk-away", value: "295.000 €" }),
        expect.objectContaining({ label: "Offene Gates", value: "6" }),
        expect.objectContaining({ label: "Beleg-Score", value: "25 %" })
      ])
    );
  });

  it("audits price-critical assumptions before a bid is sent", () => {
    const brief = dealAssumptionAuditBrief({
      id: 21,
      title: "Assumption-heavy deal",
      pipeline_stage: "Underwriting",
      listing: {
        id: 21,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1100,
        living_area_sqm: 58,
        house_money_monthly: 340,
        energy_class: "D",
        city: "Munich"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_dscr: 0.42,
        max_purchase_price_for_neutral_cashflow: 295266.67
      },
      location: {
        micro_location_score: 82,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 42,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "allowed"
        }
      },
      latest_renovation_case: {
        id: 6,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 1100,
          target_cold_rent_monthly: 1600,
          annual_rent_uplift: 6000,
          implied_value_uplift_from_rent: 120000,
          post_renovation_value: 640000,
          current_loan_amount: 390000,
          refinanceable_debt_after_renovation: 416000,
          potential_equity_released: 26000,
          net_equity_still_bound_after_refinance: 19000,
          simple_roi_percent: 13.33,
          value_add_multiple: 2.67,
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.headline).toBe("Annahmen noch nicht angebotsreif");
    expect(brief.blockerCount).toBeGreaterThan(0);
    expect(brief.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Kaufpreis",
          status: "verified",
          currentValue: "520.000 €"
        }),
        expect.objectContaining({
          label: "Miete/Mietrecht",
          status: "review"
        }),
        expect.objectContaining({
          label: "Mikrolage",
          status: "review",
          currentValue: "82 · 42 % Belege",
          action: expect.stringContaining("Bahnhof/U-Bahn")
        }),
        expect.objectContaining({
          label: "Entwicklung/Capex",
          status: "review",
          priceImpact: "Preisrelevant"
        }),
        expect.objectContaining({
          label: "Unterlagen",
          status: "missing"
        })
      ])
    );
    expect(brief.priceCriticalOpen).toEqual(
      expect.arrayContaining(["Miete/Mietrecht", "Mikrolage", "Entwicklung/Capex", "Unterlagen", "WEG/Geo"])
    );
    expect(brief.nextActions).toContain("Preisrelevante Annahmen klaeren, bevor ein bindendes Angebot rausgeht.");
  });

  it("summarizes exit liquidity, buyer pool and resale blockers", () => {
    const brief = dealExitLiquidityBrief({
      id: 41,
      title: "Exit-sensitive deal",
      pipeline_stage: "Underwriting",
      listing: {
        id: 41,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 250000,
        living_area_sqm: 50,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1250,
        house_money_monthly: 340,
        energy_class: "E",
        condition: "renovierungsbeduerftig"
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -180,
        dscr: 0.92,
        simple_exit_value: 315000,
        simple_equity_multiple: 1.42,
        remaining_loan_after_holding: 168000
      },
      region_outlook: {
        total_score: 86,
        category_scores: {},
        thesis: "Strong regional demand.",
        positive_factors: [],
        caution_factors: [],
        key_metrics: [],
        micro_location_factors: [],
        target_group_profiles: [],
        data_quality_notes: [],
        next_recommended_action: "Validate exit liquidity."
      },
      location: {
        micro_location_score: 82,
        transit_access_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        nuisance_resilience_score: 52,
        short_term_rental_score: 72,
        evidence_data_completeness_percent: 42,
        evidence_confidence: "low",
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          nearest_trade_fair_meters: 2200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_occupancy_percent: 72,
          short_term_rental_legal_status: "restricted"
        }
      },
      geo_context: {
        milieu_protection_area: true,
        data_confidence_percent: 62
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.headline).toBe("Exit-Liquiditaet noch nicht belegreif");
    expect(brief.tone).toBe("risk");
    expect(brief.score).toBe(53);
    expect(brief.liquidityLabel).toBe("Enger Kaeuferkreis");
    expect(brief.estimatedExitDiscountPercent).toBe(10);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Exit-Score", value: "53/100" }),
        expect.objectContaining({ label: "Exit-Abschlag", value: "10 %" }),
        expect.objectContaining({ label: "Kaeuferpool", value: "Enger Kaeuferkreis" })
      ])
    );
    expect(brief.buyerLanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Eigennutzer",
          status: "strong",
          statusLabel: "Breit"
        }),
        expect.objectContaining({
          label: "Kapitalanleger",
          status: "selective",
          statusLabel: "Selektiv"
        }),
        expect.objectContaining({
          label: "Kurzzeit-/Moebliert-These",
          status: "blocked",
          statusLabel: "Blockiert"
        })
      ])
    );
    expect(brief.risks).toEqual(
      expect.arrayContaining([
        "Cashflow oder DSCR schwach: Kapitalanleger zahlen nur mit Abschlag.",
        "WEG-Check fehlt: Eigennutzer und Banken verlangen mehr Sicherheit.",
        "Geo-/Baurecht hat Sonderthemen oder geringe Datenlage.",
        "Mikrolage-Belege unvollstaendig: Nachfrageannahme im Exit noch weich."
      ])
    );
    expect(brief.nextActions).toContain("Exit vor Gebot schaerfen: Zielkaeufer, Abschlag und fehlende Belege im IC-Memo festhalten.");
  });

  it("separates development upside from the offer price until object checks support it", () => {
    const openUpside = dealDevelopmentPricingDisciplineBrief({
      id: 11,
      title: "Visible upside, missing proof",
      pipeline_stage: "Underwriting",
      listing: {
        id: 11,
        title: "Listing",
        purchase_price: 520000,
        living_area_sqm: 53,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
      },
      latest_renovation_case: {
        id: 5,
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
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      }
    });

    expect(openUpside.status).toBe("conditional");
    expect(openUpside.headline).toBe("Entwicklung nur als Memo-Upside");
    expect(openUpside.priceRule).toBe("0 € im Walk-away, bis WEG, Geo, Capex und Bank-Case belegt sind.");
    expect(openUpside.allowedCreditEur).toBe(0);
    expect(openUpside.visibleValueUpliftEur).toBe(138000);
    expect(openUpside.facts.find((fact) => fact.label === "Werthebel sichtbar")?.value).toContain("138.000");
    expect(openUpside.blockers).toContain("WEG- und Geo-Check fehlen; Entwicklung bleibt ausserhalb des Walk-away.");
    expect(openUpside.memoItems).toContain("Upside nicht einpreisen: 138.000 € rechnerischer Werthebel bleiben Memo-Chance, bis Objekt- und Bankbelege vorliegen.");

    const backedUpside = dealDevelopmentPricingDisciplineBrief({
      id: 12,
      title: "Backed value add",
      pipeline_stage: "Underwriting",
      listing: {
        id: 12,
        title: "Listing",
        purchase_price: 298000,
        living_area_sqm: 50,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1400,
        expected_initial_capex: 45000
      },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 331000,
        maximum_purchase_price_for_target_yield: 340000
      },
      weg_health: {
        inputs: {},
        results: { total_score: 76, confidence: "high" } as never,
        updated_at: "2026-06-21T00:00:00"
      },
      geo_context: { data_confidence_percent: 80 },
      latest_renovation_case: {
        id: 6,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 900,
          target_cold_rent_monthly: 1400,
          annual_rent_uplift: 6000,
          implied_value_uplift_from_rent: 120000,
          post_renovation_value: 370000,
          current_loan_amount: 260000,
          refinanceable_debt_after_renovation: 240500,
          potential_equity_released: 32000,
          net_equity_still_bound_after_refinance: 13000,
          simple_roi_percent: 13.33,
          value_add_multiple: 2.67,
          kfw_hint: null,
          recommendation: "strong_value_add",
          warnings: []
        }
      }
    });

    expect(backedUpside.status).toBe("priced");
    expect(backedUpside.headline).toBe("Entwicklungsbonus gedeckelt einpreisbar");
    expect(backedUpside.priceRule).toBe("Max. 16.000 € Entwicklungsbonus im Walk-away.");
    expect(backedUpside.allowedCreditEur).toBe(16000);
    expect(backedUpside.memoItems).toContain("Credit-Cap dokumentieren: 16.000 € von 32.000 € Kapitalfreisetzung; nicht mehr bieten ohne neue Belege.");
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

  it("labels micro location factor rows for German deal review", () => {
    const outlook = {
      total_score: 79,
      category_scores: {},
      thesis: "Promising regional outlook.",
      positive_factors: [],
      caution_factors: [],
      data_quality_notes: [],
      next_recommended_action: "Validate before bidding.",
      key_metrics: [],
      micro_location_factors: [
        { name: "transit_access_score", value: 92, weight: 25, interpretation: "strong signal for transit access" },
        { name: "short_term_rental_score", value: 70, weight: 5, interpretation: "solid signal for short-term rental optionality" },
        { name: "nuisance_resilience_score", value: 52, weight: 15, interpretation: "mixed signal for nuisance resilience" }
      ]
    };

    expect(microLocationFactorRows(outlook)).toEqual([
      {
        name: "transit_access_score",
        label: "Bahnhof/U-Bahn",
        value: 92,
        weight: 25,
        tone: "good",
        interpretation: "strong signal for transit access"
      },
      {
        name: "short_term_rental_score",
        label: "Airbnb/Tourismus",
        value: 70,
        weight: 5,
        tone: "watch",
        interpretation: "solid signal for short-term rental optionality"
      },
      {
        name: "nuisance_resilience_score",
        label: "Stoerfaktoren",
        value: 52,
        weight: 15,
        tone: "risk",
        interpretation: "mixed signal for nuisance resilience"
      }
    ]);
  });

  it("turns stored micro-location raw evidence into readable proof rows", () => {
    const rows = microLocationEvidenceRows({
      evidence_inputs: {
        nearest_rapid_transit_meters: 280,
        nearest_trade_fair_meters: 1800,
        nearest_event_venue_meters: 900,
        hotels_1500m: 6,
        nearest_recreation_anchor_meters: 1300,
        short_term_rental_occupancy_percent: 76,
        short_term_rental_legal_status: "allowed",
        main_road_meters: 120
      }
    });

    expect(rows).toEqual([
      { label: "Bahnhof/U-Bahn", value: "280 m", tone: "good" },
      { label: "Messe", value: "1,8 km", tone: "good" },
      { label: "Event/Freizeitanker", value: "900 m", tone: "good" },
      { label: "Freizeitpark/Freizeitanker", value: "1,3 km", tone: "good" },
      { label: "Hotels im Umkreis", value: "6", tone: "good" },
      { label: "Airbnb-Auslastung", value: "76 %", tone: "good" },
      { label: "Airbnb-Rechtslage", value: "Erlaubt", tone: "good" },
      { label: "Hauptstrasse", value: "120 m", tone: "risk" }
    ]);
  });

  it("summarizes real due-diligence documents into required document status rows", () => {
    const summary = dueDiligenceDocumentSummary({
      id: 11,
      title: "Documented deal",
      pipeline_stage: "Due diligence",
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "energy_certificate",
          file_name: "Energieausweis.pdf",
          review_status: "not_reviewed",
          risk_notes: "Heizung pruefen"
        },
        {
          id: 3,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(summary.provided).toBe(3);
    expect(summary.total).toBe(10);
    expect(summary.percent).toBe(30);
    expect(summary.headline).toBe("3/10 Unterlagen");
    expect(summary.rows.slice(0, 4)).toEqual([
      {
        documentId: 1,
        documentType: "expose",
        label: "Expose",
        status: "provided",
        statusLabel: "Geprueft",
        tone: "good",
        fileName: "Expose.pdf",
        riskNotes: null
      },
      {
        documentId: 2,
        documentType: "energy_certificate",
        label: "Energieausweis",
        status: "review",
        statusLabel: "Pruefen",
        tone: "watch",
        fileName: "Energieausweis.pdf",
        riskNotes: "Heizung pruefen"
      },
      {
        documentId: null,
        documentType: "declaration_of_division",
        label: "Teilungserklaerung",
        status: "missing",
        statusLabel: "Fehlt",
        tone: "risk",
        fileName: null,
        riskNotes: null
      },
      {
        documentId: null,
        documentType: "weg_minutes",
        label: "WEG-Protokolle",
        status: "missing",
        statusLabel: "Fehlt",
        tone: "risk",
        fileName: null,
        riskNotes: null
      }
    ]);
    expect(summary.missingLabels).toContain("Teilungserklaerung");
    expect(summary.nextAction).toBe("Fehlende Bank- und Due-Diligence-Unterlagen anfordern, bevor Zeit in Notar oder finales Angebot fliesst.");
    expect(summary.requestPack.headline).toBe("7 Unterlagen jetzt anfordern");
    expect(summary.requestPack.copyIntro).toContain("vor einem finalen Angebot");
    expect(summary.requestPack.requests[0]).toMatchObject({
      label: "Teilungserklaerung",
      recipient: "Verkaeufer / Makler",
      blocking: true,
      tone: "risk"
    });
    expect(summary.requestPack.requests.find((request) => request.label === "WEG-Protokolle")?.recipient).toBe("Verwalter / WEG");
    expect(summary.requestPack.requests.find((request) => request.label === "WEG-Protokolle")?.reason).toContain("Sonderumlagen");
    expect(summary.requestPack.copyLines).toContain(
      "Bitte Teilungserklaerung nachreichen: klaert Sondereigentum, Gemeinschaftseigentum und Umbau-/Nutzungsgrenzen."
    );
    expect(summary.requestPack.copySubject).toBe("Unterlagenanfrage: 7 offene Due-Diligence-Unterlagen");
    expect(summary.requestPack.copyText).toContain("Betreff: Unterlagenanfrage: 7 offene Due-Diligence-Unterlagen");
    expect(summary.requestPack.copyText).toContain("Bitte Teilungserklaerung nachreichen");
    expect(summary.requestPack.copyText).toContain("Bitte Grundbuchauszug nachreichen");
    expect(summary.requestPack.copyText).toContain("jede Preisindikation unverbindlich");
    expect(summary.requestPack.copyText).toContain("Antwortfrist");
    expect(summary.requestPack.blockingCount).toBe(7);
    expect(summary.requestPack.recipientSummary).toBe("Verkaeufer / Makler, Verwalter / WEG");
  });

  it("labels micro location target group profiles for deal strategy", () => {
    const outlook = {
      total_score: 79,
      category_scores: {},
      thesis: "Promising regional outlook.",
      positive_factors: [],
      caution_factors: [],
      data_quality_notes: [],
      next_recommended_action: "Validate before bidding.",
      key_metrics: [],
      micro_location_factors: [],
      target_group_profiles: [
        {
          name: "commuter",
          label: "Pendler",
          score: 86,
          verdict: "Sehr passend",
          reasons: ["Bahnhof/U-Bahn/S-Bahn und Taktung stuetzen Pendlernachfrage."],
          risks: [],
          next_check: "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen."
        },
        {
          name: "short_term_guest",
          label: "Kurzzeitgaeste",
          score: 74,
          verdict: "Passend mit Pruefung",
          reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
          risks: ["Airbnb nur als optionalen Bonus rechnen."],
          next_check: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
        }
      ]
    };

    expect(microLocationProfileRows(outlook)).toEqual([
      {
        name: "commuter",
        label: "Pendler",
        score: 86,
        verdict: "Sehr passend",
        tone: "good",
        reasons: ["Bahnhof/U-Bahn/S-Bahn und Taktung stuetzen Pendlernachfrage."],
        risks: [],
        nextCheck: "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen."
      },
      {
        name: "short_term_guest",
        label: "Kurzzeitgaeste",
        score: 74,
        verdict: "Passend mit Pruefung",
        tone: "watch",
        reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
        risks: ["Airbnb nur als optionalen Bonus rechnen."],
        nextCheck: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
      }
    ]);
    expect(microLocationProfileRows(null)).toEqual([]);
  });

  it("keeps the location panel useful when no linked region exists", () => {
    expect(
      locationPanelSummary({
        id: 9,
        title: "No region deal",
        pipeline_stage: "New",
        listing: { id: 4, title: "Listing", city: "Munich", postal_code: "80796" },
        region: null,
        region_outlook: { total_score: 78, thesis: "Promising micro and regional setup." } as never
      })
    ).toEqual({
      headline: "Munich · 80796",
      detail: "Noch kein Standortdatensatz verknuepft. Promising micro and regional setup."
    });
  });

  it("turns micro location scores into a practical decision brief", () => {
    const brief = microLocationDecisionBrief({
      id: 9,
      title: "Micro deal",
      pipeline_stage: "New",
      listing: { id: 4, title: "Listing", city: "Munich", postal_code: "80796", latitude: 52.5, longitude: 13.4 },
      location: {
        micro_location_score: 82,
        transit_access_score: 92,
        daily_needs_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 64,
        short_term_rental_score: 70,
        nuisance_resilience_score: 52,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      },
      region_outlook: {
        total_score: 78,
        category_scores: {},
        thesis: "Promising.",
        positive_factors: [],
        caution_factors: [],
        key_metrics: [],
        data_quality_notes: [],
        next_recommended_action: "Validate.",
        micro_location_factors: []
      }
    });

    expect(brief.tone).toBe("watch");
    expect(brief.headline).toBe("Starke Mikrolage, aber Stoerfaktoren pruefen");
    expect(brief.positives).toContain("Bahnhof/U-Bahn/S-Bahn-Naehe ist stark und stuetzt Vermietbarkeit.");
    expect(brief.positives).toContain("Alltag/Versorgung ist stark und reduziert Leerstandsrisiko.");
    expect(brief.risks).toContain("Stoerfaktoren sind auffaellig: Laerm, Hauptstrasse, Nachtleben oder Industrie vor Gebot pruefen.");
    expect(brief.risks).toContain("Airbnb nur als optionalen Bonus behandeln; lokale Rechtslage ist eingeschraenkt oder unklar.");
    expect(brief.nextChecks).toContain("Laerm- und Strassenlage vor Ort oder mit Karten-/Katasterdaten gegenpruefen.");
  });

  it("turns concrete micro-location anchors into alpha and price discipline", () => {
    const brief = dealMicroLocationAlphaBrief({
      id: 42,
      title: "Messe micro location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 42,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        latitude: 48.131,
        longitude: 11.691
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
      }
    });

    expect(brief.status).toBe("memo");
    expect(brief.headline).toBe("Lage-Alpha stark, aber nur mit Preisdisziplin");
    expect(brief.rentThesis).toBe("Basisthese: Pendler und Mieter mit Messe-/Freizeitbezug; Airbnb nur als gepruefte Zusatzchance.");
    expect(brief.priceRule).toBe("Lage stuetzt Vermietbarkeit; kein Lageaufschlag im Walk-away, bis Vergleichsmieten, Stoerfaktoren und Airbnb-Recht belegt sind.");
    expect(brief.facts).toEqual([
      { label: "Bahnhof/U-Bahn", value: "280 m", tone: "good" },
      { label: "Messe/Freizeit", value: "Messe 1,8 km · Freizeit 1,3 km", tone: "good" },
      { label: "Airbnb/Tourismus", value: "76 % · Eingeschraenkt", tone: "watch" },
      { label: "Stoerfaktoren", value: "Hauptstrasse 120 m", tone: "risk" },
      { label: "Belege", value: "82 % · hoch", tone: "good" }
    ]);
    expect(brief.memoItems).toContain("Bahnhof/U-Bahn, Messe/Freizeit und Hotels als Nachfrageanker im Memo dokumentieren.");
    expect(brief.memoItems).toContain("Airbnb/Tourismus nur als Upside-Memo, nicht als Basis-Cashflow oder Preisaufschlag.");
    expect(brief.risks).toContain("Hauptstrasse/Laerm liegt zu nah; Mikrolage nur nach Vor-Ort-Check preislich werten.");
    expect(brief.nextActions).toContain("Laerm, Hauptstrasse und Stoerquellen vor Ort oder mit Karten-/Katasterdaten pruefen.");
    expect(brief.nextActions).toContain("Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.");
  });

  it("turns target group profiles into a price-disciplined micro-location thesis", () => {
    const brief = dealMicroLocationTargetGroupBrief({
      id: 42,
      title: "Messe micro location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 42,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        latitude: 48.131,
        longitude: 11.691
      },
      region_outlook: {
        total_score: 84,
        category_scores: {},
        thesis: "Strong local demand.",
        positive_factors: [],
        caution_factors: [],
        data_quality_notes: [],
        next_recommended_action: "Validate target groups.",
        key_metrics: [],
        micro_location_factors: [],
        target_group_profiles: [
          {
            name: "commuter",
            label: "Pendler",
            score: 86,
            verdict: "Sehr passend",
            reasons: ["Bahnhof/U-Bahn/S-Bahn und Taktung stuetzen Pendlernachfrage."],
            risks: [],
            next_check: "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen."
          },
          {
            name: "short_term_guest",
            label: "Kurzzeitgaeste",
            score: 74,
            verdict: "Passend mit Pruefung",
            reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
            risks: ["Airbnb nur als optionalen Bonus rechnen."],
            next_check: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
          },
          {
            name: "family",
            label: "Familien",
            score: 63,
            verdict: "Pruefen",
            reasons: ["Freizeit und Alltag sind solide."],
            risks: ["Laerm vor Ort pruefen."],
            next_check: "Kitas, Schulen, Gruen und Laerm fuer Familien pruefen."
          }
        ]
      },
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        short_term_rental_score: 78,
        nuisance_resilience_score: 55,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 82,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          supermarkets_1000m: 3,
          pharmacies_1000m: 2,
          doctors_1500m: 6,
          schools_1500m: 2,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 140
        },
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      }
    });

    expect(brief.headline).toBe("Zielgruppen-These: Pendler tragen die Basis");
    expect(brief.status).toBe("base");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        { label: "Basis-Zielgruppe", value: "Pendler", tone: "good" },
        { label: "Memo-Upside", value: "Kurzzeitgaeste", tone: "watch" },
        { label: "Preisregel", value: "Airbnb nicht im Kaufpreis", tone: "watch" }
      ])
    );
    expect(brief.baseCase).toContain("Pendler");
    expect(brief.baseCase).toContain("Bahnhof/U-Bahn");
    expect(brief.memoRule).toContain("Airbnb/Kurzzeitgaeste nur Memo-Upside");
    expect(brief.rows[0]).toEqual(
      expect.objectContaining({
        label: "Pendler",
        role: "Basisnachfrage",
        decisionUse: expect.stringContaining("Basis-Mietthese")
      })
    );
    expect(brief.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Kurzzeitgaeste",
          role: "Memo-Upside",
          decisionUse: expect.stringContaining("nicht Basis-Cashflow")
        })
      ])
    );
    expect(brief.nextActions).toEqual(
      expect.arrayContaining([
        "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen.",
        "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.",
        "Laerm, Hauptstrasse und Stoerquellen vor Ort pruefen, bevor Zielgruppen-Alpha bezahlt wird."
      ])
    );
  });

  it("turns micro-location factors into a price-ready evidence checklist", () => {
    const brief = microLocationReadinessBrief({
      id: 42,
      title: "Messe micro location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 42,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        latitude: 48.131,
        longitude: 11.691
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
      }
    });

    expect(brief.headline).toBe("Mikrolage-Faktorcheck: 2 kaufpreisrelevante Hebel");
    expect(brief.summary).toContain("Airbnb bleibt Memo-Upside");
    expect(brief.facts).toEqual([
      { label: "Kaufpreishebel", value: "2", tone: "good" },
      { label: "Memo-Upside", value: "2", tone: "watch" },
      { label: "Preis-Bremsen", value: "1", tone: "risk" }
    ]);
    expect(brief.rows.map((row) => [row.label, row.statusLabel, row.proof])).toEqual([
      ["Bahnhof/U-Bahn", "Preisrelevant", "280 m"],
      ["Messe/Jobs", "Preisrelevant", "Messe 1,8 km"],
      ["Freizeitanker", "Memo-Upside", "Freizeit 1,3 km"],
      ["Airbnb-Auslastung", "Memo-Upside", "76 % · Eingeschraenkt"],
      ["Stoerfaktoren", "Preis-Bremse", "Hauptstrasse 120 m"],
      ["Belegqualitaet", "Belegt", "82 % · hoch"]
    ]);
    expect(brief.rows[0].nextAction).toContain("Vergleichsmieten");
    expect(brief.rows[3].decisionUse).toContain("nicht im Basis-Cashflow");
    expect(brief.nextActions).toContain("Laerm, Hauptstrasse und Stoerquellen vor Ort pruefen, bevor Lage-Alpha bezahlt wird.");
  });

  it("keeps strong micro-location signals out of the purchase price while evidence quality is weak", () => {
    const brief = microLocationReadinessBrief({
      id: 43,
      title: "Strong signals, weak proof",
      pipeline_stage: "Underwriting",
      listing: {
        id: 43,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        latitude: 48.131,
        longitude: 11.691
      },
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        daily_needs_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 70,
        short_term_rental_score: 66,
        nuisance_resilience_score: 76,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 42,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 900
        },
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      }
    });

    expect(brief.headline).toBe("Mikrolage-Faktorcheck: 0 kaufpreisrelevante Hebel");
    expect(brief.summary).toContain("Bahnhof/U-Bahn und Messe/Jobs erst nach Belegen preisrelevant");
    expect(brief.facts).toEqual([
      { label: "Kaufpreishebel", value: "0", tone: "empty" },
      { label: "Memo-Upside", value: "2", tone: "watch" },
      { label: "Preis-Bremsen", value: "0", tone: "good" }
    ]);
    expect(brief.rows.map((row) => [row.label, row.statusLabel, row.proof])).toEqual([
      ["Bahnhof/U-Bahn", "Belegpflicht", "280 m"],
      ["Messe/Jobs", "Belegpflicht", "Messe 1,8 km"],
      ["Freizeitanker", "Memo-Upside", "Score 70"],
      ["Airbnb-Auslastung", "Memo-Upside", "76 % · Eingeschraenkt"],
      ["Stoerfaktoren", "Kontrolliert", "Hauptstrasse 900 m"],
      ["Belegqualitaet", "Nachbelegen", "42 % · niedrig"]
    ]);
    expect(brief.rows[0].decisionUse).toContain("Keine Lagepraemie");
    expect(brief.nextActions).toContain("Quellenstand, Kartendaten, Vor-Ort-Eindruck und Vergleichsmieten gegenpruefen.");
  });

  it("keeps memo-only Lage-Alpha out of the walk-away price", () => {
    const brief = dealMicroLocationPriceGateBrief({
      id: 42,
      title: "Messe micro location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 42,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        latitude: 48.131,
        longitude: 11.691
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
      }
    });

    expect(brief.status).toBe("memo_only");
    expect(brief.headline).toBe("Kein Lageaufschlag im Walk-away");
    expect(brief.premiumBudgetEur).toBe(0);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        { label: "Preisfreigabe", value: "0 EUR", tone: "watch" },
        { label: "Lage-Status", value: "Memo-Upside", tone: "watch" }
      ])
    );
    expect(brief.guardrails).toContain("Mikrolage darf ins Memo, aber nicht den Walk-away-Preis erhoehen.");
    expect(brief.nextActions).toContain("Laerm, Hauptstrasse und Airbnb-Recht pruefen, bevor Lagepreis freigegeben wird.");
  });

  it("turns target-group and location alpha into walk-away price discipline", () => {
    const brief = dealLocationOfferDisciplineBrief({
      id: 42,
      title: "Messe micro location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 42,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        latitude: 48.131,
        longitude: 11.691
      },
      latest_underwriting: {
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6
      },
      region_outlook: {
        total_score: 84,
        category_scores: {},
        thesis: "Strong local demand.",
        positive_factors: [],
        caution_factors: [],
        data_quality_notes: [],
        next_recommended_action: "Validate target groups.",
        key_metrics: [],
        micro_location_factors: [],
        target_group_profiles: [
          {
            name: "commuter",
            label: "Pendler",
            score: 68,
            verdict: "Pruefen",
            reasons: ["Arbeitsplatznaehe macht die Lage fuer Berufspendler fluessiger."],
            risks: ["Laerm vor Ort pruefen."],
            next_check: "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen."
          },
          {
            name: "short_term_guest",
            label: "Kurzzeitgaeste",
            score: 78,
            verdict: "Passend mit Pruefung",
            reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
            risks: ["Airbnb nur als optionalen Bonus rechnen."],
            next_check: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
          }
        ]
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
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 120
        },
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      }
    });

    expect(brief.status).toBe("memo_only");
    expect(brief.headline).toBe("Lagehebel erhoehen den Walk-away nicht");
    expect(brief.baseWalkAwayPrice).toBe(295000);
    expect(brief.locationCreditEur).toBe(0);
    expect(brief.guardedWalkAwayPrice).toBe(295000);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        { label: "Basis-Walk-away", value: "295.000 €", tone: "risk" },
        { label: "Lage-Credit", value: "0 €", tone: "watch" },
        { label: "Geschuetzter Walk-away", value: "295.000 €", tone: "risk" },
        { label: "Zielgruppe", value: "Kurzzeitgaeste nur Memo", tone: "watch" }
      ])
    );
    expect(brief.guardrails).toEqual(
      expect.arrayContaining([
        "Airbnb/Kurzzeitgaeste nur Memo-Upside: nicht Basis-Cashflow, nicht Walk-away-Preis, erst nach Zweckentfremdungsrecht, WEG-Regeln und Auslastung.",
        "Mikrolage darf ins Memo, aber nicht den Walk-away-Preis erhoehen.",
        "Kein Lageaufschlag in Maklerkommunikation oder Zielpreis, solange Basis-Zielgruppe und Vergleichsmieten nicht belegt sind."
      ])
    );
    expect(brief.nextActions).toEqual(
      expect.arrayContaining([
        "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.",
        "Laerm, Hauptstrasse und Airbnb-Recht pruefen, bevor Lagepreis freigegeben wird."
      ])
    );
  });

  it("caps clean Lage-Alpha premium and requires committee approval", () => {
    const brief = dealMicroLocationPriceGateBrief({
      id: 43,
      title: "Clean alpha location",
      pipeline_stage: "Underwriting",
      listing: {
        id: 43,
        title: "Listing",
        city: "Leipzig",
        postal_code: "04109",
        purchase_price: 400000,
        latitude: 51.34,
        longitude: 12.37
      },
      location: {
        micro_location_score: 88,
        transit_access_score: 92,
        daily_needs_score: 86,
        demand_anchor_score: 84,
        leisure_quality_score: 82,
        short_term_rental_score: 62,
        nuisance_resilience_score: 78,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 88,
        evidence_inputs: {
          nearest_rapid_transit_meters: 240,
          nearest_trade_fair_meters: 3200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_legal_status: "allowed",
          main_road_meters: 900
        },
        evidence_notes: []
      }
    });

    expect(brief.status).toBe("committee");
    expect(brief.headline).toBe("Lagepreis nur mit Komitee-Freigabe");
    expect(brief.premiumBudgetEur).toBe(6000);
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        { label: "Preisfreigabe", value: "6.000 EUR", tone: "good" },
        { label: "Max. Aufschlag", value: "1,5 %", tone: "good" }
      ])
    );
    expect(brief.guardrails).toContain("Maximal 1,5 % des Kaufpreises als Lagepuffer und nur mit Vergleichsmieten.");
    expect(brief.nextActions).toContain("Vergleichsmieten und Zielgruppen-Nachfrage als Komitee-Beleg ablegen.");
  });

  it("turns weak cashflow and red flags into a hard negotiation decision", () => {
    const brief = dealDecisionBrief({
      id: 9,
      title: "Strong location, weak economics",
      pipeline_stage: "New",
      latest_score: {
        total_score: 58,
        category_scores: { location_and_demand: 84 },
        explanation: "Good location but weak debt coverage.",
        positive_factors: ["Strong micro location."],
        negative_factors: ["Base case cashflow is negative."],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject or renegotiate materially before diligence."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -849,
        stressed_dscr: 0.55,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        all_in_purchase_price: 564710.5,
        equity_required: 178460.5,
        residual_debt_factor_rating: "red",
        residual_debt_factor: 221.51
      },
      region_outlook: {
        total_score: 86,
        category_scores: {},
        thesis: "Strong regional demand.",
        positive_factors: [],
        caution_factors: [],
        key_metrics: [],
        micro_location_factors: [],
        data_quality_notes: [],
        next_recommended_action: "Prioritize location, validate pricing."
      },
      location: { micro_location_score: 86 }
    });

    expect(brief.decision).toBe("reject");
    expect(brief.headline).toBe("Ablehnen oder hart nachverhandeln");
    expect(brief.tone).toBe("risk");
    expect(brief.summary).toBe("Die Lage ist stark, aber der aktuelle Preis macht den Deal wirtschaftlich zu schwach.");
    expect(brief.reasons).toContain("Cashflow ist im Basisszenario negativ.");
    expect(brief.reasons).toContain("DSCR ist deutlich unter 1,10; der Kapitaldienst traegt sich nicht.");
    expect(brief.strengths).toContain("Standort/Mikrolage ist stark, aber nicht genug fuer diesen Preis.");
    expect(brief.nextActions).toContain("Maximalpreis fuer neutralen Cashflow als harte Verhandlungsanker nutzen.");
  });

  it("recommends due diligence when score, cashflow and DSCR are healthy", () => {
    const brief = dealDecisionBrief({
      id: 10,
      title: "Solid buy candidate",
      pipeline_stage: "Underwriting",
      latest_score: {
        total_score: 82,
        category_scores: { cashflow: 80, location_and_demand: 85 },
        explanation: "Healthy economics.",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Move to due diligence."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: 240,
        dscr: 1.28,
        stressed_monthly_cashflow_before_tax: 60,
        stressed_dscr: 1.12,
        max_purchase_price_for_neutral_cashflow: 331000,
        all_in_purchase_price: 298000,
        equity_required: 62000,
        residual_debt_factor_rating: "green"
      },
      region_outlook: {
        total_score: 79,
        category_scores: {},
        thesis: "Solid demand.",
        positive_factors: [],
        caution_factors: [],
        key_metrics: [],
        micro_location_factors: [],
        data_quality_notes: [],
        next_recommended_action: "Validate before binding offer."
      },
      location: { micro_location_score: 77 }
    });

    expect(brief.decision).toBe("buy");
    expect(brief.headline).toBe("In Due Diligence nehmen");
    expect(brief.tone).toBe("good");
    expect(brief.reasons).toContain("Cashflow ist im Basisszenario positiv.");
    expect(brief.reasons).toContain("DSCR liegt ueber 1,10 und deckt den Kapitaldienst.");
    expect(brief.nextActions).toContain("Unterlagen pruefen und Annahmen im Bank-/WEG-/Mietcheck bestaetigen.");
  });

  it("builds a practical acquisition strategy from target group, microlocation and pricing", () => {
    const brief = dealStrategyBrief({
      id: 12,
      title: "Strong commuter location, weak economics",
      pipeline_stage: "New",
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
        stressed_monthly_cashflow_before_tax: -849,
        stressed_dscr: 0.55,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        residual_debt_factor_rating: "red"
      },
      listing: { id: 12, title: "Listing", purchase_price: 520000 },
      location: {
        micro_location_score: 82,
        transit_access_score: 92,
        daily_needs_score: 88,
        short_term_rental_score: 70,
        nuisance_resilience_score: 52,
        evidence_inputs: { short_term_rental_legal_status: "restricted" },
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      },
      region_outlook: {
        total_score: 78,
        category_scores: {},
        thesis: "Promising.",
        positive_factors: [],
        caution_factors: [],
        key_metrics: [],
        data_quality_notes: [],
        next_recommended_action: "Validate.",
        micro_location_factors: [],
        target_group_profiles: [
          {
            name: "short_term_guest",
            label: "Kurzzeitgaeste",
            score: 74,
            verdict: "Passend mit Pruefung",
            reasons: ["Airbnb-Auslastung und Tourismusanker koennen Zusatz-Upside liefern."],
            risks: ["Airbnb nur als optionalen Bonus rechnen."],
            next_check: "Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen."
          },
          {
            name: "commuter",
            label: "Pendler",
            score: 86,
            verdict: "Sehr passend",
            reasons: ["Bahnhof/U-Bahn/S-Bahn und Taktung stuetzen Pendlernachfrage."],
            risks: [],
            next_check: "Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen."
          }
        ]
      }
    });

    expect(brief.headline).toBe("Pendler-Lage, aber nur mit hartem Preisanker");
    expect(brief.tone).toBe("risk");
    expect(brief.targetGroup).toBe("Pendler");
    expect(brief.basePlan).toBe("Basisthese: langfristige Vermietung an Pendler.");
    expect(brief.rentPlan).toBe("Airbnb nur als Upside-Notiz, nicht als Basisrechnung.");
    expect(brief.offerRule).toContain("maximal");
    expect(brief.offerRule).toContain("295.267");
    expect(brief.warnings).toContain("Airbnb nur als optionalen Bonus behandeln; lokale Rechtslage ist eingeschraenkt oder unklar.");
    expect(brief.nextActions).toContain("Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen.");
    expect(brief.nextActions).toContain("Maximalpreis fuer neutralen Cashflow als harte Verhandlungsanker nutzen.");
  });

  it("turns micro-location evidence into a practical location potential compass", () => {
    const rows = microLocationPotentialRows({
      id: 12,
      title: "Strong micro location",
      pipeline_stage: "New",
      listing: {
        id: 12,
        title: "Listing",
        latitude: 52.517208,
        longitude: 13.397834
      },
      location: {
        micro_location_score: 82,
        transit_access_score: 92,
        daily_needs_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 76,
        short_term_rental_score: 70,
        nuisance_resilience_score: 52,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          supermarkets_1000m: 3,
          pharmacies_1000m: 2,
          doctors_1500m: 6,
          schools_1500m: 2,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 120
        },
        evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
      }
    });

    expect(rows.map((row) => row.label)).toEqual([
      "Bahnhof/U-Bahn",
      "Alltag/Nahversorgung",
      "Messe/Jobs",
      "Freizeitanker",
      "Airbnb/Tourismus",
      "Stoerfaktoren",
      "Belegqualitaet"
    ]);
    expect(rows.find((row) => row.key === "transit")).toMatchObject({
      role: "Basishebel",
      signal: expect.stringContaining("280 m"),
      underwritingUse: expect.stringContaining("Basis-Mietthese")
    });
    expect(rows.find((row) => row.key === "daily_needs")).toMatchObject({
      role: "Basishebel",
      signal: "Supermarkt 3 · Apotheke 2 · Arzt 6 · Schule 2",
      underwritingUse: expect.stringContaining("Alltagsmiete")
    });
    expect(rows.find((row) => row.key === "demand_anchor")?.signal).toContain("Messe 1,8 km");
    expect(rows.find((row) => row.key === "leisure")?.signal).toContain("Freizeitanker 1,3 km");
    expect(rows.find((row) => row.key === "short_term")).toMatchObject({
      role: "Zusatzchance",
      signal: expect.stringContaining("76 %"),
      underwritingUse: expect.stringContaining("nicht als Basis-Cashflow")
    });
    expect(rows.find((row) => row.key === "nuisance")).toMatchObject({
      role: "Risiko/Preisabschlag",
      signal: expect.stringContaining("Hauptstrasse 120 m")
    });
    expect(rows.find((row) => row.key === "evidence")).toMatchObject({
      role: "Belegpflicht",
      signal: "86 % · Vertrauen hoch"
    });
  });

  it("separates coordinate readiness from a generic micro-location score", () => {
    const missing = microLocationCoordinateReadinessBrief({
      id: 14,
      title: "Missing coordinates",
      pipeline_stage: "New",
      listing: {
        id: 14,
        title: "Listing",
        latitude: null,
        longitude: null
      },
      location: {
        micro_location_score: 70,
        source: "manual_site_research",
        evidence_confidence: "low",
        evidence_data_completeness_percent: 27
      }
    });

    expect(missing).toMatchObject({
      status: "missing",
      tone: "risk",
      headline: "Koordinaten fehlen - Mikrolage nicht kaufpreisreif",
      priceRule: expect.stringContaining("Keinen Lage-Credit")
    });
    expect(missing.facts).toContainEqual({ label: "Koordinaten", value: "Fehlen", tone: "risk" });

    const ready = microLocationCoordinateReadinessBrief({
      id: 15,
      title: "OSM ready",
      pipeline_stage: "New",
      listing: {
        id: 15,
        title: "Listing",
        latitude: 52.517208,
        longitude: 13.397834
      },
      location: {
        micro_location_score: 84,
        source: "openstreetmap/overpass",
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_inputs: { nearest_rapid_transit_meters: 280 }
      }
    });

    expect(ready).toMatchObject({
      status: "ready",
      tone: "good",
      headline: "Koordinaten bereit - Mikrolage belegbar",
      priceRule: expect.stringContaining("Vergleichsmieten")
    });
    expect(ready.facts).toContainEqual({ label: "Koordinaten", value: "52.517208, 13.397834", tone: "good" });
  });

  it("treats measured transit proximity as a basis lever even when the score is missing", () => {
    const rows = microLocationPotentialRows({
      id: 13,
      title: "Measured transit only",
      pipeline_stage: "New",
      location: {
        evidence_inputs: {
          nearest_rapid_transit_meters: 280
        }
      }
    });

    expect(rows.find((row) => row.key === "transit")).toMatchObject({
      role: "Basishebel",
      signal: "Bahnhof/U-Bahn 280 m"
    });
  });

  it("summarizes object development potential across rent, value, capex and legal blockers", () => {
    const brief = objectDevelopmentPotentialBrief({
      id: 30,
      title: "Value-add unit",
      pipeline_stage: "New",
      listing: {
        id: 30,
        title: "Listing",
        purchase_price: 250000,
        living_area_sqm: 50,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1250,
        expected_initial_capex: 25000,
        condition: "renovierungsbeduerftig",
        energy_class: "E"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "limited_by_reference_rent",
        confidence: "medium"
      },
      geo_context: {
        milieu_protection_area: true,
        data_confidence_percent: 80
      },
      location: {
        micro_location_score: 82,
        transit_access_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        short_term_rental_score: 72,
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          nearest_trade_fair_meters: 2200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_occupancy_percent: 72,
          short_term_rental_legal_status: "allowed"
        }
      }
    });

    expect(brief.headline).toBe("Miet- und Werthebel vorhanden, aber rechtlich pruefen");
    expect(brief.tone).toBe("watch");
    expect(brief.summary).toContain("300");
    expect(brief.summary).toContain("80.000");
    expect(brief.facts.find((fact) => fact.label === "Miethebel")?.value).toContain("300");
    expect(brief.facts.find((fact) => fact.label === "Werthebel")?.value).toContain("80.000");
    expect(brief.facts.find((fact) => fact.label === "Refi-Spielraum")?.value).toContain("60.000");
    expect(brief.facts.find((fact) => fact.label === "Lage/Nutzung")?.value).toContain("Starker");
    expect(brief.levers).toContain("Energie: Klasse E bietet moeglichen Modernisierungshebel, aber nur mit echtem Kosten- und Foerdercheck.");
    expect(brief.levers.some((lever) => lever.includes("Bahnhof/U-Bahn"))).toBe(true);
    expect(brief.blockers).toContain("Milieuschutz: Modernisierung, Umwandlung oder Mietanpassung koennen genehmigungspflichtig oder begrenzt sein.");
    expect(brief.nextActions).toContain("Mietrecht und Vergleichsmiete pruefen: aktuelle Miete, Mietspiegel und Modernisierungsumlage sauber belegen.");
    expect(brief.nextActions).toContain("Sanierungs-Capex mit Angeboten, Energieausweis und Foerderfaehigkeit absichern.");
    expect(brief.scenarios.map((scenario) => scenario.label)).toEqual([
      "Mietanpassung",
      "Sanierung/Energie",
      "WEG/Grundriss",
      "Refi-Potential",
      "Lage/Nutzung"
    ]);
    expect(brief.scenarios.find((scenario) => scenario.key === "rent")?.effect).toContain("300");
    expect(brief.scenarios.find((scenario) => scenario.key === "rent")?.valueImpact).toContain("80.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "capex_energy")?.effect).toContain("25.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "refi")?.valueImpact).toContain("60.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "weg_layout")?.risk).toContain("WEG");
    expect(brief.scenarios.find((scenario) => scenario.key === "location_use")?.effect).toContain("Bahnhof/U-Bahn");
    expect(brief.prioritizedLevers.map((lever) => lever.label).slice(0, 3)).toEqual([
      "Mietanpassung",
      "Refi-Potential",
      "Lage/Nutzung"
    ]);
    expect(brief.prioritizedLevers[0]).toMatchObject({
      rank: 1,
      estimatedValueEur: 80000,
      scoreLabel: "Groesster Werthebel",
      where: "Miete/Nutzungsvertrag",
      nextCheck: "Mietspiegel, Mietvertrag und rechtlich plausible Zielmiete vor Gebot belegen."
    });
    expect(brief.prioritizedLevers[1].where).toBe("Nachher-Wert und Finanzierung");
    expect(brief.prioritizedLevers[2].where).toBe("Mikrolage, Zielgruppe, Nutzung");
    expect(brief.prioritizedLevers[2].reason).toContain("Bahnhof/U-Bahn");
    expect(brief.executionPlan.map((step) => step.phase)).toEqual([
      "Belege sichern",
      "Capex absichern",
      "Bank-Case rechnen"
    ]);
    expect(brief.executionPlan[0]).toMatchObject({
      title: "Miethebel belegbar machen",
      budget: "0 €",
      priceRule: "Noch kein Kaufpreisaufschlag"
    });
    expect(brief.executionPlan[0].proof).toContain("Mietspiegel");
    expect(brief.executionPlan[1].title).toBe("Sanierung/Energie vor Kostenfalle schuetzen");
    expect(brief.executionPlan[1].budget).toContain("25.000");
    expect(brief.executionPlan[1].stopper).toContain("Milieuschutz");
    expect(brief.executionPlan[2].title).toBe("Refi- und Exit-These bankfaehig machen");
    expect(brief.executionPlan[2].proof).toContain("Nachher-Wert");
  });

  it("applies custom object development assumptions to rent uplift, value uplift and refi room", () => {
    const brief = objectDevelopmentPotentialBrief(
      {
        id: 30,
        title: "Value-add unit",
        pipeline_stage: "New",
        listing: {
          id: 30,
          title: "Listing",
          purchase_price: 250000,
          living_area_sqm: 50,
          cold_rent_monthly: 900,
          market_rent_estimate_monthly: 1250,
          expected_initial_capex: 25000,
          condition: "renovierungsbeduerftig",
          energy_class: "E"
        },
        rent_law: {
          legally_plausible_target_rent_per_sqm: 24,
          status: "limited_by_reference_rent",
          confidence: "medium"
        }
      },
      {
        targetRentMonthly: 1400,
        capex: 45000,
        refiLtvPercent: 65,
        valueYieldPercent: 5
      }
    );

    expect(brief.facts.find((fact) => fact.label === "Miethebel")?.value).toContain("500");
    expect(brief.facts.find((fact) => fact.label === "Werthebel")?.value).toContain("120.000");
    expect(brief.facts.find((fact) => fact.label === "Werthebel")?.value).toContain("5 %");
    expect(brief.facts.find((fact) => fact.label === "Sanierungsbudget")?.value).toContain("45.000");
    expect(brief.facts.find((fact) => fact.label === "Refi-Spielraum")?.value).toContain("78.000");
    expect(brief.facts.find((fact) => fact.label === "Refi-Spielraum")?.value).toContain("65 % LTV");
    expect(brief.scenarios.find((scenario) => scenario.key === "rent")?.effect).toContain("500");
    expect(brief.scenarios.find((scenario) => scenario.key === "rent")?.valueImpact).toContain("120.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "capex_energy")?.effect).toContain("45.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "refi")?.effect).toContain("78.000");
    expect(brief.scenarios.find((scenario) => scenario.key === "refi")?.effect).toContain("65 % LTV");
  });

  it("shows the net development value after capex instead of only the gross value uplift", () => {
    const brief = objectDevelopmentPotentialBrief(
      {
        id: 41,
        title: "Gross upside with capex",
        pipeline_stage: "Underwriting",
        listing: {
          id: 41,
          title: "Listing",
          purchase_price: 260000,
          living_area_sqm: 50,
          cold_rent_monthly: 900,
          market_rent_estimate_monthly: 1250,
          expected_initial_capex: 45000,
          condition: "renovierungsbeduerftig",
          energy_class: "E"
        },
        rent_law: {
          legally_plausible_target_rent_per_sqm: 24,
          status: "plausible",
          confidence: "high"
        }
      },
      {
        targetRentMonthly: 1400,
        capex: 45000,
        valueYieldPercent: 5
      }
    );

    expect(brief.summary).toContain("75.000");
    expect(brief.summary).toContain("nach Capex");
    expect(brief.facts.find((fact) => fact.label === "Netto-Werthebel")).toMatchObject({
      value: expect.stringContaining("75.000"),
      tone: "good"
    });
    expect(brief.facts.find((fact) => fact.label === "Netto-Werthebel")?.value).toContain("nach Capex");
  });

  it("connects object development levers to proof gates before pricing upside", () => {
    const brief = objectDevelopmentPotentialBrief({
      id: 32,
      title: "Proof gated value-add",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 23.5,
      listing: {
        id: 32,
        title: "Listing",
        purchase_price: 250000,
        living_area_sqm: 50,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1250,
        expected_initial_capex: 25000,
        condition: "renovierungsbeduerftig",
        energy_class: "E"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "plausible",
        confidence: "high"
      },
      latest_underwriting: {
        dscr: 1.22,
        loan_amount: 180000
      },
      latest_renovation_case: {
        id: 9,
        inputs: {
          planned_capex: 25000,
          target_cold_rent_monthly: 1200,
          valuation_yield_percent: 4.5,
          refinance_ltv_percent: 75
        },
        results: {
          planned_capex: 25000,
          current_cold_rent_monthly: 900,
          target_cold_rent_monthly: 1200,
          annual_rent_uplift: 3600,
          implied_value_uplift_from_rent: 80000,
          post_renovation_value: 330000,
          current_loan_amount: 180000,
          refinanceable_debt_after_renovation: 247500,
          potential_equity_released: 60000,
          net_equity_still_bound_after_refinance: 12000,
          simple_roi_percent: 14.4,
          value_add_multiple: 3.2,
          recommendation: "strong_value_add",
          warnings: []
        }
      },
      weg_health: {
        inputs: {},
        updated_at: "2026-06-21",
        results: {
          total_score: 74,
          category_scores: {},
          flags: [],
          positive_factors: [],
          negative_factors: [],
          data_completeness_percent: 82,
          confidence: "high",
          summary: "WEG pruefbar.",
          documents_to_request: []
        }
      },
      geo_context: {
        data_confidence_percent: 84,
        milieu_protection_area: false,
        redevelopment_area: false,
        monument_protection: false
      },
      location: {
        micro_location_score: 82,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          nearest_trade_fair_meters: 2200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_legal_status: "allowed"
        }
      },
      documents: [
        {
          id: 1,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "energy_certificate",
          file_name: "Energieausweis.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 3,
          document_type: "weg_minutes",
          file_name: "WEG-Protokolle.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.proofGates.map((gate) => gate.label)).toEqual([
      "Mietanpassung",
      "Sanierung/Energie",
      "WEG/Grundriss",
      "Refi-Potential",
      "Lage/Nutzung"
    ]);
    expect(brief.proofGates.find((gate) => gate.key === "rent")).toMatchObject({
      status: "verified",
      statusLabel: "Kaufpreisrelevant",
      priceRule: "Kaufpreisrelevant: konservativ im Preisband und Memo nutzen, aber gedeckelt."
    });
    expect(brief.proofGates.find((gate) => gate.key === "rent")?.provenBy).toContain(
      "Mietvertrag und rechtlich plausible Zielmiete belegt."
    );
    expect(brief.proofGates.find((gate) => gate.key === "capex_energy")).toMatchObject({
      status: "review",
      statusLabel: "Memo-Upside"
    });
    expect(brief.proofGates.find((gate) => gate.key === "capex_energy")?.missingProofs).toContain(
      "Capex-Angebot/Leistungsbeschreibung fehlt."
    );
    expect(brief.proofGates.find((gate) => gate.key === "weg_layout")?.missingProofs).toEqual(
      expect.arrayContaining(["Teilungserklaerung fehlt.", "Grundriss fehlt."])
    );
    expect(brief.proofGates.find((gate) => gate.key === "location_use")).toMatchObject({
      status: "verified",
      statusLabel: "Kaufpreisrelevant"
    });
    expect(brief.valueDecision).toMatchObject({
      headline: expect.stringContaining("belegbarer Entwicklungswert"),
      priceableValueEur: 140000,
      memoOnlyValueEur: 25000,
      blockedValueEur: 0,
      tone: "good"
    });
    expect(brief.developmentCommand).toMatchObject({
      headline: "Entwicklungs-Kompass: Mietanpassung zuerst",
      focusLever: "Mietanpassung",
      objectArea: "Miete/Nutzungsvertrag",
      priceUse: expect.stringContaining("140.000"),
      openIssue: "Capex-Angebot/Leistungsbeschreibung fehlt.",
      nextAction: "Capex-Angebot/Leistungsbeschreibung fehlt.",
      tone: "watch"
    });
    expect(brief.developmentCommand.priceUse).toContain("25.000");
    expect(brief.valueDecision.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Mietanpassung",
          status: "priceable",
          statusLabel: "Kaufpreisrelevant",
          estimatedValueEur: 80000,
          priceableValueEur: 80000
        }),
        expect.objectContaining({
          label: "Sanierung/Energie",
          status: "memo",
          statusLabel: "Memo-Upside",
          estimatedValueEur: 25000,
          memoOnlyValueEur: 25000
        }),
        expect.objectContaining({
          label: "Refi-Potential",
          status: "priceable",
          estimatedValueEur: 60000,
          priceableValueEur: 60000
        })
      ])
    );
    expect(brief.valueDecision.nextAction).toContain("Capex-Angebot/Leistungsbeschreibung fehlt");
  });

  it("keeps rent development as memo-upside until comparison rents and market anchors are proven", () => {
    const brief = objectDevelopmentPotentialBrief({
      id: 40,
      title: "Rent upside without comps",
      pipeline_stage: "Underwriting",
      listing: {
        id: 40,
        title: "Listing",
        purchase_price: 260000,
        living_area_sqm: 52,
        cold_rent_monthly: 850,
        market_rent_estimate_monthly: 1250,
        expected_initial_capex: 0,
        condition: "gepflegt",
        energy_class: "D"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "plausible",
        confidence: "high"
      },
      documents: [
        { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.proofGates.find((gate) => gate.key === "rent")).toMatchObject({
      status: "review",
      statusLabel: "Memo-Upside",
      priceRule: "Memo-Upside: Nicht in den Kaufpreis einrechnen, bis fehlende Belege vorliegen."
    });
    expect(brief.proofGates.find((gate) => gate.key === "rent")?.missingProofs).toContain(
      "Vergleichsmieten oder Marktanker fehlen."
    );
    expect(brief.valueDecision.lanes.find((lane) => lane.key === "rent")).toMatchObject({
      status: "memo",
      statusLabel: "Memo-Upside",
      estimatedValueEur: 106133,
      priceableValueEur: 0,
      memoOnlyValueEur: 106133
    });
    expect(brief.valueDecision.priceableValueEur).toBe(0);
    expect(brief.valueDecision.memoOnlyValueEur).toBe(106133);
    expect(brief.valueDecision.nextAction).toBe("Vergleichsmieten oder Marktanker fehlen.");
    expect(brief.developmentCommand).toMatchObject({
      headline: "Entwicklungs-Kompass: Mietanpassung zuerst",
      focusLever: "Mietanpassung",
      objectArea: "Miete/Nutzungsvertrag",
      openIssue: "Vergleichsmieten oder Marktanker fehlen.",
      nextAction: "Vergleichsmieten oder Marktanker fehlen.",
      tone: "watch"
    });
    expect(brief.developmentCommand.priceUse).toContain("im Kaufpreis");
    expect(brief.developmentCommand.priceUse).toContain("106.133");
  });

  it("maps object development potential into a top-level deal potential card", () => {
    const brief = dealDevelopmentPotentialMapBrief({
      id: 33,
      title: "Top level development potential",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 23.5,
      listing: {
        id: 33,
        title: "Listing",
        purchase_price: 250000,
        living_area_sqm: 50,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1250,
        expected_initial_capex: 25000,
        condition: "renovierungsbeduerftig",
        energy_class: "E"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "plausible",
        confidence: "high"
      },
      latest_underwriting: {
        dscr: 1.22,
        loan_amount: 180000
      },
      latest_renovation_case: {
        id: 33,
        inputs: {
          planned_capex: 25000,
          target_cold_rent_monthly: 1200,
          valuation_yield_percent: 4.5,
          refinance_ltv_percent: 75
        },
        results: {
          planned_capex: 25000,
          current_cold_rent_monthly: 900,
          target_cold_rent_monthly: 1200,
          annual_rent_uplift: 3600,
          implied_value_uplift_from_rent: 80000,
          post_renovation_value: 330000,
          current_loan_amount: 180000,
          refinanceable_debt_after_renovation: 247500,
          potential_equity_released: 60000,
          net_equity_still_bound_after_refinance: 12000,
          simple_roi_percent: 14.4,
          value_add_multiple: 3.2,
          recommendation: "strong_value_add",
          warnings: []
        }
      },
      weg_health: {
        inputs: {},
        updated_at: "2026-06-21",
        results: {
          total_score: 74,
          category_scores: {},
          flags: [],
          positive_factors: [],
          negative_factors: [],
          data_completeness_percent: 82,
          confidence: "high",
          summary: "WEG pruefbar.",
          documents_to_request: []
        }
      },
      geo_context: {
        data_confidence_percent: 84,
        milieu_protection_area: false,
        redevelopment_area: false,
        monument_protection: false
      },
      location: {
        micro_location_score: 82,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          nearest_trade_fair_meters: 2200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_legal_status: "allowed"
        }
      },
      documents: [
        { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "reviewed", risk_notes: null },
        { id: 3, document_type: "weg_minutes", file_name: "WEG-Protokolle.pdf", review_status: "reviewed", risk_notes: null },
        { id: 4, document_type: "declaration_of_division", file_name: "Teilungserklaerung.pdf", review_status: "reviewed", risk_notes: null },
        { id: 5, document_type: "floor_plan", file_name: "Grundriss.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.status).toBe("priceable");
    expect(brief.headline).toBe("Entwicklungspotential: Mietanpassung fuehrt");
    expect(brief.summary).toContain("Mietanpassung");
    expect(brief.summary).toContain("80.000");
    expect(brief.quickTake).toMatchObject({
      headline: "Objekt-Entwicklung: Mietanpassung zuerst",
      statusLabel: "Preisrelevant",
      primaryLever: "Mietanpassung",
      objectArea: "Miete/Nutzungsvertrag"
    });
    expect(brief.quickTake.estimatedValue).toContain("80.000");
    expect(brief.quickTake.priceRule).toContain("140.000");
    expect(brief.quickTake.priceRule).toContain("belegbaren Entwicklungsbonus");
    expect(brief.quickTake.nextAction).toContain("Capex-Angebot/Leistungsbeschreibung fehlt");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Top-Hebel", value: "Mietanpassung" }),
        expect.objectContaining({ label: "Belegstatus", value: "3 kaufpreisrelevant" })
      ])
    );
    expect(brief.facts.find((fact) => fact.label === "Belegbar")?.value).toContain("140.000");
    expect(brief.facts.find((fact) => fact.label === "Memo-Upside")?.value).toContain("25.000");
    expect(brief.lanes.map((lane) => lane.label)).toEqual(["Mietanpassung", "Refi-Potential", "Lage/Nutzung"]);
    expect(brief.lanes[0]).toMatchObject({
      rank: 1,
      where: "Miete/Nutzungsvertrag",
      proofStatus: "Kaufpreisrelevant"
    });
    expect(brief.lanes[0].estimatedValue).toContain("80.000");
    expect(brief.lanes.find((lane) => lane.label === "Refi-Potential")?.where).toBe("Nachher-Wert und Finanzierung");
    expect(brief.lanes.find((lane) => lane.label === "Lage/Nutzung")?.where).toBe("Mikrolage, Zielgruppe, Nutzung");
    expect(brief.stopRules).toContain("Memo-Upside: Nicht in den Kaufpreis einrechnen, bis fehlende Belege vorliegen.");
    expect(brief.nextActions[0]).toContain("Capex-Angebot/Leistungsbeschreibung fehlt");
  });

  it("uses the saved renovation case assumptions in the top-level development map", () => {
    const brief = dealDevelopmentPotentialMapBrief({
      id: 39,
      title: "Saved development case",
      pipeline_stage: "Underwriting",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 23.5,
      listing: {
        id: 39,
        title: "Listing",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1421,
        expected_initial_capex: 3000,
        condition: "teilrenoviert",
        energy_class: "D"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24.5,
        status: "review",
        confidence: "medium"
      },
      latest_underwriting: {
        dscr: 1.22,
        loan_amount: 386250
      },
      latest_renovation_case: {
        id: 39,
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
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      weg_health: {
        inputs: {},
        updated_at: "2026-06-21",
        results: {
          total_score: 74,
          category_scores: {},
          flags: [],
          positive_factors: [],
          negative_factors: [],
          data_completeness_percent: 82,
          confidence: "high",
          summary: "WEG pruefbar.",
          documents_to_request: []
        }
      },
      geo_context: {
        data_confidence_percent: 84,
        milieu_protection_area: false,
        redevelopment_area: false,
        monument_protection: false
      },
      location: {
        micro_location_score: 82,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 86,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_legal_status: "allowed"
        }
      },
      documents: [
        { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "reviewed", risk_notes: null },
        { id: 3, document_type: "weg_minutes", file_name: "WEG-Protokolle.pdf", review_status: "reviewed", risk_notes: null },
        { id: 4, document_type: "declaration_of_division", file_name: "Teilungserklaerung.pdf", review_status: "reviewed", risk_notes: null },
        { id: 5, document_type: "floor_plan", file_name: "Grundriss.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.headline).toBe("Entwicklungspotential: Mietanpassung fuehrt");
    expect(brief.summary).toContain("138.000");
    expect(brief.quickTake).toMatchObject({
      primaryLever: "Mietanpassung",
      objectArea: "Miete/Nutzungsvertrag"
    });
    expect(brief.quickTake.estimatedValue).toContain("138.000");
    expect(brief.facts.find((fact) => fact.label === "Belegbar")?.value).toContain("227.700");
    expect(brief.lanes[0]).toMatchObject({
      label: "Mietanpassung",
      where: "Miete/Nutzungsvertrag"
    });
  });

  it("requires comps and source evidence before development value is released", () => {
    const brief = dealDevelopmentEvidencePackBrief({
      id: 34,
      title: "Development value without comps",
      pipeline_stage: "Underwriting",
      listing: {
        id: 34,
        title: "Listing",
        purchase_price: 260000,
        living_area_sqm: 52,
        cold_rent_monthly: 850,
        market_rent_estimate_monthly: 1250,
        expected_initial_capex: 20000,
        condition: "renovierungsbeduerftig",
        energy_class: "F"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "plausible",
        confidence: "high"
      },
      latest_underwriting: {
        dscr: 1.18,
        loan_amount: 190000
      },
      latest_renovation_case: {
        id: 34,
        inputs: {
          planned_capex: 20000,
          target_cold_rent_monthly: 1250,
          valuation_yield_percent: 4.5,
          refinance_ltv_percent: 75
        },
        results: {
          planned_capex: 20000,
          current_cold_rent_monthly: 850,
          target_cold_rent_monthly: 1250,
          annual_rent_uplift: 4800,
          implied_value_uplift_from_rent: 106667,
          post_renovation_value: 366667,
          current_loan_amount: 190000,
          refinanceable_debt_after_renovation: 275000,
          potential_equity_released: 85000,
          net_equity_still_bound_after_refinance: 9000,
          simple_roi_percent: 24,
          value_add_multiple: 5.33,
          recommendation: "strong_value_add",
          warnings: []
        }
      },
      location: {
        micro_location_score: 82,
        evidence_confidence: "high",
        evidence_data_completeness_percent: 84,
        evidence_inputs: {
          nearest_rapid_transit_meters: 450,
          nearest_trade_fair_meters: 2200,
          nearest_recreation_anchor_meters: 900,
          short_term_rental_legal_status: "allowed"
        }
      },
      documents: [
        { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "reviewed", risk_notes: null }
      ]
    });

    expect(brief.status).toBe("review");
    expect(brief.headline).toBe("Entwicklungswert braucht Belegpaket");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Freigabe", value: "IC-Review" }),
        expect.objectContaining({ label: "Comps", value: "Fehlen" })
      ])
    );
    expect(brief.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "rent_market_comps",
          label: "Miet-/Markt-Comps",
          status: "blocked",
          rule: "Keine Kaufpreisfreigabe ohne Vergleichsmieten und Marktpreisanker."
        }),
        expect.objectContaining({
          key: "capex_refi",
          label: "Capex-/Refi-Beleg",
          status: "review"
        })
      ])
    );
    expect(brief.rows.find((row) => row.key === "rent_market_comps")?.gaps).toContain(
      "Vergleichsmiete oder Marktpreisanker fehlt."
    );
    expect(brief.guardrails).toContain("Entwicklungswert erst einpreisen, wenn Comps, Objektunterlagen und Capex-/Banklogik zusammenpassen.");
    expect(brief.nextActions[0]).toContain("Vergleichsmiete");
  });

  it("scores whether a deal has enough evidence behind the assumptions", () => {
    const brief = dealEvidenceQualityBrief({
      id: 31,
      title: "Evidence mixed deal",
      pipeline_stage: "Underwriting",
      listing: {
        id: 31,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 310000,
        living_area_sqm: 54,
        cold_rent_monthly: 950,
        market_rent_estimate_monthly: 1120,
        house_money_monthly: 260,
        energy_class: "D"
      },
      latest_underwriting: {
        all_in_purchase_price: 338000,
        monthly_cashflow_before_tax: 80,
        dscr: 1.12
      },
      latest_score: {
        total_score: 76,
        category_scores: {},
        explanation: "Solid.",
        positive_factors: [],
        negative_factors: [],
        red_flags: [],
        next_recommended_action: "Proceed."
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 21,
        confidence: "medium",
        status: "limited_by_reference_rent"
      },
      location: {
        micro_location_score: 82,
        evidence_data_completeness_percent: 45,
        evidence_confidence: "low"
      },
      geo_context: {
        ground_value_eur_per_sqm: 1200,
        milieu_protection_area: false,
        data_confidence_percent: 80
      },
      weg_health: {
        updated_at: "2026-06-21T10:00:00Z",
        inputs: {},
        results: {
          total_score: 72,
          category_scores: {},
          flags: [],
          positive_factors: [],
          negative_factors: [],
          data_completeness_percent: 90,
          confidence: "high",
          summary: "WEG looks solid.",
          documents_to_request: []
        }
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "energy_certificate",
          file_name: "Energieausweis.pdf",
          review_status: "not_reviewed",
          risk_notes: "Heizung pruefen"
        },
        {
          id: 3,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.percent).toBe(78);
    expect(brief.headline).toBe("Datenlage solide, aber nicht komitee-reif");
    expect(brief.tone).toBe("watch");
    expect(brief.summary).toContain("5/8 Beleggruppen belastbar");
    expect(brief.rows.find((row) => row.key === "documents")?.statusLabel).toBe("Fehlt");
    expect(brief.rows.find((row) => row.key === "micro_location")?.summary).toContain("45 %");
    expect(brief.verifiedEvidence).toContain("Underwriting ist gerechnet und hat Cashflow/DSCR.");
    expect(brief.openEvidence).toContain("Unterlagen: 7 Pflichtunterlagen fehlen. 1 vorhandene Unterlage noch pruefen.");
    expect(brief.nextActions).toContain("Fehlende Bank- und Due-Diligence-Unterlagen anfordern, bevor Zeit in Notar oder finales Angebot fliesst.");
    expect(brief.nextActions).toContain("Mikrolage-Belege fuer OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren ergaenzen.");
  });

  it("builds a prioritized action plan from economics, evidence and approval gates", () => {
    const plan = dealActionPlanBrief({
      id: 32,
      title: "High demand, blocked deal",
      pipeline_stage: "New",
      listing: {
        id: 32,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1150,
        house_money_monthly: 360,
        energy_class: "C"
      },
      latest_score: {
        total_score: 58,
        category_scores: { location_and_demand: 84 },
        explanation: "Good location but weak debt coverage.",
        positive_factors: ["Strong micro location."],
        negative_factors: ["Base case cashflow is negative."],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject or renegotiate materially before diligence."
      },
      latest_underwriting: {
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -849,
        stressed_dscr: 0.55,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        all_in_purchase_price: 564710.5,
        residual_debt_factor_rating: "red"
      },
      location: {
        micro_location_score: 86,
        evidence_data_completeness_percent: 45,
        evidence_confidence: "low"
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(plan.headline).toBe("Erst Preisanker klaeren, dann Due Diligence");
    expect(plan.tone).toBe("risk");
    expect(plan.primaryAction).toContain("Maximalpreis fuer neutralen Cashflow");
    expect(plan.primaryAction).toContain("295.267");
    expect(plan.stopRule).toBe("Kein finales Angebot und kein Notartermin, solange 0/6 Freigabe-Gates bestanden sind.");
    expect(plan.steps.map((step) => step.label).slice(0, 5)).toEqual([
      "Preisanker",
      "Unterlagen",
      "Mikrolage-Belege",
      "WEG/Objekt",
      "Geo/Baurecht"
    ]);
    expect(plan.steps[0].reason).toContain("Wirtschaftlichkeit blockiert");
    expect(plan.steps[1].detail).toContain("Pflichtunterlagen fehlen");
    expect(plan.steps[2].detail).toContain("OePNV");
    expect(plan.steps.every((step) => step.priority >= 1)).toBe(true);
  });

  it("turns deal risks into a concrete site visit work order", () => {
    const brief = dealSiteVisitBrief({
      id: 9,
      title: "Messestadt apartment",
      pipeline_stage: "Underwriting",
      listing: {
        id: 3,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 900,
        market_rent_estimate_monthly: 1250,
        house_money_monthly: 360,
        expected_initial_capex: 25000,
        condition: "renovierungsbeduerftig",
        energy_class: "E"
      },
      latest_underwriting: {
        dscr: 0.78,
        monthly_cashflow_before_tax: -824,
        max_purchase_price_for_neutral_cashflow: 295266.67
      },
      latest_score: {
        total_score: 58,
        category_scores: {},
        explanation: "Weak economics.",
        positive_factors: [],
        negative_factors: [],
        red_flags: ["negative_cashflow_base_case"],
        next_recommended_action: "Renegotiate."
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 24,
        status: "limited_by_reference_rent",
        confidence: "medium"
      },
      location: {
        micro_location_score: 82,
        transit_access_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        short_term_rental_score: 72,
        nuisance_resilience_score: 48,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 42,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 120
        }
      },
      geo_context: {
        data_confidence_percent: 45,
        milieu_protection_area: true
      },
      documents: [
        { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "not_reviewed", risk_notes: null }
      ]
    });

    expect(brief.headline).toBe("Besichtigungsauftrag: Preis- und Objektfragen vor Ort klaeren");
    expect(brief.facts).toEqual([
      { label: "Kritisch", value: "4 Vor-Ort-Punkte", tone: "risk" },
      { label: "Preisrelevant", value: "4 Punkte", tone: "risk" },
      { label: "Owner", value: "Besichtigung/Asset", tone: "watch" },
      { label: "Freigabe", value: "Kein Preisbonus", tone: "risk" }
    ]);
    expect(brief.sections.map((section) => section.label)).toEqual([
      "Mikrolage vor Ort",
      "Objektzustand & Capex",
      "Miete & Nutzung",
      "Unterlagen & WEG/Geo"
    ]);
    expect(brief.sections[0].checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "Wie laut ist die Hauptstrasse wirklich?",
          proof: "Laerm, Hauptstrasse und Stoerquellen vor Ort pruefen, bevor Lage-Alpha bezahlt wird."
        }),
        expect.objectContaining({
          question: "Traegt Bahnhof/U-Bahn die Vermietungsthese?",
          proof: expect.stringContaining("280 m")
        }),
        expect.objectContaining({
          question: "Ist die Messestadt-/Jobnachfrage vor Ort sichtbar?",
          proof: expect.stringContaining("Messe 1,8 km")
        })
      ])
    );
    expect(brief.sections[1].checks[0]).toMatchObject({
      question: "Welche Arbeiten treiben das Sanierungsbudget?",
      proof: expect.stringContaining("25.000")
    });
    expect(brief.sections[2].checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ question: "Welche Miete ist rechtlich wirklich erreichbar?" }),
        expect.objectContaining({ question: "Ist Airbnb nur Memo-Upside oder rechtlich nutzbar?" })
      ])
    );
    expect(brief.copyPrompt).toContain("Bitte zur Besichtigung vorbereiten");
    expect(brief.stopRule).toContain("Kein Preisbonus");
  });

  it("turns price, documents, microlocation and development into an execution sprint", () => {
    const brief = dealExecutionSprintBrief({
      id: 33,
      title: "High demand, blocked sprint",
      pipeline_stage: "New",
      market_price_per_sqm: 7800,
      local_reference_rent_per_sqm: 17.5,
      listing: {
        id: 33,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1900,
        house_money_monthly: 360,
        energy_class: "C",
        expected_initial_capex: 45000,
        days_on_market: 71,
        price_reduction_count: 1
      },
      latest_score: {
        total_score: 58,
        category_scores: { location_and_demand: 84 },
        explanation: "Good location but weak debt coverage.",
        positive_factors: ["Strong micro location."],
        negative_factors: ["Base case cashflow is negative."],
        red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
        next_recommended_action: "Reject or renegotiate materially before diligence."
      },
      latest_underwriting: {
        price_per_sqm: 8966,
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        stressed_monthly_cashflow_before_tax: -849,
        stressed_dscr: 0.55,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6,
        all_in_purchase_price: 564710.5,
        residual_debt_factor_rating: "red"
      },
      rent_law: {
        legally_plausible_target_rent_per_sqm: 23,
        status: "review",
        confidence: "medium"
      },
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        daily_needs_score: 88,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        short_term_rental_score: 78,
        nuisance_resilience_score: 55,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 42,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 120
        }
      },
      latest_renovation_case: {
        id: 9,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 980,
          target_cold_rent_monthly: 1900,
          annual_rent_uplift: 11040,
          implied_value_uplift_from_rent: 220800,
          post_renovation_value: 653000,
          current_loan_amount: 386250,
          refinanceable_debt_after_renovation: 424450,
          potential_equity_released: 38200,
          net_equity_still_bound_after_refinance: 6800,
          simple_roi_percent: 24.53,
          value_add_multiple: 4.9,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed" },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "not_reviewed" },
        { id: 3, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed" }
      ]
    });

    expect(brief.headline).toBe("Sprint: Preis, Belege und Vor-Ort-Risiken klaeren");
    expect(brief.summary).toContain("6 Arbeitspakete");
    expect(brief.primaryTask).toContain("Maximalpreis fuer neutralen Cashflow");
    expect(brief.primaryTask).toContain("295.267");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Kritisch" }),
        expect.objectContaining({ label: "Unterlagen", value: "7 offen" }),
        expect.objectContaining({ label: "Vor Ort" }),
        expect.objectContaining({ label: "Entwicklung" }),
        expect.objectContaining({ label: "Comps", value: "67.500 €" })
      ])
    );
    expect(brief.tasks.map((task) => task.category)).toEqual([
      "Preis",
      "Unterlagen",
      "Mikrolage",
      "Entwicklung",
      "Comps",
      "Bank/Memo"
    ]);
    expect(brief.tasks[0]).toMatchObject({
      label: "Preisanker setzen",
      priorityLabel: "Vor Gebot",
      owner: "Ankauf"
    });
    expect(brief.tasks[1].proof).toContain("Unterlagenanfrage: 7 offene Due-Diligence-Unterlagen");
    expect(brief.tasks[2]).toMatchObject({
      label: "Koordinaten setzen",
      owner: "Research",
      due: "Heute",
      priorityLabel: "Vor Gebot",
      targetHref: "#deal-micro-location-panel",
      targetLabel: "Mikrolage oeffnen"
    });
    expect(brief.tasks[2].why).toContain("Koordinaten");
    expect(brief.tasks[2].proof).toContain("Adresse in der Karte suchen");
    expect(brief.tasks[2].proof).toContain("Keinen Lage-Credit");
    expect(brief.tasks[3]).toMatchObject({
      label: "Entwicklungspotential belegen",
      targetHref: "#deal-development-potential-map",
      targetLabel: "Entwicklung oeffnen"
    });
    expect(brief.tasks[3].proof).toContain("Miethebel");
    expect(brief.tasks[4].proof).toContain("Vergleichsangebote");
    expect(brief.tasks[5].proof).toContain("Kein finales Angebot und kein Notartermin");
    expect(brief.milestones[0]).toMatchObject({
      key: "pre_bid",
      label: "Vor Gebot",
      count: 5,
      unlock: "Entsperrt Preisindikation",
      tone: "risk"
    });
    expect(brief.milestones[0].taskLabels).toEqual(
      expect.arrayContaining([
        "Preisanker setzen",
        "Unterlagenpaket anfordern",
        "Koordinaten setzen",
        "Vergleichsangebote belegen"
      ])
    );
    expect(brief.milestones.find((milestone) => milestone.key === "pre_release")?.taskLabels).toContain(
      "Entwicklungspotential belegen"
    );
  });

  it("blocks acquisition approval when economics, documents and hard checks are not ready", () => {
    const summary = acquisitionReadinessSummary({
      id: 20,
      title: "Strong location, weak approval",
      pipeline_stage: "New",
      listing: { id: 20, title: "Listing", purchase_price: 520000 },
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
        residual_debt_factor_rating: "red"
      },
      location: {
        micro_location_score: 86,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 55
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        },
        {
          id: 2,
          document_type: "energy_certificate",
          file_name: "Energieausweis.pdf",
          review_status: "not_reviewed",
          risk_notes: "Heizung pruefen"
        },
        {
          id: 3,
          document_type: "rental_contract",
          file_name: "Mietvertrag.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(summary.status).toBe("blocked");
    expect(summary.headline).toBe("Noch nicht ankaufsreif");
    expect(summary.readyCount).toBe(0);
    expect(summary.total).toBe(6);
    expect(summary.gates.map((gate) => gate.label)).toEqual([
      "Wirtschaftlichkeit",
      "Unterlagen",
      "Mikrolage",
      "WEG/Objekt",
      "Geo/Baurecht",
      "Risikomatrix"
    ]);
    expect(summary.gates.find((gate) => gate.key === "economics")?.status).toBe("block");
    expect(summary.gates.find((gate) => gate.key === "documents")?.summary).toContain("7 Pflichtunterlagen fehlen");
    expect(summary.gates.find((gate) => gate.key === "weg")?.summary).toBe("WEG-Check fehlt.");
    expect(summary.gates.find((gate) => gate.key === "geo")?.summary).toBe("Geo-/Baurecht-Kontext fehlt.");
    expect(summary.nextActions).toContain("Maximalpreis fuer neutralen Cashflow als harte Grenze nutzen: 295.267 €.");
    expect(summary.nextActions).toContain("Fehlende Bank- und Due-Diligence-Unterlagen anfordern, bevor Zeit in Notar oder finales Angebot fliesst.");
  });

  it("turns offer, bank and notary readiness into a closing command", () => {
    const brief = dealClosingCommandBrief({
      id: 20,
      title: "Strong location, weak approval",
      pipeline_stage: "New",
      listing: {
        id: 20,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
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
        stressed_monthly_cashflow_before_tax: -849,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6,
        residual_debt_factor_rating: "red"
      },
      location: {
        micro_location_score: 86,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 55
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Closing Command: noch nicht senden");
    expect(brief.primaryAction).toContain("Maximalpreis fuer neutralen Cashflow");
    expect(brief.stopRule).toContain("Kein Angebot, kein Bankversand und keine Notarvorbereitung");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Angebot", value: "Nicht senden" }),
        expect.objectContaining({ label: "Bank", value: "Bankstory blockiert" }),
        expect.objectContaining({ label: "Notar", value: "Gesperrt" }),
        expect.objectContaining({ label: "Freigabe", value: "0/6 Gates" })
      ])
    );
    expect(brief.lanes.map((lane) => lane.label)).toEqual(["Angebot senden", "Bankpaket senden", "Notar vorbereiten"]);
    expect(brief.lanes[0]).toEqual(
      expect.objectContaining({
        status: "blocked",
        statusLabel: "Nicht senden",
        href: "#deal-offer-release-package",
        owner: "Ankauf"
      })
    );
    expect(brief.lanes[1]).toEqual(
      expect.objectContaining({
        status: "blocked",
        statusLabel: "Bankstory blockiert",
        href: `/deals/20/bank`,
        owner: "Finanzierung"
      })
    );
    expect(brief.lanes[2]).toEqual(
      expect.objectContaining({
        status: "blocked",
        statusLabel: "Gesperrt",
        owner: "Notar/Closing"
      })
    );
    expect(brief.lanes[1].blockers).toEqual(
      expect.arrayContaining(["DSCR 0,57 unter 1,10.", "Cashflow -824 € negativ."])
    );
    expect(brief.nextActions).toContain("Maximalpreis fuer neutralen Cashflow als harte Grenze nutzen: 295.267 €.");
  });

  it("builds an investment committee check from approval gates, price band and evidence", () => {
    const brief = dealInvestmentCommitteeBrief({
      id: 20,
      title: "Strong location, weak approval",
      pipeline_stage: "New",
      listing: {
        id: 20,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
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
        evidence_confidence: "low",
        evidence_data_completeness_percent: 55
      },
      latest_renovation_case: {
        id: 7,
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
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [
        {
          id: 1,
          document_type: "expose",
          file_name: "Expose.pdf",
          review_status: "reviewed",
          risk_notes: null
        }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Nicht komitee-reif");
    expect(brief.decisionLabel).toBe("Nicht bieten");
    expect(brief.stopRule).toBe("Kein finales Angebot: 3 Blocker und 3 Review-Punkte sind offen.");
    expect(brief.facts.find((fact) => fact.label === "Freigabe")?.value).toBe("0/6");
    expect(brief.facts.find((fact) => fact.label === "Walk-away")?.value).toContain("295.000");
    expect(brief.blockers.map((item) => item.label)).toContain("Wirtschaftlichkeit");
    expect(brief.blockers.map((item) => item.label)).toContain("Unterlagen");
    expect(brief.reviewItems.map((item) => item.label)).toContain("Mikrolage");
    expect(brief.memoItems).toContain("Angebotsband dokumentieren: Startgebot 265.500 €, Zielpreis 286.000 €, Walk-away 295.000 €.");
    expect(brief.memoItems).toContain("Upside nicht einpreisen: 138.000 € rechnerischer Werthebel bleiben Memo-Chance, bis Objekt- und Bankbelege vorliegen.");
    expect(brief.nextQuestions[0]).toContain("Maximalpreis fuer neutralen Cashflow");
  });

  it("turns a deal into a committee memo cockpit with price, location and development discipline", () => {
    const brief = dealMemoCockpitBrief({
      id: 21,
      title: "Messestadt value-add candidate",
      pipeline_stage: "New",
      listing: {
        id: 21,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
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
        id: 7,
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
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed" },
        { id: 2, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed" }
      ]
    });

    expect(brief.headline).toBe("Memo-Cockpit: Nicht bieten");
    expect(brief.oneLineDecision).toContain("Komitee blockiert");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Walk-away", value: "295.000 €" }),
        expect.objectContaining({ label: "Lage-Alpha", value: "Stark / Memo" }),
        expect.objectContaining({ label: "Entwicklung", value: "0 € Preis-Credit" })
      ])
    );
    expect(brief.decisionMemo).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Angebotsband dokumentieren"),
        expect.stringContaining("kein Lageaufschlag im Walk-away"),
        expect.stringContaining("0 € im Walk-away")
      ])
    );
    expect(brief.bankQuestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DSCR"),
        expect.stringContaining("Entwicklungspotential")
      ])
    );
    expect(brief.handoffChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Airbnb"),
        expect.stringContaining("WEG- und Geo-Check")
      ])
    );
  });

  it("builds a deal dossier cockpit for seller, committee, bank and notary handoff", () => {
    const brief = dealDossierCockpitBrief({
      id: 22,
      title: "Blocked dossier candidate",
      pipeline_stage: "New",
      listing: {
        id: 22,
        title: "Listing",
        purchase_price: 520000,
        cold_rent_monthly: 980,
        market_rent_estimate_monthly: 1900,
        expected_initial_capex: 45000
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
        stressed_monthly_cashflow_before_tax: -849,
        stressed_dscr: 0.55,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        maximum_purchase_price_for_target_yield: 301801.6,
        residual_debt_factor_rating: "red"
      },
      location: {
        micro_location_score: 86,
        evidence_confidence: "low",
        evidence_data_completeness_percent: 42
      },
      latest_renovation_case: {
        id: 8,
        inputs: { planned_capex: 45000 },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 980,
          target_cold_rent_monthly: 1900,
          annual_rent_uplift: 11040,
          implied_value_uplift_from_rent: 220800,
          post_renovation_value: 653000,
          current_loan_amount: 386250,
          refinanceable_debt_after_renovation: 424450,
          potential_equity_released: 38200,
          net_equity_still_bound_after_refinance: 6800,
          simple_roi_percent: 24.53,
          value_add_multiple: 4.9,
          kfw_hint: null,
          recommendation: "possible_value_add",
          warnings: []
        }
      },
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed" },
        { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "not_reviewed" },
        { id: 3, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed" }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Dossier blockiert: Preis, Belege und Bankstory schliessen");
    expect(brief.decisionLabel).toBe("Nicht versandfaehig");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Dossier", value: "Nicht versandfaehig", tone: "risk" }),
        expect.objectContaining({ label: "Entwicklungspotential", value: expect.stringContaining("Mietanpassung") }),
        expect.objectContaining({ label: "Bank", value: "Bankstory blockiert", tone: "risk" }),
        expect.objectContaining({ label: "Notar", value: "Gesperrt", tone: "risk" })
      ])
    );
    expect(brief.development).toMatchObject({
      label: "Mietanpassung",
      where: "Miete/Nutzungsvertrag",
      statusLabel: "Nur Memo-Upside"
    });
    expect(brief.development.value).toContain("€");
    expect(brief.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "seller",
          label: "Verkaeuferpaket",
          statusLabel: "Nur Preisindikation",
          owner: "Ankauf"
        }),
        expect.objectContaining({
          key: "committee",
          label: "Komitee-Memo",
          statusLabel: "Nicht komitee-reif",
          owner: "Investment"
        }),
        expect.objectContaining({
          key: "bank",
          label: "Bankpaket",
          statusLabel: "Bankstory blockiert",
          owner: "Finanzierung"
        }),
        expect.objectContaining({
          key: "notary",
          label: "Notarvorbereitung",
          statusLabel: "Gesperrt",
          owner: "Ankauf/Legal"
        })
      ])
    );
    expect(brief.packages.find((item) => item.key === "bank")?.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining("DSCR 0,57"), expect.stringContaining("Cashflow -824 €")])
    );
    expect(brief.copyChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Walk-away bleibt intern"),
        expect.stringContaining("Entwicklungspotential: Mietanpassung in Miete/Nutzungsvertrag"),
        expect.stringContaining("Unterlagenpaket"),
        expect.stringContaining("Notarvorbereitung bleibt gesperrt")
      ])
    );
  });

  it("synthesizes a one-screen acquisition thesis from price, development, evidence and exit", () => {
    const brief = dealAcquisitionThesisBrief({
      id: 51,
      title: "Messestadt thesis candidate",
      pipeline_stage: "New",
      market_price_per_sqm: 7800,
      listing: {
        id: 51,
        title: "Listing",
        city: "Munich",
        postal_code: "81829",
        purchase_price: 520000,
        living_area_sqm: 58,
        cold_rent_monthly: 1325,
        market_rent_estimate_monthly: 1900,
        house_money_monthly: 360,
        energy_class: "C",
        expected_initial_capex: 45000,
        days_on_market: 71,
        price_reduction_count: 1
      },
      latest_underwriting: {
        price_per_sqm: 8966,
        all_in_purchase_price: 564710.5,
        monthly_cashflow_before_tax: -824,
        dscr: 0.57,
        max_purchase_price_for_neutral_cashflow: 295266.67,
        simple_exit_value: 653000,
        simple_equity_multiple: 1.42,
        remaining_loan_after_holding: 386250,
        residual_debt_factor_rating: "red"
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
      rent_law: {
        legally_plausible_target_rent_per_sqm: 23,
        status: "review",
        confidence: "medium"
      },
      location: {
        micro_location_score: 86,
        transit_access_score: 92,
        demand_anchor_score: 84,
        leisure_quality_score: 81,
        short_term_rental_score: 78,
        nuisance_resilience_score: 55,
        evidence_confidence: "medium",
        evidence_data_completeness_percent: 52,
        evidence_inputs: {
          nearest_rapid_transit_meters: 280,
          nearest_trade_fair_meters: 1800,
          nearest_recreation_anchor_meters: 1300,
          short_term_rental_occupancy_percent: 76,
          short_term_rental_legal_status: "restricted",
          main_road_meters: 120
        }
      },
      latest_renovation_case: {
        id: 8,
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
      documents: [
        { id: 1, document_type: "expose", file_name: "Expose.pdf", review_status: "reviewed" },
        { id: 2, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed" }
      ]
    });

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("These interessant, Preis blockiert");
    expect(brief.thesisLabel).toBe("Preis runter, Belege schliessen");
    expect(brief.summary).toContain("67.500 € Markt-Gap");
    expect(brief.summary).toContain("0 € Preis-Credit");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Markt-Gap", value: "67.500 €" }),
        expect.objectContaining({ label: "Preis-Credit", value: "0 €" }),
        expect.objectContaining({ label: "Beleg-Score", value: "53 %" })
      ])
    );
    expect(brief.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Preis",
          statusLabel: "Blockiert",
          rule: "Markt-Gap als harten Preisabschlag verhandeln."
        }),
        expect.objectContaining({
          label: "Entwicklung",
          statusLabel: "Memo-Upside",
          rule: "0 € Preis-Credit, bis Objekt- und Bankbelege tragen."
        }),
        expect.objectContaining({
          label: "Belege",
          statusLabel: "Nachziehen"
        }),
        expect.objectContaining({
          label: "Exit",
          statusLabel: "Abschlag"
        })
      ])
    );
    expect(brief.nextActions).toContain("Kaufpreis mindestens um 67.500 € Richtung Marktanker nachverhandeln.");
    expect(brief.nextActions).toContain("WEG, Geo, Capex und Bank-Case schliessen, bevor Entwicklung als Preisargument zaehlt.");
  });

  it("turns a bank package into a lender-ready credit cockpit", () => {
    const bankPackage: BankPackage = {
      deal_id: 41,
      title: "Weak debt service package",
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
      strengths: ["Location metrics indicate solid demand."],
      risks: ["negative_cashflow_base_case", "dscr_below_threshold"],
      missing_documents: ["energy_certificate", "weg_minutes"],
      sections: [
        {
          title: "Sanierungs-/Refi-Case",
          items: ["Kapital freisetzbar: 38200.0"]
        }
      ],
      disclaimer: "Review required."
    };

    const brief = bankPackageCreditBrief(bankPackage);

    expect(brief.status).toBe("blocked");
    expect(brief.headline).toBe("Bank-Cockpit: Nicht bankfaehig");
    expect(brief.oneLineDecision).toContain("Keine Kreditvorlage");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "DSCR", value: "0,57" }),
        expect.objectContaining({ label: "Cashflow", value: "-824 €" }),
        expect.objectContaining({ label: "Unterlagen", value: "2 fehlen" })
      ])
    );
    expect(brief.covenantChecks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DSCR 0,57 liegt unter 1,10"),
        expect.stringContaining("Cashflow -824 € ist negativ")
      ])
    );
    expect(brief.creditStory).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Entwicklung separat"),
        expect.stringContaining("Sanierungs-/Refi-Case")
      ])
    );
    expect(brief.conditions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("energy certificate"),
        expect.stringContaining("DSCR")
      ])
    );
    expect(brief.lenderRequest.headline).toBe("Bankanfrage vorbereiten");
    expect(brief.lenderRequest.copySubject).toBe("Finanzierungsanfrage: Weak debt service package");
    expect(brief.lenderRequest.copyText).toContain("Darlehenswunsch: 386.250 €");
    expect(brief.lenderRequest.copyText).toContain("Eigenmittel: 178.461 €");
    expect(brief.lenderRequest.copyText).toContain("DSCR 0,57");
    expect(brief.lenderRequest.copyText).toContain("Cashflow -824 €");
    expect(brief.lenderRequest.copyText).toContain("energy certificate");
    expect(brief.lenderRequest.copyText).toContain("weg minutes");
    expect(brief.lenderRequest.copyText).toContain("nur als indikative Vorpruefung");
    expect(brief.lenderRequest.nextAction).toContain("Keine verbindliche Kreditfreigabe");
  });

  it("summarizes the full deal queue into a portfolio command brief", () => {
    const deals: Deal[] = [
      {
        id: 31,
        title: "Cashflow broken Munich",
        pipeline_stage: "New",
        listing: { id: 31, title: "Listing", city: "Munich", purchase_price: 520000 },
        latest_score: {
          total_score: 58,
          category_scores: {},
          explanation: "Good location, bad economics.",
          positive_factors: [],
          negative_factors: [],
          red_flags: ["negative_cashflow_base_case", "dscr_below_threshold"],
          next_recommended_action: "Renegotiate hard."
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
        id: 32,
        title: "Ready Leipzig buy",
        pipeline_stage: "Underwriting",
        listing: { id: 32, title: "Listing", city: "Leipzig", purchase_price: 240000 },
        latest_score: {
          total_score: 86,
          category_scores: {},
          explanation: "Healthy.",
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
      },
      {
        id: 33,
        title: "Unpriced Essen lead",
        pipeline_stage: "Screening",
        listing: { id: 33, title: "Listing", city: "Essen", purchase_price: 180000 },
        latest_score: null,
        latest_underwriting: null
      }
    ];

    const brief = portfolioCommandBrief(deals);

    expect(brief.headline).toBe("Portfolio-Leitstand: 1 Kaufkandidat, 1 Preis-/Risiko-Blocker");
    expect(brief.summary).toContain("3 Deals");
    expect(brief.summary).toContain("205.000 € Kapitalbedarf");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Kaufkandidaten", value: "1" }),
        expect.objectContaining({ label: "Preis-/Risiko-Blocker", value: "1" }),
        expect.objectContaining({ label: "Kapitalbedarf", value: "205.000 €" }),
        expect.objectContaining({ label: "Monats-Cashflow", value: "-614 €" })
      ])
    );
    expect(brief.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Bieten vorbereiten", count: 1 }),
        expect.objectContaining({ label: "Hart nachverhandeln", count: 1 }),
        expect.objectContaining({ label: "Erst rechnen", count: 1 })
      ])
    );
    expect(brief.capitalWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining("1 Deal bindet Kapital bei negativem Cashflow")])
    );
    expect(brief.weeklyFocus[0]).toContain("Ready Leipzig buy");
    expect(brief.weeklyFocus[1]).toContain("Cashflow broken Munich");
    expect(brief.weeklyFocus[2]).toContain("Unpriced Essen lead");
  });

  it("turns bought deals into an asset management alarm", () => {
    const brief = assetManagementBrief([
      {
        id: 41,
        title: "Hamburg Bestand mit Stress",
        pipeline_stage: "Bought",
        listing: {
          id: 41,
          title: "Listing",
          city: "Hamburg",
          house_money_monthly: 360,
          expected_initial_capex: 12000
        },
        latest_underwriting: {
          monthly_cashflow_before_tax: -130,
          stressed_monthly_cashflow_before_tax: -180,
          dscr: 0.96,
          stressed_dscr: 0.91,
          remaining_loan_after_holding: 210000
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
        id: 42,
        title: "Leipzig stabiler Bestand",
        pipeline_stage: "Bought",
        listing: {
          id: 42,
          title: "Listing",
          city: "Leipzig",
          house_money_monthly: 210
        },
        latest_underwriting: {
          monthly_cashflow_before_tax: 180,
          stressed_monthly_cashflow_before_tax: 90,
          dscr: 1.24,
          stressed_dscr: 1.12,
          remaining_loan_after_holding: 145000
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
    ]);

    expect(brief.headline).toBe("Bestands-Alarm: 1 Objekt kritisch");
    expect(brief.summary).toContain("2 gekaufte Objekte");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Bestand", value: "2" }),
        expect.objectContaining({ label: "Monats-Cashflow", value: "50 €" }),
        expect.objectContaining({ label: "Stress-Cashflow", value: "-90 €" }),
        expect.objectContaining({ label: "Kritisch", value: "1" })
      ])
    );
    expect(brief.items[0]).toMatchObject({
      title: "Hamburg Bestand mit Stress",
      statusLabel: "Asset-Alarm",
      blocker: "Stress-Cashflow -180 €, DSCR 0,96 und WEG-Score 48.",
      nextAction: "Mieteingang, Hausgeld, Ruecklage und Bank-Covenants pruefen.",
      href: "/deals/41",
      tone: "risk"
    });
    expect(brief.items[1]).toMatchObject({
      title: "Leipzig stabiler Bestand",
      statusLabel: "Stabil",
      tone: "good"
    });
  });

  it("ranks acquisition decision levers by the checks that unlock the most decision value", () => {
    const center = {
      north_star: {
        metric: "wohnungen_pro_100k_eigenkapital",
        current_value: 0,
        explanation: "Keine kaufbaren Deals."
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
          decision_label: "Nachverhandeln",
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
          title: "Leipzig location upside",
          city: "Leipzig",
          pipeline_stage: "New",
          decision: "watch",
          decision_label: "Beobachten",
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
          constraints: ["Mikrolage, WEG und Entwicklungspotential fehlen.", "Score fehlt - Deal erst bewerten."],
          next_action: "Mikrolage-Belege und WEG-Unterlagen schliessen."
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
        years: [],
        planning_warning: "Planungsmodell."
      }
    };

    const brief = acquisitionDecisionLeverageBrief(center);

    expect(brief.headline).toContain("Preis/Finanzierung");
    expect(brief.summary).toContain("4 priorisierte Hebel");
    expect(brief.levers.map((lever) => lever.label)).toEqual([
      "Preis/Finanzierung",
      "Mikrolage/Entwicklung",
      "Daten/Belege",
      "Listing-Zufluss"
    ]);
    expect(brief.levers[0]).toEqual(
      expect.objectContaining({
        value: "1 Deal",
        owner: "Ankauf/Bank",
        href: "/deals/1",
        action: expect.stringContaining("DSCR")
      })
    );
    expect(brief.levers[1].detail).toContain("Mikrolage");
    expect(brief.levers[2].detail).toContain("Score fehlt");
    expect(brief.levers[3]).toEqual(
      expect.objectContaining({
        value: "1 Listing",
        href: "/listings",
        action: "In Deal wandeln und voll unterwriten"
      })
    );
  });

  it("turns the acquisition center into owner-ready weekly work orders", () => {
    const center = {
      north_star: {
        metric: "wohnungen_pro_100k_eigenkapital",
        current_value: 0,
        explanation: "Keine kaufbaren Deals."
      },
      portfolio_capacity: {
        available_equity: 250000,
        deployable_equity_now: 180000,
        remaining_equity_after_selected_deals: 70000,
        bought_units: 4,
        active_pipeline_units: 3,
        selected_units_now: 1,
        average_equity_per_selected_unit: 125000
      },
      selected_deals_now: [
        {
          deal_id: 3,
          title: "Dresden efficient buy",
          city: "Dresden",
          pipeline_stage: "Underwriting",
          decision: "buy",
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
          residual_debt_factor_rating: "green",
          kfw_opportunity: null,
          constraints: [],
          next_action: "Bankpaket, Unterlagen und Angebot vorbereiten."
        }
      ],
      deal_decisions: [
        {
          deal_id: 1,
          title: "Munich cashflow gap",
          city: "Munich",
          pipeline_stage: "Underwriting",
          decision: "negotiate",
          decision_label: "Nachverhandeln",
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
          deal_id: 3,
          title: "Dresden efficient buy",
          city: "Dresden",
          pipeline_stage: "Underwriting",
          decision: "buy",
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
          residual_debt_factor_rating: "green",
          kfw_opportunity: null,
          constraints: [],
          next_action: "Bankpaket, Unterlagen und Angebot vorbereiten."
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
        years: [],
        planning_warning: "Planungsmodell."
      }
    };

    const brief = acquisitionWorkOrderBrief(center);

    expect(brief.headline).toBe("Arbeitsauftraege: 3 konkrete naechste Schritte");
    expect(brief.summary).toContain("Ankauf/Bank");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Kritisch", value: "1" }),
        expect.objectContaining({ label: "Diese Woche", value: "3" }),
        expect.objectContaining({ label: "Owner", value: "Ankauf/Bank" })
      ])
    );
    expect(brief.orders.map((order) => order.title)).toEqual([
      "Munich cashflow gap",
      "Dresden efficient buy",
      "Kiel price cut listing"
    ]);
    expect(brief.orders[0]).toEqual(
      expect.objectContaining({
        label: "Preis/Finanzierung reparieren",
        owner: "Ankauf/Bank",
        blocker: "DSCR unter Zielwert.",
        href: "/deals/1",
        tone: "risk"
      })
    );
    expect(brief.orders[0].proof).toContain("DSCR 0,94");
    expect(brief.orders[0].proof).toContain("Cashflow -310");
    expect(brief.orders[1]).toEqual(
      expect.objectContaining({
        label: "Freigabe bauen",
        owner: "Finanzierung/Ankauf",
        blocker: "Keine harte Buy-Box-Bremse.",
        href: "/deals/3",
        tone: "good"
      })
    );
    expect(brief.orders[2]).toEqual(
      expect.objectContaining({
        label: "Listing in Deal wandeln",
        owner: "Sourcing",
        proof: expect.stringContaining("71 Tage online"),
        href: "/listings",
        tone: "watch"
      })
    );
  });

  it("turns source metadata into a data quality command brief", () => {
    const brief = dataSourcesHealthBrief([
      {
        id: 1,
        name: "BORIS-D Bodenrichtwerte",
        provider: "Gutachterausschuesse",
        data_type: "ground_value",
        license_type: "dl-de/by-2-0",
        commercial_use_allowed: true,
        attribution_required: true,
        geographic_coverage: "Deutschland",
        last_import_at: "2026-06-15T09:00:00",
        source_data_date: "2026-01-01",
        update_frequency: "jaehrlich",
        reliability_score: 85
      },
      {
        id: 2,
        name: "Kleinanzeigen Suchagent",
        provider: "Kleinanzeigen.de",
        data_type: "listings",
        license_type: "eigene Suchagenten-Mails",
        commercial_use_allowed: null,
        attribution_required: false,
        geographic_coverage: "Deutschland",
        last_import_at: null,
        source_data_date: "2024-01-01",
        update_frequency: "taeglich",
        reliability_score: 45
      },
      {
        id: 3,
        name: "Kommunaler Mietspiegel",
        provider: "Stadt",
        data_type: "rent_reference",
        license_type: "oeffentlich",
        commercial_use_allowed: true,
        attribution_required: true,
        geographic_coverage: "nur Staedte mit Mietspiegel",
        last_import_at: "2026-06-01T12:00:00",
        source_data_date: "2023-01-01",
        update_frequency: "alle 2 Jahre",
        reliability_score: 80
      }
    ], new Date("2026-06-21T12:00:00Z"));

    expect(brief.headline).toBe("Quellenregister braucht Aktualisierung");
    expect(brief.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Quellen", value: "3" }),
        expect.objectContaining({ label: "Kritisch", value: "2" }),
        expect.objectContaining({ label: "Lizenz offen", value: "1" }),
        expect.objectContaining({ label: "Ø Verlaesslichkeit", value: "70" })
      ])
    );
    expect(brief.workOrders[0]).toEqual(
      expect.objectContaining({
        sourceName: "Kleinanzeigen Suchagent",
        label: "Import fehlt",
        owner: "Sourcing",
        action: expect.stringContaining("Suchagent")
      })
    );
    expect(brief.workOrders.map((order) => order.label)).toContain("Datenstand alt");
    expect(brief.summary).toContain("2 kritische Quellen");
  });

  it("builds a focused OpenStreetMap search url from a listing address", () => {
    expect(openStreetMapSearchUrl("Unter den Linden 1 10117 Berlin")).toBe(
      "https://www.openstreetmap.org/search?query=Unter%20den%20Linden%201%2010117%20Berlin"
    );
    expect(openStreetMapSearchUrl("")).toBeNull();
  });

  it("parses pasted coordinates and common map links", () => {
    expect(parseCoordinatePaste("52.517208, 13.397834")).toEqual({ latitude: 52.517208, longitude: 13.397834 });
    expect(parseCoordinatePaste("https://www.openstreetmap.org/?mlat=52.517208&mlon=13.397834#map=18/52.517208/13.397834")).toEqual({
      latitude: 52.517208,
      longitude: 13.397834
    });
    expect(parseCoordinatePaste("https://www.google.com/maps/@52.517208,13.397834,17z")).toEqual({
      latitude: 52.517208,
      longitude: 13.397834
    });
    expect(parseCoordinatePaste("not coordinates")).toBeNull();
  });
});
