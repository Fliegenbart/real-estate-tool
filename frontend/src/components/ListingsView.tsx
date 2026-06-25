"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle,
  CircleDollarSign,
  ClipboardList,
  Eraser,
  FileSearch,
  Mail,
  RefreshCw,
  Search,
  SlidersHorizontal,
  XCircle
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { clearDemoData, convertListing, getListings, getRegions, importEmailListings, updateListingStatus } from "../lib/api";
import { filterListings, formatCurrency, formatNumber, formatPercent, grossYield, hasMissingCoreData } from "../lib/dealMetrics";
import { Listing, ListingFilters, RegionPayload } from "../lib/types";
import { AddListingPanel } from "./AddListingPanel";

type ListingsLoadState = "loading" | "ready" | "error";

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
    listing.cold_rent_monthly,
    listing.house_money_monthly,
    listing.energy_class,
    listing.city
  ].filter((value) => value === null || value === undefined || value === "").length;
}

function listingStatus(listing: Listing): string {
  return (listing.status || "active").toLowerCase();
}

function listingCanConvert(listing: Listing): boolean {
  return listingStatus(listing) === "active";
}

function listingConvertActionLabel(listing: Listing): string {
  if (listingStatus(listing) === "converted") {
    return "Bereits gewandelt";
  }
  if (listingStatus(listing) === "rejected") {
    return "Abgelehnt";
  }
  return "In Deal wandeln";
}

function listingCanReject(listing: Listing): boolean {
  return listingStatus(listing) === "active";
}

