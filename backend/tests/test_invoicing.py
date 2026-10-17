"""Invoicing: subscription invoices (drafts → Számlázz.hu), renewals, and in-app invoicing for customers."""

from datetime import timedelta
from urllib.parse import quote_plus

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db import Account, SessionLocal, utcnow
from app.main import app
from app.services import invoicing

from .test_plans_team import build_app

PDF = b"%PDF-1.4 test invoice"


class FakeSzamlazz:
    """Stands in for the Számlázz.hu Agent endpoint and records what was sent."""

    def __init__(self, fail: str | None = None):
        self.sent: list[str] = []
        self.fail = fail
        self.n = 0

    def __call__(self, url, files=None, timeout=None):
        assert url == invoicing.SZAMLAZZ_URL
        self.sent.append(files["action-xmlagentxmlfile"][1].decode("utf-8"))
        req = httpx.Request("POST", url)
        if self.fail:
            return httpx.Response(200, headers={"szlahu_error_code": "57", "szlahu_error": quote_plus(self.fail)}, content=b"", request=req)
        self.n += 1
        return httpx.Response(200, headers={"szlahu_szamlaszam": f"E-CYR-2026-{self.n}"}, content=PDF, request=req)


def test_totals_and_xml():
    lines, net, vat, gross = invoicing.compute([{"name": "Bérlés", "quantity": 3, "unit_price": "1999.6", "vat_rate": "27"}, {"name": "Kaució", "quantity": 1, "unit_price": 5000, "vat_rate": "AAM"}], "HUF")
    assert (str(net), str(vat), str(gross)) == ("10999", "1620", "12619")
    assert lines[1]["vat"] == "0"
    _l, net, vat, gross = invoicing.compute([{"name": "Plus", "quantity": 1, "unit_price": 19, "vat_rate": "27"}], "EUR")
    assert (str(net), str(vat), str(gross)) == ("19.00", "5.13", "24.13")


@pytest.fixture
def szamlazz(monkeypatch):
    fake = FakeSzamlazz()
    monkeypatch.setattr(invoicing.httpx, "post", fake)
    return fake


def test_subscription_invoices_drafts_then_szamlazz(client, szamlazz):
    client.put("/api/admin/invoicing", json={"provider": "none"})
    client.post("/api/account/plan", json={"plan": "free"})
    r = client.post("/api/account/checkout", json={"plan": "plus", "company": "Rent & Go Kft.", "billing_email": "billing@example.com"})
    assert r.status_code == 200 and r.json()["charged"] is False

    b = client.get("/api/account/billing").json()
    subs = [i for i in b["invoices"] if i["kind"] == "subscription"]
    assert len(subs) == 1 and subs[0]["status"] == "draft" and subs[0]["gross"] == "24.13" and subs[0]["currency"] == "EUR"
    assert b["period"]["start"] and b["renews_at"] and b["usage"][0]["limit"] == 30
    assert szamlazz.sent == []  # nothing goes to Számlázz.hu until it is connected
    inv_id = subs[0]["id"]
    assert client.post(f"/api/account/invoices/{inv_id}/issue").status_code == 409  # not connected: refused, stays draft
    with SessionLocal() as s:
        assert s.get(invoicing.Invoice, inv_id).status == "draft"

    # Connect Számlázz.hu: the key is stored on the server and never returned.
    r = client.put("/api/admin/invoicing", json={"provider": "szamlazz", "agent_key": "secret-agent-key-1234", "currency": "EUR"})
    assert r.status_code == 200 and "secret-agent-key" not in r.text and r.json()["agent_key_hint"] == "…1234" and r.json()["connected"]

    # Missing buyer address: refused locally with a clear reason, nothing sent.
    r = client.post(f"/api/account/invoices/{inv_id}/issue").json()
    assert r["status"] == "failed" and "address" in r["error"] and szamlazz.sent == []

    client.put("/api/account/billing", json={"company": "Rent & Go Kft.", "billing_email": "billing@example.com", "postcode": "1051", "city": "Budapest", "address": "Fő utca 1.", "tax_number": "12345678-2-41"})
    r = client.post(f"/api/account/invoices/{inv_id}/issue").json()
    assert r["status"] == "issued" and r["number"] == "E-CYR-2026-1" and r["has_pdf"]
    xml = szamlazz.sent[-1]
    assert "<szamlaagentkulcs>secret-agent-key-1234</szamlaagentkulcs>" in xml and "<irsz>1051</irsz>" in xml and "<sendEmail>true</sendEmail>" in xml
    assert "<penznem>EUR</penznem>" in xml and "<arfolyamBank>MNB</arfolyamBank>" in xml and "Fő utca 1." in xml
    pdf = client.get(f"/api/account/invoices/{inv_id}/pdf")
    assert pdf.status_code == 200 and pdf.content == PDF
    assert client.post(f"/api/account/invoices/{inv_id}/paid").json()["paid_at"]

    # Renewals: two more monthly periods started → two new invoices, issued automatically.
    with SessionLocal() as s:
        acc = s.get(Account, "default")
        acc.plan_started_at = utcnow() - timedelta(days=62)
        s.commit()
    b = client.get("/api/account/billing").json()
    issued = [i for i in b["invoices"] if i["kind"] == "subscription" and i["status"] == "issued"]
    assert len(issued) >= 3 and len(szamlazz.sent) >= 3

    # Only the founder: other admins can't see or change invoicing.
    client.post("/api/users", json={"name": "Ops", "email": "ops2@example.com", "password": "ops-password", "role": "admin"})
    ops = TestClient(app)
    ops.post("/api/auth/login", json={"email": "ops2@example.com", "password": "ops-password"})
    assert ops.get("/api/admin/invoicing").status_code == 403
    assert ops.get(f"/api/account/invoices/{inv_id}").status_code == 403
    assert ops.get(f"/api/account/invoices/{inv_id}/pdf").status_code == 403

    client.put("/api/admin/invoicing", json={"provider": "none", "remove_agent_key": True})
    client.post("/api/account/plan", json={"plan": "free"})
    for u in client.get("/api/users").json():
        if u["email"] == "ops2@example.com":
            client.delete(f"/api/users/{u['id']}")


