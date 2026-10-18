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

    # HTTP
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
