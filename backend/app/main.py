"""Code Your Reality API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
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
from .services.auth import require_user, session_token, test_plan_for_token
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
# Frontends may be hosted on any origin. Requests authenticate with a header (bearer token or app key),
# never an ambient credential, so any origin may call the API and allow_credentials stays off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-App-Key"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


class ETagMiddleware:
    """Small JSON GET answers get an ETag; a repeated poll with If-None-Match gets a body-less 304.
    Keeps status polling cheap on small hosting plans."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "GET" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        start: dict | None = None
        body = bytearray()
        passthrough = False

        async def capture(message):
            nonlocal start, passthrough
            if passthrough:
                return await send(message)
            if message["type"] == "http.response.start":
                ctype = dict(message.get("headers") or []).get(b"content-type", b"")
                if message["status"] != 200 or not ctype.startswith(b"application/json"):
                    passthrough = True
                    return await send(message)
                start = message
                return None
            body.extend(message.get("body", b""))
            if message.get("more_body"):
                return None
            tag = '"' + hashlib.sha1(bytes(body)).hexdigest()[:20] + '"'
            client = dict(scope["headers"]).get(b"if-none-match", b"").decode("latin-1")
            headers = [(k, v) for k, v in start["headers"] if k not in (b"content-length", b"etag", b"cache-control")]
            headers += [(b"etag", tag.encode()), (b"cache-control", b"private, no-cache")]
            if client == tag:
                await send({"type": "http.response.start", "status": 304, "headers": [(k, v) for k, v in headers if k != b"content-type"]})
                return await send({"type": "http.response.body", "body": b""})
            await send({**start, "headers": headers + [(b"content-length", str(len(body)).encode())]})
            return await send({"type": "http.response.body", "body": bytes(body)})

        return await self.app(scope, receive, capture)


app.add_middleware(ETagMiddleware)


# Optional HTTP Basic auth for a public demo server. /health stays open for load balancers.
if settings.basic_auth_user and settings.basic_auth_password:
    _expected = base64.b64encode(f"{settings.basic_auth_user}:{settings.basic_auth_password.get_secret_value()}".encode()).decode()

    @app.middleware("http")
    async def basic_auth(request: Request, call_next):
        if request.url.path == "/health" or request.method == "OPTIONS":  # CORS preflights carry no credentials
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
            token = session_token(HTTPConnection(scope))
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
app.include_router(projects.media_router)
app.include_router(apps.router)
app.include_router(account.router)


# --- Built frontend (single-origin deployment, e.g. the Docker image) -------------------------------

_dist = settings.frontend_dist
if _dist and (Path(_dist) / "index.html").is_file():
    _dist = Path(_dist).resolve()
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")
    # The build uses relative asset paths (base './') so it also runs from a subfolder. Served from here,
    # deep links like /studio/projects/1 need <base href="/"> to resolve ./assets against the root.
    _index_html = (_dist / "index.html").read_text(encoding="utf-8").replace("<head>", '<head><base href="/">', 1)

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path.startswith("api/"):
            raise HTTPException(404, "Not found.")
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_dist):
            return FileResponse(candidate)
        return HTMLResponse(_index_html)  # client-side routes (/studio, /apps/...)

