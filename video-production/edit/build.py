"""Assemble the launch film: render every segment, concatenate, mix narration + music + SFX, export.

Usage (from video-production/):  .venv/Scripts/python.exe edit/build.py [--only G01,A03] [--no-audio]
Outputs: edit/build/seg_*.mp4, exports/CodeYourReality_LaunchFilm_1080p.mp4, audio/narration_final.srt
Reproducible: everything comes from timeline.py, footage/, references/, audio/ and the fonts in edit/fonts.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "edit"))
from timeline import SEGMENTS, START, TOTAL, VO  # noqa: E402

FFMPEG = str(Path(r"C:\Users\webar\reality-compiler\backend\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"))
BUILD = ROOT / "edit" / "build"
EXPORTS = ROOT / "exports"
FONT_SB = str(ROOT / "edit" / "fonts" / "Poppins-SemiBold.ttf")
FONT_RG = str(ROOT / "edit" / "fonts" / "Poppins-Regular.ttf")
W, H, FPS = 1920, 1080, 24
UI_W, UI_H = 1600, 900  # the app recording on the stage
UI_Y = 168
# Source crops (x, y, w, h) of the 1920x1080 recordings: Studio pages have a centred column, so they
# are magnified; app pages use the full layout.
CROPS = {"studio": (320, 0, 1280, 720), "app": (160, 0, 1600, 900), "full": (0, 0, 1920, 1080)}
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
GRADE = "eq=contrast=1.04:saturation=1.03:gamma=0.98,vignette=angle=PI/5"
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS)]


def run(args: list[str]) -> None:
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"ffmpeg failed:\n{' '.join(args)}\n{r.stderr}")


# --- static art ---------------------------------------------------------------------------------------


def stage_background(path: Path) -> None:
    """Near-black stage with soft cyan/violet glows (the logo's colours)."""
    img = Image.new("RGB", (W, H), (9, 12, 20))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-300, 500, 900, 1500), fill=(0, 120, 190))
    d.ellipse((1100, -400, 2300, 700), fill=(110, 60, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(260))
    img = Image.blend(img, glow, 0.35)
    img.save(path)


def ui_mask_and_shadow(mask_path: Path, shadow_path: Path, x: int, y: int) -> None:
    mask = Image.new("L", (UI_W, UI_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, UI_W - 1, UI_H - 1), radius=22, fill=255)
    mask.save(mask_path)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x + 10, y + 30, x + UI_W - 10, y + UI_H + 30), radius=30, fill=(0, 0, 0, 200))
    sh.filter(ImageFilter.GaussianBlur(40)).save(shadow_path)


def text_layer(path: Path, title: str, sub: str = "", y: int = 34) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f1 = ImageFont.truetype(FONT_SB, 54)
    f2 = ImageFont.truetype(FONT_RG, 26)
    w1 = d.textlength(title, font=f1)
    d.text(((W - w1) / 2, y), title, font=f1, fill=(255, 255, 255, 255))
    if sub:
        w2 = d.textlength(sub, font=f2)
        d.text(((W - w2) / 2, y + 72), sub, font=f2, fill=(190, 205, 225, 255))
    img.save(path)


def logo_card(path: Path, wordmark: bool, lines: list[tuple[str, int, str, tuple]] | None = None, dark: float = 1.0, shift: int = 0) -> None:
    """The 3D logo (references/R11_logo3d.png) on its dark stage, optionally with text lines below."""
    src = Image.open(ROOT / "references" / "R11_logo3d.png").convert("RGB").resize((W, H))
    if dark < 1:
        src = Image.eval(src, lambda v: int(v * dark))
    canvas = Image.new("RGB", (W, H), (6, 8, 14))
    canvas.paste(src, (0, -shift))
    d = ImageDraw.Draw(canvas)
    if wordmark:
        f = ImageFont.truetype(FONT_SB, 64)
        text = "Code Your Reality"
        d.text(((W - d.textlength(text, font=f)) / 2, 900 - shift), text, font=f, fill=(255, 255, 255))
    for text, size, font, color in lines or []:
        fnt = ImageFont.truetype(FONT_SB if font == "sb" else FONT_RG, size)
        y = {"name": 700, "tag": 790, "cta": 880, "url": 940}[text[0]] if isinstance(text, tuple) else 0
        _ = y
    canvas.save(path)


