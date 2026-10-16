"""The predefined application runtime.

Interprets a compiled manifest: validates input against the generated data models, enforces the
compiled business rules, executes state transitions and their effects, and records every operation.
This is the only place where generated applications "run", and it never evaluates code from the
workflow definition — rules are a closed set of parameterized checks implemented here.
"""

from __future__ import annotations

import re
import threading
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import GeneratedApp, Record, RecordEvent

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[+()0-9 .\-/]{5,32}$")

# One writer at a time per app: rule checks and effects happen atomically with respect to other
# operations on the same application. (Single-process deployment; see README limitations.)
_app_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)


class RuntimeErrorBase(Exception):
    status_code = 400

    def __init__(self, message: str, *, field_errors: dict[str, str] | None = None, rule: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}
        self.rule = rule

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"message": self.message}
        if self.field_errors:
            out["field_errors"] = self.field_errors
        if self.rule:
            out["rule"] = self.rule
        return out


class ValidationFailed(RuntimeErrorBase):
    status_code = 422


class RuleViolation(RuntimeErrorBase):
    status_code = 409


class InvalidTransition(RuntimeErrorBase):
    status_code = 409


class NotFound(RuntimeErrorBase):
    status_code = 404


class AppRuntime:
    def __init__(self, session: Session, app: GeneratedApp):
        self.s = session
        self.app = app
        self.m = app.manifest
        self.entities = {e["key"]: e for e in self.m["entities"]}
        self.rules = {r["id"]: r for r in self.m["rules"]}
        self.forms = {f["entity"]: f for f in self.m["forms"]}
        self.emitted: list[dict[str, Any]] = []  # events produced by this request (for webhooks)

    # --- helpers --------------------------------------------------------------------------------

    def entity(self, key: str) -> dict[str, Any]:
        e = self.entities.get(key)
        if not e:
            raise NotFound(f"This application has no '{key}' data.")
        return e

    def get(self, entity_key: str, record_id: str) -> Record:
        rec = self.s.get(Record, record_id)
        if not rec or rec.app_id != self.app.id or rec.entity != entity_key:
            raise NotFound(f"{self.entity(entity_key)['label']} not found.")
        return rec

    def title_of(self, rec: Record) -> str:
        e = self.entities.get(rec.entity)
        if not e:
            return rec.id
        value = rec.data.get(e["title_field"])
        title_def = next((f for f in e["fields"] if f["key"] == e["title_field"]), None)
        if value and title_def and title_def["type"] == "reference":
            target = self.s.get(Record, value)
            return f"{self.title_of(target)} · {self.code_of(rec)}" if target else self.code_of(rec)
        return str(value) if value not in (None, "") else self.code_of(rec)

    def code_of(self, rec: Record) -> str:
        e = self.entities[rec.entity]
        return f"{e['code_prefix']}-{rec.seq:04d}"

    def _log(self, rec: Record | None, entity: str, kind: str, summary: str, detail: dict[str, Any] | None = None) -> None:
        self.emitted.append({"kind": kind, "entity": entity, "record_id": rec.id if rec else None, "summary": summary, "detail": detail})
        self.s.add(
            RecordEvent(
                app_id=self.app.id,
                record_id=rec.id if rec else None,
                entity=entity,
                kind=kind,
                summary=summary,
                detail=detail,
            )
        )

    def _rule_public(self, rule_id: str) -> dict[str, Any]:
        r = self.rules[rule_id]
        return {"id": r["id"], "statement": r["statement"], "kind": r["kind"], "source": r["source"]}

    def _record_rejection(self, entity: str, rec: Record | None, err: RuntimeErrorBase) -> None:
        """Rejections are part of the operational history; persist them outside the failed transaction."""
        self.s.rollback()
        self._log(rec, entity, "rejected", err.message, {"rule": err.rule} if err.rule else None)
        self.s.commit()

    # --- value coercion -------------------------------------------------------------------------

    def _coerce(self, f: dict[str, Any], raw: Any) -> Any:
        t = f["type"]
        if raw is None or (isinstance(raw, str) and raw.strip() == ""):
            return None
        if t in ("text", "long_text"):
            if not isinstance(raw, (str, int, float)):
                raise ValueError("Enter text.")
            value = str(raw).strip()
            limit = 4000 if t == "long_text" else 300
            if len(value) > limit:
                raise ValueError(f"Keep this under {limit} characters.")
            return value
        if t in ("number", "money"):
            if isinstance(raw, bool):
                raise ValueError("Enter a number.")
            try:
                d = Decimal(str(raw).replace(",", "").strip())
            except InvalidOperation:
                raise ValueError("Enter a number.") from None
            if not d.is_finite() or abs(d) > Decimal("1e12"):
                raise ValueError("Enter a realistic number.")
            if t == "money":
                return float(d.quantize(Decimal("0.01")))
            return int(d) if d == d.to_integral_value() else float(d)
        if t == "date":
            if raw == "$today":
                return date.today().isoformat()
            try:
                return date.fromisoformat(str(raw)[:10]).isoformat()
            except ValueError:
                raise ValueError("Enter a valid date (YYYY-MM-DD).") from None
        if t == "email":
            value = str(raw).strip()
            if not EMAIL_RE.match(value) or len(value) > 254:
                raise ValueError("Enter a valid email address.")
            return value
        if t == "phone":
            value = str(raw).strip()
            if not PHONE_RE.match(value):
                raise ValueError("Enter a valid phone number.")
            return value
        if t == "enum":
            value = str(raw).strip()
            if value not in f["options"]:
                raise ValueError(f"Choose one of: {', '.join(f['options'])}.")
            return value
        if t == "boolean":
            if isinstance(raw, bool):
                return raw
            if str(raw).lower() in ("true", "1", "yes", "on"):
                return True
            if str(raw).lower() in ("false", "0", "no", "off"):
                return False
            raise ValueError("Choose yes or no.")
        if t == "reference":
            ref_id = str(raw).strip()
            target = self.s.get(Record, ref_id)
            if not target or target.app_id != self.app.id or target.entity != f["ref_entity"]:
                raise ValueError(f"Choose an existing {self.entities[f['ref_entity']]['label'].lower()}.")
            return ref_id
        raise ValueError("Unsupported field type.")

    def _clean(self, entity: dict[str, Any], payload: dict[str, Any], allowed: list[str], *, partial: bool) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValidationFailed("Expected an object of field values.")
        fields = {f["key"]: f for f in entity["fields"]}
        unknown = [k for k in payload if k not in allowed]
        errors: dict[str, str] = {}
        for k in unknown:
            errors[k] = "This field can't be set here." if k in fields else "Unknown field."
        clean: dict[str, Any] = {}
        for key in allowed:
            f = fields[key]
            if partial and key not in payload:
                continue
            raw = payload.get(key, f.get("default"))
            try:
                value = self._coerce(f, raw)
            except ValueError as exc:
                errors[key] = str(exc)
                continue
            if value is None and f["required"]:
                errors[key] = f"{f['label']} is required."
                continue
            clean[key] = value
        if errors:
            raise ValidationFailed("Some fields need attention.", field_errors=errors)
        return clean

    # --- rules ----------------------------------------------------------------------------------

    def _check_invariants(self, entity: dict[str, Any], data: dict[str, Any], rec_id: str | None) -> None:
        for rule_id in self.m["invariants"].get(entity["key"], []):
            r = self.rules[rule_id]
            p = r["params"]
            if r["kind"] == "min_value":
                v = data.get(p["field"])
                if v is not None and float(v) < float(p["min"]):
                    raise RuleViolation(r["statement"], field_errors={p["field"]: r["statement"]}, rule=self._rule_public(rule_id))
            elif r["kind"] == "date_order":
                a, b = data.get(p["start_field"]), data.get(p["end_field"])
                if a and b and a > b:
                    raise RuleViolation(r["statement"], field_errors={p["end_field"]: r["statement"]}, rule=self._rule_public(rule_id))
            elif r["kind"] == "exclusive_reference":
                state_field = entity["state"]["field"] if entity["state"] else None
                if not state_field or data.get(state_field) not in p["states"]:
                    continue
                target_id = data.get(p["ref_field"])
                if not target_id:
                    continue
                q = select(Record).where(Record.app_id == self.app.id, Record.entity == entity["key"])
                for other in self.s.scalars(q):
                    if other.id == rec_id:
                        continue
                    if other.data.get(p["ref_field"]) == target_id and other.data.get(state_field) in p["states"]:
                        target = self.s.get(Record, target_id)
                        name = self.title_of(target) if target else "This record"
                        raise RuleViolation(
                            f"{name} already has an open {entity['label'].lower()} ({self.code_of(other)}). {r['statement']}",
                            field_errors={p["ref_field"]: r["statement"]},
                            rule=self._rule_public(rule_id),
                        )

    def _check_guards(self, entity: dict[str, Any], event: str, data: dict[str, Any]) -> None:
        for rule_id in self.m["guards"].get(entity["key"], {}).get(event, []):
            r = self.rules[rule_id]
            p = r["params"]
            target_id = data.get(p["ref_field"])
            target = self.s.get(Record, target_id) if target_id else None
            if not target:
                continue
            actual = target.data.get(p["target_field"])
            if actual != p["equals"]:
                ref_entity = self.entities[target.entity]
                field_label = next((f["label"] for f in ref_entity["fields"] if f["key"] == p["target_field"]), p["target_field"])
                raise RuleViolation(
                    f"{self.title_of(target)} is '{actual}' ({field_label.lower()}), so this can't proceed. {r['statement']}",
                    field_errors={p["ref_field"]: r["statement"]},
                    rule=self._rule_public(rule_id),
                )

    def _apply_effects(self, entity: dict[str, Any], event: str, rec: Record) -> list[dict[str, Any]]:
        applied: list[dict[str, Any]] = []
        for rule_id in self.m["effects"].get(entity["key"], {}).get(event, []):
            r = self.rules[rule_id]
            p = r["params"]
            if r["kind"] == "set_ref_field":
                target = self.s.get(Record, rec.data.get(p["ref_field"]))
                if not target:
                    continue
                before = target.data.get(p["target_field"])
                target.data = {**target.data, p["target_field"]: p["value"]}
                self._log(
                    target,
                    target.entity,
                    "effect",
                    f"{self.title_of(target)}: {p['target_field']} {before} → {p['value']}",
                    {"rule": self._rule_public(rule_id), "caused_by": rec.id, "field": p["target_field"], "from": before, "to": p["value"]},
                )
                applied.append({"rule": rule_id, "record": target.id, "field": p["target_field"], "from": before, "to": p["value"]})
            elif r["kind"] == "set_field":
                value = date.today().isoformat() if p["value"] == "$today" else p["value"]
                before = rec.data.get(p["field"])
                rec.data = {**rec.data, p["field"]: value}
                applied.append({"rule": rule_id, "record": rec.id, "field": p["field"], "from": before, "to": value})
        return applied

    # --- operations -----------------------------------------------------------------------------

    def create(self, entity_key: str, payload: dict[str, Any]) -> tuple[Record, list[dict[str, Any]]]:
        entity = self.entity(entity_key)
        with _app_locks[self.app.id]:
            data = self._clean(entity, payload, self.forms[entity_key]["create_fields"], partial=False)
            for f in entity["fields"]:
                if f["system"]:
                    data[f["key"]] = f.get("default")
            if entity["state"]:
                data[entity["state"]["field"]] = entity["state"]["initial"]
            try:
                self._check_invariants(entity, data, None)
                self._check_guards(entity, "create", data)
            except RuntimeErrorBase as err:
                self._record_rejection(entity_key, None, err)
                raise
            seq = (self.s.scalar(select(func.max(Record.seq)).where(Record.app_id == self.app.id, Record.entity == entity_key)) or 0) + 1
            rec = Record(app_id=self.app.id, entity=entity_key, seq=seq, data=data)
            self.s.add(rec)
            self.s.flush()
            self._log(rec, entity_key, "created", f"{entity['label']} {self.code_of(rec)} created: {self.title_of(rec)}")
            effects = self._apply_effects(entity, "create", rec)
            self.s.commit()
            return rec, effects

    def update(self, entity_key: str, record_id: str, payload: dict[str, Any]) -> Record:
        entity = self.entity(entity_key)
        with _app_locks[self.app.id]:
            rec = self.get(entity_key, record_id)
            changes = self._clean(entity, payload, self.forms[entity_key]["edit_fields"], partial=True)
            data = {**rec.data, **changes}
            try:
                self._check_invariants(entity, data, rec.id)
            except RuntimeErrorBase as err:
                self._record_rejection(entity_key, rec, err)
                raise
            changed = [k for k in changes if rec.data.get(k) != changes[k]]
            rec.data = data
            if changed:
                self._log(rec, entity_key, "updated", f"{entity['label']} {self.code_of(rec)} updated: {', '.join(changed)}")
            self.s.commit()
            return rec

    def transition(self, entity_key: str, record_id: str, transition_key: str) -> tuple[Record, list[dict[str, Any]]]:
        entity = self.entity(entity_key)
        machine = entity["state"]
        if not machine:
            raise InvalidTransition(f"{entity['label']} records have no workflow states.")
        t = next((t for t in machine["transitions"] if t["key"] == transition_key), None)
        if not t:
            raise InvalidTransition(f"'{transition_key}' is not a transition of {entity['label']}.")
        with _app_locks[self.app.id]:
            rec = self.get(entity_key, record_id)
            current = rec.data.get(machine["field"])
            labels = {s["key"]: s["label"] for s in machine["states"]}
            if current not in t["from_states"]:
                err = InvalidTransition(
                    f"Can't '{t['label']}' a {entity['label'].lower()} that is {labels.get(current, current)}. "
                    f"Allowed from: {', '.join(labels.get(s, s) for s in t['from_states'])}."
                )
                self._record_rejection(entity_key, rec, err)
                raise err
            data = {**rec.data, machine["field"]: t["to_state"]}
            try:
                self._check_guards(entity, transition_key, data)
                self._check_invariants(entity, data, rec.id)
            except RuntimeErrorBase as err:
                self._record_rejection(entity_key, rec, err)
                raise
            rec.data = data
            self._log(
                rec,
                entity_key,
                "transition",
                f"{entity['label']} {self.code_of(rec)}: {labels.get(current, current)} → {labels.get(t['to_state'], t['to_state'])}",
                {"transition": t["key"], "from": current, "to": t["to_state"]},
            )
            effects = self._apply_effects(entity, transition_key, rec)
            self.s.commit()
            return rec, effects

    # --- reads ----------------------------------------------------------------------------------

    def serialize(self, rec: Record) -> dict[str, Any]:
        entity = self.entities[rec.entity]
        refs: dict[str, Any] = {}
        for f in entity["fields"]:
            if f["type"] == "reference" and rec.data.get(f["key"]):
                target = self.s.get(Record, rec.data[f["key"]])
                if target:
                    refs[f["key"]] = {"id": target.id, "title": self.title_of(target), "code": self.code_of(target), "data": target.data}
        transitions: list[dict[str, Any]] = []
        if entity["state"]:
            current = rec.data.get(entity["state"]["field"])
            transitions = [{"key": t["key"], "label": t["label"]} for t in entity["state"]["transitions"] if current in t["from_states"]]
        return {
            "id": rec.id,
            "entity": rec.entity,
            "code": self.code_of(rec),
            "title": self.title_of(rec),
            "data": rec.data,
            "refs": refs,
            "transitions": transitions,
            "created_at": rec.created_at.isoformat(),
            "updated_at": rec.updated_at.isoformat(),
        }

    def list(self, entity_key: str) -> list[dict[str, Any]]:
        self.entity(entity_key)
        q = select(Record).where(Record.app_id == self.app.id, Record.entity == entity_key).order_by(Record.seq.desc())
        return [self.serialize(r) for r in self.s.scalars(q)]

    def events(self, record_id: str | None = None, limit: int = 40) -> list[dict[str, Any]]:
        q = select(RecordEvent).where(RecordEvent.app_id == self.app.id)
        if record_id:
            q = q.where(RecordEvent.record_id == record_id)
        q = q.order_by(RecordEvent.id.desc()).limit(limit)
        return [
            {
                "id": ev.id,
                "record_id": ev.record_id,
                "entity": ev.entity,
                "kind": ev.kind,
                "summary": ev.summary,
                "detail": ev.detail,
                "created_at": ev.created_at.isoformat(),
            }
            for ev in self.s.scalars(q)
        ]

    def stats(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, e in self.entities.items():
            rows = list(self.s.scalars(select(Record).where(Record.app_id == self.app.id, Record.entity == key)))
            breakdown: dict[str, dict[str, int]] = {}
            for f in e["fields"]:
                if f["type"] == "enum":
                    counts = {o: 0 for o in f["options"]}
                    for r in rows:
                        v = r.data.get(f["key"])
                        if v in counts:
                            counts[v] += 1
                    breakdown[f["key"]] = counts
            out[key] = {"total": len(rows), "breakdown": breakdown}
        return out

    def reset(self) -> int:
        with _app_locks[self.app.id]:
            count = 0
            for rec in self.s.scalars(select(Record).where(Record.app_id == self.app.id)):
                self.s.delete(rec)
                count += 1
            for ev in self.s.scalars(select(RecordEvent).where(RecordEvent.app_id == self.app.id)):
                self.s.delete(ev)
            self.s.commit()
            return count
