"""Code Your Reality API."""

from __future__ import annotations

import base64
import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.requests import HTTPConnection

from .api import account, apps, auth, projects
from .config import get_settings
from .db import init_db
from .pipeline.media import ALLOWED_EXTENSIONS, ffmpeg_exe
from .pipeline.model import OllamaProvider
from .pipeline.transcribe import whisper_installed
from .services.jobs import mark_interrupted_jobs
from .services import plans
from .services.auth import COOKIE, require_user, test_plan_for_token
from .services.plans import ensure_account
from .workflow.runtime import RuntimeErrorBase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    ensure_account()
    mark_interrupted_jobs()
    yield


app = FastAPI(title="Code Your Reality API", version="1.0.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-App-Key"],
)


# Optional HTTP Basic auth for a public demo server. /health stays open for load balancers.
if settings.basic_auth_user and settings.basic_auth_password:
    _expected = base64.b64encode(f"{settings.basic_auth_user}:{settings.basic_auth_password.get_secret_value()}".encode()).decode()

    @app.middleware("http")
    async def basic_auth(request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        header = request.headers.get("authorization", "")
        if not (header.startswith("Basic ") and hmac.compare_digest(header[6:], _expected)):
            return Response("Authentication required.", status_code=401, headers={"WWW-Authenticate": 'Basic realm="Code Your Reality"'})
        return await call_next(request)


class TestPlanMiddleware:
    """Subscription Test Mode: for API requests from the founding Super Admin's session, every plan
    check in this request uses the chosen test plan (plans.TEST_PLAN). Nobody else is affected."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/api/"):
            token = HTTPConnection(scope).cookies.get(COOKIE)
            plan = await run_in_threadpool(test_plan_for_token, token) if token else None
            if plan:
                reset = plans.TEST_PLAN.set(plan)
                try:
                    return await self.app(scope, receive, send)
                finally:
                    plans.TEST_PLAN.reset(reset)
        return await self.app(scope, receive, send)


app.add_middleware(TestPlanMiddleware)


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


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check for Docker, load balancers and uptime monitors. Never calls the model."""
    return {"status": "ok", "service": "code-your-reality", "version": app.version}


@app.get("/api/system/capabilities", dependencies=[Depends(require_user)])
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


app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(apps.router)
app.include_router(account.router)


# --- Built frontend (single-origin deployment, e.g. the Docker image) -------------------------------

_dist = settings.frontend_dist
if _dist and (Path(_dist) / "index.html").is_file():
    _dist = Path(_dist).resolve()
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "Not found.")
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_dist):
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")  # client-side routes (/studio, /apps/...)

