"""Frontend on another origin: bearer-token sign-in, open CORS and signed media URLs."""

from fastapi.testclient import TestClient

from app.main import app
from app.services import signing

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD
from .test_pipeline import _make_video

ORIGIN = "https://frontend.example.com"


def bearer_client() -> tuple[TestClient, dict[str, str]]:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert token
    c.cookies.clear()  # a cross-site frontend never has the cookie
    return c, {"Authorization": f"Bearer {token}"}


def test_bearer_token_signs_in_without_cookie(client):
    c, auth = bearer_client()
    assert c.get("/api/projects").status_code == 401
    assert c.get("/api/projects", headers=auth).status_code == 200
    assert c.get("/api/auth/me", headers=auth).json()["user"]["email"] == ADMIN_EMAIL
    assert c.get("/api/projects", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_logout_ends_bearer_session(client):
    c, auth = bearer_client()
    assert c.post("/api/auth/logout", headers=auth).status_code == 200
    assert c.get("/api/projects", headers=auth).status_code == 401


def test_cors_allows_any_origin_without_credentials(client):
    c = TestClient(app)
    pre = c.options(
        "/api/projects",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert pre.status_code == 200
    assert pre.headers["access-control-allow-origin"] == "*"
    assert "authorization" in pre.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in pre.headers
    r = c.get("/health", headers={"Origin": ORIGIN})
    assert r.headers["access-control-allow-origin"] == "*"


def test_media_urls_are_signed_and_work_without_session(client, tmp_path):
    video = tmp_path / "clip.mp4"
    _make_video(video)
    pid = client.post("/api/projects", json={"name": "Signed media"}).json()["id"]
    media = client.post(f"/api/projects/{pid}/media", files={"file": ("clip.mp4", video.read_bytes(), "video/mp4")}).json()["media"]
    assert "sig=" in media["url"] and "exp=" in media["url"]
    anon = TestClient(app)  # a <video> element on another origin: no cookie, no header
    r = anon.get(media["url"], headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100
    assert anon.get(media["url"].split("?")[0]).status_code == 401
    assert client.get(media["url"]).status_code == 200  # the URL is also stable for signed-in users


def test_signature_checks():
    url = signing.sign("/api/media/abc/file")
    path, query = url.split("?")
    params = dict(p.split("=") for p in query.split("&"))
    assert signing.verify(path, params["exp"], params["sig"])
    assert not signing.verify("/api/media/other/file", params["exp"], params["sig"])
    assert not signing.verify(path, "1", params["sig"])  # expired
    assert not signing.verify(path, params["exp"], "0" * 64)
    assert not signing.verify(path, None, None)
    unsigned = TestClient(app).get("/api/media/abc/file")
    assert unsigned.status_code == 401
    forged = TestClient(app).get(f"/api/media/abc/file?exp={params['exp']}&sig={'0' * 64}")
    assert forged.status_code == 401
