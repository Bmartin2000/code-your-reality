"""Generated application registry and sample data seeding."""

from __future__ import annotations

import copy
import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import AppCustomization, GeneratedApp, Project, Record, RecordEvent, WorkflowVersion
from ..workflow.runtime import AppRuntime
from ..workflow.sample import SAMPLE_CUSTOMERS, SAMPLE_INVENTORY

__all__ = ["AppRuntime", "activate", "get_app", "seed_sample", "app_summary", "customized_manifest", "SECTION_COLORS"]

# Section colours the owner can pick; the first ones are given out in order by default.
SECTION_COLORS = ("blue", "teal", "violet", "amber", "rose", "green", "slate")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "app"


def activate(s: Session, project_id: str, workflow_version_id: str, manifest: dict[str, Any]) -> tuple[GeneratedApp, bool]:
    project = s.get(Project, project_id)
    app = s.scalars(select(GeneratedApp).where(GeneratedApp.project_id == project_id)).first()
    if app:
        app.manifest = manifest
        app.workflow_version_id = workflow_version_id
        app.name = manifest["workflow"]["name"]
        return app, False
    slug = f"{_slugify(manifest['workflow']['name'])}-{project_id[:6]}"
    app = GeneratedApp(
        slug=slug,
        project_id=project_id,
        workflow_version_id=workflow_version_id,
        name=manifest["workflow"]["name"],
        manifest=manifest,
        is_sample=project.origin == "sample",
    )
    s.add(app)
    s.flush()
    return app, True


def get_app(s: Session, slug: str) -> GeneratedApp:
    app = s.scalars(select(GeneratedApp).where(GeneratedApp.slug == slug)).first()
    if not app:
        raise HTTPException(404, "No application with this address exists.")
    return app


def customization(s: Session, app: GeneratedApp) -> AppCustomization | None:
    return s.get(AppCustomization, app.id)


def display_name(s: Session, app: GeneratedApp) -> str:
    c = customization(s, app)
    return (c.name if c and c.name else None) or app.name


def customized_manifest(s: Session, app: GeneratedApp) -> dict[str, Any]:
    """The compiled manifest with the owner's names and colours for the app and its sections."""
    m = copy.deepcopy(app.manifest)
    c = customization(s, app)
    sections = (c.sections if c else None) or {}
    for i, e in enumerate(m["entities"]):
        own = sections.get(e["key"], {})
        e["label"] = own.get("label") or e["label"]
        e["plural_label"] = own.get("plural_label") or e["plural_label"]
        e["color"] = own.get("color") if own.get("color") in SECTION_COLORS else SECTION_COLORS[i % len(SECTION_COLORS)]
        field_names = own.get("fields") or {}
        for f in e["fields"]:
            if field_names.get(f["key"]):
                f["label"] = field_names[f["key"]]
        if e.get("state"):
            state_names = own.get("states") or {}
            for st in e["state"]["states"]:
                if state_names.get(st["key"]):
                    st["label"] = state_names[st["key"]]
            step_names = own.get("transitions") or {}
            for tr in e["state"]["transitions"]:
                if step_names.get(tr["key"]):
                    tr["label"] = step_names[tr["key"]]
    by_key = {e["key"]: e for e in m["entities"]}
    for v in m.get("views", []):
        if v.get("entity") in by_key:
            v["label"] = by_key[v["entity"]]["plural_label"]
    if c and c.name:
        m["workflow"]["name"] = c.name
    return m


def app_summary(s: Session, app: GeneratedApp) -> dict[str, Any]:
    wv = s.get(WorkflowVersion, app.workflow_version_id)
    project = s.get(Project, app.project_id)
    m = customized_manifest(s, app)
    last = s.scalar(select(func.max(RecordEvent.created_at)).where(RecordEvent.app_id == app.id))
    return {
        "id": app.id,
        "slug": app.slug,
        "name": m["workflow"]["name"],
        "is_sample": app.is_sample,
        "project_id": app.project_id,
        "project_origin": project.origin if project else None,
        "workflow_version": wv.version if wv else None,
        "created_at": app.created_at.isoformat(),
        "updated_at": app.updated_at.isoformat(),
        "entities": [{"key": e["key"], "label": e["label"], "plural_label": e["plural_label"], "color": e["color"]} for e in m["entities"]],
        "record_count": s.scalar(select(func.count()).select_from(Record).where(Record.app_id == app.id)) or 0,
        "last_activity_at": last.isoformat() if last else None,
    }


def can_seed_sample(app: GeneratedApp) -> bool:
    ents = {e["key"]: {f["key"] for f in e["fields"]} for e in app.manifest["entities"]}
    return {"name", "type"} <= ents.get("item", set()) and {"name", "email"} <= ents.get("customer", set())


def seed_sample(s: Session, app: GeneratedApp) -> dict[str, int]:
    """Create the example inventory and customers through the runtime, so every rule still applies."""
    if not can_seed_sample(app):
        raise HTTPException(400, "Sample records only fit the equipment rental workflow.")
    rt = AppRuntime(s, app)
    item_fields = set(rt.forms["item"]["create_fields"])
    cust_fields = set(rt.forms["customer"]["create_fields"])
    type_field = next(f for f in rt.entities["item"]["fields"] if f["key"] == "type")
    created = {"item": 0, "customer": 0}
    existing_items = {r["data"].get("name") for r in rt.list("item")}
    existing_customers = {r["data"].get("email") for r in rt.list("customer")}
    for row in SAMPLE_INVENTORY:
        if row["name"] in existing_items:
            continue
        payload = {k: v for k, v in row.items() if k in item_fields}
        if type_field["type"] == "enum" and payload.get("type") not in type_field["options"]:
            payload["type"] = type_field["options"][0]
        rt.create("item", payload)
        created["item"] += 1
    for row in SAMPLE_CUSTOMERS:
        if row["email"] in existing_customers:
            continue
        rt.create("customer", {k: v for k, v in row.items() if k in cust_fields})
        created["customer"] += 1
    return created
