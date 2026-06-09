"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getDeals, updatePipeline } from "../lib/api";
import { formatCurrency, groupDealsByStage, scoreTone } from "../lib/dealMetrics";
import { Deal, PIPELINE_STAGES, PipelineStage } from "../lib/types";

export function PipelineView() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const grouped = useMemo(() => groupDealsByStage(deals), [deals]);

  useEffect(() => {
    getDeals().then(setDeals);
  }, []);

  async function move(deal: Deal, stage: PipelineStage) {
    const updated = await updatePipeline(deal.id, stage);
    setDeals((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Deal Pipeline</h2>
          <p>{deals.length} aktive Pipeline-Eintraege</p>
        </div>
        <Link className="button primary" href="/listings">Listings</Link>
      </section>
      <section className="kanban">
        {PIPELINE_STAGES.map((stage) => (
          <div className="kanban-column" key={stage}>
            <div className="kanban-title">
              <strong>{stage}</strong>
              <span>{grouped[stage].length}</span>
            </div>
            {grouped[stage].map((deal) => (
              <article className="deal-card" key={deal.id}>
                <div className="deal-card-head">
                  <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
                  <span className={`score ${scoreTone(deal.latest_score?.total_score)}`}>{deal.latest_score?.total_score ?? "-"}</span>
                </div>
                <div className="deal-card-meta">
                  <span>{deal.listing?.city || "Ort fehlt"}</span>
                  <span>{formatCurrency(deal.listing?.purchase_price)}</span>
                </div>
                <select value={deal.pipeline_stage} onChange={(event) => move(deal, event.target.value as PipelineStage)}>
                  {PIPELINE_STAGES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