def end_card(path: Path) -> None:
    src = Image.open(ROOT / "references" / "R11_logo3d.png").convert("RGB").resize((int(W * 0.72), int(H * 0.72)))
    canvas = Image.new("RGB", (W, H), (6, 8, 14))
    canvas.paste(src, ((W - src.width) // 2, -60))
    fade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(fade).rectangle((0, 640, W, H), fill=255)
    canvas.paste(Image.new("RGB", (W, H), (6, 8, 14)), (0, 0), fade.filter(ImageFilter.GaussianBlur(60)))
    d = ImageDraw.Draw(canvas)

    def centred(text: str, y: int, font: str, size: int, color: tuple) -> None:
        f = ImageFont.truetype(font, size)
        d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=color)

    centred("Code Your Reality", 640, FONT_SB, 84, (255, 255, 255))
    centred("Your processes. Your software.", 760, FONT_RG, 40, (170, 215, 245))
    centred("Film how you work. Get your own app.", 880, FONT_SB, 32, (235, 240, 248))
    centred("integrint.hu", 936, FONT_RG, 28, (150, 165, 190))
    canvas.save(path)


# --- zoom keyframes ------------------------------------------------------------------------------------


def focus_filter(focus: list, crop: tuple, out_w: int, out_h: int, up: int = 2) -> str:
    """zoompan expressions for eased zooms onto details of a recording.

    focus: [(t, cx, cy, z), ...] in seconds and source (1920x1080) pixels; z=1 shows the whole crop.
    """
    cx0, cy0, cw, ch = crop
    keys = [(int(round(tk * FPS)), (x - cx0) * up, (y - cy0) * up, z) for tk, x, y, z in focus]

    def piece(idx: int) -> str:
        return "{0}"  # placeholder

    def expr(i: int) -> str:
        # returns expression for value index i (1: X, 2: Y, 3: z)
        e = str(keys[-1][i])
        for (f0, *v0), (f1, *v1) in reversed(list(zip(keys, keys[1:]))):
            a, b = v0[i - 1], v1[i - 1]
            s = f"clip((on-{f0})/{max(1, f1 - f0)},0,1)"
            seg = f"({a}+({b}-({a}))*({s})*({s})*(3-2*({s})))"
            e = f"if(lt(on,{f1}),{seg},{e})"
        return f"if(lt(on,{keys[0][0]}),{keys[0][i]},{e})"

    z, X, Y = expr(3), expr(1), expr(2)
    return (
        f"scale={cw * up}:{ch * up}:flags=lanczos,"
        f"zoompan=z='{z}':x='clip(({X})-iw/zoom/2,0,iw-iw/zoom)':y='clip(({Y})-ih/zoom/2,0,ih-ih/zoom)':d=1:s={out_w}x{out_h}:fps={FPS}"
    )


# --- recording HUD (mirrors the app's own recorder: red REC counter + "Stop recording") ----------------


def render_hud(seg: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    hud = seg["hud"]
    dur = seg["dur"]
    fps_n = int(dur * FPS)
    mono = ImageFont.truetype(FONT_MONO, 30)
    sans = ImageFont.truetype(FONT_SB, 26)
    small = ImageFont.truetype(FONT_RG, 22)
    for n in range(fps_n):
        tt = n / FPS
        a = min(1.0, max(0.0, (tt - hud.get("fade_in_at", 0.2)) / 0.6))
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if a > 0:
            d = ImageDraw.Draw(img)
            al = int(255 * a)
            # viewfinder corners
            L, M = 70, 48
            for (x, y, dx, dy) in ((M, M, 1, 1), (W - M, M, -1, 1), (M, H - M, 1, -1), (W - M, H - M, -1, -1)):
                d.line([(x, y), (x + dx * L, y)], fill=(255, 255, 255, int(170 * a)), width=4)
                d.line([(x, y), (x, y + dy * L)], fill=(255, 255, 255, int(170 * a)), width=4)
            # top-left: app + camera
            d.rounded_rectangle((80, 74, 520, 128), radius=27, fill=(10, 14, 22, int(150 * a)))
            cx, cy = 112, 101  # camera glyph
            d.rounded_rectangle((cx - 16, cy - 10, cx + 16, cy + 12), radius=5, outline=(255, 255, 255, al), width=3)
            d.rectangle((cx - 6, cy - 15, cx + 6, cy - 10), fill=(255, 255, 255, al))
            d.ellipse((cx - 6, cy - 5, cx + 6, cy + 7), outline=(255, 255, 255, al), width=3)
            d.text((142, 86), "Code Your Reality · Camera", font=small, fill=(255, 255, 255, al))
            # bottom bar: REC counter + Stop recording (same wording as the app)
            secs = int(hud["timer_start"] + tt)
            rec = f"REC {secs // 60}:{secs % 60:02d} / 5:00"
            bw = 640
            x0, y0 = (W - bw) // 2, H - 150
            d.rounded_rectangle((x0, y0, x0 + bw, y0 + 76), radius=38, fill=(10, 14, 22, int(170 * a)))
            pulse = 0.55 + 0.45 * abs(((tt * 1.2) % 2) - 1)
            d.ellipse((x0 + 30, y0 + 28, x0 + 50, y0 + 48), fill=(232, 72, 85, int(al * pulse)))
            d.text((x0 + 64, y0 + 20), rec, font=mono, fill=(255, 120, 130, al))
            pressed = hud.get("stop_at") is not None and tt >= hud["stop_at"]
            bx0, bx1 = x0 + bw - 248, x0 + bw - 18
            col = (170, 30, 45, al) if pressed else (217, 58, 74, al)
            d.rounded_rectangle((bx0, y0 + 12, bx1, y0 + 64), radius=26, fill=col, outline=(255, 255, 255, al if pressed else 0), width=3)
            d.rectangle((bx0 + 22, y0 + 31, bx0 + 36, y0 + 45), fill=(255, 255, 255, al))
            d.text((bx0 + 48, y0 + 22), "Stop recording", font=sans, fill=(255, 255, 255, al))
            if pressed:  # brief white flash as the recording is sent
                k = tt - hud["stop_at"]
                if 0.25 < k < 0.55:
                    fl = int(255 * (1 - abs(k - 0.4) / 0.15) * 0.8)
                    img.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, max(0, fl))))
        img.save(out_dir / f"h{n:04d}.png")


