import { render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataSourcesView } from "../src/components/DataSourcesView";
import { getDataSources, seedDefaultDataSources, updateDataSource } from "../src/lib/api";
import { DataSource } from "../src/lib/types";

vi.mock("../src/lib/api", () => ({
  getDataSources: vi.fn(),
  seedDefaultDataSources: vi.fn(),
  updateDataSource: vi.fn()
}));

const getDataSourcesMock = vi.mocked(getDataSources);
const seedDefaultDataSourcesMock = vi.mocked(seedDefaultDataSources);
const updateDataSourceMock = vi.mocked(updateDataSource);

function sources(): DataSource[] {
  return [
    {
      id: 1,
      name: "BORIS-D Bodenrichtwerte",
      provider: "Gutachterausschuesse",
      data_type: "ground_value",
      license_type: "dl-de/by-2-0",
      commercial_use_allowed: true,
      attribution_required: true,
      geographic_coverage: "Deutschland",
      last_import_at: "2026-06-15T09:00:00",
      source_data_date: "2026-01-01",
      update_frequency: "jaehrlich",
      reliability_score: 85
    },
    {
      id: 2,
      name: "Kleinanzeigen Suchagent",
      provider: "Kleinanzeigen.de",
      data_type: "listings",
      license_type: "eigene Suchagenten-Mails",
      commercial_use_allowed: null,
      attribution_required: false,
      geographic_coverage: "Deutschland",
      last_import_at: null,
      source_data_date: "2024-01-01",
      update_frequency: "taeglich",
      reliability_score: 45
    },
    {
      id: 3,
      name: "Kommunaler Mietspiegel",
      provider: "Stadt",
      data_type: "rent_reference",
      license_type: "oeffentlich",
      commercial_use_allowed: true,
      attribution_required: true,
      geographic_coverage: "nur Staedte mit Mietspiegel",
      last_import_at: "2026-06-01T12:00:00",
      source_data_date: "2023-01-01",
      update_frequency: "alle 2 Jahre",
      reliability_score: 80
    }
  ];
}

describe("DataSourcesView", () => {
  beforeEach(() => {
    getDataSourcesMock.mockReset();
    seedDefaultDataSourcesMock.mockReset();
    updateDataSourceMock.mockReset();
  });

  it("shows source health, license risk and prioritized source work orders", async () => {
    getDataSourcesMock.mockResolvedValueOnce(sources());

    render(<DataSourcesView />);

    const health = within(await screen.findByLabelText(/Quellen-Gesundheit/i));

    expect(health.getByText("Quellen-Gesundheit")).toBeInTheDocument();
    expect(health.getByText("Quellenregister braucht Aktualisierung")).toBeInTheDocument();
    expect(health.getByText(/2 kritische Quellen/i)).toBeInTheDocument();
    expect(health.getByText("Ø Verlaesslichkeit")).toBeInTheDocument();
    expect(health.getByText("70")).toBeInTheDocument();
    expect(health.getByText("Lizenz offen")).toBeInTheDocument();
    expect(health.getByText("1")).toBeInTheDocument();

    expect(health.getByText("Quellen-Arbeitsauftraege")).toBeInTheDocument();
    expect(health.getByText("Kleinanzeigen Suchagent")).toBeInTheDocument();
    expect(health.getByText("Import fehlt")).toBeInTheDocument();
    expect(health.getByText(/Suchagent pruefen und letzten Import dokumentieren/i)).toBeInTheDocument();
    expect(health.getByText("Kommunaler Mietspiegel")).toBeInTheDocument();
    expect(health.getByText("Datenstand alt")).toBeInTheDocument();
  });

  it("shows a loading state before the source register resolves", () => {
    getDataSourcesMock.mockReturnValueOnce(new Promise<DataSource[]>(() => undefined));

    render(<DataSourcesView />);

    expect(screen.getByText("Quellen werden geladen")).toBeInTheDocument();
    expect(screen.queryByText("Keine Quellen registriert")).not.toBeInTheDocument();
  });

  it("shows a load failure without treating the register as empty", async () => {
    getDataSourcesMock.mockRejectedValueOnce(new Error("api offline"));

    render(<DataSourcesView />);

    expect(await screen.findByText("Quellen konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.queryByText("Keine Quellen registriert")).not.toBeInTheDocument();
    expect(screen.getByText(/Backend oder Proxy pruefen/i)).toBeInTheDocument();
  });
});
