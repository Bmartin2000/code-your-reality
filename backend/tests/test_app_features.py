"""CRM/ERP features of generated apps (notes, spreadsheet import, section names) and founder-only billing."""

from fastapi.testclient import TestClient

from app.main import app

from .test_plans_team import build_app


def test_notes_import_and_section_names(client):
    client.post("/api/account/plan", json={"plan": "business"})
    _pid, slug = build_app(client, "sample")
    client.post(f"/api/apps/{slug}/seed-sample")

    # Import: labels or keys as headers; linked records by title or code; each row checked by the rules.
    r = client.post(
        f"/api/apps/{slug}/records/item/import",
        json={"rows": [
            {"Name": "Tripod Manfrotto 055", "type": "grip"},
            {"name": ""},  # missing required name: refused
        ]},
    ).json()
    assert r["created"] == 1 and r["failed"] == 1 and r["errors"][0]["row"] == 2
    customers = client.get(f"/api/apps/{slug}/records/customer").json()
    tripod = next(i for i in client.get(f"/api/apps/{slug}/records/item").json() if i["data"]["name"] == "Tripod Manfrotto 055")
    r = client.post(
        f"/api/apps/{slug}/records/rental/import",
        json={"rows": [
            {"item": tripod["code"], "customer": customers[0]["data"]["name"], "start_date": "2026-10-20", "expected_return": "2026-10-22", "deposit": 40},
            {"item": "Tripod Manfrotto 055", "customer": customers[1]["data"]["name"], "start_date": "2026-10-20", "expected_return": "2026-10-22", "deposit": 40},
        ]},
    ).json()
    assert r["created"] == 1 and r["failed"] == 1  # the same item can't be rented twice
    rental = client.get(f"/api/apps/{slug}/records/rental").json()[0]

    # Notes appear in the record's history and don't change data.
    note = client.post(f"/api/apps/{slug}/records/rental/{rental['id']}/notes", json={"text": "Customer called, returns Friday."})
    assert note.status_code == 201 and note.json()["kind"] == "note"
    detail = client.get(f"/api/apps/{slug}/records/rental/{rental['id']}").json()
    assert detail["history"][0]["summary"] == "Customer called, returns Friday."
    assert detail["record"]["data"] == rental["data"]

    # Section names and colours: applied wherever the manifest is served, workflow untouched.
    r = client.put(f"/api/apps/{slug}/customize", json={"name": "Camera Rent Pro", "sections": {"item": {"label": "Device", "plural_label": "Devices", "color": "teal"}}})
    assert r.status_code == 200
    m = client.get(f"/api/apps/{slug}").json()["manifest"]
    item = next(e for e in m["entities"] if e["key"] == "item")
    assert (item["label"], item["plural_label"], item["color"]) == ("Device", "Devices", "teal")
    assert next(v for v in m["views"] if v.get("entity") == "item")["label"] == "Devices"
    assert m["workflow"]["name"] == "Camera Rent Pro"
    summary = next(a for a in client.get("/api/apps").json() if a["slug"] == slug)
    assert summary["name"] == "Camera Rent Pro" and summary["record_count"] >= 10 and summary["last_activity_at"]
    assert client.put(f"/api/apps/{slug}/customize", json={"sections": {"nope": {"label": "x"}}}).status_code == 400

    # Field, status and step names (e.g. into Hungarian), applied everywhere; unknown keys refused.
    r = client.put(f"/api/apps/{slug}/customize", json={"sections": {"rental": {"plural_label": "Bérlések", "fields": {"expected_return": "Visszahozás"}, "states": {"active": "Kint van"}, "transitions": {"complete_return": "Visszavétel"}}}})
    assert r.status_code == 200, r.text
    rental_e = next(e for e in client.get(f"/api/apps/{slug}").json()["manifest"]["entities"] if e["key"] == "rental")
    assert rental_e["plural_label"] == "Bérlések"
    assert next(f for f in rental_e["fields"] if f["key"] == "expected_return")["label"] == "Visszahozás"
    assert next(s for s in rental_e["state"]["states"] if s["key"] == "active")["label"] == "Kint van"
    assert next(x for x in rental_e["state"]["transitions"] if x["key"] == "complete_return")["label"] == "Visszavétel"
    assert client.put(f"/api/apps/{slug}/customize", json={"sections": {"rental": {"fields": {"nope": "x"}}}}).status_code == 400
    assert client.put(f"/api/apps/{slug}/customize", json={"sections": {"item": {"color": "neon"}}}).status_code == 422

    # Roles: staff can add notes but not import or rename.
    owner = {"X-App-Key": client.post(f"/api/apps/{slug}/team/enable").json()["owner_key"]}
    staff = {"X-App-Key": client.post(f"/api/apps/{slug}/team", json={"name": "Sam", "role": "staff"}, headers=owner).json()["key"]}
    anon = TestClient(app)
    assert anon.post(f"/api/apps/{slug}/records/rental/{rental['id']}/notes", json={"text": "hi"}, headers=staff).status_code == 201
    assert anon.post(f"/api/apps/{slug}/records/item/import", json={"rows": [{"name": "X"}]}, headers=staff).status_code == 403
    assert anon.put(f"/api/apps/{slug}/customize", json={"name": "Mine"}, headers=staff).status_code == 403
    client.post(f"/api/apps/{slug}/team/disable", headers=owner)
    client.post("/api/account/plan", json={"plan": "free"})


def test_billing_is_founder_only(client):
    client.post("/api/users", json={"name": "Ops admin", "email": "ops@example.com", "password": "ops-password", "role": "admin"})
    ops = TestClient(app)
    ops.post("/api/auth/login", json={"email": "ops@example.com", "password": "ops-password"})

    assert ops.get("/api/account/billing").status_code == 403
    assert ops.post("/api/account/checkout", json={"plan": "plus", "company": "x", "billing_email": "a@example.com"}).status_code == 403
    assert ops.get("/api/account").status_code == 200  # everyone can see which plan the workspace has

    client.post("/api/account/checkout", json={"plan": "plus", "company": "Rent Kft.", "billing_email": "billing@example.com"})
    b = client.get("/api/account/billing").json()
    assert b["status"] == "active" and b["monthly_eur"] == 19 and b["renews_at"] and b["payment_method"] is None
    assert b["history"][0]["kind"] == "checkout" and b["history"][0]["charged"] is False and b["history"][0]["amount_eur"] == 19
    b = client.put("/api/account/billing", json={"company": "Rent Kft. (HU)", "billing_email": "finance@example.com"}).json()
    assert b["company"] == "Rent Kft. (HU)" and b["billing_email"] == "finance@example.com"
    assert ops.put("/api/account/billing", json={"company": "x", "billing_email": "a@example.com"}).status_code == 403

    client.post("/api/account/plan", json={"plan": "free"})
    assert client.get("/api/account/billing").json()["history"][0]["kind"] == "plan_change"
    for u in client.get("/api/users").json():
        if u["email"] == "ops@example.com":
            client.delete(f"/api/users/{u['id']}")
