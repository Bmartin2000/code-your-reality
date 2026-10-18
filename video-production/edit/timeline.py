"""Edit decision list for the main film (16:9, 1920×1080, 24 fps). All times in seconds.

Segment kinds:
  gen   – Higgsfield clip from footage/generated (trimmed, graded)
  ui    – real app recording on the product stage, with a kinetic super
  ui3   – several short app sub-clips on the stage under one super
  logo  – 3D logo reveal with wordmark
  end   – end card
"""

GEN = "footage/generated"
APP = "footage/app"

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
    {"id": "G12", "kind": "gen", "src": f"{GEN}/G12.mp4", "dur": 5.0, "fade_out": 0.4},
    # Scene 5 – from video to system (real upload + real analysis progress)
    {"id": "A02", "kind": "ui", "crop": "studio", "src": f"{APP}/02_record_upload.webm", "in": 4.0, "dur": 7.0, "super": "Show it once.", "sub": "Record or upload a short video of how you work.", "fade_in": 0.4},
    {"id": "G13", "kind": "gen", "src": f"{GEN}/G13.mp4", "dur": 5.0},
    # Scene 6 – the product
    {"id": "T06", "kind": "logo", "dur": 4.0, "fade_in": 0.6},
    {"id": "A04", "kind": "ui", "src": f"{APP}/04_app_overview.webm", "in": 5.5, "dur": 6.0, "super": "Your business. Your system.", "sub": "Built around the way you work."},
    # Scene 7 – what it does (problem → feature → benefit)
    {"id": "A03", "kind": "ui", "crop": "studio", "src": f"{APP}/03_review.webm", "in": 3.0, "dur": 6.0, "super": "Built from your own words.", "sub": "Every finding shows where in your video it came from."},
    {"id": "A05", "kind": "ui", "src": f"{APP}/05_board_rule.webm", "in": 18.0, "dur": 6.0, "super": "Rules that actually hold.", "sub": "The server refuses mistakes, quoting your own rule."},
    {"id": "A06", "kind": "ui", "src": f"{APP}/06_record_note.webm", "in": 8.0, "dur": 5.0, "super": "Not another template.", "sub": "Your records, your steps, your notes."},
    {"id": "A07", "kind": "ui", "src": f"{APP}/07_improve.webm", "in": 5.0, "dur": 6.0, "super": "It grows with you.", "sub": "Ask for a change in one sentence, or record again."},
    {"id": "A08", "kind": "ui3", "src": f"{APP}/08_plus_features.webm", "parts": [(13.0, 3.0), (22.0, 3.0), (41.0, 3.0)], "dur": 9.0, "super": "Plus: run your team on it.", "sub": "Reports · calendar & webhooks · team roles · invoicing"},
    {"id": "A09", "kind": "ui", "crop": "studio", "src": f"{APP}/09_my_apps_billing.webm", "in": 24.0, "dur": 4.0, "super": "Real people, real support.", "sub": "Support by Integrint.", "fade_out": 0.3},
    # Scene 8 – the company transforms
    {"id": "G14", "kind": "gen", "src": f"{GEN}/G14.mp4", "dur": 5.0, "fade_in": 0.3},
    {"id": "G15", "kind": "gen", "src": f"{GEN}/G15.mp4", "dur": 5.0},
    # Scene 9 – Knot transforms
    {"id": "G16", "kind": "gen", "src": f"{GEN}/G16.mp4", "dur": 5.0, "fade_out": 0.5},
    # Scene 10 – brand
    {"id": "T10", "kind": "end", "dur": 7.0, "fade_in": 0.6, "fade_out": 0.8},
]


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
    "breath": START["G12"] + 3.0,
    "generate": START["A02"],
    "product": START["T06"],
    "transform": START["G14"],
    "endcard": START["T10"],
    "morph": START["G16"] + 2.5,
    "whooshes": [START["A02"], START["T06"], START["A03"], START["G14"], START["T10"]],
    "creature": [1.2, START["G07"] + 0.6],
}

# Narration: (file index in audio/vo, start time). Text in docs/04_VOICEOVER.md.
VO = [
    (1, START["G01"] + 1.0),
    (2, START["G02"] + 0.6),
    (3, START["G08"] + 0.6),
    (4, START["G10"] + 0.4),
    (5, START["G12"] + 0.3),
    (6, START["A02"] + 1.5),
    (8, START["A03"] + 0.4),
    (9, START["A05"] + 1.0),
    (10, START["A07"] + 0.5),
    (11, START["A08"] + 0.4),
    (13, START["G15"] + 0.3),
    (14, START["T10"] + 1.2),
]
