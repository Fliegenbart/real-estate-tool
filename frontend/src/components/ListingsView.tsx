"use client";

import { ArrowUpRight, CheckCircle, FileSearch, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { convertListing, getListings, importDemoListings, updateListingStatus } from "../lib/api";
import { filterListings, formatCurrency, formatNumber, formatPercent, grossYield, hasMissingCoreData } from "../lib/dealMetrics";
import { Listing, ListingFilters } from "../lib/types";

export function ListingsView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>({ city: "", rented: "all", missingData: false });
  const [busyId, setBusyId] = useState<number | null>(null);

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
        <button className="button primary" onClick={seedDemo}>
          <RefreshCw size={16} />
          Demo laden
        </button>
      </section>

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
                    </div>
                  </td>
                  <td>{listing.city || "Fehlt"}</td>
                  <td>{formatCurrency(listing.purchase_price)}</td>
                  <td>{formatNumber(listing.living_area_sqm, " m2")}</td>
                  <td>{formatPercent(grossYield(listing))}</td>
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
              {filtered.length === 0 && <tr><td colSpan={8}>Keine Listings.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
