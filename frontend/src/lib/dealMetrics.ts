import { Deal, Listing, ListingFilters, PIPELINE_STAGES, PipelineStage } from "./types";

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Fehlt";
  }
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Fehlt";
  }
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function formatPercent(value: number | null | undefined): string {
  return formatNumber(value, " %");
}

export function grossYield(listing: Listing): number | null {
  if (!listing.purchase_price || !listing.cold_rent_monthly) {
    return null;
  }
  return (listing.cold_rent_monthly * 12 * 100) / listing.purchase_price;
}

export function hasMissingCoreData(listing: Listing): boolean {
  return (
    !listing.purchase_price ||
    !listing.living_area_sqm ||
    !listing.house_money_monthly ||
    !listing.energy_class ||
    !listing.city
  );
}

export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  return listings.filter((listing) => {
    if (filters.city && !(listing.city || "").toLowerCase().includes(filters.city.toLowerCase())) {
      return false;
    }
    if (filters.rented === "rented" && !listing.is_rented) {
      return false;
    }
    if (filters.rented === "vacant" && listing.is_rented) {
      return false;
    }
    if (filters.missingData && !hasMissingCoreData(listing)) {
      return false;
    }
    if (filters.energyClass && listing.energy_class !== filters.energyClass) {
      return false;
    }
    if (filters.source && listing.source !== filters.source) {
      return false;
    }
    if (filters.minPrice && (listing.purchase_price || 0) < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice && (listing.purchase_price || 0) > filters.maxPrice) {
      return false;
    }
    return true;
  });
}

export function groupDealsByStage(deals: Deal[]): Record<PipelineStage, Deal[]> {
  return PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((deal) => deal.pipeline_stage === stage);
      return acc;
    },
    {} as Record<PipelineStage, Deal[]>
  );
}

export function rankDealsByScore(deals: Deal[]): Deal[] {
  return [...deals].sort(
    (a, b) => (b.latest_score?.total_score || 0) - (a.latest_score?.total_score || 0)
  );
}

export function scoreTone(score: number | null | undefined): "good" | "watch" | "risk" | "empty" {
  if (score === null || score === undefined) return "empty";
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "risk";
}
