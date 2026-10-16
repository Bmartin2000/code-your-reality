"""Endpoints of generated applications: the runtime's public surface."""

from __future__ import annotations

from typing import Any

import csv
import io
import json
import zipfile

from fastapi import APIRouter, Body, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import GeneratedApp, get_session
from ..services.apps import app_summary, can_seed_sample, get_app, seed_sample
from ..workflow.runtime import AppRuntime

router = APIRouter(prefix="/api/apps")


@router.get("")
def list_apps(s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [app_summary(s, a) for a in s.scalars(select(GeneratedApp).order_by(GeneratedApp.updated_at.desc()))]


@router.get("/{slug}")
def get_application(slug: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    app = get_app(s, slug)
    return {**app_summary(s, app), "manifest": app.manifest, "can_seed_sample": can_seed_sample(app)}


@router.get("/{slug}/stats")
def stats(slug: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    return AppRuntime(s, get_app(s, slug)).stats()


@router.get("/{slug}/events")
def events(slug: str, limit: int = 40, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return AppRuntime(s, get_app(s, slug)).events(limit=max(1, min(limit, 200)))


@router.get("/{slug}/records/{entity}")
def list_records(slug: str, entity: str, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return AppRuntime(s, get_app(s, slug)).list(entity)


@router.post("/{slug}/records/{entity}", status_code=201)
def create_record(slug: str, entity: str, payload: dict[str, Any] = Body(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    rt = AppRuntime(s, get_app(s, slug))
    rec, effects = rt.create(entity, payload)
    return {"record": rt.serialize(rec), "effects": effects}


@router.get("/{slug}/records/{entity}/{record_id}")
def get_record(slug: str, entity: str, record_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    rt = AppRuntime(s, get_app(s, slug))
    rec = rt.get(entity, record_id)
    return {"record": rt.serialize(rec), "history": rt.events(record_id=rec.id, limit=100)}


@router.patch("/{slug}/records/{entity}/{record_id}")
def update_record(slug: str, entity: str, record_id: str, payload: dict[str, Any] = Body(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    rt = AppRuntime(s, get_app(s, slug))
    return {"record": rt.serialize(rt.update(entity, record_id, payload))}


@router.post("/{slug}/records/{entity}/{record_id}/transitions/{transition}")
def transition(slug: str, entity: str, record_id: str, transition: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    rt = AppRuntime(s, get_app(s, slug))
    rec, effects = rt.transition(entity, record_id, transition)
    return {"record": rt.serialize(rec), "effects": effects}


@router.post("/{slug}/seed-sample")
def seed(slug: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    return {"created": seed_sample(s, get_app(s, slug))}


@router.post("/{slug}/reset")
def reset(slug: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    return {"deleted": AppRuntime(s, get_app(s, slug)).reset()}


@router.get("/{slug}/export")
def export(slug: str, s: Session = Depends(get_session)) -> Response:
    """Download the application: its compiled definition, every record (JSON + CSV) and a short guide."""
    app = get_app(s, slug)
    rt = AppRuntime(s, app)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(app.manifest, indent=2, ensure_ascii=False))
        everything: dict[str, Any] = {}
        for e in app.manifest["entities"]:
            rows = rt.list(e["key"])
            everything[e["key"]] = rows
            out = io.StringIO()
            cols = [f["key"] for f in e["fields"]]
            w = csv.writer(out)
            w.writerow(["id", "code", *[f["label"] for f in e["fields"]]])
            for r in rows:
                w.writerow([r["id"], r["code"], *[(r["refs"][c]["title"] if c in r["refs"] else r["data"].get(c, "")) for c in cols]])
            z.writestr(f"data/{e['key']}.csv", "\ufeff" + out.getvalue())  # BOM so Excel detects UTF-8
        z.writestr("data/records.json", json.dumps(everything, indent=2, ensure_ascii=False, default=str))
        z.writestr("history.json", json.dumps(rt.events(limit=10000), indent=2, ensure_ascii=False, default=str))
        z.writestr(
            "README.txt",
            f"{app.name}\n{'=' * len(app.name)}\n\n"
            "Exported from Reality Compiler.\n\n"
            "manifest.json      The compiled application: data models, forms, states and business rules.\n"
            "data/*.csv         Your records, one file per entity (opens in Excel or Google Sheets).\n"
            "data/records.json  The same records as JSON.\n"
            "history.json       Every operation, effect and rule rejection.\n\n"
            "The manifest runs on the Reality Compiler runtime; it contains no executable code.\n",
        )
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'})