# --- segments ----------------------------------------------------------------------------------------


def fades(seg: dict, dur: float) -> str:
    f = []
    if seg.get("fade_in"):
        f.append(f"fade=t=in:st=0:d={seg['fade_in']}")
    if seg.get("fade_out"):
        f.append(f"fade=t=out:st={dur - seg['fade_out']:.3f}:d={seg['fade_out']}")
    return ("," + ",".join(f)) if f else ""


def render_gen(seg: dict, out: Path) -> None:
    dur = seg["dur"]
    base = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},{GRADE},trim=0:{dur},setpts=PTS-STARTPTS"
    if not seg.get("hud"):
        run(["-i", str(ROOT / seg["src"]), "-an", "-vf", base + fades(seg, dur), "-t", str(dur), *ENC, str(out)])
        return
    hud_dir = BUILD / f"hud_{seg['id']}"
    render_hud(seg, hud_dir)
    fc = f"[0:v]{base}[b];[1:v]format=rgba[h];[b][h]overlay=0:0:shortest=1{fades(seg, dur)}[v]"
    run(["-i", str(ROOT / seg["src"]), "-framerate", str(FPS), "-i", str(hud_dir / "h%04d.png"), "-filter_complex", fc, "-map", "[v]", "-an", "-t", str(dur), *ENC, str(out)])


