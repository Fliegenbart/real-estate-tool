"use client";

import { Map, Save } from "lucide-react";
import { useState } from "react";
import { updateGeoContext } from "../lib/api";
import { Deal, GeoContext } from "../lib/types";

const BOOL_FIELDS: Array<{ key: keyof GeoContext; label: string }> = [
  { key: "b_plan_available", label: "B-Plan vorhanden" },
  { key: "milieu_protection_area", label: "Milieuschutzgebiet" },
  { key: "redevelopment_area", label: "Sanierungsgebiet" },
  { key: "monument_protection", label: "Denkmalschutz" }
];

export function GeoContextPanel({ deal, onSaved }: { deal: Deal; onSaved: () => void }) {
  const geo = deal.geo_context || null;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groundValue, setGroundValue] = useState(geo?.ground_value_eur_per_sqm ? String(geo.ground_value_eur_per_sqm) : "");
  const [groundValueDate, setGroundValueDate] = useState(geo?.ground_value_data_date || "");
  const [parcelId, setParcelId] = useState(geo?.parcel_id || "");
  const [zoning, setZoning] = useState(geo?.zoning_summary || "");
  const [bools, setBools] = useState<Record<string, boolean | null>>(
    Object.fromEntries(BOOL_FIELDS.map((field) => [field.key as string, (geo?.[field.key] as boolean | null) ?? null]))
  );

  async function save() {
    setBusy(true);
    try {
      const payload: GeoContext = {};
      if (groundValue !== "") payload.ground_value_eur_per_sqm = groundValue;
      if (groundValueDate !== "") payload.ground_value_data_date = groundValueDate;
      if (parcelId !== "") payload.parcel_id = parcelId;
      if (zoning !== "") payload.zoning_summary = zoning;
      for (const field of BOOL_FIELDS) {
        const value = bools[field.key as string];
        if (value !== null) {
          (payload as Record<string, unknown>)[field.key as string] = value;
        }
      }
      await updateGeoContext(deal.id, payload);
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Geo-Kontext</h2>
        <div className="button-row">
          {geo && <span className="tag">Datenlage {geo.data_confidence_percent ?? 0}%</span>}
          <button className="button" onClick={() => setEditing(!editing)}>
            <Map size={16} />
            {editing ? "Schliessen" : "Erfassen"}
          </button>
        </div>
      </div>

      {!editing && geo && (
        <div className="fact-grid">
          <Fact label="Bodenrichtwert" value={geo.ground_value_eur_per_sqm ? `${geo.ground_value_eur_per_sqm} EUR/m2 (${geo.ground_value_data_date || "Stand unbekannt"})` : "Fehlt"} />
          <Fact label="Flurstueck" value={geo.parcel_id || "Fehlt"} />
          <Fact label="B-Plan" value={triState(geo.b_plan_available)} />
          <Fact label="Milieuschutz" value={triState(geo.milieu_protection_area)} />
          <Fact label="Sanierungsgebiet" value={triState(geo.redevelopment_area)} />
          <Fact label="Denkmalschutz" value={triState(geo.monument_protection)} />
        </div>
      )}
      {!editing && !geo && <p>Noch kein Geo-Kontext erfasst (BORIS-Bodenrichtwert, B-Plan, Milieuschutz manuell nachtragen).</p>}

      {editing && (
        <div className="weg-form">
          <div className="fact-grid weg-grid">
            <label className="weg-field">
              <span>Bodenrichtwert EUR/m2</span>
              <input inputMode="decimal" value={groundValue} onChange={(event) => setGroundValue(event.target.value)} />
            </label>
            <label className="weg-field">
              <span>BRW-Stichtag</span>
              <input placeholder="2025-12-31" value={groundValueDate} onChange={(event) => setGroundValueDate(event.target.value)} />
            </label>
            <label className="weg-field">
              <span>Flurstueck</span>
              <input value={parcelId} onChange={(event) => setParcelId(event.target.value)} />
            </label>
            <label className="weg-field">
              <span>Planungsrecht (frei)</span>
              <input value={zoning} onChange={(event) => setZoning(event.target.value)} />
            </label>
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
            Speichern
          </button>
        </div>
      )}
    </div>
  );
}

function triState(value: boolean | null | undefined): string {
  if (value === true) return "Ja";
  if (value === false) return "Nein";
  return "Unbekannt";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
