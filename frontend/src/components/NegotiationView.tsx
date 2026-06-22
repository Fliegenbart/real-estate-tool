"use client";

import { Copy, Handshake, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getDeal, getNegotiationDossier, updateSellerMotive } from "../lib/api";
import { dealLoiConditionsBrief, formatCurrency } from "../lib/dealMetrics";
import { Deal, NegotiationDossier } from "../lib/types";

const MOTIVES = [
  { value: "unknown", label: "Unbekannt" },
  { value: "inheritance", label: "Erbe" },
  { value: "divorce", label: "Trennung" },
  { value: "financing_pressure", label: "Finanzierungsdruck" },
  { value: "tired_landlord", label: "Vermieter-Muedigkeit" },
  { value: "relocation", label: "Wegzug" }
];

type NegotiationLoadState = "loading" | "ready" | "error";

export function NegotiationView({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dossier, setDossier] = useState<NegotiationDossier | null>(null);
  const [loadState, setLoadState] = useState<NegotiationLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loiCopyState, setLoiCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const load = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    setDeal(null);
    setDossier(null);
    setLoiCopyState("idle");
    try {
      const [dealData, dossierData] = await Promise.all([getDeal(dealId), getNegotiationDossier(dealId)]);
      setDeal(dealData);
      setDossier(dossierData);
      setLoadState("ready");
    } catch (loadError) {
      setError(readableNegotiationError(loadError));
      setLoadState("error");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeMotive(motive: string) {
    await updateSellerMotive(Number(dealId), motive);
    await load();
  }

  if (loadState === "loading" || loadState === "error" || !dossier || !deal) {
    const isError = loadState === "error";
    return (
      <div className="page">
        <section className={`pipeline-load-state ${isError ? "error" : "loading"}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isError ? "API-Fehler" : "Datenabruf"}</span>
            <h3>{isError ? "Verhandlungsdossier konnte nicht geladen werden" : "Verhandlungsdossier wird geladen"}</h3>
            <p>
              {isError
                ? error
                : "Preisleiter, LOI-Bedingungen und Verhandlungsargumente werden geladen. Noch keine Preis- oder LOI-Entscheidung ableiten."}
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

  const ladder = dossier.price_ladder;
  const loiConditions = dealLoiConditionsBrief(deal);

  const copyLoiText = async () => {
    try {
      await copyTextToClipboard(loiConditions.copyText);
      setLoiCopyState("copied");
    } catch {
      setLoiCopyState("failed");
    }
  };

  return (
    <div className="page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${dealId}`} className="text-link">Deal</Link>
          <h2>Verhandlungsdossier - {deal.title}</h2>
          <p>{deal.listing?.city} · Angebotspreis {formatCurrency(ladder.asking_price)}</p>
        </div>
        <div className="button-row">
          <label className="motive-select">
            Verkaeufermotiv
            <select value={deal.seller_motive || "unknown"} onChange={(event) => changeMotive(event.target.value)}>
              {MOTIVES.map((motive) => <option key={motive.value} value={motive.value}>{motive.label}</option>)}
            </select>
          </label>
          <button className="button" onClick={() => window.print()}>
            <Printer size={16} />
            Drucken
          </button>
        </div>
      </section>

      <section className="ladder-strip">
        <div className="ladder-step">
          <span>Anker (Eroeffnung)</span>
          <strong>{formatCurrency(ladder.anchor_price)}</strong>
        </div>
        <div className="ladder-step">
          <span>Zielpreis</span>
          <strong>{formatCurrency(ladder.target_price)}</strong>
        </div>
        <div className="ladder-step risk">
          <span>Walk-away</span>
          <strong>{formatCurrency(ladder.walk_away_price)}</strong>
        </div>
        <div className="ladder-step muted">
          <span>Angebotspreis</span>
          <strong>{formatCurrency(ladder.asking_price)}</strong>
        </div>
      </section>

      <section className={`strategy-brief-band loi-dossier-band ${loiConditions.tone}`} aria-label="LOI-Angebotspaket">
        <div className="strategy-brief-topline">
          <div className="deal-decision-copy">
            <span className="section-kicker">LOI-Angebotspaket</span>
            <h3>{loiConditions.headline}</h3>
            <p>{loiConditions.loiMode}</p>
          </div>
          <button className="button" type="button" onClick={() => void copyLoiText()}>
            <Copy size={16} />
            {loiCopyState === "copied" ? "LOI-Text kopiert" : "LOI-Text kopieren"}
          </button>
        </div>

        <div className="decision-fact-grid">
          {loiConditions.facts.map((fact) => (
            <div className={`decision-fact ${fact.tone}`} key={`dossier-loi-fact-${fact.label}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="document-copy-summary" aria-label="Kopierbarer LOI-Text">
          <div>
            <span>Status</span>
            <strong>{loiConditions.facts[0]?.value || "Fehlt"}</strong>
          </div>
          <div>
            <span>Preis-/Debt-Hebel</span>
            <strong>{loiConditions.facts[1]?.value || "Fehlt"}</strong>
          </div>
          <div>
            <span>Cashflow-Luecke</span>
            <strong>{loiConditions.facts[2]?.value || "Fehlt"}</strong>
          </div>
          <div>
            <span>Bedingungen</span>
            <strong>{loiConditions.conditions.length} Pflichtpunkte</strong>
          </div>
          {loiCopyState === "failed" && <p className="tax-warning">LOI-Kopieren nicht moeglich. Text bitte manuell markieren.</p>}
        </div>
        <pre className="document-copy-preview">{loiConditions.copyText}</pre>

        <div className="strategy-brief-detail">
          <DecisionList
            title="Pflichtbedingungen"
            items={loiConditions.conditions.map((condition) => `${condition.label}: ${condition.clause}`)}
          />
          <DecisionList title="Kill-Klauseln" items={loiConditions.killClauses} />
          <DecisionList title="Naechste Schritte" items={loiConditions.nextActions} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Bezifferte Argumente ({formatCurrency(dossier.total_justified_discount_eur)} belegbar)</h2>
          <Handshake size={17} />
        </div>
        {dossier.arguments.length === 0 && <p>Keine quantifizierbaren Maengel gefunden - Underwriting und WEG-Daten ergaenzen.</p>}
        <div className="argument-list">
          {dossier.arguments.map((arg) => (
            <div className={`argument strength-${arg.strength}`} key={arg.code}>
              <div className="argument-head">
                <strong>{arg.title}</strong>
                <span className="tag">{arg.estimated_discount_eur ? formatCurrency(arg.estimated_discount_eur) : "Hebel"}</span>
              </div>
              <p className="argument-evidence">{arg.evidence}</p>
              <p className="argument-script">&ldquo;{arg.script_line}&rdquo;</p>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header"><h2>Gespraechsleitfaden</h2></div>
          <ul className="plain-list">
            {dossier.opening_script.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="recommendation">{dossier.seller_angle}</p>
        </div>
        <div className="panel">
          <div className="panel-header"><h2>Markt-Hebel & Preisleiter</h2></div>
          <ul className="plain-list">
            {dossier.leverage.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <ul className="plain-list">
            {ladder.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </section>

      <p className="tax-warning">{dossier.disclaimer}</p>
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

function readableNegotiationError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Dossier braucht ein Listing mit Kaufpreis und idealerweise ein Underwriting.";
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
