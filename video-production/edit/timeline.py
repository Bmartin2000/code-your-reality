"""Edit decision list for the main film (16:9, 1920×1080, 24 fps). All times in seconds.

Segment kinds:
  gen   – Higgsfield clip from footage/generated (trimmed, graded); optional "hud" = the app's recorder overlay
  ui    – real app recording on the product stage with a kinetic super; optional "focus" zoom keyframes
          [(t, cx, cy, zoom)] in source pixels; "stage": False = full-frame, no stage
  logo  – 3D logo reveal with wordmark
  end   – end card

Re-cut 2 (user feedback): at ~1:00 the app's recorder fades in over the owner's shot, he stops and sends
it, and the film continues inside the real app (the film itself was the recording; clip 10 was recorded
with the film's own G12 shot as the browser's camera). The product part is longer: one feature per beat,
with zooms onto the details that matter.
"""

GEN = "footage/generated"
APP = "footage/app"

# Clip 10: the real recorder, camera = the film's G12 shot (footage/app/10_record_camera.json).
REC = {"started": 10.32, "stop": 21.05, "staged": 22.07, "create": 25.99, "progress": 27.19}
PREVIEW = (681, 304, 558, 314)  # live preview box (x, y, w, h)


def _preview_focus(dur: float) -> list:
    x, y, w, h = PREVIEW
    cx, cy = x + w / 2, y + h / 2
    z = 1920 / w
    return [(0.0, cx, cy, z), (0.6, cx, cy, z), (2.2, 960, 470, 1.55), (dur, 960, 470, 1.55)]


