"""The workflow definition: the constrained, validated intermediate representation that sits between
an observed process and a compiled application.

The AI never produces executable code. It produces (a loose version of) this structure, which is
normalized, reviewed by a human, validated, and then compiled into a manifest that the predefined
runtime interprets.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "1.0"

KEY_PATTERN = r"^[a-z][a-z0-9_]{0,47}$"
_key_re = re.compile(KEY_PATTERN)

ProvenanceSource = Literal["observed", "narration", "inferred", "human"]
ReviewStatus = Literal["pending", "accepted", "rejected"]
FieldType = Literal["text", "long_text", "number", "money", "date", "email", "phone", "enum", "reference", "boolean"]
RuleKind = Literal[
    "ref_field_equals",
    "exclusive_reference",
    "set_ref_field",
    "set_field",
    "min_value",
    "date_order",
    "note",
]
StateTone = Literal["neutral", "active", "success", "warning"]
StageKind = Literal["start", "action", "state", "end"]
ViewKind = Literal["dashboard", "list", "detail", "form"]

FIELD_TYPES: tuple[str, ...] = FieldType.__args__  # type: ignore[attr-defined]
RULE_KINDS: tuple[str, ...] = RuleKind.__args__  # type: ignore[attr-defined]


def to_key(value: str, fallback: str = "item") -> str:
    """Normalize free text (e.g. an AI-proposed name) into a safe identifier."""
    key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    if not key or not key[0].isalpha():
        key = f"{fallback}_{key}".strip("_")
    return key[:48]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EvidenceRef(Strict):
    kind: Literal["transcript", "frame", "narration"]
    start: float | None = Field(default=None, ge=0)
    end: float | None = Field(default=None, ge=0)
    frame_index: int | None = Field(default=None, ge=0)
    quote: str = Field(default="", max_length=600)


class Provenance(Strict):
    source: ProvenanceSource = "inferred"
    evidence: list[EvidenceRef] = Field(default_factory=list, max_length=12)
    confidence: Literal["high", "medium", "low"] | None = None
    note: str = Field(default="", max_length=600)


class Review(Strict):
    status: ReviewStatus = "pending"
    edited: bool = False
    note: str = Field(default="", max_length=600)
    at: datetime | None = None


class Reviewable(Strict):
    provenance: Provenance = Field(default_factory=Provenance)
    review: Review = Field(default_factory=Review)


class EntityField(Reviewable):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=80)
    type: FieldType = "text"
    required: bool = False
    description: str = Field(default="", max_length=400)
    options: list[str] = Field(default_factory=list, max_length=24)
    ref_entity: str | None = Field(default=None, pattern=KEY_PATTERN)
    default: Any = None
    system: bool = False  # managed by the runtime (state field, effect targets), hidden from create forms

    @field_validator("options")
    @classmethod
    def _options(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        for opt in v:
            opt = opt.strip()[:60]
            if opt and opt not in cleaned:
                cleaned.append(opt)
        return cleaned


class Entity(Reviewable):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=80)
    plural_label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    title_field: str = Field(default="name", pattern=KEY_PATTERN)
    fields: list[EntityField] = Field(default_factory=list, max_length=40)


class WorkflowState(Strict):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    tone: StateTone = "neutral"
    terminal: bool = False


class Transition(Reviewable):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    from_states: list[str] = Field(default_factory=list, max_length=12)
    to_state: str = Field(pattern=KEY_PATTERN)
    description: str = Field(default="", max_length=300)


class StateMachine(Reviewable):
    entity: str = Field(pattern=KEY_PATTERN)
    field: str = Field(default="status", pattern=KEY_PATTERN)
    initial: str = Field(pattern=KEY_PATTERN)
    states: list[WorkflowState] = Field(min_length=1, max_length=16)
    transitions: list[Transition] = Field(default_factory=list, max_length=24)


class Rule(Reviewable):
    id: str = Field(pattern=KEY_PATTERN)
    kind: RuleKind = "note"
    statement: str = Field(min_length=1, max_length=400)
    params: dict[str, Any] = Field(default_factory=dict)


class Action(Reviewable):
    id: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    kind: Literal["create", "transition", "update"] = "create"
    entity: str = Field(pattern=KEY_PATTERN)
    transition: str | None = Field(default=None, pattern=KEY_PATTERN)


class Stage(Strict):
    id: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    kind: StageKind = "action"
    action: str | None = Field(default=None, pattern=KEY_PATTERN)
    entity: str | None = Field(default=None, pattern=KEY_PATTERN)
    state: str | None = Field(default=None, pattern=KEY_PATTERN)
    next: list[str] = Field(default_factory=list, max_length=6)


class View(Strict):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    kind: ViewKind
    entity: str | None = Field(default=None, pattern=KEY_PATTERN)
    columns: list[str] = Field(default_factory=list, max_length=12)


class OpenQuestion(Strict):
    id: str = Field(pattern=KEY_PATTERN)
    question: str = Field(min_length=1, max_length=400)
    context: str = Field(default="", max_length=400)
    resolved: bool = False
    answer: str = Field(default="", max_length=600)


class WorkflowDefinition(Strict):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    id: str = Field(pattern=KEY_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=800)
    domain: str = Field(default="general", max_length=60)
    version: int = Field(default=1, ge=1)
    entities: list[Entity] = Field(default_factory=list, max_length=12)
    state_machines: list[StateMachine] = Field(default_factory=list, max_length=6)
    rules: list[Rule] = Field(default_factory=list, max_length=40)
    actions: list[Action] = Field(default_factory=list, max_length=30)
    stages: list[Stage] = Field(default_factory=list, max_length=30)
    views: list[View] = Field(default_factory=list, max_length=30)
    questions: list[OpenQuestion] = Field(default_factory=list, max_length=20)

    def entity(self, key: str) -> Entity | None:
        return next((e for e in self.entities if e.key == key), None)

    def machine_for(self, entity_key: str) -> StateMachine | None:
        return next((m for m in self.state_machines if m.entity == entity_key), None)


# --- Rule parameter contracts --------------------------------------------------------------------
# Each enforceable rule kind has a fixed parameter shape. The runtime only knows these shapes.

RULE_PARAM_SPECS: dict[str, dict[str, str]] = {
    # Before `on` (create or a transition key), the record referenced by `ref_field` must have
    # `target_field` equal to `equals`.
    "ref_field_equals": {"entity": "entity", "on": "event", "ref_field": "ref", "target_field": "target", "equals": "value"},
    # At most one record of `entity` in one of `states` may reference the same target via `ref_field`.
    "exclusive_reference": {"entity": "entity", "ref_field": "ref", "states": "states"},
    # After `on`, set `target_field` of the record referenced by `ref_field` to `value`.
    "set_ref_field": {"entity": "entity", "on": "event", "ref_field": "ref", "target_field": "target", "value": "value"},
    # After `on`, set the record's own `field` to `value` ("$today" is the only dynamic value).
    "set_field": {"entity": "entity", "on": "event", "field": "field", "value": "value"},
    # Numeric `field` must be >= `min`.
    "min_value": {"entity": "entity", "field": "field", "min": "number"},
    # Date `start_field` must not be after `end_field`.
    "date_order": {"entity": "entity", "start_field": "field", "end_field": "field"},
    # Documentation only; never enforced.
    "note": {},
}


def is_key(value: Any) -> bool:
    return isinstance(value, str) and bool(_key_re.match(value))
