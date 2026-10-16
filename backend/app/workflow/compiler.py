"""The application compiler.

Transforms an approved, validated workflow definition into an application manifest: data models,
forms, views, a state machine per stateful entity, and an index of enforceable rules keyed by the
event that triggers them. The manifest is pure data; the predefined runtime (``runtime.py``)
interprets it. No code is generated or executed.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .schema import Entity, EntityField, WorkflowDefinition
from .validation import Issue, prune_rejected, validate

MANIFEST_VERSION = 1

GUARD_KINDS = {"ref_field_equals", "exclusive_reference", "min_value", "date_order"}
EFFECT_KINDS = {"set_ref_field", "set_field"}

COMPILE_STAGES: list[tuple[str, str]] = [
    ("validate_schema", "Validating workflow schema"),
    ("build_models", "Building data models"),
    ("prepare_forms", "Preparing forms"),
    ("wire_transitions", "Wiring state transitions"),
    ("activate_runtime", "Activating the runtime"),
    ("ready", "Application ready"),
]


class CompileError(Exception):
    def __init__(self, message: str, issues: list[Issue] | None = None):
        super().__init__(message)
        self.issues = issues or []


@dataclass
class StageReport:
    key: str
    label: str
    status: str = "pending"  # pending | running | done | failed
    detail: str = ""
    duration_ms: float | None = None
    outputs: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "status": self.status,
            "detail": self.detail,
            "duration_ms": self.duration_ms,
            "outputs": self.outputs,
        }


def entity_code_prefix(entity: Entity) -> str:
    letters = "".join(ch for ch in entity.label.upper() if ch.isalpha())
    return (letters[:3] or entity.key[:3].upper()).ljust(3, "X")


def _field_manifest(f: EntityField) -> dict[str, Any]:
    return {
        "key": f.key,
        "label": f.label,
        "type": f.type,
        "required": f.required,
        "description": f.description,
        "options": f.options,
        "ref_entity": f.ref_entity,
        "default": f.default,
        "system": f.system,
    }


class Compiler:
    """Runs the compile stages in order, reporting each one through ``on_stage``."""

    def __init__(self, defn: WorkflowDefinition, on_stage: Callable[[list[StageReport]], None] | None = None):
        self.source = defn
        self.defn = prune_rejected(defn)
        self.on_stage = on_stage or (lambda _stages: None)
        self.stages = [StageReport(k, label) for k, label in COMPILE_STAGES]
        self.manifest: dict[str, Any] = {}

    def _run(self, key: str, fn: Callable[[], tuple[str, dict[str, Any]]]) -> None:
        stage = next(s for s in self.stages if s.key == key)
        stage.status = "running"
        self.on_stage(self.stages)
        started = time.perf_counter()
        try:
            detail, outputs = fn()
        except Exception as exc:
            stage.status = "failed"
            stage.detail = str(exc)
            stage.duration_ms = round((time.perf_counter() - started) * 1000, 2)
            self.on_stage(self.stages)
            raise
        stage.status = "done"
        stage.detail = detail
        stage.outputs = outputs
        stage.duration_ms = round((time.perf_counter() - started) * 1000, 2)
        self.on_stage(self.stages)

    # The final two stages need persistence, so the service runs them via ``run_stage``.
    def run_stage(self, key: str, fn: Callable[[], tuple[str, dict[str, Any]]]) -> None:
        self._run(key, fn)

    def compile(self) -> dict[str, Any]:
        self._run("validate_schema", self._validate)
        self._run("build_models", self._build_models)
        self._run("prepare_forms", self._prepare_forms)
        self._run("wire_transitions", self._wire_transitions)
        return self.manifest

    # --- stages ---------------------------------------------------------------------------------

    def _validate(self) -> tuple[str, dict[str, Any]]:
        issues = validate(self.source, for_compile=True)
        errors = [i for i in issues if i.severity == "error"]
        if errors:
            raise CompileError(f"{len(errors)} validation error(s) block compilation.", issues)
        warnings = [i.to_dict() for i in issues if i.severity == "warning"]
        self.manifest = {
            "manifest_version": MANIFEST_VERSION,
            "workflow": {
                "id": self.defn.id,
                "name": self.defn.name,
                "description": self.defn.description,
                "domain": self.defn.domain,
                "version": self.defn.version,
            },
            "warnings": warnings,
        }
        return (
            f"Schema {self.defn.schema_version} valid · {len(warnings)} warning(s)",
            {"warnings": len(warnings)},
        )

    def _build_models(self) -> tuple[str, dict[str, Any]]:
        entities = []
        field_count = 0
        for e in self.defn.entities:
            fields = [_field_manifest(f) for f in e.fields]
            machine = self.defn.machine_for(e.key)
            state = None
            if machine:
                if not any(f["key"] == machine.field for f in fields):
                    fields.append(
                        {
                            "key": machine.field,
                            "label": "Status",
                            "type": "enum",
                            "required": True,
                            "description": "Managed by the workflow state machine.",
                            "options": [s.key for s in machine.states],
                            "ref_entity": None,
                            "default": machine.initial,
                            "system": True,
                        }
                    )
                state = {
                    "field": machine.field,
                    "initial": machine.initial,
                    "states": [s.model_dump() for s in machine.states],
                    "transitions": [
                        {
                            "key": t.key,
                            "label": t.label,
                            "from_states": t.from_states,
                            "to_state": t.to_state,
                            "description": t.description,
                        }
                        for t in machine.transitions
                    ],
                }
            field_count += len(fields)
            entities.append(
                {
                    "key": e.key,
                    "label": e.label,
                    "plural_label": e.plural_label,
                    "description": e.description,
                    "title_field": e.title_field,
                    "code_prefix": entity_code_prefix(e),
                    "fields": fields,
                    "state": state,
                }
            )
        self.manifest["entities"] = entities
        return f"{len(entities)} data models · {field_count} fields", {"entities": len(entities), "fields": field_count}

    def _prepare_forms(self) -> tuple[str, dict[str, Any]]:
        locked = self._locked_reference_fields()
        forms = []
        for e in self.manifest["entities"]:
            create_fields = [f["key"] for f in e["fields"] if not f["system"]]
            edit_fields = [k for k in create_fields if k not in locked.get(e["key"], set())]
            forms.append({"entity": e["key"], "create_fields": create_fields, "edit_fields": edit_fields})
        views: list[dict[str, Any]] = [{"key": "overview", "label": "Overview", "kind": "dashboard", "entity": None, "columns": []}]
        custom = {v.entity: v for v in self.defn.views if v.kind == "list" and v.entity}
        for e in self.manifest["entities"]:
            keys = [f["key"] for f in e["fields"] if f["type"] != "long_text"]
            preset = custom.get(e["key"])
            columns = [c for c in preset.columns if c in keys] if preset and preset.columns else keys[:6]
            views.append({"key": e["key"], "label": e["plural_label"], "kind": "list", "entity": e["key"], "columns": columns})
        self.manifest["forms"] = forms
        self.manifest["views"] = views
        field_total = sum(len(f["create_fields"]) for f in forms)
        return f"{len(forms)} forms · {field_total} inputs · {len(views)} views", {"forms": len(forms), "views": len(views)}

    def _wire_transitions(self) -> tuple[str, dict[str, Any]]:
        guards: dict[str, dict[str, list[str]]] = {}
        effects: dict[str, dict[str, list[str]]] = {}
        invariants: dict[str, list[str]] = {}
        rules = []
        for r in self.defn.rules:
            enforced = r.kind != "note"
            rules.append(
                {
                    "id": r.id,
                    "kind": r.kind,
                    "statement": r.statement,
                    "params": r.params,
                    "enforced": enforced,
                    "source": r.provenance.source,
                    "confirmed": r.review.status == "accepted",
                }
            )
            if not enforced:
                continue
            entity = str(r.params["entity"])
            if r.kind in EFFECT_KINDS:
                effects.setdefault(entity, {}).setdefault(str(r.params["on"]), []).append(r.id)
            elif r.kind == "ref_field_equals":
                guards.setdefault(entity, {}).setdefault(str(r.params["on"]), []).append(r.id)
            else:
                invariants.setdefault(entity, []).append(r.id)
        self.manifest["rules"] = rules
        self.manifest["guards"] = guards
        self.manifest["effects"] = effects
        self.manifest["invariants"] = invariants
        self.manifest["locked_fields"] = {k: sorted(v) for k, v in self._locked_reference_fields().items()}
        self.manifest["actions"] = [a.model_dump(include={"id", "label", "description", "kind", "entity", "transition"}) for a in self.defn.actions]
        self.manifest["stages"] = [s.model_dump() for s in self.defn.stages]
        transitions = sum(len(e["state"]["transitions"]) for e in self.manifest["entities"] if e["state"])
        enforced = sum(1 for r in rules if r["enforced"])
        return (
            f"{transitions} transitions · {enforced} enforced rules · {len(rules) - enforced} documented",
            {"transitions": transitions, "enforced_rules": enforced, "documented_rules": len(rules) - enforced},
        )

    def _locked_reference_fields(self) -> dict[str, set[str]]:
        """Reference fields whose targets receive side effects can't be changed after creation,
        otherwise an edit could silently detach the effect (e.g. move a rental to another item)."""
        locked: dict[str, set[str]] = {}
        for r in self.defn.rules:
            if r.kind in ("set_ref_field", "exclusive_reference", "ref_field_equals"):
                locked.setdefault(str(r.params.get("entity")), set()).add(str(r.params.get("ref_field")))
            # Fields written by effects are owned by the workflow once a record exists
            # (e.g. an item's availability can't be hand-edited while it is rented).
            if r.kind == "set_ref_field":
                entity = self.defn.entity(str(r.params.get("entity")))
                ref = next((f for f in entity.fields if f.key == r.params.get("ref_field")), None) if entity else None
                if ref and ref.ref_entity:
                    locked.setdefault(ref.ref_entity, set()).add(str(r.params.get("target_field")))
            if r.kind == "set_field":
                locked.setdefault(str(r.params.get("entity")), set()).add(str(r.params.get("field")))
        return locked
