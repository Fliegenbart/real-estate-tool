"use client";

import { Landmark, RefreshCw, Target, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAcquisitionCommandCenter } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent, scoreTone } from "../lib/dealMetrics";
import { AcquisitionAssumptions, AcquisitionCommandCenter, DealDecision } from "../lib/types";

const DEFAULT_ASSUMPTIONS: AcquisitionAssumptions = {
  available_equity: 250000,
  annual_new_equity: 75000,
  target_years: 10,
  minimum_total_score: 60,
  minimum_dscr: 1.1,
  minimum_monthly_cashflow_before_tax: 0,
  maximum_equity_per_unit: 125000
};

export function AcquisitionCommandCenterView() {
  const [assumptions, setAssumptions] = useState<AcquisitionAssumptions>(DEFAULT_ASSUMPTIONS);
  const [center, setCenter] = useState<AcquisitionCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextAssumptions = assumptions) {
    setLoading(true);
    setCenter(await getAcquisitionCommandCenter(nextAssumptions));
    setLoading(false);
  }

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);
      setCenter(await getAcquisitionCommandCenter(DEFAULT_ASSUMPTIONS));
      setLoading(false);
    }

    void initialLoad();
  }, []);

  function updateNumber<K extends keyof AcquisitionAssumptions>(key: K, value: string) {
    const parsed = Number(value);
    setAssumptions((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  if (loading && !center) {
    return <div className="page"><div className="panel">Lade Kaufmaschine...</div></div>;
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Kaufmaschine vvGmbH</h2>
          <p>{center?.portfolio_capacity.active_pipeline_units ?? 0} Wohnungen in der Pipeline</p>
        </div>
        <button className="button primary" onClick={() => load()} disabled={loading}>
          <RefreshCw size={16} />
          Neu rechnen
        </button>
      </section>

      <section className="filters acquisition-controls">
        <NumberField label="Eigenkapital jetzt" value={assumptions.available_equity} onChange={(value) => updateNumber("available_equity", value)} />
        <NumberField label="Neues EK/Jahr" value={assumptions.annual_new_equity} onChange={(value) => updateNumber("annual_new_equity", value)} />
        <NumberField label="Jahre" value={assumptions.target_years} onChange={(value) => updateNumber("target_years", value)} />
        <NumberField label="Min. Score" value={assumptions.minimum_total_score} onChange={(value) => updateNumber("minimum_total_score", value)} />
        <NumberField label="Min. DSCR" value={assumptions.minimum_dscr} step="0.05" onChange={(value) => updateNumber("minimum_dscr", value)} />
        <NumberField label="Max. EK/Wohnung" value={assumptions.maximum_equity_per_unit} onChange={(value) => updateNumber("maximum_equity_per_unit", value)} />
      </section>

      {center && (
        <>
          <section className="metric-grid">
            <MetricCard icon={<Target size={18} />} label="Wohnungen je 100k EK" value={formatNumber(center.north_star.current_value)} />
            <MetricCard icon={<Wallet size={18} />} label="Jetzt einsetzbar" value={formatCurrency(center.portfolio_capacity.deployable_equity_now)} />
            <MetricCard icon={<Landmark size={18} />} label="Ausgewählte Wohnungen" value={center.portfolio_capacity.selected_units_now} />
            <MetricCard icon={<TrendingUp size={18} />} label="Ø EK je Wohnung" value={formatCurrency(center.portfolio_capacity.average_equity_per_selected_unit)} />
            <MetricCard icon={<Target size={18} />} label="Gekaufte Wohnungen" value={center.portfolio_capacity.bought_units} />
          </section>

          <section className="dashboard-grid">
            <div className="panel table-panel">
              <div className="panel-header">
                <h2>Jetzt kaufbare Deals</h2>
                <Link className="text-link" href="/pipeline">Pipeline</Link>
              </div>
              <DecisionTable decisions={center.selected_deals_now} emptyText="Kein Deal passt aktuell in Kapital und Buy-Box." />
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>10-Jahres-Plan</h2>
                <span className="tag">{formatCurrency(center.growth_plan.average_equity_per_unit_assumption)} / Wohnung</span>
              </div>
              <div className="growth-list">
                {center.growth_plan.years.slice(0, 10).map((year) => (
                  <div className="growth-row" key={year.year}>
                    <span>Jahr {year.year}</span>
                    <strong>{year.ending_units} WE</strong>
                    <small>+{year.estimated_units_added} · Rest {formatCurrency(year.ending_equity)}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-header">
              <h2>Ankauf-Entscheidungen</h2>
              <span>{center.deal_decisions.length} Deals</span>
            </div>
            <DecisionTable decisions={center.deal_decisions} emptyText="Noch keine Deals bewertet." />
          </section>

          <section className="panel table-panel">
            <div className="panel-header">
              <h2>Deal-Radar Listings</h2>
              <Link className="text-link" href="/listings">Listings</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Score</th>
                    <th>Stadt</th>
                    <th>Preis</th>
                    <th>Brutto</th>
                    <th>Markt</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {center.deal_radar.slice(0, 12).map((listing) => (
                    <tr key={listing.id}>
                      <td><strong>{listing.title}</strong></td>
                      <td><span className={`score ${scoreTone(listing.priority_score)}`}>{listing.priority_score}</span></td>
                      <td>{listing.city || "Fehlt"}</td>
                      <td>{formatCurrency(listing.purchase_price)}</td>
                      <td>{formatPercent(listing.gross_yield_percent)}</td>
                      <td>{listing.days_on_market ?? "-"} T. · {listing.price_reduction_count}x runter</td>
                      <td>{listing.next_action}</td>
                    </tr>
                  ))}
                  {center.deal_radar.length === 0 && <tr><td colSpan={7}>Keine Listings.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DecisionTable({ decisions, emptyText }: { decisions: DealDecision[]; emptyText: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Entscheidung</th>
            <th>Score</th>
            <th>EK</th>
            <th>EK/WE</th>
            <th>Cashflow</th>
            <th>DSCR</th>
            <th>Naechster Schritt</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((deal) => (
            <tr key={`${deal.deal_id}-${deal.decision}`}>
              <td>
                <div className="cell-title">
                  <Link href={`/deals/${deal.deal_id}`}>{deal.title}</Link>
                  <span>{deal.city || "Ort fehlt"} · {deal.pipeline_stage}</span>
                  {deal.kfw_opportunity && <span>{deal.kfw_opportunity}</span>}
                </div>
              </td>
              <td><span className={`decision-chip ${deal.decision}`}>{deal.decision_label}</span></td>
              <td><span className={`score ${scoreTone(deal.total_score)}`}>{deal.total_score ?? "-"}</span></td>
              <td>{formatCurrency(deal.equity_required)}</td>
              <td>{formatCurrency(deal.equity_per_unit)}</td>
              <td>{formatCurrency(deal.monthly_cashflow_before_tax)}</td>
              <td>{formatNumber(deal.dscr)}</td>
              <td>
                <div className="cell-title">
                  <span>{deal.next_action}</span>
                  <Link className="text-link" href={`/deals/${deal.deal_id}/bank`}>Bankenpaket</Link>
                </div>
              </td>
            </tr>
          ))}
          {decisions.length === 0 && <tr><td colSpan={8}>{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function NumberField({ label, value, step = "1", onChange }: { label: string; value: number; step?: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="metric-card">
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
