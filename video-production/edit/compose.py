"""Frame-accurate compositor for the launch film (re-cut 3).

Every move (zooms into the app, push-ins on stills, the end-card animation) is rendered here in Python with
sub-pixel affine transforms on a 2× supersampled canvas and a Lanczos downscale, instead of ffmpeg's
zoompan (which snaps to whole pixels and makes slow moves shake). The app window sits in a fixed frame
with even margins and never moves; only its content zooms.

Segment kinds handled: gen, ui (stage or full-frame), logo, end, said, wipe.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = r"C:\Users\webar\reality-compiler\backend\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
W, H, FPS = 1920, 1080, 24
FONT_SB = str(ROOT / "edit" / "fonts" / "Poppins-SemiBold.ttf")
FONT_RG = str(ROOT / "edit" / "fonts" / "Poppins-Regular.ttf")
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
GRADE = "eq=contrast=1.04:saturation=1.03:gamma=0.98,vignette=angle=PI/5"
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS)]

# The app window on the stage: fixed, centred, even margins (title area above it).
WIN_W, WIN_H = 1440, 810
WIN_X, WIN_Y = (W - WIN_W) // 2, 200
SS = 2  # supersampling factor for transformed content

CYAN = (0, 161, 255)
VIOLET = (124, 77, 255)


# --- io ---------------------------------------------------------------------------------------------------


def frames_from(src: Path, start: float, dur: float, vf: str = "") -> list[np.ndarray]:
    filters = f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}" + (f",{vf}" if vf else "")
    cmd = [FFMPEG, "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur + 0.3:.3f}", "-i", str(src), "-an", "-vf", filters, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H * 3)
    arr = np.frombuffer(raw[: n * W * H * 3], dtype=np.uint8).reshape(n, H, W, 3)
    need = int(round(dur * FPS))
    out = [arr[min(i, n - 1)] for i in range(need)]
    return out


class Writer:
    def __init__(self, out: Path):
        self.p = subprocess.Popen(
            [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", *ENC, str(out)],
            stdin=subprocess.PIPE,
        )

    def write(self, frame: np.ndarray) -> None:
        self.p.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())

    def close(self) -> None:
        self.p.stdin.close()
        if self.p.wait():
            raise SystemExit("encoder failed")


# --- maths ------------------------------------------------------------------------------------------------


def smooth(s: float) -> float:
    s = min(1.0, max(0.0, s))
    return s * s * (3 - 2 * s)


def ease_out(s: float) -> float:
    s = min(1.0, max(0.0, s))
    return 1 - (1 - s) ** 3


def keyframe(focus: list, t: float) -> tuple[float, float, float]:
    if t <= focus[0][0]:
        return focus[0][1:]
    for (t0, *a), (t1, *b) in zip(focus, focus[1:]):
        if t <= t1:
            s = smooth((t - t0) / max(1e-6, t1 - t0))
            return tuple(a[i] + (b[i] - a[i]) * s for i in range(3))
    return focus[-1][1:]


def view(frame: Image.Image, cx: float, cy: float, z: float, out_w: int, out_h: int, crop=(0, 0, W, H)) -> Image.Image:
    """Sub-pixel view of `frame`: centre (cx, cy) in source px, zoom z (1 = the whole crop fills the output)."""
    x0, y0, cw, ch = crop
    hw, hh = cw / (2 * z), ch / (2 * z)
    cx = min(max(cx, x0 + hw), x0 + cw - hw)
    cy = min(max(cy, y0 + hh), y0 + ch - hh)
    ow, oh = out_w * SS, out_h * SS
    k = ow / (cw / z)  # output px per source px
    img = frame.transform((ow, oh), Image.AFFINE, (1 / k, 0, cx - ow / 2 / k, 0, 1 / k, cy - oh / 2 / k), resample=Image.BICUBIC)
    return img.resize((out_w, out_h), Image.LANCZOS)


def fade_mult(seg: dict, t: float, dur: float) -> float:
    m = 1.0
    if seg.get("fade_in"):
        m *= smooth(t / seg["fade_in"])
    if seg.get("fade_out"):
        m *= smooth((dur - t) / seg["fade_out"])
    return m


# --- static art ------------------------------------------------------------------------------------------


def stage_base() -> Image.Image:
    img = Image.new("RGB", (W, H), (9, 12, 20))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-300, 500, 900, 1500), fill=(0, 120, 190))
    d.ellipse((1100, -400, 2300, 700), fill=(110, 60, 200))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(260)), 0.35)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((WIN_X + 8, WIN_Y + 26, WIN_X + WIN_W - 8, WIN_Y + WIN_H + 26), radius=30, fill=(0, 0, 0, 190))
    img = Image.alpha_composite(img.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(38))).convert("RGB")
    return img


_STAGE: Image.Image | None = None
_MASK: Image.Image | None = None


def stage() -> tuple[Image.Image, Image.Image]:
    global _STAGE, _MASK
    if _STAGE is None:
        _STAGE = stage_base()
        m = Image.new("L", (WIN_W * 4, WIN_H * 4), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, WIN_W * 4 - 1, WIN_H * 4 - 1), radius=22 * 4, fill=255)
        _MASK = m.resize((WIN_W, WIN_H), Image.LANCZOS)  # anti-aliased corners
    return _STAGE, _MASK


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def title_layer(title: str, sub: str) -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f1, f2 = font(FONT_SB, 54), font(FONT_RG, 26)
    if title:
        d.text(((W - d.textlength(title, font=f1)) / 2, 42), title, font=f1, fill=(255, 255, 255, 255))
    if sub:
        d.text(((W - d.textlength(sub, font=f2)) / 2, 118), sub, font=f2, fill=(190, 205, 225, 255))
    return img


def with_alpha(layer: Image.Image, a: float) -> Image.Image:
    if a >= 0.999:
        return layer
    arr = np.array(layer)
    arr[..., 3] = (arr[..., 3].astype(np.float32) * max(0.0, a)).astype(np.uint8)
    return Image.fromarray(arr)


# --- recorder HUD (mirrors the app's own recorder) -----------------------------------------------------------


def hud_frame(hud: dict, tt: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    a = smooth((tt - hud.get("fade_in_at", 0.2)) / 0.6)
    if a <= 0:
        return img
    d = ImageDraw.Draw(img)
    al = int(255 * a)
    L, M = 70, 48
    for (x, y, dx, dy) in ((M, M, 1, 1), (W - M, M, -1, 1), (M, H - M, 1, -1), (W - M, H - M, -1, -1)):
        d.line([(x, y), (x + dx * L, y)], fill=(255, 255, 255, int(170 * a)), width=4)
        d.line([(x, y), (x, y + dy * L)], fill=(255, 255, 255, int(170 * a)), width=4)
    d.rounded_rectangle((80, 74, 520, 128), radius=27, fill=(10, 14, 22, int(150 * a)))
    cx, cy = 112, 101
    d.rounded_rectangle((cx - 16, cy - 10, cx + 16, cy + 12), radius=5, outline=(255, 255, 255, al), width=3)
    d.rectangle((cx - 6, cy - 15, cx + 6, cy - 10), fill=(255, 255, 255, al))
    d.ellipse((cx - 6, cy - 5, cx + 6, cy + 7), outline=(255, 255, 255, al), width=3)
    d.text((142, 86), "Code Your Reality · Camera", font=font(FONT_RG, 22), fill=(255, 255, 255, al))
    secs = int(hud["timer_start"] + tt)
    bw = 640
    x0, y0 = (W - bw) // 2, H - 150
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + 76), radius=38, fill=(10, 14, 22, int(170 * a)))
    pulse = 0.55 + 0.45 * abs(((tt * 1.2) % 2) - 1)
    d.ellipse((x0 + 30, y0 + 28, x0 + 50, y0 + 48), fill=(232, 72, 85, int(al * pulse)))
    d.text((x0 + 64, y0 + 20), f"REC {secs // 60}:{secs % 60:02d} / 5:00", font=font(FONT_MONO, 30), fill=(255, 120, 130, al))
    pressed = hud.get("stop_at") is not None and tt >= hud["stop_at"]
    bx0, bx1 = x0 + bw - 248, x0 + bw - 18
    d.rounded_rectangle((bx0, y0 + 12, bx1, y0 + 64), radius=26, fill=(170, 30, 45, al) if pressed else (217, 58, 74, al), outline=(255, 255, 255, al if pressed else 0), width=3)
    d.rectangle((bx0 + 22, y0 + 31, bx0 + 36, y0 + 45), fill=(255, 255, 255, al))
    d.text((bx0 + 48, y0 + 22), "Stop recording", font=font(FONT_SB, 26), fill=(255, 255, 255, al))
    if pressed:
        k = tt - hud["stop_at"]
        if 0.25 < k < 0.55:
            fl = int(255 * (1 - abs(k - 0.4) / 0.15) * 0.8)
            img.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, max(0, fl))))
    return img


def burst(frame: Image.Image, bx: float, by: float, tt: float, at: float, dur: float = 1.2) -> Image.Image:
    """Light burst for the transformation: radial glow + rays, peaking at `at`."""
    k = (tt - at) / dur
    if k < -0.35 or k > 1:
        return frame
    strength = smooth((k + 0.35) / 0.35) if k < 0 else (1 - smooth(k))
    if strength <= 0.01:
        return frame
    glow = Image.new("RGB", (W // 4, H // 4), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    r = 40 + 120 * (1 - abs(k))
    gx, gy = bx / 4, by / 4
    for i, col in enumerate(((255, 255, 255), (120, 210, 255), (150, 110, 255))):
        rr = r * (0.35 + i * 0.45)
        d.ellipse((gx - rr, gy - rr, gx + rr, gy + rr), fill=col)
    for j in range(12):  # rays
        ang = j * math.pi / 6 + tt * 0.8
        d.line([(gx, gy), (gx + math.cos(ang) * r * 3, gy + math.sin(ang) * r * 3)], fill=(140, 200, 255), width=2)
    glow = glow.filter(ImageFilter.GaussianBlur(14)).resize((W, H), Image.BICUBIC)
    a = np.asarray(frame).astype(np.float32)
    g = np.asarray(glow).astype(np.float32) * (0.85 * strength)
    return Image.fromarray(np.clip(255 - (255 - a) * (255 - g) / 255, 0, 255).astype(np.uint8))  # screen blend


# --- segment renderers (each returns a list of PIL RGB frames) ----------------------------------------------


def render_gen(seg: dict) -> list[Image.Image]:
    dur = seg["dur"]
    raw = frames_from(ROOT / seg["src"], seg.get("in", 0.0), dur, GRADE)
    out = []
    for n, f in enumerate(raw):
        tt = n / FPS
        img = Image.fromarray(f)
        if seg.get("hud"):
            img = Image.alpha_composite(img.convert("RGBA"), hud_frame(seg["hud"], tt)).convert("RGB")
        if seg.get("burst"):
            b = seg["burst"]
            img = burst(img, b["x"], b["y"], tt, b["at"], b.get("dur", 1.2))
        out.append(img)
    return out


def render_ui(seg: dict) -> list[Image.Image]:
    dur = seg["dur"]
    crops = {"studio": (320, 0, 1280, 720), "app": (160, 0, 1600, 900), "full": (0, 0, W, H)}
    crop = crops[seg.get("crop", "full" if seg.get("focus") else "app")]
    raw = frames_from(ROOT / seg["src"], seg["in"], dur)
    focus = seg.get("focus") or [(0, crop[0] + crop[2] / 2, crop[1] + crop[3] / 2, 1.0)]
    full = seg.get("stage") is False
    base, mask = stage()
    title = None if full else title_layer(seg.get("super", ""), seg.get("sub", ""))
    out = []
    for n, f in enumerate(raw):
        tt = n / FPS
        cx, cy, z = keyframe(focus, tt)
        src = Image.fromarray(f)
        if full:
            out.append(view(src, cx, cy, z, W, H, crop))
            continue
        win = view(src, cx, cy, z, WIN_W, WIN_H, crop)
        img = base.copy()
        img.paste(win, (WIN_X, WIN_Y), mask)
        a = smooth((tt - 0.2) / 0.5) * smooth((dur - tt - 0.05) / 0.4)
        img = Image.alpha_composite(img.convert("RGBA"), with_alpha(title, a)).convert("RGB")
        out.append(img)
    return out


def logo_still(wordmark: bool) -> Image.Image:
    src = Image.open(ROOT / "references" / "R11_logo3d.png").convert("RGB").resize((W, H), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (6, 8, 14))
    canvas.paste(src, (0, -90))
    if wordmark:
        d = ImageDraw.Draw(canvas)
        f = font(FONT_SB, 64)
        d.text(((W - d.textlength("Code Your Reality", font=f)) / 2, 830), "Code Your Reality", font=f, fill=(255, 255, 255))
    return canvas


def render_logo(seg: dict) -> list[Image.Image]:
    still = logo_still(True)
    n = int(round(seg["dur"] * FPS))
    return [view(still, W / 2, H / 2, 1.0 + 0.05 * smooth(i / n), W, H) for i in range(n)]


def render_end(seg: dict) -> list[Image.Image]:
    """Starts as the full-frame 3D logo (= the last frame of G17), then settles into the end card."""
    logo = Image.open(ROOT / "references" / "R11_logo3d.png").convert("RGB").resize((W, H), Image.LANCZOS)
    texts = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(texts)

    def centred(text: str, y: int, path: str, size: int, color: tuple) -> None:
        f = font(path, size)
        d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=color + (255,))

    centred("Code Your Reality", 640, FONT_SB, 84, (255, 255, 255))
    centred("Your processes. Your software.", 760, FONT_RG, 40, (170, 215, 245))
    centred("Film how you work. Get your own app.", 880, FONT_SB, 32, (235, 240, 248))
    centred("integrint.hu", 936, FONT_RG, 28, (150, 165, 190))
    shade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shade).rectangle((0, 600, W, H), fill=255)
    shade = shade.filter(ImageFilter.GaussianBlur(60))
    n = int(round(seg["dur"] * FPS))
    out = []
    for i in range(n):
        tt = i / FPS
        e = smooth(tt / 1.4)
        s = 1.0 - 0.28 * e
        lw, lh = W * s, H * s
        canvas = Image.new("RGB", (W, H), (6, 8, 14))
        # sub-pixel placement of the shrinking logo (affine from the full-size image)
        x0, y0 = (W - lw) / 2, -60 * e
        layer = logo.transform((W, H), Image.AFFINE, (1 / s, 0, -x0 / s, 0, 1 / s, -y0 / s), resample=Image.BICUBIC)
        valid = Image.new("L", (W, H), 0)
        ImageDraw.Draw(valid).rectangle((x0, y0, x0 + lw, y0 + lh), fill=255)
        canvas.paste(layer, (0, 0), valid)
        dark = Image.new("RGB", (W, H), (6, 8, 14))
        canvas = Image.composite(dark, canvas, shade.point(lambda v: int(v * e)))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), with_alpha(texts, smooth((tt - 1.35) / 0.9))).convert("RGB")
        out.append(canvas)
    return out


def render_said(seg: dict) -> list[Image.Image]:
    """"You said → It built": real quotes from the analysed video and what the app made of them."""
    base, _ = stage()
    title = title_layer(seg.get("super", ""), seg.get("sub", ""))
    pairs = seg["pairs"]
    per = (seg["dur"] - 0.6) / len(pairs)
    fq, ft, fs, fl, fm = font(FONT_RG, 34), font(FONT_SB, 34), font(FONT_RG, 26), font(FONT_SB, 22), font(FONT_MONO, 24)
    n = int(round(seg["dur"] * FPS))
    out = []

    def wrap(d, text, f, width):
        words, lines, cur = text.split(), [], ""
        for w_ in words:
            test = (cur + " " + w_).strip()
            if d.textlength(test, font=f) > width:
                lines.append(cur)
                cur = w_
            else:
                cur = test
        return lines + [cur]

    for i in range(n):
        tt = i / FPS
        img = base.copy().convert("RGBA")
        img = Image.alpha_composite(img, with_alpha(title, smooth(tt / 0.5) * smooth((seg["dur"] - tt) / 0.4)))
        k = min(len(pairs) - 1, int(max(0.0, tt - 0.3) // per))
        lt = tt - 0.3 - k * per
        p = pairs[k]
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        a_in = ease_out(lt / 0.5) * smooth((per - lt) / 0.35)
        b_in = ease_out((lt - 0.7) / 0.5) * smooth((per - lt) / 0.35)
        arrow = smooth((lt - 0.45) / 0.4) * smooth((per - lt) / 0.35)
        # left: what you said (quote card, slides in from the left)
        lx = 170 - 40 * (1 - a_in)
        d.rounded_rectangle((lx, 370, lx + 690, 700), radius=28, fill=(255, 255, 255, int(235 * a_in)))
        d.text((lx + 40, 400), "YOU SAID", font=fl, fill=(0, 119, 190, int(255 * a_in)))
        d.rounded_rectangle((lx + 40, 442, lx + 170, 478), radius=18, fill=(230, 243, 252, int(255 * a_in)))
        d.text((lx + 58, 446), p["time"], font=fm, fill=(0, 119, 190, int(255 * a_in)))
        y = 506
        for line in wrap(d, f"“{p['quote']}”", fq, 610):
            d.text((lx + 40, y), line, font=fq, fill=(20, 28, 40, int(255 * a_in)))
            y += 48
        # arrow
        ax0, ax1 = 900, 900 + 120 * arrow
        if arrow > 0.02:
            d.line([(ax0, 535), (ax1, 535)], fill=CYAN + (int(255 * arrow),), width=6)
            d.polygon([(ax1 + 2, 535), (ax1 - 18, 522), (ax1 - 18, 548)], fill=CYAN + (int(255 * arrow),))
        # right: what it built (app-styled card, slides in from the right)
        rx = 1060 + 40 * (1 - b_in)
        d.rounded_rectangle((rx, 370, rx + 690, 700), radius=28, fill=(255, 255, 255, int(235 * b_in)))
        d.text((rx + 40, 400), "IT BUILT", font=fl, fill=(98, 71, 201, int(255 * b_in)))
        y = 450
        for kind, text in p["built"]:
            if kind == "title":
                for line in wrap(d, text, ft, 610):
                    d.text((rx + 40, y), line, font=ft, fill=(20, 28, 40, int(255 * b_in)))
                    y += 46
                y += 8
            elif kind == "chips":
                x = rx + 40
                for j, chip in enumerate(text):
                    cw = d.textlength(chip, font=fs) + 64
                    col = [(230, 244, 255), (227, 247, 244), (239, 235, 252)][j % 3]
                    tc = [(0, 119, 190), (11, 133, 119), (98, 71, 201)][j % 3]
                    d.rounded_rectangle((x, y, x + cw, y + 48), radius=24, fill=col + (int(255 * b_in),))
                    d.rounded_rectangle((x + 8, y + 8, x + 40, y + 40), radius=10, fill=tc + (int(255 * b_in),))
                    d.text((x + 17, y + 9), chip[0], font=font(FONT_SB, 22), fill=(255, 255, 255, int(255 * b_in)))
                    d.text((x + 50, y + 8), chip, font=fs, fill=tc + (int(255 * b_in),))
                    x += cw + 12
                y += 66
            elif kind == "rule":
                d.ellipse((rx + 40, y + 6, rx + 64, y + 30), outline=(0, 119, 190, int(255 * b_in)), width=3)
                d.line([(rx + 46, y + 18), (rx + 51, y + 24), (rx + 59, y + 12)], fill=(0, 119, 190, int(255 * b_in)), width=3)
                for line in wrap(d, text, fs, 560):
                    d.text((rx + 78, y), line, font=fs, fill=(40, 52, 66, int(255 * b_in)))
                    y += 38
                y += 10
        img = Image.alpha_composite(img, layer)
        out.append(img.convert("RGB"))
    return out


def render_wipe(seg: dict, render) -> list[Image.Image]:
    """Before → after: a soft vertical wipe with a light seam, BEFORE/AFTER chips and a caption."""
    a_frames = render(seg["a"])
    b_frames = render(seg["b"])
    n = int(round(seg["dur"] * FPS))
    w0, w1 = seg.get("wipe", (1.0, 2.8))
    fc = font(FONT_SB, 40)
    fchip = font(FONT_SB, 22)
    out = []
    for i in range(n):
        tt = i / FPS
        a = a_frames[min(i, len(a_frames) - 1)]
        b = b_frames[min(i, len(b_frames) - 1)]
        pos = smooth((tt - w0) / (w1 - w0)) * (W + 200) - 100
        mask = Image.new("L", (W, H), 0)
        if pos > 0:
            ImageDraw.Draw(mask).rectangle((0, 0, min(pos, W), H), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(18))
        img = Image.composite(b, a, mask).convert("RGBA")
        d = ImageDraw.Draw(img)
        if -50 < pos < W + 50:
            seam = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(seam).rectangle((pos - 3, 0, pos + 3, H), fill=CYAN + (230,))
            img = Image.alpha_composite(img, seam.filter(ImageFilter.GaussianBlur(6)))
            img = Image.alpha_composite(img, seam)
            d = ImageDraw.Draw(img)
        ca = smooth((tt - 0.2) / 0.5) * smooth((seg["dur"] - tt) / 0.4)
        before_a = ca * (1 - smooth((pos - 140) / 120))
        after_a = ca * smooth((pos - W + 300) / 200)
        d.rounded_rectangle((70, 70, 230, 116), radius=23, fill=(232, 72, 85, int(220 * before_a)))
        d.text((92, 78), "BEFORE", font=fchip, fill=(255, 255, 255, int(255 * before_a)))
        d.rounded_rectangle((W - 220, 70, W - 70, 116), radius=23, fill=CYAN + (int(230 * after_a),))
        d.text((W - 196, 78), "AFTER", font=fchip, fill=(255, 255, 255, int(255 * after_a)))
        # caption "before → after": the arrow is drawn, the font has no arrow glyph
        left, right = [t.strip() for t in seg["caption"].split("→")]
        lw_, rw_, gap = d.textlength(left, font=fc), d.textlength(right, font=fc), 90
        tw = lw_ + gap + rw_
        x0 = (W - tw) / 2
        d.rounded_rectangle((x0 - 36, H - 150, x0 + tw + 36, H - 76), radius=37, fill=(9, 12, 20, int(190 * ca)))
        d.text((x0, H - 143), left, font=fc, fill=(255, 255, 255, int(255 * ca)))
        d.text((x0 + lw_ + gap, H - 143), right, font=fc, fill=(255, 255, 255, int(255 * ca)))
        ax, ay = x0 + lw_ + 22, H - 113
        d.line([(ax, ay), (ax + 40, ay)], fill=CYAN + (int(255 * ca),), width=5)
        d.polygon([(ax + 48, ay), (ax + 32, ay - 11), (ax + 32, ay + 11)], fill=CYAN + (int(255 * ca),))
        out.append(img.convert("RGB"))
    return out


def render(seg: dict) -> list[Image.Image]:
    kind = seg["kind"]
    if kind == "gen":
        frames = render_gen(seg)
    elif kind == "ui":
        frames = render_ui(seg)
    elif kind == "logo":
        frames = render_logo(seg)
    elif kind == "end":
        frames = render_end(seg)
    elif kind == "said":
        frames = render_said(seg)
    elif kind == "wipe":
        frames = render_wipe(seg, render)
    else:
        raise ValueError(kind)
    n = int(round(seg["dur"] * FPS))
    frames = (frames + frames[-1:] * n)[:n]
    if seg.get("fade_in") or seg.get("fade_out"):
        frames = [Image.fromarray((np.asarray(f).astype(np.float32) * fade_mult(seg, i / FPS, seg["dur"])).astype(np.uint8)) for i, f in enumerate(frames)]
    return frames


def render_to(seg: dict, out: Path) -> None:
    wr = Writer(out)
    for f in render(seg):
        wr.write(np.asarray(f))
    wr.close()
