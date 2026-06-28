"use client";

import { MapPin, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { refreshDealMicroLocationFromAddress } from "../lib/api";
import {
  microLocationCoordinateReadinessBrief,
  microLocationDecisionBrief,
  microLocationEvidenceRows,
  microLocationFactorRows,
  microLocationPotentialRows,
  microLocationProfileRows,
  microLocationReadinessBrief,
  openStreetMapSearchUrl,
  parseCoordinatePaste,
  scoreTone
} from "../lib/dealMetrics";
import { Deal } from "../lib/types";

export function DealMicroLocationPanel({ deal, onSaved }: { deal: Deal; onSaved: (deal: Deal) => void }) {
  const [allowExternalGeocoding, setAllowExternalGeocoding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | "idle">("idle");
  const [lastSource, setLastSource] = useState<string | null>(sourceFromDeal(deal));
  const [manualLatitude, setManualLatitude] = useState(() => coordinateValue(deal.listing?.latitude));
  const [manualLongitude, setManualLongitude] = useState(() => coordinateValue(deal.listing?.longitude));
  const [coordinatePaste, setCoordinatePaste] = useState("");
  const rows = microLocationFactorRows(deal.region_outlook);
  const profileRows = microLocationProfileRows(deal.region_outlook);
  const listing = deal.listing;
  const hasCoordinates = listing?.latitude !== null && listing?.latitude !== undefined && listing?.longitude !== null && listing?.longitude !== undefined;
  const address = [listing?.street, listing?.house_number, listing?.postal_code, listing?.city].filter(Boolean).join(" ");
  const osmSearchUrl = openStreetMapSearchUrl(address);
  const score = typeof deal.location?.micro_location_score === "number" ? deal.location.micro_location_score : null;
  const evidenceRows = microLocationEvidenceRows(deal.location);
  const evidenceCompleteness =
    typeof deal.location?.evidence_data_completeness_percent === "number"
      ? deal.location.evidence_data_completeness_percent
      : null;
  const evidenceConfidence =
    typeof deal.location?.evidence_confidence === "string" ? deal.location.evidence_confidence : null;
  const evidenceNotes = Array.isArray(deal.location?.evidence_notes)
    ? deal.location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const hasEvidenceSummary = evidenceCompleteness !== null || evidenceConfidence !== null || evidenceNotes.length > 0;
  const decisionBrief = microLocationDecisionBrief(deal);
  const coordinateReadiness = microLocationCoordinateReadinessBrief(deal);
  const potentialRows = microLocationPotentialRows(deal);
  const readinessBrief = microLocationReadinessBrief(deal);

  async function refreshMicroLocation() {
    setBusy(true);
    setMessage(null);
    setMessageTone("idle");
    try {
      const updatedDeal = await refreshDealMicroLocationFromAddress(deal.id, { allowExternalGeocoding });
      setLastSource(sourceFromDeal(updatedDeal));
      setMessage("Mikrolage aktualisiert");
      setMessageTone("success");
      onSaved(updatedDeal);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mikrolage konnte nicht aktualisiert werden");
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function refreshWithManualCoordinates() {
    const latitude = parseCoordinate(manualLatitude);
    const longitude = parseCoordinate(manualLongitude);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setMessage("Bitte gueltige Koordinaten eintragen.");
      setMessageTone("error");
      return;
    }
    setBusy(true);
    setMessage(null);
    setMessageTone("idle");
    try {
      const updatedDeal = await refreshDealMicroLocationFromAddress(deal.id, {
        allowExternalGeocoding: false,
        manualCoordinates: {
          latitude,
          longitude,
          displayName: address || "Manuell gesetzte Koordinaten"
        }
      });
      setLastSource(sourceFromDeal(updatedDeal));
      setMessage("Mikrolage mit Koordinaten aktualisiert");
      setMessageTone("success");
      onSaved(updatedDeal);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mikrolage konnte nicht aktualisiert werden");
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  }

  function applyPastedCoordinates() {
    const parsed = parseCoordinatePaste(coordinatePaste);
    if (!parsed) {
      setMessage("Koordinaten/Karten-Link nicht erkannt.");
      setMessageTone("error");
      return;
    }
    setManualLatitude(String(parsed.latitude));
    setManualLongitude(String(parsed.longitude));
    setMessage("Koordinaten uebernommen");
    setMessageTone("success");
  }

  return (
    <div id="deal-micro-location-panel" className="panel">
      <div className="panel-header">
        <h2>Mikrolage</h2>
        <div className="button-row">
          {score !== null && <span className={`score ${scoreTone(score)}`}>{score}</span>}
          <MapPin size={17} />
        </div>
      </div>

      <div className="micro-location-toolbar">
        <button className="button primary" onClick={refreshMicroLocation} disabled={busy}>
          <RefreshCw size={16} />
          {busy ? "Pruefe..." : "Adresse pruefen"}
        </button>
        <label className="check-control">
          <input
            type="checkbox"
            checked={allowExternalGeocoding}
            onChange={(event) => setAllowExternalGeocoding(event.target.checked)}
          />
          <span>Live-Geocoding erlauben</span>
        </label>
      </div>

      <div className="micro-location-meta">
        <span>Datenquelle: {lastSource || "Fehlt"}</span>
        <span>{hasCoordinates ? `Koordinaten: ${listing?.latitude}, ${listing?.longitude}` : "Koordinaten fehlen"}</span>
        <span>{address || "Adresse fehlt"}</span>
      </div>

      <section className={`coordinate-readiness ${coordinateReadiness.tone}`} aria-label="Koordinaten-Freigabecheck">
        <div className="coordinate-readiness-head">
          <div>
            <span className="section-kicker">Koordinaten-Freigabe</span>
            <h3>{coordinateReadiness.headline}</h3>
            <p>{coordinateReadiness.summary}</p>
          </div>
          <div className="coordinate-readiness-facts">
            {coordinateReadiness.facts.map((fact) => (
              <div className={`coordinate-readiness-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <dl>
          <div>
            <dt>Preisregel</dt>
            <dd>{coordinateReadiness.priceRule}</dd>
          </div>
          <div>
            <dt>Naechster Schritt</dt>
            <dd>{coordinateReadiness.nextAction}</dd>
          </div>
        </dl>
      </section>

      <div className="coordinate-helper">
        {osmSearchUrl && (
          <a className="text-link" href={osmSearchUrl} target="_blank" rel="noreferrer">
            Adresse in Karte suchen
          </a>
        )}
        <div className="coordinate-paste-grid">
          <label className="weg-field">
            <span>Karten-Link oder Koordinaten</span>
            <input
              value={coordinatePaste}
              onChange={(event) => setCoordinatePaste(event.target.value)}
              placeholder="52.517208, 13.397834"
            />
          </label>
          <button className="button" onClick={applyPastedCoordinates} type="button">
            Uebernehmen
          </button>
        </div>
      </div>

      <div className="manual-coordinate-grid">
        <label className="weg-field">
          <span>Breitengrad</span>
          <input
            inputMode="decimal"
            value={manualLatitude}
            onChange={(event) => setManualLatitude(event.target.value)}
            placeholder="z.B. 52.517208"
          />
        </label>
        <label className="weg-field">
          <span>Laengengrad</span>
          <input
            inputMode="decimal"
            value={manualLongitude}
            onChange={(event) => setManualLongitude(event.target.value)}
            placeholder="z.B. 13.397834"
          />
        </label>
        <button className="button" onClick={refreshWithManualCoordinates} disabled={busy}>
          <RefreshCw size={16} />
          Koordinaten pruefen
        </button>
      </div>

      {message && <p className={`micro-location-status ${messageTone}`}>{message}</p>}

      <div className={`micro-location-decision ${decisionBrief.tone}`}>
        <span>Schnellurteil</span>
        <strong>{decisionBrief.headline}</strong>
        {decisionBrief.positives.length > 0 && (
          <div>
            <small>Staerken</small>
            <ul>
              {decisionBrief.positives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {decisionBrief.risks.length > 0 && (
          <div>
            <small>Risiken</small>
            <ul>
              {decisionBrief.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {decisionBrief.nextChecks.length > 0 && (
          <div>
            <small>Naechster Check</small>
            <ul>
              {decisionBrief.nextChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <section className={`micro-location-factor-check ${readinessBrief.tone}`} aria-label="Mikrolage-Faktorcheck">
        <div className="micro-location-factor-head">
          <div>
            <span className="section-kicker">Mikrolage-Faktorcheck</span>
            <h3>{readinessBrief.headline}</h3>
            <p>{readinessBrief.summary}</p>
          </div>
          <div className="micro-location-factor-facts">
            {readinessBrief.facts.map((fact) => (
              <div className={`micro-location-factor-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="micro-location-factor-grid">
          {readinessBrief.rows.map((row) => (
            <article className={`micro-location-factor-card ${row.tone}`} key={row.key}>
              <div className="micro-location-factor-card-head">
                <span>{row.statusLabel}</span>
                <strong>{row.label}</strong>
              </div>
              <p>{row.proof}</p>
              <dl>
                <div>
                  <dt>Entscheidung</dt>
                  <dd>{row.decisionUse}</dd>
                </div>
                <div>
                  <dt>Naechster Beleg</dt>
                  <dd>{row.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="micro-location-factor-actions">
          <span>Naechste Belege</span>
          <ul>
            {readinessBrief.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="micro-location-compass" aria-label="Lage-Potential-Kompass">
        <h3>Lage-Potential-Kompass</h3>
        <div className="micro-location-compass-grid">
          {potentialRows.map((row) => (
            <article className={`micro-location-compass-row ${row.tone}`} key={row.key}>
              <div className="micro-location-compass-head">
                <span>{row.role}</span>
                <strong>{row.label}</strong>
              </div>
              <p>{row.signal}</p>
              <dl>
                <div>
                  <dt>Nutzung</dt>
                  <dd>{row.underwritingUse}</dd>
                </div>
                <div>
                  <dt>Naechster Beleg</dt>
                  <dd>{row.nextCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      {profileRows.length > 0 && (
        <div className="micro-location-profiles">
          <h3>Zielgruppen-Fit</h3>
          <div className="micro-location-profile-list">
            {profileRows.map((profile) => (
              <section className="micro-location-profile-row" key={profile.name}>
                <div className="micro-location-profile-head">
                  <div>
                    <span>{profile.label}</span>
                    <strong>{profile.verdict}</strong>
                  </div>
                  <span className={`score ${profile.tone}`}>{profile.score}</span>
                </div>
                {profile.reasons.length > 0 && (
                  <ul>
                    {profile.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                {profile.risks.length > 0 && (
                  <div className="micro-location-profile-warning">
                    <small>Risiko</small>
                    <ul>
                      {profile.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>{profile.nextCheck}</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {hasEvidenceSummary && (
        <div className="micro-location-evidence">
          <div className="micro-location-evidence-grid">
            {evidenceCompleteness !== null && (
              <span>Datenlage: {evidenceCompleteness} %</span>
            )}
            {evidenceConfidence && (
              <span>Vertrauen: {confidenceLabel(evidenceConfidence)}</span>
            )}
          </div>
          {evidenceNotes.length > 0 && (
            <ul className="micro-location-notes">
              {evidenceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {evidenceRows.length > 0 && (
        <div className="micro-location-proof" aria-label="Konkrete Lage-Beweise">
          <h3>Konkrete Lage-Beweise</h3>
          <div className="micro-location-proof-grid">
            {evidenceRows.map((row) => (
              <div className={`micro-location-proof-row ${row.tone}`} key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="location-list">
        {Object.entries(deal.location || {}).filter(([key]) => key.endsWith("_score")).map(([key, value]) => (
          <div className="pipeline-bar" key={key}>
            <span>{locationMetricLabel(key)}</span>
            <div className="bar-track"><div style={{ width: `${Number(value) || 0}%` }} /></div>
            <strong>{String(value)}</strong>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="micro-location-breakdown">
          <h3>Mikrolage-Bausteine</h3>
          <div className="location-list">
            {rows.map((row) => (
              <div className="pipeline-bar micro-location-row" key={row.name}>
                <span>
                  {row.label}
                  <small>Gewicht {row.weight}%</small>
                </span>
                <div className="bar-track"><div style={{ width: `${row.value}%` }} /></div>
                <strong className={`score ${row.tone}`}>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function coordinateValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function parseCoordinate(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceFromDeal(deal: Deal): string | null {
  const source = deal.location?.source;
  return typeof source === "string" ? source : null;
}

function confidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "hoch",
    medium: "mittel",
    low: "niedrig"
  };
  return labels[value] || value;
}

function locationMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    population_trend_score: "Bevoelkerung",
    urban_environment_quality_score: "Umfeld",
    employer_access_score: "Jobs",
    purchasing_power_score: "Kaufkraft",
    vacancy_risk_score: "Leerstand",
    public_transport_score: "OePNV",
    micro_location_score: "Mikrolage",
    transit_access_score: "Bahnhof/U-Bahn",
    daily_needs_score: "Alltag",
    demand_anchor_score: "Messe/Jobs/Uni/Klinik",
    leisure_quality_score: "Freizeit",
    short_term_rental_score: "Airbnb/Tourismus",
    nuisance_resilience_score: "Stoerfaktoren",
    noise_risk_score: "Laerm",
    flood_risk_score: "Hochwasser",
    climate_resilience_score: "Klima 5-15J",
    climate_habitability: "Klima/Bewohnbarkeit"
  };
  return labels[key] || key.replaceAll("_", " ");
}
