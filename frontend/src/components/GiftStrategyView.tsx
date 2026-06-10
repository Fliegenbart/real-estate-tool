"use client";

import { Calculator, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { getGiftPropertyStrategies } from "../lib/api";
import { formatCurrency } from "../lib/dealMetrics";
import { GiftPropertyComparison } from "../lib/types";

const FIELDS = [
  { key: "market_value", label: "Verkehrswert (EUR)", initial: "80000" },
  { key: "achievable_cold_rent_monthly", label: "Erzielbare Kaltmiete/Monat", initial: "400" },
  { key: "non_recoverable_costs_monthly", label: "Nicht umlagefaehig/Monat", initial: "60" },
  { key: "building_share_percent", label: "Gebaeudeanteil %", initial: "80" },
  { key: "personal_marginal_tax_rate_percent", label: "Pers. Grenzsteuersatz %", initial: "42" },
  { key: "remaining_private_afa_annual", label: "Rest-AfA privat/Jahr (EUR)", initial: "0" }
];

export function GiftStrategyView() {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((field) => [field.key, field.initial]))
  );
  const [comparison, setComparison] = useState<GiftPropertyComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculate() {
    setBusy(true);
    setError(null);
    try {
      setComparison(await getGiftPropertyStrategies({ ...form, federal_state: "Sachsen" }));
    } catch {
      setError("Backend nicht erreichbar - laeuft uvicorn auf Port 8000?");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Chemnitz-Hebel: geschenkte Wohnung als Eigenkapital</h2>
          <p>Vier Strategien fuer die von den Eltern geschenkte Wohnung - Modellrechnung fuer das Steuerberater-Gespraech.</p>
        </div>
        <button className="button primary" onClick={calculate} disabled={busy}>
          <Calculator size={16} />
          Neu rechnen
        </button>
      </section>

      <section className="filters">
        {FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              inputMode="decimal"
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
            />
          </label>
        ))}
      </section>

      {error && <div className="panel">{error}</div>}

      {comparison && (
        <>
          <p className="recommendation">{comparison.prerequisite_warning}</p>
          <section className="strategy-grid">
            {comparison.strategies.map((strategy) => (
              <div className="panel" key={strategy.code}>
                <div className="panel-header">
                  <h2>{strategy.title}</h2>
                  <Gift size={17} />
                </div>
                <div className="fact-grid">
                  <Fact label="Einmalkosten" value={formatCurrency(strategy.one_time_costs_eur)} />
                  <Fact label="Liquiditaet frei" value={formatCurrency(strategy.liquidity_unlocked_eur)} />
                  <Fact label="Steuer auf Miete/Jahr" value={formatCurrency(strategy.annual_tax_on_rent_eur)} />
                  <Fact label="AfA-Schild/Jahr" value={formatCurrency(strategy.annual_afa_tax_shield_eur)} />
                </div>
                <h3>Dafuer</h3>
                <ul className="plain-list">
                  {strategy.pros.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <h3>Dagegen</h3>
                <ul className="plain-list">
                  {strategy.cons.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {strategy.steuerberater_questions.length > 0 && (
                  <>
                    <h3>Fragen an den Steuerberater</h3>
                    <ul className="plain-list">
                      {strategy.steuerberater_questions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </section>
          <p className="tax-warning">{comparison.disclaimer}</p>
        </>
      )}
    </div>
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
