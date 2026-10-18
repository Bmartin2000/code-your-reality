import os
import tempfile
import time
from pathlib import Path

import pytest

_tmp = tempfile.mkdtemp(prefix="rc-test-")
os.environ["RC_DATA_DIR"] = _tmp
os.environ["RC_OLLAMA_URL"] = "http://127.0.0.1:9"  # unreachable on purpose: tests never call a real model
os.environ["RC_WHISPER_ENABLED"] = "false"
os.environ["OLLAMA_API_KEY"] = ""  # a local .env may hold a real key: tests never use it
os.environ["OLLAMA_STRUCTURED_OUTPUTS"] = "auto"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "correct horse battery"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        # The first registered user becomes admin; the session cookie stays on this client.
        r = c.post("/api/auth/register", json={"name": "Admin", "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 201, r.text
        yield c


def wait_job(client, job_id: str, timeout: float = 30) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("succeeded", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def accept_all(defn: dict) -> dict:
    def acc(item):
        if item["review"]["status"] == "pending":
            item["review"]["status"] = "accepted"

    for e in defn["entities"]:
        acc(e)
        for f in e["fields"]:
            acc(f)
    for m in defn["state_machines"]:
        acc(m)
        for t in m["transitions"]:
            acc(t)
    for r in defn["rules"]:
        acc(r)
    for a in defn["actions"]:
        acc(a)
    for q in defn["questions"]:
        q["resolved"] = True
    return defn


@pytest.fixture
def data_dir() -> Path:
    return Path(_tmp)
