"""Media handling: upload validation, probing, audio extraction and frame sampling via FFmpeg.

FFmpeg is resolved from RC_FFMPEG_PATH, then PATH, then the binary bundled with imageio-ffmpeg.
FFmpeg is only ever invoked with argument lists (never a shell) and server-generated paths.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings

ALLOWED_EXTENSIONS = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}


class MediaError(Exception):
    pass


def sniff_container(head: bytes) -> str | None:
    """Identify the container from magic bytes, independent of the client-provided name/type."""
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        return "quicktime" if brand == b"qt  " else "mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "matroska"  # WebM is a Matroska profile
    return None


def safe_extension(filename: str, container: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext
    return {"mp4": ".mp4", "quicktime": ".mov", "matroska": ".webm"}[container]


def ffmpeg_exe() -> tuple[str | None, str]:
    settings = get_settings()
    if settings.ffmpeg_path and Path(settings.ffmpeg_path).exists():
        return settings.ffmpeg_path, "RC_FFMPEG_PATH"
    found = shutil.which("ffmpeg")
    if found:
        return found, "PATH"
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe(), "imageio-ffmpeg"
    except Exception:
        return None, "unavailable"


def _run(args: list[str], timeout: int = 300) -> subprocess.CompletedProcess[str]:
    exe, _ = ffmpeg_exe()
    if not exe:
        raise MediaError("FFmpeg is not available. Install FFmpeg or the imageio-ffmpeg package.")
    return subprocess.run(
        [exe, "-hide_banner", "-nostdin", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


@dataclass
class ProbeResult:
    duration: float | None
    has_audio: bool
    has_video: bool


_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")


def _hms(m: re.Match[str]) -> float:
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def probe(path: Path) -> ProbeResult:
    proc = _run(["-i", str(path)], timeout=60)
    err = proc.stderr
    has_video = bool(re.search(r"Stream #.*Video:", err))
    has_audio = bool(re.search(r"Stream #.*Audio:", err))
    m = _DURATION_RE.search(err)
    duration = _hms(m) if m else None
    if duration is None and has_video:
        # Browser recordings (MediaRecorder WebM) often carry no duration header: decode to measure.
        full = _run(["-i", str(path), "-map", "0:v:0", "-f", "null", "-"], timeout=300)
        times = list(_TIME_RE.finditer(full.stderr))
        duration = _hms(times[-1]) if times else None
    return ProbeResult(duration=duration, has_audio=has_audio, has_video=has_video)


def extract_audio(path: Path, out: Path) -> Path:
    proc = _run(["-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(out)])
    if proc.returncode != 0 or not out.exists() or out.stat().st_size < 1024:
        raise MediaError("Audio could not be extracted from this recording.")
    return out


def sample_frames(path: Path, duration: float | None, out_dir: Path, count: int, width: int) -> list[dict[str, float | int | str]]:
    """Grab ``count`` evenly spaced frames. Bounded on purpose: frames are the costliest model input."""
    out_dir.mkdir(parents=True, exist_ok=True)
    dur = duration or 0.0
    times = [round((i + 0.5) * dur / count, 2) for i in range(count)] if dur > 0 else [0.0]
    frames: list[dict[str, float | int | str]] = []
    for i, t in enumerate(times):
        target = out_dir / f"frame_{i:02d}.jpg"
        proc = _run(["-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(target)], timeout=120)
        if proc.returncode == 0 and target.exists() and target.stat().st_size > 0:
            frames.append({"index": len(frames), "time": t, "file": target.name})
    if not frames:
        raise MediaError("No frames could be read from this video.")
    return frames
