"use client";

import { Database, Info, RefreshCw } from "lucide-react";
import React from "react";
import type { FocusEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRegion, getRegions, refreshOwnRegionMetrics, seedRegionDefaults } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent, scoreTone } from "../lib/dealMetrics";
import { RegionPayload } from "../lib/types";

const COLUMN_HELP: Record<string, string> = {
  score:
    "Gesamtscore 0-100 fuer deine Strategie: 20 Jahre halten, dann vvGmbH mit Portfolio verkaufen. Gewichtung: Ertragskraft 32%, Nachfragestabilitaet 27%, Wirtschaftsbasis 18%, Exit-Liquiditaet 13%, Klima/Bewohnbarkeit 10%. Harte Risiken deckeln den Score zusaetzlich.",
  faktor:
    "Vervielfaeltiger: Kaufpreis geteilt durch Jahreskaltmiete. Faktor 16 = du zahlst 16 Jahresmieten fuer den Kauf. Je niedriger, desto mehr Cashflow. Achtung: gerechnet auf den Stadt-Median - dein Deal-Segment (Verhandlung, einfache Lagen) liegt meist darunter.",
  rendite:
    "Bruttomietrendite: Jahreskaltmiete geteilt durch Kaufpreis (Kehrwert des Faktors). Unter 3,5% gilt die Stadt als reiner Wertsteigerungsmarkt - fuer die Cashflow-Strategie gedeckelt.",
  leerstand:
    "Anteil leerstehender Wohnungen (Orientierung: Zensus 2022). DAS Kernrisiko bei guenstigen Lagen: Leerstand kostet dich nicht nur Miete, sondern verlaengert auch jede Neuvermietung. Ueber 8% plus Schrumpfungsprognose = strukturelles Risiko, ueber 10% harte Red Flag.",
  prognose:
    "Erwartete Bevoelkerungsentwicklung bis 2040 in Prozent - endet genau an deinem geplanten Exit-Horizont. Schrumpfung heisst: weniger Mieter UND weniger Kaeufer fuer dein Portfolio. Unter -8% Red Flag.",
  klima:
    "Klima/Bewohnbarkeit in den naechsten 5-15 Jahren: Hitze, Wasserstress, Starkregen/Hochwasser und Stadtklima als Screening-Wert 0-100. Das ist eine Vorpruefung; vor Kauf mit DWD/GERICS und kommunalen Hitze-/Starkregenkarten verifizieren.",
  alq: "Arbeitslosenquote. Proxy fuer Mieterbonitaet, Mietausfallrisiko und Fluktuation - wichtiger als die Miethoehe selbst, wenn du auf puenktliche Zahler angewiesen bist.",
  preis:
    "Median-Angebotspreis je m2 Wohnflaeche. Startwert ist eine grobe Schaetzung; sobald mindestens 3 eigene Listings aus deinem Suchagenten-Zufluss vorliegen, ersetzt deren Median automatisch den Schaetzwert.",
  eigene:
    "Anzahl Listings aus deinem E-Mail-Zufluss in dieser Stadt. Ab 3 Stueck rechnet das Tool mit DEINEN Marktdaten (Median-Preis, -Miete) statt mit Schaetzungen - je laenger die Suchagenten laufen, desto besser wird der Score.",
};

const CATEGORY_INFO: Record<string, { label: string; help: string }> = {
  yield_power: {
    label: "Ertragskraft",
    help: "Wie viel Miete bekommst du fuer den Kaufpreis? Skala: 3% Bruttorendite = 15 Punkte, 7% = 95 Punkte. Traegt 32% des Gesamtscores - der Motor der Cashflow-Strategie.",
  },
  demand_stability: {
    label: "Nachfragestabilitaet",
    help: "Leerstand heute + Bevoelkerungsprognose 2040, je zur Haelfte. Die Versicherung deines Cashflows: Hoher Leerstand in einer schrumpfenden Stadt ist strukturell (nicht zyklisch) und deckelt diese Kategorie auf 25. Traegt 27%.",
  },
  economic_base: {
    label: "Wirtschaftsbasis",
    help: "Arbeitslosenquote und Kaufkraft: Traegt die lokale Wirtschaft die Mieten dauerhaft? Eine Uni, Klinik oder ein Grossarbeitgeber stabilisiert kleine Staedte ueberproportional. Traegt 18%.",
  },
  exit_liquidity: {
    label: "Exit-Liquiditaet",
    help: "Marktgroesse (Einwohner, logarithmisch) plus Aktivitaet des Angebotsmarkts. Zaehlt, weil die vvGmbH in ~20 Jahren MIT Portfolio verkauft werden soll: In einem 40.000-Einwohner-Markt findest du dann schwer einen Kaeufer. Traegt 13%.",
  },
  climate_resilience: {
    label: "Klima/Bewohnbarkeit",
    help: "Screening fuer 5-15 Jahre: Bleibt die Region trotz Hitze, Wasserstress, Starkregen und Hochwasser gut bewohnbar? Traegt 10%. Vor Kauf mit offiziellen Klimakarten verifizieren.",
  },
};