function listingRejectActionLabel(listing: Listing): string {
  if (listingStatus(listing) === "rejected") {
    return "Bereits abgelehnt";
  }
  if (!listingCanReject(listing)) {
    return "Nicht mehr ablehnen";
  }
  return "Ablehnen";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

type ListingTriageStatus = "convert" | "data" | "watch";

type RentEstimate = {
  monthlyRent: number;
  rentPerSqm: number;
  source: "actual" | "listing_estimate" | "region_estimate" | "fallback_estimate";
  label: string;
  confidence: "high" | "medium" | "low";
};

type DealVerdictStatus = "interesting" | "review" | "reject" | "not_evaluable";

type DealVerdict = {
  status: DealVerdictStatus;
  label: string;
  tone: "good" | "watch" | "risk" | "empty";
  summary: string;
  rent: RentEstimate | null;
  grossYield: number | null;
  rentFactor: number | null;
  pricePerSqm: number | null;
  blockers: string[];
};

type ListingTriageRow = {
  listing: Listing;
  status: ListingTriageStatus;
  action: string;
  score: number;
  verdict: DealVerdict;
  missingLabels: string[];
  reasons: string[];
};

type ListingTriageBrief = {
  headline: string;
  summary: string;
  topListing: ListingTriageRow | null;
  dataBlocker: ListingTriageRow | null;
  marketSignal: ListingTriageRow | null;
  convertCount: number;
  dataCount: number;
  watchCount: number;
  weeklyFocus: string[];
};

export function ListingsView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [regions, setRegions] = useState<RegionPayload[]>([]);
  const [loadState, setLoadState] = useState<ListingsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadState("loading");
    setLoadError(null);
    try {
      const [nextListings, nextRegions] = await Promise.all([
        getListings(),
        getRegions().catch(() => [] as RegionPayload[])
      ]);
      setListings(nextListings);
      setRegions(nextRegions);
      setLoadState("ready");
    } catch (error) {
      setListings([]);
      setRegions([]);
      setLoadError(readableListingsError(error));
      setLoadState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => filterListings(listings, filters), [listings, filters]);
  const isLoading = loadState === "loading";
  const isError = loadState === "error";
  const isReady = loadState === "ready";
  const sources = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.source).filter(Boolean) as string[])).sort(),
    [listings]
  );
  const stats = useMemo(() => {
    const activeListings = filtered.filter(listingCanConvert);
    const active = activeListings.length;
    const missing = activeListings.filter(hasMissingCoreData).length;
    const medianPrice = median(activeListings.map((listing) => listing.purchase_price).filter((value): value is number => Boolean(value)));
    const yields = activeListings
      .map((listing) => listingDealVerdict(listing, regions).grossYield)
      .filter((value): value is number => value !== null);
    const averageYield = yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : null;
    return { active, missing, medianPrice, averageYield };
  }, [filtered, regions]);
  const dealStats = useMemo(() => dealVerdictStats(filtered, regions), [filtered, regions]);
  const verdictsById = useMemo(() => {
    return new Map(filtered.map((listing) => [listing.id, listingDealVerdict(listing, regions)]));
  }, [filtered, regions]);
  const triage = useMemo(() => listingTriageBrief(filtered, regions), [filtered, regions]);

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
            {isLoading
              ? "Suchagenten und manuelle Listings werden gerade geladen. Noch keine Marktentscheidung ableiten."
              : isError
                ? "Listings konnten nicht geladen werden. Bitte Backend oder Proxy pruefen."
                : `${filtered.length} von ${listings.length} Angeboten im Suchagenten-Zufluss. Erst sauber filtern, dann als Deal weiterbearbeiten.`}
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

      {(isLoading || isError) && (
        <section className={`listing-load-state ${loadState}`} role={isError ? "alert" : "status"} aria-live="polite">
          <div>
            <span className="section-kicker">{isLoading ? "Datenabruf" : "API-Fehler"}</span>
            <h3>{isLoading ? "Listings werden geladen" : "Listings konnten nicht geladen werden"}</h3>
            <p>
              {isLoading
                ? "Suchagenten und manuelle Listings werden gerade geladen. Die Akquise-Liste bleibt bewusst ohne Null-Urteil."
                : loadError}
            </p>
          </div>
          {isError && (
            <button className="button primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Erneut laden
            </button>
          )}
        </section>
      )}

      <section className="listing-insight-grid">
        <div className="listing-insight">
          <Building2 size={17} />
          <span>Aktive Angebote</span>
          <strong>{isReady ? stats.active : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
        <div className="listing-insight">
          <Search size={17} />
          <span>Aktueller Trefferraum</span>
          <strong>{isReady ? filtered.length : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
        <div className="listing-insight">
          <CircleDollarSign size={17} />
          <span>Median-Niveau</span>
          <strong>{isReady ? compactCurrency(stats.medianPrice) : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
        <div className={`listing-insight ${isReady && stats.missing ? "needs-work" : ""}`}>
          <AlertTriangle size={17} />
          <span>Datenluecken</span>
          <strong>{isReady ? stats.missing : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
        <div className={`listing-insight ${isReady && dealStats.interesting ? "deal-ready" : ""}`}>
          <CheckCircle size={17} />
          <span>Interessant</span>
          <strong>{isReady ? dealStats.interesting : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
        <div className="listing-insight">
          <FileSearch size={17} />
          <span>Pruefen</span>
          <strong>{isReady ? dealStats.review : isLoading ? "Laden" : "Fehler"}</strong>
        </div>
      </section>

      {isReady && <ListingTriageSection triage={triage} />}

      {isReady && <ListingConversionWorkOrder triage={triage} busyId={busyId} onConvert={convert} />}

      {isReady && <AddListingPanel onCreated={load} />}

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
            <p>
              {isLoading
                ? "Rendite wird nach dem Laden berechnet."
                : isError
                  ? "Rendite kann wegen API-Fehler nicht berechnet werden."
                  : stats.averageYield
                    ? `Ø vorsichtige Bruttorendite ${formatPercent(stats.averageYield)}`
                    : "Rendite erscheint, sobald Miete oder Flaeche importiert ist."}
            </p>
          </div>
          <span className="tag">{isLoading ? "Laden" : isError ? "Fehler" : `${filtered.length} Treffer`}</span>
        </div>
        <div className="table-wrap">
          <table className="listings-table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Deal-Ampel</th>
                <th>Stadt</th>
                <th>Preis</th>
                <th>Flaeche</th>
                <th>Miete/Rendite</th>
                <th>Markt</th>
                <th>Energie</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {isReady && filtered.map((listing) => {
                const canConvertListing = listingCanConvert(listing);
                const convertActionLabel = listingConvertActionLabel(listing);
                const canRejectListing = listingCanReject(listing);
                const rejectActionLabel = listingRejectActionLabel(listing);
                const verdict = verdictsById.get(listing.id) || listingDealVerdict(listing, regions);

                return (
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
                  <td data-label="Deal-Ampel"><DealVerdictBadge verdict={verdict} /></td>
                  <td data-label="Stadt">{listing.city || "Fehlt"}</td>
                  <td data-label="Preis"><strong className="money-value">{formatCurrency(listing.purchase_price)}</strong></td>
                  <td data-label="Flaeche">{formatNumber(listing.living_area_sqm, " m2")}</td>
                  <td data-label="Miete/Rendite"><RentYieldCell verdict={verdict} /></td>
                  <td data-label="Markt">{marketSignal(listing)}</td>
                  <td data-label="Energie"><span className="tag">{listing.energy_class || "Fehlt"}</span></td>
                  <td data-label="Status"><span className={`status-pill ${(listing.status || "active").toLowerCase()}`}>{listing.status || "active"}</span></td>
                  <td data-label="Aktion">
                    <div className="row-actions">
                      <button
                        className={`icon-button ${canConvertListing ? "" : "muted"}`}
                        title={convertActionLabel}
                        aria-label={convertActionLabel}
                        onClick={canConvertListing ? () => convert(listing.id) : undefined}
                        disabled={!canConvertListing || busyId === listing.id}
                      >
                        {canConvertListing ? <ArrowUpRight size={16} /> : <CheckCircle size={16} />}
                      </button>
                      <button
                        className={`icon-button ${canRejectListing ? "" : "muted"}`}
                        title={rejectActionLabel}
                        aria-label={rejectActionLabel}
                        onClick={canRejectListing ? () => reject(listing.id) : undefined}
                        disabled={!canRejectListing || busyId === listing.id}
                      >
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
                );
              })}
              {isLoading && <tr><td colSpan={10}>Listings werden geladen. Noch keine Trefferbewertung moeglich.</td></tr>}
              {isError && <tr><td colSpan={10}>Listings konnten nicht geladen werden. Backend oder Proxy pruefen.</td></tr>}
              {isReady && filtered.length === 0 && <tr><td colSpan={10}>Keine Listings.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function readableListingsError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden der Listings.";
}

function ListingTriageSection({ triage }: { triage: ListingTriageBrief }) {
  const topListing = triage.topListing;
  const dataBlocker = triage.dataBlocker;
  const marketSignal = triage.marketSignal || topListing;

  return (
    <section className="listing-triage" aria-label="Listing-Triage">
      <div className="listing-triage-head">
        <div>
          <span className="section-kicker">Listing-Eingang</span>
          <h3>{triage.headline}</h3>
          <p>{triage.summary}</p>
        </div>
        <div className="listing-triage-counter">
          <span>Sofort</span>
          <strong>{triage.convertCount}</strong>
        </div>
      </div>

      <div className="listing-triage-grid">
        <article className={`listing-triage-card ${topListing?.status || "watch"}`}>
          <span>Top-Auftrag</span>
          <strong>{topListing?.listing.title || "Kein Listing im Eingang"}</strong>
          <p>{topListing?.action || "Neue Suchagenten-Mails importieren und erste Eckdaten erfassen."}</p>
          {topListing && <small>{topListing.reasons.slice(0, 2).join(" · ")}</small>}
        </article>

        <article className={`listing-triage-card ${marketSignal?.status || "watch"}`}>
          <span>Marktsignal</span>
          <strong>{marketSignal ? listingMarketSignalHeadline(marketSignal.listing) : "Keine Preisbewegung"}</strong>
          <p>{marketSignal ? listingMarketSignalDetail(marketSignal.listing) : "Marktdauer und Preisbewegungen erscheinen nach Import."}</p>
        </article>

        <article className={`listing-triage-card ${dataBlocker ? "data" : "convert"}`}>
          <span>Datenbremse</span>
          <strong>{dataBlocker?.listing.title || "Keine harte Datenbremse"}</strong>
          <p>{dataBlocker ? dataBlocker.missingLabels.join(", ") : "Kernfelder sind im aktuellen Trefferraum vorhanden."}</p>
        </article>

        <article className="listing-triage-card weekly">
          <span>Diese Woche</span>
          <div className="listing-triage-weekly-title">
            <ClipboardList size={16} />
            <strong>Arbeitsplan</strong>
          </div>
          <ol>
            {triage.weeklyFocus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}

function ListingConversionWorkOrder({
  triage,
  busyId,
  onConvert
}: {
  triage: ListingTriageBrief;
  busyId: number | null;
  onConvert: (id: number) => void;
}) {
  const candidate = triage.topListing;
  const beforeChecks = listingConversionBeforeChecks(candidate);
  const afterSteps = listingConversionAfterSteps(candidate);
  const canConvert = Boolean(candidate && candidate.status === "convert");

  return (
    <section className={`listing-conversion-order ${candidate?.status || "watch"}`} aria-label="Deal-Wandlungsauftrag">
      <div className="listing-conversion-head">
        <div>
          <span className="section-kicker">Deal-Wandlungsauftrag</span>
          <h3>{candidate?.listing.title || "Kein Listing bereit zur Wandlung"}</h3>
          <p>{candidate?.action || "Neue Suchagenten-Mail importieren oder Listing manuell erfassen."}</p>
        </div>
        {candidate && (
          <button
            className="button primary"
            type="button"
            onClick={() => onConvert(candidate.listing.id)}
            disabled={!canConvert || busyId === candidate.listing.id}
          >
            <ArrowUpRight size={16} />
            {listingConversionButtonLabel(candidate)}
          </button>
        )}
      </div>

      <div className="listing-conversion-grid">
        <ListingConversionCard title="Warum jetzt" items={candidate?.reasons || ["Noch kein belastbares Listing-Signal."]} />
        <ListingConversionCard title="Vor Wandlung pruefen" items={beforeChecks} />
        <ListingConversionCard title="Nach Wandlung" items={afterSteps} />
      </div>
    </section>
  );
}

function ListingConversionCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="listing-conversion-card">
      <h4>{title}</h4>
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function DealVerdictBadge({ verdict }: { verdict: DealVerdict }) {
  return (
    <div className={`deal-verdict-badge ${verdict.status}`}>
      <strong>{verdict.label}</strong>
      <span>{verdict.summary}</span>
    </div>
  );
}

function RentYieldCell({ verdict }: { verdict: DealVerdict }) {
  if (!verdict.rent) {
    return <span className="muted-cell">Miete fehlt</span>;
  }

  return (
    <div className="rent-yield-cell">
      <strong>{formatCurrency(verdict.rent.monthlyRent)}</strong>
      <span>
        {verdict.grossYield !== null ? formatPercent(verdict.grossYield) : "Rendite fehlt"}
        {verdict.rentFactor !== null ? ` · Faktor ${formatNumber(verdict.rentFactor)}` : ""}
      </span>
      <em className={`rent-source-chip ${verdict.rent.confidence}`}>{verdict.rent.label}</em>
    </div>
  );
}

function listingTriageBrief(listings: Listing[], regions: RegionPayload[]): ListingTriageBrief {
  const rows = listings.filter(listingCanConvert).map((listing) => listingTriageRow(listing, regions)).sort((a, b) => b.score - a.score);
  const convertRows = rows.filter((row) => row.status === "convert");
  const dataRows = rows.filter((row) => row.status === "data");
  const watchRows = rows.filter((row) => row.status === "watch");
  const topListing = rows[0] || null;
  const dataBlocker = dataRows[0] || null;
  const marketSignal = rows.find((row) => listingHasMarketSignal(row.listing)) || topListing;

  return {
    headline: listingTriageHeadline(convertRows.length, dataRows.length, rows.length),
    summary: `${convertRows.length} ${dealCountLabel(convertRows.length)} · ${dataRows.length} Datenbremse · ${watchRows.length} Beobachten`,
    topListing,
    dataBlocker,
    marketSignal,
    convertCount: convertRows.length,
    dataCount: dataRows.length,
    watchCount: watchRows.length,
    weeklyFocus: listingWeeklyFocus(convertRows.length, dataRows.length, watchRows.length)
  };
}

function listingTriageRow(listing: Listing, regions: RegionPayload[]): ListingTriageRow {
  const verdict = listingDealVerdict(listing, regions);
  const missingLabels = missingCoreLabels(listing, verdict);
  const priceReduction = listing.price_reduction_total_percent;
  const days = listing.days_on_market ?? 0;
  const hasMarketSignal = listingHasMarketSignal(listing);
  const canConvert = verdict.status === "interesting";
  const status: ListingTriageStatus = canConvert ? "convert" : verdict.status === "reject" ? "watch" : "data";
  const score =
    (verdict.grossYield !== null ? Math.min(60, verdict.grossYield * 9) : 0) +
    (priceReduction ? Math.min(20, priceReduction * 2) : 0) +
    (days >= 45 ? 12 : 0) +
    (listing.signals?.length ? 8 : 0) -
    verdict.blockers.length * 12 +
    (hasMarketSignal && verdict.status === "review" ? 6 : 0);

  return {
    listing,
    status,
    action: listingTriageAction(status, verdict),
    score,
    verdict,
    missingLabels,
    reasons: listingTriageReasons(listing, verdict, missingLabels)
  };
}

function listingTriageHeadline(convertCount: number, dataCount: number, listingCount: number): string {
  if (convertCount > 0) {
    return "Sofort-Deals aus dem Listing-Eingang ziehen";
  }
  if (dataCount > 0) {
    return "Datenluecken bremsen den Listing-Eingang";
  }
  if (listingCount > 0) {
    return "Treffer beobachten und Preisbewegungen abwarten";
  }
  return "Listing-Eingang wartet auf Suchagenten";
}

function listingTriageAction(status: ListingTriageStatus, verdict?: DealVerdict): string {
  if (status === "convert") {
    return "Sofort in Deal wandeln";
  }
  if (status === "data") {
    if (verdict?.status === "review") {
      return "Miete, Hausgeld und Energie pruefen";
    }
    return "Daten nachfassen, dann unterwriten";
  }
  if (verdict?.status === "reject") {
    return "Ablehnen oder nur bei starkem Preisnachlass neu pruefen";
  }
  return "Beobachten und bei Preisbewegung neu pruefen";
}

function listingTriageReasons(listing: Listing, verdict: DealVerdict, missingLabels: string[]): string[] {
  const reasons: string[] = [];
  reasons.push(verdict.summary);
  if (verdict.grossYield !== null) {
    reasons.push(`Bruttorendite ${formatPercent(verdict.grossYield)}`);
  }
  if (listing.price_reduction_total_percent) {
    reasons.push(`Preisbewegung ${formatPercent(listing.price_reduction_total_percent)}`);
  }
  if (listing.days_on_market !== null && listing.days_on_market !== undefined && listing.days_on_market >= 45) {
    reasons.push(`${listing.days_on_market} Tage am Markt`);
  }
  if (missingLabels.length > 0) {
    reasons.push(`Fehlt: ${missingLabels.join(", ")}`);
  }
  if (!listing.cold_rent_monthly) {
    reasons.push("Ist-Miete nachfassen: Schaetzung reicht nur fuer die erste Sichtung.");
  }
  return reasons.length ? reasons : ["Noch keine harten Signale im aktuellen Datenstand."];
}

function listingWeeklyFocus(convertCount: number, dataCount: number, watchCount: number): string[] {
  const items: string[] = [];
  if (convertCount > 0) {
    items.push(`${convertCount} ${listingCountLabel(convertCount)} sofort in Deal wandeln.`);
  }
  if (dataCount > 0) {
    items.push(`${dataCount} ${listingCountLabel(dataCount)} mit Datenluecken nachfassen.`);
  }
  if (watchCount > 0) {
    items.push(`${watchCount} ${listingCountLabel(watchCount)} beobachten und Preisbewegung abwarten.`);
  }
  return items.length ? items : ["Suchagenten-Mail importieren oder neues Listing manuell erfassen."];
}

function listingConversionBeforeChecks(candidate: ListingTriageRow | null): string[] {
  if (!candidate) {
    return ["Suchagenten-Mail importieren oder Listing manuell erfassen."];
  }
  if (candidate.status === "data") {
    return [
      candidate.missingLabels.length
        ? `Fehlende Felder nachtragen: ${candidate.missingLabels.join(", ")}.`
        : "Ist-Miete, Hausgeld und Energie gegen die Anzeige oder Expose-Daten pruefen.",
      ...candidate.verdict.blockers.slice(0, 2)
    ];
  }
  if (candidate.verdict.blockers.length > 0) {
    return [
      "Vor einer neuen Bewertung diese Punkte klaeren.",
      ...candidate.verdict.blockers.slice(0, 3)
    ];
  }
  return [
    "Kaufpreis, Flaeche, Miete, Hausgeld und Energie liegen vor.",
    "Quelle, Marktdauer und Preisbewegung kurz gegenpruefen."
  ];
}

function listingConversionAfterSteps(candidate: ListingTriageRow | null): string[] {
  if (!candidate) {
    return ["Sobald ein Treffer belastbar ist, als Deal wandeln und Underwriting starten."];
  }
  if (candidate.status === "data") {
    return ["Nach Datenergaenzung neu triagieren und erst dann als Deal wandeln."];
  }
  return [
    "Underwriting, Score und Mikrolage sofort rechnen.",
    "Unterlagen- und Belegstatus im Deal pruefen."
  ];
}

function listingConversionButtonLabel(candidate: ListingTriageRow): string {
  if (candidate.status === "convert") {
    return "In Deal wandeln";
  }
  if (candidate.status === "data") {
    return "Miete/Kosten pruefen";
  }
  return candidate.verdict.status === "reject" ? "Nicht wandeln" : "Noch beobachten";
}

function listingHasMarketSignal(listing: Listing): boolean {
  return Boolean(
    listing.price_reduction_count ||
    (listing.price_reduction_total_percent && listing.price_reduction_total_percent > 0) ||
    (listing.days_on_market !== null && listing.days_on_market !== undefined && listing.days_on_market >= 45)
  );
}

function listingMarketSignalHeadline(listing: Listing): string {
  if (listing.price_reduction_total_percent) {
    return `Preisbewegung ${formatPercent(listing.price_reduction_total_percent)}`;
  }
  if (listing.days_on_market !== null && listing.days_on_market !== undefined) {
    return `${listing.days_on_market} Tage am Markt`;
  }
  return "Marktsignal offen";
}

function listingMarketSignalDetail(listing: Listing): string {
  const yieldValue = grossYield(listing);
  return `${yieldValue !== null ? `Bruttorendite ${formatPercent(yieldValue)}` : "Rendite fehlt"} · ${listing.city || "Ort fehlt"}`;
}

function missingCoreLabels(listing: Listing, verdict?: DealVerdict): string[] {
  const labels = [
    [listing.purchase_price, "Kaufpreis"],
    [listing.living_area_sqm, "Flaeche"],
    [listing.house_money_monthly, "Hausgeld"],
    [listing.energy_class, "Energie"],
    [listing.city, "Stadt"]
  ]
    .filter(([value]) => value === null || value === undefined || value === "")
    .map(([, label]) => label as string);
  if (!verdict?.rent) {
    labels.splice(2, 0, "Miete");
  }
  return labels;
}

function dealVerdictStats(listings: Listing[], regions: RegionPayload[]) {
  return listings.filter(listingCanConvert).reduce(
    (acc, listing) => {
      acc[listingDealVerdict(listing, regions).status] += 1;
      return acc;
    },
    { interesting: 0, review: 0, reject: 0, not_evaluable: 0 } as Record<DealVerdictStatus, number>
  );
}

function listingDealVerdict(listing: Listing, regions: RegionPayload[]): DealVerdict {
  const price = listing.purchase_price ?? null;
  const area = listing.living_area_sqm ?? null;
  const rent = estimateRent(listing, regions);
  const pricePerSqm = price && area ? price / area : null;
  const requiredBlockers: string[] = [];

  if (!price) requiredBlockers.push("Kaufpreis fehlt");
  if (!area) requiredBlockers.push("Flaeche fehlt");
  if (!rent) requiredBlockers.push("Miete fehlt");

  if (!price || !area || !rent) {
    return {
      status: "not_evaluable",
      label: "Nicht bewertbar",
      tone: "empty",
      summary: "Preis, Flaeche oder Miete fehlen.",
      rent,
      grossYield: null,
      rentFactor: null,
      pricePerSqm,
      blockers: requiredBlockers
    };
  }

  const grossYieldValue = (rent.monthlyRent * 12 * 100) / price;
  const rentFactor = price / (rent.monthlyRent * 12);
  const blockers = [...requiredBlockers];
  if (!listing.cold_rent_monthly) blockers.push("Ist-Miete fehlt");
  if (!listing.house_money_monthly) blockers.push("Hausgeld fehlt");
  if (!listing.energy_class) blockers.push("Energie fehlt");

  if (grossYieldValue < 4.2 || rentFactor > 24) {
    return {
      status: "reject",
      label: "Ablehnen",
      tone: "risk",
      summary: "Rendite wirkt zu schwach fuer den Preis.",
      rent,
      grossYield: grossYieldValue,
      rentFactor,
      pricePerSqm,
      blockers
    };
  }

  const hasReliableRent = rent.source === "actual" || rent.source === "listing_estimate";
  const hasCoreCosts = Boolean(listing.house_money_monthly && listing.energy_class);
  if (grossYieldValue >= 6.2 && hasReliableRent && hasCoreCosts) {
    return {
      status: "interesting",
      label: "Interessant",
      tone: "good",
      summary: "Rendite und Pflichtdaten passen fuer die naechste Pruefung.",
      rent,
      grossYield: grossYieldValue,
      rentFactor,
      pricePerSqm,
      blockers
    };
  }

  return {
    status: "review",
    label: "Pruefen",
    tone: "watch",
    summary:
      grossYieldValue >= 6.2
        ? "Rendite wirkt gut, aber Miete oder Kosten sind noch unsicher."
        : "Rendite liegt im Mittelfeld; Preis und Kosten gegenpruefen.",
    rent,
    grossYield: grossYieldValue,
    rentFactor,
    pricePerSqm,
    blockers
  };
}

function estimateRent(listing: Listing, regions: RegionPayload[]): RentEstimate | null {
  const area = listing.living_area_sqm ?? null;
  if (listing.cold_rent_monthly && area) {
    return {
      monthlyRent: listing.cold_rent_monthly,
      rentPerSqm: listing.cold_rent_monthly / area,
      source: "actual",
      label: "Ist-Miete",
      confidence: "high"
    };
  }

  if (listing.market_rent_estimate_monthly && area) {
    return {
      monthlyRent: listing.market_rent_estimate_monthly,
      rentPerSqm: listing.market_rent_estimate_monthly / area,
      source: "listing_estimate",
      label: "Miet-Schaetzung",
      confidence: "medium"
    };
  }

  if (!area) return null;

  const matchedRegion = findMatchingRegion(listing.city, regions);
  const regionRent = matchedRegion
    ? matchedRegion.metrics["own_median_rent_eur_sqm"] ?? matchedRegion.metrics["rent_eur_sqm"]
    : null;

  if (regionRent) {
    const conservativeRentPerSqm = regionRent * 0.9;
    return {
      monthlyRent: conservativeRentPerSqm * area,
      rentPerSqm: conservativeRentPerSqm,
      source: "region_estimate",
      label: "Standort-Schaetzung",
      confidence: "medium"
    };
  }

  const fallbackRentPerSqm = 8;
  return {
    monthlyRent: fallbackRentPerSqm * area,
    rentPerSqm: fallbackRentPerSqm,
    source: "fallback_estimate",
    label: "Fallback-Schaetzung",
    confidence: "low"
  };
}

function findMatchingRegion(city: string | null | undefined, regions: RegionPayload[]): RegionPayload | null {
  const cityName = normalizeRegionName(city);
  if (!cityName) return null;

  return (
    regions.find((region) => {
      const regionName = normalizeRegionName(region.name);
      return Boolean(regionName && (cityName === regionName || cityName.includes(regionName) || regionName.includes(cityName)));
    }) || null
  );
}

function normalizeRegionName(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(kreis|landkreis|stadt|gemeinde|gmbh|eg|ag|kg|immobilien|volksbank|sparkasse)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function dealCountLabel(count: number): string {
  return count === 1 ? "Sofort-Deal" : "Sofort-Deals";
}

function listingCountLabel(count: number): string {
  return count === 1 ? "Listing" : "Listings";
}
