"use client";

import { AlertTriangle, CheckCircle, FileText, Handshake, Landmark, MapPin, PlayCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDeal, runScore, runUnderwriting } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent, scoreTone } from "../lib/dealMetrics";
import { Deal } from "../lib/types";
import { GeoContextPanel } from "./GeoContextPanel";
import { RiskMatrixPanel } from "./RiskMatrixPanel";
import { WegHealthPanel } from "./WegHealthPanel";

export function DealDetailView({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setDeal(await getDeal(dealId));
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function underwrite() {
    if (!deal) return;
    setBusy(true);
    setDeal(await runUnderwriting(deal.id));
    setBusy(false);
  }

  async function score() {
    if (!deal) return;
    setBusy(true);
    setDeal(await runScore(deal.id));
    setBusy(false);
  }

  if (!deal) {
    return <div className="page"><div className="panel">Lade Deal...</div></div>;
  }

  const listing = deal.listing;
  const uw = deal.latest_underwriting;
  const scoreResult = deal.latest_score;
  const redFlags = scoreResult?.red_flags || [];
  const targetRentPerSqm =
    typeof deal.rent_law?.legally_plausible_target_rent_per_sqm === "number"
      ? deal.rent_law.legally_plausible_target_rent_per_sqm
      : null;

  return (
    <div className="page">
      <section className="deal-header">
        <div>
          <Link href="/pipeline" className="text-link">Pipeline</Link>
          <h2>{deal.title}</h2>
          <p>{listing?.city || "Ort fehlt"} · {listing?.postal_code || "PLZ fehlt"} · {deal.pipeline_stage}</p>
        </div>
        <div className="button-row">
          <button className="button" onClick={underwrite} disabled={busy}>
            <PlayCircle size={16} />
            Underwriting
          </button>
          <button className="button primary" onClick={score} disabled={busy}>
            <RefreshCw size={16} />
            Scoring
          </button>
          <Link className="button" href={`/deals/${deal.id}/dossier`}>
            <Handshake size={16} />
            Verhandlung
          </Link>
          <Link className="button" href={`/deals/${deal.id}/finanzierung`}>
            <Landmark size={16} />
            Finanzierung
          </Link>
          <Link className="button" href={`/memo/${deal.id}`}>
            <FileText size={16} />
            Memo
          </Link>
        </div>
      </section>

      <section className="deal-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Objekt & Kauf</h2>
            <span className="tag">{listing?.energy_class || "Energie fehlt"}</span>
          </div>
          <div className="fact-grid">
            <Fact label="Kaufpreis" value={formatCurrency(listing?.purchase_price)} />
            <Fact label="Flaeche" value={formatNumber(listing?.living_area_sqm, " m2")} />
            <Fact label="Kaltmiete" value={formatCurrency(listing?.cold_rent_monthly)} />
            <Fact label="Marktmiete" value={formatCurrency(listing?.market_rent_estimate_monthly)} />
            <Fact label="Hausgeld" value={formatCurrency(listing?.house_money_monthly)} />
            <Fact label="Nicht umlagefaehig" value={formatCurrency(listing?.non_recoverable_costs_monthly)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Score</h2>
            <span className={`score ${scoreTone(scoreResult?.total_score)}`}>{scoreResult?.total_score ?? "-"}</span>
          </div>
          <p className="recommendation">{scoreResult?.next_recommended_action || "Noch kein Score."}</p>
          <div className="score-bars">
            {Object.entries(scoreResult?.category_scores || {}).map(([label, value]) => (
              <div className="pipeline-bar" key={label}>
                <span>{label.replaceAll("_", " ")}</span>
                <div className="bar-track"><div style={{ width: `${value}%` }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-header">
            <h2>Underwriting KPIs</h2>
            <span>{uw ? "Base case" : "Nicht gerechnet"}</span>
          </div>
          <div className="kpi-strip">
            <Fact label="All-in Kaufpreis" value={formatCurrency(uw?.all_in_purchase_price)} />
            <Fact label="Bruttorendite" value={formatPercent(uw?.gross_initial_yield_percent)} />
            <Fact label="Nettorendite" value={formatPercent(uw?.net_initial_yield_percent)} />
            <Fact label="Cashflow vor Steuer" value={formatCurrency(uw?.monthly_cashflow_before_tax)} />
            <Fact label="DSCR" value={formatNumber(uw?.dscr)} />
            <Fact label="Max Kaufpreis Zielrendite" value={formatCurrency(uw?.maximum_purchase_price_for_target_yield)} />
            <Fact label="Eigenkapital" value={formatCurrency(uw?.equity_required)} />
            <Fact label="Cash-on-Cash" value={formatPercent(uw?.cash_on_cash_return_percent)} />
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-header">
            <h2>Zinsbindungs-Stresstest</h2>
            <span>{uw?.stressed_interest_rate_percent ? `Anschlusszins ${formatPercent(uw.stressed_interest_rate_percent)}` : "Nicht gerechnet"}</span>
          </div>
          <div className="kpi-strip">
            <Fact label="Restschuld Ende Haltedauer" value={formatCurrency(uw?.remaining_loan_after_holding)} />
            <Fact label="Kapitaldienst gestresst" value={formatCurrency(uw?.stressed_annual_debt_service)} />
            <Fact label="Cashflow gestresst" value={formatCurrency(uw?.stressed_monthly_cashflow_before_tax)} />
            <Fact label="DSCR gestresst" value={formatNumber(uw?.stressed_dscr)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Mietrecht</h2>
            <AlertTriangle size={17} />
          </div>
          <div className="fact-grid single">
            <Fact label="Plausible Zielmiete / m2" value={formatNumber(targetRentPerSqm, " EUR/m2")} />
            <Fact label="Status" value={String(deal.rent_law?.status || "Fehlt")} />
            <Fact label="Confidence" value={String(deal.rent_law?.confidence || "Fehlt")} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Signale</h2>
            <span className="tag">{(deal.signals || []).length}</span>
          </div>
          <ul className="plain-list">
            {(deal.signals || []).map((signal) => (
              <li key={signal.type}>
                <strong>{signal.type.replaceAll("_", " ")}</strong>: {signal.explanation}
              </li>
            ))}
            {(deal.signals || []).length === 0 && <li>Keine Signale - Listing-Historie ist noch frisch.</li>}
          </ul>
        </div>

        <GeoContextPanel deal={deal} onSaved={() => void load()} />

        <div className="panel">
          <div className="panel-header">
            <h2>Lage</h2>
            <MapPin size={17} />
          </div>
          <div className="location-list">
            {Object.entries(deal.location || {}).filter(([key]) => key.endsWith("_score")).map(([key, value]) => (
              <div className="pipeline-bar" key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <div className="bar-track"><div style={{ width: `${Number(value) || 0}%` }} /></div>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel wide">
          <div className="panel-header">
            <h2>Risiken & Dokumente</h2>
            {redFlags.length ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
          </div>
          <div className="risk-grid">
            <div>
              <h3>Red Flags</h3>
              <ul className="plain-list">
                {(redFlags.length ? redFlags : ["Keine harten roten Flaggen im aktuellen Modell."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Dokumente</h3>
              <ul className="plain-list">
                {[
                  "Expose",
                  "Energieausweis",
                  "Teilungserklaerung",
                  "WEG-Protokolle",
                  "Wirtschaftsplan",
                  "Jahresabrechnung",
                  "Mietvertrag"
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="tax-warning">{uw?.tax_warning || "Tax calculation is simplified and must be reviewed by a Steuerberater."}</p>
        </div>

        <WegHealthPanel deal={deal} onSaved={() => void load()} />

        <RiskMatrixPanel dealId={deal.id} scoreVersion={String(scoreResult?.total_score ?? "none")} />
      </section>
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
