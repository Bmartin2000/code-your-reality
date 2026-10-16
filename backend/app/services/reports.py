"""Reports for a generated application, computed from its records and event history."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import GeneratedApp, Record, RecordEvent

DUE_HINTS = ("due", "return", "expected", "deadline", "end", "until", "határidő", "vissza")


def _days(n: int) -> list[date]:
    today = datetime.now(timezone.utc).date()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def build(s: Session, app: GeneratedApp, title_of) -> dict[str, Any]:
    m = app.manifest
    today = datetime.now(timezone.utc).date()
    days30 = _days(30)
    records = list(s.scalars(select(Record).where(Record.app_id == app.id)))
    events = list(s.scalars(select(RecordEvent).where(RecordEvent.app_id == app.id)))
    by_entity: dict[str, list[Record]] = defaultdict(list)
    for r in records:
        by_entity[r.entity].append(r)
    by_id = {r.id: r for r in records}

    entities = []
    for e in m["entities"]:
        rows = by_entity.get(e["key"], [])
        per_day = Counter(r.created_at.date() for r in rows)
        numeric = []
        for f in e["fields"]:
            if f["type"] in ("number", "money"):
                vals = [float(r.data[f["key"]]) for r in rows if isinstance(r.data.get(f["key"]), (int, float))]
                if vals:
                    numeric.append({"field": f["key"], "label": f["label"], "type": f["type"], "sum": round(sum(vals), 2), "avg": round(sum(vals) / len(vals), 2), "min": min(vals), "max": max(vals), "count": len(vals)})
        breakdowns = []
        for f in e["fields"]:
            if f["type"] == "enum":
                counts = Counter(r.data.get(f["key"]) for r in rows)
                state_labels = {st["key"]: st["label"] for st in (e["state"]["states"] if e["state"] and e["state"]["field"] == f["key"] else [])}
                breakdowns.append({"field": f["key"], "label": f["label"], "values": [{"value": o, "label": state_labels.get(o, o), "count": counts.get(o, 0)} for o in f["options"]]})
        top_refs = []
        for f in e["fields"]:
            if f["type"] == "reference":
                counts = Counter(r.data.get(f["key"]) for r in rows if r.data.get(f["key"]))
                top = [{"id": rid, "title": title_of(by_id[rid]) if rid in by_id else rid, "count": n} for rid, n in counts.most_common(5)]
                if top:
                    target = next((x for x in m["entities"] if x["key"] == f["ref_entity"]), None)
                    top_refs.append({"field": f["key"], "label": f["label"], "target": target["plural_label"] if target else f["ref_entity"], "top": top})
        lifecycle = None
        if e["state"]:
            terminal = {st["key"] for st in e["state"]["states"] if st["terminal"]}
            open_rows = [r for r in rows if r.data.get(e["state"]["field"]) not in terminal]
            durations = []
            for ev in events:
                if ev.kind == "transition" and ev.entity == e["key"] and ev.detail and ev.detail.get("to") in terminal and ev.record_id in by_id:
                    durations.append((ev.created_at - by_id[ev.record_id].created_at).total_seconds() / 3600)
            due_field = next((f for f in e["fields"] if f["type"] == "date" and any(h in f["key"] for h in DUE_HINTS)), None)
            overdue = []
            if due_field:
                for r in open_rows:
                    try:
                        if date.fromisoformat(str(r.data.get(due_field["key"]))) < today:
                            overdue.append({"id": r.id, "title": title_of(r), "due": r.data.get(due_field["key"])})
                    except (TypeError, ValueError):
                        pass
            lifecycle = {
                "open": len(open_rows),
                "closed": len(rows) - len(open_rows),
                "avg_hours_to_close": round(sum(durations) / len(durations), 1) if durations else None,
                "due_field": due_field["label"] if due_field else None,
                "overdue": overdue[:10],
                "overdue_count": len(overdue),
            }
        entities.append(
            {
                "key": e["key"],
                "label": e["label"],
                "plural_label": e["plural_label"],
                "total": len(rows),
                "created_last_30_days": sum(per_day.get(d, 0) for d in days30),
                "per_day": [{"date": d.isoformat(), "count": per_day.get(d, 0)} for d in days30],
                "numeric": numeric,
                "breakdowns": breakdowns,
                "top_references": top_refs,
                "lifecycle": lifecycle,
            }
        )

    rejected = [ev for ev in events if ev.kind == "rejected"]
    rule_hits = Counter((ev.detail or {}).get("rule", {}).get("statement") for ev in rejected if (ev.detail or {}).get("rule"))
    activity = Counter(ev.created_at.date() for ev in events)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "entities": entities,
        "activity": [{"date": d.isoformat(), "count": activity.get(d, 0)} for d in days30],
        "operations": len([ev for ev in events if ev.kind in ("created", "transition", "updated")]),
        "rejections": len(rejected),
        "rules_that_stopped_mistakes": [{"statement": st, "count": n} for st, n in rule_hits.most_common(5)],
    }
