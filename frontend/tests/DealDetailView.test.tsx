import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealDetailView } from "../src/components/DealDetailView";
import { analyzeRenovationPlan, getDeal, runScore, runUnderwriting, updateDocumentReview } from "../src/lib/api";
import { Deal } from "../src/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("../src/components/DealMicroLocationPanel", () => ({
  DealMicroLocationPanel: () => <div id="deal-micro-location-panel">Mikrolage Panel</div>
}));

vi.mock("../src/components/FinancingPanel", () => ({
  FinancingPanel: () => <div>Finanzierung Panel</div>
}));

vi.mock("../src/components/GeoContextPanel", () => ({
  GeoContextPanel: () => <div>Geo Panel</div>
}));

vi.mock("../src/components/RenovationPlanPanel", () => ({
  RenovationPlanPanel: () => <div>Renovierung Panel</div>
}));

vi.mock("../src/components/RiskMatrixPanel", () => ({
  RiskMatrixPanel: () => <div>Risiko Matrix Panel</div>
}));

vi.mock("../src/components/WegHealthPanel", () => ({
  WegHealthPanel: () => <div>WEG Panel</div>
}));

vi.mock("../src/lib/api", () => ({
  analyzeRenovationPlan: vi.fn(),
  getDeal: vi.fn(),
  runScore: vi.fn(),
  runUnderwriting: vi.fn(),
  updateDocumentReview: vi.fn()
}));

const analyzeRenovationPlanMock = vi.mocked(analyzeRenovationPlan);
const getDealMock = vi.mocked(getDeal);
const updateDocumentReviewMock = vi.mocked(updateDocumentReview);

function decisionDeal(): Deal {
  return {
    id: 9,
    title: "Strong location, weak economics",
    pipeline_stage: "New",
    listing: {
      id: 3,
      title: "Listing",
      city: "Munich",
      postal_code: "81829",
      purchase_price: 520000,
      living_area_sqm: 58,
      cold_rent_monthly: 980,
      market_rent_estimate_monthly: 1150,
      house_money_monthly: 360,
      non_recoverable_costs_monthly: 130,
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
      monthly_cashflow_after_tax_approx: -710,
      is_cashflow_positive_before_tax: false,
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
      ],
      data_quality_notes: [],
      next_recommended_action: "Prioritize location, validate pricing."
    },
    location: {
      micro_location_score: 86,
      transit_access_score: 92,
      daily_needs_score: 88,
      short_term_rental_score: 70,
      nuisance_resilience_score: 52,
      evidence_inputs: { short_term_rental_legal_status: "restricted" },
      evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
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
    ],
    signals: []
  };
}