type StandorteLoadState = "loading" | "ready" | "error";

function readableStandorteError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Standortdaten konnten nicht geladen werden";
}

function InfoTip({ text }: { text: string }) {
  const [position, setPosition] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);

  function show(event: FocusEvent<HTMLSpanElement> | MouseEvent<HTMLSpanElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
    const placement = rect.top > 170 ? "top" : "bottom";
    const top = placement === "top" ? rect.top - 8 : rect.bottom + 8;
    setPosition({ top, left, placement });
  }

  return (
    <span
      className="info-tip"
      tabIndex={0}
      onFocus={show}
      onMouseEnter={show}
      onBlur={() => setPosition(null)}
      onMouseLeave={() => setPosition(null)}
    >
      <Info size={13} />
      {position && (
        <span className="info-tip-bubble" data-placement={position.placement} style={{ top: position.top, left: position.left }}>
          {text}
        </span>
      )}
    </span>
  );
}

export function StandorteView() {
  const [regions, setRegions] = useState<RegionPayload[]>([]);
  const [selected, setSelected] = useState<RegionPayload | null>(null);
  const [loadState, setLoadState] = useState<StandorteLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [maxFactor, setMaxFactor] = useState<string>("");
  const [maxVacancy, setMaxVacancy] = useState<string>("");
  const [minScore, setMinScore] = useState<string>("");
  const [hideStructural, setHideStructural] = useState(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const nextRegions = await getRegions();
      setRegions(nextRegions);
      setLoadState("ready");
    } catch (error) {
      setRegions([]);
      setSelected(null);
      setLoadError(readableStandorteError(error));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    setBusy(true);
    try {
      const result = await seedRegionDefaults();
      setStatus(`${result.regions} Staedte mit Startschaetzungen geladen.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function refreshOwn() {
    setBusy(true);
    try {
      const result = await refreshOwnRegionMetrics();
      setStatus(`Eigene Marktdaten fuer ${result.cities_updated} Staedte aktualisiert.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function select(region: RegionPayload) {
    setSelected(await getRegion(region.id));
  }

  const filtered = useMemo(() => {
    return regions.filter((region) => {
      const score = region.score;
      if (minScore && score.total_score < Number(minScore)) return false;
      if (maxFactor && (score.rent_factor === null || score.rent_factor > Number(maxFactor))) return false;
      if (maxVacancy) {
        const vacancy = region.metrics["vacancy_rate_percent"];
        if (vacancy === undefined || vacancy > Number(maxVacancy)) return false;
      }
      if (hideStructural && score.red_flags.includes("structural_decline_risk")) return false;
      return true;
    });
  }, [regions, minScore, maxFactor, maxVacancy, hideStructural]);

  if (loadState === "loading" || loadState === "error") {
    const isError = loadState === "error";
    return (
      <div className="page">
        <section className={`pipeline-load-state ${isError ? "error" : "loading"}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isError ? "API-Fehler" : "Datenabruf"}</span>
            <h3>{isError ? "Standorte konnten nicht geladen werden" : "Standorte werden geladen"}</h3>
            <p>
              {isError
                ? `${loadError}. Keine Standort-, Score- oder Portfolioentscheidung ableiten.`
                : "Regionen, Scores und eigene Marktdaten werden geladen. Noch keine Standort- oder Portfolioentscheidung ableiten."}
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
          <h2>Standort-Screener</h2>
          <p>
            {filtered.length} von {regions.length} Regionen · Gewichtung fuer 20 Jahre Halten + Portfolio-Exit
            {status ? ` · ${status}` : ""}
          </p>
        </div>
        <div className="button-row">
          <button className="button" onClick={refreshOwn} disabled={busy}>
            <RefreshCw size={16} />
            Eigene Marktdaten
          </button>
          <button className="button primary" onClick={seed} disabled={busy}>
            <Database size={16} />
            Startdaten laden
          </button>
        </div>
      </section>

      <section className="filters">
        <label>
          Min. Score
          <input inputMode="numeric" value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="z.B. 50" />
        </label>
        <label>
          Max. Faktor
          <input inputMode="decimal" value={maxFactor} onChange={(event) => setMaxFactor(event.target.value)} placeholder="z.B. 20" />
        </label>
        <label>
          Max. Leerstand %
          <input inputMode="decimal" value={maxVacancy} onChange={(event) => setMaxVacancy(event.target.value)} placeholder="z.B. 8" />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={hideStructural} onChange={(event) => setHideStructural(event.target.checked)} />
          Strukturelles Schrumpfen ausblenden
        </label>
      </section>

      <section className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stadt</th>
                <th>Score <InfoTip text={COLUMN_HELP.score} /></th>
                <th>Faktor <InfoTip text={COLUMN_HELP.faktor} /></th>
                <th>Bruttorendite <InfoTip text={COLUMN_HELP.rendite} /></th>
                <th>Leerstand <InfoTip text={COLUMN_HELP.leerstand} /></th>
                <th>Prognose 2040 <InfoTip text={COLUMN_HELP.prognose} /></th>
                <th>Klima 5-15J <InfoTip text={COLUMN_HELP.klima} /></th>
                <th>ALQ <InfoTip text={COLUMN_HELP.alq} /></th>
                <th>Preis/m2 <InfoTip text={COLUMN_HELP.preis} /></th>
                <th>Eigene Listings <InfoTip text={COLUMN_HELP.eigene} /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((region) => (
                <tr key={region.id} onClick={() => void select(region)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="cell-title">
                      <strong>{region.name}</strong>
                      <span>{region.federal_state} · {formatNumber(region.population)} EW</span>
                    </div>
                  </td>
                  <td><span className={`score ${scoreTone(region.score.total_score)}`}>{region.score.total_score}</span></td>
                  <td>{formatNumber(region.score.rent_factor)}</td>
                  <td>{formatPercent(region.score.gross_yield_percent)}</td>
                  <td>{formatPercent(region.metrics["vacancy_rate_percent"])}</td>
                  <td>{formatPercent(region.metrics["population_forecast_2040_percent"])}</td>
                  <td>{formatNumber(region.metrics["climate_resilience_score"] ?? region.score.category_scores.climate_resilience)}</td>
                  <td>{formatPercent(region.metrics["unemployment_rate_percent"])}</td>
                  <td>{formatCurrency(region.metrics["own_median_price_eur_sqm"] ?? region.metrics["price_eur_sqm"])}</td>
                  <td>{region.metrics["own_listing_count"] ?? "-"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10}>Keine Regionen - mit &quot;Startdaten laden&quot; beginnen.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="panel">
          <div className="panel-header">
            <h2>{selected.name} ({selected.federal_state})</h2>
            <span className={`score ${scoreTone(selected.score.total_score)}`}>{selected.score.total_score}</span>
          </div>
          <p className="recommendation">{selected.score.recommendation}</p>
          <div className="score-bars">
            {Object.entries(selected.score.category_scores).map(([key, value]) => (
              <div className="pipeline-bar" key={key}>
                <span>
                  {CATEGORY_INFO[key]?.label || key.replaceAll("_", " ")}{" "}
                  {CATEGORY_INFO[key] && <InfoTip text={CATEGORY_INFO[key].help} />}
                </span>
                <div className="bar-track"><div style={{ width: `${value}%` }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="risk-grid">
            <div>
              <h3>Dafuer</h3>
              <ul className="plain-list">
                {(selected.score.positive_factors.length ? selected.score.positive_factors : ["-"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3>Dagegen / Red Flags</h3>
              <ul className="plain-list">
                {(selected.score.negative_factors.length ? selected.score.negative_factors : ["-"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
          <p className="tax-warning">
            Datenlage {selected.score.data_completeness_percent}%. {selected.score.explanation} Startwerte sind grobe
            Schaetzungen - vor Suchagent-Entscheidung INKAR/Zensus-Daten importieren (siehe Datenquellen).
          </p>
        </section>
      )}
    </div>
  );
}
