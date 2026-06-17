"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle,
  CircleDollarSign,
  Eraser,
  FileSearch,
  Mail,
  Search,
  SlidersHorizontal,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clearDemoData, convertListing, getListings, importEmailListings, updateListingStatus } from "../lib/api";
import { filterListings, formatCurrency, formatNumber, formatPercent, grossYield, hasMissingCoreData } from "../lib/dealMetrics";
import { Listing, ListingFilters } from "../lib/types";
import { AddListingPanel } from "./AddListingPanel";

function compactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Fehlt";
  if (value >= 1000000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value / 1000000)} Mio. EUR`;
  if (value >= 1000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value / 1000)}k EUR`;
  return formatCurrency(value);
}

function sourceLabel(source?: string | null): string {
  if (!source) return "Manuell";
  return source
    .replace("_alert", "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function missingCount(listing: Listing): number {
  return [
    listing.purchase_price,
    listing.living_area_sqm,
    listing.house_money_monthly,
    listing.energy_class,
    listing.city
  ].filter((value) => value === null || value === undefined || value === "").length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function ListingsView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>({
    city: "",
    rented: "all",
    missingData: false,
    source: "",
    minPrice: null,
    maxPrice: null
  });
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
  const sources = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.source).filter(Boolean) as string[])).sort(),
    [listings]
  );
  const stats = useMemo(() => {
    const active = listings.filter((listing) => (listing.status || "active") === "active").length;
    const missing = listings.filter(hasMissingCoreData).length;
    const medianPrice = median(listings.map((listing) => listing.purchase_price).filter((value): value is number => Boolean(value)));
    const yields = listings.map(grossYield).filter((value): value is number => value !== null);
    const averageYield = yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : null;
    return { active, missing, medianPrice, averageYield };
  }, [listings]);

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
    <div className="page listings-page">
      <section className="listing-command">
        <div className="listing-command-copy">
          <span className="topbar-label">Deal-Radar</span>
          <h2>Listings</h2>
          <p>
            {filtered.length} von {listings.length} Angeboten im Suchagenten-Zufluss. Erst sauber filtern, dann als Deal weiterbearbeiten.
          </p>
        </div>
        <div className="listing-primary-actions">
          <button className="button" onClick={() => setShowEmailImport(!showEmailImport)}>
            <Mail size={16} />
            E-Mail-Import
          </button>
          {listings.some((listing) => listing.source === "demo_seed") && (
            <button
              className="button"
              onClick={async () => {
                await clearDemoData();
                await load();
              }}
            >
              <Eraser size={16} />
              Alte Demo-Daten entfernen
            </button>
          )}
        </div>
      </section>

      <section className="listing-insight-grid">
        <div className="listing-insight">
          <Building2 size={17} />
          <span>Aktive Angebote</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="listing-insight">
          <Search size={17} />
          <span>Aktueller Trefferraum</span>
          <strong>{filtered.length}</strong>
        </div>
        <div className="listing-insight">
          <CircleDollarSign size={17} />
          <span>Median-Niveau</span>
          <strong>{compactCurrency(stats.medianPrice)}</strong>
        </div>
        <div className={`listing-insight ${stats.missing ? "needs-work" : ""}`}>
          <AlertTriangle size={17} />
          <span>Datenluecken</span>
          <strong>{stats.missing}</strong>
        </div>
      </section>

      <AddListingPanel onCreated={load} />

      {showEmailImport && (
        <section className="panel email-import-panel">
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

      <section className="filters listing-filters">
        <div className="filter-title">
          <SlidersHorizontal size={16} />
          <strong>Arbeitsfilter</strong>
        </div>
        <label className="listing-search-field">
          Stadt oder Lage
          <input
            value={filters.city}
            onChange={(event) => setFilters({ ...filters, city: event.target.value })}
            placeholder="z.B. Leipzig, Kiel, Wandsbek"
          />
        </label>
        <label>
          Quelle
          <select value={filters.source || ""} onChange={(event) => setFilters({ ...filters, source: event.target.value || undefined })}>
            <option value="">Alle Quellen</option>
            {sources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
          </select>
        </label>
        <label>
          Max. Kaufpreis
          <input
            inputMode="numeric"
            value={filters.maxPrice ?? ""}
            onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value ? Number(event.target.value) : null })}
            placeholder="z.B. 150000"
          />
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
        <label className="checkbox-label listing-toggle">
          <input type="checkbox" checked={filters.missingData} onChange={(event) => setFilters({ ...filters, missingData: event.target.checked })} />
          Nur Datenluecken
        </label>
      </section>

      <section className="panel table-panel listing-table-panel">
        <div className="listing-table-head">
          <div>
            <h2>Akquise-Liste</h2>
            <p>{stats.averageYield ? `Ø Bruttorendite ${formatPercent(stats.averageYield)}` : "Rendite erscheint, sobald Miete importiert ist."}</p>
          </div>
          <span className="tag">{filtered.length} Treffer</span>
        </div>
        <div className="table-wrap">
          <table className="listings-table">
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
                  <td data-label="Listing">
                    <div className="cell-title listing-title-cell">
                      <strong>{listing.title}</strong>
                      <span>{sourceLabel(listing.source)} {hasMissingCoreData(listing) ? `· ${missingCount(listing)} Luecken` : "· vollstaendig"}</span>
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
                  <td data-label="Stadt">{listing.city || "Fehlt"}</td>
                  <td data-label="Preis"><strong className="money-value">{formatCurrency(listing.purchase_price)}</strong></td>
                  <td data-label="Flaeche">{formatNumber(listing.living_area_sqm, " m2")}</td>
                  <td data-label="Brutto">{formatPercent(grossYield(listing))}</td>
                  <td data-label="Markt">{marketSignal(listing)}</td>
                  <td data-label="Energie"><span className="tag">{listing.energy_class || "Fehlt"}</span></td>
                  <td data-label="Status"><span className={`status-pill ${(listing.status || "active").toLowerCase()}`}>{listing.status || "active"}</span></td>
                  <td data-label="Aktion">
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
