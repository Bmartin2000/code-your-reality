"""Separate frontend/API hosts: CORS with credentials, cookie attributes, origin check, ETag, TLS setup."""

import sys

import pytest
from fastapi.testclient import TestClient

from app import config, serve
from app.main import app
from app.services import auth

ALLOWED = "http://localhost:5173"  # in the default CORS_ORIGINS
EVIL = "https://evil.example"


def test_cors_allows_credentials_only_for_configured_origins():
    c = TestClient(app)
    ok = c.options("/api/auth/login", headers={"Origin": ALLOWED, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert ok.headers["access-control-allow-origin"] == ALLOWED
    assert ok.headers["access-control-allow-credentials"] == "true"
    bad = c.options("/api/auth/login", headers={"Origin": EVIL, "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_writes_from_foreign_origins_are_refused(client):
    assert client.post("/api/projects/sample", headers={"Origin": EVIL}).status_code == 403
    assert client.post("/api/projects/sample", headers={"Origin": ALLOWED}).status_code == 201
    assert client.post("/api/projects/sample", headers={"Origin": "http://testserver"}).status_code == 201  # same origin
    assert client.post("/api/projects/sample").status_code == 201  # no Origin (curl, server-to-server)
    assert client.get("/api/projects", headers={"Origin": EVIL}).status_code == 200  # reads are guarded by CORS


@pytest.mark.parametrize(
    ("samesite", "scheme", "expect"),
    [("lax", "http", ["samesite=lax"]), ("none", "http", ["samesite=none", "secure"]), ("lax", "https", ["samesite=lax", "secure"])],
)
def test_session_cookie_attributes(monkeypatch, samesite, scheme, expect):
    settings = config.get_settings().model_copy(update={"cookie_samesite": samesite, "cookie_domain": None})
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD

    c = TestClient(app, base_url=f"{scheme}://testserver")
    r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie
    for part in expect:
        assert part in cookie
    if "secure" not in expect:
        assert "secure" not in cookie


def test_unchanged_polls_get_304(client):
    first = client.get("/api/projects")
    tag = first.headers["etag"]
    assert first.headers["cache-control"] == "private, no-cache"
    again = client.get("/api/projects", headers={"If-None-Match": tag})
    assert again.status_code == 304 and again.content == b""
    client.post("/api/projects/sample")
    assert client.get("/api/projects", headers={"If-None-Match": tag}).status_code == 200  # changed: new body
    assert "etag" not in client.get("/health").headers  # only API JSON


def test_tls_settings_are_checked_before_start(tmp_path, monkeypatch, capsys):
    cert = tmp_path / "cert.pem"
    cert.write_text("x")
    s = config.Settings(_env_file=None, ssl_certfile=cert)
    assert "Set both SSL_CERTFILE and SSL_KEYFILE" in s.tls_problems()[0]
    s = config.Settings(_env_file=None, ssl_certfile=cert, ssl_keyfile=tmp_path / "missing.pem")
    assert "doesn't exist" in s.tls_problems()[0]
    monkeypatch.setattr(serve, "get_settings", lambda: s)
    monkeypatch.setattr(sys, "argv", ["serve"])
    assert serve.main() == 2  # refuses to start without working HTTPS
    assert "Configuration error" in capsys.readouterr().err
    assert config.Settings(_env_file=None).port == 7413
    warn = config.Settings(_env_file=None, cookie_samesite="none").deployment_warnings()
    assert warn and "needs HTTPS" in warn[0]


def test_health_check_command_reports_down(monkeypatch):
    s = config.Settings(_env_file=None, port=9)  # nothing listens there
    monkeypatch.setattr(serve, "get_settings", lambda: s)
    monkeypatch.setattr(sys, "argv", ["serve", "--check"])
    assert serve.main() == 1
