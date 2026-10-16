"""Endpoints of generated applications: the runtime's public surface."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
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
