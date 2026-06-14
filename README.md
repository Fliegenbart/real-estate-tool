# Acquisition Desk MVP

Professionelles MVP fuer eine deutsche vermoegensverwaltende GmbH, die Wohnungsankaeufe identifiziert, anreichert, underwritet, bewertet und in einer Pipeline verwaltet.

## Module (Stand Juni 2026)

- **Verhandlungsdossier** (`/deals/{id}/dossier`): Red Flags werden zu bezifferten Preisabschlaegen (Energieklasse-Sanierung, Capex, ueberhoehte nicht umlagefaehige Kosten, Mietpreisbremse-Deckel, Markt-Premium, WEG-Sonderumlagen), plus Preisleiter (Anker/Ziel/Walk-away), Gespraechsleitfaden und Verkaeufermotiv-Taktik.
- **Kaufmaschine vvGmbH** (`/akquise`, API `/api/acquisition/command-center`): verbindet Deals, Scores, Eigenkapitalbedarf, DSCR, Cashflow, KfW-/BEG-Indikationen und Listing-Signale zu Buy/Nachverhandeln/Watch/Ablehnen. Rechnet die Nordstern-Kennzahl `Wohnungen je 100k Eigenkapital` und einen 10-Jahres-Wachstumsplan.
- **Bankenpaket** (`/deals/{id}/bank`, API `/api/deals/{id}/bank-package`): bankfaehige Zusammenfassung mit Kaufpreis, All-in, Darlehenswunsch, Eigenkapitalbedarf, DSCR, Cashflow, Staerken/Risiken und fehlenden Bankunterlagen. Die Seite ist per Browser als PDF druckbar.
- **WEG-Gesundheitsscore** (Deal-Detail): Ruecklage vs. Alters-Benchmark, Hausgeld-Kosten, Zahlungsmoral (Rueckstaende), Sanierungsstau/Sonderumlagen, Governance. Flags fliessen automatisch in das Deal-Scoring ein; fehlende Daten erzeugen eine Dokumenten-Anforderungsliste.
- **Capital-Stack-Designer** (`/deals/{id}/finanzierung`): Tranchen aus Bankdarlehen, Gesellschafterdarlehen der operativen GmbH, Verkaeuferdarlehen und Eigenkapital. Rechnet DSCR, Cashflow, Mischzins, Finanzierungsluecke und das Netto-Steuerleck von Intercompany-Zinsen (~30% beim Darlehensgeber vs. ~15,8% Abzug in der vvGmbH) inkl. Fremdvergleichs-Checkliste.
- **Chemnitz-Hebel** (`/finanzierung`): Vier Strategien fuer eine geschenkte, abbezahlte Wohnung (privat halten / an vvGmbH verkaufen mit AfA-Step-up / einlegen / als Zusatzsicherheit) mit Einmalkosten, Steuerlast, AfA-Schild, freigesetzter Liquiditaet und Steuerberater-Fragen je Variante.
- **Steuerberater-Briefing** (`/api/deals/{id}/tax-briefing`): generierte Fragenliste je Deal (erweiterte Kuerzung, AfA/Bodenrichtwert, Gesellschafterdarlehen, GrESt, Schenkungs-Reihenfolge).
- **Sourcing**: E-Mail-Import fuer Suchagenten-Mails (Listings-Seite), Upsert per external_id, Preisverlauf je Listing, Tage-am-Markt und Preisreduktionen als Verhandlungshebel.
- **Underwriting-Haertung**: echter Annuitaeten-Tilgungsplan, korrekte Restschuld, jahresgenaue After-Tax-IRR, Zinsbindungs-Stresstest (Anschlusszins +2% Default).
- **Deutschland-Daten**: Grunderwerbsteuer je Bundesland (automatisch aus `federal_state`), Mietpreisbremse-Lookup je Stadt/Bundesland statt Pauschalannahme.
- **Standort-Screener** (`/standorte`): datengetriebene Stadt-Empfehlungen fuer 20 Jahre Halten + Portfolio-Exit. Erklaerbarer Score (Ertragskraft 35%, Nachfragestabilitaet 30% mit Prognose 2040, Wirtschaftsbasis 20%, Exit-Liquiditaet 15%) mit harten Gates fuer strukturelles Schrumpfen (Leerstand x Prognose) und renditeschwache Maerkte. 50-Staedte-Startschaetzung als Seed; CSV-Import fuer INKAR/Zensus/Wegweiser (`POST /api/regions/import`, freies Spalten-Mapping); eigener Listing-Zufluss ueberschreibt Schaetzwerte (`POST /api/regions/refresh-own-metrics`). Deals zeigen den Regions-Score, LocationScores werden aus Regionsdaten gefuellt.
- **Opportunity-Signale** (Assetfy-inspiriert): LONG_TIME_ON_MARKET, PRICE_REDUCTION, BELOW_MARKET_PRICE, RENT_BELOW_MARKET, ENERGY_RISK, HIGH_HOUSE_MONEY, MISSING_WEG_DOCUMENTS, POSSIBLE_DISTRESSED_SALE (Keyword-Analyse im Inseratstext) - als Chips in den Listings und als Panel im Deal.
- **Chancen/Risiken/Mitigation-Matrix** (`/api/deals/{id}/risk-matrix` + Deal-Panel): Jede Red Flag bekommt Erklaerung, Due-Diligence-Aktionen, Mitigation und Preisfolge. Fliesst auch ins Memo ein.
- **Datenquellen-Register** (`/datenquellen`): Quelle, Lizenz, Attribution, Abdeckung, Datenstand, letzter Import, Verlaesslichkeit - mit Seed fuer BORIS-D, Mietspiegel, Suchagenten, ZVG, Zensus.
- **Geo-Kontext je Deal**: Bodenrichtwert (mit Quellen-Referenz und Stichtag), Flurstueck, B-Plan, Milieuschutz, Sanierungsgebiet, Denkmalschutz - manuell erfasst, mit Datenlage-Confidence.

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

