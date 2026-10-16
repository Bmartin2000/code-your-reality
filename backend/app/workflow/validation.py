"""Semantic validation of workflow definitions.

Pydantic guarantees shape; this module guarantees meaning: every reference resolves, every rule's
parameters point at real fields of the right type, and (before compilation) every AI suggestion
has been reviewed by a human.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from .schema import RULE_PARAM_SPECS, Entity, WorkflowDefinition

Severity = Literal["error", "warning"]


@dataclass
class Issue:
    severity: Severity
    message: str
    target_kind: str
    target_id: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def prune_rejected(defn: WorkflowDefinition) -> WorkflowDefinition:
    """Return a copy without anything a reviewer rejected. Rejected items never reach the compiler."""
    d = defn.model_copy(deep=True)
    d.entities = [e for e in d.entities if e.review.status != "rejected"]
    for e in d.entities:
        e.fields = [f for f in e.fields if f.review.status != "rejected"]
    d.state_machines = [m for m in d.state_machines if m.review.status != "rejected"]
    for m in d.state_machines:
        m.transitions = [t for t in m.transitions if t.review.status != "rejected"]
    d.rules = [r for r in d.rules if r.review.status != "rejected"]
    d.actions = [a for a in d.actions if a.review.status != "rejected"]
    return d


def _dupes(keys: list[str]) -> set[str]:
    seen: set[str] = set()
    dup: set[str] = set()
    for k in keys:
        (dup if k in seen else seen).add(k)
    return dup


def _events_for(defn: WorkflowDefinition, entity_key: str) -> set[str]:
    events = {"create"}
    machine = defn.machine_for(entity_key)
    if machine:
        events |= {t.key for t in machine.transitions}
    return events


def _field_keys(defn: WorkflowDefinition, entity: Entity) -> set[str]:
    keys = {f.key for f in entity.fields}
    machine = defn.machine_for(entity.key)
    if machine:
        keys.add(machine.field)
    return keys


def validate(defn: WorkflowDefinition, *, for_compile: bool = False) -> list[Issue]:
    issues: list[Issue] = []

    def err(msg: str, kind: str, tid: str) -> None:
        issues.append(Issue("error", msg, kind, tid))

    def warn(msg: str, kind: str, tid: str) -> None:
        issues.append(Issue("warning", msg, kind, tid))

    if for_compile:
        for kind, tid, label in _pending_items(defn):
            err(f"{label} still awaits review.", kind, tid)
        for q in defn.questions:
            if not q.resolved:
                warn(f"Open question not answered: {q.question}", "question", q.id)
        defn = prune_rejected(defn)

    if not defn.entities:
        err("The workflow has no entities. Add at least one entity to compile an application.", "workflow", defn.id)

    for dup in _dupes([e.key for e in defn.entities]):
        err(f"Entity key '{dup}' is used more than once.", "entity", dup)
    for dup in _dupes([r.id for r in defn.rules]):
        err(f"Rule id '{dup}' is used more than once.", "rule", dup)
    for dup in _dupes([a.id for a in defn.actions]):
        err(f"Action id '{dup}' is used more than once.", "action", dup)
    for dup in _dupes([s.id for s in defn.stages]):
        err(f"Stage id '{dup}' is used more than once.", "stage", dup)

    entity_keys = {e.key for e in defn.entities}

    # Entities and fields
    for e in defn.entities:
        for dup in _dupes([f.key for f in e.fields]):
            err(f"{e.label}: field '{dup}' is defined more than once.", "entity", e.key)
        if not e.fields:
            err(f"{e.label} has no fields.", "entity", e.key)
        if e.fields and e.title_field not in _field_keys(defn, e):
            err(f"{e.label}: title field '{e.title_field}' does not exist.", "entity", e.key)
        for f in e.fields:
            if f.type == "reference":
                if not f.ref_entity:
                    err(f"{e.label}.{f.label} is a reference but does not say which entity it points to.", "field", f"{e.key}.{f.key}")
                elif f.ref_entity not in entity_keys:
                    err(f"{e.label}.{f.label} points to unknown entity '{f.ref_entity}'.", "field", f"{e.key}.{f.key}")
            if f.type == "enum" and not f.options:
                err(f"{e.label}.{f.label} is a choice field without options.", "field", f"{e.key}.{f.key}")
            if f.type == "enum" and f.default not in (None, "") and f.default not in f.options:
                err(f"{e.label}.{f.label}: default '{f.default}' is not one of its options.", "field", f"{e.key}.{f.key}")

    # State machines
    seen_machine_entities: set[str] = set()
    for m in defn.state_machines:
        tid = m.entity
        entity = defn.entity(m.entity)
        if not entity:
            err(f"State machine references unknown entity '{m.entity}'.", "state_machine", tid)
            continue
        if m.entity in seen_machine_entities:
            err(f"{entity.label} has more than one state machine.", "state_machine", tid)
        seen_machine_entities.add(m.entity)
        clash = next((f for f in entity.fields if f.key == m.field and not f.system), None)
        if clash:
            err(f"{entity.label}.{clash.label} collides with the state field '{m.field}'.", "state_machine", tid)
        state_keys = [s.key for s in m.states]
        for dup in _dupes(state_keys):
            err(f"{entity.label}: state '{dup}' is defined more than once.", "state_machine", tid)
        if m.initial not in state_keys:
            err(f"{entity.label}: initial state '{m.initial}' is not a defined state.", "state_machine", tid)
        for dup in _dupes([t.key for t in m.transitions]):
            err(f"{entity.label}: transition '{dup}' is defined more than once.", "transition", f"{tid}.{dup}")
        for t in m.transitions:
            if t.to_state not in state_keys:
                err(f"Transition '{t.label}' leads to unknown state '{t.to_state}'.", "transition", f"{tid}.{t.key}")
            if not t.from_states:
                err(f"Transition '{t.label}' has no starting state.", "transition", f"{tid}.{t.key}")
            for s in t.from_states:
                if s not in state_keys:
                    err(f"Transition '{t.label}' starts from unknown state '{s}'.", "transition", f"{tid}.{t.key}")
        reachable = {m.initial} | {t.to_state for t in m.transitions}
        for s in m.states:
            if s.key not in reachable:
                warn(f"{entity.label}: state '{s.label}' can never be reached.", "state_machine", tid)

    # Rules
    for r in defn.rules:
        _validate_rule(defn, r, err, warn)

    # Actions
    for a in defn.actions:
        if a.entity not in entity_keys:
            err(f"Action '{a.label}' references unknown entity '{a.entity}'.", "action", a.id)
            continue
        if a.kind == "transition":
            machine = defn.machine_for(a.entity)
            if not machine or not a.transition or a.transition not in {t.key for t in machine.transitions}:
                err(f"Action '{a.label}' references a transition that does not exist.", "action", a.id)

    # Stages
    stage_ids = {s.id for s in defn.stages}
    action_ids = {a.id for a in defn.actions}
    for s in defn.stages:
        for n in s.next:
            if n not in stage_ids:
                err(f"Stage '{s.label}' links to unknown stage '{n}'.", "stage", s.id)
        if s.action and s.action not in action_ids:
            warn(f"Stage '{s.label}' refers to an action that is not part of the workflow.", "stage", s.id)
        if s.entity and s.entity not in entity_keys:
            warn(f"Stage '{s.label}' refers to an entity that is not part of the workflow.", "stage", s.id)

    return issues


def _validate_rule(defn: WorkflowDefinition, r, err, warn) -> None:
    tid = r.id
    spec = RULE_PARAM_SPECS.get(r.kind)
    if r.kind == "note" or spec is None:
        if r.kind == "note":
            warn(f"'{r.statement}' is documentation only and will not be enforced.", "rule", tid)
        return
    p = r.params
    missing = [k for k in spec if p.get(k) in (None, "", [])]
    if missing:
        err(f"Rule '{r.statement}' is missing: {', '.join(missing)}.", "rule", tid)
        return
    entity = defn.entity(str(p["entity"]))
    if not entity:
        err(f"Rule '{r.statement}' targets unknown entity '{p['entity']}'.", "rule", tid)
        return
    fields = {f.key: f for f in entity.fields}
    machine = defn.machine_for(entity.key)

    if "on" in spec and p["on"] not in _events_for(defn, entity.key):
        err(f"Rule '{r.statement}' runs on '{p['on']}', which is neither 'create' nor a transition of {entity.label}.", "rule", tid)

    ref_entity: Entity | None = None
    if "ref_field" in spec:
        ref = fields.get(str(p["ref_field"]))
        if not ref or ref.type != "reference" or not ref.ref_entity:
            err(f"Rule '{r.statement}': '{p['ref_field']}' is not a reference field of {entity.label}.", "rule", tid)
            return
        ref_entity = defn.entity(ref.ref_entity)
        if not ref_entity:
            err(f"Rule '{r.statement}': referenced entity '{ref.ref_entity}' does not exist.", "rule", tid)
            return

    if "target_field" in spec and ref_entity is not None:
        target = next((f for f in ref_entity.fields if f.key == p["target_field"]), None)
        if not target:
            err(f"Rule '{r.statement}': {ref_entity.label} has no field '{p['target_field']}'.", "rule", tid)
            return
        value = p.get("equals", p.get("value"))
        if target.type == "enum" and value not in target.options:
            err(f"Rule '{r.statement}': '{value}' is not an option of {ref_entity.label}.{target.label}.", "rule", tid)

    if r.kind == "exclusive_reference":
        states = p["states"]
        if not machine:
            err(f"Rule '{r.statement}' needs {entity.label} to have states.", "rule", tid)
        elif not isinstance(states, list) or any(s not in {st.key for st in machine.states} for s in states):
            err(f"Rule '{r.statement}' lists states that {entity.label} does not have.", "rule", tid)

    if r.kind == "set_field":
        target_key = str(p["field"])
        target = fields.get(target_key)
        if not target:
            err(f"Rule '{r.statement}': {entity.label} has no field '{target_key}'.", "rule", tid)
        elif p["value"] == "$today" and target.type != "date":
            err(f"Rule '{r.statement}': '$today' can only be written to a date field.", "rule", tid)

    if r.kind == "min_value":
        f = fields.get(str(p["field"]))
        if not f or f.type not in ("number", "money"):
            err(f"Rule '{r.statement}': '{p['field']}' is not a numeric field of {entity.label}.", "rule", tid)
        try:
            float(p["min"])
        except (TypeError, ValueError):
            err(f"Rule '{r.statement}': minimum '{p['min']}' is not a number.", "rule", tid)

    if r.kind == "date_order":
        for k in ("start_field", "end_field"):
            f = fields.get(str(p[k]))
            if not f or f.type != "date":
                err(f"Rule '{r.statement}': '{p[k]}' is not a date field of {entity.label}.", "rule", tid)


def _pending_items(defn: WorkflowDefinition):
    for e in defn.entities:
        if e.review.status == "pending":
            yield "entity", e.key, f"Entity '{e.label}'"
        if e.review.status == "rejected":
            continue
        for f in e.fields:
            if f.review.status == "pending":
                yield "field", f"{e.key}.{f.key}", f"Field '{e.label}.{f.label}'"
    for m in defn.state_machines:
        if m.review.status == "pending":
            yield "state_machine", m.entity, f"State model of '{m.entity}'"
        for t in m.transitions:
            if t.review.status == "pending":
                yield "transition", f"{m.entity}.{t.key}", f"Transition '{t.label}'"
    for r in defn.rules:
        if r.review.status == "pending":
            yield "rule", r.id, f"Rule '{r.statement}'"
    for a in defn.actions:
        if a.review.status == "pending":
            yield "action", a.id, f"Action '{a.label}'"


def review_summary(defn: WorkflowDefinition) -> dict[str, int]:
    counts = {"pending": 0, "accepted": 0, "rejected": 0}
    items: list[Any] = list(defn.entities) + list(defn.rules) + list(defn.actions) + list(defn.state_machines)
    for e in defn.entities:
        items += e.fields
    for m in defn.state_machines:
        items += m.transitions
    for it in items:
        counts[it.review.status] += 1
    return counts
