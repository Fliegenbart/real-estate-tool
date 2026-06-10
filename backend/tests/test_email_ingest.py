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
