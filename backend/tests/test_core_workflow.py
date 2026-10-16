"""End-to-end: sample workflow → review → approve → compile → operate the generated rental app."""

from datetime import date, timedelta

from sqlalchemy import select

from app.db import Record, SessionLocal

from .conftest import accept_all, wait_job


def compile_sample(client) -> tuple[str, str]:
    project = client.post("/api/projects/sample").json()
    pid = project["id"]
    wf = project["workflow"]
    assert wf["source"] == "sample"
    assert wf["review"]["pending"] > 0

    # Compilation is refused until the workflow is reviewed and approved.
    assert client.post(f"/api/projects/{pid}/compile").status_code == 400
    r = client.post(f"/api/projects/{pid}/workflow/approve")
    assert r.status_code == 422
    assert "awaits review" in r.json()["error"]["issues"][0]["message"]

    defn = accept_all(wf["definition"])
    r = client.put(f"/api/projects/{pid}/workflow", json={"definition": defn, "base_version": wf["version"]})
    assert r.status_code == 200, r.text
    assert r.json()["workflow"]["version"] == 2

    audit = client.get(f"/api/projects/{pid}/audit").json()
    assert any(a["action"] == "confirmed" and a["target_id"] == "item_must_be_available" for a in audit)

    assert client.post(f"/api/projects/{pid}/workflow/approve").status_code == 200
    job = client.post(f"/api/projects/{pid}/compile").json()
    job = wait_job(client, job["id"])
    assert job["status"] == "succeeded", job
    assert [s["status"] for s in job["stages"]] == ["done"] * 6
    return pid, job["result"]["slug"]


def test_full_rental_cycle(client):
    pid, slug = compile_sample(client)
    app = client.get(f"/api/apps/{slug}").json()
    assert app["is_sample"] is True
    assert {e["key"] for e in app["manifest"]["entities"]} == {"item", "customer", "rental"}

    seeded = client.post(f"/api/apps/{slug}/seed-sample").json()["created"]
    assert seeded == {"item": 5, "customer": 3}

    items = client.get(f"/api/apps/{slug}/records/item").json()
    customers = client.get(f"/api/apps/{slug}/records/customer").json()
    camera = next(i for i in items if i["data"]["name"].startswith("Canon"))
    assert camera["data"]["availability"] == "available"

    today = date.today()
    rental_payload = {
        "item": camera["id"],
        "customer": customers[0]["id"],
        "start_date": today.isoformat(),
        "expected_return": (today + timedelta(days=3)).isoformat(),
        "deposit": 250,
    }
    r = client.post(f"/api/apps/{slug}/records/rental", json=rental_payload)
    assert r.status_code == 201, r.text
    rental = r.json()["record"]
    assert rental["data"]["status"] == "active"
    assert r.json()["effects"][0]["to"] == "rented"

    # Starting a rental changed the item availability.
    camera_now = client.get(f"/api/apps/{slug}/records/item/{camera['id']}").json()["record"]
    assert camera_now["data"]["availability"] == "rented"

    # An item cannot be rented twice at the same time.
    r = client.post(f"/api/apps/{slug}/records/rental", json={**rental_payload, "customer": customers[1]["id"]})
    assert r.status_code == 409
    assert r.json()["error"]["rule"]["id"] in ("item_must_be_available", "one_active_rental_per_item")

    # Availability can't be hand-edited while the workflow owns it.
    r = client.patch(f"/api/apps/{slug}/records/item/{camera['id']}", json={"availability": "available"})
    assert r.status_code == 422

    # Complete the return: rental state changes, item is released, return date recorded.
    r = client.post(f"/api/apps/{slug}/records/rental/{rental['id']}/transitions/complete_return")
    assert r.status_code == 200, r.text
    returned = r.json()["record"]
    assert returned["data"]["status"] == "returned"
    assert returned["data"]["returned_on"] == today.isoformat()
    camera_now = client.get(f"/api/apps/{slug}/records/item/{camera['id']}").json()["record"]
    assert camera_now["data"]["availability"] == "available"

    # Invalid state transition is rejected server-side.
    r = client.post(f"/api/apps/{slug}/records/rental/{rental['id']}/transitions/complete_return")
    assert r.status_code == 409

    # The item can be rented again afterwards.
    r = client.post(f"/api/apps/{slug}/records/rental", json={**rental_payload, "customer": customers[2]["id"]})
    assert r.status_code == 201

    # Records are persisted in the database (survive any client refresh / new session).
    with SessionLocal() as s:
        rentals = list(s.scalars(select(Record).where(Record.entity == "rental")))
        assert len([r for r in rentals if r.data["status"] == "returned"]) >= 1

    events = client.get(f"/api/apps/{slug}/events").json()
    kinds = {e["kind"] for e in events}
    assert {"created", "transition", "effect", "rejected"} <= kinds


