from email.message import EmailMessage
from pathlib import Path

from app.services import email_poller
from app.services.email_poller import ProcessedStore, detect_source, extract_body, load_env_file, poll_mailbox


def test_processed_store_persists_between_instances(tmp_path):
    path = tmp_path / "seen.json"
    store = ProcessedStore(path)
    assert not store.is_processed("<mail-1@portal>")

    store.mark_processed("<mail-1@portal>")
    assert store.is_processed("<mail-1@portal>")

    reloaded = ProcessedStore(path)
    assert reloaded.is_processed("<mail-1@portal>")
    assert not reloaded.is_processed("<mail-2@portal>")


def test_processed_store_survives_corrupt_state_file(tmp_path):
    path = tmp_path / "seen.json"
    path.write_text("kein json {")
    store = ProcessedStore(path)
    assert not store.is_processed("<mail-1@portal>")


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


def test_production_compose_passes_gmail_label_configuration_to_poller():
    compose = (Path(__file__).resolve().parents[2] / "docker-compose.prod.yml").read_text()

    assert "IMAP_FOLDER: ${IMAP_FOLDER:-}" in compose
    assert "IMAP_SENDERS: ${IMAP_SENDERS:-}" in compose


def test_poll_mailbox_reads_gmail_all_mail_and_imports_portal_alert(tmp_path, monkeypatch):
    message = EmailMessage()
    message["From"] = "ImmobilienScout24 <mailing@immobilienscout24.de>"
    message["Subject"] = "Neue Kaufangebote"
    message["Message-ID"] = "<gmail-alert-1@example.test>"
    message.set_content(
        "2-Zimmer-Wohnung\n"
        "2 Zimmer | 58 m² | Kaufpreis: 98.000 €\n"
        "09112 Chemnitz\n"
        "https://www.immobilienscout24.de/expose/555111222\n"
    )

    class FakeGmail:
        def __init__(self, host: str) -> None:
            self.host = host
            self.selected_folder = None
            self.searches: list[str] = []

        def login(self, user: str, password: str):
            return "OK", []

        def list(self):
            return "OK", [b'(\\HasNoChildren \\All) "/" "[Gmail]/All Mail"']

        def select(self, folder: str, readonly: bool = False):
            self.selected_folder = folder
            return "OK", []

        def search(self, charset: None, criteria: str):
            self.searches.append(criteria)
            if 'FROM "immobilienscout24"' in criteria:
                return "OK", [b"1"]
            return "OK", [b""]

        def fetch(self, sequence_id: bytes, query: str):
            if "HEADER.FIELDS" in query:
                header = b"Message-ID: <gmail-alert-1@example.test>\r\n\r\n"
                return "OK", [(b"1", header)]
            return "OK", [(b"1", message.as_bytes())]

        def logout(self):
            return "OK", []

    fake_connections: list[FakeGmail] = []

    def fake_imap(host: str) -> FakeGmail:
        connection = FakeGmail(host)
        fake_connections.append(connection)
        return connection

    imported: list[tuple[str, str, str]] = []

    def fake_import(api_base: str, content: str, source: str) -> tuple[bool, str]:
        imported.append((api_base, content, source))
        return True, "1 neu, 0 aktualisiert"

    monkeypatch.setattr(email_poller.imaplib, "IMAP4_SSL", fake_imap)
    monkeypatch.setattr(email_poller, "import_mail_content", fake_import)

    stats = poll_mailbox(
        "imap.gmail.com",
        "user@example.com",
        "app-password",
        "http://localhost:8000/api",
        ProcessedStore(tmp_path / "seen.json"),
    )

    assert stats["checked"] == 1
    assert stats["imported"] == 1
    assert fake_connections[0].selected_folder == '"[Gmail]/All Mail"'
    assert imported[0][2] == "immoscout_alert"
    assert "98.000" in imported[0][1]
