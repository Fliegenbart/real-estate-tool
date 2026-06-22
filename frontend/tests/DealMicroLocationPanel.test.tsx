import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealMicroLocationPanel } from "../src/components/DealMicroLocationPanel";
import { refreshDealMicroLocationFromAddress } from "../src/lib/api";
import { Deal } from "../src/lib/types";

vi.mock("../src/lib/api", () => ({
  refreshDealMicroLocationFromAddress: vi.fn()
}));

const refreshMock = vi.mocked(refreshDealMicroLocationFromAddress);

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 7,
    title: "Test deal",
    pipeline_stage: "New",
    listing: {
      id: 3,
      title: "Test listing",
      city: "Berlin",
      postal_code: "10117",
      street: "Unter den Linden",
      house_number: "1",
      latitude: 52.517208,
      longitude: 13.397834
    },
    location: {
      source: "manual_site_research",
      micro_location_score: 82,
      transit_access_score: 92,
      daily_needs_score: 88,
      demand_anchor_score: 84,
      leisure_quality_score: 64,
      short_term_rental_score: 70,
      nuisance_resilience_score: 52,
      evidence_confidence: "high",
      evidence_data_completeness_percent: 86,
      evidence_notes: [
        "Transit and daily-needs evidence supports broad tenant demand.",
        "Short-term rental legal status is restricted; optional upside is capped accordingly."
      ],
      evidence_inputs: {
        nearest_rapid_transit_meters: 280,
        supermarkets_1000m: 3,
        pharmacies_1000m: 2,
        doctors_1500m: 6,
        schools_1500m: 2,
        nearest_trade_fair_meters: 1800,
        nearest_event_venue_meters: 900,
        hotels_1500m: 6,
        nearest_recreation_anchor_meters: 1300,
        short_term_rental_occupancy_percent: 76,
        short_term_rental_legal_status: "allowed",
        main_road_meters: 120
      }
    } as Deal["location"],
    region_outlook: {
      total_score: 78,
      category_scores: {},
      thesis: "Promising.",
      positive_factors: [],
      caution_factors: [],
      key_metrics: [],
      data_quality_notes: [],
      next_recommended_action: "Validate.",
      micro_location_factors: [
        {
          name: "transit_access_score",
          value: 92,
          weight: 25,
          interpretation: "strong transit"
        },
        {
          name: "nuisance_resilience_score",
          value: 52,
          weight: 15,
          interpretation: "mixed nuisance"
        }
      ],
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
    },
    ...overrides
  };
}

