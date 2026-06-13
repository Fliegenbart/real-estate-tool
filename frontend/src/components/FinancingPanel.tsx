"use client";

import { Percent, Save } from "lucide-react";
import { useState } from "react";
import { FinancingInput, updateFinancing } from "../lib/api";
import { Deal } from "../lib/types";

const FIELDS: Array<{ key: keyof FinancingInput; label: string; fallback: string; hint: string }> = [
  { key: "loan_to_value_percent", label: "Beleihung (LTV) %", fallback: "75", hint: "Anteil des Kaufpreises per Bankdarlehen" },
  { key: "interest_rate_percent", label: "Sollzins %", fallback: "4.0", hint: "Nominalzins der Bank" },
  { key: "amortization_rate_percent", label: "Tilgung %", fallback: "2.0", hint: "Anfängliche Tilgung pro Jahr" },
  { key: "capex_financed_percent", label: "Renovierung finanziert %", fallback: "0", hint: "Anteil der Renovierung über das Darlehen statt Eigenkapital" }
];

export function FinancingPanel({ deal, onSaved }: { deal: Deal; onSaved: (deal: Deal) => void }) {
  const financing = (deal.financing || {}) as Record<string, number | string | null>;
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = financing[field.key as string];
      initial[field.key as string] = value === null || value === undefined ? field.fallback : String(value);
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: FinancingInput = {};
      for (const field of FIELDS) {
        const raw = form[field.key as string];
        if (raw !== "" && raw !== undefined) {
          (payload as Record<string, string>)[field.key as string] = raw.replace(",", ".");
        }
      }
      onSaved(await updateFinancing(deal.id, payload));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Finanzierung</h2>
        <Percent size={17} />
      </div>
      <div className="fact-grid weg-grid">
        {FIELDS.map((field) => (
          <label className="weg-field" key={field.key as string} title={field.hint}>
            <span>{field.label}</span>
            <input
              inputMode="decimal"
              value={form[field.key as string] || ""}
              onChange={(event) => setForm({ ...form, [field.key as string]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <button className="button primary" onClick={save} disabled={busy}>
        <Save size={16} />
        Speichern & neu rechnen
      </button>
    </div>
  );
}
