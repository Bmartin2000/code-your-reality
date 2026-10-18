# Budget tracker (Higgsfield credits)

| | Credits |
|---|---|
| Account balance at start (2026-10-18) | 793.28 |
| **Authorized project budget** | **300** (approved by the user, 2026-10-18) |
| Automatic spending ceiling (70%) | **210** |
| Protected reserve (30%, needs approval) | **90** |
| Spent to date | **197.90, verified** (balance 793.28 → 595.38; re-cut 3 added 9.80: G17 + narration 30–33). Automatic ceiling 210; the 90 reserve is untouched |
| Estimated cost to complete | 0. Remaining under the ceiling: 21.90; reserve 90 untouched |

**Split of the spendable part:**
- references and pilot: 10%
- main scenes: 55%
- hero polishing: 15%
- retries: 15%
- contingency: 5%

**Rules:**
- At most 2 extra paid attempts per shot.
- No identical resubmits.
- Status checks are not new generations.

| Time | Shot | Model / settings | Attempt | Credits | Running total | Note |
|---|---|---|---|---|---|---|
| 2026-10-18 17:30 | R1 Knot, R2 Daniel, R4 front desk, R11 3D logo | gpt_image_2_5 medium 2k | 1 each | 4.00 | 4.00 | all four approved |
| 2026-10-18 17:33 | P1 (G01 test), P2 (G03 test) | kling3_0 pro 5 s silent, start_image | 1 each | 17.50 | 21.50 | pilot |
| 2026-10-18 17:32 | Start frames SF05–SF09, SF11–SF13 (3 more rate-limited: not submitted, not charged) | gpt_image_2_5 medium 2k | 1 each | 8.00 | 29.50 | |
| 2026-10-18 17:33 | SF02, SF04, SF10, SF14, SF15, SF16, SF17 | gpt_image_2_5 medium 2k | 1 each | 7.00 | 36.50 | SF15 had the creature in it |
| 2026-10-18 17:36 | SF15b (creature removed) | gpt_image_2_5 medium 2k | 2 | 1.00 | 37.50 | |
| 2026-10-18 17:37 | G02, G04–G08, G10–G14 (5 s) + G09 (10 s) | kling3_0 pro silent | 1 each | 113.75 | 151.25 | main batch |
| 2026-10-18 17:39 | G15 (5 s), G16 morph (5 s, start + end frames) | kling3_0 pro silent | 1 each | 17.50 | 168.75 | |
| 2026-10-18 17:41 | VO lines, "Arthur" voice (12 takes, superseded) | text2speech_v2 elevenlabs | 1 | ≈1.80 | ≈170.55 | user then picked another voice |
| 2026-10-18 17:44 | VO lines, "Fraser" voice (user's choice, 12 takes) | text2speech_v2 elevenlabs | 1 | ≈1.80 | ≈172.35 | final narration |
| 2026-10-18 17:50 | SF17b (matched end frame for the morph) | gpt_image_2_5 medium 2k | 1 | 1.00 | ≈173.35 | |
| 2026-10-18 17:51 | G16 morph retry (matched start/end frames) | kling3_0 pro silent | 2 | 8.75 | ≈182.10 | the 1st take popped the logo in with a cut |
| 2026-10-18 18:12 | VO lines 21–29, Fraser voice (re-cut: feature explanations) | text2speech_v2 elevenlabs | 1 | ≈1.35 | ≈186.45 | |
| 2026-10-18 18:30 | G17 hero logo rise (start = G16 last frame, end = R11 logo) | kling3_0 pro silent | 1 | 8.75 | ≈196.85 | re-cut 3: more spectacular finale |
| 2026-10-18 18:31 | VO lines 30–33, Fraser voice | text2speech_v2 elevenlabs | 1 | ≈0.60 | ≈197.45 | |
