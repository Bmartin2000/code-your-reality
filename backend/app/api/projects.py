"""Projects, media, analysis, workflow review and compilation endpoints."""

from __future__ import annotations

import shutil
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import AuditEvent, GeneratedApp, Job, MediaAsset, Project, WorkflowVersion, get_session, utcnow
from ..pipeline.media import ALLOWED_EXTENSIONS, safe_extension, sniff_container
from ..services import access, jobs, plans
from ..services.audit import record_audit, review_diff
from ..workflow.sample import SAMPLE_SCENES, SAMPLE_TRANSCRIPT, SAMPLE_NARRATION_TITLE, blank_definition, rental_definition
from ..workflow.schema import WorkflowDefinition
from ..workflow.validation import review_summary, validate

router = APIRouter(prefix="/api")


# --- serialization -------------------------------------------------------------------------------


def _latest_workflow(s: Session, project_id: str) -> WorkflowVersion | None:
    return s.scalars(select(WorkflowVersion).where(WorkflowVersion.project_id == project_id).order_by(WorkflowVersion.version.desc())).first()


def _media_dict(a: MediaAsset) -> dict[str, Any]:
    return {
        "id": a.id,
        "original_name": a.original_name,
        "content_type": a.content_type,
        "size_bytes": a.size_bytes,
        "duration_seconds": a.duration_seconds,
        "has_audio": a.has_audio,
        "transcript": a.transcript or [],
        "transcript_source": a.transcript_source,
        "frames": [{"index": f["index"], "time": f["time"], "url": f"/api/media/{a.id}/frames/{f['index']}"} for f in (a.frames or [])],
        "url": f"/api/media/{a.id}/file",
        "created_at": a.created_at.isoformat(),
    }


def _job_dict(j: Job | None) -> dict[str, Any] | None:
    if not j:
        return None
    return {
        "id": j.id,
        "project_id": j.project_id,
        "kind": j.kind,
        "status": j.status,
        "stages": j.stages,
        "result": j.result,
        "error": j.error,
        "created_at": j.created_at.isoformat(),
        "updated_at": j.updated_at.isoformat(),
    }


def _workflow_dict(wv: WorkflowVersion | None) -> dict[str, Any] | None:
    if not wv:
        return None
    try:
        defn = WorkflowDefinition.model_validate(wv.definition)
        issues = [i.to_dict() for i in validate(defn, for_compile=True)]
        summary = review_summary(defn)
    except ValidationError as exc:
        issues = [{"severity": "error", "message": str(exc), "target_kind": "workflow", "target_id": "schema"}]
        summary = {"pending": 0, "accepted": 0, "rejected": 0}
    return {
        "id": wv.id,
        "version": wv.version,
        "source": wv.source,
        "approved": wv.approved_at is not None,
        "approved_at": wv.approved_at.isoformat() if wv.approved_at else None,
        "definition": wv.definition,
        "issues": issues,
        "review": summary,
        "created_at": wv.created_at.isoformat(),
    }


def _project_summary(s: Session, p: Project) -> dict[str, Any]:
    wv = _latest_workflow(s, p.id)
    app = s.scalars(select(GeneratedApp).where(GeneratedApp.project_id == p.id)).first()
    media = p.media[-1] if p.media else None
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "origin": p.origin,
        "status": p.status,
        "workflow_version": wv.version if wv else None,
        "workflow_name": wv.definition.get("name") if wv else None,
        "app_slug": app.slug if app else None,
        "media_name": media.original_name if media else None,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def _project_detail(s: Session, p: Project) -> dict[str, Any]:
    out = _project_summary(s, p)
    latest_job = {kind: s.scalars(select(Job).where(Job.project_id == p.id, Job.kind == kind).order_by(Job.created_at.desc())).first() for kind in ("analysis", "compile", "change")}
    out.update(
        {
            "narration": p.narration,
            "media": _media_dict(p.media[-1]) if p.media else None,
            "workflow": _workflow_dict(_latest_workflow(s, p.id)),
            "analysis_job": _job_dict(latest_job["analysis"]),
            "compile_job": _job_dict(latest_job["compile"]),
            "change_job": _job_dict(latest_job["change"]),
            "app_owner_key": _owner_key(s, p.id),
            "sample_source": {"title": SAMPLE_NARRATION_TITLE, "transcript": SAMPLE_TRANSCRIPT, "scenes": SAMPLE_SCENES, "duration": 60} if p.origin == "sample" else None,
        }
    )
    return out


