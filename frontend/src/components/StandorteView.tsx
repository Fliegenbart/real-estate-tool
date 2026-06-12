"use client";

import { Compass, Database, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRegion, getRegions, refreshOwnRegionMetrics, seedRegionDefaults } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent, scoreTone } from "../lib/dealMetrics";
import { RegionPayload } from "../lib/types";

export function StandorteView() {
  const [regions, setRegions] = useState<RegionPayload[]>([]);
  const [selected, setSelected] = useState<RegionPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [maxFactor, setMaxFactor] = useState<string>("");
  const [maxVacancy, setMaxVacancy] = useState<string>("");
  const [minScore, setMinScore] = useState<string>("");
  const [hideStructural, setHideStructural] = useState(false);

  const load = useCallback(async () => {
    try {
      setRegions(await getRegions());
    } catch {
      setRegions([]);
      setStatus("Backend nicht erreichbar (Port 8000).");
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
                <th>Score</th>
                <th>Faktor</th>
                <th>Bruttorendite</th>
                <th>Leerstand</th>
                <th>Prognose 2040</th>
                <th>ALQ</th>
                <th>Preis/m2</th>
                <th>Eigene Listings</th>
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
                  <td>{formatPercent(region.metrics["unemployment_rate_percent"])}</td>
                  <td>{formatCurrency(region.metrics["own_median_price_eur_sqm"] ?? region.metrics["price_eur_sqm"])}</td>
                  <td>{region.metrics["own_listing_count"] ?? "-"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9}>Keine Regionen - mit &quot;Startdaten laden&quot; beginnen.</td></tr>
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
            {Object.entries(selected.score.category_scores).map(([label, value]) => (
              <div className="pipeline-bar" key={label}>
                <span>{label.replaceAll("_", " ")}</span>
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
