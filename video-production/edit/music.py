"""Original score + sound effects for the launch film, synthesised from scratch (no samples, no licences).

Arc (seconds, matches edit/timeline.py): mysterious and playful → rising tension → a held breath at the
realisation → airy "system assembling" arpeggio → confident product pulse → crescendo → resolved chord.
Writes audio/music.wav (48 kHz stereo) and audio/sfx.wav.
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from timeline import CUES, TOTAL  # noqa: E402

SR = 48000
OUT = Path(__file__).resolve().parent.parent / "audio"
rng = np.random.default_rng(7)


def t_axis(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def note(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n: int, a: float, r: float) -> np.ndarray:
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def pluck(freq: float, dur: float, bright: float = 0.5) -> np.ndarray:
    """Karplus–Strong plucked string."""
    n = int(dur * SR)
    period = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = (0.5 + bright * 0.49) * buf[i % period] + (0.5 - bright * 0.49) * buf[(i + 1) % period]
    return out * env(n, 0.002, min(dur * 0.6, 0.4))


def tone(freq: float, dur: float, kind: str = "sine", a: float = 0.01, r: float = 0.3) -> np.ndarray:
    t = t_axis(dur)
    if kind == "sine":
        w = np.sin(2 * np.pi * freq * t)
    elif kind == "tri":
        w = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * freq * t))
    else:  # soft saw (few harmonics)
        w = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, 7))
    return w * env(len(t), a, r)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def place(track: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    i = int(at * SR)
    if i >= track.shape[0]:
        return
    clip = clip[: track.shape[0] - i]
    track[i : i + len(clip), 0] += clip * gain * (1 - max(0, pan))
    track[i : i + len(clip), 1] += clip * gain * (1 + min(0, pan))


def reverb(x: np.ndarray, mix: float = 0.25) -> np.ndarray:
    y = x.copy()
    for d, g in ((0.031, 0.5), (0.047, 0.42), (0.071, 0.35), (0.113, 0.28), (0.173, 0.2), (0.257, 0.14)):
        k = int(d * SR)
        y[k:] += x[:-k] * g * mix * 2
    return y


def build_music() -> np.ndarray:
    m = np.zeros((int(TOTAL * SR) + SR, 2))
    c = CUES

    # 1. Mystery: low drone + sparse playful pizzicato in A minor.
    dur = c["tension"] - 0
    t = t_axis(dur)
    drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.4 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.08 * t))
    place(m, drone * env(len(t), 3.0, 2.0) * 0.12, 0)
    motif = [69, 72, 76, 74, 72, 69, 71, 67]
    beat = 60 / 92
    i = 0
    tt = 1.5
    while tt < c["tension"] - 1:
        place(m, pluck(note(motif[i % len(motif)]), 0.6), tt, 0.16, pan=0.4 if i % 2 else -0.4)
        tt += beat * (2 if i % 3 == 2 else 1)
        i += 1

    # 2. Tension: ticking, pulse and rising pad until the held breath.
    start, end = c["tension"], c["breath"]
    beat = 60 / 100
    k = 0
    tt = start
    while tt < end:
        prog = (tt - start) / (end - start)
        hat = rng.uniform(-1, 1, int(0.03 * SR)) * env(int(0.03 * SR), 0.001, 0.025)
        place(m, hat, tt, 0.05 + 0.08 * prog, pan=0.3)
        if k % 2 == 0:
            place(m, tone(55, 0.35, "sine", 0.005, 0.3), tt, 0.25 + 0.15 * prog)
        if prog > 0.4 and k % 2 == 1:
            place(m, pluck(note(57 + (k // 2) % 3 * 3), 0.3, 0.7), tt, 0.1, pan=-0.3)
        tt += beat / (2 if prog > 0.5 else 1)
        k += 1
    padlen = end - start
    t = t_axis(padlen)
    rise = sum(np.sin(2 * np.pi * note(n) * t) for n in (57, 60, 64)) / 3
    place(m, lowpass(rise * (t / padlen) ** 2, 1200) * 0.18, start)

    # 3. Held breath, then a reverse swell into the generation.
    sw = t_axis(1.6)
    swell = rng.uniform(-1, 1, len(sw)) * (sw / 1.6) ** 3
    place(m, lowpass(swell, 3000) * 0.25, c["generate"] - 1.6)

    # 4. Generation: airy major arpeggio (C major / A minor relative) with a soft pad.
    start, end = c["generate"], c["product"]
    arp = [60, 64, 67, 71, 72, 71, 67, 64]
    step = 60 / 112 / 2
    tt, k = start, 0
    while tt < end:
        place(m, tone(note(arp[k % 8] + 12), 0.5, "tri", 0.004, 0.45), tt, 0.07, pan=0.5 * np.sin(k))
        tt += step
        k += 1
    t = t_axis(end - start)
    pad = sum(np.sin(2 * np.pi * note(n) * t) for n in (48, 55, 60, 64)) / 4
    place(m, pad * env(len(t), 2.0, 1.0) * 0.14, start)

    # 5. Product: confident pulse at 112 bpm, bass, arpeggio, pad.
    start, end = c["product"], c["transform"]
    beat = 60 / 112
    chords = [(45, 57, 60, 64), (41, 53, 57, 60), (48, 55, 60, 64), (43, 55, 59, 62)]  # Am F C G
    tt, k = start, 0
    while tt < end:
        bar = int((tt - start) / (4 * beat)) % 4
        root = chords[bar][0]
        kick = np.sin(2 * np.pi * np.cumsum(np.linspace(110, 45, int(0.25 * SR))) / SR) * env(int(0.25 * SR), 0.001, 0.2)
        if k % 4 in (0, 2):
            place(m, kick, tt, 0.35)
        if k % 4 in (1, 3):
            snap = rng.uniform(-1, 1, int(0.08 * SR)) * env(int(0.08 * SR), 0.001, 0.07)
            place(m, lowpass(snap, 5000), tt, 0.06)
        place(m, tone(note(root), beat * 0.9, "saw", 0.01, 0.2), tt, 0.06)
        for j in range(2):
            place(m, tone(note(chords[bar][1 + (k * 2 + j) % 3] + 12), beat / 2, "tri", 0.003, 0.2), tt + j * beat / 2, 0.05, pan=0.4 if j else -0.4)
        tt += beat
        k += 1
    t = t_axis(end - start)
    pad = sum(np.sin(2 * np.pi * note(n) * t) for n in (57, 60, 64)) / 3
    place(m, pad * env(len(t), 1.5, 1.5) * 0.08, start)

    # 6. Transformation crescendo into the morph.
    start, end = c["transform"], c["endcard"]
    t = t_axis(end - start)
    cres = sum(np.sin(2 * np.pi * note(n) * t) + 0.3 * np.sin(4 * np.pi * note(n) * t) for n in (48, 55, 60, 64, 67)) / 5
    place(m, lowpass(cres * (0.3 + 0.7 * (t / t[-1]) ** 1.5), 2500) * env(len(t), 1.0, 0.8) * 0.22, start)
    for hit in (start, start + 5, start + 10):
        boom = np.sin(2 * np.pi * np.cumsum(np.linspace(90, 35, int(0.9 * SR))) / SR) * env(int(0.9 * SR), 0.002, 0.8)
        place(m, boom, hit, 0.35)

    # 7. Resolution: one warm chord and silence.
    t = t_axis(TOTAL - c["endcard"] + 0.5)
    chord = sum(np.sin(2 * np.pi * note(n) * t) for n in (48, 55, 60, 64, 72)) / 5
    place(m, chord * env(len(t), 0.05, 3.5) * 0.3, c["endcard"])

    m = reverb(m, 0.3)
    return m


def build_sfx() -> np.ndarray:
    s = np.zeros((int(TOTAL * SR) + SR, 2))
    for at in CUES["whooshes"]:
        n = int(0.9 * SR)
        noise = rng.uniform(-1, 1, n)
        sweep = lowpass(noise * np.hanning(n), 1800)
        place(s, sweep, at - 0.45, 0.5)
    # Creature: soft "boing" chirps when it appears and dives.
    for at in CUES["creature"]:
        n = int(0.25 * SR)
        f = np.linspace(520, 880, n)
        place(s, np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.005, 0.2), at, 0.12)
    # Logo transformation shimmer: rising bell partials.
    at = CUES["morph"]
    for j, n in enumerate((84, 88, 91, 96, 100)):
        place(s, tone(note(n), 1.6, "sine", 0.002, 1.4), at + j * 0.12, 0.06, pan=(-1) ** j * 0.5)
    # End stinger: click + bell.
    click = rng.uniform(-1, 1, int(0.01 * SR)) * env(int(0.01 * SR), 0.0005, 0.008)
    place(s, click, CUES["endcard"], 0.4)
    place(s, tone(note(84), 2.5, "sine", 0.002, 2.3), CUES["endcard"], 0.08)
    return reverb(s, 0.25)


def write(path: Path, data: np.ndarray) -> None:
    data = data / max(1e-6, np.abs(data).max()) * 0.89
    pcm = (data * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    write(OUT / "music.wav", build_music())
    write(OUT / "sfx.wav", build_sfx())
    print("music.wav and sfx.wav written")
