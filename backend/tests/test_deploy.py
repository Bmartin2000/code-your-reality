"""Server deployment: environment names, Ollama Cloud auth, /health, static frontend, basic auth."""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

from app import config
from app.pipeline import model as model_mod


def test_plain_env_names_and_precedence(monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "https://ollama.com/")
    monkeypatch.setenv("OLLAMA_API_KEY", "secret-key")
    monkeypatch.setenv("OLLAMA_MODEL", "gemma4:31b")
    monkeypatch.setenv("WHISPER_MODEL", "small")
    monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "int8")
    monkeypatch.delenv("RC_OLLAMA_URL", raising=False)
    s = config.Settings(_env_file=None)
    assert s.ollama_url_normalized == "https://ollama.com"
    assert s.ollama_api_key.get_secret_value() == "secret-key"
    assert s.ollama_model == "gemma4:31b" and s.whisper_model == "small" and s.whisper_device == "cpu"
    assert "secret-key" not in repr(s)  # SecretStr keeps it out of logs
    monkeypatch.setenv("RC_OLLAMA_MODEL", "qwen3.5:4b")
    assert config.Settings(_env_file=None).ollama_model == "qwen3.5:4b"  # RC_ names win


class FakeResponse:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def test_cloud_auth_header_and_capability_fallback(monkeypatch):
    calls = []

    def fake_get(url, headers=None, timeout=None):
        calls.append(("GET", url, headers))
        return FakeResponse(200, {"models": [{"name": "gemma4:31b"}]})

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append(("POST", url, headers))
        if url.endswith("/api/show"):
            return FakeResponse(404, {"error": "not found"})
        return FakeResponse(200, {"message": {"content": '{"ok": true}'}})

    monkeypatch.setattr(model_mod.httpx, "get", fake_get)
    monkeypatch.setattr(model_mod.httpx, "post", fake_post)
    settings = config.Settings(_env_file=None, ollama_url="https://ollama.com", ollama_api_key="k-123", ollama_model="gemma4:31b", ollama_vision="auto")
    monkeypatch.setattr(model_mod, "get_settings", lambda: settings)

    p = model_mod.OllamaProvider()
    st = p.status(fresh=True)
    assert st.installed and st.cloud and st.api_key_configured
    assert st.vision is False and st.capabilities_source == "unknown"  # /api/show missing: no frames unless configured
    assert all(h == {"Authorization": "Bearer k-123"} for _m, _u, h in calls)
    assert "k-123" not in json.dumps(st.to_dict())

    settings.ollama_vision = "true"
    st = model_mod.OllamaProvider().status(fresh=True)
    assert st.vision is True and st.capabilities_source == "config"
    assert model_mod.OllamaProvider()._chat("s", "u", {"type": "object"}) == {"ok": True}


def test_rejected_key_is_reported(monkeypatch):
    monkeypatch.setattr(model_mod.httpx, "get", lambda url, headers=None, timeout=None: FakeResponse(401, {"error": "unauthorized"}))
    settings = config.Settings(_env_file=None, ollama_url="https://ollama.com", ollama_api_key="bad", ollama_model="x")
    monkeypatch.setattr(model_mod, "get_settings", lambda: settings)
    st = model_mod.OllamaProvider().status(fresh=True)
    assert not st.reachable and "OLLAMA_API_KEY" in st.error


def test_health_and_capabilities_never_leak_key(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    caps = client.get("/api/system/capabilities").json()
    assert "api_key" not in json.dumps(caps).replace("api_key_configured", "")


def test_static_frontend_and_basic_auth(tmp_path: Path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>CYR</title>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    script = textwrap.dedent(
        """
        from fastapi.testclient import TestClient
        from app.main import app
        c = TestClient(app)
        assert c.get('/health').json()['status'] == 'ok'
        assert c.get('/').status_code == 401
        auth = ('demo', 'pw')
        assert c.get('/', auth=('demo', 'wrong')).status_code == 401
        assert 'CYR' in c.get('/', auth=auth).text
        assert 'CYR' in c.get('/studio/projects/abc', auth=auth).text
        assert c.get('/assets/app.js', auth=auth).text == 'console.log(1)'
        assert c.get('/favicon.svg', auth=auth).text == '<svg/>'
        assert c.get('/api/nope', auth=auth).status_code == 404
        assert c.get('/../app/main.py', auth=auth).text.startswith('<!doctype')
        print('OK')
        """
    )
    env = {
        **os.environ,
        "RC_DATA_DIR": str(tmp_path / "data"),
        "FRONTEND_DIST": str(dist),
        "BASIC_AUTH_USER": "demo",
        "BASIC_AUTH_PASSWORD": "pw",
        "RC_OLLAMA_URL": "http://127.0.0.1:9",
    }
    out = subprocess.run([sys.executable, "-c", script], cwd=Path(__file__).resolve().parent.parent, env=env, capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-2000:]
    assert "OK" in out.stdout