SEGMENTS = [
    # Scene 1 – the tangled thought
    {"id": "G01", "kind": "gen", "src": f"{GEN}/G01.mp4", "dur": 5.0, "fade_in": 1.0},
    {"id": "G02", "kind": "gen", "src": f"{GEN}/G02.mp4", "dur": 5.0},
    # Scene 2 – exploring the company
    {"id": "G03", "kind": "gen", "src": f"{GEN}/G03.mp4", "dur": 5.0},
    {"id": "G04", "kind": "gen", "src": f"{GEN}/G04.mp4", "dur": 5.0},
    {"id": "G05", "kind": "gen", "src": f"{GEN}/G05.mp4", "dur": 5.0},
    # Scene 3 – finding the owner
    {"id": "G06", "kind": "gen", "src": f"{GEN}/G06.mp4", "dur": 5.0},
    {"id": "G07", "kind": "gen", "src": f"{GEN}/G07.mp4", "dur": 5.0},
    {"id": "G08", "kind": "gen", "src": f"{GEN}/G08.mp4", "dur": 5.0},
    # Scene 4 – he shows how it works
    {"id": "G09", "kind": "gen", "src": f"{GEN}/G09.mp4", "dur": 10.0},
    {"id": "G10", "kind": "gen", "src": f"{GEN}/G10.mp4", "dur": 4.5},
    {"id": "G11", "kind": "gen", "src": f"{GEN}/G11.mp4", "dur": 4.5},
    # The reveal: the app's recorder fades in over the shot (timer = the film's own time); he stops it…
    {"id": "G12", "kind": "gen", "src": f"{GEN}/G12.mp4", "dur": 5.0, "hud": {"timer_start": 59, "fade_in_at": 0.15, "stop_at": 3.9}},
    # …and we are inside the real app: out of the live preview, the recording stops, the video is staged
    {"id": "R1", "kind": "ui", "stage": False, "src": f"{APP}/10_record_camera.webm", "in": REC["stop"] - 2.6, "dur": 4.0, "focus": "preview"},
    {"id": "R2", "kind": "ui", "src": f"{APP}/10_record_camera.webm", "in": REC["staged"] + 0.9, "dur": 3.6, "super": "Show it once.", "sub": "Record with your camera, or upload a video.", "focus": [(0, 960, 620, 1.3), (3.6, 960, 700, 1.3)]},
    {"id": "R3", "kind": "ui", "src": f"{APP}/10_record_camera.webm", "in": REC["progress"] + 0.4, "dur": 6.0, "super": "It listens and looks.", "sub": "Speech, video frames and Google's open Gemma 4 model.", "focus": [(0, 960, 540, 1.2), (1.4, 960, 440, 1.9), (6, 960, 440, 1.95)]},
    # From video to system
    {"id": "G13", "kind": "gen", "src": f"{GEN}/G13.mp4", "dur": 5.0},
    {"id": "T06", "kind": "logo", "dur": 4.0, "fade_in": 0.5},
    # The product, one idea per beat (real recordings)
    {"id": "B01", "kind": "ui", "src": f"{APP}/11_review_evidence.webm", "in": 8.0, "dur": 9.0, "super": "Built from your own words.", "sub": "Every finding shows the moment you said it.", "focus": [(0, 960, 540, 1.3), (4.6, 960, 540, 1.3), (5.8, 950, 610, 2.0), (9, 950, 610, 2.0)]},
    {"id": "B02", "kind": "ui", "src": f"{APP}/03_review.webm", "in": 21.0, "dur": 6.0, "super": "You decide.", "sub": "Keep what's right, leave out what isn't. Then build.", "focus": [(0, 960, 700, 1.3), (3, 960, 900, 1.5), (6, 960, 900, 1.5)]},
    {"id": "B03", "kind": "ui", "src": f"{APP}/12_ready_screen.webm", "in": 3.0, "dur": 6.0, "super": "Ready in one click.", "sub": "Open it, share the link, or download everything.", "focus": [(0, 960, 540, 1.2), (1.5, 960, 520, 1.55), (6, 960, 560, 1.5)]},
    {"id": "B04", "kind": "ui", "src": f"{APP}/04_app_overview.webm", "in": 5.5, "dur": 4.0, "super": "Not another template.", "sub": "Your records, your steps, your lists and forms."},
    {"id": "B05", "kind": "ui", "src": f"{APP}/05_board_rule.webm", "in": 4.0, "dur": 3.0, "super": "A board for every workflow.", "sub": "See what's open, and move it on."},
    {"id": "B06", "kind": "ui", "src": f"{APP}/05_board_rule.webm", "in": 17.0, "dur": 7.0, "super": "Rules that actually hold.", "sub": "The server refuses mistakes, and quotes your rule.", "focus": [(0, 960, 540, 1.15), (3.4, 960, 540, 1.15), (4.6, 960, 450, 2.1), (7, 960, 450, 2.1)]},
    {"id": "B07", "kind": "ui", "src": f"{APP}/06_record_note.webm", "in": 8.0, "dur": 4.0, "super": "Everything on record.", "sub": "Notes and full history on every item."},
    {"id": "B08", "kind": "ui", "src": f"{APP}/07_improve.webm", "in": 9.0, "dur": 8.5, "super": "It grows with you.", "sub": "Ask for a change in one sentence, or record again.", "focus": [(0, 960, 540, 1.25), (1.5, 960, 520, 1.9), (8.5, 960, 520, 1.9)]},
    {"id": "B09", "kind": "ui", "src": f"{APP}/07_improve.webm", "in": 19.0, "dur": 4.0, "super": "Your words, your colours.", "sub": "Rename sections, fields and statuses.", "focus": [(0, 960, 560, 1.3), (2, 960, 700, 1.7), (4, 960, 700, 1.7)]},
    {"id": "B10", "kind": "ui", "src": f"{APP}/08_plus_features.webm", "in": 13.0, "dur": 3.5, "super": "Plus · Reports", "sub": "Activity, overdue items, mistakes prevented.", "focus": [(0, 960, 540, 1.2), (1.5, 1000, 330, 1.8), (3.5, 1000, 330, 1.8)]},
    {"id": "B11", "kind": "ui", "src": f"{APP}/08_plus_features.webm", "in": 22.0, "dur": 3.5, "super": "Plus · Connections", "sub": "A calendar feed and webhooks for your other tools.", "focus": [(0, 960, 540, 1.2), (1.5, 1100, 560, 1.55), (3.5, 1100, 560, 1.55)]},
    {"id": "B12", "kind": "ui", "src": f"{APP}/08_plus_features.webm", "in": 26.4, "dur": 2.5, "super": "Plus · Team roles", "sub": "Owner, manager, staff or viewer, each with their own link.", "focus": [(0, 960, 540, 1.2), (1.2, 880, 250, 1.75), (2.5, 880, 250, 1.75)]},
    {"id": "B13", "kind": "ui", "src": f"{APP}/08_plus_features.webm", "in": 44.0, "dur": 3.5, "super": "Plus · Invoicing", "sub": "Invoices straight from a record, via Számlázz.hu.", "focus": [(0, 960, 540, 1.15), (1.5, 960, 520, 1.5), (3.5, 960, 520, 1.5)]},
    {"id": "B14", "kind": "ui", "src": f"{APP}/09_my_apps_billing.webm", "in": 3.0, "dur": 4.0, "super": "Grow app by app.", "sub": "All your apps in one place.", "focus": [(0, 960, 540, 1.2), (2, 960, 560, 1.45), (4, 960, 560, 1.45)]},
    {"id": "B15", "kind": "ui", "src": f"{APP}/09_my_apps_billing.webm", "in": 24.0, "dur": 3.5, "super": "Real people, real support.", "sub": "Help from Integrint whenever you need it.", "focus": [(0, 960, 540, 1.2), (2, 960, 560, 1.45), (3.5, 960, 560, 1.45)], "fade_out": 0.3},
    # Scene 8 – the company transforms
    {"id": "G14", "kind": "gen", "src": f"{GEN}/G14.mp4", "dur": 5.0, "fade_in": 0.3},
    {"id": "G15", "kind": "gen", "src": f"{GEN}/G15.mp4", "dur": 5.0},
    # Scene 9 – Knot transforms
    {"id": "G16", "kind": "gen", "src": f"{GEN}/G16.mp4", "dur": 5.0, "fade_out": 0.5},
    # Scene 10 – brand
    {"id": "T10", "kind": "end", "dur": 7.0, "fade_in": 0.6, "fade_out": 0.8},
]

