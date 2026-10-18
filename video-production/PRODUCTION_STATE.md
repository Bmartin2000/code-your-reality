# Production state: Code Your Reality launch film

**Phase:** 5, main film delivered: exports/CodeYourReality_LaunchFilm_1080p.mp4 (2:24, 1920×1080, 24 fps, AAC 48 kHz, −16 LUFS) + .en.srt + a subtitled MP4.

## Decisions (user, 2026-10-18)
- **Budget:** 300 credits; automatic ceiling 210; 90 in reserve. Spent 185.10, verified (see BUDGET_TRACKER.md).
- **Logo:** the supplied camera-aperture logo (brand/), no "ERM SYSTEM".
- **Narrator:** "Fraser" preset voice (user's choice), ElevenLabs via Higgsfield.

## Done
- **Docs:** docs/01 (verified features), 02 (creative direction), 03 (shot list + prompts), 04 (VO).
- **References** (gpt_image_2_5): R1 Knot, R2 Daniel, R4 office, R11 3D logo, plus start frames SF02–SF17b (references/). Higgsfield job ids are in BUDGET_TRACKER and the chat log.
- **Generated shots** (Kling 3.0 Pro, 1912×1080, 24 fps), footage/generated:
  - G01–G15: all accepted, no retries.
  - G16: take 1 rejected (the logo popped in with a cut); take 2, with a matched end frame, morphs continuously and is used.
- **Real app recordings:** footage/app/01–09 (.webm + .png). Real Gemma 4 31B analysis on Ollama Cloud: upload → review in ~36 s. See RECORDINGS.md.
- **Narration:** audio/vo/vo_XX.wav (12 lines).
- **Music + SFX:** synthesised by edit/music.py (original, no licences) into audio/music.wav and audio/sfx.wav.
- **Edit:**
  - edit/timeline.py: EDL, cues, VO timing.
  - edit/build.py: renders segments, concatenates, mixes (ducking, loudnorm −16 LUFS), exports MP4 + SRT + a subtitled MP4.

## Remaining (optional)
- 60 s / 30 s / 9:16 cut-downs: a re-edit of existing footage; no new generation needed.
- Re-record the app clips after renaming the AI's raw field keys in the app, for an even cleaner UI.

## Known compromises
- **App recordings:** come from the real app, so AI-generated field names show raw keys (e.g. "Loan_date"). They can be renamed in-app since the last release; the recordings predate a rename pass.
- **Music:** programmatic. A licensed or composed track would raise the polish further.
- **Resolution:** delivery is 1920×1080. Kling Pro outputs 1080p, so 4K would only be an upscale.
