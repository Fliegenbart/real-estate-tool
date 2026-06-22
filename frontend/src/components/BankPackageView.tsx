"use client";

import { ArrowLeft, Copy, FileText, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getBankPackage, getDeal } from "../lib/api";
import { bankPackageCreditBrief, developmentCaseHandoffBrief, formatCurrency, formatNumber, formatPercent } from "../lib/dealMetrics";
import { BankPackage, Deal } from "../lib/types";
import { DevelopmentCaseHandoffPanel } from "./DevelopmentCaseHandoffPanel";

type BankPackageLoadState = "loading" | "ready" | "error";

export function BankPackageView({ dealId }: { dealId: string }) {
  const [bankPackage, setBankPackage] = useState<BankPackage | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadState, setLoadState] = useState<BankPackageLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bankRequestCopyState, setBankRequestCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setBankPackage(null);
    setDeal(null);
    setBankRequestCopyState("idle");
    try {
      const [nextBankPackage, nextDeal] = await Promise.all([getBankPackage(dealId), getDeal(dealId)]);
      setBankPackage(nextBankPackage);
      setDeal(nextDeal);
      setLoadState("ready");
    } catch (error) {
      setLoadError(readableBankPackageError(error));
      setLoadState("error");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === "loading" || loadState === "error" || !bankPackage || !deal) {
    const isError = loadState === "error";
    return (
      <div className="page bank-package-page">
        <section className={`pipeline-load-state ${isError ? "error" : "loading"}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isError ? "API-Fehler" : "Datenabruf"}</span>
            <h3>{isError ? "Bankenpaket konnte nicht geladen werden" : "Bankenpaket wird geladen"}</h3>
            <p>
              {isError
                ? loadError
                : "Finanzierung, Unterlagen und Entwicklungspotential werden geladen. Noch keine Bank- oder Preisentscheidung ableiten."}
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

  const creditBrief = bankPackageCreditBrief(bankPackage);
  const developmentCredit = bankPackage.development_credit;
  const developmentCaseHandoff = developmentCaseHandoffBrief(deal);
  const developmentTone = developmentCredit
    ? bankDevelopmentCreditTone(developmentCredit.status)
    : developmentCaseHandoff?.tone || "empty";
  const copyBankRequest = async () => {
    try {
      await copyTextToClipboard(creditBrief.lenderRequest.copyText);
      setBankRequestCopyState("copied");
    } catch {
      setBankRequestCopyState("failed");
    }
  };

  return (
    <div className="page bank-package-page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${bankPackage.deal_id}`} className="text-link">
            <ArrowLeft size={14} />
            Deal
          </Link>
          <h2>Bankenpaket</h2>
          <p>{bankPackage.title}</p>
        </div>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} />
          Drucken / PDF
        </button>
      </section>

      <section className={`strategy-brief-band bank-credit-band ${creditBrief.tone}`} aria-label="Bank-Cockpit">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Bank-Cockpit</span>
            <h3>{creditBrief.headline}</h3>
            <p>{creditBrief.oneLineDecision}</p>
          </div>
          <div className="decision-fact-grid">
            {creditBrief.facts.map((fact) => (
              <div className={`decision-fact ${fact.tone}`} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="strategy-brief-detail">
          <DecisionList title="Covenant-Check" items={creditBrief.covenantChecks} />
          <DecisionList title="Kreditstory" items={creditBrief.creditStory} />
          <DecisionList title="Bedingungen" items={creditBrief.conditions} />
        </div>
      </section>

      {(developmentCredit || developmentCaseHandoff) && (
        <section
          className={`strategy-brief-band bank-development-credit-band ${developmentTone}`}
          aria-label="Bank-Entwicklungspotential"
        >
          {developmentCredit && (
            <div className="strategy-brief-topline">
              <div className="deal-decision-copy">
                <span className="section-kicker">Bank-Entwicklungspotential</span>
                <h3>Entwicklungspotential: {developmentCredit.label}</h3>
                <p>{developmentCredit.rule}</p>
              </div>
              <div className="decision-fact-grid">
                <Fact label="Preis-Credit" value={formatMoneyValue(developmentCredit.price_credit_eur)} />
                <Fact label="Refi-Freisetzung" value={formatMoneyValue(developmentCredit.equity_release_eur)} />
                <Fact label="Werthebel" value={formatMoneyValue(developmentCredit.value_uplift_eur)} />
                <Fact label="Capex" value={formatMoneyValue(developmentCredit.planned_capex_eur)} />
              </div>
            </div>
          )}

          {developmentCaseHandoff && (
            <DevelopmentCaseHandoffPanel
              brief={developmentCaseHandoff}
              ariaLabel="Bank-Entwicklungsfall-Herkunft"
              kicker="Case-Herkunft"
              ruleTitle="Bank-Regel"
              proofTitle="Bankbelege"
            />
          )}

          {developmentCredit && (
            <div className="strategy-brief-detail">
              <DecisionList title="Naechste Bankbelege" items={developmentCredit.next_documents} />
            </div>
          )}
        </section>
      )}

      <section className={`strategy-brief-band bank-request-band ${creditBrief.tone}`} aria-label="Bankanfrage-Paket">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">Bankanfrage-Paket</span>
            <h3>{creditBrief.lenderRequest.headline}</h3>
            <p>{creditBrief.lenderRequest.copyIntro}</p>
          </div>
          <button className="button" type="button" onClick={() => void copyBankRequest()}>
            <Copy size={16} />
            {bankRequestCopyState === "copied" ? "Bankanfrage kopiert" : "Bankanfrage kopieren"}
          </button>
        </div>

        <div className="document-copy-summary" aria-label="Versandfertige Bankanfrage">
          <div>
            <span>Betreff</span>
            <strong>{creditBrief.lenderRequest.copySubject}</strong>
          </div>
          <div>
            <span>Darlehen</span>
            <strong>{creditBrief.lenderRequest.requestedLoan}</strong>
          </div>
          <div>
            <span>Eigenmittel</span>
            <strong>{creditBrief.lenderRequest.suggestedEquity}</strong>
          </div>
          <div>
            <span>Unterlagen</span>
            <strong>{creditBrief.lenderRequest.missingDocumentsLabel}</strong>
          </div>
          {bankRequestCopyState === "failed" && <p className="tax-warning">Kopieren nicht moeglich. Text unten manuell markieren.</p>}
        </div>
        <pre className="document-copy-preview">{creditBrief.lenderRequest.copyText}</pre>
      </section>

      <section className="memo-document bank-package">
        <div className="bank-package-title">
          <FileText size={22} />
          <div>
            <h2>{bankPackage.title}</h2>
            <p>Finanzierungs- und Diligence-Unterlage</p>
          </div>
        </div>

        <section>
          <h3>Bank summary</h3>
          <div className="fact-grid">
            <Fact label="Kaufpreis" value={formatMoneyValue(bankPackage.bank_summary.purchase_price)} />
            <Fact label="All-in" value={formatMoneyValue(bankPackage.bank_summary.all_in_purchase_price)} />
            <Fact label="Eigenkapital" value={formatMoneyValue(bankPackage.bank_summary.equity_required)} />
            <Fact label="NOI" value={formatMoneyValue(bankPackage.bank_summary.net_operating_income)} />
            <Fact label="Nettorendite" value={formatPercentValue(bankPackage.bank_summary.net_initial_yield_percent)} />
            <Fact label="DSCR" value={formatPlainValue(bankPackage.bank_summary.dscr)} />
            <Fact label="Cashflow" value={formatMoneyValue(bankPackage.bank_summary.monthly_cashflow_before_tax)} />
            <Fact label="Score" value={formatPlainValue(bankPackage.bank_summary.score)} />
          </div>
        </section>

        <section>
          <h3>Finanzierungswunsch</h3>
          <div className="fact-grid">
            <Fact label="Darlehen" value={formatMoneyValue(bankPackage.financing_request.requested_loan_amount)} />
            <Fact label="Eigenmittel" value={formatMoneyValue(bankPackage.financing_request.suggested_equity)} />
            <Fact label="Finanzierte Sanierung" value={formatMoneyValue(bankPackage.financing_request.financed_capex)} />
            <Fact label="Stress-Cashflow" value={formatMoneyValue(bankPackage.financing_request.stressed_monthly_cashflow_before_tax)} />
          </div>
        </section>

        <section className="risk-grid">
          <div>
            <h3>Staerken</h3>
            <ul className="plain-list">
              {(bankPackage.strengths.length ? bankPackage.strengths : ["Noch keine Staerken im Score hinterlegt."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Risiken</h3>
            <ul className="plain-list">
              {(bankPackage.risks.length ? bankPackage.risks : ["Keine Score-Risiken hinterlegt."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h3>Fehlende Bankunterlagen</h3>
          <div className="document-chip-list">
            {bankPackage.missing_documents.map((item) => (
              <span className="tag" key={item}>{item.replaceAll("_", " ")}</span>
            ))}
            {bankPackage.missing_documents.length === 0 && <span className="tag">vollstaendig</span>}
          </div>
        </section>

        {bankPackage.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <ul className="plain-list">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}

        <p className="tax-warning">{bankPackage.disclaimer}</p>
      </section>
    </div>
  );
}

function readableBankPackageError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden des Bankenpakets.";
}

function formatMoneyValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatCurrency(value) : "Fehlt";
}

function formatPercentValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatPercent(value) : "Fehlt";
}

function formatPlainValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatNumber(value) : value ? String(value) : "Fehlt";
}

function bankDevelopmentCreditTone(status: string | undefined): "good" | "watch" | "risk" | "empty" {
  if (status === "bank_review") {
    return "watch";
  }
  if (status === "memo_only") {
    return "risk";
  }
  return "empty";
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
      // Fall through to the textarea copy path below.
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
