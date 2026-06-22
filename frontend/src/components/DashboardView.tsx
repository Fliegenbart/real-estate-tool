"use client";

import { AlertTriangle, Building2, Euro, Mail, RefreshCw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboard, getDeals } from "../lib/api";
import {
  acquisitionReadinessSummary,
  assetManagementBrief,
  dealActionPlanBrief,
  dealDecisionBrief,
  dealDecisionCounts,
  dealEvidenceQualityBrief,
  dealPricingBrief,
  formatCurrency,
  formatNumber,
  formatPercent,
  portfolioCommandBrief,
  rankDealsByDecision,
  scoreTone
} from "../lib/dealMetrics";
import { Dashboard, Deal } from "../lib/types";

type DashboardLoadState = "loading" | "ready" | "error";

export function DashboardView() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setDashboard(null);
    setDeals([]);
    try {
      const [dashboardPayload, dealsPayload] = await Promise.all([getDashboard(), getDeals()]);
      setDashboard(dashboardPayload);
      setDeals(dealsPayload);
      setLoadState("ready");
    } catch (error) {
      setLoadError(readableDashboardError(error));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pipelineTotal = useMemo(() => {
    if (!dashboard) return 0;
    return Object.values(dashboard.pipeline || {}).reduce((sum, value) => sum + value, 0);
  }, [dashboard]);
  const focusDeals = useMemo(() => rankDealsByDecision(deals).slice(0, 4), [deals]);
  const decisionCounts = useMemo(() => dealDecisionCounts(deals), [deals]);
  const portfolioBrief = useMemo(() => portfolioCommandBrief(deals), [deals]);
  const capitalSteering = useMemo(() => dashboardCapitalSteeringBrief(deals), [deals]);
  const releaseRadar = useMemo(() => dashboardReleaseRadarBrief(deals), [deals]);
  const assetMonitor = useMemo(() => assetManagementBrief(deals), [deals]);

  if (loadState === "loading" || loadState === "error" || !dashboard) {
    const isError = loadState === "error";
    return (
      <div className="page">
        <section className={`pipeline-load-state ${isError ? "error" : "loading"}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isError ? "API-Fehler" : "Datenabruf"}</span>
            <h3>{isError ? "Dashboard konnte nicht geladen werden" : "Dashboard wird geladen"}</h3>
            <p>
              {isError
                ? loadError
                : "Portfolio-Leitstand, Akquise-Fokus und Kapitalwarnungen werden geladen. Noch keine Portfolio- oder Akquiseentscheidung ableiten."}
            </p>
          </div>
          {isError && (
            <button className="button primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Erneut laden
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Portfolio Akquise</h2>
          <p>Aktive Pipeline, Rendite, Cashflow und rote Flaggen.</p>
        </div>
        <Link className="button primary" href="/listings">
          <Mail size={16} />
          E-Mail-Import
        </Link>
      </section>

      <section className="metric-grid">
        <MetricCard icon={<Building2 size={18} />} label="Aktive Listings" value={dashboard.total_active_listings} />
        <MetricCard icon={<TrendingUp size={18} />} label="Aktive Deals" value={dashboard.active_deals} />
        <MetricCard icon={<Euro size={18} />} label="Ø Bruttorendite" value={formatPercent(dashboard.average_gross_yield)} />
        <MetricCard icon={<Euro size={18} />} label="Ø Nettorendite" value={formatPercent(dashboard.average_net_yield)} />
        <MetricCard icon={<AlertTriangle size={18} />} label="Red-flag Deals" value={dashboard.red_flagged_deals} tone="risk" />
      </section>

      <section className={`portfolio-command-band ${portfolioBrief.tone}`} aria-label="Portfolio-Leitstand">
        <div className="portfolio-command-head">
          <div>
            <span className="section-kicker">Portfolio-Leitstand</span>
            <h2>{portfolioBrief.headline}</h2>
            <p>{portfolioBrief.summary}</p>
          </div>
          <Link className="button" href="/pipeline">Pipeline steuern</Link>
        </div>

        <div className="portfolio-command-facts">
          {portfolioBrief.facts.map((fact) => (
            <div className={`portfolio-command-fact ${fact.tone}`} key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="portfolio-command-grid">
          <div className="portfolio-command-lanes">
            {portfolioBrief.lanes.map((lane) => (
              <article className={`portfolio-command-lane ${lane.tone}`} key={lane.label}>
                <div>
                  <span>{lane.label}</span>
                  <strong>{lane.count}</strong>
                </div>
                <p>{lane.detail}</p>
              </article>
            ))}
          </div>

          <div className="portfolio-command-list">
            <h3>Diese Woche</h3>
            <ol>
              {(portfolioBrief.weeklyFocus.length ? portfolioBrief.weeklyFocus : ["Neue Deals importieren und erste Underwritings rechnen."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>

          <div className="portfolio-command-list warning">
            <h3>Kapitalwarnungen</h3>
            <ul>
              {portfolioBrief.capitalWarnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <DashboardCapitalSteeringSection brief={capitalSteering} />
      <DashboardReleaseRadarSection brief={releaseRadar} />
      <DashboardAssetMonitorSection brief={assetMonitor} />

      <section className="dashboard-focus-grid">
        <div className="panel focus-panel">
          <div className="panel-header">
            <h2>Akquise-Fokus heute</h2>
            <Link href="/pipeline" className="text-link">Pipeline</Link>
          </div>
          {focusDeals.length === 0 ? (
            <p className="recommendation">Noch keine Deals fuer die Entscheidungsqueue.</p>
          ) : (
            <div className="focus-list">
              {focusDeals.map((deal) => {
                const brief = dealDecisionBrief(deal);
                const pricing = dealPricingBrief(deal);
                const actionPlan = dealActionPlanBrief(deal);
                const readiness = acquisitionReadinessSummary(deal);
                const evidence = dealEvidenceQualityBrief(deal);
                return (
                  <Link className={`focus-row ${brief.tone}`} href={`/deals/${deal.id}`} key={deal.id}>
                    <div className="focus-main">
                      <span className="section-kicker">{brief.headline}</span>
                      <strong>{deal.title}</strong>
                      <small>{deal.listing?.city || "Ort fehlt"} · {deal.pipeline_stage}</small>
                    </div>
                    <div className={`focus-action ${actionPlan.tone}`}>
                      <span>Naechste Aktion</span>
                      <strong>{actionPlan.primaryAction}</strong>
                      <small>Freigabe {readiness.readyCount}/{readiness.total} · Beleg-Score {evidence.percent} %</small>
                    </div>
                    <div className="focus-metrics">
                      <span>Cashflow <strong>{formatCurrency(deal.latest_underwriting?.monthly_cashflow_before_tax)}</strong></span>
                      <span>DSCR <strong>{formatNumber(deal.latest_underwriting?.dscr)}</strong></span>
                      <span>{pricing.label} <strong>{pricing.value}</strong></span>
                      <span>Preisanker <strong>{pricing.anchor}</strong></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Entscheidungen</h2>
            <span className="tag">{deals.length} Deals</span>
          </div>
          <div className="decision-count-grid">
            <DecisionCount label="Due Diligence" value={decisionCounts.buy} tone="good" />
            <DecisionCount label="Nachverhandeln" value={decisionCounts.negotiate} tone="watch" />
            <DecisionCount label="Beobachten" value={decisionCounts.watch} tone="empty" />
            <DecisionCount label="Ablehnen/hart verhandeln" value={decisionCounts.reject} tone="risk" />
          </div>
        </div>
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

type DashboardReleaseRadarItem = {
  deal: Deal;
  blockerLabel: string;
  blockerSummary: string;
  nextAction: string;
  proof: string;
  statusLabel: string;
  stopRule: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

type DashboardReleaseRadarBrief = {
  headline: string;
  summary: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  items: DashboardReleaseRadarItem[];
};

function DashboardReleaseRadarSection({ brief }: { brief: DashboardReleaseRadarBrief }) {
  return (
    <section className={`dashboard-release-radar ${brief.tone}`} aria-label="Dashboard-Freigaberadar">
      <div className="dashboard-release-head">
        <div>
          <span className="section-kicker">Freigaberadar</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`dashboard-release-status ${brief.tone}`}>
          <ShieldCheck size={18} />
          <span>{brief.statusLabel}</span>
        </div>
      </div>

      <div className="dashboard-release-facts">
        {brief.facts.map((fact) => (
          <article className={`dashboard-release-fact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      {brief.items.length === 0 ? (
        <p className="recommendation">Alle aktiven Deals sind angebotsreif oder es gibt noch keine aktiven Deals.</p>
      ) : (
        <div className="dashboard-release-grid">
          {brief.items.map((item, index) => (
            <article className={`dashboard-release-card ${item.tone}`} key={item.deal.id}>
              <div className="dashboard-release-rank">{index + 1}</div>
              <div className="dashboard-release-main">
                <span>{item.statusLabel}</span>
                <h4>{item.deal.title}</h4>
                <strong>{item.blockerLabel}</strong>
                <p>{item.blockerSummary}</p>
                <dl>
                  <div>
                    <dt>Beleg-Score</dt>
                    <dd>{item.proof}</dd>
                  </div>
                  <div>
                    <dt>Naechster Beleg</dt>
                    <dd>{item.nextAction}</dd>
                  </div>
                  <div>
                    <dt>Stop-Regel</dt>
                    <dd>{item.stopRule}</dd>
                  </div>
                </dl>
              </div>
              <Link className="button" href={`/deals/${item.deal.id}`}>Deal pruefen</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardAssetMonitorSection({ brief }: { brief: ReturnType<typeof assetManagementBrief> }) {
  return (
    <section
      className={`dashboard-release-radar asset-monitor-band ${brief.tone}`}
      aria-label="Bestands-Asset-Monitor"
    >
      <div className="dashboard-release-head">
        <div>
          <span className="section-kicker">Bestands-Asset-Monitor</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`dashboard-release-status ${brief.tone}`}>
          <Building2 size={18} />
          <span>{brief.statusLabel}</span>
        </div>
      </div>

      <div className="dashboard-release-facts">
        {brief.facts.map((fact) => (
          <article className={`dashboard-release-fact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      {brief.items.length === 0 ? (
        <p className="recommendation">Noch kein Bestand. Gekaufte Objekte werden hier nach Cashflow, Stress, WEG und Covenants ueberwacht.</p>
      ) : (
        <div className="dashboard-release-grid">
          {brief.items.slice(0, 4).map((item, index) => (
            <article className={`dashboard-release-card ${item.tone}`} key={item.dealId}>
              <div className="dashboard-release-rank">{`A${index + 1}`}</div>
              <div className="dashboard-release-main">
                <span>{item.statusLabel}</span>
                <h4>{item.title}</h4>
                <strong>{item.blocker}</strong>
                <p>{item.nextAction}</p>
                <dl>
                  <div>
                    <dt>Ort</dt>
                    <dd>{item.city}</dd>
                  </div>
                  <div>
                    <dt>Cashflow</dt>
                    <dd>{item.cashflow}</dd>
                  </div>
                  <div>
                    <dt>Stress-Cashflow</dt>
                    <dd>{item.stressCashflow}</dd>
                  </div>
                  <div>
                    <dt>DSCR / WEG</dt>
                    <dd>{item.dscr} · {item.wegScore}</dd>
                  </div>
                  <div>
                    <dt>Beweis</dt>
                    <dd>{item.proof}</dd>
                  </div>
                </dl>
              </div>
              <Link className="button" href={item.href}>Objekt pruefen</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function dashboardReleaseRadarBrief(deals: Deal[]): DashboardReleaseRadarBrief {
  const activeRows = deals
    .filter((deal) => deal.pipeline_stage !== "Rejected" && deal.pipeline_stage !== "Bought")
    .map((deal) => ({
      deal,
      readiness: acquisitionReadinessSummary(deal),
      evidence: dealEvidenceQualityBrief(deal)
    }));
  const readyCount = activeRows.filter((row) => row.readiness.status === "ready").length;
  const blockedCount = activeRows.filter((row) => row.readiness.status === "blocked").length;
  const reviewCount = activeRows.filter((row) => row.readiness.status === "needs_review").length;
  const items = activeRows
    .filter((row) => row.readiness.status !== "ready")
    .map(dashboardReleaseRadarItem)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 3);
  const averageEvidence = activeRows.length
    ? Math.round(activeRows.reduce((sum, row) => sum + row.evidence.percent, 0) / activeRows.length)
    : null;
  const tone: ReturnType<typeof scoreTone> = blockedCount > 0 ? "risk" : reviewCount > 0 ? "watch" : readyCount > 0 ? "good" : "empty";
  const topBlocker = items[0]?.blockerLabel || "Keiner";

  return {
    headline: `${readyCount} von ${activeRows.length} Deals angebotsreif`,
    summary: activeRows.length
      ? `${blockedCount} gesperrt, ${reviewCount} in Pruefung. Kein Angebot und keine Notarzeit reservieren, bis die Top-Blocker belegt sind.`
      : "Keine aktiven Deals fuer die Freigabepruefung. Erst Listings in Deals wandeln und Underwriting starten.",
    statusLabel: blockedCount > 0 ? `${blockedCount} blockiert` : reviewCount > 0 ? `${reviewCount} pruefen` : readyCount > 0 ? `${readyCount} frei` : "Offen",
    tone,
    facts: [
      { label: "Angebotsreif", value: String(readyCount), tone: readyCount > 0 ? "good" : "empty" },
      { label: "Gesperrt", value: String(blockedCount), tone: blockedCount > 0 ? "risk" : "good" },
      { label: "In Pruefung", value: String(reviewCount), tone: reviewCount > 0 ? "watch" : "good" },
      { label: "Ø Beleg-Score", value: averageEvidence !== null ? `${averageEvidence} %` : "Fehlt", tone: scoreTone(averageEvidence) },
      { label: "Top-Blocker", value: topBlocker, tone: items[0]?.tone || "empty" }
    ],
    items
  };
}

function dashboardReleaseRadarItem(row: {
  deal: Deal;
  readiness: ReturnType<typeof acquisitionReadinessSummary>;
  evidence: ReturnType<typeof dealEvidenceQualityBrief>;
}): DashboardReleaseRadarItem {
  const blocker =
    row.readiness.gates.find((gate) => gate.status === "block") ||
    row.readiness.gates.find((gate) => gate.status === "review") ||
    row.readiness.gates.find((gate) => gate.status !== "pass");
  const blockerLabel = blocker?.label || "Freigabe offen";
  const tone: ReturnType<typeof scoreTone> = blocker?.status === "block" ? "risk" : "watch";

  return {
    deal: row.deal,
    blockerLabel,
    blockerSummary: blocker?.summary || row.readiness.headline,
    nextAction: blocker?.actions[0] || row.readiness.nextActions[0] || "Freigabe-Gates mit Belegen schliessen.",
    proof: `${row.evidence.percent} % · ${row.readiness.readyCount}/${row.readiness.total} Gates`,
    statusLabel: row.readiness.status === "blocked" ? "Gesperrt" : "In Pruefung",
    stopRule: `Kein Angebot und keine Notarzeit, bis ${blockerLabel} belegt ist.`,
    tone,
    rankScore:
      (blocker?.status === "block" ? 1000 : 500) +
      (row.readiness.total - row.readiness.readyCount) * 50 +
      (100 - row.evidence.percent)
  };
}

type DashboardCapitalSteeringItem = {
  deal: Deal;
  cashflowPer100k: number;
  label: string;
  rule: string;
  rankScore: number;
  tone: ReturnType<typeof scoreTone>;
};

type DashboardCapitalSteeringBrief = {
  headline: string;
  summary: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  items: DashboardCapitalSteeringItem[];
};

function DashboardCapitalSteeringSection({ brief }: { brief: DashboardCapitalSteeringBrief }) {
  return (
    <section
      className={`capital-productivity-board dashboard-capital-steering ${brief.tone}`}
      aria-label="Dashboard-Kapitalsteuerung"
    >
      <div className="capital-productivity-head">
        <div>
          <span className="section-kicker">Eigenkapital-Steuerung</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`capital-productivity-status ${brief.tone}`}>
          <Wallet size={18} />
          <span>{brief.statusLabel}</span>
        </div>
      </div>

      <div className="capital-productivity-facts">
        {brief.facts.map((fact) => (
          <div className={`capital-productivity-fact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>

      {brief.items.length === 0 ? (
        <p className="recommendation">Noch keine Deals mit Cashflow und Eigenkapitalbedarf. Erst Underwriting rechnen.</p>
      ) : (
        <div className="capital-productivity-grid">
          {brief.items.map((item, index) => (
            <article className={`capital-productivity-card ${item.tone}`} key={item.deal.id}>
              <div className="capital-productivity-rank">{index + 1}</div>
              <div className="capital-productivity-card-main">
                <span className="section-kicker">{item.label}</span>
                <h4>{item.deal.title}</h4>
                <strong>{formatDashboardCapitalProductivity(item.cashflowPer100k)}</strong>
                <p>{item.rule}</p>
                <dl>
                  <div>
                    <dt>Cashflow je 100k EK</dt>
                    <dd>{formatDashboardCapitalProductivity(item.cashflowPer100k)}</dd>
                  </div>
                  <div>
                    <dt>Eigenkapital</dt>
                    <dd>{formatCurrency(item.deal.latest_underwriting?.equity_required)}</dd>
                  </div>
                  <div>
                    <dt>DSCR</dt>
                    <dd>{formatNumber(item.deal.latest_underwriting?.dscr)}</dd>
                  </div>
                </dl>
              </div>
              <Link className="button" href={`/deals/${item.deal.id}`}>Deal oeffnen</Link>
            </article>
          ))}
        </div>
      )}

      <div className="capital-productivity-actions">
        <Link className="button" href="/akquise">Kaufmaschine oeffnen</Link>
      </div>
    </section>
  );
}

function dashboardCapitalSteeringBrief(deals: Deal[]): DashboardCapitalSteeringBrief {
  const items = deals
    .map(dashboardCapitalSteeringItem)
    .filter((item): item is DashboardCapitalSteeringItem => item !== null)
    .sort((left, right) => right.rankScore - left.rankScore);
  const positiveItems = items.filter((item) => item.cashflowPer100k > 0);
  const trapItems = items.filter((item) => item.cashflowPer100k < 0 || item.tone === "risk");
  const best = positiveItems[0] || items[0] || null;
  const tone: ReturnType<typeof scoreTone> = !best
    ? "empty"
    : positiveItems.length > 0
      ? best.tone
      : "risk";

  return {
    headline: dashboardCapitalSteeringHeadline(best, positiveItems.length),
    summary: dashboardCapitalSteeringSummary(positiveItems.length),
    statusLabel: positiveItems.length > 0 ? `${positiveItems.length} positiv` : items.length > 0 ? "Kapital stoppen" : "Offen",
    tone,
    facts: [
      {
        label: positiveItems.length > 0 ? "Bester Deal" : "Kapital nicht binden",
        value: best?.deal.title || "Fehlt",
        tone
      },
      {
        label: "Cashflow je 100k EK",
        value: best ? formatDashboardCapitalProductivity(best.cashflowPer100k) : "Fehlt",
        tone
      },
      {
        label: "Positive Deals",
        value: String(positiveItems.length),
        tone: positiveItems.length > 0 ? "good" : "empty"
      },
      {
        label: "Kapitalfallen",
        value: String(trapItems.length),
        tone: trapItems.length > 0 ? "risk" : "good"
      }
    ],
    items: items.slice(0, 3)
  };
}

function dashboardCapitalSteeringItem(deal: Deal): DashboardCapitalSteeringItem | null {
  const cashflow = dashboardNumberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const equity = dashboardNumberValue(deal.latest_underwriting?.equity_required);
  if (cashflow === null || equity === null || equity <= 0) {
    return null;
  }

  const cashflowPer100k = (cashflow / equity) * 100000;
  const decision = dealDecisionBrief(deal);
  const tone = dashboardCapitalSteeringTone(decision.decision, cashflowPer100k);
  const label = dashboardCapitalSteeringLabel(decision.decision, cashflowPer100k);

  return {
    deal,
    cashflowPer100k,
    label,
    rule: dashboardCapitalSteeringRule(decision.decision, cashflowPer100k),
    rankScore: dashboardCapitalSteeringRankScore(deal, decision.decision, cashflowPer100k),
    tone
  };
}

function dashboardCapitalSteeringHeadline(best: DashboardCapitalSteeringItem | null, positiveCount: number): string {
  if (!best) {
    return "Eigenkapitalsteuerung noch nicht messbar";
  }
  if (positiveCount === 0) {
    return `Kapital nicht binden: ${best.deal.title}`;
  }
  return `Bester Kapitaleinsatz: ${best.deal.title}`;
}

function dashboardCapitalSteeringSummary(positiveCount: number): string {
  if (positiveCount === 0) {
    return "Kein Deal verdient aktuell Eigenkapital; erst Preis, Miete, Finanzierung oder Belege reparieren.";
  }
  return "Eigenkapital zuerst in Deals mit positivem Cashflow je 100k EK lenken; Kapitalfallen bleiben Nachverhandlung oder Ablehnung.";
}

function dashboardCapitalSteeringTone(
  decision: ReturnType<typeof dealDecisionBrief>["decision"],
  cashflowPer100k: number
): ReturnType<typeof scoreTone> {
  if (cashflowPer100k < 0 || decision === "reject") {
    return "risk";
  }
  if (cashflowPer100k >= 200 && decision === "buy") {
    return "good";
  }
  return "watch";
}

function dashboardCapitalSteeringLabel(
  decision: ReturnType<typeof dealDecisionBrief>["decision"],
  cashflowPer100k: number
): string {
  if (cashflowPer100k < 0 || decision === "reject") {
    return "Kapitalfalle";
  }
  if (decision === "buy" && cashflowPer100k >= 200) {
    return "Kapital arbeiten lassen";
  }
  return "Erst pruefen";
}

function dashboardCapitalSteeringRule(
  decision: ReturnType<typeof dealDecisionBrief>["decision"],
  cashflowPer100k: number
): string {
  if (cashflowPer100k < 0) {
    return "Nicht reservieren: Dieser Deal vernichtet Monatscashflow pro eingesetztem Eigenkapital.";
  }
  if (decision === "reject") {
    return "Nicht reservieren: Entscheidung und Kennzahlen blockieren Kapitalbindung.";
  }
  if (decision === "buy" && cashflowPer100k >= 200) {
    return "Kapital priorisieren: positiver Cashflow und Due-Diligence-Freigabe weiter vorbereiten.";
  }
  return "Nur weiterfuehren, wenn Belege, Preis und Banklogik die Kapitalproduktivitaet bestaetigen.";
}

function dashboardCapitalSteeringRankScore(
  deal: Deal,
  decision: ReturnType<typeof dealDecisionBrief>["decision"],
  cashflowPer100k: number
): number {
  const decisionBoost = decision === "buy" ? 1000 : decision === "negotiate" ? 420 : decision === "watch" ? 120 : -500;
  return decisionBoost + cashflowPer100k + (dashboardNumberValue(deal.latest_score?.total_score) || 0);
}

function formatDashboardCapitalProductivity(value: number): string {
  return `${formatCurrency(Math.round(value))}/100k EK`;
}

function dashboardNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function DecisionCount({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "good" | "watch" | "risk" | "empty";
}) {
  return (
    <div className={`decision-count ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function readableDashboardError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden des Dashboards.";
}
