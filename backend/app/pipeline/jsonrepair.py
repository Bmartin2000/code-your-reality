"""JSON answers from models that can't be constrained by a schema (e.g. Ollama Cloud).

Local Ollama decodes against the JSON schema (structured outputs), so its answer always fits. Ollama
Cloud doesn't support structured outputs, so there the schema goes into the prompt instead, and the
answer is checked here: lenient extraction of the JSON object, validation against the same schema,
and a short, specific error list that the caller sends back for a bounded number of repair attempts.

The validator covers the subset of JSON Schema our schemas use (type, enum, const, required,
properties, items, anyOf, minItems/maxItems, minimum/maximum). No extra dependency.
"""

from __future__ import annotations

import json
import re
from typing import Any

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "null": type(None),
}


def extract_json(text: str) -> Any:
    """The JSON object in a model answer: plain JSON, inside ```json fences, or surrounded by prose."""
    s = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", s, re.DOTALL | re.IGNORECASE)
    candidates = [s]
    if fence:
        candidates.insert(0, fence.group(1).strip())
    start, end = s.find("{"), s.rfind("}")
    if 0 <= start < end:
        candidates.append(s[start : end + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except (json.JSONDecodeError, ValueError):
            continue
    raise ValueError("The model returned text that is not valid JSON.")


def _type_ok(value: Any, t: str) -> bool:
    if t == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if t == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    py = _TYPES.get(t)
    if py is bool:
        return isinstance(value, bool)
    return py is not None and isinstance(value, py)


def validate(value: Any, schema: dict[str, Any], path: str = "$", errors: list[str] | None = None, limit: int = 12) -> list[str]:
    """Errors as short 'path: problem' lines (empty when valid)."""
    errs = errors if errors is not None else []
    if len(errs) >= limit:
        return errs

    if "anyOf" in schema:
        options = schema["anyOf"]
        if not any(not validate(value, o, path, [], limit) for o in options):
            kinds = [o.get("properties", {}).get("kind", {}).get("const") for o in options]
            kinds = [k for k in kinds if k]
            got = value.get("kind") if isinstance(value, dict) else None
            if kinds and got in kinds:
                # Report what the matching variant is missing, which is the useful part.
                variant = next(o for o in options if o.get("properties", {}).get("kind", {}).get("const") == got)
                validate(value, variant, path, errs, limit)
            elif kinds:
                errs.append(f"{path}: kind must be one of {kinds}" + (f", got {got!r}" if got is not None else ""))
            else:
                errs.append(f"{path}: does not match any allowed shape")
        return errs

    t = schema.get("type")
    if t is not None:
        types = t if isinstance(t, list) else [t]
        if not any(_type_ok(value, x) for x in types):
            errs.append(f"{path}: expected {' or '.join(types)}, got {type(value).__name__}")
            return errs

    if "const" in schema and value != schema["const"]:
        errs.append(f"{path}: must be {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        allowed = schema["enum"]
        shown = allowed if len(allowed) <= 15 else allowed[:15] + ["…"]
        errs.append(f"{path}: {value!r} is not allowed; use one of {shown}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append(f"{path}: must be at least {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errs.append(f"{path}: must be at most {schema['maximum']}")

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errs.append(f"{path}: missing required key {key!r}")
        for key, sub in (schema.get("properties") or {}).items():
            if key in value and len(errs) < limit:
                validate(value[key], sub, f"{path}.{key}", errs, limit)
    elif isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errs.append(f"{path}: needs at least {schema['minItems']} item(s)")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errs.append(f"{path}: at most {schema['maxItems']} item(s)")
        if "items" in schema:
            for i, item in enumerate(value):
                if len(errs) >= limit:
                    break
                validate(item, schema["items"], f"{path}[{i}]", errs, limit)
    return errs


def schema_instructions(schema: dict[str, Any]) -> str:
    return (
        "\n\nANSWER FORMAT: reply with exactly one JSON object and nothing else (no prose, no code fences). "
        "It must validate against this JSON Schema; use only the listed enum values, and include every required key:\n"
        + json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
    )


def repair_message(errors: list[str]) -> str:
    return (
        "Your previous answer does not fit the required JSON Schema:\n- "
        + "\n- ".join(errors)
        + "\nReturn the corrected, complete JSON object only."
    )
