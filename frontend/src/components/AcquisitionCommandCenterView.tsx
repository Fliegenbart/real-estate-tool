"use client";

import { AlertTriangle, CheckCircle, ClipboardList, Landmark, RefreshCw, Target, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getAcquisitionCommandCenter } from "../lib/api";
import {
  acquisitionDecisionLeverageBrief,
  acquisitionWorkOrderBrief,
  formatCurrency,
  formatNumber,
  formatPercent,
  scoreTone
} from "../lib/dealMetrics";
import { AcquisitionAssumptions, AcquisitionCommandCenter, DealDecision, ListingOpportunity } from "../lib/types";

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (nextAssumptions: AcquisitionAssumptions) => {
    setLoading(true);
    setLoadError(null);
    setCenter(null);
    try {
      setCenter(await getAcquisitionCommandCenter(nextAssumptions));
    } catch (error) {
      setLoadError(readableAcquisitionError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await load(DEFAULT_ASSUMPTIONS);
    }

    void initialLoad();
  }, [load]);

  function updateNumber<K extends keyof AcquisitionAssumptions>(key: K, value: string) {
    const parsed = Number(value);
    setAssumptions((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  if (loading && !center) {
    return (
      <div className="page">
        <section className="pipeline-load-state loading" role="status" aria-live="polite">
          <div>
            <span className="section-kicker">Datenabruf</span>
            <h3>Kaufmaschine wird geladen</h3>
            <p>Buy-Box, Kapitalpfad und Deal-Radar werden geladen. Noch keine Kauf- oder Kapitalentscheidung ableiten.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loadError && !center) {
    return (
      <div className="page">
        <section className="pipeline-load-state error" role="alert" aria-live="polite">
          <div>
            <span className="section-kicker">API-Fehler</span>
            <h3>Kaufmaschine konnte nicht geladen werden</h3>
            <p>{loadError}. Noch keine Kauf- oder Kapitalentscheidung ableiten.</p>
          </div>
          <button className="button primary" type="button" onClick={() => void load(DEFAULT_ASSUMPTIONS)}>
            <RefreshCw size={16} />
            Erneut laden
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Kaufmaschine vvGmbH</h2>
          <p>{center?.portfolio_capacity.active_pipeline_units ?? 0} Wohnungen in der Pipeline</p>
        </div>
        <button className="button primary" onClick={() => void load(assumptions)} disabled={loading}>
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
          <BuyBoxHealthSection center={center} assumptions={assumptions} />
          <CapitalProductivityBoard center={center} />
          <DecisionLeverageBoard center={center} />
          <WeeklyWorkOrderBoard center={center} />
          <FortyEightHourBlockerBoard center={center} />
          <DailyPriorityQueue center={center} />

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

function DecisionLeverageBoard({ center }: { center: AcquisitionCommandCenter }) {
  const brief = acquisitionDecisionLeverageBrief(center);

  return (
    <section className={`decision-leverage-board ${brief.tone}`} aria-label="Entscheidungshebel">
      <div className="decision-leverage-head">
        <div>
          <span className="section-kicker">Entscheidungshebel</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`decision-leverage-status ${brief.tone}`}>
          <Target size={18} />
          <span>{brief.levers.length} Hebel</span>
        </div>
      </div>

      {brief.levers.length === 0 ? (
        <p className="recommendation">Keine offenen Hebel. Neue Deals importieren oder Buy-Box enger einstellen.</p>
      ) : (
        <div className="decision-leverage-grid">
          {brief.levers.map((lever, index) => (
            <article className={`decision-leverage-card ${lever.tone}`} key={lever.key}>
              <div className="decision-leverage-rank">{index + 1}</div>
              <div className="decision-leverage-main">
                <span>{lever.owner}</span>
                <h4>{lever.label}</h4>
                <p>{lever.detail}</p>
                <small>{lever.value} · {lever.action}</small>
              </div>
              <Link className="button" href={lever.href}>Oeffnen</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WeeklyWorkOrderBoard({ center }: { center: AcquisitionCommandCenter }) {
  const brief = acquisitionWorkOrderBrief(center);

  return (
    <section className={`weekly-work-order-board ${brief.tone}`} aria-label="Wochen-Arbeitsauftraege">
      <div className="weekly-work-order-head">
        <div>
          <span className="section-kicker">Wochen-Arbeitsauftraege</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`weekly-work-order-status ${brief.tone}`}>
          <ClipboardList size={18} />
          <span>{brief.orders.length} offen</span>
        </div>
      </div>

      <div className="weekly-work-order-facts">
        {brief.facts.map((fact) => (
          <article className={`weekly-work-order-fact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      {brief.orders.length === 0 ? (
        <p className="recommendation">Keine offenen Wochenauftraege. Neue Listings importieren oder Buy-Box schaerfen.</p>
      ) : (
        <div className="weekly-work-order-list">
          {brief.orders.map((order, index) => (
            <article className={`weekly-work-order-card ${order.tone}`} key={order.id}>
              <div className="weekly-work-order-rank">{index + 1}</div>
              <div className="weekly-work-order-main">
                <span>{order.owner}</span>
                <h4>{order.label}</h4>
                <strong>{order.title}</strong>
                <small>{order.subtitle}</small>
                <dl>
                  <div>
                    <dt>Blocker</dt>
                    <dd>{order.blocker}</dd>
                  </div>
                  <div>
                    <dt>Beweis</dt>
                    <dd>{order.proof}</dd>
                  </div>
                  <div>
                    <dt>Naechster Schritt</dt>
                    <dd>{order.nextAction}</dd>
                  </div>
                </dl>
              </div>
              <Link className="button" href={order.href}>Oeffnen</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type FortyEightHourBlockerItem = {
  id: string;
  dueLabel: string;
  owner: string;
  title: string;
  label: string;
  blocker: string;
  proof: string;
  action: string;
  stopRule: string;
  href: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

type FortyEightHourBlockerBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  criticalCount: number;
  items: FortyEightHourBlockerItem[];
};

function FortyEightHourBlockerBoard({ center }: { center: AcquisitionCommandCenter }) {
  const brief = fortyEightHourBlockerBrief(center);

  return (
    <section className={`weekly-work-order-board ${brief.tone}`} aria-label="48h-Blockerboard">
      <div className="weekly-work-order-head">
        <div>
          <span className="section-kicker">48h-Blockerboard</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`weekly-work-order-status ${brief.tone}`}>
          <AlertTriangle size={18} />
          <span>{brief.criticalCount} kritisch</span>
        </div>
      </div>

      {brief.items.length === 0 ? (
        <p className="recommendation">Keine 48h-Blocker. Neue Deals importieren oder Buy-Box enger einstellen.</p>
      ) : (
        <div className="weekly-work-order-list">
          {brief.items.map((item, index) => (
            <article className={`weekly-work-order-card ${item.tone}`} key={item.id}>
              <div className="weekly-work-order-rank">{index + 1}</div>
              <div className="weekly-work-order-main">
                <span>{item.owner}</span>
                <h4>{item.label}</h4>
                <strong>{item.title}</strong>
                <small>{item.dueLabel}</small>
                <dl>
                  <div>
                    <dt>Blocker</dt>
                    <dd>{item.blocker}</dd>
                  </div>
                  <div>
                    <dt>Beweis</dt>
                    <dd>{item.proof}</dd>
                  </div>
                  <div>
                    <dt>Aktion</dt>
                    <dd>{item.action}</dd>
                  </div>
                  <div>
                    <dt>Stop-Regel</dt>
                    <dd>{item.stopRule}</dd>
                  </div>
                </dl>
              </div>
              <Link className="button" href={item.href}>{index === 0 && item.dueLabel === "48h" ? "Jetzt oeffnen" : "Oeffnen"}</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function fortyEightHourBlockerBrief(center: AcquisitionCommandCenter): FortyEightHourBlockerBrief {
  const workOrders = acquisitionWorkOrderBrief(center).orders;
  const items = workOrders
    .map(fortyEightHourBlockerItem)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 4);
  const criticalCount = items.filter((item) => item.tone === "risk").length;
  const topItem = items[0] || null;
  const hasCriticalBlocker = criticalCount > 0;
  const tone: ReturnType<typeof scoreTone> = criticalCount > 0 ? "risk" : items.length ? "watch" : "empty";

  return {
    headline: hasCriticalBlocker && topItem ? `48h-Fokus: ${topItem.label}` : "48h-Fokus: keine harten Blocker",
    summary: topItem
      ? hasCriticalBlocker
        ? `${items.length} zeitkritische Aufgaben. Erst den 48h-Blocker schliessen, dann Kapital, Angebot oder Besichtigung weiterziehen.`
        : `${items.length} Wochenaufgaben sichtbar, aber kein harter 48h-Blocker. Weiter priorisiert abarbeiten und nichts kuenstlich eskalieren.`
      : "Aktuell gibt es keinen zeitkritischen Deal- oder Listing-Blocker.",
    tone,
    criticalCount,
    items
  };
}

function fortyEightHourBlockerItem(order: ReturnType<typeof acquisitionWorkOrderBrief>["orders"][number]): FortyEightHourBlockerItem {
  const isCritical = order.tone === "risk";
  return {
    id: `sla-${order.id}`,
    dueLabel: isCritical ? "48h" : "Diese Woche",
    owner: order.owner,
    title: order.title,
    label: order.label,
    blocker: order.blocker,
    proof: order.proof,
    action: order.nextAction,
    stopRule: isCritical
      ? "Kein Kapital reservieren, kein LOI und kein Notartermin, bis der Blocker belegt ist."
      : "Nicht als erledigt markieren, bis Beweis und naechster Schritt im Dossier stehen.",
    href: order.href,
    tone: order.tone,
    rankScore: (isCritical ? 1000 : 500) + order.rankScore
  };
}

type DailyPriorityItem = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

function DailyPriorityQueue({ center }: { center: AcquisitionCommandCenter }) {
  const items = dailyPriorityItems(center);

  return (
    <section className="daily-priority-queue" aria-label="Tages-Prioritaetsqueue">
      <div className="daily-priority-head">
        <div>
          <span className="section-kicker">Tages-Prioritaetsqueue</span>
          <h3>Heute zuerst</h3>
          <p>{items.length} {items.length === 1 ? "Aufgabe" : "Aufgaben"} aus Deals und Listings.</p>
        </div>
        <div className="daily-priority-status">
          <ClipboardList size={18} />
          <span>{center.selected_deals_now.length} kaufbar</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="recommendation">Keine priorisierte Aufgabe. Neue Listings importieren oder Buy-Box enger einstellen.</p>
      ) : (
        <div className="daily-priority-list">
          {items.map((item, index) => (
            <article className={`daily-priority-card ${item.tone}`} key={item.id}>
              <div className="daily-priority-rank">{index + 1}</div>
              <div className="daily-priority-card-main">
                <span className="section-kicker">{item.label}</span>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
                <small>{item.subtitle}</small>
              </div>
              <Link className="button" href={item.href}>{item.actionLabel}</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function dailyPriorityItems(center: AcquisitionCommandCenter): DailyPriorityItem[] {
  const dealItems = center.deal_decisions
    .filter((deal) => deal.decision === "buy" || deal.decision === "negotiate")
    .map((deal) => dailyDealPriorityItem(deal));
  const listingItems = center.deal_radar
    .filter((listing) => listing.next_action.toLowerCase().includes("in deal wandeln"))
    .map((listing) => dailyListingPriorityItem(listing));
  const fallbackWatchItems =
    dealItems.length || listingItems.length
      ? []
      : center.deal_decisions.filter((deal) => deal.decision === "watch").map((deal) => dailyDealPriorityItem(deal));

  return [...dealItems, ...listingItems, ...fallbackWatchItems]
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 5);
}

function dailyDealPriorityItem(deal: DealDecision): DailyPriorityItem {
  const isBuy = deal.decision === "buy";
  const label = isBuy ? "Kauf vorbereiten" : deal.decision === "negotiate" ? "Nachverhandeln" : "Daten schliessen";
  const tone: ReturnType<typeof scoreTone> = isBuy ? "good" : deal.decision === "negotiate" ? "watch" : "empty";
  const baseScore = isBuy ? 300 : deal.decision === "negotiate" ? 220 : 120;
  const constraint = deal.constraints[0] || deal.next_action;

  return {
    id: `deal-${deal.deal_id}`,
    label,
    title: deal.title,
    subtitle: `${deal.city || "Ort fehlt"} · ${deal.pipeline_stage} · Score ${deal.total_score ?? "-"}`,
    detail: constraint,
    href: `/deals/${deal.deal_id}`,
    actionLabel: "Deal oeffnen",
    tone,
    rankScore: baseScore + deal.priority_score
  };
}

function dailyListingPriorityItem(listing: ListingOpportunity): DailyPriorityItem {
  return {
    id: `listing-${listing.id}`,
    label: "Listing wandeln",
    title: listing.title,
    subtitle: `${listing.city || "Ort fehlt"} · Score ${listing.priority_score} · ${listing.days_on_market ?? "-"} Tage online`,
    detail: listing.next_action,
    href: "/listings",
    actionLabel: "Listing pruefen",
    tone: "watch",
    rankScore: 180 + listing.priority_score
  };
}

function readableAcquisitionError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden der Kaufmaschine";
}

type CapitalProductivityItem = {
  deal: DealDecision;
  label: string;
  cashflowPer100k: number | null;
  repair: CapitalRepairTarget | null;
  tone: ReturnType<typeof scoreTone>;
  rule: string;
  rankScore: number;
};

type CapitalRepairTarget = {
  headline: string;
  cashflowGap: string;
  dscrTarget: string;
  target: string;
  rule: string;
};

type CapitalProductivityBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  items: CapitalProductivityItem[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

function CapitalProductivityBoard({ center }: { center: AcquisitionCommandCenter }) {
  const brief = capitalProductivityBrief(center);

  return (
    <section className={`capital-productivity-board ${brief.tone}`} aria-label="Kapitalproduktivitaet">
      <div className="capital-productivity-head">
        <div>
          <span className="section-kicker">Kapitalproduktivitaet</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`capital-productivity-status ${brief.tone}`}>
          <Wallet size={18} />
          <span>{brief.items.length} Deals</span>
        </div>
      </div>

      <div className="capital-productivity-facts">
        {brief.facts.map((fact) => (
          <article className={`capital-productivity-fact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      {brief.items.length === 0 ? (
        <p className="recommendation">Noch keine Deal-Daten fuer Kapitalproduktivitaet. Erst Underwriting und EK-Bedarf rechnen.</p>
      ) : (
        <div className="capital-productivity-grid">
          {brief.items.map((item, index) => (
            <article className={`capital-productivity-card ${item.tone}`} key={item.deal.deal_id}>
              <div className="capital-productivity-rank">{index + 1}</div>
              <div className="capital-productivity-card-main">
                <span className="section-kicker">{item.label}</span>
                <h4>{item.deal.title}</h4>
                <strong>{formatCapitalProductivity(item.cashflowPer100k)}</strong>
                <p>{item.rule}</p>
                <dl>
                  <div>
                    <dt>Cashflow je 100k EK</dt>
                    <dd>{formatCapitalProductivity(item.cashflowPer100k)}</dd>
                  </div>
                  <div>
                    <dt>EK/WE</dt>
                    <dd>{formatCurrency(item.deal.equity_per_unit)}</dd>
                  </div>
                  <div>
                    <dt>DSCR</dt>
                    <dd>{formatNumber(item.deal.dscr)}</dd>
                  </div>
                </dl>
                {item.repair && (
                  <div className="capital-repair-panel">
                    <span>{item.repair.headline}</span>
                    <strong>{item.repair.cashflowGap}</strong>
                    <small>{item.repair.dscrTarget}</small>
                    <p>{item.repair.target}</p>
                    <em>{item.repair.rule}</em>
                  </div>
                )}
              </div>
              <Link className="button" href={`/deals/${item.deal.deal_id}`}>Deal oeffnen</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function capitalProductivityBrief(center: AcquisitionCommandCenter): CapitalProductivityBrief {
  const items = center.deal_decisions
    .map(capitalProductivityItem)
    .filter((item): item is CapitalProductivityItem => item !== null)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 4);
  const best = items[0] || null;
  const traps = items.filter((item) => item.tone === "risk").length;
  const positiveItems = items.filter((item) => item.cashflowPer100k !== null && item.cashflowPer100k > 0);
  const averageCashflow =
    positiveItems.length > 0
      ? positiveItems.reduce((sum, item) => sum + (item.cashflowPer100k || 0), 0) / positiveItems.length
      : null;
  const tone: ReturnType<typeof scoreTone> = positiveItems.length > 0 ? (traps > 0 ? "watch" : "good") : traps > 0 ? "risk" : "empty";

  return {
    headline: capitalProductivityHeadline(best, positiveItems.length),
    summary: capitalProductivitySummary(positiveItems.length),
    tone,
    items,
    facts: [
      {
        label: positiveItems.length > 0 ? "Bester Deal" : "Kapital nicht binden",
        value: best ? best.deal.title : "Fehlt",
        tone: best?.tone || "empty"
      },
      {
        label: "Cashflow je 100k EK",
        value: formatCapitalProductivity(best?.cashflowPer100k ?? null),
        tone: best?.tone || "empty"
      },
      {
        label: "Positive Deals",
        value: String(positiveItems.length),
        tone: positiveItems.length > 0 ? "good" : "empty"
      },
      {
        label: "Kapitalfallen",
        value: String(traps),
        tone: traps > 0 ? "risk" : "good"
      },
      {
        label: "Schnitt positiv",
        value: formatCapitalProductivity(averageCashflow),
        tone: averageCashflow !== null && averageCashflow > 0 ? "good" : "empty"
      }
    ]
  };
}

function capitalProductivityHeadline(best: CapitalProductivityItem | null, positiveCount: number): string {
  if (!best) {
    return "Kapitalproduktivitaet noch nicht messbar";
  }
  if (positiveCount === 0 || best.tone === "risk") {
    return `Kapital nicht binden: ${best.deal.title}`;
  }
  return `Bester Einsatz: ${best.deal.title}`;
}

function capitalProductivitySummary(positiveCount: number): string {
  if (positiveCount === 0) {
    return "Kein Deal verdient aktuell Eigenkapital; erst Preis, Miete, Finanzierung oder Belege reparieren.";
  }
  return "Kapital zuerst in Deals mit positivem Cashflow je 100k EK lenken; negative Kapitalproduktivitaet bleibt Nachverhandlung oder Ablehnung.";
}

function capitalProductivityItem(deal: DealDecision): CapitalProductivityItem | null {
  if (!deal.equity_required || deal.equity_required <= 0) {
    return null;
  }

  const cashflowPer100k = (deal.monthly_cashflow_before_tax / deal.equity_required) * 100000;
  const tone = capitalProductivityTone(deal, cashflowPer100k);
  const label = capitalProductivityLabel(deal, cashflowPer100k);
  const rankScore = capitalProductivityRankScore(deal, cashflowPer100k);

  return {
    deal,
    label,
    cashflowPer100k,
    repair: capitalRepairTarget(deal, cashflowPer100k),
    tone,
    rule: capitalProductivityRule(deal, cashflowPer100k),
    rankScore
  };
}

function capitalProductivityTone(deal: DealDecision, cashflowPer100k: number): ReturnType<typeof scoreTone> {
  if (cashflowPer100k < 0 || deal.decision === "reject") {
    return "risk";
  }
  if (cashflowPer100k >= 200 && deal.decision === "buy") {
    return "good";
  }
  return "watch";
}

function capitalProductivityLabel(deal: DealDecision, cashflowPer100k: number): string {
  if (cashflowPer100k < 0) {
    return "Kapitalfalle";
  }
  if (deal.decision === "buy") {
    return "Kapitalhebel";
  }
  if (deal.decision === "negotiate") {
    return "Reparierbar";
  }
  return "Pruefen";
}

function capitalProductivityRule(deal: DealDecision, cashflowPer100k: number): string {
  if (cashflowPer100k < 0) {
    return "Nicht kaufen: erst Preis, Miete oder Finanzierung reparieren.";
  }
  if (deal.decision === "buy") {
    return "Kapital zuerst in diesen Deal lenken, dann Bankpaket und Unterlagenfreigabe vorbereiten.";
  }
  if (deal.decision === "negotiate") {
    return "Nur weiterfuehren, wenn Nachverhandlung die Kapitalproduktivitaet positiv macht.";
  }
  return "Daten schliessen, bevor Eigenkapital reserviert wird.";
}

function capitalRepairTarget(deal: DealDecision, cashflowPer100k: number): CapitalRepairTarget | null {
  const monthlyCashflowGap = Math.max(0, Math.ceil(0 - deal.monthly_cashflow_before_tax));
  const dscrTarget = 1.1;
  const dscrGap = deal.dscr !== null && deal.dscr !== undefined ? Math.max(0, dscrTarget - deal.dscr) : 0;

  if (cashflowPer100k >= 0 && monthlyCashflowGap === 0 && dscrGap === 0) {
    return null;
  }

  return {
    headline: "Kapital-Reparatur",
    cashflowGap:
      monthlyCashflowGap > 0
        ? `Cashflow-Luecke: ${plainCurrency(monthlyCashflowGap)}/Monat`
        : "Cashflow-Luecke: geschlossen",
    dscrTarget: `DSCR-Ziel: ${formatFixedDecimal(dscrTarget)}`,
    target:
      monthlyCashflowGap > 0
        ? `Monatscashflow auf ${plainCurrency(0)} bringen`
        : `DSCR auf mindestens ${formatFixedDecimal(dscrTarget)} bringen`,
    rule:
      "Preis, Miete oder Finanzierung so reparieren, dass kein negatives Eigenkapital pro 100k EK mehr gebunden wird."
  };
}

function capitalProductivityRankScore(deal: DealDecision, cashflowPer100k: number): number {
  const decisionBoost = deal.decision === "buy" ? 1000 : deal.decision === "negotiate" ? 400 : deal.decision === "watch" ? 100 : 0;
  const cashflowBoost = Number.isFinite(cashflowPer100k) ? cashflowPer100k : -1000;
  return decisionBoost + cashflowBoost + deal.priority_score;
}

function formatFixedDecimal(value: number): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatCapitalProductivity(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Fehlt";
  }
  return `${plainCurrency(Math.round(value))}/100k EK`;
}

type BuyBoxBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  cards: Array<{
    label: string;
    value: string;
    detail: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  weeklyFocus: string[];
};

function BuyBoxHealthSection({
  center,
  assumptions
}: {
  center: AcquisitionCommandCenter;
  assumptions: AcquisitionAssumptions;
}) {
  const brief = buyBoxBrief(center, assumptions);
  const icon = brief.tone === "good" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />;

  return (
    <section className={`buy-box-health ${brief.tone}`} aria-label="Buy-Box-Check">
      <div className="buy-box-health-head">
        <div>
          <span className="section-kicker">Buy-Box-Check</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`buy-box-health-status ${brief.tone}`}>
          {icon}
          <span>{center.selected_deals_now.length} kaufbar</span>
        </div>
      </div>

      <div className="buy-box-health-grid">
        {brief.cards.map((card) => (
          <article className={`buy-box-health-card ${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>

      <div className="buy-box-weekly">
        <div className="buy-box-weekly-title">
          <ClipboardList size={16} />
          <h4>Diese Woche</h4>
        </div>
        <ol>
          {brief.weeklyFocus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function buyBoxBrief(center: AcquisitionCommandCenter, assumptions: AcquisitionAssumptions): BuyBoxBrief {
  const selectedCount = center.selected_deals_now.length;
  const dealCount = center.deal_decisions.length;
  const negotiateDeals = center.deal_decisions.filter((deal) => deal.decision === "negotiate");
  const watchDeals = center.deal_decisions.filter((deal) => deal.decision === "watch");
  const rejectedDeals = center.deal_decisions.filter((deal) => deal.decision === "reject");
  const readyListings = center.deal_radar.filter((listing) => listing.next_action.toLowerCase().includes("in deal wandeln"));
  const topConstraint = mostCommonConstraint(center.deal_decisions);
  const topListing = center.deal_radar[0] || null;
  const remainingEquity = center.portfolio_capacity.remaining_equity_after_selected_deals;
  const tone: ReturnType<typeof scoreTone> = selectedCount > 0 ? "good" : negotiateDeals.length > 0 ? "watch" : "empty";
  const headline = buyBoxHeadline(selectedCount, negotiateDeals.length, readyListings.length, dealCount);
  const summary = `${selectedCount} kaufbare Deals aus ${dealCount} geprueften Deals. ${plainCurrency(remainingEquity)} Kapital bleibt nach Auswahl frei.`;

  return {
    headline,
    tone,
    summary,
    cards: [
      {
        label: "Kapital",
        value: `${plainCurrency(remainingEquity)} frei`,
        detail: `${plainCurrency(center.portfolio_capacity.deployable_equity_now)} aktuell einsetzbar; Limit ${plainCurrency(assumptions.maximum_equity_per_unit)} EK je Wohnung.`,
        tone: remainingEquity > 0 && selectedCount === 0 ? "watch" : "good"
      },
      {
        label: "Deal-Bremse",
        value: topConstraint || "Keine harte Deal-Bremse",
        detail: `${negotiateDeals.length} Nachverhandlung · ${watchDeals.length} Datenluecke · ${rejectedDeals.length} Ablehnung.`,
        tone: topConstraint ? "watch" : "good"
      },
      {
        label: "Listing-Auftrag",
        value: topListing?.title || "Kein Listing im Radar",
        detail: topListing?.next_action || "Neue Suchagenten und Marktquellen einspeisen.",
        tone: readyListings.length > 0 ? "watch" : "empty"
      },
      {
        label: "Buy-Box-Regel",
        value: `Score ${assumptions.minimum_total_score}+ · DSCR ${formatNumber(assumptions.minimum_dscr)}+`,
        detail: `Cashflow ab ${plainCurrency(assumptions.minimum_monthly_cashflow_before_tax)} und Kapitaldisziplin je Einheit.`,
        tone: "empty"
      }
    ],
    weeklyFocus: buyBoxWeeklyFocus({ negotiateDeals, readyListings, selectedCount, watchDeals })
  };
}

function buyBoxHeadline(selectedCount: number, negotiateCount: number, readyListingCount: number, dealCount: number): string {
  if (selectedCount > 0) {
    return "Buy-Box liefert kaufbare Deals";
  }
  if (negotiateCount > 0) {
    return "Wirtschaftlichkeit blockiert die Kaufmaschine";
  }
  if (readyListingCount > 0) {
    return "Listing-Zufluss in echte Deals wandeln";
  }
  if (dealCount > 0) {
    return "Datenluecken blockieren die Buy-Box";
  }
  return "Kaufmaschine wartet auf neue Deals";
}

function buyBoxWeeklyFocus({
  negotiateDeals,
  readyListings,
  selectedCount,
  watchDeals
}: {
  negotiateDeals: DealDecision[];
  readyListings: AcquisitionCommandCenter["deal_radar"];
  selectedCount: number;
  watchDeals: DealDecision[];
}): string[] {
  const focus: string[] = [];
  if (negotiateDeals.length > 0) {
    focus.push(`${negotiateDeals.length} ${dealWord(negotiateDeals.length)} hart nachverhandeln: ${negotiateDeals[0].next_action}`);
  }
  if (readyListings.length > 0) {
    focus.push(`${readyListings.length} ${listingWord(readyListings.length)} in Deal wandeln und voll unterwriten.`);
  }
  if (selectedCount > 0) {
    focus.push(`${selectedCount} kaufbare ${dealWord(selectedCount)} mit Bankenpaket und Unterlagenfreigabe vorbereiten.`);
  }
  if (watchDeals.length > 0) {
    focus.push(`${watchDeals.length} ${dealWord(watchDeals.length)} mit fehlenden Daten schliessen, dann neu rechnen.`);
  }
  return focus.length ? focus.slice(0, 4) : ["Neue Suchagenten-Listings importieren und erste Underwritings rechnen."];
}

function mostCommonConstraint(decisions: DealDecision[]): string | null {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    for (const constraint of decision.constraints) {
      counts.set(constraint, (counts.get(constraint) || 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [constraint, count] of counts) {
    if (count > bestCount) {
      best = constraint;
      bestCount = count;
    }
  }
  return best;
}

function dealWord(count: number): string {
  return count === 1 ? "Deal" : "Deals";
}

function listingWord(count: number): string {
  return count === 1 ? "Listing" : "Listings";
}

function plainCurrency(value: number | null | undefined): string {
  return formatCurrency(value).replace(/\s/g, " ");
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
