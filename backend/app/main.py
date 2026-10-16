"""Reality Compiler API."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import apps, projects
from .config import get_settings
from .db import init_db
from .pipeline.media import ALLOWED_EXTENSIONS, ffmpeg_exe
from .pipeline.model import OllamaProvider
from .pipeline.transcribe import whisper_installed
from .services.jobs import mark_interrupted_jobs
from .workflow.runtime import RuntimeErrorBase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    mark_interrupted_jobs()
    yield


app = FastAPI(title="Reality Compiler API", version="1.0.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


def _error(status: int, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"message": message, **extra}})


@app.exception_handler(RuntimeErrorBase)
async def runtime_error(_req: Request, exc: RuntimeErrorBase) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.to_dict()})


@app.exception_handler(HTTPException)
async def http_error(_req: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        detail = dict(exc.detail)
        return _error(exc.status_code, str(detail.pop("message", "Request failed.")), **detail)
    return _error(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(_req: Request, exc: RequestValidationError) -> JSONResponse:
    details = [{"loc": list(e.get("loc", [])), "msg": e.get("msg")} for e in exc.errors()]
    return _error(422, "The request is not valid.", details=details)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/system/capabilities")
def capabilities(refresh: bool = False) -> dict[str, Any]:
    exe, source = ffmpeg_exe()
    model = OllamaProvider().status(fresh=refresh).to_dict()
    model.pop("available_models", None)
    return {
        "ffmpeg": {"available": exe is not None, "source": source},
        "transcription": {"engine": "faster-whisper", "installed": whisper_installed(), "enabled": settings.whisper_enabled, "model": settings.whisper_model},
        "model": model,
        "limits": {"max_upload_mb": settings.max_upload_mb, "max_video_seconds": settings.max_video_seconds, "formats": sorted(ALLOWED_EXTENSIONS), "frame_samples": settings.frame_samples},
    }


app.include_router(projects.router)
app.include_router(apps.router)
