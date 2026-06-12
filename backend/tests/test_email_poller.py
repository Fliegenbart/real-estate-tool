from email.message import EmailMessage

from app.services.email_poller import detect_source, extract_body, load_env_file


def test_detect_source_maps_portal_domains():
    assert detect_source("ImmobilienScout24 <agent@mailing.immobilienscout24.de>") == "immoscout_alert"
    assert detect_source("noreply@immowelt.de") == "immowelt_alert"
    assert detect_source("info@kleinanzeigen.de") == "kleinanzeigen_alert"
    assert detect_source("makler@example.com") == "email_alert"
    assert detect_source("") == "email_alert"


def test_extract_body_prefers_html_over_plain_text():
    message = EmailMessage()
    message["From"] = "agent@immowelt.de"
    message.set_content("Nur Text: 2 Zimmer, 119.000 EUR")
    message.add_alternative("<html><b>2 Zimmer</b> 119.000 &euro;</html>", subtype="html")

    body = extract_body(message)
    assert "<html>" in body


def test_extract_body_falls_back_to_plain_text():
    message = EmailMessage()
    message.set_content("Kaufpreis: 98.000 € | 58 m²")

    body = extract_body(message)
    assert "98.000" in body


def test_load_env_file_does_not_override_existing_env(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text('IMAP_USER="datei@example.com"\nIMAP_FOLDER=immo-agent\n# Kommentar\n')
    monkeypatch.setenv("IMAP_USER", "umgebung@example.com")
    monkeypatch.delenv("IMAP_FOLDER", raising=False)

    load_env_file(env_file)

    import os

    assert os.environ["IMAP_USER"] == "umgebung@example.com"
    assert os.environ["IMAP_FOLDER"] == "immo-agent"
