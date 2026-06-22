import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboard, getDeals, getListings, refreshDealMicroLocationFromAddress } from "../src/lib/api";

const fetchMock = vi.fn();

global.fetch = fetchMock;

describe("frontend API helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("refreshes deal micro location from address without live geocoding by default", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ location: { source: "openstreetmap/overpass" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 7, title: "Updated deal", pipeline_stage: "New" })
      });

    const deal = await refreshDealMicroLocationFromAddress(7);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/deals/7/location/osm-from-address"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ allow_external_geocoding: false })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/deals/7"), expect.any(Object));
    expect(deal.title).toBe("Updated deal");
  });

  it("surfaces API detail text for failed micro location refreshes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "NOMINATIM_USER_AGENT must be set" })
    });

    await expect(refreshDealMicroLocationFromAddress(7, { allowExternalGeocoding: true })).rejects.toThrow(
      "NOMINATIM_USER_AGENT must be set"
    );
  });

  it("does not hide dashboard API outages behind an empty dashboard", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Dashboard API offline" })
    });

    await expect(getDashboard()).rejects.toThrow("Dashboard API offline");
  });

  it("does not hide listings API outages behind an empty list", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Listings API offline" })
    });

    await expect(getListings()).rejects.toThrow("Listings API offline");
  });

  it("does not hide deal API outages behind an empty pipeline", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Deals API offline" })
    });

    await expect(getDeals()).rejects.toThrow("Deals API offline");
  });

  it("sends manually entered coordinates as prepared geocoding evidence", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ geocode: { source: "manual_coordinates" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 7, title: "Coordinate deal", pipeline_stage: "New" })
      });

    await refreshDealMicroLocationFromAddress(7, {
      manualCoordinates: {
        latitude: 52.517208,
        longitude: 13.397834,
        displayName: "Manuell gesetzte Koordinaten"
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/deals/7/location/osm-from-address"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          allow_external_geocoding: false,
          geocode_result: {
            latitude: 52.517208,
            longitude: 13.397834,
            display_name: "Manuell gesetzte Koordinaten",
            confidence: "high",
            source: "manual_coordinates"
          }
        })
      })
    );
  });
});
