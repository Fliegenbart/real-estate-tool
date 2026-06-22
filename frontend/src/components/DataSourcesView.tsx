"use client";

import { AlertTriangle, CheckCircle, ClipboardList, Database, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { getDataSources, seedDefaultDataSources, updateDataSource } from "../lib/api";
import { dataSourcesHealthBrief } from "../lib/dealMetrics";
import { DataSource } from "../lib/types";

export function DataSourcesView() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      setSources(await getDataSources());
      setLoadState("ready");
    } catch {
      setSources([]);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    setBusy(true);
    try {
      await seedDefaultDataSources();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markImported(source: DataSource) {
    await updateDataSource(source.id, { last_import_at: new Date().toISOString() });
    await load();
  }

  const health = dataSourcesHealthBrief(sources);
  const HealthIcon = health.tone === "good" ? CheckCircle : health.tone === "risk" ? AlertTriangle : ClipboardList;
  const isLoading = loadState === "loading";
  const hasLoadError = loadState === "error";

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Datenquellen-Register</h2>
          <p>Jede Zahl im Tool soll auf eine Quelle mit Datum, Lizenz und Verlaesslichkeit zurueckfuehrbar sein.</p>
        </div>
        <button className="button primary" onClick={seed} disabled={busy || isLoading}>
          <Database size={16} />
          Standard-Quellen anlegen
        </button>
      </section>

      {isLoading ? (
        <section className="source-health-board empty" aria-label="Quellen-Gesundheit" aria-busy="true">
          <div className="source-health-head">
            <div>
              <span className="section-kicker">Quellen-Gesundheit</span>
              <h3>Quellen werden geladen</h3>
              <p>Quellenregister, Importdatum, Lizenz und Datenstand werden vom Backend geladen.</p>
            </div>
            <div className="source-health-status empty">
              <RefreshCw size={18} />
              Laden
            </div>
          </div>

          <div className="source-health-facts">
            {["Quellen", "Kritisch", "Lizenz offen", "Ø Verlaesslichkeit"].map((label) => (
              <div className="source-health-fact empty" key={label}>
                <span>{label}</span>
                <strong>...</strong>
              </div>
            ))}
          </div>

          <div className="source-work-orders">
            <div className="source-work-orders-head">
              <ClipboardList size={17} />
              <h4>Quellen-Arbeitsauftraege</h4>
            </div>
            <p className="source-work-order-empty">Arbeitsauftraege erscheinen, sobald die Quellen geladen sind.</p>
          </div>
        </section>
      ) : hasLoadError ? (
        <section className="source-health-board risk" aria-label="Quellen-Gesundheit">
          <div className="source-health-head">
            <div>
              <span className="section-kicker">Quellen-Gesundheit</span>
              <h3>Quellen konnten nicht geladen werden</h3>
              <p>Backend oder Proxy pruefen, dann das Quellenregister erneut laden.</p>
            </div>
            <button className="button secondary" onClick={load} disabled={busy}>
              <RefreshCw size={16} />
              Neu laden
            </button>
          </div>
        </section>
      ) : (
      <section className={`source-health-board ${health.tone}`} aria-label="Quellen-Gesundheit">
        <div className="source-health-head">
          <div>
            <span className="section-kicker">Quellen-Gesundheit</span>
            <h3>{health.headline}</h3>
            <p>{health.summary}</p>
          </div>
          <div className={`source-health-status ${health.tone}`}>
            <HealthIcon size={18} />
            {health.workOrders.length ? `${health.workOrders.length} Auftraege` : "Stabil"}
          </div>
        </div>

        <div className="source-health-facts">
          {health.facts.map((fact) => (
            <div className={`source-health-fact ${fact.tone}`} key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>

        <div className="source-work-orders">
          <div className="source-work-orders-head">
            <ClipboardList size={17} />
            <h4>Quellen-Arbeitsauftraege</h4>
          </div>
          {health.workOrders.length ? (
            <div className="source-work-order-list">
              {health.workOrders.map((order) => (
                <article className={`source-work-order ${order.tone}`} key={`${order.sourceName}-${order.label}`}>
                  <div className="source-work-order-meta">
                    <span>{order.owner}</span>
                    <strong>{order.label}</strong>
                  </div>
                  <div className="source-work-order-main">
                    <h5>{order.sourceName}</h5>
                    <p>{order.detail}</p>
                    <small>{order.action}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="source-work-order-empty">Keine akuten Quellen-Aufgaben. Datenstand und Lizenz weiter im Blick behalten.</p>
          )}
        </div>
      </section>
      )}

      <section className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quelle</th>
                <th>Typ</th>
                <th>Lizenz</th>
                <th>Abdeckung</th>
                <th>Datenstand</th>
                <th>Letzter Import</th>
                <th>Verlaesslichkeit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <div className="cell-title">
                      <strong>{source.name}</strong>
                      <span>{source.provider || ""} {source.attribution_required ? "· Attribution noetig" : ""}</span>
                    </div>
                  </td>
                  <td><span className="tag">{source.data_type}</span></td>
                  <td>{source.license_type || "?"}</td>
                  <td>{source.geographic_coverage || "?"}</td>
                  <td>{source.source_data_date || "?"}</td>
                  <td>{source.last_import_at ? source.last_import_at.slice(0, 10) : "nie"}</td>
                  <td>
                    <div className="pipeline-bar">
                      <span></span>
                      <div className="bar-track"><div style={{ width: `${source.reliability_score}%` }} /></div>
                      <strong>{source.reliability_score}</strong>
                    </div>
                  </td>
                  <td>
                    <button className="icon-button" title="Als heute importiert markieren" onClick={() => markImported(source)}>
                      <RefreshCw size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr><td colSpan={8}>Quellen werden geladen.</td></tr>
              )}
              {hasLoadError && (
                <tr><td colSpan={8}>Quellenliste nicht verfuegbar. Fehlerhinweis oben pruefen.</td></tr>
              )}
              {!isLoading && !hasLoadError && sources.length === 0 && (
                <tr><td colSpan={8}>Keine Quellen registriert - mit Standard-Quellen starten.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="tax-warning">
        Lizenzhinweise sind Arbeitsnotizen, keine Rechtsberatung. Vor kommerzieller Weiterverwendung von
        Geodaten die jeweilige Landeslizenz pruefen.
      </p>
    </div>
  );
}
