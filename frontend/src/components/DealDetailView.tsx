"use client";

import { AlertTriangle, CheckCircle, Copy, FileText, Handshake, Landmark, PlayCircle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { analyzeRenovationPlan, getDeal, runScore, runUnderwriting, updateDocumentReview } from "../lib/api";
import {
  acquisitionReadinessSummary,
  dealAssumptionAuditBrief,
  dealAcquisitionThesisBrief,
  dealActionPlanBrief,
  dealBidStackBrief,
  dealBrokerPriceCommunicationBrief,
  dealComparableEvidenceBrief,
  dealClosingCommandBrief,
  dealDecisionBrief,
  dealDevelopmentEvidencePackBrief,
  dealDevelopmentPotentialMapBrief,
  dealDevelopmentPricingDisciplineBrief,
  dealDossierCockpitBrief,
  dealEvidenceQualityBrief,
  dealExecutionSprintBrief,
  dealExitLiquidityBrief,
  dealInvestmentCommitteeBrief,
  dealLocationOfferDisciplineBrief,
  dealMarketComparisonBrief,
  dealMicroLocationAlphaBrief,
  dealMicroLocationPriceGateBrief,
  dealMicroLocationTargetGroupBrief,
  dealLoiConditionsBrief,
  dealNegotiationCommandBrief,
  dealOfferBandBrief,
  dealOfferDecisionBrief,
  dealOfferReleasePackageBrief,
  dealRepairPlanBrief,
  dealScenarioStressBrief,
  dealSiteVisitBrief,
  dealStrategyBrief,
  dealUnlockPlanBrief,
  dealRiskAdjustedOfferBrief,
  dueDiligenceDocumentSummary,
  formatCurrency,
  formatNumber,
  formatPercent,
  locationPanelSummary,
  microLocationPotentialRows,
  objectDevelopmentAssumptionDefaults,
  objectDevelopmentPotentialBrief,
  regionOutlookHighlights,
  scoreTone
} from "../lib/dealMetrics";
import { Deal, DealAuditLogItem, RenovationPlan } from "../lib/types";
import { DealMicroLocationPanel } from "./DealMicroLocationPanel";
import { FinancingPanel } from "./FinancingPanel";
import { GeoContextPanel } from "./GeoContextPanel";
import { RenovationPlanPanel } from "./RenovationPlanPanel";
import { RiskMatrixPanel } from "./RiskMatrixPanel";
import { WegHealthPanel } from "./WegHealthPanel";

const regionMetricLabels: Record<string, string> = {
  population_trend_score: "Bevoelkerung",
  urban_environment_quality_score: "Umfeld",
  employer_access_score: "Jobs",
  purchasing_power_score: "Kaufkraft",
  vacancy_risk_score: "Leerstand",
  public_transport_score: "OePNV",
  micro_location_score: "Mikrolage",
  transit_access_score: "OePNV-Naehe",
  daily_needs_score: "Alltag",
  demand_anchor_score: "Messe/Jobs/Uni",
  leisure_quality_score: "Freizeit",
  short_term_rental_score: "Airbnb optional",
  nuisance_resilience_score: "Stoerfaktoren",
  noise_risk_score: "Laerm",
  flood_risk_score: "Hochwasser"
};

const dealCheckPathLinks = [
  { label: "Entscheidung", href: "#deal-decision", step: "01" },
  { label: "Preis", href: "#deal-offer-band", step: "02" },
  { label: "Reparatur", href: "#deal-repair-plan", step: "03" },
  { label: "Mikrolage", href: "#deal-location-alpha", step: "04" },
  { label: "Entwicklung", href: "#deal-development-potential-map", step: "05" },
  { label: "Belege", href: "#deal-evidence-board", step: "06" },
  { label: "Freigabe", href: "#deal-readiness", step: "07" }
];

type DealCheckPathItem = (typeof dealCheckPathLinks)[number] & {
  metric: string;
  status: string;
  tone: ReturnType<typeof scoreTone>;
};

export function DealDetailView({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentRequestCopyState, setDocumentRequestCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [loiCopyState, setLoiCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [brokerCopyState, setBrokerCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [siteVisitCopyState, setSiteVisitCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [documentReviewBusyId, setDocumentReviewBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setActionError(null);
    try {
      setDeal(await getDeal(dealId));
    } catch (error) {
      setDeal(null);
      setLoadError(readableErrorMessage(error));
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDealAction(actionLabel: string, action: () => Promise<Deal>) {
    setBusy(true);
    setActionError(null);
    try {
      setDeal(await action());
    } catch (error) {
      setActionError(`${actionLabel}: ${readableErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function underwrite() {
    if (!deal) return;
    await runDealAction("Underwriting", () => runUnderwriting(deal.id));
  }

  async function score() {
    if (!deal) return;
    await runDealAction("Scoring", () => runScore(deal.id));
  }

  async function markDocumentReviewed(documentId: number, label: string) {
    if (!deal) return;
    setDocumentReviewBusyId(documentId);
    setActionError(null);
    try {
      setDeal(await updateDocumentReview(deal.id, documentId, { review_status: "reviewed" }));
    } catch (error) {
      setActionError(`${label} pruefen: ${readableErrorMessage(error)}`);
    } finally {
      setDocumentReviewBusyId(null);
    }
  }

  if (!deal) {
    return (
      <div className="page">
        {loadError ? (
          <section className="pipeline-load-state error" role="alert" aria-live="polite">
            <div>
              <span className="section-kicker">API-Fehler</span>
              <h2>Deal konnte nicht geladen werden</h2>
              <p>{loadError}. Noch keine Kauf-, Preis- oder Notarentscheidung ableiten.</p>
            </div>
            <button className="button primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Erneut laden
            </button>
          </section>
        ) : (
          <section className="pipeline-load-state loading" role="status" aria-live="polite">
            <div>
              <span className="section-kicker">Datenabruf</span>
              <h2>Deal wird geladen</h2>
              <p>Underwriting, Score, Mikrolage und Entwicklungspotential werden geladen. Noch keine Kauf-, Preis- oder Notarentscheidung ableiten.</p>
            </div>
          </section>
        )}
      </div>
    );
  }

  const listing = deal.listing;
  const uw = deal.latest_underwriting;
  const scoreResult = deal.latest_score;
  const auditLog = deal.audit_log || [];
  const regionOutlook = deal.region_outlook;
  const regionMetrics = regionOutlookHighlights(regionOutlook);
  const locationSummary = locationPanelSummary(deal);
  const redFlags = scoreResult?.red_flags || [];
  const targetRentPerSqm =
    typeof deal.rent_law?.legally_plausible_target_rent_per_sqm === "number"
      ? deal.rent_law.legally_plausible_target_rent_per_sqm
      : null;
  const decisionBrief = dealDecisionBrief(deal);
  const unlockPlan = dealUnlockPlanBrief(deal);
  const closingCommand = dealClosingCommandBrief(deal);
  const dossierCockpit = dealDossierCockpitBrief(deal);
  const acquisitionThesis = dealAcquisitionThesisBrief(deal);
  const developmentPotentialMap = dealDevelopmentPotentialMapBrief(deal);
  const developmentEvidencePack = dealDevelopmentEvidencePackBrief(deal);
  const strategyBrief = dealStrategyBrief(deal);
  const locationAlpha = dealMicroLocationAlphaBrief(deal);
  const locationPriceGate = dealMicroLocationPriceGateBrief(deal);
  const locationTargetGroup = dealMicroLocationTargetGroupBrief(deal);
  const locationValueLevers = microLocationPotentialRows(deal);
  const marketComparison = dealMarketComparisonBrief(deal);
  const comparableEvidence = dealComparableEvidenceBrief(deal);
  const offerBand = dealOfferBandBrief(deal);
  const locationOfferDiscipline = dealLocationOfferDisciplineBrief(deal);
  const riskAdjustedOffer = dealRiskAdjustedOfferBrief(deal);
  const bidStack = dealBidStackBrief(deal);
  const stressTest = dealScenarioStressBrief(deal);
  const repairPlan = dealRepairPlanBrief(deal);
  const negotiationCommand = dealNegotiationCommandBrief(deal);
  const brokerPriceCommunication = dealBrokerPriceCommunicationBrief(deal);
  const loiConditions = dealLoiConditionsBrief(deal);
  const offerDecision = dealOfferDecisionBrief(deal);
  const offerReleasePackage = dealOfferReleasePackageBrief(deal);
  const assumptionAudit = dealAssumptionAuditBrief(deal);
  const exitLiquidity = dealExitLiquidityBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const evidenceQuality = dealEvidenceQualityBrief(deal);
  const documentSummary = dueDiligenceDocumentSummary(deal);
  const readinessSummary = acquisitionReadinessSummary(deal);
  const actionPlan = dealActionPlanBrief(deal);
  const executionSprint = dealExecutionSprintBrief(deal);
  const siteVisit = dealSiteVisitBrief(deal);
  const committeeBrief = dealInvestmentCommitteeBrief(deal);
	  const checkPathItems = buildDealCheckPathItems({
	    decisionBrief,
	    developmentPotentialMap,
	    evidenceQuality,
	    locationAlpha,
	    offerBand,
	    repairPlan,
	    readinessSummary
	  });
  const evidenceBlockers = evidenceQuality.openEvidence.slice(0, 4);
  const immediateEvidenceRequests = documentSummary.requestPack.copyLines.slice(0, 4);
  const nextEvidenceChecks = evidenceQuality.nextActions.slice(0, 4);

  const copyDocumentRequestPack = async () => {
    try {
      await copyTextToClipboard(documentSummary.requestPack.copyText);
      setDocumentRequestCopyState("copied");
    } catch {
      setDocumentRequestCopyState("failed");
    }
  };

  const copyLoiText = async () => {
    try {
      await copyTextToClipboard(loiConditions.copyText);
      setLoiCopyState("copied");
    } catch {
      setLoiCopyState("failed");
    }
  };

  const copyBrokerPriceText = async () => {
    try {
      await copyTextToClipboard(brokerPriceCommunication.copyText);
      setBrokerCopyState("copied");
    } catch {
      setBrokerCopyState("failed");
    }
  };

  const copySiteVisitText = async () => {
    try {
      await copyTextToClipboard(siteVisit.copyPrompt);
      setSiteVisitCopyState("copied");
    } catch {
      setSiteVisitCopyState("failed");
    }
  };

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
          <Link className="button" href={`/deals/${deal.id}/bank`}>
            <Landmark size={16} />
            Bank
          </Link>
        </div>
      </section>

      {actionError ? (
        <div className="deal-action-error" role="alert">
          <div>
            <span className="section-kicker">API-Fehler</span>
            <h3>Aktion konnte nicht ausgefuehrt werden</h3>
            <p>{actionError}</p>
            <small>Die Buttons sind wieder frei. Du kannst die Aktion erneut starten.</small>
          </div>
        </div>
      ) : null}

      <DealCheckPath items={checkPathItems} />

      {auditLog.length ? <DealAuditTrail auditLog={auditLog} /> : null}

      <section className={`closing-command-band ${closingCommand.tone}`} aria-label="Closing-Command">
        <div className="closing-command-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Closing Command</span>
            <h3>{closingCommand.headline}</h3>
            <p>{closingCommand.summary}</p>
          </div>
          <div className={`closing-command-primary ${closingCommand.tone}`}>
            <span>Naechste Aktion</span>
            <strong>{closingCommand.primaryAction}</strong>
          </div>
        </div>

        <div className="decision-fact-grid">
          {closingCommand.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`closing-fact-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="closing-command-grid">
          {closingCommand.lanes.map((lane) => (
            <Link className={`closing-command-lane ${lane.tone}`} href={lane.href} key={lane.key}>
              <div className="closing-command-lane-head">
                <div>
                  <span>{lane.owner}</span>
                  <h4>{lane.label}</h4>
                </div>
                <strong className={`score ${lane.tone}`}>{lane.statusLabel}</strong>
              </div>
              <p>{lane.summary}</p>
              <dl>
                <div>
                  <dt>Beweis</dt>
                  <dd>{lane.proof}</dd>
                </div>
                <div>
                  <dt>Blocker</dt>
                  <dd>{lane.blockers.length ? lane.blockers.join(" ") : "Kein harter Blocker in dieser Lane."}</dd>
                </div>
                <div>
                  <dt>Aktion</dt>
                  <dd>{lane.action}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regel" items={[closingCommand.stopRule]} />
          <DecisionList title="Naechste Closing-Schritte" items={closingCommand.nextActions} />
        </div>
      </section>

      <section className={`dossier-cockpit-band ${dossierCockpit.tone}`} aria-label="Ankaufs-Dossier-Cockpit">
        <div className="dossier-cockpit-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Ankaufs-Dossier-Cockpit</span>
            <h3>{dossierCockpit.headline}</h3>
            <p>{dossierCockpit.summary}</p>
          </div>
          <div className={`dossier-cockpit-status ${dossierCockpit.tone}`}>
            <span>Dossier</span>
            <strong>{dossierCockpit.decisionLabel}</strong>
            <small>{dossierCockpit.stopRule}</small>
          </div>
        </div>

        <div className="decision-fact-grid">
          {dossierCockpit.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`dossier-fact-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className={`dossier-development-snapshot ${dossierCockpit.development.tone}`} aria-label="Dossier-Entwicklungspotential">
          <div className="dossier-development-head">
            <div>
              <span>Entwicklungspotential</span>
              <h4>{dossierCockpit.development.label}</h4>
            </div>
            <strong className={`score ${dossierCockpit.development.tone}`}>{dossierCockpit.development.statusLabel}</strong>
          </div>
          <p>{dossierCockpit.development.rule}</p>
          <dl>
            <div>
              <dt>Wo im Objekt?</dt>
              <dd>{dossierCockpit.development.where}</dd>
            </div>
            <div>
              <dt>Wert</dt>
              <dd>{dossierCockpit.development.value}</dd>
            </div>
            <div>
              <dt>Beleg</dt>
              <dd>{dossierCockpit.development.proof}</dd>
            </div>
            <div>
              <dt>Naechster Check</dt>
              <dd>{dossierCockpit.development.nextAction}</dd>
            </div>
          </dl>
        </div>

        <div className="dossier-package-grid">
          {dossierCockpit.packages.map((packet) => (
            <article className={`dossier-package-card ${packet.tone}`} key={packet.key}>
              <div className="dossier-package-card-head">
                <div>
                  <span>{packet.owner}</span>
                  <h4>{packet.label}</h4>
                </div>
                <strong className={`score ${packet.tone}`}>{packet.statusLabel}</strong>
              </div>
              <p>{packet.handoff}</p>
              <dl>
                <div>
                  <dt>Naechster Schritt</dt>
                  <dd>{packet.nextAction}</dd>
                </div>
                <div>
                  <dt>Beleg</dt>
                  <dd>{packet.proof}</dd>
                </div>
                <div>
                  <dt>Blocker</dt>
                  <dd>{packet.blockers.length ? packet.blockers.join(" ") : "Kein harter Blocker in diesem Paket."}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Dossier-Checkliste" items={dossierCockpit.copyChecklist} />
          <DecisionList title="Stop-Regel" items={[dossierCockpit.stopRule]} />
        </div>
      </section>

      <section id="deal-decision" className={`deal-decision-band ${decisionBrief.tone}`} aria-label="Deal-Entscheidung">
        <div className="deal-decision-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Deal-Entscheidung</span>
            <h3>{decisionBrief.headline}</h3>
            <p>{decisionBrief.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {decisionBrief.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="deal-decision-detail">
          <DecisionList title="Warum" items={decisionBrief.reasons} />
          <DecisionList title="Staerken" items={decisionBrief.strengths} />
          <DecisionList title="Naechste Schritte" items={decisionBrief.nextActions} />
        </div>
      </section>

      <section className={`strategy-brief-band unlock-plan-band ${unlockPlan.tone}`} aria-label="Deal-Unlock-Plan">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Deal-Unlock-Plan</span>
            <h3>{unlockPlan.headline}</h3>
            <p>{unlockPlan.summary}</p>
            <small>{unlockPlan.targetState}</small>
          </div>
          <div className="decision-fact-grid">
            {unlockPlan.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`unlock-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="acquisition-thesis-lane-grid">
          {unlockPlan.levers.map((lever) => (
            <article className={`acquisition-thesis-lane ${lever.tone}`} key={lever.key}>
              <div className="acquisition-thesis-lane-head">
                <h4>{lever.label}</h4>
                <span className={`score ${lever.tone}`}>{lever.statusLabel}</span>
              </div>
              <p>{lever.impact}</p>
              <dl>
                <div>
                  <dt>Beleg</dt>
                  <dd>{lever.proof}</dd>
                </div>
                <div>
                  <dt>Naechster Schritt</dt>
                  <dd>{lever.action}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regel" items={[unlockPlan.stopRule]} />
          <DecisionList title="Unlock-Schritte" items={unlockPlan.nextActions} />
        </div>
      </section>

      <section className={`acquisition-thesis-band ${acquisitionThesis.tone}`} aria-label="Ankaufs-These">
        <div className="acquisition-thesis-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Ankaufs-These</span>
            <h3>{acquisitionThesis.headline}</h3>
            <p>{acquisitionThesis.summary}</p>
          </div>
          <div className={`acquisition-thesis-label ${acquisitionThesis.tone}`}>
            <span>These</span>
            <strong>{acquisitionThesis.thesisLabel}</strong>
          </div>
        </div>

        <div className="decision-fact-grid">
          {acquisitionThesis.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`thesis-fact-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="acquisition-thesis-lane-grid">
          {acquisitionThesis.lanes.map((lane) => (
            <article className={`acquisition-thesis-lane ${lane.tone}`} key={lane.label}>
              <div className="acquisition-thesis-lane-head">
                <h4>{lane.label}</h4>
                <span className={`score ${lane.tone}`}>{lane.statusLabel}</span>
              </div>
              <p>{lane.summary}</p>
              <dl>
                <div>
                  <dt>Regel</dt>
                  <dd>{lane.rule}</dd>
                </div>
                <div>
                  <dt>Naechster Schritt</dt>
                  <dd>{lane.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList
            title="Leitplanken"
            items={
              acquisitionThesis.guardrails.length
                ? acquisitionThesis.guardrails
                : ["Keine harte These-Leitplanke im aktuellen Datenstand offen."]
            }
          />
          <DecisionList
            title="Naechste Schritte"
            items={
              acquisitionThesis.nextActions.length
                ? acquisitionThesis.nextActions
                : ["These in Memo, Bankpaket und Angebotsgrenze konsistent dokumentieren."]
            }
          />
        </div>
      </section>

      <section
        id="deal-development-potential-map"
        className={`development-potential-map-band ${developmentPotentialMap.tone}`}
        aria-label="Entwicklungspotential-Karte"
      >
        <div className="development-potential-map-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Entwicklungspotential</span>
            <h3>{developmentPotentialMap.headline}</h3>
            <p>{developmentPotentialMap.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {developmentPotentialMap.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`development-map-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <section className={`development-quick-take ${developmentPotentialMap.quickTake.tone}`} aria-label="Entwicklungs-Kurzbewertung">
          <div className="development-quick-take-head">
            <div>
              <span className="section-kicker">Entwicklungs-Kurzbewertung</span>
              <h4>{developmentPotentialMap.quickTake.headline}</h4>
            </div>
            <em className={`score ${developmentPotentialMap.quickTake.tone}`}>{developmentPotentialMap.quickTake.statusLabel}</em>
          </div>
          <div className="development-quick-take-grid">
            <div>
              <span>Was kann besser werden?</span>
              <strong>{developmentPotentialMap.quickTake.primaryLever}</strong>
              <p>{developmentPotentialMap.quickTake.objectArea} · {developmentPotentialMap.quickTake.estimatedValue}</p>
            </div>
            <div>
              <span>Darf das in den Kaufpreis?</span>
              <strong>{developmentPotentialMap.quickTake.priceRule}</strong>
            </div>
            <div>
              <span>Naechster Beleg</span>
              <strong>{developmentPotentialMap.quickTake.nextAction}</strong>
            </div>
          </div>
          <ul className="plain-list development-quick-take-reasons">
            {developmentPotentialMap.quickTake.reasoning.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>

        <div className="development-potential-map-lanes">
          <h4>Wo steckt das Entwicklungspotential?</h4>
          <div className="development-potential-map-grid">
            {developmentPotentialMap.lanes.map((lane) => (
              <article className={`development-potential-map-lane ${lane.tone}`} key={`${lane.rank}-${lane.label}`}>
                <div className="development-potential-map-lane-head">
                  <span>{lane.rank}</span>
                  <div>
                    <h5>{lane.label}</h5>
                    <small>{lane.proofStatus}</small>
                  </div>
                </div>
                <strong>{lane.estimatedValue}</strong>
                <p>{lane.signal}</p>
                <dl>
                  <div>
                    <dt>Wo im Objekt?</dt>
                    <dd>{lane.where}</dd>
                  </div>
                  <div>
                    <dt>Risiko</dt>
                    <dd>{lane.risk}</dd>
                  </div>
                  <div>
                    <dt>Check</dt>
                    <dd>{lane.nextCheck}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>

        <section className="development-price-relevance" aria-label="Kaufpreisrelevanz Entwicklung">
          <div className="development-price-relevance-head">
            <h4>Kaufpreisrelevanz</h4>
            <p>Was darf heute ins Angebot, was bleibt nur Notiz?</p>
          </div>
          <div className="development-price-relevance-grid">
            {developmentPotentialMap.priceBuckets.map((bucket) => (
              <article className={`development-price-relevance-card ${bucket.tone}`} key={bucket.key}>
                <div>
                  <span>{bucket.label}</span>
                  <strong>{bucket.value}</strong>
                </div>
                <p>{bucket.rule}</p>
                <small>{bucket.nextAction}</small>
              </article>
            ))}
          </div>
        </section>

        <section className={`development-evidence-pack ${developmentEvidencePack.tone}`} aria-label="Belegpaket Entwicklung">
          <div className="development-evidence-pack-head">
            <div>
              <span className="section-kicker">Belegpaket Entwicklung</span>
              <h4>{developmentEvidencePack.headline}</h4>
              <p>{developmentEvidencePack.summary}</p>
            </div>
            <div className="decision-fact-grid">
              {developmentEvidencePack.facts.map((fact) => (
                <div className={`decision-fact ${fact.tone}`} key={`development-evidence-fact-${fact.label}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="development-evidence-pack-grid">
            {developmentEvidencePack.rows.map((row) => (
              <article className={`development-evidence-pack-card ${row.tone}`} key={row.key}>
                <div className="development-scenario-card-head">
                  <h5>{row.label}</h5>
                  <span className={`score ${row.tone}`}>{row.statusLabel}</span>
                </div>
                <p>{row.rule}</p>
                <dl>
                  <div>
                    <dt>Belegt</dt>
                    <dd>{row.evidence.length ? row.evidence.join(" ") : "Noch kein belastbarer Beleg."}</dd>
                  </div>
                  <div>
                    <dt>Offen</dt>
                    <dd>{row.gaps.length ? row.gaps.join(" ") : "Keine Pflichtluecke im aktuellen Stand."}</dd>
                  </div>
                  <div>
                    <dt>Naechster Schritt</dt>
                    <dd>{row.nextAction}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="strategy-brief-detail">
            <DecisionList title="Preis-Guardrails" items={developmentEvidencePack.guardrails} />
            <DecisionList title="Beleg-Aktionen" items={developmentEvidencePack.nextActions} />
          </div>
        </section>

        <div className="strategy-brief-detail">
          <DecisionList title="Preis-Regel" items={developmentPotentialMap.stopRules} />
          <DecisionList title="Naechste Checks" items={developmentPotentialMap.nextActions} />
        </div>
      </section>

      <section className={`action-plan-band ${actionPlan.tone}`} aria-label="Aktionsplan">
        <div className="action-plan-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Aktionsplan</span>
            <h3>{actionPlan.headline}</h3>
            <p>{actionPlan.summary}</p>
          </div>
          <div className={`action-plan-primary ${actionPlan.tone}`}>
            <span>Naechster sinnvoller Schritt</span>
            <strong>{actionPlan.primaryAction}</strong>
          </div>
        </div>

        <div className="action-plan-stop-rule">
          <AlertTriangle size={16} />
          <span>{actionPlan.stopRule}</span>
        </div>

        <div className="action-plan-list">
          {actionPlan.steps.map((step) => (
            <article className={`action-plan-step ${step.tone}`} key={`${step.priority}-${step.label}`}>
              <div className="action-plan-step-index">{step.priority}</div>
              <div>
                <div className="action-plan-step-head">
                  <h4>{step.label}</h4>
                  <span className={`score ${step.tone}`}>{step.tone === "risk" ? "Blocker" : "Pruefen"}</span>
                </div>
                <p>{step.detail}</p>
                <small>{step.reason}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`execution-sprint-band ${executionSprint.tone}`} aria-label="Beleg- und Besichtigungs-Sprint">
        <div className="execution-sprint-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Beleg- und Besichtigungs-Sprint</span>
            <h3>{executionSprint.headline}</h3>
            <p>{executionSprint.summary}</p>
          </div>
          <div className={`execution-sprint-primary ${executionSprint.tone}`}>
            <span>Erster Arbeitsauftrag</span>
            <strong>{executionSprint.primaryTask}</strong>
          </div>
        </div>

        <div className="decision-fact-grid">
          {executionSprint.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`execution-sprint-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <section className="deal-closer-queue" aria-label="Deal-Closer-Queue">
          <div className="deal-closer-queue-head">
            <h4>Deal-Closer-Queue</h4>
            <p>Welche Arbeitspakete welchen Ankaufsschritt entsperren.</p>
          </div>
          <div className="deal-closer-queue-grid">
            {executionSprint.milestones.map((milestone) => (
              <article className={`deal-closer-lane ${milestone.tone}`} key={milestone.key}>
                <div className="deal-closer-lane-head">
                  <h5>{milestone.label}</h5>
                  <span className={`score ${milestone.tone}`}>{milestone.count} offen</span>
                </div>
                <strong>{milestone.unlock}</strong>
                <dl>
                  <div>
                    <dt>Owner</dt>
                    <dd>{milestone.ownerLine}</dd>
                  </div>
                  <div>
                    <dt>Arbeitspakete</dt>
                    <dd>
                      {milestone.taskLabels.length
                        ? milestone.taskLabels.join(", ")
                        : "Keine offene Aufgabe in diesem Schritt."}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <div className="execution-sprint-grid">
          {executionSprint.tasks.map((task) => (
            <article className={`execution-sprint-task ${task.tone}`} key={`${task.category}-${task.label}`}>
              <div className="execution-sprint-task-head">
                <div>
                  <span>{task.category}</span>
                  <h4>{task.label}</h4>
                </div>
                <strong className={`score ${task.tone}`}>{task.priorityLabel}</strong>
              </div>
              <dl>
                <div>
                  <dt>Wer / bis wann</dt>
                  <dd>{task.owner} · {task.due}</dd>
                </div>
                <div>
                  <dt>Warum</dt>
                  <dd>{task.why}</dd>
                </div>
                <div>
                  <dt>Beleg</dt>
                  <dd>{task.proof}</dd>
                </div>
              </dl>
              <a className="execution-sprint-link" href={task.targetHref}>
                {task.targetLabel}
              </a>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regel" items={[executionSprint.stopRule]} />
          <DecisionList title="Copy/Anfrage" items={[executionSprint.copyPrompt]} />
        </div>
      </section>

      <section className={`site-visit-work-order ${siteVisit.tone}`} aria-label="Besichtigungsauftrag">
        <div className="site-visit-work-order-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Besichtigungsauftrag</span>
            <h3>{siteVisit.headline}</h3>
            <p>{siteVisit.summary}</p>
          </div>
          <div className="site-visit-command-panel">
            <div className="decision-fact-grid">
              {siteVisit.facts.map((fact) => (
                <div className={`decision-fact ${fact.tone}`} key={`site-visit-fact-${fact.label}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
            <button className="button" type="button" onClick={() => void copySiteVisitText()}>
              <Copy size={16} />
              {siteVisitCopyState === "copied"
                ? "Besichtigungsauftrag kopiert"
                : siteVisitCopyState === "failed"
                  ? "Manuell kopieren"
                  : "Besichtigungsauftrag kopieren"}
            </button>
            {siteVisitCopyState === "failed" && <small>Zwischenablage blockiert. Text unten manuell kopieren.</small>}
          </div>
        </div>

        <div className="site-visit-section-grid">
          {siteVisit.sections.map((section) => (
            <article className={`site-visit-section ${section.tone}`} key={section.key}>
              <div className="site-visit-section-head">
                <h4>{section.label}</h4>
                <span className={`score ${section.tone}`}>{section.checks.length} Checks</span>
              </div>
              <p>{section.summary}</p>
              <div className="site-visit-check-list">
                {section.checks.map((check) => (
                  <div className={`site-visit-check ${check.tone}`} key={check.key}>
                    <div className="site-visit-check-head">
                      <strong>{check.question}</strong>
                      <span>{check.priorityLabel}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Beleg</dt>
                        <dd>{check.proof}</dd>
                      </div>
                      <div>
                        <dt>Preiswirkung</dt>
                        <dd>{check.decisionUse}</dd>
                      </div>
                    </dl>
                    <small>{check.owner}{check.priceRelevant ? " · preisrelevant" : " · Memo/Komfort"}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regel" items={[siteVisit.stopRule]} />
          <DecisionList title="Copy/Anfrage" items={[siteVisit.copyPrompt]} />
        </div>
      </section>

      <section className={`readiness-band committee-band ${committeeBrief.tone}`} aria-label="Investment-Komitee">
        <div className="readiness-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Investment-Komitee</span>
            <h3>{committeeBrief.headline}</h3>
            <p>{committeeBrief.stopRule}</p>
          </div>
          <div className={`readiness-counter ${committeeBrief.tone}`}>
            <span>Komitee</span>
            <strong>{committeeBrief.decisionLabel}</strong>
            <small>Gebotsfreigabe</small>
          </div>
        </div>

        <div className="decision-fact-grid">
          {committeeBrief.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="readiness-gate-grid">
          {committeeBrief.blockers.map((item) => (
            <article className={`readiness-gate ${item.tone}`} key={`committee-blocker-${item.label}`}>
              <div className="readiness-gate-head">
                <h4>{item.label}</h4>
                <span className={`score ${item.tone}`}>{item.statusLabel}</span>
              </div>
              <p>{item.summary}</p>
              <ul className="plain-list">
                <li>{item.action}</li>
              </ul>
            </article>
          ))}
          {committeeBrief.reviewItems.slice(0, Math.max(0, 6 - committeeBrief.blockers.length)).map((item) => (
            <article className={`readiness-gate ${item.tone}`} key={`committee-review-${item.label}`}>
              <div className="readiness-gate-head">
                <h4>{item.label}</h4>
                <span className={`score ${item.tone}`}>{item.statusLabel}</span>
              </div>
              <p>{item.summary}</p>
              <ul className="plain-list">
                <li>{item.action}</li>
              </ul>
            </article>
          ))}
        </div>

        <div className="readiness-actions">
          <DecisionList title="Memo-Pflicht" items={committeeBrief.memoItems} />
          <DecisionList title="Komitee-Fragen" items={committeeBrief.nextQuestions} />
        </div>
      </section>

      <section className={`strategy-brief-band ${strategyBrief.tone}`} aria-label="Ankaufsstrategie">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Ankaufsstrategie</span>
            <h3>{strategyBrief.headline}</h3>
            <p>{strategyBrief.basePlan}</p>
          </div>
          <div className="decision-fact-grid">
            {strategyBrief.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Vermietungslogik" items={[strategyBrief.rentPlan, strategyBrief.offerRule]} />
          <DecisionList
            title="Warnungen"
            items={strategyBrief.warnings.length ? strategyBrief.warnings : ["Keine harte Strategiewarnung im aktuellen Datenstand."]}
          />
          <DecisionList title="Naechste Strategie-Checks" items={strategyBrief.nextActions} />
        </div>
      </section>

      <section id="deal-location-alpha" className={`strategy-brief-band location-alpha-band ${locationAlpha.tone}`} aria-label="Lage-Alpha">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Lage-Alpha</span>
            <h3>{locationAlpha.headline}</h3>
            <p>{locationAlpha.priceRule}</p>
          </div>
          <div className="decision-fact-grid">
            {locationAlpha.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className={`location-price-gate ${locationPriceGate.tone}`} aria-label="Lagepreis-Freigabe">
          <div className="strategy-brief-topline">
            <div className="deal-decision-copy">
              <span className="section-kicker">Lagepreis-Freigabe</span>
              <h4>{locationPriceGate.headline}</h4>
              <p>{locationPriceGate.priceRule}</p>
            </div>
            <div className="decision-fact-grid">
              {locationPriceGate.facts.map((fact) => (
                <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="strategy-brief-detail">
            <DecisionList title="Preisregeln" items={locationPriceGate.guardrails} />
            <DecisionList title="Freigabe-Checks" items={locationPriceGate.nextActions} />
          </div>
        </div>

        <section className={`location-target-group-thesis ${locationTargetGroup.tone}`} aria-label="Zielgruppen-These">
          <div className="location-target-group-head">
            <div>
              <span className="section-kicker">Zielgruppen-These</span>
              <h4>{locationTargetGroup.headline}</h4>
              <p>{locationTargetGroup.summary}</p>
            </div>
            <div className="decision-fact-grid">
              {locationTargetGroup.facts.map((fact) => (
                <div className={`decision-fact ${fact.tone}`} key={`target-group-${fact.label}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="location-target-group-grid">
            {locationTargetGroup.rows.map((row) => (
              <article className={`location-target-group-card ${row.tone}`} key={`target-group-row-${row.name}`}>
                <div className="micro-location-compass-head">
                  <span>{row.role}</span>
                  <strong>{row.label}</strong>
                </div>
                <p>{row.proof}</p>
                <dl>
                  <div>
                    <dt>Bewertung</dt>
                    <dd>{row.decisionUse}</dd>
                  </div>
                  <div>
                    <dt>Risiko</dt>
                    <dd>{row.risk}</dd>
                  </div>
                  <div>
                    <dt>Naechster Beleg</dt>
                    <dd>{row.nextCheck}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="strategy-brief-detail">
            <DecisionList title="Basisfall" items={[locationTargetGroup.baseCase]} />
            <DecisionList title="Memo-Regel" items={[locationTargetGroup.memoRule]} />
            <DecisionList title="Naechste Zielgruppen-Belege" items={locationTargetGroup.nextActions} />
          </div>
        </section>

        <section className="location-value-bridge" aria-label="Lagehebel-Wertbruecke">
          <div className="location-value-bridge-head">
            <div>
              <span className="section-kicker">Lagehebel-Wertbruecke</span>
              <h4>Was darf in die Bewertung?</h4>
            </div>
            <p>
              Bahnhof/U-Bahn, Alltag/Nahversorgung, Nachfrageanker, Freizeit und Airbnb werden getrennt bewertet:
              Basishebel stuetzen die Vermietung, Zusatzchancen bleiben Memo-Upside, Stoerfaktoren bremsen den Preis.
            </p>
          </div>
          <div className="location-value-bridge-grid">
            {locationValueLevers.map((row) => (
              <article className={`location-value-bridge-card ${row.tone}`} key={row.key}>
                <div className="micro-location-compass-head">
                  <span>{row.role}</span>
                  <strong>{row.label}</strong>
                </div>
                <p>{row.signal}</p>
                <dl>
                  <div>
                    <dt>Bewertung</dt>
                    <dd>{row.underwritingUse}</dd>
                  </div>
                  <div>
                    <dt>Beleg</dt>
                    <dd>{row.nextCheck}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <div className="strategy-brief-detail">
          <DecisionList title="Vermietungsthese" items={[locationAlpha.rentThesis]} />
          <DecisionList title="Memo-Regel" items={locationAlpha.memoItems} />
          <DecisionList
            title="Preis-Bremsen"
            items={
              locationAlpha.risks.length
                ? locationAlpha.risks
                : ["Keine harte Mikrolage-Bremse im aktuellen Datenstand belegt."]
            }
          />
          <DecisionList title="Naechste Lage-Checks" items={locationAlpha.nextActions} />
        </div>
      </section>

      <section id="deal-market-comparison" className={`market-comparison-band ${marketComparison.tone}`} aria-label="Marktvergleich">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Marktvergleich</span>
            <h3>{marketComparison.headline}</h3>
            <p>{marketComparison.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {marketComparison.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`market-comparison-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="market-comparison-grid">
          {marketComparison.rows.map((row) => (
            <article className={`market-comparison-row ${row.tone}`} key={row.label}>
              <div className="market-comparison-row-head">
                <h4>{row.label}</h4>
                <span className={`score ${row.tone}`}>{row.statusLabel}</span>
              </div>
              <dl>
                <div>
                  <dt>Ist</dt>
                  <dd>{row.value}</dd>
                </div>
                <div>
                  <dt>Benchmark</dt>
                  <dd>{row.benchmark}</dd>
                </div>
              </dl>
              <p>{row.interpretation}</p>
            </article>
          ))}
        </div>

        <section className={`comparable-evidence-panel ${comparableEvidence.tone}`} aria-label="Comparable Evidence">
          <div className="comparable-evidence-head">
            <div>
              <span className="section-kicker">Comparable Evidence</span>
              <h4>{comparableEvidence.headline}</h4>
              <p>{comparableEvidence.summary}</p>
            </div>
            <div className="decision-fact-grid">
              {comparableEvidence.facts.map((fact) => (
                <div className={`decision-fact ${fact.tone}`} key={`comparable-evidence-fact-${fact.label}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="comparable-evidence-grid">
            {comparableEvidence.rows.map((row) => (
              <article className={`comparable-evidence-card ${row.tone}`} key={row.key}>
                <div className="market-comparison-row-head">
                  <h5>{row.label}</h5>
                  <span className={`score ${row.tone}`}>{row.statusLabel}</span>
                </div>
                <strong>{row.value}</strong>
                <dl>
                  <div>
                    <dt>Quelle</dt>
                    <dd>{row.source}</dd>
                  </div>
                  <div>
                    <dt>Regel</dt>
                    <dd>{row.rule}</dd>
                  </div>
                  <div>
                    <dt>Naechster Schritt</dt>
                    <dd>{row.nextAction}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="strategy-brief-detail">
            <DecisionList title="Comp-Guardrails" items={comparableEvidence.guardrails} />
            <DecisionList title="Comp-Aktionen" items={comparableEvidence.nextActions} />
          </div>
        </section>

        <div className="strategy-brief-detail">
          <DecisionList title="Preisregeln" items={marketComparison.guardrails} />
          <DecisionList title="Naechste Comps" items={marketComparison.nextActions} />
        </div>
      </section>

      <section className={`location-offer-discipline ${locationOfferDiscipline.tone}`} aria-label="Lagepreis-Disziplin">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Lagepreis-Disziplin</span>
            <h3>{locationOfferDiscipline.headline}</h3>
            <p>{locationOfferDiscipline.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {locationOfferDiscipline.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`location-offer-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="strategy-brief-detail">
          <DecisionList title="Preis-Guardrails" items={locationOfferDiscipline.guardrails} />
          <DecisionList title="Naechste Preisbelege" items={locationOfferDiscipline.nextActions} />
        </div>
      </section>

      <section id="deal-offer-band" className={`strategy-brief-band offer-band ${offerBand.tone}`} aria-label="Angebotsband">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Angebotsband</span>
            <h3>{offerBand.headline}</h3>
            <p>{offerBand.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {offerBand.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Preislogik" items={offerBand.reasons} />
          <DecisionList
            title="Schutzregeln"
            items={
              offerBand.warnings.length
                ? offerBand.warnings
                : ["Entwicklungspotential nur nach belastbaren Objekt-, Bank- und Mietrechtsbelegen in den Kaufpreis einrechnen."]
            }
          />
        </div>
      </section>

      <section className={`risk-adjusted-offer-band ${riskAdjustedOffer.tone}`} aria-label="Risikojustierter Preisdeckel">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Risikojustierter Preisdeckel</span>
            <h3>{riskAdjustedOffer.headline}</h3>
            <p>{riskAdjustedOffer.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {riskAdjustedOffer.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`risk-adjusted-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="risk-buffer-grid">
          {riskAdjustedOffer.drivers.map((driver) => (
            <article className={`risk-buffer-card ${driver.tone}`} key={driver.label}>
              <div className="risk-buffer-card-head">
                <h4>{driver.label}</h4>
                <span className={`score ${driver.tone}`}>{driver.reservePercent ? `${driver.reservePercent} %` : "0 %"}</span>
              </div>
              <p>{driver.reason}</p>
              <dl>
                <div>
                  <dt>Reserve</dt>
                  <dd>{formatCurrency(driver.reserveEur)}</dd>
                </div>
                <div>
                  <dt>Naechster Check</dt>
                  <dd>{driver.action}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Guardrails" items={riskAdjustedOffer.guardrails} />
          <DecisionList title="Naechste Schritte" items={riskAdjustedOffer.nextActions} />
        </div>
      </section>

      <section className={`bid-stack-band ${bidStack.tone}`} aria-label="Gebots-Stack">
        <div className="bid-stack-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Gebots-Stack</span>
            <h3>{bidStack.headline}</h3>
            <p>{bidStack.summary}</p>
          </div>
          <div className={`bid-stack-ceiling ${bidStack.tone}`}>
            <span>Effektiver Deckel</span>
            <strong>{bidStack.finalCeilingPrice !== null ? formatCurrency(bidStack.finalCeilingPrice) : "Fehlt"}</strong>
            <small>{bidStack.negotiationRange}</small>
          </div>
        </div>

        <div className="decision-fact-grid">
          {bidStack.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`bid-stack-fact-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="bid-stack-row-grid">
          {bidStack.rows.map((row) => (
            <article className={`bid-stack-row ${row.tone} ${row.role}`} key={`bid-stack-${row.label}`}>
              <div className="bid-stack-row-head">
                <span>{row.role === "adjustment" ? "Korrektur" : row.role === "anchor" ? "Anker" : row.role === "output" ? "Output" : "Input"}</span>
                <strong>{row.value}</strong>
              </div>
              <h4>{row.label}</h4>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Gebotsregeln" items={bidStack.guardrails} />
          <DecisionList title="Range" items={[bidStack.negotiationRange]} />
        </div>
      </section>

      <section className={`stress-test-band ${stressTest.tone}`} aria-label="Stress-Test">
        <div className="stress-test-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Stress-Test</span>
            <h3>{stressTest.headline}</h3>
            <p>{stressTest.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {stressTest.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`stress-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="stress-scenario-grid">
          {stressTest.scenarios.map((scenario) => (
            <article className={`stress-scenario-card ${scenario.tone}`} key={`stress-${scenario.key}`}>
              <div className="stress-scenario-head">
                <div>
                  <span>{scenario.statusLabel}</span>
                  <h4>{scenario.label}</h4>
                </div>
                <strong>{formatCurrency(scenario.cashflowBeforeTax)}</strong>
              </div>
              <p>{scenario.detail}</p>
              <dl>
                <div>
                  <dt>Cashflow</dt>
                  <dd>{formatCurrency(scenario.cashflowBeforeTax)}</dd>
                </div>
                <div>
                  <dt>DSCR</dt>
                  <dd>{formatNumber(scenario.dscr)}</dd>
                </div>
                <div>
                  <dt>Liquiditaet</dt>
                  <dd>{formatCurrency(scenario.liquidityImpactEur)}</dd>
                </div>
                <div>
                  <dt>Exit-Puffer</dt>
                  <dd>{formatCurrency(scenario.exitEquityBufferEur)}</dd>
                </div>
              </dl>
              <p className="stress-scenario-action">{scenario.action}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stress-Regeln" items={stressTest.guardrails} />
          <DecisionList title="Naechste Schritte" items={stressTest.nextActions} />
        </div>
      </section>

      <section id="deal-repair-plan" className={`repair-plan-band ${repairPlan.tone}`} aria-label="Deal-Reparaturplan">
        <div className="repair-plan-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Deal-Reparaturplan</span>
            <h3>{repairPlan.headline}</h3>
            <p>{repairPlan.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {repairPlan.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`repair-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="repair-lever-grid">
          {repairPlan.levers.map((lever) => (
            <article className={`repair-lever-card ${lever.tone}`} key={`repair-${lever.label}`}>
              <div className="repair-lever-head">
                <div>
                  <span>{lever.statusLabel}</span>
                  <h4>{lever.label}</h4>
                </div>
                <strong>{lever.amount}</strong>
              </div>
              <p>{lever.detail}</p>
              <p className="repair-memo-line">{lever.memoLine}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regeln" items={repairPlan.stopRules} />
          <DecisionList title="Naechste Schritte" items={repairPlan.nextActions} />
        </div>
      </section>

      <section className={`negotiation-command-band ${negotiationCommand.tone}`} aria-label="Verhandlungsauftrag">
        <div className="negotiation-command-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Verhandlungsauftrag</span>
            <h3>{negotiationCommand.headline}</h3>
            <p>{negotiationCommand.internalLine}</p>
          </div>
          <div className="decision-fact-grid">
            {negotiationCommand.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`negotiation-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="negotiation-command-copy">
          <div>
            <span>Maklertext</span>
            <p>{negotiationCommand.sellerLine}</p>
          </div>
          <div>
            <span>Kopierbarer Text</span>
            <p>{negotiationCommand.copyText}</p>
          </div>
        </div>

        <div className="negotiation-ask-grid">
          {negotiationCommand.asks.map((ask) => (
            <article className={`negotiation-ask-card ${ask.tone}`} key={`negotiation-ask-${ask.label}`}>
              <div>
                <h4>{ask.label}</h4>
                <strong>{ask.value}</strong>
              </div>
              <p>{ask.reason}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Stop-Regeln" items={negotiationCommand.stopRules} />
          <DecisionList title="Naechste Schritte" items={negotiationCommand.nextActions} />
        </div>
      </section>

      <section className={`strategy-brief-band broker-price-communication-band ${brokerPriceCommunication.tone}`} aria-label="Makler-Preiskommunikation">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Makler-Preiskommunikation</span>
            <h3>{brokerPriceCommunication.headline}</h3>
            <p>{brokerPriceCommunication.externalLine}</p>
          </div>
          <div className="decision-fact-grid">
            {brokerPriceCommunication.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`broker-price-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="loi-copy-panel broker-price-copy-panel">
          <div className="broker-price-external">
            <span>Externer Satz</span>
            <p>{brokerPriceCommunication.externalLine}</p>
          </div>
          <div>
            <div className="loi-copy-card-head">
              <span>Kopierbarer Maklertext</span>
              <button className="button" type="button" onClick={() => void copyBrokerPriceText()}>
                <Copy size={16} />
                {brokerCopyState === "copied"
                  ? "Maklertext kopiert"
                  : brokerCopyState === "failed"
                    ? "Manuell kopieren"
                    : "Maklertext kopieren"}
              </button>
            </div>
            <pre className="document-copy-preview">{brokerPriceCommunication.copyText}</pre>
            {brokerCopyState === "failed" && <p className="tax-warning">Maklertext konnte nicht kopiert werden. Text bitte manuell markieren.</p>}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Interne Sperren" items={brokerPriceCommunication.internalGuardrails} />
          <DecisionList title="Versandbedingungen" items={brokerPriceCommunication.externalConditions} />
          <DecisionList title="Naechste Schritte" items={brokerPriceCommunication.nextActions} />
        </div>
      </section>

      <section className={`loi-conditions-band ${loiConditions.tone}`} aria-label="LOI-Bedingungen">
        <div className="loi-conditions-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">LOI-Bedingungen</span>
            <h3>{loiConditions.headline}</h3>
            <p>{loiConditions.loiMode}</p>
          </div>
          <div className="decision-fact-grid">
            {loiConditions.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`loi-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="loi-copy-panel">
          <div>
            <span>LOI-Modus</span>
            <p>{loiConditions.loiMode}</p>
          </div>
          <div>
            <div className="loi-copy-card-head">
              <span>LOI-Text</span>
              <button className="button" type="button" onClick={() => void copyLoiText()}>
                <Copy size={16} />
                {loiCopyState === "copied" ? "LOI-Text kopiert" : "LOI-Text kopieren"}
              </button>
            </div>
            <p>{loiConditions.copyText}</p>
            {loiCopyState === "failed" && <p className="tax-warning">LOI-Kopieren nicht moeglich. Text bitte manuell markieren.</p>}
          </div>
        </div>

        <div className="loi-condition-heading">
          <span>Pflichtbedingungen</span>
          <strong>{loiConditions.conditions.length} Punkte</strong>
        </div>
        <div className="loi-condition-grid">
          {loiConditions.conditions.map((condition) => (
            <article className={`loi-condition-card ${condition.tone}`} key={`loi-condition-${condition.label}`}>
              <div className="loi-condition-head">
                <div>
                  <span>{condition.statusLabel}</span>
                  <h4>{condition.label}</h4>
                </div>
                <strong>{condition.owner}</strong>
              </div>
              <p>{condition.clause}</p>
              <p className="loi-condition-proof">{condition.proof}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Kill-Klauseln" items={loiConditions.killClauses} />
          <DecisionList title="LOI-Naechste Schritte" items={loiConditions.nextActions} />
        </div>
      </section>

      <section className={`strategy-brief-band offer-decision-band ${offerDecision.tone}`} aria-label="Gebotsentscheidung">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Gebotsentscheidung</span>
            <h3>{offerDecision.headline}</h3>
            <p>{offerDecision.offerMode}</p>
          </div>
          <div className="decision-fact-grid">
            {offerDecision.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Verkaeufer-Satz" items={[offerDecision.sellerLine]} />
          <DecisionList title="Bedingungen" items={offerDecision.conditions} />
          <DecisionList title="Naechste Schritte" items={offerDecision.nextActions} />
        </div>
      </section>

      <section id="deal-offer-release-package" className={`strategy-brief-band offer-release-band ${offerReleasePackage.tone}`} aria-label="Angebotsfreigabe-Paket">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Angebotsfreigabe-Paket</span>
            <h3>{offerReleasePackage.headline}</h3>
            <p>{offerReleasePackage.sellerMessage}</p>
          </div>
          <div className="decision-fact-grid">
            {offerReleasePackage.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Externer Satz" items={[offerReleasePackage.sellerMessage]} />
          <DecisionList title="Interne Leitplanken" items={offerReleasePackage.internalGuardrails} />
          <DecisionList title="Bedingungen fuer Versand" items={offerReleasePackage.externalConditions} />
        </div>
      </section>

      <section className={`assumption-audit-band ${assumptionAudit.tone}`} aria-label="Annahmen-Audit">
        <div className="assumption-audit-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Annahmen-Audit</span>
            <h3>{assumptionAudit.headline}</h3>
            <p>{assumptionAudit.summary}</p>
          </div>
          <div className="decision-fact-grid">
            <div className={`decision-fact ${assumptionAudit.tone}`}>
              <span>Audit-Score</span>
              <strong>{assumptionAudit.score} %</strong>
            </div>
            <div className={`decision-fact ${assumptionAudit.verifiedCount === assumptionAudit.total ? "good" : "watch"}`}>
              <span>Belegt</span>
              <strong>{assumptionAudit.verifiedCount}/{assumptionAudit.total}</strong>
            </div>
            <div className={`decision-fact ${assumptionAudit.blockerCount ? "risk" : "good"}`}>
              <span>Preisrelevant offen</span>
              <strong>{assumptionAudit.blockerCount}</strong>
            </div>
          </div>
        </div>

        <div className="assumption-audit-grid">
          {assumptionAudit.rows.map((row) => (
            <article className={`assumption-audit-card ${row.tone}`} key={row.key}>
              <div className="assumption-audit-card-head">
                <div>
                  <span>{row.category}</span>
                  <h4>{row.label}</h4>
                </div>
                <em className={`score ${row.tone}`}>{row.statusLabel}</em>
              </div>
              <strong>{row.currentValue}</strong>
              <small>{row.priceImpact}</small>
              <p>{row.action}</p>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList
            title="Preisrelevant offen"
            items={
              assumptionAudit.priceCriticalOpen.length
                ? assumptionAudit.priceCriticalOpen
                : ["Keine preisrelevante Annahme ist im aktuellen Datenstand offen."]
            }
          />
          <DecisionList title="Naechste Checks" items={assumptionAudit.nextActions} />
        </div>
      </section>

      <section className={`exit-liquidity-band ${exitLiquidity.tone}`} aria-label="Exit-Liquiditaet">
        <div className="exit-liquidity-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Exit-Liquiditaet</span>
            <h3>{exitLiquidity.headline}</h3>
            <p>{exitLiquidity.summary}</p>
          </div>
          <div className="decision-fact-grid">
            {exitLiquidity.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={`exit-fact-${fact.label}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="exit-buyer-grid">
          {exitLiquidity.buyerLanes.map((lane) => (
            <article className={`exit-buyer-card ${lane.tone}`} key={lane.label}>
              <div className="exit-buyer-card-head">
                <h4>{lane.label}</h4>
                <span className={`score ${lane.tone}`}>{lane.statusLabel}</span>
              </div>
              <p>{lane.reason}</p>
              <dl>
                <div>
                  <dt>Naechster Check</dt>
                  <dd>{lane.nextCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="strategy-brief-detail">
          <DecisionList
            title="Exit-Risiken"
            items={exitLiquidity.risks.length ? exitLiquidity.risks : ["Keine harte Exit-Bremse im aktuellen Datenstand belegt."]}
          />
          <DecisionList title="Naechste Checks" items={exitLiquidity.nextActions} />
        </div>
      </section>

      <section className={`strategy-brief-band development-discipline-band ${developmentPricing.tone}`} aria-label="Entwicklungsdisziplin">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Entwicklungsdisziplin</span>
            <h3>{developmentPricing.headline}</h3>
            <p>{developmentPricing.priceRule}</p>
          </div>
          <div className="decision-fact-grid">
            {developmentPricing.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Memo-Regel" items={developmentPricing.memoItems} />
          <DecisionList
            title="Preis-Bremsen"
            items={
              developmentPricing.blockers.length
                ? developmentPricing.blockers
                : ["WEG, Geo, Capex und Bank-Case stuetzen den gedeckelten Entwicklungsbonus."]
            }
          />
          <DecisionList title="Naechste Checks" items={developmentPricing.nextActions} />
        </div>
      </section>

      <DevelopmentPotentialSection deal={deal} key={deal.id} onDealUpdated={setDeal} />

      <section
        id="deal-evidence-board"
        className={`strategy-brief-band evidence-blocker-board ${evidenceQuality.tone}`}
        aria-label="Beleg-Blocker-Board"
      >
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Beleg-Blocker</span>
            <h3>Was blockiert den Ankauf?</h3>
            <p>{evidenceQuality.headline}: {evidenceQuality.summary}</p>
          </div>
          <div className="decision-fact-grid">
            <div className={`decision-fact ${evidenceQuality.tone}`}>
              <span>Beleg-Score</span>
              <strong>{evidenceQuality.percent} %</strong>
            </div>
            <div className={evidenceBlockers.length ? "decision-fact risk" : "decision-fact good"}>
              <span>Top-Blocker</span>
              <strong>{evidenceBlockers.length}</strong>
            </div>
            <div className={`decision-fact ${documentSummary.percent >= 80 ? "good" : documentSummary.percent >= 50 ? "watch" : "risk"}`}>
              <span>Unterlagen</span>
              <strong>{documentSummary.provided}/{documentSummary.total}</strong>
            </div>
            <div className={`decision-fact ${readinessSummary.tone}`}>
              <span>Ankaufsfreigabe</span>
              <strong>{readinessSummary.readyCount}/{readinessSummary.total}</strong>
            </div>
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList
            title="Top-Blocker"
            items={
              evidenceBlockers.length
                ? evidenceBlockers
                : ["Keine harte Belegluecke im aktuellen Datenstand."]
            }
          />
          <DecisionList
            title="Sofort anfordern"
            items={
              immediateEvidenceRequests.length
                ? immediateEvidenceRequests
                : ["Unterlagenpaket vollstaendig: Inhalte fachlich gegen Memo, Bank und Kaufvertrag abgleichen."]
            }
          />
          <DecisionList
            title="Naechste Checks"
            items={
              nextEvidenceChecks.length
                ? nextEvidenceChecks
                : ["Alle Kernbelege sind vorhanden; fachliche Plausibilitaet vor Angebot final gegenpruefen."]
            }
          />
        </div>
      </section>

      <section className={`evidence-quality-band ${evidenceQuality.tone}`} aria-label="Datenvertrauen">
        <div className="evidence-quality-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Datenvertrauen</span>
            <h3>{evidenceQuality.headline}</h3>
            <p>{evidenceQuality.summary}</p>
          </div>
          <div className={`evidence-quality-counter ${evidenceQuality.tone}`}>
            <span>Beleglage</span>
            <strong>{evidenceQuality.percent} %</strong>
            <small>Kernannahmen</small>
          </div>
        </div>

        <div className="evidence-quality-grid">
          {evidenceQuality.rows.map((row) => (
            <article className={`evidence-quality-row ${row.tone}`} key={row.key}>
              <div className="evidence-quality-row-head">
                <h4>{row.label}</h4>
                <span className={`score ${row.tone}`}>{row.statusLabel}</span>
              </div>
              <p>{row.summary}</p>
            </article>
          ))}
        </div>

        <div className="evidence-quality-detail">
          <DecisionList
            title="Belastbare Belege"
            items={
              evidenceQuality.verifiedEvidence.length
                ? evidenceQuality.verifiedEvidence
                : ["Noch keine Kernannahme ist belastbar genug belegt."]
            }
          />
          <DecisionList
            title="Offene Belege"
            items={
              evidenceQuality.openEvidence.length
                ? evidenceQuality.openEvidence
                : ["Keine offene Beleggruppe im aktuellen Datenstand."]
            }
          />
          <DecisionList
            title="Naechste Belege"
            items={
              evidenceQuality.nextActions.length
                ? evidenceQuality.nextActions
                : ["Alle Kernbelege sind vorhanden; fachliche Plausibilitaet vor Angebot final gegenpruefen."]
            }
          />
        </div>
      </section>

      <section id="deal-readiness" className={`readiness-band ${readinessSummary.tone}`} aria-label="Ankaufsfreigabe">
        <div className="readiness-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Ankaufsfreigabe</span>
            <h3>{readinessSummary.headline}</h3>
            <p>
              {readinessSummary.readyCount}/{readinessSummary.total} Gates bestanden. Erst harte Blocker klaeren,
              bevor ein finales Angebot oder ein Notartermin vorbereitet wird.
            </p>
          </div>
          <div className={`readiness-counter ${readinessSummary.tone}`}>
            <span>Freigabe</span>
            <strong>{readinessSummary.readyCount}/{readinessSummary.total}</strong>
            <small>Gates bestanden</small>
          </div>
        </div>

        <div className="readiness-gate-grid">
          {readinessSummary.gates.map((gate) => (
            <article className={`readiness-gate ${gate.tone}`} key={gate.key}>
              <div className="readiness-gate-head">
                <h4>{gate.label}</h4>
                <span className={`score ${gate.tone}`}>{gate.statusLabel}</span>
              </div>
              <p>{gate.summary}</p>
              {gate.actions.length > 0 && (
                <ul className="plain-list">
                  {gate.actions.slice(0, 2).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <div className="readiness-actions">
          <DecisionList
            title="Naechste Freigabe-Schritte"
            items={
              readinessSummary.nextActions.length
                ? readinessSummary.nextActions
                : ["Alle Freigabe-Gates sind im aktuellen Datenstand bestanden."]
            }
          />
        </div>
      </section>

      {uw && (
        <section className={`cashflow-banner ${uw.is_cashflow_positive_before_tax ? "positive" : "negative"}`}>
          <div className="cashflow-headline">
            {uw.is_cashflow_positive_before_tax ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
            <div>
              <span>Monatlicher Cashflow vor Steuer</span>
              <strong>{formatCurrency(uw.monthly_cashflow_before_tax)}</strong>
            </div>
          </div>
          <div className="cashflow-facts">
            <Fact label="Nach Steuer (ca.)" value={formatCurrency(uw.monthly_cashflow_after_tax_approx)} />
            <Fact label="Max. Kaufpreis fuer Cashflow >= 0" value={formatCurrency(uw.max_purchase_price_for_neutral_cashflow)} />
            <Fact label="Eigenkapital" value={formatCurrency(uw.equity_required)} />
            <Fact label="davon Reno finanziert" value={formatCurrency(uw.financed_capex)} />
          </div>
        </section>
      )}

      <section className="deal-grid">
        <FinancingPanel deal={deal} onSaved={setDeal} />

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
            <h2>Regionen-Zukunft</h2>
            <span className={`score ${scoreTone(regionOutlook?.total_score)}`}>{regionOutlook?.total_score ?? "-"}</span>
          </div>
          <p className="recommendation">{regionOutlook?.thesis || "Noch keine regionale Zukunftsthese."}</p>
          {regionOutlook ? (
            <>
              <div className="region-outlook-grid">
                <div>
                  <h3>Wichtigste Signale</h3>
                  <div className="outlook-metric-list">
                    {regionMetrics.map((metric) => (
                      <div className="fact" key={metric.name}>
                        <span>{regionMetricLabels[metric.name] || metric.name.replaceAll("_", " ")}</span>
                        <strong>{metric.value}</strong>
                        <small>{metric.interpretation}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Kategorien</h3>
                  <div className="score-bars">
                    {Object.entries(regionOutlook.category_scores).map(([label, value]) => (
                      <div className="pipeline-bar" key={label}>
                        <span>{label.replaceAll("_", " ")}</span>
                        <div className="bar-track"><div style={{ width: `${value}%` }} /></div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="risk-grid outlook-notes">
                <div>
                  <h3>Positive These</h3>
                  <ul className="plain-list">
                    {(regionOutlook.positive_factors.length ? regionOutlook.positive_factors : ["Noch keine starken positiven Signale."]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Vorsicht</h3>
                  <ul className="plain-list">
                    {[...regionOutlook.caution_factors, ...regionOutlook.data_quality_notes].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="tax-warning">{regionOutlook.next_recommended_action}</p>
            </>
          ) : (
            <p className="tax-warning">Regionendaten fehlen noch.</p>
          )}
        </div>

        <div className="panel wide">
          <div className="panel-header">
            <h2>Zinsbindungs-Stresstest & Restschuld-Faktor</h2>
            <div className="button-row">
              {uw?.residual_debt_factor_rating && (
                <span className={`score ${ratingTone(uw.residual_debt_factor_rating)}`}>
                  Faktor {formatNumber(uw.residual_debt_factor)}
                </span>
              )}
              <span>{uw?.stressed_interest_rate_percent ? `Anschlusszins ${formatPercent(uw.stressed_interest_rate_percent)}` : "Nicht gerechnet"}</span>
            </div>
          </div>
          <div className="kpi-strip">
            <Fact label="Restschuld Ende Zinsbindung" value={formatCurrency(uw?.remaining_loan_at_fixation_end)} />
            <Fact label="Restschuld-Faktor (Ziel ≤ 150 KM)" value={formatNumber(uw?.residual_debt_factor, " KM")} />
            <Fact label="Lücke bis Faktor 150" value={formatCurrency(uw?.amortization_gap_to_target_factor)} />
            <Fact label="Restschuld Ende Haltedauer" value={formatCurrency(uw?.remaining_loan_after_holding)} />
            <Fact label="Kapitaldienst gestresst" value={formatCurrency(uw?.stressed_annual_debt_service)} />
            <Fact label="Cashflow gestresst" value={formatCurrency(uw?.stressed_monthly_cashflow_before_tax)} />
            <Fact label="DSCR gestresst" value={formatNumber(uw?.stressed_dscr)} />
          </div>
          {uw?.residual_debt_factor_rating && uw.residual_debt_factor_rating !== "green" && (
            <p className="tax-warning">
              Restschuld bei Zinsbindungsende über 150 Kaltmieten: Es fehlen {formatCurrency(uw.amortization_gap_to_target_factor)} Tilgung/Eigenkapital,
              damit sich das Objekt bei 5% Anschlusszins selbst trägt (Faustregel: 8% Jahresmiete auf Restschuld = 5% Zins + 1% Tilgung + 1% Steuer + 1% Rücklage).
            </p>
          )}
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

        <RenovationPlanPanel deal={deal} />

        <div className="panel">
          <div className="panel-header">
            <h2>Lage</h2>
            {deal.region && <span className={`score ${scoreTone(deal.region.total_score)}`}>Standort {deal.region.total_score}</span>}
          </div>
          <div className="fact-grid single">
            <Fact label="Standort" value={locationSummary.headline} />
          </div>
          <p className="recommendation">{locationSummary.detail}</p>
        </div>

        <DealMicroLocationPanel deal={deal} onSaved={setDeal} />

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
              <div className="document-cockpit-head">
                <div>
                  <h3>Due-Diligence-Unterlagen</h3>
                  <span>{documentSummary.headline}</span>
                </div>
                <strong className={`score ${scoreTone(documentSummary.percent)}`}>{documentSummary.percent} %</strong>
              </div>
              <div className="document-status-list">
                {documentSummary.rows.map((row) => (
                  <div className={`document-status-row ${row.tone}`} key={row.documentType}>
                    <div className="document-status-copy">
                      <span>{row.label}</span>
                      <strong>{row.fileName || "Noch nicht vorhanden"}</strong>
                      {row.riskNotes && <small>{row.riskNotes}</small>}
                    </div>
                    <div className="document-status-actions">
                      <em>{row.statusLabel}</em>
                      {row.status === "review" && row.documentId ? (
                        <button
                          aria-label={`${row.label} als geprueft markieren`}
                          className="document-review-button"
                          disabled={documentReviewBusyId === row.documentId}
                          onClick={() => void markDocumentReviewed(row.documentId!, row.label)}
                          type="button"
                        >
                          <CheckCircle size={14} />
                          {documentReviewBusyId === row.documentId ? "Speichere" : "Geprueft"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="document-request-pack">
                <div className="document-request-pack-head">
                  <h3>Anforderungspaket</h3>
                  <div className="document-request-actions">
                    <span>{documentSummary.requestPack.headline}</span>
                    <button className="button" type="button" onClick={() => void copyDocumentRequestPack()}>
                      <Copy size={16} />
                      {documentRequestCopyState === "copied" ? "Anforderung kopiert" : "Anforderung kopieren"}
                    </button>
                  </div>
                </div>
                <p>{documentSummary.requestPack.copyIntro}</p>
                <div className="document-copy-summary" aria-label="Versandfertiger Unterlagentext">
                  <div>
                    <span>Betreff</span>
                    <strong>{documentSummary.requestPack.copySubject}</strong>
                  </div>
                  <div>
                    <span>Adressaten</span>
                    <strong>{documentSummary.requestPack.recipientSummary}</strong>
                  </div>
                  <div>
                    <span>Blockierend</span>
                    <strong>{documentSummary.requestPack.blockingCount}</strong>
                  </div>
                  {documentRequestCopyState === "failed" && <p className="tax-warning">Kopieren nicht moeglich. Text unten manuell markieren.</p>}
                </div>
                <pre className="document-copy-preview">{documentSummary.requestPack.copyText}</pre>
                {documentSummary.requestPack.requests.length > 0 && (
                  <div className="document-request-grid">
                    {documentSummary.requestPack.requests.slice(0, 4).map((request) => (
                      <article className={`document-request-card ${request.tone}`} key={request.documentType}>
                        <div>
                          <h4>{request.label}</h4>
                          <span>{request.recipient}</span>
                        </div>
                        <p>{request.reason}</p>
                        <strong>{request.blocking ? "Blockiert finales Angebot" : "Fachlich pruefen"}</strong>
                      </article>
                    ))}
                  </div>
                )}
                <ul className="plain-list document-request-lines">
                  {documentSummary.requestPack.copyLines.slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="tax-warning">{documentSummary.requestPack.nextAction}</p>
              </div>
              <p className="tax-warning">{documentSummary.nextAction}</p>
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

function DealCheckPath({ items }: { items: DealCheckPathItem[] }) {
  return (
    <nav className="deal-check-path" aria-label="Deal-Pruefpfad">
      <div className="deal-check-path-head">
        <span className="section-kicker">Pruefpfad</span>
        <strong>{items.length} Stationen</strong>
      </div>
      <div className="deal-check-path-links">
        {items.map((link) => (
          <a className={`deal-check-link ${link.tone}`} href={link.href} key={link.href}>
            <span className="deal-check-step">{link.step}</span>
            <span className="deal-check-copy">
              <strong>{link.label}</strong>
              <small aria-label={`${link.label} Kennzahl`}>{link.metric}</small>
            </span>
            <em className={`deal-check-status ${link.tone}`} aria-label={`${link.label} Status`}>
              {link.status}
            </em>
          </a>
        ))}
      </div>
    </nav>
  );
}

function DealAuditTrail({ auditLog }: { auditLog: DealAuditLogItem[] }) {
  const visibleAuditLog = auditLog.slice(0, 6);

  return (
    <section className="deal-audit-trail" aria-label="Entscheidungs-Audit">
      <div className="deal-audit-trail-head">
        <div className="deal-decision-copy">
          <span className="section-kicker">Audit-Trail</span>
          <h3>Entscheidungs-Audit</h3>
          <p>Die letzten Rechenschritte und Pipeline-Aenderungen fuer diesen Deal.</p>
        </div>
        <div className="deal-audit-count">
          <span>Protokoll</span>
          <strong>{auditLog.length} protokollierte Schritte</strong>
        </div>
      </div>

      <div className="deal-audit-grid">
        {visibleAuditLog.map((item) => (
          <article className={`deal-audit-item ${auditToneClass(item.tone)}`} key={item.id}>
            <div className="deal-audit-item-head">
              <div>
                <span>{auditEventLabel(item.event_type)}</span>
                <h4>{item.label}</h4>
              </div>
              <time dateTime={item.created_at || undefined}>{formatAuditDate(item.created_at)}</time>
            </div>
            {item.detail ? <p>{item.detail}</p> : null}
            <div className="deal-audit-metric">
              <span>{item.metric_label || "Wert"}</span>
              <strong>{formatAuditMetricValue(item)}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function auditToneClass(tone: DealAuditLogItem["tone"]) {
  if (tone === "good" || tone === "watch" || tone === "risk" || tone === "empty") {
    return tone;
  }
  return "empty";
}

function auditEventLabel(eventType: string) {
  if (eventType === "pipeline") return "Pipeline";
  if (eventType === "score") return "Score";
  if (eventType === "underwriting") return "Underwriting";
  return "Ereignis";
}

function formatAuditDate(value: string | null | undefined) {
  if (!value) return "Zeit offen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Zeit offen";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatAuditMetricValue(item: DealAuditLogItem) {
  const value = item.metric_value;
  if (value === null || value === undefined || value === "") return "Fehlt";

  const metricLabel = item.metric_label?.toLowerCase() || "";
  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numericValue)) {
    if (metricLabel.includes("cashflow") || metricLabel.includes("eur") || metricLabel.includes("preis")) {
      return formatCurrency(numericValue).replace(/\u00a0/g, " ");
    }
    return formatNumber(numericValue);
  }

  return String(value);
}

function buildDealCheckPathItems(input: {
  decisionBrief: ReturnType<typeof dealDecisionBrief>;
  developmentPotentialMap: ReturnType<typeof dealDevelopmentPotentialMapBrief>;
  evidenceQuality: ReturnType<typeof dealEvidenceQualityBrief>;
  locationAlpha: ReturnType<typeof dealMicroLocationAlphaBrief>;
  offerBand: ReturnType<typeof dealOfferBandBrief>;
  repairPlan: ReturnType<typeof dealRepairPlanBrief>;
  readinessSummary: ReturnType<typeof acquisitionReadinessSummary>;
}): DealCheckPathItem[] {
  return [
    {
      ...dealCheckPathLinks[0],
      metric: dealDecisionMetric(input.decisionBrief.decision),
      status: checkPathToneStatus(input.decisionBrief.tone),
      tone: input.decisionBrief.tone
    },
    {
      ...dealCheckPathLinks[1],
      metric: offerBandMetric(input.offerBand.status),
      status: checkPathToneStatus(input.offerBand.tone),
      tone: input.offerBand.tone
    },
    {
      ...dealCheckPathLinks[2],
      metric: repairPlanMetric(input.repairPlan),
      status: checkPathToneStatus(input.repairPlan.tone),
      tone: input.repairPlan.tone
    },
    {
      ...dealCheckPathLinks[3],
      metric: locationAlphaMetric(input.locationAlpha.status),
      status: checkPathToneStatus(input.locationAlpha.tone),
      tone: input.locationAlpha.tone
    },
    {
      ...dealCheckPathLinks[4],
      metric: developmentMapMetric(input.developmentPotentialMap.status),
      status: checkPathToneStatus(input.developmentPotentialMap.tone),
      tone: input.developmentPotentialMap.tone
    },
    {
      ...dealCheckPathLinks[5],
      metric: `${input.evidenceQuality.percent} % Belege`,
      status: checkPathToneStatus(input.evidenceQuality.tone),
      tone: input.evidenceQuality.tone
    },
    {
      ...dealCheckPathLinks[6],
      metric: `${input.readinessSummary.readyCount}/${input.readinessSummary.total} Gates`,
      status: checkPathToneStatus(input.readinessSummary.tone),
      tone: input.readinessSummary.tone
    }
  ];
}

function checkPathToneStatus(tone: ReturnType<typeof scoreTone>): string {
  if (tone === "good") return "OK";
  if (tone === "watch") return "Pruefen";
  if (tone === "risk") return "Blocker";
  return "Offen";
}

function dealDecisionMetric(decision: ReturnType<typeof dealDecisionBrief>["decision"]): string {
  if (decision === "buy") return "Kaufen";
  if (decision === "negotiate") return "Verhandeln";
  if (decision === "watch") return "Beobachten";
  return "Ablehnen";
}

function offerBandMetric(status: ReturnType<typeof dealOfferBandBrief>["status"]): string {
  if (status === "within_band") return "Im Band";
  if (status === "price_gap") return "Preisblocker";
  return "Fehlt";
}

function repairPlanMetric(repairPlan: ReturnType<typeof dealRepairPlanBrief>): string {
  if (repairPlan.cashflowGapMonthly !== null) {
    return `${formatCurrency(repairPlan.cashflowGapMonthly)}/Monat`;
  }
  if (repairPlan.purchasePriceRepairEur !== null) {
    return formatCurrency(repairPlan.purchasePriceRepairEur);
  }
  return repairPlan.status === "ready" ? "Reserve" : "Fehlt";
}

function locationAlphaMetric(status: ReturnType<typeof dealMicroLocationAlphaBrief>["status"]): string {
  if (status === "alpha") return "Alpha";
  if (status === "memo") return "Memo";
  if (status === "risk") return "Risiko";
  return "Fehlt";
}

function developmentMapMetric(status: ReturnType<typeof dealDevelopmentPotentialMapBrief>["status"]): string {
  if (status === "priceable") return "Preisbar";
  if (status === "memo") return "Memo";
  if (status === "blocked") return "Blockiert";
  return "Offen";
}

function readableErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden des Deals.";
}

function ratingTone(rating: "green" | "amber" | "red"): "good" | "watch" | "risk" {
  if (rating === "green") return "good";
  if (rating === "amber") return "watch";
  return "risk";
}

type DevelopmentAssumptionInputKey = "targetRentMonthly" | "capex" | "refiLtvPercent" | "valueYieldPercent";

function DevelopmentPotentialSection({
  deal,
  onDealUpdated
}: {
  deal: Deal;
  onDealUpdated: (deal: Deal) => void;
}) {
  const defaults = objectDevelopmentAssumptionDefaults(deal);
  const savedRenovationCase = deal.latest_renovation_case ?? null;
  const savedRenovationInputs = savedRenovationCase?.inputs ?? {};
  const initialAssumptions: Record<DevelopmentAssumptionInputKey, string> = {
    targetRentMonthly: assumptionInputValue(savedRenovationInputs.target_cold_rent_monthly, defaults.targetRentMonthly),
    capex: assumptionInputValue(savedRenovationInputs.planned_capex, defaults.capex),
    refiLtvPercent: assumptionInputValue(savedRenovationInputs.refinance_ltv_percent, defaults.refiLtvPercent),
    valueYieldPercent: assumptionInputValue(savedRenovationInputs.valuation_yield_percent, defaults.valueYieldPercent)
  };
  const [assumptionInputs, setAssumptionInputs] = useState(initialAssumptions);
  const [backendCase, setBackendCase] = useState<RenovationPlan | null>(savedRenovationCase?.results ?? null);
  const [backendCaseError, setBackendCaseError] = useState<string | null>(null);
  const [backendCaseBusy, setBackendCaseBusy] = useState(false);
  const developmentPotential = objectDevelopmentPotentialBrief(deal, {
    targetRentMonthly: parseDevelopmentInput(assumptionInputs.targetRentMonthly),
    capex: parseDevelopmentInput(assumptionInputs.capex),
    refiLtvPercent: parseDevelopmentInput(assumptionInputs.refiLtvPercent),
    valueYieldPercent: parseDevelopmentInput(assumptionInputs.valueYieldPercent)
  });

  function updateAssumption(key: DevelopmentAssumptionInputKey, value: string) {
    setAssumptionInputs((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function calculateBackendCase() {
    setBackendCaseBusy(true);
    setBackendCaseError(null);
    try {
      const savedPlan = await analyzeRenovationPlan(deal.id, {
        planned_capex: assumptionInputs.capex,
        target_cold_rent_monthly: assumptionInputs.targetRentMonthly,
        valuation_yield_percent: assumptionInputs.valueYieldPercent,
        refinance_ltv_percent: assumptionInputs.refiLtvPercent,
        target_energy_class: null
      });
      setBackendCase(savedPlan);
      onDealUpdated(await getDeal(deal.id));
    } catch (error) {
      setBackendCase(null);
      setBackendCaseError(readableErrorMessage(error));
    } finally {
      setBackendCaseBusy(false);
    }
  }

  return (
    <section className={`development-potential-band ${developmentPotential.tone}`} aria-label="Objekt-Entwicklungspotential">
      <div className="development-potential-topline">
        <div className="deal-decision-copy">
          <span className="section-kicker">Objekt-Entwicklungspotential</span>
          <h3>{developmentPotential.headline}</h3>
          <p>{developmentPotential.summary}</p>
        </div>
        <div className="decision-fact-grid">
          {developmentPotential.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="development-assumption-panel">
        <div className="development-assumption-head">
          <h4>Annahmen</h4>
          <div className="development-assumption-actions">
            <button className="button primary" type="button" disabled={backendCaseBusy} onClick={() => void calculateBackendCase()}>
              <RefreshCw size={14} />
              Bank-Case rechnen & speichern
            </button>
            <button className="icon-button text" type="button" onClick={() => setAssumptionInputs(initialAssumptions)}>
              <RefreshCw size={14} />
              Basiswerte
            </button>
          </div>
        </div>
        <div className="development-assumption-grid">
          <label className="development-assumption-field">
            <span>Ziel-Kaltmiete / Monat</span>
            <input
              aria-label="Ziel-Kaltmiete / Monat"
              inputMode="decimal"
              min="0"
              step="50"
              type="number"
              value={assumptionInputs.targetRentMonthly}
              onChange={(event) => updateAssumption("targetRentMonthly", event.target.value)}
            />
          </label>
          <label className="development-assumption-field">
            <span>Sanierungsbudget</span>
            <input
              aria-label="Sanierungsbudget"
              inputMode="decimal"
              min="0"
              step="1000"
              type="number"
              value={assumptionInputs.capex}
              onChange={(event) => updateAssumption("capex", event.target.value)}
            />
          </label>
          <label className="development-assumption-field">
            <span>Refi-LTV</span>
            <input
              aria-label="Refi-LTV"
              inputMode="decimal"
              max="100"
              min="1"
              step="1"
              type="number"
              value={assumptionInputs.refiLtvPercent}
              onChange={(event) => updateAssumption("refiLtvPercent", event.target.value)}
            />
          </label>
          <label className="development-assumption-field">
            <span>Bewertungsrendite</span>
            <input
              aria-label="Bewertungsrendite"
              inputMode="decimal"
              max="20"
              min="1"
              step="0.1"
              type="number"
              value={assumptionInputs.valueYieldPercent}
              onChange={(event) => updateAssumption("valueYieldPercent", event.target.value)}
            />
          </label>
        </div>
        {savedRenovationCase && (
          <section className="development-saved-case" aria-label="Gespeicherter Entwicklungsfall">
            <div className="development-saved-case-copy">
              <span className="section-kicker">Gespeichert im Deal</span>
              <h5>Case #{savedRenovationCase.id} gespeichert</h5>
              <p>Bankpaket, Memo und Preisdisziplin verwenden diesen Entwicklungsfall.</p>
            </div>
            <div className="development-saved-case-facts">
              <span>{developmentSavedCurrency(savedRenovationInputs.target_cold_rent_monthly)} Zielmiete</span>
              <span>{developmentSavedCurrency(savedRenovationInputs.planned_capex)} Capex</span>
              <span>{developmentSavedPercent(savedRenovationInputs.refinance_ltv_percent)} Refi-LTV</span>
              <span>{developmentSavedPercent(savedRenovationInputs.valuation_yield_percent)} Bewertungsrendite</span>
            </div>
            <div className="development-saved-case-actions">
              <Link className="button text" href={`/memo/${deal.id}`}>
                <FileText size={14} />
                Memo pruefen
              </Link>
              <Link className="button text" href={`/deals/${deal.id}/bank`}>
                <Landmark size={14} />
                Bankpaket pruefen
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className={`development-value-decision ${developmentPotential.valueDecision.tone}`}>
        <div className="development-value-decision-head">
          <div>
            <h4>Wertverwertung</h4>
            <h5>{developmentPotential.valueDecision.headline}</h5>
            <p>{developmentPotential.valueDecision.summary}</p>
          </div>
          <p className="development-value-next">{developmentPotential.valueDecision.nextAction}</p>
        </div>
        <div className="decision-fact-grid">
          {developmentPotential.valueDecision.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`value-decision-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
        <div className="development-value-lane-grid">
          {developmentPotential.valueDecision.lanes.map((lane) => (
            <article className={`development-value-lane ${lane.tone}`} key={`value-lane-${lane.key}`}>
              <div className="development-scenario-card-head">
                <h5>{lane.label}</h5>
                <span className={`score ${lane.tone}`}>{lane.statusLabel}</span>
              </div>
              <dl>
                <div>
                  <dt>Wert</dt>
                  <dd>{lane.estimatedValueEur !== null ? formatCurrency(lane.estimatedValueEur) : "Qualitativ"}</dd>
                </div>
                <div>
                  <dt>Preisregel</dt>
                  <dd>{lane.rule}</dd>
                </div>
                <div>
                  <dt>Naechster Beleg</dt>
                  <dd>{lane.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <section className={`development-command-panel ${developmentPotential.developmentCommand.tone}`} aria-label="Entwicklungs-Kompass">
        <div className="development-command-copy">
          <span className="section-kicker">Entwicklungs-Kompass</span>
          <h4>{developmentPotential.developmentCommand.headline}</h4>
          <p>{developmentPotential.developmentCommand.summary}</p>
        </div>
        <dl className="development-command-grid">
          <div>
            <dt>Fokushebel</dt>
            <dd>{developmentPotential.developmentCommand.focusLever}</dd>
          </div>
          <div>
            <dt>Objektbereich</dt>
            <dd>{developmentPotential.developmentCommand.objectArea}</dd>
          </div>
          <div>
            <dt>Preisfreigabe</dt>
            <dd>{developmentPotential.developmentCommand.priceUse}</dd>
          </div>
          <div>
            <dt>Freigabe-Sperre</dt>
            <dd>{developmentPotential.developmentCommand.openIssue}</dd>
          </div>
        </dl>
      </section>

      {(backendCase || backendCaseError) && (
        <div className={`development-backend-case ${backendCaseError ? "risk" : backendCaseTone(backendCase)}`}>
          <div className="development-backend-case-head">
            <div>
              <h4>Backend-Case</h4>
              <p>
                {backendCaseError
                  ? backendCaseError
                  : backendCaseRecommendation(backendCase?.recommendation)}
              </p>
            </div>
            {backendCase && <span className={`score ${backendCaseTone(backendCase)}`}>{backendCase.recommendation.replaceAll("_", " ")}</span>}
          </div>
          {backendCase && (
            <>
              <div className="development-backend-kpis">
                <Fact label="Kapital freisetzbar" value={formatCurrency(backendCase.potential_equity_released)} />
                <Fact label="EK bleibt gebunden" value={formatCurrency(backendCase.net_equity_still_bound_after_refinance)} />
                <Fact label="Sanierungs-ROI" value={formatPercent(backendCase.simple_roi_percent)} />
                <Fact label="Werthebel-Faktor" value={formatNumber(backendCase.value_add_multiple, "x")} />
              </div>
              {(backendCase.kfw_hint || backendCase.warnings.length > 0) && (
                <ul className="plain-list development-backend-notes">
                  {backendCase.kfw_hint && <li>{backendCase.kfw_hint}</li>}
                  {backendCase.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="development-scenario-panel">
        <h4>Belegcheck Entwicklung</h4>
        <div className="development-proof-grid">
          {developmentPotential.proofGates.map((gate) => (
            <article className={`development-proof-card ${gate.tone}`} key={`proof-${gate.key}`}>
              <div className="development-scenario-card-head">
                <h5>{gate.label}</h5>
                <span className={`score ${gate.tone}`}>{gate.statusLabel}</span>
              </div>
              <p>{gate.priceRule}</p>
              <dl>
                <div>
                  <dt>Belegt</dt>
                  <dd>{gate.provenBy.length ? gate.provenBy.join(" ") : "Noch kein belastbarer Beleg."}</dd>
                </div>
                <div>
                  <dt>Offen</dt>
                  <dd>{gate.missingProofs.length ? gate.missingProofs.join(" ") : "Keine Pflichtluecke im aktuellen Stand."}</dd>
                </div>
                <div>
                  <dt>Naechster Schritt</dt>
                  <dd>{gate.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="development-scenario-panel">
        <h4>Priorisierte Werthebel</h4>
        <div className="development-scenario-grid development-priority-grid">
          {developmentPotential.prioritizedLevers.map((lever) => (
            <article className={`development-scenario-card ${lever.tone}`} key={`priority-${lever.key}`}>
              <div className="development-scenario-card-head">
                <h5>{lever.rank}. {lever.label}</h5>
                <span className={`score ${lever.tone}`}>{lever.scoreLabel}</span>
              </div>
              <dl>
                <div>
                  <dt>Hebelgroesse</dt>
                  <dd>{lever.estimatedValueEur !== null ? formatCurrency(lever.estimatedValueEur) : "Qualitativ"}</dd>
                </div>
                <div>
                  <dt>Wo am Objekt?</dt>
                  <dd>{lever.where}</dd>
                </div>
                <div>
                  <dt>Warum zuerst?</dt>
                  <dd>{lever.reason}</dd>
                </div>
                <div>
                  <dt>Risiko</dt>
                  <dd>{lever.risk}</dd>
                </div>
                <div>
                  <dt>Naechster Beleg</dt>
                  <dd>{lever.nextCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="development-scenario-panel">
        <h4>Entwicklungsfahrplan</h4>
        <div className="development-scenario-grid">
          {developmentPotential.executionPlan.map((step) => (
            <article className={`development-scenario-card ${step.tone}`} key={`${step.phase}-${step.title}`}>
              <div className="development-scenario-card-head">
                <h5>{step.phase}</h5>
                <span className={`score ${step.tone}`}>{step.budget}</span>
              </div>
              <dl>
                <div>
                  <dt>Aufgabe</dt>
                  <dd>{step.title}</dd>
                </div>
                <div>
                  <dt>Beleg</dt>
                  <dd>{step.proof}</dd>
                </div>
                <div>
                  <dt>Stopper</dt>
                  <dd>{step.stopper}</dd>
                </div>
                <div>
                  <dt>Preisregel</dt>
                  <dd>{step.priceRule}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="development-scenario-panel">
        <h4>Entwicklungs-Szenarien</h4>
        <div className="development-scenario-grid">
          {developmentPotential.scenarios.map((scenario) => (
            <article className={`development-scenario-card ${scenario.tone}`} key={scenario.key}>
              <div className="development-scenario-card-head">
                <h5>{scenario.label}</h5>
                <span className={`score ${scenario.tone}`}>{scenario.tone === "risk" ? "Blocker" : "Pruefen"}</span>
              </div>
              <dl>
                <div>
                  <dt>Effekt</dt>
                  <dd>{scenario.effect}</dd>
                </div>
                <div>
                  <dt>Wertlogik</dt>
                  <dd>{scenario.valueImpact}</dd>
                </div>
                <div>
                  <dt>Risiko</dt>
                  <dd>{scenario.risk}</dd>
                </div>
                <div>
                  <dt>Naechster Beleg</dt>
                  <dd>{scenario.nextCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="development-potential-detail">
        <DecisionList title="Hebel" items={developmentPotential.levers} />
        <DecisionList
          title="Bremsen"
          items={
            developmentPotential.blockers.length
              ? developmentPotential.blockers
              : ["Keine harte Entwicklungsbremse im aktuellen Datenstand belegt."]
          }
        />
        <DecisionList title="Naechste Checks" items={developmentPotential.nextActions} />
      </div>
    </section>
  );
}

function inputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function assumptionInputValue(value: number | string | null | undefined, fallback: number | null): string {
  if (value === null || value === undefined || value === "") {
    return inputValue(fallback);
  }
  return String(value);
}

function parseDevelopmentInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function developmentSavedNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function developmentSavedCurrency(value: number | string | null | undefined): string {
  return formatCurrency(developmentSavedNumber(value));
}

function developmentSavedPercent(value: number | string | null | undefined): string {
  return formatPercent(developmentSavedNumber(value));
}

function backendCaseTone(plan: RenovationPlan | null): "good" | "watch" | "risk" {
  if (plan?.recommendation === "strong_value_add") {
    return "good";
  }
  if (plan?.recommendation === "possible_value_add") {
    return "watch";
  }
  return "risk";
}

function backendCaseRecommendation(recommendation: RenovationPlan["recommendation"] | undefined): string {
  if (recommendation === "strong_value_add") {
    return "Starker Backend-Case: Werthebel, ROI und Refi-Logik passen im Modell.";
  }
  if (recommendation === "possible_value_add") {
    return "Moeglicher Backend-Case: Annahmen mit Bank, Mietrecht und Handwerkerangeboten absichern.";
  }
  if (recommendation === "weak_value_add") {
    return "Schwacher Backend-Case: Sanierung bindet im Modell zu viel Kapital.";
  }
  return "Backend-Case noch nicht gerechnet.";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
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

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy textarea copy path below.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw new Error("Clipboard API unavailable");
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command failed");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
