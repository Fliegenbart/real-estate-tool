"use client";

import { ArrowUpRight, CheckCircle, Eraser, FileSearch, Mail, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clearDemoData, convertListing, getListings, importDemoListings, importEmailListings, updateListingStatus } from "../lib/api";
import { filterListings, formatCurrency, formatNumber, formatPercent, grossYield, hasMissingCoreData } from "../lib/dealMetrics";
import { Listing, ListingFilters } from "../lib/types";
import { AddListingPanel } from "./AddListingPanel";

export function ListingsView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>({ city: "", rented: "all", missingData: false });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  async function load() {
    setListings(await getListings());
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => filterListings(listings, filters), [listings, filters]);

  async function seedDemo() {
    await importDemoListings();
    await load();
  }

  async function importFromEmail() {
    setImportStatus(null);
    try {
      const result = await importEmailListings(emailContent);
      setImportStatus(`${result.imported} neu, ${result.updated} aktualisiert.`);
      setEmailContent("");
      await load();
    } catch {
      setImportStatus("Kein Listing mit Preis in der Mail gefunden.");
    }
  }

  function marketSignal(listing: Listing): string {
    const parts: string[] = [];
    if (listing.days_on_market !== null && listing.days_on_market !== undefined) {
      parts.push(`${listing.days_on_market} T.`);
    }
    if (listing.price_reduction_count) {
      parts.push(`-${listing.price_reduction_total_percent ?? "?"}% (${listing.price_reduction_count}x)`);
    }
    return parts.join(" · ") || "-";
  }

  async function convert(id: number) {
    setBusyId(id);
    const deal = await convertListing(id);
    await load();
    window.location.href = `/deals/${deal.id}`;
  }

  async function reject(id: number) {
    setBusyId(id);
    await updateListingStatus(id, "rejected");
    await load();
    setBusyId(null);
  }

  return (
    <div className="page">
      <section className="action-row">
        <div>
          <h2>Listings</h2>
          <p>{filtered.length} von {listings.length} Treffern</p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => setShowEmailImport(!showEmailImport)}>
            <Mail size={16} />
            E-Mail-Import
          </button>
          {listings.some((listing) => listing.source === "demo_seed") ? (
            <button
              className="button"
              onClick={async () => {
                await clearDemoData();
                await load();
              }}
            >
              <Eraser size={16} />
              Demo entfernen
            </button>
          ) : (
            <button className="button" onClick={seedDemo}>
              <RefreshCw size={16} />
              Demo laden
            </button>
          )}
        </div>
      </section>

      <AddListingPanel onCreated={load} />

      {showEmailImport && (
        <section className="panel">
          <div className="panel-header">
            <h2>Suchagenten-Mail einfuegen</h2>
            {importStatus && <span className="tag">{importStatus}</span>}
          </div>
          <textarea
            className="email-import-area"
            rows={8}
            placeholder="Inhalt der ImmoScout/Immowelt-Suchagenten-Mail hier einfuegen (Text oder HTML)..."
            value={emailContent}
            onChange={(event) => setEmailContent(event.target.value)}
          />
          <button className="button primary" onClick={importFromEmail} disabled={!emailContent.trim()}>
            <Mail size={16} />
            Listings importieren
          </button>
        </section>
      )}

      <section className="filters">
        <label>
          Stadt
          <input value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} />
        </label>
        <label>
          Vermietung
          <select value={filters.rented} onChange={(event) => setFilters({ ...filters, rented: event.target.value as ListingFilters["rented"] })}>
            <option value="all">Alle</option>
            <option value="rented">Vermietet</option>
            <option value="vacant">Frei</option>
          </select>
        </label>
        <label>
          Energie
          <select value={filters.energyClass || ""} onChange={(event) => setFilters({ ...filters, energyClass: event.target.value || undefined })}>
            <option value="">Alle</option>
            {["A", "B", "C", "D", "E", "F", "G", "H"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={filters.missingData} onChange={(event) => setFilters({ ...filters, missingData: event.target.checked })} />
          Fehlende Daten
        </label>
      </section>

      <section className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Stadt</th>
                <th>Preis</th>
                <th>Flaeche</th>
                <th>Brutto</th>
                <th>Markt</th>
                <th>Energie</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <div className="cell-title">
                      <strong>{listing.title}</strong>
                      <span>{listing.source || "manual"} {hasMissingCoreData(listing) ? "· Datenluecke" : ""}</span>
                      {(listing.signals || []).length > 0 && (
                        <span className="signal-row">
                          {(listing.signals || []).slice(0, 3).map((signal) => (
                            <span className={`signal-chip ${signal.severity}`} key={signal.type} title={signal.explanation}>
                              {signal.type.replaceAll("_", " ").toLowerCase()}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{listing.city || "Fehlt"}</td>
                  <td>{formatCurrency(listing.purchase_price)}</td>
                  <td>{formatNumber(listing.living_area_sqm, " m2")}</td>
                  <td>{formatPercent(grossYield(listing))}</td>
                  <td>{marketSignal(listing)}</td>
                  <td><span className="tag">{listing.energy_class || "Fehlt"}</span></td>
                  <td>{listing.status || "active"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" title="In Deal wandeln" onClick={() => convert(listing.id)} disabled={busyId === listing.id}>
                        <ArrowUpRight size={16} />
                      </button>
                      <button className="icon-button" title="Ablehnen" onClick={() => reject(listing.id)} disabled={busyId === listing.id}>
                        <XCircle size={16} />
                      </button>
                      {listing.listing_url ? (
                        <a className="icon-button" title="Quelle" href={listing.listing_url} target="_blank">
                          <FileSearch size={16} />
                        </a>
                      ) : (
                        <span className="icon-button muted"><CheckCircle size={16} /></span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9}>Keine Listings.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
