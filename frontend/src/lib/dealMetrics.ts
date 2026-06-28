import {
  AcquisitionCommandCenter,
  BankPackage,
  DataSource,
  Deal,
  DealDocument,
  DealDecision,
  Listing,
  ListingFilters,
  ListingOpportunity,
  LocationEvidenceInputs,
  LocationScorePayload,
  PIPELINE_STAGES,
  PipelineStage,
  RegionOutlook,
  RegionOutlookMicroFactor,
  RegionOutlookMetric,
  RegionOutlookTargetProfile
} from "./types";

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
    !listing.cold_rent_monthly ||
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

export type DueDiligenceDocumentStatus = "provided" | "review" | "missing";

export type DueDiligenceDocumentRow = {
  documentId: number | null;
  documentType: string;
  label: string;
  status: DueDiligenceDocumentStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  fileName: string | null;
  riskNotes: string | null;
};

export type DueDiligenceDocumentRequest = {
  documentType: string;
  label: string;
  recipient: string;
  reason: string;
  blocking: boolean;
  tone: ReturnType<typeof scoreTone>;
};

export type DueDiligenceDocumentRequestPack = {
  headline: string;
  copySubject: string;
  copyIntro: string;
  requests: DueDiligenceDocumentRequest[];
  copyLines: string[];
  copyText: string;
  recipientSummary: string;
  blockingCount: number;
  reviewCount: number;
  nextAction: string;
};

export type DueDiligenceDocumentSummary = {
  provided: number;
  total: number;
  percent: number;
  headline: string;
  rows: DueDiligenceDocumentRow[];
  missingLabels: string[];
  nextAction: string;
  requestPack: DueDiligenceDocumentRequestPack;
};

const requiredDueDiligenceDocuments = [
  { documentType: "expose", label: "Expose" },
  { documentType: "energy_certificate", label: "Energieausweis" },
  { documentType: "declaration_of_division", label: "Teilungserklaerung" },
  { documentType: "weg_minutes", label: "WEG-Protokolle" },
  { documentType: "economic_plan", label: "Wirtschaftsplan" },
  { documentType: "annual_statement", label: "Jahresabrechnung" },
  { documentType: "maintenance_reserve_statement", label: "Ruecklagenstand" },
  { documentType: "rental_contract", label: "Mietvertrag" },
  { documentType: "floor_plan", label: "Grundriss" },
  { documentType: "land_register_excerpt", label: "Grundbuchauszug" }
];

export function dueDiligenceDocumentSummary(deal: Deal): DueDiligenceDocumentSummary {
  const documentsByType = new Map<string, DealDocument>();
  for (const document of deal.documents || []) {
    if (!document.document_type || documentsByType.has(document.document_type)) {
      continue;
    }
    documentsByType.set(document.document_type, document);
  }

  const rows = requiredDueDiligenceDocuments.map((required) => {
    const document = documentsByType.get(required.documentType);
    return dueDiligenceDocumentRow(required.documentType, required.label, document);
  });
  const provided = rows.filter((row) => row.status !== "missing").length;
  const total = rows.length;
  const percent = total ? Math.round((provided / total) * 100) : 0;
  const missingLabels = rows.filter((row) => row.status === "missing").map((row) => row.label);
  const needsReview = rows.some((row) => row.status === "review");
  const requestPack = dueDiligenceRequestPack(rows);

  return {
    provided,
    total,
    percent,
    headline: `${provided}/${total} Unterlagen`,
    rows,
    missingLabels,
    nextAction: dueDiligenceNextAction(missingLabels.length, needsReview),
    requestPack
  };
}

export function scoreTone(score: number | null | undefined): "good" | "watch" | "risk" | "empty" {
  if (score === null || score === undefined) return "empty";
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "risk";
}

export function regionOutlookHighlights(outlook: RegionOutlook | null | undefined): RegionOutlookMetric[] {
  if (!outlook) {
    return [];
  }
  const priority = [
    "population_trend_score",
    "urban_environment_quality_score",
    "climate_resilience_score",
    "employer_access_score",
    "purchasing_power_score",
    "vacancy_risk_score"
  ];
  return [...outlook.key_metrics]
    .sort((a, b) => {
      const aPriority = priority.indexOf(a.name);
      const bPriority = priority.indexOf(b.name);
      if (aPriority === -1 && bPriority === -1) {
        return b.value - a.value;
      }
      if (aPriority === -1) {
        return 1;
      }
      if (bPriority === -1) {
        return -1;
      }
      return aPriority - bPriority;
    })
    .slice(0, 4);
}

const microLocationLabels: Record<string, string> = {
  transit_access_score: "Bahnhof/U-Bahn",
  daily_needs_score: "Alltag",
  demand_anchor_score: "Messe/Jobs/Uni/Klinik",
  leisure_quality_score: "Freizeit",
  short_term_rental_score: "Airbnb/Tourismus",
  nuisance_resilience_score: "Stoerfaktoren"
};

export type MicroLocationFactorRow = RegionOutlookMicroFactor & {
  label: string;
  tone: ReturnType<typeof scoreTone>;
};

export function microLocationFactorRows(outlook: RegionOutlook | null | undefined): MicroLocationFactorRow[] {
  if (!outlook?.micro_location_factors) {
    return [];
  }
  return outlook.micro_location_factors.map((factor) => ({
    ...factor,
    label: microLocationLabels[factor.name] || factor.name.replaceAll("_", " "),
    tone: scoreTone(factor.value)
  }));
}

export type MicroLocationEvidenceRow = {
  label: string;
  value: string;
  tone: ReturnType<typeof scoreTone>;
};

type EvidenceRowDefinition = {
  key: string;
  label: string;
  format: (value: number | string) => string;
  tone: (value: number | string) => ReturnType<typeof scoreTone>;
};

const microLocationEvidenceDefinitions: EvidenceRowDefinition[] = [
  {
    key: "nearest_rapid_transit_meters",
    label: "Bahnhof/U-Bahn",
    format: formatDistanceMeters,
    tone: (value) => closeDistanceTone(value, 800, 1600)
  },
  {
    key: "supermarkets_1000m",
    label: "Supermarkt",
    format: formatCount,
    tone: (value) => countTone(value, 2, 0)
  },
  {
    key: "pharmacies_1000m",
    label: "Apotheke",
    format: formatCount,
    tone: (value) => countTone(value, 1, 0)
  },
  {
    key: "doctors_1500m",
    label: "Aerzte",
    format: formatCount,
    tone: (value) => countTone(value, 4, 0)
  },
  {
    key: "schools_1500m",
    label: "Schulen",
    format: formatCount,
    tone: (value) => countTone(value, 2, 0)
  },
  {
    key: "nearest_trade_fair_meters",
    label: "Messe",
    format: formatDistanceMeters,
    tone: (value) => closeDistanceTone(value, 4000, 12000)
  },
  {
    key: "nearest_event_venue_meters",
    label: "Event/Freizeitanker",
    format: formatDistanceMeters,
    tone: (value) => closeDistanceTone(value, 1500, 6000)
  },
  {
    key: "nearest_recreation_anchor_meters",
    label: "Freizeitpark/Freizeitanker",
    format: formatDistanceMeters,
    tone: (value) => closeDistanceTone(value, 1500, 7000)
  },
  {
    key: "hotels_1500m",
    label: "Hotels im Umkreis",
    format: formatCount,
    tone: (value) => countTone(value, 5, 1)
  },
  {
    key: "short_term_rental_occupancy_percent",
    label: "Airbnb-Auslastung",
    format: formatEvidencePercent,
    tone: (value) => percentTone(value, 70, 50)
  },
  {
    key: "short_term_rental_legal_status",
    label: "Airbnb-Rechtslage",
    format: formatLegalStatus,
    tone: legalStatusTone
  },
  {
    key: "main_road_meters",
    label: "Hauptstrasse",
    format: formatDistanceMeters,
    tone: (value) => farDistanceTone(value, 600, 150)
  }
];

export function microLocationEvidenceRows(
  location: LocationScorePayload | null | undefined
): MicroLocationEvidenceRow[] {
  const inputs = evidenceInputsFromLocation(location);
  if (!inputs) {
    return [];
  }
  return microLocationEvidenceDefinitions.flatMap((definition) => {
    const value = inputs[definition.key];
    if (value === null || value === undefined || value === "") {
      return [];
    }
    return [
      {
        label: definition.label,
        value: definition.format(value),
        tone: definition.tone(value)
      }
    ];
  });
}

export type MicroLocationProfileRow = Omit<RegionOutlookTargetProfile, "next_check"> & {
  tone: ReturnType<typeof scoreTone>;
  nextCheck: string;
};

export function microLocationProfileRows(outlook: RegionOutlook | null | undefined): MicroLocationProfileRow[] {
  if (!outlook?.target_group_profiles?.length) {
    return [];
  }
  return outlook.target_group_profiles.map((profile) => ({
    name: profile.name,
    label: profile.label,
    score: profile.score,
    verdict: profile.verdict,
    tone: scoreTone(profile.score),
    reasons: profile.reasons || [],
    risks: profile.risks || [],
    nextCheck: profile.next_check
  }));
}

export function microLocationCoordinateReadinessBrief(deal: Deal): MicroLocationCoordinateReadinessBrief {
  const latitude = coordinateNumber(deal.listing?.latitude);
  const longitude = coordinateNumber(deal.listing?.longitude);
  const hasCoordinates = latitude !== null && longitude !== null;
  const location = deal.location || {};
  const source = typeof location.source === "string" && location.source ? location.source : null;
  const completeness = numberValue(location.evidence_data_completeness_percent);
  const confidence = typeof location.evidence_confidence === "string" ? location.evidence_confidence.toLowerCase() : null;
  const evidenceReady = completeness !== null && completeness >= 75 && confidence !== null && confidence !== "low";
  const facts: MicroLocationCoordinateReadinessBrief["facts"] = [
    {
      label: "Koordinaten",
      value: hasCoordinates ? `${latitude}, ${longitude}` : "Fehlen",
      tone: hasCoordinates ? "good" : "risk"
    },
    {
      label: "Quelle",
      value: source ? readableLocationSource(source) : "Fehlt",
      tone: source ? (source.includes("openstreetmap") || source.includes("overpass") ? "good" : "watch") : "empty"
    },
    {
      label: "Datenlage",
      value: completeness !== null ? `${formatEvidencePercent(completeness)} · ${evidenceConfidenceLabel(confidence)}` : "Fehlt",
      tone: evidenceReady ? "good" : completeness === null ? "empty" : "watch"
    }
  ];

  if (!hasCoordinates) {
    return {
      status: "missing",
      headline: "Koordinaten fehlen - Mikrolage nicht kaufpreisreif",
      tone: "risk",
      summary:
        "Der aktuelle Lage-Score kann nur als grobe Vorpruefung dienen. Erst mit Koordinaten lassen sich OePNV, Alltag, Freizeit und Stoerquellen objektgenau belegen.",
      priceRule: "Keinen Lage-Credit im Kaufpreis ansetzen, bis die Koordinaten gesetzt und die Mikrolage neu gerechnet ist.",
      nextAction: "Adresse in der Karte suchen, Koordinaten einfuegen und Koordinaten pruefen starten.",
      facts
    };
  }

  if (!evidenceReady) {
    return {
      status: "needs_evidence",
      headline: "Koordinaten gesetzt - Lagebelege nachziehen",
      tone: "watch",
      summary:
        "Das Objekt ist verortbar, aber Datenlage oder Quellenvertrauen reichen noch nicht fuer einen sauberen Kaufpreishebel.",
      priceRule: "Lage nur als Memo fuehren, bis OSM, Vor-Ort-Eindruck und Vergleichsmieten zusammenpassen.",
      nextAction: "Mikrolage mit OSM/Karte aktualisieren und fehlende Alltag-, Nachfrage- und Stoerfaktor-Belege ergaenzen.",
      facts
    };
  }

  return {
    status: "ready",
    headline: "Koordinaten bereit - Mikrolage belegbar",
    tone: "good",
    summary:
      "Koordinaten und Lagebelege reichen fuer Memo und Komitee-Pruefung; ein Preisaufschlag bleibt trotzdem an echte Vergleichsmieten gebunden.",
    priceRule: "Lage-Credit nur gedeckelt pruefen und erst mit Vergleichsmieten im direkten Umfeld in den Walk-away aufnehmen.",
    nextAction: "Vor Angebot Pendelzeiten, Alltagswege, Stoerquellen und Vergleichsmieten final gegenpruefen.",
    facts
  };
}

export type MicroLocationDecisionBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  positives: string[];
  risks: string[];
  nextChecks: string[];
};

export type MicroLocationCoordinateReadinessBrief = {
  status: "ready" | "needs_evidence" | "missing";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  priceRule: string;
  nextAction: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type MicroLocationPotentialRow = {
  key: "transit" | "daily_needs" | "demand_anchor" | "leisure" | "short_term" | "nuisance" | "evidence";
  label: string;
  role: string;
  signal: string;
  underwritingUse: string;
  nextCheck: string;
  tone: ReturnType<typeof scoreTone>;
};

export type MicroLocationReadinessStatus = "price" | "memo" | "brake" | "proof" | "missing";

export type MicroLocationReadinessRow = {
  key: MicroLocationPotentialRow["key"];
  label: string;
  status: MicroLocationReadinessStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  proof: string;
  decisionUse: string;
  nextAction: string;
};

export type MicroLocationReadinessBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: MicroLocationReadinessRow[];
  nextActions: string[];
};

export type DealMicroLocationAlphaBrief = {
  status: "alpha" | "memo" | "risk" | "missing";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  rentThesis: string;
  priceRule: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  memoItems: string[];
  risks: string[];
  nextActions: string[];
};

export type DealMicroLocationPriceGateStatus = "committee" | "memo_only" | "blocked" | "missing";

export type DealMicroLocationPriceGateBrief = {
  status: DealMicroLocationPriceGateStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  premiumBudgetEur: number | null;
  premiumPercent: number | null;
  priceRule: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  guardrails: string[];
  nextActions: string[];
};

export type DealMicroLocationTargetGroupStatus = "base" | "memo" | "risk" | "missing";

export type DealMicroLocationTargetGroupRole = "Basisnachfrage" | "Memo-Upside" | "Pruefgruppe" | "Risiko";

export type DealMicroLocationTargetGroupRow = {
  name: string;
  label: string;
  score: number;
  role: DealMicroLocationTargetGroupRole;
  verdict: string;
  tone: ReturnType<typeof scoreTone>;
  proof: string;
  risk: string;
  decisionUse: string;
  nextCheck: string;
};

export type DealMicroLocationTargetGroupBrief = {
  status: DealMicroLocationTargetGroupStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  baseCase: string;
  memoRule: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: DealMicroLocationTargetGroupRow[];
  nextActions: string[];
};

export function microLocationDecisionBrief(deal: Deal): MicroLocationDecisionBrief {
  const location = deal.location || {};
  const score = numberValue(location.micro_location_score);
  const transit = numberValue(location.transit_access_score);
  const dailyNeeds = numberValue(location.daily_needs_score);
  const demandAnchor = numberValue(location.demand_anchor_score);
  const leisure = numberValue(location.leisure_quality_score);
  const shortTerm = numberValue(location.short_term_rental_score);
  const nuisance = numberValue(location.nuisance_resilience_score);
  const completeness = numberValue(location.evidence_data_completeness_percent);
  const confidence = typeof location.evidence_confidence === "string" ? location.evidence_confidence : null;
  const evidenceNotes = Array.isArray(location.evidence_notes)
    ? location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const hasCoordinates =
    deal.listing?.latitude !== null &&
    deal.listing?.latitude !== undefined &&
    deal.listing?.longitude !== null &&
    deal.listing?.longitude !== undefined;

  const positives: string[] = [];
  const risks: string[] = [];
  const nextChecks: string[] = [];

  if (transit !== null && transit >= 80) {
    positives.push("Bahnhof/U-Bahn/S-Bahn-Naehe ist stark und stuetzt Vermietbarkeit.");
  }
  if (dailyNeeds !== null && dailyNeeds >= 80) {
    positives.push("Alltag/Versorgung ist stark und reduziert Leerstandsrisiko.");
  }
  if (demandAnchor !== null && demandAnchor >= 80) {
    positives.push("Messe/Jobs/Uni/Klinik stuetzen Nachfrage und Wiederverkauf.");
  }
  if (leisure !== null && leisure >= 80) {
    positives.push("Freizeit- und Aufenthaltsqualitaet ist ein Plus fuer Mieter.");
  }

  if (nuisance !== null && nuisance < 60) {
    risks.push("Stoerfaktoren sind auffaellig: Laerm, Hauptstrasse, Nachtleben oder Industrie vor Gebot pruefen.");
    nextChecks.push("Laerm- und Strassenlage vor Ort oder mit Karten-/Katasterdaten gegenpruefen.");
  }

  const shortTermRestricted = evidenceNotes.some((note) => {
    const normalized = note.toLowerCase();
    return normalized.includes("short-term rental legal status is restricted") || normalized.includes("legal status is unclear");
  });
  if ((shortTerm !== null && shortTerm >= 65 && shortTermRestricted) || (shortTerm !== null && shortTerm < 50)) {
    risks.push("Airbnb nur als optionalen Bonus behandeln; lokale Rechtslage ist eingeschraenkt oder unklar.");
    nextChecks.push("Airbnb-/Zweckentfremdungsregeln der Stadt pruefen.");
  }

  if (completeness !== null && completeness < 70) {
    risks.push("Datenlage ist noch duenn; Score nicht als Gebotsgrundlage verwenden.");
    nextChecks.push("OSM-, Verkehrs-, Versorgungs- und Stoerquellen-Daten ergaenzen.");
  }

  if (confidence === "low") {
    risks.push("Vertrauen in die Mikrolage-Daten ist niedrig.");
    nextChecks.push("Mikrolage mit belastbaren Quellen oder Vor-Ort-Pruefung bestaetigen.");
  }

  if (!hasCoordinates) {
    nextChecks.push("Koordinaten setzen und Mikrolage erneut ueber Karte/OSM pruefen.");
  }

  if (positives.length === 0) {
    nextChecks.push("Mindestens OePNV, Versorgung und Stoerquellen als Basis-Checks erfassen.");
  }

  return {
    headline: microLocationDecisionHeadline(score, risks),
    tone: microLocationDecisionTone(score, risks),
    positives,
    risks,
    nextChecks: uniqueItems(nextChecks)
  };
}

export function microLocationPotentialRows(deal: Deal): MicroLocationPotentialRow[] {
  const location = deal.location || {};
  const inputs = evidenceInputsFromLocation(location);
  const evidenceNotes = Array.isArray(location.evidence_notes)
    ? location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const transit = numberValue(location.transit_access_score);
  const dailyNeeds = numberValue(location.daily_needs_score);
  const demandAnchor = numberValue(location.demand_anchor_score);
  const leisure = numberValue(location.leisure_quality_score);
  const shortTerm = numberValue(location.short_term_rental_score);
  const nuisance = numberValue(location.nuisance_resilience_score);
  const completeness = numberValue(location.evidence_data_completeness_percent);
  const confidence = typeof location.evidence_confidence === "string" ? location.evidence_confidence.toLowerCase() : null;
  const transitMeters = locationEvidenceValue(inputs, "nearest_rapid_transit_meters");
  const supermarkets = locationEvidenceValue(inputs, "supermarkets_1000m");
  const pharmacies = locationEvidenceValue(inputs, "pharmacies_1000m");
  const doctors = locationEvidenceValue(inputs, "doctors_1500m");
  const schools = locationEvidenceValue(inputs, "schools_1500m");
  const tradeFairMeters = locationEvidenceValue(inputs, "nearest_trade_fair_meters");
  const recreationMeters =
    locationEvidenceValue(inputs, "nearest_recreation_anchor_meters") ||
    locationEvidenceValue(inputs, "nearest_event_venue_meters");
  const occupancy = locationEvidenceValue(inputs, "short_term_rental_occupancy_percent");
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status") || "unclear";
  const mainRoadMeters = locationEvidenceValue(inputs, "main_road_meters");
  const transitMetersNumber = evidenceNumber(transitMeters ?? "");
  const supermarketCount = evidenceNumber(supermarkets ?? "");
  const pharmacyCount = evidenceNumber(pharmacies ?? "");
  const doctorCount = evidenceNumber(doctors ?? "");
  const schoolCount = evidenceNumber(schools ?? "");
  const tradeFairMetersNumber = evidenceNumber(tradeFairMeters ?? "");
  const recreationMetersNumber = evidenceNumber(recreationMeters ?? "");
  const shortTermLegalCap = microLocationShortTermLegalCap(legalStatus, evidenceNotes);
  const hasTransitBasis = (transit !== null && transit >= 75) || (transitMetersNumber !== null && transitMetersNumber <= 800);
  const hasDailyNeedsBasis =
    (dailyNeeds !== null && dailyNeeds >= 75) ||
    (supermarketCount !== null && supermarketCount >= 2) ||
    (supermarketCount !== null && supermarketCount >= 1 && pharmacyCount !== null && pharmacyCount >= 1) ||
    (doctorCount !== null && doctorCount >= 4) ||
    (schoolCount !== null && schoolCount >= 2);
  const hasDemandAnchor = (demandAnchor !== null && demandAnchor >= 75) || (tradeFairMetersNumber !== null && tradeFairMetersNumber <= 4000);
  const hasLeisureAnchor = (leisure !== null && leisure >= 75) || (recreationMetersNumber !== null && recreationMetersNumber <= 1500);
  const nuisanceRisk =
    (nuisance !== null && nuisance < 60) ||
    (mainRoadMeters !== null && farDistanceTone(mainRoadMeters, 600, 150) === "risk");
  const evidenceWeak = completeness === null || completeness < 75 || confidence === null || confidence === "low";

  return [
    {
      key: "transit",
      label: "Bahnhof/U-Bahn",
      role: hasTransitBasis ? "Basishebel" : "Pruefpunkt",
      signal: transitMeters !== null ? `Bahnhof/U-Bahn ${formatDistanceMeters(transitMeters)}` : `Score ${formatNumber(transit)}`,
      underwritingUse: "Basis-Mietthese und Pendlernachfrage stuetzen; Preisaufschlag erst mit Vergleichsmieten.",
      nextCheck: "Pendelzeit zu Innenstadt, Arbeitsplatzkernen und naechstem Bahnhof gegenpruefen.",
      tone: transitMeters !== null ? closeDistanceTone(transitMeters, 800, 1600) : scoreTone(transit)
    },
    {
      key: "daily_needs",
      label: "Alltag/Nahversorgung",
      role: hasDailyNeedsBasis ? "Basishebel" : "Pruefpunkt",
      signal: microLocationDailyNeedsSignal(supermarkets, pharmacies, doctors, schools, dailyNeeds),
      underwritingUse: "Traegt Alltagsmiete, Wiedervermietung und Leerstandsresilienz; Preisaufschlag trotzdem nur mit Vergleichsmieten.",
      nextCheck: "Supermarkt, Apotheke, Arzt/Schule und echte Alltagswege in 10-15 Minuten pruefen.",
      tone: microLocationDailyNeedsTone(supermarkets, pharmacies, doctors, schools, dailyNeeds)
    },
    {
      key: "demand_anchor",
      label: "Messe/Jobs",
      role: hasDemandAnchor ? "Nachfragehebel" : "Pruefpunkt",
      signal: tradeFairMeters !== null ? `Messe ${formatDistanceMeters(tradeFairMeters)}` : `Score ${formatNumber(demandAnchor)}`,
      underwritingUse: "Messe-, Job-, Uni- oder Kliniknaehe als Nachfragebeleg nutzen, nicht als pauschalen Mietaufschlag.",
      nextCheck: "Konkrete Nachfrageanker, Pendelzeiten und Vergleichsmieten im Umfeld belegen.",
      tone: tradeFairMeters !== null ? closeDistanceTone(tradeFairMeters, 4000, 12000) : scoreTone(demandAnchor)
    },
    {
      key: "leisure",
      label: "Freizeitanker",
      role: hasLeisureAnchor ? "Wohnqualitaetshebel" : "Pruefpunkt",
      signal: recreationMeters !== null ? `Freizeitanker ${formatDistanceMeters(recreationMeters)}` : `Score ${formatNumber(leisure)}`,
      underwritingUse: "Freizeit, Gruen, Gastro oder Kultur stuetzen Vermietbarkeit und Exit, aber nur indirekt ueber Zielgruppe.",
      nextCheck: "Freizeitanker, Gruenflaechen und Aufenthaltsqualitaet vor Ort oder per Karte plausibilisieren.",
      tone: recreationMeters !== null ? closeDistanceTone(recreationMeters, 1500, 7000) : scoreTone(leisure)
    },
    {
      key: "short_term",
      label: "Airbnb/Tourismus",
      role: shortTermLegalCap ? "Zusatzchance" : "Optionaler Upside",
      signal: `${occupancy !== null ? `Airbnb ${formatEvidencePercent(occupancy)}` : `Score ${formatNumber(shortTerm)}`} · Recht ${formatLegalStatus(legalStatus)}`,
      underwritingUse: shortTermLegalCap
        ? "Nur als Upside-Memo, nicht als Basis-Cashflow oder Preisaufschlag."
        : "Als separates Zusatzszenario pruefen; langfristige Vermietung bleibt Basisrechnung.",
      nextCheck: "Zweckentfremdungsrecht, WEG-Regeln, echte Auslastung und Saisonrisiko pruefen.",
      tone: shortTermLegalCap ? "watch" : scoreTone(shortTerm ?? evidenceNumber(occupancy ?? ""))
    },
    {
      key: "nuisance",
      label: "Stoerfaktoren",
      role: nuisanceRisk ? "Risiko/Preisabschlag" : "Kontrollpunkt",
      signal: mainRoadMeters !== null ? `Hauptstrasse ${formatDistanceMeters(mainRoadMeters)}` : `Score ${formatNumber(nuisance)}`,
      underwritingUse: nuisanceRisk
        ? "Laerm und Stoerquellen als Preisabschlag oder Stop-Regel behandeln."
        : "Stoerfaktoren als Kontrollpunkt dokumentieren, bevor Lage-Alpha bezahlt wird.",
      nextCheck: "Laerm, Hauptstrasse und Stoerquellen vor Ort oder mit Karten-/Katasterdaten pruefen.",
      tone: mainRoadMeters !== null ? farDistanceTone(mainRoadMeters, 600, 150) : scoreTone(nuisance)
    },
    {
      key: "evidence",
      label: "Belegqualitaet",
      role: "Belegpflicht",
      signal: `${completeness !== null ? formatEvidencePercent(completeness) : "Fehlt"} · Vertrauen ${evidenceConfidenceLabel(confidence)}`,
      underwritingUse: evidenceWeak
        ? "Keine Lagepraemie freigeben, bis Datenlage und Quellen belastbar sind."
        : "Lageargumente duerfen ins Memo, bleiben aber an echte Belege gebunden.",
      nextCheck: "Quellenstand, Kartendaten, Vor-Ort-Eindruck und Vergleichsmieten gegenpruefen.",
      tone: evidenceWeak ? "watch" : "good"
    }
  ];
}

export function microLocationReadinessBrief(deal: Deal): MicroLocationReadinessBrief {
  const location = deal.location || {};
  const inputs = evidenceInputsFromLocation(location);
  const evidenceNotes = Array.isArray(location.evidence_notes)
    ? location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const transit = numberValue(location.transit_access_score);
  const demandAnchor = numberValue(location.demand_anchor_score);
  const leisure = numberValue(location.leisure_quality_score);
  const shortTerm = numberValue(location.short_term_rental_score);
  const nuisance = numberValue(location.nuisance_resilience_score);
  const completeness = numberValue(location.evidence_data_completeness_percent);
  const confidence = typeof location.evidence_confidence === "string" ? location.evidence_confidence.toLowerCase() : null;
  const transitMeters = locationEvidenceValue(inputs, "nearest_rapid_transit_meters");
  const tradeFairMeters = locationEvidenceValue(inputs, "nearest_trade_fair_meters");
  const recreationMeters =
    locationEvidenceValue(inputs, "nearest_recreation_anchor_meters") ||
    locationEvidenceValue(inputs, "nearest_event_venue_meters");
  const hotels = evidenceNumber(locationEvidenceValue(inputs, "hotels_1500m") ?? "");
  const occupancy = locationEvidenceValue(inputs, "short_term_rental_occupancy_percent");
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status") || "unclear";
  const mainRoadMeters = locationEvidenceValue(inputs, "main_road_meters");
  const transitMetersNumber = evidenceNumber(transitMeters ?? "");
  const tradeFairMetersNumber = evidenceNumber(tradeFairMeters ?? "");
  const recreationMetersNumber = evidenceNumber(recreationMeters ?? "");
  const occupancyNumber = evidenceNumber(occupancy ?? "");
  const mainRoadMetersNumber = evidenceNumber(mainRoadMeters ?? "");
  const hasCoordinates =
    deal.listing?.latitude !== null &&
    deal.listing?.latitude !== undefined &&
    deal.listing?.longitude !== null &&
    deal.listing?.longitude !== undefined;
  const hasTransit = (transit !== null && transit >= 80) || (transitMetersNumber !== null && transitMetersNumber <= 800);
  const hasDemand =
    (demandAnchor !== null && demandAnchor >= 80) ||
    (tradeFairMetersNumber !== null && tradeFairMetersNumber <= 4000) ||
    (hotels !== null && hotels >= 5);
  const hasLeisure = (leisure !== null && leisure >= 75) || (recreationMetersNumber !== null && recreationMetersNumber <= 1500);
  const hasShortTerm = (shortTerm !== null && shortTerm >= 60) || (occupancyNumber !== null && occupancyNumber >= 60);
  const shortTermLegalCap = microLocationShortTermLegalCap(legalStatus, evidenceNotes);
  const nuisanceRisk = (nuisance !== null && nuisance < 60) || (mainRoadMetersNumber !== null && mainRoadMetersNumber <= 150);
  const evidenceReady = hasCoordinates && completeness !== null && completeness >= 75 && confidence !== null && confidence !== "low";
  const transitStatus: MicroLocationReadinessStatus =
    hasTransit ? (evidenceReady ? "price" : "proof") : transit === null && transitMeters === null ? "missing" : "memo";
  const demandStatus: MicroLocationReadinessStatus =
    hasDemand ? (evidenceReady ? "price" : "proof") : demandAnchor === null && tradeFairMeters === null && hotels === null ? "missing" : "memo";

  const rows: MicroLocationReadinessRow[] = [
    {
      key: "transit",
      label: "Bahnhof/U-Bahn",
      status: transitStatus,
      statusLabel: transitStatus === "price" ? "Preisrelevant" : transitStatus === "proof" ? "Belegpflicht" : transitStatus === "missing" ? "Fehlt" : "Memo-Upside",
      tone: transitStatus === "price" ? "good" : transitStatus === "missing" ? "empty" : "watch",
      proof: transitMeters !== null ? formatDistanceMeters(transitMeters) : formatNumber(transit),
      decisionUse: transitStatus === "price"
        ? "Traegt die Basis-Vermietbarkeit; Preisaufschlag nur mit Vergleichsmieten."
        : transitStatus === "proof"
          ? "Keine Lagepraemie im Kaufpreis, bis Datenlage, Quellenvertrauen und Vergleichsmieten belastbar sind."
        : "Noch kein harter OePNV-Hebel fuer den Kaufpreis.",
      nextAction: "Pendelzeiten und Vergleichsmieten fuer die Mikrolage gegenpruefen."
    },
    {
      key: "demand_anchor",
      label: "Messe/Jobs",
      status: demandStatus,
      statusLabel: demandStatus === "price" ? "Preisrelevant" : demandStatus === "proof" ? "Belegpflicht" : demandStatus === "missing" ? "Fehlt" : "Memo-Upside",
      tone: demandStatus === "price" ? "good" : demandStatus === "missing" ? "empty" : "watch",
      proof: tradeFairMeters !== null ? `Messe ${formatDistanceMeters(tradeFairMeters)}` : demandAnchor !== null ? `Score ${formatNumber(demandAnchor)}` : "Fehlt",
      decisionUse: demandStatus === "price"
        ? "Stuetzer fuer Nachfrage, Wiedervermietung und Exit; nur mit echten Mietvergleichen bezahlen."
        : demandStatus === "proof"
          ? "Keine Lagepraemie im Kaufpreis, bis Nachfrageanker, Quellenvertrauen und Vergleichsmieten belegt sind."
        : "Als Nachfrage-Story dokumentieren, bis konkrete Arbeitgeber, Messe, Uni oder Klinik belegt sind.",
      nextAction: "Konkrete Nachfrageanker und Vergleichsmieten im direkten Umfeld belegen."
    },
    {
      key: "leisure",
      label: "Freizeitanker",
      status: hasLeisure ? "memo" : leisure === null && recreationMeters === null ? "missing" : "memo",
      statusLabel: hasLeisure ? "Memo-Upside" : leisure === null && recreationMeters === null ? "Fehlt" : "Memo-Upside",
      tone: hasLeisure ? "watch" : leisure === null && recreationMeters === null ? "empty" : "watch",
      proof: recreationMeters !== null ? `Freizeit ${formatDistanceMeters(recreationMeters)}` : leisure !== null ? `Score ${formatNumber(leisure)}` : "Fehlt",
      decisionUse: "Wohnqualitaet und Zielgruppe stuetzen, aber nicht allein als Kaufpreisaufschlag rechnen.",
      nextAction: "Freizeit, Gruenflaechen und Aufenthaltsqualitaet vor Ort oder per Karte plausibilisieren."
    },
    {
      key: "short_term",
      label: "Airbnb-Auslastung",
      status: hasShortTerm ? "memo" : shortTerm === null && occupancy === null ? "missing" : "memo",
      statusLabel: hasShortTerm ? "Memo-Upside" : shortTerm === null && occupancy === null ? "Fehlt" : "Memo-Upside",
      tone: shortTermLegalCap ? "watch" : scoreTone(shortTerm ?? occupancyNumber),
      proof: `${occupancy !== null ? formatEvidencePercent(occupancy) : formatNumber(shortTerm)} · ${formatLegalStatus(shortTermLegalCap ? "restricted" : legalStatus)}`,
      decisionUse: "Tourismus/Airbnb nur als Zusatzchance, nicht im Basis-Cashflow und nicht im Walk-away-Preis.",
      nextAction: "Airbnb-/Zweckentfremdungsrecht, WEG-Regeln und echte Auslastung pruefen."
    },
    {
      key: "nuisance",
      label: "Stoerfaktoren",
      status: nuisanceRisk ? "brake" : nuisance === null && mainRoadMeters === null ? "missing" : "proof",
      statusLabel: nuisanceRisk ? "Preis-Bremse" : nuisance === null && mainRoadMeters === null ? "Fehlt" : "Kontrolliert",
      tone: nuisanceRisk ? "risk" : nuisance === null && mainRoadMeters === null ? "empty" : "good",
      proof: mainRoadMeters !== null ? `Hauptstrasse ${formatDistanceMeters(mainRoadMeters)}` : nuisance !== null ? `Score ${formatNumber(nuisance)}` : "Fehlt",
      decisionUse: nuisanceRisk
        ? "Laerm, Hauptstrasse oder Stoerquellen als Preisabschlag oder Stop-Regel behandeln."
        : "Stoerfaktoren dokumentieren, bevor Lage-Alpha bezahlt wird.",
      nextAction: "Laerm, Hauptstrasse und Stoerquellen vor Ort pruefen, bevor Lage-Alpha bezahlt wird."
    },
    {
      key: "evidence",
      label: "Belegqualitaet",
      status: evidenceReady ? "proof" : "missing",
      statusLabel: evidenceReady ? "Belegt" : "Nachbelegen",
      tone: evidenceReady ? "good" : "watch",
      proof: `${completeness !== null ? formatEvidencePercent(completeness) : "Fehlt"} · ${evidenceConfidenceLabel(confidence)}`,
      decisionUse: evidenceReady
        ? "Quellenlage reicht fuer Memo und Komitee-Pruefung, bleibt aber belegpflichtig."
        : "Keine Lagepraemie freigeben, solange Koordinaten, Datenlage oder Quellenvertrauen fehlen.",
      nextAction: "Quellenstand, Kartendaten, Vor-Ort-Eindruck und Vergleichsmieten gegenpruefen."
    }
  ];

  const priceCount = rows.filter((row) => row.status === "price").length;
  const memoCount = rows.filter((row) => row.status === "memo").length;
  const brakeCount = rows.filter((row) => row.status === "brake").length;
  const missingCount = rows.filter((row) => row.status === "missing").length;
  const priceLabels = rows.filter((row) => row.status === "price").map((row) => row.label);
  const proofGatedLabels = rows.filter((row) => row.status === "proof" && row.tone === "watch").map((row) => row.label);

  return {
    headline: `Mikrolage-Faktorcheck: ${priceCount} kaufpreisrelevante Hebel`,
    tone: brakeCount > 0 ? "watch" : missingCount > 0 ? "watch" : priceCount > 0 ? "good" : "empty",
    summary: microLocationReadinessSummary(priceLabels, proofGatedLabels, memoCount, brakeCount, missingCount),
    facts: [
      { label: "Kaufpreishebel", value: String(priceCount), tone: priceCount > 0 ? "good" : "empty" },
      { label: "Memo-Upside", value: String(memoCount), tone: memoCount > 0 ? "watch" : "empty" },
      { label: "Preis-Bremsen", value: String(brakeCount), tone: brakeCount > 0 ? "risk" : "good" }
    ],
    rows,
    nextActions: uniqueItems(
      rows
        .filter((row) => row.status === "brake" || row.status === "missing" || (row.status === "proof" && row.tone === "watch") || row.key === "short_term")
        .map((row) => row.nextAction)
    )
  };
}

export function dealMicroLocationAlphaBrief(deal: Deal): DealMicroLocationAlphaBrief {
  const location = deal.location || {};
  const inputs = evidenceInputsFromLocation(location);
  const evidenceNotes = Array.isArray(location.evidence_notes)
    ? location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const score = numberValue(location.micro_location_score);
  const transit = numberValue(location.transit_access_score);
  const dailyNeeds = numberValue(location.daily_needs_score);
  const demandAnchor = numberValue(location.demand_anchor_score);
  const leisure = numberValue(location.leisure_quality_score);
  const shortTerm = numberValue(location.short_term_rental_score);
  const nuisance = numberValue(location.nuisance_resilience_score);
  const completeness = numberValue(location.evidence_data_completeness_percent);
  const confidence = typeof location.evidence_confidence === "string" ? location.evidence_confidence.toLowerCase() : null;
  const transitMeters = locationEvidenceValue(inputs, "nearest_rapid_transit_meters");
  const tradeFairMeters = locationEvidenceValue(inputs, "nearest_trade_fair_meters");
  const recreationMeters = locationEvidenceValue(inputs, "nearest_recreation_anchor_meters");
  const hotels = evidenceNumber(locationEvidenceValue(inputs, "hotels_1500m") ?? "");
  const occupancy = locationEvidenceValue(inputs, "short_term_rental_occupancy_percent");
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status") || "unclear";
  const mainRoadMeters = locationEvidenceValue(inputs, "main_road_meters");
  const hasCoordinates =
    deal.listing?.latitude !== null &&
    deal.listing?.latitude !== undefined &&
    deal.listing?.longitude !== null &&
    deal.listing?.longitude !== undefined;
  const transitMetersNumber = evidenceNumber(transitMeters ?? "");
  const tradeFairMetersNumber = evidenceNumber(tradeFairMeters ?? "");
  const recreationMetersNumber = evidenceNumber(recreationMeters ?? "");
  const mainRoadMetersNumber = evidenceNumber(mainRoadMeters ?? "");
  const occupancyNumber = evidenceNumber(occupancy ?? "");
  const hasStrongTransit = (transit !== null && transit >= 80) || (transitMetersNumber !== null && transitMetersNumber <= 800);
  const hasStrongDemand =
    (demandAnchor !== null && demandAnchor >= 80) ||
    (tradeFairMetersNumber !== null && tradeFairMetersNumber <= 4000) ||
    (hotels !== null && hotels >= 5);
  const hasStrongLeisure =
    (leisure !== null && leisure >= 75) ||
    (recreationMetersNumber !== null && recreationMetersNumber <= 1500);
  const hasDailyNeeds = dailyNeeds !== null && dailyNeeds >= 75;
  const hasCoreAlpha = hasStrongTransit && (hasDailyNeeds || hasStrongDemand || hasStrongLeisure);
  const hasShortTermOpportunity =
    (shortTerm !== null && shortTerm >= 65) ||
    (occupancyNumber !== null && occupancyNumber >= 60) ||
    legalStatus !== "unclear";
  const shortTermLegalCap = microLocationShortTermLegalCap(legalStatus, evidenceNotes);
  const nuisanceRisk = (nuisance !== null && nuisance < 60) || (mainRoadMetersNumber !== null && mainRoadMetersNumber <= 150);
  const evidenceWeak = !hasCoordinates || completeness === null || completeness < 75 || confidence === null || confidence === "low";
  const status = microLocationAlphaStatus({
    evidenceWeak,
    hasCoreAlpha,
    nuisanceRisk,
    score,
    shortTermLegalCap
  });
  const tone = microLocationAlphaTone(status);

  return {
    status,
    headline: microLocationAlphaHeadline(status, score),
    tone,
    rentThesis: microLocationAlphaRentThesis({
      hasStrongDemand,
      hasStrongLeisure,
      hasStrongTransit,
      hasShortTermOpportunity
    }),
    priceRule: microLocationAlphaPriceRule(status),
    facts: [
      {
        label: "Bahnhof/U-Bahn",
        value: transitMeters !== null ? formatDistanceMeters(transitMeters) : formatNumber(transit),
        tone: transitMeters !== null ? closeDistanceTone(transitMeters, 800, 1600) : scoreTone(transit)
      },
      {
        label: "Messe/Freizeit",
        value: microLocationAlphaDemandValue(tradeFairMeters, recreationMeters, demandAnchor, leisure),
        tone: combinedLocationTone([
          tradeFairMeters !== null ? closeDistanceTone(tradeFairMeters, 4000, 12000) : scoreTone(demandAnchor),
          recreationMeters !== null ? closeDistanceTone(recreationMeters, 1500, 7000) : scoreTone(leisure)
        ])
      },
      {
        label: "Airbnb/Tourismus",
        value: `${occupancy !== null ? formatEvidencePercent(occupancy) : formatNumber(shortTerm)} · ${formatLegalStatus(legalStatus)}`,
        tone: shortTermLegalCap ? "watch" : scoreTone(shortTerm ?? occupancyNumber)
      },
      {
        label: "Stoerfaktoren",
        value: mainRoadMeters !== null ? `Hauptstrasse ${formatDistanceMeters(mainRoadMeters)}` : formatNumber(nuisance),
        tone: mainRoadMeters !== null ? farDistanceTone(mainRoadMeters, 600, 150) : scoreTone(nuisance)
      },
      {
        label: "Belege",
        value: `${completeness !== null ? formatEvidencePercent(completeness) : "Fehlt"} · ${evidenceConfidenceLabel(confidence)}`,
        tone: evidenceWeak ? "watch" : "good"
      }
    ],
    memoItems: microLocationAlphaMemoItems({
      hasCoreAlpha,
      hasDemandHotelCluster: hasStrongDemand && hotels !== null && hotels > 0,
      hasShortTermOpportunity
    }),
    risks: microLocationAlphaRisks({ evidenceWeak, nuisanceRisk, shortTermLegalCap }),
    nextActions: microLocationAlphaNextActions({
      evidenceWeak,
      hasStrongTransit,
      nuisanceRisk,
      shortTermLegalCap,
      hasShortTermOpportunity
    })
  };
}

export function dealMicroLocationPriceGateBrief(deal: Deal): DealMicroLocationPriceGateBrief {
  const alpha = dealMicroLocationAlphaBrief(deal);
  const askingPrice = numberValue(deal.listing?.purchase_price);
  const status = microLocationPriceGateStatus(alpha.status, askingPrice);
  const premiumPercent = status === "committee" ? 1.5 : status === "missing" ? null : 0;
  const premiumBudgetEur =
    status === "committee" && askingPrice !== null ? roundDownTo500(askingPrice * 0.015) : status === "missing" ? null : 0;
  const tone = microLocationPriceGateTone(status);

  return {
    status,
    headline: microLocationPriceGateHeadline(status),
    tone,
    premiumBudgetEur,
    premiumPercent,
    priceRule: microLocationPriceGateRule(status),
    facts: [
      {
        label: "Preisfreigabe",
        value: formatCurrencyCode(premiumBudgetEur),
        tone: status === "committee" ? "good" : status === "blocked" ? "risk" : status === "missing" ? "empty" : "watch"
      },
      {
        label: "Max. Aufschlag",
        value: premiumPercent === null ? "Fehlt" : formatPercent(premiumPercent),
        tone: status === "committee" ? "good" : status === "blocked" ? "risk" : status === "missing" ? "empty" : "watch"
      },
      {
        label: "Lage-Status",
        value: microLocationPriceGateStatusLabel(status),
        tone
      }
    ],
    guardrails: microLocationPriceGateGuardrails(status),
    nextActions: microLocationPriceGateNextActions(status, alpha)
  };
}

export function dealMicroLocationTargetGroupBrief(deal: Deal): DealMicroLocationTargetGroupBrief {
  const profiles = microLocationProfileRows(deal.region_outlook);
  const location = deal.location || {};
  const inputs = evidenceInputsFromLocation(location);
  const evidenceNotes = Array.isArray(location.evidence_notes)
    ? location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status") || "unclear";
  const shortTermLegalCap = microLocationShortTermLegalCap(legalStatus, evidenceNotes);
  const transit = numberValue(location.transit_access_score);
  const transitMeters = locationEvidenceValue(inputs, "nearest_rapid_transit_meters");
  const mainRoadMeters = locationEvidenceValue(inputs, "main_road_meters");
  const nuisance = numberValue(location.nuisance_resilience_score);
  const nuisanceRisk =
    (nuisance !== null && nuisance < 60) ||
    (mainRoadMeters !== null && farDistanceTone(mainRoadMeters, 600, 150) === "risk");

  if (profiles.length === 0) {
    return {
      status: "missing",
      headline: "Zielgruppen-These fehlt",
      tone: "empty",
      summary: "Noch keine Zielgruppenprofile fuer Pendler, Familien, Studierende oder Kurzzeitgaeste vorhanden.",
      baseCase: "Basisrechnung erst freigeben, wenn eine langfristige Zielgruppe mit OePNV, Alltag und Vergleichsmieten belegt ist.",
      memoRule: "Airbnb/Kurzzeitgaeste nur Memo-Upside, bis Rechtslage, WEG und Auslastung belegt sind.",
      facts: [
        { label: "Basis-Zielgruppe", value: "Fehlt", tone: "empty" },
        { label: "Memo-Upside", value: "Fehlt", tone: "empty" },
        { label: "Preisregel", value: "Keine Lagepraemie", tone: "watch" }
      ],
      rows: [],
      nextActions: ["Zielgruppenprofile aus Mikrolage, OePNV, Alltag, Nachfrageankern und Vergleichsmieten nachtragen."]
    };
  }

  const rows = profiles
    .map((profile) =>
      microLocationTargetGroupRow(profile, {
        nuisanceRisk,
        shortTermLegalCap,
        transit,
        transitMeters
      })
    )
    .sort((a, b) => microLocationTargetGroupRoleRank(a.role) - microLocationTargetGroupRoleRank(b.role) || b.score - a.score);
  const baseRows = rows.filter((row) => row.role === "Basisnachfrage");
  const memoRows = rows.filter((row) => row.role === "Memo-Upside");
  const riskRows = rows.filter((row) => row.role === "Risiko");
  const primaryBase = baseRows[0] || null;
  const primaryMemo = memoRows[0] || null;
  const status: DealMicroLocationTargetGroupStatus = primaryBase ? "base" : riskRows.length ? "risk" : memoRows.length ? "memo" : "missing";
  const tone: ReturnType<typeof scoreTone> = status === "base" ? (nuisanceRisk ? "watch" : "good") : status === "risk" ? "risk" : status === "memo" ? "watch" : "empty";

  return {
    status,
    headline: microLocationTargetGroupHeadline(status, primaryBase?.label || null),
    tone,
    summary: microLocationTargetGroupSummary(baseRows, memoRows, riskRows, nuisanceRisk),
    baseCase: microLocationTargetGroupBaseCase(primaryBase, transit, transitMeters),
    memoRule: "Airbnb/Kurzzeitgaeste nur Memo-Upside: nicht Basis-Cashflow, nicht Walk-away-Preis, erst nach Zweckentfremdungsrecht, WEG-Regeln und Auslastung.",
    facts: [
      {
        label: "Basis-Zielgruppe",
        value: primaryBase?.label || "Fehlt",
        tone: primaryBase ? "good" : "empty"
      },
      {
        label: "Memo-Upside",
        value: primaryMemo?.label || "Fehlt",
        tone: primaryMemo ? "watch" : "empty"
      },
      {
        label: "Preisregel",
        value: primaryMemo ? "Airbnb nicht im Kaufpreis" : primaryBase ? "Nur mit Vergleichsmieten" : "Keine Lagepraemie",
        tone: primaryMemo ? "watch" : primaryBase ? "good" : "watch"
      }
    ],
    rows,
    nextActions: microLocationTargetGroupNextActions(rows, nuisanceRisk)
  };
}

export type DealDecisionBrief = {
  decision: "buy" | "negotiate" | "watch" | "reject";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  strengths: string[];
  reasons: string[];
  nextActions: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type DealStrategyBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  targetGroup: string;
  basePlan: string;
  rentPlan: string;
  offerRule: string;
  warnings: string[];
  nextActions: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type ObjectDevelopmentScenario = {
  key: "rent" | "capex_energy" | "weg_layout" | "refi" | "location_use";
  label: string;
  effect: string;
  valueImpact: string;
  risk: string;
  nextCheck: string;
  tone: ReturnType<typeof scoreTone>;
};

export type ObjectDevelopmentPrioritizedLever = {
  rank: number;
  key: ObjectDevelopmentScenario["key"];
  label: string;
  where: string;
  scoreLabel: string;
  estimatedValueEur: number | null;
  reason: string;
  risk: string;
  nextCheck: string;
  tone: ReturnType<typeof scoreTone>;
};

export type ObjectDevelopmentExecutionStep = {
  phase: string;
  title: string;
  budget: string;
  proof: string;
  stopper: string;
  priceRule: string;
  tone: ReturnType<typeof scoreTone>;
};

export type ObjectDevelopmentProofGateStatus = "verified" | "review" | "missing";

export type ObjectDevelopmentProofGate = {
  key: ObjectDevelopmentScenario["key"];
  label: string;
  status: ObjectDevelopmentProofGateStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  priceRule: string;
  provenBy: string[];
  missingProofs: string[];
  nextAction: string;
};

export type ObjectDevelopmentValueLaneStatus = "priceable" | "memo" | "blocked";

export type ObjectDevelopmentValueLane = {
  key: ObjectDevelopmentScenario["key"];
  label: string;
  status: ObjectDevelopmentValueLaneStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  estimatedValueEur: number | null;
  priceableValueEur: number;
  memoOnlyValueEur: number;
  blockedValueEur: number;
  rule: string;
  nextAction: string;
};

export type ObjectDevelopmentValueDecision = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  priceableValueEur: number;
  memoOnlyValueEur: number;
  blockedValueEur: number;
  nextAction: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  lanes: ObjectDevelopmentValueLane[];
};

export type ObjectDevelopmentCommand = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  focusLever: string;
  objectArea: string;
  priceUse: string;
  openIssue: string;
  nextAction: string;
  summary: string;
};

export type ObjectDevelopmentPotentialAssumptions = {
  targetRentMonthly?: number | null;
  capex?: number | null;
  refiLtvPercent?: number | null;
  valueYieldPercent?: number | null;
};

export type ObjectDevelopmentAssumptionDefaults = {
  targetRentMonthly: number | null;
  capex: number | null;
  refiLtvPercent: number;
  valueYieldPercent: number;
};

export type ObjectDevelopmentPotentialBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  levers: string[];
  blockers: string[];
  nextActions: string[];
  scenarios: ObjectDevelopmentScenario[];
  prioritizedLevers: ObjectDevelopmentPrioritizedLever[];
  executionPlan: ObjectDevelopmentExecutionStep[];
  proofGates: ObjectDevelopmentProofGate[];
  valueDecision: ObjectDevelopmentValueDecision;
  developmentCommand: ObjectDevelopmentCommand;
};

export type DealDevelopmentPotentialMapStatus = "priceable" | "memo" | "blocked" | "missing";

export type DealDevelopmentPotentialMapLane = {
  rank: number;
  key: ObjectDevelopmentScenario["key"];
  label: string;
  where: string;
  estimatedValue: string;
  proofStatus: string;
  signal: string;
  risk: string;
  nextCheck: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealDevelopmentPotentialQuickTake = {
  headline: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  primaryLever: string;
  objectArea: string;
  estimatedValue: string;
  priceRule: string;
  nextAction: string;
  reasoning: string[];
};

export type DealDevelopmentPotentialPriceBucket = {
  key: ObjectDevelopmentValueLaneStatus;
  label: string;
  value: string;
  tone: ReturnType<typeof scoreTone>;
  rule: string;
  nextAction: string;
};

export type DealDevelopmentEvidencePackStatus = "ready" | "review" | "blocked";

export type DealDevelopmentEvidencePackRowStatus = "verified" | "review" | "blocked";

export type DealDevelopmentEvidencePackRow = {
  key: "rent_market_comps" | "object_documents" | "capex_refi" | "location_use";
  label: string;
  status: DealDevelopmentEvidencePackRowStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  evidence: string[];
  gaps: string[];
  rule: string;
  nextAction: string;
};

export type DealDevelopmentEvidencePackBrief = {
  status: DealDevelopmentEvidencePackStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: DealDevelopmentEvidencePackRow[];
  guardrails: string[];
  nextActions: string[];
};

export type DealDevelopmentPotentialMapBrief = {
  status: DealDevelopmentPotentialMapStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  quickTake: DealDevelopmentPotentialQuickTake;
  lanes: DealDevelopmentPotentialMapLane[];
  priceBuckets: DealDevelopmentPotentialPriceBucket[];
  stopRules: string[];
  nextActions: string[];
};

export type DevelopmentCaseHandoffBrief = {
  caseId: number;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  guardrail: string;
  requiredProofs: string[];
};

export type DealEvidenceQualityStatus = "verified" | "review" | "missing";

export type DealEvidenceQualityRow = {
  key: string;
  label: string;
  status: DealEvidenceQualityStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  action: string | null;
};

export type DealEvidenceQualityBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  percent: number;
  summary: string;
  rows: DealEvidenceQualityRow[];
  verifiedEvidence: string[];
  openEvidence: string[];
  nextActions: string[];
};

export type DealAssumptionAuditStatus = "verified" | "review" | "missing";

export type DealAssumptionAuditRow = {
  key: string;
  label: string;
  category: string;
  currentValue: string;
  status: DealAssumptionAuditStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  priceImpact: "Preisrelevant" | "Memo/Steuer";
  action: string;
};

export type DealAssumptionAuditBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  score: number;
  verifiedCount: number;
  total: number;
  blockerCount: number;
  summary: string;
  rows: DealAssumptionAuditRow[];
  priceCriticalOpen: string[];
  nextActions: string[];
};

export type DealExitLiquidityBuyerStatus = "strong" | "selective" | "blocked";

export type DealExitLiquidityBuyerLane = {
  label: string;
  status: DealExitLiquidityBuyerStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  reason: string;
  nextCheck: string;
};

export type DealExitLiquidityBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  score: number;
  liquidityLabel: string;
  summary: string;
  estimatedExitDiscountPercent: number;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  buyerLanes: DealExitLiquidityBuyerLane[];
  risks: string[];
  nextActions: string[];
};

export type DealPricingBrief = {
  status: "gap" | "buffer" | "missing";
  label: string;
  value: string;
  anchor: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  gapEur: number | null;
  anchorValue: number | null;
};

export type DealMarketComparisonStatus = "underpriced" | "fair" | "overpriced" | "missing";

export type DealMarketComparisonRow = {
  label: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  value: string;
  benchmark: string;
  interpretation: string;
  action: string;
};

export type DealMarketComparisonBrief = {
  status: DealMarketComparisonStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  askingPricePerSqm: number | null;
  marketPricePerSqm: number | null;
  marketGapPercent: number | null;
  marketGapEur: number | null;
  marketValueEstimateEur: number | null;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: DealMarketComparisonRow[];
  guardrails: string[];
  nextActions: string[];
};

export type DealComparableEvidenceStatus = "verified" | "proxy_only" | "missing";

export type DealComparableEvidenceRowStatus = "verified" | "proxy" | "missing";

export type DealComparableEvidenceRow = {
  key: "asking_price" | "market_price_anchor" | "rent_anchor" | "market_momentum" | "external_comps";
  label: string;
  source: string;
  value: string;
  status: DealComparableEvidenceRowStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  rule: string;
  nextAction: string;
};

export type DealComparableEvidenceBrief = {
  status: DealComparableEvidenceStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: DealComparableEvidenceRow[];
  guardrails: string[];
  nextActions: string[];
};

export type DealOfferBandBrief = {
  status: "price_gap" | "within_band" | "missing";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  askingPrice: number | null;
  startOfferPrice: number | null;
  targetOfferPrice: number | null;
  walkAwayPrice: number | null;
  gapToAskEur: number | null;
  developmentCreditEur: number;
  reasons: string[];
  warnings: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type DealLocationOfferDisciplineStatus = "committee" | "memo_only" | "blocked" | "missing";

export type DealLocationOfferDisciplineBrief = {
  status: DealLocationOfferDisciplineStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  baseWalkAwayPrice: number | null;
  locationCreditEur: number;
  guardedWalkAwayPrice: number | null;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  guardrails: string[];
  nextActions: string[];
};

export type DealRiskAdjustedOfferStatus = "ready" | "guarded" | "blocked" | "no_anchor";

export type DealRiskAdjustedOfferDriver = {
  label: string;
  reservePercent: number;
  reserveEur: number;
  tone: ReturnType<typeof scoreTone>;
  reason: string;
  action: string;
};

export type DealRiskAdjustedOfferBrief = {
  status: DealRiskAdjustedOfferStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  baseWalkAwayPrice: number | null;
  reservePercent: number;
  requiredReserveEur: number;
  riskAdjustedCeilingPrice: number | null;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  drivers: DealRiskAdjustedOfferDriver[];
  guardrails: string[];
  nextActions: string[];
};

export type DealBidStackStatus = "ready" | "blocked" | "missing";

export type DealBidStackRow = {
  label: string;
  value: string;
  detail: string;
  role: "input" | "anchor" | "adjustment" | "output";
  tone: ReturnType<typeof scoreTone>;
};

export type DealBidStackBrief = {
  status: DealBidStackStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  finalCeilingPrice: number | null;
  negotiationRange: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  rows: DealBidStackRow[];
  guardrails: string[];
};

export type DealScenarioStressStatus = "resilient" | "watch" | "breaks" | "missing";

export type DealStressScenarioStatus = "survives" | "watch" | "breaks" | "missing";

export type DealStressScenario = {
  key: "base" | "interest" | "rent" | "capex" | "exit";
  label: string;
  status: DealStressScenarioStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  cashflowBeforeTax: number | null;
  dscr: number | null;
  liquidityImpactEur: number | null;
  exitEquityBufferEur: number | null;
  detail: string;
  action: string;
};

export type DealScenarioStressBrief = {
  status: DealScenarioStressStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  worstCashflowBeforeTax: number | null;
  weakestDscr: number | null;
  hardBreakCount: number;
  minExitBufferEur: number | null;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  scenarios: DealStressScenario[];
  guardrails: string[];
  nextActions: string[];
};

export type DealRepairPlanStatus = "ready" | "monitor" | "needs_repair" | "missing";

export type DealRepairLeverStatus = "must_fix" | "watch" | "optional" | "missing";

export type DealRepairLever = {
  label: string;
  amount: string;
  status: DealRepairLeverStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  detail: string;
  memoLine: string;
};

export type DealRepairPlanBrief = {
  status: DealRepairPlanStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  cashflowGapMonthly: number | null;
  purchasePriceRepairEur: number | null;
  rentRepairMonthly: number | null;
  equityRepairEur: number | null;
  rateRepairPercentPoints: number | null;
  capexReserveEur: number | null;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  levers: DealRepairLever[];
  stopRules: string[];
  nextActions: string[];
};

export type DealNegotiationCommandStatus = "sendable" | "indicative" | "blocked" | "missing";

export type DealNegotiationCommandAsk = {
  label: string;
  value: string;
  reason: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealNegotiationCommandBrief = {
  status: DealNegotiationCommandStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  internalLine: string;
  sellerLine: string;
  copyText: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  asks: DealNegotiationCommandAsk[];
  stopRules: string[];
  nextActions: string[];
};

export type DealLoiConditionsStatus = "sendable" | "conditional" | "blocked" | "missing";

export type DealLoiConditionItem = {
  label: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  clause: string;
  proof: string;
  owner: string;
};

export type DealLoiConditionsBrief = {
  status: DealLoiConditionsStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  loiMode: string;
  copyText: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  conditions: DealLoiConditionItem[];
  killClauses: string[];
  nextActions: string[];
};

export type DealOfferDecisionBrief = {
  status: "ready" | "indicative" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  offerMode: string;
  sellerLine: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  conditions: string[];
  nextActions: string[];
};

export type DealOfferReleasePackageBrief = {
  status: "ready" | "conditional" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  releaseLabel: string;
  sellerMessage: string;
  internalGuardrails: string[];
  externalConditions: string[];
  nextActions: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type DealBrokerPriceCommunicationStatus = "sendable" | "guarded" | "blocked" | "missing";

export type DealBrokerPriceCommunicationBrief = {
  status: DealBrokerPriceCommunicationStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  externalLine: string;
  copyText: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  internalGuardrails: string[];
  externalConditions: string[];
  nextActions: string[];
};

export type DealDevelopmentPricingDisciplineBrief = {
  status: "priced" | "conditional" | "quarantined";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  priceRule: string;
  allowedCreditEur: number;
  visibleValueUpliftEur: number | null;
  equityReleaseEur: number | null;
  blockers: string[];
  memoItems: string[];
  nextActions: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type DealAcquisitionThesisStatus = "actionable" | "conditional" | "blocked";

export type DealAcquisitionThesisLane = {
  label: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  rule: string;
  nextAction: string;
};

export type DealAcquisitionThesisBrief = {
  status: DealAcquisitionThesisStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  thesisLabel: string;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  lanes: DealAcquisitionThesisLane[];
  guardrails: string[];
  nextActions: string[];
};

export type AcquisitionReadinessGateStatus = "pass" | "review" | "block";

export type AcquisitionReadinessGate = {
  key: string;
  label: string;
  status: AcquisitionReadinessGateStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  actions: string[];
};

export type AcquisitionReadinessSummary = {
  status: "ready" | "needs_review" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  readyCount: number;
  total: number;
  gates: AcquisitionReadinessGate[];
  nextActions: string[];
};

export type DealClosingCommandStatus = "ready" | "conditional" | "blocked";

export type DealClosingCommandLane = {
  key: "offer" | "bank" | "notary";
  label: string;
  owner: string;
  status: DealClosingCommandStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  proof: string;
  action: string;
  blockers: string[];
  href: string;
};

export type DealClosingCommandBrief = {
  status: DealClosingCommandStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  primaryAction: string;
  stopRule: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  lanes: DealClosingCommandLane[];
  nextActions: string[];
};

export type DealActionPlanStep = {
  priority: number;
  label: string;
  detail: string;
  reason: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealActionPlanBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  primaryAction: string;
  summary: string;
  stopRule: string;
  steps: DealActionPlanStep[];
};

export type DealUnlockPlanStatus = "ready" | "repair" | "blocked" | "missing";

export type DealUnlockLeverKey = "price_financing" | "rent_proof" | "evidence_readiness";

export type DealUnlockLever = {
  key: DealUnlockLeverKey;
  label: string;
  statusLabel: string;
  impact: string;
  proof: string;
  action: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

export type DealUnlockPlanBrief = {
  status: DealUnlockPlanStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  targetState: string;
  stopRule: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  levers: DealUnlockLever[];
  nextActions: string[];
};

export type DealExecutionSprintStatus = "ready" | "review" | "blocked";

export type DealExecutionSprintTask = {
  category: string;
  label: string;
  priorityLabel: string;
  tone: ReturnType<typeof scoreTone>;
  owner: string;
  due: string;
  why: string;
  proof: string;
  targetHref: string;
  targetLabel: string;
};

export type DealExecutionSprintMilestoneKey = "pre_bid" | "pre_release" | "pre_notary" | "memo";

export type DealExecutionSprintMilestone = {
  key: DealExecutionSprintMilestoneKey;
  label: string;
  count: number;
  taskLabels: string[];
  ownerLine: string;
  unlock: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealExecutionSprintBrief = {
  status: DealExecutionSprintStatus;
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  primaryTask: string;
  stopRule: string;
  copyPrompt: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  milestones: DealExecutionSprintMilestone[];
  tasks: DealExecutionSprintTask[];
};

export type DealSiteVisitCheck = {
  key: string;
  question: string;
  priorityLabel: string;
  tone: ReturnType<typeof scoreTone>;
  owner: string;
  proof: string;
  decisionUse: string;
  priceRelevant: boolean;
};

export type DealSiteVisitSection = {
  key: string;
  label: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  checks: DealSiteVisitCheck[];
};

export type DealSiteVisitBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  stopRule: string;
  copyPrompt: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  sections: DealSiteVisitSection[];
};

export type PortfolioCommandLane = {
  label: string;
  count: number;
  detail: string;
  tone: ReturnType<typeof scoreTone>;
};

export type PortfolioCommandBrief = {
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  summary: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  lanes: PortfolioCommandLane[];
  weeklyFocus: string[];
  capitalWarnings: string[];
};

export type VvGmbhBuyBoxStatus = "fit" | "warning" | "missing";

export type VvGmbhBuyBoxLane = {
  label: string;
  statusLabel: string;
  summary: string;
  rule: string;
  nextAction: string;
  tone: ReturnType<typeof scoreTone>;
};

export type VvGmbhBuyBoxBrief = {
  status: VvGmbhBuyBoxStatus;
  headline: string;
  summary: string;
  stanceLabel: string;
  tone: ReturnType<typeof scoreTone>;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  lanes: VvGmbhBuyBoxLane[];
  guardrails: string[];
  nextActions: string[];
};

export type AssetManagementItemStatus = "stable" | "watch" | "alarm";

export type AssetManagementItem = {
  dealId: number;
  title: string;
  city: string;
  status: AssetManagementItemStatus;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  cashflow: string;
  stressCashflow: string;
  dscr: string;
  wegScore: string;
  blocker: string;
  proof: string;
  nextAction: string;
  href: string;
  rankScore: number;
};

export type AssetManagementBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  statusLabel: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  items: AssetManagementItem[];
};

export type AcquisitionDecisionLeverage = {
  key: "price_financing" | "location_development" | "data_evidence" | "bank_readiness" | "listing_flow";
  label: string;
  value: string;
  detail: string;
  action: string;
  owner: string;
  href: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

export type AcquisitionDecisionLeverageBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  levers: AcquisitionDecisionLeverage[];
};

export type AcquisitionWorkOrderKind = "deal" | "listing";

export type AcquisitionWorkOrder = {
  id: string;
  kind: AcquisitionWorkOrderKind;
  label: string;
  owner: string;
  title: string;
  subtitle: string;
  blocker: string;
  proof: string;
  nextAction: string;
  href: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

export type AcquisitionWorkOrderBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  orders: AcquisitionWorkOrder[];
};

export type DataSourceHealthWorkOrder = {
  sourceName: string;
  label: string;
  detail: string;
  action: string;
  owner: string;
  tone: ReturnType<typeof scoreTone>;
  rankScore: number;
};

export type DataSourcesHealthBrief = {
  headline: string;
  summary: string;
  tone: ReturnType<typeof scoreTone>;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  workOrders: DataSourceHealthWorkOrder[];
};

export type DealInvestmentCommitteeItem = {
  label: string;
  summary: string;
  action: string;
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealInvestmentCommitteeBrief = {
  status: "ready" | "conditional" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  decisionLabel: string;
  stopRule: string;
  blockers: DealInvestmentCommitteeItem[];
  reviewItems: DealInvestmentCommitteeItem[];
  memoItems: string[];
  nextQuestions: string[];
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
};

export type DealMemoCockpitBrief = {
  status: DealInvestmentCommitteeBrief["status"];
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  oneLineDecision: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  decisionMemo: string[];
  bankQuestions: string[];
  handoffChecklist: string[];
};

export type DealDossierCockpitPackageKey = "seller" | "committee" | "bank" | "notary";

export type DealDossierCockpitPackage = {
  key: DealDossierCockpitPackageKey;
  label: string;
  statusLabel: string;
  owner: string;
  handoff: string;
  nextAction: string;
  proof: string;
  blockers: string[];
  tone: ReturnType<typeof scoreTone>;
};

export type DealDossierDevelopmentSnapshot = {
  label: string;
  statusLabel: string;
  where: string;
  value: string;
  rule: string;
  proof: string;
  nextAction: string;
  tone: ReturnType<typeof scoreTone>;
};

export type DealDossierCockpitBrief = {
  status: "ready" | "conditional" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  decisionLabel: string;
  summary: string;
  stopRule: string;
  copyChecklist: string[];
  development: DealDossierDevelopmentSnapshot;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  packages: DealDossierCockpitPackage[];
};

export type BankPackageCreditBrief = {
  status: "bankable" | "conditional" | "blocked";
  headline: string;
  tone: ReturnType<typeof scoreTone>;
  oneLineDecision: string;
  facts: Array<{
    label: string;
    value: string;
    tone: ReturnType<typeof scoreTone>;
  }>;
  covenantChecks: string[];
  creditStory: string[];
  conditions: string[];
  lenderRequest: BankPackageLenderRequest;
};

export type BankPackageLenderRequest = {
  headline: string;
  copySubject: string;
  copyIntro: string;
  copyText: string;
  nextAction: string;
  requestedLoan: string;
  suggestedEquity: string;
  statusLabel: string;
  missingDocumentsLabel: string;
};

export function dealDecisionBrief(deal: Deal): DealDecisionBrief {
  const score = numberValue(deal.latest_score?.total_score);
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const stressedCashflow = numberValue(deal.latest_underwriting?.stressed_monthly_cashflow_before_tax);
  const stressedDscr = numberValue(deal.latest_underwriting?.stressed_dscr);
  const neutralPurchasePrice = numberValue(deal.latest_underwriting?.max_purchase_price_for_neutral_cashflow);
  const locationScore = numberValue(deal.location?.micro_location_score) ?? numberValue(deal.region_outlook?.total_score);
  const redFlags = deal.latest_score?.red_flags || [];
  const residualRating = deal.latest_underwriting?.residual_debt_factor_rating || null;
  const hasUnderwriting = Boolean(deal.latest_underwriting);
  const hasScore = Boolean(deal.latest_score);

  const hardRedFlag = redFlags.some((flag) => {
    const normalized = flag.toLowerCase();
    return (
      normalized.includes("negative_cashflow") ||
      normalized.includes("dscr") ||
      normalized.includes("debt") ||
      normalized.includes("financing")
    );
  });
  const cashflowWeak = cashflow !== null && cashflow < 0;
  const dscrWeak = dscr !== null && dscr < 1.1;
  const stressedWeak =
    (stressedCashflow !== null && stressedCashflow < 0) || (stressedDscr !== null && stressedDscr < 1.05);
  const scoreWeak = score !== null && score < 60;
  const strongLocation = locationScore !== null && locationScore >= 75;
  const healthyEconomics =
    hasUnderwriting &&
    cashflow !== null &&
    cashflow >= 0 &&
    dscr !== null &&
    dscr >= 1.1 &&
    !hardRedFlag &&
    residualRating !== "red";

  const decision: DealDecisionBrief["decision"] = dealDecisionStatus({
    hasScore,
    hasUnderwriting,
    healthyEconomics,
    cashflowWeak,
    dscrWeak,
    hardRedFlag,
    scoreWeak,
    score
  });
  const strengths = dealDecisionStrengths(score, locationScore, strongLocation);
  const reasons = dealDecisionReasons({
    hasScore,
    hasUnderwriting,
    score,
    cashflow,
    dscr,
    stressedWeak,
    redFlags,
    residualRating
  });
  const nextActions = dealDecisionNextActions(decision, hasScore, hasUnderwriting, neutralPurchasePrice);
  const pricing = dealPricingBrief(deal);

  return {
    decision,
    headline: dealDecisionHeadline(decision),
    tone: dealDecisionTone(decision),
    summary: dealDecisionSummary(decision, strongLocation, cashflowWeak || dscrWeak || hardRedFlag),
    strengths,
    reasons: uniqueItems(reasons),
    nextActions,
    facts: [
      { label: "Gesamtscore", value: score !== null ? `${Math.round(score)}` : "Fehlt", tone: scoreTone(score) },
      { label: "Cashflow", value: formatCurrency(cashflow), tone: cashflowTone(cashflow) },
      { label: "DSCR", value: formatNumber(dscr), tone: dscrTone(dscr) },
      { label: "Mikrolage", value: locationScore !== null ? `${Math.round(locationScore)}` : "Fehlt", tone: scoreTone(locationScore) },
      { label: pricing.label, value: pricing.value, tone: pricing.tone },
      { label: "Preisanker", value: pricing.anchor, tone: pricing.tone }
    ]
  };
}

export function dealStrategyBrief(deal: Deal): DealStrategyBrief {
  const decision = dealDecisionBrief(deal);
  const pricing = dealPricingBrief(deal);
  const microBrief = microLocationDecisionBrief(deal);
  const profiles = [...microLocationProfileRows(deal.region_outlook)].sort((a, b) => b.score - a.score);
  const primaryProfile = profiles[0] || null;
  const shortTermProfile = profiles.find((profile) => profile.name === "short_term_guest") || null;
  const shortTermLegalStatus = strategyShortTermLegalStatus(deal);
  const shortTermHasLegalCap = strategyShortTermHasLegalCap(deal, shortTermLegalStatus);

  const warnings = uniqueItems([
    ...microBrief.risks,
    ...(shortTermHasLegalCap ? ["Airbnb nur als optionalen Bonus behandeln; lokale Rechtslage ist eingeschraenkt oder unklar."] : [])
  ]);
  const nextActions = uniqueItems([
    ...(primaryProfile?.nextCheck ? [primaryProfile.nextCheck] : []),
    ...(shortTermProfile && (shortTermHasLegalCap || shortTermProfile.score >= 70) ? [shortTermProfile.nextCheck] : []),
    ...microBrief.nextChecks,
    ...decision.nextActions
  ]);

  return {
    headline: strategyHeadline(decision.decision, primaryProfile),
    tone: strategyTone(decision.tone, primaryProfile?.score ?? null),
    targetGroup: primaryProfile?.label || "Offen",
    basePlan: strategyBasePlan(primaryProfile),
    rentPlan: strategyRentPlan(shortTermProfile, shortTermHasLegalCap),
    offerRule: strategyOfferRule(pricing),
    warnings,
    nextActions,
    facts: [
      {
        label: "Zielgruppe",
        value: primaryProfile ? `${primaryProfile.label} ${primaryProfile.score}` : "Offen",
        tone: scoreTone(primaryProfile?.score)
      },
      {
        label: "Mikrolage",
        value: formatNumber(numberValue(deal.location?.micro_location_score)),
        tone: scoreTone(numberValue(deal.location?.micro_location_score))
      },
      {
        label: "Preisanker",
        value: pricing.anchor,
        tone: pricing.tone
      },
      {
        label: "Airbnb-Recht",
        value: formatLegalStatus(shortTermLegalStatus),
        tone: legalStatusTone(shortTermLegalStatus)
      }
    ]
  };
}

export function objectDevelopmentAssumptionDefaults(deal: Deal): ObjectDevelopmentAssumptionDefaults {
  const listing = deal.listing || null;
  const savedRenovationInputs = deal.latest_renovation_case?.inputs ?? {};
  const savedRenovationResults = deal.latest_renovation_case?.results ?? null;
  const marketRent = numberValue(listing?.market_rent_estimate_monthly);
  const livingArea = numberValue(listing?.living_area_sqm);
  const legalTargetPerSqm = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const legalTargetRent = livingArea !== null && legalTargetPerSqm !== null ? livingArea * legalTargetPerSqm : null;
  const savedTargetRent =
    numberValue(savedRenovationInputs.target_cold_rent_monthly) ??
    numberValue(savedRenovationResults?.target_cold_rent_monthly);
  const savedCapex =
    numberValue(savedRenovationInputs.planned_capex) ??
    numberValue(savedRenovationResults?.planned_capex);
  const savedRefiLtv = numberValue(savedRenovationInputs.refinance_ltv_percent);
  const savedValueYield = numberValue(savedRenovationInputs.valuation_yield_percent);

  return {
    targetRentMonthly: savedTargetRent ?? developmentTargetRent(marketRent, legalTargetRent),
    capex: savedCapex ?? numberValue(listing?.expected_initial_capex),
    refiLtvPercent: savedRefiLtv ?? 75,
    valueYieldPercent: savedValueYield ?? 4.5
  };
}

export function objectDevelopmentPotentialBrief(
  deal: Deal,
  assumptions: ObjectDevelopmentPotentialAssumptions = {}
): ObjectDevelopmentPotentialBrief {
  const listing = deal.listing || null;
  const defaults = objectDevelopmentAssumptionDefaults(deal);
  const currentRent = numberValue(listing?.cold_rent_monthly);
  const marketRent = numberValue(listing?.market_rent_estimate_monthly);
  const livingArea = numberValue(listing?.living_area_sqm);
  const legalTargetPerSqm = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const legalTargetRent = livingArea !== null && legalTargetPerSqm !== null ? livingArea * legalTargetPerSqm : null;
  const targetRent = developmentTargetRent(marketRent, legalTargetRent);
  const scenarioTargetRent = positiveScenarioValue(assumptions.targetRentMonthly, defaults.targetRentMonthly);
  const savedTargetRent =
    numberValue(deal.latest_renovation_case?.inputs?.target_cold_rent_monthly) ??
    numberValue(deal.latest_renovation_case?.results?.target_cold_rent_monthly);
  const targetRentSource =
    numberValue(assumptions.targetRentMonthly) !== null
      ? "Szenario-Zielmiete"
      : savedTargetRent !== null
        ? "gespeicherter Renovierungs-Case"
      : developmentTargetRentSource(marketRent, legalTargetRent);
  const monthlyRentUplift =
    currentRent !== null && scenarioTargetRent !== null ? Math.max(0, scenarioTargetRent - currentRent) : null;
  const annualRentUplift = monthlyRentUplift !== null ? monthlyRentUplift * 12 : null;
  const valueYieldPercent = positiveScenarioValue(assumptions.valueYieldPercent, defaults.valueYieldPercent) ?? 4.5;
  const valueYieldRate = valueYieldPercent / 100;
  const impliedValueUplift =
    annualRentUplift !== null && annualRentUplift > 0 && valueYieldRate > 0 ? annualRentUplift / valueYieldRate : null;
  const refiLtvPercent = positiveScenarioValue(assumptions.refiLtvPercent, defaults.refiLtvPercent) ?? 75;
  const refinanceRoom = impliedValueUplift !== null ? impliedValueUplift * (refiLtvPercent / 100) : null;
  const capex = nonNegativeScenarioValue(assumptions.capex, defaults.capex);
  const netValueAfterCapex = developmentNetValueAfterCapex(impliedValueUplift, capex);
  const condition = typeof listing?.condition === "string" ? listing.condition.toLowerCase() : "";
  const energyClass = typeof listing?.energy_class === "string" ? listing.energy_class.toUpperCase() : "";
  const hasWeakEnergy = ["E", "F", "G", "H"].includes(energyClass);
  const hasConditionLever =
    condition.includes("renovierungs") ||
    condition.includes("sanierungs") ||
    condition.includes("modernis") ||
    condition.includes("teilrenov");
  const hasCapexLever = capex !== null && capex > 0;
  const hasRentValueLever = monthlyRentUplift !== null && monthlyRentUplift >= 100;
  const locationScenario = developmentLocationUseScenario(deal);
  const levers = uniqueItems([
    ...developmentLevers({
      capex,
      energyClass,
      hasCapexLever,
      hasConditionLever,
      hasRentValueLever,
      hasWeakEnergy,
      impliedValueUplift,
      monthlyRentUplift,
      targetRentSource
    }),
    ...developmentLocationUseLevers(locationScenario)
  ]);
  const blockers = developmentBlockers({
    currentRent,
    deal,
    legalTargetRent,
    marketRent,
    monthlyRentUplift,
    targetRent
  });
  const nextActions = uniqueItems([
    ...developmentNextActions({
      blockers,
      hasCapexLever,
      hasConditionLever,
      hasRentValueLever,
      hasWeakEnergy
    }),
    locationScenario.nextCheck
  ]).slice(0, 5);
  const locationFact = developmentLocationUseFact(locationScenario);
  const scenarios = [
    ...developmentScenarios({
      blockers,
      capex,
      deal,
      hasCapexLever,
      hasConditionLever,
      hasWeakEnergy,
      impliedValueUplift,
      monthlyRentUplift,
      refinanceRoom,
      refiLtvPercent,
      valueYieldPercent
    }),
    locationScenario
  ];
  const proofGates = developmentProofGates(deal, scenarios, {
    capex,
    currentRent,
    legalTargetRent,
    scenarioTargetRent
  });
  const valueDecision = developmentValueDecision(scenarios, proofGates, {
    capex,
    impliedValueUplift,
    refinanceRoom
  });
  const prioritizedLevers = developmentPrioritizedLevers(scenarios, {
    capex,
    hasCapexLever,
    hasConditionLever,
    hasWeakEnergy,
    impliedValueUplift,
    refinanceRoom
  });
  const executionPlan = developmentExecutionPlan(scenarios, {
    blockers,
    capex,
    monthlyRentUplift,
    refinanceRoom
  });
  const developmentCommand = objectDevelopmentCommand(prioritizedLevers, proofGates, valueDecision);

  return {
    headline: developmentHeadline(hasRentValueLever, levers, blockers),
    tone: developmentTone(hasRentValueLever, levers, blockers, monthlyRentUplift),
    summary: developmentSummary(monthlyRentUplift, impliedValueUplift, netValueAfterCapex, blockers),
    facts: [
      {
        label: "Miethebel",
        value: monthlyRentUplift !== null ? `${formatCurrency(monthlyRentUplift)}/Monat` : "Fehlt",
        tone: rentUpliftTone(monthlyRentUplift)
      },
      {
        label: "Werthebel",
        value: impliedValueUplift !== null ? `${formatCurrency(impliedValueUplift)} bei ${formatNumber(valueYieldPercent, " %")}` : "Fehlt",
        tone: valueUpliftTone(impliedValueUplift)
      },
      {
        label: "Sanierungsbudget",
        value: capex !== null ? formatCurrency(capex) : "Fehlt",
        tone: hasCapexLever ? "watch" : "empty"
      },
      {
        label: "Netto-Werthebel",
        value: netValueAfterCapex !== null ? `${formatCurrency(netValueAfterCapex)} nach Capex` : "Fehlt",
        tone: netDevelopmentValueTone(netValueAfterCapex)
      },
      {
        label: "Refi-Spielraum",
        value: refinanceRoom !== null ? `${formatCurrency(refinanceRoom)} bei ${formatNumber(refiLtvPercent, " % LTV")}` : "Fehlt",
        tone: valueUpliftTone(refinanceRoom)
      },
      {
        label: "Lage/Nutzung",
        value: locationFact.value,
        tone: locationFact.tone
      }
    ],
    levers,
    blockers,
    nextActions,
    scenarios,
    prioritizedLevers,
    executionPlan,
    proofGates,
    valueDecision,
    developmentCommand
  };
}

export function dealDevelopmentPotentialMapBrief(deal: Deal): DealDevelopmentPotentialMapBrief {
  const development = objectDevelopmentPotentialBrief(deal);
  const lanes = development.prioritizedLevers.slice(0, 3).map((lever) =>
    developmentPotentialMapLane(lever, development)
  );
  const primaryLane = lanes[0] || null;
  const status = developmentPotentialMapStatus(development.valueDecision, lanes);
  const tone = status === "missing" ? "empty" : development.valueDecision.tone;
  const priceableLaneCount = lanes.filter((lane) => lane.proofStatus === "Kaufpreisrelevant").length;
  const quickTake = developmentPotentialMapQuickTake(status, primaryLane, development.valueDecision);

  return {
    status,
    headline: developmentPotentialMapHeadline(status, primaryLane),
    tone,
    summary: developmentPotentialMapSummary(primaryLane, development.valueDecision),
    facts: [
      {
        label: "Top-Hebel",
        value: primaryLane?.label || "Fehlt",
        tone: primaryLane?.tone || "empty"
      },
      {
        label: "Belegbar",
        value: formatCurrency(development.valueDecision.priceableValueEur),
        tone: development.valueDecision.priceableValueEur > 0 ? "good" : "empty"
      },
      {
        label: "Memo-Upside",
        value: formatCurrency(development.valueDecision.memoOnlyValueEur),
        tone: development.valueDecision.memoOnlyValueEur > 0 ? "watch" : "empty"
      },
      {
        label: "Belegstatus",
        value: priceableLaneCount > 0 ? `${priceableLaneCount} kaufpreisrelevant` : "Noch offen",
        tone: priceableLaneCount > 0 ? "good" : "watch"
      }
    ],
    quickTake,
    lanes,
    priceBuckets: developmentPotentialMapPriceBuckets(development.valueDecision),
    stopRules: developmentPotentialMapStopRules(development),
    nextActions: developmentPotentialMapNextActions(development, primaryLane)
  };
}

export function developmentCaseHandoffBrief(deal: Deal): DevelopmentCaseHandoffBrief | null {
  const savedCase = deal.latest_renovation_case;
  if (!savedCase) {
    return null;
  }

  const inputs = savedCase.inputs ?? {};
  const results = savedCase.results;
  const development = objectDevelopmentPotentialBrief(deal);
  const primaryLever = development.prioritizedLevers[0] || null;
  const targetRent =
    numberValue(inputs.target_cold_rent_monthly) ??
    numberValue(results.target_cold_rent_monthly);
  const capex =
    numberValue(inputs.planned_capex) ??
    numberValue(results.planned_capex);
  const refiLtv = numberValue(inputs.refinance_ltv_percent);
  const valuationYield = numberValue(inputs.valuation_yield_percent);
  const valueUplift = numberValue(results.implied_value_uplift_from_rent);
  const equityRelease = numberValue(results.potential_equity_released);
  const requiredProofs = uniqueItems(
    [
      "Bankbewertung oder konservativer Nachher-Wert",
      "Capex-Angebot mit Gewerken und Puffer",
      "Mietvertrag, Zielmiete und rechtliche Mietanpassung",
      ...development.nextActions
    ].filter((item): item is string => Boolean(item))
  ).slice(0, 6);

  return {
    caseId: savedCase.id,
    headline: `Gespeicherter Entwicklungsfall Case #${savedCase.id}`,
    tone: development.valueDecision.tone,
    summary: `Memo, Bankpaket und Preisdisziplin nutzen denselben gespeicherten Entwicklungsfall. Haupthebel: ${
      primaryLever ? `${primaryLever.label} in ${primaryLever.where}` : "noch nicht belastbar"
    }.`,
    facts: [
      {
        label: "Zielmiete",
        value: formatCurrency(targetRent),
        tone: targetRent !== null ? "watch" : "empty"
      },
      {
        label: "Capex",
        value: formatCurrency(capex),
        tone: capex !== null ? "watch" : "empty"
      },
      {
        label: "Refi-LTV",
        value: refiLtv !== null ? formatPercent(refiLtv) : "Fehlt",
        tone: refiLtv !== null ? "watch" : "empty"
      },
      {
        label: "Bewertungsrendite",
        value: valuationYield !== null ? formatPercent(valuationYield) : "Fehlt",
        tone: valuationYield !== null ? "watch" : "empty"
      },
      {
        label: "Werthebel",
        value: formatCurrency(valueUplift),
        tone: valueUpliftTone(valueUplift)
      },
      {
        label: "Kapital frei",
        value: formatCurrency(equityRelease),
        tone: valueUpliftTone(equityRelease)
      }
    ],
    guardrail:
      "Nicht blind in Kaufpreis oder Finanzierung einrechnen; erst nach Bankbewertung, Capex-Angebot und Unterlagenfreigabe als Kredit- oder Preisannahme nutzen.",
    requiredProofs
  };
}

export function dealDevelopmentEvidencePackBrief(deal: Deal): DealDevelopmentEvidencePackBrief {
  const development = objectDevelopmentPotentialBrief(deal);
  const rows = [
    developmentEvidenceRentMarketCompsRow(deal),
    developmentEvidenceObjectDocumentsRow(deal),
    developmentEvidenceCapexRefiRow(deal),
    developmentEvidenceLocationUseRow(deal)
  ];
  const status = developmentEvidencePackStatus(rows, development.valueDecision);
  const tone = developmentEvidencePackTone(status);
  const openRows = rows.filter((row) => row.status !== "verified");
  const blockedRows = rows.filter((row) => row.status === "blocked");
  const compsRow = rows.find((row) => row.key === "rent_market_comps");

  return {
    status,
    headline: developmentEvidencePackHeadline(status),
    tone,
    summary: developmentEvidencePackSummary(status, development.valueDecision.priceableValueEur, openRows.length, blockedRows.length),
    facts: [
      {
        label: "Freigabe",
        value: developmentEvidencePackReleaseLabel(status),
        tone
      },
      {
        label: "Offene Pflichtbelege",
        value: openRows.length ? `${openRows.length} offen` : "0 offen",
        tone: openRows.length ? "watch" : "good"
      },
      {
        label: "Comps",
        value: developmentEvidencePackRowFact(compsRow),
        tone: compsRow?.tone || "empty"
      },
      {
        label: "Werthebel",
        value: formatCurrency(development.valueDecision.priceableValueEur + development.valueDecision.memoOnlyValueEur),
        tone: development.valueDecision.tone
      }
    ],
    rows,
    guardrails: [
      "Entwicklungswert erst einpreisen, wenn Comps, Objektunterlagen und Capex-/Banklogik zusammenpassen.",
      "Memo-Upside nie als Kaufpreisaufschlag verkaufen, solange ein Pflichtbeleg offen oder blockiert ist.",
      "Jede Entwicklungsannahme im IC-Memo mit Quelle, Datum und Preiswirkung dokumentieren."
    ],
    nextActions: uniqueItems([
      ...rows.filter((row) => row.status !== "verified").map((row) => row.nextAction),
      development.valueDecision.nextAction
    ]).slice(0, 5)
  };
}

function developmentPotentialMapLane(
  lever: ObjectDevelopmentPrioritizedLever,
  development: ObjectDevelopmentPotentialBrief
): DealDevelopmentPotentialMapLane {
  const proofGate = development.proofGates.find((gate) => gate.key === lever.key);
  const valueLane = development.valueDecision.lanes.find((lane) => lane.key === lever.key);
  const estimatedValue =
    valueLane?.estimatedValueEur !== null && valueLane?.estimatedValueEur !== undefined
      ? formatCurrency(valueLane.estimatedValueEur)
      : lever.estimatedValueEur !== null
        ? formatCurrency(lever.estimatedValueEur)
        : lever.scoreLabel;

  return {
    rank: lever.rank,
    key: lever.key,
    label: lever.label,
    where: developmentPotentialMapWhere(lever.key),
    estimatedValue,
    proofStatus: proofGate?.statusLabel || "Nicht belastbar",
    signal: lever.reason,
    risk: lever.risk,
    nextCheck: proofGate?.nextAction || lever.nextCheck,
    tone: proofGate?.tone || lever.tone
  };
}

function developmentPotentialMapQuickTake(
  status: DealDevelopmentPotentialMapStatus,
  primaryLane: DealDevelopmentPotentialMapLane | null,
  valueDecision: ObjectDevelopmentValueDecision
): DealDevelopmentPotentialQuickTake {
  if (!primaryLane || status === "missing") {
    return {
      headline: "Objekt-Entwicklung: Daten fehlen",
      statusLabel: "Offen",
      tone: "empty",
      primaryLever: "Noch nicht bewertbar",
      objectArea: "Miete, Zustand, WEG, Geo und Mikrolage",
      estimatedValue: "Fehlt",
      priceRule: `Heute ${formatCurrency(0)} Entwicklungsbonus im Kaufpreis; erst Objekt- und Marktdaten nachtragen.`,
      nextAction: valueDecision.nextAction,
      reasoning: ["Noch kein belastbarer Objekt-Hebel sichtbar."]
    };
  }

  const tone = status === "priceable" ? "good" : status === "memo" ? "watch" : "risk";

  return {
    headline: developmentPotentialQuickHeadline(status, primaryLane.label),
    statusLabel: developmentPotentialQuickStatusLabel(status),
    tone,
    primaryLever: primaryLane.label,
    objectArea: primaryLane.where,
    estimatedValue: primaryLane.estimatedValue,
    priceRule: developmentPotentialQuickPriceRule(status, valueDecision),
    nextAction: valueDecision.nextAction || primaryLane.nextCheck,
    reasoning: uniqueItems([primaryLane.signal, primaryLane.risk, valueDecision.summary]).slice(0, 3)
  };
}

function developmentPotentialQuickHeadline(status: DealDevelopmentPotentialMapStatus, label: string): string {
  if (status === "priceable") {
    return `Objekt-Entwicklung: ${label} zuerst`;
  }
  if (status === "memo") {
    return `Objekt-Entwicklung: ${label} pruefen`;
  }
  return `Objekt-Entwicklung: ${label} erst belegen`;
}

function developmentPotentialQuickStatusLabel(status: DealDevelopmentPotentialMapStatus): string {
  if (status === "priceable") {
    return "Preisrelevant";
  }
  if (status === "memo") {
    return "Nur Memo-Upside";
  }
  if (status === "blocked") {
    return "Blockiert";
  }
  return "Offen";
}

function developmentPotentialQuickPriceRule(
  status: DealDevelopmentPotentialMapStatus,
  valueDecision: ObjectDevelopmentValueDecision
): string {
  if (status === "priceable") {
    return `${formatCurrency(valueDecision.priceableValueEur)} maximal als belegbaren Entwicklungsbonus pruefen; Memo- und Blockerwerte nicht in den Kaufpreis einrechnen.`;
  }
  if (status === "memo") {
    return `Heute ${formatCurrency(0)} Entwicklungsbonus im Kaufpreis; ${formatCurrency(valueDecision.memoOnlyValueEur)} bleibt Memo-Upside bis die Belege geschlossen sind.`;
  }
  if (status === "blocked") {
    return `Heute ${formatCurrency(0)} Entwicklungsbonus im Kaufpreis; blockierte Hebel erst mit Unterlagen, Genehmigung und Banklogik neu bewerten.`;
  }
  return `Heute ${formatCurrency(0)} Entwicklungsbonus im Kaufpreis; erst Miete, Zustand, WEG, Geo und Mikrolage nachtragen.`;
}

function developmentPotentialMapWhere(key: ObjectDevelopmentScenario["key"]): string {
  if (key === "rent") {
    return "Miete/Nutzungsvertrag";
  }
  if (key === "capex_energy") {
    return "Zustand, Energie, Capex";
  }
  if (key === "weg_layout") {
    return "WEG, Grundriss, Teilungserklaerung";
  }
  if (key === "refi") {
    return "Nachher-Wert und Finanzierung";
  }
  return "Mikrolage, Zielgruppe, Nutzung";
}

function developmentPotentialMapStatus(
  valueDecision: ObjectDevelopmentValueDecision,
  lanes: DealDevelopmentPotentialMapLane[]
): DealDevelopmentPotentialMapStatus {
  if (!lanes.length) {
    return "missing";
  }
  if (valueDecision.priceableValueEur > 0) {
    return "priceable";
  }
  if (valueDecision.memoOnlyValueEur > 0) {
    return "memo";
  }
  if (valueDecision.blockedValueEur > 0) {
    return "blocked";
  }
  return "missing";
}

function developmentPotentialMapHeadline(
  status: DealDevelopmentPotentialMapStatus,
  primaryLane: DealDevelopmentPotentialMapLane | null
): string {
  if (!primaryLane || status === "missing") {
    return "Entwicklungspotential: noch nicht belegt";
  }
  if (status === "priceable") {
    return `Entwicklungspotential: ${primaryLane.label} fuehrt`;
  }
  if (status === "memo") {
    return `Entwicklungspotential: ${primaryLane.label} nur als Memo-Upside`;
  }
  return `Entwicklungspotential: ${primaryLane.label} erst belegen`;
}

function developmentPotentialMapSummary(
  primaryLane: DealDevelopmentPotentialMapLane | null,
  valueDecision: ObjectDevelopmentValueDecision
): string {
  if (!primaryLane) {
    return "Noch kein belastbarer Objekt-Hebel sichtbar. Erst Miete, Zustand, WEG, Geo und Mikrolage nachtragen.";
  }
  return `Top-Hebel: ${primaryLane.label} (${primaryLane.estimatedValue}). ${valueDecision.summary}`;
}

function developmentPotentialMapStopRules(development: ObjectDevelopmentPotentialBrief): string[] {
  const openRules = development.proofGates
    .filter((gate) => gate.status !== "verified")
    .map((gate) => gate.priceRule);

  return uniqueItems(
    openRules.length
      ? openRules
      : ["Entwicklungspotential nur konservativ und gedeckelt im Kaufpreis beruecksichtigen."]
  ).slice(0, 3);
}

function developmentPotentialMapNextActions(
  development: ObjectDevelopmentPotentialBrief,
  primaryLane: DealDevelopmentPotentialMapLane | null
): string[] {
  return uniqueItems([
    development.valueDecision.nextAction,
    ...development.proofGates.filter((gate) => gate.status !== "verified").map((gate) => gate.nextAction),
    ...(primaryLane ? [primaryLane.nextCheck] : []),
    ...development.nextActions
  ]).slice(0, 4);
}

function developmentPotentialMapPriceBuckets(
  valueDecision: ObjectDevelopmentValueDecision
): DealDevelopmentPotentialPriceBucket[] {
  return [
    developmentPotentialMapPriceBucket(valueDecision, "priceable", {
      emptyRule: "Heute keinen Entwicklungsbonus im Kaufpreis ansetzen.",
      label: "Einpreisbar heute",
      nonEmptyRule: "Nur konservativ gedeckelt ins Preisband uebernehmen.",
      value: valueDecision.priceableValueEur
    }),
    developmentPotentialMapPriceBucket(valueDecision, "memo", {
      emptyRule: "Keine reine Memo-Upside im aktuellen Datenstand sichtbar.",
      label: "Nur Memo-Upside",
      nonEmptyRule: "Nicht in den Kaufpreis einrechnen; erst fehlende Belege schliessen.",
      value: valueDecision.memoOnlyValueEur
    }),
    developmentPotentialMapPriceBucket(valueDecision, "blocked", {
      emptyRule: "Keine harte Entwicklungsbremse im aktuellen Datenstand.",
      label: "Blockiert",
      nonEmptyRule: "Erst Daten, Unterlagen oder Genehmigungen nachtragen; danach neu rechnen.",
      value: valueDecision.blockedValueEur
    })
  ];
}

function developmentPotentialMapPriceBucket(
  valueDecision: ObjectDevelopmentValueDecision,
  status: ObjectDevelopmentValueLaneStatus,
  copy: {
    emptyRule: string;
    label: string;
    nonEmptyRule: string;
    value: number;
  }
): DealDevelopmentPotentialPriceBucket {
  const valueLane =
    valueDecision.lanes.find((lane) => lane.status === status && (lane.estimatedValueEur ?? 0) > 0) ||
    valueDecision.lanes.find((lane) => lane.status === status);
  const hasValue = copy.value > 0;

  return {
    key: status,
    label: copy.label,
    value: formatCurrency(copy.value),
    tone: hasValue ? developmentValueLaneTone(status) : "empty",
    rule: hasValue ? copy.nonEmptyRule : copy.emptyRule,
    nextAction: valueLane?.nextAction || valueDecision.nextAction
  };
}

function developmentEvidenceRentMarketCompsRow(deal: Deal): DealDevelopmentEvidencePackRow {
  const marketPrice = numberValue(deal.market_price_per_sqm);
  const referenceRent = numberValue(deal.local_reference_rent_per_sqm);
  const currentRent = numberValue(deal.listing?.cold_rent_monthly);
  const rentContractStatus = developmentDocumentStatus(deal, "rental_contract");
  const evidence = [
    ...(currentRent !== null ? [`Ist-Miete ${formatCurrency(currentRent)}/Monat vorhanden.`] : []),
    ...(rentContractStatus === "verified" ? ["Mietvertrag geprueft."] : []),
    ...(referenceRent !== null ? [`Vergleichsmiete ${formatNumber(referenceRent, " €/m2")} vorhanden.`] : []),
    ...(marketPrice !== null ? [`Marktpreisanker ${formatNumber(marketPrice, " €/m2")} vorhanden.`] : [])
  ];
  const gaps = [
    ...(referenceRent === null || marketPrice === null ? ["Vergleichsmiete oder Marktpreisanker fehlt."] : []),
    ...(rentContractStatus === "missing" ? ["Mietvertrag fehlt."] : []),
    ...(rentContractStatus === "review" ? ["Mietvertrag vorhanden, aber noch nicht geprueft."] : [])
  ];
  const status: DealDevelopmentEvidencePackRowStatus =
    referenceRent === null || marketPrice === null || rentContractStatus === "missing"
      ? "blocked"
      : developmentEvidenceRowStatus(evidence, gaps);

  return {
    key: "rent_market_comps",
    label: "Miet-/Markt-Comps",
    status,
    statusLabel: developmentEvidenceRowStatusLabel(status),
    tone: developmentEvidenceRowTone(status),
    evidence,
    gaps,
    rule: "Keine Kaufpreisfreigabe ohne Vergleichsmieten und Marktpreisanker.",
    nextAction: "Vergleichsmiete und Marktpreisanker mit echten Comps belegen."
  };
}

function developmentEvidenceObjectDocumentsRow(deal: Deal): DealDevelopmentEvidencePackRow {
  const checks = [
    { type: "rental_contract", label: "Mietvertrag" },
    { type: "energy_certificate", label: "Energieausweis" },
    { type: "floor_plan", label: "Grundriss" },
    { type: "declaration_of_division", label: "Teilungserklaerung" },
    { type: "weg_minutes", label: "WEG-Protokolle" }
  ].map((item) => ({
    ...item,
    status: developmentDocumentStatus(deal, item.type)
  }));
  const evidence = checks.filter((check) => check.status === "verified").map((check) => `${check.label} geprueft.`);
  const gaps = checks
    .filter((check) => check.status !== "verified")
    .map((check) => check.status === "review" ? `${check.label} vorhanden, aber noch nicht geprueft.` : `${check.label} fehlt.`);
  const status = developmentEvidenceRowStatus(evidence, gaps);

  return {
    key: "object_documents",
    label: "Objektunterlagen",
    status,
    statusLabel: developmentEvidenceRowStatusLabel(status),
    tone: developmentEvidenceRowTone(status),
    evidence,
    gaps,
    rule: "Objekt- und WEG-Unterlagen muessen den Werthebel tragen, sonst nur Memo.",
    nextAction: "Grundriss, Teilungserklaerung, WEG-Protokolle und Energieausweis pruefen."
  };
}

function developmentEvidenceCapexRefiRow(deal: Deal): DealDevelopmentEvidencePackRow {
  const renovationCase = deal.latest_renovation_case?.results || null;
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const capexOfferStatus = developmentDocumentStatus(deal, "renovation_offer");
  const evidence = [
    ...(renovationCase ? ["Renovierungs-/Bank-Case gerechnet."] : []),
    ...(dscr !== null && dscr >= 1.1 ? ["DSCR tragfaehig modelliert."] : []),
    ...(renovationCase && renovationCase.post_renovation_value > 0 ? ["Nachher-Wert modelliert."] : []),
    ...(capexOfferStatus === "verified" ? ["Capex-Angebot/Leistungsbeschreibung geprueft."] : [])
  ];
  const gaps = [
    ...(!renovationCase ? ["Renovierungs-/Bank-Case fehlt."] : []),
    ...(dscr === null ? ["DSCR oder Kapitaldienst fehlt."] : dscr < 1.1 ? ["DSCR oder Kapitaldienst muss fuer Refi bestaetigt werden."] : []),
    ...(capexOfferStatus === "missing" ? ["Capex-Angebot/Leistungsbeschreibung fehlt."] : []),
    ...(capexOfferStatus === "review" ? ["Capex-Angebot/Leistungsbeschreibung vorhanden, aber noch nicht geprueft."] : [])
  ];
  const status = developmentEvidenceRowStatus(evidence, gaps);

  return {
    key: "capex_refi",
    label: "Capex-/Refi-Beleg",
    status,
    statusLabel: developmentEvidenceRowStatusLabel(status),
    tone: developmentEvidenceRowTone(status),
    evidence,
    gaps,
    rule: "Refi- und Capex-Upside erst nach Angebot, Nachher-Wert und Banklogik freigeben.",
    nextAction: "Capex-Angebot, Nachher-Wert und Bank-LTV gegen die Refi-These legen."
  };
}

function developmentEvidenceLocationUseRow(deal: Deal): DealDevelopmentEvidencePackRow {
  const inputs = evidenceInputsFromLocation(deal.location);
  const microScore = numberValue(deal.location?.micro_location_score);
  const completeness = numberValue(deal.location?.evidence_data_completeness_percent);
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status");
  const riskyShortTerm = legalStatus === "restricted" || legalStatus === "unclear" || legalStatus === "prohibited";
  const evidence = [
    ...(microScore !== null && microScore >= 75 ? [`Mikrolage-Score ${microScore}/100 stark.`] : []),
    ...(completeness !== null && completeness >= 70 ? [`Mikrolage-Belege ${completeness} % komplett.`] : []),
    ...(!riskyShortTerm && legalStatus ? [`Kurzzeitvermietung-Rechtslage ${formatLegalStatus(legalStatus)}.`] : [])
  ];
  const gaps = [
    ...(microScore === null ? ["Mikrolage-Score fehlt."] : microScore < 75 ? ["Mikrolage-Score nicht stark genug."] : []),
    ...(completeness === null ? ["Mikrolage-Belege fehlen."] : completeness < 70 ? ["Mikrolage-Belege sind unvollstaendig."] : []),
    ...(riskyShortTerm ? ["Kurzzeitvermietung rechtlich eingeschraenkt oder unklar."] : [])
  ];
  const status = developmentEvidenceRowStatus(evidence, gaps);

  return {
    key: "location_use",
    label: "Lage-/Nutzungsbelege",
    status,
    statusLabel: developmentEvidenceRowStatusLabel(status),
    tone: developmentEvidenceRowTone(status),
    evidence,
    gaps,
    rule: "Lage-/Nutzungshebel nur mit OePNV-, Nachfrage-, Freizeit- und Rechtsbelegen einpreisen.",
    nextAction: "OePNV, Nachfrageanker, Freizeitanker, Stoerquellen und Zweckentfremdungsrecht belegen."
  };
}

function developmentEvidenceRowStatus(evidence: string[], gaps: string[]): DealDevelopmentEvidencePackRowStatus {
  if (gaps.length === 0) {
    return "verified";
  }
  if (evidence.length > 0) {
    return "review";
  }
  return "blocked";
}

function developmentEvidencePackStatus(
  rows: DealDevelopmentEvidencePackRow[],
  valueDecision: ObjectDevelopmentValueDecision
): DealDevelopmentEvidencePackStatus {
  const openRows = rows.filter((row) => row.status !== "verified");
  const hasDevelopmentValue = valueDecision.priceableValueEur + valueDecision.memoOnlyValueEur + valueDecision.blockedValueEur > 0;
  if (!hasDevelopmentValue || openRows.length === rows.length) {
    return "blocked";
  }
  if (openRows.length > 0) {
    return "review";
  }
  return "ready";
}

function developmentEvidencePackTone(status: DealDevelopmentEvidencePackStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") {
    return "good";
  }
  if (status === "review") {
    return "watch";
  }
  return "risk";
}

function developmentEvidencePackHeadline(status: DealDevelopmentEvidencePackStatus): string {
  if (status === "ready") {
    return "Entwicklungswert belegbar";
  }
  if (status === "review") {
    return "Entwicklungswert braucht Belegpaket";
  }
  return "Entwicklung noch nicht freigabefaehig";
}

function developmentEvidencePackSummary(
  status: DealDevelopmentEvidencePackStatus,
  priceableValueEur: number,
  openCount: number,
  blockedCount: number
): string {
  if (status === "ready") {
    return `${formatCurrency(priceableValueEur)} Entwicklungswert ist mit Pflichtbelegen pruefbar.`;
  }
  if (status === "review") {
    return `${openCount} Pflichtbeleggruppen offen, davon ${blockedCount} blockiert. IC muss die Entwicklungsannahmen vor Kaufpreisaufschlag freigeben.`;
  }
  return "Entwicklungswert bleibt gesperrt, bis die Pflichtbelege nachgetragen sind.";
}

function developmentEvidencePackReleaseLabel(status: DealDevelopmentEvidencePackStatus): string {
  if (status === "ready") {
    return "Preisreif";
  }
  if (status === "review") {
    return "IC-Review";
  }
  return "Blockiert";
}

function developmentEvidencePackRowFact(row: DealDevelopmentEvidencePackRow | undefined): string {
  if (!row) {
    return "Fehlen";
  }
  if (row.status === "verified") {
    return "Belegt";
  }
  if (row.status === "review") {
    return "Pruefen";
  }
  return "Fehlen";
}

function developmentEvidenceRowStatusLabel(status: DealDevelopmentEvidencePackRowStatus): string {
  if (status === "verified") {
    return "Belegt";
  }
  if (status === "review") {
    return "Pruefen";
  }
  return "Fehlt";
}

function developmentEvidenceRowTone(status: DealDevelopmentEvidencePackRowStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") {
    return "good";
  }
  if (status === "review") {
    return "watch";
  }
  return "risk";
}

export function dealEvidenceQualityBrief(deal: Deal): DealEvidenceQualityBrief {
  const rows = [
    evidenceCoreDataRow(deal),
    evidenceUnderwritingRow(deal),
    evidenceScoreRow(deal),
    evidenceRentLawRow(deal),
    evidenceMicroLocationRow(deal),
    evidenceDocumentRow(deal),
    evidenceWegRow(deal),
    evidenceGeoRow(deal)
  ];
  const percent = Math.round(
    rows.reduce((sum, row) => sum + evidenceQualityScore(row.status), 0) / rows.length
  );
  const verifiedEvidence = rows
    .filter((row) => row.status === "verified")
    .map((row) => row.summary);
  const openEvidence = rows
    .filter((row) => row.status !== "verified")
    .map((row) => `${row.label}: ${row.summary}`);
  const nextActions = uniqueItems(
    rows.flatMap((row) => (row.status !== "verified" && row.action ? [row.action] : []))
  ).slice(0, 6);

  return {
    headline: evidenceQualityHeadline(percent, rows),
    tone: evidenceQualityTone(percent, rows),
    percent,
    summary: `${verifiedEvidence.length}/${rows.length} Beleggruppen belastbar. ${evidenceQualitySummaryTail(openEvidence.length)}`,
    rows,
    verifiedEvidence,
    openEvidence,
    nextActions
  };
}

export function dealAssumptionAuditBrief(deal: Deal): DealAssumptionAuditBrief {
  const rows = [
    assumptionPurchasePriceRow(deal),
    assumptionRentLawRow(deal),
    assumptionFinancingRow(deal),
    assumptionMicroLocationRow(deal),
    assumptionDevelopmentRow(deal),
    assumptionDocumentsRow(deal),
    assumptionWegGeoRow(deal),
    assumptionTaxRow(deal)
  ];
  const verifiedCount = rows.filter((row) => row.status === "verified").length;
  const score = Math.round(rows.reduce((sum, row) => sum + assumptionStatusScore(row.status), 0) / rows.length);
  const priceCriticalOpen = rows
    .filter((row) => row.priceImpact === "Preisrelevant" && row.status !== "verified")
    .map((row) => row.label);
  const blockerCount = priceCriticalOpen.length;
  const nextActions = uniqueItems([
    ...(priceCriticalOpen.length ? ["Preisrelevante Annahmen klaeren, bevor ein bindendes Angebot rausgeht."] : []),
    ...rows
      .filter((row) => row.status !== "verified")
      .map((row) => row.action)
  ]).slice(0, 6);

  return {
    headline: assumptionAuditHeadline(priceCriticalOpen.length, rows),
    tone: assumptionAuditTone(priceCriticalOpen.length, rows),
    score,
    verifiedCount,
    total: rows.length,
    blockerCount,
    summary: `${verifiedCount}/${rows.length} Annahmen belegt. ${priceCriticalOpen.length} preisrelevante Annahmen offen.`,
    rows,
    priceCriticalOpen,
    nextActions
  };
}

export function dealExitLiquidityBrief(deal: Deal): DealExitLiquidityBrief {
  const listing = deal.listing || null;
  const regionScore = numberValue(deal.region_outlook?.total_score);
  const microScore = numberValue(deal.location?.micro_location_score);
  const transitScore = numberValue(deal.location?.transit_access_score);
  const demandScore = numberValue(deal.location?.demand_anchor_score);
  const leisureScore = numberValue(deal.location?.leisure_quality_score);
  const nuisanceScore = numberValue(deal.location?.nuisance_resilience_score);
  const evidenceCompleteness = numberValue(deal.location?.evidence_data_completeness_percent);
  const evidenceConfidence = typeof deal.location?.evidence_confidence === "string" ? deal.location.evidence_confidence : null;
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const exitValue = numberValue(deal.latest_underwriting?.simple_exit_value);
  const equityMultiple = numberValue(deal.latest_underwriting?.simple_equity_multiple);
  const remainingLoan = numberValue(deal.latest_underwriting?.remaining_loan_after_holding);
  const yieldPercent = listing ? grossYield(listing) : null;
  const documentSummary = dueDiligenceDocumentSummary(deal);
  const geo = deal.geo_context || null;
  const geoConfidence = numberValue(geo?.data_confidence_percent);
  const hasGeoSpecialTopic = Boolean(geo?.milieu_protection_area || geo?.redevelopment_area || geo?.monument_protection);
  const hasWegCheck = Boolean(deal.weg_health);
  const score = exitLiquidityScore({
    cashflow,
    demandScore,
    documentPercent: documentSummary.percent,
    dscr,
    geoConfidence,
    hasGeoCheck: Boolean(geo),
    hasGeoSpecialTopic,
    hasWegCheck,
    leisureScore,
    microScore,
    nuisanceScore,
    regionScore,
    transitScore,
    yieldPercent
  });
  const tone = exitLiquidityTone(score);
  const liquidityLabel = exitLiquidityLabel(score);
  const estimatedExitDiscountPercent = exitLiquidityDiscount(score);
  const buyerLanes = exitBuyerLanes(deal, {
    cashflow,
    demandScore,
    documentPercent: documentSummary.percent,
    dscr,
    hasGeoSpecialTopic,
    hasWegCheck,
    leisureScore,
    microScore,
    regionScore,
    transitScore,
    yieldPercent
  });
  const risks = exitLiquidityRisks({
    cashflow,
    documentPercent: documentSummary.percent,
    dscr,
    evidenceCompleteness,
    evidenceConfidence,
    geoConfidence,
    hasGeoCheck: Boolean(geo),
    hasGeoSpecialTopic,
    hasWegCheck,
    nuisanceScore
  });
  const nextActions = uniqueItems([
    "Exit vor Gebot schaerfen: Zielkaeufer, Abschlag und fehlende Belege im IC-Memo festhalten.",
    ...buyerLanes.filter((lane) => lane.status !== "strong").map((lane) => lane.nextCheck),
    ...risks.map((risk) => exitRiskNextAction(risk))
  ]).slice(0, 6);

  return {
    headline: exitLiquidityHeadline(score, risks),
    tone,
    score,
    liquidityLabel,
    summary: exitLiquiditySummary(score, liquidityLabel, risks.length),
    estimatedExitDiscountPercent,
    facts: [
      {
        label: "Exit-Score",
        value: `${score}/100`,
        tone
      },
      {
        label: "Kaeuferpool",
        value: liquidityLabel,
        tone
      },
      {
        label: "Exit-Abschlag",
        value: `${estimatedExitDiscountPercent} %`,
        tone: estimatedExitDiscountPercent <= 3 ? "good" : estimatedExitDiscountPercent <= 6 ? "watch" : "risk"
      },
      {
        label: "20-Jahre-Exit",
        value: exitValue !== null ? formatCurrency(exitValue) : "Szenario fehlt",
        tone: exitValue !== null ? "watch" : "empty"
      },
      {
        label: "EK-Multiple",
        value: equityMultiple !== null ? formatNumber(equityMultiple, "x") : "Fehlt",
        tone: equityMultiple !== null && equityMultiple >= 1.5 ? "good" : equityMultiple !== null ? "watch" : "empty"
      },
      {
        label: "Restschuld",
        value: remainingLoan !== null ? formatCurrency(remainingLoan) : "Fehlt",
        tone: remainingLoan !== null ? "watch" : "empty"
      }
    ],
    buyerLanes,
    risks,
    nextActions
  };
}

export function acquisitionReadinessSummary(deal: Deal): AcquisitionReadinessSummary {
  const gates = [
    acquisitionEconomicsGate(deal),
    acquisitionDocumentGate(deal),
    acquisitionMicroLocationGate(deal),
    acquisitionWegGate(deal),
    acquisitionGeoGate(deal),
    acquisitionRiskGate(deal)
  ];
  const readyCount = gates.filter((gate) => gate.status === "pass").length;
  const hasBlock = gates.some((gate) => gate.status === "block");
  const hasReview = gates.some((gate) => gate.status === "review");
  const status: AcquisitionReadinessSummary["status"] = hasBlock
    ? "blocked"
    : hasReview
      ? "needs_review"
      : "ready";

  return {
    status,
    headline: acquisitionReadinessHeadline(status),
    tone: acquisitionReadinessTone(status),
    readyCount,
    total: gates.length,
    gates,
    nextActions: uniqueItems(
      gates
        .filter((gate) => gate.status !== "pass")
        .flatMap((gate) => gate.actions)
    ).slice(0, 6)
  };
}

export function dealClosingCommandBrief(deal: Deal): DealClosingCommandBrief {
  const offerRelease = dealOfferReleasePackageBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const bank = dossierBankReadiness(deal);
  const notary = dossierNotaryReadiness({ bank, offerRelease, readiness });
  const lanes: DealClosingCommandLane[] = [
    closingOfferLane(offerRelease),
    closingBankLane(deal, bank),
    closingNotaryLane(notary)
  ];
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;
  const conditionalCount = lanes.filter((lane) => lane.status === "conditional").length;
  const status: DealClosingCommandStatus = blockedCount > 0 ? "blocked" : conditionalCount > 0 ? "conditional" : "ready";
  const tone = closingCommandTone(status);
  const openGateCount = Math.max(0, readiness.total - readiness.readyCount);
  const primaryAction = closingCommandPrimaryAction(readiness, lanes);

  return {
    status,
    headline: closingCommandHeadline(status),
    tone,
    summary:
      status === "ready"
        ? "Angebot, Bankpaket und Notarvorbereitung sind im aktuellen Datenstand freigegeben."
        : `${blockedCount} Closing-Lane${blockedCount === 1 ? "" : "s"} blockiert, ${conditionalCount} mit Bedingungen. Erst Preis, Bankstory und Pflichtbelege schliessen.`,
    primaryAction,
    stopRule:
      status === "ready"
        ? "Closing darf weiterlaufen; finale Unterlagen und Freigaben trotzdem dokumentieren."
        : `Kein Angebot, kein Bankversand und keine Notarvorbereitung, solange ${openGateCount} Freigabe-Gate${openGateCount === 1 ? "" : "s"} oder Closing-Lanes offen sind.`,
    facts: [
      {
        label: "Angebot",
        value: offerRelease.releaseLabel,
        tone: offerRelease.tone
      },
      {
        label: "Bank",
        value: bank.statusLabel,
        tone: bank.tone
      },
      {
        label: "Notar",
        value: notary.statusLabel,
        tone: notary.tone
      },
      {
        label: "Freigabe",
        value: `${readiness.readyCount}/${readiness.total} Gates`,
        tone: readiness.tone
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      }
    ],
    lanes,
    nextActions: uniqueItems([
      primaryAction,
      ...lanes.filter((lane) => lane.status !== "ready").map((lane) => lane.action),
      ...readiness.nextActions,
      ...offerRelease.nextActions
    ]).slice(0, 6)
  };
}

export function dealActionPlanBrief(deal: Deal): DealActionPlanBrief {
  const decision = dealDecisionBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const development = objectDevelopmentPotentialBrief(deal);
  const strategy = dealStrategyBrief(deal);
  const blockedOrOpenGates = readiness.gates.filter((gate) => gate.status !== "pass");
  const gateSteps = blockedOrOpenGates.map((gate, index) => actionPlanStepFromGate(gate, index + 1));
  const extraActions = uniqueItems([
    ...evidence.nextActions,
    ...development.nextActions,
    ...strategy.nextActions
  ]);
  const supplementalSteps = extraActions
    .filter((action) => !gateSteps.some((step) => actionPlanStepOverlaps(step, action)))
    .slice(0, Math.max(0, 6 - gateSteps.length))
    .map((action, index) => ({
      priority: gateSteps.length + index + 1,
      label: actionPlanSupplementalLabel(action),
      detail: action,
      reason: "Ergaenzt die Freigabe-Gates mit fachlichen Folgepruefungen.",
      tone: "watch" as ReturnType<typeof scoreTone>
    }));
  const steps = [...gateSteps, ...supplementalSteps].slice(0, 6);
  const primaryAction = actionPlanPrimaryAction(readiness, decision, steps);

  return {
    headline: actionPlanHeadline(readiness, decision),
    tone: actionPlanTone(readiness, decision),
    primaryAction,
    summary: actionPlanSummary(readiness, evidence.percent, steps.length),
    stopRule: actionPlanStopRule(readiness),
    steps
  };
}

export function dealUnlockPlanBrief(deal: Deal): DealUnlockPlanBrief {
  const decision = dealDecisionBrief(deal);
  const repairPlan = dealRepairPlanBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const status = unlockPlanStatus(decision, repairPlan, readiness);
  const levers = [
    unlockPriceFinancingLever(repairPlan, deal),
    unlockRentProofLever(repairPlan, deal),
    unlockEvidenceReadinessLever(readiness, evidence, documents)
  ].sort((a, b) => b.rankScore - a.rankScore);
  const hardLeverCount = levers.filter((lever) => lever.statusLabel === "Pflichthebel").length;
  const tone = unlockPlanTone(status);

  return {
    status,
    headline: unlockPlanHeadline(status, hardLeverCount),
    tone,
    summary: unlockPlanSummary(status, decision, hardLeverCount),
    targetState: unlockPlanTargetState(status),
    stopRule: unlockPlanStopRule(status, levers),
    facts: [
      {
        label: "Entscheidung",
        value: unlockDecisionLabel(decision.decision),
        tone: decision.tone
      },
      {
        label: "Cashflow-Luecke",
        value: repairMonthlyText(repairPlan.cashflowGapMonthly),
        tone: repairPlan.cashflowGapMonthly !== null && repairPlan.cashflowGapMonthly > 0 ? "risk" : "good"
      },
      {
        label: "Preis-/Debt-Hebel",
        value: stressCurrencyText(repairPlan.purchasePriceRepairEur),
        tone: repairPlan.purchasePriceRepairEur !== null && repairPlan.purchasePriceRepairEur > 0 ? "risk" : "good"
      },
      {
        label: "Freigabe",
        value: `${readiness.readyCount}/${readiness.total} Gates`,
        tone: readiness.tone
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      }
    ],
    levers,
    nextActions: uniqueItems(levers.map((lever) => lever.action)).slice(0, 4)
  };
}

export function dealExecutionSprintBrief(deal: Deal): DealExecutionSprintBrief {
  const actionPlan = dealActionPlanBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const market = dealMarketComparisonBrief(deal);
  const development = objectDevelopmentPotentialBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const coordinateReadiness = microLocationCoordinateReadinessBrief(deal);
  const status = executionSprintStatus(readiness);
  const tone = executionSprintTone(status);
  const tasks: DealExecutionSprintTask[] = [
    executionSprintPriceTask(actionPlan, market),
    executionSprintDocumentTask(documents),
    executionSprintMicroLocationTask(readiness, evidence, coordinateReadiness),
    executionSprintDevelopmentTask(development),
    executionSprintCompsTask(market),
    executionSprintMemoTask(status, actionPlan)
  ];
  const milestones = executionSprintMilestones(tasks);
  const criticalCount = tasks.filter((task) => task.priorityLabel === "Vor Gebot").length;

  return {
    status,
    headline: executionSprintHeadline(status, actionPlan, market),
    tone,
    summary: `${tasks.length} Arbeitspakete, ${criticalCount} kritisch vor jedem Gebot. Freigabe ${readiness.readyCount}/${readiness.total}, Beleg-Score ${evidence.percent} %.`,
    primaryTask: actionPlan.primaryAction,
    stopRule: actionPlan.stopRule,
    copyPrompt: documents.requestPack.copySubject,
    facts: [
      {
        label: "Kritisch",
        value: `${criticalCount} vor Gebot`,
        tone: criticalCount > 0 ? "risk" : "good"
      },
      {
        label: "Unterlagen",
        value: documents.missingLabels.length > 0 ? `${documents.missingLabels.length} offen` : `${documents.percent} %`,
        tone: documents.missingLabels.length > 0 ? "risk" : documents.requestPack.reviewCount > 0 ? "watch" : "good"
      },
      {
        label: "Vor Ort",
        value: executionSprintMicroLocationFact(readiness),
        tone: executionSprintMicroLocationTone(readiness, evidence)
      },
      {
        label: "Entwicklung",
        value: executionSprintDevelopmentFact(development, developmentPricing),
        tone: development.valueDecision.tone
      },
      {
        label: "Comps",
        value: market.marketGapEur !== null ? offerCurrencyText(market.marketGapEur) : "Fehlt",
        tone: market.tone
      }
    ],
    milestones,
    tasks
  };
}

export function dealSiteVisitBrief(deal: Deal): DealSiteVisitBrief {
  const readiness = microLocationReadinessBrief(deal);
  const development = objectDevelopmentPotentialBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const sections = [
    siteVisitMicroLocationSection(readiness),
    siteVisitObjectSection(deal, development),
    siteVisitRentSection(deal, readiness),
    siteVisitEvidenceSection(deal, documents, evidence)
  ];
  const riskSections = sections.filter((section) => section.tone === "risk" || section.tone === "watch").length;
  const priceRelevantSections = sections.filter((section) => section.checks.some((check) => check.priceRelevant)).length;
  const hasHardRisk = sections.some((section) => section.tone === "risk");
  const tone: ReturnType<typeof scoreTone> = hasHardRisk ? "risk" : riskSections > 0 ? "watch" : "good";
  const headline =
    tone === "good"
      ? "Besichtigungsauftrag: Annahmen vor Ort bestaetigen"
      : "Besichtigungsauftrag: Preis- und Objektfragen vor Ort klaeren";

  return {
    headline,
    tone,
    summary: `${sections.length} Pruefbloecke fuer Besichtigung, Asset-Check und Preisfreigabe. ${priceRelevantSections} davon koennen Kaufpreis, Walk-away oder Memo-Freigabe bewegen.`,
    stopRule:
      priceRelevantSections > 0
        ? "Kein Preisbonus und kein bindendes Angebot, bevor die preisrelevanten Vor-Ort-Punkte belegt sind."
        : "Vor Notar alle Besichtigungsannahmen im Memo dokumentieren.",
    copyPrompt: siteVisitCopyPrompt(sections),
    facts: [
      {
        label: "Kritisch",
        value: riskSections > 0 ? `${riskSections} Vor-Ort-Punkte` : "0 offen",
        tone: riskSections > 0 ? "risk" : "good"
      },
      {
        label: "Preisrelevant",
        value: `${priceRelevantSections} Punkte`,
        tone: priceRelevantSections > 0 ? "risk" : "good"
      },
      {
        label: "Owner",
        value: "Besichtigung/Asset",
        tone: "watch"
      },
      {
        label: "Freigabe",
        value: priceRelevantSections > 0 ? "Kein Preisbonus" : "Memo reicht",
        tone: priceRelevantSections > 0 ? "risk" : "good"
      }
    ],
    sections
  };
}

export function portfolioCommandBrief(deals: Deal[]): PortfolioCommandBrief {
  const activeDeals = deals.filter((deal) => deal.pipeline_stage !== "Rejected" && deal.pipeline_stage !== "Bought");
  const decisionRows = activeDeals.map((deal) => ({
    deal,
    decision: dealDecisionBrief(deal),
    actionPlan: dealActionPlanBrief(deal)
  }));
  const buyCount = decisionRows.filter((row) => row.decision.decision === "buy").length;
  const blockerCount = decisionRows.filter((row) => row.decision.decision === "negotiate" || row.decision.decision === "reject").length;
  const watchCount = decisionRows.filter((row) => row.decision.decision === "watch").length;
  const unpricedCount = activeDeals.filter((deal) => !deal.latest_underwriting || !deal.latest_score).length;
  const equityRequired = activeDeals.reduce((sum, deal) => sum + (numberValue(deal.latest_underwriting?.equity_required) ?? 0), 0);
  const monthlyCashflow = activeDeals.reduce((sum, deal) => sum + (numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax) ?? 0), 0);
  const dscrWeakCount = activeDeals.filter((deal) => {
    const dscr = numberValue(deal.latest_underwriting?.dscr);
    return dscr !== null && dscr < 1.1;
  }).length;
  const negativeCapitalDeals = activeDeals.filter((deal) => {
    const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
    const equity = numberValue(deal.latest_underwriting?.equity_required);
    return cashflow !== null && cashflow < 0 && equity !== null && equity > 0;
  });
  const tone: ReturnType<typeof scoreTone> = blockerCount > 0 ? "risk" : buyCount > 0 ? "good" : activeDeals.length > 0 ? "watch" : "empty";

  return {
    headline: portfolioCommandHeadline(buyCount, blockerCount),
    tone,
    summary: `${activeDeals.length} Deals aktiv, ${offerCurrencyText(equityRequired)} Kapitalbedarf und ${offerCurrencyText(monthlyCashflow)} Monats-Cashflow in der aktuellen Queue.`,
    facts: [
      { label: "Kaufkandidaten", value: `${buyCount}`, tone: buyCount > 0 ? "good" : "empty" },
      { label: "Preis-/Risiko-Blocker", value: `${blockerCount}`, tone: blockerCount > 0 ? "risk" : "good" },
      { label: "Kapitalbedarf", value: offerCurrencyText(equityRequired), tone: equityRequired > 0 ? "watch" : "empty" },
      { label: "Monats-Cashflow", value: offerCurrencyText(monthlyCashflow), tone: cashflowTone(monthlyCashflow) },
      { label: "DSCR unter 1,10", value: `${dscrWeakCount}`, tone: dscrWeakCount > 0 ? "risk" : "good" },
      { label: "Erst rechnen", value: `${unpricedCount}`, tone: unpricedCount > 0 ? "watch" : "good" }
    ],
    lanes: [
      {
        label: "Bieten vorbereiten",
        count: buyCount,
        detail: buyCount > 0 ? "Bankpaket, Unterlagen und Angebotsfreigabe priorisieren." : "Noch kein Deal ist kaufbereit.",
        tone: buyCount > 0 ? "good" : "empty"
      },
      {
        label: "Hart nachverhandeln",
        count: blockerCount,
        detail: blockerCount > 0 ? "Preisanker, DSCR und Cashflow zuerst reparieren." : "Keine harten Preis-/Risiko-Blocker in der aktiven Queue.",
        tone: blockerCount > 0 ? "risk" : "good"
      },
      {
        label: "Belege schliessen",
        count: watchCount,
        detail: watchCount > 0 ? "Offene Unterlagen, Mikrolage und WEG vor Zeitaufwand klaeren." : "Keine reine Watch-Queue.",
        tone: watchCount > 0 ? "watch" : "empty"
      },
      {
        label: "Erst rechnen",
        count: unpricedCount,
        detail: unpricedCount > 0 ? "Underwriting und Score nachziehen, bevor Besichtigung oder Angebot Zeit binden." : "Alle aktiven Deals haben Score und Underwriting.",
        tone: unpricedCount > 0 ? "watch" : "good"
      }
    ],
    weeklyFocus: portfolioWeeklyFocus(decisionRows, activeDeals),
    capitalWarnings: portfolioCapitalWarnings(negativeCapitalDeals, unpricedCount, dscrWeakCount)
  };
}

export function vvGmbhBuyBoxBrief(deal: Deal): VvGmbhBuyBoxBrief {
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const stressCashflow = numberValue(deal.latest_underwriting?.stressed_monthly_cashflow_before_tax);
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const stressedDscr = numberValue(deal.latest_underwriting?.stressed_dscr);
  const grossYieldPercent = numberValue(deal.latest_underwriting?.gross_initial_yield_percent) ?? (deal.listing ? grossYield(deal.listing) : null);
  const netYieldPercent = numberValue(deal.latest_underwriting?.net_initial_yield_percent);
  const wegScore = numberValue(deal.weg_health?.results?.total_score);
  const locationScore = numberValue(deal.location?.micro_location_score) ?? numberValue(deal.region_outlook?.total_score);
  const capex = numberValue(deal.listing?.expected_initial_capex);
  const hasUnderwriting = Boolean(deal.latest_underwriting);
  const hasRent = numberValue(deal.listing?.cold_rent_monthly) !== null;
  const warningReasons = vvGmbhBuyBoxWarningReasons({ cashflow, dscr, grossYieldPercent, stressedDscr, stressCashflow, wegScore });
  const missingReasons = [
    !hasUnderwriting ? "Underwriting fehlt." : null,
    !hasRent ? "Ist-Miete fehlt." : null
  ].filter((item): item is string => Boolean(item));
  const status: VvGmbhBuyBoxStatus =
    missingReasons.length > 0 ? "missing" : warningReasons.length > 0 ? "warning" : "fit";
  const tone: ReturnType<typeof scoreTone> = status === "fit" ? "good" : status === "warning" ? "watch" : "empty";

  return {
    status,
    headline: vvGmbhBuyBoxHeadline(status),
    summary: vvGmbhBuyBoxSummary(status, warningReasons.length, missingReasons.length),
    stanceLabel:
      status === "fit"
        ? "Langfristig haltbar"
        : status === "warning"
          ? "Warnen, nicht automatisch ablehnen"
          : "Erst Daten schliessen",
    tone,
    facts: [
      { label: "Wertsteigerung", value: "0 % Basis", tone: "empty" },
      { label: "Haltedauer", value: "15 Jahre", tone: "good" },
      { label: "Bruttorendite", value: formatPercent(grossYieldPercent), tone: vvGmbhYieldTone(grossYieldPercent) },
      { label: "DSCR", value: formatNumber(dscr), tone: vvGmbhDscrTone(dscr) },
      { label: "Stress-Cashflow", value: stressCashflow === null ? "Fehlt" : offerCurrencyText(stressCashflow), tone: stressCashflow === null ? "empty" : cashflowTone(stressCashflow) },
      { label: "WEG/Capex", value: vvGmbhWegCapexLabel(wegScore, capex), tone: vvGmbhWegTone(wegScore, capex) }
    ],
    lanes: vvGmbhBuyBoxLanes({ capex, cashflow, dscr, grossYieldPercent, locationScore, netYieldPercent, stressedDscr, stressCashflow, wegScore }),
    guardrails: vvGmbhBuyBoxGuardrails(status),
    nextActions: vvGmbhBuyBoxNextActions({ missingReasons, status, warningReasons })
  };
}

function vvGmbhBuyBoxWarningReasons(input: {
  cashflow: number | null;
  dscr: number | null;
  grossYieldPercent: number | null;
  stressedDscr: number | null;
  stressCashflow: number | null;
  wegScore: number | null;
}): string[] {
  return [
    input.grossYieldPercent !== null && input.grossYieldPercent < 7.5 ? `Bruttomietrendite ${formatPercent(input.grossYieldPercent)} liegt unter 7,5 %.` : null,
    input.cashflow !== null && input.cashflow < 0 ? `Monats-Cashflow ${offerCurrencyText(input.cashflow)} ist negativ.` : null,
    input.stressCashflow !== null && input.stressCashflow < 0 ? `Stress-Cashflow ${offerCurrencyText(input.stressCashflow)} ist negativ.` : null,
    input.dscr !== null && input.dscr < 1.25 ? `DSCR ${formatNumber(input.dscr)} liegt unter 1,25.` : null,
    input.stressedDscr !== null && input.stressedDscr < 1.1 ? `Stress-DSCR ${formatNumber(input.stressedDscr)} liegt unter 1,10.` : null,
    input.wegScore !== null && input.wegScore < 65 ? `WEG-Score ${Math.round(input.wegScore)} braucht Pruefung.` : null
  ].filter((item): item is string => Boolean(item));
}

function vvGmbhBuyBoxHeadline(status: VvGmbhBuyBoxStatus): string {
  if (status === "fit") {
    return "vvGmbH-fit: Cashflow traegt ohne Wertsteigerung";
  }
  if (status === "warning") {
    return "vvGmbH-Warnung: Cashflow vor Wertsteigerung";
  }
  return "vvGmbH-Buy-Box: Daten fehlen";
}

function vvGmbhBuyBoxSummary(status: VvGmbhBuyBoxStatus, warningCount: number, missingCount: number): string {
  if (status === "fit") {
    return "Das Objekt traegt im aktuellen Datenstand als langfristiger Bestand: 0 % Wertsteigerung in der Basis, 15 Jahre Haltedauer und Reinvestition statt schneller Exit.";
  }
  if (status === "warning") {
    return `${warningCount} Warnsignal${warningCount === 1 ? "" : "e"} gegen die vvGmbH-Buy-Box. 0 % Wertsteigerung bleibt Basis, 15 Jahre Haltedauer bleiben Standard; der Deal wird erklaert und nachverhandelt, nicht automatisch geloescht.`;
  }
  return `${missingCount} Kernangabe${missingCount === 1 ? "" : "n"} fehlen. Keine vvGmbH-Entscheidung, bevor Miete, Underwriting, WEG und Finanzierungsstress belegt sind.`;
}

function vvGmbhBuyBoxLanes(input: {
  capex: number | null;
  cashflow: number | null;
  dscr: number | null;
  grossYieldPercent: number | null;
  locationScore: number | null;
  netYieldPercent: number | null;
  stressedDscr: number | null;
  stressCashflow: number | null;
  wegScore: number | null;
}): VvGmbhBuyBoxLane[] {
  return [
    {
      label: "Cashflow",
      statusLabel: input.cashflow === null ? "Fehlt" : input.cashflow >= 0 ? "Traegt" : "Warnung",
      tone: input.cashflow === null ? "empty" : input.cashflow >= 0 ? "good" : "watch",
      summary: input.cashflow === null ? "Ist-Cashflow fehlt." : `Monats-Cashflow ${offerCurrencyText(input.cashflow)}.`,
      rule: "Die Wohnung muss laufend Geld verdienen; Wertsteigerung ist Bonus, nicht Basis.",
      nextAction: input.cashflow !== null && input.cashflow < 0 ? "Preis, Miete, Hausgeld und Finanzierung nachverhandeln." : "Cashflow mit Mietvertrag und Hausgeldabrechnung belegen."
    },
    {
      label: "WEG/Zustand",
      statusLabel: input.wegScore === null ? "Pruefen" : input.wegScore >= 70 ? "Stabil" : "Warnung",
      tone: vvGmbhWegTone(input.wegScore, input.capex),
      summary: vvGmbhWegCapexLabel(input.wegScore, input.capex),
      rule: "Ruecklage, Sonderumlagen, Dach, Fassade, Heizung und Leitungen duerfen den Bestandscashflow nicht auffressen.",
      nextAction: "WEG-Protokolle, Ruecklagenstand, Wirtschaftsplan und absehbare Massnahmen pruefen."
    },
    {
      label: "Vermietbarkeit",
      statusLabel: input.locationScore === null ? "Beleg fehlt" : input.locationScore >= 70 ? "Dauerhaft" : "Pruefen",
      tone: input.locationScore === null ? "empty" : input.locationScore >= 70 ? "good" : "watch",
      summary: input.locationScore === null ? "Mikrolage oder Region fehlen." : `Nachfrage-Score ${Math.round(input.locationScore)}.`,
      rule: "Langweilige, dauerhaft vermietbare Nachfrage zaehlt mehr als Eigennutzerfantasie.",
      nextAction: "OePNV, Arbeitgeber, Uni/Klinik, Alltag und Wiedervermietbarkeit belegen."
    },
    {
      label: "Finanzierung",
      statusLabel: input.dscr === null ? "Fehlt" : input.dscr >= 1.25 && (input.stressedDscr === null || input.stressedDscr >= 1.1) ? "Puffer" : "Warnung",
      tone: vvGmbhFinanceTone(input.dscr, input.stressedDscr, input.stressCashflow),
      summary: `DSCR ${formatNumber(input.dscr)} · Stress-DSCR ${formatNumber(input.stressedDscr)} · Stress-Cashflow ${input.stressCashflow === null ? "Fehlt" : offerCurrencyText(input.stressCashflow)}.`,
      rule: "Kapitaldienstdeckung soll auch mit Zinsstress und Leerstands-/Ausfallpuffer tragen.",
      nextAction: "5,5-%-Zinsstress, 2-%-Tilgung und Bank-Covenants im Finanzierungspaket pruefen."
    },
    {
      label: "Wertsteigerung",
      statusLabel: "Nur Bonus",
      tone: "empty",
      summary: "0 % Wertsteigerung in der Basisrechnung.",
      rule: "Wertsteigerung nicht als Rettungsanker verwenden; sie darf nur den schon tragfaehigen Deal verbessern.",
      nextAction: "Exit-These separat im Memo zeigen und steuerliche Effekte vom Steuerberater pruefen lassen."
    }
  ];
}

function vvGmbhBuyBoxGuardrails(status: VvGmbhBuyBoxStatus): string[] {
  return [
    "Steuerberater prueft Koerperschaftsteuer, Ausschuttung, AfA, Buchwert und erweiterte Gewerbesteuerkuerzung; das Tool ist keine Steuerberatung.",
    "0 % Wertsteigerung in der Basisrechnung; Wertsteigerung bleibt Bonus und darf keinen negativen Cashflow retten.",
    "Fruehe Exits nur begruenden, nicht als Geschaeftsmodell planen; erweiterte Gewerbesteuerkuerzung und Grundstueckshandel-Risiko separat pruefen.",
    status === "fit"
      ? "Auch passende Deals brauchen Unterlagenbelege vor Angebot, Bankversand und Notar."
      : "Warnung heisst: Preis, Belege oder Finanzierung reparieren, bevor der Deal in Angebot oder Notar laeuft."
  ];
}

function vvGmbhBuyBoxNextActions(input: {
  missingReasons: string[];
  status: VvGmbhBuyBoxStatus;
  warningReasons: string[];
}): string[] {
  if (input.status === "missing") {
    return uniqueItems([
      ...input.missingReasons,
      "Ist-Miete, Hausgeld, nicht umlagefaehige Kosten, WEG und Underwriting nachziehen."
    ]);
  }
  if (input.status === "fit") {
    return [
      "Mietvertrag, Hausgeld, WEG-Protokolle und Bankannahmen als Belege in die Freigabe legen.",
      "Reinvestitionslogik im Memo dokumentieren: Cashflow bleibt in der Gesellschaft."
    ];
  }
  return uniqueItems([
    "Preis so nachverhandeln, dass Cashflow, DSCR und Stress-Cashflow ohne Wertsteigerung tragen.",
    ...input.warningReasons,
    "Steuer-/Kuerzungsthemen und Exit-These nur als Pruefhinweis, nicht als Kaufargument verwenden."
  ]).slice(0, 5);
}

function vvGmbhYieldTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) return "empty";
  if (value >= 7.5) return "good";
  if (value >= 6.5) return "watch";
  return "risk";
}

function vvGmbhDscrTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) return "empty";
  if (value >= 1.25) return "good";
  if (value >= 1.1) return "watch";
  return "risk";
}

function vvGmbhFinanceTone(dscr: number | null, stressedDscr: number | null, stressCashflow: number | null): ReturnType<typeof scoreTone> {
  if (dscr === null && stressedDscr === null && stressCashflow === null) return "empty";
  if ((dscr !== null && dscr < 1.1) || (stressedDscr !== null && stressedDscr < 1.1) || (stressCashflow !== null && stressCashflow < 0)) {
    return "risk";
  }
  if ((dscr !== null && dscr < 1.25) || (stressedDscr !== null && stressedDscr < 1.25)) {
    return "watch";
  }
  return "good";
}

function vvGmbhWegTone(wegScore: number | null, capex: number | null): ReturnType<typeof scoreTone> {
  if (wegScore === null && capex === null) return "empty";
  if ((wegScore !== null && wegScore < 65) || (capex !== null && capex > 0)) return "watch";
  return "good";
}

function vvGmbhWegCapexLabel(wegScore: number | null, capex: number | null): string {
  const parts = [
    wegScore !== null ? `WEG ${Math.round(wegScore)}` : "WEG fehlt",
    capex !== null && capex > 0 ? `Capex ${offerCurrencyText(capex)}` : null
  ].filter((item): item is string => Boolean(item));
  return parts.join(" · ");
}

export function assetManagementBrief(deals: Deal[]): AssetManagementBrief {
  const ownedDeals = deals.filter((deal) => deal.pipeline_stage === "Bought" || deal.status === "bought");
  const items = ownedDeals
    .map(assetManagementItem)
    .sort((left, right) => right.rankScore - left.rankScore);
  const alarmCount = items.filter((item) => item.status === "alarm").length;
  const watchCount = items.filter((item) => item.status === "watch").length;
  const monthlyCashflow = ownedDeals.reduce(
    (sum, deal) => sum + (numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax) ?? 0),
    0
  );
  const stressCashflow = ownedDeals.reduce(
    (sum, deal) => sum + (numberValue(deal.latest_underwriting?.stressed_monthly_cashflow_before_tax) ?? 0),
    0
  );
  const weakDscrCount = ownedDeals.filter((deal) => {
    const dscr = numberValue(deal.latest_underwriting?.dscr);
    const stressedDscr = numberValue(deal.latest_underwriting?.stressed_dscr);
    return (dscr !== null && dscr < 1.1) || (stressedDscr !== null && stressedDscr < 1.05);
  }).length;
  const wegRiskCount = ownedDeals.filter((deal) => {
    const score = numberValue(deal.weg_health?.results?.total_score);
    return score !== null && score < 65;
  }).length;
  const tone: ReturnType<typeof scoreTone> = alarmCount > 0 ? "risk" : watchCount > 0 ? "watch" : ownedDeals.length > 0 ? "good" : "empty";

  return {
    headline: assetManagementHeadline(ownedDeals.length, alarmCount, watchCount),
    summary: ownedDeals.length
      ? `${ownedDeals.length} gekaufte Objekte im Bestand. Monitoring prueft Cashflow, Stress-Cashflow, DSCR, Hausgeld/WEG und Capex, damit aus Ankauf kein blinder Bestand wird.`
      : "Noch keine gekauften Objekte im Bestand. Sobald ein Deal gekauft ist, wandert er in Cashflow-, WEG- und Covenant-Monitoring.",
    tone,
    statusLabel: alarmCount > 0 ? `${alarmCount} kritisch` : watchCount > 0 ? `${watchCount} beobachten` : ownedDeals.length > 0 ? "Stabil" : "Kein Bestand",
    facts: [
      { label: "Bestand", value: String(ownedDeals.length), tone: ownedDeals.length > 0 ? "good" : "empty" },
      { label: "Monats-Cashflow", value: offerCurrencyText(monthlyCashflow), tone: cashflowTone(monthlyCashflow) },
      { label: "Stress-Cashflow", value: offerCurrencyText(stressCashflow), tone: cashflowTone(stressCashflow) },
      { label: "Kritisch", value: String(alarmCount), tone: alarmCount > 0 ? "risk" : "good" },
      { label: "DSCR-Risiko", value: String(weakDscrCount), tone: weakDscrCount > 0 ? "risk" : "good" },
      { label: "WEG/Capex", value: String(wegRiskCount), tone: wegRiskCount > 0 ? "watch" : "good" }
    ],
    items
  };
}

function assetManagementItem(deal: Deal): AssetManagementItem {
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const stressCashflow = numberValue(deal.latest_underwriting?.stressed_monthly_cashflow_before_tax);
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const stressedDscr = numberValue(deal.latest_underwriting?.stressed_dscr);
  const wegScore = numberValue(deal.weg_health?.results?.total_score);
  const capex = numberValue(deal.listing?.expected_initial_capex);
  const houseMoney = numberValue(deal.listing?.house_money_monthly);
  const status = assetManagementStatus({ cashflow, capex, dscr, stressCashflow, stressedDscr, wegScore });
  const tone = assetManagementTone(status);
  const blocker = assetManagementBlocker({ cashflow, dscr, stressCashflow, wegScore });

  return {
    dealId: deal.id,
    title: deal.title,
    city: deal.listing?.city || "Ort fehlt",
    status,
    statusLabel: assetManagementStatusLabel(status),
    tone,
    cashflow: offerCurrencyText(cashflow ?? 0),
    stressCashflow: offerCurrencyText(stressCashflow ?? 0),
    dscr: dscr !== null ? formatNumber(dscr) : "Fehlt",
    wegScore: wegScore !== null ? `${Math.round(wegScore)}` : "Fehlt",
    blocker,
    proof: assetManagementProof({ capex, cashflow, houseMoney, stressCashflow, wegScore }),
    nextAction: assetManagementNextAction(status),
    href: `/deals/${deal.id}`,
    rankScore: assetManagementRankScore({ capex, cashflow, dscr, status, stressCashflow, stressedDscr, wegScore })
  };
}

function assetManagementHeadline(ownedCount: number, alarmCount: number, watchCount: number): string {
  if (ownedCount === 0) {
    return "Bestandsmonitor: noch kein Bestand";
  }
  if (alarmCount > 0) {
    return `Bestands-Alarm: ${alarmCount} Objekt${alarmCount === 1 ? "" : "e"} kritisch`;
  }
  if (watchCount > 0) {
    return `Bestand beobachten: ${watchCount} Objekt${watchCount === 1 ? "" : "e"} pruefen`;
  }
  return "Bestand stabil";
}

function assetManagementStatus(input: {
  cashflow: number | null;
  capex: number | null;
  dscr: number | null;
  stressCashflow: number | null;
  stressedDscr: number | null;
  wegScore: number | null;
}): AssetManagementItemStatus {
  if (
    (input.cashflow !== null && input.cashflow < 0) ||
    (input.stressCashflow !== null && input.stressCashflow < 0) ||
    (input.dscr !== null && input.dscr < 1) ||
    (input.stressedDscr !== null && input.stressedDscr < 1) ||
    (input.wegScore !== null && input.wegScore < 55)
  ) {
    return "alarm";
  }
  if (
    (input.dscr !== null && input.dscr < 1.15) ||
    (input.stressedDscr !== null && input.stressedDscr < 1.08) ||
    (input.wegScore !== null && input.wegScore < 70) ||
    (input.capex !== null && input.capex > 0)
  ) {
    return "watch";
  }
  return "stable";
}

function assetManagementTone(status: AssetManagementItemStatus): ReturnType<typeof scoreTone> {
  if (status === "alarm") return "risk";
  if (status === "watch") return "watch";
  return "good";
}

function assetManagementStatusLabel(status: AssetManagementItemStatus): string {
  if (status === "alarm") return "Asset-Alarm";
  if (status === "watch") return "Beobachten";
  return "Stabil";
}

function joinGermanList(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} und ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

function assetManagementBlocker(input: {
  cashflow: number | null;
  dscr: number | null;
  stressCashflow: number | null;
  wegScore: number | null;
}): string {
  const parts = [
    input.stressCashflow !== null ? `Stress-Cashflow ${offerCurrencyText(input.stressCashflow)}` : null,
    input.dscr !== null ? `DSCR ${formatNumber(input.dscr)}` : null,
    input.wegScore !== null ? `WEG-Score ${Math.round(input.wegScore)}` : null,
    input.cashflow !== null && input.cashflow < 0 ? `Ist-Cashflow ${offerCurrencyText(input.cashflow)}` : null
  ].filter((item): item is string => Boolean(item));

  return parts.length
    ? `${joinGermanList(parts.slice(0, 3))}.`
    : "Kein harter Bestandsblocker im aktuellen Datenstand.";
}

function assetManagementProof(input: {
  capex: number | null;
  cashflow: number | null;
  houseMoney: number | null;
  stressCashflow: number | null;
  wegScore: number | null;
}): string {
  return [
    `Cashflow ${offerCurrencyText(input.cashflow ?? 0)}`,
    `Stress ${offerCurrencyText(input.stressCashflow ?? 0)}`,
    input.houseMoney !== null ? `Hausgeld ${offerCurrencyText(input.houseMoney)}` : "Hausgeld fehlt",
    input.wegScore !== null ? `WEG ${Math.round(input.wegScore)}` : "WEG fehlt",
    input.capex !== null && input.capex > 0 ? `Capex ${offerCurrencyText(input.capex)}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

function assetManagementNextAction(status: AssetManagementItemStatus): string {
  if (status === "alarm") {
    return "Mieteingang, Hausgeld, Ruecklage und Bank-Covenants pruefen.";
  }
  if (status === "watch") {
    return "Quartalscheck fuer Cashflow, Hausgeld, Capex und WEG-Unterlagen terminieren.";
  }
  return "Monatlichen Cashflow und WEG-/Covenant-Unterlagen weiter dokumentieren.";
}

function assetManagementRankScore(input: {
  capex: number | null;
  cashflow: number | null;
  dscr: number | null;
  status: AssetManagementItemStatus;
  stressCashflow: number | null;
  stressedDscr: number | null;
  wegScore: number | null;
}): number {
  const statusBase = input.status === "alarm" ? 1000 : input.status === "watch" ? 500 : 100;
  const cashflowPenalty = Math.max(0, -(input.cashflow ?? 0)) + Math.max(0, -(input.stressCashflow ?? 0));
  const dscrPenalty = Math.max(0, 1.1 - (input.dscr ?? 1.1)) * 200 + Math.max(0, 1.05 - (input.stressedDscr ?? 1.05)) * 160;
  const wegPenalty = input.wegScore !== null ? Math.max(0, 75 - input.wegScore) * 4 : 80;
  const capexPenalty = input.capex !== null && input.capex > 0 ? Math.min(120, input.capex / 500) : 0;
  return statusBase + cashflowPenalty + dscrPenalty + wegPenalty + capexPenalty;
}

export function acquisitionDecisionLeverageBrief(
  center: AcquisitionCommandCenter
): AcquisitionDecisionLeverageBrief {
  const activeDeals = center.deal_decisions.filter((deal) => deal.decision !== "reject");
  const priceDeals = activeDeals.filter((deal) => dealNeedsPriceOrFinancingWork(deal));
  const locationDeals = activeDeals.filter((deal) => dealNeedsLocationOrDevelopmentWork(deal));
  const dataDeals = activeDeals.filter((deal) => dealNeedsDataOrEvidenceWork(deal) && !dealNeedsPriceOrFinancingWork(deal));
  const bankDeals = center.selected_deals_now.length
    ? center.selected_deals_now
    : activeDeals.filter((deal) => deal.decision === "buy");
  const listingDeals = center.deal_radar.filter((listing) => listingReadyForDealConversion(listing));

  const levers = [
    acquisitionDealLeverage({
      key: "price_financing",
      label: "Preis/Finanzierung",
      owner: "Ankauf/Bank",
      deals: priceDeals,
      tone: "risk",
      rankBase: 900,
      detailKeywords: ["cashflow", "dscr", "preis", "kaufpreis", "finanzierung", "kapitaldienst"],
      fallbackDetail: "Preis, Cashflow, DSCR oder Finanzierung blockieren die Ankaufsthese.",
      fallbackAction: "Kaufpreis, Zins, Tilgung und Cashflow so lange nachziehen, bis die Buy-Box traegt."
    }),
    acquisitionDealLeverage({
      key: "bank_readiness",
      label: "Bank/IC-Freigabe",
      owner: "Finanzierung",
      deals: bankDeals,
      tone: "good",
      rankBase: 800,
      detailKeywords: ["bank", "freigabe", "angebot", "unterlagen"],
      fallbackDetail: "Kaufbare Deals brauchen jetzt Bankpaket, Unterlagenfreigabe und IC-Story.",
      fallbackAction: "Bankpaket, Freigabe-Gates und indikatives Angebot vorbereiten."
    }),
    acquisitionDealLeverage({
      key: "location_development",
      label: "Mikrolage/Entwicklung",
      owner: "Besichtigung/Asset",
      deals: locationDeals,
      tone: "watch",
      rankBase: 700,
      detailKeywords: [
        "mikrolage",
        "lagecheck",
        "lage-check",
        "standort",
        "entwicklung",
        "sanierung",
        "weg",
        "geo",
        "baurecht",
        "airbnb",
        "messe",
        "bahnhof",
        "u-bahn"
      ],
      fallbackDetail: "Mikrolage, WEG, Geo oder Entwicklungspotential koennen Preis und Exit noch stark bewegen.",
      fallbackAction: "Mikrolage, WEG, Geo, Capex und Entwicklungspotential mit Belegen schliessen."
    }),
    acquisitionDealLeverage({
      key: "data_evidence",
      label: "Daten/Belege",
      owner: "Research/Ankauf",
      deals: dataDeals,
      tone: "watch",
      rankBase: 600,
      detailKeywords: ["score", "daten", "beleg", "unterlagen", "fehlt", "pruefen", "bewerten"],
      fallbackDetail: "Score, Underwriting oder Pflichtbelege fehlen und verhindern eine saubere Entscheidung.",
      fallbackAction: "Fehlende Daten, Unterlagen, Score und Underwriting nachziehen."
    }),
    acquisitionListingLeverage(listingDeals)
  ]
    .filter((lever): lever is AcquisitionDecisionLeverage => Boolean(lever))
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 5);

  const topLever = levers[0] || null;

  return {
    headline: topLever ? `Groesster Hebel: ${topLever.label}` : "Keine offenen Entscheidungshebel",
    summary: topLever
      ? `${levers.length} priorisierte Hebel zeigen, welche Pruefung die Ankaufspipeline am schnellsten weiterbringt.`
      : "Aktuell gibt es keine Deals oder Listings, die eine priorisierte Ankaufshandlung ausloesen.",
    tone: topLever?.tone || "empty",
    levers
  };
}

export function acquisitionWorkOrderBrief(center: AcquisitionCommandCenter): AcquisitionWorkOrderBrief {
  const dealOrders = center.deal_decisions
    .filter((deal) => deal.decision !== "reject")
    .map(acquisitionDealWorkOrder);
  const listingOrders = center.deal_radar
    .filter((listing) => listingReadyForDealConversion(listing))
    .map(acquisitionListingWorkOrder);
  const orders = [...dealOrders, ...listingOrders]
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 6);
  const criticalCount = orders.filter((order) => order.tone === "risk").length;
  const topOrder = orders[0] || null;
  const topOwner = topOrder?.owner || "Offen";
  const tone: ReturnType<typeof scoreTone> = criticalCount > 0 ? "risk" : orders.some((order) => order.tone === "good") ? "good" : orders.length ? "watch" : "empty";

  return {
    headline: orders.length
      ? `Arbeitsauftraege: ${orders.length} konkrete naechste Schritte`
      : "Keine offenen Arbeitsauftraege",
    summary: orders.length
      ? `${topOwner} startet mit "${topOrder?.label}". Jeder Auftrag zeigt Blocker, Beweis und naechsten Schritt.`
      : "Aktuell gibt es keine Deal- oder Listing-Aufgabe aus der Kaufmaschine.",
    tone,
    facts: [
      {
        label: "Kritisch",
        value: String(criticalCount),
        tone: criticalCount > 0 ? "risk" : "good"
      },
      {
        label: "Diese Woche",
        value: String(orders.length),
        tone: orders.length > 0 ? "watch" : "empty"
      },
      {
        label: "Owner",
        value: topOwner,
        tone: topOrder?.tone || "empty"
      },
      {
        label: "Listings",
        value: String(orders.filter((order) => order.kind === "listing").length),
        tone: listingOrders.length > 0 ? "watch" : "empty"
      }
    ],
    orders
  };
}

export function dataSourcesHealthBrief(sources: DataSource[], now = new Date()): DataSourcesHealthBrief {
  const sourceCount = sources.length;
  const averageReliability = sourceCount
    ? Math.round(sources.reduce((sum, source) => sum + (numberValue(source.reliability_score) ?? 0), 0) / sourceCount)
    : 0;
  const licenseOpenCount = sources.filter(sourceHasOpenLicenseQuestion).length;
  const workOrders = sources
    .map((source) => dataSourcePrimaryWorkOrder(source, now))
    .filter((order): order is DataSourceHealthWorkOrder => Boolean(order))
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 6);
  const criticalSourceCount = workOrders.filter((order) => order.tone === "risk").length;
  const tone: ReturnType<typeof scoreTone> =
    sourceCount === 0 ? "empty" : criticalSourceCount > 0 ? "risk" : licenseOpenCount > 0 || averageReliability < 75 ? "watch" : "good";
  const headline =
    sourceCount === 0
      ? "Keine Quellen registriert"
      : criticalSourceCount > 0
        ? "Quellenregister braucht Aktualisierung"
        : licenseOpenCount > 0
          ? "Lizenzlage pruefen"
          : "Quellenregister belastbar";

  return {
    headline,
    summary: dataSourcesHealthSummary({
      sourceCount,
      criticalSourceCount,
      licenseOpenCount,
      averageReliability
    }),
    tone,
    facts: [
      {
        label: "Quellen",
        value: String(sourceCount),
        tone: sourceCount > 0 ? "good" : "empty"
      },
      {
        label: "Kritisch",
        value: String(criticalSourceCount),
        tone: criticalSourceCount > 0 ? "risk" : "good"
      },
      {
        label: "Lizenz offen",
        value: String(licenseOpenCount),
        tone: licenseOpenCount > 0 ? "watch" : "good"
      },
      {
        label: "Ø Verlaesslichkeit",
        value: String(averageReliability),
        tone: scoreTone(sourceCount ? averageReliability : null)
      }
    ],
    workOrders
  };
}

function acquisitionDealWorkOrder(deal: DealDecision): AcquisitionWorkOrder {
  const tone = acquisitionDealWorkOrderTone(deal);
  const label = acquisitionDealWorkOrderLabel(deal);
  const owner = acquisitionDealWorkOrderOwner(deal);
  const blocker = deal.constraints[0] || acquisitionDealWorkOrderBlocker(deal);

  return {
    id: `deal-${deal.deal_id}`,
    kind: "deal",
    label,
    owner,
    title: deal.title,
    subtitle: `${deal.city || "Ort fehlt"} · ${deal.pipeline_stage} · ${deal.decision_label}`,
    blocker,
    proof: acquisitionDealWorkOrderProof(deal),
    nextAction: deal.next_action || acquisitionDealWorkOrderNextAction(deal),
    href: `/deals/${deal.deal_id}`,
    tone,
    rankScore: acquisitionDealWorkOrderRank(deal, tone)
  };
}

function acquisitionDealWorkOrderLabel(deal: DealDecision): string {
  if (deal.decision === "buy") return "Freigabe bauen";
  if (dealNeedsPriceOrFinancingWork(deal)) return "Preis/Finanzierung reparieren";
  if (dealNeedsLocationOrDevelopmentWork(deal)) return "Mikrolage/Entwicklung belegen";
  return "Datenpaket schliessen";
}

function acquisitionDealWorkOrderOwner(deal: DealDecision): string {
  if (deal.decision === "buy") return "Finanzierung/Ankauf";
  if (dealNeedsPriceOrFinancingWork(deal)) return "Ankauf/Bank";
  if (dealNeedsLocationOrDevelopmentWork(deal)) return "Besichtigung/Asset";
  return "Research/Ankauf";
}

function acquisitionDealWorkOrderTone(deal: DealDecision): ReturnType<typeof scoreTone> {
  if (dealNeedsPriceOrFinancingWork(deal) || deal.decision === "negotiate") return "risk";
  if (deal.decision === "buy") return "good";
  return "watch";
}

function acquisitionDealWorkOrderBlocker(deal: DealDecision): string {
  if (deal.decision === "buy") return "Keine harte Buy-Box-Bremse.";
  if (dealNeedsPriceOrFinancingWork(deal)) return "Preis, DSCR oder Cashflow blockiert die Entscheidung.";
  if (dealNeedsLocationOrDevelopmentWork(deal)) return "Mikrolage, WEG, Geo oder Entwicklung ist noch nicht belegbar.";
  return "Score, Underwriting oder Pflichtbelege fehlen.";
}

function acquisitionDealWorkOrderProof(deal: DealDecision): string {
  const score = deal.total_score !== null && deal.total_score !== undefined ? `Score ${formatNumber(deal.total_score)}` : "Score fehlt";
  const dscr = deal.dscr !== null && deal.dscr !== undefined ? `DSCR ${formatNumber(deal.dscr)}` : "DSCR fehlt";
  const cashflow = `Cashflow ${offerCurrencyText(deal.monthly_cashflow_before_tax)}`;
  const equity = deal.equity_required > 0 ? `EK ${offerCurrencyText(deal.equity_required)}` : "EK offen";
  return `${score} · ${dscr} · ${cashflow} · ${equity}`;
}

function acquisitionDealWorkOrderNextAction(deal: DealDecision): string {
  if (deal.decision === "buy") return "Bankpaket, Unterlagen und Angebot vorbereiten.";
  if (dealNeedsPriceOrFinancingWork(deal)) return "Preis, Finanzierung oder Miete so anpassen, dass DSCR und Cashflow tragen.";
  if (dealNeedsLocationOrDevelopmentWork(deal)) return "Mikrolage, WEG, Geo und Entwicklungspotential mit Belegen schliessen.";
  return "Fehlende Daten erfassen, dann Score und Underwriting neu rechnen.";
}

function acquisitionDealWorkOrderRank(deal: DealDecision, tone: ReturnType<typeof scoreTone>): number {
  const toneBoost = tone === "risk" ? 1000 : tone === "good" ? 760 : 520;
  const decisionBoost = deal.decision === "buy" ? 140 : deal.decision === "negotiate" ? 220 : 80;
  return toneBoost + decisionBoost + deal.priority_score;
}

function acquisitionListingWorkOrder(listing: ListingOpportunity): AcquisitionWorkOrder {
  return {
    id: `listing-${listing.id}`,
    kind: "listing",
    label: "Listing in Deal wandeln",
    owner: "Sourcing",
    title: listing.title,
    subtitle: `${listing.city || "Ort fehlt"} · ${listing.source || "Quelle offen"} · Score ${listing.priority_score}`,
    blocker: "Noch kein Deal mit Underwriting und Score.",
    proof: acquisitionListingWorkOrderProof(listing),
    nextAction: listing.next_action,
    href: "/listings",
    tone: "watch",
    rankScore: 650 + listing.priority_score + (listing.price_reduction_count > 0 ? 40 : 0)
  };
}

function acquisitionListingWorkOrderProof(listing: ListingOpportunity): string {
  const days = listing.days_on_market !== null && listing.days_on_market !== undefined ? `${listing.days_on_market} Tage online` : "Marktdauer fehlt";
  const reductions = `${listing.price_reduction_count}x Preisreduktion`;
  const yieldText = listing.gross_yield_percent !== null && listing.gross_yield_percent !== undefined ? `Brutto ${formatPercent(listing.gross_yield_percent)}` : "Rendite fehlt";
  return `Score ${listing.priority_score} · ${days} · ${reductions} · ${yieldText}`;
}

function acquisitionDealLeverage(input: {
  key: AcquisitionDecisionLeverage["key"];
  label: string;
  owner: string;
  deals: DealDecision[];
  tone: ReturnType<typeof scoreTone>;
  rankBase: number;
  detailKeywords?: string[];
  fallbackDetail: string;
  fallbackAction: string;
}): AcquisitionDecisionLeverage | null {
  if (input.deals.length === 0) {
    return null;
  }
  const firstDeal = [...input.deals].sort((left, right) => right.priority_score - left.priority_score)[0];
  const detail = firstRelevantConstraint(firstDeal, input.detailKeywords) || input.fallbackDetail;
  const action = firstDeal.next_action || input.fallbackAction;
  const cashflowDrag = input.deals.reduce((sum, deal) => {
    const cashflow = numberValue(deal.monthly_cashflow_before_tax);
    return cashflow !== null && cashflow < 0 ? sum + Math.abs(cashflow) : sum;
  }, 0);

  return {
    key: input.key,
    label: input.label,
    value: countLabel(input.deals.length, "Deal"),
    detail,
    action,
    owner: input.owner,
    href: `/deals/${firstDeal.deal_id}`,
    tone: input.tone,
    rankScore: input.rankBase + input.deals.reduce((sum, deal) => sum + deal.priority_score, 0) + Math.min(80, cashflowDrag / 10)
  };
}

function acquisitionListingLeverage(listings: ListingOpportunity[]): AcquisitionDecisionLeverage | null {
  if (listings.length === 0) {
    return null;
  }
  const firstListing = [...listings].sort((left, right) => right.priority_score - left.priority_score)[0];
  return {
    key: "listing_flow",
    label: "Listing-Zufluss",
    value: countLabel(listings.length, "Listing"),
    detail: `${firstListing.title}: ${firstListing.signals.length ? firstListing.signals.join(", ") : "neuer Ankaufskandidat"}.`,
    action: firstListing.next_action || "Listing in Deal wandeln und voll unterwriten.",
    owner: "Sourcing",
    href: "/listings",
    tone: "watch",
    rankScore: 500 + listings.reduce((sum, listing) => sum + listing.priority_score, 0)
  };
}

function dealNeedsPriceOrFinancingWork(deal: DealDecision): boolean {
  const text = dealSignalText(deal);
  const cashflow = numberValue(deal.monthly_cashflow_before_tax);
  const dscr = numberValue(deal.dscr);
  return (
    deal.decision === "negotiate" &&
    (cashflow !== null && cashflow < 0 ||
      dscr !== null && dscr < 1.1 ||
      includesAny(text, ["cashflow", "dscr unter", "preis", "kaufpreis", "finanzierung", "kapitaldienst"]))
  );
}

function dealNeedsLocationOrDevelopmentWork(deal: DealDecision): boolean {
  return includesAny(dealSignalText(deal), [
    "mikrolage",
    "lagecheck",
    "lage-check",
    "standort",
    "entwicklung",
    "sanierung",
    "weg",
    "geo",
    "baurecht",
    "airbnb",
    "messe",
    "bahnhof",
    "u-bahn"
  ]);
}

function dealNeedsDataOrEvidenceWork(deal: DealDecision): boolean {
  const text = dealSignalText(deal);
  return (
    deal.total_score === null ||
    deal.total_score === undefined ||
    deal.dscr === null ||
    deal.dscr === undefined ||
    includesAny(text, ["score fehlt", "daten", "beleg", "unterlagen", "fehlt", "pruefen", "bewerten"])
  );
}

function listingReadyForDealConversion(listing: ListingOpportunity): boolean {
  const text = `${listing.next_action} ${listing.signals.join(" ")}`.toLowerCase();
  return text.includes("in deal wandeln") || text.includes("price_reduction") || listing.priority_score >= 70;
}

function dealSignalText(deal: DealDecision): string {
  return `${deal.constraints.join(" ")} ${deal.next_action}`.toLowerCase();
}

function firstRelevantConstraint(deal: DealDecision, keywords?: string[]): string | null {
  if (keywords?.length) {
    const matchingConstraint = deal.constraints.find((constraint) => includesAny(constraint.toLowerCase(), keywords));
    if (matchingConstraint) {
      return matchingConstraint;
    }
    if (includesAny(deal.next_action.toLowerCase(), keywords)) {
      return deal.next_action;
    }
  }
  return deal.constraints.find((constraint) => constraint.trim().length > 0) || deal.next_action || null;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function dataSourcesHealthSummary(input: {
  sourceCount: number;
  criticalSourceCount: number;
  licenseOpenCount: number;
  averageReliability: number;
}): string {
  if (input.sourceCount === 0) {
    return "Noch keine Quellen im Register. Standard-Quellen anlegen und danach Importdatum, Lizenz und Datenstand pflegen.";
  }
  const criticalLabel = `${input.criticalSourceCount} kritische ${input.criticalSourceCount === 1 ? "Quelle" : "Quellen"}`;
  const licenseLabel = `${input.licenseOpenCount} offene ${input.licenseOpenCount === 1 ? "Lizenzfrage" : "Lizenzfragen"}`;
  return `${criticalLabel}, ${licenseLabel} und Ø Verlaesslichkeit ${input.averageReliability}.`;
}

function dataSourcePrimaryWorkOrder(source: DataSource, now: Date): DataSourceHealthWorkOrder | null {
  const reliability = numberValue(source.reliability_score) ?? 0;
  const dataAgeDays = daysSince(source.source_data_date, now);
  const importAgeDays = daysSince(source.last_import_at, now);
  const freshnessLimitDays = dataFreshnessLimitDays(source);

  if (!source.last_import_at) {
    return {
      sourceName: source.name,
      label: "Import fehlt",
      detail: "Im Register steht noch kein letzter Import. Ohne Importdatum ist unklar, ob die Quelle wirklich aktuell im Tool landet.",
      action: source.data_type === "listings"
        ? "Suchagent pruefen und letzten Import dokumentieren."
        : "Quelle importieren oder manuell als geprueft markieren.",
      owner: sourceOwner(source),
      tone: "risk",
      rankScore: 1000 + Math.max(0, 100 - reliability)
    };
  }

  if (source.commercial_use_allowed === false) {
    return {
      sourceName: source.name,
      label: "Lizenz begrenzt",
      detail: "Die Quelle ist im Register nicht fuer kommerzielle Nutzung freigegeben.",
      action: "Lizenz klaeren oder diese Quelle nur als interne Notiz nutzen.",
      owner: "Operations/Legal",
      tone: "risk",
      rankScore: 940
    };
  }

  if (dataAgeDays !== null && dataAgeDays > freshnessLimitDays) {
    return {
      sourceName: source.name,
      label: "Datenstand alt",
      detail: `Der dokumentierte Datenstand ist aelter als ${Math.round(freshnessLimitDays / 365)} Jahre.`,
      action: "Datenstand aktualisieren und Quelle im Register dokumentieren.",
      owner: sourceOwner(source),
      tone: "risk",
      rankScore: 880 + Math.min(80, Math.round((dataAgeDays - freshnessLimitDays) / 30))
    };
  }

  if (importAgeDays !== null && importAgeDays > importFreshnessLimitDays(source)) {
    return {
      sourceName: source.name,
      label: "Import veraltet",
      detail: "Der letzte Import passt nicht mehr zur geplanten Aktualisierungsfrequenz.",
      action: "Import erneut laufen lassen und danach die betroffenen Auswertungen pruefen.",
      owner: sourceOwner(source),
      tone: "risk",
      rankScore: 850 + Math.min(70, Math.round(importAgeDays / 7))
    };
  }

  if (reliability < 60) {
    return {
      sourceName: source.name,
      label: "Verlaesslichkeit niedrig",
      detail: "Diese Quelle ist nuetzlich, sollte aber nicht allein eine Ankaufsthese tragen.",
      action: "Mit amtlicher Quelle, Mietspiegel oder zweiter Marktdatenquelle gegenpruefen.",
      owner: sourceOwner(source),
      tone: "risk",
      rankScore: 820 + (60 - reliability)
    };
  }

  if (sourceHasOpenLicenseQuestion(source)) {
    return {
      sourceName: source.name,
      label: "Lizenz klaeren",
      detail: "Nutzung oder Lizenztyp sind im Register noch nicht eindeutig dokumentiert.",
      action: "Lizenztext pruefen und kommerzielle Nutzung im Quellenregister festhalten.",
      owner: "Operations/Legal",
      tone: "watch",
      rankScore: 720
    };
  }

  if (!source.source_data_date) {
    return {
      sourceName: source.name,
      label: "Datenstand fehlt",
      detail: "Die Quelle hat noch keinen dokumentierten Stichtag oder Datenstand.",
      action: "Stichtag nachtragen, damit spaeter klar bleibt, welche Marktlage bewertet wurde.",
      owner: sourceOwner(source),
      tone: "watch",
      rankScore: 650
    };
  }

  return null;
}

function sourceHasOpenLicenseQuestion(source: DataSource): boolean {
  const license = source.license_type?.trim();
  return source.commercial_use_allowed === null || source.commercial_use_allowed === undefined || !license || license === "?";
}

function sourceOwner(source: DataSource): string {
  if (source.data_type === "listings") {
    return "Sourcing";
  }
  if (source.data_type === "rent_reference") {
    return "Research/Ankauf";
  }
  if (["ground_value", "demographics", "foreclosures"].includes(source.data_type)) {
    return "Research/Geo";
  }
  if (source.data_type === "manual") {
    return "Ankauf";
  }
  return "Operations";
}

function dataFreshnessLimitDays(source: DataSource): number {
  if (source.data_type === "listings") {
    return 90;
  }
  if (source.data_type === "rent_reference") {
    return 730;
  }
  if (source.data_type === "ground_value") {
    return 548;
  }
  if (source.data_type === "demographics") {
    return 1825;
  }
  if (source.data_type === "foreclosures") {
    return 45;
  }
  return 730;
}

function importFreshnessLimitDays(source: DataSource): number {
  const frequency = (source.update_frequency || "").toLowerCase();
  if (frequency.includes("taeglich") || frequency.includes("daily") || source.data_type === "listings") {
    return 14;
  }
  if (frequency.includes("laufend") || source.data_type === "foreclosures") {
    return 30;
  }
  if (frequency.includes("2 jahre") || frequency.includes("zweijaehr")) {
    return 820;
  }
  if (frequency.includes("jaehr")) {
    return 460;
  }
  return 365;
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export function dealInvestmentCommitteeBrief(deal: Deal): DealInvestmentCommitteeBrief {
  const readiness = acquisitionReadinessSummary(deal);
  const offerBand = dealOfferBandBrief(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const blockers = readiness.gates.filter((gate) => gate.status === "block").map(committeeItemFromGate);
  const reviewItems = readiness.gates.filter((gate) => gate.status === "review").map(committeeItemFromGate);
  const status: DealInvestmentCommitteeBrief["status"] =
    blockers.length > 0 ? "blocked" : reviewItems.length > 0 ? "conditional" : "ready";
  const tone: ReturnType<typeof scoreTone> = status === "ready" ? "good" : status === "blocked" ? "risk" : "watch";
  const walkAwayText = offerBand.walkAwayPrice !== null ? offerCurrencyText(offerBand.walkAwayPrice) : "Fehlt";

  return {
    status,
    headline: committeeHeadline(status),
    tone,
    decisionLabel: committeeDecisionLabel(status),
    stopRule: committeeStopRule(status, blockers.length, reviewItems.length),
    blockers,
    reviewItems,
    memoItems: committeeMemoItems(readiness, offerBand, evidence, developmentPricing),
    nextQuestions: uniqueItems([...blockers, ...reviewItems].map((item) => item.action).filter(Boolean)).slice(0, 6),
    facts: [
      {
        label: "Komitee-Status",
        value: committeeDecisionLabel(status),
        tone
      },
      {
        label: "Freigabe",
        value: `${readiness.readyCount}/${readiness.total}`,
        tone: readiness.tone
      },
      {
        label: "Blocker",
        value: String(blockers.length),
        tone: blockers.length > 0 ? "risk" : "good"
      },
      {
        label: "Review",
        value: String(reviewItems.length),
        tone: reviewItems.length > 0 ? "watch" : "good"
      },
      {
        label: "Walk-away",
        value: walkAwayText,
        tone: offerBand.tone
      }
    ]
  };
}

export function dealAcquisitionThesisBrief(deal: Deal): DealAcquisitionThesisBrief {
  const market = dealMarketComparisonBrief(deal);
  const development = dealDevelopmentPricingDisciplineBrief(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const exit = dealExitLiquidityBrief(deal);
  const offerDecision = dealOfferDecisionBrief(deal);
  const status = acquisitionThesisStatus({
    development,
    evidence,
    exit,
    market,
    offerDecision
  });
  const tone = acquisitionThesisTone(status);
  const lanes = acquisitionThesisLanes({ development, evidence, exit, market });
  const marketGapText = market.marketGapEur !== null ? `${offerCurrencyText(market.marketGapEur)} Markt-Gap` : "Markt-Gap fehlt";
  const priceCreditText = `${offerCurrencyText(development.allowedCreditEur)} Preis-Credit`;

  return {
    status,
    headline: acquisitionThesisHeadline(status, market),
    tone,
    thesisLabel: acquisitionThesisLabel(status, market),
    summary: `${marketGapText}, ${priceCreditText}, ${evidence.percent} % Beleg-Score und ${exit.estimatedExitDiscountPercent} % Exit-Abschlag. ${acquisitionThesisSummaryTail(status)}`,
    facts: [
      {
        label: "Markt-Gap",
        value: market.marketGapEur !== null ? offerCurrencyText(market.marketGapEur) : "Fehlt",
        tone: market.tone
      },
      {
        label: "Preis-Credit",
        value: offerCurrencyText(development.allowedCreditEur),
        tone: development.tone
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      },
      {
        label: "Exit-Abschlag",
        value: `${exit.estimatedExitDiscountPercent} %`,
        tone: exit.estimatedExitDiscountPercent <= 3 ? "good" : exit.estimatedExitDiscountPercent <= 6 ? "watch" : "risk"
      }
    ],
    lanes,
    guardrails: acquisitionThesisGuardrails({ development, evidence, exit, market }),
    nextActions: acquisitionThesisNextActions({ development, evidence, exit, market })
  };
}

export function dealMemoCockpitBrief(deal: Deal): DealMemoCockpitBrief {
  const committee = dealInvestmentCommitteeBrief(deal);
  const offerBand = dealOfferBandBrief(deal);
  const locationAlpha = dealMicroLocationAlphaBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const walkAwayText = offerBand.walkAwayPrice !== null ? offerCurrencyText(offerBand.walkAwayPrice) : "Fehlt";

  return {
    status: committee.status,
    headline: `Memo-Cockpit: ${committee.decisionLabel}`,
    tone: committee.tone,
    oneLineDecision: memoCockpitOneLineDecision(committee.status),
    facts: [
      {
        label: "Komitee",
        value: committee.decisionLabel,
        tone: committee.tone
      },
      {
        label: "Walk-away",
        value: walkAwayText,
        tone: offerBand.tone
      },
      {
        label: "Lage-Alpha",
        value: memoCockpitLocationValue(locationAlpha, deal),
        tone: locationAlpha.tone
      },
      {
        label: "Entwicklung",
        value: `${offerCurrencyText(developmentPricing.allowedCreditEur)} Preis-Credit`,
        tone: developmentPricing.tone
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      }
    ],
    decisionMemo: memoCockpitDecisionMemo(committee, offerBand, locationAlpha, developmentPricing, evidence),
    bankQuestions: memoCockpitBankQuestions({
      cashflow,
      dscr,
      developmentPricing,
      evidence,
      walkAwayText
    }),
    handoffChecklist: memoCockpitHandoffChecklist(committee, locationAlpha, developmentPricing, evidence)
  };
}

export function dealDossierCockpitBrief(deal: Deal): DealDossierCockpitBrief {
  const offerRelease = dealOfferReleasePackageBrief(deal);
  const committee = dealInvestmentCommitteeBrief(deal);
  const memo = dealMemoCockpitBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const development = dossierDevelopmentSnapshot(dealDevelopmentPotentialMapBrief(deal));
  const bank = dossierBankReadiness(deal);
  const notary = dossierNotaryReadiness({ bank, offerRelease, readiness });
  const packages: DealDossierCockpitPackage[] = [
    dossierSellerPackage(offerRelease, documents),
    dossierCommitteePackage(committee, memo),
    dossierBankPackage(bank, memo),
    dossierNotaryPackage(notary, readiness)
  ];
  const status = dossierCockpitStatus({ bank, committee, notary, offerRelease });
  const tone = dossierCockpitTone(status);
  const decisionLabel = dossierCockpitDecisionLabel(status);

  return {
    status,
    headline: dossierCockpitHeadline(status),
    tone,
    decisionLabel,
    summary: `${decisionLabel}: ${packages.filter((item) => item.tone === "risk").length} harte Dossier-Blocker, ${documents.percent} % Unterlagenstand, ${readiness.readyCount}/${readiness.total} Freigabe-Gates und Entwicklung ${development.statusLabel.toLowerCase()}.`,
    stopRule: dossierCockpitStopRule(status, notary.statusLabel),
    copyChecklist: dossierCopyChecklist({ bank, committee, development, documents, memo, notary, offerRelease }),
    development,
    facts: [
      {
        label: "Dossier",
        value: decisionLabel,
        tone
      },
      {
        label: "Entwicklungspotential",
        value: `${development.label} · ${development.statusLabel}`,
        tone: development.tone
      },
      {
        label: "Verkaeufer",
        value: dossierSellerStatusLabel(offerRelease.status),
        tone: offerRelease.tone
      },
      {
        label: "Komitee",
        value: committee.headline,
        tone: committee.tone
      },
      {
        label: "Bank",
        value: bank.statusLabel,
        tone: bank.tone
      },
      {
        label: "Notar",
        value: notary.statusLabel,
        tone: notary.tone
      }
    ],
    packages
  };
}

export function bankPackageCreditBrief(bankPackage: BankPackage): BankPackageCreditBrief {
  const dscr = bankPackageNumberValue(bankPackage.bank_summary.dscr);
  const cashflow = bankPackageNumberValue(bankPackage.bank_summary.monthly_cashflow_before_tax);
  const stressedCashflow = bankPackageNumberValue(bankPackage.financing_request.stressed_monthly_cashflow_before_tax);
  const requestedLoan = bankPackageNumberValue(bankPackage.financing_request.requested_loan_amount);
  const suggestedEquity = bankPackageNumberValue(bankPackage.financing_request.suggested_equity);
  const financedCapex = bankPackageNumberValue(bankPackage.financing_request.financed_capex);
  const missingDocuments = bankPackage.missing_documents || [];
  const hasRenovationSection = bankPackage.sections.some((section) =>
    section.title.toLowerCase().includes("sanierungs") || section.title.toLowerCase().includes("refi")
  );
  const hardRisk = bankPackage.risks.some((risk) => {
    const normalized = risk.toLowerCase();
    return normalized.includes("dscr") || normalized.includes("negative_cashflow") || normalized.includes("financing");
  });
  const dscrBlocked = dscr !== null && dscr < 1.1;
  const cashflowBlocked = cashflow !== null && cashflow < 0;
  const stressedWeak = stressedCashflow !== null && stressedCashflow < 0;
  const status: BankPackageCreditBrief["status"] =
    dscrBlocked || cashflowBlocked || hardRisk
      ? "blocked"
      : missingDocuments.length > 0 || stressedWeak || (dscr !== null && dscr < 1.2)
        ? "conditional"
        : "bankable";
  const tone = bankPackageCreditTone(status);
  const statusLabel = bankPackageCreditLabel(status);
  const covenantChecks = bankPackageCovenantChecks({ cashflow, dscr, stressedCashflow });
  const creditStory = bankPackageCreditStory({
    financedCapex,
    hasRenovationSection,
    requestedLoan,
    status,
    suggestedEquity
  });
  const conditions = bankPackageConditions({
    cashflowBlocked,
    dscrBlocked,
    missingDocuments,
    risks: bankPackage.risks,
    stressedWeak
  });

  return {
    status,
    headline: `Bank-Cockpit: ${statusLabel}`,
    tone,
    oneLineDecision: bankPackageOneLineDecision(status),
    facts: [
      {
        label: "Bank-Status",
        value: statusLabel,
        tone
      },
      {
        label: "Darlehen",
        value: bankPackageCurrencyText(requestedLoan),
        tone: requestedLoan !== null ? "watch" : "empty"
      },
      {
        label: "Eigenkapital",
        value: bankPackageCurrencyText(suggestedEquity),
        tone: suggestedEquity !== null ? "watch" : "empty"
      },
      {
        label: "DSCR",
        value: formatNumber(dscr),
        tone: dscrTone(dscr)
      },
      {
        label: "Cashflow",
        value: bankPackageCurrencyText(cashflow),
        tone: cashflowTone(cashflow)
      },
      {
        label: "Stress-Cashflow",
        value: bankPackageCurrencyText(stressedCashflow),
        tone: cashflowTone(stressedCashflow)
      },
      {
        label: "Unterlagen",
        value: missingDocuments.length > 0 ? `${missingDocuments.length} fehlen` : "vollstaendig",
        tone: missingDocuments.length > 0 ? "risk" : "good"
      }
    ],
    covenantChecks,
    creditStory,
    conditions,
    lenderRequest: bankPackageLenderRequest({
      bankPackage,
      cashflow,
      conditions,
      covenantChecks,
      dscr,
      missingDocuments,
      requestedLoan,
      status,
      statusLabel,
      stressedCashflow,
      suggestedEquity
    })
  };
}

function bankPackageCreditTone(status: BankPackageCreditBrief["status"]): ReturnType<typeof scoreTone> {
  if (status === "bankable") {
    return "good";
  }
  if (status === "blocked") {
    return "risk";
  }
  return "watch";
}

function bankPackageCreditLabel(status: BankPackageCreditBrief["status"]): string {
  if (status === "bankable") {
    return "Bankfaehig";
  }
  if (status === "conditional") {
    return "Nur mit Bedingungen";
  }
  return "Nicht bankfaehig";
}

function bankPackageOneLineDecision(status: BankPackageCreditBrief["status"]): string {
  if (status === "bankable") {
    return "Kreditvorlage kann vorbereitet werden; finale Bewertung, Unterlagen und Bankkonditionen bleiben zu pruefen.";
  }
  if (status === "conditional") {
    return "Bankgespraech moeglich, aber nur als indikative Kreditpruefung mit klaren Bedingungen und offenen Unterlagen.";
  }
  return "Keine Kreditvorlage, bis DSCR, Cashflow, Stressfall und Pflichtunterlagen bankfaehig nachgezogen sind.";
}

function bankPackageCovenantChecks(input: {
  cashflow: number | null;
  dscr: number | null;
  stressedCashflow: number | null;
}): string[] {
  return uniqueItems([
    input.dscr !== null && input.dscr < 1.1
      ? `DSCR ${formatNumber(input.dscr)} liegt unter 1,10; Bankfaehigkeit nur mit Preisabschlag, mehr Eigenkapital oder besserer Miete.`
      : `DSCR ${formatNumber(input.dscr)} gegen Bankschwelle 1,10 und Zielpuffer 1,20 pruefen.`,
    input.cashflow !== null && input.cashflow < 0
      ? `Cashflow ${bankPackageCurrencyText(input.cashflow)} ist negativ; Kreditstory braucht neuen Kaufpreisanker oder Kapitalstruktur.`
      : `Cashflow ${bankPackageCurrencyText(input.cashflow)} im Base Case dokumentieren.`,
    input.stressedCashflow !== null && input.stressedCashflow < 0
      ? `Stress-Cashflow ${bankPackageCurrencyText(input.stressedCashflow)} ist negativ; Zinsbindung und Tilgung neu mit Bank rechnen.`
      : `Stress-Cashflow ${bankPackageCurrencyText(input.stressedCashflow)} als Sensitivitaet beilegen.`
  ]);
}

function bankPackageCreditStory(input: {
  financedCapex: number | null;
  hasRenovationSection: boolean;
  requestedLoan: number | null;
  status: BankPackageCreditBrief["status"];
  suggestedEquity: number | null;
}): string[] {
  const story = [
    input.status === "blocked"
      ? "Kreditstory als Ablehnungs-/Nachverhandlungsfall rahmen: erst Preis, DSCR und Cashflow reparieren."
      : input.status === "conditional"
        ? "Kreditstory nur indikativ einreichen und Bedingungen klar vor die Auszahlung stellen."
        : "Kreditstory mit Kaufpreis, Miete, NOI, DSCR und Unterlagenpaket konsistent einreichen.",
    `Darlehen ${bankPackageCurrencyText(input.requestedLoan)} gegen Eigenkapital ${bankPackageCurrencyText(input.suggestedEquity)} als Kapitalstruktur ausweisen.`
  ];

  if (input.financedCapex !== null && input.financedCapex > 0) {
    story.push(`Finanzierte Sanierung ${bankPackageCurrencyText(input.financedCapex)} separat als Mittelverwendung und Auszahlungsvoraussetzung zeigen.`);
  } else {
    story.push("Entwicklung separat fuehren: kein Sanierungs- oder Refi-Upside als Kreditargument verkaufen, solange die Bank den Nachher-Wert nicht freigibt.");
  }

  if (input.hasRenovationSection) {
    story.push("Sanierungs-/Refi-Case als Anlage beilegen, aber mit Capex-Angeboten, Nachher-Miete und konservativer Bankbewertung absichern.");
  } else {
    story.push("Sanierungs-/Refi-Case fehlt; Entwicklungspotential nicht in Loan-to-Value oder Kreditfreigabe einrechnen.");
  }

  return uniqueItems(story);
}

function bankPackageConditions(input: {
  cashflowBlocked: boolean;
  dscrBlocked: boolean;
  missingDocuments: string[];
  risks: string[];
  stressedWeak: boolean;
}): string[] {
  const conditions = [
    input.dscrBlocked ? "DSCR ueber 1,10 bringen und Zielpuffer 1,20 mit Bank abstimmen." : null,
    input.cashflowBlocked ? "Negativen Cashflow durch Kaufpreisabschlag, mehr Eigenkapital oder belastbare Mieterhoehung reparieren." : null,
    input.stressedWeak ? "Stress-Cashflow positiv oder als bankseitig akzeptiertes Risiko dokumentieren." : null,
    input.missingDocuments.length
      ? `Fehlende Bankunterlagen anfordern: ${input.missingDocuments.map(formatBankDocumentName).join(", ")}.`
      : null,
    ...input.risks.slice(0, 4).map((risk) => `Bankrisiko klaeren: ${risk}.`)
  ].filter((item): item is string => Boolean(item));

  return uniqueItems(conditions.length ? conditions : ["Finale Bankkonditionen, Bewertung und Auszahlungsvoraussetzungen schriftlich bestaetigen lassen."]);
}

function bankPackageLenderRequest(input: {
  bankPackage: BankPackage;
  cashflow: number | null;
  conditions: string[];
  covenantChecks: string[];
  dscr: number | null;
  missingDocuments: string[];
  requestedLoan: number | null;
  status: BankPackageCreditBrief["status"];
  statusLabel: string;
  stressedCashflow: number | null;
  suggestedEquity: number | null;
}): BankPackageLenderRequest {
  const copySubject = `Finanzierungsanfrage: ${input.bankPackage.title}`;
  const requestedLoanText = bankPackageCurrencyText(input.requestedLoan);
  const suggestedEquityText = bankPackageCurrencyText(input.suggestedEquity);
  const missingDocumentNames = input.missingDocuments.map(formatBankDocumentName);
  const missingDocumentsLabel = missingDocumentNames.length ? missingDocumentNames.join(", ") : "vollstaendig";
  const nextAction = bankPackageLenderNextAction(input.status);
  const copyIntro = bankPackageLenderIntro(input.status);
  const developmentCredit = input.bankPackage.development_credit;
  const developmentLines = developmentCredit
    ? [
        "",
        "Entwicklungspotential:",
        `- Entwicklungspotential: ${developmentCredit.label}`,
        `- Preis-Credit: ${bankPackageCurrencyText(bankPackageNumberValue(developmentCredit.price_credit_eur))}`,
        `- Refi-Freisetzung: ${bankPackageCurrencyText(bankPackageNumberValue(developmentCredit.equity_release_eur))}`,
        `- Regel: ${developmentCredit.rule}`
      ]
    : [];
  const lines = [
    `Betreff: ${copySubject}`,
    "",
    "Hallo,",
    "",
    copyIntro,
    "",
    "Eckdaten:",
    `- Darlehenswunsch: ${requestedLoanText}`,
    `- Eigenmittel: ${suggestedEquityText}`,
    `- Status: ${input.statusLabel}`,
    `- DSCR ${formatNumber(input.dscr)}, Cashflow ${bankPackageCurrencyText(input.cashflow)}, Stress-Cashflow ${bankPackageCurrencyText(input.stressedCashflow)}.`,
    `- Fehlende Unterlagen: ${missingDocumentsLabel}`,
    ...developmentLines,
    "",
    "Covenants / Risiken:",
    ...input.covenantChecks.slice(0, 3).map((item) => `- ${item}`),
    "",
    "Bedingungen:",
    ...input.conditions.slice(0, 4).map((item) => `- ${item}`),
    "",
    `Naechster Schritt: ${nextAction}`,
    "",
    "Vielen Dank"
  ];

  return {
    headline: "Bankanfrage vorbereiten",
    copySubject,
    copyIntro,
    copyText: lines.join("\n"),
    nextAction,
    requestedLoan: requestedLoanText,
    suggestedEquity: suggestedEquityText,
    statusLabel: input.statusLabel,
    missingDocumentsLabel
  };
}

function bankPackageLenderIntro(status: BankPackageCreditBrief["status"]): string {
  if (status === "blocked") {
    return "Bitte pruefen Sie den Case zunaechst nur als indikative Vorpruefung. Eine verbindliche Kreditfreigabe soll erst nach DSCR-/Cashflow-Klaerung und vollstaendigen Unterlagen erfolgen.";
  }
  if (status === "conditional") {
    return "Bitte pruefen Sie den Case als indikative Finanzierung mit klaren Bedingungen zu Unterlagen, Stressfall und finaler Bewertung.";
  }
  return "Bitte pruefen Sie den Case fuer eine Finanzierungsvorlage. Finale Konditionen, Bewertung und Auszahlungsvoraussetzungen bleiben bankseitig zu bestaetigen.";
}

function bankPackageLenderNextAction(status: BankPackageCreditBrief["status"]): string {
  if (status === "blocked") {
    return "Keine verbindliche Kreditfreigabe: erst DSCR, Cashflow, Stressfall und fehlende Bankunterlagen nachziehen.";
  }
  if (status === "conditional") {
    return "Indikatives Bankfeedback einholen und Bedingungen vor einer verbindlichen Kreditentscheidung schliessen.";
  }
  return "Banktermin mit vollstaendiger Unterlagenliste, Bewertung und finalen Konditionen vorbereiten.";
}

function portfolioCommandHeadline(buyCount: number, blockerCount: number): string {
  return `Portfolio-Leitstand: ${buyCount} Kaufkandidat${buyCount === 1 ? "" : "en"}, ${blockerCount} Preis-/Risiko-Blocker`;
}

function portfolioWeeklyFocus(
  decisionRows: Array<{ deal: Deal; decision: DealDecisionBrief; actionPlan: DealActionPlanBrief }>,
  activeDeals: Deal[]
): string[] {
  const buyItems = decisionRows
    .filter((row) => row.decision.decision === "buy")
    .sort((a, b) => (numberValue(b.deal.latest_score?.total_score) ?? 0) - (numberValue(a.deal.latest_score?.total_score) ?? 0))
    .map((row) => `${row.deal.title}: Bankpaket, Unterlagen und Angebot vorbereiten.`);
  const blockerItems = decisionRows
    .filter((row) => row.decision.decision === "negotiate" || row.decision.decision === "reject")
    .sort((a, b) => (numberValue(a.deal.latest_underwriting?.monthly_cashflow_before_tax) ?? 0) - (numberValue(b.deal.latest_underwriting?.monthly_cashflow_before_tax) ?? 0))
    .map((row) => `${row.deal.title}: ${row.actionPlan.primaryAction}`);
  const unpricedItems = activeDeals
    .filter((deal) => !deal.latest_underwriting || !deal.latest_score)
    .map((deal) => `${deal.title}: Underwriting und Score rechnen, bevor Zeit in Besichtigung oder Angebot fliesst.`);
  const watchItems = decisionRows
    .filter((row) => row.decision.decision === "watch")
    .map((row) => `${row.deal.title}: ${row.actionPlan.primaryAction}`);

  return uniqueItems([...buyItems, ...blockerItems, ...unpricedItems, ...watchItems]).slice(0, 5);
}

function portfolioCapitalWarnings(negativeCapitalDeals: Deal[], unpricedCount: number, dscrWeakCount: number): string[] {
  const warnings: string[] = [];
  if (negativeCapitalDeals.length > 0) {
    const blockedEquity = negativeCapitalDeals.reduce((sum, deal) => sum + (numberValue(deal.latest_underwriting?.equity_required) ?? 0), 0);
    warnings.push(
      `${negativeCapitalDeals.length} Deal${negativeCapitalDeals.length === 1 ? "" : "s"} bindet Kapital bei negativem Cashflow: ${offerCurrencyText(blockedEquity)} erst nach Preis-/Bankklaerung reservieren.`
    );
  }
  if (dscrWeakCount > 0) {
    warnings.push(`${dscrWeakCount} Deal${dscrWeakCount === 1 ? "" : "s"} liegt unter DSCR 1,10; Bankfaehigkeit vor Angebot klaeren.`);
  }
  if (unpricedCount > 0) {
    warnings.push(`${unpricedCount} Deal${unpricedCount === 1 ? "" : "s"} ohne Score oder Underwriting: zuerst rechnen, dann besichtigen.`);
  }
  return warnings.length ? warnings : ["Keine harte Kapitalwarnung in der aktiven Queue."];
}

function bankPackageNumberValue(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bankPackageCurrencyText(value: number | null): string {
  return value !== null ? offerCurrencyText(value) : "Fehlt";
}

function formatBankDocumentName(documentType: string): string {
  return documentType.replaceAll("_", " ");
}

function memoCockpitOneLineDecision(status: DealInvestmentCommitteeBrief["status"]): string {
  if (status === "ready") {
    return "Komitee kann eine Bietvorlage pruefen; Preisanker, Bank und finale Unterlagen bleiben Pflicht.";
  }
  if (status === "conditional") {
    return "Komitee nur mit Bedingungen: indikatives Angebot moeglich, aber offene Review-Punkte muessen ins Memo.";
  }
  return "Komitee blockiert: kein finales Angebot, bis Preisanker, Belege und harte Gates geschlossen sind.";
}

function memoCockpitLocationValue(
  locationAlpha: DealMicroLocationAlphaBrief,
  deal: Deal
): string {
  const score = numberValue(deal.location?.micro_location_score);
  if (locationAlpha.status === "alpha") {
    return "Belegt / Alpha";
  }
  if (locationAlpha.status === "memo" && score !== null && score >= 75) {
    return "Stark / Memo";
  }
  if (locationAlpha.status === "memo") {
    return "Memo / Preisdisziplin";
  }
  if (locationAlpha.status === "risk") {
    return "Risiko / Abschlag";
  }
  return "Fehlt";
}

function memoCockpitDecisionMemo(
  committee: DealInvestmentCommitteeBrief,
  offerBand: DealOfferBandBrief,
  locationAlpha: DealMicroLocationAlphaBrief,
  developmentPricing: DealDevelopmentPricingDisciplineBrief,
  evidence: DealEvidenceQualityBrief
): string[] {
  const offerMemo =
    committee.memoItems.find((item) => item.includes("Angebotsband dokumentieren")) ||
    (offerBand.walkAwayPrice !== null
      ? `Walk-away ${offerCurrencyText(offerBand.walkAwayPrice)} als harte Gebotsgrenze dokumentieren.`
      : "Angebotsband vor Memo-Freigabe berechnen.");

  return uniqueItems([
    committee.stopRule,
    offerMemo,
    locationAlpha.priceRule,
    developmentPricing.priceRule,
    `Beleg-Score ${evidence.percent} %: offene Datenluecken vor bindendem Angebot sichtbar markieren.`,
    ...developmentPricing.memoItems,
    ...locationAlpha.memoItems
  ]).slice(0, 8);
}

function memoCockpitBankQuestions(input: {
  cashflow: number | null;
  developmentPricing: DealDevelopmentPricingDisciplineBrief;
  dscr: number | null;
  evidence: DealEvidenceQualityBrief;
  walkAwayText: string;
}): string[] {
  return uniqueItems([
    `Traegt die Finanzierung DSCR ${formatNumber(input.dscr)} und Cashflow ${formatCurrency(input.cashflow)} beim Walk-away ${input.walkAwayText}?`,
    `Welche Unterlagen braucht die Bank, bevor Entwicklungspotential oder Refi-Spielraum angesetzt werden darf?`,
    `Ist der Entwicklungsbonus im Finanzierungsfall auf ${offerCurrencyText(input.developmentPricing.allowedCreditEur)} gedeckelt?`,
    `Welche offenen Belege aus dem ${input.evidence.percent} %-Beleg-Score verhindern eine belastbare Kreditvorlage?`
  ]);
}

function memoCockpitHandoffChecklist(
  committee: DealInvestmentCommitteeBrief,
  locationAlpha: DealMicroLocationAlphaBrief,
  developmentPricing: DealDevelopmentPricingDisciplineBrief,
  evidence: DealEvidenceQualityBrief
): string[] {
  return uniqueItems([
    ...developmentPricing.nextActions,
    ...locationAlpha.memoItems,
    ...locationAlpha.nextActions,
    ...committee.nextQuestions,
    ...evidence.nextActions
  ]).slice(0, 10);
}

type DossierBankReadiness = {
  status: "ready" | "conditional" | "blocked";
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  blockers: string[];
  nextAction: string;
  proof: string;
};

type DossierNotaryReadiness = {
  status: "ready" | "conditional" | "blocked";
  statusLabel: string;
  tone: ReturnType<typeof scoreTone>;
  blockers: string[];
  nextAction: string;
  proof: string;
};

function dossierBankReadiness(deal: Deal): DossierBankReadiness {
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const stressedCashflow = numberValue(deal.latest_underwriting?.stressed_monthly_cashflow_before_tax);
  const blockers = uniqueItems([
    dscr !== null && dscr < 1.1 ? `DSCR ${formatNumber(dscr)} unter 1,10.` : null,
    cashflow !== null && cashflow < 0 ? `Cashflow ${offerCurrencyText(cashflow)} negativ.` : null,
    stressedCashflow !== null && stressedCashflow < 0 ? `Stress-Cashflow ${offerCurrencyText(stressedCashflow)} negativ.` : null,
    !deal.latest_underwriting ? "Underwriting fehlt." : null
  ].filter(Boolean) as string[]);
  const conditional = dscr === null || cashflow === null || (dscr !== null && dscr < 1.2);
  const status: DossierBankReadiness["status"] = blockers.length > 0 ? "blocked" : conditional ? "conditional" : "ready";
  const tone = dossierCockpitTone(status);

  return {
    status,
    statusLabel:
      status === "ready" ? "Bankstory bereit" : status === "conditional" ? "Bankstory mit Bedingungen" : "Bankstory blockiert",
    tone,
    blockers,
    nextAction:
      status === "blocked"
        ? "Preis, Eigenkapital oder Finanzierungsstruktur reparieren, bevor das Bankpaket rausgeht."
        : status === "conditional"
          ? "Bankannahmen, Stressfall und Unterlagen als Bedingungen im Kreditpaket markieren."
          : "Bankpaket mit DSCR, Cashflow, Stressfall und Entwicklungsthese vorbereiten.",
    proof:
      dscr !== null || cashflow !== null
        ? `DSCR ${formatNumber(dscr)}, Cashflow ${cashflow !== null ? offerCurrencyText(cashflow) : "Fehlt"}, Stress-Cashflow ${
            stressedCashflow !== null ? offerCurrencyText(stressedCashflow) : "Fehlt"
          }.`
        : "Noch keine belastbare Finanzierungskennzahl."
  };
}

function closingOfferLane(offerRelease: DealOfferReleasePackageBrief): DealClosingCommandLane {
  return {
    key: "offer",
    label: "Angebot senden",
    owner: "Ankauf",
    status: offerRelease.status,
    statusLabel: offerRelease.releaseLabel,
    tone: offerRelease.tone,
    summary: offerRelease.headline,
    proof: `Freigabe ${offerRelease.releaseLabel}; ${offerRelease.facts.map((fact) => `${fact.label}: ${fact.value}`).join(", ")}.`,
    action: offerRelease.nextActions[0] || offerRelease.sellerMessage,
    blockers: offerRelease.status === "ready" ? [] : offerRelease.internalGuardrails.slice(0, 3),
    href: "#deal-offer-release-package"
  };
}

function closingBankLane(deal: Deal, bank: DossierBankReadiness): DealClosingCommandLane {
  return {
    key: "bank",
    label: "Bankpaket senden",
    owner: "Finanzierung",
    status: bank.status,
    statusLabel: bank.statusLabel,
    tone: bank.tone,
    summary: bank.nextAction,
    proof: bank.proof,
    action: bank.nextAction,
    blockers: bank.blockers,
    href: `/deals/${deal.id}/bank`
  };
}

function closingNotaryLane(notary: DossierNotaryReadiness): DealClosingCommandLane {
  return {
    key: "notary",
    label: "Notar vorbereiten",
    owner: "Notar/Closing",
    status: notary.status,
    statusLabel: notary.statusLabel,
    tone: notary.tone,
    summary: notary.nextAction,
    proof: notary.proof,
    action: notary.nextAction,
    blockers: notary.blockers,
    href: "#deal-readiness"
  };
}

function closingCommandTone(status: DealClosingCommandStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "conditional") return "watch";
  return "risk";
}

function closingCommandHeadline(status: DealClosingCommandStatus): string {
  if (status === "ready") return "Closing Command: senden moeglich";
  if (status === "conditional") return "Closing Command: nur mit Bedingungen";
  return "Closing Command: noch nicht senden";
}

function closingCommandPrimaryAction(
  readiness: AcquisitionReadinessSummary,
  lanes: DealClosingCommandLane[]
): string {
  return (
    readiness.nextActions[0] ||
    lanes.find((lane) => lane.status === "blocked")?.action ||
    lanes.find((lane) => lane.status === "conditional")?.action ||
    lanes[0]?.action ||
    "Closing-Freigaben dokumentieren."
  );
}

function dossierNotaryReadiness(input: {
  bank: DossierBankReadiness;
  offerRelease: DealOfferReleasePackageBrief;
  readiness: AcquisitionReadinessSummary;
}): DossierNotaryReadiness {
  const blockers = uniqueItems([
    input.offerRelease.status === "blocked" ? "Angebotsfreigabe fehlt." : null,
    input.bank.status === "blocked" ? "Bankstory blockiert." : null,
    input.readiness.status === "blocked" ? `${input.readiness.total - input.readiness.readyCount} Freigabe-Gates offen.` : null
  ].filter(Boolean) as string[]);
  const status: DossierNotaryReadiness["status"] =
    blockers.length > 0
      ? "blocked"
      : input.offerRelease.status === "conditional" ||
          input.bank.status === "conditional" ||
          input.readiness.status === "needs_review"
        ? "conditional"
        : "ready";
  const tone = dossierCockpitTone(status);

  return {
    status,
    statusLabel: status === "ready" ? "Vorbereitbar" : status === "conditional" ? "Nur mit Vorbehalten" : "Gesperrt",
    tone,
    blockers,
    nextAction:
      status === "blocked"
        ? "Notarvorbereitung bleibt gesperrt, bis Angebot, Bank und Freigabe-Gates geschlossen sind."
        : status === "conditional"
          ? "Notartermin nur als internen Entwurf mit offenen Vorbehalten vorbereiten."
          : "Notarunterlagen mit Kaufpreis, Finanzierung und Due-Diligence-Freigabe zusammenstellen.",
    proof:
      status === "ready"
        ? "Angebot, Bankstory und Freigabe-Gates sind fuer die Vorbereitung ausreichend."
        : blockers.join(" ")
  };
}

function dossierDevelopmentSnapshot(development: DealDevelopmentPotentialMapBrief): DealDossierDevelopmentSnapshot {
  const primaryLane = development.lanes[0] || null;
  const statusLabel = dossierDevelopmentStatusLabel(development.status);
  const valueBucket =
    development.priceBuckets.find((bucket) => bucket.key === "priceable" && bucket.tone === "good") ||
    development.priceBuckets.find((bucket) => bucket.key === "memo" && bucket.tone === "watch") ||
    development.priceBuckets.find((bucket) => bucket.key === "blocked" && bucket.tone === "risk") ||
    development.priceBuckets.find((bucket) => bucket.key === "memo") ||
    development.priceBuckets[0];

  return {
    label: primaryLane?.label || "Noch nicht belegt",
    statusLabel,
    where: primaryLane?.where || "Miete, Zustand, WEG, Mikrolage",
    value: valueBucket?.value || "Fehlt",
    rule: valueBucket?.rule || "Entwicklungspotential erst nach Belegen in Preis, Memo oder Bankpaket aufnehmen.",
    proof: primaryLane ? `${primaryLane.proofStatus}: ${primaryLane.estimatedValue}` : "Noch kein belastbarer Entwicklungshebel belegt.",
    nextAction: primaryLane?.nextCheck || development.nextActions[0] || "Entwicklungspotential mit Miete, Zustand, WEG, Geo und Bankannahmen belegen.",
    tone: development.tone
  };
}

function dossierDevelopmentStatusLabel(status: DealDevelopmentPotentialMapStatus): string {
  if (status === "priceable") return "Kaufpreisrelevant";
  if (status === "memo") return "Nur Memo-Upside";
  if (status === "blocked") return "Erst belegen";
  return "Fehlt";
}

function dossierSellerPackage(
  offerRelease: DealOfferReleasePackageBrief,
  documents: DueDiligenceDocumentSummary
): DealDossierCockpitPackage {
  return {
    key: "seller",
    label: "Verkaeuferpaket",
    statusLabel: dossierSellerStatusLabel(offerRelease.status),
    owner: "Ankauf",
    handoff: offerRelease.sellerMessage,
    nextAction: offerRelease.nextActions[0] || "Preisindikation, Vorbehalte und Unterlagenliste in ein Verkaeuferpaket uebernehmen.",
    proof: `Unterlagenpaket: ${documents.missingLabels.length} offen. ${offerRelease.externalConditions[0] || ""}`.trim(),
    blockers: offerRelease.status === "blocked" ? offerRelease.internalGuardrails.slice(0, 3) : [],
    tone: offerRelease.tone
  };
}

function dossierCommitteePackage(
  committee: DealInvestmentCommitteeBrief,
  memo: DealMemoCockpitBrief
): DealDossierCockpitPackage {
  return {
    key: "committee",
    label: "Komitee-Memo",
    statusLabel: committee.headline,
    owner: "Investment",
    handoff: memo.oneLineDecision,
    nextAction: committee.nextQuestions[0] || "Komitee-Memo mit Preisanker, Belegen und Risiken finalisieren.",
    proof: committee.stopRule,
    blockers: committee.blockers.map((item) => `${item.label}: ${item.action}`).slice(0, 4),
    tone: committee.tone
  };
}

function dossierBankPackage(bank: DossierBankReadiness, memo: DealMemoCockpitBrief): DealDossierCockpitPackage {
  return {
    key: "bank",
    label: "Bankpaket",
    statusLabel: bank.statusLabel,
    owner: "Finanzierung",
    handoff: memo.bankQuestions[0] || bank.proof,
    nextAction: bank.nextAction,
    proof: bank.proof,
    blockers: bank.blockers,
    tone: bank.tone
  };
}

function dossierNotaryPackage(
  notary: DossierNotaryReadiness,
  readiness: AcquisitionReadinessSummary
): DealDossierCockpitPackage {
  return {
    key: "notary",
    label: "Notarvorbereitung",
    statusLabel: notary.statusLabel,
    owner: "Ankauf/Legal",
    handoff: notary.proof,
    nextAction: notary.nextAction,
    proof: `${readiness.readyCount}/${readiness.total} Freigabe-Gates bestanden.`,
    blockers: notary.blockers,
    tone: notary.tone
  };
}

function dossierCockpitStatus(input: {
  bank: DossierBankReadiness;
  committee: DealInvestmentCommitteeBrief;
  notary: DossierNotaryReadiness;
  offerRelease: DealOfferReleasePackageBrief;
}): DealDossierCockpitBrief["status"] {
  if (
    input.bank.status === "blocked" ||
    input.committee.status === "blocked" ||
    input.notary.status === "blocked" ||
    input.offerRelease.status === "blocked"
  ) {
    return "blocked";
  }
  if (
    input.bank.status === "conditional" ||
    input.committee.status === "conditional" ||
    input.notary.status === "conditional" ||
    input.offerRelease.status === "conditional"
  ) {
    return "conditional";
  }
  return "ready";
}

function dossierCockpitTone(status: DealDossierCockpitBrief["status"]): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "blocked") return "risk";
  return "watch";
}

function dossierCockpitDecisionLabel(status: DealDossierCockpitBrief["status"]): string {
  if (status === "ready") return "Versandfaehig";
  if (status === "conditional") return "Bedingt versandfaehig";
  return "Nicht versandfaehig";
}

function dossierCockpitHeadline(status: DealDossierCockpitBrief["status"]): string {
  if (status === "ready") return "Dossier versandfaehig";
  if (status === "conditional") return "Dossier nur mit Bedingungen versenden";
  return "Dossier blockiert: Preis, Belege und Bankstory schliessen";
}

function dossierCockpitStopRule(status: DealDossierCockpitBrief["status"], notaryLabel: string): string {
  if (status === "ready") {
    return "Dossier kann in Verkaeufer-, Bank- und Komitee-Kommunikation ueberfuehrt werden; finale Freigaben bleiben zu dokumentieren.";
  }
  if (status === "conditional") {
    return `Dossier nur mit Vorbehalten nutzen; Notarstatus ${notaryLabel}.`;
  }
  return `Kein verbindlicher Versand und keine Notarvorbereitung; Notarstatus ${notaryLabel}.`;
}

function dossierSellerStatusLabel(status: DealOfferReleasePackageBrief["status"]): string {
  if (status === "ready") return "Versandfaehig";
  if (status === "conditional") return "Mit Vorbehalten";
  return "Nur Preisindikation";
}

function dossierCopyChecklist(input: {
  bank: DossierBankReadiness;
  committee: DealInvestmentCommitteeBrief;
  development: DealDossierDevelopmentSnapshot;
  documents: DueDiligenceDocumentSummary;
  memo: DealMemoCockpitBrief;
  notary: DossierNotaryReadiness;
  offerRelease: DealOfferReleasePackageBrief;
}): string[] {
  return uniqueItems([
    "Walk-away bleibt intern; Startgebot, Zielpreis und harte Grenze getrennt dokumentieren.",
    `Entwicklungspotential: ${input.development.label} in ${input.development.where}; ${input.development.value} ${input.development.statusLabel}. ${input.development.rule}`,
    `Unterlagenpaket: ${input.documents.missingLabels.length} offene Pflichtunterlagen vor verbindlichem Angebot klaeren.`,
    input.bank.status === "blocked" ? input.bank.nextAction : input.bank.proof,
    input.committee.stopRule,
    input.notary.status === "blocked" ? "Notarvorbereitung bleibt gesperrt, bis Angebot, Bank und Freigabe-Gates geschlossen sind." : input.notary.nextAction,
    input.offerRelease.externalConditions[0],
    ...input.memo.handoffChecklist.slice(0, 3)
  ].filter(Boolean) as string[]).slice(0, 8);
}

function acquisitionThesisStatus(input: {
  development: DealDevelopmentPricingDisciplineBrief;
  evidence: DealEvidenceQualityBrief;
  exit: DealExitLiquidityBrief;
  market: DealMarketComparisonBrief;
  offerDecision: DealOfferDecisionBrief;
}): DealAcquisitionThesisStatus {
  if (input.market.status === "overpriced" || input.offerDecision.status === "blocked") {
    return "blocked";
  }
  if (
    input.market.status === "missing" ||
    input.development.status !== "priced" ||
    input.evidence.percent < 70 ||
    input.exit.estimatedExitDiscountPercent > 6
  ) {
    return "conditional";
  }
  return "actionable";
}

function acquisitionThesisTone(status: DealAcquisitionThesisStatus): ReturnType<typeof scoreTone> {
  if (status === "actionable") return "good";
  if (status === "blocked") return "risk";
  return "watch";
}

function acquisitionThesisHeadline(
  status: DealAcquisitionThesisStatus,
  market: DealMarketComparisonBrief
): string {
  if (status === "blocked" && market.status === "overpriced") {
    return "These interessant, Preis blockiert";
  }
  if (status === "blocked") {
    return "These blockiert";
  }
  if (status === "actionable") {
    return "These kaufbereit";
  }
  return "These tragfaehig, Belege offen";
}

function acquisitionThesisLabel(
  status: DealAcquisitionThesisStatus,
  market: DealMarketComparisonBrief
): string {
  if (status === "blocked" && market.status === "overpriced") {
    return "Preis runter, Belege schliessen";
  }
  if (status === "blocked") {
    return "Nicht bieten, Blocker klaeren";
  }
  if (status === "actionable") {
    return "Bieten vorbereiten";
  }
  return "Indikativ pruefen";
}

function acquisitionThesisSummaryTail(status: DealAcquisitionThesisStatus): string {
  if (status === "actionable") {
    return "Der Deal kann in Richtung Memo, Bank und Angebot vorbereitet werden.";
  }
  if (status === "blocked") {
    return "Die Lage- oder Entwicklungsthese bleibt interessant, aber Preis und Belege verhindern ein sauberes Gebot.";
  }
  return "Indikatives Arbeiten ist moeglich, aber fehlende Belege duerfen nicht in den Kaufpreis wandern.";
}

function acquisitionThesisLanes(input: {
  development: DealDevelopmentPricingDisciplineBrief;
  evidence: DealEvidenceQualityBrief;
  exit: DealExitLiquidityBrief;
  market: DealMarketComparisonBrief;
}): DealAcquisitionThesisLane[] {
  return [
    acquisitionThesisPriceLane(input.market),
    acquisitionThesisDevelopmentLane(input.development),
    acquisitionThesisEvidenceLane(input.evidence),
    acquisitionThesisExitLane(input.exit)
  ];
}

function acquisitionThesisPriceLane(market: DealMarketComparisonBrief): DealAcquisitionThesisLane {
  if (market.status === "overpriced") {
    const nextAction =
      market.marketGapEur !== null
        ? `Kaufpreis mindestens um ${offerCurrencyText(market.marketGapEur)} Richtung Marktanker nachverhandeln.`
        : "Kaufpreis gegen echte Vergleichsangebote nachverhandeln.";
    return {
      label: "Preis",
      statusLabel: "Blockiert",
      tone: "risk",
      summary: market.summary,
      rule: "Markt-Gap als harten Preisabschlag verhandeln.",
      nextAction
    };
  }
  if (market.status === "missing") {
    return {
      label: "Preis",
      statusLabel: "Comps fehlen",
      tone: "watch",
      summary: market.summary,
      rule: "Ohne Marktanker kein bindendes Angebot.",
      nextAction: "Echte Vergleichsangebote und Abschlussdaten nachziehen."
    };
  }
  return {
    label: "Preis",
    statusLabel: market.status === "underpriced" ? "Chance" : "Plausibel",
    tone: market.tone,
    summary: market.summary,
    rule: "Preis darf nur innerhalb des belegten Markt- und Cashflow-Korridors steigen.",
    nextAction: market.nextActions[0] || "Marktanker im Memo dokumentieren."
  };
}

function acquisitionThesisDevelopmentLane(development: DealDevelopmentPricingDisciplineBrief): DealAcquisitionThesisLane {
  if (development.status === "priced") {
    return {
      label: "Entwicklung",
      statusLabel: "Preis-Credit",
      tone: development.tone,
      summary: development.headline,
      rule: development.priceRule,
      nextAction: development.nextActions[0] || "Entwicklungsbonus im Memo gedeckelt dokumentieren."
    };
  }
  if (development.status === "conditional") {
    return {
      label: "Entwicklung",
      statusLabel: "Memo-Upside",
      tone: "watch",
      summary: development.headline,
      rule: "0 € Preis-Credit, bis Objekt- und Bankbelege tragen.",
      nextAction: "WEG, Geo, Capex und Bank-Case schliessen, bevor Entwicklung als Preisargument zaehlt."
    };
  }
  return {
    label: "Entwicklung",
    statusLabel: "Kein Credit",
    tone: "risk",
    summary: development.headline,
    rule: "0 € Preis-Credit; erst belastbaren Sanierungs-/Bank-Case schaffen.",
    nextAction: development.nextActions[0] || "Entwicklung neu rechnen, sobald Unterlagen vorliegen."
  };
}

function acquisitionThesisEvidenceLane(evidence: DealEvidenceQualityBrief): DealAcquisitionThesisLane {
  if (evidence.percent >= 70) {
    return {
      label: "Belege",
      statusLabel: "Solide",
      tone: evidence.tone,
      summary: evidence.summary,
      rule: "Belege duerfen ins Memo, offene Punkte bleiben als Bedingungen sichtbar.",
      nextAction: evidence.nextActions[0] || "Fachliche Plausibilitaet vor Angebot final gegenpruefen."
    };
  }
  return {
    label: "Belege",
    statusLabel: "Nachziehen",
    tone: evidence.tone,
    summary: evidence.summary,
    rule: "Fehlende Belege nicht in Kaufpreis, Bank-Case oder Exit einrechnen.",
    nextAction: evidence.nextActions[0] || "Kernbelege nachziehen."
  };
}

function acquisitionThesisExitLane(exit: DealExitLiquidityBrief): DealAcquisitionThesisLane {
  if (exit.estimatedExitDiscountPercent > 6) {
    return {
      label: "Exit",
      statusLabel: "Abschlag",
      tone: "risk",
      summary: exit.summary,
      rule: "Exit-Abschlag als Preisrisiko behandeln.",
      nextAction: exit.nextActions[0] || "Exit-These, Zielkaeufer und Risikoabschlag schaerfen."
    };
  }
  if (exit.estimatedExitDiscountPercent > 3) {
    return {
      label: "Exit",
      statusLabel: "Pruefen",
      tone: "watch",
      summary: exit.summary,
      rule: "Exit bleibt reviewpflichtig und gehoert ins Memo.",
      nextAction: exit.nextActions[0] || "Exit-These mit Zielkaeufern belegen."
    };
  }
  return {
    label: "Exit",
    statusLabel: "Fluessig",
    tone: "good",
    summary: exit.summary,
    rule: "Exit stuetzt die These, bleibt aber an echte Kaeufer- und Beleglogik gebunden.",
    nextAction: exit.nextActions[0] || "Exit-Annahmen im Memo dokumentieren."
  };
}

function acquisitionThesisGuardrails(input: {
  development: DealDevelopmentPricingDisciplineBrief;
  evidence: DealEvidenceQualityBrief;
  exit: DealExitLiquidityBrief;
  market: DealMarketComparisonBrief;
}): string[] {
  return uniqueItems([
    input.market.status === "overpriced" ? "Markt-Gap nicht als Upside behandeln; erst Preis senken oder echte Comps belegen." : null,
    input.development.status !== "priced" ? "Entwicklung bleibt Memo-Upside, solange WEG, Geo, Capex und Bank-Case offen sind." : null,
    input.evidence.percent < 70 ? "Beleg-Score unter 70 %: kein bindendes Angebot ohne sichtbare Bedingungen." : null,
    input.exit.estimatedExitDiscountPercent > 3 ? "Exit-Abschlag im Walk-away und Investment-Memo sichtbar halten." : null
  ].filter((item): item is string => Boolean(item)));
}

function acquisitionThesisNextActions(input: {
  development: DealDevelopmentPricingDisciplineBrief;
  evidence: DealEvidenceQualityBrief;
  exit: DealExitLiquidityBrief;
  market: DealMarketComparisonBrief;
}): string[] {
  return uniqueItems([
    input.market.status === "overpriced" && input.market.marketGapEur !== null
      ? `Kaufpreis mindestens um ${offerCurrencyText(input.market.marketGapEur)} Richtung Marktanker nachverhandeln.`
      : null,
    input.development.status !== "priced"
      ? "WEG, Geo, Capex und Bank-Case schliessen, bevor Entwicklung als Preisargument zaehlt."
      : null,
    input.evidence.percent < 70 ? input.evidence.nextActions[0] : null,
    input.exit.estimatedExitDiscountPercent > 3 ? input.exit.nextActions[0] : null
  ].filter((item): item is string => Boolean(item))).slice(0, 6);
}

function committeeItemFromGate(gate: AcquisitionReadinessGate): DealInvestmentCommitteeItem {
  return {
    label: gate.label,
    summary: gate.summary,
    action: gate.actions[0] || gate.summary,
    statusLabel: gate.statusLabel,
    tone: gate.tone
  };
}

function committeeHeadline(status: DealInvestmentCommitteeBrief["status"]): string {
  if (status === "ready") {
    return "Komitee-reif fuer Bietvorlage";
  }
  if (status === "conditional") {
    return "Komitee nur mit Bedingungen";
  }
  return "Nicht komitee-reif";
}

function committeeDecisionLabel(status: DealInvestmentCommitteeBrief["status"]): string {
  if (status === "ready") {
    return "Bietvorlage moeglich";
  }
  if (status === "conditional") {
    return "Nur mit Bedingungen";
  }
  return "Nicht bieten";
}

function committeeStopRule(
  status: DealInvestmentCommitteeBrief["status"],
  blockerCount: number,
  reviewCount: number
): string {
  if (status === "ready") {
    return "Finales Angebot erst nach Memo-Abgleich, Finanzierung und Unterschriftsmappe freigeben.";
  }
  if (status === "conditional") {
    return `Nur indikatives Angebot: ${reviewCount} Review-Punkt${reviewCount === 1 ? "" : "e"} muessen ins Memo.`;
  }
  return `Kein finales Angebot: ${blockerCount} Blocker und ${reviewCount} Review-Punkt${reviewCount === 1 ? "" : "e"} sind offen.`;
}

function committeeMemoItems(
  readiness: AcquisitionReadinessSummary,
  offerBand: DealOfferBandBrief,
  evidence: DealEvidenceQualityBrief,
  developmentPricing: DealDevelopmentPricingDisciplineBrief
): string[] {
  const items = [
    committeeOfferBandMemoItem(offerBand),
    ...developmentPricing.memoItems,
    `Freigabe-Stand dokumentieren: ${readiness.readyCount}/${readiness.total} Gates bestanden.`,
    `Beleg-Score dokumentieren: ${evidence.percent} %.`,
    ...readiness.gates
      .filter((gate) => gate.status === "pass")
      .map((gate) => `${gate.label}: ${gate.summary}`)
  ].filter((item): item is string => Boolean(item));

  return uniqueItems(items).slice(0, 6);
}

function committeeOfferBandMemoItem(offerBand: DealOfferBandBrief): string | null {
  if (
    offerBand.startOfferPrice === null ||
    offerBand.targetOfferPrice === null ||
    offerBand.walkAwayPrice === null
  ) {
    return "Angebotsband fehlt: Startgebot, Zielpreis und Walk-away vor Komitee berechnen.";
  }
  return `Angebotsband dokumentieren: Startgebot ${offerCurrencyText(offerBand.startOfferPrice)}, Zielpreis ${offerCurrencyText(offerBand.targetOfferPrice)}, Walk-away ${offerCurrencyText(offerBand.walkAwayPrice)}.`;
}

function unlockPlanStatus(
  decision: DealDecisionBrief,
  repairPlan: DealRepairPlanBrief,
  readiness: AcquisitionReadinessSummary
): DealUnlockPlanStatus {
  if (repairPlan.status === "missing") {
    return "missing";
  }
  if (decision.decision === "buy" && repairPlan.status === "ready" && readiness.status === "ready") {
    return "ready";
  }
  if (decision.decision === "reject" || repairPlan.status === "needs_repair" || readiness.status === "blocked") {
    return "blocked";
  }
  return "repair";
}

function unlockPlanTone(status: DealUnlockPlanStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "repair") return "watch";
  if (status === "blocked") return "risk";
  return "empty";
}

function unlockPlanHeadline(status: DealUnlockPlanStatus, hardLeverCount: number): string {
  if (status === "ready") return "Deal-Unlock: kaufbar, Freigaben halten";
  if (status === "missing") return "Deal-Unlock: erst rechnen";
  if (status === "repair") return `Deal-Unlock: ${Math.max(1, hardLeverCount)} Hebel bis angebotsreif`;
  return `Deal-Unlock: ${Math.max(1, hardLeverCount)} harte Hebel bis kaufbar`;
}

function unlockPlanSummary(
  status: DealUnlockPlanStatus,
  decision: DealDecisionBrief,
  hardLeverCount: number
): string {
  if (status === "ready") {
    return "Der Deal ist kaufbar, wenn Preis, Bankannahmen und Unterlagen bis zum Angebot unveraendert bleiben.";
  }
  if (status === "missing") {
    return "Aktuell fehlt die Rechenbasis: Underwriting, Stress-Test und Freigabe-Gates muessen zuerst aktualisiert werden.";
  }
  if (status === "repair") {
    return `${hardLeverCount} Hebel entscheiden, ob aus ${unlockDecisionLabel(decision.decision)} ein belastbares Angebot wird.`;
  }
  return `Aktuell kein Kaufkandidat: ${hardLeverCount} harte Hebel muessen belegt sein, bevor Angebot oder Notartermin sinnvoll sind.`;
}

function unlockPlanTargetState(status: DealUnlockPlanStatus): string {
  if (status === "ready") {
    return "Zielzustand: Angebot nur noch mit finaler Unterlagen-, Bank- und Vertragsfreigabe absichern.";
  }
  if (status === "missing") {
    return "Zielzustand: Rechenbasis herstellen, dann Preisband, Cashflow und Freigabe neu bewerten.";
  }
  return "Zielzustand: Preis/Finanzierung repariert, Miethebel belegt und Freigabe-Gates geschlossen.";
}

function unlockPlanStopRule(status: DealUnlockPlanStatus, levers: DealUnlockLever[]): string {
  if (status === "ready") {
    return "Kein Aufpreis fuer Storys: Angebot bleibt im dokumentierten Risiko-Deckel.";
  }
  const openLabels = levers
    .filter((lever) => lever.statusLabel === "Pflichthebel")
    .map((lever) => lever.label)
    .slice(0, 3);
  return `Kein bindendes Angebot, solange ${openLabels.join(", ")} nicht belastbar geschlossen sind.`;
}

function unlockDecisionLabel(decision: DealDecisionBrief["decision"]): string {
  if (decision === "buy") return "Kaufen";
  if (decision === "negotiate") return "Nachverhandeln";
  if (decision === "reject") return "Ablehnen/hart nachverhandeln";
  return "Beobachten";
}

function unlockPriceFinancingLever(repairPlan: DealRepairPlanBrief, deal: Deal): DealUnlockLever {
  const pricing = dealPricingBrief(deal);
  const needsRepair =
    (repairPlan.purchasePriceRepairEur !== null && repairPlan.purchasePriceRepairEur > 0) ||
    pricing.status === "gap";
  const repairText =
    repairPlan.purchasePriceRepairEur !== null && repairPlan.purchasePriceRepairEur > 0
      ? stressCurrencyText(repairPlan.purchasePriceRepairEur)
      : pricing.value;
  return {
    key: "price_financing",
    label: "Preis/Finanzierung reparieren",
    statusLabel: needsRepair ? "Pflichthebel" : "Reserve",
    impact: needsRepair
      ? `Preis-/Debt-Hebel ${repairText} in Kaufpreis, Darlehen oder Verkaeuferstruktur abbilden.`
      : "Preis-/Debt-Hebel ist aktuell nicht der harte Engpass.",
    proof: "Underwriting, DSCR, Schuldendienst und Bankstruktur muessen denselben reparierten Preisanker zeigen.",
    action: needsRepair
      ? "Preis, Darlehen, Tilgung oder Verkaeuferstruktur so verhandeln, dass Cashflow und DSCR den Stress bestehen."
      : "Preisanker im Dossier halten und bei neuen Unterlagen erneut gegen den Risiko-Deckel pruefen.",
    tone: needsRepair ? "risk" : "good",
    rankScore: needsRepair ? 100 : 20
  };
}

function unlockRentProofLever(repairPlan: DealRepairPlanBrief, deal: Deal): DealUnlockLever {
  const needsRent = repairPlan.rentRepairMonthly !== null && repairPlan.rentRepairMonthly > 0;
  const rentDelta = rentUpsideMonthly(deal);
  const rentDeltaText = rentDelta !== null && rentDelta > 0 ? ` Sichtbare Marktmiet-Luecke: ${repairMonthlyText(rentDelta)}.` : "";
  return {
    key: "rent_proof",
    label: "Miethebel belegen",
    statusLabel: needsRent ? "Pflichthebel" : "Reserve",
    impact: needsRent
      ? `${repairMonthlyText(repairPlan.rentRepairMonthly)} zusaetzlicher Monats-Cashflow muss rechtlich und marktseitig tragen.${rentDeltaText}`
      : "Miethebel ist aktuell Reserve und darf nicht doppelt als Preisargument zaehlen.",
    proof: "Mietrecht, Mietvertrag, Vergleichsmieten und realistische Zielmiete muessen denselben Hebel bestaetigen.",
    action: needsRent
      ? "Zielmiete mit Mietrecht, Mietspiegel, Vertrag und Vergleichsmieten belegen; ohne Beleg bleibt sie aus dem Kaufpreis raus."
      : "Zielmiete im Memo dokumentieren und erst nach Mietrechtspruefung in Szenarien nutzen.",
    tone: needsRent ? "risk" : "watch",
    rankScore: needsRent ? 90 : 30
  };
}

function unlockEvidenceReadinessLever(
  readiness: AcquisitionReadinessSummary,
  evidence: DealEvidenceQualityBrief,
  documents: DueDiligenceDocumentSummary
): DealUnlockLever {
  const needsEvidence = readiness.status !== "ready" || evidence.percent < 75;
  const missingText = documents.missingLabels.length
    ? ` Fehlende Unterlagen: ${documents.missingLabels.slice(0, 3).join(", ")}.`
    : "";
  const firstAction = readiness.nextActions[0] || evidence.nextActions[0] || "Freigabe-Gates fachlich pruefen.";
  return {
    key: "evidence_readiness",
    label: "Freigabe-Belege schliessen",
    statusLabel: needsEvidence ? "Pflichthebel" : "Reserve",
    impact: `${readiness.readyCount}/${readiness.total} Gates bestanden, Beleg-Score ${evidence.percent} %.${missingText}`,
    proof: "Unterlagen, WEG/Geo, Mikrolage, rote Flaggen und Annahmen muessen im Dossier pruefbar sein.",
    action: needsEvidence
      ? `Unterlagen und Freigabe-Gates schliessen; zuerst: ${firstAction}`
      : "Unterlagenstand einfrieren und Annahmen vor Versand final abgleichen.",
    tone: needsEvidence ? readiness.tone : "good",
    rankScore: needsEvidence ? 80 : 10
  };
}

function rentUpsideMonthly(deal: Deal): number | null {
  const currentRent = numberValue(deal.listing?.cold_rent_monthly);
  const marketRent = numberValue(deal.listing?.market_rent_estimate_monthly);
  if (currentRent === null || marketRent === null) {
    return null;
  }
  return Math.max(0, roundToWholeEuro(marketRent - currentRent));
}

function actionPlanStepFromGate(gate: AcquisitionReadinessGate, priority: number): DealActionPlanStep {
  return {
    priority,
    label: actionPlanGateLabel(gate),
    detail: actionPlanGateDetail(gate),
    reason: `${gate.label} ${gate.status === "block" ? "blockiert" : "braucht Pruefung"}: ${gate.summary}`,
    tone: gate.tone
  };
}

function actionPlanGateLabel(gate: AcquisitionReadinessGate): string {
  if (gate.key === "economics") return "Preisanker";
  if (gate.key === "microlocation") return "Mikrolage-Belege";
  if (gate.key === "weg") return "WEG/Objekt";
  if (gate.key === "geo") return "Geo/Baurecht";
  return gate.label;
}

function actionPlanGateDetail(gate: AcquisitionReadinessGate): string {
  if (gate.key === "economics") {
    return gate.actions[0] || gate.summary;
  }
  if (gate.key === "microlocation") {
    return gate.actions.find((action) => action.includes("Mikrolage-Belege")) || gate.actions[0] || gate.summary;
  }
  return gate.summary;
}

function actionPlanPrimaryAction(
  readiness: AcquisitionReadinessSummary,
  decision: DealDecisionBrief,
  steps: DealActionPlanStep[]
): string {
  const economicsGate = readiness.gates.find((gate) => gate.key === "economics" && gate.status !== "pass");
  if (economicsGate?.actions[0]) {
    return economicsGate.actions[0];
  }
  if ((decision.decision === "reject" || decision.decision === "negotiate") && decision.nextActions[0]) {
    return decision.nextActions[0];
  }
  if (readiness.nextActions[0]) {
    return readiness.nextActions[0];
  }
  if (steps[0]) {
    return steps[0].detail;
  }
  return "Investment-Memo, Finanzierung und bindendes Angebot vorbereiten.";
}

function actionPlanHeadline(readiness: AcquisitionReadinessSummary, decision: DealDecisionBrief): string {
  const economicsOpen = readiness.gates.some((gate) => gate.key === "economics" && gate.status !== "pass");
  if (readiness.status === "ready") {
    return "Angebot vorbereiten - letzte Pruefung dokumentieren";
  }
  if (economicsOpen && (decision.decision === "reject" || decision.decision === "negotiate")) {
    return "Erst Preisanker klaeren, dann Due Diligence";
  }
  if (readiness.status === "blocked") {
    return "Blocker zuerst schliessen";
  }
  return "Pruefpunkte schliessen, dann Angebot entscheiden";
}

function actionPlanTone(
  readiness: AcquisitionReadinessSummary,
  decision: DealDecisionBrief
): ReturnType<typeof scoreTone> {
  if (readiness.status === "ready") {
    return "good";
  }
  if (readiness.status === "blocked" || decision.decision === "reject") {
    return "risk";
  }
  return "watch";
}

function actionPlanSummary(readiness: AcquisitionReadinessSummary, evidencePercent: number, stepCount: number): string {
  if (readiness.status === "ready") {
    return `Alle ${readiness.total} Freigabe-Gates sind bestanden. Beleg-Score liegt bei ${evidencePercent} %.`;
  }
  return `${stepCount} priorisierte Schritte offen. Beleg-Score liegt bei ${evidencePercent} %, Freigabe bei ${readiness.readyCount}/${readiness.total}.`;
}

function actionPlanStopRule(readiness: AcquisitionReadinessSummary): string {
  if (readiness.status === "ready") {
    return "Finales Angebot nur mit dokumentiertem Memo, Finanzierungscheck und unterschriftsfaehigem Unterlagenpaket vorbereiten.";
  }
  return `Kein finales Angebot und kein Notartermin, solange ${readiness.readyCount}/${readiness.total} Freigabe-Gates bestanden sind.`;
}

function actionPlanStepOverlaps(step: DealActionPlanStep, action: string): boolean {
  const detail = normalizeActionText(step.detail);
  const label = normalizeActionText(step.label);
  const normalizedAction = normalizeActionText(action);
  return (
    normalizedAction.includes(detail) ||
    detail.includes(normalizedAction) ||
    (label.length > 3 && normalizedAction.includes(label))
  );
}

function actionPlanSupplementalLabel(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes("miet")) return "Mietrecht";
  if (normalized.includes("sanierung") || normalized.includes("capex") || normalized.includes("energie")) return "Capex/Energie";
  if (normalized.includes("airbnb") || normalized.includes("zweckentfremd")) return "Airbnb-Recht";
  if (normalized.includes("pendler") || normalized.includes("innenstadt")) return "Zielgruppe";
  return "Folgepruefung";
}

function normalizeActionText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function executionSprintStatus(readiness: AcquisitionReadinessSummary): DealExecutionSprintStatus {
  if (readiness.status === "ready") return "ready";
  if (readiness.status === "blocked") return "blocked";
  return "review";
}

function executionSprintTone(status: DealExecutionSprintStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "blocked") return "risk";
  return "watch";
}

function executionSprintHeadline(
  status: DealExecutionSprintStatus,
  actionPlan: DealActionPlanBrief,
  market: DealMarketComparisonBrief
): string {
  if (status === "ready") {
    return "Sprint: Angebot und Memo finalisieren";
  }
  if (status === "blocked" && (market.status === "overpriced" || actionPlan.headline.includes("Preisanker"))) {
    return "Sprint: Preis, Belege und Vor-Ort-Risiken klaeren";
  }
  if (status === "blocked") {
    return "Sprint: Blocker vor jedem Gebot schliessen";
  }
  return "Sprint: Belege schliessen und Potential pruefen";
}

function executionSprintPriceTask(
  actionPlan: DealActionPlanBrief,
  market: DealMarketComparisonBrief
): DealExecutionSprintTask {
  const blocked = actionPlan.tone === "risk" || market.status === "overpriced";
  const gapText = market.marketGapEur !== null ? `${offerCurrencyText(market.marketGapEur)} Markt-Gap` : "Marktanker fehlt";
  return {
    category: "Preis",
    label: "Preisanker setzen",
    priorityLabel: blocked ? "Vor Gebot" : "Vor Freigabe",
    tone: blocked ? "risk" : market.tone,
    owner: "Ankauf",
    due: blocked ? "Heute" : "Vor Angebot",
    why: blocked ? `${gapText}; Preisanker vor weiterer Due Diligence klaeren.` : `Preisanker und Marktlogik final gegenpruefen: ${gapText}.`,
    proof: actionPlan.primaryAction || market.nextActions[0] || "Cashflow-, Rendite- und Marktanker dokumentieren.",
    targetHref: "#deal-offer-band",
    targetLabel: "Preisbereich oeffnen"
  };
}

function executionSprintDocumentTask(documents: DueDiligenceDocumentSummary): DealExecutionSprintTask {
  const hasMissing = documents.missingLabels.length > 0;
  const hasReview = documents.requestPack.reviewCount > 0;
  return {
    category: "Unterlagen",
    label: "Unterlagenpaket anfordern",
    priorityLabel: hasMissing ? "Vor Gebot" : hasReview ? "Vor Freigabe" : "Ablage",
    tone: hasMissing ? "risk" : hasReview ? "watch" : "good",
    owner: hasMissing ? "Makler/Verwalter" : "Ankauf",
    due: hasMissing ? "48h" : "Vor Memo",
    why: hasMissing
      ? `${documents.missingLabels.length} Pflichtunterlagen fehlen; ohne Paket bleibt jede Preisindikation unverbindlich.`
      : documents.nextAction,
    proof: `${documents.requestPack.copySubject}. ${documents.requestPack.nextAction}`,
    targetHref: "#deal-evidence-board",
    targetLabel: "Unterlagen oeffnen"
  };
}

function executionSprintMicroLocationTask(
  readiness: AcquisitionReadinessSummary,
  evidence: DealEvidenceQualityBrief,
  coordinateReadiness: MicroLocationCoordinateReadinessBrief
): DealExecutionSprintTask {
  if (coordinateReadiness.status === "missing") {
    return {
      category: "Mikrolage",
      label: "Koordinaten setzen",
      priorityLabel: "Vor Gebot",
      tone: "risk",
      owner: "Research",
      due: "Heute",
      why: coordinateReadiness.summary,
      proof: `${coordinateReadiness.priceRule} ${coordinateReadiness.nextAction}`,
      targetHref: "#deal-micro-location-panel",
      targetLabel: "Mikrolage oeffnen"
    };
  }

  if (coordinateReadiness.status === "needs_evidence") {
    return {
      category: "Mikrolage",
      label: "Lagebelege nachziehen",
      priorityLabel: "Vor Gebot",
      tone: coordinateReadiness.tone,
      owner: "Research/Besichtigung",
      due: "Vor Gebot",
      why: coordinateReadiness.summary,
      proof: `${coordinateReadiness.priceRule} ${coordinateReadiness.nextAction}`,
      targetHref: "#deal-micro-location-panel",
      targetLabel: "Mikrolage oeffnen"
    };
  }

  const gate = readiness.gates.find((item) => item.key === "microlocation");
  const action =
    gate?.actions.find((item) => item.includes("Mikrolage-Belege")) ||
    evidence.nextActions.find((item) => item.includes("Mikrolage-Belege")) ||
    "Mikrolage-Belege fuer OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren ergaenzen.";
  const open = gate?.status !== "pass";

  return {
    category: "Mikrolage",
    label: "Vor-Ort-/Lagecheck",
    priorityLabel: open ? "Vor Gebot" : "Besichtigung",
    tone: open ? gate?.tone || evidence.tone : "good",
    owner: "Besichtigung",
    due: open ? "Vor Gebot" : "Vor Notar",
    why: "Bahnhof/U-Bahn, Alltag, Messestadt-/Jobanker, Freizeitangebote, Airbnb und Stoerfaktoren vor Ort gegenpruefen.",
    proof: action,
    targetHref: "#deal-micro-location-panel",
    targetLabel: "Mikrolage oeffnen"
  };
}

function executionSprintDevelopmentTask(development: ObjectDevelopmentPotentialBrief): DealExecutionSprintTask {
  const topLever = development.prioritizedLevers[0];
  const firstExecutionStep = development.executionPlan[0];
  const proofTail =
    topLever
      ? `${topLever.label}: ${topLever.nextCheck}`
      : firstExecutionStep
        ? `${firstExecutionStep.title}: ${firstExecutionStep.proof}`
        : development.nextActions[0] || "Entwicklungsannahmen fachlich pruefen.";

  return {
    category: "Entwicklung",
    label: "Entwicklungspotential belegen",
    priorityLabel: development.valueDecision.priceableValueEur > 0 ? "Vor Preisbonus" : "Memo-Upside",
    tone: development.valueDecision.tone,
    owner: "Asset/Capex",
    due: "Vor Preisbonus",
    why: development.valueDecision.summary || development.summary,
    proof: `Miethebel, Capex, WEG/Grundriss, Lage-/Nutzungshebel und Refi getrennt belegen. ${proofTail}`,
    targetHref: "#deal-development-potential-map",
    targetLabel: "Entwicklung oeffnen"
  };
}

function executionSprintCompsTask(market: DealMarketComparisonBrief): DealExecutionSprintTask {
  const needsComps = market.status !== "fair";
  const proof = market.nextActions[0]?.replace("Echte Vergleichsangebote", "Vergleichsangebote") || "Vergleichsangebote und, wenn moeglich, Abschlussdaten nachziehen.";
  return {
    category: "Comps",
    label: "Vergleichsangebote belegen",
    priorityLabel: needsComps ? "Vor Gebot" : "Review",
    tone: market.tone,
    owner: "Research",
    due: needsComps ? "Heute" : "Vor Memo",
    why: market.summary,
    proof,
    targetHref: "#deal-market-comparison",
    targetLabel: "Comps oeffnen"
  };
}

function executionSprintMemoTask(
  status: DealExecutionSprintStatus,
  actionPlan: DealActionPlanBrief
): DealExecutionSprintTask {
  return {
    category: "Bank/Memo",
    label: "Freigabe-Story absichern",
    priorityLabel: status === "ready" ? "Final" : "Vor Gebot",
    tone: executionSprintTone(status),
    owner: "Finanzierung",
    due: status === "ready" ? "Vor Versand" : "Vor Gebot",
    why: "Bank, Komitee und Verhandlung brauchen dieselbe Story: Preis, Belege, Entwicklungspotential und Risiken getrennt.",
    proof: `${actionPlan.stopRule} Memo zeigt Preisanker, Unterlagen, Entwicklungspotential, Mikrolage und Risiko-Puffer getrennt.`,
    targetHref: "#deal-readiness",
    targetLabel: "Freigabe oeffnen"
  };
}

function executionSprintMilestones(tasks: DealExecutionSprintTask[]): DealExecutionSprintMilestone[] {
  const groups = new Map<DealExecutionSprintMilestoneKey, DealExecutionSprintTask[]>();
  tasks.forEach((task) => {
    const key = executionSprintMilestoneKey(task);
    groups.set(key, [...(groups.get(key) || []), task]);
  });

  return [
    executionSprintMilestone("pre_bid", "Vor Gebot", "Entsperrt Preisindikation", "Preisindikation moeglich", groups),
    executionSprintMilestone(
      "pre_release",
      "Vor Freigabe/LOI",
      "Entsperrt LOI/Freigabe",
      "Freigabe nicht durch Sprint blockiert",
      groups
    ),
    executionSprintMilestone(
      "pre_notary",
      "Vor Notar",
      "Entsperrt Notarvorbereitung",
      "Notar nicht durch Sprint blockiert",
      groups
    ),
    executionSprintMilestone("memo", "Memo/Nachlauf", "Bleibt Memo-Aufgabe", "Kein Memo-Nachlauf offen", groups)
  ];
}

function executionSprintMilestone(
  key: DealExecutionSprintMilestoneKey,
  label: string,
  unlock: string,
  emptyUnlock: string,
  groups: Map<DealExecutionSprintMilestoneKey, DealExecutionSprintTask[]>
): DealExecutionSprintMilestone {
  const groupTasks = groups.get(key) || [];
  const owners = uniqueItems(groupTasks.map((task) => task.owner)).slice(0, 3);

  return {
    key,
    label,
    count: groupTasks.length,
    taskLabels: groupTasks.map((task) => task.label),
    ownerLine: owners.length ? owners.join(", ") : "Kein Owner offen",
    unlock: groupTasks.length ? unlock : emptyUnlock,
    tone: executionSprintMilestoneTone(groupTasks)
  };
}

function executionSprintMilestoneKey(task: DealExecutionSprintTask): DealExecutionSprintMilestoneKey {
  if (task.priorityLabel === "Vor Gebot") return "pre_bid";
  if (task.priorityLabel === "Memo-Upside" || task.priorityLabel === "Ablage") return "memo";
  if (
    task.priorityLabel === "Vor Freigabe" ||
    task.priorityLabel === "Vor Preisbonus" ||
    task.priorityLabel === "Besichtigung" ||
    task.priorityLabel === "Review" ||
    task.priorityLabel === "Final"
  ) {
    return "pre_release";
  }
  if (task.due === "Vor Notar") return "pre_notary";
  return "memo";
}

function executionSprintMilestoneTone(tasks: DealExecutionSprintTask[]): ReturnType<typeof scoreTone> {
  if (tasks.some((task) => task.tone === "risk")) return "risk";
  if (tasks.some((task) => task.tone === "watch")) return "watch";
  if (tasks.length > 0) return "good";
  return "empty";
}

function executionSprintMicroLocationFact(readiness: AcquisitionReadinessSummary): string {
  const gate = readiness.gates.find((item) => item.key === "microlocation");
  return gate ? gate.statusLabel : "Pruefen";
}

function executionSprintMicroLocationTone(
  readiness: AcquisitionReadinessSummary,
  evidence: DealEvidenceQualityBrief
): ReturnType<typeof scoreTone> {
  const gate = readiness.gates.find((item) => item.key === "microlocation");
  return gate?.tone || evidence.tone;
}

function executionSprintDevelopmentFact(
  development: ObjectDevelopmentPotentialBrief,
  developmentPricing: DealDevelopmentPricingDisciplineBrief
): string {
  const topLever = development.prioritizedLevers[0]?.label;
  if (developmentPricing.allowedCreditEur > 0) {
    return `${offerCurrencyText(developmentPricing.allowedCreditEur)} Credit`;
  }
  return topLever || "Memo-Upside";
}

function siteVisitMicroLocationSection(readiness: MicroLocationReadinessBrief): DealSiteVisitSection {
  const rows = new Map(readiness.rows.map((row) => [row.key, row]));
  const checks: DealSiteVisitCheck[] = [];
  const nuisance = rows.get("nuisance");
  const transit = rows.get("transit");
  const demand = rows.get("demand_anchor");
  const leisure = rows.get("leisure");

  if (nuisance && nuisance.status !== "missing") {
    checks.push(
      siteVisitCheck({
        key: "nuisance",
        question: "Wie laut ist die Hauptstrasse wirklich?",
        priorityLabel: nuisance.status === "brake" ? "Vor Gebot" : "Besichtigung",
        tone: nuisance.tone,
        owner: "Besichtigung",
        proof: nuisance.nextAction,
        decisionUse: nuisance.decisionUse,
        priceRelevant: nuisance.status === "brake"
      })
    );
  }
  if (transit && transit.status !== "missing") {
    checks.push(
      siteVisitCheck({
        key: "transit",
        question: "Traegt Bahnhof/U-Bahn die Vermietungsthese?",
        priorityLabel: transit.status === "price" ? "Vor Gebot" : "Besichtigung",
        tone: transit.tone,
        owner: "Besichtigung",
        proof: `${transit.proof} · ${transit.nextAction}`,
        decisionUse: transit.decisionUse,
        priceRelevant: transit.status === "price"
      })
    );
  }
  if (demand && demand.status !== "missing") {
    checks.push(
      siteVisitCheck({
        key: "demand_anchor",
        question: "Ist die Messestadt-/Jobnachfrage vor Ort sichtbar?",
        priorityLabel: demand.status === "price" ? "Vor Gebot" : "Besichtigung",
        tone: demand.tone,
        owner: "Besichtigung",
        proof: `${demand.proof} · ${demand.nextAction}`,
        decisionUse: demand.decisionUse,
        priceRelevant: demand.status === "price"
      })
    );
  }
  if (leisure && leisure.status !== "missing") {
    checks.push(
      siteVisitCheck({
        key: "leisure",
        question: "Welche Freizeit-/Aufenthaltsqualitaet merkt man vor Ort?",
        priorityLabel: "Besichtigung",
        tone: leisure.tone,
        owner: "Besichtigung",
        proof: `${leisure.proof} · ${leisure.nextAction}`,
        decisionUse: leisure.decisionUse,
        priceRelevant: false
      })
    );
  }

  if (!checks.length) {
    checks.push(
      siteVisitCheck({
        key: "microlocation_fallback",
        question: "Welche Lageannahmen fehlen fuer die Vermietungsthese?",
        priorityLabel: "Vor Gebot",
        tone: "watch",
        owner: "Besichtigung",
        proof: "OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren vor Ort oder mit Kartendaten pruefen.",
        decisionUse: "Keine Lagepraemie freigeben, bis die Mikrolage belegt ist.",
        priceRelevant: true
      })
    );
  }

  return {
    key: "micro_location",
    label: "Mikrolage vor Ort",
    summary: "Lagehebel und Stoerfaktoren direkt gegen die Preis- und Vermietungsthese halten.",
    tone: siteVisitSectionTone(checks),
    checks
  };
}

function siteVisitObjectSection(
  deal: Deal,
  development: ObjectDevelopmentPotentialBrief
): DealSiteVisitSection {
  const listing = deal.listing || null;
  const capex = numberValue(listing?.expected_initial_capex);
  const energyClass = typeof listing?.energy_class === "string" ? listing.energy_class.toUpperCase() : null;
  const condition = typeof listing?.condition === "string" && listing.condition.trim() ? listing.condition : "Zustand offen";
  const weakEnergy = energyClass !== null && ["E", "F", "G", "H"].includes(energyClass);
  const topLever = development.prioritizedLevers[0];
  const checks: DealSiteVisitCheck[] = [
    siteVisitCheck({
      key: "capex",
      question: "Welche Arbeiten treiben das Sanierungsbudget?",
      priorityLabel: capex !== null && capex > 0 ? "Vor Preisbonus" : "Besichtigung",
      tone: capex !== null && capex > 0 ? "watch" : weakEnergy ? "watch" : "empty",
      owner: "Asset/Capex",
      proof:
        capex !== null
          ? `${formatCurrency(capex)} Sanierungsbudget; Zustand ${condition}${energyClass ? `, Energieklasse ${energyClass}` : ""}.`
          : `Sanierungsbudget fehlt; Zustand ${condition}${energyClass ? `, Energieklasse ${energyClass}` : ""}.`,
      decisionUse: "Capex nur nach Angeboten, Energieausweis und Leistungsbeschreibung als Entwicklungswert werten.",
      priceRelevant: Boolean((capex !== null && capex > 0) || weakEnergy)
    }),
    siteVisitCheck({
      key: "development_lever",
      question: "Wo genau entsteht der Objekt-Werthebel?",
      priorityLabel: topLever?.estimatedValueEur ? "Vor Preisbonus" : "Memo",
      tone: topLever?.tone || development.tone,
      owner: "Asset/Ankauf",
      proof: topLever ? `${topLever.label}: ${topLever.nextCheck}` : development.nextActions[0] || "Entwicklungshebel fachlich pruefen.",
      decisionUse: "Miethebel, Refi, Grundriss/WEG und Lage-/Nutzungschance getrennt dokumentieren.",
      priceRelevant: Boolean(topLever?.estimatedValueEur)
    })
  ];

  return {
    key: "object_capex",
    label: "Objektzustand & Capex",
    summary: "Sanierung, Energie und Werthebel vor Ort in Euro und Belegpflicht uebersetzen.",
    tone: siteVisitSectionTone(checks),
    checks
  };
}

function siteVisitRentSection(deal: Deal, readiness: MicroLocationReadinessBrief): DealSiteVisitSection {
  const listing = deal.listing || null;
  const currentRent = numberValue(listing?.cold_rent_monthly);
  const marketRent = numberValue(listing?.market_rent_estimate_monthly);
  const livingArea = numberValue(listing?.living_area_sqm);
  const legalTargetPerSqm = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const legalTargetRent = livingArea !== null && legalTargetPerSqm !== null ? livingArea * legalTargetPerSqm : null;
  const shortTerm = readiness.rows.find((row) => row.key === "short_term");
  const checks: DealSiteVisitCheck[] = [
    siteVisitCheck({
      key: "rent_law",
      question: "Welche Miete ist rechtlich wirklich erreichbar?",
      priorityLabel: "Vor Gebot",
      tone: deal.rent_law?.status === "plausible" && deal.rent_law?.confidence === "high" ? "good" : "watch",
      owner: "Ankauf/Mietrecht",
      proof: siteVisitRentProof(currentRent, marketRent, legalTargetRent, legalTargetPerSqm),
      decisionUse: "Miethebel nur mit Mietvertrag, Mietspiegel und rechtlich plausibler Zielmiete in den Kaufpreis uebernehmen.",
      priceRelevant: true
    })
  ];

  if (shortTerm && shortTerm.status !== "missing") {
    checks.push(
      siteVisitCheck({
        key: "short_term_rental",
        question: "Ist Airbnb nur Memo-Upside oder rechtlich nutzbar?",
        priorityLabel: "Memo-Upside",
        tone: shortTerm.tone,
        owner: "Ankauf/Recht",
        proof: `${shortTerm.proof} · ${shortTerm.nextAction}`,
        decisionUse: shortTerm.decisionUse,
        priceRelevant: false
      })
    );
  }

  return {
    key: "rent_use",
    label: "Miete & Nutzung",
    summary: "Miete, Mietrecht und optionale Kurzzeitvermietung sauber von Basis-Cashflow trennen.",
    tone: siteVisitSectionTone(checks),
    checks
  };
}

function siteVisitEvidenceSection(
  deal: Deal,
  documents: DueDiligenceDocumentSummary,
  evidence: DealEvidenceQualityBrief
): DealSiteVisitSection {
  const geo = deal.geo_context || null;
  const geoSpecial = Boolean(geo?.milieu_protection_area || geo?.redevelopment_area || geo?.monument_protection);
  const hasWeg = Boolean(deal.weg_health);
  const checks: DealSiteVisitCheck[] = [
    siteVisitCheck({
      key: "documents",
      question: "Welche Unterlagen fehlen vor Preisfreigabe?",
      priorityLabel: documents.missingLabels.length ? "Vor Gebot" : documents.requestPack.reviewCount ? "Vor Freigabe" : "Ablage",
      tone: documents.missingLabels.length ? "risk" : documents.requestPack.reviewCount ? "watch" : "good",
      owner: "Makler/Verwalter",
      proof: documents.missingLabels.length
        ? `${documents.missingLabels.slice(0, 4).join(", ")}${documents.missingLabels.length > 4 ? " ..." : ""} fehlen.`
        : documents.nextAction,
      decisionUse: "Unterlagenpaket muss Kaufpreis, Objektzustand, WEG, Mietvertrag und Bankstory tragen.",
      priceRelevant: documents.missingLabels.length > 0 || documents.requestPack.reviewCount > 0
    }),
    siteVisitCheck({
      key: "weg_geo",
      question: "Gibt es WEG-/Geo-Einschraenkungen fuer die Entwicklung?",
      priorityLabel: geoSpecial || !hasWeg ? "Vor Gebot" : "Vor Notar",
      tone: geoSpecial || !hasWeg ? "risk" : evidence.tone,
      owner: "Asset/Verwalter",
      proof: siteVisitWegGeoProof(deal),
      decisionUse: "WEG, Milieuschutz, Sanierungsgebiet und Teilungserklaerung koennen Capex, Umbau und Exit begrenzen.",
      priceRelevant: geoSpecial || !hasWeg
    })
  ];

  return {
    key: "evidence_weg_geo",
    label: "Unterlagen & WEG/Geo",
    summary: "Belege schliessen, damit Entwicklungspotential nicht nur eine Story bleibt.",
    tone: siteVisitSectionTone(checks),
    checks
  };
}

function siteVisitCheck(input: DealSiteVisitCheck): DealSiteVisitCheck {
  return input;
}

function siteVisitSectionTone(checks: DealSiteVisitCheck[]): ReturnType<typeof scoreTone> {
  if (checks.some((check) => check.tone === "risk")) return "risk";
  if (checks.some((check) => check.tone === "watch")) return "watch";
  if (checks.some((check) => check.tone === "good")) return "good";
  return "empty";
}

function siteVisitRentProof(
  currentRent: number | null,
  marketRent: number | null,
  legalTargetRent: number | null,
  legalTargetPerSqm: number | null
): string {
  const parts = [
    currentRent !== null ? `Ist-Miete ${formatCurrency(currentRent)}` : "Ist-Miete fehlt",
    marketRent !== null ? `Marktmiete ${formatCurrency(marketRent)}` : "Marktmiete fehlt",
    legalTargetRent !== null ? `rechtlich plausible Zielmiete ${formatCurrency(legalTargetRent)}` : null,
    legalTargetPerSqm !== null ? `${formatNumber(legalTargetPerSqm, " €/m2")} Zielmiete/m2` : null
  ].filter((part): part is string => Boolean(part));
  return `${parts.join(", ")}.`;
}

function siteVisitWegGeoProof(deal: Deal): string {
  const geo = deal.geo_context || null;
  const topics = [
    geo?.milieu_protection_area ? "Milieuschutz" : null,
    geo?.redevelopment_area ? "Sanierungsgebiet" : null,
    geo?.monument_protection ? "Denkmalschutz" : null
  ].filter((topic): topic is string => Boolean(topic));
  const weg = deal.weg_health ? "WEG-Check vorhanden" : "WEG-Check fehlt";
  const confidence = numberValue(geo?.data_confidence_percent);
  const geoText = topics.length ? topics.join(", ") : "kein Geo-Sonderthema belegt";
  return `${weg}; ${geoText}; Geo-Vertrauen ${confidence !== null ? formatPercent(confidence) : "fehlt"}.`;
}

function siteVisitCopyPrompt(sections: DealSiteVisitSection[]): string {
  const questions = sections.flatMap((section) => section.checks.map((check) => check.question)).slice(0, 6);
  return `Bitte zur Besichtigung vorbereiten: ${questions.join(" | ")}. Fotos/Belege direkt den Preis-, Capex- und Mietannahmen zuordnen.`;
}

function bidStackBaseWalkAway(
  cashflowAnchor: number | null,
  yieldAnchor: number | null,
  offerBand: DealOfferBandBrief
): number | null {
  const anchors = [cashflowAnchor, yieldAnchor].filter((value): value is number => value !== null);
  if (anchors.length > 0) {
    return roundDownTo500(Math.min(...anchors));
  }
  if (offerBand.walkAwayPrice !== null) {
    return Math.max(0, offerBand.walkAwayPrice - offerBand.developmentCreditEur);
  }
  return null;
}

function bidStackStatus(
  finalCeilingPrice: number | null,
  sendStatus: string,
  offerBand: DealOfferBandBrief,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief
): DealBidStackStatus {
  if (finalCeilingPrice === null) return "missing";
  if (sendStatus === "Pausieren" || offerBand.status === "price_gap" || riskAdjustedOffer.status === "blocked") {
    return "blocked";
  }
  return "ready";
}

function bidStackTone(status: DealBidStackStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "blocked") return "risk";
  return "empty";
}

function bidStackHeadline(
  status: DealBidStackStatus,
  sendStatus: string,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief
): string {
  if (status === "missing") return "Gebots-Stack fehlt";
  if (sendStatus === "Pausieren" || riskAdjustedOffer.status === "blocked") {
    return "Gebot nur als Preisanker, nicht bindend";
  }
  if (riskAdjustedOffer.status === "guarded") return "Gebot mit Risiko-Puffer freigeben";
  return "Gebots-Stack freigabereif";
}

function bidStackSummary(
  askingPrice: number | null,
  finalCeilingPrice: number | null,
  priceGapToCeiling: number | null,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief
): string {
  if (askingPrice === null || finalCeilingPrice === null || priceGapToCeiling === null) {
    return "Kaufpreis, Walk-away oder Risiko-Deckel fehlen; Gebot noch nicht ableiten.";
  }
  const ceilingLabel = riskAdjustedOffer.riskAdjustedCeilingPrice !== null ? "Risiko-Deckel" : "Walk-away";
  return `Von Forderung ${offerCurrencyText(askingPrice)} zum ${ceilingLabel} ${offerCurrencyText(finalCeilingPrice)}: ${offerCurrencyText(priceGapToCeiling)} Abstand.`;
}

function bidStackSendStatus(
  offerBand: DealOfferBandBrief,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief
): string {
  if (offerBand.startOfferPrice === null || riskAdjustedOffer.riskAdjustedCeilingPrice === null) return "Fehlt";
  if (riskAdjustedOffer.riskAdjustedCeilingPrice < offerBand.startOfferPrice) return "Pausieren";
  if (riskAdjustedOffer.status === "blocked" || offerBand.status === "price_gap") return "Nur indikativ";
  return "Sendefaehig";
}

function bidStackNegotiationRange(
  offerBand: DealOfferBandBrief,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief,
  sendStatus: string
): string {
  if (offerBand.startOfferPrice === null || offerBand.targetOfferPrice === null) {
    return "Startgebot und Zielpreis fehlen; erst Underwriting rechnen.";
  }
  if (sendStatus === "Pausieren" && riskAdjustedOffer.riskAdjustedCeilingPrice !== null) {
    return `Kein sendefaehiges Band: Risiko-Deckel ${offerCurrencyText(riskAdjustedOffer.riskAdjustedCeilingPrice)} liegt unter Startgebot ${offerCurrencyText(offerBand.startOfferPrice)}.`;
  }
  return `Start ${offerCurrencyText(offerBand.startOfferPrice)}, Ziel ${offerCurrencyText(offerBand.targetOfferPrice)}, Walk-away ${offerBand.walkAwayPrice !== null ? offerCurrencyText(offerBand.walkAwayPrice) : "Fehlt"}.`;
}

function bidStackBandValue(
  offerBand: DealOfferBandBrief,
  riskAdjustedOffer: DealRiskAdjustedOfferBrief,
  sendStatus: string
): string {
  if (sendStatus === "Pausieren") return "Pausieren";
  if (offerBand.startOfferPrice === null || offerBand.targetOfferPrice === null) return "Fehlt";
  if (riskAdjustedOffer.riskAdjustedCeilingPrice !== null && riskAdjustedOffer.riskAdjustedCeilingPrice < offerBand.targetOfferPrice) {
    return `${offerCurrencyText(offerBand.startOfferPrice)} bis ${offerCurrencyText(riskAdjustedOffer.riskAdjustedCeilingPrice)}`;
  }
  return `${offerCurrencyText(offerBand.startOfferPrice)} bis ${offerCurrencyText(offerBand.targetOfferPrice)}`;
}

function bidStackGuardrails(input: {
  market: DealMarketComparisonBrief;
  offerBand: DealOfferBandBrief;
  riskAdjustedOffer: DealRiskAdjustedOfferBrief;
  sendStatus: string;
}): string[] {
  return uniqueItems(
    [
      input.sendStatus === "Pausieren"
        ? "Kein Angebot senden: Risiko-Deckel liegt unter dem rechnerischen Startgebot."
        : null,
      input.market.status === "overpriced" && input.market.marketGapEur !== null
        ? `${offerCurrencyText(input.market.marketGapEur)} Markt-Gap als Abschlag oder harte Comps dokumentieren.`
        : null,
      input.offerBand.developmentCreditEur > 0
        ? `Entwicklungs-Credit ${offerCurrencyText(input.offerBand.developmentCreditEur)} separat im Memo und in der Freigabe zeigen.`
        : "0 € Entwicklung im Gebot: Upside bleibt Memo-Chance, bis WEG, Geo, Capex und Bank-Case belegt sind.",
      input.riskAdjustedOffer.requiredReserveEur > 0
        ? `Risiko-Reserve ${offerCurrencyText(input.riskAdjustedOffer.requiredReserveEur)} nicht in Verkaeuferkommunikation aufloesen.`
        : null
    ].filter((item): item is string => Boolean(item))
  );
}

function bidStackCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Fehlt";
  if (value < 0) return `-${offerCurrencyText(Math.abs(value))}`;
  return offerCurrencyText(value);
}

export function dealPricingBrief(deal: Deal): DealPricingBrief {
  const currentPrice =
    numberValue(deal.listing?.purchase_price) ?? numberValue(deal.latest_underwriting?.all_in_purchase_price);
  const neutralPrice = numberValue(deal.latest_underwriting?.max_purchase_price_for_neutral_cashflow);

  if (currentPrice === null || neutralPrice === null) {
    return {
      status: "missing",
      label: "Preisanker fehlt",
      value: "Fehlt",
      anchor: formatCurrency(neutralPrice),
      tone: "empty",
      summary: "Kaufpreis oder Cashflow-neutraler Preisanker fehlt noch.",
      gapEur: null,
      anchorValue: neutralPrice
    };
  }

  const gap = currentPrice - neutralPrice;
  if (gap > 0) {
    const value = formatCurrency(gap);
    return {
      status: "gap",
      label: "Preis-Luecke",
      value,
      anchor: formatCurrency(neutralPrice),
      tone: "risk",
      summary: `Kaufpreis liegt ${value} ueber neutralem Cashflow-Preis.`,
      gapEur: gap,
      anchorValue: neutralPrice
    };
  }

  const value = formatCurrency(Math.abs(gap));
  return {
    status: "buffer",
    label: "Preis-Puffer",
    value,
    anchor: formatCurrency(neutralPrice),
    tone: "good",
    summary: `Kaufpreis liegt ${value} unter neutralem Cashflow-Preis.`,
    gapEur: gap,
    anchorValue: neutralPrice
  };
}

export function dealMarketComparisonBrief(deal: Deal): DealMarketComparisonBrief {
  const listing = deal.listing || null;
  const purchasePrice = numberValue(listing?.purchase_price);
  const livingArea = numberValue(listing?.living_area_sqm);
  const askingPricePerSqm =
    numberValue(deal.latest_underwriting?.price_per_sqm) ??
    (purchasePrice !== null && livingArea !== null && livingArea > 0 ? Math.round(purchasePrice / livingArea) : null);
  const marketPricePerSqm = numberValue(deal.market_price_per_sqm);
  const marketValueEstimateEur =
    marketPricePerSqm !== null && livingArea !== null ? Math.round(marketPricePerSqm * livingArea) : null;
  const marketGapPercent =
    askingPricePerSqm !== null && marketPricePerSqm !== null && marketPricePerSqm > 0
      ? Math.round(((askingPricePerSqm / marketPricePerSqm) - 1) * 100)
      : null;
  const marketGapEur =
    purchasePrice !== null && marketValueEstimateEur !== null
      ? roundDownTo500(Math.abs(purchasePrice - marketValueEstimateEur))
      : null;
  const status = marketComparisonStatus({ askingPricePerSqm, marketGapPercent, marketPricePerSqm });
  const tone = marketComparisonTone(status);
  const rows = marketComparisonRows(deal, {
    askingPricePerSqm,
    livingArea,
    marketGapPercent,
    marketPricePerSqm
  });

  return {
    status,
    headline: marketComparisonHeadline(status),
    tone,
    summary: marketComparisonSummary(status, marketGapEur, listing),
    askingPricePerSqm,
    marketPricePerSqm,
    marketGapPercent,
    marketGapEur,
    marketValueEstimateEur,
    facts: [
      {
        label: "Angebot",
        value: formatPricePerSqm(askingPricePerSqm),
        tone
      },
      {
        label: "Marktanker",
        value: formatPricePerSqm(marketPricePerSqm),
        tone: marketPricePerSqm !== null ? "watch" : "empty"
      },
      {
        label: "Markt-Gap",
        value: formatSignedPercent(marketGapPercent),
        tone
      },
      {
        label: "Gap EUR",
        value: marketGapEur !== null ? offerCurrencyText(marketGapEur) : "Fehlt",
        tone
      },
      {
        label: "Marktwert",
        value: marketValueEstimateEur !== null ? offerCurrencyText(marketValueEstimateEur) : "Fehlt",
        tone: marketValueEstimateEur !== null ? "watch" : "empty"
      }
    ],
    rows,
    guardrails: marketComparisonGuardrails(status, marketGapEur),
    nextActions: marketComparisonNextActions(status, listing, rows)
  };
}

export function dealComparableEvidenceBrief(deal: Deal): DealComparableEvidenceBrief {
  const listing = deal.listing || null;
  const livingArea = numberValue(listing?.living_area_sqm);
  const purchasePrice = numberValue(listing?.purchase_price);
  const askingPricePerSqm =
    numberValue(deal.latest_underwriting?.price_per_sqm) ??
    (purchasePrice !== null && livingArea !== null && livingArea > 0 ? Math.round(purchasePrice / livingArea) : null);
  const marketPricePerSqm = numberValue(deal.market_price_per_sqm);
  const referenceRentPerSqm = numberValue(deal.local_reference_rent_per_sqm);
  const currentRentPerSqm = rentPerSqm(listing?.cold_rent_monthly, livingArea);
  const priceReductionCount = numberValue(listing?.price_reduction_count);
  const daysOnMarket = numberValue(listing?.days_on_market);
  const externalCompDocs = comparableEvidenceDocuments(deal.documents || []);
  const reviewedExternalComps = externalCompDocs.filter((document) => document.review_status === "reviewed" || document.review_status === "approved");
  const requiredComps = 3;
  const rows: DealComparableEvidenceRow[] = [
    comparableEvidenceRow({
      key: "asking_price",
      label: "Angebotspreis",
      source: listing?.source || "Listing",
      value: formatPricePerSqm(askingPricePerSqm),
      status: askingPricePerSqm !== null ? "proxy" : "missing",
      rule: "Angebotspreis ist nur der Startpunkt, kein Marktbeweis.",
      nextAction: "Expose-/Listingpreis gegen echte Vergleichsobjekte spiegeln."
    }),
    comparableEvidenceRow({
      key: "market_price_anchor",
      label: "Marktpreisanker",
      source: "Interner Marktanker",
      value: formatPricePerSqm(marketPricePerSqm),
      status: marketPricePerSqm !== null ? "proxy" : "missing",
      rule: "Modellanker hilft beim Screening, ersetzt aber keine Comps.",
      nextAction: comparablePlaceAction("Marktpreisanker", listing)
    }),
    comparableEvidenceRow({
      key: "rent_anchor",
      label: "Mietanker",
      source: referenceRentPerSqm !== null ? "Referenzmiete/Mietspiegel" : "Mietanker fehlt",
      value: currentRentPerSqm !== null ? `${formatRentPerSqm(currentRentPerSqm)} Ist vs. ${formatRentPerSqm(referenceRentPerSqm)}` : formatRentPerSqm(referenceRentPerSqm),
      status: currentRentPerSqm !== null && referenceRentPerSqm !== null ? "proxy" : "missing",
      rule: "Mietanker stuetzt Upside nur mit Mietvertrag, Mietspiegel und Mietrecht.",
      nextAction: "Mietvertrag, Referenzmiete und rechtlich plausible Zielmiete im Memo zusammenfuehren."
    }),
    comparableEvidenceRow({
      key: "market_momentum",
      label: "Marktbewegung",
      source: listing?.source || "Listing-Historie",
      value:
        daysOnMarket !== null
          ? `${Math.round(daysOnMarket)} Tage${priceReductionCount !== null && priceReductionCount > 0 ? `, ${Math.round(priceReductionCount)} Preisreduktion` : ""}`
          : "Fehlt",
      status: daysOnMarket !== null || priceReductionCount !== null ? "proxy" : "missing",
      rule: "Marktdauer und Preisreduktion sind Verhandlungsindikatoren, keine Wertcomps.",
      nextAction: "Preisverlauf, Maklerfeedback und Wettbewerbsangebote als Verhandlungsbeleg ablegen."
    }),
    comparableEvidenceRow({
      key: "external_comps",
      label: "Echte Vergleichsobjekte",
      source: reviewedExternalComps.length ? "Gepruefte Comp-Dokumente" : externalCompDocs.length ? "Ungepruefte Comp-Dokumente" : "Fehlen",
      value: `${reviewedExternalComps.length}/${requiredComps}`,
      status: reviewedExternalComps.length >= requiredComps ? "verified" : "missing",
      rule: "Mindestens 3 passende Vergleichsobjekte oder Abschlussdaten vor Kaufpreisfreigabe.",
      nextAction: `Mindestens ${requiredComps} echte Vergleichsangebote oder Abschlussdaten fuer PLZ ${listing?.postal_code || listing?.city || "Mikrolage"} nachziehen.`
    })
  ];
  const proxyCount = rows.filter((row) => row.status === "proxy").length;
  const status = comparableEvidenceStatus(reviewedExternalComps.length, proxyCount);
  const tone = comparableEvidenceTone(status);

  return {
    status,
    headline: comparableEvidenceHeadline(status),
    tone,
    summary: comparableEvidenceSummary(status, reviewedExternalComps.length, requiredComps, proxyCount),
    facts: [
      {
        label: "Comp-Status",
        value: comparableEvidenceStatusLabel(status),
        tone
      },
      {
        label: "Echte Comps",
        value: `${reviewedExternalComps.length}/${requiredComps}`,
        tone: reviewedExternalComps.length >= requiredComps ? "good" : "risk"
      },
      {
        label: "Proxy-Anker",
        value: `${proxyCount}/4`,
        tone: proxyCount >= 3 ? "watch" : proxyCount > 0 ? "watch" : "empty"
      },
      {
        label: "Preiswirkung",
        value: status === "verified" ? "Preisfreigabe" : status === "proxy_only" ? "Review" : "Stop",
        tone
      }
    ],
    rows,
    guardrails: [
      "Proxy-Anker sind keine Abschlussliste; Kaufpreis erst mit mindestens 3 passenden Vergleichsobjekten freigeben.",
      "Vergleichsobjekte muessen Lage, Groesse, Zustand, Vermietung und WEG-Risiko sichtbar vergleichbar machen.",
      "Abweichungen zwischen Modellanker und echten Comps im IC-Memo als Preisabschlag oder Risiko erklaeren."
    ],
    nextActions: comparableEvidenceNextActions(rows)
  };
}

export function dealOfferBandBrief(deal: Deal): DealOfferBandBrief {
  const askingPrice = numberValue(deal.listing?.purchase_price);
  const cashflowAnchor = numberValue(deal.latest_underwriting?.max_purchase_price_for_neutral_cashflow);
  const yieldAnchor = numberValue(deal.latest_underwriting?.maximum_purchase_price_for_target_yield);
  const baseAnchors = [cashflowAnchor, yieldAnchor].filter((value): value is number => value !== null);

  if (askingPrice === null || baseAnchors.length === 0) {
    return {
      status: "missing",
      headline: "Angebotsband fehlt",
      tone: "empty",
      summary: "Kaufpreis oder Underwriting-Anker fehlen; Startgebot, Zielpreis und Walk-away sind noch nicht belastbar.",
      askingPrice,
      startOfferPrice: null,
      targetOfferPrice: null,
      walkAwayPrice: null,
      gapToAskEur: null,
      developmentCreditEur: 0,
      reasons: ["Erst Underwriting rechnen, dann Angebotsband festlegen."],
      warnings: ["Ohne Cashflow- und Zielrenditeanker kein finales Angebot ableiten."],
      facts: [
        { label: "Startgebot", value: "Fehlt", tone: "empty" },
        { label: "Zielpreis", value: "Fehlt", tone: "empty" },
        { label: "Walk-away", value: "Fehlt", tone: "empty" },
        { label: "Luecke", value: "Fehlt", tone: "empty" }
      ]
    };
  }

  const baseWalkAway = roundDownTo500(Math.min(...baseAnchors));
  const developmentCredit = offerBandDevelopmentCredit(deal);
  const walkAwayPrice = roundDownTo500(baseWalkAway + developmentCredit.value);
  const targetOfferPrice = roundDownTo500(Math.min(askingPrice, walkAwayPrice * 0.97));
  const startOfferPrice = roundDownTo500(Math.min(targetOfferPrice, targetOfferPrice * 0.93));
  const gapToAskEur = Math.max(0, roundDownTo500(askingPrice - walkAwayPrice));
  const status: DealOfferBandBrief["status"] = gapToAskEur > 0 ? "price_gap" : "within_band";
  const tone: ReturnType<typeof scoreTone> = status === "price_gap" ? "risk" : "good";
  const reasons = uniqueItems([
    "Basis-Walk-away ist der konservativere Wert aus Cashflow-neutralem Preis und Zielrendite.",
    developmentCredit.reason,
    `Startgebot liegt mit ${offerCurrencyText(startOfferPrice)} bewusst unter Zielpreis, damit Verhandlungsspielraum bleibt.`,
    status === "price_gap"
      ? `Angebotspreis liegt ${offerCurrencyText(gapToAskEur)} ueber Walk-away; nur mit Preisabschlag weitergehen.`
      : "Angebotspreis liegt im rechnerischen Band; trotzdem Unterlagen, Bank und Objektchecks vor Bindung pruefen."
  ].filter(Boolean));
  const warnings = uniqueItems(developmentCredit.warnings);

  return {
    status,
    headline: status === "price_gap" ? "Nur mit hartem Abschlag bieten" : "Angebotsband liegt ueber/nahe Kaufpreis",
    tone,
    summary:
      status === "price_gap"
        ? `Walk-away liegt bei ${offerCurrencyText(walkAwayPrice)}; aktuelle Forderung ist ${offerCurrencyText(gapToAskEur)} zu hoch.`
        : `Walk-away liegt bei ${offerCurrencyText(walkAwayPrice)}; Kaufpreis ist rechnerisch im Band, aber nur nach Due Diligence bindend.`,
    askingPrice,
    startOfferPrice,
    targetOfferPrice,
    walkAwayPrice,
    gapToAskEur,
    developmentCreditEur: developmentCredit.value,
    reasons,
    warnings,
    facts: [
      { label: "Startgebot", value: offerCurrencyText(startOfferPrice), tone: "watch" },
      { label: "Zielpreis", value: offerCurrencyText(targetOfferPrice), tone },
      { label: "Walk-away", value: offerCurrencyText(walkAwayPrice), tone },
      {
        label: status === "price_gap" ? "Luecke" : "Puffer",
        value: offerCurrencyText(Math.abs(askingPrice - walkAwayPrice)),
        tone
      }
    ]
  };
}

export function dealLocationOfferDisciplineBrief(deal: Deal): DealLocationOfferDisciplineBrief {
  const offerBand = dealOfferBandBrief(deal);
  const priceGate = dealMicroLocationPriceGateBrief(deal);
  const targetGroup = dealMicroLocationTargetGroupBrief(deal);
  const baseWalkAwayPrice = offerBand.walkAwayPrice;

  if (baseWalkAwayPrice === null) {
    return {
      status: "missing",
      headline: "Lagepreis-Disziplin fehlt",
      tone: "empty",
      summary: "Ohne berechneten Walk-away kann die Mikrolage noch nicht sauber in die Angebotslogik ueberfuehrt werden.",
      baseWalkAwayPrice: null,
      locationCreditEur: 0,
      guardedWalkAwayPrice: null,
      facts: [
        { label: "Basis-Walk-away", value: "Fehlt", tone: "empty" },
        { label: "Lage-Credit", value: "Fehlt", tone: "empty" },
        { label: "Geschuetzter Walk-away", value: "Fehlt", tone: "empty" },
        { label: "Zielgruppe", value: "Fehlt", tone: "empty" }
      ],
      guardrails: ["Erst Underwriting und Angebotsband rechnen, dann Lage-Credit bewerten."],
      nextActions: ["Underwriting rechnen und Zielgruppen-/Lagebelege danach erneut pruefen."]
    };
  }

  const status = locationOfferDisciplineStatus(priceGate.status);
  const locationCreditEur =
    status === "committee" && priceGate.premiumBudgetEur !== null ? priceGate.premiumBudgetEur : 0;
  const guardedWalkAwayPrice = roundDownTo500(baseWalkAwayPrice + locationCreditEur);
  const tone = locationOfferDisciplineTone(status, offerBand.tone);

  return {
    status,
    headline: locationOfferDisciplineHeadline(status),
    tone,
    summary: locationOfferDisciplineSummary(status, baseWalkAwayPrice, guardedWalkAwayPrice, locationCreditEur),
    baseWalkAwayPrice,
    locationCreditEur,
    guardedWalkAwayPrice,
    facts: [
      { label: "Basis-Walk-away", value: offerCurrencyText(baseWalkAwayPrice), tone: offerBand.tone },
      { label: "Lage-Credit", value: offerCurrencyText(locationCreditEur), tone: locationCreditEur > 0 ? "watch" : "watch" },
      { label: "Geschuetzter Walk-away", value: offerCurrencyText(guardedWalkAwayPrice), tone: offerBand.tone },
      { label: "Zielgruppe", value: locationOfferTargetGroupValue(targetGroup), tone: targetGroup.tone }
    ],
    guardrails: locationOfferDisciplineGuardrails(status, targetGroup, priceGate),
    nextActions: locationOfferDisciplineNextActions(targetGroup, priceGate)
  };
}

export function dealRiskAdjustedOfferBrief(deal: Deal): DealRiskAdjustedOfferBrief {
  const offerBand = dealOfferBandBrief(deal);
  const baseWalkAwayPrice = offerBand.walkAwayPrice;
  const emptyTone: ReturnType<typeof scoreTone> = "empty";

  if (baseWalkAwayPrice === null) {
    return {
      status: "no_anchor",
      headline: "Risiko-Puffer noch nicht berechenbar",
      tone: emptyTone,
      summary: "Ohne Walk-away aus Underwriting und Zielrendite gibt es keinen belastbaren Risiko-Deckel.",
      baseWalkAwayPrice: null,
      reservePercent: 0,
      requiredReserveEur: 0,
      riskAdjustedCeilingPrice: null,
      facts: [
        { label: "Interner Walk-away", value: "Fehlt", tone: "empty" },
        { label: "Sicherheitsabschlag", value: "Fehlt", tone: "empty" },
        { label: "Risiko-Deckel", value: "Fehlt", tone: "empty" },
        { label: "Reserve", value: "Fehlt", tone: "empty" }
      ],
      drivers: [
        riskAdjustedOfferDriver({
          action: "Underwriting und Zielrenditeanker rechnen.",
          baseWalkAwayPrice: 0,
          label: "Preisanker",
          reason: "Walk-away, Cashflow-Anker oder Zielrendite-Anker fehlen.",
          reservePercent: 0,
          tone: "empty"
        })
      ],
      guardrails: ["Kein Angebotsrahmen, solange der interne Walk-away fehlt."],
      nextActions: ["Underwriting rechnen und danach Risiko-Puffer neu bewerten."]
    };
  }

  const exitLiquidity = dealExitLiquidityBrief(deal);
  const assumptionAudit = dealAssumptionAuditBrief(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const drivers = riskAdjustedOfferDrivers({
    assumptionAudit,
    baseWalkAwayPrice,
    deal,
    evidence,
    exitLiquidity,
    readiness
  });
  const rawReservePercent = drivers.reduce((sum, driver) => sum + driver.reservePercent, 0);
  const reservePercent = Math.min(15, Math.round(rawReservePercent * 10) / 10);
  const riskAdjustedCeilingPrice = roundDownTo500(baseWalkAwayPrice * (1 - reservePercent / 100));
  const requiredReserveEur = Math.max(0, baseWalkAwayPrice - riskAdjustedCeilingPrice);
  const status = riskAdjustedOfferStatus(offerBand, readiness, reservePercent);
  const tone = riskAdjustedOfferTone(status);

  return {
    status,
    headline: riskAdjustedOfferHeadline(status),
    tone,
    summary: riskAdjustedOfferSummary(status, baseWalkAwayPrice, requiredReserveEur, riskAdjustedCeilingPrice),
    baseWalkAwayPrice,
    reservePercent,
    requiredReserveEur,
    riskAdjustedCeilingPrice,
    facts: [
      {
        label: "Interner Walk-away",
        value: offerCurrencyText(baseWalkAwayPrice),
        tone: offerBand.tone
      },
      {
        label: "Sicherheitsabschlag",
        value: offerCurrencyText(requiredReserveEur),
        tone
      },
      {
        label: "Risiko-Deckel",
        value: offerCurrencyText(riskAdjustedCeilingPrice),
        tone
      },
      {
        label: "Reserve",
        value: `${formatNumber(reservePercent)} %`,
        tone
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      }
    ],
    drivers,
    guardrails: riskAdjustedOfferGuardrails(status, riskAdjustedCeilingPrice, reservePercent, offerBand),
    nextActions: riskAdjustedOfferNextActions(drivers, status)
  };
}

export function dealBidStackBrief(deal: Deal): DealBidStackBrief {
  const market = dealMarketComparisonBrief(deal);
  const pricing = dealPricingBrief(deal);
  const offerBand = dealOfferBandBrief(deal);
  const riskAdjustedOffer = dealRiskAdjustedOfferBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const askingPrice = offerBand.askingPrice ?? numberValue(deal.listing?.purchase_price);
  const cashflowAnchor = numberValue(deal.latest_underwriting?.max_purchase_price_for_neutral_cashflow);
  const yieldAnchor = numberValue(deal.latest_underwriting?.maximum_purchase_price_for_target_yield);
  const baseWalkAway = bidStackBaseWalkAway(cashflowAnchor, yieldAnchor, offerBand);
  const finalCeilingPrice = riskAdjustedOffer.riskAdjustedCeilingPrice ?? offerBand.walkAwayPrice;
  const sendStatus = bidStackSendStatus(offerBand, riskAdjustedOffer);
  const status = bidStackStatus(finalCeilingPrice, sendStatus, offerBand, riskAdjustedOffer);
  const tone = bidStackTone(status);
  const priceGapToCeiling =
    askingPrice !== null && finalCeilingPrice !== null
      ? Math.max(0, roundDownTo500(askingPrice - finalCeilingPrice))
      : null;
  const negotiationRange = bidStackNegotiationRange(offerBand, riskAdjustedOffer, sendStatus);

  return {
    status,
    headline: bidStackHeadline(status, sendStatus, riskAdjustedOffer),
    tone,
    summary: bidStackSummary(askingPrice, finalCeilingPrice, priceGapToCeiling, riskAdjustedOffer),
    finalCeilingPrice,
    negotiationRange,
    facts: [
      { label: "Forderung", value: bidStackCurrency(askingPrice), tone: askingPrice !== null ? "watch" : "empty" },
      { label: "Risiko-Deckel", value: bidStackCurrency(finalCeilingPrice), tone },
      { label: "Abstand", value: bidStackCurrency(priceGapToCeiling), tone: priceGapToCeiling !== null && priceGapToCeiling > 0 ? "risk" : "good" },
      { label: "Sendestatus", value: sendStatus, tone }
    ],
    rows: [
      {
        label: "Forderung",
        value: bidStackCurrency(askingPrice),
        detail: "Aktueller Angebotspreis aus dem Listing.",
        role: "input",
        tone: askingPrice !== null ? "watch" : "empty"
      },
      {
        label: "Marktwert",
        value: bidStackCurrency(market.marketValueEstimateEur),
        detail:
          market.marketGapEur !== null
            ? `${bidStackCurrency(market.marketGapEur)} Markt-Gap gegen PLZ-/Marktanker.`
            : market.summary,
        role: "anchor",
        tone: market.tone
      },
      {
        label: "Cashflow-Anker",
        value: bidStackCurrency(cashflowAnchor),
        detail: pricing.status === "missing" ? pricing.summary : "Maximalpreis fuer neutralen Cashflow.",
        role: "anchor",
        tone: pricing.tone
      },
      {
        label: "Zielrendite-Anker",
        value: bidStackCurrency(yieldAnchor),
        detail: "Obergrenze aus Zielrendite; nur belastbar mit aktuellem Underwriting.",
        role: "anchor",
        tone: yieldAnchor !== null ? "watch" : "empty"
      },
      {
        label: "Basis-Walk-away",
        value: bidStackCurrency(baseWalkAway),
        detail: "Konservativer Wert aus Cashflow- und Zielrenditeanker vor Entwicklung.",
        role: "anchor",
        tone: baseWalkAway !== null ? offerBand.tone : "empty"
      },
      {
        label: "Entwicklungs-Credit",
        value: bidStackCurrency(offerBand.developmentCreditEur),
        detail: developmentPricing.priceRule,
        role: "adjustment",
        tone: developmentPricing.tone
      },
      {
        label: "Interner Walk-away",
        value: bidStackCurrency(offerBand.walkAwayPrice),
        detail: offerBand.summary,
        role: "output",
        tone: offerBand.tone
      },
      {
        label: "Risiko-Reserve",
        value: bidStackCurrency(-riskAdjustedOffer.requiredReserveEur),
        detail: `${formatNumber(riskAdjustedOffer.reservePercent)} % Sicherheitsabschlag aus Risiko-Puffer.`,
        role: "adjustment",
        tone: riskAdjustedOffer.tone
      },
      {
        label: "Risiko-Deckel",
        value: bidStackCurrency(finalCeilingPrice),
        detail: riskAdjustedOffer.summary,
        role: "output",
        tone
      },
      {
        label: "Gebotsband",
        value: bidStackBandValue(offerBand, riskAdjustedOffer, sendStatus),
        detail: negotiationRange,
        role: "output",
        tone
      }
    ],
    guardrails: bidStackGuardrails({ market, offerBand, riskAdjustedOffer, sendStatus })
  };
}

export function dealScenarioStressBrief(deal: Deal): DealScenarioStressBrief {
  const underwriting = deal.latest_underwriting;

  if (!underwriting) {
    return {
      status: "missing",
      headline: "Stress-Test fehlt",
      tone: "empty",
      summary: "Ohne Underwriting fehlen Cashflow, DSCR, Schuldendienst und Exit-Werte fuer belastbare Stressfaelle.",
      worstCashflowBeforeTax: null,
      weakestDscr: null,
      hardBreakCount: 0,
      minExitBufferEur: null,
      facts: [
        { label: "Schlimmster Cashflow", value: "Fehlt", tone: "empty" },
        { label: "Schwaechster DSCR", value: "Fehlt", tone: "empty" },
        { label: "Harte Brueche", value: "0", tone: "empty" },
        { label: "Exit-Puffer", value: "Fehlt", tone: "empty" }
      ],
      scenarios: stressScenarioRows(deal),
      guardrails: ["Erst Underwriting rechnen, dann Stress-Test, Bankpaket und IC-Freigabe belastbar machen."],
      nextActions: ["Underwriting aktualisieren und danach Zins-, Miet-, Capex- und Exit-Stress neu pruefen."]
    };
  }

  const scenarios = stressScenarioRows(deal);
  const worstCashflowBeforeTax = minNumber(scenarios.map((scenario) => scenario.cashflowBeforeTax));
  const weakestDscr = minNumber(scenarios.map((scenario) => scenario.dscr));
  const minExitBufferEur = minNumber(scenarios.map((scenario) => scenario.exitEquityBufferEur));
  const hardBreakCount = scenarios.filter((scenario) => scenario.status === "breaks").length;
  const hasWatch = scenarios.some((scenario) => scenario.status === "watch");
  const status: DealScenarioStressStatus = hardBreakCount > 0 ? "breaks" : hasWatch ? "watch" : "resilient";
  const tone = scenarioStressTone(status);

  return {
    status,
    headline: scenarioStressHeadline(status),
    tone,
    summary: scenarioStressSummary(status, hardBreakCount, worstCashflowBeforeTax, weakestDscr),
    worstCashflowBeforeTax,
    weakestDscr,
    hardBreakCount,
    minExitBufferEur,
    facts: [
      { label: "Schlimmster Cashflow", value: stressCurrencyText(worstCashflowBeforeTax), tone: cashflowTone(worstCashflowBeforeTax) },
      { label: "Schwaechster DSCR", value: formatNumber(weakestDscr), tone: dscrTone(weakestDscr) },
      { label: "Harte Brueche", value: String(hardBreakCount), tone: hardBreakCount > 0 ? "risk" : "good" },
      { label: "Exit-Puffer", value: stressCurrencyText(minExitBufferEur), tone: exitBufferTone(minExitBufferEur) }
    ],
    scenarios,
    guardrails: scenarioStressGuardrails(status, hardBreakCount),
    nextActions: scenarioStressNextActions(status, scenarios)
  };
}

function stressScenarioRows(deal: Deal): DealStressScenario[] {
  const underwriting = deal.latest_underwriting;
  const baseCashflow = numberValue(underwriting?.monthly_cashflow_before_tax);
  const baseDscr = numberValue(underwriting?.dscr);
  const annualRent = numberValue(underwriting?.annual_cold_rent) ?? monthlyToAnnual(numberValue(deal.listing?.cold_rent_monthly));
  const noi = numberValue(underwriting?.net_operating_income);
  const annualDebtService = stressAnnualDebtService(underwriting);
  const capex = stressCapex(deal);
  const exitValue = numberValue(underwriting?.simple_exit_value) ?? numberValue(deal.latest_renovation_case?.results?.post_renovation_value);
  const remainingLoan = numberValue(underwriting?.remaining_loan_after_holding) ?? numberValue(underwriting?.loan_amount);
  const equityRequired = numberValue(underwriting?.equity_required);
  const rentLossAnnual = annualRent !== null ? annualRent * 0.1 : null;
  const rentStressCashflow =
    baseCashflow !== null && rentLossAnnual !== null ? roundToWholeEuro(baseCashflow - rentLossAnnual / 12) : null;
  const rentStressDscr =
    noi !== null && annualDebtService !== null && annualDebtService > 0 && rentLossAnnual !== null
      ? roundToTwoDecimals((noi - rentLossAnnual) / annualDebtService)
      : null;
  const interestStressCashflow =
    numberValue(underwriting?.stressed_monthly_cashflow_before_tax) ??
    fallbackInterestStressCashflow(baseCashflow, numberValue(underwriting?.loan_amount));
  const interestStressDscr =
    numberValue(underwriting?.stressed_dscr) ??
    fallbackInterestStressDscr(noi, annualDebtService, numberValue(underwriting?.loan_amount));
  const capexOverrun = capex !== null ? roundToWholeEuro(capex * 0.15) : null;
  const exitStressBuffer = stressExitBuffer(exitValue, remainingLoan, equityRequired, 0.1);

  return [
    buildStressScenario({
      key: "base",
      label: "Base Case",
      cashflowBeforeTax: baseCashflow !== null ? roundToWholeEuro(baseCashflow) : null,
      dscr: baseDscr !== null ? roundToTwoDecimals(baseDscr) : null,
      liquidityImpactEur: null,
      exitEquityBufferEur: null,
      detail: "Aktuelles Underwriting ohne Zusatzstress.",
      action: "Base Case mit Belegen, Bankparametern und Mietrecht aktuell halten."
    }),
    buildStressScenario({
      key: "interest",
      label: "Zins +2 %",
      cashflowBeforeTax: interestStressCashflow !== null ? roundToWholeEuro(interestStressCashflow) : null,
      dscr: interestStressDscr !== null ? roundToTwoDecimals(interestStressDscr) : null,
      liquidityImpactEur: null,
      exitEquityBufferEur: null,
      detail: "Kapitaldienst-Stress aus Underwriting oder +2 Prozentpunkte auf die Darlehenssumme.",
      action: "Bankzins, Tilgung, Eigenkapital oder Kaufpreis so anpassen, dass DSCR >= 1,10 bleibt."
    }),
    buildStressScenario({
      key: "rent",
      label: "Miete -10 %",
      cashflowBeforeTax: rentStressCashflow,
      dscr: rentStressDscr,
      liquidityImpactEur: null,
      exitEquityBufferEur: null,
      detail: "Konservativer Mietstress fuer Leerstand, Mietrecht, Ausfall oder spaetere Mietanpassung.",
      action: "Miete, Leerstand und Mietrecht konservativ nachziehen, bis auch -10 % Miete nicht bricht."
    }),
    buildStressScenario({
      key: "capex",
      label: "Capex +15 %",
      cashflowBeforeTax: baseCashflow !== null ? roundToWholeEuro(baseCashflow) : null,
      dscr: baseDscr !== null ? roundToTwoDecimals(baseDscr) : null,
      liquidityImpactEur: capexOverrun,
      exitEquityBufferEur: null,
      detail: "Sanierungsbudget mit 15 % Puffer fuer Nachtraege, Energie und WEG-Risiken.",
      action: "Capex-Angebote und Liquiditaetsreserve vor Preisfreigabe sichern."
    }),
    buildStressScenario({
      key: "exit",
      label: "Exit -10 %",
      cashflowBeforeTax: baseCashflow !== null ? roundToWholeEuro(baseCashflow) : null,
      dscr: baseDscr !== null ? roundToTwoDecimals(baseDscr) : null,
      liquidityImpactEur: null,
      exitEquityBufferEur: exitStressBuffer,
      detail: "Exitwert 10 % niedriger, inklusive 3 % Verkaufskosten und Restschuld.",
      action: "Exit-Wert, Verkaufskosten, Restschuld und Zielkaeufer im Memo belegen."
    })
  ];
}

function buildStressScenario(input: Omit<DealStressScenario, "status" | "statusLabel" | "tone">): DealStressScenario {
  const status = stressScenarioStatus(input);
  return {
    ...input,
    status,
    statusLabel: stressScenarioStatusLabel(status),
    tone: stressScenarioTone(status)
  };
}

function stressScenarioStatus(input: {
  cashflowBeforeTax: number | null;
  dscr: number | null;
  liquidityImpactEur: number | null;
  exitEquityBufferEur: number | null;
}): DealStressScenarioStatus {
  const hasMetric =
    input.cashflowBeforeTax !== null ||
    input.dscr !== null ||
    input.liquidityImpactEur !== null ||
    input.exitEquityBufferEur !== null;
  if (!hasMetric) return "missing";
  if (
    (input.cashflowBeforeTax !== null && input.cashflowBeforeTax < 0) ||
    (input.dscr !== null && input.dscr < 1) ||
    (input.exitEquityBufferEur !== null && input.exitEquityBufferEur < 0)
  ) {
    return "breaks";
  }
  if (
    (input.cashflowBeforeTax !== null && input.cashflowBeforeTax < 100) ||
    (input.dscr !== null && input.dscr < 1.1) ||
    (input.liquidityImpactEur !== null && input.liquidityImpactEur > 0) ||
    (input.exitEquityBufferEur !== null && input.exitEquityBufferEur < 25000)
  ) {
    return "watch";
  }
  return "survives";
}

function stressScenarioStatusLabel(status: DealStressScenarioStatus): string {
  if (status === "survives") return "Haelt";
  if (status === "watch") return "Puffer pruefen";
  if (status === "breaks") return "Bricht";
  return "Fehlt";
}

function stressScenarioTone(status: DealStressScenarioStatus): ReturnType<typeof scoreTone> {
  if (status === "survives") return "good";
  if (status === "watch") return "watch";
  if (status === "breaks") return "risk";
  return "empty";
}

function scenarioStressTone(status: DealScenarioStressStatus): ReturnType<typeof scoreTone> {
  if (status === "resilient") return "good";
  if (status === "watch") return "watch";
  if (status === "breaks") return "risk";
  return "empty";
}

function scenarioStressHeadline(status: DealScenarioStressStatus): string {
  if (status === "resilient") return "Stress-Test haelt";
  if (status === "watch") return "Stress-Test braucht Puffer";
  if (status === "breaks") return "Stress-Test blockiert Angebotsfreigabe";
  return "Stress-Test fehlt";
}

function scenarioStressSummary(
  status: DealScenarioStressStatus,
  hardBreakCount: number,
  worstCashflowBeforeTax: number | null,
  weakestDscr: number | null
): string {
  if (status === "missing") {
    return "Stressfaelle koennen erst nach einem aktuellen Underwriting sauber gerechnet werden.";
  }
  const metricText = `schlimmster Cashflow ${stressCurrencyText(worstCashflowBeforeTax)}, schwaechster DSCR ${formatNumber(weakestDscr)}.`;
  if (status === "breaks") {
    return `${hardBreakCount} harte Brueche: ${metricText} Kein bindendes Gebot, bis die Brueche geschlossen sind.`;
  }
  if (status === "watch") {
    return `Kein harter Bruch, aber Puffer knapp: ${metricText} Vor Gebot Reserve und Bankannahmen pruefen.`;
  }
  return `Alle Pflicht-Stressfaelle halten: ${metricText} Stress im Memo dokumentieren und nicht weiter aufschoenen.`;
}

function scenarioStressGuardrails(status: DealScenarioStressStatus, hardBreakCount: number): string[] {
  return [
    ...(hardBreakCount > 0 ? ["Kein finales Gebot, wenn ein Pflicht-Stress Cashflow oder DSCR bricht."] : []),
    "Zins, Miete, Capex und Exit mit derselben Annahmenbasis wie Gebotsband und Bankpaket dokumentieren.",
    status === "resilient"
      ? "Stresspuffer nicht als Kaufpreis-Aufschlag verwenden; er schuetzt nur die Downside."
      : "Stress-Brueche in Kaufpreis, Finanzierung oder Bedingungen einpreisen, nicht ignorieren."
  ];
}

function scenarioStressNextActions(status: DealScenarioStressStatus, scenarios: DealStressScenario[]): string[] {
  const brokenActions = scenarios.filter((scenario) => scenario.status === "breaks").map((scenario) => scenario.action);
  return uniqueItems([
    "Zins-, Miet- und Capex-Stress in Bankpaket, IC-Memo und Angebotsfreigabe sichtbar dokumentieren.",
    ...brokenActions,
    status === "resilient"
      ? "Stress-Test nach neuen Unterlagen erneut laufen lassen, bevor das Angebot bindend wird."
      : "Kaufpreis, Eigenkapital, Fremdkapital oder Bedingungen so anpassen, dass der Stress-Test nicht bricht."
  ]);
}

function stressAnnualDebtService(underwriting: Deal["latest_underwriting"]): number | null {
  const annualDebtService = numberValue(underwriting?.annual_debt_service);
  if (annualDebtService !== null) return annualDebtService;
  const noi = numberValue(underwriting?.net_operating_income);
  const dscr = numberValue(underwriting?.dscr);
  if (noi !== null && dscr !== null && dscr > 0) {
    return noi / dscr;
  }
  return null;
}

function stressCapex(deal: Deal): number | null {
  return (
    numberValue(deal.latest_renovation_case?.results?.planned_capex) ??
    numberValue(deal.latest_renovation_case?.inputs?.planned_capex) ??
    numberValue(deal.listing?.expected_initial_capex)
  );
}

function stressExitBuffer(
  exitValue: number | null,
  remainingLoan: number | null,
  equityRequired: number | null,
  discountPercent: number
): number | null {
  if (exitValue === null || remainingLoan === null || equityRequired === null) {
    return null;
  }
  const stressedExitValue = exitValue * (1 - discountPercent);
  const sellingCosts = stressedExitValue * 0.03;
  return stressedExitValue - sellingCosts - remainingLoan - equityRequired;
}

function fallbackInterestStressCashflow(baseCashflow: number | null, loanAmount: number | null): number | null {
  if (baseCashflow === null || loanAmount === null) return null;
  return baseCashflow - (loanAmount * 0.02) / 12;
}

function fallbackInterestStressDscr(noi: number | null, annualDebtService: number | null, loanAmount: number | null): number | null {
  if (noi === null || annualDebtService === null || loanAmount === null) return null;
  const stressedDebtService = annualDebtService + loanAmount * 0.02;
  return stressedDebtService > 0 ? noi / stressedDebtService : null;
}

function monthlyToAnnual(value: number | null): number | null {
  return value !== null ? value * 12 : null;
}

function roundToWholeEuro(value: number): number {
  return value < 0 ? Math.floor(value) : Math.round(value);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function minNumber(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return numericValues.length ? Math.min(...numericValues) : null;
}

function maxNumber(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return numericValues.length ? Math.max(...numericValues) : null;
}

function exitBufferTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) return "empty";
  if (value >= 25000) return "good";
  if (value >= 0) return "watch";
  return "risk";
}

function stressCurrencyText(value: number | null): string {
  return value !== null ? currencyText(value) : "Fehlt";
}

export function dealRepairPlanBrief(deal: Deal): DealRepairPlanBrief {
  const stress = dealScenarioStressBrief(deal);
  const underwriting = deal.latest_underwriting;
  const targetCashflowMonthly = 100;
  const cashflowGapMonthly =
    stress.worstCashflowBeforeTax !== null ? Math.max(0, roundToWholeEuro(targetCashflowMonthly - stress.worstCashflowBeforeTax)) : null;
  const annualGap = cashflowGapMonthly !== null ? cashflowGapMonthly * 12 : null;
  const loanAmount = numberValue(underwriting?.loan_amount);
  const annualDebtService = stressAnnualDebtService(underwriting);
  const debtServiceRate = loanAmount !== null && loanAmount > 0 && annualDebtService !== null ? annualDebtService / loanAmount : null;
  const purchasePriceRepairEur =
    annualGap !== null && debtServiceRate !== null && debtServiceRate > 0 ? roundUpTo500(annualGap / debtServiceRate) : null;
  const rentRepairMonthly = cashflowGapMonthly;
  const equityRepairEur = purchasePriceRepairEur;
  const rateRepairPercentPoints = annualGap !== null && loanAmount !== null && loanAmount > 0 ? roundToTwoDecimals((annualGap / loanAmount) * 100) : null;
  const capexReserveEur = maxNumber(stress.scenarios.map((scenario) => scenario.liquidityImpactEur));
  const status = repairPlanStatus(stress.status, cashflowGapMonthly);
  const tone = repairPlanTone(status);
  const hardBreakCount = stress.hardBreakCount;

  return {
    status,
    headline: repairPlanHeadline(status),
    tone,
    summary: repairPlanSummary(status, cashflowGapMonthly, hardBreakCount),
    cashflowGapMonthly,
    purchasePriceRepairEur,
    rentRepairMonthly,
    equityRepairEur,
    rateRepairPercentPoints,
    capexReserveEur,
    facts: [
      { label: "Cashflow-Luecke", value: repairMonthlyText(cashflowGapMonthly), tone: cashflowGapMonthly && cashflowGapMonthly > 0 ? "risk" : "good" },
      { label: "Kaufpreis-Hebel", value: stressCurrencyText(purchasePriceRepairEur), tone: purchasePriceRepairEur && purchasePriceRepairEur > 0 ? "risk" : "good" },
      { label: "Miethebel", value: repairMonthlyText(rentRepairMonthly), tone: rentRepairMonthly && rentRepairMonthly > 0 ? "watch" : "good" },
      { label: "Zins-Hebel", value: repairRateText(rateRepairPercentPoints), tone: rateRepairPercentPoints && rateRepairPercentPoints > 0 ? "watch" : "good" }
    ],
    levers: repairPlanLevers({
      cashflowGapMonthly,
      purchasePriceRepairEur,
      rentRepairMonthly,
      equityRepairEur,
      rateRepairPercentPoints,
      capexReserveEur
    }),
    stopRules: repairPlanStopRules(cashflowGapMonthly, hardBreakCount),
    nextActions: repairPlanNextActions(status)
  };
}

function repairPlanStatus(stressStatus: DealScenarioStressStatus, cashflowGapMonthly: number | null): DealRepairPlanStatus {
  if (stressStatus === "missing") return "missing";
  if (cashflowGapMonthly !== null && cashflowGapMonthly > 0) return "needs_repair";
  if (stressStatus === "watch") return "monitor";
  return "ready";
}

function repairPlanTone(status: DealRepairPlanStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "monitor") return "watch";
  if (status === "needs_repair") return "risk";
  return "empty";
}

function repairPlanHeadline(status: DealRepairPlanStatus): string {
  if (status === "ready") return "Deal haelt ohne Reparatur";
  if (status === "monitor") return "Deal braucht Pufferkontrolle";
  if (status === "needs_repair") return "Deal reparieren oder nicht bieten";
  return "Reparaturplan fehlt";
}

function repairPlanSummary(status: DealRepairPlanStatus, cashflowGapMonthly: number | null, hardBreakCount: number): string {
  if (status === "missing") {
    return "Ohne Stress-Test und Underwriting kann kein Reparaturpfad berechnet werden.";
  }
  if (status === "ready") {
    return "Der Deal haelt die Pflicht-Stressfaelle; Reparaturhebel bleiben als Reserve im Memo.";
  }
  if (status === "monitor") {
    return "Der Deal bricht nicht, aber die Reserve ist knapp; Hebel vor Angebotsfreigabe dokumentieren.";
  }
  return `${repairMonthlyText(cashflowGapMonthly)} Cashflow-Luecke und ${hardBreakCount} Stress-Brueche: erst Reparaturpfad belegen, dann Angebot freigeben.`;
}

function repairPlanLevers(input: {
  cashflowGapMonthly: number | null;
  purchasePriceRepairEur: number | null;
  rentRepairMonthly: number | null;
  equityRepairEur: number | null;
  rateRepairPercentPoints: number | null;
  capexReserveEur: number | null;
}): DealRepairLever[] {
  return [
    {
      label: "Kaufpreis senken",
      amount: stressCurrencyText(input.purchasePriceRepairEur),
      status: input.purchasePriceRepairEur !== null && input.purchasePriceRepairEur > 0 ? "must_fix" : "optional",
      statusLabel: input.purchasePriceRepairEur !== null && input.purchasePriceRepairEur > 0 ? "Pflicht" : "Reserve",
      tone: input.purchasePriceRepairEur !== null && input.purchasePriceRepairEur > 0 ? "risk" : "good",
      detail: "Direktester Hebel: weniger Darlehen oder geringerer Kaufpreis senkt den Kapitaldienst.",
      memoLine:
        input.purchasePriceRepairEur !== null
          ? `Kaufpreisabschlag oder Debt-Reduktion von ca. ${stressCurrencyText(input.purchasePriceRepairEur)} noetig, um den schlimmsten Cashflow-Stress auf 100 €/Monat zu bringen.`
          : "Kaufpreishebel fehlt, weil Darlehenssumme oder Schuldendienst nicht belastbar sind."
    },
    {
      label: "Miete belegen",
      amount: repairMonthlyText(input.rentRepairMonthly),
      status: input.rentRepairMonthly !== null && input.rentRepairMonthly > 0 ? "must_fix" : "optional",
      statusLabel: input.rentRepairMonthly !== null && input.rentRepairMonthly > 0 ? "Pflicht" : "Reserve",
      tone: input.rentRepairMonthly !== null && input.rentRepairMonthly > 0 ? "risk" : "good",
      detail: "Nur zaehlen, wenn Zielmiete rechtlich, vertraglich und mit Marktbelegen tragfaehig ist.",
      memoLine: `${repairMonthlyText(input.rentRepairMonthly)} zusaetzliche Monatsmiete waere noetig; ohne Mietrecht- und Vergleichsmietbeleg bleibt das kein Kaufpreisargument.`
    },
    {
      label: "Mehr Eigenkapital",
      amount: stressCurrencyText(input.equityRepairEur),
      status: input.equityRepairEur !== null && input.equityRepairEur > 0 ? "must_fix" : "optional",
      statusLabel: input.equityRepairEur !== null && input.equityRepairEur > 0 ? "Pflicht" : "Reserve",
      tone: input.equityRepairEur !== null && input.equityRepairEur > 0 ? "risk" : "good",
      detail: "Mehr Eigenkapital kann DSCR und Cashflow stabilisieren, reduziert aber die Eigenkapitalrendite.",
      memoLine: `${stressCurrencyText(input.equityRepairEur)} zusaetzliche Eigenkapital-/Debt-Reduktion pruefen; Renditewirkung separat zeigen.`
    },
    {
      label: "Zins/Finanzierung verbessern",
      amount: repairRateText(input.rateRepairPercentPoints),
      status: input.rateRepairPercentPoints !== null && input.rateRepairPercentPoints > 0 ? "must_fix" : "optional",
      statusLabel: input.rateRepairPercentPoints !== null && input.rateRepairPercentPoints > 0 ? "Pflicht" : "Reserve",
      tone: input.rateRepairPercentPoints !== null && input.rateRepairPercentPoints > 0 ? "watch" : "good",
      detail: "Bankzins, Tilgung, Zinsbindung oder Verkaeuferdarlehen koennen den Stressbruch reduzieren.",
      memoLine: `${repairRateText(input.rateRepairPercentPoints)} Finanzierungsvorteil noetig, wenn der Bruch ohne Kaufpreis- oder Miethebel geschlossen werden soll.`
    },
    {
      label: "Capex-Reserve sichern",
      amount: stressCurrencyText(input.capexReserveEur),
      status: input.capexReserveEur !== null && input.capexReserveEur > 0 ? "watch" : "optional",
      statusLabel: input.capexReserveEur !== null && input.capexReserveEur > 0 ? "Pruefen" : "Reserve",
      tone: input.capexReserveEur !== null && input.capexReserveEur > 0 ? "watch" : "good",
      detail: "Sanierungspuffer separat finanzieren, damit Capex-Nachtraege nicht das Angebot schoenrechnen.",
      memoLine: `${stressCurrencyText(input.capexReserveEur)} Capex-Puffer vor Freigabe als Liquiditaetsreserve oder Preisabschlag einplanen.`
    }
  ];
}

function repairPlanStopRules(cashflowGapMonthly: number | null, hardBreakCount: number): string[] {
  if (cashflowGapMonthly !== null && cashflowGapMonthly > 0) {
    return [
      `Kein bindendes Angebot, solange Cashflow-Luecke ${repairMonthlyText(cashflowGapMonthly)} und DSCR-Bruch nicht repariert sind.`,
      "Reparaturhebel nicht doppelt zaehlen: Preisabschlag, Miethebel und Eigenkapitalwirkung getrennt ausweisen."
    ];
  }
  if (hardBreakCount > 0) {
    return ["Stress-Brueche erst in Bankpaket, IC-Memo und Angebotsbedingungen schliessen."];
  }
  return ["Reparaturplan als Reserve dokumentieren, aber nicht als Kaufpreisaufschlag verwenden."];
}

function repairPlanNextActions(status: DealRepairPlanStatus): string[] {
  if (status === "missing") {
    return ["Underwriting und Stress-Test aktualisieren, bevor ein Reparaturpfad bewertet wird."];
  }
  return [
    "Mit Makler/Verkaeufer Reparaturpfad testen: Preisabschlag, Mietbeleg, Finanzierungsstruktur oder Capex-Reserve.",
    "Reparaturhebel ins Bankpaket und IC-Memo uebernehmen, bevor ein Angebot bindend wird.",
    status === "ready"
      ? "Reparaturhebel als Reserve behalten und nach neuen Unterlagen erneut pruefen."
      : "Nur weiterarbeiten, wenn mindestens ein harter Hebel belegbar und finanzierbar ist."
  ];
}

function repairMonthlyText(value: number | null): string {
  return value !== null ? `${currencyText(value)}/Monat` : "Fehlt";
}

function repairRateText(value: number | null): string {
  return value !== null ? `${formatNumber(value)} %-Punkte` : "Fehlt";
}

export function dealNegotiationCommandBrief(deal: Deal): DealNegotiationCommandBrief {
  const repairPlan = dealRepairPlanBrief(deal);
  const offerDecision = dealOfferDecisionBrief(deal);
  const status = negotiationCommandStatus(repairPlan, offerDecision);
  const tone = negotiationCommandTone(status);
  const sellerLine = negotiationCommandSellerLine(repairPlan, status);

  return {
    status,
    headline: negotiationCommandHeadline(status, repairPlan),
    tone,
    internalLine: negotiationCommandInternalLine(repairPlan, status),
    sellerLine,
    copyText: negotiationCommandCopyText(repairPlan, sellerLine, status),
    facts: negotiationCommandFacts(repairPlan, status),
    asks: negotiationCommandAsks(repairPlan),
    stopRules: negotiationCommandStopRules(repairPlan, status),
    nextActions: negotiationCommandNextActions(repairPlan)
  };
}

function negotiationCommandStatus(
  repairPlan: DealRepairPlanBrief,
  offerDecision: DealOfferDecisionBrief
): DealNegotiationCommandStatus {
  if (repairPlan.status === "missing") return "missing";
  if (repairPlan.status === "needs_repair" || offerDecision.status === "blocked") return "blocked";
  if (repairPlan.status === "monitor" || offerDecision.status === "indicative") return "indicative";
  return "sendable";
}

function negotiationCommandTone(status: DealNegotiationCommandStatus): ReturnType<typeof scoreTone> {
  if (status === "sendable") return "good";
  if (status === "indicative") return "watch";
  if (status === "blocked") return "risk";
  return "empty";
}

function negotiationCommandHeadline(
  status: DealNegotiationCommandStatus,
  repairPlan: DealRepairPlanBrief
): string {
  if (status === "missing") return "Verhandlungsauftrag fehlt";
  if (repairPlan.status === "needs_repair") return "Verhandlungsauftrag: Reparaturpfad testen";
  if (status === "sendable") return "Verhandlungsauftrag: Angebot vorbereiten";
  return "Verhandlungsauftrag: indikativ bleiben";
}

function negotiationCommandInternalLine(
  repairPlan: DealRepairPlanBrief,
  status: DealNegotiationCommandStatus
): string {
  if (status === "missing") {
    return "Kein Verhandlungsauftrag, bis Underwriting, Stress-Test und Reparaturplan aktualisiert sind.";
  }
  if (status === "blocked") {
    return `Kein bindendes Angebot: erst Cashflow-Luecke ${repairMonthlyText(repairPlan.cashflowGapMonthly)} und Reparaturpfad belegen.`;
  }
  if (status === "indicative") {
    return "Nur indikativ sprechen: Reparatur- und Beleglage im Dossier halten, bevor Zusagen entstehen.";
  }
  return "Angebot kann vorbereitet werden, aber Preis-, Bank- und Objektbelege bleiben verbindliche Leitplanken.";
}

function negotiationCommandSellerLine(
  repairPlan: DealRepairPlanBrief,
  status: DealNegotiationCommandStatus
): string {
  if (status === "missing") {
    return "Wir koennen erst sinnvoll sprechen, wenn Underwriting und Stress-Test vollstaendig sind.";
  }
  if (status === "blocked") {
    return `Wir koennen den Deal nur weiterpruefen, wenn Kaufpreis, Miete, Finanzierung oder Capex-Reserve die Stress-Luecke von ${repairMonthlyText(repairPlan.cashflowGapMonthly)} schliessen.`;
  }
  if (status === "indicative") {
    return "Wir bleiben interessiert, brauchen aber vor einem verbindlichen Angebot belastbare Objekt-, Miet- und Bankbelege.";
  }
  return "Wir koennen auf Basis der aktuellen Belege ein Angebot vorbereiten, vorbehaltlich finaler Unterlagen- und Bankpruefung.";
}

function negotiationCommandCopyText(
  repairPlan: DealRepairPlanBrief,
  sellerLine: string,
  status: DealNegotiationCommandStatus
): string {
  const prefix = status === "sendable" ? "Angebotslinie" : "unverbindliche Prueflinie";
  return `${prefix}: ${sellerLine} Konkret brauchen wir ca. ${stressCurrencyText(repairPlan.purchasePriceRepairEur)} Preis-/Debt-Hebel, ${repairMonthlyText(repairPlan.rentRepairMonthly)} belastbaren Miethebel und ${stressCurrencyText(repairPlan.capexReserveEur)} Capex-Reserve, bevor daraus ein bindendes Angebot werden kann.`;
}

function negotiationCommandFacts(
  repairPlan: DealRepairPlanBrief,
  status: DealNegotiationCommandStatus
): DealNegotiationCommandBrief["facts"] {
  return [
    {
      label: "Sendestatus",
      value: negotiationCommandStatusLabel(status),
      tone: negotiationCommandTone(status)
    },
    {
      label: "Cashflow-Luecke",
      value: repairMonthlyText(repairPlan.cashflowGapMonthly),
      tone: repairPlan.cashflowGapMonthly !== null && repairPlan.cashflowGapMonthly > 0 ? "risk" : "good"
    },
    {
      label: "Preis-/Debt-Hebel",
      value: stressCurrencyText(repairPlan.purchasePriceRepairEur),
      tone: repairPlan.purchasePriceRepairEur !== null && repairPlan.purchasePriceRepairEur > 0 ? "risk" : "good"
    },
    {
      label: "Verkaeuferlinie",
      value: repairPlan.status === "needs_repair" ? "Reparaturpfad" : status === "sendable" ? "Angebot" : "Indikativ",
      tone: negotiationCommandTone(status)
    }
  ];
}

function negotiationCommandStatusLabel(status: DealNegotiationCommandStatus): string {
  if (status === "sendable") return "Senden";
  if (status === "indicative") return "Indikativ";
  if (status === "blocked") return "Nicht senden";
  return "Fehlt";
}

function negotiationCommandAsks(repairPlan: DealRepairPlanBrief): DealNegotiationCommandAsk[] {
  return [
    {
      label: "Preis-/Debt-Hebel",
      value: stressCurrencyText(repairPlan.purchasePriceRepairEur),
      reason: "Direktester Hebel, um Kapitaldienst und Stress-Cashflow zu entlasten.",
      tone: repairPlan.purchasePriceRepairEur !== null && repairPlan.purchasePriceRepairEur > 0 ? "risk" : "good"
    },
    {
      label: "Mietbeleg",
      value: repairMonthlyText(repairPlan.rentRepairMonthly),
      reason: "Nur belegte, rechtlich tragfaehige Zielmiete darf die Cashflow-Luecke schliessen.",
      tone: repairPlan.rentRepairMonthly !== null && repairPlan.rentRepairMonthly > 0 ? "risk" : "good"
    },
    {
      label: "Finanzierungsstruktur",
      value: repairRateText(repairPlan.rateRepairPercentPoints),
      reason: "Zins, Tilgung, Zinsbindung oder Verkaeuferdarlehen muessen den Stressfall sichtbar verbessern.",
      tone: repairPlan.rateRepairPercentPoints !== null && repairPlan.rateRepairPercentPoints > 0 ? "watch" : "good"
    },
    {
      label: "Capex-Reserve",
      value: stressCurrencyText(repairPlan.capexReserveEur),
      reason: "Sanierungspuffer muss separat als Liquiditaet, Preisabschlag oder Bankreserve gehalten werden.",
      tone: repairPlan.capexReserveEur !== null && repairPlan.capexReserveEur > 0 ? "watch" : "good"
    },
    {
      label: "Unterlagenpaket",
      value: "Pflichtbelege",
      reason: "Mietvertrag, WEG, Energie, Capex und Bankannahmen muessen vor bindender Zusage belegbar sein.",
      tone: "watch"
    }
  ];
}

function negotiationCommandStopRules(
  repairPlan: DealRepairPlanBrief,
  status: DealNegotiationCommandStatus
): string[] {
  if (status === "missing") {
    return ["Kein Verhandlungsauftrag ohne Underwriting, Stress-Test und Reparaturplan."];
  }
  if (status === "blocked") {
    return [
      "Kein bindendes Angebot, solange der Reparaturpfad nicht belegt ist.",
      ...repairPlan.stopRules
    ].slice(0, 3);
  }
  return [
    "Keine Verkaeuferzusage ausserhalb des dokumentierten Angebotsbands.",
    ...repairPlan.stopRules
  ].slice(0, 3);
}

function negotiationCommandNextActions(repairPlan: DealRepairPlanBrief): string[] {
  return uniqueItems([
    "Verhandlungsauftrag in Dossier, Bankpaket und IC-Memo uebernehmen.",
    ...repairPlan.nextActions
  ]).slice(0, 5);
}

export function dealLoiConditionsBrief(deal: Deal): DealLoiConditionsBrief {
  const repairPlan = dealRepairPlanBrief(deal);
  const negotiationCommand = dealNegotiationCommandBrief(deal);
  const offerBand = dealOfferBandBrief(deal);
  const offerDecision = dealOfferDecisionBrief(deal);
  const offerReleasePackage = dealOfferReleasePackageBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const status = loiConditionsStatus({
    negotiationCommand,
    offerBand,
    offerDecision,
    offerReleasePackage
  });
  const tone = loiConditionsTone(status);
  const conditions = loiConditionsItems({
    documents,
    repairPlan,
    status
  });

  return {
    status,
    headline: loiConditionsHeadline(status, repairPlan),
    tone,
    loiMode: loiConditionsMode(status, repairPlan),
    copyText: loiConditionsCopyText({
      negotiationCommand,
      offerBand,
      repairPlan,
      status
    }),
    facts: loiConditionsFacts({
      conditions,
      repairPlan,
      status
    }),
    conditions,
    killClauses: loiConditionsKillClauses({
      negotiationCommand,
      status
    }),
    nextActions: loiConditionsNextActions({
      offerReleasePackage,
      status
    })
  };
}

function loiConditionsStatus(input: {
  negotiationCommand: DealNegotiationCommandBrief;
  offerBand: DealOfferBandBrief;
  offerDecision: DealOfferDecisionBrief;
  offerReleasePackage: DealOfferReleasePackageBrief;
}): DealLoiConditionsStatus {
  if (input.negotiationCommand.status === "missing") {
    return "missing";
  }
  if (
    input.negotiationCommand.status === "blocked" ||
    input.offerDecision.status === "blocked" ||
    input.offerReleasePackage.status === "blocked"
  ) {
    return "blocked";
  }
  if (
    input.negotiationCommand.status === "indicative" ||
    input.offerDecision.status === "indicative" ||
    input.offerReleasePackage.status === "conditional"
  ) {
    return "conditional";
  }
  if (input.offerBand.status === "missing") {
    return "missing";
  }
  return "sendable";
}

function loiConditionsTone(status: DealLoiConditionsStatus): ReturnType<typeof scoreTone> {
  if (status === "sendable") return "good";
  if (status === "conditional") return "watch";
  if (status === "blocked") return "risk";
  return "empty";
}

function loiConditionsHeadline(status: DealLoiConditionsStatus, repairPlan: DealRepairPlanBrief): string {
  if (status === "missing") return "LOI-Paket fehlt";
  if (status === "blocked" && repairPlan.status === "needs_repair") {
    return "LOI-Paket: nur unverbindliche Reparatur-Indikation";
  }
  if (status === "blocked") return "LOI-Paket gesperrt";
  if (status === "conditional") return "LOI-Paket: nur mit Vorbehalten";
  return "LOI-Paket sendbar";
}

function loiConditionsMode(status: DealLoiConditionsStatus, repairPlan: DealRepairPlanBrief): string {
  if (status === "missing") {
    return "Kein LOI-Modus: Erst Angebotsband, Stress-Test und Unterlagenlage aktualisieren.";
  }
  if (status === "blocked") {
    return `Kein LOI/keine Reservierung: Nur unverbindliche Reparatur-Indikation, bis ${repairMonthlyText(repairPlan.cashflowGapMonthly)} Cashflow-Luecke geschlossen ist.`;
  }
  if (status === "conditional") {
    return "Nur indikatives LOI-Paket: Preis, Finanzierung, Unterlagen und Objektpruefung bleiben als harte Vorbehalte sichtbar.";
  }
  return "LOI-Paket darf vorbereitet werden; finale Bindung bleibt an Bank-, Unterlagen- und Objektfreigabe gekoppelt.";
}

function loiConditionsCopyText(input: {
  negotiationCommand: DealNegotiationCommandBrief;
  offerBand: DealOfferBandBrief;
  repairPlan: DealRepairPlanBrief;
  status: DealLoiConditionsStatus;
}): string {
  if (input.status === "missing") {
    return "Noch kein LOI-Text: Bitte erst Angebotsband, Underwriting und Unterlagenstatus aktualisieren.";
  }

  const priceText =
    input.offerBand.startOfferPrice !== null
      ? `Startgebot ${offerCurrencyText(input.offerBand.startOfferPrice)}`
      : `Preis-/Debt-Hebel ${stressCurrencyText(input.repairPlan.purchasePriceRepairEur)}`;

  if (input.status === "blocked") {
    return `unverbindliche Prueflinie, kein LOI und keine Reservierung: Wir koennen nur weiterpruefen, wenn ca. ${stressCurrencyText(input.repairPlan.purchasePriceRepairEur)} Preis-/Debt-Hebel, ${repairMonthlyText(input.repairPlan.rentRepairMonthly)} Cashflow-Luecke und ${stressCurrencyText(input.repairPlan.capexReserveEur)} Capex-Reserve vorbehaltlich Bank-, Miet- und Unterlagenpruefung geschlossen werden.`;
  }

  return `${input.status === "sendable" ? "LOI-Linie" : "Indikative LOI-Linie"}: ${priceText}, vorbehaltlich finaler Finanzierung, vollstaendiger Unterlagen, Mietbelege und Objektpruefung. ${input.negotiationCommand.sellerLine}`;
}

function loiConditionsFacts(input: {
  conditions: DealLoiConditionItem[];
  repairPlan: DealRepairPlanBrief;
  status: DealLoiConditionsStatus;
}): DealLoiConditionsBrief["facts"] {
  return [
    {
      label: "LOI-Status",
      value: loiConditionsStatusLabel(input.status),
      tone: loiConditionsTone(input.status)
    },
    {
      label: "Preis-/Debt-Hebel",
      value: stressCurrencyText(input.repairPlan.purchasePriceRepairEur),
      tone: input.repairPlan.purchasePriceRepairEur !== null && input.repairPlan.purchasePriceRepairEur > 0 ? "risk" : "good"
    },
    {
      label: "Cashflow-Luecke",
      value: repairMonthlyText(input.repairPlan.cashflowGapMonthly),
      tone: input.repairPlan.cashflowGapMonthly !== null && input.repairPlan.cashflowGapMonthly > 0 ? "risk" : "good"
    },
    {
      label: "Capex-Reserve",
      value: stressCurrencyText(input.repairPlan.capexReserveEur),
      tone: input.repairPlan.capexReserveEur !== null && input.repairPlan.capexReserveEur > 0 ? "watch" : "good"
    },
    {
      label: "Pflichtbedingungen",
      value: `${input.conditions.length} Punkte`,
      tone: input.status === "sendable" ? "good" : input.status === "blocked" ? "risk" : "watch"
    }
  ];
}

function loiConditionsStatusLabel(status: DealLoiConditionsStatus): string {
  if (status === "sendable") return "Senden";
  if (status === "conditional") return "Nur indikativ";
  if (status === "blocked") return "Nicht senden";
  return "Fehlt";
}

function loiConditionsItems(input: {
  documents: DueDiligenceDocumentSummary;
  repairPlan: DealRepairPlanBrief;
  status: DealLoiConditionsStatus;
}): DealLoiConditionItem[] {
  const priceNeedsFix = input.repairPlan.purchasePriceRepairEur !== null && input.repairPlan.purchasePriceRepairEur > 0;
  const rentNeedsFix = input.repairPlan.rentRepairMonthly !== null && input.repairPlan.rentRepairMonthly > 0;
  const capexNeedsReserve = input.repairPlan.capexReserveEur !== null && input.repairPlan.capexReserveEur > 0;
  const missingDocuments = input.documents.missingLabels.length;
  const hardStatus = input.status === "blocked";

  return [
    {
      label: "Preis-/Debt-Hebel",
      statusLabel: priceNeedsFix || hardStatus ? "Pflicht" : "Reserve",
      tone: priceNeedsFix || hardStatus ? "risk" : "good",
      clause: `Kaufpreis, Darlehen oder Verkaeuferstruktur muessen den Hebel von ${stressCurrencyText(input.repairPlan.purchasePriceRepairEur)} sichtbar abbilden.`,
      proof: "Preisanker muss im Dossier, Bankpaket und IC-Memo gleich sein.",
      owner: "Verhandlung"
    },
    {
      label: "Mietbeleg",
      statusLabel: rentNeedsFix || hardStatus ? "Pflicht" : "Reserve",
      tone: rentNeedsFix || hardStatus ? "risk" : "good",
      clause: `Mietannahme darf nur zaehlen, wenn ${repairMonthlyText(input.repairPlan.rentRepairMonthly)} rechtlich und marktseitig belegbar sind.`,
      proof: "Mietvertrag, Mietspiegel/Vergleichsmiete und rechtlicher Spielraum vor bindender Zusage pruefen.",
      owner: "Asset Check"
    },
    {
      label: "Finanzierungsvorbehalt",
      statusLabel: input.status === "sendable" ? "Vorbehalt" : "Pflicht",
      tone: input.status === "sendable" ? "watch" : "risk",
      clause: "LOI oder Angebot bleibt vorbehaltlich finaler Finanzierungszusage, Darlehensstruktur und Stress-Test-Freigabe.",
      proof: "Bankfeedback und DSCR-Stress muessen vor Notarvorbereitung dokumentiert sein.",
      owner: "Bank"
    },
    {
      label: "Capex-/Sanierungsvorbehalt",
      statusLabel: capexNeedsReserve || hardStatus ? "Pflicht" : "Reserve",
      tone: capexNeedsReserve || hardStatus ? "watch" : "good",
      clause: `Capex-Risiko bleibt mit ${stressCurrencyText(input.repairPlan.capexReserveEur)} Reserve oder Preisabschlag im LOI vorbehalten.`,
      proof: "Angebote, Ruecklagen, WEG-Protokolle und Sanierungsumfang vor Bindung pruefen.",
      owner: "Technik/WEG"
    },
    {
      label: "Unterlagenvorbehalt",
      statusLabel: missingDocuments > 0 || hardStatus ? "Pflicht" : "Vorbehalt",
      tone: missingDocuments > 0 || hardStatus ? "risk" : "watch",
      clause: "Keine bindende Zusage ohne vollstaendiges Due-Diligence-Paket und Plausibilitaetspruefung.",
      proof:
        missingDocuments > 0
          ? `${missingDocuments} Pflichtunterlagen fehlen: ${input.documents.missingLabels.slice(0, 3).join(", ")}.`
          : `${input.documents.headline} vorhanden; finale Pruefung bleibt Bedingung.`,
      owner: "Diligence"
    }
  ];
}

function loiConditionsKillClauses(input: {
  negotiationCommand: DealNegotiationCommandBrief;
  status: DealLoiConditionsStatus;
}): string[] {
  if (input.status === "missing") {
    return ["Kein LOI ohne Angebotsband, Stress-Test und Unterlagenstatus."];
  }
  if (input.status === "blocked") {
    return uniqueItems([
      "Kein LOI und keine Reservierung, solange der Reparaturpfad nicht belegt ist.",
      "Keine Notarvorbereitung ohne Bank- und Unterlagenfreigabe.",
      ...input.negotiationCommand.stopRules
    ]).slice(0, 4);
  }
  return uniqueItems([
    "Keine Preiszusage oberhalb des dokumentierten Walk-away.",
    "Keine Notarvorbereitung ohne Bank- und Unterlagenfreigabe.",
    ...input.negotiationCommand.stopRules
  ]).slice(0, 4);
}

function loiConditionsNextActions(input: {
  offerReleasePackage: DealOfferReleasePackageBrief;
  status: DealLoiConditionsStatus;
}): string[] {
  if (input.status === "missing") {
    return ["Angebotsband, Stress-Test und Unterlagenstatus aktualisieren, bevor ein LOI-Paket vorbereitet wird."];
  }
  return uniqueItems([
    input.status === "blocked"
      ? "LOI-Paket erst nach geloestem Verhandlungsauftrag an Makler/Verkaeufer geben."
      : "LOI-Paket mit Preis, Vorbehalten und Unterlagenliste in das Verhandlungsdossier uebernehmen.",
    "Preis-/Debt-Hebel, Mietbeleg, Finanzierungsvorbehalt und Capex-Reserve vor externer Zusage abstimmen.",
    `Freigabestatus "${input.offerReleasePackage.releaseLabel}" vor Versand erneut pruefen.`
  ]).slice(0, 6);
}

export function dealOfferDecisionBrief(deal: Deal): DealOfferDecisionBrief {
  const offerBand = dealOfferBandBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const status = offerDecisionStatus(offerBand, readiness);
  const tone = offerDecisionTone(status);

  return {
    status,
    headline: offerDecisionHeadline(status),
    tone,
    offerMode: offerDecisionMode(status, offerBand),
    sellerLine: offerDecisionSellerLine(offerBand),
    facts: offerDecisionFacts(offerBand, readiness, status),
    conditions: offerDecisionConditions(offerBand, readiness, developmentPricing),
    nextActions: offerDecisionNextActions(offerBand, readiness, developmentPricing)
  };
}

export function dealOfferReleasePackageBrief(deal: Deal): DealOfferReleasePackageBrief {
  const offerBand = dealOfferBandBrief(deal);
  const offerDecision = dealOfferDecisionBrief(deal);
  const committee = dealInvestmentCommitteeBrief(deal);
  const readiness = acquisitionReadinessSummary(deal);
  const evidence = dealEvidenceQualityBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const status = offerReleaseStatus(offerDecision, committee);
  const tone = offerReleaseTone(status);
  const releaseLabel = offerReleaseLabel(status);
  const openGates = Math.max(0, readiness.total - readiness.readyCount);

  return {
    status,
    headline: offerReleaseHeadline(status),
    tone,
    releaseLabel,
    sellerMessage: offerDecision.sellerLine,
    internalGuardrails: offerReleaseInternalGuardrails({
      committee,
      developmentPricing,
      evidence,
      offerBand,
      openGates
    }),
    externalConditions: offerReleaseExternalConditions({
      documents,
      offerBand,
      status
    }),
    nextActions: uniqueItems([
      ...offerDecision.nextActions,
      ...committee.nextQuestions,
      ...documents.requestPack.copyLines.slice(0, 2)
    ]).slice(0, 6),
    facts: [
      {
        label: "Freigabe",
        value: releaseLabel,
        tone
      },
      {
        label: "Startgebot",
        value: offerBand.startOfferPrice !== null ? offerCurrencyText(offerBand.startOfferPrice) : "Fehlt",
        tone: offerBand.startOfferPrice !== null ? "watch" : "empty"
      },
      {
        label: "Walk-away",
        value: offerBand.walkAwayPrice !== null ? offerCurrencyText(offerBand.walkAwayPrice) : "Fehlt",
        tone: offerBand.walkAwayPrice !== null ? offerBand.tone : "empty"
      },
      {
        label: "Offene Gates",
        value: String(openGates),
        tone: openGates === 0 ? "good" : status === "blocked" ? "risk" : "watch"
      },
      {
        label: "Beleg-Score",
        value: `${evidence.percent} %`,
        tone: evidence.tone
      }
    ]
  };
}

export function dealBrokerPriceCommunicationBrief(deal: Deal): DealBrokerPriceCommunicationBrief {
  const offerBand = dealOfferBandBrief(deal);
  const offerRelease = dealOfferReleasePackageBrief(deal);
  const documents = dueDiligenceDocumentSummary(deal);
  const development = objectDevelopmentPotentialBrief(deal);
  const developmentPricing = dealDevelopmentPricingDisciplineBrief(deal);
  const locationDiscipline = dealLocationOfferDisciplineBrief(deal);
  const status = brokerPriceCommunicationStatus(offerBand, offerRelease);
  const tone = brokerPriceCommunicationTone(status);
  const externalLine = brokerPriceExternalLine(offerBand, status);

  return {
    status,
    headline: "Maklertext ohne interne Upside-Argumente",
    tone,
    externalLine,
    copyText: brokerPriceCopyText(externalLine, documents, offerRelease),
    facts: [
      {
        label: "Maklerstatus",
        value: brokerPriceCommunicationStatusLabel(status),
        tone
      },
      {
        label: "Externer Preisanker",
        value: offerBand.startOfferPrice !== null ? offerCurrencyText(offerBand.startOfferPrice) : "Fehlt",
        tone: offerBand.startOfferPrice !== null ? "watch" : "empty"
      },
      {
        label: "Freigabe",
        value: offerRelease.releaseLabel,
        tone: offerRelease.tone
      },
      {
        label: "Unterlagen",
        value: `${documents.provided}/${documents.total}`,
        tone: documents.percent >= 80 ? "good" : documents.percent >= 50 ? "watch" : "risk"
      }
    ],
    internalGuardrails: brokerPriceInternalGuardrails({
      developmentCommand: development.developmentCommand,
      developmentPricing,
      locationDiscipline,
      offerBand,
      offerRelease
    }),
    externalConditions: offerRelease.externalConditions,
    nextActions: uniqueItems([
      "Nur den freigegebenen Maklertext senden; interne Preisgrenzen und Upside-Argumente nicht weitergeben.",
      ...offerRelease.nextActions
    ]).slice(0, 6)
  };
}

export function dealDevelopmentPricingDisciplineBrief(deal: Deal): DealDevelopmentPricingDisciplineBrief {
  const offerBand = dealOfferBandBrief(deal);
  const result = deal.latest_renovation_case?.results ?? null;
  const visibleValueUplift = numberValue(result?.implied_value_uplift_from_rent);
  const equityRelease = numberValue(result?.potential_equity_released);
  const capex = numberValue(result?.planned_capex) ?? numberValue(deal.listing?.expected_initial_capex);
  const hasWegCheck = Boolean(deal.weg_health);
  const hasGeoCheck = Boolean(deal.geo_context);
  const allowedCredit = offerBand.developmentCreditEur;
  const hasVisibleUpside =
    allowedCredit > 0 ||
    (visibleValueUplift !== null && visibleValueUplift > 0) ||
    (equityRelease !== null && equityRelease > 0);
  const blockers = developmentPricingBlockers({
    capex,
    equityRelease,
    hasGeoCheck,
    hasWegCheck,
    hasRenovationCase: Boolean(result),
    recommendation: result?.recommendation ?? null
  });
  const status: DealDevelopmentPricingDisciplineBrief["status"] =
    allowedCredit > 0 ? "priced" : hasVisibleUpside ? "conditional" : "quarantined";
  const tone: ReturnType<typeof scoreTone> = status === "priced" ? "good" : status === "conditional" ? "watch" : "risk";

  return {
    status,
    headline: developmentPricingHeadline(status),
    tone,
    priceRule: developmentPricingRule(status, allowedCredit),
    allowedCreditEur: allowedCredit,
    visibleValueUpliftEur: visibleValueUplift,
    equityReleaseEur: equityRelease,
    blockers,
    memoItems: developmentPricingMemoItems(status, {
      allowedCredit,
      equityRelease,
      visibleValueUplift
    }),
    nextActions: developmentPricingNextActions(status, blockers),
    facts: [
      {
        label: "Preis-Credit",
        value: offerCurrencyText(allowedCredit),
        tone
      },
      {
        label: "Werthebel sichtbar",
        value: visibleValueUplift !== null ? offerCurrencyText(visibleValueUplift) : "Fehlt",
        tone: valueUpliftTone(visibleValueUplift)
      },
      {
        label: "Kapitalfreisetzung",
        value: equityRelease !== null ? offerCurrencyText(equityRelease) : "Fehlt",
        tone: valueUpliftTone(equityRelease)
      },
      {
        label: "Objekt-Belege",
        value: hasWegCheck && hasGeoCheck ? "WEG + Geo" : hasWegCheck || hasGeoCheck ? "Teilweise" : "Fehlen",
        tone: hasWegCheck && hasGeoCheck ? "good" : hasWegCheck || hasGeoCheck ? "watch" : "risk"
      }
    ]
  };
}

function riskAdjustedOfferDrivers(input: {
  assumptionAudit: DealAssumptionAuditBrief;
  baseWalkAwayPrice: number;
  deal: Deal;
  evidence: DealEvidenceQualityBrief;
  exitLiquidity: DealExitLiquidityBrief;
  readiness: AcquisitionReadinessSummary;
}): DealRiskAdjustedOfferDriver[] {
  const drivers: DealRiskAdjustedOfferDriver[] = [];
  const cashflow = numberValue(input.deal.latest_underwriting?.monthly_cashflow_before_tax);
  const dscr = numberValue(input.deal.latest_underwriting?.dscr);

  if (input.exitLiquidity.estimatedExitDiscountPercent > 3) {
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Exit-These, Zielkaeufer und Wiederverkaufsabschlag im Memo belegen.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Exit-Liquiditaet",
        reason: `${input.exitLiquidity.liquidityLabel}: ${input.exitLiquidity.estimatedExitDiscountPercent} % Exit-Abschlag als Preisrisiko behandeln.`,
        reservePercent: Math.min(4, Math.round(input.exitLiquidity.estimatedExitDiscountPercent * 0.4)),
        tone: input.exitLiquidity.tone
      })
    );
  }

  if (input.assumptionAudit.blockerCount > 0) {
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Preisrelevante Annahmen vor bindendem Angebot schliessen.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Annahmen-Audit",
        reason: `${input.assumptionAudit.blockerCount} preisrelevante Annahmen sind offen.`,
        reservePercent: Math.min(5, input.assumptionAudit.blockerCount),
        tone: input.assumptionAudit.tone
      })
    );
  }

  if (input.evidence.percent < 85) {
    const reservePercent = input.evidence.percent < 50 ? 3 : input.evidence.percent < 70 ? 2 : 1;
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Belege durch Unterlagen, Quellen und Vor-Ort-Check erhoehen.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Beleg-Reserve",
        reason: `Beleg-Score ${input.evidence.percent} % ist fuer ein bindendes Angebot noch zu weich.`,
        reservePercent,
        tone: input.evidence.tone
      })
    );
  }

  if (input.readiness.status !== "ready") {
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Freigabe-Gates abarbeiten, bevor der Risiko-Deckel angehoben wird.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Freigabe-Gates",
        reason: `${input.readiness.readyCount}/${input.readiness.total} Gates bestanden.`,
        reservePercent: input.readiness.status === "blocked" ? 3 : 1,
        tone: input.readiness.tone
      })
    );
  }

  if ((cashflow !== null && cashflow < 0) || (dscr !== null && dscr < 1.1)) {
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Cashflow, Miete, Hausgeld, Zins und Kaufpreis nachziehen, bis der Base Case traegt.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Finanzierung",
        reason: "Cashflow oder DSCR liegen unter einer belastbaren Ankaufsschwelle.",
        reservePercent: 3,
        tone: "risk"
      })
    );
  }

  if (drivers.length === 0) {
    drivers.push(
      riskAdjustedOfferDriver({
        action: "Risiko-Puffer im Memo dokumentieren und bei neuen Unterlagen neu rechnen.",
        baseWalkAwayPrice: input.baseWalkAwayPrice,
        label: "Basis-Puffer",
        reason: "Keine harte offene Risikoreserve im aktuellen Datenstand.",
        reservePercent: 0,
        tone: "good"
      })
    );
  }

  return drivers;
}

function riskAdjustedOfferDriver(input: {
  action: string;
  baseWalkAwayPrice: number;
  label: string;
  reason: string;
  reservePercent: number;
  tone: ReturnType<typeof scoreTone>;
}): DealRiskAdjustedOfferDriver {
  const reserveEur = input.baseWalkAwayPrice > 0 ? Math.round(input.baseWalkAwayPrice * (input.reservePercent / 100) / 500) * 500 : 0;
  return {
    action: input.action,
    label: input.label,
    reason: input.reason,
    reserveEur,
    reservePercent: input.reservePercent,
    tone: input.tone
  };
}

function riskAdjustedOfferStatus(
  offerBand: DealOfferBandBrief,
  readiness: AcquisitionReadinessSummary,
  reservePercent: number
): DealRiskAdjustedOfferStatus {
  if (offerBand.status === "missing") {
    return "no_anchor";
  }
  if (reservePercent >= 10 || readiness.status === "blocked" || offerBand.status === "price_gap") {
    return "blocked";
  }
  if (reservePercent > 3 || readiness.status !== "ready") {
    return "guarded";
  }
  return "ready";
}

function riskAdjustedOfferTone(status: DealRiskAdjustedOfferStatus): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "guarded") return "watch";
  if (status === "blocked") return "risk";
  return "empty";
}

function riskAdjustedOfferHeadline(status: DealRiskAdjustedOfferStatus): string {
  if (status === "ready") return "Risiko-Puffer im Angebot enthalten";
  if (status === "guarded") return "Nur mit Risiko-Puffer bieten";
  if (status === "blocked") return "Risiko-Puffer blockiert bindendes Angebot";
  return "Risiko-Puffer noch nicht berechenbar";
}

function riskAdjustedOfferSummary(
  status: DealRiskAdjustedOfferStatus,
  baseWalkAwayPrice: number,
  requiredReserveEur: number,
  riskAdjustedCeilingPrice: number
): string {
  if (status === "ready") {
    return `Interner Walk-away ${offerCurrencyText(baseWalkAwayPrice)} bleibt nutzbar; offene Risiken verlangen nur ${offerCurrencyText(requiredReserveEur)} Reserve.`;
  }
  if (status === "guarded") {
    return `Walk-away ${offerCurrencyText(baseWalkAwayPrice)} nur mit ${offerCurrencyText(requiredReserveEur)} Reserve nutzen; risikojustierter Deckel ${offerCurrencyText(riskAdjustedCeilingPrice)}.`;
  }
  if (status === "blocked") {
    return `Walk-away ${offerCurrencyText(baseWalkAwayPrice)} ist vorerst zu weich; risikojustierter Deckel ${offerCurrencyText(riskAdjustedCeilingPrice)} bis die Treiber geschlossen sind.`;
  }
  return "Preisanker fehlen; Risiko-Puffer noch nicht belastbar.";
}

function riskAdjustedOfferGuardrails(
  status: DealRiskAdjustedOfferStatus,
  riskAdjustedCeilingPrice: number | null,
  reservePercent: number,
  offerBand: DealOfferBandBrief
): string[] {
  if (riskAdjustedCeilingPrice === null) {
    return ["Kein bindendes Angebot ohne berechneten Risiko-Deckel."];
  }

  const guardrails = [
    `Kein bindendes Angebot oberhalb ${offerCurrencyText(riskAdjustedCeilingPrice)}, solange die offenen Risiko-Treiber nicht geschlossen sind.`,
    `Sicherheitsabschlag ${formatNumber(reservePercent)} % separat vom Basis-Walk-away dokumentieren.`
  ];

  if (status === "blocked") {
    guardrails.push("Verkaeuferkommunikation nur als unverbindliche Preisindikation mit Due-Diligence-Vorbehalt.");
  }
  if (offerBand.walkAwayPrice !== null) {
    guardrails.push(`Basis-Walk-away ${offerCurrencyText(offerBand.walkAwayPrice)} bleibt intern und wird nicht als Startgebot kommuniziert.`);
  }

  return uniqueItems(guardrails).slice(0, 5);
}

function riskAdjustedOfferNextActions(
  drivers: DealRiskAdjustedOfferDriver[],
  status: DealRiskAdjustedOfferStatus
): string[] {
  return uniqueItems([
    "Risiko-Puffer im IC-Memo zeigen: Basis-Walk-away, Sicherheitsabschlag und Risiko-Deckel getrennt ausweisen.",
    ...(status === "blocked" ? ["Erst die groessten Risiko-Treiber schliessen, dann Angebotsfreigabe neu pruefen."] : []),
    ...drivers.filter((driver) => driver.reservePercent > 0).map((driver) => driver.action)
  ]).slice(0, 6);
}

function marketComparisonStatus(input: {
  askingPricePerSqm: number | null;
  marketGapPercent: number | null;
  marketPricePerSqm: number | null;
}): DealMarketComparisonStatus {
  if (input.askingPricePerSqm === null || input.marketPricePerSqm === null || input.marketGapPercent === null) {
    return "missing";
  }
  if (input.marketGapPercent > 10) {
    return "overpriced";
  }
  if (input.marketGapPercent < -5) {
    return "underpriced";
  }
  return "fair";
}

function marketComparisonTone(status: DealMarketComparisonStatus): ReturnType<typeof scoreTone> {
  if (status === "underpriced") return "good";
  if (status === "fair") return "watch";
  if (status === "overpriced") return "risk";
  return "empty";
}

function marketComparisonHeadline(status: DealMarketComparisonStatus): string {
  if (status === "underpriced") return "Preis unter Marktanker";
  if (status === "fair") return "Preis nahe Marktanker";
  if (status === "overpriced") return "Preis ueber Marktanker";
  return "Marktvergleich noch nicht belastbar";
}

function marketComparisonSummary(
  status: DealMarketComparisonStatus,
  marketGapEur: number | null,
  listing: Listing | null
): string {
  if (status === "missing") {
    return "Marktpreis/m2, Wohnflaeche oder Kaufpreis fehlen; ohne Marktanker bleibt der Preisvergleich nur Bauchgefuehl.";
  }
  const place = listing?.postal_code || listing?.city || "die Mikrolage";
  if (status === "overpriced") {
    return `${marketGapEur !== null ? offerCurrencyText(marketGapEur) : "Der"} Markt-Gap muss als Preisabschlag oder mit echten Comps fuer ${place} belegt werden.`;
  }
  if (status === "underpriced") {
    return `Das Angebot liegt unter dem Modell-Marktanker; trotzdem echte Vergleichsangebote und Objektgruende pruefen.`;
  }
  return `Das Angebot liegt nahe am Modell-Marktanker; entscheidend sind echte Comps, Mietrecht und Objektzustand.`;
}

function marketComparisonRows(
  deal: Deal,
  input: {
    askingPricePerSqm: number | null;
    livingArea: number | null;
    marketGapPercent: number | null;
    marketPricePerSqm: number | null;
  }
): DealMarketComparisonRow[] {
  const listing = deal.listing || null;
  const currentRentPerSqm = rentPerSqm(listing?.cold_rent_monthly, input.livingArea);
  const marketRentPerSqm = rentPerSqm(listing?.market_rent_estimate_monthly, input.livingArea);
  const referenceRentPerSqm = numberValue(deal.local_reference_rent_per_sqm);
  const legalTargetPerSqm = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const daysOnMarket = numberValue(listing?.days_on_market);
  const priceReductionCount = numberValue(listing?.price_reduction_count);

  return [
    {
      label: "Kaufpreis",
      statusLabel: marketPriceStatusLabel(input.marketGapPercent),
      tone: marketComparisonTone(
        marketComparisonStatus({
          askingPricePerSqm: input.askingPricePerSqm,
          marketGapPercent: input.marketGapPercent,
          marketPricePerSqm: input.marketPricePerSqm
        })
      ),
      value: formatPricePerSqm(input.askingPricePerSqm),
      benchmark: formatPricePerSqm(input.marketPricePerSqm),
      interpretation: marketPriceInterpretation(input.marketGapPercent),
      action: "Marktpreis/m2 mit echten Vergleichsangeboten, Lagequalitaet und Objektzustand gegenpruefen."
    },
    {
      label: "Ist-Miete",
      statusLabel:
        currentRentPerSqm !== null && referenceRentPerSqm !== null && currentRentPerSqm <= referenceRentPerSqm
          ? "Mietpuffer"
          : currentRentPerSqm !== null && referenceRentPerSqm !== null
            ? "Mietrisiko"
            : "Fehlt",
      tone:
        currentRentPerSqm !== null && referenceRentPerSqm !== null && currentRentPerSqm <= referenceRentPerSqm
          ? "good"
          : currentRentPerSqm !== null && referenceRentPerSqm !== null
            ? "risk"
            : "empty",
      value: formatRentPerSqm(currentRentPerSqm),
      benchmark: formatRentPerSqm(referenceRentPerSqm),
      interpretation: rentBenchmarkInterpretation(currentRentPerSqm, referenceRentPerSqm),
      action: "Mietvertrag, Mietspiegel und lokale Referenzmiete vor Miet-Upside pruefen."
    },
    {
      label: "Marktmiet-These",
      statusLabel:
        marketRentPerSqm !== null && legalTargetPerSqm !== null && marketRentPerSqm > legalTargetPerSqm
          ? "Gedeckelt"
          : marketRentPerSqm !== null
            ? "Pruefen"
            : "Fehlt",
      tone:
        marketRentPerSqm !== null && legalTargetPerSqm !== null && marketRentPerSqm > legalTargetPerSqm
          ? "watch"
          : marketRentPerSqm !== null
            ? "good"
            : "empty",
      value: formatRentPerSqm(marketRentPerSqm),
      benchmark: legalTargetPerSqm !== null ? `${formatRentPerSqm(legalTargetPerSqm)} rechtlich plausibel` : "Mietrecht fehlt",
      interpretation: marketRentInterpretation(marketRentPerSqm, legalTargetPerSqm),
      action: "Marktmiete nicht ueber rechtlich plausiblen Zielwert in Angebot oder Bankcase einpreisen."
    },
    {
      label: "Marktdynamik",
      statusLabel:
        daysOnMarket !== null && daysOnMarket >= 60
          ? "Verhandlungshebel"
          : daysOnMarket !== null
            ? "Frisch"
            : "Fehlt",
      tone: daysOnMarket !== null && daysOnMarket >= 60 ? "watch" : daysOnMarket !== null ? "good" : "empty",
      value: daysOnMarket !== null ? `${Math.round(daysOnMarket)} Tage` : "Fehlt",
      benchmark:
        priceReductionCount !== null && priceReductionCount > 0
          ? `${Math.round(priceReductionCount)} Preisreduktion${Math.round(priceReductionCount) === 1 ? "" : "en"}`
          : "Keine Preisreduktion",
      interpretation:
        daysOnMarket !== null && daysOnMarket >= 60
          ? "Der Markt hat den Preis bereits getestet; das staerkt Preisdisziplin."
          : "Marktdauer liefert noch keinen harten Abschlagshebel.",
      action: "Inseratsdauer, Preisverlauf und Maklerfeedback als Verhandlungsargument dokumentieren."
    }
  ];
}

function marketComparisonGuardrails(status: DealMarketComparisonStatus, marketGapEur: number | null): string[] {
  if (status === "missing") {
    return [
      "Kein Kaufpreisaufschlag ohne Marktpreis/m2, Referenzmiete und echte Vergleichsangebote.",
      "Marktvergleich vor bindendem Angebot nachziehen."
    ];
  }
  const guardrails = [
    "Marktanker ist Modell-/Datenanker, keine echte Abschlussliste; Comps muessen im Memo sichtbar bleiben.",
    "Miet-Upside nur nach Mietrecht, Mietvertrag und Referenzmiete einpreisen."
  ];
  if (status === "overpriced" && marketGapEur !== null) {
    guardrails.unshift(`${offerCurrencyText(marketGapEur)} Markt-Gap nicht als Upside behandeln; entweder Kaufpreis senken oder echte Comps belegen.`);
  }
  if (status === "underpriced") {
    guardrails.unshift("Unter-Markt-These nur nutzen, wenn Objektzustand, WEG, Geo und Mietrecht den Abschlag nicht erklaeren.");
  }
  return uniqueItems(guardrails).slice(0, 5);
}

function marketComparisonNextActions(
  status: DealMarketComparisonStatus,
  listing: Listing | null,
  rows: DealMarketComparisonRow[]
): string[] {
  const place = listing?.postal_code || listing?.city || "die Mikrolage";
  return uniqueItems([
    `Echte Vergleichsangebote und, wenn moeglich, Abschlussdaten fuer PLZ ${place} nachziehen.`,
    ...(status === "overpriced" ? ["Markt-Gap als Preisabschlag in Angebotsband, Dossier und IC-Memo uebernehmen."] : []),
    ...rows
      .filter((row) => row.tone !== "good")
      .map((row) => row.action)
  ]).slice(0, 6);
}

function comparableEvidenceDocuments(documents: DealDocument[]): DealDocument[] {
  return documents.filter((document) => {
    const type = document.document_type.toLowerCase();
    const fileName = document.file_name.toLowerCase();
    return (
      type.includes("comp") ||
      type.includes("vergleich") ||
      type.includes("market_evidence") ||
      type.includes("rent_comparison") ||
      fileName.includes("vergleich") ||
      fileName.includes("comp")
    );
  });
}

function comparableEvidenceRow(input: {
  key: DealComparableEvidenceRow["key"];
  label: string;
  source: string;
  value: string;
  status: DealComparableEvidenceRowStatus;
  rule: string;
  nextAction: string;
}): DealComparableEvidenceRow {
  return {
    ...input,
    statusLabel: comparableEvidenceRowStatusLabel(input.status),
    tone: comparableEvidenceRowTone(input.status)
  };
}

function comparableEvidenceStatus(reviewedExternalComps: number, proxyCount: number): DealComparableEvidenceStatus {
  if (reviewedExternalComps >= 3) {
    return "verified";
  }
  if (proxyCount > 0) {
    return "proxy_only";
  }
  return "missing";
}

function comparableEvidenceTone(status: DealComparableEvidenceStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") {
    return "good";
  }
  if (status === "proxy_only") {
    return "watch";
  }
  return "risk";
}

function comparableEvidenceHeadline(status: DealComparableEvidenceStatus): string {
  if (status === "verified") {
    return "Comparable Evidence: echte Comps belegt";
  }
  if (status === "proxy_only") {
    return "Comparable Evidence: Proxy-Anker, echte Comps fehlen";
  }
  return "Comparable Evidence fehlt";
}

function comparableEvidenceSummary(
  status: DealComparableEvidenceStatus,
  reviewedExternalComps: number,
  requiredComps: number,
  proxyCount: number
): string {
  if (status === "verified") {
    return `${reviewedExternalComps}/${requiredComps} echte Vergleichsobjekte geprueft; Proxy-Anker bleiben Kontrollwerte.`;
  }
  if (status === "proxy_only") {
    return `${proxyCount}/4 Proxy-Anker vorhanden, aber ${reviewedExternalComps}/${requiredComps} echte Vergleichsobjekte geprueft. Preis bleibt im Review.`;
  }
  return "Ohne Marktanker und echte Vergleichsobjekte ist der Kaufpreis nicht belastbar.";
}

function comparableEvidenceStatusLabel(status: DealComparableEvidenceStatus): string {
  if (status === "verified") {
    return "Belegt";
  }
  if (status === "proxy_only") {
    return "Proxy-Anker";
  }
  return "Fehlt";
}

function comparableEvidenceRowStatusLabel(status: DealComparableEvidenceRowStatus): string {
  if (status === "verified") {
    return "Belegt";
  }
  if (status === "proxy") {
    return "Proxy";
  }
  return "Fehlen";
}

function comparableEvidenceRowTone(status: DealComparableEvidenceRowStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") {
    return "good";
  }
  if (status === "proxy") {
    return "watch";
  }
  return "risk";
}

function comparablePlaceAction(label: string, listing: Listing | null): string {
  const place = listing?.postal_code || listing?.city || "Mikrolage";
  return `${label} fuer ${place} mit 3-5 echten Vergleichsobjekten gegenpruefen.`;
}

function comparableEvidenceNextActions(rows: DealComparableEvidenceRow[]): string[] {
  return uniqueItems([
    ...rows.filter((row) => row.key === "external_comps" || row.status === "missing").map((row) => row.nextAction),
    ...rows.filter((row) => row.status === "proxy").map((row) => row.nextAction)
  ]).slice(0, 5);
}

function marketPriceStatusLabel(marketGapPercent: number | null): string {
  if (marketGapPercent === null) return "Fehlt";
  if (marketGapPercent > 10) return "Ueber Markt";
  if (marketGapPercent < -5) return "Unter Markt";
  return "Im Band";
}

function marketPriceInterpretation(marketGapPercent: number | null): string {
  if (marketGapPercent === null) return "Marktanker fehlt; Preisniveau nicht belastbar.";
  if (marketGapPercent > 10) return `${formatSignedPercent(marketGapPercent)} ueber Marktanker; nur mit Abschlag oder harten Comps vertretbar.`;
  if (marketGapPercent < -5) return `${formatSignedPercent(marketGapPercent)} unter Marktanker; Abschlagsgrund pruefen.`;
  return `${formatSignedPercent(marketGapPercent)} zum Marktanker; im Modellband.`;
}

function rentBenchmarkInterpretation(currentRentPerSqm: number | null, referenceRentPerSqm: number | null): string {
  if (currentRentPerSqm === null || referenceRentPerSqm === null) {
    return "Ist-Miete oder Referenzmiete fehlen.";
  }
  if (currentRentPerSqm <= referenceRentPerSqm) {
    return "Ist-Miete liegt nicht ueber Referenzmiete; Mietseite ist plausibel pruefbar.";
  }
  return "Ist-Miete liegt ueber Referenzmiete; Mietrecht und Nachhaltigkeit pruefen.";
}

function marketRentInterpretation(marketRentPerSqm: number | null, legalTargetPerSqm: number | null): string {
  if (marketRentPerSqm === null) return "Marktmiet-These fehlt.";
  if (legalTargetPerSqm !== null && marketRentPerSqm > legalTargetPerSqm) {
    return "Marktmiete liegt ueber rechtlich plausiblem Zielwert; Upside gedeckelt.";
  }
  return "Marktmiet-These ist vorhanden; Belege und Mietrecht pruefen.";
}

function rentPerSqm(monthlyRent: unknown, livingArea: number | null): number | null {
  const rent = numberValue(monthlyRent);
  if (rent === null || livingArea === null || livingArea <= 0) {
    return null;
  }
  return Math.round((rent / livingArea) * 10) / 10;
}

function formatPricePerSqm(value: number | null): string {
  return value !== null ? `${formatNumber(Math.round(value))} €/m2` : "Fehlt";
}

function formatRentPerSqm(value: number | null): string {
  return value !== null ? `${formatNumber(Math.round(value * 10) / 10)} €/m2` : "Fehlt";
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return "Fehlt";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)} %`;
}

function offerDecisionStatus(
  offerBand: DealOfferBandBrief,
  readiness: AcquisitionReadinessSummary
): DealOfferDecisionBrief["status"] {
  if (offerBand.status === "missing" || readiness.status === "blocked") {
    return "blocked";
  }
  if (readiness.status === "ready" && offerBand.status === "within_band") {
    return "ready";
  }
  return "indicative";
}

function offerDecisionTone(status: DealOfferDecisionBrief["status"]): ReturnType<typeof scoreTone> {
  if (status === "ready") {
    return "good";
  }
  if (status === "indicative") {
    return "watch";
  }
  return "risk";
}

function offerDecisionHeadline(status: DealOfferDecisionBrief["status"]): string {
  if (status === "ready") {
    return "Angebot freigeben";
  }
  if (status === "indicative") {
    return "Nur indikatives Angebot";
  }
  return "Kein bindendes Angebot";
}

function offerDecisionMode(status: DealOfferDecisionBrief["status"], offerBand: DealOfferBandBrief): string {
  if (
    offerBand.startOfferPrice === null ||
    offerBand.targetOfferPrice === null ||
    offerBand.walkAwayPrice === null
  ) {
    return "Noch kein Angebotsmodus: Erst Kaufpreis, Cashflow-Anker und Zielrendite berechnen.";
  }

  const bandText = `Startgebot ${offerCurrencyText(offerBand.startOfferPrice)}, Zielpreis ${offerCurrencyText(offerBand.targetOfferPrice)}, Walk-away ${offerCurrencyText(offerBand.walkAwayPrice)}.`;
  if (status === "ready") {
    return `Bindendes Angebot im dokumentierten Band moeglich: ${bandText}`;
  }
  if (status === "indicative") {
    return `Nur indikatives Angebot mit klaren Bedingungen: ${bandText}`;
  }
  return `Nur als Nachverhandlungsrahmen: ${bandText}`;
}

function offerDecisionSellerLine(offerBand: DealOfferBandBrief): string {
  const status: DealBrokerPriceCommunicationStatus =
    offerBand.status === "missing" ? "missing" : offerBand.status === "price_gap" ? "blocked" : "guarded";
  return brokerPriceExternalLine(offerBand, status);
}

function offerDecisionFacts(
  offerBand: DealOfferBandBrief,
  readiness: AcquisitionReadinessSummary,
  status: DealOfferDecisionBrief["status"]
): DealOfferDecisionBrief["facts"] {
  const gapValue =
    offerBand.askingPrice !== null && offerBand.walkAwayPrice !== null
      ? offerCurrencyText(Math.abs(offerBand.askingPrice - offerBand.walkAwayPrice))
      : "Fehlt";
  const gapLabel = offerBand.status === "within_band" ? "Puffer" : "Luecke";

  return [
    { label: "Status", value: offerDecisionStatusLabel(status), tone: offerDecisionTone(status) },
    {
      label: "Startgebot",
      value: offerBand.startOfferPrice !== null ? offerCurrencyText(offerBand.startOfferPrice) : "Fehlt",
      tone: offerBand.startOfferPrice !== null ? "watch" : "empty"
    },
    {
      label: "Zielpreis",
      value: offerBand.targetOfferPrice !== null ? offerCurrencyText(offerBand.targetOfferPrice) : "Fehlt",
      tone: offerBand.targetOfferPrice !== null ? offerBand.tone : "empty"
    },
    {
      label: "Walk-away",
      value: offerBand.walkAwayPrice !== null ? offerCurrencyText(offerBand.walkAwayPrice) : "Fehlt",
      tone: offerBand.walkAwayPrice !== null ? offerBand.tone : "empty"
    },
    { label: gapLabel, value: gapValue, tone: offerBand.status === "missing" ? "empty" : offerBand.tone },
    { label: "Freigabe", value: `${readiness.readyCount}/${readiness.total} Gates`, tone: readiness.tone }
  ];
}

function offerDecisionStatusLabel(status: DealOfferDecisionBrief["status"]): string {
  if (status === "ready") {
    return "Freigegeben";
  }
  if (status === "indicative") {
    return "Indikativ";
  }
  return "Gesperrt";
}

function offerDecisionConditions(
  offerBand: DealOfferBandBrief,
  readiness: AcquisitionReadinessSummary,
  developmentPricing: DealDevelopmentPricingDisciplineBrief
): string[] {
  return uniqueItems([
    actionPlanStopRule(readiness),
    "Entwicklungspotential erst nach WEG-, Geo- und Capex-Belegen in den Kaufpreis einrechnen.",
    ...offerBand.warnings,
    ...developmentPricing.memoItems,
    ...readiness.gates
      .filter((gate) => gate.status !== "pass")
      .map((gate) => `${gate.label}: ${gate.summary}`)
  ]).slice(0, 6);
}

function offerDecisionNextActions(
  offerBand: DealOfferBandBrief,
  readiness: AcquisitionReadinessSummary,
  developmentPricing: DealDevelopmentPricingDisciplineBrief
): string[] {
  const bandAction =
    offerBand.startOfferPrice !== null && offerBand.targetOfferPrice !== null && offerBand.walkAwayPrice !== null
      ? "Startgebot, Zielpreis und Walk-away im Dossier dokumentieren."
      : "Angebotsband aus Cashflow- und Zielrenditeanker berechnen.";

  return uniqueItems([
    "Verhandlungsdossier oeffnen und Verkaeufermotiv setzen.",
    bandAction,
    ...readiness.nextActions,
    ...developmentPricing.nextActions
  ]).slice(0, 6);
}

function offerReleaseStatus(
  offerDecision: DealOfferDecisionBrief,
  committee: DealInvestmentCommitteeBrief
): DealOfferReleasePackageBrief["status"] {
  if (offerDecision.status === "blocked" || committee.status === "blocked") {
    return "blocked";
  }
  if (offerDecision.status === "ready" && committee.status === "ready") {
    return "ready";
  }
  return "conditional";
}

function offerReleaseTone(status: DealOfferReleasePackageBrief["status"]): ReturnType<typeof scoreTone> {
  if (status === "ready") {
    return "good";
  }
  if (status === "conditional") {
    return "watch";
  }
  return "risk";
}

function offerReleaseLabel(status: DealOfferReleasePackageBrief["status"]): string {
  if (status === "ready") {
    return "Sendefertig";
  }
  if (status === "conditional") {
    return "Indikativ senden";
  }
  return "Nicht senden";
}

function offerReleaseHeadline(status: DealOfferReleasePackageBrief["status"]): string {
  if (status === "ready") {
    return "Angebotspaket sendefertig";
  }
  if (status === "conditional") {
    return "Nur indikatives Angebot mit Bedingungen";
  }
  return "Angebot gesperrt - nur Nachverhandlungsrahmen";
}

function offerReleaseInternalGuardrails(input: {
  committee: DealInvestmentCommitteeBrief;
  developmentPricing: DealDevelopmentPricingDisciplineBrief;
  evidence: DealEvidenceQualityBrief;
  offerBand: DealOfferBandBrief;
  openGates: number;
}): string[] {
  return uniqueItems([
    input.offerBand.walkAwayPrice !== null
      ? `Walk-away ${offerCurrencyText(input.offerBand.walkAwayPrice)} bleibt intern; nicht als Zielpreis an Makler oder Verkaeufer senden.`
      : "Walk-away fehlt; keine Preisindikation senden.",
    input.committee.stopRule,
    input.developmentPricing.priceRule,
    input.offerBand.gapToAskEur !== null && input.offerBand.gapToAskEur > 0
      ? `Preisabstand ${offerCurrencyText(input.offerBand.gapToAskEur)} als internen Nachverhandlungsbedarf fuehren.`
      : "Keinen zusaetzlichen Preisaufschlag ohne neue Belege zulassen.",
    `Beleg-Score ${input.evidence.percent} % und ${input.openGates} offene Gates vor Versand im Memo dokumentieren.`
  ].filter((item): item is string => Boolean(item))).slice(0, 6);
}

function offerReleaseExternalConditions(input: {
  documents: DueDiligenceDocumentSummary;
  offerBand: DealOfferBandBrief;
  status: DealOfferReleasePackageBrief["status"];
}): string[] {
  const firstLine =
    input.status === "ready"
      ? "Angebot vorbehaltlich finaler Finanzierung, Vertragspruefung und unveraenderter Unterlagenlage."
      : input.status === "conditional"
        ? "Nur indikative Preisindikation, bindend erst nach Finanzierung, Unterlagen und Objektpruefung."
        : "Nur unverbindliche Preisindikation, kein bindendes Angebot und kein Notartermin.";

  return uniqueItems([
    firstLine,
    "Vorbehaltlich vollstaendiger Due-Diligence-Unterlagen und fachlicher Pruefung.",
    "Vorbehaltlich Finanzierungszusage, Bankbewertung und finaler Kapitalstruktur.",
    input.offerBand.startOfferPrice !== null
      ? `Preisindikation startet bei ${offerCurrencyText(input.offerBand.startOfferPrice)} und ist bis zur Pruefung nicht bindend.`
      : "Preisindikation erst nach belastbarem Angebotsband nennen.",
    input.documents.missingLabels.length
      ? `Fehlende Unterlagen vor Bindung: ${input.documents.missingLabels.slice(0, 4).join(", ")}.`
    : "Unterlagenstand vor Vertragsentwurf final gegenpruefen."
  ]);
}

function brokerPriceCommunicationStatus(
  offerBand: DealOfferBandBrief,
  offerRelease: DealOfferReleasePackageBrief
): DealBrokerPriceCommunicationStatus {
  if (offerBand.status === "missing") {
    return "missing";
  }
  if (offerRelease.status === "ready") {
    return "sendable";
  }
  if (offerRelease.status === "conditional") {
    return "guarded";
  }
  return "blocked";
}

function brokerPriceCommunicationTone(status: DealBrokerPriceCommunicationStatus): ReturnType<typeof scoreTone> {
  if (status === "sendable") {
    return "good";
  }
  if (status === "guarded") {
    return "watch";
  }
  if (status === "blocked") {
    return "risk";
  }
  return "empty";
}

function brokerPriceCommunicationStatusLabel(status: DealBrokerPriceCommunicationStatus): string {
  if (status === "sendable") {
    return "Sendbar";
  }
  if (status === "guarded") {
    return "Nur indikativ";
  }
  if (status === "blocked") {
    return "Nicht senden";
  }
  return "Fehlt";
}

function brokerPriceExternalLine(
  offerBand: DealOfferBandBrief,
  status: DealBrokerPriceCommunicationStatus
): string {
  if (offerBand.askingPrice === null || offerBand.startOfferPrice === null) {
    return "Danke, wir koennen erst eine Preisindikation abgeben, wenn Kaufpreis, Finanzierung und Unterlagen belastbar vorliegen.";
  }

  if (status === "blocked") {
    return `Danke, wir pruefen das Objekt weiter. Beim aktuellen Preis ${offerCurrencyText(offerBand.askingPrice)} traegt der Case aktuell nicht; wir koennen nur eine unverbindliche Preisindikation ab ${offerCurrencyText(offerBand.startOfferPrice)} vorbehaltlich Unterlagen, Finanzierung und Objektpruefung testen.`;
  }
  if (status === "guarded") {
    return `Danke, wir bleiben interessiert. Wir koennen eine unverbindliche Preisindikation ab ${offerCurrencyText(offerBand.startOfferPrice)} pruefen; bindend wird das erst nach vollstaendigen Unterlagen, Finanzierung und Objektpruefung.`;
  }
  if (status === "sendable") {
    return `Danke, wir koennen eine Preisindikation ab ${offerCurrencyText(offerBand.startOfferPrice)} vorbereiten; finale Bindung bleibt vorbehaltlich Finanzierung, Vertragspruefung und unveraenderter Unterlagenlage.`;
  }
  return "Danke, wir koennen erst nach belastbarem Angebotsband und Unterlagenpruefung sinnvoll ueber eine Preisindikation sprechen.";
}

function brokerPriceCopyText(
  externalLine: string,
  documents: DueDiligenceDocumentSummary,
  offerRelease: DealOfferReleasePackageBrief
): string {
  const missingLine = documents.missingLabels.length
    ? `Vor einer Bindung benoetigen wir noch: ${documents.missingLabels.slice(0, 4).join(", ")}.`
    : "Der aktuelle Unterlagenstand wird vor Bindung final fachlich geprueft.";

  return [
    "Betreff: Unverbindliche Preisindikation",
    "",
    externalLine,
    missingLine,
    "Bitte lassen Sie uns die noch offenen Unterlagen und den zeitlichen Prozess abstimmen.",
    "",
    "Diese Nachricht ist keine Bindung und ersetzt keine finale Angebotsfreigabe."
  ].join("\n");
}

function brokerPriceInternalGuardrails(input: {
  developmentCommand: ObjectDevelopmentCommand;
  developmentPricing: DealDevelopmentPricingDisciplineBrief;
  locationDiscipline: DealLocationOfferDisciplineBrief;
  offerBand: DealOfferBandBrief;
  offerRelease: DealOfferReleasePackageBrief;
}): string[] {
  return uniqueItems([
    input.offerBand.walkAwayPrice !== null
      ? `Walk-away ${offerCurrencyText(input.offerBand.walkAwayPrice)} bleibt intern; nicht als Zielpreis an Makler oder Verkaeufer senden.`
      : "Walk-away fehlt; keine Preisindikation senden.",
    "Airbnb/Kurzzeitgaeste, Lage-Credit und Entwicklungspotential nicht als Preisargument senden.",
    `Entwicklungs-Kompass intern: ${input.developmentCommand.focusLever} in ${input.developmentCommand.objectArea}; ${input.developmentCommand.priceUse}`,
    `Entwicklung extern sperren: ${input.developmentCommand.openIssue}`,
    input.developmentPricing.priceRule,
    ...input.locationDiscipline.guardrails,
    ...input.offerRelease.internalGuardrails
  ]).slice(0, 9);
}

export function rankDealsByDecision(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => {
    const aBrief = dealDecisionBrief(a);
    const bBrief = dealDecisionBrief(b);
    const priorityDelta = decisionPriority(aBrief.decision) - decisionPriority(bBrief.decision);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (aBrief.decision === "reject" || aBrief.decision === "negotiate") {
      const aCashflow = numberValue(a.latest_underwriting?.monthly_cashflow_before_tax) ?? 0;
      const bCashflow = numberValue(b.latest_underwriting?.monthly_cashflow_before_tax) ?? 0;
      if (aCashflow !== bCashflow) {
        return aCashflow - bCashflow;
      }
    }

    const aScore = numberValue(a.latest_score?.total_score) ?? -1;
    const bScore = numberValue(b.latest_score?.total_score) ?? -1;
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    return a.title.localeCompare(b.title);
  });
}

export function dealDecisionCounts(deals: Deal[]): Record<DealDecisionBrief["decision"], number> {
  return deals.reduce(
    (acc, deal) => {
      acc[dealDecisionBrief(deal).decision] += 1;
      return acc;
    },
    { buy: 0, negotiate: 0, watch: 0, reject: 0 }
  );
}

export function locationPanelSummary(deal: Deal): { headline: string; detail: string } {
  if (deal.region) {
    return {
      headline: deal.region.name,
      detail: `${deal.region.recommendation}${deal.region.rent_factor ? ` (Markt-Faktor ~${deal.region.rent_factor})` : ""}`
    };
  }

  const place = [deal.listing?.city, deal.listing?.postal_code].filter(Boolean).join(" · ") || "Ort fehlt";
  const thesis = deal.region_outlook?.thesis ? ` ${deal.region_outlook.thesis}` : "";
  return {
    headline: place,
    detail: `Noch kein Standortdatensatz verknuepft.${thesis}`
  };
}

function developmentTargetRent(marketRent: number | null, legalTargetRent: number | null): number | null {
  if (marketRent !== null && legalTargetRent !== null) {
    return Math.min(marketRent, legalTargetRent);
  }
  return legalTargetRent ?? marketRent;
}

function developmentTargetRentSource(marketRent: number | null, legalTargetRent: number | null): string {
  if (marketRent !== null && legalTargetRent !== null && legalTargetRent < marketRent) {
    return "mietrechtlich plausible Zielmiete";
  }
  if (marketRent !== null) {
    return "Marktmiete";
  }
  if (legalTargetRent !== null) {
    return "mietrechtlich plausible Zielmiete";
  }
  return "Zielmiete fehlt";
}

function positiveScenarioValue(value: unknown, fallback: number | null): number | null {
  const parsed = numberValue(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
}

function nonNegativeScenarioValue(value: unknown, fallback: number | null): number | null {
  const parsed = numberValue(value);
  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function developmentNetValueAfterCapex(impliedValueUplift: number | null, capex: number | null): number | null {
  if (impliedValueUplift === null || capex === null) {
    return null;
  }
  return Math.round(impliedValueUplift - capex);
}

function developmentLevers(input: {
  capex: number | null;
  energyClass: string;
  hasCapexLever: boolean;
  hasConditionLever: boolean;
  hasRentValueLever: boolean;
  hasWeakEnergy: boolean;
  impliedValueUplift: number | null;
  monthlyRentUplift: number | null;
  targetRentSource: string;
}): string[] {
  const levers: string[] = [];

  if (input.hasRentValueLever && input.monthlyRentUplift !== null) {
    levers.push(
      `Miete: Zielmiete liegt grob ${formatCurrency(input.monthlyRentUplift)}/Monat ueber aktueller Kaltmiete (${input.targetRentSource}).`
    );
  }
  if (input.impliedValueUplift !== null) {
    levers.push(
      `Wert: Der Miethebel entspraeche bei 4,5 % Bewertungsrendite ca. ${formatCurrency(input.impliedValueUplift)} rechnerischem Werthebel.`
    );
  }
  if (input.hasCapexLever && input.capex !== null) {
    levers.push(
      `Sanierung: ${formatCurrency(input.capex)} initiales Capex-Budget kann Miete, Energieklasse und Verkaufbarkeit heben - Kosten sauber pruefen.`
    );
  }
  if (input.hasWeakEnergy) {
    levers.push(
      `Energie: Klasse ${input.energyClass} bietet moeglichen Modernisierungshebel, aber nur mit echtem Kosten- und Foerdercheck.`
    );
  }
  if (input.hasConditionLever) {
    levers.push("Zustand: Renovierungsbedarf kann ein Hebel sein, wenn Kaufpreis und Capex realistisch zusammenpassen.");
  }

  if (levers.length === 0) {
    levers.push("Kein belastbarer Miet-, Sanierungs- oder Energiehebel im aktuellen Datenstand.");
  }
  return uniqueItems(levers);
}

function developmentBlockers(input: {
  currentRent: number | null;
  deal: Deal;
  legalTargetRent: number | null;
  marketRent: number | null;
  monthlyRentUplift: number | null;
  targetRent: number | null;
}): string[] {
  const blockers: string[] = [];
  if (input.currentRent === null || input.targetRent === null) {
    blockers.push("Aktuelle Miete, Marktmiete oder mietrechtlicher Zielwert fehlen; Miethebel noch unsicher.");
  } else if (input.monthlyRentUplift === 0) {
    blockers.push("Aktuelle Miete liegt bereits nahe oder ueber Zielmiete; Miethebel nicht einpreisen.");
  }

  if (input.legalTargetRent !== null && input.marketRent !== null && input.legalTargetRent < input.marketRent) {
    blockers.push("Mietrecht: Marktmiete liegt ueber plausibler Zielmiete; nur rechtlich belegten Anteil rechnen.");
  }

  const geo = input.deal.geo_context;
  if (!geo) {
    blockers.push("Geo-/Baurecht-Kontext fehlt; Entwicklungspotential nicht als sichere These verwenden.");
  } else {
    if (geo.milieu_protection_area) {
      blockers.push("Milieuschutz: Modernisierung, Umwandlung oder Mietanpassung koennen genehmigungspflichtig oder begrenzt sein.");
    }
    if (geo.redevelopment_area) {
      blockers.push("Sanierungsgebiet: Baurechtliche Vorgaben und Genehmigungen vor Capex-Plan pruefen.");
    }
    if (geo.monument_protection) {
      blockers.push("Denkmalschutz: Sanierung, Energie und Grundrissveraenderungen koennen deutlich teurer oder begrenzt sein.");
    }
  }

  if (!input.deal.weg_health) {
    blockers.push("WEG-Check fehlt; Protokolle, Ruecklagen und Sonderumlagen koennen Sanierungshebel stark bremsen.");
  }
  return uniqueItems(blockers);
}

function developmentNextActions(input: {
  blockers: string[];
  hasCapexLever: boolean;
  hasConditionLever: boolean;
  hasRentValueLever: boolean;
  hasWeakEnergy: boolean;
}): string[] {
  const actions: string[] = [];
  const needsRentCheck =
    input.hasRentValueLever || input.blockers.some((blocker) => blocker.includes("Mietrecht") || blocker.includes("Miete"));
  const needsCapexCheck = input.hasCapexLever || input.hasConditionLever || input.hasWeakEnergy;

  if (needsRentCheck) {
    actions.push("Mietrecht und Vergleichsmiete pruefen: aktuelle Miete, Mietspiegel und Modernisierungsumlage sauber belegen.");
  }
  if (needsCapexCheck) {
    actions.push("Sanierungs-Capex mit Angeboten, Energieausweis und Foerderfaehigkeit absichern.");
  }
  if (input.blockers.some((blocker) => blocker.includes("WEG"))) {
    actions.push("WEG-Protokolle, Ruecklagenstand, Wirtschaftsplan und geplante Massnahmen vor Sanierungsannahme pruefen.");
  }
  if (
    input.blockers.some(
      (blocker) => blocker.includes("Geo") || blocker.includes("Milieuschutz") || blocker.includes("Sanierungsgebiet") || blocker.includes("Denkmalschutz")
    )
  ) {
    actions.push("Baurecht, Milieuschutz und Genehmigungslage klaeren, bevor Wertsteigerung eingepreist wird.");
  }
  if (input.hasRentValueLever || needsCapexCheck) {
    actions.push("Sanierungs- und Miethebel im Werthebel-Rechner mit konservativem Zielmiet- und Capex-Szenario simulieren.");
  }
  if (actions.length === 0) {
    actions.push("Erst aktuelle Miete, Marktmiete, Capex, Energieausweis, WEG und Geo-Kontext nachtragen.");
  }
  return uniqueItems(actions).slice(0, 5);
}

function developmentScenarios(input: {
  blockers: string[];
  capex: number | null;
  deal: Deal;
  hasCapexLever: boolean;
  hasConditionLever: boolean;
  hasWeakEnergy: boolean;
  impliedValueUplift: number | null;
  monthlyRentUplift: number | null;
  refinanceRoom: number | null;
  refiLtvPercent: number;
  valueYieldPercent: number;
}): ObjectDevelopmentScenario[] {
  const legalBlocker = input.blockers.find((blocker) => blocker.includes("Mietrecht") || blocker.includes("Milieuschutz"));
  const geoBlocker = input.blockers.find(
    (blocker) => blocker.includes("Geo") || blocker.includes("Milieuschutz") || blocker.includes("Sanierungsgebiet") || blocker.includes("Denkmalschutz")
  );
  const wegBlocker = input.blockers.find((blocker) => blocker.includes("WEG"));

  return [
    {
      key: "rent",
      label: "Mietanpassung",
      effect:
        input.monthlyRentUplift !== null
          ? `${formatCurrency(input.monthlyRentUplift)}/Monat zusaetzliche Kaltmiete`
          : "Mietziel fehlt",
      valueImpact:
        input.impliedValueUplift !== null
          ? `Rechnerischer Werthebel ${formatCurrency(input.impliedValueUplift)} bei ${formatNumber(input.valueYieldPercent, " %")}`
          : "Rechnerischer Werthebel fehlt",
      risk: legalBlocker || "Mietvertrag, Mietspiegel, Kappungsgrenze und Modernisierungsumlage pruefen.",
      nextCheck: "Mietspiegel, Mietvertrag und rechtlich plausible Zielmiete vor Gebot belegen.",
      tone: rentUpliftTone(input.monthlyRentUplift)
    },
    {
      key: "capex_energy",
      label: "Sanierung/Energie",
      effect:
        input.capex !== null
          ? `${formatCurrency(input.capex)} initiales Budget fuer Sanierung/Energie`
          : "Capex-Budget fehlt",
      valueImpact:
        input.hasCapexLever || input.hasWeakEnergy
          ? "Hebel nur nach Angeboten, Energieausweis und Foerdercheck einpreisen."
          : "Noch kein Sanierungs- oder Energiehebel belegt.",
      risk: geoBlocker || "Kosten, Bauzeit, Foerderung und Umlagefaehigkeit koennen den Hebel stark veraendern.",
      nextCheck: "Angebote, Energieausweis, Foerderfaehigkeit und Umlagefaehigkeit gegenpruefen.",
      tone: input.hasCapexLever || input.hasConditionLever || input.hasWeakEnergy ? "watch" : "empty"
    },
    {
      key: "weg_layout",
      label: "WEG/Grundriss",
      effect: input.hasConditionLever
        ? "Renovierungsbedarf kann Grundriss, Vermietbarkeit und Verkaufbarkeit heben."
        : "Grundriss- oder WEG-Hebel noch nicht belegt.",
      valueImpact: "Nicht als Werthebel rechnen, bevor Beschluesse, Teilungserklaerung und Protokolle klar sind.",
      risk: wegBlocker || "WEG-Beschluesse, Sonderumlagen und Gemeinschaftseigentum koennen den Plan begrenzen.",
      nextCheck: "WEG-Protokolle, Teilungserklaerung, Ruecklagen und genehmigungspflichtige Aenderungen pruefen.",
      tone: input.deal.weg_health ? "watch" : "risk"
    },
    {
      key: "refi",
      label: "Refi-Potential",
      effect:
        input.refinanceRoom !== null
          ? `${formatCurrency(input.refinanceRoom)} moeglicher Refi-Spielraum bei ${formatNumber(input.refiLtvPercent, " % LTV")}`
          : "Refi-Spielraum fehlt",
      valueImpact:
        input.refinanceRoom !== null
          ? `Refi-Potential ${formatCurrency(input.refinanceRoom)} nur nach Nachher-Wert und Banklogik`
          : "Refi-Potential fehlt",
      risk: "Bank bewertet konservativer als der Rechner; Nachher-Wert, DSCR und Beleihungsauslauf separat pruefen.",
      nextCheck: "Nachher-Miete, Nachher-Wert, Capex und Bank-LTV in einem konservativen Refi-Szenario rechnen.",
      tone: valueUpliftTone(input.refinanceRoom)
    }
  ];
}

function developmentLocationUseScenario(deal: Deal): ObjectDevelopmentScenario {
  const decision = microLocationDecisionBrief(deal);
  const location = deal.location || null;
  const inputs = evidenceInputsFromLocation(location);
  const score = numberValue(location?.micro_location_score);
  const transitScore = numberValue(location?.transit_access_score);
  const demandAnchorScore = numberValue(location?.demand_anchor_score);
  const leisureScore = numberValue(location?.leisure_quality_score);
  const shortTermScore = numberValue(location?.short_term_rental_score);
  const transitMeters = locationEvidenceValue(inputs, "nearest_rapid_transit_meters");
  const tradeFairMeters = locationEvidenceValue(inputs, "nearest_trade_fair_meters");
  const recreationMeters =
    locationEvidenceValue(inputs, "nearest_recreation_anchor_meters") ||
    locationEvidenceValue(inputs, "nearest_event_venue_meters");
  const occupancy = locationEvidenceValue(inputs, "short_term_rental_occupancy_percent");
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status");
  const effectParts: string[] = [];

  if (transitScore !== null && transitScore >= 75) {
    effectParts.push(`Bahnhof/U-Bahn stark${transitMeters ? ` (${formatDistanceMeters(transitMeters)})` : ""}`);
  } else if (transitMeters && closeDistanceTone(transitMeters, 800, 1600) === "good") {
    effectParts.push(`Bahnhof/U-Bahn nah (${formatDistanceMeters(transitMeters)})`);
  }

  if (demandAnchorScore !== null && demandAnchorScore >= 75) {
    effectParts.push(`Messe/Jobs/Uni/Klinik stark${tradeFairMeters ? ` (Messe ${formatDistanceMeters(tradeFairMeters)})` : ""}`);
  } else if (tradeFairMeters && closeDistanceTone(tradeFairMeters, 4000, 12000) === "good") {
    effectParts.push(`Messe gut erreichbar (${formatDistanceMeters(tradeFairMeters)})`);
  }

  if (leisureScore !== null && leisureScore >= 75) {
    effectParts.push(`Freizeitanker stark${recreationMeters ? ` (${formatDistanceMeters(recreationMeters)})` : ""}`);
  } else if (recreationMeters && closeDistanceTone(recreationMeters, 1500, 7000) === "good") {
    effectParts.push(`Freizeitanker nah (${formatDistanceMeters(recreationMeters)})`);
  }

  if ((shortTermScore !== null && shortTermScore >= 65) || occupancy) {
    const occupancyText = occupancy ? `${formatEvidencePercent(occupancy)} Auslastung` : "Tourismus-Nachfrage pruefbar";
    const legalText = legalStatus ? `, Recht ${formatLegalStatus(legalStatus)}` : "";
    effectParts.push(`Airbnb/Tourismus: ${occupancyText}${legalText}`);
  }

  const hasLegalAirbnbRisk =
    legalStatus === "restricted" || legalStatus === "unclear" || legalStatus === "prohibited";
  const hasUsefulEffect = effectParts.length > 0;
  const tone: ReturnType<typeof scoreTone> = !hasUsefulEffect
    ? "empty"
    : hasLegalAirbnbRisk
      ? "watch"
      : decision.tone;

  return {
    key: "location_use",
    label: "Lage/Nutzung",
    effect: hasUsefulEffect ? effectParts.join("; ") : "Mikrolage-, Freizeit- und Nutzungsdaten fehlen.",
    valueImpact: hasUsefulEffect
      ? "Stuetzt Zielgruppe, Vermietbarkeit, Leerstandsrisiko und Exit - aber nur als belegte Miet-/Nachfrageannahme rechnen."
      : "Ohne OePNV-, Nachfrageanker-, Freizeit- und Airbnb-Daten kein belastbarer Nutzungshebel.",
    risk:
      (hasLegalAirbnbRisk && "Airbnb/Zweckentfremdung ist eingeschraenkt, unklar oder verboten; nicht als Basisrechnung nutzen.") ||
      decision.risks[0] ||
      "Pendelzeiten, Laerm, echte Nachfrageanker und lokale Kurzzeitvermietungsregeln vor Gebot pruefen.",
    nextCheck:
      decision.nextChecks[0] ||
      "OePNV, Pendelzeiten, Messe-/Jobanker, Freizeitanker, Stoerquellen und Zweckentfremdungsrecht belegen.",
    tone
  };
}

function developmentLocationUseLevers(scenario: ObjectDevelopmentScenario): string[] {
  if (scenario.tone === "empty") {
    return [];
  }
  return [`Lage/Nutzung: ${scenario.effect}`];
}

function developmentLocationUseFact(scenario: ObjectDevelopmentScenario): {
  value: string;
  tone: ReturnType<typeof scoreTone>;
} {
  if (scenario.tone === "empty") {
    return { value: "Fehlt", tone: "empty" };
  }
  if (scenario.tone === "good") {
    return { value: "Starker Lage-/Nutzungshebel", tone: "good" };
  }
  if (scenario.tone === "risk") {
    return { value: "Nur als Risiko pruefen", tone: "risk" };
  }
  return { value: "Pruefbarer Lage-/Nutzungshebel", tone: "watch" };
}

function developmentPrioritizedLevers(
  scenarios: ObjectDevelopmentScenario[],
  values: {
    capex: number | null;
    hasCapexLever: boolean;
    hasConditionLever: boolean;
    hasWeakEnergy: boolean;
    impliedValueUplift: number | null;
    refinanceRoom: number | null;
  }
): ObjectDevelopmentPrioritizedLever[] {
  const raw = scenarios.map((scenario) => {
    const estimatedValueEur = developmentLeverEstimatedValue(scenario.key, values);
    const priorityScore = developmentLeverPriorityScore(scenario, estimatedValueEur, values);
    return {
      scenario,
      estimatedValueEur,
      priorityScore
    };
  });

  return raw
    .filter((item) => item.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((item, index) => ({
      rank: index + 1,
      key: item.scenario.key,
      label: item.scenario.label,
      where: developmentPotentialMapWhere(item.scenario.key),
      scoreLabel: developmentPriorityScoreLabel(index + 1, item.estimatedValueEur),
      estimatedValueEur: item.estimatedValueEur,
      reason: developmentPriorityReason(item.scenario),
      risk: item.scenario.risk,
      nextCheck: item.scenario.nextCheck,
      tone: item.scenario.tone
    }));
}

function developmentExecutionPlan(
  scenarios: ObjectDevelopmentScenario[],
  values: {
    blockers: string[];
    capex: number | null;
    monthlyRentUplift: number | null;
    refinanceRoom: number | null;
  }
): ObjectDevelopmentExecutionStep[] {
  const rentScenario = scenarios.find((scenario) => scenario.key === "rent");
  const capexScenario = scenarios.find((scenario) => scenario.key === "capex_energy");
  const refiScenario = scenarios.find((scenario) => scenario.key === "refi");
  const rentStopper = developmentFirstStopper(values.blockers, ["Mietrecht", "Miete", "Milieuschutz"]);
  const capexStopper = developmentFirstStopper(values.blockers, [
    "Milieuschutz",
    "Sanierungsgebiet",
    "Denkmalschutz",
    "WEG",
    "Geo"
  ]);

  return [
    {
      phase: "Belege sichern",
      title: "Miethebel belegbar machen",
      budget: "0 €",
      proof: rentScenario?.nextCheck || "Mietspiegel, Mietvertrag und rechtlich plausible Zielmiete belegen.",
      stopper: rentStopper || "Ohne Mietvertrag, Mietspiegel und rechtliche Zielmiete kein Miethebel im Memo.",
      priceRule: "Noch kein Kaufpreisaufschlag",
      tone: values.monthlyRentUplift !== null && values.monthlyRentUplift > 0 ? "watch" : "risk"
    },
    {
      phase: "Capex absichern",
      title: "Sanierung/Energie vor Kostenfalle schuetzen",
      budget: values.capex !== null ? formatCurrency(values.capex) : "Fehlt",
      proof: capexScenario?.nextCheck || "Angebote, Energieausweis, Foerderfaehigkeit und Umlagefaehigkeit pruefen.",
      stopper: capexStopper || "Ohne Angebote, WEG-Freigabe und Geo-/Baurechtscheck kein Capex-Preisbonus.",
      priceRule: "Capex erst nach Angeboten und Genehmigungen in Budget und Preis einrechnen.",
      tone: values.capex !== null && values.capex > 0 ? "watch" : "empty"
    },
    {
      phase: "Bank-Case rechnen",
      title: "Refi- und Exit-These bankfaehig machen",
      budget: "0 €",
      proof: refiScenario?.nextCheck || "Nachher-Wert, Nachher-Miete, Capex und Bank-LTV konservativ rechnen.",
      stopper: "Nachher-Wert, DSCR und Bankbewertung muessen bestaetigt sein, bevor Refi-Potential als Argument zaehlt.",
      priceRule: "Refi nicht als Kaufpreisaufschlag rechnen, bevor die Bank den Nachher-Wert bestaetigt.",
      tone: valueUpliftTone(values.refinanceRoom)
    }
  ];
}

function objectDevelopmentCommand(
  prioritizedLevers: ObjectDevelopmentPrioritizedLever[],
  proofGates: ObjectDevelopmentProofGate[],
  valueDecision: ObjectDevelopmentValueDecision
): ObjectDevelopmentCommand {
  const primaryLever = prioritizedLevers[0] || null;
  const primaryGate = primaryLever ? proofGates.find((gate) => gate.key === primaryLever.key) : null;
  const openGate =
    primaryGate && primaryGate.status !== "verified"
      ? primaryGate
      : proofGates.find((gate) => gate.status !== "verified") || null;
  const openIssue =
    openGate?.missingProofs[0] ||
    openGate?.nextAction ||
    valueDecision.nextAction ||
    "Keine harte Freigabe-Sperre im aktuellen Datenstand.";
  const focusLever = primaryLever?.label || "Daten nachtragen";
  const objectArea = primaryLever?.where || "Miete, Zustand, WEG, Geo und Mikrolage";
  const priceUse = objectDevelopmentCommandPriceUse(valueDecision);

  return {
    headline: primaryLever
      ? `Entwicklungs-Kompass: ${primaryLever.label} zuerst`
      : "Entwicklungs-Kompass: Daten zuerst nachtragen",
    tone: objectDevelopmentCommandTone(valueDecision, openGate, primaryLever),
    focusLever,
    objectArea,
    priceUse,
    openIssue,
    nextAction: openIssue,
    summary: `${focusLever} in ${objectArea}. ${priceUse}`
  };
}

function objectDevelopmentCommandPriceUse(valueDecision: ObjectDevelopmentValueDecision): string {
  if (valueDecision.priceableValueEur > 0 && valueDecision.memoOnlyValueEur > 0) {
    return `${formatCurrency(valueDecision.priceableValueEur)} pruefbar; ${formatCurrency(valueDecision.memoOnlyValueEur)} Memo-Upside getrennt halten.`;
  }
  if (valueDecision.priceableValueEur > 0) {
    return `${formatCurrency(valueDecision.priceableValueEur)} pruefbar; nur gedeckelt ins Preisband uebernehmen.`;
  }
  if (valueDecision.memoOnlyValueEur > 0) {
    return `${formatCurrency(0)} im Kaufpreis; ${formatCurrency(valueDecision.memoOnlyValueEur)} Memo-Upside bis Belege geschlossen sind.`;
  }
  if (valueDecision.blockedValueEur > 0) {
    return `${formatCurrency(0)} im Kaufpreis; ${formatCurrency(valueDecision.blockedValueEur)} Entwicklungswert blockiert.`;
  }
  return `${formatCurrency(0)} im Kaufpreis; Entwicklung erst nach Daten und Belegen neu rechnen.`;
}

function objectDevelopmentCommandTone(
  valueDecision: ObjectDevelopmentValueDecision,
  openGate: ObjectDevelopmentProofGate | null,
  primaryLever: ObjectDevelopmentPrioritizedLever | null
): ReturnType<typeof scoreTone> {
  if (!primaryLever) {
    return "empty";
  }
  if (valueDecision.priceableValueEur > 0) {
    return openGate ? "watch" : "good";
  }
  if (valueDecision.memoOnlyValueEur > 0) {
    return "watch";
  }
  if (valueDecision.blockedValueEur > 0) {
    return "risk";
  }
  return "empty";
}

type DevelopmentProofItem = {
  status: ObjectDevelopmentProofGateStatus;
  verifiedText: string;
  openText: string;
};

function developmentProofGates(
  deal: Deal,
  scenarios: ObjectDevelopmentScenario[],
  values: {
    capex: number | null;
    currentRent: number | null;
    legalTargetRent: number | null;
    scenarioTargetRent: number | null;
  }
): ObjectDevelopmentProofGate[] {
  return scenarios.map((scenario) => {
    const items = developmentProofItems(deal, scenario.key, values);
    return developmentProofGateFromItems(scenario, items);
  });
}

function developmentProofItems(
  deal: Deal,
  key: ObjectDevelopmentScenario["key"],
  values: {
    capex: number | null;
    currentRent: number | null;
    legalTargetRent: number | null;
    scenarioTargetRent: number | null;
  }
): DevelopmentProofItem[] {
  if (key === "rent") {
    return [
      {
        status: values.currentRent !== null ? "verified" : "missing",
        verifiedText: "Ist-Miete vorhanden.",
        openText: "Ist-Miete fehlt."
      },
      {
        status: values.legalTargetRent !== null && developmentDocumentStatus(deal, "rental_contract") === "verified"
          ? "verified"
          : values.scenarioTargetRent !== null || developmentDocumentStatus(deal, "rental_contract") !== "missing"
            ? "review"
            : "missing",
        verifiedText: "Mietvertrag und rechtlich plausible Zielmiete belegt.",
        openText: "Mietvertrag oder rechtlich plausible Zielmiete fehlt."
      },
      developmentRentMarketProof(deal)
    ];
  }

  if (key === "capex_energy") {
    return [
      {
        status: values.capex !== null && values.capex > 0 ? "verified" : "missing",
        verifiedText: "Sanierungsbudget vorhanden.",
        openText: "Sanierungsbudget fehlt."
      },
      developmentDocumentProof(deal, "energy_certificate", "Energieausweis"),
      developmentDocumentProof(deal, "renovation_offer", "Capex-Angebot/Leistungsbeschreibung"),
      developmentGeoProof(deal)
    ];
  }

  if (key === "weg_layout") {
    return [
      developmentWegProof(deal),
      developmentDocumentProof(deal, "declaration_of_division", "Teilungserklaerung"),
      developmentDocumentProof(deal, "weg_minutes", "WEG-Protokolle"),
      developmentDocumentProof(deal, "floor_plan", "Grundriss")
    ];
  }

  if (key === "refi") {
    const renovationCase = deal.latest_renovation_case?.results || null;
    const dscr = numberValue(deal.latest_underwriting?.dscr);
    return [
      {
        status: renovationCase ? "verified" : "missing",
        verifiedText: "Renovierungs-/Bank-Case gerechnet.",
        openText: "Renovierungs-/Bank-Case fehlt."
      },
      {
        status: dscr !== null && dscr >= 1.1 ? "verified" : dscr !== null ? "review" : "missing",
        verifiedText: "DSCR nach Underwriting tragfaehig.",
        openText: "DSCR oder Kapitaldienst muss fuer Refi bestaetigt werden."
      },
      {
        status:
          renovationCase && renovationCase.post_renovation_value > 0 && renovationCase.potential_equity_released >= 0
            ? "verified"
            : renovationCase
              ? "review"
              : "missing",
        verifiedText: "Nachher-Wert und Kapitalfreisetzung modelliert.",
        openText: "Nachher-Wert und Kapitalfreisetzung fehlen."
      }
    ];
  }

  return [
    developmentLocationScoreProof(deal),
    developmentLocationEvidenceProof(deal),
    developmentShortTermRentalProof(deal)
  ];
}

function developmentProofGateFromItems(
  scenario: ObjectDevelopmentScenario,
  items: DevelopmentProofItem[]
): ObjectDevelopmentProofGate {
  const provenBy = items.filter((item) => item.status === "verified").map((item) => item.verifiedText);
  const missingProofs = items.filter((item) => item.status !== "verified").map((item) => item.openText);
  const status: ObjectDevelopmentProofGateStatus =
    missingProofs.length === 0 ? "verified" : provenBy.length > 0 ? "review" : "missing";

  return {
    key: scenario.key,
    label: scenario.label,
    status,
    statusLabel: developmentProofStatusLabel(status),
    tone: developmentProofTone(status),
    priceRule: developmentProofPriceRule(status),
    provenBy,
    missingProofs,
    nextAction: status === "verified" ? scenario.nextCheck : missingProofs[0] || scenario.nextCheck
  };
}

function developmentDocumentProof(deal: Deal, documentType: string, label: string): DevelopmentProofItem {
  const status = developmentDocumentStatus(deal, documentType);
  return {
    status,
    verifiedText: `${label} geprueft.`,
    openText:
      status === "review"
        ? `${label} vorhanden, aber noch nicht geprueft.`
        : `${label} fehlt.`
  };
}

function developmentDocumentStatus(deal: Deal, documentType: string): ObjectDevelopmentProofGateStatus {
  const document = (deal.documents || []).find((item) => item.document_type === documentType);
  if (!document) {
    return "missing";
  }
  return document.review_status === "reviewed" || document.review_status === "approved" ? "verified" : "review";
}

function developmentRentMarketProof(deal: Deal): DevelopmentProofItem {
  const referenceRent = numberValue(deal.local_reference_rent_per_sqm);
  const marketPrice = numberValue(deal.market_price_per_sqm);
  const reviewedCompCount = comparableEvidenceDocuments(deal.documents || []).filter(
    (document) => document.review_status === "reviewed" || document.review_status === "approved"
  ).length;
  const hasMarketAnchors = referenceRent !== null && marketPrice !== null;
  const hasReviewedComps = reviewedCompCount >= 3;
  const status: ObjectDevelopmentProofGateStatus =
    hasMarketAnchors || hasReviewedComps
      ? "verified"
      : referenceRent !== null || marketPrice !== null || reviewedCompCount > 0
        ? "review"
        : "missing";

  return {
    status,
    verifiedText: hasReviewedComps
      ? "Mindestens 3 Vergleichsobjekte geprueft."
      : "Vergleichsmiete und Marktpreisanker vorhanden.",
    openText: "Vergleichsmieten oder Marktanker fehlen."
  };
}

function developmentWegProof(deal: Deal): DevelopmentProofItem {
  const result = deal.weg_health?.results || null;
  const completeness = numberValue(result?.data_completeness_percent);
  const score = numberValue(result?.total_score);
  const status: ObjectDevelopmentProofGateStatus =
    result && completeness !== null && completeness >= 70 && score !== null && score >= 60
      ? "verified"
      : result
        ? "review"
        : "missing";

  return {
    status,
    verifiedText: "WEG-Check mit Protokoll-/Ruecklagenlage belastbar.",
    openText: status === "review" ? "WEG-Check braucht fachliche Nachpruefung." : "WEG-Check fehlt."
  };
}

function developmentGeoProof(deal: Deal): DevelopmentProofItem {
  const geo = deal.geo_context || null;
  const confidence = numberValue(geo?.data_confidence_percent);
  const hasSpecialTopic = Boolean(geo?.milieu_protection_area || geo?.redevelopment_area || geo?.monument_protection);
  const status: ObjectDevelopmentProofGateStatus =
    geo && confidence !== null && confidence >= 70 && !hasSpecialTopic
      ? "verified"
      : geo
        ? "review"
        : "missing";

  return {
    status,
    verifiedText: "Geo-/Baurecht ohne harte Sonderbremse erfasst.",
    openText:
      status === "review"
        ? "Geo-/Baurecht hat Sonderthemen oder zu geringe Datenlage."
        : "Geo-/Baurecht-Kontext fehlt."
  };
}

function developmentLocationScoreProof(deal: Deal): DevelopmentProofItem {
  const score = numberValue(deal.location?.micro_location_score);
  const status: ObjectDevelopmentProofGateStatus =
    score !== null && score >= 75 ? "verified" : score !== null && score >= 60 ? "review" : "missing";

  return {
    status,
    verifiedText: "Mikrolage-Score stark genug belegt.",
    openText: score !== null ? "Mikrolage-Score nur gemischt." : "Mikrolage-Score fehlt."
  };
}

function developmentLocationEvidenceProof(deal: Deal): DevelopmentProofItem {
  const inputs = evidenceInputsFromLocation(deal.location);
  const completeness = numberValue(deal.location?.evidence_data_completeness_percent);
  const status: ObjectDevelopmentProofGateStatus =
    completeness !== null && completeness >= 70
      ? "verified"
      : inputs
        ? "review"
        : "missing";

  return {
    status,
    verifiedText: "Mikrolage-Belege mit hoher Datenlage vorhanden.",
    openText: inputs ? "Mikrolage-Belege sind unvollstaendig." : "Mikrolage-Belege fehlen."
  };
}

function developmentShortTermRentalProof(deal: Deal): DevelopmentProofItem {
  const inputs = evidenceInputsFromLocation(deal.location);
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status");
  const risky = legalStatus === "restricted" || legalStatus === "unclear" || legalStatus === "prohibited";
  const status: ObjectDevelopmentProofGateStatus = risky ? "review" : "verified";

  return {
    status,
    verifiedText: "Keine harte Kurzzeitvermietungsbremse in der Nutzungsannahme.",
    openText: "Kurzzeitvermietung rechtlich eingeschraenkt oder unklar; nur als Bonus notieren."
  };
}

function developmentProofStatusLabel(status: ObjectDevelopmentProofGateStatus): string {
  if (status === "verified") {
    return "Kaufpreisrelevant";
  }
  if (status === "review") {
    return "Memo-Upside";
  }
  return "Nicht belastbar";
}

function developmentProofTone(status: ObjectDevelopmentProofGateStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") {
    return "good";
  }
  if (status === "review") {
    return "watch";
  }
  return "risk";
}

function developmentProofPriceRule(status: ObjectDevelopmentProofGateStatus): string {
  if (status === "verified") {
    return "Kaufpreisrelevant: konservativ im Preisband und Memo nutzen, aber gedeckelt.";
  }
  if (status === "review") {
    return "Memo-Upside: Nicht in den Kaufpreis einrechnen, bis fehlende Belege vorliegen.";
  }
  return "Nicht belastbar: Erst Daten und Unterlagen nachtragen, dann Entwicklung neu rechnen.";
}

function developmentValueDecision(
  scenarios: ObjectDevelopmentScenario[],
  proofGates: ObjectDevelopmentProofGate[],
  values: {
    capex: number | null;
    impliedValueUplift: number | null;
    refinanceRoom: number | null;
  }
): ObjectDevelopmentValueDecision {
  const lanes = scenarios.map((scenario) => {
    const proofGate = proofGates.find((gate) => gate.key === scenario.key);
    const status = developmentValueLaneStatus(proofGate?.status || "missing");
    const estimatedValueEur = developmentLeverEstimatedValue(scenario.key, values);
    const numericValue = estimatedValueEur ?? 0;
    return {
      key: scenario.key,
      label: scenario.label,
      status,
      statusLabel: developmentValueLaneStatusLabel(status),
      tone: developmentValueLaneTone(status),
      estimatedValueEur,
      priceableValueEur: status === "priceable" ? numericValue : 0,
      memoOnlyValueEur: status === "memo" ? numericValue : 0,
      blockedValueEur: status === "blocked" ? numericValue : 0,
      rule: developmentValueLaneRule(status),
      nextAction: proofGate?.nextAction || scenario.nextCheck
    };
  });
  const priceableValueEur = lanes.reduce((sum, lane) => sum + lane.priceableValueEur, 0);
  const memoOnlyValueEur = lanes.reduce((sum, lane) => sum + lane.memoOnlyValueEur, 0);
  const blockedValueEur = lanes.reduce((sum, lane) => sum + lane.blockedValueEur, 0);
  const nextAction =
    lanes.find((lane) => lane.status === "memo")?.nextAction ||
    lanes.find((lane) => lane.status === "blocked")?.nextAction ||
    lanes.find((lane) => lane.status === "priceable")?.nextAction ||
    "Entwicklung nach neuen Unterlagen neu bewerten.";
  const tone: ReturnType<typeof scoreTone> =
    priceableValueEur > 0 && blockedValueEur === 0 ? "good" : priceableValueEur > 0 || memoOnlyValueEur > 0 ? "watch" : "risk";

  return {
    headline: developmentValueDecisionHeadline(priceableValueEur, memoOnlyValueEur),
    tone,
    summary: `${formatCurrency(priceableValueEur)} belegbar, ${formatCurrency(memoOnlyValueEur)} nur Memo-Upside, ${formatCurrency(blockedValueEur)} blockiert.`,
    priceableValueEur,
    memoOnlyValueEur,
    blockedValueEur,
    nextAction,
    facts: [
      {
        label: "Belegbar",
        value: formatCurrency(priceableValueEur),
        tone: priceableValueEur > 0 ? "good" : "empty"
      },
      {
        label: "Memo-Upside",
        value: formatCurrency(memoOnlyValueEur),
        tone: memoOnlyValueEur > 0 ? "watch" : "empty"
      },
      {
        label: "Blockiert",
        value: formatCurrency(blockedValueEur),
        tone: blockedValueEur > 0 ? "risk" : "good"
      }
    ],
    lanes
  };
}

function developmentValueLaneStatus(status: ObjectDevelopmentProofGateStatus): ObjectDevelopmentValueLaneStatus {
  if (status === "verified") {
    return "priceable";
  }
  if (status === "review") {
    return "memo";
  }
  return "blocked";
}

function developmentValueLaneStatusLabel(status: ObjectDevelopmentValueLaneStatus): string {
  if (status === "priceable") {
    return "Kaufpreisrelevant";
  }
  if (status === "memo") {
    return "Memo-Upside";
  }
  return "Blockiert";
}

function developmentValueLaneTone(status: ObjectDevelopmentValueLaneStatus): ReturnType<typeof scoreTone> {
  if (status === "priceable") {
    return "good";
  }
  if (status === "memo") {
    return "watch";
  }
  return "risk";
}

function developmentValueLaneRule(status: ObjectDevelopmentValueLaneStatus): string {
  if (status === "priceable") {
    return "Kann als belegter Werthebel ins Preisband, aber nur konservativ und gedeckelt.";
  }
  if (status === "memo") {
    return "Nur Memo-Upside; erst fehlende Belege schliessen, bevor der Kaufpreis steigt.";
  }
  return "Nicht verwerten; erst Daten, Unterlagen oder Genehmigungen nachtragen.";
}

function developmentValueDecisionHeadline(priceableValueEur: number, memoOnlyValueEur: number): string {
  if (priceableValueEur > 0) {
    return `${formatCurrency(priceableValueEur)} belegbarer Entwicklungswert`;
  }
  if (memoOnlyValueEur > 0) {
    return "Entwicklung bleibt vorerst Memo-Upside";
  }
  return "Entwicklung noch nicht preisreif";
}

function developmentFirstStopper(blockers: string[], keywords: string[]): string | null {
  return blockers.find((blocker) => keywords.some((keyword) => blocker.includes(keyword))) || null;
}

function developmentLeverEstimatedValue(
  key: ObjectDevelopmentScenario["key"],
  values: {
    capex: number | null;
    impliedValueUplift: number | null;
    refinanceRoom: number | null;
  }
): number | null {
  if (key === "rent") {
    return values.impliedValueUplift !== null ? Math.round(values.impliedValueUplift) : null;
  }
  if (key === "refi") {
    return values.refinanceRoom !== null ? Math.round(values.refinanceRoom) : null;
  }
  if (key === "capex_energy" && values.capex !== null) {
    return Math.round(values.capex);
  }
  return null;
}

function developmentLeverPriorityScore(
  scenario: ObjectDevelopmentScenario,
  estimatedValueEur: number | null,
  values: {
    hasCapexLever: boolean;
    hasConditionLever: boolean;
    hasWeakEnergy: boolean;
  }
): number {
  if (scenario.tone === "empty") {
    return 0;
  }
  if (scenario.key === "rent") {
    return estimatedValueEur !== null ? estimatedValueEur / 1000 : 0;
  }
  if (scenario.key === "refi") {
    return estimatedValueEur !== null ? estimatedValueEur / 1000 : 0;
  }
  if (scenario.key === "location_use") {
    if (scenario.tone === "good") {
      return 55;
    }
    if (scenario.tone === "watch") {
      return 38;
    }
    return 18;
  }
  if (scenario.key === "capex_energy") {
    if (values.hasCapexLever || values.hasWeakEnergy) {
      return 32;
    }
    return values.hasConditionLever ? 24 : 0;
  }
  if (scenario.key === "weg_layout") {
    return values.hasConditionLever ? 20 : 8;
  }
  return 0;
}

function developmentPriorityScoreLabel(rank: number, estimatedValueEur: number | null): string {
  if (rank === 1) {
    return "Groesster Werthebel";
  }
  if (rank === 2) {
    return estimatedValueEur !== null ? "Zweiter Euro-Hebel" : "Zweiter Hebel";
  }
  return estimatedValueEur !== null ? "Nachrangiger Euro-Hebel" : "Qualitativer Hebel";
}

function developmentPriorityReason(scenario: ObjectDevelopmentScenario): string {
  if (scenario.key === "location_use") {
    return `${scenario.effect}. ${scenario.valueImpact}`;
  }
  return scenario.valueImpact;
}

function locationEvidenceValue(inputs: LocationEvidenceInputs | null, key: string): number | string | null {
  const value = inputs?.[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function locationEvidenceText(inputs: LocationEvidenceInputs | null, key: string): string | null {
  const value = inputs?.[key];
  return typeof value === "string" ? value : null;
}

function developmentHeadline(hasRentValueLever: boolean, levers: string[], blockers: string[]): string {
  const hasUsefulLever = levers.some((lever) => !lever.startsWith("Kein belastbarer"));
  const hasLocationLever = levers.some((lever) => lever.startsWith("Lage/Nutzung"));
  if (hasRentValueLever && blockers.length > 0) {
    return "Miet- und Werthebel vorhanden, aber rechtlich pruefen";
  }
  if (hasRentValueLever) {
    return "Miet- und Werthebel als Hauptpotential";
  }
  if (hasUsefulLever) {
    if (hasLocationLever && levers.length === 1) {
      return "Lage- und Nutzungshebel pruefen";
    }
    return "Sanierungs- und Energiehebel pruefen";
  }
  if (blockers.length > 0) {
    return "Entwicklungspotential noch nicht belastbar";
  }
  return "Kaum Entwicklungspotential belegt";
}

function developmentTone(
  hasRentValueLever: boolean,
  levers: string[],
  blockers: string[],
  monthlyRentUplift: number | null
): ReturnType<typeof scoreTone> {
  const hasUsefulLever = levers.some((lever) => !lever.startsWith("Kein belastbarer"));
  if (hasRentValueLever && blockers.length === 0) {
    return "good";
  }
  if (hasRentValueLever || hasUsefulLever) {
    return "watch";
  }
  if (monthlyRentUplift === 0) {
    return "risk";
  }
  return "empty";
}

function developmentSummary(
  monthlyRentUplift: number | null,
  impliedValueUplift: number | null,
  netValueAfterCapex: number | null,
  blockers: string[]
): string {
  if (monthlyRentUplift !== null && impliedValueUplift !== null) {
    const netValueText =
      netValueAfterCapex !== null ? ` Netto bleiben ca. ${formatCurrency(netValueAfterCapex)} nach Capex.` : "";
    const caution = blockers.length
      ? " Die Hebel erst nach Mietrecht, WEG und Geo-Pruefung einpreisen."
      : " Die Hebel koennen im Sanierungsrechner vertieft werden.";
    return `Aktuell sind ca. ${formatCurrency(monthlyRentUplift)}/Monat Mietpotential und rund ${formatCurrency(impliedValueUplift)} rechnerischer Werthebel sichtbar.${netValueText}${caution}`;
  }
  if (monthlyRentUplift === 0) {
    return "Aktuell ist kein Miethebel belegt; Entwicklung waere nur ueber Sanierung, Energie, Grundriss oder Preisabschlag denkbar.";
  }
  return "Miet- und Werthebel sind noch nicht belastbar, weil aktuelle Miete, Zielmiete oder Capex-Daten fehlen.";
}

function netDevelopmentValueTone(netValueAfterCapex: number | null): ReturnType<typeof scoreTone> {
  if (netValueAfterCapex === null) {
    return "empty";
  }
  if (netValueAfterCapex >= 50000) {
    return "good";
  }
  if (netValueAfterCapex > 0) {
    return "watch";
  }
  return "risk";
}

function rentUpliftTone(monthlyRentUplift: number | null): ReturnType<typeof scoreTone> {
  if (monthlyRentUplift === null) {
    return "empty";
  }
  if (monthlyRentUplift >= 250) {
    return "good";
  }
  if (monthlyRentUplift >= 100) {
    return "watch";
  }
  return "risk";
}

function valueUpliftTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) {
    return "empty";
  }
  if (value >= 75000) {
    return "good";
  }
  if (value >= 25000) {
    return "watch";
  }
  return "risk";
}

function evidenceCoreDataRow(deal: Deal): DealEvidenceQualityRow {
  const listing = deal.listing || null;
  const missing = listing ? hasMissingCoreData(listing) : true;
  return evidenceQualityRow({
    key: "core_data",
    label: "Stammdaten",
    status: missing ? "missing" : "verified",
    summary: missing
      ? "Preis, Flaeche, Miete, Hausgeld, Energie oder Ort fehlen."
      : "Stammdaten fuer Preis, Flaeche, Miete, Hausgeld, Energie und Ort sind vorhanden.",
    action: "Listing-Stammdaten nachtragen: Kaufpreis, Flaeche, Miete, Hausgeld, Energieklasse und Ort."
  });
}

function evidenceUnderwritingRow(deal: Deal): DealEvidenceQualityRow {
  const uw = deal.latest_underwriting;
  const hasCoreUnderwriting =
    numberValue(uw?.monthly_cashflow_before_tax) !== null &&
    numberValue(uw?.dscr) !== null &&
    numberValue(uw?.all_in_purchase_price) !== null;
  return evidenceQualityRow({
    key: "underwriting",
    label: "Underwriting",
    status: hasCoreUnderwriting ? "verified" : "missing",
    summary: hasCoreUnderwriting
      ? "Underwriting ist gerechnet und hat Cashflow/DSCR."
      : "Underwriting fehlt oder hat keine Cashflow-/DSCR-Kernwerte.",
    action: "Underwriting rechnen und Cashflow, DSCR, All-in-Kaufpreis sowie Stresstest pruefen."
  });
}

function evidenceScoreRow(deal: Deal): DealEvidenceQualityRow {
  const score = numberValue(deal.latest_score?.total_score);
  return evidenceQualityRow({
    key: "score",
    label: "Score",
    status: score !== null ? "verified" : "missing",
    summary: score !== null ? `Deal-Score liegt vor: ${Math.round(score)}.` : "Deal-Score fehlt.",
    action: "Scoring starten, rote Flaggen erfassen und danach die Entscheidung neu bewerten."
  });
}

function evidenceRentLawRow(deal: Deal): DealEvidenceQualityRow {
  const targetRent = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const confidence = typeof deal.rent_law?.confidence === "string" ? deal.rent_law.confidence : null;
  let status: DealEvidenceQualityStatus = "missing";
  if (targetRent !== null && confidence === "high") {
    status = "verified";
  } else if (targetRent !== null) {
    status = "review";
  }

  return evidenceQualityRow({
    key: "rent_law",
    label: "Mietrecht",
    status,
    summary:
      targetRent !== null
        ? `Zielmiete ${formatNumber(targetRent, " EUR/m2")} mit Confidence ${confidence || "unbekannt"}.`
        : "Mietrechtliche Zielmiete fehlt.",
    action: "Mietrechtliche Zielmiete mit Mietspiegel, Kappungsgrenze, Mietpreisbremse und Mietvertrag belegen."
  });
}

function evidenceMicroLocationRow(deal: Deal): DealEvidenceQualityRow {
  const score = numberValue(deal.location?.micro_location_score);
  const completeness = numberValue(deal.location?.evidence_data_completeness_percent);
  const confidence = typeof deal.location?.evidence_confidence === "string" ? deal.location.evidence_confidence : null;
  let status: DealEvidenceQualityStatus = "missing";
  if (score !== null && completeness !== null && completeness >= 75 && confidence !== "low") {
    status = "verified";
  } else if (score !== null || completeness !== null) {
    status = "review";
  }

  const summaryParts = [
    score !== null ? `Score ${Math.round(score)}` : "Score fehlt",
    completeness !== null ? `${Math.round(completeness)} % Belege` : "Beleglage fehlt",
    `Vertrauen ${confidence || "unbekannt"}`
  ];

  return evidenceQualityRow({
    key: "micro_location",
    label: "Mikrolage",
    status,
    summary: `${summaryParts.join(", ")}.`,
    action: "Mikrolage-Belege fuer OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren ergaenzen."
  });
}

function evidenceDocumentRow(deal: Deal): DealEvidenceQualityRow {
  const summary = dueDiligenceDocumentSummary(deal);
  const status: DealEvidenceQualityStatus =
    summary.percent >= 80 && summary.missingLabels.length === 0
      ? "verified"
      : summary.percent >= 50
        ? "review"
        : "missing";
  const missingText = summary.missingLabels.length
    ? `${summary.missingLabels.length} Pflichtunterlagen fehlen.`
    : "Keine Pflichtunterlage fehlt.";
  const reviewCount = summary.rows.filter((row) => row.status === "review").length;
  const reviewText = reviewCount ? ` ${reviewCount} vorhandene Unterlage noch pruefen.` : "";

  return evidenceQualityRow({
    key: "documents",
    label: "Unterlagen",
    status,
    summary: `${missingText}${reviewText}`,
    action: summary.nextAction
  });
}

function evidenceWegRow(deal: Deal): DealEvidenceQualityRow {
  const result = deal.weg_health?.results || null;
  const completeness = numberValue(result?.data_completeness_percent);
  const score = numberValue(result?.total_score);
  let status: DealEvidenceQualityStatus = "missing";
  if (result && completeness !== null && completeness >= 70 && score !== null && score >= 60) {
    status = "verified";
  } else if (result) {
    status = "review";
  }

  return evidenceQualityRow({
    key: "weg",
    label: "WEG",
    status,
    summary: result
      ? `WEG-Check ist mit ${formatNumber(completeness, " %")} Datenlage erfasst.`
      : "WEG-Check fehlt.",
    action: "WEG-Protokolle, Ruecklagenstand, Wirtschaftsplan, Sonderumlagen und Verwalterqualitaet pruefen."
  });
}

function evidenceGeoRow(deal: Deal): DealEvidenceQualityRow {
  const geo = deal.geo_context || null;
  const confidence = numberValue(geo?.data_confidence_percent);
  let status: DealEvidenceQualityStatus = "missing";
  if (geo && confidence !== null && confidence >= 70) {
    status = "verified";
  } else if (geo) {
    status = "review";
  }

  return evidenceQualityRow({
    key: "geo",
    label: "Geo/Baurecht",
    status,
    summary: geo
      ? `Geo-/Baurecht-Kontext ist mit Datenlage ${formatNumber(confidence, " %")} erfasst.`
      : "Geo-/Baurecht-Kontext fehlt.",
    action: "B-Plan, Milieuschutz, Sanierungsgebiet, Denkmalschutz, Flurstueck und Bodenrichtwert pruefen."
  });
}

function evidenceQualityRow(input: {
  key: string;
  label: string;
  status: DealEvidenceQualityStatus;
  summary: string;
  action: string;
}): DealEvidenceQualityRow {
  return {
    key: input.key,
    label: input.label,
    status: input.status,
    statusLabel: evidenceQualityStatusLabel(input.status),
    tone: evidenceQualityStatusTone(input.status),
    summary: input.summary,
    action: input.action
  };
}

function evidenceQualityStatusLabel(status: DealEvidenceQualityStatus): string {
  if (status === "verified") {
    return "Belastbar";
  }
  if (status === "review") {
    return "Pruefen";
  }
  return "Fehlt";
}

function evidenceQualityStatusTone(status: DealEvidenceQualityStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") {
    return "good";
  }
  if (status === "review") {
    return "watch";
  }
  return "risk";
}

function evidenceQualityScore(status: DealEvidenceQualityStatus): number {
  if (status === "verified") {
    return 100;
  }
  if (status === "review") {
    return 60;
  }
  return 0;
}

function evidenceQualityHeadline(percent: number, rows: DealEvidenceQualityRow[]): string {
  const missingCount = rows.filter((row) => row.status === "missing").length;
  if (percent >= 90 && missingCount === 0) {
    return "Datenlage komitee-faehig";
  }
  if (percent >= 70) {
    return "Datenlage solide, aber nicht komitee-reif";
  }
  if (percent >= 50) {
    return "Datenlage noch nicht investment-komitee-reif";
  }
  return "Datenlage kritisch - erst Belege schliessen";
}

function evidenceQualityTone(percent: number, rows: DealEvidenceQualityRow[]): ReturnType<typeof scoreTone> {
  const missingCount = rows.filter((row) => row.status === "missing").length;
  if (percent >= 90 && missingCount === 0) {
    return "good";
  }
  if (percent >= 50) {
    return "watch";
  }
  return "risk";
}

function evidenceQualitySummaryTail(openCount: number): string {
  if (openCount === 0) {
    return "Alle Kernannahmen sind im aktuellen Datenstand belegt.";
  }
  return `${openCount} Beleggruppen brauchen noch Pruefung oder Nacharbeit.`;
}

function assumptionPurchasePriceRow(deal: Deal): DealAssumptionAuditRow {
  const price = numberValue(deal.listing?.purchase_price);
  return assumptionAuditRow({
    key: "purchase_price",
    label: "Kaufpreis",
    category: "Preis",
    currentValue: price !== null ? offerCurrencyText(price) : "Fehlt",
    status: price !== null ? "verified" : "missing",
    priceImpact: "Preisrelevant",
    action: "Kaufpreis aus Expose, Portal und Maklerkommunikation gegenpruefen."
  });
}

function assumptionRentLawRow(deal: Deal): DealAssumptionAuditRow {
  const rent = numberValue(deal.listing?.cold_rent_monthly);
  const targetRent = numberValue(deal.rent_law?.legally_plausible_target_rent_per_sqm);
  const rentContractReviewed = Boolean(
    deal.documents?.some(
      (document) => document.document_type === "rental_contract" && document.review_status === "reviewed"
    )
  );
  const status: DealAssumptionAuditStatus =
    rent === null
      ? "missing"
      : targetRent !== null && rentContractReviewed
        ? "verified"
        : "review";

  return assumptionAuditRow({
    key: "rent_law",
    label: "Miete/Mietrecht",
    category: "Ertrag",
    currentValue: rent !== null ? `${offerCurrencyText(rent)}/Monat` : "Fehlt",
    status,
    priceImpact: "Preisrelevant",
    action: "Mietvertrag, Mietspiegel, Mietpreisbremse und rechtlich plausible Zielmiete pruefen."
  });
}

function assumptionFinancingRow(deal: Deal): DealAssumptionAuditRow {
  const dscr = numberValue(deal.latest_underwriting?.dscr);
  const stressedDscr = numberValue(deal.latest_underwriting?.stressed_dscr);
  const cashflow = numberValue(deal.latest_underwriting?.monthly_cashflow_before_tax);
  const status: DealAssumptionAuditStatus =
    dscr === null || cashflow === null
      ? "missing"
      : dscr >= 1.1 && cashflow >= 0 && stressedDscr !== null
        ? "verified"
        : "review";

  return assumptionAuditRow({
    key: "financing",
    label: "Finanzierung",
    category: "Kapitaldienst",
    currentValue: dscr !== null ? `DSCR ${formatNumber(dscr)}` : "Fehlt",
    status,
    priceImpact: "Preisrelevant",
    action: "Finanzierung, Stresstest, DSCR und Cashflow-Anker mit Bankannahmen validieren."
  });
}

function assumptionMicroLocationRow(deal: Deal): DealAssumptionAuditRow {
  const score = numberValue(deal.location?.micro_location_score);
  const completeness = numberValue(deal.location?.evidence_data_completeness_percent);
  const confidence = typeof deal.location?.evidence_confidence === "string" ? deal.location.evidence_confidence : null;
  const status: DealAssumptionAuditStatus =
    score === null
      ? "missing"
      : completeness !== null && completeness >= 75 && confidence !== "low"
        ? "verified"
        : "review";

  return assumptionAuditRow({
    key: "micro_location",
    label: "Mikrolage",
    category: "Lage",
    currentValue:
      score !== null
        ? `${Math.round(score)} · ${completeness !== null ? `${Math.round(completeness)} % Belege` : "Belege fehlen"}`
        : "Fehlt",
    status,
    priceImpact: "Preisrelevant",
    action:
      "Mikrolage-Belege fuer OePNV, Bahnhof/U-Bahn, Alltag, Messe-/Business-Nachfrage, Freizeitangebote/Freizeitpark, Airbnb-Auslastung und Stoerfaktoren ergaenzen."
  });
}

function assumptionDevelopmentRow(deal: Deal): DealAssumptionAuditRow {
  const development = dealDevelopmentPricingDisciplineBrief(deal);
  const hasVisibleDevelopment =
    development.visibleValueUpliftEur !== null ||
    development.equityReleaseEur !== null ||
    numberValue(deal.listing?.expected_initial_capex) !== null ||
    numberValue(deal.listing?.market_rent_estimate_monthly) !== null;
  const status: DealAssumptionAuditStatus =
    development.allowedCreditEur > 0
      ? "verified"
      : hasVisibleDevelopment
        ? "review"
        : "verified";

  return assumptionAuditRow({
    key: "development",
    label: "Entwicklung/Capex",
    category: "Upside",
    currentValue:
      development.visibleValueUpliftEur !== null
        ? `${offerCurrencyText(development.visibleValueUpliftEur)} Werthebel`
        : hasVisibleDevelopment
          ? "Szenario offen"
          : "Keine aktive Upside",
    status,
    priceImpact: "Preisrelevant",
    action: "Capex-Angebote, Miethebel, WEG-Freigabe, Geo-Kontext und Bank-Case vor Preisaufschlag belegen."
  });
}

function assumptionDocumentsRow(deal: Deal): DealAssumptionAuditRow {
  const documents = dueDiligenceDocumentSummary(deal);
  const status: DealAssumptionAuditStatus =
    documents.percent >= 90 && documents.missingLabels.length === 0
      ? "verified"
      : documents.percent >= 50
        ? "review"
        : "missing";

  return assumptionAuditRow({
    key: "documents",
    label: "Unterlagen",
    category: "Diligence",
    currentValue: documents.headline,
    status,
    priceImpact: "Preisrelevant",
    action: documents.requestPack.nextAction
  });
}

function assumptionWegGeoRow(deal: Deal): DealAssumptionAuditRow {
  const wegScore = numberValue(deal.weg_health?.results?.total_score);
  const geoConfidence = numberValue(deal.geo_context?.data_confidence_percent);
  const hasWeg = Boolean(deal.weg_health);
  const hasGeo = Boolean(deal.geo_context);
  const status: DealAssumptionAuditStatus =
    hasWeg && hasGeo && (wegScore === null || wegScore >= 60) && (geoConfidence === null || geoConfidence >= 70)
      ? "verified"
      : hasWeg || hasGeo
        ? "review"
        : "missing";

  return assumptionAuditRow({
    key: "weg_geo",
    label: "WEG/Geo",
    category: "Objekt",
    currentValue: `${hasWeg ? "WEG vorhanden" : "WEG fehlt"} · ${hasGeo ? "Geo vorhanden" : "Geo fehlt"}`,
    status,
    priceImpact: "Preisrelevant",
    action: "WEG-Protokolle, Ruecklagen, Sonderumlagen, B-Plan, Milieuschutz, Denkmalschutz und Bodenrichtwert pruefen."
  });
}

function assumptionTaxRow(deal: Deal): DealAssumptionAuditRow {
  const hasTax = Boolean(deal.tax);
  return assumptionAuditRow({
    key: "tax",
    label: "Steuer",
    category: "GmbH",
    currentValue: hasTax ? "GmbH-Annahmen vorhanden" : "Fehlt",
    status: hasTax ? "review" : "missing",
    priceImpact: "Memo/Steuer",
    action: "Steuerberater-Fragen fuer AfA, erweiterte Kuerzung, Zinsen und GrESt im Memo dokumentieren."
  });
}

function assumptionAuditRow(input: {
  key: string;
  label: string;
  category: string;
  currentValue: string;
  status: DealAssumptionAuditStatus;
  priceImpact: DealAssumptionAuditRow["priceImpact"];
  action: string;
}): DealAssumptionAuditRow {
  return {
    key: input.key,
    label: input.label,
    category: input.category,
    currentValue: input.currentValue,
    status: input.status,
    statusLabel: assumptionStatusLabel(input.status),
    tone: assumptionStatusTone(input.status),
    priceImpact: input.priceImpact,
    action: input.action
  };
}

function assumptionStatusLabel(status: DealAssumptionAuditStatus): string {
  if (status === "verified") return "Belegt";
  if (status === "review") return "Pruefen";
  return "Fehlt";
}

function assumptionStatusTone(status: DealAssumptionAuditStatus): ReturnType<typeof scoreTone> {
  if (status === "verified") return "good";
  if (status === "review") return "watch";
  return "risk";
}

function assumptionStatusScore(status: DealAssumptionAuditStatus): number {
  if (status === "verified") return 100;
  if (status === "review") return 50;
  return 0;
}

function assumptionAuditHeadline(openPriceCriticalCount: number, rows: DealAssumptionAuditRow[]): string {
  if (openPriceCriticalCount > 0) {
    return "Annahmen noch nicht angebotsreif";
  }
  if (rows.some((row) => row.status !== "verified")) {
    return "Annahmen pruefen vor Angebot";
  }
  return "Annahmen tragfaehig dokumentiert";
}

function assumptionAuditTone(openPriceCriticalCount: number, rows: DealAssumptionAuditRow[]): ReturnType<typeof scoreTone> {
  if (openPriceCriticalCount > 0) {
    return "risk";
  }
  if (rows.some((row) => row.status !== "verified")) {
    return "watch";
  }
  return "good";
}

function exitLiquidityScore(input: {
  cashflow: number | null;
  demandScore: number | null;
  documentPercent: number;
  dscr: number | null;
  geoConfidence: number | null;
  hasGeoCheck: boolean;
  hasGeoSpecialTopic: boolean;
  hasWegCheck: boolean;
  leisureScore: number | null;
  microScore: number | null;
  nuisanceScore: number | null;
  regionScore: number | null;
  transitScore: number | null;
  yieldPercent: number | null;
}): number {
  let score = 50;
  if (input.regionScore !== null) score += input.regionScore >= 80 ? 10 : input.regionScore >= 70 ? 6 : -6;
  if (input.microScore !== null) score += input.microScore >= 80 ? 10 : input.microScore >= 65 ? 5 : -6;
  if (input.transitScore !== null && input.transitScore >= 80) score += 6;
  if (input.demandScore !== null && input.demandScore >= 80) score += 6;
  if (input.leisureScore !== null && input.leisureScore >= 75) score += 4;
  if (input.yieldPercent !== null) score += input.yieldPercent >= 4 ? 5 : input.yieldPercent >= 3.5 ? 3 : -5;
  if (input.dscr !== null) score += input.dscr >= 1.1 ? 5 : input.dscr < 1 ? -8 : 0;
  if (input.cashflow !== null && input.cashflow < 0) score -= 5;
  if (!input.hasWegCheck) score -= 8;
  if (!input.hasGeoCheck || input.hasGeoSpecialTopic || (input.geoConfidence !== null && input.geoConfidence < 70)) score -= 8;
  if (input.documentPercent < 50) score -= 5;
  if (input.nuisanceScore !== null && input.nuisanceScore < 60) score -= 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function exitLiquidityTone(score: number): ReturnType<typeof scoreTone> {
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "risk";
}

function exitLiquidityLabel(score: number): string {
  if (score >= 75) return "Breiter Kaeuferpool";
  if (score >= 60) return "Selektiver Kaeuferpool";
  return "Enger Kaeuferkreis";
}

function exitLiquidityDiscount(score: number): number {
  if (score >= 75) return 3;
  if (score >= 60) return 6;
  return 10;
}

function exitLiquidityHeadline(score: number, risks: string[]): string {
  if (score >= 75 && risks.length <= 1) return "Exit-Liquiditaet stark";
  if (score >= 60) return "Exit solide, aber belegabhaengig";
  return "Exit-Liquiditaet noch nicht belegreif";
}

function exitLiquiditySummary(score: number, liquidityLabel: string, riskCount: number): string {
  if (score >= 75) {
    return `${liquidityLabel}: Lage, Nachfrage und Beleglage stuetzen einen spaeteren Verkauf. ${riskCount} Exit-Themen bleiben zu pruefen.`;
  }
  if (score >= 60) {
    return `${liquidityLabel}: Der Wiederverkauf ist plausibel, aber nur mit geschlossenen Objekt-, Finanzierungs- und Lagebelegen sauber argumentierbar.`;
  }
  return `${liquidityLabel}: Vor einem Gebot braucht der Deal eine klare Exit-These, Zielkaeufer und belegte Risikoabschlaege.`;
}

function exitBuyerLanes(
  deal: Deal,
  input: {
    cashflow: number | null;
    demandScore: number | null;
    documentPercent: number;
    dscr: number | null;
    hasGeoSpecialTopic: boolean;
    hasWegCheck: boolean;
    leisureScore: number | null;
    microScore: number | null;
    regionScore: number | null;
    transitScore: number | null;
    yieldPercent: number | null;
  }
): DealExitLiquidityBuyerLane[] {
  const inputs = evidenceInputsFromLocation(deal.location);
  const legalStatus = locationEvidenceText(inputs, "short_term_rental_legal_status");
  const ownerOccupierStatus: DealExitLiquidityBuyerStatus =
    input.microScore !== null && input.microScore >= 75 && input.transitScore !== null && input.transitScore >= 75
      ? "strong"
      : input.microScore !== null && input.microScore >= 60
        ? "selective"
        : "blocked";
  const investorStatus: DealExitLiquidityBuyerStatus =
    input.dscr !== null && input.dscr >= 1.1 && input.cashflow !== null && input.cashflow >= 0
      ? "strong"
      : input.yieldPercent !== null && input.yieldPercent >= 3.8
        ? "selective"
        : "blocked";
  const portfolioStatus: DealExitLiquidityBuyerStatus =
    input.regionScore !== null && input.regionScore >= 80 && input.documentPercent >= 70 && input.hasWegCheck && !input.hasGeoSpecialTopic
      ? "strong"
      : input.regionScore !== null && input.regionScore >= 70
        ? "selective"
        : "blocked";
  const shortTermStatus: DealExitLiquidityBuyerStatus =
    legalStatus === "allowed"
      ? "selective"
      : legalStatus === "restricted" || legalStatus === "unclear" || legalStatus === "prohibited"
        ? "blocked"
        : "selective";

  return [
    exitBuyerLane({
      label: "Eigennutzer",
      status: ownerOccupierStatus,
      reason:
        ownerOccupierStatus === "strong"
          ? "Mikrolage und Verkehrsanbindung stuetzen einen breiten Eigennutzer-Exit."
          : "Eigennutzer-Exit braucht bessere Lage-, Grundriss- und Objektbelege.",
      nextCheck: "Grundriss, Zustand, Hausgeld, Laerm und WEG-Beschluesse fuer Eigennutzer pruefen."
    }),
    exitBuyerLane({
      label: "Kapitalanleger",
      status: investorStatus,
      reason:
        investorStatus === "strong"
          ? "Cashflow und Kapitaldienst sind fuer Anleger anschlussfaehig."
          : "Rendite ist sichtbar, aber Cashflow oder DSCR begrenzen den Anlegerpreis.",
      nextCheck: "Exit-Cashflow, Zielmiete, DSCR und Renditeabschlag fuer Kapitalanleger rechnen."
    }),
    exitBuyerLane({
      label: "Portfolio-/GmbH-Kaeufer",
      status: portfolioStatus,
      reason:
        portfolioStatus === "strong"
          ? "Region, Unterlagen, WEG und Geo-Kontext sind fuer Portfolio-Kaeufer gut belegbar."
          : "Portfolio-Kaeufer verlangen saubere Unterlagen, WEG, Geo/Baurecht und Portfolio-Story.",
      nextCheck: "Portfolio-Exit im Memo mit Unterlagenstatus, WEG, Geo/Baurecht und 20-Jahre-These belegen."
    }),
    exitBuyerLane({
      label: "Kurzzeit-/Moebliert-These",
      status: shortTermStatus,
      reason:
        shortTermStatus === "blocked"
          ? "Kurzzeitvermietung ist rechtlich eingeschraenkt oder unklar; nicht als Exit-Kaeuferbasis rechnen."
          : "Kurzzeit- oder moeblierte Nutzung bleibt nur Zusatzthese, nicht Basis-Exit.",
      nextCheck: "Airbnb-/Zweckentfremdungsrecht, Auslastung, Moeblierungsnachfrage und Betreiberannahmen pruefen."
    })
  ];
}

function exitBuyerLane(input: {
  label: string;
  status: DealExitLiquidityBuyerStatus;
  reason: string;
  nextCheck: string;
}): DealExitLiquidityBuyerLane {
  return {
    label: input.label,
    status: input.status,
    statusLabel: exitBuyerStatusLabel(input.status),
    tone: exitBuyerTone(input.status),
    reason: input.reason,
    nextCheck: input.nextCheck
  };
}

function exitBuyerStatusLabel(status: DealExitLiquidityBuyerStatus): string {
  if (status === "strong") return "Breit";
  if (status === "selective") return "Selektiv";
  return "Blockiert";
}

function exitBuyerTone(status: DealExitLiquidityBuyerStatus): ReturnType<typeof scoreTone> {
  if (status === "strong") return "good";
  if (status === "selective") return "watch";
  return "risk";
}

function exitLiquidityRisks(input: {
  cashflow: number | null;
  documentPercent: number;
  dscr: number | null;
  evidenceCompleteness: number | null;
  evidenceConfidence: string | null;
  geoConfidence: number | null;
  hasGeoCheck: boolean;
  hasGeoSpecialTopic: boolean;
  hasWegCheck: boolean;
  nuisanceScore: number | null;
}): string[] {
  const risks: string[] = [];
  if ((input.dscr !== null && input.dscr < 1) || (input.cashflow !== null && input.cashflow < 0)) {
    risks.push("Cashflow oder DSCR schwach: Kapitalanleger zahlen nur mit Abschlag.");
  }
  if (!input.hasWegCheck) {
    risks.push("WEG-Check fehlt: Eigennutzer und Banken verlangen mehr Sicherheit.");
  }
  if (!input.hasGeoCheck || input.hasGeoSpecialTopic || (input.geoConfidence !== null && input.geoConfidence < 70)) {
    risks.push("Geo-/Baurecht hat Sonderthemen oder geringe Datenlage.");
  }
  if (input.evidenceCompleteness === null || input.evidenceCompleteness < 70 || input.evidenceConfidence === "low") {
    risks.push("Mikrolage-Belege unvollstaendig: Nachfrageannahme im Exit noch weich.");
  }
  if (input.documentPercent < 50) {
    risks.push("Unterlagenquote niedrig: Kaeufer und Banken werden Risikoabschlag verlangen.");
  }
  if (input.nuisanceScore !== null && input.nuisanceScore < 60) {
    risks.push("Stoerfaktoren auffaellig: Laerm, Strasse oder Umfeld koennen den Exit-Preis druecken.");
  }
  return uniqueItems(risks);
}

function exitRiskNextAction(risk: string): string {
  if (risk.includes("Cashflow") || risk.includes("DSCR")) {
    return "Exit-Rendite mit konservativem Kapitalanleger-Abschlag und Zielmiete nachrechnen.";
  }
  if (risk.includes("WEG")) {
    return "WEG-Protokolle, Ruecklagen, Sonderumlagen und Beschlusslage vor Exit-These pruefen.";
  }
  if (risk.includes("Geo")) {
    return "B-Plan, Milieuschutz, Sanierungsgebiet, Denkmalschutz und Bodenrichtwert fuer Exit-Risiko klaeren.";
  }
  if (risk.includes("Mikrolage")) {
    return "Mikrolage-Belege fuer OePNV, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren vervollstaendigen.";
  }
  if (risk.includes("Unterlagen")) {
    return "Fehlende Unterlagen anfordern, damit der Exit-Abschlag nicht nur geschaetzt bleibt.";
  }
  return "Exit-Risiko im Memo mit Beleg, Preiswirkung und naechstem Check dokumentieren.";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coordinateNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readableLocationSource(source: string): string {
  if (source.includes("openstreetmap") || source.includes("overpass")) {
    return "OSM/Overpass";
  }
  if (source === "manual_site_research") {
    return "Manuelle Recherche";
  }
  if (source === "manual") {
    return "Manuell";
  }
  return source.replaceAll("_", " ");
}

function roundDownTo500(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value / 500) * 500;
}

function roundUpTo500(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.ceil(value / 500) * 500;
}

function offerBandDevelopmentCredit(deal: Deal): { value: number; reason: string; warnings: string[] } {
  const result = deal.latest_renovation_case?.results;
  if (!result) {
    return {
      value: 0,
      reason: "Kein gespeicherter Sanierungs-/Refi-Case; Entwicklung wird nicht in den Kaufpreis eingerechnet.",
      warnings: []
    };
  }

  const release = numberValue(result.potential_equity_released) ?? 0;
  const capex = numberValue(result.planned_capex) ?? 0;
  const hasObjectChecks = Boolean(deal.weg_health && deal.geo_context);
  const recommendation = result.recommendation;

  if (!hasObjectChecks || recommendation === "weak_value_add" || release <= 0 || capex <= 0) {
    return {
      value: 0,
      reason: "Entwicklungshebel bleibt Upside-Notiz und wird nicht in den Walk-away eingepreist.",
      warnings: ["Entwicklungspotential erst nach WEG-, Geo- und Capex-Belegen in den Kaufpreis einrechnen."]
    };
  }

  const share = recommendation === "strong_value_add" ? 0.5 : 0.25;
  const cappedCredit = roundDownTo500(Math.min(release * share, capex * 0.5));
  if (cappedCredit <= 0) {
    return {
      value: 0,
      reason: "Sanierungs-/Refi-Case erzeugt keinen konservativ nutzbaren Angebotsbonus.",
      warnings: ["Entwicklungspotential nicht in den Kaufpreis einrechnen, solange Kapitalfreisetzung oder Capex nicht tragen."]
    };
  }

  return {
    value: cappedCredit,
    reason: `Entwicklungsbonus konservativ angesetzt: ${offerCurrencyText(cappedCredit)} von ${offerCurrencyText(release)} moeglicher Kapitalfreisetzung.`,
    warnings: []
  };
}

function developmentPricingHeadline(status: DealDevelopmentPricingDisciplineBrief["status"]): string {
  if (status === "priced") {
    return "Entwicklungsbonus gedeckelt einpreisbar";
  }
  if (status === "conditional") {
    return "Entwicklung nur als Memo-Upside";
  }
  return "Entwicklung nicht preiswirksam";
}

function developmentPricingRule(
  status: DealDevelopmentPricingDisciplineBrief["status"],
  allowedCredit: number
): string {
  if (status === "priced") {
    return `Max. ${offerCurrencyText(allowedCredit)} Entwicklungsbonus im Walk-away.`;
  }
  if (status === "conditional") {
    return "0 € im Walk-away, bis WEG, Geo, Capex und Bank-Case belegt sind.";
  }
  return "0 € im Walk-away; Entwicklung erst nach belastbarem Sanierungs-/Bank-Case pruefen.";
}

function developmentPricingBlockers(input: {
  capex: number | null;
  equityRelease: number | null;
  hasGeoCheck: boolean;
  hasRenovationCase: boolean;
  hasWegCheck: boolean;
  recommendation: string | null;
}): string[] {
  const blockers: string[] = [];

  if (!input.hasRenovationCase) {
    blockers.push("Kein gespeicherter Bank-/Sanierungs-Case; Entwicklung bleibt ausserhalb des Walk-away.");
  }
  if (!input.hasWegCheck && !input.hasGeoCheck) {
    blockers.push("WEG- und Geo-Check fehlen; Entwicklung bleibt ausserhalb des Walk-away.");
  } else {
    if (!input.hasWegCheck) {
      blockers.push("WEG-Check fehlt; Sanierung, Sonderumlagen und Beschluesse koennen den Werthebel bremsen.");
    }
    if (!input.hasGeoCheck) {
      blockers.push("Geo-/Baurecht-Check fehlt; Milieuschutz, Denkmalschutz oder Sanierungsgebiet koennen den Werthebel bremsen.");
    }
  }
  if (input.recommendation === "weak_value_add") {
    blockers.push("Backend-Case ist schwach; kein Entwicklungsbonus in den Kaufpreis.");
  }
  if (input.equityRelease === null || input.equityRelease <= 0) {
    blockers.push("Kapitalfreisetzung fehlt oder ist negativ; kein Entwicklungsbonus in den Kaufpreis.");
  }
  if (input.capex === null || input.capex <= 0) {
    blockers.push("Capex-Budget fehlt; Entwicklungshebel nicht preiswirksam nutzen.");
  }

  return uniqueItems(blockers);
}

function developmentPricingMemoItems(
  status: DealDevelopmentPricingDisciplineBrief["status"],
  values: {
    allowedCredit: number;
    equityRelease: number | null;
    visibleValueUplift: number | null;
  }
): string[] {
  if (status === "priced") {
    return [
      `Credit-Cap dokumentieren: ${offerCurrencyText(values.allowedCredit)} von ${offerCurrencyText(values.equityRelease ?? 0)} Kapitalfreisetzung; nicht mehr bieten ohne neue Belege.`,
      "Entwicklungsbonus separat vom Basis-Walk-away ausweisen, damit das Komitee die Upside bewusst freigibt."
    ];
  }
  if (values.visibleValueUplift !== null && values.visibleValueUplift > 0) {
    return [
      `Upside nicht einpreisen: ${offerCurrencyText(values.visibleValueUplift)} rechnerischer Werthebel bleiben Memo-Chance, bis Objekt- und Bankbelege vorliegen.`,
      "Basisangebot am Cashflow-/Renditeanker lassen; Entwicklungsannahmen nur als Szenario zeigen."
    ];
  }
  return [
    "Kein Entwicklungsbonus im Angebot: erst Zielmiete, Capex, Bank-Case, WEG und Geo-Kontext nachziehen.",
    "Memo muss klar trennen: heutiger Ist-Kaufpreis versus spaeteres Wertsteigerungsszenario."
  ];
}

function developmentPricingNextActions(
  status: DealDevelopmentPricingDisciplineBrief["status"],
  blockers: string[]
): string[] {
  if (status === "priced") {
    return [
      "Credit-Cap im Investment-Memo, Angebotsband und Finanzierungsszenario identisch dokumentieren.",
      "Vor finalem Gebot pruefen, ob neue Unterlagen den Entwicklungsbonus bestaetigen oder reduzieren."
    ];
  }
  return uniqueItems([
    ...blockers,
    "Sanierungs-/Bank-Case mit Capex-Angeboten, Nachher-Miete, Nachher-Wert und Refi-LTV aktualisieren."
  ]).slice(0, 5);
}

function offerCurrencyText(value: number): string {
  return formatCurrency(value).replace(/\s/g, " ");
}

function dueDiligenceDocumentRow(
  documentType: string,
  label: string,
  document: DealDocument | undefined
): DueDiligenceDocumentRow {
  if (!document) {
    return {
      documentId: null,
      documentType,
      label,
      status: "missing",
      statusLabel: "Fehlt",
      tone: "risk",
      fileName: null,
      riskNotes: null
    };
  }

  const reviewed = document.review_status === "reviewed" || document.review_status === "approved";
  return {
    documentId: document.id,
    documentType,
    label,
    status: reviewed ? "provided" : "review",
    statusLabel: reviewed ? "Geprueft" : "Pruefen",
    tone: reviewed ? "good" : "watch",
    fileName: document.file_name || null,
    riskNotes: document.risk_notes || null
  };
}

function dueDiligenceNextAction(missingCount: number, needsReview: boolean): string {
  if (missingCount > 0) {
    return "Fehlende Bank- und Due-Diligence-Unterlagen anfordern, bevor Zeit in Notar oder finales Angebot fliesst.";
  }
  if (needsReview) {
    return "Vorhandene Unterlagen fachlich pruefen und Risiken im Memo nachziehen.";
  }
  return "Unterlagenpaket ist vollstaendig geprueft; Annahmen fuer Bank, Notar und Angebot final abgleichen.";
}

function dueDiligenceRequestPack(rows: DueDiligenceDocumentRow[]): DueDiligenceDocumentRequestPack {
  const missingRows = rows.filter((row) => row.status === "missing");
  const reviewRows = rows.filter((row) => row.status === "review");
  const actionableRows = missingRows.length ? missingRows : reviewRows;
  const requests = actionableRows.map(dueDiligenceDocumentRequest);
  const blockingCount = requests.filter((request) => request.blocking).length;
  const reviewCount = requests.length - blockingCount;
  const recipientSummary = dueDiligenceRecipientSummary(requests);

  if (missingRows.length > 0) {
    const copySubject = `Unterlagenanfrage: ${missingRows.length} offene Due-Diligence-Unterlagen`;
    const copyIntro =
      "Bitte senden Sie mir vor einem finalen Angebot die folgenden Unterlagen. Bis dahin bleibt jede Preisindikation unverbindlich.";
    const copyLines = requests.map((request) => `Bitte ${request.label} nachreichen: ${request.reason}`);
    const nextAction = "Anforderung an Makler, Verkaeufer und Verwalter senden und Antwortfrist im Deal festhalten.";
    return {
      headline: `${missingRows.length} Unterlagen jetzt anfordern`,
      copySubject,
      copyIntro,
      requests,
      copyLines,
      copyText: dueDiligenceCopyText({ copySubject, copyIntro, copyLines, nextAction, recipientSummary }),
      recipientSummary,
      blockingCount,
      reviewCount,
      nextAction
    };
  }

  if (reviewRows.length > 0) {
    const copySubject = `Pruefung Unterlagen: ${reviewRows.length} Due-Diligence-Unterlagen fachlich klaeren`;
    const copyIntro = "Die Pflichtunterlagen sind vorhanden, aber einzelne Punkte brauchen vor Angebot oder Bankfreigabe noch Pruefung.";
    const copyLines = requests.map((request) => `Bitte ${request.label} pruefen: ${request.reason}`);
    const nextAction = "Risikohinweise aus den vorhandenen Unterlagen in Memo, Bankpaket und Gebotsbedingungen uebernehmen.";
    return {
      headline: `${reviewRows.length} Unterlagen fachlich pruefen`,
      copySubject,
      copyIntro,
      requests,
      copyLines,
      copyText: dueDiligenceCopyText({ copySubject, copyIntro, copyLines, nextAction, recipientSummary }),
      recipientSummary,
      blockingCount,
      reviewCount,
      nextAction
    };
  }

  const copySubject = "Unterlagenpaket vollstaendig - fachliche Pruefung";
  const copyIntro = "Alle Pflichtunterlagen sind vorhanden; jetzt Inhalte fachlich gegen Memo, Bank und Kaufvertrag abgleichen.";
  const copyLines = ["Unterlagenpaket vollstaendig: Inhalte fachlich gegen Memo, Bank und Kaufvertrag abgleichen."];
  const nextAction = "Dokumente final pruefen, Versionsstand sichern und Angebot nur mit unveraenderten Annahmen freigeben.";
  return {
    headline: "Unterlagenpaket vollstaendig",
    copySubject,
    copyIntro,
    requests: [],
    copyLines,
    copyText: dueDiligenceCopyText({ copySubject, copyIntro, copyLines, nextAction, recipientSummary: "Intern" }),
    recipientSummary: "Intern",
    blockingCount,
    reviewCount,
    nextAction
  };
}

function dueDiligenceRecipientSummary(requests: DueDiligenceDocumentRequest[]): string {
  const recipients = Array.from(new Set(requests.map((request) => request.recipient)));
  return recipients.length ? recipients.join(", ") : "Intern";
}

function dueDiligenceCopyText(input: {
  copySubject: string;
  copyIntro: string;
  copyLines: string[];
  nextAction: string;
  recipientSummary: string;
}): string {
  return [
    `Betreff: ${input.copySubject}`,
    "",
    "Hallo,",
    "",
    input.copyIntro,
    "",
    `Adressaten: ${input.recipientSummary}`,
    "",
    ...input.copyLines.map((line) => `- ${line}`),
    "",
    "Antwortfrist: Bitte senden Sie die Unterlagen gesammelt zu oder nennen Sie kurz, bis wann sie verfuegbar sind.",
    "",
    input.nextAction,
    "",
    "Vielen Dank"
  ].join("\n");
}

function dueDiligenceDocumentRequest(row: DueDiligenceDocumentRow): DueDiligenceDocumentRequest {
  return {
    documentType: row.documentType,
    label: row.label,
    recipient: dueDiligenceRequestRecipient(row.documentType),
    reason: row.riskNotes || dueDiligenceRequestReason(row.documentType),
    blocking: row.status === "missing",
    tone: row.tone
  };
}

function dueDiligenceRequestRecipient(documentType: string): string {
  if (
    [
      "weg_minutes",
      "economic_plan",
      "annual_statement",
      "maintenance_reserve_statement"
    ].includes(documentType)
  ) {
    return "Verwalter / WEG";
  }
  if (documentType === "rental_contract") {
    return "Verkaeufer / Verwaltung";
  }
  return "Verkaeufer / Makler";
}

function dueDiligenceRequestReason(documentType: string): string {
  const reasons: Record<string, string> = {
    expose: "belegt Angebotsdaten, Flaechen, Zustand und Makleraussagen.",
    energy_certificate: "belegt Energieklasse, Sanierungsrisiko und Pflichtangaben.",
    declaration_of_division: "klaert Sondereigentum, Gemeinschaftseigentum und Umbau-/Nutzungsgrenzen.",
    weg_minutes: "zeigt Sonderumlagen, Sanierungsstau und kritische Beschluesse.",
    economic_plan: "zeigt Hausgeld, Kostenplanung und laufende WEG-Belastung.",
    annual_statement: "belegt echte Kosten, Ruecklagenzufuehrung und Nachzahlungen.",
    maintenance_reserve_statement: "belegt Instandhaltungsreserve und Sonderumlagenrisiko.",
    rental_contract: "belegt Miethoehe, Nebenkosten, Staffeln und Kuendigungs-/Indexregeln.",
    floor_plan: "prueft Flaeche, Schnitt, Zimmerlogik und Umbaupotential.",
    land_register_excerpt: "klaert Eigentum, Lasten, Rechte und Finanzierungsrisiken."
  };
  return reasons[documentType] || "wird fuer Bank, Notar und belastbare Angebotspruefung gebraucht.";
}

function evidenceInputsFromLocation(
  location: LocationScorePayload | null | undefined
): LocationEvidenceInputs | null {
  const value = location?.evidence_inputs;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as LocationEvidenceInputs;
}

function evidenceNumber(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDistanceMeters(value: number | string): string {
  const meters = evidenceNumber(value);
  if (meters === null) {
    return String(value);
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

function formatCount(value: number | string): string {
  const count = evidenceNumber(value);
  return count === null ? String(value) : new Intl.NumberFormat("de-DE").format(count);
}

function formatEvidencePercent(value: number | string): string {
  const percent = evidenceNumber(value);
  return percent === null ? String(value) : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(percent)} %`;
}

function formatLegalStatus(value: number | string): string {
  const labels: Record<string, string> = {
    allowed: "Erlaubt",
    restricted: "Eingeschraenkt",
    unclear: "Unklar",
    prohibited: "Verboten"
  };
  return labels[String(value)] || String(value);
}

function closeDistanceTone(
  value: number | string,
  goodBelowMeters: number,
  riskAboveMeters: number
): ReturnType<typeof scoreTone> {
  const meters = evidenceNumber(value);
  if (meters === null) {
    return "empty";
  }
  if (meters <= goodBelowMeters) {
    return "good";
  }
  if (meters >= riskAboveMeters) {
    return "risk";
  }
  return "watch";
}

function farDistanceTone(
  value: number | string,
  goodAboveMeters: number,
  riskBelowMeters: number
): ReturnType<typeof scoreTone> {
  const meters = evidenceNumber(value);
  if (meters === null) {
    return "empty";
  }
  if (meters >= goodAboveMeters) {
    return "good";
  }
  if (meters <= riskBelowMeters) {
    return "risk";
  }
  return "watch";
}

function countTone(value: number | string, goodAtLeast: number, riskBelow: number): ReturnType<typeof scoreTone> {
  const count = evidenceNumber(value);
  if (count === null) {
    return "empty";
  }
  if (count >= goodAtLeast) {
    return "good";
  }
  if (count < riskBelow) {
    return "risk";
  }
  return "watch";
}

function percentTone(value: number | string, goodAtLeast: number, riskBelow: number): ReturnType<typeof scoreTone> {
  const percent = evidenceNumber(value);
  if (percent === null) {
    return "empty";
  }
  if (percent >= goodAtLeast) {
    return "good";
  }
  if (percent < riskBelow) {
    return "risk";
  }
  return "watch";
}

function legalStatusTone(value: number | string): ReturnType<typeof scoreTone> {
  const status = String(value);
  if (status === "allowed") {
    return "good";
  }
  if (status === "prohibited") {
    return "risk";
  }
  return "watch";
}

function microLocationDecisionHeadline(score: number | null, risks: string[]): string {
  if (score === null) {
    return "Mikrolage noch nicht belastbar";
  }
  if (score >= 75 && risks.length > 0) {
    return "Starke Mikrolage, aber Stoerfaktoren pruefen";
  }
  if (score >= 75) {
    return "Starke Mikrolage";
  }
  if (score >= 60) {
    return "Solide Mikrolage mit offenen Checks";
  }
  return "Schwache Mikrolage - nur mit Abschlag weiterpruefen";
}

function microLocationDecisionTone(score: number | null, risks: string[]): ReturnType<typeof scoreTone> {
  if (score === null) {
    return "empty";
  }
  if (score < 60) {
    return "risk";
  }
  if (risks.length > 0 || score < 75) {
    return "watch";
  }
  return "good";
}

function microLocationReadinessSummary(
  priceLabels: string[],
  proofGatedLabels: string[],
  memoCount: number,
  brakeCount: number,
  missingCount: number
): string {
  const parts: string[] = [];
  if (priceLabels.length > 0) {
    parts.push(`${priceLabels.join(" und ")} koennen die Vermietungsthese tragen.`);
  } else if (proofGatedLabels.length > 0) {
    parts.push(`${proofGatedLabels.join(" und ")} erst nach Belegen preisrelevant.`);
  } else {
    parts.push("Noch kein harter Mikrolage-Hebel fuer den Kaufpreis belegt.");
  }
  if (memoCount > 0) {
    parts.push("Airbnb bleibt Memo-Upside und nicht Basis-Cashflow.");
  }
  if (brakeCount > 0) {
    parts.push("Stoerfaktoren bremsen die Preisfreigabe.");
  }
  if (missingCount > 0) {
    parts.push("Offene Faktoren vor Gebot nachbelegen.");
  }
  return parts.join(" ");
}

function microLocationAlphaStatus(input: {
  evidenceWeak: boolean;
  hasCoreAlpha: boolean;
  nuisanceRisk: boolean;
  score: number | null;
  shortTermLegalCap: boolean;
}): DealMicroLocationAlphaBrief["status"] {
  if (input.score === null) {
    return "missing";
  }
  if (input.score < 60 || (input.nuisanceRisk && !input.hasCoreAlpha)) {
    return "risk";
  }
  if (input.hasCoreAlpha && !input.evidenceWeak && !input.nuisanceRisk && !input.shortTermLegalCap) {
    return "alpha";
  }
  return "memo";
}

function microLocationAlphaTone(status: DealMicroLocationAlphaBrief["status"]): ReturnType<typeof scoreTone> {
  if (status === "alpha") {
    return "good";
  }
  if (status === "risk") {
    return "risk";
  }
  if (status === "missing") {
    return "empty";
  }
  return "watch";
}

function microLocationAlphaHeadline(status: DealMicroLocationAlphaBrief["status"], score: number | null): string {
  if (status === "alpha") {
    return "Lage-Alpha belegbar";
  }
  if (status === "risk") {
    return "Mikrolage bremst den Deal";
  }
  if (status === "missing") {
    return "Lage-Alpha noch nicht belegbar";
  }
  if (score !== null && score >= 75) {
    return "Lage-Alpha stark, aber nur mit Preisdisziplin";
  }
  return "Lage-Alpha pruefen, nicht bezahlen";
}

function microLocationAlphaPriceRule(status: DealMicroLocationAlphaBrief["status"]): string {
  if (status === "alpha") {
    return "Lage darf die Vermietungsthese stuetzen; Preisaufschlag nur mit Vergleichsmieten und Komitee-Freigabe.";
  }
  if (status === "risk") {
    return "Kein Lageaufschlag; Mikrolage nur mit Preisabschlag oder Gegenbeleg weiterpruefen.";
  }
  if (status === "missing") {
    return "Kein Lageaufschlag; erst Bahnhof/U-Bahn, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren belegen.";
  }
  return "Lage stuetzt Vermietbarkeit; kein Lageaufschlag im Walk-away, bis Vergleichsmieten, Stoerfaktoren und Airbnb-Recht belegt sind.";
}

function microLocationAlphaRentThesis(input: {
  hasShortTermOpportunity: boolean;
  hasStrongDemand: boolean;
  hasStrongLeisure: boolean;
  hasStrongTransit: boolean;
}): string {
  if (input.hasStrongTransit && (input.hasStrongDemand || input.hasStrongLeisure)) {
    return input.hasShortTermOpportunity
      ? "Basisthese: Pendler und Mieter mit Messe-/Freizeitbezug; Airbnb nur als gepruefte Zusatzchance."
      : "Basisthese: Pendler und Mieter mit Messe-/Freizeitbezug; langfristige Vermietung bleibt Basis.";
  }
  if (input.hasStrongTransit) {
    return "Basisthese: Pendlerlage; Vermietbarkeit ueber OePNV und Alltagswege belegen.";
  }
  if (input.hasStrongDemand || input.hasStrongLeisure) {
    return "Basisthese: Nachfrageanker sind interessant, aber OePNV und Alltag muessen noch tragen.";
  }
  return "Basisthese offen: Mikrolage erst mit konkreten Ankern und Zielgruppe belegen.";
}

function microLocationAlphaDemandValue(
  tradeFairMeters: number | string | null,
  recreationMeters: number | string | null,
  demandAnchor: number | null,
  leisure: number | null
): string {
  const parts = [
    tradeFairMeters !== null ? `Messe ${formatDistanceMeters(tradeFairMeters)}` : null,
    recreationMeters !== null ? `Freizeit ${formatDistanceMeters(recreationMeters)}` : null
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  const scores = [
    demandAnchor !== null ? `Messe/Jobs ${Math.round(demandAnchor)}` : null,
    leisure !== null ? `Freizeit ${Math.round(leisure)}` : null
  ].filter((part): part is string => Boolean(part));
  return scores.length ? scores.join(" · ") : "Fehlt";
}

function microLocationDailyNeedsSignal(
  supermarkets: number | string | null,
  pharmacies: number | string | null,
  doctors: number | string | null,
  schools: number | string | null,
  dailyNeeds: number | null
): string {
  const parts = [
    supermarkets !== null ? `Supermarkt ${formatCount(supermarkets)}` : null,
    pharmacies !== null ? `Apotheke ${formatCount(pharmacies)}` : null,
    doctors !== null ? `Arzt ${formatCount(doctors)}` : null,
    schools !== null ? `Schule ${formatCount(schools)}` : null
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : `Score ${formatNumber(dailyNeeds)}`;
}

function microLocationDailyNeedsTone(
  supermarkets: number | string | null,
  pharmacies: number | string | null,
  doctors: number | string | null,
  schools: number | string | null,
  dailyNeeds: number | null
): ReturnType<typeof scoreTone> {
  const tones: Array<ReturnType<typeof scoreTone>> = [
    supermarkets !== null ? countTone(supermarkets, 2, 0) : "empty",
    pharmacies !== null ? countTone(pharmacies, 1, 0) : "empty",
    doctors !== null ? countTone(doctors, 4, 0) : "empty",
    schools !== null ? countTone(schools, 2, 0) : "empty",
    scoreTone(dailyNeeds)
  ];
  return combinedLocationTone(tones);
}

function combinedLocationTone(tones: Array<ReturnType<typeof scoreTone>>): ReturnType<typeof scoreTone> {
  const usefulTones = tones.filter((tone) => tone !== "empty");
  if (usefulTones.length === 0) {
    return "empty";
  }
  if (usefulTones.includes("risk")) {
    return "risk";
  }
  if (usefulTones.includes("watch")) {
    return "watch";
  }
  return "good";
}

function evidenceConfidenceLabel(confidence: string | null): string {
  if (confidence === "high") {
    return "hoch";
  }
  if (confidence === "medium") {
    return "mittel";
  }
  if (confidence === "low") {
    return "niedrig";
  }
  return "unbekannt";
}

function microLocationShortTermLegalCap(legalStatus: string, evidenceNotes: string[]): boolean {
  return (
    legalStatus !== "allowed" ||
    evidenceNotes.some((note) => {
      const normalized = note.toLowerCase();
      return (
        normalized.includes("legal status is restricted") ||
        normalized.includes("legal status is unclear") ||
        normalized.includes("legal status is prohibited")
      );
    })
  );
}

function microLocationTargetGroupRow(
  profile: MicroLocationProfileRow,
  input: {
    nuisanceRisk: boolean;
    shortTermLegalCap: boolean;
    transit: number | null;
    transitMeters: number | string | null;
  }
): DealMicroLocationTargetGroupRow {
  const isShortTerm = microLocationIsShortTermProfile(profile);
  const role = microLocationTargetGroupRole(profile, isShortTerm);
  const tone = microLocationTargetGroupRowTone(profile, role, input.nuisanceRisk);
  const reasons = profile.reasons.length ? profile.reasons.join(" ") : profile.verdict;
  const risk = microLocationTargetGroupRisk(profile, role, input.nuisanceRisk, input.shortTermLegalCap);

  return {
    name: profile.name,
    label: profile.label,
    score: profile.score,
    role,
    verdict: profile.verdict,
    tone,
    proof: microLocationTargetGroupProof(profile, reasons, input.transit, input.transitMeters),
    risk,
    decisionUse: microLocationTargetGroupDecisionUse(profile, role),
    nextCheck: profile.nextCheck
  };
}

function microLocationIsShortTermProfile(profile: MicroLocationProfileRow): boolean {
  const normalized = `${profile.name} ${profile.label}`.toLowerCase();
  return normalized.includes("short_term") || normalized.includes("airbnb") || normalized.includes("kurzzeit");
}

function microLocationTargetGroupRole(
  profile: MicroLocationProfileRow,
  isShortTerm: boolean
): DealMicroLocationTargetGroupRole {
  if (isShortTerm && profile.score >= 55) {
    return "Memo-Upside";
  }
  if (profile.score >= 75) {
    return "Basisnachfrage";
  }
  if (profile.score < 50) {
    return "Risiko";
  }
  return "Pruefgruppe";
}

function microLocationTargetGroupRowTone(
  profile: MicroLocationProfileRow,
  role: DealMicroLocationTargetGroupRole,
  nuisanceRisk: boolean
): ReturnType<typeof scoreTone> {
  if (role === "Risiko") {
    return "risk";
  }
  if (role === "Memo-Upside" || role === "Pruefgruppe" || nuisanceRisk) {
    return "watch";
  }
  return scoreTone(profile.score);
}

function microLocationTargetGroupProof(
  profile: MicroLocationProfileRow,
  reasons: string,
  transit: number | null,
  transitMeters: number | string | null
): string {
  if (profile.name === "commuter" || profile.label.toLowerCase().includes("pendler")) {
    const transitSignal = transitMeters !== null ? formatDistanceMeters(transitMeters) : formatNumber(transit);
    return `${reasons} Bahnhof/U-Bahn: ${transitSignal}.`;
  }
  return reasons;
}

function microLocationTargetGroupRisk(
  profile: MicroLocationProfileRow,
  role: DealMicroLocationTargetGroupRole,
  nuisanceRisk: boolean,
  shortTermLegalCap: boolean
): string {
  const risks = [...profile.risks];
  if (role === "Memo-Upside" && shortTermLegalCap) {
    risks.push("Rechtslage/WEG kann Kurzzeitvermietung begrenzen.");
  }
  if (nuisanceRisk && role !== "Memo-Upside") {
    risks.push("Laerm oder Hauptstrasse koennen die Zielgruppe schwaechen.");
  }
  return uniqueItems(risks).join(" ") || "Keine harte Zielgruppenbremse im aktuellen Datenstand.";
}

function microLocationTargetGroupDecisionUse(
  profile: MicroLocationProfileRow,
  role: DealMicroLocationTargetGroupRole
): string {
  if (role === "Basisnachfrage") {
    return `${profile.label} duerfen die Basis-Mietthese stuetzen; Kaufpreisaufschlag nur mit Vergleichsmieten und Belegen.`;
  }
  if (role === "Memo-Upside") {
    return `${profile.label} bleiben Memo-Upside, nicht Basis-Cashflow und kein Walk-away-Aufschlag.`;
  }
  if (role === "Risiko") {
    return `${profile.label} aktuell nicht als Nachfragebasis rechnen; nur mit Abschlag oder Gegenbeleg.`;
  }
  return `${profile.label} als Pruefgruppe dokumentieren, aber noch nicht als Preisargument verwenden.`;
}

function microLocationTargetGroupRoleRank(role: DealMicroLocationTargetGroupRole): number {
  if (role === "Basisnachfrage") {
    return 0;
  }
  if (role === "Memo-Upside") {
    return 1;
  }
  if (role === "Pruefgruppe") {
    return 2;
  }
  return 3;
}

function microLocationTargetGroupHeadline(
  status: DealMicroLocationTargetGroupStatus,
  primaryLabel: string | null
): string {
  if (status === "base" && primaryLabel) {
    return `Zielgruppen-These: ${primaryLabel} tragen die Basis`;
  }
  if (status === "memo") {
    return "Zielgruppen-These: nur Memo-Upside";
  }
  if (status === "risk") {
    return "Zielgruppen-These bremst den Deal";
  }
  return "Zielgruppen-These fehlt";
}

function microLocationTargetGroupSummary(
  baseRows: DealMicroLocationTargetGroupRow[],
  memoRows: DealMicroLocationTargetGroupRow[],
  riskRows: DealMicroLocationTargetGroupRow[],
  nuisanceRisk: boolean
): string {
  const parts: string[] = [];
  if (baseRows.length > 0) {
    parts.push(`${baseRows.map((row) => row.label).join(" und ")} tragen die langfristige Nachfrage.`);
  } else {
    parts.push("Noch keine langfristige Basis-Zielgruppe ist hart belegt.");
  }
  if (memoRows.length > 0) {
    parts.push(`${memoRows.map((row) => row.label).join(" und ")} bleiben Zusatzchance.`);
  }
  if (riskRows.length > 0 || nuisanceRisk) {
    parts.push("Stoerfaktoren und schwache Profile bremsen die Preisfreigabe.");
  }
  return parts.join(" ");
}

function microLocationTargetGroupBaseCase(
  primaryBase: DealMicroLocationTargetGroupRow | null,
  transit: number | null,
  transitMeters: number | string | null
): string {
  if (!primaryBase) {
    return "Basisrechnung auf langfristige Vermietung erst freigeben, wenn eine Zielgruppe mit Vergleichsmieten belegt ist.";
  }
  const transitSignal = transitMeters !== null ? formatDistanceMeters(transitMeters) : formatNumber(transit);
  return `Basisrechnung auf ${primaryBase.label} ausrichten: Bahnhof/U-Bahn ${transitSignal}, Alltag und Vergleichsmieten muessen die Miete tragen.`;
}

function microLocationTargetGroupNextActions(
  rows: DealMicroLocationTargetGroupRow[],
  nuisanceRisk: boolean
): string[] {
  const actions = rows.map((row) => row.nextCheck).filter(Boolean);
  if (nuisanceRisk) {
    actions.push("Laerm, Hauptstrasse und Stoerquellen vor Ort pruefen, bevor Zielgruppen-Alpha bezahlt wird.");
  }
  return uniqueItems(actions).slice(0, 5);
}

function microLocationAlphaMemoItems(input: {
  hasCoreAlpha: boolean;
  hasDemandHotelCluster: boolean;
  hasShortTermOpportunity: boolean;
}): string[] {
  const items: string[] = [];
  if (input.hasCoreAlpha) {
    items.push(
      input.hasDemandHotelCluster
        ? "Bahnhof/U-Bahn, Messe/Freizeit und Hotels als Nachfrageanker im Memo dokumentieren."
        : "Bahnhof/U-Bahn und konkrete Nachfrageanker als Vermietungsthese im Memo dokumentieren."
    );
  }
  if (input.hasShortTermOpportunity) {
    items.push("Airbnb/Tourismus nur als Upside-Memo, nicht als Basis-Cashflow oder Preisaufschlag.");
  }
  if (items.length === 0) {
    items.push("Mikrolage noch nicht als Alpha verkaufen; zuerst konkrete Lageanker und Zielgruppe belegen.");
  }
  return uniqueItems(items);
}

function microLocationAlphaRisks(input: {
  evidenceWeak: boolean;
  nuisanceRisk: boolean;
  shortTermLegalCap: boolean;
}): string[] {
  const risks: string[] = [];
  if (input.nuisanceRisk) {
    risks.push("Hauptstrasse/Laerm liegt zu nah; Mikrolage nur nach Vor-Ort-Check preislich werten.");
  }
  if (input.shortTermLegalCap) {
    risks.push("Airbnb-Recht ist eingeschraenkt oder unklar; Kurzzeitvermietung nicht in Basisrechnung.");
  }
  if (input.evidenceWeak) {
    risks.push("Mikrolage-Daten sind noch nicht belastbar genug fuer eine Gebotsfreigabe.");
  }
  return uniqueItems(risks);
}

function microLocationAlphaNextActions(input: {
  evidenceWeak: boolean;
  hasShortTermOpportunity: boolean;
  hasStrongTransit: boolean;
  nuisanceRisk: boolean;
  shortTermLegalCap: boolean;
}): string[] {
  const actions: string[] = [];
  if (input.hasStrongTransit) {
    actions.push("Pendlerzeiten zu Innenstadt, Arbeitsplatzkernen und Bahnhof gegenpruefen.");
  }
  if (input.nuisanceRisk) {
    actions.push("Laerm, Hauptstrasse und Stoerquellen vor Ort oder mit Karten-/Katasterdaten pruefen.");
  }
  if (input.shortTermLegalCap || input.hasShortTermOpportunity) {
    actions.push("Airbnb-/Zweckentfremdungsregeln und echte Auslastungsdaten pruefen.");
  }
  if (input.evidenceWeak) {
    actions.push("Mikrolage-Belege fuer OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren ergaenzen.");
  }
  return actions.length ? uniqueItems(actions) : ["Vergleichsmieten und echte Zielgruppen-Nachfrage vor finalem Angebot gegenpruefen."];
}

function microLocationPriceGateStatus(
  alphaStatus: DealMicroLocationAlphaBrief["status"],
  askingPrice: number | null
): DealMicroLocationPriceGateStatus {
  if (askingPrice === null || alphaStatus === "missing") {
    return "missing";
  }
  if (alphaStatus === "risk") {
    return "blocked";
  }
  if (alphaStatus === "alpha") {
    return "committee";
  }
  return "memo_only";
}

function microLocationPriceGateTone(status: DealMicroLocationPriceGateStatus): ReturnType<typeof scoreTone> {
  if (status === "committee") {
    return "good";
  }
  if (status === "blocked") {
    return "risk";
  }
  if (status === "missing") {
    return "empty";
  }
  return "watch";
}

function microLocationPriceGateHeadline(status: DealMicroLocationPriceGateStatus): string {
  if (status === "committee") {
    return "Lagepreis nur mit Komitee-Freigabe";
  }
  if (status === "blocked") {
    return "Lage bremst den Preis";
  }
  if (status === "missing") {
    return "Lagepreis noch nicht messbar";
  }
  return "Kein Lageaufschlag im Walk-away";
}

function microLocationPriceGateStatusLabel(status: DealMicroLocationPriceGateStatus): string {
  if (status === "committee") {
    return "Komitee";
  }
  if (status === "blocked") {
    return "Preisblocker";
  }
  if (status === "missing") {
    return "Fehlt";
  }
  return "Memo-Upside";
}

function microLocationPriceGateRule(status: DealMicroLocationPriceGateStatus): string {
  if (status === "committee") {
    return "Top-Mikrolage darf einen kleinen Lagepuffer begruenden, aber nur mit Vergleichsmieten, Belegen und Komitee-Freigabe.";
  }
  if (status === "blocked") {
    return "Mikrolage erhoeht den Preis nicht; Stoerfaktoren oder schwache Lage brauchen Abschlag.";
  }
  if (status === "missing") {
    return "Ohne Kaufpreis und belegte Mikrolage bleibt der Lageaufschlag bei null.";
  }
  return "Lage kann die Story verbessern, aber sie erhoeht nicht den Walk-away-Preis.";
}

function microLocationPriceGateGuardrails(status: DealMicroLocationPriceGateStatus): string[] {
  if (status === "committee") {
    return [
      "Maximal 1,5 % des Kaufpreises als Lagepuffer und nur mit Vergleichsmieten.",
      "Kein Airbnb-, Messe- oder Freizeitaufschlag ohne Rechts-, Nachfrage- und Stoerquellen-Check.",
      "Komitee muss den Lagepuffer vor Angebot separat freigeben."
    ];
  }
  if (status === "blocked") {
    return [
      "Kein Lageaufschlag; Lage nur als Preisabschlag oder Stop-Regel verwenden.",
      "Stoerfaktoren, Laerm und fehlende Belege zuerst klaeren."
    ];
  }
  if (status === "missing") {
    return ["Kein Lageaufschlag ohne Kaufpreis, Koordinaten, OePNV, Nachfrageanker und Stoerquellen-Belege."];
  }
  return [
    "Mikrolage darf ins Memo, aber nicht den Walk-away-Preis erhoehen.",
    "Airbnb/Tourismus bleibt Zusatzchance, nicht Basis-Cashflow.",
    "Preis erst anheben, wenn Vergleichsmieten und harte Stoerquellen geprueft sind."
  ];
}

function microLocationPriceGateNextActions(
  status: DealMicroLocationPriceGateStatus,
  alpha: DealMicroLocationAlphaBrief
): string[] {
  const actions =
    status === "committee"
      ? [
          "Vergleichsmieten und Zielgruppen-Nachfrage als Komitee-Beleg ablegen.",
          "Lagepuffer gegen Cashflow-Anker und Marktvergleich plausibilisieren."
        ]
      : status === "memo_only"
        ? ["Laerm, Hauptstrasse und Airbnb-Recht pruefen, bevor Lagepreis freigegeben wird."]
        : status === "blocked"
          ? ["Preisabschlag aus Stoerfaktoren oder schwacher Mikrolage in die Verhandlung aufnehmen."]
          : ["Mikrolage-Belege und Kaufpreis erfassen, bevor ein Lagepreis bewertet wird."];
  return uniqueItems([...actions, ...alpha.nextActions.slice(0, 2)]);
}

function locationOfferDisciplineStatus(
  priceGateStatus: DealMicroLocationPriceGateStatus
): DealLocationOfferDisciplineStatus {
  if (priceGateStatus === "committee") {
    return "committee";
  }
  if (priceGateStatus === "blocked") {
    return "blocked";
  }
  if (priceGateStatus === "missing") {
    return "missing";
  }
  return "memo_only";
}

function locationOfferDisciplineTone(
  status: DealLocationOfferDisciplineStatus,
  offerTone: ReturnType<typeof scoreTone>
): ReturnType<typeof scoreTone> {
  if (status === "blocked") {
    return "risk";
  }
  if (status === "missing") {
    return "empty";
  }
  if (status === "committee") {
    return offerTone === "risk" ? "watch" : "good";
  }
  return "watch";
}

function locationOfferDisciplineHeadline(status: DealLocationOfferDisciplineStatus): string {
  if (status === "committee") {
    return "Lage-Credit nur mit Komitee-Freigabe";
  }
  if (status === "blocked") {
    return "Lage wirkt als Preisbremse";
  }
  if (status === "missing") {
    return "Lagepreis-Disziplin fehlt";
  }
  return "Lagehebel erhoehen den Walk-away nicht";
}

function locationOfferDisciplineSummary(
  status: DealLocationOfferDisciplineStatus,
  baseWalkAwayPrice: number,
  guardedWalkAwayPrice: number,
  locationCreditEur: number
): string {
  if (status === "committee" && locationCreditEur > 0) {
    return `Basis-Walk-away ${offerCurrencyText(baseWalkAwayPrice)} plus maximal ${offerCurrencyText(locationCreditEur)} Lage-Credit; geschuetzter Walk-away ${offerCurrencyText(guardedWalkAwayPrice)} nur nach Freigabe.`;
  }
  if (status === "blocked") {
    return `Basis-Walk-away ${offerCurrencyText(baseWalkAwayPrice)} nicht erhoehen; Mikrolage ist Preisbremse oder Stop-Regel.`;
  }
  if (status === "missing") {
    return `Basis-Walk-away ${offerCurrencyText(baseWalkAwayPrice)} bleibt unveraendert, bis Zielgruppe und Lagebelege belastbar sind.`;
  }
  return `Basis-Walk-away ${offerCurrencyText(baseWalkAwayPrice)} bleibt harte Grenze; Lage-Story bleibt Memo, bis Basis-Zielgruppe und Vergleichsmieten belegt sind.`;
}

function locationOfferTargetGroupValue(targetGroup: DealMicroLocationTargetGroupBrief): string {
  const base = targetGroup.facts.find((fact) => fact.label === "Basis-Zielgruppe")?.value || "Fehlt";
  const memo = targetGroup.facts.find((fact) => fact.label === "Memo-Upside")?.value || "Fehlt";
  if (targetGroup.status === "base" && base !== "Fehlt") {
    return `${base} Basis`;
  }
  if (memo !== "Fehlt") {
    return `${memo} nur Memo`;
  }
  return "Fehlt";
}

function locationOfferDisciplineGuardrails(
  status: DealLocationOfferDisciplineStatus,
  targetGroup: DealMicroLocationTargetGroupBrief,
  priceGate: DealMicroLocationPriceGateBrief
): string[] {
  const guardrails = [
    targetGroup.memoRule,
    ...priceGate.guardrails,
    status === "committee"
      ? "Lage-Credit separat von Startgebot, Zielpreis und Basis-Walk-away im IC-Memo ausweisen."
      : "Kein Lageaufschlag in Maklerkommunikation oder Zielpreis, solange Basis-Zielgruppe und Vergleichsmieten nicht belegt sind."
  ];
  if (status === "blocked") {
    guardrails.push("Stoerfaktoren als Preisabschlag oder Stop-Regel in die Verhandlung aufnehmen.");
  }
  return uniqueItems(guardrails);
}

function locationOfferDisciplineNextActions(
  targetGroup: DealMicroLocationTargetGroupBrief,
  priceGate: DealMicroLocationPriceGateBrief
): string[] {
  return uniqueItems([...targetGroup.nextActions, ...priceGate.nextActions]).slice(0, 6);
}

function formatCurrencyCode(value: number | null | undefined): string {
  return formatCurrency(value).replace(/\u00a0/g, " ").replace(/\s?€/u, " EUR");
}

function dealDecisionStatus(input: {
  hasScore: boolean;
  hasUnderwriting: boolean;
  healthyEconomics: boolean;
  cashflowWeak: boolean;
  dscrWeak: boolean;
  hardRedFlag: boolean;
  scoreWeak: boolean;
  score: number | null;
}): DealDecisionBrief["decision"] {
  if (!input.hasScore || !input.hasUnderwriting) {
    return "watch";
  }
  if (input.cashflowWeak && input.dscrWeak) {
    return "reject";
  }
  if (input.hardRedFlag && (input.cashflowWeak || input.dscrWeak || input.scoreWeak)) {
    return "reject";
  }
  if (input.scoreWeak && !input.healthyEconomics) {
    return "reject";
  }
  if (input.healthyEconomics && input.score !== null && input.score >= 75) {
    return "buy";
  }
  if (input.cashflowWeak || input.dscrWeak || input.hardRedFlag) {
    return "negotiate";
  }
  return "watch";
}

function decisionPriority(decision: DealDecisionBrief["decision"]): number {
  if (decision === "reject") return 0;
  if (decision === "negotiate") return 1;
  if (decision === "buy") return 2;
  return 3;
}

function dealDecisionHeadline(decision: DealDecisionBrief["decision"]): string {
  if (decision === "buy") return "In Due Diligence nehmen";
  if (decision === "negotiate") return "Nur mit Preisabschlag weiterverfolgen";
  if (decision === "reject") return "Ablehnen oder hart nachverhandeln";
  return "Beobachten und Daten schliessen";
}

function dealDecisionTone(decision: DealDecisionBrief["decision"]): ReturnType<typeof scoreTone> {
  if (decision === "buy") return "good";
  if (decision === "reject") return "risk";
  if (decision === "watch") return "empty";
  return "watch";
}

function dealDecisionSummary(
  decision: DealDecisionBrief["decision"],
  strongLocation: boolean,
  economicsWeak: boolean
): string {
  if (decision === "buy") {
    return "Score, Cashflow und Schuldendienst passen; jetzt muessen Unterlagen und Annahmen bestaetigt werden.";
  }
  if (decision === "reject" && strongLocation && economicsWeak) {
    return "Die Lage ist stark, aber der aktuelle Preis macht den Deal wirtschaftlich zu schwach.";
  }
  if (decision === "reject") {
    return "Die Zahlen tragen den Deal aktuell nicht; erst ein deutlich besserer Preis macht ihn pruefbar.";
  }
  if (decision === "negotiate") {
    return "Der Deal kann interessant sein, aber nur wenn Preis, Miete oder Finanzierung die Luecke schliessen.";
  }
  return "Es fehlen noch wichtige Daten, bevor eine Kaufentscheidung sinnvoll ist.";
}

function dealDecisionStrengths(
  score: number | null,
  locationScore: number | null,
  strongLocation: boolean
): string[] {
  const strengths: string[] = [];
  if (score !== null && score >= 75) {
    strengths.push("Gesamtscore ist stark und rechtfertigt weitere Pruefung.");
  }
  if (strongLocation) {
    strengths.push("Standort/Mikrolage ist stark, aber nicht genug fuer diesen Preis.");
  } else if (locationScore !== null && locationScore >= 60) {
    strengths.push("Standort/Mikrolage ist solide, muss aber vor Ort bestaetigt werden.");
  }
  if (strengths.length === 0) {
    strengths.push("Noch keine starke Deal-Staerke belegt.");
  }
  return strengths;
}

function dealDecisionReasons(input: {
  hasScore: boolean;
  hasUnderwriting: boolean;
  score: number | null;
  cashflow: number | null;
  dscr: number | null;
  stressedWeak: boolean;
  redFlags: string[];
  residualRating: "green" | "amber" | "red" | null;
}): string[] {
  const reasons: string[] = [];
  if (!input.hasUnderwriting) {
    reasons.push("Underwriting fehlt noch.");
  } else if (input.cashflow === null) {
    reasons.push("Cashflow ist noch nicht belastbar gerechnet.");
  } else if (input.cashflow < 0) {
    reasons.push("Cashflow ist im Basisszenario negativ.");
  } else {
    reasons.push("Cashflow ist im Basisszenario positiv.");
  }

  if (input.hasUnderwriting) {
    if (input.dscr === null) {
      reasons.push("DSCR fehlt noch.");
    } else if (input.dscr < 1.1) {
      reasons.push("DSCR ist deutlich unter 1,10; der Kapitaldienst traegt sich nicht.");
    } else {
      reasons.push("DSCR liegt ueber 1,10 und deckt den Kapitaldienst.");
    }
  }

  if (!input.hasScore) {
    reasons.push("Scoring fehlt noch.");
  } else if (input.score !== null && input.score < 60) {
    reasons.push("Gesamtscore ist schwach.");
  }

  if (input.stressedWeak) {
    reasons.push("Stresstest bleibt schwach; bei hoeherem Zins wird der Puffer eng.");
  }
  if (input.residualRating === "red") {
    reasons.push("Restschuld-Faktor ist rot und erhoeht das Anschlussfinanzierungsrisiko.");
  }
  if (input.redFlags.length > 0) {
    reasons.push(`Rote Flaggen vorhanden: ${input.redFlags.join(", ")}.`);
  }
  return reasons;
}

function dealDecisionNextActions(
  decision: DealDecisionBrief["decision"],
  hasScore: boolean,
  hasUnderwriting: boolean,
  neutralPurchasePrice: number | null
): string[] {
  const actions: string[] = [];
  if (!hasUnderwriting) {
    actions.push("Underwriting rechnen, bevor Zeit in Besichtigung oder Bankgespraech fliesst.");
  }
  if (!hasScore) {
    actions.push("Scoring starten und rote Flaggen erfassen.");
  }
  if ((decision === "reject" || decision === "negotiate") && neutralPurchasePrice !== null) {
    actions.push("Maximalpreis fuer neutralen Cashflow als harte Verhandlungsanker nutzen.");
  }
  if (decision === "reject" || decision === "negotiate") {
    actions.push("Cashflow-Luecke ueber Kaufpreis, Finanzierung, Hausgeld und Miete schliessen.");
    actions.push("Nur weiterarbeiten, wenn der Verkaeufer einen echten Preishebel zeigt.");
  }
  if (decision === "buy") {
    actions.push("Unterlagen pruefen und Annahmen im Bank-/WEG-/Mietcheck bestaetigen.");
    actions.push("Besichtigung, Mietvertrag, Hausgeld und Ruecklagen gegen die Rechnung halten.");
  }
  if (decision === "watch") {
    actions.push("Fehlende Zahlen schliessen und danach Entscheidung neu rechnen.");
  }
  return uniqueItems(actions);
}

function strategyHeadline(
  decision: DealDecisionBrief["decision"],
  primaryProfile: MicroLocationProfileRow | null
): string {
  if (!primaryProfile) {
    return "Strategie offen - Daten schliessen";
  }
  if ((decision === "reject" || decision === "negotiate") && primaryProfile.score >= 75) {
    return `${primaryProfile.label}-Lage, aber nur mit hartem Preisanker`;
  }
  if (decision === "buy" && primaryProfile.score >= 75) {
    return `Due Diligence fuer ${primaryProfile.label}-These`;
  }
  if (primaryProfile.score >= 70) {
    return `${primaryProfile.label}-These mit Pruefung`;
  }
  return "Strategie offen - Daten schliessen";
}

function strategyTone(
  decisionTone: ReturnType<typeof scoreTone>,
  primaryProfileScore: number | null
): ReturnType<typeof scoreTone> {
  if (decisionTone === "risk") {
    return "risk";
  }
  if (decisionTone === "good" && primaryProfileScore !== null && primaryProfileScore >= 75) {
    return "good";
  }
  if (primaryProfileScore === null) {
    return "empty";
  }
  return primaryProfileScore >= 60 ? "watch" : "risk";
}

function strategyBasePlan(primaryProfile: MicroLocationProfileRow | null): string {
  if (!primaryProfile) {
    return "Basisthese offen: Zielgruppe erst ueber Mikrolage und Grundriss klaeren.";
  }
  if (primaryProfile.score >= 75) {
    return `Basisthese: langfristige Vermietung an ${primaryProfile.label}.`;
  }
  if (primaryProfile.score >= 60) {
    return `Basisthese pruefen: ${primaryProfile.label} ist moeglich, aber noch keine Hauptthese.`;
  }
  return "Keine robuste Zielgruppen-These; nur mit Preisabschlag weiterpruefen.";
}

function strategyRentPlan(shortTermProfile: MicroLocationProfileRow | null, hasLegalCap: boolean): string {
  if (hasLegalCap) {
    return "Airbnb nur als Upside-Notiz, nicht als Basisrechnung.";
  }
  if (!shortTermProfile || shortTermProfile.score < 60) {
    return "Kurzzeitvermietung aktuell nicht einpreisen.";
  }
  if (shortTermProfile.score >= 75) {
    return "Kurzzeitvermietung kann Zusatzszenario sein; trotzdem nicht als Basis-Cashflow verwenden.";
  }
  return "Kurzzeitvermietung nur nach separater Nachfrage- und Rechtspruefung betrachten.";
}

function strategyOfferRule(pricing: DealPricingBrief): string {
  if (pricing.status === "gap") {
    return `Gebot am Cashflow-Anker ausrichten: maximal ${pricing.anchor}, aktuelle Luecke ${pricing.value}.`;
  }
  if (pricing.status === "buffer") {
    return `Kaufpreis liegt unter dem Cashflow-Anker ${pricing.anchor}; Angebot mit Unterlagenrisiken absichern.`;
  }
  return "Gebotsgrenze fehlt: zuerst Underwriting und Cashflow-Anker vervollstaendigen.";
}

function strategyShortTermLegalStatus(deal: Deal): string {
  const inputs = evidenceInputsFromLocation(deal.location);
  const status = inputs?.short_term_rental_legal_status;
  return typeof status === "string" && status ? status : "unclear";
}

function strategyShortTermHasLegalCap(deal: Deal, legalStatus: string): boolean {
  const evidenceNotes = Array.isArray(deal.location?.evidence_notes)
    ? deal.location.evidence_notes.filter((note): note is string => typeof note === "string")
    : [];
  return microLocationShortTermLegalCap(legalStatus, evidenceNotes);
}

function acquisitionEconomicsGate(deal: Deal): AcquisitionReadinessGate {
  const uw = deal.latest_underwriting;
  const cashflow = numberValue(uw?.monthly_cashflow_before_tax);
  const dscr = numberValue(uw?.dscr);
  const neutralPurchasePrice = numberValue(uw?.max_purchase_price_for_neutral_cashflow);
  const redFlags = deal.latest_score?.red_flags || [];
  const residualRating = uw?.residual_debt_factor_rating || null;
  const hardFinancingFlag = redFlags.some(isHardFinancingFlag);

  if (!uw) {
    return acquisitionGate(
      "economics",
      "Wirtschaftlichkeit",
      "review",
      "Underwriting fehlt; Cashflow, DSCR und Preisanker sind noch nicht belastbar.",
      ["Underwriting rechnen, bevor Angebot, Besichtigung oder Bankgespraech priorisiert werden."]
    );
  }

  const cashflowWeak = cashflow !== null && cashflow < 0;
  const dscrCritical = dscr !== null && dscr < 1;
  const dscrWeak = dscr !== null && dscr < 1.1;
  const residualRed = residualRating === "red";
  const actions = [
    ...(neutralPurchasePrice !== null
      ? [`Maximalpreis fuer neutralen Cashflow als harte Grenze nutzen: ${currencyText(neutralPurchasePrice)}.`]
      : ["Cashflow-neutralen Maximalpreis als Gebotsgrenze berechnen."]),
    "Finanzierung, Hausgeld, Miete und Kaufpreis so lange nachziehen, bis der Base Case traegt."
  ];

  if ((cashflowWeak && dscrCritical) || (hardFinancingFlag && (cashflowWeak || dscrWeak)) || residualRed) {
    return acquisitionGate(
      "economics",
      "Wirtschaftlichkeit",
      "block",
      `Cashflow ${formatCurrency(cashflow)} und DSCR ${formatNumber(dscr)} tragen den Kaufpreis nicht.`,
      actions
    );
  }

  if (cashflow !== null && cashflow >= 0 && dscr !== null && dscr >= 1.1 && !hardFinancingFlag) {
    return acquisitionGate(
      "economics",
      "Wirtschaftlichkeit",
      "pass",
      `Cashflow ${formatCurrency(cashflow)} und DSCR ${formatNumber(dscr)} sind im Base Case tragfaehig.`,
      []
    );
  }

  return acquisitionGate(
    "economics",
    "Wirtschaftlichkeit",
    "review",
    "Wirtschaftlichkeit ist noch nicht sauber freigegeben; ein Puffer oder eine Kennzahl ist zu knapp.",
    actions
  );
}

function acquisitionDocumentGate(deal: Deal): AcquisitionReadinessGate {
  const summary = dueDiligenceDocumentSummary(deal);
  const reviewCount = summary.rows.filter((row) => row.status === "review").length;
  const missingCount = summary.missingLabels.length;

  if (missingCount > 0) {
    const reviewNote =
      reviewCount > 0 ? ` ${reviewCount} vorhandene Unterlage${reviewCount === 1 ? "" : "n"} noch pruefen.` : "";
    return acquisitionGate(
      "documents",
      "Unterlagen",
      "block",
      `${missingCount} Pflichtunterlagen fehlen.${reviewNote}`,
      [summary.nextAction]
    );
  }

  if (reviewCount > 0) {
    return acquisitionGate(
      "documents",
      "Unterlagen",
      "review",
      `${reviewCount} vorhandene Unterlage${reviewCount === 1 ? "" : "n"} ist noch nicht fachlich geprueft.`,
      [summary.nextAction]
    );
  }

  return acquisitionGate(
    "documents",
    "Unterlagen",
    "pass",
    "Pflichtunterlagen liegen vor und sind geprueft.",
    []
  );
}

function acquisitionMicroLocationGate(deal: Deal): AcquisitionReadinessGate {
  const score = numberValue(deal.location?.micro_location_score);
  const completeness = numberValue(deal.location?.evidence_data_completeness_percent);
  const confidence =
    typeof deal.location?.evidence_confidence === "string" ? deal.location.evidence_confidence.toLowerCase() : null;
  const hasCoordinates =
    deal.listing?.latitude !== null &&
    deal.listing?.latitude !== undefined &&
    deal.listing?.longitude !== null &&
    deal.listing?.longitude !== undefined;
  const evidenceWeak =
    !hasCoordinates ||
    completeness === null ||
    completeness < 75 ||
    confidence === "low" ||
    confidence === null;
  const actions = [
    ...(!hasCoordinates ? ["Koordinaten setzen und Mikrolage erneut mit Karte/OSM pruefen."] : []),
    ...(completeness === null || completeness < 75
      ? ["Mikrolage-Belege fuer OePNV, Alltag, Nachfrageanker, Freizeit, Airbnb und Stoerfaktoren ergaenzen."]
      : []),
    ...(confidence === "low" || confidence === null
      ? ["Mikrolage mit belastbaren Quellen oder Vor-Ort-Pruefung bestaetigen."]
      : [])
  ];

  if (score === null) {
    return acquisitionGate(
      "microlocation",
      "Mikrolage",
      "review",
      "Mikrolage-Score fehlt.",
      ["Mikrolage mit OePNV, Versorgung, Nachfrageankern, Freizeit, Airbnb und Stoerquellen bewerten."]
    );
  }

  if (score < 60) {
    return acquisitionGate(
      "microlocation",
      "Mikrolage",
      "block",
      `Mikrolage ${Math.round(score)} ist zu schwach fuer eine Freigabe ohne deutlichen Abschlag.`,
      actions.length ? actions : ["Schwache Mikrolage nur mit Preisabschlag oder klarer Gegenhypothese weiterverfolgen."]
    );
  }

  if (score >= 75 && !evidenceWeak) {
    return acquisitionGate(
      "microlocation",
      "Mikrolage",
      "pass",
      `Mikrolage ${Math.round(score)} ist stark und ausreichend belegt.`,
      []
    );
  }

  return acquisitionGate(
    "microlocation",
    "Mikrolage",
    "review",
    `Mikrolage ${Math.round(score)} ist interessant, aber die Belege sind noch nicht voll belastbar.`,
    actions.length ? uniqueItems(actions) : ["Mikrolage vor Gebot durch Vor-Ort-Check oder weitere Daten bestaetigen."]
  );
}

function acquisitionWegGate(deal: Deal): AcquisitionReadinessGate {
  const result = deal.weg_health?.results;
  if (!result) {
    return acquisitionGate(
      "weg",
      "WEG/Objekt",
      "review",
      "WEG-Check fehlt.",
      ["WEG-Protokolle, Wirtschaftsplan, Ruecklagen, Sonderumlagen und Verwalterqualitaet pruefen."]
    );
  }

  const score = numberValue(result.total_score);
  const completeness = numberValue(result.data_completeness_percent);
  const confidence = String(result.confidence || "").toLowerCase();
  const flags = result.flags || [];
  const actions = uniqueItems([
    ...(result.documents_to_request || []),
    ...(flags.length ? ["WEG-Flags im Preis, Memo und Besichtigungsplan abarbeiten."] : []),
    ...(completeness !== null && completeness < 75 ? ["Fehlende WEG-Daten nachfordern, bevor final geboten wird."] : [])
  ]);

  if (score !== null && score < 60) {
    return acquisitionGate(
      "weg",
      "WEG/Objekt",
      "block",
      `WEG-Score ${Math.round(score)} ist zu schwach.`,
      actions.length ? actions : ["WEG-Risiken klaeren oder Deal nur mit deutlichem Abschlag weiterpruefen."]
    );
  }

  if (flags.length > 0 || confidence === "low" || completeness === null || completeness < 75) {
    return acquisitionGate(
      "weg",
      "WEG/Objekt",
      "review",
      flags.length ? `WEG-Check hat ${flags.length} offene Flagge${flags.length === 1 ? "" : "n"}.` : "WEG-Datenlage ist noch nicht voll belastbar.",
      actions.length ? actions : ["WEG-Unterlagen fachlich pruefen und offene Punkte im Memo festhalten."]
    );
  }

  return acquisitionGate(
    "weg",
    "WEG/Objekt",
    "pass",
    `WEG-Score ${score !== null ? Math.round(score) : "ok"} ohne harte offene Flaggen.`,
    []
  );
}

function acquisitionGeoGate(deal: Deal): AcquisitionReadinessGate {
  const geo = deal.geo_context;
  if (!geo) {
    return acquisitionGate(
      "geo",
      "Geo/Baurecht",
      "review",
      "Geo-/Baurecht-Kontext fehlt.",
      ["B-Plan, Milieuschutz, Sanierungsgebiet, Denkmalschutz und Bodenrichtwert pruefen."]
    );
  }

  const confidence = numberValue(geo.data_confidence_percent);
  const specialAreas = [
    geo.milieu_protection_area ? "Milieuschutz" : null,
    geo.redevelopment_area ? "Sanierungsgebiet" : null,
    geo.monument_protection ? "Denkmalschutz" : null
  ].filter((item): item is string => Boolean(item));
  const needsReview = confidence === null || confidence < 70 || specialAreas.length > 0;

  if (needsReview) {
    return acquisitionGate(
      "geo",
      "Geo/Baurecht",
      "review",
      specialAreas.length
        ? `Baurechtliche Sonderthemen pruefen: ${specialAreas.join(", ")}.`
        : "Geo-/Baurechtsdaten sind noch nicht ausreichend sicher.",
      ["Geo-/Baurecht-Kontext vor Angebot mit amtlichen Quellen oder Fachpruefung bestaetigen."]
    );
  }

  return acquisitionGate(
    "geo",
    "Geo/Baurecht",
    "pass",
    "Geo-/Baurechtskontext ist ohne harte Sonderthemen erfasst.",
    []
  );
}

function acquisitionRiskGate(deal: Deal): AcquisitionReadinessGate {
  const scoreRedFlags = deal.latest_score?.red_flags || [];
  const riskFlags = deal.risk_flags || [];
  const hardRiskCount = riskFlags.filter(isHardRiskFlag).length;

  if (scoreRedFlags.length > 0 || hardRiskCount > 0) {
    return acquisitionGate(
      "risk",
      "Risikomatrix",
      "block",
      scoreRedFlags.length > 0
        ? `${scoreRedFlags.length} rote Flagge${scoreRedFlags.length === 1 ? "" : "n"} im Score.`
        : `${hardRiskCount} harte Risikoflagge${hardRiskCount === 1 ? "" : "n"} offen.`,
      ["Rote Flaggen vor Freigabe in Memo, Preislogik und Due-Diligence-Plan klaeren."]
    );
  }

  if (!deal.latest_score) {
    return acquisitionGate(
      "risk",
      "Risikomatrix",
      "review",
      "Scoring/Risikopruefung fehlt.",
      ["Scoring starten und rote Flaggen erfassen."]
    );
  }

  if (riskFlags.length > 0) {
    return acquisitionGate(
      "risk",
      "Risikomatrix",
      "review",
      `${riskFlags.length} Risikopunkt${riskFlags.length === 1 ? "" : "e"} offen.`,
      ["Offene Risikopunkte vor finalem Angebot bewerten und bepreisen."]
    );
  }

  return acquisitionGate(
    "risk",
    "Risikomatrix",
    "pass",
    "Keine harten roten Flaggen im aktuellen Score.",
    []
  );
}

function acquisitionGate(
  key: string,
  label: string,
  status: AcquisitionReadinessGateStatus,
  summary: string,
  actions: string[]
): AcquisitionReadinessGate {
  return {
    key,
    label,
    status,
    statusLabel: acquisitionGateStatusLabel(status),
    tone: acquisitionGateTone(status),
    summary,
    actions: uniqueItems(actions)
  };
}

function acquisitionGateStatusLabel(status: AcquisitionReadinessGateStatus): string {
  if (status === "pass") return "Bestanden";
  if (status === "block") return "Blockiert";
  return "Pruefen";
}

function acquisitionGateTone(status: AcquisitionReadinessGateStatus): ReturnType<typeof scoreTone> {
  if (status === "pass") return "good";
  if (status === "block") return "risk";
  return "watch";
}

function acquisitionReadinessHeadline(status: AcquisitionReadinessSummary["status"]): string {
  if (status === "ready") return "Ankaufsfreigabe moeglich";
  if (status === "needs_review") return "Ankaufsreif mit offenen Pruefpunkten";
  return "Noch nicht ankaufsreif";
}

function acquisitionReadinessTone(status: AcquisitionReadinessSummary["status"]): ReturnType<typeof scoreTone> {
  if (status === "ready") return "good";
  if (status === "blocked") return "risk";
  return "watch";
}

function isHardFinancingFlag(flag: string): boolean {
  const normalized = flag.toLowerCase();
  return (
    normalized.includes("negative_cashflow") ||
    normalized.includes("dscr") ||
    normalized.includes("debt") ||
    normalized.includes("financing")
  );
}

function isHardRiskFlag(flag: Record<string, string | number | null>): boolean {
  const severity = String(flag.severity ?? flag.level ?? flag.status ?? "").toLowerCase();
  return severity === "high" || severity === "critical" || severity === "red" || severity === "block";
}

function currencyText(value: number): string {
  return formatCurrency(value).replace(/\s/g, " ");
}

function cashflowTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) return "empty";
  return value >= 0 ? "good" : "risk";
}

function dscrTone(value: number | null): ReturnType<typeof scoreTone> {
  if (value === null) return "empty";
  if (value >= 1.1) return "good";
  if (value >= 1) return "watch";
  return "risk";
}

function uniqueItems(items: string[]): string[] {
  return [...new Set(items)];
}

export function openStreetMapSearchUrl(address: string | null | undefined): string | null {
  const query = (address || "").trim();
  if (!query) {
    return null;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

export function parseCoordinatePaste(input: string): { latitude: number; longitude: number } | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const mlat = url.searchParams.get("mlat");
    const mlon = url.searchParams.get("mlon");
    const fromParams = parseCoordinatePair(mlat, mlon);
    if (fromParams) {
      return fromParams;
    }
  } catch {
    // Not a URL; continue with plain coordinate parsing.
  }

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const parsed = parseCoordinatePair(match?.[1] ?? null, match?.[2] ?? null);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseCoordinatePair(latitude: string | null | undefined, longitude: string | null | undefined) {
  if (!latitude || !longitude) {
    return null;
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { latitude: lat, longitude: lon };
}
