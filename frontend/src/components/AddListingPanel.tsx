"use client";

import { ClipboardPaste, Plus, Save } from "lucide-react";
import { useState } from "react";
import { createListing, parseExpose } from "../lib/api";
import { Listing } from "../lib/types";

const FIELDS: Array<{ key: keyof Listing; label: string; type?: "number" | "text" }> = [
  { key: "title", label: "Titel", type: "text" },
  { key: "purchase_price", label: "Kaufpreis (€)", type: "number" },
  { key: "living_area_sqm", label: "Wohnfläche (m²)", type: "number" },
  { key: "number_of_rooms", label: "Zimmer", type: "number" },
  { key: "cold_rent_monthly", label: "Kaltmiete (€)", type: "number" },
  { key: "house_money_monthly", label: "Hausgeld (€)", type: "number" },
  { key: "postal_code", label: "PLZ", type: "text" },
  { key: "city", label: "Stadt", type: "text" },
  { key: "federal_state", label: "Bundesland", type: "text" },
  { key: "energy_class", label: "Energieklasse", type: "text" },
  { key: "construction_year", label: "Baujahr", type: "number" },
  { key: "listing_url", label: "Link", type: "text" }
];

const NUMERIC_KEYS = new Set([
  "purchase_price",
  "living_area_sqm",
  "number_of_rooms",
  "cold_rent_monthly",
  "house_money_monthly",
  "construction_year"
]);

export function AddListingPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function parse() {
    if (!pasteText.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const draft = await parseExpose(pasteText);
      const next: Record<string, string> = {};
      for (const field of FIELDS) {
        const value = draft[field.key];
        if (value !== undefined && value !== null) {
          next[field.key as string] = String(value);
        }
      }
      setForm(next);
      const found = Object.keys(next).length;
      setStatus(`${found} Felder erkannt – bitte prüfen und ergänzen.`);
    } catch {
      setStatus("Kein Kaufpreis erkannt – Felder bitte manuell ausfüllen.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form.title && !form.purchase_price) {
      setStatus("Mindestens Titel und Kaufpreis angeben.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { source: "manual" };
      for (const [key, value] of Object.entries(form)) {
        if (value === "") continue;
        payload[key] = NUMERIC_KEYS.has(key) ? value.replace(",", ".") : value;
      }
      if (!payload.title) payload.title = "Manuelles Angebot";
      await createListing(payload as Partial<Listing>);
      setForm({});
      setPasteText("");
      setStatus("Angebot gespeichert.");
      onCreated();
    } catch {
      setStatus("Speichern fehlgeschlagen – läuft das Backend?");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="button" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Angebot hinzufügen
      </button>
    );
  }

  return (
    <section className="panel add-listing">
      <div className="panel-header">
        <h2>Angebot hinzufügen</h2>
        {status && <span className="tag">{status}</span>}
      </div>
      <p className="add-listing-hint">
        Exposé-Seite eines bestehenden Angebots öffnen, komplett markieren (Cmd+A), kopieren und hier einfügen –
        dann „Erkennen“. Das füllt die Felder vor; Lücken einfach manuell ergänzen.
      </p>
      <textarea
        className="email-import-area"
        rows={5}
        placeholder="Exposé-Text oder ganze Seite hier einfügen…"
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
      />
      <div className="button-row">
        <button className="button" onClick={parse} disabled={busy || !pasteText.trim()}>
          <ClipboardPaste size={16} />
          Erkennen
        </button>
      </div>

      <div className="fact-grid weg-grid add-listing-grid">
        {FIELDS.map((field) => (
          <label className="weg-field" key={field.key as string}>
            <span>{field.label}</span>
            <input
              inputMode={field.type === "number" ? "decimal" : "text"}
              value={form[field.key as string] || ""}
              onChange={(event) => setField(field.key as string, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="button-row">
        <button className="button primary" onClick={save} disabled={busy}>
          <Save size={16} />
          Angebot speichern
        </button>
        <button className="button" onClick={() => setOpen(false)} disabled={busy}>
          Schließen
        </button>
      </div>
    </section>
  );
}
