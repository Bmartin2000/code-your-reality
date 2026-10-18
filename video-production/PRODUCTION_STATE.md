# Production state: Code Your Reality launch film

**Phase:** 5, main film delivered: exports/CodeYourReality_LaunchFilm_1080p.mp4 (2:24, 1920×1080, 24 fps, AAC 48 kHz, −16 LUFS) + .en.srt + a subtitled MP4.

## Re-cut 3 (user feedback, 2026-10-18)
- **Request:** a more spectacular monster → logo finale; show more clearly that the system is built for your own company and how much it changes; no shaky footage, the app window must not slip out of frame.
- **Done:**
  - **New compositor (edit/compose.py):** sub-pixel affine moves with 2× supersampling replace ffmpeg zoompan (whole-pixel steps caused the jitter). Every app shot sits in one fixed, framed window (1440×810 at 240,200); only the content moves inside it.
  - **M01 "Made for your company":** real quotes from the analysed video next to what the app built from them.
  - **BA1–BA3:** before/after wipes from the chaos shots to the real app (paper slips, scheduling wall, spreadsheets).
  - **Finale:** G16 morph with a light burst, new G17 (logo rises, light vortex), then a seamless settle into the end card (T10).
  - **Narration:** new lines 30–33. **Length:** ≈ 3:28.

## Re-cut 2 (user feedback, 2026-10-18)
- **Request:** at ~1:00 the recording UI should fade in over the owner's shot, the video gets sent, and the real app takes over, so the film itself turns out to be the recording. The product part should explain more.
- **Done:**
  - **G12:** gets the app's own recorder overlay (REC counter = film time, "Stop recording", flash).
  - **R1–R3:** real clip 10, recorded with the film's G12 shot as the browser's fake camera. It zooms out of the live preview, the recording stops, Create my app, then the real analysis stages.
  - **Product:** 15 beats (B01–B15) with eased zooms on the details and 9 new narration lines (21–29).
  - **Length:** ≈ 3:00.

## Decisions (user, 2026-10-18)
- **Budget:** 300 credits; automatic ceiling 210; 90 in reserve. Spent 197.90, verified (see BUDGET_TRACKER.md).
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