def test_field_validation_and_rules(client):
    _pid, slug = compile_sample(client)
    client.post(f"/api/apps/{slug}/seed-sample")
    items = client.get(f"/api/apps/{slug}/records/item").json()
    customers = client.get(f"/api/apps/{slug}/records/customer").json()

    r = client.post(f"/api/apps/{slug}/records/rental", json={"item": items[0]["id"]})
    assert r.status_code == 422
    fe = r.json()["error"]["field_errors"]
    assert {"customer", "expected_return", "deposit"} <= set(fe)

    today = date.today()
    base = {"item": items[0]["id"], "customer": customers[0]["id"], "start_date": today.isoformat(), "expected_return": today.isoformat()}
    r = client.post(f"/api/apps/{slug}/records/rental", json={**base, "deposit": -5})
    assert r.status_code == 409 and r.json()["error"]["rule"]["id"] == "deposit_not_negative"

    r = client.post(f"/api/apps/{slug}/records/rental", json={**base, "deposit": 10, "expected_return": (today - timedelta(days=1)).isoformat()})
    assert r.status_code == 409 and r.json()["error"]["rule"]["id"] == "return_after_start"

    r = client.post(f"/api/apps/{slug}/records/customer", json={"name": "No Mail", "email": "not-an-email"})
    assert r.status_code == 422 and "email" in r.json()["error"]["field_errors"]

    r = client.post(f"/api/apps/{slug}/records/rental", json={**base, "deposit": 10, "status": "returned"})
    assert r.status_code == 422  # state is runtime-managed

    r = client.post(f"/api/apps/{slug}/records/rental", json={**base, "deposit": 10, "item": "nonexistent"})
    assert r.status_code == 422


def test_rejected_rule_is_not_enforced(client):
    project = client.post("/api/projects/sample").json()
    pid, wf = project["id"], project["workflow"]
    defn = accept_all(wf["definition"])
    for r in defn["rules"]:
        if r["id"] == "deposit_not_negative":
            r["review"]["status"] = "rejected"
    client.put(f"/api/projects/{pid}/workflow", json={"definition": defn, "base_version": wf["version"]})
    assert client.post(f"/api/projects/{pid}/workflow/approve").status_code == 200
    job = wait_job(client, client.post(f"/api/projects/{pid}/compile").json()["id"])
    slug = job["result"]["slug"]
    manifest = client.get(f"/api/apps/{slug}").json()["manifest"]
    assert "deposit_not_negative" not in {r["id"] for r in manifest["rules"]}


def test_stale_version_conflict(client):
    project = client.post("/api/projects/sample").json()
    pid, wf = project["id"], project["workflow"]
    r = client.put(f"/api/projects/{pid}/workflow", json={"definition": wf["definition"], "base_version": 99})
    assert r.status_code == 409


def test_unknown_routes(client):
    assert client.get("/api/apps/does-not-exist").status_code == 404
    assert client.get("/api/projects/nope").status_code == 404
