"""Upload validation, model-output normalization and transparent failure handling."""

import subprocess

import pytest

from app.pipeline.media import ffmpeg_exe
from app.pipeline.normalize import MappingFailed, normalize
from app.workflow.schema import WorkflowDefinition
from app.workflow.validation import validate

from .conftest import wait_job


def test_upload_rejects_non_video(client):
    pid = client.post("/api/projects", json={"name": "Bad upload"}).json()["id"]
    r = client.post(f"/api/projects/{pid}/media", files={"file": ("notes.mp4", b"this is not a video at all", "video/mp4")})
    assert r.status_code == 415
    r = client.post(f"/api/projects/{pid}/media", files={"file": ("../../evil.exe", b"MZ\x90\x00" * 10, "application/octet-stream")})
    assert r.status_code == 415


def _make_video(path, with_audio=True):
    exe, _ = ffmpeg_exe()
    if not exe:
        pytest.skip("ffmpeg not available")
    args = [exe, "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=3"]
    if with_audio:
        args += ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest"]
    args += ["-pix_fmt", "yuv420p", str(path)]
    subprocess.run(args, capture_output=True, check=True)


def test_upload_and_analysis_fails_transparently_without_model(client, tmp_path):
    video = tmp_path / "clip.mp4"
    _make_video(video)
    project = client.post("/api/projects", json={"name": "Counter", "narration": "We rent cameras to customers."}).json()
    pid = project["id"]
    r = client.post(f"/api/projects/{pid}/media", files={"file": ("../weird name.mp4", video.read_bytes(), "video/mp4")})
    assert r.status_code == 201, r.text
    media = r.json()["media"]
    assert media["original_name"].endswith("weird name.mp4")
    assert r.json()["status"] == "uploaded"

    # Range requests work for seeking in the browser.
    r = client.get(media["url"], headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100

    job = client.post(f"/api/projects/{pid}/analyze").json()
    job = wait_job(client, job["id"], timeout=120)
    assert job["status"] == "failed"
    stages = {s["key"]: s for s in job["stages"]}
    assert stages["media_received"]["status"] == "done"
    assert stages["audio_extraction"]["status"] == "done"
    assert stages["transcription"]["status"] == "skipped"  # disabled in tests
    assert stages["frame_sampling"]["status"] == "done"
    assert stages["model_interpretation"]["status"] == "failed"
    assert stages["validation"]["status"] == "pending"
    assert "manually" in job["error"]

    detail = client.get(f"/api/projects/{pid}").json()
    assert detail["status"] == "failed"
    assert detail["workflow"] is None
    assert len(detail["media"]["frames"]) >= 1
    assert client.get(detail["media"]["frames"][0]["url"]).headers["content-type"] == "image/jpeg"

    # Manual recovery path.
    r = client.post(f"/api/projects/{pid}/manual", json={"name": "Counter rentals", "template": "rental"})
    assert r.status_code == 201
    assert r.json()["workflow"]["review"]["pending"] == 0


SOURCES = [
    {"kind": "transcript", "start": 2.0, "end": 5.0, "text": "I ask for their name"},
    {"kind": "transcript", "start": 9.0, "end": 12.0, "text": "then I mark it closed"},
    {"kind": "narration", "start": None, "end": None, "text": "Only free bikes can be rented."},
]

RAW = {
    "workflow_name": "Bike rental desk",
    "summary": "Renting bikes",
    "entities": [
        {"name": "Bike", "source": "observed", "evidence": [{"frame": 1, "quote": "bike rack"}],
         "fields": [{"name": "Name", "type": "text", "required": True}, {"name": "Status", "type": "enum", "options": ["free", "out"]},
                    {"name": "Availability", "type": "enum", "options": ["free", "out"]}]},
        {"name": "Customer", "source": "narration", "evidence": [{"start": 2, "end": 5, "quote": "I ask for their name"}],
         "fields": [{"name": "Name", "type": "text"}, {"name": "Email", "type": "email"}]},
        {"name": "Rental", "source": "narration", "evidence": [],
         "fields": [{"name": "Bike", "type": "reference", "references": "Bike"}, {"name": "Customer", "type": "reference", "references": "Customer"},
                    {"name": "Deposit", "type": "money"}, {"name": "Who", "type": "reference", "references": "Spaceship"},
                    {"name": "Status", "type": "enum", "options": ["open", "closed"]}]},
    ],
    "lifecycle": {"entity": "Rental", "states": ["Open", "Closed"], "initial": "Open",
                  "transitions": [{"name": "Close rental", "from": ["Open"], "to": "Closed", "source": "narration", "evidence": [{"start": 9, "end": 12, "quote": "mark it closed"}]}]},
    "actions": [{"name": "Close rental", "entity": "Rental", "kind": "transition", "source": "narration"}, {"name": "Fly", "entity": "Spaceship", "kind": "create"}],
    "rules": [
        {"statement": "A bike must be free to rent", "kind": "ref_field_equals", "entity": "Rental", "on": "create", "ref_field": "Bike", "target_field": "Availability", "value": "free", "source": "narration", "evidence": [{"start": 3, "end": 4, "quote": "only free bikes"}]},
        {"statement": "Closing frees the bike", "kind": "set_ref_field", "entity": "Rental", "on": "Close rental", "ref_field": "Bike", "target_field": "Availability", "value": "free", "source": "inferred"},
        {"statement": "Deposit positive", "kind": "min_value", "entity": "Rental", "field": "Deposit", "value": 0, "source": "narration", "segments": [2, 99]},
        {"statement": "Nonsense rule", "kind": "date_order", "entity": "Rental", "start_field": "Nope", "end_field": "Deposit", "source": "inferred"},
        {"statement": "Be nice", "kind": "note", "source": "inferred"},
    ],
    "steps": ["Pick bike", "Register customer", "Close rental"],
    "questions": ["What happens to damaged bikes?"],
}


def test_normalize_maps_and_downgrades():
    defn, notes = normalize(RAW, duration=30, frame_times=[2.5, 7.5, 12.5], sources=SOURCES)
    wf = WorkflowDefinition.model_validate(defn)
    keys = {e.key for e in wf.entities}
    assert keys == {"bike", "customer", "rental"}
    bike = wf.entity("bike")
    assert "status" in {f.key for f in bike.fields}  # a plain status enum on a non-lifecycle entity is kept
    assert "status" not in {f.key for f in wf.entity("rental").fields}  # owned by the rental lifecycle
    assert bike.provenance.evidence[0].kind == "frame" and bike.provenance.evidence[0].start == 7.5
    rental = wf.entity("rental")
    who = next(f for f in rental.fields if f.key == "who")
    assert who.type == "text"  # unknown reference target downgraded
    assert rental.provenance.source == "inferred"  # claimed narration, cited nothing
    kinds = {r.statement: r.kind for r in wf.rules}
    assert kinds["A bike must be free to rent"] == "ref_field_equals"
    assert kinds["Closing frees the bike"] == "set_ref_field"
    assert kinds["Deposit positive"] == "min_value"
    assert kinds["Nonsense rule"] == "note"
    assert all(r.review.status == "pending" for r in wf.rules)
    assert wf.actions[0].transition == "close_rental"
    assert len(wf.actions) == 1  # action on unknown entity dropped
    assert [s.next for s in wf.stages][:2] == [[wf.stages[1].id], [wf.stages[2].id]]
    assert wf.questions[0].question.startswith("What happens")
    deposit_rule = next(r for r in wf.rules if r.kind == "min_value")
    assert [e.kind for e in deposit_rule.provenance.evidence] == ["narration"]  # out-of-range segment 99 dropped
    assert deposit_rule.provenance.evidence[0].quote == "Only free bikes can be rented."
    assert not [i for i in validate(wf) if i.severity == "error"]
    assert notes


def test_normalize_rejects_empty():
    with pytest.raises(MappingFailed):
        normalize({"workflow_name": "x", "entities": []}, duration=None, frame_times=[])


def test_validation_catches_broken_references():
    defn, _ = normalize(RAW, duration=30, frame_times=[])
    defn["rules"].append({"id": "bad", "kind": "set_ref_field", "statement": "bad", "params": {"entity": "rental", "on": "teleport", "ref_field": "bike", "target_field": "availability", "value": "gone"}})
    wf = WorkflowDefinition.model_validate(defn)
    errors = [i for i in validate(wf) if i.severity == "error"]
    assert any("teleport" in e.message for e in errors)
    assert any("'gone' is not an option" in e.message for e in errors)
