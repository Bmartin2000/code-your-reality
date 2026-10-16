"""Audit trail for human review and system actions, plus the review diff between workflow versions."""

from __future__ import annotations

from typing import Any, Iterator

from sqlalchemy.orm import Session

from ..db import AuditEvent


def record_audit(s: Session, project_id: str, *, action: str, target_kind: str, target_id: str, summary: str, actor: str = "reviewer", detail: dict[str, Any] | None = None) -> None:
    s.add(AuditEvent(project_id=project_id, actor=actor, action=action, target_kind=target_kind, target_id=target_id, summary=summary[:1000], detail=detail))


def _reviewables(defn: dict[str, Any]) -> Iterator[tuple[str, str, str, dict[str, Any]]]:
    for e in defn.get("entities", []):
        yield "entity", e["key"], e["label"], e
        for f in e.get("fields", []):
            yield "field", f"{e['key']}.{f['key']}", f"{e['label']}.{f['label']}", f
    for m in defn.get("state_machines", []):
        yield "state_machine", m["entity"], f"{m['entity']} states", m
        for t in m.get("transitions", []):
            yield "transition", f"{m['entity']}.{t['key']}", t["label"], t
    for r in defn.get("rules", []):
        yield "rule", r["id"], r["statement"], r
    for a in defn.get("actions", []):
        yield "action", a["id"], a["label"], a


def _content(item: dict[str, Any]) -> dict[str, Any]:
    nested = {"fields", "transitions", "review", "provenance"}
    return {k: v for k, v in item.items() if k not in nested}


def review_diff(old: dict[str, Any], new: dict[str, Any]) -> list[dict[str, str]]:
    """Derive audit events from two versions of a definition (server-side; not trusted from the client)."""
    before = {(k, i): (label, item) for k, i, label, item in _reviewables(old)}
    after = {(k, i): (label, item) for k, i, label, item in _reviewables(new)}
    events: list[dict[str, str]] = []
    for key, (label, item) in after.items():
        kind, tid = key
        if key not in before:
            events.append({"action": "added", "target_kind": kind, "target_id": tid, "summary": f"Added {kind.replace('_', ' ')} “{label}”."})
            continue
        old_label, old_item = before[key]
        old_status = (old_item.get("review") or {}).get("status", "pending")
        new_status = (item.get("review") or {}).get("status", "pending")
        if _content(old_item) != _content(item):
            events.append({"action": "edited", "target_kind": kind, "target_id": tid, "summary": f"Edited {kind.replace('_', ' ')} “{label}”."})
        if old_status != new_status:
            verb = {"accepted": "confirmed", "rejected": "rejected", "pending": "reopened"}[new_status]
            events.append({"action": verb, "target_kind": kind, "target_id": tid, "summary": f"{verb.capitalize()} {kind.replace('_', ' ')} “{label}”."})
    for key, (label, _item) in before.items():
        if key not in after:
            kind, tid = key
            events.append({"action": "removed", "target_kind": kind, "target_id": tid, "summary": f"Removed {kind.replace('_', ' ')} “{label}”."})
    return events
