"""Ollama-compatible model provider.

Extraction runs in two constrained passes so that small local models stay accurate:

  Pass A (frames + text): entities, fields, lifecycle, process steps, open questions.
  Pass B (text only):     business rules and actions. Its JSON schema is generated from Pass A,
                          so every entity, field, state and event name must be one that exists.

Evidence is cited by numbered source segment (transcript or narration sentence) or frame index;
the server maps those to timestamps and quotes. All model output is treated as untrusted data.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any, Callable

import httpx

from ..config import get_settings
from . import jsonrepair
from ..workflow.schema import FIELD_TYPES, RULE_KINDS

SOURCE_ENUM = {"type": "string", "enum": ["observed", "narration", "inferred"]}


def _cites(n_segments: int, n_frames: int) -> dict[str, Any]:
    seg = {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": max(n_segments - 1, 0)}, "maxItems": 4}
    frm = {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": max(n_frames - 1, 0)}, "maxItems": 3}
    return {"segments": seg, "frames": frm}


def schema_pass_a(n_segments: int, n_frames: int) -> dict[str, Any]:
    cites = _cites(n_segments, n_frames)
    return {
        "type": "object",
        "properties": {
            "workflow_name": {"type": "string"},
            "summary": {"type": "string"},
            "entities": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "source": SOURCE_ENUM,
                        **cites,
                        "fields": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "type": {"type": "string", "enum": list(FIELD_TYPES)},
                                    "required": {"type": "boolean"},
                                    "options": {"type": "array", "items": {"type": "string"}},
                                    "references": {"type": ["string", "null"]},
                                },
                                "required": ["name", "type", "required"],
                            },
                        },
                    },
                    "required": ["name", "description", "source", "fields", "segments"],
                },
            },
            "lifecycle": {
                "type": ["object", "null"],
                "properties": {
                    "entity": {"type": "string"},
                    "states": {"type": "array", "items": {"type": "string"}, "minItems": 2},
                    "initial": {"type": "string"},
                    "transitions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"name": {"type": "string"}, "from": {"type": "array", "items": {"type": "string"}}, "to": {"type": "string"}, "source": SOURCE_ENUM, **cites},
                            "required": ["name", "from", "to", "source", "segments"],
                        },
                    },
                },
                "required": ["entity", "states", "initial", "transitions"],
            },
            "steps": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
            "questions": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        },
        "required": ["workflow_name", "summary", "entities", "lifecycle", "steps", "questions"],
    }


def schema_pass_b(pass_a: dict[str, Any], n_segments: int, n_frames: int) -> dict[str, Any]:
    """Rules are an anyOf of kind-specific objects whose parameters are enums drawn from Pass A,
    so the decoder can only produce rules that reference real entities, fields, states and events."""
    cites = _cites(n_segments, n_frames)
    ents = [e for e in pass_a.get("entities", []) if isinstance(e, dict) and isinstance(e.get("name"), str)]
    names = [e["name"] for e in ents] or ["Record"]

    def fields_where(pred: Callable[[dict[str, Any]], bool]) -> list[str]:
        return sorted({f["name"] for e in ents for f in (e.get("fields") or []) if isinstance(f, dict) and isinstance(f.get("name"), str) and pred(f)})

    all_fields = fields_where(lambda f: True) or ["name"]
    ref_fields = fields_where(lambda f: f.get("type") == "reference")
    numeric = fields_where(lambda f: f.get("type") in ("number", "money"))
    dates = fields_where(lambda f: f.get("type") == "date")
    options = sorted({str(o) for e in ents for f in (e.get("fields") or []) if isinstance(f, dict) for o in (f.get("options") or []) if isinstance(o, (str, int))})
    lc = pass_a.get("lifecycle") if isinstance(pass_a.get("lifecycle"), dict) else {}
    states = [x for x in (lc.get("states") or []) if isinstance(x, str)]
    events = ["create"] + [t["name"] for t in (lc.get("transitions") or []) if isinstance(t, dict) and isinstance(t.get("name"), str)]

    def enum(values: list[str]) -> dict[str, Any]:
        return {"type": "string", "enum": values}

    common = {"statement": {"type": "string"}, "entity": enum(names), "source": SOURCE_ENUM, "confidence": {"type": "string", "enum": ["high", "medium", "low"]}, **cites}
    base_req = ["kind", "statement", "entity", "source", "confidence", "segments"]

    def variant(kind: str, props: dict[str, Any]) -> dict[str, Any]:
        return {"type": "object", "properties": {"kind": {"const": kind}, **common, **props}, "required": base_req + list(props)}

    value = enum(options) if options else {"type": "string"}
    variants = [variant("note", {})]
    if ref_fields:
        variants += [
            variant("ref_field_equals", {"on": enum(events), "ref_field": enum(ref_fields), "target_field": enum(all_fields), "value": value}),
            variant("set_ref_field", {"on": enum(events), "ref_field": enum(ref_fields), "target_field": enum(all_fields), "value": value}),
        ]
        if states:
            variants.append(variant("exclusive_reference", {"ref_field": enum(ref_fields), "states": {"type": "array", "items": enum(states), "minItems": 1}}))
    variants.append(variant("set_field", {"on": enum(events), "field": enum(all_fields), "value": {"type": "string"}}))
    if numeric:
        variants.append(variant("min_value", {"field": enum(numeric), "value": {"type": "number"}}))
    if len(dates) >= 2:
        variants.append(variant("date_order", {"start_field": enum(dates), "end_field": enum(dates)}))

    return {
        "type": "object",
        "properties": {
            "rules": {"type": "array", "maxItems": 12, "items": {"anyOf": variants}},
            "actions": {
                "type": "array",
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}, "entity": enum(names), "kind": {"type": "string", "enum": ["create", "transition", "update"]}, "source": SOURCE_ENUM, **cites},
                    "required": ["name", "entity", "kind", "source", "segments"],
                },
            },
        },
        "required": ["rules", "actions"],
    }


PROMPT_A = """You are the analysis engine of Code Your Reality. You study evidence of a real business process
(video frames and numbered source segments: speech transcript and written narration) and describe its DATA STRUCTURE as JSON.

