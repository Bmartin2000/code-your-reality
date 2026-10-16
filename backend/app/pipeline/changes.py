"""Small, reviewable change requests ("make the phone number required").

The customer writes a short instruction. The model may only answer with a handful of operations
from a closed set, every one constrained by a JSON schema built from the current workflow. The
operations are applied to a copy of the definition; every touched item goes back to "pending" so a
person confirms it before the next compilation. Large or unclear requests are refused, not guessed.
"""

from __future__ import annotations

from typing import Any

from ..workflow.schema import FIELD_TYPES, Rule, WorkflowDefinition, to_key
from ..workflow.validation import _validate_rule

MAX_INSTRUCTION = 300
MAX_OPS = 5

PROMPT = """You maintain the data model of a small business application. The customer asks for ONE small change.
Translate it into at most 5 operations from the schema, using only the entity and field keys that exist.
Field types: text, long_text, number, money, date, email, phone, enum (give options), reference, boolean.
Rule kinds: min_value (numeric field >= value), date_order (start_field not after end_field),
ref_field_equals (linked record's field must equal value before an event), set_ref_field (after an event set the
linked record's field), note (anything else, documentation only).
If the request is too large (a new process, many changes, a different app) or unclear, set "refused" to true and
explain briefly in "message" what the customer should do instead (for example: record a new video).
"message" is one short sentence for the customer describing what you changed."""


def _field_keys(defn: WorkflowDefinition) -> list[str]:
    return sorted({f"{e.key}.{f.key}" for e in defn.entities for f in e.fields}) or ["none.none"]


def schema(defn: WorkflowDefinition) -> dict[str, Any]:
    entities = [e.key for e in defn.entities] or ["none"]
    fields = _field_keys(defn)
    rules = [r.id for r in defn.rules] or ["none"]
    events = sorted({"create"} | {t.key for m in defn.state_machines for t in m.transitions})

    def enum(values: list[str]) -> dict[str, Any]:
        return {"type": "string", "enum": values}

    def op(name: str, props: dict[str, Any]) -> dict[str, Any]:
        return {"type": "object", "properties": {"op": {"const": name}, **props}, "required": ["op", *props]}

    ops = [
        op("add_field", {"entity": enum(entities), "label": {"type": "string"}, "type": enum(list(FIELD_TYPES)), "required": {"type": "boolean"}, "options": {"type": "array", "items": {"type": "string"}, "maxItems": 12}}),
        op("remove_field", {"field": enum(fields)}),
        op("rename_field", {"field": enum(fields), "label": {"type": "string"}}),
        op("set_required", {"field": enum(fields), "required": {"type": "boolean"}}),
        op("add_option", {"field": enum(fields), "option": {"type": "string"}}),
        op("remove_rule", {"rule": enum(rules)}),
        op("add_rule", {
            "statement": {"type": "string"},
            "kind": enum(["min_value", "date_order", "ref_field_equals", "set_ref_field", "note"]),
            "entity": enum(entities),
            "on": enum(events),
            "field": enum(fields),
            "ref_field": enum(fields),
            "target_field": enum(fields),
            "end_field": enum(fields),
            "value": {"type": "string"},
        }),
    ]
    return {
        "type": "object",
        "properties": {
            "refused": {"type": "boolean"},
            "message": {"type": "string"},
            "operations": {"type": "array", "maxItems": MAX_OPS, "items": {"anyOf": ops}},
        },
        "required": ["refused", "message", "operations"],
    }


def describe(defn: WorkflowDefinition) -> str:
    lines = []
    for e in defn.entities:
        lines.append(f"Entity {e.key} ({e.label}): " + ", ".join(f"{e.key}.{f.key} [{f.type}{', required' if f.required else ''}]" for f in e.fields))
    for m in defn.state_machines:
        lines.append(f"States of {m.entity}: {', '.join(s.key for s in m.states)}; events: create, {', '.join(t.key for t in m.transitions)}")
    for r in defn.rules:
        lines.append(f"Rule {r.id}: {r.statement}")
    return "\n".join(lines)


class ChangeRejected(Exception):
    pass


