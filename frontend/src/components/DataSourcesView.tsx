"use client";

import { Database, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getDataSources, seedDefaultDataSources, updateDataSource } from "../lib/api";
import { DataSource } from "../lib/types";

export function DataSourcesView() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSources(await getDataSources());
    } catch {
      setSources([]);
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

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Datenquellen-Register</h2>
          <p>Jede Zahl im Tool soll auf eine Quelle mit Datum, Lizenz und Verlaesslichkeit zurueckfuehrbar sein.</p>
        </div>
        <button className="button primary" onClick={seed} disabled={busy}>
          <Database size={16} />
          Standard-Quellen anlegen
        </button>
      </section>

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
              {sources.length === 0 && (
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
