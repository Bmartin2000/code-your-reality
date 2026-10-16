"""Speech transcription with faster-whisper (optional dependency)."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from ..config import get_settings

_model = None
_model_lock = threading.Lock()


class TranscriptionUnavailable(Exception):
    pass


def whisper_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("faster_whisper") is not None


def _get_model():
    global _model
    settings = get_settings()
    if not settings.whisper_enabled:
        raise TranscriptionUnavailable("Transcription is disabled (RC_WHISPER_ENABLED=false).")
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover - depends on environment
        raise TranscriptionUnavailable("faster-whisper is not installed.") from exc
    with _model_lock:
        if _model is None:
            # First use downloads the model weights from Hugging Face into the local cache.
            _model = WhisperModel(settings.whisper_model, device=settings.whisper_device, compute_type=settings.whisper_compute_type)
        return _model


def _load_wav(path: Path):
    """Read the 16 kHz mono PCM WAV produced by FFmpeg into float32 samples.

    Passing samples (instead of a path) avoids faster-whisper's PyAV decoding path, whose
    keyword arguments differ across PyAV releases.
    """
    import wave

    import numpy as np

    with wave.open(str(path), "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            raise ValueError("Expected 16-bit mono PCM audio.")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe(audio_path: Path) -> list[dict[str, Any]]:
    model = _get_model()
    segments, _info = model.transcribe(_load_wav(audio_path), vad_filter=True, beam_size=1)
    out = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            out.append({"start": round(float(seg.start), 2), "end": round(float(seg.end), 2), "text": text[:600]})
        if len(out) >= 400:
            break
    return out
