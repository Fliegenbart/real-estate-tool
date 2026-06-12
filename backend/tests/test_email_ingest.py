from decimal import Decimal

from app.services.email_ingest import parse_alert_email


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