for _s in SEGMENTS:
    if _s.get("focus") == "preview":
        _s["focus"] = _preview_focus(_s["dur"])


def starts() -> dict[str, float]:
    t, out = 0.0, {}
    for s in SEGMENTS:
        out[s["id"]] = t
        t += s["dur"]
    return out


START = starts()
TOTAL = sum(s["dur"] for s in SEGMENTS)

# Music / SFX cue points.
CUES = {
    "tension": START["G06"],
    "breath": START["G12"] + 3.9,
    "generate": START["R1"],
    "product": START["T06"],
    "transform": START["G14"],
    "endcard": START["T10"],
    "morph": START["G16"] + 2.5,
    "whooshes": [START["R1"], START["G13"], START["T06"], START["B01"], START["B10"], START["G14"], START["T10"]],
    "creature": [1.2, START["G07"] + 0.6],
}

# Narration: (file index in audio/vo, start time). Texts in docs/04_VOICEOVER.md.
VO = [
    (1, START["G01"] + 1.0),
    (2, START["G02"] + 0.6),
    (3, START["G08"] + 0.6),
    (4, START["G10"] + 0.4),
    (5, START["G12"] + 0.2),
    (21, START["R3"] + 0.4),
    (6, START["G13"] + 0.6),
    (22, START["B01"] + 0.3),
    (23, START["B02"] + 0.3),
    (24, START["B03"] + 0.4),
    (25, START["B06"] + 0.4),
    (26, START["B08"] + 0.3),
    (27, START["B09"] + 0.5),
    (28, START["B10"] + 0.3),
    (29, START["B14"] + 0.4),
    (13, START["G15"] + 0.3),
    (14, START["T10"] + 1.2),
]
