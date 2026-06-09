"use client";

import { AlertTriangle, Building2, Euro, RefreshCw, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bootstrapDemoPortfolio, getDashboard } from "../lib/api";
import { formatCurrency, formatPercent, scoreTone } from "../lib/dealMetrics";
import { Dashboard } from "../lib/types";

export function DashboardView() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setDashboard(await getDashboard());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function seedDemo() {
    setBusy(true);
    await bootstrapDemoPortfolio();
    await load();
    setBusy(false);
  }

  const pipelineTotal = useMemo(() => {
    if (!dashboard) return 0;
    return Object.values(dashboard.pipeline || {}).reduce((sum, value) => sum + value, 0);
  }, [dashboard]);

  if (loading || !dashboard) {
    return <div className="page"><div className="panel">Lade Dashboard...</div></div>;
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Portfolio Akquise</h2>
          <p>Aktive Pipeline, Rendite, Cashflow und rote Flaggen.</p>
        </div>
        <button className="button primary" onClick={seedDemo} disabled={busy}>
          <RefreshCw size={16} />
          Demo laden
        </button>
      </section>

      <section className="metric-grid">
        <MetricCard icon={<Building2 size={18} />} label="Aktive Listings" value={dashboard.total_active_listings} />
        <MetricCard icon={<TrendingUp size={18} />} label="Aktive Deals" value={dashboard.active_deals} />
        <MetricCard icon={<Euro size={18} />} label="Ø Bruttorendite" value={formatPercent(dashboard.average_gross_yield)} />
        <MetricCard icon={<Euro size={18} />} label="Ø Nettorendite" value={formatPercent(dashboard.average_net_yield)} />
        <MetricCard icon={<AlertTriangle size={18} />} label="Red-flag Deals" value={dashboard.red_flagged_deals} tone="risk" />
      </section>

      <section className="dashboard-grid">
        <div className="panel table-panel">
          <div className="panel-header">
            <h2>Top Deals nach Score</h2>
            <Link href="/listings" className="text-link">Listings</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Score</th>
                  <th>Stadt</th>
                  <th>Kaufpreis</th>
                  <th>Netto</th>
                  <th>DSCR</th>
                  <th>Risiko</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.top_deals.length === 0 ? (
                  <tr><td colSpan={7}>Noch keine bewerteten Deals.</td></tr>
                ) : dashboard.top_deals.map((deal) => (
                  <tr key={deal.id}>
                    <td><Link href={`/deals/${deal.id}`}>{deal.title}</Link></td>
                    <td><span className={`score ${scoreTone(deal.latest_score?.total_score)}`}>{deal.latest_score?.total_score ?? "-"}</span></td>
                    <td>{deal.listing?.city || "Fehlt"}</td>
                    <td>{formatCurrency(deal.listing?.purchase_price)}</td>
                    <td>{formatPercent(deal.latest_underwriting?.net_initial_yield_percent)}</td>
                    <td>{deal.latest_underwriting?.dscr ?? "Fehlt"}</td>
                    <td>{deal.latest_score?.red_flags?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Pipeline</h2>
            <Link href="/pipeline" className="text-link">Kanban</Link>
          </div>
          <div className="pipeline-bars">
            {Object.entries(dashboard.pipeline).map(([stage, count]) => (
              <div className="pipeline-bar" key={stage}>
                <span>{stage}</span>
                <div className="bar-track">
                  <div style={{ width: `${pipelineTotal ? (count / pipelineTotal) * 100 : 0}%` }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "risk" }) {
  return (
    <div className={`metric-card ${tone || ""}`}>
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