def _owner_key(s: Session, project_id: str) -> str | None:
    app = s.scalars(select(GeneratedApp).where(GeneratedApp.project_id == project_id)).first()
    return access.owner_key(s, app) if app else None


def _get_project(s: Session, project_id: str) -> Project:
    p = s.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found.")
    return p


# --- projects ------------------------------------------------------------------------------------


class CreateProject(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    narration: str = Field(default="", max_length=8000)


class CreateManual(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    template: Literal["rental", "blank"] = "blank"


class PatchProject(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    narration: str | None = Field(default=None, max_length=8000)


@router.get("/projects")
def list_projects(s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [_project_summary(s, p) for p in s.scalars(select(Project).order_by(Project.updated_at.desc()))]


@router.post("/projects", status_code=201)
def create_project(body: CreateProject, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = Project(name=body.name, narration=body.narration, origin="analysis", status="draft")
    s.add(p)
    s.commit()
    return _project_detail(s, p)


@router.post("/projects/sample", status_code=201)
def create_sample(s: Session = Depends(get_session)) -> dict[str, Any]:
    p = Project(
        name="Equipment Rental — guided sample",
        description="Predefined example workflow. Not generated by AI.",
        origin="sample",
        status="needs_review",
        narration="\n".join(seg["text"] for seg in SAMPLE_TRANSCRIPT),
    )
    s.add(p)
    s.flush()
    s.add(WorkflowVersion(project_id=p.id, version=1, definition=WorkflowDefinition.model_validate(rental_definition(mode="sample")).model_dump(mode="json"), source="sample"))
    record_audit(s, p.id, actor="system", action="loaded", target_kind="workflow", target_id="equipment_rental", summary="Loaded the predefined equipment rental sample (example data, not an AI result).")
    s.commit()
    return _project_detail(s, p)


@router.post("/projects/manual", status_code=201)
def create_manual(body: CreateManual, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = Project(name=body.name, origin="manual", status="needs_review")
    s.add(p)
    s.flush()
    if body.template == "rental":
        defn = rental_definition(mode="template")
        defn["name"] = body.name
    else:
        defn = blank_definition(body.name)
    s.add(WorkflowVersion(project_id=p.id, version=1, definition=WorkflowDefinition.model_validate(defn).model_dump(mode="json"), source="template" if body.template == "rental" else "blank"))
    record_audit(s, p.id, actor="system", action="created", target_kind="workflow", target_id=defn["id"], summary=f"Started from the {'equipment rental template' if body.template == 'rental' else 'blank workflow'}.")
    s.commit()
    return _project_detail(s, p)


@router.post("/projects/{project_id}/manual", status_code=201)
def convert_to_manual(project_id: str, body: CreateManual, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Recover from a failed or unavailable analysis by starting a workflow by hand in the same project."""
    p = _get_project(s, project_id)
    latest = _latest_workflow(s, p.id)
    defn = rental_definition(mode="template") if body.template == "rental" else blank_definition(body.name)
    defn["name"] = body.name
    defn["version"] = (latest.version if latest else 0) + 1
    s.add(WorkflowVersion(project_id=p.id, version=defn["version"], definition=WorkflowDefinition.model_validate(defn).model_dump(mode="json"), source="template" if body.template == "rental" else "blank"))
    p.status = "needs_review"
    record_audit(s, p.id, action="created", target_kind="workflow", target_id=defn["id"], summary=f"Switched to manual definition ({'rental template' if body.template == 'rental' else 'blank'}).")
    s.commit()
    return _project_detail(s, p)


@router.get("/projects/{project_id}")
def get_project(project_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    return _project_detail(s, _get_project(s, project_id))


@router.patch("/projects/{project_id}")
def patch_project(project_id: str, body: PatchProject, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    if body.name is not None:
        p.name = body.name
    if body.narration is not None:
        p.narration = body.narration
    s.commit()
    return _project_detail(s, p)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, s: Session = Depends(get_session)) -> None:
    p = _get_project(s, project_id)
    for app in s.scalars(select(GeneratedApp).where(GeneratedApp.project_id == p.id)):
        s.delete(app)
    s.delete(p)
    s.commit()
    shutil.rmtree(get_settings().uploads_dir / project_id, ignore_errors=True)


# --- media ---------------------------------------------------------------------------------------


@router.post("/projects/{project_id}/media", status_code=201)
async def upload_media(project_id: str, file: UploadFile = File(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    settings = get_settings()
    p = _get_project(s, project_id)
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "Wait for the running job to finish before replacing the recording.")
    head = await file.read(64)
    container = sniff_container(head)
    if not container:
        raise HTTPException(415, f"Unsupported file. Upload a video in one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}.")
    ext = safe_extension(file.filename or "", container)
    limit = settings.max_upload_mb * 1024 * 1024
    project_dir = settings.uploads_dir / p.id
    project_dir.mkdir(parents=True, exist_ok=True)
    # The stored name is generated server-side; the client's filename is only kept as display metadata.
    asset = MediaAsset(project_id=p.id, original_name=(file.filename or "recording")[-200:], stored_name="", content_type=ALLOWED_EXTENSIONS[ext], size_bytes=0)
    s.add(asset)
    s.flush()
    asset.stored_name = f"{asset.id}{ext}"
    target = project_dir / asset.stored_name
    size = len(head)
    try:
        with target.open("wb") as out:
            out.write(head)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"The file is larger than {settings.max_upload_mb} MB.")
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        s.rollback()
        raise
    asset.size_bytes = size
    for old in list(p.media):
        if old.id != asset.id:
            (project_dir / old.stored_name).unlink(missing_ok=True)
            s.delete(old)
    shutil.rmtree(project_dir / "work", ignore_errors=True)
    p.status = "uploaded"
    s.commit()
    s.refresh(p)
    return _project_detail(s, p)


@router.delete("/projects/{project_id}/media", status_code=200)
def delete_media(project_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "Wait for the running job to finish.")
    project_dir = get_settings().uploads_dir / p.id
    for m in list(p.media):
        (project_dir / m.stored_name).unlink(missing_ok=True)
        s.delete(m)
    shutil.rmtree(project_dir / "work", ignore_errors=True)
    p.status = "draft"
    s.commit()
    s.refresh(p)
    return _project_detail(s, p)


def _get_media(s: Session, media_id: str) -> MediaAsset:
    m = s.get(MediaAsset, media_id)
    if not m:
        raise HTTPException(404, "Media not found.")
    return m


@router.get("/media/{media_id}/file")
def media_file(media_id: str, s: Session = Depends(get_session)) -> FileResponse:
    m = _get_media(s, media_id)
    path = get_settings().uploads_dir / m.project_id / m.stored_name
    if not path.is_file():
        raise HTTPException(404, "Media file missing.")
    return FileResponse(path, media_type=m.content_type)


@router.get("/media/{media_id}/frames/{index}")
def media_frame(media_id: str, index: int, s: Session = Depends(get_session)) -> FileResponse:
    m = _get_media(s, media_id)
    frame = next((f for f in (m.frames or []) if f["index"] == index), None)
    if not frame:
        raise HTTPException(404, "Frame not found.")
    return FileResponse(get_settings().uploads_dir / m.project_id / "work" / "frames" / frame["file"], media_type="image/jpeg")


class Segment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(max_length=600)


class TranscriptBody(BaseModel):
    segments: list[Segment] = Field(max_length=400)


@router.put("/projects/{project_id}/transcript")
def put_transcript(project_id: str, body: TranscriptBody, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    if not p.media:
        raise HTTPException(400, "Upload a recording first.")
    m = p.media[-1]
    m.transcript = [seg.model_dump() for seg in body.segments if seg.text.strip()]
    m.transcript_source = "edited"
    record_audit(s, p.id, action="edited", target_kind="transcript", target_id=m.id, summary=f"Edited the transcript ({len(m.transcript)} segments).")
    s.commit()
    return _project_detail(s, p)


# --- analysis ------------------------------------------------------------------------------------


@router.post("/projects/{project_id}/analyze", status_code=202)
def analyze(project_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    if p.origin == "sample":
        raise HTTPException(400, "The guided sample uses predefined data and is not analyzed by a model.")
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "A job is already running for this project.")
    if not p.media and not p.narration.strip():
        raise HTTPException(400, "Upload a recording or write a narration first.")
    plans.check_analysis(s)
    job_id = jobs.start_analysis(p.id)
    return _job_dict(s.get(Job, job_id))


@router.get("/jobs/{job_id}")
def get_job(job_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    j = s.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Job not found.")
    s.refresh(j)
    return _job_dict(j)


# --- workflow ------------------------------------------------------------------------------------


class SaveWorkflow(BaseModel):
    definition: dict[str, Any]
    base_version: int


@router.put("/projects/{project_id}/workflow")
def save_workflow(project_id: str, body: SaveWorkflow, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    latest = _latest_workflow(s, p.id)
    if not latest:
        raise HTTPException(400, "This project has no workflow yet.")
    if body.base_version != latest.version:
        raise HTTPException(409, f"The workflow changed elsewhere (now v{latest.version}). Reload to continue.")
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "Wait for the running job to finish.")
    try:
        defn = WorkflowDefinition.model_validate({**body.definition, "version": latest.version + 1})
    except ValidationError as exc:
        raise HTTPException(422, {"message": "The workflow definition is not valid.", "details": exc.errors(include_url=False, include_context=False)}) from None
    new_def = defn.model_dump(mode="json")
    changes = review_diff(latest.definition, new_def)
    if not changes and new_def | {"version": 0} == latest.definition | {"version": 0}:
        return _project_detail(s, p)
    wv = WorkflowVersion(project_id=p.id, version=latest.version + 1, definition=new_def, source="human_edit")
    s.add(wv)
    for ch in changes[:200]:
        record_audit(s, p.id, **ch)
    if p.status in ("verified", "ready", "failed", "uploaded", "draft"):
        p.status = "needs_review"
    p.updated_at = utcnow()
    s.commit()
    return _project_detail(s, p)


class ChangeRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=300)


@router.post("/projects/{project_id}/workflow/change-request", status_code=202)
def change_request(project_id: str, body: ChangeRequest, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Queue a small, model-assisted edit of the current workflow. The result is a new version to review."""
    p = _get_project(s, project_id)
    if not _latest_workflow(s, p.id):
        raise HTTPException(400, "This project has no workflow yet.")
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "A job is already running for this project.")
    job_id = jobs.start_change(p.id, body.instruction.strip())
    return _job_dict(s.get(Job, job_id))


@router.post("/projects/{project_id}/workflow/approve")
def approve_workflow(project_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    wv = _latest_workflow(s, p.id)
    if not wv:
        raise HTTPException(400, "This project has no workflow yet.")
    defn = WorkflowDefinition.model_validate(wv.definition)
    errors = [i.to_dict() for i in validate(defn, for_compile=True) if i.severity == "error"]
    if errors:
        raise HTTPException(422, {"message": f"{len(errors)} issue(s) must be resolved before approval.", "issues": errors})
    wv.approved_at = utcnow()
    p.status = "verified"
    record_audit(s, p.id, action="approved", target_kind="workflow", target_id=defn.id, summary=f"Approved workflow v{wv.version} for compilation.")
    s.commit()
    return _project_detail(s, p)


@router.post("/projects/{project_id}/compile", status_code=202)
def compile_project(project_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    p = _get_project(s, project_id)
    wv = _latest_workflow(s, p.id)
    if not wv or not wv.approved_at:
        raise HTTPException(400, "Approve the latest workflow version before compiling.")
    plans.check_new_app(s, p)
    if p.status in ("analyzing", "compiling"):
        raise HTTPException(409, "A job is already running for this project.")
    job_id = jobs.start_compile(p.id, wv.id)
    return _job_dict(s.get(Job, job_id))


@router.get("/projects/{project_id}/audit")
def get_audit(project_id: str, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    _get_project(s, project_id)
    q = select(AuditEvent).where(AuditEvent.project_id == project_id).order_by(AuditEvent.id.desc()).limit(300)
    return [
        {"id": a.id, "actor": a.actor, "action": a.action, "target_kind": a.target_kind, "target_id": a.target_id, "summary": a.summary, "created_at": a.created_at.isoformat()}
        for a in s.scalars(q)
    ]


@router.get("/projects/{project_id}/workflow/versions")
def list_versions(project_id: str, s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    _get_project(s, project_id)
    q = select(WorkflowVersion).where(WorkflowVersion.project_id == project_id).order_by(WorkflowVersion.version.desc())
    return [{"id": w.id, "version": w.version, "source": w.source, "approved_at": w.approved_at.isoformat() if w.approved_at else None, "created_at": w.created_at.isoformat()} for w in s.scalars(q)]
