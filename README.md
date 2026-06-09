# Acquisition Desk MVP

Professionelles MVP fuer eine deutsche vermoegensverwaltende GmbH, die Wohnungsankaeufe identifiziert, anreichert, underwritet, bewertet und in einer Pipeline verwaltet.

## Was gebaut ist

- Backend mit FastAPI, SQLAlchemy 2, Pydantic, Alembic und SQLite-Fallback.
- PostgreSQL/PostGIS Setup ueber Docker Compose.
- Listing-Import fuer manuelle JSON/CSV-Daten plus Demo-Seed.
- Normalisierte MVP-Modelle: Listing, Property, Unit, Deal, UnderwritingCase, FinancingScenario, TaxScenario, LocationScore, RiskFlag, DealScore, Document, Pipeline.
- Underwriting Engine mit Decimal-Rechnung fuer Kaufpreis, Nebenkosten, Finanzierung, Cashflow, DSCR, Zielkaufpreis, Exit und IRR-Naeherung.
- Vereinfachtes GmbH-Steuermodul mit KSt, SolZ, GewSt-Flag, AfA und Zinsabzug.
- Mietrecht-Plausibilitaet fuer Mietpreisbremse, Referenzmiete, Ausnahmen und fehlende Daten.
- Erklaerbarer Score von 0 bis 100 mit Kategorien, Faktoren, Red Flags und naechster Aktion.
- Mock Location Enrichment plus manuell pflegbare Lage-Scores.
- Dokument-Metadaten und manuelle WEG-/Technik-Risiko-Flags.
- Next.js UI: Dashboard, Listings, Deal-Detail, Pipeline-Kanban und Investment Memo.

## Lokal starten

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm i
npm run dev
```

Danach:

- Frontend: http://localhost:3000
- Backend API Docs: http://localhost:8000/docs
- Demo-Daten in der UI ueber `Demo laden` oder per API: `POST /api/listings/import/demo`

## Docker starten

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- PostGIS: localhost:5432

## Tests

Backend:

```bash
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

## Wichtige Formeln

- `all_in_purchase_price = purchase_price + broker_fee + transfer_tax + notary_land_registry + initial_capex`
- `annual_cold_rent = monthly_cold_rent * 12`
- `gross_initial_yield = annual_cold_rent / purchase_price`
- `NOI = annual_cold_rent - non_recoverable_costs - maintenance - vacancy_allowance - property_management`
- `net_initial_yield = NOI / all_in_purchase_price`
- `loan_amount = purchase_price * loan_to_value`
- `annual_debt_service = loan_amount * (interest_rate + amortization_rate)`
- `monthly_cashflow_before_tax = (NOI - annual_debt_service) / 12`
- `DSCR = NOI / annual_debt_service`
- `maximum_purchase_price_for_target_yield` rechnet vom Ziel-NOI-Preis rueckwaerts auf Kaufpreis vor Capex und Kaufnebenkosten.

Steuer ist bewusst nur eine Naeherung. Die App zeigt und speichert die Warnung: Steuerberechnung muss durch einen Steuerberater geprueft werden.

## API-Auswahl

- `GET /api/listings`
- `POST /api/listings`
- `POST /api/listings/import`
- `POST /api/listings/import/demo`
- `POST /api/listings/{id}/convert-to-deal`
- `GET /api/deals`
- `GET /api/deals/{id}`
- `POST /api/deals/{id}/underwrite`
- `POST /api/deals/{id}/score`
- `PATCH /api/deals/{id}/financing`
- `PATCH /api/deals/{id}/tax`
- `PATCH /api/deals/{id}/rent-law`
- `PATCH /api/deals/{id}/location`
- `POST /api/deals/{id}/risk-flags`
- `POST /api/deals/{id}/documents`
- `PATCH /api/deals/{id}/pipeline`
- `GET /api/deals/{id}/investment-memo`
- `GET /api/dashboard`

## Annahmen

- Demo-Adressen sind synthetisch und keine echten Angebote.
- Kein Web Scraping. Zukuenftige Quellen sollen ueber lizenzierte APIs, Broker-Feeds, E-Mail-Parser oder Nutzer-Uploads kommen.
- SQLite ist fuer lokale Tests ok. Fuer echte Nutzung sollte PostgreSQL/PostGIS verwendet werden.
- Mietrecht wird nicht automatisiert entschieden. Es ist nur eine Plausibilitaetspruefung mit klaren Risiko-Hinweisen.
- Lage-Scores sind im MVP Mock-/Manual-Daten.

## Bekannte Grenzen

- Kein Login/Rechtemodell.
- Keine echte Dokument-Extraktion aus PDFs.
- Kein PDF-Export fuer Investment Memos.
- Keine echten Mietspiegel-, BORIS-D-, Zensus-, DWD- oder OSM-Daten.
- Kein vollstaendiges deutsches Steuer-/Gewerbesteuer-/Zinsschrankenmodell.
- npm meldet nach Installation Abhaengigkeits-Audit-Warnungen; ein Upgrade-Pass sollte separat geplant werden.

## Naechste Engineering-Schritte

1. Authentifizierung und Rollen fuer interne Nutzer.
2. PostGIS-Geometrien, Geocoding und echte Lagequellen anbinden.
3. Dokument-Upload mit Speicher, OCR und strukturierter Extraktion.
4. Mietspiegel-/BORIS-D-Import als versionierte Datenquelle.
5. Szenario-Vergleiche fuer Finanzierung, Capex, Miete und Exit.
6. Audit-Log fuer Annahmen, Score-Laeufe und Pipeline-Entscheidungen.
7. PDF-Export fuer Investment Memos.