def apply(defn: WorkflowDefinition, answer: dict[str, Any], instruction: str) -> tuple[WorkflowDefinition, list[str]]:
    """Apply model-proposed operations. Returns the new definition and a human summary per operation."""
    if answer.get("refused"):
        raise ChangeRejected(str(answer.get("message") or "This request is too large for a small change. Record a new video instead.")[:400])
    d = defn.model_copy(deep=True)
    note = f"Requested change: “{instruction[:200]}”"
    prov = {"source": "inferred", "evidence": [], "confidence": None, "note": note}
    done: list[str] = []
    kept: list[str] = []  # requested but deliberately not applied

    def split(ref: Any):
        if not isinstance(ref, str) or "." not in ref:
            return None, None
        ek, fk = ref.split(".", 1)
        e = d.entity(ek)
        f = next((x for x in e.fields if x.key == fk), None) if e else None
        return e, f

    def pending(item) -> None:
        item.review.status = "pending"
        item.review.edited = True
        item.review.note = note[:600]

    for op in (answer.get("operations") or [])[:MAX_OPS]:
        if not isinstance(op, dict):
            continue
        kind = op.get("op")
        if kind == "add_field":
            e = d.entity(str(op.get("entity")))
            label = str(op.get("label") or "").strip()[:80]
            if not e or not label:
                continue
            key = to_key(label, "field")
            if any(f.key == key for f in e.fields):
                continue
            ftype = op.get("type") if op.get("type") in FIELD_TYPES else "text"
            options = [str(o).strip()[:60] for o in (op.get("options") or []) if str(o).strip()][:12]
            if ftype == "enum" and not options:
                ftype = "text"
            if ftype == "reference":
                ftype = "text"  # references need a target entity; keep small changes simple
            e.fields.append(e.fields[0].__class__.model_validate({"key": key, "label": label, "type": ftype, "required": bool(op.get("required")), "options": options if ftype == "enum" else [], "provenance": prov, "review": {"status": "pending", "edited": True, "note": note[:600]}}))
            done.append(f"Added field “{label}” to {e.label}.")
        elif kind in ("remove_field", "rename_field", "set_required", "add_option"):
            e, f = split(op.get("field"))
            if not e or not f:
                continue
            if kind == "remove_field":
                if f.system or e.title_field == f.key or any(f.key in (r.params.get("field"), r.params.get("ref_field"), r.params.get("start_field"), r.params.get("end_field"), r.params.get("target_field")) for r in d.rules if r.params.get("entity") == e.key or r.params.get("target_field") == f.key):
                    kept.append(f"“{f.label}” was kept because other parts of the workflow depend on it.")
                    continue
                e.fields = [x for x in e.fields if x.key != f.key]
                done.append(f"Removed field “{f.label}” from {e.label}.")
            elif kind == "rename_field":
                label = str(op.get("label") or "").strip()[:80]
                if label:
                    done.append(f"Renamed “{f.label}” to “{label}”.")
                    f.label = label
                    pending(f)
            elif kind == "set_required":
                f.required = bool(op.get("required"))
                pending(f)
                done.append(f"“{f.label}” is now {'required' if f.required else 'optional'}.")
            elif kind == "add_option":
                option = str(op.get("option") or "").strip()[:60]
                if f.type == "enum" and option and option not in f.options:
                    f.options.append(option)
                    pending(f)
                    done.append(f"Added option “{option}” to {f.label}.")
        elif kind == "remove_rule":
            r = next((x for x in d.rules if x.id == op.get("rule")), None)
            if r:
                d.rules = [x for x in d.rules if x.id != r.id]
                done.append(f"Removed rule “{r.statement}”.")
        elif kind == "add_rule":
            statement = str(op.get("statement") or "").strip()[:400]
            entity = str(op.get("entity") or "")
            if not statement or not d.entity(entity):
                continue
            rk = op.get("kind") if op.get("kind") in ("min_value", "date_order", "ref_field_equals", "set_ref_field", "note") else "note"
            fk = lambda ref: str(ref).split(".", 1)[1] if isinstance(ref, str) and "." in ref else None  # noqa: E731
            params: dict[str, Any] = {}
            if rk == "min_value":
                try:
                    params = {"entity": entity, "field": fk(op.get("field")), "min": float(op.get("value"))}
                except (TypeError, ValueError):
                    rk = "note"
            elif rk == "date_order":
                params = {"entity": entity, "start_field": fk(op.get("field")), "end_field": fk(op.get("end_field"))}
            elif rk in ("ref_field_equals", "set_ref_field"):
                params = {"entity": entity, "on": op.get("on"), "ref_field": fk(op.get("ref_field")), "target_field": fk(op.get("target_field")), ("equals" if rk == "ref_field_equals" else "value"): op.get("value")}
            rid = f"{to_key(statement, 'rule')[:36]}_{len(d.rules)}"
            rule = Rule.model_validate({"id": rid, "kind": rk, "statement": statement, "params": params if rk != "note" else {}, "provenance": prov, "review": {"status": "pending", "edited": True, "note": note[:600]}})
            if rk != "note":
                problems: list[str] = []
                _validate_rule(d, rule, lambda m, *_: problems.append(m), lambda *_: None)
                if problems:
                    rule.kind, rule.params = "note", {}
                    rule.provenance.note = (note + " Kept as a note: " + problems[0])[:600]
            d.rules.append(rule)
            done.append(f"Added rule “{statement}”{' (documented only)' if rule.kind == 'note' else ''}.")
    if not done:
        reason = " ".join(kept) or str(answer.get("message") or "No applicable change was found. Try rephrasing, or record a new video.")
        raise ChangeRejected(reason[:400])
    return d, done + kept
