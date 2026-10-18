# Code Your Reality: verified feature inventory (for the launch film)

Every claim in the film must map to a row here. Source: the repository at commit e6354d2 (backend/app, frontend/src, tests).
**Planned** = shown in the app as "planned"; never present it as available.

## What it is
A web app (FastAPI + React) that turns a **video of how a business works** into a **working business app**.
- **Who it's for:** small businesses that run on paper, whiteboards and spreadsheets: rentals, workshops, repair, service businesses.
- **Who makes it:** Integrint (Hungarian digital agency). Support comes from Integrint.

## The journey (all real)
| Step | What happens | Where in code |
|---|---|---|
| Sign up / sign in | First account = admin (founder); admins add users | api/auth.py |
| Record or upload | Phone camera, browser recording (camera or screen + mic) or file upload (MP4/MOV/WebM/MKV, ≤200 MB, ≤5 min); optional written narration | CaptureFlow.tsx, api/projects.py |
| AI understands | FFmpeg audio + frames → faster-whisper transcript → **Gemma 4** (open-weight, via Ollama local or Ollama Cloud) in 2 schema-constrained passes: structure (entities, fields, lifecycle), then rules and actions | pipeline/model.py |
| Evidence | Every finding cites the transcript moment it came from | normalize.py, Evidence |
| Plain-language review | Keep or leave out each thing, step and rule, with the quote | ProjectFlow.tsx |
| Build | Compiler → manifest → runtime. **No generated code runs**; the server enforces a closed set of rule kinds | workflow/compiler.py, runtime.py |
| Use the app | Lists, forms, statuses, history; **server refuses rule breaks** ("this camera is already rented") | GeneratedAppPage.tsx |

## Inside a finished app (all plans)
- **Main views:** dashboard with colour-coded sections; list with status filters, sortable columns and search; **pipeline board** for anything with a lifecycle.
- **Records:** create/edit forms; record detail with **notes** and full history.
- **Import and export:** CSV import through the same rules (skipped rows explained); CSV export; ZIP download of definition and data.
- **Online link:** to share the app.
- **Improve this app (owner):**
  - Ask for a change in one sentence (≤300 chars). It becomes ≤5 constrained edits, reviewed before the rebuild.
  - **Record again.**
  - Edit in detail.
  - Rename the app, its sections, fields, statuses and buttons, and give sections colours.

## Plans (services/plans.py; landing copy in lib/plans.ts)
| | Free demo | Plus €19/mo | Business €49/mo | Integrint Care |
|---|---|---|---|---|
| Apps | 1 | 5 | 25 | custom |
| Video analyses / month | 3 | 30 | 200 | |
| Frames the AI studies | 6 | 12 | 12 | |
| Reports, Connections, Team roles, Invoicing | – | ✓ | ✓ | |
| People per app | 1 | 5 | 25 | |
| Priority support | | | ✓ (landing copy) | named contact, on-site first recording (landing copy) |

**Payment:** online payment is **not connected**. Checkout is a labelled demo, so don't show real payment. Subscription invoices are drafts until Számlázz.hu is connected.

## Plus features (real)
- **Reports:** open/closed, overdue, money totals, busiest items, **mistakes prevented by rules**.
- **Connections, available now:** CSV export; **ICS calendar feed** (Google, Outlook, Apple Calendar); **signed webhooks** (Zapier, Make, own systems).
- **Connections, planned only:** Billingo, email, SMS/WhatsApp and webshop sync. ⚠ Don't show these as available.
- **Team access:** personal links with roles: owner, manager, staff, viewer.
- **Invoicing from a record:** customer and amounts prefilled. Issued through the business's **own Számlázz.hu** account (optional connection); otherwise drafts.

## Studio (the owner's console)
- **My apps:** all apps with their sections, record counts and last activity; Open, Change, Copy link, Download.
- **Subscription & invoices:** plan, period, usage (analyses, apps), invoices. Owner only.
- **Help & support:** FAQ and contact with Integrint (integrint.hu).

## Measured numbers we may quote (one run each; don't promise speed)
- Gemma 4 31B on Ollama Cloud: a 48-second clip analysed in **7.7 s**; all 6 rules enforceable.
- Gemma 4 E4B locally on a laptop CPU: ~8.4 min.
- The film should say "minutes, not months" at most; no guarantees.

## Strongest messages (ranked)
1. **Show, don't specify.** Film your process; get your own app. No spec, no developers.
2. **Built around you.** The app's sections, statuses and rules come from *your* video, in your words.
3. **Rules that hold.** The server refuses mistakes ("already rented"), quoting the rule you said.
4. **It grows with you.** Ask in one sentence, record again, rename; you approve every change.
5. **Plus turns it into the team's system:** reports, calendar/webhooks, roles, invoicing.
6. **Real people help:** support by Integrint.

## Brand
- **Name:** Code Your Reality.
- **Film logo:** the camera/aperture logo with code glyphs, cyan → violet gradient, supplied by the user (brand/logo-*.webp). The in-app header uses the "CYR" monogram on Integrint blue (#00A1FF → #0077BE).
- ⚠ The supplied full logo carries the subline "ERM SYSTEM"; the app doesn't use that term (see open questions in PRODUCTION_STATE).
- **Fonts:** Poppins (display), Inter (UI).
