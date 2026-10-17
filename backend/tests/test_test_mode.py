"""Subscription Test Mode: only the founding Super Admin, real plan untouched, every plan check follows it."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import Account, Job, PlanTestEvent, Project, SessionLocal
from app.main import app

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD
from .test_plans_team import build_app


def sign_in(email: str, password: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": email, "password": password}).status_code == 200
    return c


def real_plan() -> str:
    with SessionLocal() as s:
        return s.get(Account, "default").plan


@pytest.fixture
def others(client):
    """A second admin and a regular user, created by the founder."""
    client.post("/api/users", json={"name": "Second admin", "email": "admin2@example.com", "password": "admin2-password", "role": "admin"})
    client.post("/api/users", json={"name": "Uma", "email": "uma@example.com", "password": "uma-password", "role": "user"})
    yield sign_in("admin2@example.com", "admin2-password"), sign_in("uma@example.com", "uma-password")
    client.put("/api/admin/test-mode", json={"plan": None})
    client.post("/api/account/plan", json={"plan": "free"})
    for u in client.get("/api/users").json():
        if u["email"] in ("admin2@example.com", "uma@example.com"):
            client.delete(f"/api/users/{u['id']}")


def test_only_the_founder_can_use_test_mode(client, others):
    admin2, uma = others
    assert client.get("/api/auth/me").json()["user"]["super_admin"] is True
    assert admin2.get("/api/auth/me").json()["user"]["super_admin"] is False
    for c in (admin2, uma, TestClient(app)):
        assert c.get("/api/admin/test-mode").status_code in (401, 403)
        assert c.put("/api/admin/test-mode", json={"plan": "plus"}).status_code in (401, 403)

    # A role can't make someone the founder, and the founder can't be demoted or removed.
    founder_id = client.get("/api/auth/me").json()["user"]["id"]
    assert admin2.patch(f"/api/users/{founder_id}", json={"role": "user"}).status_code == 400
    assert admin2.delete(f"/api/users/{founder_id}").status_code == 400


def test_plus_test_mode_unlocks_plus_only_for_the_founder(client, others):
    admin2, _uma = others
    client.post("/api/account/plan", json={"plan": "free"})
    _pid, slug = build_app(client, "sample")

    state = client.put("/api/admin/test-mode", json={"plan": "plus"}).json()
    assert state["plan"] == "plus" and state["real_plan"] == "free" and state["effective"]["analyses_per_month"] == 30

    acc = client.get("/api/account").json()
    assert acc["plan"]["id"] == "plus" and acc["test_mode"] == {"plan": "plus", "real_plan": "free"}
    assert client.get(f"/api/apps/{slug}/reports").status_code == 200
    assert client.get(f"/api/apps/{slug}").json()["features"]["reports"] is True

    # Everyone else still gets the real Free plan.
    assert admin2.get("/api/account").json()["plan"]["id"] == "free"
    assert admin2.get("/api/account").json()["test_mode"] is None
    assert admin2.get(f"/api/apps/{slug}/reports").status_code == 402
    assert TestClient(app).get(f"/api/apps/{slug}/reports").status_code == 402

    # No checkout or plan change while testing; the stored plan never changes.
    r = client.post("/api/account/checkout", json={"plan": "plus", "company": "x", "billing_email": "a@example.com"})
    assert r.status_code == 409 and r.json()["error"]["test_mode"] is True
    assert client.post("/api/account/plan", json={"plan": "business"}).status_code == 409
    assert real_plan() == "free"


def test_free_test_mode_applies_free_limits_while_the_workspace_has_plus(client, others):
    admin2, _uma = others
    admin2.post("/api/account/plan", json={"plan": "plus"})
    _pid, slug = build_app(client, "sample")
    client.put("/api/admin/test-mode", json={"plan": "free"})

    assert client.get("/api/account").json()["plan"]["id"] == "free"
    r = client.get(f"/api/apps/{slug}/reports")
    assert r.status_code == 402 and r.json()["error"]["upgrade"] is True
    assert client.post(f"/api/apps/{slug}/team/enable").status_code == 402
    assert admin2.get(f"/api/apps/{slug}/reports").status_code == 200
    assert real_plan() == "plus"

    # Monthly analysis limit: fill the Free allowance, then the founder is refused, others are not.
    project = client.post("/api/projects", json={"name": "Limit check", "narration": "We lend tools to members."}).json()
    with SessionLocal() as s:
        used = client.get("/api/account").json()["usage"]["analyses_this_month"]
        for _ in range(max(0, 3 - used)):
            s.add(Job(project_id=project["id"], kind="analysis", status="succeeded"))
        s.commit()
    r = client.post(f"/api/projects/{project['id']}/analyze")
    assert r.status_code == 402 and "3 video analyses a month" in r.json()["error"]["message"] and r.json()["error"]["upgrade"] is True

    # Switching applies to the very next request.
    client.put("/api/admin/test-mode", json={"plan": "plus"})
    assert client.get(f"/api/apps/{slug}/reports").status_code == 200
    r = client.post(f"/api/projects/{project['id']}/analyze")
    assert r.status_code == 202, r.text
    with SessionLocal() as s:  # let the background job finish (the model is unreachable in tests)
        for _ in range(200):
            if s.scalars(select(Project).where(Project.id == project["id"])).one().status != "analyzing":
                break
            s.expire_all()
            time.sleep(0.05)


def test_switches_are_logged_and_persist(client, others):
    client.put("/api/admin/test-mode", json={"plan": "plus"})
    client.put("/api/admin/test-mode", json={"plan": "free"})
    state = client.get("/api/admin/test-mode").json()
    assert state["plan"] == "free"
    assert state["log"][0]["from"] == "plus" and state["log"][0]["to"] == "free"
    with SessionLocal() as s:
        assert s.scalars(select(PlanTestEvent)).first() is not None
    # A fresh sign-in of the founder still tests as Free (stored server-side, not in the browser).
    assert sign_in(ADMIN_EMAIL, ADMIN_PASSWORD).get("/api/account").json()["plan"]["id"] == "free"
    assert client.put("/api/admin/test-mode", json={"plan": "business"}).status_code == 422
    client.put("/api/admin/test-mode", json={"plan": None})
    assert client.get("/api/account").json()["test_mode"] is None
