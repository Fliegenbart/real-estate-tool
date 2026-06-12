from __future__ import annotations

import email
import imaplib
import json
import os
from email.message import Message
from pathlib import Path
from typing import Optional

import httpx

# IMAP poller: reads unseen Suchagenten mails from a Gmail label and feeds
# them into POST /api/listings/import/email. Runs via launchd/cron, see
# scripts/de.davidwegener.immo-poller.plist and the README.
#
# Config via env vars (or backend/.env):
#   IMAP_HOST      default imap.gmail.com
#   IMAP_USER      e.g. davidwegenertext@gmail.com
#   IMAP_PASSWORD  Google App-Passwort (NOT the account password)
#   IMAP_FOLDER    default immo-agent (the Gmail label)
#   API_BASE_URL   default http://localhost:8000/api

SOURCE_BY_DOMAIN = {
    "immobilienscout24": "immoscout_alert",
    "immoscout24": "immoscout_alert",
    "immowelt": "immowelt_alert",
    "kleinanzeigen": "kleinanzeigen_alert",
    "ebay-kleinanzeigen": "kleinanzeigen_alert",
    "immonet": "immonet_alert",
}


def load_env_file(path: Path) -> None:
    """Minimal .env loader; existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def detect_source(from_address: str) -> str:
    lowered = (from_address or "").lower()
    for domain, source in SOURCE_BY_DOMAIN.items():
        if domain in lowered:
            return source
    return "email_alert"


def extract_body(message: Message) -> str:
    """Prefer HTML (the parser strips tags), fall back to plain text."""
    html_part: Optional[str] = None
    text_part: Optional[str] = None
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        content_type = part.get_content_type()
        if content_type not in {"text/html", "text/plain"}:
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        charset = part.get_content_charset() or "utf-8"
        try:
            decoded = payload.decode(charset, errors="replace")
        except LookupError:
            decoded = payload.decode("utf-8", errors="replace")
        if content_type == "text/html" and html_part is None:
            html_part = decoded
        elif content_type == "text/plain" and text_part is None:
            text_part = decoded
    return html_part or text_part or ""


def import_mail_content(api_base: str, content: str, source: str) -> tuple[bool, str]:
    """Returns (processed, detail). processed=True also for 'no listings found'
    so the mail gets marked seen instead of retrying forever."""
    try:
        response = httpx.post(
            f"{api_base}/listings/import/email",
            json={"content": content, "source": source},
            timeout=30,
        )
    except httpx.HTTPError as error:
        return False, f"API nicht erreichbar: {error}"
    if response.status_code == 201:
        body = response.json()
        return True, f"{body.get('imported', 0)} neu, {body.get('updated', 0)} aktualisiert"
    if response.status_code == 400:
        return True, "kein Listing mit Preis in der Mail"
    return False, f"API-Fehler {response.status_code}"


class ProcessedStore:
    """Remembers processed Message-IDs in a JSON file so the read/unread
    state of the mailbox is irrelevant (mail clients like Airmail mark mails
    read on sync)."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._ids: set[str] = set()
        if path.exists():
            try:
                self._ids = set(json.loads(path.read_text()))
            except (json.JSONDecodeError, TypeError):
                self._ids = set()

    def is_processed(self, message_id: str) -> bool:
        return message_id in self._ids

    def mark_processed(self, message_id: str) -> None:
        self._ids.add(message_id)
        self.path.write_text(json.dumps(sorted(self._ids), indent=0))


def poll_mailbox(
    host: str,
    user: str,
    password: str,
    folder: str,
    api_base: str,
    store: ProcessedStore,
) -> dict:
    stats = {"checked": 0, "imported": 0, "skipped": 0, "failed": 0, "already_done": 0}
    connection = imaplib.IMAP4_SSL(host)
    try:
        connection.login(user, password)
        status, _ = connection.select(f'"{folder}"', readonly=True)
        if status != "OK":
            raise RuntimeError(
                f"IMAP-Ordner '{folder}' nicht gefunden - existiert das Gmail-Label und ist IMAP aktiv?"
            )
        status, data = connection.search(None, "ALL")
        if status != "OK":
            raise RuntimeError("IMAP-Suche fehlgeschlagen.")
        for sequence_id in data[0].split():
            stats["checked"] += 1
            status, header_data = connection.fetch(
                sequence_id, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])"
            )
            if status != "OK" or not header_data or header_data[0] is None:
                stats["failed"] += 1
                continue
            header = email.message_from_bytes(header_data[0][1])
            message_key = (header.get("Message-ID") or "").strip()
            if not message_key:
                message_key = f"{folder}-seq-{sequence_id.decode()}"
            if store.is_processed(message_key):
                stats["already_done"] += 1
                continue

            status, fetched = connection.fetch(sequence_id, "(BODY.PEEK[])")
            if status != "OK" or not fetched or fetched[0] is None:
                stats["failed"] += 1
                continue
            message = email.message_from_bytes(fetched[0][1])
            source = detect_source(message.get("From", ""))
            body = extract_body(message)
            processed, detail = import_mail_content(api_base, body, source)
            subject = (message.get("Subject") or "")[:60]
            if processed:
                store.mark_processed(message_key)
                if "neu" in detail:
                    stats["imported"] += 1
                else:
                    stats["skipped"] += 1
                print(f"[ok] {subject} -> {detail}")
            else:
                stats["failed"] += 1
                print(f"[retry spaeter] {subject} -> {detail}")
    finally:
        try:
            connection.logout()
        except Exception:
            pass
    return stats


def main() -> int:
    load_env_file(Path(__file__).resolve().parents[2] / ".env")
    host = os.environ.get("IMAP_HOST", "imap.gmail.com")
    user = os.environ.get("IMAP_USER", "")
    password = os.environ.get("IMAP_PASSWORD", "")
    folder = os.environ.get("IMAP_FOLDER", "immo-agent")
    api_base = os.environ.get("API_BASE_URL", "http://localhost:8000/api")

    if not user or not password:
        print("IMAP_USER / IMAP_PASSWORD fehlen (backend/.env). Abbruch.")
        return 1

    state_path = Path(
        os.environ.get(
            "POLLER_STATE_FILE",
            str(Path(__file__).resolve().parents[2] / ".poller_seen.json"),
        )
    )
    store = ProcessedStore(state_path)
    stats = poll_mailbox(host, user, password, folder, api_base, store)
    print(
        f"Fertig: {stats['checked']} Mails im Label, {stats['already_done']} bereits verarbeitet, "
        f"{stats['imported']} mit Treffern importiert, {stats['skipped']} ohne Listings, "
        f"{stats['failed']} fuer Retry offen gelassen."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
