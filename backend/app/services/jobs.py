"""Background jobs: media analysis and application compilation.

Job stages are persisted as they happen; the frontend renders exactly what is stored here.
"""

from __future__ import annotations

import base64
import logging
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import select

from ..config import get_settings
from ..db import Job, MediaAsset, Project, SessionLocal, WorkflowVersion, utcnow
from ..pipeline import media as media_mod
from ..pipeline import transcribe as tr
from ..pipeline.model import ModelUnavailable, OllamaProvider, build_sources
from ..pipeline.normalize import MappingFailed, normalize
from ..workflow.compiler import COMPILE_STAGES, CompileError, Compiler
from ..workflow.schema import WorkflowDefinition
from ..workflow.validation import validate
from . import apps as app_service
from .audit import record_audit

log = logging.getLogger("reality_compiler.jobs")

ANALYSIS_STAGES: list[tuple[str, str]] = [
    ("media_received", "Media received"),
    ("audio_extraction", "Audio extraction"),
    ("transcription", "Transcription"),
    ("frame_sampling", "Frame sampling"),
    ("model_interpretation", "Model interpretation"),
    ("validation", "Structured workflow validation"),
]

_analysis_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
_compile_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="compile")


def new_stages(spec: list[tuple[str, str]]) -> list[dict[str, Any]]:
    return [{"key": k, "label": label, "status": "pending", "detail": "", "duration_ms": None, "outputs": {}} for k, label in spec]


def _save(job_id: str, mutate: Callable[[Job, Project], None]) -> None:
    with SessionLocal() as s:
        job = s.get(Job, job_id)
        if not job:
            return
        project = s.get(Project, job.project_id)
        mutate(job, project)
        job.stages = [dict(st) for st in job.stages]  # new list => SQLAlchemy sees the JSON change
        job.updated_at = utcnow()
        s.commit()


class StageTracker:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.started: dict[str, float] = {}

    def _set(self, key: str, **values: Any) -> None:
        def mutate(job: Job, _p: Project) -> None:
            stages = [dict(st) for st in job.stages]
            for st in stages:
                if st["key"] == key:
                    st.update(values)
            job.stages = stages

        _save(self.job_id, mutate)

    def start(self, key: str, detail: str = "") -> None:
        self.started[key] = time.perf_counter()
        self._set(key, status="running", detail=detail)

    def _elapsed(self, key: str) -> float | None:
        return round((time.perf_counter() - self.started[key]) * 1000, 1) if key in self.started else None

    def done(self, key: str, detail: str = "", **outputs: Any) -> None:
        self._set(key, status="done", detail=detail, duration_ms=self._elapsed(key), outputs=outputs)

    def skip(self, key: str, detail: str) -> None:
        self._set(key, status="skipped", detail=detail, duration_ms=self._elapsed(key))

    def fail(self, key: str, detail: str) -> None:
        self._set(key, status="failed", detail=detail, duration_ms=self._elapsed(key))


def mark_interrupted_jobs() -> None:
    """Jobs can't survive a server restart; surface that honestly instead of leaving them 'running'."""
    with SessionLocal() as s:
        for job in s.scalars(select(Job).where(Job.status.in_(["queued", "running"]))):
            job.status = "failed"
            job.error = "Interrupted by a server restart. Start the job again."
            job.stages = [dict(st, status="failed" if st["status"] == "running" else st["status"]) for st in job.stages]
            project = s.get(Project, job.project_id)
            if project and project.status in ("analyzing", "compiling"):
                project.status = "failed"
        s.commit()


# --- Analysis ------------------------------------------------------------------------------------


def start_analysis(project_id: str, frame_samples: int) -> str:
    """frame_samples comes from the plan checked by the request (it may be a Super Admin test plan)."""
    with SessionLocal() as s:
        job = Job(project_id=project_id, kind="analysis", status="queued", stages=new_stages(ANALYSIS_STAGES))
        s.add(job)
        project = s.get(Project, project_id)
        project.status = "analyzing"
        s.commit()
        job_id = job.id
    _analysis_pool.submit(_run_analysis_safe, job_id, frame_samples)
    return job_id


def _run_analysis_safe(job_id: str, frame_samples: int) -> None:
    try:
        _run_analysis(job_id, frame_samples)
    except Exception as exc:  # pragma: no cover - last-resort guard
        log.error("analysis crashed: %s", traceback.format_exc())
        _finish(job_id, ok=False, error=f"Unexpected error: {exc}", project_status="failed")


def _finish(job_id: str, *, ok: bool, error: str | None = None, result: dict[str, Any] | None = None, project_status: str | None = None) -> None:
    def mutate(job: Job, project: Project) -> None:
        job.status = "succeeded" if ok else "failed"
        job.error = error
        if result is not None:
            job.result = result
        if project_status and project:
            project.status = project_status

    _save(job_id, mutate)


