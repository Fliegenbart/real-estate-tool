import { Dashboard, Deal, InvestmentMemo, Listing, PipelineStage } from "./types";
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
