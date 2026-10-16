"""Normalization of untrusted model output into a reviewable workflow definition.

Every string is clamped, every identifier is re-derived, every reference is checked. Anything that
cannot be mapped onto the closed set of runtime rule kinds is downgraded to a documented note.
Nothing produced here is considered confirmed: every item starts with review status "pending".
"""

from __future__ import annotations

import re
from typing import Any

from ..workflow.schema import FIELD_TYPES, RULE_KINDS, WorkflowDefinition, to_key
from ..workflow.validation import _validate_rule


class MappingFailed(Exception):
    pass


def _s(v: Any, limit: int = 200) -> str:
    return v.strip()[:limit] if isinstance(v, str) else ""


def _label(name: str) -> str:
    name = _s(name, 80)
    return name[:1].upper() + name[1:] if name else name


def _plural(label: str) -> str:
    if label.endswith("y") and not label.endswith(("ay", "ey", "oy", "uy")):
        return label[:-1] + "ies"
    return label if label.endswith("s") else label + "s"


def _num(v: Any) -> float | None:
    try:
        f = float(v)
        return f if f >= 0 else None
    except (TypeError, ValueError):
        return None


def _evidence(item: dict[str, Any], duration: float | None, frame_times: list[float], sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map cited source-segment numbers and frame indices to concrete evidence (time + quote)."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for idx in item.get("segments") if isinstance(item.get("segments"), list) else []:
        if not isinstance(idx, int) or not 0 <= idx < len(sources) or ("s", idx) in seen:
            continue
        seen.add(("s", idx))
        src = sources[idx]
        start, end = src.get("start"), src.get("end")
        if duration and start is not None:
            start, end = min(start, duration), min(end or start, duration)
        out.append({"kind": src["kind"], "start": start, "end": end, "frame_index": None, "quote": str(src.get("text", ""))[:300]})
    for idx in item.get("frames") if isinstance(item.get("frames"), list) else []:
        if isinstance(idx, int) and 0 <= idx < len(frame_times) and ("f", idx) not in seen:
            seen.add(("f", idx))
            out.append({"kind": "frame", "frame_index": idx, "start": frame_times[idx], "end": None, "quote": ""})
    # Legacy/free-form citations ({"start", "end", "quote"} or {"frame"}) are accepted too.
    for ev in item.get("evidence") if isinstance(item.get("evidence"), list) else []:
        if not isinstance(ev, dict):
            continue
        frame = ev.get("frame")
        if isinstance(frame, int) and 0 <= frame < len(frame_times):
            out.append({"kind": "frame", "frame_index": frame, "start": frame_times[frame], "end": None, "quote": _s(ev.get("quote"), 300)})
            continue
        start, end = _num(ev.get("start")), _num(ev.get("end"))
        if duration:
            start = min(start, duration) if start is not None else None
            end = min(end, duration) if end is not None else None
        if start is not None and end is not None and end < start:
            start, end = end, start
        quote = _s(ev.get("quote"), 300)
        if start is not None or quote:
            out.append({"kind": "transcript", "start": start, "end": end, "frame_index": None, "quote": quote})
    return out[:6]


def _prov(item: dict[str, Any], ctx: tuple[float | None, list[float], list[dict[str, Any]]], note: str = "") -> dict[str, Any]:
    duration, frame_times, sources = ctx
    source = item.get("source") if item.get("source") in ("observed", "narration", "inferred") else "inferred"
    evidence = _evidence(item, duration, frame_times, sources)
    if source != "inferred" and not evidence:
        # A claim of direct evidence without a citation is treated as an inference.
        note = (note + " " if note else "") + "The model claimed direct evidence but cited none."
        source = "inferred"
    conf = item.get("confidence") if item.get("confidence") in ("high", "medium", "low") else None
    return {"source": source, "evidence": evidence, "confidence": conf, "note": note.strip()[:600]}


def normalize(raw: dict[str, Any], *, duration: float | None, frame_times: list[float], sources: list[dict[str, Any]] | None = None) -> tuple[dict[str, Any], list[str]]:
    notes: list[str] = []
    ctx = (duration, frame_times, sources or [])
    name = _s(raw.get("workflow_name"), 120) or "Observed workflow"

    # Entities -----------------------------------------------------------------------------------
    entities: list[dict[str, Any]] = []
    name_to_key: dict[str, str] = {}
    raw_entities = raw.get("entities") if isinstance(raw.get("entities"), list) else []
    for re_ in raw_entities[:10]:
        if not isinstance(re_, dict) or not _s(re_.get("name")):
            continue
        key = to_key(re_["name"], "entity")
        if key in name_to_key.values():
            notes.append(f"Duplicate entity '{re_['name']}' merged.")
            continue
        name_to_key[re_["name"].strip().lower()] = key
        name_to_key[key] = key
        label = _label(re_["name"])
        entities.append({"key": key, "label": label, "plural_label": _plural(label), "description": _s(re_.get("description"), 400), "_raw_fields": re_.get("fields"), "provenance": _prov(re_, ctx)})

    if not entities:
        raise MappingFailed("The model did not identify any entities (things the process keeps track of).")

    def resolve_entity(n: Any) -> str | None:
        if not isinstance(n, str):
            return None
        return name_to_key.get(n.strip().lower()) or name_to_key.get(to_key(n))

    lc_raw = raw.get("lifecycle") if isinstance(raw.get("lifecycle"), dict) else {}
    lifecycle_entity = resolve_entity(lc_raw.get("entity"))

    field_name_map: dict[str, dict[str, str]] = {}
    for e in entities:
        fields: list[dict[str, Any]] = []
        fmap: dict[str, str] = {}
        for rf in (e.pop("_raw_fields") or [])[:24]:
            if not isinstance(rf, dict) or not _s(rf.get("name")):
                continue
            fkey = to_key(rf["name"], "field")
            if fkey == "id":
                continue  # the runtime assigns identifiers itself
            label_name = rf["name"]
            if rf.get("type") == "reference" and fkey.endswith("_id") and len(fkey) > 3:
                fkey = fkey[:-3]
                label_name = re.sub(r"[ _-]?id$", "", rf["name"].strip(), flags=re.IGNORECASE) or rf["name"]
            if fkey in fmap.values():
                continue
            if fkey == "status" and e["key"] == lifecycle_entity:
                continue  # the lifecycle's state machine owns this entity's status
            ftype = rf.get("type") if rf.get("type") in FIELD_TYPES else "text"
            field: dict[str, Any] = {
                "key": fkey,
                "label": _label(label_name),
                "type": ftype,
                "required": bool(rf.get("required")),
                "options": [_s(o, 60) for o in (rf.get("options") or []) if _s(o, 60)][:20],
                "provenance": {"source": e["provenance"]["source"], "evidence": [], "confidence": None, "note": ""},
            }
            if ftype == "reference":
                target = resolve_entity(rf.get("references"))
                if target and target != e["key"]:
                    field["ref_entity"] = target
                else:
                    field["type"] = "text"
                    field["provenance"]["note"] = "Reference target unclear; stored as text."
                    notes.append(f"{e['label']}.{field['label']}: reference target unclear, mapped to text.")
            if field["type"] == "enum" and not field["options"]:
                field["type"] = "text"
                notes.append(f"{e['label']}.{field['label']}: choice field without options, mapped to text.")
            if field["type"] != "enum":
                field["options"] = []
            fmap[rf["name"].strip().lower()] = fkey
            fmap[to_key(rf["name"], "field")] = fkey
            fmap[fkey] = fkey
            fields.append(field)
        if not fields:
            fields.append({"key": "name", "label": "Name", "type": "text", "required": True, "provenance": {"source": "inferred", "evidence": [], "confidence": "low", "note": "Added so the entity can be identified."}})
            fmap["name"] = "name"
        e["fields"] = fields
        e["title_field"] = next((f["key"] for f in fields if f["type"] == "text"), fields[0]["key"])
        field_name_map[e["key"]] = fmap

    def resolve_field(entity_key: str | None, n: Any) -> str | None:
        if not entity_key or not isinstance(n, str):
            return None
        fmap = field_name_map.get(entity_key, {})
        return fmap.get(n.strip().lower()) or fmap.get(to_key(n))

    # Lifecycle ----------------------------------------------------------------------------------
    state_machines: list[dict[str, Any]] = []
    lc = raw.get("lifecycle")
    transition_names: dict[str, str] = {}
    if isinstance(lc, dict):
        ent = resolve_entity(lc.get("entity"))
        states = []
        for s in (lc.get("states") or [])[:12]:
            k = to_key(s, "state") if isinstance(s, str) else None
            if k and k not in [x["key"] for x in states]:
                states.append({"key": k, "label": _label(s), "tone": "neutral"})
        if ent and states:
            keys = [s["key"] for s in states]
            initial = to_key(lc.get("initial") or "", "state")
            if initial not in keys:
                initial = keys[0]
            transitions = []
            for t in (lc.get("transitions") or [])[:16]:
                if not isinstance(t, dict) or not _s(t.get("name")):
                    continue
                to = to_key(t.get("to") or "", "state")
                frm = [to_key(x, "state") for x in (t.get("from") or []) if isinstance(x, str)]
                frm = [x for x in frm if x in keys]
                if to not in keys or not frm:
                    notes.append(f"Transition '{t['name']}' refers to unknown states and was skipped.")
                    continue
                tkey = to_key(t["name"], "transition")
                if tkey in [x["key"] for x in transitions]:
                    continue
                transition_names[t["name"].strip().lower()] = tkey
                transition_names[tkey] = tkey
                transitions.append({"key": tkey, "label": _label(t["name"])[:60], "from_states": frm, "to_state": to, "provenance": _prov(t, ctx)})
            for s in states:
                if not any(s["key"] in t["from_states"] for t in transitions) and s["key"] != initial:
                    s["terminal"] = True
            states[[s["key"] for s in states].index(initial)]["tone"] = "active"
            state_machines.append({"entity": ent, "field": "status", "initial": initial, "states": states, "transitions": transitions, "provenance": {"source": "inferred", "evidence": [], "confidence": None, "note": ""}})
        else:
            notes.append("The proposed lifecycle could not be attached to a known entity.")

    def resolve_event(n: Any) -> str | None:
        if not isinstance(n, str) or not n.strip():
            return None
        if n.strip().lower() in ("create", "created", "on create", "creation"):
            return "create"
        return transition_names.get(n.strip().lower()) or transition_names.get(to_key(n))

    # Actions ------------------------------------------------------------------------------------
    actions: list[dict[str, Any]] = []
    for ra in (raw.get("actions") or [])[:20]:
        if not isinstance(ra, dict) or not _s(ra.get("name")):
            continue
        ent = resolve_entity(ra.get("entity"))
        if not ent:
            notes.append(f"Action '{ra['name']}' refers to an unknown entity and was skipped.")
            continue
        kind = ra.get("kind") if ra.get("kind") in ("create", "transition", "update") else "update"
        action = {"id": to_key(ra["name"], "action"), "label": _label(ra["name"]), "kind": kind, "entity": ent, "provenance": _prov(ra, ctx)}
        if kind == "transition":
            tk = resolve_event(ra["name"])
            if tk and tk != "create":
                action["transition"] = tk
            else:
                action["kind"] = "update"
        if action["id"] not in [a["id"] for a in actions]:
            actions.append(action)

    # Rules --------------------------------------------------------------------------------------
    draft: dict[str, Any] = {
        "schema_version": "1.0",
        "id": to_key(name, "workflow"),
        "name": name,
        "description": _s(raw.get("summary"), 800),
        "domain": "observed",
        "version": 1,
        "entities": entities,
        "state_machines": state_machines,
        "rules": [],
        "actions": actions,
        "stages": [],
        "views": [],
        "questions": [],
    }
    probe_defn = WorkflowDefinition.model_validate(draft)

    rules: list[dict[str, Any]] = []
    for i, rr in enumerate((raw.get("rules") or [])[:30]):
        if not isinstance(rr, dict) or not _s(rr.get("statement")):
            continue
        statement = _s(rr["statement"], 400)
        kind = rr.get("kind") if rr.get("kind") in RULE_KINDS else "note"
        ent = resolve_entity(rr.get("entity"))
        params: dict[str, Any] = {}
        if kind != "note" and ent:
            params["entity"] = ent
            if kind in ("ref_field_equals", "set_ref_field", "set_field"):
                params["on"] = resolve_event(rr.get("on")) or rr.get("on")
            if kind in ("ref_field_equals", "set_ref_field", "exclusive_reference"):
                params["ref_field"] = resolve_field(ent, rr.get("ref_field"))
                ref_def = next((f for f in probe_defn.entity(ent).fields if f.key == params["ref_field"]), None) if params["ref_field"] else None
                if ref_def and ref_def.ref_entity and kind != "exclusive_reference":
                    params["target_field"] = resolve_field(ref_def.ref_entity, rr.get("target_field"))
            if kind == "ref_field_equals":
                params["equals"] = rr.get("value")
            if kind in ("set_ref_field", "set_field"):
                params["value"] = rr.get("value")
            if kind in ("set_field", "min_value"):
                params["field"] = resolve_field(ent, rr.get("field"))
            if kind == "min_value":
                params["min"] = rr.get("value", rr.get("min"))
            if kind == "exclusive_reference":
                machine = probe_defn.machine_for(ent)
                keys = {s.key for s in machine.states} if machine else set()
                params["states"] = [to_key(s, "state") for s in (rr.get("states") or []) if isinstance(s, str) and to_key(s, "state") in keys]
            if kind == "date_order":
                params["start_field"] = resolve_field(ent, rr.get("start_field"))
                params["end_field"] = resolve_field(ent, rr.get("end_field"))
            if isinstance(params.get("value"), (int, float)):
                params["value"] = str(params["value"]) if kind != "set_field" else params["value"]
        elif kind != "note":
            kind = "note"

        prov = _prov(rr, ctx)
        rule = {"id": f"{to_key(statement, 'rule')[:36]}_{i}", "kind": kind, "statement": statement, "params": params, "provenance": prov}
        if kind != "note":
            problems: list[str] = []
            from ..workflow.schema import Rule

            _validate_rule(probe_defn, Rule.model_validate(rule), lambda m, *_: problems.append(m), lambda *_: None)
            if problems:
                rule["kind"] = "note"
                rule["params"] = {}
                rule["provenance"]["note"] = (prov["note"] + " Could not be mapped to an enforceable rule: " + problems[0])[:600].strip()
                notes.append(f"Rule '{statement}' kept as a note: {problems[0]}")
        rules.append(rule)

    # Stages -------------------------------------------------------------------------------------
    stages: list[dict[str, Any]] = []
    steps = [s for s in (raw.get("steps") or []) if _s(s)][:12]
    for i, step in enumerate(steps):
        sid = f"{to_key(step, 'stage')[:40]}_{i}"
        match = next((a for a in actions if a["label"].lower() in step.lower() or step.lower() in a["label"].lower()), None)
        kind = "start" if i == 0 else "end" if i == len(steps) - 1 else "action"
        stages.append({"id": sid, "label": _label(step)[:60], "kind": kind, "action": match["id"] if match else None, "entity": match["entity"] if match else None, "next": []})
    for a, b in zip(stages, stages[1:]):
        a["next"] = [b["id"]]

    questions = [
        {"id": f"question_{i}", "question": _s(q, 400)}
        for i, q in enumerate((raw.get("questions") or [])[:10])
        if _s(q)
    ]

    draft.update({"rules": rules, "stages": stages, "questions": questions})
    defn = WorkflowDefinition.model_validate(draft)
    return defn.model_dump(mode="json"), notes
