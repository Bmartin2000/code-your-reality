"""Runtime configuration, read from environment variables (and an optional .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT.parent / ".env", BACKEND_ROOT / ".env"),
        env_prefix="RC_",
        extra="ignore",
    )

    # Storage
    data_dir: Path = BACKEND_ROOT / "data"
    database_url: str | None = None

    # HTTP
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Upload limits
    max_upload_mb: int = 200
    max_video_seconds: int = 300

    # Media processing
    ffmpeg_path: str | None = None
    frame_samples: int = 6
    frame_width: int = 640

    # Transcription (faster-whisper)
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_enabled: bool = True

    # Model provider (Ollama-compatible)
    ollama_url: str = "http://127.0.0.1:11434"  # 127.0.0.1 avoids slow IPv6 fallback on Windows
    ollama_model: str = "qwen3.5:4b"
    ollama_timeout_seconds: int = 600
    model_temperature: float = 0.1

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.data_dir / 'reality_compiler.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    return settings