def _run_analysis(job_id: str, frame_samples: int) -> None:
    settings = get_settings()
    t = StageTracker(job_id)
    _save(job_id, lambda j, _p: setattr(j, "status", "running"))

    with SessionLocal() as s:
        job = s.get(Job, job_id)
        project = s.get(Project, job.project_id)
        asset = s.scalars(select(MediaAsset).where(MediaAsset.project_id == project.id).order_by(MediaAsset.created_at.desc())).first()
        narration = project.narration or ""
        project_id = project.id
        asset_id = asset.id if asset else None
        video_path = settings.uploads_dir / project.id / asset.stored_name if asset else None

    # 1. Media received
    t.start("media_received")
    duration: float | None = None
    has_audio = False
    if video_path:
        try:
            info = media_mod.probe(video_path)
        except media_mod.MediaError as exc:
            t.fail("media_received", str(exc))
            return _finish(job_id, ok=False, error=str(exc), project_status="failed")
        if not info.has_video:
            msg = "The file contains no readable video stream."
            t.fail("media_received", msg)
            return _finish(job_id, ok=False, error=msg, project_status="failed")
        if info.duration and info.duration > settings.max_video_seconds:
            msg = f"The recording is {info.duration:.0f}s long; the limit is {settings.max_video_seconds}s."
            t.fail("media_received", msg)
            return _finish(job_id, ok=False, error=msg, project_status="failed")
        duration, has_audio = info.duration, info.has_audio
        with SessionLocal() as s:
            a = s.get(MediaAsset, asset_id)
            a.duration_seconds, a.has_audio = duration, has_audio
            s.commit()
        t.done("media_received", f"{duration:.1f}s video · {'with' if has_audio else 'no'} audio track" if duration else "Video stream found", duration=duration, has_audio=has_audio)
    elif narration.strip():
        t.done("media_received", "No video — analyzing the written narration only")
    else:
        msg = "Nothing to analyze: upload a recording or write a narration."
        t.fail("media_received", msg)
        return _finish(job_id, ok=False, error=msg, project_status="failed")

    work_dir = settings.uploads_dir / project_id / "work"
    work_dir.mkdir(parents=True, exist_ok=True)

    # 2. Audio extraction
    audio_path: Path | None = None
    t.start("audio_extraction")
    if not video_path:
        t.skip("audio_extraction", "No video provided")
    elif not has_audio:
        t.skip("audio_extraction", "The recording has no audio track")
    else:
        try:
            audio_path = media_mod.extract_audio(video_path, work_dir / "audio.wav")
            t.done("audio_extraction", "Mono 16 kHz track extracted")
        except media_mod.MediaError as exc:
            t.fail("audio_extraction", f"{exc} Continuing without speech.")

    # 3. Transcription
    segments: list[dict[str, Any]] = []
    t.start("transcription")
    with SessionLocal() as s:
        existing = s.get(MediaAsset, asset_id) if asset_id else None
        user_edited = bool(existing and existing.transcript_source == "edited")
        if user_edited:
            segments = list(existing.transcript or [])
    if user_edited:
        t.done("transcription", f"Using your edited transcript ({len(segments)} segments)", segments=len(segments))
    elif not audio_path:
        t.skip("transcription", "No audio to transcribe")
    else:
        t.start("transcription", f"faster-whisper '{settings.whisper_model}' on {settings.whisper_device} (first run downloads the model)")
        try:
            segments = tr.transcribe(audio_path)
            with SessionLocal() as s:
                a = s.get(MediaAsset, asset_id)
                a.transcript, a.transcript_source = segments, "whisper"
                s.commit()
            if segments:
                t.done("transcription", f"{len(segments)} speech segments", segments=len(segments))
            else:
                t.skip("transcription", "No speech detected in the audio")
        except tr.TranscriptionUnavailable as exc:
            t.skip("transcription", str(exc))
        except Exception as exc:
            t.fail("transcription", f"Transcription failed ({type(exc).__name__}: {exc}). Continuing without speech.")

    # 4. Frame sampling
    frames: list[dict[str, Any]] = []
    t.start("frame_sampling")
    if not video_path:
        t.skip("frame_sampling", "No video provided")
    else:
        try:
            frame_count = min(frame_samples, max(settings.frame_samples, 1) * 2)
            frames = media_mod.sample_frames(video_path, duration, work_dir / "frames", frame_count, settings.frame_width)
            with SessionLocal() as s:
                a = s.get(MediaAsset, asset_id)
                a.frames = frames
                s.commit()
            t.done("frame_sampling", f"{len(frames)} frames sampled evenly", frames=len(frames))
        except media_mod.MediaError as exc:
            t.fail("frame_sampling", f"{exc} Continuing with text only.")

    # 5. Model interpretation
    t.start("model_interpretation")
    provider = OllamaProvider()
    if not segments and not narration.strip() and not frames:
        msg = "There is no speech, narration or readable frame to interpret."
        t.fail("model_interpretation", msg)
        return _finish(job_id, ok=False, error=msg, project_status="failed")
    status = provider.status(fresh=True)
    if not status.reachable or not status.installed:
        msg = status.error or "Model unavailable."
        t.fail("model_interpretation", msg)
        return _finish(job_id, ok=False, error=f"{msg} You can still build the workflow manually.", project_status="failed")
    sources = build_sources(segments, narration)
    frames_b64: list[str] = []
    if status.vision:
        for f in frames:
            frames_b64.append(base64.b64encode((work_dir / "frames" / f["file"]).read_bytes()).decode("ascii"))
    frame_times = [f["time"] for f in frames]
    t.start(
        "model_interpretation",
        f"{status.model} · {len(frames_b64)} frame(s){'' if status.vision else ' (model has no vision; text only)'} · {len(sources)} source segment(s)",
    )
    try:
        raw = provider.extract(
            sources=sources,
            frames_b64=frames_b64,
            frame_times=frame_times,
            vision=status.vision,
            on_progress=lambda msg: t._set("model_interpretation", detail=msg),
        )
    except (ModelUnavailable, ValueError) as exc:
        t.fail("model_interpretation", str(exc))
        return _finish(job_id, ok=False, error=f"{exc} You can retry, or build the workflow manually.", project_status="failed")
    t.done(
        "model_interpretation",
        f"Two structured passes from {status.model} · {len(frames_b64)} frame(s) · {len(sources)} source segment(s)",
        model=status.model,
        vision=status.vision,
    )

    # 6. Validation
    t.start("validation")
    try:
        definition, notes = normalize(raw, duration=duration, frame_times=frame_times, sources=sources)
    except (MappingFailed, ValueError) as exc:
        msg = f"The model's answer could not be mapped to a supported workflow: {exc}"
        t.fail("validation", msg)
        return _finish(job_id, ok=False, error=msg + " Start from the rental template or a blank workflow and correct it manually.", result={"raw": raw}, project_status="failed")
    defn = WorkflowDefinition.model_validate(definition)
    issues = [i.to_dict() for i in validate(defn)]
    with SessionLocal() as s:
        latest = s.scalars(select(WorkflowVersion).where(WorkflowVersion.project_id == project_id).order_by(WorkflowVersion.version.desc())).first()
        version = (latest.version if latest else 0) + 1
        definition["version"] = version
        wv = WorkflowVersion(project_id=project_id, version=version, definition=definition, source="ai_extraction")
        s.add(wv)
        s.flush()
        record_audit(s, project_id, actor="model", action="extracted", target_kind="workflow", target_id=defn.id,
                     summary=f"{status.model} proposed {len(defn.entities)} entities, {len(defn.rules)} rules, {len(defn.actions)} actions (v{version}).")
        s.commit()
    errors = sum(1 for i in issues if i["severity"] == "error")
    t.done("validation", f"{len(defn.entities)} entities · {len(defn.rules)} rules · {len(notes)} mapping note(s) · {errors} issue(s)",
           entities=len(defn.entities), rules=len(defn.rules), notes=len(notes))
    _finish(job_id, ok=True, result={"notes": notes, "issues": issues, "version": version}, project_status="needs_review")


