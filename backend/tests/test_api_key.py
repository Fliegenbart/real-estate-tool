from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_api_open_without_configured_key(monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    assert client.get("/api/listings").status_code == 200


def test_api_requires_key_when_configured(monkeypatch):
    monkeypatch.setenv("API_KEY", "geheim123")

    assert client.get("/api/listings").status_code == 401
    assert client.get("/api/listings", headers={"X-API-Key": "falsch"}).status_code == 401
    assert client.get("/api/listings", headers={"X-API-Key": "geheim123"}).status_code == 200
    # Health stays public for uptime monitoring.
    assert client.get("/api/health").status_code == 200
