"""Plans and limits, demo checkout, team roles, reports, calendar feed and webhooks."""

from datetime import date, timedelta

from .conftest import accept_all, wait_job


def build_app(client, origin="manual") -> tuple[str, str]:
    if origin == "sample":
        project = client.post("/api/projects/sample").json()
    else:
        project = client.post("/api/projects/manual", json={"name": "Rental desk", "template": "rental"}).json()
    pid = project["id"]
    if project["workflow"]["review"]["pending"]:
        client.put(f"/api/projects/{pid}/workflow", json={"definition": accept_all(project["workflow"]["definition"]), "base_version": project["workflow"]["version"]})
    assert client.post(f"/api/projects/{pid}/workflow/approve").status_code == 200
    r = client.post(f"/api/projects/{pid}/compile")
    if r.status_code != 202:
        return pid, r
    return pid, wait_job(client, r.json()["id"])["result"]["slug"]


def test_plans_gate_features_and_checkout(client):
    client.post("/api/account/plan", json={"plan": "free"})
    acc = client.get("/api/account").json()
    assert acc["plan"]["id"] == "free" and acc["billing_live"] is False

    _pid, slug = build_app(client, "sample")
    assert client.get(f"/api/apps/{slug}/reports").status_code == 402
    assert client.post(f"/api/apps/{slug}/team/enable").json()["error"]["upgrade"] is True
    app = client.get(f"/api/apps/{slug}").json()
    assert app["features"]["reports"] is False

    # Demo checkout: no card data, plan activated, nothing charged.
    r = client.post("/api/account/checkout", json={"plan": "plus", "company": "Rent Kft.", "billing_email": "owner@example.com"})
    assert r.status_code == 200 and r.json()["charged"] is False and r.json()["plan"]["id"] == "plus"
    assert client.post("/api/account/checkout", json={"plan": "plus", "company": "x", "billing_email": "nope"}).status_code == 422
    assert client.get(f"/api/apps/{slug}/reports").status_code == 200
    client.post("/api/account/plan", json={"plan": "free"})


def test_free_plan_app_limit(client):
    client.post("/api/account/plan", json={"plan": "free"})
    existing = client.get("/api/account").json()["usage"]["apps"]
    if existing == 0:
        _pid, slug = build_app(client)
        assert isinstance(slug, str)
    _pid, blocked = build_app(client)
    assert blocked.status_code == 402 and "Upgrade" in blocked.json()["error"]["message"]
    client.post("/api/account/plan", json={"plan": "plus"})
    _pid, slug = build_app(client)
    assert isinstance(slug, str)
    client.post("/api/account/plan", json={"plan": "free"})


def test_team_roles_are_enforced(client):
    client.post("/api/account/plan", json={"plan": "business"})
    _pid, slug = build_app(client, "sample")
    owner_key = client.post(f"/api/apps/{slug}/team/enable").json()["owner_key"]
    owner = {"X-App-Key": owner_key}

    # Without a key the private app reveals nothing.
    locked = client.get(f"/api/apps/{slug}").json()
    assert locked["locked"] is True and "manifest" not in locked
    assert client.get(f"/api/apps/{slug}/records/item").status_code == 401

    assert client.post(f"/api/apps/{slug}/seed-sample", headers=owner).status_code == 200
    staff = client.post(f"/api/apps/{slug}/team", json={"name": "Anna", "role": "staff"}, headers=owner).json()
    viewer = client.post(f"/api/apps/{slug}/team", json={"name": "Béla", "role": "viewer"}, headers=owner).json()

    items = client.get(f"/api/apps/{slug}/records/item", headers={"X-App-Key": viewer["key"]}).json()
    customers = client.get(f"/api/apps/{slug}/records/customer", headers=owner).json()
    payload = {"item": items[0]["id"], "customer": customers[0]["id"], "start_date": date.today().isoformat(),
               "expected_return": (date.today() - timedelta(days=1)).isoformat(), "deposit": 10}
    # Viewer can read but not create; staff can create but not manage the team or reset.
    r = client.post(f"/api/apps/{slug}/records/rental", json=payload, headers={"X-App-Key": viewer["key"]})
    assert r.status_code == 403
    payload["expected_return"] = (date.today() + timedelta(days=2)).isoformat()
    assert client.post(f"/api/apps/{slug}/records/rental", json=payload, headers={"X-App-Key": staff["key"]}).status_code == 201
    assert client.get(f"/api/apps/{slug}/team", headers={"X-App-Key": staff["key"]}).status_code == 403
    assert client.post(f"/api/apps/{slug}/reset", headers={"X-App-Key": staff["key"]}).status_code == 403
    me = client.get(f"/api/apps/{slug}", headers={"X-App-Key": staff["key"]}).json()["viewer"]
    assert me == {"role": "staff", "name": "Anna", "permissions": ["create", "read", "transition"]}

    # Reports reflect the operation; an overdue rental shows up.
    reports = client.get(f"/api/apps/{slug}/reports", headers=owner).json()
    rentals = next(e for e in reports["entities"] if e["key"] == "rental")
    assert rentals["total"] == 1 and rentals["lifecycle"]["open"] == 1
    assert rentals["numeric"][0]["sum"] == 10.0

    # Calendar feed with its own token; webhooks validated.
    integ = client.get(f"/api/apps/{slug}/integrations", headers=owner).json()
    ics = client.get(integ["calendar_path"])
    assert ics.status_code == 200 and "BEGIN:VEVENT" in ics.text
    assert client.get(f"/api/apps/{slug}/calendar.ics?token=wrong").status_code == 404
    assert client.post(f"/api/apps/{slug}/webhooks", json={"url": "ftp://example.com/x"}, headers=owner).status_code == 422
    hook = client.post(f"/api/apps/{slug}/webhooks", json={"url": "http://127.0.0.1:9/hook"}, headers=owner)
    assert hook.status_code == 201
    assert client.post(f"/api/apps/{slug}/webhooks/{hook.json()['id']}/test", headers=owner).json()["status"].startswith("error")
    tools = {t["id"]: t for t in integ["tools"]}
    assert tools["calendar"]["status"] == "available" and tools["invoicing"]["status"] == "planned"
    assert tools["invoicing"]["mentioned"] is True  # the sample narration talks about the deposit slip
    client.post("/api/account/plan", json={"plan": "free"})