describe("DealDetailView", () => {
  beforeEach(() => {
    getDealMock.mockReset();
    analyzeRenovationPlanMock.mockReset();
    updateDocumentReviewMock.mockReset();
    vi.mocked(runScore).mockReset();
    vi.mocked(runUnderwriting).mockReset();
  });

  it("shows a real loading state before deal data is available", () => {
    getDealMock.mockReturnValueOnce(new Promise<Deal>(() => undefined));

    render(<DealDetailView dealId="9" />);

    const loadingState = screen.getByRole("status");

    expect(loadingState).toHaveTextContent("Deal wird geladen");
    expect(loadingState).toHaveTextContent(/Noch keine Kauf-, Preis- oder Notarentscheidung ableiten/i);
    expect(screen.queryByText("Lade Deal...")).not.toBeInTheDocument();
  });

  it("shows the central deal decision before the detailed panels", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Deal-Entscheidung/i)).toBeInTheDocument();
    expect(screen.getByText(/Ablehnen oder hart nachverhandeln/i)).toBeInTheDocument();
    expect(screen.getByText(/Die Lage ist stark, aber der aktuelle Preis/i)).toBeInTheDocument();
    expect(screen.getByText(/Preis-Luecke/i)).toBeInTheDocument();
    expect(screen.getAllByText(/224.733/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Preisanker/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Cashflow ist im Basisszenario negativ/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Maximalpreis fuer neutralen Cashflow/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the concrete deal unlock plan after the central decision", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const unlockPlan = within(await screen.findByLabelText(/Deal-Unlock-Plan/i));
    expect(unlockPlan.getByText(/Deal-Unlock: 3 harte Hebel bis kaufbar/i)).toBeInTheDocument();
    expect(unlockPlan.getByText(/Aktuell kein Kaufkandidat/i)).toBeInTheDocument();
    expect(unlockPlan.getByText("Preis/Finanzierung reparieren")).toBeInTheDocument();
    expect(unlockPlan.getByText("Miethebel belegen")).toBeInTheDocument();
    expect(unlockPlan.getByText("Freigabe-Belege schliessen")).toBeInTheDocument();
    expect(unlockPlan.getByText(/Kein bindendes Angebot/i)).toBeInTheDocument();
    expect(unlockPlan.getAllByText(/Preis-/i).length).toBeGreaterThanOrEqual(1);
    expect(unlockPlan.getAllByText(/Unterlagen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a compact deal check path with jump links to the key decision sections", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const checkPath = await screen.findByLabelText(/Deal-Pruefpfad/i);
    expect(within(checkPath).getByText("Pruefpfad")).toBeInTheDocument();
    expect(within(checkPath).getByText(/7 Stationen/i)).toBeInTheDocument();
    expect(within(checkPath).getByRole("link", { name: /Entscheidung/i })).toHaveAttribute("href", "#deal-decision");
    expect(within(checkPath).getByRole("link", { name: /Preis/i })).toHaveAttribute("href", "#deal-offer-band");
    expect(within(checkPath).getByRole("link", { name: /Reparatur/i })).toHaveAttribute("href", "#deal-repair-plan");
    expect(within(checkPath).getByRole("link", { name: /Mikrolage/i })).toHaveAttribute("href", "#deal-location-alpha");
    expect(within(checkPath).getByRole("link", { name: /Entwicklung/i })).toHaveAttribute(
      "href",
      "#deal-development-potential-map"
    );
    expect(within(checkPath).getByRole("link", { name: /Belege/i })).toHaveAttribute("href", "#deal-evidence-board");
    expect(within(checkPath).getByRole("link", { name: /Freigabe/i })).toHaveAttribute("href", "#deal-readiness");
  });

  it("shows live status and short metrics inside the deal check path", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const checkPath = await screen.findByLabelText(/Deal-Pruefpfad/i);
    expect(within(checkPath).getByLabelText("Entscheidung Status")).toHaveTextContent("Blocker");
    expect(within(checkPath).getByLabelText("Entscheidung Kennzahl")).toHaveTextContent("Ablehnen");
    expect(within(checkPath).getByLabelText("Preis Status")).toHaveTextContent("Blocker");
    expect(within(checkPath).getByLabelText("Preis Kennzahl")).toHaveTextContent("Preisblocker");
    expect(within(checkPath).getByLabelText("Reparatur Status")).toHaveTextContent("Blocker");
    expect(within(checkPath).getByLabelText("Reparatur Kennzahl")).toHaveTextContent(/Monat/);
    expect(within(checkPath).getByLabelText("Mikrolage Kennzahl")).toHaveTextContent("Memo");
    expect(within(checkPath).getByLabelText("Belege Kennzahl")).toHaveTextContent(/\d+ % Belege/);
    expect(within(checkPath).getByLabelText("Freigabe Kennzahl")).toHaveTextContent(/\d+\/6 Gates/);
  });

  it("shows an acquisition dossier cockpit for seller, committee, bank and notary handoff", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const cockpit = within(await screen.findByLabelText(/Ankaufs-Dossier-Cockpit/i));

    expect(cockpit.getByText("Ankaufs-Dossier-Cockpit")).toBeInTheDocument();
    expect(cockpit.getAllByText("Nicht versandfaehig").length).toBeGreaterThanOrEqual(1);
    expect(cockpit.getByText("Verkaeuferpaket")).toBeInTheDocument();
    expect(cockpit.getByText("Komitee-Memo")).toBeInTheDocument();
    expect(cockpit.getByText("Bankpaket")).toBeInTheDocument();
    expect(cockpit.getByText("Notarvorbereitung")).toBeInTheDocument();
    const development = within(cockpit.getByLabelText(/Dossier-Entwicklungspotential/i));
    expect(development.getByText("Entwicklungspotential")).toBeInTheDocument();
    expect(development.getByText("Mietanpassung")).toBeInTheDocument();
    expect(development.getByText("Miete/Nutzungsvertrag")).toBeInTheDocument();
    expect(development.getByText("Nur Memo-Upside")).toBeInTheDocument();
    expect(cockpit.getByText(/Walk-away bleibt intern/i)).toBeInTheDocument();
    expect(cockpit.getAllByText(/DSCR 0,57/i).length).toBeGreaterThanOrEqual(1);
    expect(cockpit.getAllByText(/Notarvorbereitung bleibt gesperrt/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a closing command for offer, bank and notary release", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const command = within(await screen.findByLabelText(/Closing-Command/i));

    expect(command.getByText("Closing Command")).toBeInTheDocument();
    expect(command.getByText(/Closing Command: noch nicht senden/i)).toBeInTheDocument();
    expect(command.getByText(/Kein Angebot, kein Bankversand und keine Notarvorbereitung/i)).toBeInTheDocument();
    expect(command.getByText("Angebot senden")).toBeInTheDocument();
    expect(command.getByText("Bankpaket senden")).toBeInTheDocument();
    expect(command.getByText("Notar vorbereiten")).toBeInTheDocument();
    expect(command.getAllByText("Nicht senden").length).toBeGreaterThanOrEqual(1);
    expect(command.getAllByText("Bankstory blockiert").length).toBeGreaterThanOrEqual(1);
    expect(command.getAllByText("Gesperrt").length).toBeGreaterThanOrEqual(1);
    expect(command.getByRole("link", { name: /Angebot senden/i })).toHaveAttribute("href", "#deal-offer-release-package");
    expect(command.getByRole("link", { name: /Bankpaket senden/i })).toHaveAttribute("href", "/deals/9/bank");
    expect(command.getAllByText(/Maximalpreis fuer neutralen Cashflow/i).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps deal actions usable and shows an API error when scoring fails", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());
    vi.mocked(runScore).mockRejectedValueOnce(new Error("Scoring API offline"));

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Deal-Entscheidung/i)).toBeInTheDocument();
    const scoringButton = screen.getByRole("button", { name: /Scoring/i });
    fireEvent.click(scoringButton);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Aktion konnte nicht ausgefuehrt werden/i)).toBeInTheDocument();
    expect(within(alert).getByText(/Scoring API offline/i)).toBeInTheDocument();
    await waitFor(() => expect(scoringButton).toBeEnabled());
    expect(screen.getByRole("button", { name: /Underwriting/i })).toBeEnabled();
  });

  it("shows a prioritized action plan before the detailed analysis sections", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Aktionsplan/i)).toBeInTheDocument();
    expect(screen.getByText(/Erst Preisanker klaeren, dann Due Diligence/i)).toBeInTheDocument();
    expect(screen.getByText(/Naechster sinnvoller Schritt/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kein finales Angebot und kein Notartermin/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Preisanker").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Unterlagen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Mikrolage-Belege/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Wirtschaftlichkeit blockiert/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an execution sprint for price, diligence, microlocation and development checks", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.local_reference_rent_per_sqm = 17.5;
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 23,
      status: "review",
      confidence: "medium"
    };
    deal.location = {
      ...deal.location,
      evidence_confidence: "low",
      evidence_data_completeness_percent: 42,
      transit_access_score: 92,
      daily_needs_score: 88,
      demand_anchor_score: 84,
      leisure_quality_score: 81,
      short_term_rental_score: 78,
      nuisance_resilience_score: 55,
      evidence_inputs: {
        nearest_rapid_transit_meters: 280,
        nearest_trade_fair_meters: 1800,
        nearest_recreation_anchor_meters: 1300,
        short_term_rental_occupancy_percent: 76,
        short_term_rental_legal_status: "restricted",
        main_road_meters: 120
      }
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Beleg- und Besichtigungs-Sprint/i)).toBeInTheDocument();
    expect(screen.getByText(/Sprint: Preis, Belege und Vor-Ort-Risiken klaeren/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Preisanker setzen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Unterlagenpaket anfordern/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Koordinaten setzen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Adresse in der Karte suchen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Entwicklungspotential belegen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /Mikrolage oeffnen/i })).toHaveAttribute(
      "href",
      "#deal-micro-location-panel"
    );
    expect(screen.getByRole("link", { name: /Entwicklung oeffnen/i })).toHaveAttribute(
      "href",
      "#deal-development-potential-map"
    );
    expect(screen.getAllByText(/Vergleichsangebote belegen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Freigabe-Story absichern/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Unterlagenanfrage: 7 offene Due-Diligence-Unterlagen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Echte Vergleichsangebote/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a concrete site visit work order for microlocation and object development", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 24,
      status: "limited_by_reference_rent",
      confidence: "medium"
    };
    deal.location = {
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
    };
    deal.geo_context = {
      data_confidence_percent: 45,
      milieu_protection_area: true
    };
    deal.documents = [
      { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
      { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "not_reviewed", risk_notes: null }
    ];
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const workOrder = within(await screen.findByLabelText(/Besichtigungsauftrag/i));
    expect(workOrder.getByText(/Besichtigungsauftrag: Preis- und Objektfragen vor Ort klaeren/i)).toBeInTheDocument();
    expect(workOrder.getByText("Mikrolage vor Ort")).toBeInTheDocument();
    expect(workOrder.getByText("Objektzustand & Capex")).toBeInTheDocument();
    expect(workOrder.getByText("Miete & Nutzung")).toBeInTheDocument();
    expect(workOrder.getByText("Unterlagen & WEG/Geo")).toBeInTheDocument();
    expect(workOrder.getByText("Wie laut ist die Hauptstrasse wirklich?")).toBeInTheDocument();
    expect(workOrder.getByText("Traegt Bahnhof/U-Bahn die Vermietungsthese?")).toBeInTheDocument();
    expect(workOrder.getByText("Welche Arbeiten treiben das Sanierungsbudget?")).toBeInTheDocument();
    expect(workOrder.getByText("Welche Miete ist rechtlich wirklich erreichbar?")).toBeInTheDocument();
    expect(workOrder.getByText(/Bitte zur Besichtigung vorbereiten/i)).toBeInTheDocument();
  });

  it("copies the site visit work order for broker or inspection follow-up", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Besichtigungsauftrag/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Besichtigungsauftrag kopieren/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Bitte zur Besichtigung vorbereiten");
    expect(await screen.findByText("Besichtigungsauftrag kopiert")).toBeInTheDocument();
  });

  it("shows a manual site visit copy warning when clipboard access is blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));
    Object.assign(navigator, { clipboard: { writeText } });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Besichtigungsauftrag/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Besichtigungsauftrag kopieren/i }));

    expect(await screen.findByText("Manuell kopieren")).toBeInTheDocument();
    expect(screen.getByText(/Zwischenablage blockiert/i)).toBeInTheDocument();
  });

  it("shows which tenant target group really carries the micro-location thesis", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const thesis = within(await screen.findByLabelText(/Zielgruppen-These/i));
    expect(thesis.getByText(/Zielgruppen-These: Pendler tragen die Basis/i)).toBeInTheDocument();
    expect(thesis.getByText("Basis-Zielgruppe")).toBeInTheDocument();
    expect(thesis.getAllByText("Pendler").length).toBeGreaterThanOrEqual(1);
    expect(thesis.getAllByText("Memo-Upside").length).toBeGreaterThanOrEqual(1);
    expect(thesis.getAllByText("Kurzzeitgaeste").length).toBeGreaterThanOrEqual(1);
    expect(thesis.getByText(/Airbnb\/Kurzzeitgaeste nur Memo-Upside/i)).toBeInTheDocument();
    expect(thesis.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(thesis.getAllByText(/nicht Basis-Cashflow/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows location price discipline before the offer band", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const discipline = within(await screen.findByLabelText(/Lagepreis-Disziplin/i));
    expect(discipline.getByText(/Lagehebel erhoehen den Walk-away nicht/i)).toBeInTheDocument();
    expect(discipline.getByText("Basis-Walk-away")).toBeInTheDocument();
    expect(discipline.getByText("Lage-Credit")).toBeInTheDocument();
    expect(discipline.getByText("0 €")).toBeInTheDocument();
    expect(discipline.getByText("Geschuetzter Walk-away")).toBeInTheDocument();
    expect(discipline.getByText(/Airbnb\/Kurzzeitgaeste nur Memo-Upside/i)).toBeInTheDocument();
    expect(discipline.getByText(/nicht Walk-away-Preis/i)).toBeInTheDocument();
  });

  it("shows an acquisition strategy that connects target group, pricing and Airbnb limits", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Ankaufsstrategie/i)).toBeInTheDocument();
    expect(screen.getByText(/Pendler-Lage, aber nur mit hartem Preisanker/i)).toBeInTheDocument();
    expect(screen.getByText(/Basisthese: langfristige Vermietung an Pendler/i)).toBeInTheDocument();
    expect(screen.getByText(/Airbnb nur als Upside-Notiz, nicht als Basisrechnung/i)).toBeInTheDocument();
    expect(screen.getByText(/Gebot am Cashflow-Anker ausrichten/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pendlerzeiten zu Innenstadt/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows micro-location alpha with anchors and price discipline", async () => {
    const deal = decisionDeal();
    deal.location = {
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
        supermarkets_1000m: 3,
        pharmacies_1000m: 2,
        nearest_trade_fair_meters: 1800,
        nearest_recreation_anchor_meters: 1300,
        hotels_1500m: 6,
        short_term_rental_occupancy_percent: 76,
        short_term_rental_legal_status: "restricted",
        main_road_meters: 120
      },
      evidence_notes: ["Short-term rental legal status is restricted; optional upside is capped accordingly."]
    };
    deal.listing = {
      ...deal.listing!,
      latitude: 48.131,
      longitude: 11.691
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect((await screen.findAllByText(/Lage-Alpha/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Lage-Alpha stark, aber nur mit Preisdisziplin/i)).toBeInTheDocument();
    expect(screen.getAllByText(/kein Lageaufschlag im Walk-away/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Messe 1,8 km · Freizeit 1,3 km/i)).toBeInTheDocument();
    expect(screen.getAllByText(/76 % · Eingeschraenkt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Hauptstrasse 120 m/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Airbnb\/Tourismus nur als Upside-Memo/i)).toBeInTheDocument();
    expect(screen.getByText(/Lagepreis-Freigabe/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kein Lageaufschlag im Walk-away/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0 EUR")).toBeInTheDocument();
    expect(screen.getAllByText(/Mikrolage darf ins Memo, aber nicht den Walk-away-Preis erhoehen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Lagehebel-Wertbruecke/i)).toBeInTheDocument();
    expect(screen.getByText(/Was darf in die Bewertung/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Basishebel$/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Alltag\/Nahversorgung/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Supermarkt 3 · Apotheke 2/i)).toBeInTheDocument();
    expect(screen.getByText(/^Nachfragehebel$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Wohnqualitaetshebel$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Zusatzchance$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Risiko\/Preisabschlag$/i)).toBeInTheDocument();
    expect(screen.getByText(/Airbnb 76 % · Recht Eingeschraenkt/i)).toBeInTheDocument();
  });

  it("shows market comparison anchors before offer pricing", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.local_reference_rent_per_sqm = 17.5;
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 18.1,
      status: "review",
      confidence: "medium"
    };
    deal.listing = {
      ...deal.listing!,
      days_on_market: 71,
      price_reduction_count: 1,
      price_reduction_total_percent: 3.5
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Marktvergleich/i)).toBeInTheDocument();
    expect(screen.getByText(/Preis ueber Marktanker/i)).toBeInTheDocument();
    expect(screen.getAllByText("Markt-Gap").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("67.500 €").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Kaufpreis").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ist-Miete").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Marktmiet-These").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Echte Vergleichsangebote/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Comparable Evidence")).toBeInTheDocument();
    expect(screen.getByText(/Proxy-Anker, echte Comps fehlen/i)).toBeInTheDocument();
    expect(screen.getByText("Echte Vergleichsobjekte")).toBeInTheDocument();
    expect(screen.getByText(/Proxy-Anker sind keine Abschlussliste/i)).toBeInTheDocument();
  });

  it("shows a one-screen acquisition thesis above the operating plan", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 23,
      status: "review",
      confidence: "medium"
    };
    deal.location = {
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
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Ankaufs-These/i)).toBeInTheDocument();
    expect(screen.getByText(/These interessant, Preis blockiert/i)).toBeInTheDocument();
    expect(screen.getByText(/Preis runter, Belege schliessen/i)).toBeInTheDocument();
    expect(screen.getAllByText("Markt-Gap").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Preis-Credit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/0 € Preis-Credit/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Kaufpreis mindestens um 67.500 €/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a conservative offer band before development assumptions", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    await screen.findByLabelText(/Angebotsband/i);
    expect(screen.getByText(/Nur mit hartem Abschlag bieten/i)).toBeInTheDocument();
    expect(screen.getAllByText("Startgebot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Walk-away").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/224.733|225.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Basis-Walk-away ist der konservativere Wert/i)).toBeInTheDocument();
  });

  it("shows a concrete bid decision with seller line and conditions", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Gebotsentscheidung/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kein bindendes Angebot/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Nur als Nachverhandlungsrahmen/i)).toBeInTheDocument();
    expect(screen.getByText(/Verkaeufer-Satz/i)).toBeInTheDocument();
    expect(screen.getAllByText(/520.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/295.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Kein finales Angebot und kein Notartermin/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Verhandlungsdossier oeffnen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a risk-adjusted bid ceiling before releasing an offer", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Risikojustierter Preisdeckel/i)).toBeInTheDocument();
    expect(screen.getByText(/Risiko-Puffer blockiert bindendes Angebot/i)).toBeInTheDocument();
    expect(screen.getByText("Sicherheitsabschlag")).toBeInTheDocument();
    expect(screen.getAllByText("Risiko-Deckel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kein bindendes Angebot oberhalb/i)).toBeInTheDocument();
    expect(screen.getAllByText("Exit-Liquiditaet").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Annahmen-Audit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Finanzierung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Risiko-Puffer im IC-Memo zeigen/i)).toBeInTheDocument();
  });

  it("shows a bid stack that reconciles asking price, anchors and risk ceiling", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.geo_context = {
      milieu_protection_area: true,
      data_confidence_percent: 62
    };
    deal.location = {
      ...deal.location,
      evidence_data_completeness_percent: 42,
      evidence_confidence: "low"
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Gebots-Stack/i)).toBeInTheDocument();
    expect(screen.getByText(/Gebot nur als Preisanker, nicht bindend/i)).toBeInTheDocument();
    expect(screen.getAllByText("Forderung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Marktwert").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cashflow-Anker").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Entwicklungs-Credit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Risiko-Deckel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/250.500 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Kein sendefaehiges Band/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kein Angebot senden/i)).toBeInTheDocument();
  });

  it("shows a stress-test cockpit before a binding bid is released", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting,
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
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Stress-Test/i)).toBeInTheDocument();
    expect(screen.getByText(/Stress-Test blockiert Angebotsfreigabe/i)).toBeInTheDocument();
    expect(screen.getByText(/Zins \+2 %/i)).toBeInTheDocument();
    expect(screen.getByText(/Miete -10 %/i)).toBeInTheDocument();
    expect(screen.getByText(/Capex \+15 %/i)).toBeInTheDocument();
    expect(screen.getByText(/Exit -10 %/i)).toBeInTheDocument();
    expect(screen.getAllByText(/-310 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/0,88/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kein finales Gebot/i)).toBeInTheDocument();
  });

  it("shows a quantified deal repair plan after stress breaks", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting,
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
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Deal-Reparaturplan/i)).toBeInTheDocument();
    expect(screen.getByText(/Deal reparieren oder nicht bieten/i)).toBeInTheDocument();
    expect(screen.getAllByText(/410 €\/Monat/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/154.500 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kaufpreis senken/i)).toBeInTheDocument();
    expect(screen.getByText(/Miete belegen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Mehr Eigenkapital/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Zins\/Finanzierung verbessern/i)).toBeInTheDocument();
    expect(screen.getByText(/Capex-Reserve sichern/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kein bindendes Angebot/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a negotiation command after the repair plan", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting,
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
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const repairPlan = await screen.findByLabelText(/Deal-Reparaturplan/i);
    const negotiationCommand = await screen.findByLabelText(/Verhandlungsauftrag/i);
    expect(negotiationCommand).toBeInTheDocument();
    expect(screen.getByText(/Verhandlungsauftrag: Reparaturpfad testen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nicht senden/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/410 €\/Monat/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/154.500/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Preis-\/Debt-Hebel/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Mietbeleg/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Finanzierungsstruktur/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/unverbindlich/i).length).toBeGreaterThanOrEqual(1);
    expect(repairPlan.compareDocumentPosition(negotiationCommand)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows LOI conditions after the negotiation command", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting,
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
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const negotiationCommand = await screen.findByLabelText(/Verhandlungsauftrag/i);
    const loiConditions = await screen.findByLabelText(/LOI-Bedingungen/i);
    const bidDecision = await screen.findByLabelText(/Gebotsentscheidung/i);
    expect(loiConditions).toBeInTheDocument();
    expect(screen.getByText(/LOI-Paket: nur unverbindliche Reparatur-Indikation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kein LOI\/keine Reservierung/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/LOI-Status/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Nicht senden/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/154.500/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/410 €\/Monat/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Pflichtbedingungen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Finanzierungsvorbehalt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Keine Notarvorbereitung/i).length).toBeGreaterThanOrEqual(1);
    expect(negotiationCommand.compareDocumentPosition(loiConditions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(loiConditions.compareDocumentPosition(bidDecision)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("copies the LOI broker text from the deal detail page", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/LOI-Bedingungen/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LOI-Text kopieren/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("kein LOI und keine Reservierung");
    expect(copiedText).toContain("Preis-/Debt-Hebel");
    expect(copiedText).toContain("Cashflow-Luecke");
    expect(copiedText).toContain("Capex-Reserve");
    expect(await screen.findByText("LOI-Text kopiert")).toBeInTheDocument();
  });

  it("shows a manual LOI copy warning when clipboard access is blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));
    Object.assign(navigator, { clipboard: { writeText } });
    Object.assign(document, { execCommand: undefined });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/LOI-Bedingungen/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LOI-Text kopieren/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/LOI-Kopieren nicht moeglich/i)).toBeInTheDocument();
  });

  it("shows a top-level development potential map before the action plan", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.local_reference_rent_per_sqm = 23.5;
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 24,
      status: "plausible",
      confidence: "high"
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting,
      dscr: 1.22,
      loan_amount: 180000
    };
    deal.latest_renovation_case = {
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
    };
    deal.weg_health = {
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
    };
    deal.geo_context = {
      data_confidence_percent: 84,
      milieu_protection_area: false,
      redevelopment_area: false,
      monument_protection: false
    };
    deal.location = {
      micro_location_score: 82,
      evidence_confidence: "high",
      evidence_data_completeness_percent: 86,
      evidence_inputs: {
        nearest_rapid_transit_meters: 450,
        nearest_trade_fair_meters: 2200,
        nearest_recreation_anchor_meters: 900,
        short_term_rental_legal_status: "allowed"
      }
    };
    deal.documents = [
      { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
      { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "reviewed", risk_notes: null },
      { id: 3, document_type: "weg_minutes", file_name: "WEG-Protokolle.pdf", review_status: "reviewed", risk_notes: null },
      { id: 4, document_type: "declaration_of_division", file_name: "Teilungserklaerung.pdf", review_status: "reviewed", risk_notes: null },
      { id: 5, document_type: "floor_plan", file_name: "Grundriss.pdf", review_status: "reviewed", risk_notes: null }
    ];
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const potentialMap = await screen.findByLabelText(/Entwicklungspotential-Karte/i);
    const actionPlan = screen.getByLabelText(/Aktionsplan/i);
    const quickTake = within(screen.getByLabelText(/Entwicklungs-Kurzbewertung/i));
    expect(potentialMap).toBeInTheDocument();
    expect(quickTake.getByText(/Objekt-Entwicklung: Mietanpassung zuerst/i)).toBeInTheDocument();
    expect(quickTake.getByText("Was kann besser werden?")).toBeInTheDocument();
    expect(quickTake.getByText(/Miete\/Nutzungsvertrag/i)).toBeInTheDocument();
    expect(quickTake.getByText("Darf das in den Kaufpreis?")).toBeInTheDocument();
    expect(quickTake.getByText(/belegbaren Entwicklungsbonus/i)).toBeInTheDocument();
    expect(quickTake.getByText("Naechster Beleg")).toBeInTheDocument();
    expect(screen.getByText(/Entwicklungspotential: Mietanpassung fuehrt/i)).toBeInTheDocument();
    expect(screen.getByText("Wo steckt das Entwicklungspotential?")).toBeInTheDocument();
    expect(screen.getAllByText("Wo im Objekt?").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Miete/Nutzungsvertrag").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nachher-Wert und Finanzierung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mikrolage, Zielgruppe, Nutzung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Top-Hebel")).toBeInTheDocument();
    expect(screen.getByText("3 kaufpreisrelevant")).toBeInTheDocument();
    expect(screen.getAllByText("Mietanpassung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Refi-Potential").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Lage/Nutzung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Capex-Angebot\/Leistungsbeschreibung fehlt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Belegpaket Entwicklung")).toBeInTheDocument();
    expect(screen.getByText("Miet-/Markt-Comps")).toBeInTheDocument();
    expect(screen.getByText(/Keine Kaufpreisfreigabe ohne Vergleichsmieten und Marktpreisanker/i)).toBeInTheDocument();
    expect(screen.getByText(/Entwicklungswert erst einpreisen/i)).toBeInTheDocument();
    expect(potentialMap.compareDocumentPosition(actionPlan)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows which development potential is priceable, memo-only or blocked", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.local_reference_rent_per_sqm = 23.5;
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 24,
      status: "plausible",
      confidence: "high"
    };
    deal.latest_underwriting = {
      ...deal.latest_underwriting!,
      dscr: 0.78
    };
    deal.location = {
      micro_location_score: 82,
      evidence_confidence: "medium",
      evidence_data_completeness_percent: 52,
      evidence_inputs: {
        nearest_rapid_transit_meters: 450,
        nearest_trade_fair_meters: 2200,
        nearest_recreation_anchor_meters: 900,
        short_term_rental_legal_status: "restricted"
      }
    };
    deal.documents = [
      { id: 1, document_type: "rental_contract", file_name: "Mietvertrag.pdf", review_status: "reviewed", risk_notes: null },
      { id: 2, document_type: "energy_certificate", file_name: "Energieausweis.pdf", review_status: "not_reviewed", risk_notes: null }
    ];
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const priceRelevance = within(await screen.findByLabelText(/Kaufpreisrelevanz Entwicklung/i));
    expect(priceRelevance.getByText("Einpreisbar heute")).toBeInTheDocument();
    expect(priceRelevance.getByText(/konservativ gedeckelt/i)).toBeInTheDocument();
    expect(priceRelevance.getByText("Nur Memo-Upside")).toBeInTheDocument();
    expect(priceRelevance.getByText(/nicht in den Kaufpreis/i)).toBeInTheDocument();
    expect(priceRelevance.getByText("Blockiert")).toBeInTheDocument();
    expect(priceRelevance.getByText(/erst Daten, Unterlagen oder Genehmigungen/i)).toBeInTheDocument();
  });

  it("shows a copy-ready offer release package with internal guardrails", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const offerRelease = within(await screen.findByLabelText(/Angebotsfreigabe-Paket/i));
    expect(offerRelease.getByText(/Angebot gesperrt - nur Nachverhandlungsrahmen/i)).toBeInTheDocument();
    expect(offerRelease.getAllByText(/Nicht senden/i).length).toBeGreaterThanOrEqual(1);
    expect(offerRelease.getByText(/Externer Satz/i)).toBeInTheDocument();
    expect(offerRelease.getByText(/Interne Leitplanken/i)).toBeInTheDocument();
    expect(offerRelease.getAllByText(/Walk-away 295.000 € bleibt intern/i).length).toBeGreaterThanOrEqual(1);
    expect(offerRelease.getAllByText(/Nur unverbindliche Preisindikation/i).length).toBeGreaterThanOrEqual(1);
    expect(offerRelease.getByText(/Vorbehaltlich vollstaendiger Due-Diligence-Unterlagen/i)).toBeInTheDocument();
  });

  it("shows broker-facing price communication without internal upside arguments", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const brokerCommunication = within(await screen.findByLabelText(/Makler-Preiskommunikation/i));
    expect(brokerCommunication.getByText(/Maklertext ohne interne Upside-Argumente/i)).toBeInTheDocument();
    expect(brokerCommunication.getByText("Externer Satz")).toBeInTheDocument();
    expect(brokerCommunication.getAllByText(/unverbindliche Preisindikation/i).length).toBeGreaterThanOrEqual(1);
    expect(brokerCommunication.getByText("Kopierbarer Maklertext")).toBeInTheDocument();
    expect(brokerCommunication.getByRole("button", { name: /Maklertext kopieren/i })).toBeInTheDocument();
    expect(brokerCommunication.getByText("Interne Sperren")).toBeInTheDocument();
    expect(brokerCommunication.getByText(/Airbnb\/Kurzzeitgaeste, Lage-Credit und Entwicklungspotential nicht als Preisargument senden/i)).toBeInTheDocument();
  });

  it("shows a bid assumption audit with proof status and next checks", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Annahmen-Audit/i)).toBeInTheDocument();
    expect(screen.getByText(/Annahmen noch nicht angebotsreif/i)).toBeInTheDocument();
    expect(screen.getAllByText("Kaufpreis").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Miete/Mietrecht").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mikrolage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Entwicklung/Capex").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("WEG/Geo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Preisrelevante Annahmen klaeren/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Freizeitangebote\/Freizeitpark/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the decision audit trail for score, underwriting and pipeline moves", async () => {
    const deal = decisionDeal() as Deal & {
      audit_log: Array<{
        id: string;
        event_type: string;
        label: string;
        detail: string;
        metric_label: string;
        metric_value: number | string | null;
        created_at: string;
        tone: "good" | "watch" | "risk" | "empty";
      }>;
    };
    deal.audit_log = [
      {
        id: "pipeline-2",
        event_type: "pipeline",
        label: "Pipeline: Underwriting",
        detail: "Zahlen liegen vor - Underwriting pruefen.",
        metric_label: "Stage",
        metric_value: "Underwriting",
        created_at: "2026-06-22T09:30:00",
        tone: "watch"
      },
      {
        id: "score-1",
        event_type: "score",
        label: "Score gerechnet: 58",
        detail: "Reject or renegotiate materially before diligence.",
        metric_label: "Score",
        metric_value: 58,
        created_at: "2026-06-22T09:20:00",
        tone: "risk"
      },
      {
        id: "underwriting-1",
        event_type: "underwriting",
        label: "Underwriting gerechnet",
        detail: "DSCR 0.57",
        metric_label: "Cashflow",
        metric_value: -824,
        created_at: "2026-06-22T09:10:00",
        tone: "risk"
      }
    ];
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const audit = within(await screen.findByLabelText(/Entscheidungs-Audit/i));

    expect(audit.getByText("Entscheidungs-Audit")).toBeInTheDocument();
    expect(audit.getByText(/3 protokollierte Schritte/i)).toBeInTheDocument();
    expect(audit.getByText("Pipeline: Underwriting")).toBeInTheDocument();
    expect(audit.getByText("Score gerechnet: 58")).toBeInTheDocument();
    expect(audit.getByText("Underwriting gerechnet")).toBeInTheDocument();
    expect(audit.getByText(/Zahlen liegen vor/i)).toBeInTheDocument();
    expect(audit.getByText(/Reject or renegotiate/i)).toBeInTheDocument();
    expect(audit.getByText(/Cashflow/i)).toBeInTheDocument();
    expect(audit.getByText(/-824 €/i)).toBeInTheDocument();
  });

  it("shows exit liquidity and buyer pool before a bid", async () => {
    const deal = decisionDeal();
    deal.geo_context = {
      milieu_protection_area: true,
      data_confidence_percent: 62
    };
    deal.location = {
      ...deal.location,
      evidence_data_completeness_percent: 42,
      evidence_confidence: "low",
      evidence_inputs: {
        nearest_rapid_transit_meters: 450,
        nearest_trade_fair_meters: 2200,
        nearest_recreation_anchor_meters: 900,
        short_term_rental_occupancy_percent: 72,
        short_term_rental_legal_status: "restricted"
      }
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByLabelText(/Exit-Liquiditaet/i)).toBeInTheDocument();
    expect(screen.getByText(/Exit-Liquiditaet noch nicht belegreif/i)).toBeInTheDocument();
    expect(screen.getByText("Kaeuferpool")).toBeInTheDocument();
    expect(screen.getAllByText("Exit-Abschlag").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Eigennutzer")).toBeInTheDocument();
    expect(screen.getByText("Kapitalanleger")).toBeInTheDocument();
    expect(screen.getByText("Portfolio-/GmbH-Kaeufer")).toBeInTheDocument();
    expect(screen.getByText("Kurzzeit-/Moebliert-These")).toBeInTheDocument();
    expect(screen.getByText(/Cashflow oder DSCR schwach/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Zielkaeufer, Abschlag und fehlende Belege/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows acquisition approval gates before a deal moves toward offer or notary", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    const approval = await screen.findByLabelText(/Ankaufsfreigabe/i);
    const approvalSection = within(approval);

    expect(approval).toBeInTheDocument();
    expect(approvalSection.getByText(/Noch nicht ankaufsreif/i)).toBeInTheDocument();
    expect(approvalSection.getAllByText(/0\/6 Gates bestanden/i).length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText("Wirtschaftlichkeit").length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText("Unterlagen").length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText(/7 Pflichtunterlagen fehlen/i).length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText("WEG-Check fehlt.").length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText("Geo-/Baurecht-Kontext fehlt.").length).toBeGreaterThanOrEqual(1);
    expect(approvalSection.getAllByText(/Maximalpreis fuer neutralen Cashflow/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an investment committee check before a real bid", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Investment-Komitee/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nicht komitee-reif/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nicht bieten").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Kein finales Angebot/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Wirtschaftlichkeit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Unterlagen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Angebotsband dokumentieren/i)).toBeInTheDocument();
  });

  it("shows development pricing discipline next to the offer band", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 1325,
      market_rent_estimate_monthly: 1900,
      expected_initial_capex: 45000
    };
    deal.latest_renovation_case = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Entwicklungsdisziplin/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Entwicklung nur als Memo-Upside/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/0 € im Walk-away/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/138.000 €/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/WEG- und Geo-Check fehlen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Upside nicht einpreisen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows where the object has development potential", async () => {
    const deal = decisionDeal();
    deal.market_price_per_sqm = 7800;
    deal.local_reference_rent_per_sqm = 23.5;
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 24,
      status: "limited_by_reference_rent",
      confidence: "medium"
    };
    deal.geo_context = {
      milieu_protection_area: true,
      data_confidence_percent: 80
    };
    deal.location = {
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
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Objekt-Entwicklungspotential/i)).toBeInTheDocument();
    expect(screen.getByText(/Miet- und Werthebel vorhanden, aber rechtlich pruefen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Miethebel/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Werthebel/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Refi-Spielraum/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Priorisierte Werthebel")).toBeInTheDocument();
    expect(screen.getByText("Groesster Werthebel")).toBeInTheDocument();
    expect(screen.getAllByText("Wo am Objekt?").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Miete/Nutzungsvertrag").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nachher-Wert und Finanzierung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mikrolage, Zielgruppe, Nutzung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Wertverwertung")).toBeInTheDocument();
    expect(screen.getByText(/belegbarer Entwicklungswert/i)).toBeInTheDocument();
    expect(screen.getAllByText("Belegbar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Blockiert").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Nur Memo-Upside; erst fehlende Belege/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/Entwicklungs-Kompass/i)).toBeInTheDocument();
    expect(screen.getByText(/Entwicklungs-Kompass: Mietanpassung zuerst/i)).toBeInTheDocument();
    expect(screen.getByText("Fokushebel")).toBeInTheDocument();
    expect(screen.getAllByText("Preisfreigabe").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Freigabe-Sperre")).toBeInTheDocument();
    expect(screen.getByText(/Entwicklungs-Szenarien/i)).toBeInTheDocument();
    expect(screen.getAllByText("Mietanpassung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sanierung/Energie").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("WEG/Grundriss").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Refi-Potential").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Lage/Nutzung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rechnerischer Werthebel/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Milieuschutz: Modernisierung/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Mietrecht und Vergleichsmiete pruefen/i)).toBeInTheDocument();
    expect(screen.getByText("Belegcheck Entwicklung")).toBeInTheDocument();
    expect(screen.getAllByText("Memo-Upside").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Nicht in den Kaufpreis einrechnen/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Teilungserklaerung fehlt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Entwicklungsfahrplan")).toBeInTheDocument();
    expect(screen.getByText("Miethebel belegbar machen")).toBeInTheDocument();
    expect(screen.getByText("Sanierung/Energie vor Kostenfalle schuetzen")).toBeInTheDocument();
    expect(screen.getByText("Refi- und Exit-These bankfaehig machen")).toBeInTheDocument();
    expect(screen.getByText(/Noch kein Kaufpreisaufschlag/i)).toBeInTheDocument();
  });

  it("lets the user adjust development potential assumptions in the deal detail page", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 24,
      status: "limited_by_reference_rent",
      confidence: "medium"
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Objekt-Entwicklungspotential/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Ziel-Kaltmiete/i), { target: { value: "1400" } });
    fireEvent.change(screen.getByLabelText(/Sanierungsbudget/i), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText(/Refi-LTV/i), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText(/Bewertungsrendite/i), { target: { value: "5" } });

    expect(screen.getAllByText(/500/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/120.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/45.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/78.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/65 % LTV/i).length).toBeGreaterThanOrEqual(1);
  });

  it("calculates a bank-ready renovation case from the development assumptions", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    const savedPlan = {
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
      kfw_hint: "KfW/BEG Sanierung pruefen.",
      recommendation: "strong_value_add",
      warnings: ["Bank bewertet konservativer als Rechner."]
    } as const;
    getDealMock.mockResolvedValueOnce(deal).mockResolvedValueOnce({
      ...deal,
      latest_renovation_case: {
        id: 87,
        inputs: {
          planned_capex: 45000,
          target_cold_rent_monthly: 1400,
          valuation_yield_percent: 5,
          refinance_ltv_percent: 65
        },
        results: savedPlan
      }
    });
    analyzeRenovationPlanMock.mockResolvedValueOnce(savedPlan);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Objekt-Entwicklungspotential/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Ziel-Kaltmiete/i), { target: { value: "1400" } });
    fireEvent.change(screen.getByLabelText(/Sanierungsbudget/i), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText(/Refi-LTV/i), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText(/Bewertungsrendite/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Bank-Case rechnen/i }));

    expect(analyzeRenovationPlanMock).toHaveBeenCalledWith(9, {
      planned_capex: "45000",
      target_cold_rent_monthly: "1400",
      valuation_yield_percent: "5",
      refinance_ltv_percent: "65",
      target_energy_class: null
    });
    expect(await screen.findByRole("heading", { name: "Backend-Case" })).toBeInTheDocument();
    expect(screen.getByText(/Kapital freisetzbar/i)).toBeInTheDocument();
    expect(screen.getAllByText(/32.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Sanierungs-ROI/i)).toBeInTheDocument();
    expect(screen.getByText(/13,33/i)).toBeInTheDocument();
    expect(screen.getByText(/KfW\/BEG Sanierung pruefen/i)).toBeInTheDocument();
    expect(screen.getByText("Bank bewertet konservativer als Rechner.")).toBeInTheDocument();
  });

  it("reloads the deal after saving a development bank case so saved assumptions become deal truth", async () => {
    const deal = decisionDeal();
    deal.listing = {
      ...deal.listing!,
      cold_rent_monthly: 900,
      market_rent_estimate_monthly: 1250,
      expected_initial_capex: 25000,
      condition: "renovierungsbeduerftig",
      energy_class: "E"
    };
    const refreshedDeal = {
      ...deal,
      latest_renovation_case: {
        id: 88,
        inputs: {
          planned_capex: 45000,
          target_cold_rent_monthly: 1400,
          valuation_yield_percent: 5,
          refinance_ltv_percent: 65
        },
        results: {
          planned_capex: 45000,
          current_cold_rent_monthly: 900,
          target_cold_rent_monthly: 1400,
          annual_rent_uplift: 6000,
          implied_value_uplift_from_rent: 120000,
          post_renovation_value: 370000,
          current_loan_amount: 260000,
          refinanceable_debt_after_renovation: 240500,
          potential_equity_released: 44000,
          net_equity_still_bound_after_refinance: 1000,
          simple_roi_percent: 13.33,
          value_add_multiple: 2.67,
          kfw_hint: null,
          recommendation: "strong_value_add",
          warnings: []
        }
      }
    } satisfies Deal;
    getDealMock.mockResolvedValueOnce(deal).mockResolvedValueOnce(refreshedDeal);
    analyzeRenovationPlanMock.mockResolvedValueOnce(refreshedDeal.latest_renovation_case.results);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Objekt-Entwicklungspotential/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Ziel-Kaltmiete/i), { target: { value: "1400" } });
    fireEvent.change(screen.getByLabelText(/Sanierungsbudget/i), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText(/Refi-LTV/i), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText(/Bewertungsrendite/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Bank-Case rechnen/i }));

    await waitFor(() => expect(getDealMock).toHaveBeenCalledTimes(2));
    expect(getDealMock).toHaveBeenLastCalledWith(9);
    expect(screen.getAllByText(/44.000/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a saved renovation case after loading the deal", async () => {
    const deal = decisionDeal() as Deal & {
      latest_renovation_case: {
        id: number;
        inputs: Record<string, number | string | null>;
        results: NonNullable<Deal["latest_renovation_case"]>["results"];
      };
    };
    deal.latest_renovation_case = {
      id: 41,
      inputs: {
        planned_capex: 45000,
        target_cold_rent_monthly: 1400,
        valuation_yield_percent: 5,
        refinance_ltv_percent: 65
      },
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
        kfw_hint: "KfW/BEG Sanierung pruefen.",
        recommendation: "strong_value_add",
        warnings: ["Bank bewertet konservativer als Rechner."]
      }
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByRole("heading", { name: "Backend-Case" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("1400")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45000")).toBeInTheDocument();
    expect(screen.getAllByText(/32.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bank bewertet konservativer als Rechner.")).toBeInTheDocument();

    const savedDevelopmentCase = screen.getByLabelText(/Gespeicherter Entwicklungsfall/i);
    const saved = within(savedDevelopmentCase);
    expect(saved.getByText(/Case #41 gespeichert/i)).toBeInTheDocument();
    expect(saved.getByText(/Bankpaket, Memo und Preisdisziplin verwenden diesen Entwicklungsfall/i)).toBeInTheDocument();
    expect(saved.getByText(/1.400 € Zielmiete/i)).toBeInTheDocument();
    expect(saved.getByText(/45.000 € Capex/i)).toBeInTheDocument();
    expect(saved.getByRole("link", { name: /Memo pruefen/i })).toHaveAttribute("href", "/memo/9");
    expect(saved.getByRole("link", { name: /Bankpaket pruefen/i })).toHaveAttribute("href", "/deals/9/bank");
  });

  it("shows the evidence quality behind the deal assumptions", async () => {
    const deal = decisionDeal();
    deal.rent_law = {
      legally_plausible_target_rent_per_sqm: 21,
      status: "limited_by_reference_rent",
      confidence: "medium"
    };
    deal.location = {
      ...deal.location!,
      evidence_data_completeness_percent: 45,
      evidence_confidence: "low"
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const evidenceSection = await screen.findByLabelText(/Datenvertrauen/i);
    const evidence = within(evidenceSection);

    expect(evidenceSection).toBeInTheDocument();
    expect(evidence.getByText(/Datenlage noch nicht investment-komitee-reif/i)).toBeInTheDocument();
    expect(evidence.getByText(/Beleglage/i)).toBeInTheDocument();
    expect(evidence.getAllByText(/Unterlagen/i).length).toBeGreaterThanOrEqual(1);
    expect(evidence.getAllByText(/Mikrolage-Belege fuer OePNV/i).length).toBeGreaterThanOrEqual(1);
    expect(evidence.getAllByText(/7 Pflichtunterlagen fehlen/i).length).toBeGreaterThanOrEqual(1);
    expect(evidence.getAllByText(/Geo-\/Baurecht-Kontext fehlt/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a prioritized evidence blocker board before deep diligence details", async () => {
    const deal = decisionDeal();
    deal.location = {
      ...deal.location!,
      evidence_data_completeness_percent: 45,
      evidence_confidence: "low"
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const blockerBoard = await screen.findByLabelText(/Beleg-Blocker-Board/i);
    const board = within(blockerBoard);

    expect(blockerBoard).toBeInTheDocument();
    expect(board.getByText(/Was blockiert den Ankauf/i)).toBeInTheDocument();
    expect(board.getByText(/Datenlage kritisch - erst Belege schliessen/i)).toBeInTheDocument();
    expect(board.getAllByText(/Top-Blocker/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText(/Unterlagen: 7 Pflichtunterlagen fehlen/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getAllByText(/Mikrolage-Belege fuer OePNV/i).length).toBeGreaterThanOrEqual(1);
    expect(board.getByText(/Sofort anfordern/i)).toBeInTheDocument();
    expect(board.getAllByText(/Fehlende Bank- und Due-Diligence-Unterlagen anfordern/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a deal closer queue grouped by acquisition milestone", async () => {
    const deal = decisionDeal();
    deal.location = {
      ...deal.location!,
      evidence_data_completeness_percent: 42,
      evidence_confidence: "low"
    };
    getDealMock.mockResolvedValueOnce(deal);

    render(<DealDetailView dealId="9" />);

    const queue = within(await screen.findByLabelText(/Deal-Closer-Queue/i));

    expect(queue.getByText("Deal-Closer-Queue")).toBeInTheDocument();
    expect(queue.getByText("Vor Gebot")).toBeInTheDocument();
    expect(queue.getByText("Vor Freigabe/LOI")).toBeInTheDocument();
    expect(queue.getByText("Vor Notar")).toBeInTheDocument();
    expect(queue.getByText("Memo/Nachlauf")).toBeInTheDocument();
    expect(queue.getByText(/Entsperrt Preisindikation/i)).toBeInTheDocument();
    expect(queue.getByText(/Preisanker setzen/i)).toBeInTheDocument();
    expect(queue.getByText(/Unterlagenpaket anfordern/i)).toBeInTheDocument();
    expect(queue.getByText(/Ankauf, Makler\/Verwalter/i)).toBeInTheDocument();
  });

  it("shows an actionable load error and retries the deal request", async () => {
    getDealMock
      .mockRejectedValueOnce(new Error("CORS blockiert den Deal-API-Aufruf."))
      .mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText(/Deal konnte nicht geladen werden/i)).toBeInTheDocument();
    expect(screen.getByText(/CORS blockiert den Deal-API-Aufruf/i)).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Kauf-, Preis- oder Notarentscheidung ableiten/i)).toBeInTheDocument();
    expect(screen.queryByText("Lade Deal...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Erneut laden/i }));

    expect(await screen.findByText(/Deal-Entscheidung/i)).toBeInTheDocument();
    expect(getDealMock).toHaveBeenCalledTimes(2);
  });

  it("shows a real due-diligence document cockpit instead of a static checklist", async () => {
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect((await screen.findAllByText(/Due-Diligence-Unterlagen/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3/10 Unterlagen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("30 %")).toBeInTheDocument();
    expect(screen.getByText(/Expose.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/Energieausweis.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/Heizung pruefen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Teilungserklaerung/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Fehlt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Fehlende Bank- und Due-Diligence-Unterlagen anfordern/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Anforderungspaket")).toBeInTheDocument();
    expect(screen.getByText("7 Unterlagen jetzt anfordern")).toBeInTheDocument();
    expect(screen.getAllByText("Verwalter / WEG").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Blockiert finales Angebot/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bitte Teilungserklaerung nachreichen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("copies a complete due-diligence request text for broker and WEG follow-up", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText("Anforderungspaket")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Anforderung kopieren/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("Betreff: Unterlagenanfrage: 7 offene Due-Diligence-Unterlagen");
    expect(copiedText).toContain("Bitte Teilungserklaerung nachreichen");
    expect(copiedText).toContain("Bitte Grundbuchauszug nachreichen");
    expect(copiedText).toContain("jede Preisindikation unverbindlich");
    expect(await screen.findByText("Anforderung kopiert")).toBeInTheDocument();
  });

  it("marks review-only documents as checked from the due-diligence panel", async () => {
    const updatedDeal = decisionDeal();
    updatedDeal.documents = updatedDeal.documents?.map((document) =>
      document.id === 2
        ? {
            ...document,
            review_status: "reviewed",
            risk_notes: "Energieausweis fachlich geprueft; keine Sofortmassnahme."
          }
        : document
    );
    getDealMock.mockResolvedValueOnce(decisionDeal());
    updateDocumentReviewMock.mockResolvedValueOnce(updatedDeal);

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText("Energieausweis.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Energieausweis als geprueft markieren/i }));

    await waitFor(() =>
      expect(updateDocumentReviewMock).toHaveBeenCalledWith(9, 2, { review_status: "reviewed" })
    );
    expect(await screen.findByText("Energieausweis fachlich geprueft; keine Sofortmassnahme.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Energieausweis als geprueft markieren/i })).not.toBeInTheDocument();
  });

  it("falls back to a manual copy command when clipboard permissions are blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { clipboard: { writeText } });
    Object.assign(document, { execCommand });
    getDealMock.mockResolvedValueOnce(decisionDeal());

    render(<DealDetailView dealId="9" />);

    expect(await screen.findByText("Anforderungspaket")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Anforderung kopieren/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Anforderung kopiert")).toBeInTheDocument();
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
  });
});
