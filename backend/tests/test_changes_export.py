"""Small change requests (applied without a model, from a fixed answer) and the app export."""

import io
import zipfile

import pytest

from app.pipeline import changes
from app.workflow.sample import rental_definition
from app.workflow.schema import WorkflowDefinition
from app.workflow.validation import validate

from .conftest import accept_all, wait_job


def defn() -> WorkflowDefinition:
    return WorkflowDefinition.model_validate(rental_definition(mode="template"))


def test_apply_small_change():
    answer = {
        "refused": False,
        "message": "Added email",
        "operations": [
            {"op": "add_field", "entity": "customer", "label": "Company", "type": "text", "required": True, "options": []},
            {"op": "set_required", "field": "customer.phone", "required": True},
            {"op": "add_option", "field": "item.type", "option": "Drone"},
            {"op": "add_rule", "statement": "Deposit at least 20", "kind": "min_value", "entity": "rental", "on": "create", "field": "rental.deposit",
             "ref_field": "rental.item", "target_field": "item.name", "end_field": "rental.expected_return", "value": "20"},
        ],
    }
    new, summary = changes.apply(defn(), answer, "small tweaks")
    customer = new.entity("customer")
    company = next(f for f in customer.fields if f.key == "company")
    assert company.required and company.review.status == "pending"
    assert next(f for f in customer.fields if f.key == "phone").required
    assert "Drone" in next(f for f in new.entity("item").fields if f.key == "type").options
    rule = new.rules[-1]
    assert rule.kind == "min_value" and rule.params["min"] == 20.0 and rule.review.status == "pending"
    assert len(summary) == 4
    assert not [i for i in validate(new) if i.severity == "error"]


def test_refused_and_protected_changes():
    with pytest.raises(changes.ChangeRejected):
        changes.apply(defn(), {"refused": True, "message": "Too big", "operations": []}, "build an ERP")
    # Removing a field that rules depend on is refused, so nothing applicable remains.
    with pytest.raises(changes.ChangeRejected):
        changes.apply(defn(), {"refused": False, "message": "", "operations": [{"op": "remove_field", "field": "rental.deposit"}]}, "drop deposit")


def test_invalid_rule_becomes_note():
    answer = {"refused": False, "message": "", "operations": [
        {"op": "add_rule", "statement": "Name at least 5", "kind": "min_value", "entity": "customer", "on": "create", "field": "customer.name",
         "ref_field": "rental.item", "target_field": "item.name", "end_field": "customer.name", "value": "5"}]}
    new, _ = changes.apply(defn(), answer, "x")
    assert new.rules[-1].kind == "note"


def test_change_request_fails_cleanly_without_model(client):
    pid = client.post("/api/projects/manual", json={"name": "Desk", "template": "rental"}).json()["id"]
    job = wait_job(client, client.post(f"/api/projects/{pid}/workflow/change-request", json={"instruction": "Make phone required"}).json()["id"])
    assert job["status"] == "failed" and "not changed" in job["error"]
    assert client.get(f"/api/projects/{pid}").json()["workflow"]["version"] == 1
    assert client.post(f"/api/projects/{pid}/workflow/change-request", json={"instruction": "x" * 301}).status_code == 422


def test_export_zip(client):
    project = client.post("/api/projects/sample").json()
    pid = project["id"]
    client.put(f"/api/projects/{pid}/workflow", json={"definition": accept_all(project["workflow"]["definition"]), "base_version": 1})
    client.post(f"/api/projects/{pid}/workflow/approve")
    slug = wait_job(client, client.post(f"/api/projects/{pid}/compile").json()["id"])["result"]["slug"]
    client.post(f"/api/apps/{slug}/seed-sample")
    r = client.get(f"/api/apps/{slug}/export")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(z.namelist())
    assert {"manifest.json", "data/item.csv", "data/customer.csv", "data/rental.csv", "data/records.json", "history.json", "README.txt"} <= names
    assert "Canon EOS R6 body" in z.read("data/item.csv").decode("utf-8-sig")
