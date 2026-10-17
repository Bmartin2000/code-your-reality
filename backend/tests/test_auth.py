from fastapi.testclient import TestClient

from app.main import app
from app.services.auth import hash_password, verify_password

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def anon() -> TestClient:
    return TestClient(app)


def test_password_hashing():
    stored = hash_password("s3cret-pass")
    assert stored.startswith("pbkdf2_sha256$") and "s3cret-pass" not in stored
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert not verify_password("x", "garbage")


def test_first_user_is_admin(client):
    me = client.get("/api/auth/me").json()
    assert me["user"]["email"] == ADMIN_EMAIL and me["user"]["role"] == "admin"
    assert me["needs_setup"] is False


def test_studio_api_requires_sign_in(client):
    c = anon()
    for path in ("/api/projects", "/api/apps", "/api/account", "/api/system/capabilities"):
        r = c.get(path)
        assert r.status_code == 401, path
        assert r.json()["error"]["auth_required"] is True
    assert c.post("/api/projects/sample").status_code == 401
    # Health and the sign-in endpoints stay open.
    assert c.get("/health").status_code == 200
    assert c.get("/api/auth/me").json()["user"] is None


def test_generated_app_endpoints_do_not_need_studio_sign_in():
    # Generated apps are opened by their link (and team keys); they never call the AI.
    assert anon().get("/api/apps/no-such-app").status_code == 404


def test_signup_closed_after_first_user():
    r = anon().post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "longenough"})
    assert r.status_code == 403
    assert anon().get("/api/auth/me").json()["signup_open"] is False


def test_login_logout_and_wrong_password():
    c = anon()
    assert c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "nope-nope"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert c.get("/api/projects").status_code == 200
    c.post("/api/auth/logout")
    assert c.get("/api/projects").status_code == 401


def test_admin_manages_users(client):
    r = client.post("/api/users", json={"name": "Sam", "email": "sam@example.com", "password": "sam-password"})
    assert r.status_code == 201 and r.json()["role"] == "user"
    sam_id = r.json()["id"]
    assert client.post("/api/users", json={"name": "Sam", "email": "SAM@example.com", "password": "sam-password"}).status_code == 409
    assert client.post("/api/users", json={"name": "Short", "email": "short@example.com", "password": "123"}).status_code == 422

    sam = anon()
    assert sam.post("/api/auth/login", json={"email": "sam@example.com", "password": "sam-password"}).status_code == 200
    assert sam.get("/api/projects").status_code == 200  # regular users can use the Studio
    assert sam.get("/api/users").status_code == 403  # ...but not manage users

    emails = [u["email"] for u in client.get("/api/users").json()]
    assert ADMIN_EMAIL in emails and "sam@example.com" in emails
    assert all("password_hash" not in u for u in client.get("/api/users").json())

    me_id = client.get("/api/auth/me").json()["user"]["id"]
    assert client.delete(f"/api/users/{me_id}").status_code == 400
    assert client.patch(f"/api/users/{me_id}", json={"role": "user"}).status_code == 400

    assert client.patch(f"/api/users/{sam_id}", json={"role": "admin"}).json()["role"] == "admin"
    assert client.delete(f"/api/users/{sam_id}").status_code == 204
    assert sam.get("/api/projects").status_code == 401  # deleted user's session is gone