describe("DealMicroLocationPanel", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  it("refreshes micro location from the object address and reports the saved state", async () => {
    const updatedDeal = deal({ location: { source: "openstreetmap/overpass", micro_location_score: 88 } });
    refreshMock.mockResolvedValueOnce(updatedDeal);
    const onSaved = vi.fn();

    render(<DealMicroLocationPanel deal={deal()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: /Adresse pruefen/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith(7, { allowExternalGeocoding: false }));
    expect(onSaved).toHaveBeenCalledWith(updatedDeal);
    expect(await screen.findByText(/Mikrolage aktualisiert/i)).toBeInTheDocument();
    expect(screen.getByText(/Datenquelle: openstreetmap\/overpass/i)).toBeInTheDocument();
  });

  it("lets the user explicitly allow live geocoding and shows API guidance on failure", async () => {
    refreshMock.mockRejectedValueOnce(new Error("NOMINATIM_USER_AGENT must be set"));

    render(<DealMicroLocationPanel deal={deal({ listing: { ...deal().listing!, latitude: null, longitude: null } })} onSaved={vi.fn()} />);

    expect(screen.getByText(/Koordinaten fehlen - Mikrolage nicht kaufpreisreif/i)).toBeInTheDocument();
    expect(screen.getByText(/Keinen Lage-Credit/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Live-Geocoding erlauben/i }));
    fireEvent.click(screen.getByRole("button", { name: /Adresse pruefen/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith(7, { allowExternalGeocoding: true }));
    expect(await screen.findByText(/NOMINATIM_USER_AGENT must be set/i)).toBeInTheDocument();
  });

  it("submits manually entered coordinates without enabling live geocoding", async () => {
    const updatedDeal = deal({
      listing: { ...deal().listing!, latitude: 52.517208, longitude: 13.397834 },
      location: { source: "openstreetmap/overpass", micro_location_score: 90 }
    });
    refreshMock.mockResolvedValueOnce(updatedDeal);
    const onSaved = vi.fn();

    render(<DealMicroLocationPanel deal={deal({ listing: { ...deal().listing!, latitude: null, longitude: null } })} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/Breitengrad/i), { target: { value: "52.517208" } });
    fireEvent.change(screen.getByLabelText(/Laengengrad/i), { target: { value: "13.397834" } });
    fireEvent.click(screen.getByRole("button", { name: /Koordinaten pruefen/i }));

    await waitFor(() =>
      expect(refreshMock).toHaveBeenCalledWith(7, {
        allowExternalGeocoding: false,
        manualCoordinates: {
          latitude: 52.517208,
          longitude: 13.397834,
          displayName: "Unter den Linden 1 10117 Berlin"
        }
      })
    );
    expect(onSaved).toHaveBeenCalledWith(updatedDeal);
    expect(await screen.findByText(/Mikrolage mit Koordinaten aktualisiert/i)).toBeInTheDocument();
  });

  it("fills coordinates from a pasted map link and offers an address search link", async () => {
    render(<DealMicroLocationPanel deal={deal({ listing: { ...deal().listing!, latitude: null, longitude: null } })} onSaved={vi.fn()} />);

    const searchLink = screen.getByRole("link", { name: /Adresse in Karte suchen/i });
    expect(searchLink).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/search?query=Unter%20den%20Linden%201%2010117%20Berlin"
    );

    fireEvent.change(screen.getByLabelText(/Karten-Link oder Koordinaten/i), {
      target: { value: "https://www.openstreetmap.org/?mlat=52.517208&mlon=13.397834#map=18/52.517208/13.397834" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Uebernehmen/i }));

    expect(screen.getByLabelText(/Breitengrad/i)).toHaveValue("52.517208");
    expect(screen.getByLabelText(/Laengengrad/i)).toHaveValue("13.397834");
  });

  it("shows saved evidence quality and micro-location notes in plain language", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Koordinaten bereit - Mikrolage belegbar/i)).toBeInTheDocument();
    expect(screen.getByText(/Preisregel/i)).toBeInTheDocument();
    expect(screen.getByText(/Datenlage: 86 %/i)).toBeInTheDocument();
    expect(screen.getByText(/Vertrauen: hoch/i)).toBeInTheDocument();
    expect(screen.getByText(/Transit and daily-needs evidence supports broad tenant demand/i)).toBeInTheDocument();
    expect(screen.getByText(/Short-term rental legal status is restricted/i)).toBeInTheDocument();
  });

  it("shows a micro-location decision brief with positives, risks and next checks", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Schnellurteil/i)).toBeInTheDocument();
    expect(screen.getByText(/Starke Mikrolage, aber Stoerfaktoren pruefen/i)).toBeInTheDocument();
    expect(screen.getByText(/Bahnhof\/U-Bahn\/S-Bahn-Naehe ist stark/i)).toBeInTheDocument();
    expect(screen.getByText(/Stoerfaktoren sind auffaellig/i)).toBeInTheDocument();
    expect(screen.getByText(/Naechster Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Laerm- und Strassenlage/i)).toBeInTheDocument();
  });

  it("shows target group fit profiles from the micro-location outlook", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Zielgruppen-Fit/i)).toBeInTheDocument();
    expect(screen.getByText(/^Pendler$/i)).toBeInTheDocument();
    expect(screen.getByText(/Sehr passend/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Bahnhof\/U-Bahn\/S-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kurzzeitgaeste/i)).toBeInTheDocument();
    expect(screen.getByText("Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.")).toBeInTheDocument();
  });

  it("names the concrete micro-location anchor groups in plain language", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Mikrolage-Bausteine/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Messe\/Jobs\/Uni\/Klinik/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Airbnb\/Tourismus/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows concrete stored micro-location evidence values", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    const proof = within(screen.getByLabelText(/Konkrete Lage-Beweise/i));

    expect(proof.getByText(/Bahnhof\/U-Bahn/i)).toBeInTheDocument();
    expect(proof.getByText("280 m")).toBeInTheDocument();
    expect(proof.getByText(/Supermarkt/i)).toBeInTheDocument();
    expect(proof.getByText("3")).toBeInTheDocument();
    expect(proof.getByText(/Apotheke/i)).toBeInTheDocument();
    expect(proof.getByText(/Aerzte/i)).toBeInTheDocument();
    expect(proof.getByText(/Schulen/i)).toBeInTheDocument();
    expect(proof.getAllByText("2").length).toBeGreaterThanOrEqual(2);
    expect(proof.getAllByText("6").length).toBeGreaterThanOrEqual(2);
    expect(proof.getByText(/Messe/i)).toBeInTheDocument();
    expect(proof.getByText("1,8 km")).toBeInTheDocument();
    expect(proof.getByText(/Airbnb-Auslastung/i)).toBeInTheDocument();
    expect(proof.getByText("76 %")).toBeInTheDocument();
  });

  it("shows a practical location potential compass with underwriting use and next proof", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Lage-Potential-Kompass/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Basishebel$/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Alltag\/Nahversorgung/i)).toBeInTheDocument();
    expect(screen.getByText(/Supermarkt 3 · Apotheke 2 · Arzt 6 · Schule 2/i)).toBeInTheDocument();
    expect(screen.getByText(/^Zusatzchance$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Risiko\/Preisabschlag$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Messe 1,8 km/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Freizeitanker 1,3 km/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Hauptstrasse 120 m/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/nicht als Basis-Cashflow/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Laerm, Hauptstrasse und Stoerquellen/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a price-ready micro-location factor checklist", () => {
    render(<DealMicroLocationPanel deal={deal()} onSaved={vi.fn()} />);

    const checklist = within(screen.getByLabelText(/Mikrolage-Faktorcheck/i));

    expect(checklist.getByText(/Mikrolage-Faktorcheck: 2 kaufpreisrelevante Hebel/i)).toBeInTheDocument();
    expect(checklist.getByText("Kaufpreishebel")).toBeInTheDocument();
    expect(checklist.getAllByText("Memo-Upside").length).toBeGreaterThanOrEqual(1);
    expect(checklist.getByText("Preis-Bremsen")).toBeInTheDocument();
    expect(checklist.getAllByText(/Bahnhof\/U-Bahn/i).length).toBeGreaterThanOrEqual(1);
    expect(checklist.getAllByText(/Preisrelevant/i).length).toBeGreaterThanOrEqual(1);
    expect(checklist.getByText("Airbnb-Auslastung")).toBeInTheDocument();
    expect(checklist.getByText(/76 % · Eingeschraenkt/i)).toBeInTheDocument();
    expect(checklist.getByText(/nicht im Basis-Cashflow/i)).toBeInTheDocument();
    expect(checklist.getByText("Stoerfaktoren")).toBeInTheDocument();
    expect(checklist.getByText("Preis-Bremse")).toBeInTheDocument();
    expect(checklist.getByText(/Naechste Belege/i)).toBeInTheDocument();
  });
});
