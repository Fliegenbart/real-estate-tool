"use client";

import { Handshake, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDeal, getNegotiationDossier, updateSellerMotive } from "../lib/api";
import { formatCurrency } from "../lib/dealMetrics";
import { Deal, NegotiationDossier } from "../lib/types";

const MOTIVES = [
  { value: "unknown", label: "Unbekannt" },
  { value: "inheritance", label: "Erbe" },
  { value: "divorce", label: "Trennung" },
  { value: "financing_pressure", label: "Finanzierungsdruck" },
  { value: "tired_landlord", label: "Vermieter-Muedigkeit" },
  { value: "relocation", label: "Wegzug" }
];

export function NegotiationView({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dossier, setDossier] = useState<NegotiationDossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [dealData, dossierData] = await Promise.all([getDeal(dealId), getNegotiationDossier(dealId)]);
      setDeal(dealData);
      setDossier(dossierData);
    } catch {
      setError("Dossier braucht ein Listing mit Kaufpreis und idealerweise ein Underwriting.");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeMotive(motive: string) {
    await updateSellerMotive(Number(dealId), motive);
    await load();
  }

  if (error) {
    return <div className="page"><div className="panel">{error}</div></div>;
  }
  if (!dossier || !deal) {
    return <div className="page"><div className="panel">Lade Verhandlungsdossier...</div></div>;
  }

  const ladder = dossier.price_ladder;

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
