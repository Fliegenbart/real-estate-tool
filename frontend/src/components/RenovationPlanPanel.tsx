"use client";

import { Hammer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { analyzeRenovationPlan } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/dealMetrics";
import { Deal, RenovationPlan } from "../lib/types";

export function RenovationPlanPanel({ deal }: { deal: Deal }) {
  const listing = deal.listing;
  const [plannedCapex, setPlannedCapex] = useState(String(listing?.expected_initial_capex || 25000));
  const [targetRent, setTargetRent] = useState(
    String(Math.round((listing?.market_rent_estimate_monthly || listing?.cold_rent_monthly || 0) * 1.08))
  );
  const [yieldPercent, setYieldPercent] = useState("4.5");
  const [refiLtv, setRefiLtv] = useState("75");
  const [targetEnergyClass, setTargetEnergyClass] = useState("");
  const [plan, setPlan] = useState<RenovationPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function runPlan() {
    setBusy(true);
    setPlan(
      await analyzeRenovationPlan(deal.id, {
        planned_capex: plannedCapex,
        target_cold_rent_monthly: targetRent,
        valuation_yield_percent: yieldPercent,
        refinance_ltv_percent: refiLtv,
        target_energy_class: targetEnergyClass || null
      })
    );
    setBusy(false);
  }

  return (
    <div className="panel wide">
      <div className="panel-header">
        <h2>Sanierungs- und Werthebel</h2>
        <Hammer size={17} />
      </div>
      <div className="filters renovation-controls">
        <Field label="Sanierung EUR" value={plannedCapex} onChange={setPlannedCapex} />
        <Field label="Ziel-Kaltmiete" value={targetRent} onChange={setTargetRent} />
        <Field label="Bewertungsrendite %" value={yieldPercent} onChange={setYieldPercent} step="0.1" />
        <Field label="Refi-LTV %" value={refiLtv} onChange={setRefiLtv} step="1" />
        <label>
          Ziel-Energie
          <select value={targetEnergyClass} onChange={(event) => setTargetEnergyClass(event.target.value)}>
            <option value="">Offen</option>
            {["A", "B", "C", "D", "E"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className="button primary" onClick={runPlan} disabled={busy}>
          <RefreshCw size={16} />
          Rechnen
        </button>
      </div>

      {plan ? (
        <>
          <div className="kpi-strip">
            <Fact label="Mietplus/Jahr" value={formatCurrency(plan.annual_rent_uplift)} />
            <Fact label="Werthebel aus Miete" value={formatCurrency(plan.implied_value_uplift_from_rent)} />
            <Fact label="Wert nach Sanierung" value={formatCurrency(plan.post_renovation_value)} />
            <Fact label="Refi-Darlehen moeglich" value={formatCurrency(plan.refinanceable_debt_after_renovation)} />
            <Fact label="Kapital freisetzbar" value={formatCurrency(plan.potential_equity_released)} />
            <Fact label="EK bleibt gebunden" value={formatCurrency(plan.net_equity_still_bound_after_refinance)} />
            <Fact label="Sanierungs-ROI" value={formatPercent(plan.simple_roi_percent)} />
            <Fact label="Werthebel-Faktor" value={formatNumber(plan.value_add_multiple, "x")} />
          </div>
          <p className="recommendation">{recommendationText(plan.recommendation)}</p>
          {plan.kfw_hint && <p className="tax-warning">{plan.kfw_hint}</p>}
          {plan.warnings.length > 0 && (
            <ul className="plain-list">
              {plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </>
      ) : (
        <p className="add-listing-hint">
          Sanierungskosten und realistische Zielmiete eingeben. Das Modul zeigt, ob die Massnahme Eigenkapital wieder freisetzen kann.
        </p>
      )}
    </div>
  );
}

function Field({ label, value, step = "1", onChange }: { label: string; value: string; step?: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function recommendationText(recommendation: RenovationPlan["recommendation"]): string {
  if (recommendation === "strong_value_add") {
    return "Starker Werthebel: Sanierung kann Miete, Wert und Refinanzierung sinnvoll verbessern.";
  }
  if (recommendation === "possible_value_add") {
    return "Moeglicher Werthebel: Annahmen mit Handwerker, Mietrecht und Bank pruefen.";
  }
  return "Schwacher Werthebel: Sanierung bindet wahrscheinlich zu viel Kapital fuer den Ertrag.";
}
