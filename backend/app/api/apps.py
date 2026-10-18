"""Endpoints of generated applications: the runtime's public surface, with role-based access."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import AppCustomization, AppMember, AppWebhook, GeneratedApp, Invoice, Record, RecordEvent, get_session, utcnow
from ..services import access, integrations, invoicing, plans, reports
from ..services.auth import require_user
from ..services.apps import SECTION_COLORS, app_summary, can_seed_sample, customized_manifest, get_app, seed_sample
from ..workflow.runtime import AppRuntime, RuntimeErrorBase

router = APIRouter(prefix="/api/apps")


def _ctx(slug: str, request: Request, s: Session, permission: str) -> tuple[GeneratedApp, access.Viewer, AppRuntime]:
    app = get_app(s, slug)
    viewer = access.viewer_for(s, app, request)
    access.require(viewer, permission)
    return app, viewer, AppRuntime(s, app)


def _emit(app: GeneratedApp, rt: AppRuntime) -> None:
    integrations.dispatch(app.id, app.slug, rt.emitted)


@router.get("", dependencies=[Depends(require_user)])
def list_apps(s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [app_summary(s, a) for a in s.scalars(select(GeneratedApp).order_by(GeneratedApp.updated_at.desc()))]


@router.get("/{slug}")
def get_application(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app = get_app(s, slug)
    st = access.settings_for(s, app)
    try:
        viewer = access.viewer_for(s, app, request)
    except HTTPException:
        # Private app without a valid key: reveal only what the sign-in screen needs.
        return {"slug": app.slug, "name": customized_manifest(s, app)["workflow"]["name"], "access_mode": st.access_mode, "locked": True}
    plan = plans.limits(s)
    return {
        **app_summary(s, app),
        "manifest": customized_manifest(s, app),
        "can_seed_sample": can_seed_sample(app),
        "access_mode": st.access_mode,
        "locked": False,
        "viewer": {"role": viewer.role, "name": viewer.member.name if viewer.member else None, "permissions": sorted(access.PERMISSIONS[viewer.role])},
        "features": {"reports": plan.reports, "integrations": plan.integrations, "team": plan.team, "invoicing": plan.invoicing, "plan": plan.name},
    }


@router.get("/{slug}/stats")
def stats(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    return _ctx(slug, request, s, "read")[2].stats()


@router.get("/{slug}/events")
def events(slug: str, request: Request, limit: int = 40, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return _ctx(slug, request, s, "read")[2].events(limit=max(1, min(limit, 200)))


@router.get("/{slug}/records/{entity}")
def list_records(slug: str, entity: str, request: Request, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return _ctx(slug, request, s, "read")[2].list(entity)


@router.post("/{slug}/records/{entity}", status_code=201)
def create_record(slug: str, entity: str, request: Request, payload: dict[str, Any] = Body(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _ctx(slug, request, s, "create")
    try:
        rec, effects = rt.create(entity, payload)
    finally:
        _emit(app, rt)
    return {"record": rt.serialize(rec), "effects": effects}


@router.get("/{slug}/records/{entity}/{record_id}")
def get_record(slug: str, entity: str, record_id: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    _app, _v, rt = _ctx(slug, request, s, "read")
    rec = rt.get(entity, record_id)
    return {"record": rt.serialize(rec), "history": rt.events(record_id=rec.id, limit=100)}


@router.patch("/{slug}/records/{entity}/{record_id}")
def update_record(slug: str, entity: str, record_id: str, request: Request, payload: dict[str, Any] = Body(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _ctx(slug, request, s, "update")
    try:
        rec = rt.update(entity, record_id, payload)
    finally:
        _emit(app, rt)
    return {"record": rt.serialize(rec)}


@router.post("/{slug}/records/{entity}/{record_id}/transitions/{transition}")
def transition(slug: str, entity: str, record_id: str, transition: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _ctx(slug, request, s, "transition")
    try:
        rec, effects = rt.transition(entity, record_id, transition)
    finally:
        _emit(app, rt)
    return {"record": rt.serialize(rec), "effects": effects}


# --- notes, import, naming ------------------------------------------------------------------------


class Note(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/{slug}/records/{entity}/{record_id}/notes", status_code=201)
def add_note(slug: str, entity: str, record_id: str, body: Note, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    """A free-text note on a record (call log, agreement, reminder). Notes never change data or rules."""
    app, viewer, rt = _ctx(slug, request, s, "create")
    rec = rt.get(entity, record_id)
    author = viewer.member.name if viewer.member else access.ROLE_LABELS[viewer.role]
    ev = RecordEvent(app_id=app.id, record_id=rec.id, entity=entity, kind="note", summary=body.text.strip(), detail={"author": author})
    s.add(ev)
    s.commit()
    return {"id": ev.id, "record_id": rec.id, "entity": entity, "kind": "note", "summary": ev.summary, "detail": ev.detail, "created_at": ev.created_at.isoformat()}


class ImportRows(BaseModel):
    rows: list[dict[str, Any]] = Field(min_length=1, max_length=500)


def _resolve_refs(s: Session, rt: AppRuntime, entity: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Spreadsheet values to stored values: options case-insensitively, linked records by title or code
    (e.g. "Canon EOS R6" or "ITE-0001") to their ids."""
    out = dict(row)
    for f in entity["fields"]:
        v = out.get(f["key"])
        if f["type"] == "enum" and isinstance(v, str):  # "camera" -> "Camera"
            out[f["key"]] = next((o for o in f["options"] if o.lower() == v.strip().lower()), v)
            continue
        if f["type"] != "reference" or not isinstance(v, str) or not v.strip():
            continue
        target = rt.entities.get(f["ref_entity"])
        if not target:
            continue
        wanted = v.strip().lower()
        for rec in s.scalars(select(Record).where(Record.app_id == rt.app.id, Record.entity == target["key"])):
            if rec.id == v.strip() or rt.code_of(rec).lower() == wanted or rt.title_of(rec).lower() == wanted:
                out[f["key"]] = rec.id
                break
    return out