def test_customer_invoicing_inside_the_app(client, szamlazz, monkeypatch):
    client.post("/api/account/plan", json={"plan": "free"})
    _pid, slug = build_app(client, "sample")
    assert client.get(f"/api/apps/{slug}/invoices").status_code == 402  # a Plus feature

    client.post("/api/account/plan", json={"plan": "plus"})
    client.post(f"/api/apps/{slug}/seed-sample")
    items = client.get(f"/api/apps/{slug}/records/item").json()
    customers = client.get(f"/api/apps/{slug}/records/customer").json()
    rental = client.post(f"/api/apps/{slug}/records/rental", json={"item": items[0]["id"], "customer": customers[0]["id"], "start_date": "2026-10-20", "expected_return": "2026-10-22", "deposit": 25000}).json()["record"]

    pre = client.get(f"/api/apps/{slug}/invoices/prefill", params={"record_id": rental["id"], "entity": "rental"}).json()
    assert pre["buyer"]["name"] == customers[0]["data"]["name"] and pre["buyer"]["email"] == customers[0]["data"]["email"]
    assert pre["items"][0]["unit_price"] == 25000

    body = {
        "record_id": rental["id"],
        "buyer": {**pre["buyer"], "postcode": "1111", "city": "Budapest", "address": "Bartók Béla út 2."},
        "items": [{"name": "Kamera bérlés 2 nap", "quantity": 2, "unit": "nap", "unit_price": 12000, "vat_rate": "27"}],
    }
    inv = client.post(f"/api/apps/{slug}/invoices", json=body).json()
    assert inv["status"] == "draft" and inv["gross"] == "30480" and inv["currency"] == "HUF" and inv["record"]["code"] == "REN-0001"
    history = client.get(f"/api/apps/{slug}/records/rental/{rental['id']}").json()["history"]
    assert history[0]["kind"] == "note" and "DRAFT-0001" in history[0]["summary"]
    assert client.post(f"/api/apps/{slug}/invoices/{inv['id']}/issue").status_code == 409  # not connected yet

    # The business connects its own Számlázz.hu account; Számlázz.hu errors are shown as they come.
    assert client.put(f"/api/apps/{slug}/invoicing", json={"provider": "szamlazz", "agent_key": "shop-key-987654"}).json()["connected"]
    monkeypatch.setattr(invoicing.httpx, "post", FakeSzamlazz(fail="Hibás agent kulcs"))
    r = client.post(f"/api/apps/{slug}/invoices/{inv['id']}/issue").json()
    assert r["status"] == "failed" and "Hibás agent kulcs" in r["error"] and "57" in r["error"]
    monkeypatch.setattr(invoicing.httpx, "post", szamlazz)
    r = client.post(f"/api/apps/{slug}/invoices/{inv['id']}/issue").json()
    assert r["status"] == "issued" and r["number"]
    assert "<szamlaagentkulcs>shop-key-987654</szamlaagentkulcs>" in szamlazz.sent[-1] and "<afakulcs>27</afakulcs>" in szamlazz.sent[-1]
    assert client.delete(f"/api/apps/{slug}/invoices/{inv['id']}").status_code == 409

    # Auto-issue: new invoices are issued at once.
    client.put(f"/api/apps/{slug}/invoicing", json={"provider": "szamlazz", "auto_issue": True})
    assert client.post(f"/api/apps/{slug}/invoices", json={**body, "record_id": None}).json()["status"] == "issued"
    listing = client.get(f"/api/apps/{slug}/invoices").json()
    assert len(listing["invoices"]) == 2 and "shop-key" not in str(listing)

    # Roles: staff can't invoice; the subscription's invoices are not visible from the app.
    owner = {"X-App-Key": client.post(f"/api/apps/{slug}/team/enable").json()["owner_key"]}
    staff = {"X-App-Key": client.post(f"/api/apps/{slug}/team", json={"name": "Sam", "role": "staff"}, headers=owner).json()["key"]}
    anon = TestClient(app)
    assert anon.get(f"/api/apps/{slug}/invoices", headers=staff).status_code == 403
    assert anon.get(f"/api/apps/{slug}/invoices", headers=owner).status_code == 200
    client.post(f"/api/apps/{slug}/team/disable", headers=owner)
    client.post("/api/account/plan", json={"plan": "free"})
