"""Ollama Cloud has no structured outputs: schema in the prompt, lenient parsing, validate, repair."""

import json

import httpx
import pytest

from app import config
from app.pipeline import jsonrepair
from app.pipeline import model as model_mod
from app.pipeline.model import ModelStatus, OllamaProvider, schema_pass_a, schema_pass_b


def test_extract_json_is_lenient():
    assert jsonrepair.extract_json('{"a": 1}') == {"a": 1}
    assert jsonrepair.extract_json('Here you go:\n```json\n{"a": 2}\n```\nDone.') == {"a": 2}
    assert jsonrepair.extract_json('Sure! {"a": {"b": [3]}} hope it helps') == {"a": {"b": [3]}}
    with pytest.raises(ValueError):
        jsonrepair.extract_json("no json here")


def test_validate_reports_specific_problems():
    pass_a = {"entities": [{"name": "Loan", "fields": [{"name": "tool", "type": "reference", "references": "Tool"}, {"name": "status", "type": "enum", "options": ["out", "back"]}]}], "lifecycle": None}
    schema = schema_pass_b(pass_a, 5, 0)
    bad = {
        "rules": [
            {"kind": "exclusive_reference", "statement": "x", "entity": "Loan", "source": "narration", "confidence": "high", "segments": [1]},  # missing ref_field
            {"kind": "magic", "statement": "y"},
        ],
        "actions": [{"name": "Lend", "entity": "Ship", "kind": "create", "source": "narration", "segments": [9]}],
    }
    errors = jsonrepair.validate(bad, schema)
    text = "\n".join(errors)
    assert "$.rules[1]: kind must be one of" in text
    assert "$.actions[0].entity: 'Ship' is not allowed" in text
    assert "$.actions[0].segments[0]: must be at most 4" in text
    good = {"rules": [{"kind": "note", "statement": "Be nice.", "entity": "Loan", "source": "inferred", "confidence": "low", "segments": []}], "actions": []}
    assert jsonrepair.validate(good, schema) == []


class FakeCloud:
    def __init__(self, answers):
        self.answers = list(answers)
        self.bodies = []

    def __call__(self, url, json=None, headers=None, timeout=None):
        assert url.endswith("/api/chat")
        self.bodies.append(json)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": self.answers.pop(0)}}, request=httpx.Request("POST", url))


@pytest.fixture
def cloud(monkeypatch):
    settings = config.Settings(_env_file=None, ollama_url="https://ollama.com", ollama_api_key="k", ollama_model="gemma4:31b", ollama_vision="true")
    monkeypatch.setattr(model_mod, "get_settings", lambda: settings)
    provider = OllamaProvider()
    monkeypatch.setattr(provider, "status", lambda **_: ModelStatus(True, provider.url, provider.model, True, True, cloud=True))
    return provider


def test_cloud_sends_schema_in_prompt_and_repairs(cloud, monkeypatch):
    assert cloud.structured is False
    valid = {"workflow_name": "Tool library", "summary": "s", "entities": [{"name": "Tool", "description": "d", "source": "narration", "fields": [], "segments": [0]}], "lifecycle": None, "steps": [], "questions": []}
    wrong = {**valid, "entities": [{**valid["entities"][0], "source": "video"}]}
    fake = FakeCloud(["```json\n" + json.dumps(wrong) + "\n```", json.dumps(valid)])
    monkeypatch.setattr(model_mod.httpx, "post", fake)
    notes = []
    out = cloud._chat("SYSTEM", "USER", schema_pass_a(3, 0), on_progress=notes.append)

    assert out == valid
    first, second = fake.bodies
    assert "format" not in first and "format" not in second  # Cloud: no structured outputs
    assert "ANSWER FORMAT" in first["messages"][0]["content"] and '"workflow_name"' in first["messages"][0]["content"]
    assert second["messages"][-2]["role"] == "assistant"
    assert "$.entities[0].source: 'video' is not allowed" in second["messages"][-1]["content"]
    assert notes and "asking the model to fix it (1/2)" in notes[0]


def test_cloud_gives_up_after_bounded_repairs_but_keeps_best_answer(cloud, monkeypatch):
    nearly = {"workflow_name": "W", "summary": "s", "entities": [], "lifecycle": None, "steps": [], "questions": []}  # minItems 1 violated
    fake = FakeCloud(["not json at all", json.dumps(nearly), json.dumps(nearly), "never asked"])
    monkeypatch.setattr(model_mod.httpx, "post", fake)
    out = cloud._chat("S", "U", schema_pass_a(1, 0))
    assert out == nearly and len(fake.bodies) == 3  # 1 answer + at most 2 repairs; the normalizer handles the rest

    fake = FakeCloud(["nope", "still nope", "nope again"])
    monkeypatch.setattr(model_mod.httpx, "post", fake)
    with pytest.raises(ValueError, match="did not return valid JSON"):
        cloud._chat("S", "U", schema_pass_a(1, 0))


def test_local_ollama_keeps_structured_outputs(monkeypatch):
    settings = config.Settings(_env_file=None, ollama_url="http://127.0.0.1:11434", ollama_model="gemma4:e4b")
    monkeypatch.setattr(model_mod, "get_settings", lambda: settings)
    provider = OllamaProvider()
    monkeypatch.setattr(provider, "status", lambda **_: ModelStatus(True, provider.url, provider.model, True, True))
    fake = FakeCloud([json.dumps({"ok": True})])
    monkeypatch.setattr(model_mod.httpx, "post", fake)
    assert provider.structured is True
    provider._chat("S", "U", {"type": "object"})
    assert fake.bodies[0]["format"] == {"type": "object"} and "ANSWER FORMAT" not in fake.bodies[0]["messages"][0]["content"]