@router.post("/{slug}/records/{entity}/import")
def import_records(slug: str, entity: str, body: ImportRows, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Bulk create from a spreadsheet. Every row goes through the same validation and rules as the form."""
    app, _v, rt = _ctx(slug, request, s, "seed")
    e = rt.entity(entity)
    labels = {f["label"].strip().lower(): f["key"] for f in e["fields"]}
    created, errors = 0, []
    try:
        for i, raw in enumerate(body.rows, start=1):
            row = {labels.get(str(k).strip().lower(), str(k).strip()): v for k, v in raw.items() if v not in (None, "")}
            try:
                rt.create(entity, _resolve_refs(s, rt, e, row))
                created += 1
            except RuntimeErrorBase as err:
                detail = "; ".join(f"{k}: {m}" for k, m in (err.field_errors or {}).items())
                errors.append({"row": i, "message": f"{err.message}{f' ({detail})' if detail else ''}"})
    finally:
        _emit(app, rt)
    return {"created": created, "failed": len(errors), "errors": errors[:50]}


class SectionName(BaseModel):
    label: str | None = Field(None, max_length=60)
    plural_label: str | None = Field(None, max_length=60)
    color: Literal[SECTION_COLORS] | None = None  # type: ignore[valid-type]
    fields: dict[str, str] = Field(default_factory=dict)  # field key -> label
    states: dict[str, str] = Field(default_factory=dict)  # status key -> label
    transitions: dict[str, str] = Field(default_factory=dict)  # step (button) key -> label


class Customize(BaseModel):
    name: str | None = Field(None, max_length=120)
    sections: dict[str, SectionName] = Field(default_factory=dict)


@router.put("/{slug}/customize")
def customize(slug: str, body: Customize, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Rename the app and its sections and pick their colours. The compiled workflow is unchanged."""
    app, _v, _rt = _ctx(slug, request, s, "admin")
    entities = {e["key"]: e for e in app.manifest["entities"]}
    unknown = set(body.sections) - set(entities)
    if unknown:
        raise HTTPException(400, f"Unknown section: {', '.join(sorted(unknown))}.")

    def names(given: dict[str, str], allowed: set[str], what: str) -> dict[str, str]:
        bad = set(given) - allowed
        if bad:
            raise HTTPException(400, f"Unknown {what}: {', '.join(sorted(bad))}.")
        out = {k: v.strip()[:60] for k, v in given.items() if v and v.strip()}
        return out

    c = s.get(AppCustomization, app.id) or AppCustomization(app_id=app.id, sections={})
    c.name = (body.name or "").strip() or None
    sections: dict[str, Any] = {}
    for k, v in body.sections.items():
        e = entities[k]
        st = e.get("state") or {"states": [], "transitions": []}
        entry: dict[str, Any] = {key: val.strip() for key, val in (("label", v.label), ("plural_label", v.plural_label)) if val and val.strip()}
        if v.color:
            entry["color"] = v.color
        for key, given, allowed, what in (
            ("fields", v.fields, {f["key"] for f in e["fields"]}, "field"),
            ("states", v.states, {x["key"] for x in st["states"]}, "status"),
            ("transitions", v.transitions, {x["key"] for x in st["transitions"]}, "step"),
        ):
            got = names(given, allowed, what)
            if got:
                entry[key] = got
        sections[k] = entry
    c.sections = sections
    s.add(c)
    s.commit()
    return {"manifest": customized_manifest(s, app), "name": customized_manifest(s, app)["workflow"]["name"]}


@router.post("/{slug}/seed-sample")
def seed(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "seed")
    return {"created": seed_sample(s, app)}


@router.post("/{slug}/reset")
def reset(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    return {"deleted": _ctx(slug, request, s, "reset")[2].reset()}


# --- download -------------------------------------------------------------------------------------


def _csv(rt: AppRuntime, e: dict[str, Any]) -> str:
    out = io.StringIO()
    cols = [f["key"] for f in e["fields"]]
    w = csv.writer(out)
    w.writerow(["id", "code", *[f["label"] for f in e["fields"]]])
    for r in rt.list(e["key"]):
        w.writerow([r["id"], r["code"], *[(r["refs"][c]["title"] if c in r["refs"] else r["data"].get(c, "")) for c in cols]])
    return "﻿" + out.getvalue()  # BOM so Excel detects UTF-8


@router.get("/{slug}/export")
def export(slug: str, request: Request, s: Session = Depends(get_session)) -> Response:
    """Download the application: its compiled definition, every record (JSON + CSV) and a short guide."""
    app, _v, rt = _ctx(slug, request, s, "read")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(app.manifest, indent=2, ensure_ascii=False))
        everything: dict[str, Any] = {}
        for e in app.manifest["entities"]:
            everything[e["key"]] = rt.list(e["key"])
            z.writestr(f"data/{e['key']}.csv", _csv(rt, e))
        z.writestr("data/records.json", json.dumps(everything, indent=2, ensure_ascii=False, default=str))
        z.writestr("history.json", json.dumps(rt.events(limit=10000), indent=2, ensure_ascii=False, default=str))
        z.writestr(
            "README.txt",
            f"{app.name}\n{'=' * len(app.name)}\n\n"
            "Exported from Code Your Reality.\n\n"
            "manifest.json      The compiled application: data models, forms, states and business rules.\n"
            "data/*.csv         Your records, one file per list (opens in Excel or Google Sheets).\n"
            "data/records.json  The same records as JSON.\n"
            "history.json       Every operation, effect and rule rejection.\n\n"
            "The manifest runs on the Code Your Reality runtime; it contains no executable code.\n",
        )
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'})


@router.get("/{slug}/export/{entity}.csv")
def export_csv(slug: str, entity: str, request: Request, s: Session = Depends(get_session)) -> Response:
    app, _v, rt = _ctx(slug, request, s, "read")
    e = rt.entity(entity)
    return Response(_csv(rt, e).encode("utf-8"), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{slug}-{entity}.csv"'})


# --- reports (Plus) -------------------------------------------------------------------------------


@router.get("/{slug}/reports")
def app_reports(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _ctx(slug, request, s, "reports")
    plans.require_feature(s, "reports")
    return reports.build(s, app, rt.title_of)


# --- connections (Plus) ---------------------------------------------------------------------------


class WebhookBody(BaseModel):
    url: str = Field(min_length=8, max_length=500)


@router.get("/{slug}/integrations")
def app_integrations(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plan = plans.limits(s)
    st = access.settings_for(s, app)
    hooks = list(s.scalars(select(AppWebhook).where(AppWebhook.app_id == app.id).order_by(AppWebhook.created_at)))
    return {
        "unlocked": plan.integrations,
        "tools": integrations.detect(s, app),
        "calendar_path": f"/api/apps/{app.slug}/calendar.ics?token={st.calendar_token}" if plan.integrations else None,
        "csv": [{"entity": e["key"], "label": e["plural_label"], "path": f"/api/apps/{app.slug}/export/{e['key']}.csv"} for e in app.manifest["entities"]],
        "webhooks": [{"id": h.id, "url": h.url, "secret": h.secret, "active": h.active, "last_status": h.last_status, "last_sent_at": h.last_sent_at.isoformat() if h.last_sent_at else None} for h in hooks] if plan.integrations else [],
    }


@router.get("/{slug}/calendar.ics")
def calendar(slug: str, token: str, s: Session = Depends(get_session)) -> Response:
    """Calendar subscription (Google Calendar, Outlook, Apple Calendar). Authorized by its own token."""
    app = get_app(s, slug)
    st = access.settings_for(s, app)
    if token != st.calendar_token:
        raise HTTPException(404, "Unknown calendar.")
    plans.require_feature(s, "integrations")
    rt = AppRuntime(s, app)
    return Response(integrations.calendar_ics(s, app, rt.title_of, rt.code_of), media_type="text/calendar; charset=utf-8")


@router.post("/{slug}/webhooks", status_code=201)
def add_webhook(slug: str, body: WebhookBody, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plans.require_feature(s, "integrations")
    if not integrations.valid_webhook_url(body.url):
        raise HTTPException(422, "Enter a full http:// or https:// address.")
    hook = AppWebhook(app_id=app.id, url=body.url.strip())
    s.add(hook)
    s.commit()
    return {"id": hook.id, "secret": hook.secret}


@router.delete("/{slug}/webhooks/{hook_id}", status_code=204)
def delete_webhook(slug: str, hook_id: str, request: Request, s: Session = Depends(get_session)) -> None:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    hook = s.get(AppWebhook, hook_id)
    if not hook or hook.app_id != app.id:
        raise HTTPException(404, "Webhook not found.")
    s.delete(hook)
    s.commit()


@router.post("/{slug}/webhooks/{hook_id}/test")
def test_webhook(slug: str, hook_id: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plans.require_feature(s, "integrations")
    hook = s.get(AppWebhook, hook_id)
    if not hook or hook.app_id != app.id:
        raise HTTPException(404, "Webhook not found.")
    status = integrations.send(hook, {"app": app.slug, "event": {"kind": "test", "summary": "Test event from Code Your Reality"}})
    hook.last_status = status
    s.commit()
    return {"status": status}


# --- team (Plus) ----------------------------------------------------------------------------------


class MemberBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: Literal["manager", "staff", "viewer"]


def _member_dict(m: AppMember) -> dict[str, Any]:
    return {"id": m.id, "name": m.name, "role": m.role, "key": m.key, "created_at": m.created_at.isoformat()}


@router.get("/{slug}/team")
def team(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plan = plans.limits(s)
    st = access.settings_for(s, app)
    members = list(s.scalars(select(AppMember).where(AppMember.app_id == app.id).order_by(AppMember.created_at)))
    return {"access_mode": st.access_mode, "unlocked": plan.team, "seats": plan.members, "members": [_member_dict(m) for m in members]}


@router.post("/{slug}/team/enable")
def enable_team(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plans.require_feature(s, "team")
    st = access.settings_for(s, app)
    owner = s.scalars(select(AppMember).where(AppMember.app_id == app.id, AppMember.role == "owner")).first()
    if not owner:
        owner = AppMember(app_id=app.id, name="Owner", role="owner")
        s.add(owner)
    st.access_mode = "team"
    s.commit()
    return {"access_mode": "team", "owner_key": owner.key}


@router.post("/{slug}/team/disable")
def disable_team(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    access.settings_for(s, app).access_mode = "open"
    s.commit()
    return {"access_mode": "open"}


@router.post("/{slug}/team", status_code=201)
def add_member(slug: str, body: MemberBody, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    plan = plans.require_feature(s, "team")
    count = len(list(s.scalars(select(AppMember).where(AppMember.app_id == app.id))))
    if count >= plan.members:
        raise plans.upgrade_required("members", plan, f"The {plan.name} plan includes {plan.members} people per app.")
    m = AppMember(app_id=app.id, name=body.name.strip(), role=body.role)
    s.add(m)
    s.commit()
    return _member_dict(m)


@router.delete("/{slug}/team/{member_id}", status_code=204)
def remove_member(slug: str, member_id: str, request: Request, s: Session = Depends(get_session)) -> None:
    app, _v, _rt = _ctx(slug, request, s, "admin")
    m = s.get(AppMember, member_id)
    if not m or m.app_id != app.id:
        raise HTTPException(404, "Member not found.")
    if m.role == "owner":
        raise HTTPException(400, "The owner can't be removed.")
    s.delete(m)
    s.commit()


# --- invoicing: the business invoices its own customers (Plus) -------------------------------------------


class Buyer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field("", max_length=254)
    country: str = Field("", max_length=60)
    postcode: str = Field("", max_length=12)
    city: str = Field("", max_length=80)
    address: str = Field("", max_length=200)
    tax_number: str = Field("", max_length=30)


class Line(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: float = Field(1, gt=0)
    unit: str = Field("db", max_length=20)
    unit_price: float = Field(ge=0)
    vat_rate: str = "27"


class NewInvoice(BaseModel):
    record_id: str | None = None
    buyer: Buyer
    items: list[Line] = Field(min_length=1, max_length=50)
    note: str = Field("", max_length=500)


class AppInvoicingSettings(BaseModel):
    provider: Literal["none", "szamlazz"] = "none"
    agent_key: str | None = Field(None, max_length=200)
    remove_agent_key: bool = False
    e_invoice: bool = True
    send_email: bool = True
    auto_issue: bool = False
    language: Literal["hu", "en", "de"] = "hu"
    currency: Literal["HUF", "EUR", "USD"] = "HUF"
    vat_rate: Literal["27", "18", "5", "0", "AAM", "TAM", "EU", "EUK", "MAA", "F.AFA", "K.AFA"] = "27"
    payment_days: int = Field(8, ge=0, le=90)
    note: str = Field("", max_length=500)


def _invoicing_ctx(slug: str, request: Request, s: Session, permission: str) -> tuple[GeneratedApp, access.Viewer, AppRuntime]:
    ctx = _ctx(slug, request, s, permission)
    plans.require_feature(s, "invoicing")
    return ctx


def _app_invoice(s: Session, app: GeneratedApp, invoice_id: str) -> Invoice:
    inv = s.get(Invoice, invoice_id)
    if not inv or inv.scope != app.id:
        raise HTTPException(404, "Invoice not found.")
    return inv


def _with_record(rt: AppRuntime, inv: Invoice) -> dict[str, Any]:
    out = invoicing.public(inv)
    if inv.record_id:
        rec = rt.s.get(Record, inv.record_id)
        if rec and rec.app_id == rt.app.id:
            out["record"] = {"id": rec.id, "entity": rec.entity, "code": rt.code_of(rec), "title": rt.title_of(rec)}
    return out


@router.get("/{slug}/invoicing")
def get_app_invoicing(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _invoicing_ctx(slug, request, s, "admin")
    c = invoicing.config(s, app.id)
    s.commit()
    return invoicing.public_config(c)


@router.put("/{slug}/invoicing")
def set_app_invoicing(slug: str, body: AppInvoicingSettings, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, _rt = _invoicing_ctx(slug, request, s, "admin")
    return invoicing.public_config(invoicing.update_config(s, app.id, body.model_dump()))


@router.get("/{slug}/invoices")
def list_invoices(slug: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _invoicing_ctx(slug, request, s, "update")
    c = invoicing.config(s, app.id)
    s.commit()
    return {"config": invoicing.public_config(c), "invoices": [_with_record(rt, i) for i in invoicing.list_for(s, app.id)]}


def _guess(fields: list[dict[str, Any]], data: dict[str, Any], *words: str) -> str:
    for f in fields:
        if any(w in f["key"].lower() for w in words) and data.get(f["key"]) not in (None, ""):
            return str(data[f["key"]])
    return ""


@router.get("/{slug}/invoices/prefill")
def prefill_invoice(slug: str, request: Request, record_id: str, entity: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    """A starting point from a record: the linked customer as buyer, money fields as lines."""
    _app, _v, rt = _invoicing_ctx(slug, request, s, "update")
    rec = rt.get(entity, record_id)
    e = rt.entity(entity)
    buyer: dict[str, Any] = {"name": "", "email": ""}
    for f in e["fields"]:
        if f["type"] != "reference" or not rec.data.get(f["key"]):
            continue
        target = s.get(Record, rec.data[f["key"]])
        te = rt.entities.get(f["ref_entity"])
        if not target or not te:
            continue
        email = _guess(te["fields"], target.data, "email", "mail")
        if email or not buyer["name"]:
            buyer = {
                "name": rt.title_of(target),
                "email": email,
                "postcode": _guess(te["fields"], target.data, "postcode", "zip", "irsz"),
                "city": _guess(te["fields"], target.data, "city", "town", "telepules"),
                "address": _guess(te["fields"], target.data, "address", "street", "cim"),
                "tax_number": _guess(te["fields"], target.data, "tax", "vat", "adoszam"),
            }
    lines = [
        {"name": f"{f['label']} – {rt.code_of(rec)}", "quantity": 1, "unit": "db", "unit_price": rec.data[f["key"]]}
        for f in e["fields"]
        if f["type"] == "money" and isinstance(rec.data.get(f["key"]), (int, float)) and rec.data[f["key"]] > 0
    ] or [{"name": rt.title_of(rec), "quantity": 1, "unit": "db", "unit_price": 0}]
    return {"buyer": buyer, "items": lines, "record": {"id": rec.id, "entity": entity, "code": rt.code_of(rec), "title": rt.title_of(rec)}}


@router.post("/{slug}/invoices", status_code=201)
def create_invoice(slug: str, body: NewInvoice, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, viewer, rt = _invoicing_ctx(slug, request, s, "update")
    rec = None
    if body.record_id:
        rec = s.get(Record, body.record_id)
        if not rec or rec.app_id != app.id:
            raise HTTPException(404, "Record not found.")
    inv = invoicing.create(s, app.id, kind="sale", buyer=body.buyer.model_dump(), items=[i.model_dump() for i in body.items], record_id=rec.id if rec else None, note=body.note)
    if rec:
        status = f"issued as {inv.number}" if inv.status == "issued" else "draft"
        author = viewer.member.name if viewer.member else access.ROLE_LABELS[viewer.role]
        s.add(RecordEvent(app_id=app.id, record_id=rec.id, entity=rec.entity, kind="note", summary=f"Invoice {inv.number or f'DRAFT-{inv.seq:04d}'} for {inv.gross} {inv.currency} ({status}).", detail={"author": author, "invoice": inv.id}))
    s.commit()
    return _with_record(rt, inv)


@router.get("/{slug}/invoices/{invoice_id}")
def get_app_invoice(slug: str, invoice_id: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _invoicing_ctx(slug, request, s, "update")
    return _with_record(rt, _app_invoice(s, app, invoice_id))


@router.post("/{slug}/invoices/{invoice_id}/issue")
def issue_app_invoice(slug: str, invoice_id: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _invoicing_ctx(slug, request, s, "update")
    return _with_record(rt, invoicing.issue(s, _app_invoice(s, app, invoice_id)))


@router.post("/{slug}/invoices/{invoice_id}/paid")
def app_invoice_paid(slug: str, invoice_id: str, request: Request, s: Session = Depends(get_session)) -> dict[str, Any]:
    app, _v, rt = _invoicing_ctx(slug, request, s, "update")
    inv = _app_invoice(s, app, invoice_id)
    inv.paid_at = None if inv.paid_at else utcnow()
    s.commit()
    return _with_record(rt, inv)


@router.delete("/{slug}/invoices/{invoice_id}", status_code=204)
def delete_app_invoice(slug: str, invoice_id: str, request: Request, s: Session = Depends(get_session)) -> None:
    """Only drafts can be deleted; an issued invoice can only be cancelled in Számlázz.hu (storno)."""
    app, _v, _rt = _invoicing_ctx(slug, request, s, "update")
    inv = _app_invoice(s, app, invoice_id)
    if inv.status == "issued":
        raise HTTPException(409, "Issued invoices can't be deleted. Cancel it with a storno invoice in Számlázz.hu.")
    s.delete(inv)
    s.commit()


@router.get("/{slug}/invoices/{invoice_id}/pdf")
def app_invoice_pdf(slug: str, invoice_id: str, request: Request, s: Session = Depends(get_session)) -> FileResponse:
    app, _v, _rt = _invoicing_ctx(slug, request, s, "update")
    inv = _app_invoice(s, app, invoice_id)
    path = invoicing.pdf_path(inv)
    if not path:
        raise HTTPException(404, "This invoice has no PDF yet: it is created when the invoice is issued.")
    return FileResponse(path, media_type="application/pdf", filename=f"{inv.number or inv.id}.pdf")
