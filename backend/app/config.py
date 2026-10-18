"""Runtime configuration, read from environment variables (and an optional .env file).

Every setting accepts its RC_-prefixed name (RC_OLLAMA_URL). The settings commonly set on a server
also accept the plain names used by Ollama and Docker setups (OLLAMA_URL, OLLAMA_API_KEY,
OLLAMA_MODEL, WHISPER_MODEL, ...). Secrets live only here, on the backend; they are never sent to
the browser.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def env(name: str, *plain: str) -> AliasChoices:
    return AliasChoices(f"RC_{name}", *plain)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT.parent / ".env", BACKEND_ROOT / ".env"),
        extra="ignore",
        populate_by_name=True,
    )

    # Storage
    data_dir: Path = Field(BACKEND_ROOT / "data", validation_alias=env("DATA_DIR", "DATA_DIR"))
    database_url: str | None = Field(None, validation_alias=env("DATABASE_URL"))

    # HTTP server (python -m app.serve). 7413 by default; TLS when both certificate files are set.
    host: str = Field("127.0.0.1", validation_alias=env("HOST", "HOST"))
    port: int = Field(7413, validation_alias=env("PORT", "PORT"))
    ssl_certfile: Path | None = Field(None, validation_alias=env("SSL_CERTFILE", "SSL_CERTFILE"))
    ssl_keyfile: Path | None = Field(None, validation_alias=env("SSL_KEYFILE", "SSL_KEYFILE"))
    # Proxies whose X-Forwarded-Proto/For headers are trusted (when TLS ends at Caddy/nginx).
    forwarded_allow_ips: str = Field("127.0.0.1", validation_alias=env("FORWARDED_ALLOW_IPS", "FORWARDED_ALLOW_IPS"))

    # Browser origins allowed to call the API with cookies (the frontend's own origin(s), comma separated).
    cors_origins: str = Field("http://localhost:5173,http://127.0.0.1:5173", validation_alias=env("CORS_ORIGINS", "CORS_ORIGINS"))
    # Built frontend (Vite dist) to serve from the same origin, e.g. in the Docker image.
    frontend_dist: Path | None = Field(None, validation_alias=env("FRONTEND_DIST", "FRONTEND_DIST"))
    # Optional HTTP Basic auth for a public demo server (everything except /health).
    basic_auth_user: str | None = Field(None, validation_alias=env("BASIC_AUTH_USER", "BASIC_AUTH_USER"))
    basic_auth_password: SecretStr | None = Field(None, validation_alias=env("BASIC_AUTH_PASSWORD", "BASIC_AUTH_PASSWORD"))

    # Studio sign-in. The first registered user becomes admin; after that only admins add users,
    # unless ALLOW_SIGNUP=true opens self-registration.
    allow_signup: bool = Field(False, validation_alias=env("ALLOW_SIGNUP", "ALLOW_SIGNUP"))
    # Force the Secure flag on the session cookie (set it behind an HTTPS reverse proxy).
    cookie_secure: bool = Field(False, validation_alias=env("COOKIE_SECURE", "COOKIE_SECURE"))
    # lax: frontend and API on the same site (default). none: frontend on another site than the API;
    # browsers then require Secure, so it is always sent with Secure (HTTPS only).
    cookie_samesite: Literal["lax", "strict", "none"] = Field("lax", validation_alias=env("COOKIE_SAMESITE", "COOKIE_SAMESITE"))
    cookie_domain: str | None = Field(None, validation_alias=env("COOKIE_DOMAIN", "COOKIE_DOMAIN"))

    # Upload limits
    max_upload_mb: int = Field(200, validation_alias=env("MAX_UPLOAD_MB"))
    max_video_seconds: int = Field(300, validation_alias=env("MAX_VIDEO_SECONDS"))

    # Media processing
    ffmpeg_path: str | None = Field(None, validation_alias=env("FFMPEG_PATH", "FFMPEG_PATH"))
    frame_samples: int = Field(6, validation_alias=env("FRAME_SAMPLES"))
    frame_width: int = Field(640, validation_alias=env("FRAME_WIDTH"))

    # Transcription (faster-whisper, CPU int8 by default)
    whisper_model: str = Field("base", validation_alias=env("WHISPER_MODEL", "WHISPER_MODEL"))
    whisper_device: str = Field("cpu", validation_alias=env("WHISPER_DEVICE", "WHISPER_DEVICE"))
    whisper_compute_type: str = Field("int8", validation_alias=env("WHISPER_COMPUTE_TYPE", "WHISPER_COMPUTE_TYPE"))
    whisper_enabled: bool = Field(True, validation_alias=env("WHISPER_ENABLED", "WHISPER_ENABLED"))

    # Model provider: local Ollama (default) or Ollama Cloud (OLLAMA_URL=https://ollama.com + OLLAMA_API_KEY)
    ollama_url: str = Field("http://127.0.0.1:11434", validation_alias=env("OLLAMA_URL", "OLLAMA_URL"))  # 127.0.0.1 avoids slow IPv6 fallback on Windows
    ollama_api_key: SecretStr | None = Field(None, validation_alias=env("OLLAMA_API_KEY", "OLLAMA_API_KEY"))
    ollama_model: str = Field("gemma4:e4b", validation_alias=env("OLLAMA_MODEL", "OLLAMA_MODEL"))
    # Whether to send video frames: "auto" asks the server (/api/show); set true/false when the server can't say (Ollama Cloud).
    ollama_vision: Literal["auto", "true", "false"] = Field("auto", validation_alias=env("OLLAMA_VISION", "OLLAMA_VISION"))
    # Structured outputs (JSON schema in "format"): auto = on for local Ollama, off for Ollama Cloud, which
    # doesn't support them; then the schema goes into the prompt and answers are validated and repaired.
    ollama_structured_outputs: Literal["auto", "true", "false"] = Field("auto", validation_alias=env("OLLAMA_STRUCTURED_OUTPUTS", "OLLAMA_STRUCTURED_OUTPUTS"))
    ollama_timeout_seconds: int = Field(600, validation_alias=env("OLLAMA_TIMEOUT_SECONDS", "OLLAMA_TIMEOUT_SECONDS"))
    model_temperature: float = Field(0.1, validation_alias=env("MODEL_TEMPERATURE"))

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.data_dir / 'reality_compiler.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def tls_problems(self) -> list[str]:
        if bool(self.ssl_certfile) != bool(self.ssl_keyfile):
            return ["Set both SSL_CERTFILE and SSL_KEYFILE (or neither)."]
        out = []
        for name, path in (("SSL_CERTFILE", self.ssl_certfile), ("SSL_KEYFILE", self.ssl_keyfile)):
            if path and not Path(path).is_file():
                out.append(f"{name} points to {path}, which doesn't exist or isn't readable.")
        return out

    def deployment_warnings(self) -> list[str]:
        out = []
        if self.cookie_samesite == "none" and not (self.ssl_certfile or self.cookie_secure):
            out.append("COOKIE_SAMESITE=none needs HTTPS: serve with SSL_CERTFILE/SSL_KEYFILE or behind an HTTPS proxy with COOKIE_SECURE=true.")
        if "*" in self.cors_origin_list:
            out.append("CORS_ORIGINS=* can't be used with sign-in cookies; list the frontend origin(s) instead.")
        return out

    @property
    def ollama_url_normalized(self) -> str:
        url = self.ollama_url.strip().rstrip("/")
        if not url.startswith(("http://", "https://")):
            url = f"http://{url}"  # OLLAMA_HOST is often given as host:port
        return url.removesuffix("/api")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    return settings
