import {
  AcquisitionAssumptions,
  AcquisitionCommandCenter,
  BankPackage,
  CapitalStackResult,
  Dashboard,
  DataSource,
  Deal,
  GeoContext,
  GiftPropertyComparison,
  InvestmentMemo,
  Listing,
  PIPELINE_STAGES,
  NegotiationDossier,
  PipelineStage,
  RegionPayload,
  RenovationPlan,
  RenovationPlanInput,
  RiskMatrix,
  TaxBriefing,
  WegHealthInput,
  WegHealthResult
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getDashboard(): Promise<Dashboard> {
  try {
    return await request<Dashboard>("/dashboard");
  } catch {
    return {
      total_active_listings: 0,
      active_deals: 0,
      average_gross_yield: null,
      average_net_yield: null,
      red_flagged_deals: 0,
      top_deals: [],
      pipeline: PIPELINE_STAGES.reduce(
        (acc, stage) => ({ ...acc, [stage]: 0 }),
        {} as Dashboard["pipeline"]
      )
    };
  }
}

export async function getAcquisitionCommandCenter(
  assumptions: AcquisitionAssumptions
): Promise<AcquisitionCommandCenter> {
  return request<AcquisitionCommandCenter>("/acquisition/command-center", {
    method: "POST",
    body: JSON.stringify(assumptions)
  });
}

export async function getListings(): Promise<Listing[]> {
  try {
    return await request<Listing[]>("/listings");
  } catch {
    return [];
  }
}

export async function clearDemoData(): Promise<{ deleted_listings: number; deleted_deals: number }> {
  return request<{ deleted_listings: number; deleted_deals: number }>("/demo-data", { method: "DELETE" });
}

export async function updateListingStatus(id: number, status: string): Promise<Listing> {
  return request<Listing>(`/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function convertListing(id: number): Promise<Deal> {
  return request<Deal>(`/listings/${id}/convert-to-deal`, { method: "POST" });
}

export async function getDeals(): Promise<Deal[]> {
  try {
    return await request<Deal[]>("/deals");
  } catch {
    return [];
  }
}

export async function getDeal(id: string | number): Promise<Deal> {
  return request<Deal>(`/deals/${id}`);
}

export async function runUnderwriting(id: number): Promise<Deal> {
  await request(`/deals/${id}/underwrite`, { method: "POST" });
  return getDeal(id);
}

export async function runScore(id: number): Promise<Deal> {
  await request(`/deals/${id}/score`, { method: "POST" });
  return getDeal(id);
}

export type FinancingInput = {
  interest_rate_percent?: number | string;
  amortization_rate_percent?: number | string;
  loan_to_value_percent?: number | string;
  capex_financed_percent?: number | string;
};

export async function updateFinancing(id: number, payload: FinancingInput): Promise<Deal> {
  await request(`/deals/${id}/financing`, { method: "PATCH", body: JSON.stringify(payload) });
  await request(`/deals/${id}/underwrite`, { method: "POST" });
  await request(`/deals/${id}/score`, { method: "POST" });
  return getDeal(id);
}

export async function updatePipeline(id: number, stage: PipelineStage): Promise<Deal> {
  return request<Deal>(`/deals/${id}/pipeline`, {
    method: "PATCH",
    body: JSON.stringify({ stage })
  });
}

export async function getInvestmentMemo(id: string | number): Promise<InvestmentMemo> {
  return request<InvestmentMemo>(`/deals/${id}/investment-memo`);
}

export async function getBankPackage(id: string | number): Promise<BankPackage> {
  return request<BankPackage>(`/deals/${id}/bank-package`);
}

export async function analyzeRenovationPlan(
  id: string | number,
  payload: RenovationPlanInput
): Promise<RenovationPlan> {
  return request<RenovationPlan>(`/deals/${id}/renovation-plan`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateWegHealth(id: number, input: WegHealthInput): Promise<WegHealthResult> {
  return request<WegHealthResult>(`/deals/${id}/weg-health`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function updateSellerMotive(id: number, sellerMotive: string): Promise<Deal> {
  return request<Deal>(`/deals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ seller_motive: sellerMotive })
  });
}

export async function getNegotiationDossier(id: string | number): Promise<NegotiationDossier> {
  return request<NegotiationDossier>(`/deals/${id}/negotiation-dossier`);
}

export async function getTaxBriefing(id: string | number): Promise<TaxBriefing> {
  return request<TaxBriefing>(`/deals/${id}/tax-briefing`);
}

export async function createCapitalStack(
  id: string | number,
  payload: { name: string; tranches: Array<Record<string, string | number>> }
): Promise<CapitalStackResult> {
  return request<CapitalStackResult>(`/deals/${id}/capital-stack`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getGiftPropertyStrategies(
  payload: Record<string, string | number>
): Promise<GiftPropertyComparison> {
  return request<GiftPropertyComparison>(`/financing/gift-property-strategies`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function importEmailListings(content: string): Promise<{ imported: number; updated: number }> {
  return request<{ imported: number; updated: number }>(`/listings/import/email`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export async function parseExpose(content: string): Promise<Partial<Listing>> {
  return request<Partial<Listing>>(`/listings/parse-expose`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export async function createListing(payload: Partial<Listing>): Promise<Listing> {
  return request<Listing>(`/listings`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getRegions(): Promise<RegionPayload[]> {
  return request<RegionPayload[]>(`/regions`);
}

export async function getRegion(id: number): Promise<RegionPayload> {
  return request<RegionPayload>(`/regions/${id}`);
}

export async function seedRegionDefaults(): Promise<{ regions: number }> {
  return request<{ regions: number }>(`/regions/seed-defaults`, { method: "POST" });
}

export async function refreshOwnRegionMetrics(): Promise<{ cities_updated: number }> {
  return request<{ cities_updated: number }>(`/regions/refresh-own-metrics`, { method: "POST" });
}

export async function getRiskMatrix(id: string | number): Promise<RiskMatrix> {
  return request<RiskMatrix>(`/deals/${id}/risk-matrix`);
}

export async function updateGeoContext(id: string | number, payload: GeoContext): Promise<GeoContext> {
  return request<GeoContext>(`/deals/${id}/geo-context`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getDataSources(): Promise<DataSource[]> {
  return request<DataSource[]>(`/data-sources`);
}

export async function seedDefaultDataSources(): Promise<{ created: number }> {
  return request<{ created: number }>(`/data-sources/seed-defaults`, { method: "POST" });
}

export async function updateDataSource(id: number, payload: Partial<DataSource>): Promise<DataSource> {
  return request<DataSource>(`/data-sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
