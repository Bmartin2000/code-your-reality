"""Endpoints of generated applications: the runtime's public surface, with role-based access."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import AppMember, AppWebhook, GeneratedApp, get_session
from ..services import access, integrations, plans, reports
from ..services.apps import app_summary, can_seed_sample, get_app, seed_sample
from ..workflow.runtime import AppRuntime

router = APIRouter(prefix="/api/apps")


def _ctx(slug: str, request: Request, s: Session, permission: str) -> tuple[GeneratedApp, access.Viewer, AppRuntime]:
    app = get_app(s, slug)
    viewer = access.viewer_for(s, app, request)
    access.require(viewer, permission)
    return app, viewer, AppRuntime(s, app)


def _emit(app: GeneratedApp, rt: AppRuntime) -> None:
    integrations.dispatch(app.id, app.slug, rt.emitted)


@router.get("")
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
        return {"slug": app.slug, "name": app.name, "access_mode": st.access_mode, "locked": True}
    plan = plans.limits(s)
    return {
        **app_summary(s, app),
        "manifest": app.manifest,
        "can_seed_sample": can_seed_sample(app),
        "access_mode": st.access_mode,
        "locked": False,
        "viewer": {"role": viewer.role, "name": viewer.member.name if viewer.member else None, "permissions": sorted(access.PERMISSIONS[viewer.role])},
        "features": {"reports": plan.reports, "integrations": plan.integrations, "team": plan.team, "plan": plan.name},
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