Rules for your answer:
- entities: every kind of thing the process keeps a record of. Always include the main transaction itself
  (for example a Loan, Rental, Order or Booking) AND the things it links (for example Customer/Member, Item/Tool).
  Give each entity typed fields. Field types: text, long_text, number, money, date, email, phone,
  enum (give options), reference (set "references" to another entity name), boolean.
  If a thing has a status that changes (available, lent, broken...), model it as an enum field with those options.
- The main transaction should reference the other entities with reference fields.
- lifecycle: the states of the main transaction and the transitions between them (or null).
- steps: the process in order, as short labels. questions: what is ambiguous or missing.
- source: "observed" (visible in frames), "narration" (said or written), "inferred" (your assumption).
- segments: the numbers [S#] of the source segments that support the item. Cite at least one when the item comes from speech or narration."""

PROMPT_B = """You are the analysis engine of Code Your Reality. The data structure of a business process has
already been identified (below). Now extract its BUSINESS RULES and ACTIONS as JSON, using ONLY the
entity, field, state, value and event names allowed by the schema.

Each rule has a "kind" and the parameters that kind requires. Prefer an enforceable kind; use "note" only when none fits.
Illustrations from an unrelated hotel business (Guest, Room, Booking):
- ref_field_equals: "A room must be clean before it is booked." -> entity Booking, on "create", ref_field "room",
  target_field "housekeeping", value "clean". The linked record (via ref_field) must have target_field = value before the event.
- exclusive_reference: "A room can only have one current booking." -> entity Booking, ref_field "room", states ["checked_in"].
- set_ref_field: "Checking out marks the room as dirty." -> entity Booking, on "check_out", ref_field "room",
  target_field "housekeeping", value "dirty". After the event, the linked record's field is set to value.
- set_field: "Checking out records the departure date." -> entity Booking, on "check_out", field "departed_on", value "$today".
- min_value: "The nightly rate cannot be negative." -> entity Booking, field "rate", value 0.
- date_order: "Departure cannot be before arrival." -> entity Booking, start_field "arrival", end_field "departure".
"entity" is the record the rule belongs to (usually the main transaction). "statement" is one plain-language
sentence a business owner would say, without field names. Cite supporting source segment numbers in "segments".
Actions are what people do, named as short verb phrases (e.g. "Register guest", "Check out"):
create a record, move it through a transition (kind "transition", same name as the transition), or update it."""


@dataclass
class ModelStatus:
    reachable: bool
    url: str
    model: str
    installed: bool
    vision: bool
    error: str | None = None
    available_models: list[str] | None = None
    thinking: bool = False
    cloud: bool = False
    api_key_configured: bool = False  # never the key itself
    capabilities_source: str = "server"  # server | config | unknown
    structured_outputs: bool = True  # False: schema in the prompt + validate-and-repair (Ollama Cloud)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ModelUnavailable(Exception):
    pass


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [p.strip()[:400] for p in parts if p.strip()][:60]


def build_sources(segments: list[dict[str, Any]], narration: str) -> list[dict[str, Any]]:
    """Numbered evidence units the model can cite: transcript segments, then narration sentences."""
    sources: list[dict[str, Any]] = []
    for s in segments[:120]:
        sources.append({"kind": "transcript", "start": s["start"], "end": s["end"], "text": s["text"]})
    for sentence in split_sentences(narration):
        sources.append({"kind": "narration", "start": None, "end": None, "text": sentence})
    return sources


def format_sources(sources: list[dict[str, Any]]) -> str:
    lines = []
    for i, s in enumerate(sources):
        when = f"{s['start']:.1f}-{s['end']:.1f}s" if s["kind"] == "transcript" else "written narration"
        lines.append(f"[S{i}] ({when}) {s['text']}")
    return "\n".join(lines) or "(no speech or narration)"


_status_cache: dict[str, tuple[float, "ModelStatus"]] = {}
STATUS_TTL_SECONDS = 15.0


class OllamaProvider:
    """Talks to a local Ollama or to Ollama Cloud (https://ollama.com with an API key)."""

    def __init__(self) -> None:
        s = get_settings()
        self.url = s.ollama_url_normalized
        self.model = s.ollama_model
        self.timeout = s.ollama_timeout_seconds
        self.temperature = s.model_temperature
        self.vision_override = s.ollama_vision
        key = s.ollama_api_key.get_secret_value().strip() if s.ollama_api_key else ""
        self._headers = {"Authorization": f"Bearer {key}"} if key else {}
        self.cloud = "ollama.com" in self.url
        # Ollama Cloud doesn't support structured outputs (docs.ollama.com/capabilities/structured-outputs).
        self.structured = s.ollama_structured_outputs == "true" or (s.ollama_structured_outputs == "auto" and not self.cloud)
        self.max_repairs = 2

    def status(self, *, fresh: bool = False) -> ModelStatus:
        """Model availability, cached briefly so status polling never hammers the model server."""
        import time

        key = f"{self.url}|{self.model}|{bool(self._headers)}|{self.vision_override}"
        hit = _status_cache.get(key)
        if hit and not fresh and time.monotonic() - hit[0] < STATUS_TTL_SECONDS:
            return hit[1]
        result = self._probe()
        _status_cache[key] = (time.monotonic(), result)
        return result

    def _status(self, reachable: bool, installed: bool, vision: bool, error: str | None = None, names: list[str] | None = None, thinking: bool = False, source: str = "server") -> ModelStatus:
        return ModelStatus(reachable, self.url, self.model, installed, vision, error, names, thinking, self.cloud, bool(self._headers), source, self.structured)

    def _probe(self) -> ModelStatus:
        try:
            r = httpx.get(f"{self.url}/api/tags", headers=self._headers, timeout=8)
        except Exception as exc:
            return self._status(False, False, False, f"Model server not reachable at {self.url} ({type(exc).__name__}).")
        if r.status_code in (401, 403):
            hint = "Set OLLAMA_API_KEY on the server." if not self._headers else "Check OLLAMA_API_KEY on the server."
            return self._status(False, False, False, f"The model server rejected the request ({r.status_code}). {hint}")
        if r.status_code != 200:
            return self._status(False, False, False, f"Model server at {self.url} answered {r.status_code}.")
        names = [m.get("name") or m.get("model") or "" for m in (r.json().get("models") or [])]
        installed = self.model in names or f"{self.model}:latest" in names
        if not installed:
            how = "Choose one listed by the cloud account." if self.cloud else f"Run: ollama pull {self.model}"
            return self._status(True, False, False, f"Model '{self.model}' is not available on {self.url}. {how}", names)
        caps: list[str] | None = None
        try:
            info = httpx.post(f"{self.url}/api/show", json={"model": self.model}, headers=self._headers, timeout=10)
            if info.status_code == 200:
                caps = list(info.json().get("capabilities") or [])
        except Exception:
            caps = None
        if self.vision_override != "auto":
            vision, source = self.vision_override == "true", "config"
        elif caps is not None:
            vision, source = "vision" in caps, "server"
        else:
            vision, source = False, "unknown"  # set OLLAMA_VISION=true to send frames to a vision model
        return self._status(True, True, vision, None, names, "thinking" in (caps or []), source)

    def _chat(self, system: str, user: str, schema: dict[str, Any], images: list[str] | None = None, on_progress: Callable[[str], None] | None = None) -> dict[str, Any]:
        """One JSON answer that fits `schema`.

        With structured outputs (local Ollama) the decoder is constrained by the schema. Without them
        (Ollama Cloud) the schema is part of the prompt, and the answer is validated here; a bounded
        number of repair turns tell the model exactly what didn't fit. If it still doesn't fit, the best
        answer is returned anyway: the normalizer treats model output as untrusted and drops what's invalid.
        """
        message: dict[str, Any] = {"role": "user", "content": user}
        if images:
            message["images"] = images
        messages: list[dict[str, Any]] = [{"role": "system", "content": system if self.structured else system + jsonrepair.schema_instructions(schema)}, message]
        if self.structured:
            return self._request(messages, schema)
        best: dict[str, Any] | None = None
        best_errors: list[str] | None = None
        for attempt in range(self.max_repairs + 1):
            content = self._request(messages, None)
            try:
                data = jsonrepair.extract_json(content)
                errors = jsonrepair.validate(data, schema) if isinstance(data, dict) else ["$: expected a JSON object"]
            except ValueError:
                data, errors = None, ["$: the answer is not valid JSON"]
            if isinstance(data, dict) and (best_errors is None or len(errors) < len(best_errors)):
                best, best_errors = data, errors
            if not errors:
                return data
            if attempt < self.max_repairs:
                if on_progress:
                    on_progress(f"Answer didn't fit the format ({len(errors)} issue(s)); asking the model to fix it ({attempt + 1}/{self.max_repairs})")
                messages = messages + [{"role": "assistant", "content": content[:20000]}, {"role": "user", "content": jsonrepair.repair_message(errors)}]
        if best is None:
            raise ValueError("The model did not return valid JSON, even after asking it to correct its answer.")
        return best

    def _request(self, messages: list[dict[str, Any]], schema: dict[str, Any] | None) -> Any:
        """POST /api/chat. With a schema: the parsed JSON object; without: the raw answer text."""
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": self.temperature, "num_ctx": 16384},
        }
        if schema is not None:
            body["format"] = schema
        if self.status().thinking:
            body["think"] = False  # structured extraction doesn't need visible reasoning; only sent to models that support the flag
        try:
            resp = httpx.post(f"{self.url}/api/chat", json=body, headers=self._headers, timeout=self.timeout)
        except httpx.TimeoutException as exc:
            raise ModelUnavailable(f"The model did not answer within {self.timeout}s.") from exc
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"Model request failed: {exc}") from exc
        if resp.status_code in (401, 403):
            raise ModelUnavailable("The model server rejected the API key. Check OLLAMA_API_KEY on the server.")
        if resp.status_code == 429:
            raise ModelUnavailable("The model service is rate-limiting requests. Try again in a minute.")
        if resp.status_code != 200:
            raise ModelUnavailable(f"Model server returned {resp.status_code}: {resp.text[:300]}")
        content = (resp.json().get("message") or {}).get("content", "")
        if schema is None:
            return content
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError("The model returned text that is not valid JSON.") from exc
        if not isinstance(data, dict):
            raise ValueError("The model returned JSON that is not an object.")
        return data

    def extract(
        self,
        *,
        sources: list[dict[str, Any]],
        frames_b64: list[str],
        frame_times: list[float],
        vision: bool,
        on_progress: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        progress = on_progress or (lambda _m: None)
        n_frames = len(frames_b64) if vision else 0
        source_text = format_sources(sources)
        frame_note = (
            f"{n_frames} video frames are attached in order: " + ", ".join(f"frame {i} at {t:.1f}s" for i, t in enumerate(frame_times[:n_frames])) + "."
            if n_frames
            else "No readable frames are attached; rely on the text."
        )

        progress(f"Pass 1 of 2 · structure · {self.model} · {n_frames} frame(s) · {len(sources)} source segment(s)")
        pass_a = self._chat(
            PROMPT_A,
            f"{frame_note}\n\nSOURCE SEGMENTS:\n{source_text}\n\nReturn the JSON object.",
            schema_pass_a(len(sources), n_frames),
            frames_b64[:n_frames] if n_frames else None,
            progress,
        )

        structure = json.dumps(
            {
                "entities": [
                    {"name": e.get("name"), "fields": [{"name": f.get("name"), "type": f.get("type"), "options": f.get("options"), "references": f.get("references")} for f in (e.get("fields") or []) if isinstance(f, dict)]}
                    for e in (pass_a.get("entities") or [])
                    if isinstance(e, dict)
                ],
                "lifecycle": pass_a.get("lifecycle"),
            },
            ensure_ascii=False,
        )
        progress(f"Pass 2 of 2 · rules and actions · {self.model}")
        pass_b = self._chat(
            PROMPT_B,
            f"DATA STRUCTURE:\n{structure}\n\nSOURCE SEGMENTS:\n{source_text}\n\nReturn the JSON object.",
            schema_pass_b(pass_a, len(sources), n_frames),
            on_progress=progress,
        )
        return {**pass_a, "rules": pass_b.get("rules") or [], "actions": pass_b.get("actions") or []}

    def propose_change(self, definition: Any, instruction: str) -> dict[str, Any]:
        """Ask for a few constrained operations implementing one small customer request."""
        from . import changes

        status = self.status()
        if not status.reachable or not status.installed:
            raise ModelUnavailable(status.error or "Model unavailable.")
        return self._chat(
            changes.PROMPT,
            f"CURRENT WORKFLOW:\n{changes.describe(definition)}\n\nCUSTOMER REQUEST:\n{instruction}\n\nReturn the JSON object.",
            changes.schema(definition),
        )