def render_ui(seg: dict, out: Path, art: dict[str, Path]) -> None:
    dur = seg["dur"]
    sid = seg["id"]
    txt = BUILD / f"txt_{sid}.png"
    if seg.get("stage") is not False:
        text_layer(txt, seg.get("super", ""), seg.get("sub", ""))
    x, y = (W - UI_W) // 2, UI_Y
    crop = CROPS[seg.get("crop", "full" if seg.get("focus") else "app")]
    cx, cy, cw, ch = crop
    if seg.get("stage") is False:
        return render_ui_full(seg, out, crop)
    parts = seg.get("parts") or [(seg["in"], dur)]
    inputs: list[str] = ["-loop", "1", "-t", str(dur), "-i", str(art["bg"]), "-loop", "1", "-t", str(dur), "-i", str(art["shadow"]), "-loop", "1", "-t", str(dur), "-i", str(art["mask"]), "-loop", "1", "-t", str(dur), "-i", str(txt)]
    chains = []
    for k, (start, length) in enumerate(parts):
        inputs += ["-ss", str(start), "-t", str(length), "-i", str(ROOT / seg["src"])]
        size = f"scale={UI_W}:{UI_H}:flags=lanczos" if not seg.get("focus") else focus_filter(seg["focus"], crop, UI_W, UI_H)
        chains.append(f"[{4 + k}:v]fps={FPS},setpts=PTS-STARTPTS,crop={cw}:{ch}:{cx}:{cy},{size},setsar=1,format=rgba[p{k}]")
    if len(parts) > 1:
        chains.append("".join(f"[p{k}]" for k in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=0[ui]")
    else:
        chains.append("[p0]copy[ui]")
    total_frames = int(dur * FPS)
    chains += [
        "[2:v]format=gray[m]",
        "[ui][m]alphamerge[uim]",
        "[0:v][1:v]overlay[bs]",
        f"[bs][uim]overlay={x}:{y}:shortest=1[comp]",
        # slow push-in: upscale first so the zoom is smooth
        f"[comp]scale={W * 2}:{H * 2},zoompan=z='1+0.045*on/{total_frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}[z]",
        f"[3:v]format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1,fade=t=out:st={dur - 0.45:.2f}:d=0.4:alpha=1[t]",
        f"[z][t]overlay=0:0:shortest=1,trim=0:{dur},setpts=PTS-STARTPTS{fades(seg, dur)}[v]",
    ]
    run([*inputs, "-filter_complex", ";".join(chains), "-map", "[v]", "-an", "-t", str(dur), *ENC, str(out)])


def render_ui_full(seg: dict, out: Path, crop: tuple) -> None:
    """A recording shown full-frame (no stage), e.g. zoomed into the live camera preview."""
    dur = seg["dur"]
    cx, cy, cw, ch = crop
    size = focus_filter(seg["focus"], crop, W, H) if seg.get("focus") else f"scale={W}:{H}:flags=lanczos"
    vf = f"fps={FPS},setpts=PTS-STARTPTS,crop={cw}:{ch}:{cx}:{cy},{size},setsar=1,trim=0:{dur},setpts=PTS-STARTPTS{fades(seg, dur)}"
    run(["-ss", str(seg["in"]), "-t", str(dur + 0.5), "-i", str(ROOT / seg["src"]), "-an", "-vf", vf, "-t", str(dur), *ENC, str(out)])


def render_still(img: Path, seg: dict, out: Path, zoom: float = 0.06) -> None:
    dur = seg["dur"]
    frames = int(dur * FPS)
    vf = f"scale={W * 2}:{H * 2},zoompan=z='1+{zoom}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}{fades(seg, dur)}"
    run(["-loop", "1", "-i", str(img), "-vf", vf, "-t", str(dur), "-an", *ENC, str(out)])


# --- audio ---------------------------------------------------------------------------------------------


def wav_duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def vo_files() -> dict[int, Path]:
    return {i: ROOT / "audio" / "vo" / f"vo_{i:02d}.wav" for i, _ in VO}


def mix_audio(out: Path) -> None:
    files = vo_files()
    inputs = ["-i", str(ROOT / "audio" / "music.wav"), "-i", str(ROOT / "audio" / "sfx.wav")]
    chains = []
    labels = []
    for k, (idx, at) in enumerate(VO):
        inputs += ["-i", str(files[idx])]
        ms = int(at * 1000)
        chains.append(f"[{2 + k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},apad[v{k}]")
        labels.append(f"[v{k}]")
    chains.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest,atrim=0:{TOTAL},volume=1.6[vo]")
    chains.append("[vo]asplit=2[vo1][vo2]")
    chains.append(f"[0:a]atrim=0:{TOTAL},volume=0.55[mus]")
    chains.append("[mus][vo1]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[duck]")
    chains.append(f"[1:a]atrim=0:{TOTAL},volume=0.6[fx]")
    chains.append("[duck][vo2][fx]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[a]")
    run([*inputs, "-filter_complex", ";".join(chains), "-map", "[a]", "-ar", "48000", "-c:a", "pcm_s16le", str(out)])


def write_srt(path: Path) -> None:
    texts = {
        1: "Every business begins with an idea.",
        2: "But somewhere along the way… things get complicated.",
        3: "It isn't the people. It's everything that doesn't connect.",
        4: "Different tools. Different files. Endless workarounds.",
        5: "What if your business could simply show the system how it works?",
        6: "Don't change the way your business works…\nBuild the software around it.",
        8: "Film how you work. It finds your records, your steps and your rules —\nand shows you where it heard them.",
        9: "Your rules become guardrails the system enforces.",
        10: "Ask for a change in one sentence. Or simply record again.",
        11: "With Plus: reports, calendar and webhook connections, team roles and invoicing.\nAnd you're never on your own.",
        13: "Same company. Same people. Finally connected.",
        14: "Code Your Reality. Your processes. Your software.",
        21: "It listens to what you say, and looks at what you show.",
        22: "Then it lays out what it understood: what you keep track of,\nhow work moves along, and the rules you follow. Each with the moment you said it.",
        23: "You keep what's right, and leave out what isn't.\nNothing goes live without your OK.",
        24: "One click, and your app is ready.\nOpen it, share the link, or download everything.",
        25: "And your rules actually hold. Try to lend the same drill twice,\nand the system says no, and tells you why.",
        26: "When something changes, just say it in one sentence, or record again.\nYou approve every change.",
        27: "Call everything what your team calls it.",
        28: "With Plus, it becomes your team's system: reports, calendar and webhook connections,\nroles for every colleague, and invoices straight from a record.",
        29: "Build more apps as you grow.\nAnd real people at Integrint help you along the way.",
    }

    def ts(t: float) -> str:
        h, rem = divmod(t, 3600)
        m, s = divmod(rem, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"

    files = vo_files()
    lines = []
    for n, (idx, at) in enumerate(VO, start=1):
        end = at + wav_duration(files[idx]) + 0.3
        lines.append(f"{n}\n{ts(at)} --> {ts(end)}\n{texts[idx]}\n")
    path.write_text("\n".join(lines), encoding="utf-8")


def check_vo_overlaps() -> list[str]:
    files = vo_files()
    problems = []
    for (i1, t1), (i2, t2) in zip(VO, VO[1:]):
        end = t1 + wav_duration(files[i1])
        if end > t2 - 0.2:
            problems.append(f"VO {i1} ends at {end:.2f}s but VO {i2} starts at {t2:.2f}s")
    return problems


# --- main ---------------------------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--assemble", action="store_true", help="with --only: re-render those segments, reuse the rest, then assemble")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    BUILD.mkdir(parents=True, exist_ok=True)
    EXPORTS.mkdir(exist_ok=True)

    art = {"bg": BUILD / "stage.png", "mask": BUILD / "ui_mask.png", "shadow": BUILD / "ui_shadow.png", "logo": BUILD / "logo_card.png", "end": BUILD / "end_card.png"}
    stage_background(art["bg"])
    ui_mask_and_shadow(art["mask"], art["shadow"], (W - UI_W) // 2, UI_Y)
    logo_card(art["logo"], wordmark=True, shift=90)
    end_card(art["end"])

    segs = []
    for s in SEGMENTS:
        out = BUILD / f"seg_{s['id']}.mp4"
        segs.append(out)
        if only and s["id"] not in only:
            continue
        print(f"render {s['id']} ({s['kind']}, {s['dur']}s) at {START[s['id']]:.1f}s", flush=True)
        if s["kind"] == "gen":
            render_gen(s, out)
        elif s["kind"] in ("ui", "ui3"):
            render_ui(s, out, art)
        elif s["kind"] == "logo":
            render_still(art["logo"], s, out, zoom=0.07)
        elif s["kind"] == "end":
            render_still(art["end"], s, out, zoom=0.03)
    if only and not a.assemble:
        return

    concat = BUILD / "concat.txt"
    concat.write_text("".join(f"file '{p.as_posix()}'\n" for p in segs), encoding="utf-8")
    video = BUILD / "video_only.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(video)])

    final = EXPORTS / "CodeYourReality_LaunchFilm_1080p.mp4"
    if a.no_audio:
        run(["-i", str(video), "-c", "copy", str(final)])
    else:
        problems = check_vo_overlaps()
        for p in problems:
            print("WARNING:", p)
        mix = BUILD / "mix.wav"
        mix_audio(mix)
        run(["-i", str(video), "-i", str(mix), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(final)])
        write_srt(ROOT / "audio" / "narration_final.srt")
        run(["-i", str(final), "-i", str(ROOT / "audio" / "narration_final.srt"), "-map", "0", "-map", "1", "-c", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", str(EXPORTS / "CodeYourReality_LaunchFilm_1080p_subtitled.mp4")])
    print(f"done: {final} ({TOTAL:.1f}s)")


if __name__ == "__main__":
    main()