## Produktion (Hetzner + Vercel)

Das Backend laeuft produktiv auf dem Hetzner-Server (5.9.106.75) unter `/opt/immo-tool`:
PostGIS + API (Port 8201) + Mail-Poller als Docker-Stack (`docker-compose.prod.yml`,
Secrets in `/opt/immo-tool/.env`). Die API verlangt einen `X-API-Key` (Env `API_KEY`);
`/api/health` bleibt offen. Firewall: Port 8201 ist in der DOCKER-USER-Chain per
conntrack-Regel auf den Original-Zielport freigegeben (Docker-DNAT!), persistiert via
netfilter-persistent. Ports 80/443 gehoeren VoxDrop und bleiben unberuehrt.

Das Vercel-Frontend (https://real-estate-tool-pi.vercel.app, Basic-Auth) ruft die API
same-origin unter `/backend-api/*` auf; ein Next.js-Rewrite (`BACKEND_PROXY_TARGET`)
proxyt serverseitig zum Hetzner-Backend. Vercel-Envs: `NEXT_PUBLIC_API_BASE_URL=/backend-api`,
`NEXT_PUBLIC_API_KEY`, `BACKEND_PROXY_TARGET`, `SITE_PASSWORD`.

Deploy-Update: lokal aendern, testen, dann `rsync` nach `/opt/immo-tool` und
`docker compose -f docker-compose.prod.yml up -d --build`. Der Poller-Status liegt im
Volume `poller-state`; Logs: `docker logs immo-tool-poller-1`.

Produktions-Backup fuer die echte Postgres-Datenbank:

```bash
cd /opt/immo-tool
BACKUP_DIR=/opt/immo-tool/backups/postgres ./scripts/backup_postgres.sh
```

Das Script erzeugt timestamped `pg_dump -Fc`-Backups, setzt `latest.dump` und loescht
alte Dumps nach 30 Tagen (`RETENTION_DAYS=30`, ueberschreibbar). `backups/` ist bewusst
in `.gitignore`, damit echte Daten nicht ins Repo geraten.

Taeglichen Server-Lauf installieren:

```bash
cd /opt/immo-tool
sudo ./scripts/install_postgres_backup_cron.sh
```

Default: taeglich um 03:17 Uhr Serverzeit, Log unter `/var/log/immo-postgres-backup.log`.

## Automatischer Listing-Import (E-Mail-Poller)

Suchagenten-Mails (ImmoScout/Immowelt/Kleinanzeigen) landen per Gmail-Filter im Label
`Immo-Agent` (IMAP-Ordnernamen sind case-sensitive!). Der Poller
(`app/services/email_poller.py`) liest ALLE Mails des Labels per IMAP (readonly) und
merkt sich verarbeitete Message-IDs in `backend/.poller_seen.json` - der
Gelesen-Status ist egal, Mail-Clients wie Airmail duerfen die Mails also ruhig
als gelesen syncen. Mails ohne erkennbares Listing werden einmalig uebersprungen;
bei API-Fehlern bleiben sie unverarbeitet und werden beim naechsten Lauf erneut versucht.

Setup (macOS):

1. Google App-Passwort erstellen (myaccount.google.com/apppasswords, 2FA noetig)
   und in `backend/.env` als `IMAP_PASSWORD` eintragen (Vorlage: `.env.example`).
2. launchd-Jobs installieren:

```bash
cp backend/scripts/de.davidwegener.immo-backend.plist ~/Library/LaunchAgents/
cp backend/scripts/de.davidwegener.immo-poller.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/de.davidwegener.immo-backend.plist
launchctl load ~/Library/LaunchAgents/de.davidwegener.immo-poller.plist
```

Das Backend laeuft dann dauerhaft auf Port 8000, der Poller alle 30 Minuten.
Logs: `/tmp/immo-backend.log` und `/tmp/immo-poller.log`. Manueller Lauf:
`cd backend && .venv/bin/python -m app.services.email_poller`.

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
- `GET /api/deals/{id}/bank-package`
- `POST /api/acquisition/command-center`
- `PUT /api/deals/{id}/weg-health`
- `GET /api/deals/{id}/negotiation-dossier`
- `POST /api/deals/{id}/capital-stack`
- `GET /api/deals/{id}/capital-stacks`
- `GET /api/deals/{id}/tax-briefing`
- `PATCH /api/deals/{id}` (seller_motive)
- `POST /api/listings/import/email`
- `POST /api/financing/gift-property-strategies`
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
