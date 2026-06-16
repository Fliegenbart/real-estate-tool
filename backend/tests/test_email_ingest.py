from decimal import Decimal

from app.services.email_ingest import parse_alert_email, parse_single_expose


def test_parse_single_expose_pulls_full_field_set():
    expose = """
    Charmante 3-Zimmer-Eigentumswohnung als Kapitalanlage
    Kaufpreis: 149.000 €
    Wohnflaeche: 72,5 m²
    3 Zimmer
    Baujahr: 1994
    Energieeffizienzklasse D
    Hausgeld: 245 €
    Kaltmiete: 540 €
    09130 Chemnitz, Sonnenberg
    https://www.immobilienscout24.de/expose/151617181
    """
    draft = parse_single_expose(expose)

    assert draft is not None
    assert draft["purchase_price"] == Decimal("149000")
    assert draft["living_area_sqm"] == Decimal("72.5")
    assert draft["number_of_rooms"] == Decimal("3")
    assert draft["construction_year"] == 1994
    assert draft["energy_class"] == "D"
    assert draft["house_money_monthly"] == Decimal("245")
    assert draft["cold_rent_monthly"] == Decimal("540")
    assert draft["is_rented"] is True
    assert draft["city"] == "Chemnitz"
    assert draft["postal_code"] == "09130"
    assert draft["external_id"] == "151617181"


def test_parse_single_expose_returns_none_without_price():
    assert parse_single_expose("Schoene Wohnung, Besichtigung nach Absprache.") is None


def test_parse_single_expose_handles_html_and_kaufpreis_priority():
    html = """
    <h1>2-Zimmer-Wohnung</h1>
    <table><tr><td>Hausgeld</td><td>180 €</td></tr>
    <tr><td>Kaufpreis</td><td>95.000 €</td></tr></table>
    <p>54 m², 04315 Leipzig</p>
    """
    draft = parse_single_expose(html)
    # Must pick the Kaufpreis, not the smaller Hausgeld figure.
    assert draft["purchase_price"] == Decimal("95000")
    assert draft["house_money_monthly"] == Decimal("180")


SAMPLE_TEXT_MAIL = """
Ihr Suchauftrag "ETW Sachsen bis 150k" hat 2 neue Treffer:

Helle 2-Zimmer-Wohnung mit Balkon in Uni-Naehe
2 Zimmer | 54,5 m² | Kaufpreis: 119.000 €
09126 Chemnitz, Bernsdorf
Kaltmiete: 360 € (vermietet)
https://www.immobilienscout24.de/expose/158234711


Gepflegte 3-Raum-Wohnung als Kapitalanlage
3 Zimmer | 68 m² | Kaufpreis: 142.500 €
01159 Dresden, Loebtau
https://www.immobilienscout24.de/expose/158234925
"""


def test_parses_multiple_listings_from_alert_email():
    rows = parse_alert_email(SAMPLE_TEXT_MAIL)

    assert len(rows) == 2
    first, second = rows

    assert first["purchase_price"] == Decimal("119000")
    assert first["living_area_sqm"] == Decimal("54.5")
    assert first["number_of_rooms"] == Decimal("2")
    assert first["postal_code"] == "09126"
    assert first["city"] == "Chemnitz"
    assert first["cold_rent_monthly"] == Decimal("360")
    assert first["is_rented"] is True
    assert first["external_id"] == "158234711"
    assert "immobilienscout24" in first["listing_url"]

    assert second["purchase_price"] == Decimal("142500")
    assert second["city"] == "Dresden"


def test_parses_html_mail_and_skips_blocks_without_price():
    html = """
    <html><body>
    <div><h2>Neue Treffer</h2></div>
    <div>Charmante 1-Zimmer-Wohnung<br>32 m² | Kaufpreis: 65.000 €<br>
    04177 Leipzig<br><a href="https://www.immobilienscout24.de/expose/99887766">Zum Expose</a></div>
    <div>Hier koennte Ihre Werbung stehen</div>
    </body></html>
    """
    rows = parse_alert_email(html)

    assert len(rows) == 1
    assert rows[0]["purchase_price"] == Decimal("65000")
    assert rows[0]["city"] == "Leipzig"


def test_returns_empty_for_unrelated_mail():
    assert parse_alert_email("Hallo, wie besprochen melde ich mich naechste Woche.") == []


def test_skips_rental_alert_and_search_criteria_blocks():
    mail = """
Ihr Suchauftrag: Mietwohnung, in Leipzig, bis 80.000 € Kaltmiete

1 neues Angebot fuer Mietwohnung in Leipzig
2 Zimmer | 60 m² | Kaltmiete: 650 €
04177 Leipzig
https://www.immobilienscout24.de/expose/111222333
"""
    assert parse_alert_email(mail) == []


def test_skips_blocks_without_expose_url():
    mail = """
Tolle Wohnung als Kapitalanlage
2 Zimmer | 54 m² | Kaufpreis: 119.000 €
09126 Chemnitz
"""
    assert parse_alert_email(mail) == []


def test_preserves_href_urls_when_stripping_html():
    html = """
    <div>Wohnung zum Kauf, Kapitalanlage<br>
    58 m² | Kaufpreis: 98.000 €<br>
    09112 Chemnitz<br>
    <a href="https://www.immobilienscout24.de/expose/444555666">Zum Angebot</a></div>
    """
    rows = parse_alert_email(html)
    assert len(rows) == 1
    assert rows[0]["external_id"] == "444555666"
    assert "expose/444555666" in rows[0]["listing_url"]


def test_parses_dense_immoscout_html_alert_with_search_price_before_listing_price():
    html = """
    <html><body>
    <a href="https://push.search.is24.de/email/Suche/controller/executeSavedSearch/region?realestatetype=apartmentbuy&geocodes=/de/sachsen/leipzig&price=-120000.0&utm_content=search_link">
    Eigentumswohnung, in Leipzig, bis 120.000 € Kaufpreis</a>
    <a href="https://push.search.is24.de/email/expose/168629678?PID=66620801&savedSearchId=200774780&immoTypeId=2&utm_content=expose_link&referrer=ff_listing">Ansehen</a>
    <a href="https://push.search.is24.de/email/expose/168629678?PID=66620801&savedSearchId=200774780&immoTypeId=2&utm_content=expose_link&referrer=ff_listing">Bild</a>
    INVEST: 2-Zimmer in TOP-Lage Leipzig Gohlis *1700€/qm* + Außen-Stellplatz
    105.000 € 61,73 m² 2 Zi. Gohlis-Mitte, Leipzig Lukas Lämmel Immobilien
    <a href="https://www.immobilienscout24.de/baufinanzierung/finanzierungsangebote/?exposeId=168629678">Finanzierung</a>
    </body></html>
    """

    rows = parse_alert_email(html, source="immoscout_alert")

    assert len(rows) == 1
    assert rows[0]["source"] == "immoscout_alert"
    assert rows[0]["external_id"] == "168629678"
    assert rows[0]["purchase_price"] == Decimal("105000")
    assert rows[0]["living_area_sqm"] == Decimal("61.73")
    assert rows[0]["number_of_rooms"] == Decimal("2")
    assert rows[0]["city"] == "Leipzig"
    assert "INVEST" in rows[0]["title"]
