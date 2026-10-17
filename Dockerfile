# syntax=docker/dockerfile:1
#
# Code Your Reality — one container: FastAPI backend + faster-whisper (CPU, int8) + FFmpeg,
# serving the built React frontend from the same origin.
# The AI model is reached over HTTP: local Ollama or Ollama Cloud (OLLAMA_URL / OLLAMA_API_KEY).

# --- 1. Build the frontend -------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Backend runtime ----------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/static \
    HF_HOME=/app/hf-cache \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8

# FFmpeg for audio extraction and frame sampling; curl for the health check.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY --from=web /web/dist ./static

# Optional: bake the Whisper weights into the image (docker build --build-arg WHISPER_PRELOAD=base .)
ARG WHISPER_PRELOAD=""
RUN if [ -n "$WHISPER_PRELOAD" ]; then \
      python -c "from faster_whisper import WhisperModel; WhisperModel('$WHISPER_PRELOAD', device='cpu', compute_type='int8')"; \
    fi

RUN useradd --create-home --uid 1000 cyr && mkdir -p /data /app/hf-cache && chown -R cyr:cyr /data /app/hf-cache
USER cyr

VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# --proxy-headers: correct scheme/host behind Caddy, Nginx or Traefik.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
