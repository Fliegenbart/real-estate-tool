import {
  CapitalStackResult,
  Dashboard,
  Deal,
  GiftPropertyComparison,
  InvestmentMemo,
  Listing,
  NegotiationDossier,
  PipelineStage,
  TaxBriefing,
  WegHealthInput,
  WegHealthResult
} from "./types";
import { demoDashboard, demoDeals, demoListings, demoMemo } from "./demoData";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    return demoDashboard;
  }
}

export async function getListings(): Promise<Listing[]> {
  try {
    return await request<Listing[]>("/listings");
  } catch {
    return demoListings;
  }
}

export async function importDemoListings(): Promise<void> {
  await request("/listings/import/demo", { method: "POST" });
}

export async function bootstrapDemoPortfolio(): Promise<void> {
  await importDemoListings();
  const listings = await request<Listing[]>("/listings");
  for (const listing of listings) {
    const deal = await convertListing(listing.id);
    await request(`/deals/${deal.id}/underwrite`, { method: "POST" });
    await request(`/deals/${deal.id}/score`, { method: "POST" });
  }
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
    return demoDeals;
  }
}

export async function getDeal(id: string | number): Promise<Deal> {
  try {
    return await request<Deal>(`/deals/${id}`);
  } catch {
    return demoDeals.find((deal) => String(deal.id) === String(id)) || demoDeals[0];
  }
}

export async function runUnderwriting(id: number): Promise<Deal> {
  await request(`/deals/${id}/underwrite`, { method: "POST" });
  return getDeal(id);
}

export async function runScore(id: number): Promise<Deal> {
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
  try {
    return await request<InvestmentMemo>(`/deals/${id}/investment-memo`);
  } catch {
    return demoMemo;
  }
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
