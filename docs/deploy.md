# Running Code Your Reality on a server (VPS)

```
Browser ──HTTPS──▶ Caddy / Nginx ──▶ Code Your Reality container
                                     • FastAPI backend + built frontend (one origin)
                                     • FFmpeg + faster-whisper (CPU, int8)
                                     • SQLite + uploads on a volume
                                            │
                                            ▼  HTTPS + API key (server side only)
                                     Ollama Cloud (https://ollama.com)
                                     — or a local Ollama container
```

The local setup (Windows, Vite dev server on :5173, local Ollama) is unchanged. The server setup
uses the same code with a few environment variables.

## 1. Requirements

- A Linux VPS with Docker and the Compose plugin. 2 vCPU / 4 GB RAM is enough with Ollama Cloud and
  the `base` Whisper model; use more for `small`/`medium`.
- A domain name pointing at the server (needed for HTTPS — browsers only allow camera and screen
  recording on HTTPS pages; plain file upload works either way).
- An Ollama Cloud API key (https://ollama.com/settings/keys), or enough CPU/GPU for a local model.

## 2. Configure

```bash
git clone https://github.com/Bmartin2000/code-your-reality.git
cd code-your-reality
cp .env.example .env
nano .env
```

For Ollama Cloud:

```dotenv
OLLAMA_URL=https://ollama.com
OLLAMA_API_KEY=your-key-here
OLLAMA_MODEL=gemma4:31b
# Ollama Cloud may not report model capabilities; set true for a vision model so frames are sent.
OLLAMA_VISION=true
# Ollama Cloud has no structured outputs: auto puts the schema in the prompt and validates/repairs answers.
OLLAMA_STRUCTURED_OUTPUTS=auto

WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8

# Sign-in protects the Studio (and with it Whisper and your Ollama Cloud quota). The first
# account registered at /login is the admin; keep self-registration off on a public server.
ALLOW_SIGNUP=false
COOKIE_SECURE=true   # behind HTTPS (Caddy below)

# Optional: an extra HTTP Basic password in front of everything, e.g. while the server is private.
# BASIC_AUTH_USER=demo
# BASIC_AUTH_PASSWORD=choose-a-long-password
```

**Create the admin right after the first start.** Open `https://your-domain/login`: on an empty
database it asks for the admin account, and the first person to register becomes admin. Then add
colleagues under **Account → Users**. Generated apps stay reachable by their link (they never call
the AI); turn on Team access in an app to require personal keys there too.

Pick `OLLAMA_MODEL` from the models your account lists (`curl -H "Authorization: Bearer $KEY" https://ollama.com/api/tags`).

**Where the key lives:** only in `.env` on the server, which is git-ignored and excluded from the
Docker build context (`.dockerignore`). The backend sends it as `Authorization: Bearer …` to
Ollama; no API response contains it (Settings only shows "API key set on the server"), and the
frontend never sees it.

## 3. Start

```bash
docker compose up -d --build
curl http://localhost:8000/health      # {"status":"ok",...}
docker compose logs -f app
```

Data (database, uploads, frames) is in the `cyr-data` volume; Whisper weights are cached in
`cyr-models` (downloaded on the first transcription, ~145 MB for `base`). To bake them into the
image instead: `docker compose build --build-arg WHISPER_PRELOAD=base`.

### Local Ollama on the server instead of the cloud

```bash
# in .env: OLLAMA_URL=http://ollama:11434  (and no OLLAMA_API_KEY)
docker compose --profile local-ollama up -d --build
docker compose exec ollama ollama pull gemma4:e4b
```

## 4. HTTPS with Caddy

`/etc/caddy/Caddyfile`:

```
demo.example.com {
    reverse_proxy 127.0.0.1:8000
    request_body {
        max_size 210MB
    }
}
```

Then `systemctl reload caddy`. Caddy obtains the certificate automatically. Keep port 8000 closed
to the outside (bind it to localhost with `APP_PORT=127.0.0.1:8000` in `.env`, or use a firewall).

## 5. Operate

- **Health check:** `GET /health` (also `/api/health`). It never calls the model. Docker's
  `HEALTHCHECK` uses it.
- **Engine status:** Studio → Account → AI engine shows whether the model server is reachable, the
  model is available, and whether a key is configured.
- **Update:** `git pull && docker compose up -d --build`.
- **Backup:** `docker run --rm -v code-your-reality_cyr-data:/data -v $PWD:/backup busybox tar czf /backup/cyr-data.tgz -C /data .`

## Limits to keep in mind

- One container, one worker: rule checks use an in-process lock, and SQLite is the database. That's
  right for a demo or a single business; scale-out needs Postgres and database-level locking.
- With Ollama Cloud, the transcript and the sampled still frames (6, or 12 on Plus) are sent to
  Ollama for analysis; the video file itself stays on the server. The UI states this when a cloud
  model is configured.
- Payment is not connected (demo checkout).