# --- Compilation ---------------------------------------------------------------------------------


def start_compile(project_id: str, workflow_version_id: str) -> str:
    with SessionLocal() as s:
        job = Job(project_id=project_id, kind="compile", status="queued", stages=new_stages(COMPILE_STAGES))
        s.add(job)
        s.get(Project, project_id).status = "compiling"
        s.commit()
        job_id = job.id
    _compile_pool.submit(_run_compile_safe, job_id, workflow_version_id)
    return job_id


def _run_compile_safe(job_id: str, workflow_version_id: str) -> None:
    try:
        _run_compile(job_id, workflow_version_id)
    except Exception as exc:  # pragma: no cover
        log.error("compile crashed: %s", traceback.format_exc())
        _finish(job_id, ok=False, error=f"Unexpected error: {exc}", project_status="failed")


def _run_compile(job_id: str, workflow_version_id: str) -> None:
    _save(job_id, lambda j, _p: setattr(j, "status", "running"))
    with SessionLocal() as s:
        wv = s.get(WorkflowVersion, workflow_version_id)
        defn = WorkflowDefinition.model_validate(wv.definition)
        project_id = wv.project_id

    def persist(stages) -> None:
        payload = [st.to_dict() for st in stages]
        _save(job_id, lambda j, _p: setattr(j, "stages", payload))

    compiler = Compiler(defn, on_stage=persist)
    try:
        manifest = compiler.compile()
    except CompileError as exc:
        _finish(job_id, ok=False, error=str(exc), result={"issues": [i.to_dict() for i in exc.issues]}, project_status="needs_review")
        return

    slug_holder: dict[str, str] = {}

    def activate() -> tuple[str, dict[str, Any]]:
        with SessionLocal() as s:
            app, created = app_service.activate(s, project_id, workflow_version_id, manifest)
            slug_holder["slug"] = app.slug
            record_audit(s, project_id, actor="compiler", action="compiled", target_kind="application", target_id=app.slug,
                         summary=f"Compiled workflow v{defn.version} into application '{app.name}'.")
            s.commit()
        return (f"Runtime {'created' if created else 'updated'} at /apps/{slug_holder['slug']}", {"slug": slug_holder["slug"]})

    compiler.run_stage("activate_runtime", activate)

    def ready() -> tuple[str, dict[str, Any]]:
        with SessionLocal() as s:
            app = app_service.get_app(s, slug_holder["slug"])
            app_service.AppRuntime(s, app).stats()  # smoke-check: the runtime can load the manifest
        return ("Application is live", {})

    compiler.run_stage("ready", ready)
    _finish(job_id, ok=True, result={"slug": slug_holder["slug"]}, project_status="ready")


