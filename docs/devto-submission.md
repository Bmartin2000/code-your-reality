---
title: "Code Your Reality: film how your business works, get your own app — built on Gemma 4"
published: false
tags: devchallenge, hf26challenge, ai, opensource
cover_image: https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/landing-hero.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)*

## What I Built

**Code Your Reality** turns a phone video of how a small business works into a working app.

You film the job once — a clerk renting out a camera, a workshop lending a drill, a repair shop taking in a bike — and say out loud what you check and what must never happen. Google's open-weight **Gemma 4** model watches the video frames and reads the transcript, then proposes what the business keeps track of, how things move along, and its rules. The owner keeps or drops each finding in plain language, presses **Build my app**, and gets a real application: forms, lists, a state machine, and business rules that the **server enforces**. Try to rent the same camera twice and the app refuses, quoting the rule that came from the video. The app works like a small CRM: a pipeline board, filters, notes on records, and spreadsheet import that goes through the same rules. The owner can rename its sections in the team's own words.

**Who pays for it, and why.** I work at [Integrint](https://integrint.hu), a Hungarian digital agency. Our smallest clients — rental shops, workshops, event-equipment companies — run on paper slips, whiteboards and "ask Peter". They would love custom software, but they can't write a specification, and they can't afford weeks of meetings to produce one. What they *can* do is show us how they work. Code Your Reality turns that into a product:

- **Free demo**: build one app from your own process, no card.
- **Plus, €19/month**: re-analyze the same video more deeply (12 frames instead of 6), add reports, give colleagues access with roles (owner / manager / staff / viewer), connect a calendar feed and webhooks, and build up to 5 apps.
- **Integrint Care**: we record and maintain it with you.

Subscribers see their period, usage and invoices. Invoices are issued through Számlázz.hu, Hungary's most common invoicing service, once the operator connects it. Until then they stay clearly marked drafts, and no payment is taken in this preview. On Plus, the generated app can invoice the business's own customers too, straight from a record.

That's less than an hour of developer time per month, for software that matches how the business actually works — and that keeps up: when something changes, the owner records again or types one sentence ("customers should also give an email address"), and the change comes back for approval.

![Plain-language review: what the app tracks, how things move along, and rules quoting the moment they were said](https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/studio-review.png)

## Demo

<!-- TODO before publishing: add the demo video (YouTube/Loom) and, if deployed, the live URL. -->
{% embed VIDEO_URL_HERE %}

Run it yourself in a few minutes (Windows, macOS or Linux): the guided example works **without any AI model**, so you can see the whole journey — review, build, rent, get refused, return — right away. With Ollama and Gemma installed, record your own process.

| | |
|---|---|
| ![Record with the phone camera](https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/mobile-record.png) | ![The app is ready: open, download, share, record again, ask for a change](https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/mobile-ready.png) |
| ![The generated rental app](https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/app-overview.png) | ![The server refuses renting the same item twice](https://raw.githubusercontent.com/Bmartin2000/code-your-reality/master/docs/screenshots/app-rule-enforced.png) |

## Code

{% embed https://github.com/Bmartin2000/code-your-reality %}

FastAPI + SQLite backend, React + TypeScript frontend, FFmpeg, faster-whisper and Ollama. One Docker image for servers, plain `pip`/`npm` for local use. Sign-in protects the Studio, so the speech-to-text and the model can't be used anonymously on a public server (the first account becomes admin and adds the rest). 39 backend tests, 11 unit tests and 27 Playwright end-to-end tests, including a full "review → build → rent → refuse → return → reload" journey.

## How I Built It

**The AI pipeline** (all open source or open weights):

1. **FFmpeg** extracts a 16 kHz audio track and samples 6 still frames evenly across the video (12 on Plus).
2. **faster-whisper** (CPU, int8) transcribes the narration into timestamped segments.
3. **Gemma 4 (`gemma4:e4b`) through Ollama** reads the frames and the numbered transcript segments in **two constrained passes**:
   - *Pass A* proposes the data structure: entities, typed fields, references, and the lifecycle of the main transaction.
   - *Pass B* proposes rules and actions. Its JSON schema is **generated from Pass A's answer**: every rule kind (precondition, exclusivity, effect on a linked record, minimum value, date order) is its own `anyOf` branch whose parameters are enums of the entities, fields, states and events that actually exist. The model *can't* reference a field it didn't define.
4. Every finding cites the **segment numbers** it came from; the server turns those into timestamps and quotes. Claims of "I saw it" without a citation are downgraded to "AI guess — check this".

**The part I'm proudest of: no generated code ever runs.** The model only produces JSON constrained by a schema. That JSON is normalized (identifiers re-derived, references checked, unmappable rules kept as documentation), reviewed by a person, validated, and compiled into a manifest. A small runtime interprets a *closed* set of rule kinds, so the app is safe by construction — the AI decides *what* the rules are, never *how* they execute.

**Small change requests** use the same idea: one sentence becomes at most five operations from a fixed set (add a field, make it required, add an option, add or remove a rule…), each constrained by a schema built from the current app. "Build me a full accounting system" is refused, not guessed.

**Honest numbers from my laptop** (Intel Core Ultra 7 155U, 15 GB RAM, no GPU), on a 48-second narrated clip about lending tools in a community workshop — deliberately not the rental domain of the built-in example:

- Gemma 4 E4B: ~8.4 minutes for the two passes. It found Tool, Member and Loan with correct references, put the lifecycle on the loan, and cited a transcript timestamp for all 9 rules. Two of them mapped straight to enforceable rules (the deposit can't be negative; a new loan records today's date); one proposed effect was wrong and is exactly the kind of thing the review step catches; the rest were kept as notes for the owner to confirm.
- A change request ("members should also give an email address, and it is required") took 50 seconds and produced exactly one new required field.
- **Gemma 4 31B on Ollama Cloud**, same clip (transcript and 6 frames): 7.7 seconds. All 6 rules came back as enforceable kinds, from "a tool can only be lent to one member at a time" to "returning it turns the card back to available", each citing its transcript segment.

  Ollama Cloud doesn't support structured outputs, so there the schema goes into the prompt instead. The server validates the answer against it and, if needed, asks for at most two repairs that name exactly what didn't fit. This run fit on the first try.

Small local models are good at structure and less consistent at rules — which is exactly why the human review step and the evidence quotes exist.

## Why Does Open Innovation Matter?

**Because the customer's video is their business.** A recording of how a shop works shows its customers, prices, deposits and habits. With an open-weight model running in Ollama, the analysis happens on the machine that runs Code Your Reality — the video never has to leave it. For a privacy-minded small business (and for GDPR in the EU), that's the difference between "maybe" and "yes". When a server has no GPU, the same code switches to Ollama Cloud with two environment variables (URL and API key, kept on the server), and the app tells the user honestly that the transcript and a few still frames are sent for analysis.

**Because the business model only works if inference is cheap and predictable.** A €19/month product can't pay per-token prices for long video prompts and two analysis passes every time someone re-records. Running Gemma locally makes the marginal cost of an analysis close to zero; the price covers support, not tokens.

**Because the open stack made the safety design possible.** Ollama's structured outputs let me compile a *grammar* from the first pass's answer and force the second pass to stay inside it. Being able to inspect and swap the model (I tested Qwen 3.5 4B and Gemma 4 E4B side by side on the same clip), set its context and temperature, and turn its "thinking" off for extraction gave me control a closed API wouldn't.

**And because no one gets locked in.** The model is replaceable, the runtime is mine, and every customer can download their app definition and all their data as spreadsheets at any time.

## My Agent Session

<!-- Optional: embed the DevRelay agent session with {% agent_session <id> %}, or remove this section. -->

## Prize Categories

- **Best Use of Gemma** — Gemma 4 is the default model: it reads the video frames and the transcript in two schema-constrained passes, and it handles the one-sentence change requests.

---

*AI disclosure: I built this project with the help of Claude Code, an AI coding assistant, and drafted this post with AI assistance. I reviewed, tested and edited everything, and the numbers above come from my own runs. The product's own AI is Google's open-weight Gemma 4 model running through Ollama.*
