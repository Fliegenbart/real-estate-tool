"use client";

import { AlertTriangle, CheckCircle, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getDeals, updatePipeline } from "../lib/api";
import {
  acquisitionReadinessSummary,
  dealActionPlanBrief,
  dealDecisionBrief,
  dealEvidenceQualityBrief,
  dealPricingBrief,
  formatCurrency,
  formatNumber,
  groupDealsByStage,
  scoreTone
} from "../lib/dealMetrics";
import { Deal, PIPELINE_STAGES, PipelineStage } from "../lib/types";

type PipelineLoadState = "loading" | "ready" | "error";

export function PipelineView() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadState, setLoadState] = useState<PipelineLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const grouped = useMemo(() => groupDealsByStage(deals), [deals]);
  const isLoading = loadState === "loading";
  const isError = loadState === "error";
  const isReady = loadState === "ready";

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setPipelineError(null);
    try {
      setDeals(await getDeals());
      setLoadState("ready");
    } catch (error) {
      setDeals([]);
      setLoadError(readablePipelineError(error));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(deal: Deal, stage: PipelineStage) {
    setPipelineError(null);
    try {
      const updated = await updatePipeline(deal.id, stage);
      setDeals((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : "Pipeline-Stage konnte nicht aktualisiert werden.");
    }
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Deal Pipeline</h2>
          <p>
            {isLoading
              ? "Pipeline-Daten werden geladen. Noch keine Pipeline-Entscheidung ableiten."
              : isError
                ? "Pipeline konnte nicht geladen werden. Bitte Backend oder Proxy pruefen."
                : `${deals.length} aktive Pipeline-Eintraege`}
          </p>
        </div>
        <Link className="button primary" href="/listings">Listings</Link>
      </section>
      {(isLoading || isError) && (
        <section className={`pipeline-load-state ${loadState}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isLoading ? "Datenabruf" : "API-Fehler"}</span>
            <h3>{isLoading ? "Pipeline wird geladen" : "Pipeline konnte nicht geladen werden"}</h3>
            <p>
              {isLoading
                ? "Deals, Stages und Freigabe-Gates werden geladen. Noch keine Pipeline-Entscheidung ableiten."
                : loadError}
            </p>
          </div>
          {isError && (
            <button className="button primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Erneut laden
            </button>
          )}
        </section>
      )}
      {pipelineError && (
        <div className="pipeline-error" role="alert">
          <strong>Stage-Wechsel blockiert</strong>
          <span>{pipelineError}</span>
        </div>
      )}
      {isReady && (
        <>
          <PipelineReleaseCockpit deals={deals} />
          <section className="kanban">
            {PIPELINE_STAGES.map((stage) => (
              <div className="kanban-column" key={stage}>
                <div className="kanban-title">
                  <strong>{stage}</strong>
                  <span>{grouped[stage].length}</span>
                </div>
                {grouped[stage].map((deal) => <PipelineDealCard deal={deal} key={deal.id} onMove={move} />)}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function readablePipelineError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden der Pipeline.";
}

type PipelineDealCardProps = {
  deal: Deal;
  onMove: (deal: Deal, stage: PipelineStage) => void;
};

type PipelineReleaseBlocker = {
  label: string;
  count: number;
  blockedCount: number;
  action: string;
  tone: ReturnType<typeof scoreTone>;
};

type PipelineReleaseBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  activeCount: number;
  readyCount: number;
  blockedCount: number;
  reviewCount: number;
  topBlocker: PipelineReleaseBlocker | null;
  blockers: PipelineReleaseBlocker[];
};

function PipelineReleaseCockpit({ deals }: { deals: Deal[] }) {
  const brief = pipelineReleaseBrief(deals);
  const statusIcon = brief.tone === "good" ? <CheckCircle size={18} /> : brief.tone === "risk" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />;

  return (
    <section className={`pipeline-release-cockpit ${brief.tone}`} aria-label="Pipeline-Freigabe-Cockpit">
      <div className="pipeline-release-head">
        <div>
          <span className="section-kicker">Pipeline-Freigabe-Cockpit</span>
          <h3>{brief.headline}</h3>
          <p>{brief.summary}</p>
        </div>
        <div className={`pipeline-release-status ${brief.tone}`}>
          {statusIcon}
          <span>{brief.activeCount} aktiv</span>
        </div>
      </div>

      <div className="pipeline-release-grid">
        <PipelineReleaseFact label="Angebotsreif" tone={brief.readyCount > 0 ? "good" : "empty"} value={String(brief.readyCount)} />
        <PipelineReleaseFact label="Gesperrt" tone={brief.blockedCount > 0 ? "risk" : "good"} value={String(brief.blockedCount)} />
        <PipelineReleaseFact label="In Pruefung" tone={brief.reviewCount > 0 ? "watch" : "good"} value={String(brief.reviewCount)} />
        <PipelineReleaseFact label="Top-Blocker" tone={brief.topBlocker?.tone || "empty"} value={brief.topBlocker?.label || "Keiner"} />
      </div>

      {brief.topBlocker ? (
        <div className={`pipeline-release-next ${brief.topBlocker.tone}`}>
          <div>
            <span>Top-Blocker</span>
            <strong>{brief.topBlocker.label}</strong>
            <p>{brief.topBlocker.action}</p>
          </div>
          <small>Keine Offer- oder Notarverschiebung, bis dieser Blocker im Dossier belegt ist.</small>
        </div>
      ) : (
        <div className="pipeline-release-next good">
          <div>
            <span>Naechster Schritt</span>
            <strong>Freigaben halten</strong>
            <p>Alle aktiven Deals sind angebotsreif; Angebotsband, Bankpaket und Dossier final abgleichen.</p>
          </div>
          <small>Offer und Notar bleiben an dokumentierte Bedingungen gekoppelt.</small>
        </div>
      )}

      {brief.blockers.length > 0 && (
        <div className="pipeline-release-blockers">
          {brief.blockers.map((blocker) => (
            <article className={`pipeline-release-blocker ${blocker.tone}`} key={blocker.label}>
              <span>{blocker.label}</span>
              <strong>{blocker.count}</strong>
              <small>{blocker.blockedCount > 0 ? `${blocker.blockedCount} blockiert` : "Pruefen"}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PipelineReleaseFact({
  label,
  tone,
  value
}: {
  label: string;
  tone: ReturnType<typeof scoreTone>;
  value: string;
}) {
  return (
    <article className={`pipeline-release-fact ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function pipelineReleaseBrief(deals: Deal[]): PipelineReleaseBrief {
  const activeDeals = deals.filter((deal) => deal.pipeline_stage !== "Rejected" && deal.pipeline_stage !== "Bought");
  const rows = activeDeals.map((deal) => ({
    deal,
    readiness: acquisitionReadinessSummary(deal)
  }));
  const readyCount = rows.filter((row) => row.readiness.status === "ready").length;
  const blockedCount = rows.filter((row) => row.readiness.status === "blocked").length;
  const reviewCount = rows.filter((row) => row.readiness.status === "needs_review").length;
  const blockers = pipelineReleaseBlockers(rows.map((row) => row.readiness));
  const topBlocker = blockers[0] || null;
  const tone: ReturnType<typeof scoreTone> = blockedCount > 0 ? "risk" : reviewCount > 0 ? "watch" : readyCount > 0 ? "good" : "empty";

  return {
    headline: `Pipeline-Freigabe: ${readyCount} angebotsreif`,
    summary: activeDeals.length
      ? `${blockedCount} gesperrt, ${reviewCount} in Pruefung. Offer, Due Diligence und Notar laufen nur mit voll belegten Gates weiter.`
      : "Keine aktiven Deals in der Pipeline. Neue Listings importieren oder Underwriting starten.",
    tone,
    activeCount: activeDeals.length,
    readyCount,
    blockedCount,
    reviewCount,
    topBlocker,
    blockers
  };
}

function pipelineReleaseBlockers(
  readinessRows: Array<ReturnType<typeof acquisitionReadinessSummary>>
): PipelineReleaseBlocker[] {
  const groups = new Map<string, PipelineReleaseBlocker>();

  for (const readiness of readinessRows) {
    for (const gate of readiness.gates.filter((item) => item.status !== "pass")) {
      const existing = groups.get(gate.label);
      if (existing) {
        existing.count += 1;
        existing.blockedCount += gate.status === "block" ? 1 : 0;
        existing.tone = existing.blockedCount > 0 ? "risk" : "watch";
        if (gate.status === "block" && !existing.action.includes(gate.actions[0] || "")) {
          existing.action = gate.actions[0] || existing.action;
        }
      } else {
        groups.set(gate.label, {
          label: gate.label,
          count: 1,
          blockedCount: gate.status === "block" ? 1 : 0,
          action: gate.actions[0] || gate.summary,
          tone: gate.status === "block" ? "risk" : "watch"
        });
      }
    }
  }

  return [...groups.values()]
    .sort((left, right) => right.blockedCount - left.blockedCount || right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function PipelineDealCard({ deal, onMove }: PipelineDealCardProps) {
  const decision = dealDecisionBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const actionPlan = dealActionPlanBrief(deal);
  const pricing = dealPricingBrief(deal);
  const stageGate = pipelineStageGateBrief(readiness);
  const cashflow = deal.latest_underwriting?.monthly_cashflow_before_tax;
  const dscr = deal.latest_underwriting?.dscr;

  return (
    <article className={`deal-card ${decision.tone}`} aria-label={`Pipeline-Deal-Karte: ${deal.title}`}>
      <div className="deal-card-head">
        <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
        <span className={`score ${scoreTone(deal.latest_score?.total_score)}`}>{deal.latest_score?.total_score ?? "-"}</span>
      </div>
      <div className="deal-card-meta">
        <span>{deal.listing?.city || "Ort fehlt"}</span>
        <span>{formatPipelineCurrency(deal.listing?.purchase_price)}</span>
      </div>
      <div className={`pipeline-card-decision ${actionPlan.tone}`}>
        <span className="section-kicker">{decision.headline}</span>
        <strong>{actionPlan.primaryAction}</strong>
        <small>
          Freigabe {readiness.readyCount}/{readiness.total} · Beleg-Score {evidence.percent} %
        </small>
      </div>
      <div className="pipeline-card-metrics">
        <PipelineCardMetric label="Cashflow" tone={cashflowTone(cashflow)} value={formatPipelineCurrency(cashflow)} />
        <PipelineCardMetric label="DSCR" tone={dscrPipelineTone(dscr)} value={formatNumber(dscr)} />
        <PipelineCardMetric label="Preisanker" tone={pricing.tone} value={pricing.anchor} />
      </div>
      <div className={`pipeline-stage-gate ${stageGate.tone}`}>
        <span>Stage-Gate</span>
        <strong>{stageGate.headline}</strong>
        <small>{stageGate.detail}</small>
        <em>{stageGate.meta}</em>
      </div>
      <select
        aria-label={`Pipeline-Stage fuer ${deal.title}`}
        value={deal.pipeline_stage}
        onChange={(event) => onMove(deal, event.target.value as PipelineStage)}
      >
        {PIPELINE_STAGES.map((item) => (
          <option
            disabled={pipelineStageIsBlocked(item, deal.pipeline_stage, stageGate)}
            key={item}
            title={pipelineStageIsBlocked(item, deal.pipeline_stage, stageGate) ? stageGate.detail : undefined}
          >
            {item}
          </option>
        ))}
      </select>
    </article>
  );
}

function PipelineCardMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: ReturnType<typeof scoreTone>;
  value: string;
}) {
  return (
    <div className={`pipeline-card-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPipelineCurrency(value: number | null | undefined): string {
  return formatCurrency(value).replace(/\s/g, " ");
}

function cashflowTone(value: number | null | undefined): ReturnType<typeof scoreTone> {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "empty";
  }
  return value >= 0 ? "good" : "risk";
}

function dscrPipelineTone(value: number | null | undefined): ReturnType<typeof scoreTone> {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "empty";
  }
  if (value >= 1.1) {
    return "good";
  }
  if (value >= 1) {
    return "watch";
  }
  return "risk";
}

type PipelineStageGateBrief = {
  ready: boolean;
  headline: string;
  detail: string;
  meta: string;
  tone: ReturnType<typeof scoreTone>;
};

const gatedPipelineStages = new Set<PipelineStage>([
  "Offer submitted",
  "Due diligence",
  "Notary",
  "Bought"
]);

function pipelineStageGateBrief(
  readiness: ReturnType<typeof acquisitionReadinessSummary>
): PipelineStageGateBrief {
  const ready = readiness.readyCount === readiness.total;
  const meta = `${readiness.readyCount}/${readiness.total} Gates bestanden`;

  if (ready) {
    return {
      ready,
      headline: "Freigabe bereit",
      detail: "Angebot, Due Diligence und Notar koennen mit dokumentierten Bedingungen vorbereitet werden.",
      meta,
      tone: "good"
    };
  }

  return {
    ready,
    headline: "Angebot, Due Diligence und Notar gesperrt",
    detail: "Erst Freigabe-Gates schliessen, bevor der Deal in Angebots- oder Notarphasen wandert.",
    meta,
    tone: readiness.readyCount > 0 ? "watch" : "risk"
  };
}

function pipelineStageIsBlocked(
  targetStage: PipelineStage,
  currentStage: PipelineStage,
  stageGate: PipelineStageGateBrief
): boolean {
  if (stageGate.ready || targetStage === currentStage || targetStage === "Rejected") {
    return false;
  }
  return gatedPipelineStages.has(targetStage);
}