# --- Small change requests -----------------------------------------------------------------------

CHANGE_STAGES: list[tuple[str, str]] = [
    ("request_received", "Request received"),
    ("model_interpretation", "Model interpretation"),
    ("apply_changes", "Applying changes"),
    ("validation", "Structured workflow validation"),
]


def start_change(project_id: str, instruction: str) -> str:
    with SessionLocal() as s:
        job = Job(project_id=project_id, kind="change", status="queued", stages=new_stages(CHANGE_STAGES), result={"instruction": instruction})
        s.add(job)
        s.get(Project, project_id).status = "analyzing"
        s.commit()
        job_id = job.id
    _analysis_pool.submit(_run_change_safe, job_id, instruction)
    return job_id


def _run_change_safe(job_id: str, instruction: str) -> None:
    try:
        _run_change(job_id, instruction)
    except Exception as exc:  # pragma: no cover
        log.error("change crashed: %s", traceback.format_exc())
        _finish(job_id, ok=False, error=f"Unexpected error: {exc}", project_status="needs_review")


def _run_change(job_id: str, instruction: str) -> None:
    from ..pipeline import changes

    t = StageTracker(job_id)
    _save(job_id, lambda j, _p: setattr(j, "status", "running"))
    with SessionLocal() as s:
        project_id = s.get(Job, job_id).project_id
        latest = s.scalars(select(WorkflowVersion).where(WorkflowVersion.project_id == project_id).order_by(WorkflowVersion.version.desc())).first()
        base = WorkflowDefinition.model_validate(latest.definition)
        base_version = latest.version
    t.start("request_received")
    t.done("request_received", f"“{instruction}” · based on workflow v{base_version}")

    provider = OllamaProvider()
    t.start("model_interpretation", f"{provider.model} · limited to {changes.MAX_OPS} small operations")
    try:
        answer = provider.propose_change(base, instruction)
    except (ModelUnavailable, ValueError) as exc:
        t.fail("model_interpretation", str(exc))
        return _finish(job_id, ok=False, error=f"{exc} Your workflow was not changed.", project_status="needs_review")
    t.done("model_interpretation", str(answer.get("message") or "Structured answer received")[:300])

    t.start("apply_changes")
    try:
        new_defn, summary = changes.apply(base, answer, instruction)
    except changes.ChangeRejected as exc:
        t.fail("apply_changes", str(exc))
        return _finish(job_id, ok=False, error=str(exc), project_status="needs_review")
    t.done("apply_changes", " ".join(summary)[:600], operations=len(summary))

    t.start("validation")
    errors = [i.to_dict() for i in validate(new_defn) if i.severity == "error"]
    if errors:
        msg = "The change would make the workflow invalid: " + errors[0]["message"]
        t.fail("validation", msg)
        return _finish(job_id, ok=False, error=msg + " Your workflow was not changed.", project_status="needs_review")
    with SessionLocal() as s:
        definition = new_defn.model_dump(mode="json")
        definition["version"] = base_version + 1
        s.add(WorkflowVersion(project_id=project_id, version=base_version + 1, definition=definition, source="change_request"))
        record_audit(s, project_id, actor="model", action="change_request", target_kind="workflow", target_id=new_defn.id,
                     summary=f"Change requested: “{instruction}” → {' '.join(summary)}"[:1000])
        s.commit()
    t.done("validation", f"Workflow v{base_version + 1} ready for review")
    _finish(job_id, ok=True, result={"instruction": instruction, "summary": summary, "version": base_version + 1}, project_status="needs_review")
