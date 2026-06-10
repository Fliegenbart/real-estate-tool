"use client";

import { HeartPulse, Save } from "lucide-react";
import { useState } from "react";
import { updateWegHealth } from "../lib/api";
import { scoreTone } from "../lib/dealMetrics";
import { Deal, WegHealthInput, WegHealthResult } from "../lib/types";

const NUMBER_FIELDS: Array<{ key: keyof WegHealthInput; label: string }> = [
  { key: "construction_year", label: "Baujahr" },
  { key: "total_units", label: "Einheiten gesamt" },
  { key: "community_living_area_sqm", label: "Gesamtflaeche WEG (m2)" },
  { key: "unit_living_area_sqm", label: "Flaeche Einheit (m2)" },
  { key: "reserve_total_eur", label: "Ruecklage gesamt (EUR)" },
  { key: "annual_reserve_contribution_eur", label: "Zufuehrung/Jahr (EUR)" },
  { key: "hausgeld_monthly_eur", label: "Hausgeld/Monat (EUR)" },
  { key: "arrears_total_eur", label: "Hausgeldrueckstaende (EUR)" },
  { key: "special_levies_last_5_years_eur", label: "Sonderumlagen 5 Jahre (EUR)" },
  { key: "protocols_years_reviewed", label: "Protokolljahre gelesen" }
];

const BOOL_FIELDS: Array<{ key: keyof WegHealthInput; label: string }> = [
  { key: "professional_management", label: "Profi-Verwaltung" },
  { key: "litigation_pending", label: "Rechtsstreit laeuft" },
  { key: "has_majority_owner", label: "Mehrheitseigentuemer" }
];

export function WegHealthPanel({ deal, onSaved }: { deal: Deal; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const inputs = (deal.weg_health?.inputs || {}) as Record<string, unknown>;
    for (const field of NUMBER_FIELDS) {
      const value = inputs[field.key as string];
      initial[field.key as string] = value === null || value === undefined ? "" : String(value);
    }
    return initial;
  });
  const [bools, setBools] = useState<Record<string, boolean | null>>(() => {
    const inputs = (deal.weg_health?.inputs || {}) as Record<string, unknown>;
    return Object.fromEntries(
      BOOL_FIELDS.map((field) => [field.key as string, (inputs[field.key as string] as boolean | null) ?? null])
    );
  });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!deal.weg_health);

  const result: WegHealthResult | undefined = deal.weg_health?.results;

  async function save() {
    setBusy(true);
    try {
      const payload: WegHealthInput = {};
      for (const field of NUMBER_FIELDS) {
        const raw = form[field.key as string];
        if (raw !== "" && raw !== undefined) {
          (payload as Record<string, unknown>)[field.key as string] =
            field.key === "construction_year" || field.key === "total_units" || field.key === "protocols_years_reviewed"
              ? Number(raw)
              : raw;
        }
      }
      for (const field of BOOL_FIELDS) {
        const value = bools[field.key as string];
        if (value !== null) {
          (payload as Record<string, unknown>)[field.key as string] = value;
        }
      }
      await updateWegHealth(deal.id, payload);
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel wide">
      <div className="panel-header">
        <h2>WEG-Gesundheit</h2>
        <div className="button-row">
          {result && (
            <span className={`score ${scoreTone(result.total_score)}`}>{result.total_score}</span>
          )}
          <button className="button" onClick={() => setEditing(!editing)}>
            <HeartPulse size={16} />
            {editing ? "Schliessen" : "Daten erfassen"}
          </button>
        </div>
      </div>

      {result && !editing && (
        <>
          <p className="recommendation">{result.summary} (Datenlage: {result.data_completeness_percent}%, Confidence: {result.confidence})</p>
          <div className="score-bars">
            {Object.entries(result.category_scores).map(([label, value]) => (
              <div className="pipeline-bar" key={label}>
                <span>{label.replaceAll("_", " ")}</span>
                <div className="bar-track"><div style={{ width: `${value}%` }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {result.documents_to_request.length > 0 && (
            <>
              <h3>Nachfordern</h3>
              <ul className="plain-list">
                {result.documents_to_request.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </>
          )}
        </>
      )}

      {editing && (
        <div className="weg-form">
          <div className="fact-grid weg-grid">
            {NUMBER_FIELDS.map((field) => (
              <label className="weg-field" key={field.key as string}>
                <span>{field.label}</span>
                <input
                  inputMode="decimal"
                  value={form[field.key as string] || ""}
                  onChange={(event) => setForm({ ...form, [field.key as string]: event.target.value })}
                />
              </label>
            ))}
            {BOOL_FIELDS.map((field) => (
              <label className="weg-field" key={field.key as string}>
                <span>{field.label}</span>
                <select
                  value={bools[field.key as string] === null ? "" : String(bools[field.key as string])}
                  onChange={(event) =>
                    setBools({
                      ...bools,
                      [field.key as string]: event.target.value === "" ? null : event.target.value === "true"
                    })
                  }
                >
                  <option value="">Unbekannt</option>
                  <option value="true">Ja</option>
                  <option value="false">Nein</option>
                </select>
              </label>
            ))}
          </div>
          <button className="button primary" onClick={save} disabled={busy}>
            <Save size={16} />
            Speichern & bewerten
          </button>
        </div>
      )}

      {!result && !editing && <p>Noch keine WEG-Daten erfasst.</p>}
    </div>
  );
}
