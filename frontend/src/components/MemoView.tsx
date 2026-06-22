"use client";

import { Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getDeal, getInvestmentMemo } from "../lib/api";
import {
  dealDevelopmentPotentialMapBrief,
  dealMemoCockpitBrief,
  developmentCaseHandoffBrief,
  objectDevelopmentPotentialBrief
} from "../lib/dealMetrics";
import { Deal, InvestmentMemo } from "../lib/types";
import { DevelopmentCaseHandoffPanel } from "./DevelopmentCaseHandoffPanel";

type MemoLoadState = "loading" | "ready" | "error";

export function MemoView({ dealId }: { dealId: string }) {
  const [memo, setMemo] = useState<InvestmentMemo | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadState, setLoadState] = useState<MemoLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setMemo(null);
    setDeal(null);
    try {
      const [nextMemo, nextDeal] = await Promise.all([getInvestmentMemo(dealId), getDeal(dealId)]);
      setMemo(nextMemo);
      setDeal(nextDeal);
      setLoadState("ready");
    } catch (error) {
      setLoadError(readableMemoError(error));
      setLoadState("error");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === "loading" || loadState === "error" || !memo || !deal) {
    const isError = loadState === "error";
    return (
      <div className="page memo-page">
        <section className={`pipeline-load-state ${isError ? "error" : "loading"}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isError ? "API-Fehler" : "Datenabruf"}</span>
            <h3>{isError ? "Investment-Memo konnte nicht geladen werden" : "Investment-Memo wird geladen"}</h3>
            <p>
              {isError
                ? loadError
                : "Memo-Cockpit, Entwicklungsthese und Beleglage werden geladen. Noch keine Investment- oder Preisentscheidung ableiten."}
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

  const cockpit = dealMemoCockpitBrief(deal);
  const developmentPotential = objectDevelopmentPotentialBrief(deal);
  const developmentMap = dealDevelopmentPotentialMapBrief(deal);
  const developmentCommand = developmentPotential.developmentCommand;
  const developmentCaseHandoff = developmentCaseHandoffBrief(deal);

  return (
    <div className="page memo-page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${memo.deal_id}`} className="text-link">Deal</Link>
          <h2>{memo.title}</h2>
        </div>
        <button className="button" onClick={() => window.print()}>
          <Printer size={16} />
          Drucken
        </button>
      </section>

      <section className={`strategy-brief-band memo-cockpit-band ${cockpit.tone}`} aria-label="Memo-Cockpit">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Memo-Cockpit</span>
            <h3>{cockpit.headline}</h3>
            <p>{cockpit.oneLineDecision}</p>
          </div>
          <div className="decision-fact-grid">
            {cockpit.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Memo-Entscheidung" items={cockpit.decisionMemo} />
          <DecisionList title="Bankfragen" items={cockpit.bankQuestions} />
          <DecisionList title="Uebergabe-Checkliste" items={cockpit.handoffChecklist} />
        </div>
      </section>

      <section className={`development-potential-map-band memo-development-thesis ${developmentMap.tone}`} aria-label="Memo-Entwicklungsthese">
        <div className="development-potential-map-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Memo-Entwicklungsthese</span>
            <h3>{developmentMap.headline}</h3>
            <p>{developmentMap.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {developmentMap.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`memo-development-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <section className={`development-command-panel memo-development-command ${developmentCommand.tone}`} aria-label="Memo-Entwicklungs-Kompass">
          <div className="development-command-copy">
            <span className="section-kicker">Entwicklungs-Kompass</span>
            <h4>{developmentCommand.headline}</h4>
            <p>{developmentCommand.summary}</p>
          </div>
          <dl className="development-command-grid">
            <div>
              <dt>Fokushebel</dt>
              <dd>{developmentCommand.focusLever}</dd>
            </div>
            <div>
              <dt>Objektbereich</dt>
              <dd>{developmentCommand.objectArea}</dd>
            </div>
            <div>
              <dt>Preisfreigabe</dt>
              <dd>{developmentCommand.priceUse}</dd>
            </div>
            <div>
              <dt>Freigabe-Sperre</dt>
              <dd>{developmentCommand.openIssue}</dd>
            </div>
          </dl>
        </section>

        {developmentCaseHandoff && (
          <DevelopmentCaseHandoffPanel
            brief={developmentCaseHandoff}
            ariaLabel="Memo-Entwicklungsfall-Herkunft"
            kicker="Gespeicherter Entwicklungsfall"
            ruleTitle="Memo-Regel"
            proofTitle="Naechste Belege"
          />
        )}

        <div className="development-potential-map-lanes">
          <h4>Top-Hebel</h4>
          <div className="development-potential-map-grid">
            {developmentMap.lanes.map((lane) => (
              <article className={`development-potential-map-lane ${lane.tone}`} key={`memo-development-lane-${lane.rank}-${lane.label}`}>
                <div className="development-potential-map-lane-head">
                  <span>{lane.rank}</span>
                  <div>
                    <small>{lane.proofStatus}</small>
                    <h5>{lane.label}</h5>
                  </div>
                </div>
                <strong>{lane.estimatedValue}</strong>
                <p>{lane.signal}</p>
                <dl>
                  <div>
                    <dt>Risiko</dt>
                    <dd>{lane.risk}</dd>
                  </div>
                  <div>
                    <dt>Naechster Beleg</dt>
                    <dd>{lane.nextCheck}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Preis-Regel" items={developmentMap.stopRules} />
          <DecisionList title="Naechste Belege" items={developmentMap.nextActions} />
        </div>
      </section>

      <article className="memo-document">
        {memo.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}

function DecisionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function readableMemoError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden des Investment-Memos.";
}
