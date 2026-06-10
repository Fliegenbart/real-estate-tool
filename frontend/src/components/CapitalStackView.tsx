"use client";

import { Landmark, ListChecks, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createCapitalStack, getDeal, getTaxBriefing } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/dealMetrics";
import { CapitalStackResult, Deal, TaxBriefing } from "../lib/types";

type TrancheDraft = {
  kind: string;
  label: string;
  amount: string;
  interest_rate_percent: string;
  amortization_rate_percent: string;
};

const KINDS = [
  { value: "bank_loan", label: "Bankdarlehen" },
  { value: "shareholder_loan", label: "Darlehen operative GmbH" },
  { value: "seller_loan", label: "Verkaeuferdarlehen" },
  { value: "equity", label: "Eigenkapital" }
];

const DEFAULT_TRANCHES: TrancheDraft[] = [
  { kind: "bank_loan", label: "Hausbank", amount: "150000", interest_rate_percent: "4.0", amortization_rate_percent: "2.0" },
  { kind: "shareholder_loan", label: "DW Marketing GmbH", amount: "30000", interest_rate_percent: "3.0", amortization_rate_percent: "0" },
  { kind: "equity", label: "Eigenkapital vvGmbH", amount: "20000", interest_rate_percent: "0", amortization_rate_percent: "0" }
];

export function CapitalStackView({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [tranches, setTranches] = useState<TrancheDraft[]>(DEFAULT_TRANCHES);
  const [name, setName] = useState("Stack A");
  const [result, setResult] = useState<CapitalStackResult | null>(null);
  const [briefing, setBriefing] = useState<TaxBriefing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const dealData = await getDeal(dealId);
    setDeal(dealData);
    if (dealData.capital_stacks && dealData.capital_stacks.length > 0) {
      setResult(dealData.capital_stacks[0].results);
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTranche(index: number, patch: Partial<TrancheDraft>) {
    setTranches(tranches.map((tranche, i) => (i === index ? { ...tranche, ...patch } : tranche)));
  }

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        tranches: tranches
          .filter((tranche) => Number(tranche.amount) > 0)
          .map((tranche) => ({
            kind: tranche.kind,
            label: tranche.label,
            amount: tranche.amount,
            interest_rate_percent: tranche.interest_rate_percent || "0",
            amortization_rate_percent: tranche.amortization_rate_percent || "0"
          }))
      };
      setResult(await createCapitalStack(dealId, payload));
    } catch {
      setError("Analyse fehlgeschlagen - erst Underwriting auf dem Deal rechnen.");
    } finally {
      setBusy(false);
    }
  }

  async function loadBriefing() {
    setBriefing(await getTaxBriefing(dealId));
  }

  const uw = deal?.latest_underwriting;

  return (
    <div className="page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${dealId}`} className="text-link">Deal</Link>
          <h2>Finanzierung - {deal?.title || `Deal ${dealId}`}</h2>
          <p>
            All-in {formatCurrency(uw?.all_in_purchase_price)} · NOI {formatCurrency(uw?.net_operating_income)} / Jahr
          </p>
        </div>
        <div className="button-row">
          <button className="button" onClick={loadBriefing}>
            <ListChecks size={16} />
            Steuerberater-Briefing
          </button>
          <button className="button primary" onClick={analyze} disabled={busy}>
            <Landmark size={16} />
            Stack analysieren
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Kapitalstruktur</h2>
          <input className="stack-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quelle</th>
                <th>Bezeichnung</th>
                <th>Betrag</th>
                <th>Zins %</th>
                <th>Tilgung %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tranches.map((tranche, index) => (
                <tr key={index}>
                  <td>
                    <select value={tranche.kind} onChange={(event) => setTranche(index, { kind: event.target.value })}>
                      {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </select>
                  </td>
                  <td><input value={tranche.label} onChange={(event) => setTranche(index, { label: event.target.value })} /></td>
                  <td><input inputMode="decimal" value={tranche.amount} onChange={(event) => setTranche(index, { amount: event.target.value })} /></td>
                  <td><input inputMode="decimal" value={tranche.interest_rate_percent} onChange={(event) => setTranche(index, { interest_rate_percent: event.target.value })} /></td>
                  <td><input inputMode="decimal" value={tranche.amortization_rate_percent} onChange={(event) => setTranche(index, { amortization_rate_percent: event.target.value })} /></td>
                  <td>
                    <button className="icon-button" onClick={() => setTranches(tranches.filter((_, i) => i !== index))}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="button"
          onClick={() => setTranches([...tranches, { kind: "equity", label: "", amount: "0", interest_rate_percent: "0", amortization_rate_percent: "0" }])}
        >
          <Plus size={15} />
          Tranche
        </button>
        {error && <p className="tax-warning">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <div className="panel-header"><h2>Ergebnis: {result.name}</h2></div>
          <div className="kpi-strip">
            <Fact label="Fremdkapital" value={formatCurrency(result.total_debt)} />
            <Fact label="Eigenkapital" value={formatCurrency(result.total_equity)} />
            <Fact label="Mischzins" value={formatNumber(result.blended_interest_rate_percent, " %")} />
            <Fact label="Kapitaldienst/Jahr" value={formatCurrency(result.annual_debt_service)} />
            <Fact label="DSCR" value={formatNumber(result.dscr)} />
            <Fact label="Cashflow vor Steuer" value={formatCurrency(result.monthly_cashflow_before_tax)} />
            <Fact label="Cashflow nach Steuer" value={formatCurrency(result.monthly_cashflow_after_tax_approx)} />
            <Fact label="Luecke" value={formatCurrency(result.funding_gap)} />
          </div>
          {result.intercompany_note && (
            <p className="recommendation">
              GmbH-Darlehen: {formatCurrency(result.intercompany_interest_annual)} Zins/Jahr,
              davon ~{formatCurrency(result.intercompany_tax_leakage_annual)} Netto-Steuerleck. {result.intercompany_note}
            </p>
          )}
          {result.warnings.map((warning) => <p className="tax-warning" key={warning}>{warning}</p>)}
          {result.fremdvergleich_checklist.length > 0 && (
            <>
              <h3>Fremdvergleichs-Checkliste</h3>
              <ul className="plain-list">
                {result.fremdvergleich_checklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {briefing && (
        <section className="panel">
          <div className="panel-header"><h2>{briefing.title}</h2></div>
          {briefing.sections.map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              <ul className="plain-list">
                {section.questions.map((question) => <li key={question}>{question}</li>)}
              </ul>
            </div>
          ))}
          <p className="tax-warning">{briefing.disclaimer}</p>
        </section>
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
