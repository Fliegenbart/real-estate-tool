from fastapi.testclient import TestClient


ALERT_MAIL = """
Neue Treffer aus Ihrem Suchauftrag:

Leipzig Kapitalanlage mit Balkon
2 Zimmer | 54 m² | Kaufpreis: 82.000 €
04177 Leipzig
Kaltmiete: 650 €
https://www.immobilienscout24.de/expose/700000001


Chemnitz vermietete Wohnung am Kassberg
2 Zimmer | 58 m² | Kaufpreis: 94.000 €
09112 Chemnitz
Kaltmiete: 610 €
https://www.immobilienscout24.de/expose/700000002


Dresden kleine ETW nahe Uni
1,5 Zimmer | 42 m² | Kaufpreis: 112.500 €
01159 Dresden
Kaltmiete: 760 €
https://www.immobilienscout24.de/expose/700000003


Hannover solide Bestandswohnung
3 Zimmer | 72 m² | Kaufpreis: 135.000 €
30159 Hannover
Kaltmiete: 820 €
https://www.immobilienscout24.de/expose/700000004
"""


def import_alert_listings(client: TestClient) -> list[dict]:
    response = client.post(
        "/api/listings/import/email",
        json={"content": ALERT_MAIL, "source": "gmail_alert_test"},
    )
    assert response.status_code == 201
    return client.get("/api/listings").json()


def prepare_deal(client: TestClient) -> int:
    listings = import_alert_listings(client)
    listing_id = listings[0]["id"]
    deal = client.post(f"/api/listings/{listing_id}/convert-to-deal").json()
    client.post(f"/api/deals/{deal['id']}/underwrite")
    return deal["id"]
