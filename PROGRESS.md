# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

---

## 2026-06-16 — Thread A Phase 1 EXECUTED (finish hand-off) — awaiting admin test

**Status:** Phase 1 (the spine) built, self-verified, and run against the recorded תמיס session — a
real finished transcript row exists, **awaiting admin test in the app**. All work is in the working
tree, **uncommitted** (founder to review/commit). Spec + plan written and committed to docs.

**TEST THIS:** open **`/app/live/live-finish-demo-tamis-2026-06-14`** in the V1 app. Expect: תמיס
Q1 2026 · audio plays · **karaoke highlights words in sync** · click-word seeks audio · Gemini speaker
turns (גיא ברנע מנכ"ל / מיכל אדרי סמנכ"לית כספים / analysts) · the toolbar (Save Quote / Ask Atlas /
Share). NB: the recording is a rough two-session test capture whose spoken content is אור ים אנרגיה,
attached to תמיס — so body text won't match the header; a known asset quirk, **not** a pipeline bug.

**What shipped** (Phase 1 = ended live call → normal finished `transcripts` row; NO IVRIT, NO YouTube —
reuses only Gemini polish + the stored shapes):
- `src/lib/live/finishLiveCall.ts` — pure, unit-tested transforms (normalize-session / synthesize
  word-ends / build `word_segments` / duration / pcm-bytes) + orchestration: trim captured PCM → MP3
  (ffmpeg 32 kbps mono) → upload to `audio-temp` → Gemini polish (reuses `formatTranscript`) →
  idempotent upsert of a completed row. Renders via the EXISTING `loadCompletedCall` →
  `LiveTranscriptView` (word-timed karaoke + toolbar) for free — the displayed/karaoke words come from
  `word_segments`; Gemini's `formatted_data` supplies the speaker turns proportionally.
- `src/lib/live/finishLiveCall.test.ts` (10 tests) · `scripts/finish-live-call.ts` (runner) ·
  `scripts/verify-finish.ts` (headless render-precondition check).
- Spec `docs/superpowers/specs/2026-06-16-live-transcript-ux-design.md` · plan
  `docs/superpowers/plans/2026-06-16-live-transcript-phase-1.md`.

**Decisions taken autonomously:** attach demo to תמיס (ticker 1097229); idempotent synthetic id
`live-finish-demo-tamis-2026-06-14`; use the FIRST of the recording's two concatenated sessions
(759 words, ~6:40) + trim the MP3 to it (stops session-2 audio bleed); resolve the demo row owner
deterministically (admin profile → newest transcript → demo user) because the zero-UUID demo user
fails `transcripts_user_id_fkey`.

**Verified:** 10 unit tests green · `tsc --noEmit` clean · `next build` green (22 routes) ·
`finish-live-call` exit 0 · `verify-finish` → status completed, audio HTTP 206 `audio/mpeg`, 759 timed
words, 8 Gemini speakers, all render preconditions pass. Cold-context `reviewer`: **no blockers, no
security holes**; 2 majors fixed (orphan audio → deterministic filename; arbitrary owner →
deterministic), plus a karaoke binary-search sort guard.

**Known/minor:** a couple of orphan mp3s from earlier runs linger in `audio-temp` (harmless temp
bucket; the script now overwrites a single deterministic object). The live path still has no live
*speaker* capture — Phase 1 leans on Gemini's proportional turns (the asset has no speaker field).

**NEXT — Phase 2 (after admin OK):** live-mode richness — toolbar on the live view, quote-as-anchor
carrying live→finished, live audio surviving navigation, same-page live→finished transition. All
demoable via `scripts/live-replay-engine.mjs`. Write the Phase 2 plan, then build + test.

---

## 2026-06-15 — Thread A (RESUMED 2026-06-16 → see top entry): live→finished "one call" UX

**Status:** Brainstormed with the founder; decisions below are **locked**. **Paused mid-design** to
chase the live webinar bot test (Thread B). No code written (brainstorming HARD-GATE respected).
**Resume by:** present the full design in sections → write spec to `docs/superpowers/specs/` →
founder review → `writing-plans` → build **Phase 1**.

**The vision — one call that *matures* (not two things):** a call (e.g. "Q2 2026") has ONE identity.
It's LIVE (streaming raw Recall captions, already quotable/shareable/Ask-Atlas-able); when it ends the
SAME call runs through Gemini → becomes the finished transcript on the company page with full
functionality. Live or finished = the same kind of page; one's just streaming and ~5 min behind.

**Locked decisions:**
- **The LIVE view must FEEL like the finished view** (founder's core ask): while live, the user can
  walk to other pages with the (delayed) live audio still playing + a Return-to-transcript chip, and
  highlight a live caption → **Ask Atlas / Save Quote / Share** — same toolbar as finished.
- **Recall gives speakers** (participant = Zoom display name + is_host + per-word timestamps). Best
  finished transcript = Recall participant boundaries/timing + Gemini role detection (מנכ"ל/CFO/מנחה)
  + typo cleanup; same capture also fixes the live "one-block captions" gap. Caveat: per-Zoom-
  participant, not voice diarization — weak when several people share one account.
- **Quotes = "auto-upgrade & deep-link"** (founder chose): a quote is stored as an ANCHOR (which words
  + the moment), NOT frozen text. Renders best-available text — raw while live, corrected once polished
  — and deep-links to the exact spot + audio in the finished transcript. Falls back to the saved
  snapshot only if a chunk's word count changes. Leans on the pipeline's "keep same words in order" rule.
- **Build path = C→A** (founder chose): two phases (C) toward the unified **"one page, two modes"**
  end-state (A — one transcript page running live-mode or finished-mode; audio layer lifted into the
  app shell so it survives navigation in BOTH; quote/share/Ask-Atlas on the one page → identical by
  construction, can't drift).

**Phase 1 (the spine — build first, biggest value):** turn an ended live call into a normal finished
transcript so the existing finished UX renders it for free:
- Capture Recall raw at call end (text + speakers + per-word timestamps).
- Encode the engine's captured PCM → MP3 → upload to Supabase Storage → `audio_url` (polish is
  post-call; capturing is the only irreversible step).
- Build `word_segments` (IVRIT-shaped) from Recall words WITH speaker per segment.
- Run Gemini polish (same `formatWithGeminiFlash` prompt as the IVRIT path, correct company context)
  → `formatted_data`.
- Insert a `transcripts` row (formatted_data + audio_url + word_segments + company_id + duration,
  status=completed) under the company → `/app/live/[id]` → `loadCompletedCall` → `LiveTranscriptView`
  renders audio karaoke + quote/share/Ask-Atlas.

**Phase 2 (the live richness):** Quote/Share/Ask-Atlas ON the live view + live audio that survives
navigation (lift the live Web-Audio engine into the app shell, like the finished global player) + the
quote-anchor data so live-saved quotes carry into the finished transcript.

**Code facts for a fast resume:**
- `LiveTranscriptView` (finished) ALREADY has it all: global player (`usePlayer`), `createQuote`,
  share (WhatsApp + `/print/[id]`), Ask-Atlas (`TranscriptChatPanel`), karaoke; loaded via
  `loadCompletedCall` from a `transcripts` row.
- `LiveBroadcastView` (live) is streaming-only: own Web-Audio engine that dies on navigation, NO
  quote/share/Ask-Atlas, NO global player; company hardcoded to תמיס (placeholder until MAYA).
- Reusable as-is: Gemini polish (`formatTranscript`/`formatWithGeminiFlash`), transcripts-row creation,
  `word_segments`+`audio_url`+`loadCompletedCall`, quotes table.
- **Demo asset available now:** old תמיס live session rotated to `scripts/out/sessions/` (`*.pcm` +
  `*.jsonl`) — Phase 1 can be built & demoed against it WITHOUT a live call.

---

## 2026-06-15 — Live webinar bot test: Zoom registration is the real wall (Core 1/2)

- **Tested 2 Recall bots into a real registration-required Zoom *webinar*** (Atlas = live→platform,
  Sagi = record-only; treated as a תמיס test). Rig was solid end-to-end (`live-broadcast.mjs` engine
  + cloudflared tunnel + new `scripts/live-webinar-bots.mjs`); Recall accepted every bot. **All 4
  launches died `fatal: zoom_token_expired` — no bot got in.**
- **Root cause (confirmed by a founder screenshot):** the registrant `…/w/{id}?tk=…` link is a
  **single-use, short-lived *landing* token** — opening it hits Zoom's "Join meeting" chooser and
  **consumes** it. The founder opened every link (to join / screenshot), so the bot always got an
  already-burned token. We used Recall's *correct* method (meeting-id + `tk` + `zoom.user_email`);
  the method was fine, **token freshness** was the blocker.
- **Zoom OAuth does NOT fix this** (verified in Recall docs): signed-in/ZAK bots only bypass
  *"authenticated-users-only"* meetings and **"cannot skip waiting rooms or bypass registration."**
  Earlier hunch corrected before building the wrong thing.
- **Real fix = freshness + automation:** the untested decisive experiment is register → **never open
  the link** → fire the bot within seconds. For Core 2 (MAYA fleet) the hard part isn't getting Zoom
  links — it's a tight **auto-register → grab fresh `tk` → launch bot** pipeline (token never
  human-touched). OAuth only helps where we host/co-host (mint clean tokens via Zoom API) or for
  auth-only meetings.
- **Tooling/leftovers:** `scripts/live-webinar-bots.mjs` (create/atlas/sagi/status) added; old תמיס
  recording rotated to `scripts/out/sessions/`. The brainstorm for the live→finished "one call" UX
  (Phase 1 polish pipeline) is **paused mid-design, not lost** — resume there next.

---

## 2026-06-15 — Rebrand → **Atlas** (name + logo across the V1 app)

- **New product name: Atlas** (Latin serif wordmark), replacing תמלול / Timlul. Founder
  decisions: **Latin "Atlas" via the real logo image**; **Hebrew UI shows the transliteration
  אטלס** (English UI = "Atlas"); **scope = V1 app (`/app/*`) only** — the legacy root product
  keeps the old name. **Colors untouched** (explicit founder constraint — the warm, near-mono V1
  palette already matches the logo's cream/dark-serif world).
- **Critical nuance honored**: in Hebrew, תמלול is *also* the noun "transcript" (`transcript:`,
  `חזרה לתמלול`, the hero, etc.). Renamed **only the brand-name uses** (`common.brand`, metadata
  title, chat assistant name), never the noun — a blind find-replace would have broken the product
  vocabulary.
- **Logo asset, zero new deps**: `scripts/prep-brand-assets.mjs` (pure Node zlib — no sharp/
  ImageMagick/ffmpeg available) decodes the transparent wordmark, trims the heavy internal padding
  to the glyph bbox (645×296 → **398×135**), re-encodes → `public/brand/atlas-wordmark.png`. New
  `BrandWordmark` DS component renders it as a **CSS mask filled with `currentColor`** → ink on
  light surfaces, light on dark, transparent on any background, crisp at any size. `NavRail` uses it
  (expanded) + a serif "A" monogram (collapsed). Added a favicon (`src/app/icon.png`) — the
  wordmark's **actual "A" glyph** traced by the same script (bilinear-scaled, ink on a rounded cream
  tile); there was none before.
- **Atlas voice / identity** (founder goal: "give the product real character, like Claude"): chat
  subhead → "**Ask Atlas** anything about a company's investor calls and filings."; highlight-to-ask
  button → "**Ask Atlas**" (was "Ask about this"); composer placeholder → "**Ask Atlas…**"; system
  prompt → "You are **Atlas**…".
- **Verified**: `tsc` clean + `next build` green (22/22) + offline composite preview of the wordmark
  on panel/white/dark surfaces + `next dev` smoke (`/app/home` 200, `/icon.png` 200). **Committed and
  fast-forward-merged to `main`, pushed to origin.**
- **Parked (revisit later — founder call)**: chat visuals + UX and the Atlas name/voice context will
  keep evolving as the product grows; the **in-transcript side-chat** gets a dedicated visual + naming
  pass (Atlas fits there perfectly). Deferred now to build bigger features. Also intentionally left
  out of git: the untracked `תמיס/` (8.3 MB report PDF) and `Product Reference/` design refs — decide
  if/how to store those (repo vs. external/LFS).

---

## 2026-06-15 — Chat polish (RTL output + reference composer → native Claude look)

- **Status**: chat logic + conversation are **starting to get good** — streaming, markdown, RTL
  output and the quote→chat reference flow work; the assistant feels real, not a thin wrapper.
  **The chat interface looks okay right now**; it'll be **better shaped later and adjusted to match
  Claude's interface** more precisely. Changes are in the working tree, **not yet committed**.
- **Shipped this session**: dynamic RTL on chat output (content-driven `detectDir`, not `dir="auto"`);
  `<br>`-in-table-cell rendering via a tiny self-contained remark plugin (no new dep, only touches
  `<br>`); flattened the history reference block (`TranscriptChatPanel`).
- **Reference composer — re-done to Claude's look**: a first pass went **too grey (`#EFEDE8`) and
  too puffy** (rounded card floating in a grey sleeve); founder course-corrected against the real
  reference (`Product Reference/refernce chat interface/side-chat-refernce.jpeg`). Now `ChatComposer`
  is **flat, predominantly white**, with a **faint 1px hairline** dividing the reference row from the
  input + a **thin outer hairline border**, and the excerpt wrapped in **both an opening and closing
  quote**. Founder confirmed the row IS divider-separated. *Good-enough for now; finer Claude-match
  to come.*
- **Lesson logged** (memory `matching-design-references`): match a reference's real character
  (Claude = flat/white/hairline/minimal, not grey/puffy) and **describe understanding + confirm
  before implementing** visual changes.
- **Parked (revisit later)**: Hebrew inside markdown **tables** still pins left instead of hugging
  the right edge.

---

## 2026-06-14 — Design pass + 4 features (player / streaming chat / side-chat / diarization)

- **Design pass**: folded the Claude-Design look into the working product (no rebuild) — fade-up/
  pop-in/pulse-live motion + softer card/float shadows; bigger-then-dialled-back home hero; upcoming
  cards **flat at rest, smooth shadow on hover** (per founder feedback); calendar polish; My-Quotes
  **collapsible quarters + user-named folders** (`quote_folders` table + `quotes.folder_id`). Kept
  the **MediaPlayer as-is** and transcripts **RTL Hebrew** (added a chapters/speakers side panel).
- **Feature 4 — Global audio player**: lifted the recorded-call player into the app shell
  (`PlayerProvider` + one `<audio>`), so audio survives navigation + plays while chatting; floating
  **Return-to-transcript** chip; clickable **My Quotes** toast. `LiveTranscriptView` now consumes the
  global player. *Why*: foundation for the in-transcript chat + a far better listening UX.
- **Feature 5 — Streaming chat**: real Gemini SSE → token stream; **markdown rendering**
  (`react-markdown`+`remark-gfm`, RTL-aware `.md` typography) so replies read like Claude, not raw
  `**`/tables; thinking-dots. *Why*: the chat felt like a thin LLM wrapper.
- **Feature 6 — In-transcript side chat**: highlight → ✦ Ask → side panel (transcript stays, audio
  plays); while open, **highlighting auto-references** into the composer; new refs append at the
  bottom and ride into their message (history preserved). Composer is a **unified two-toned box**
  (warm reference header + white input) matching `Product Reference/Chat-quote-reference-visualgoal.jpeg`.
- **Feature 1 — Diarization editing**: additive `transcripts.speaker_edits` overlay +
  `applySpeakerEdits` (pure passthrough when absent → zero regression; verified on a real transcript
  then reset to pristine); `PATCH …/diarization` recomputes the full boundary list; "Edit speakers"
  reassigns a selected run. *Deferred*: adding a brand-new speaker; optimistic (non-refresh) update.
- **Verified**: `tsc` + `next build` (22/22) green per feature; dev-server smoke 200; streaming +
  diarization endpoints exercised live. Built on branch `feat/product-enhancements`, merged to `main`.
- **NEXT (today)**: (1) **test the live feature on a real call**; (2) keep polishing chat UX. Advanced
  features start tomorrow.

---

## 2026-06-14 — Deployed to Railway + Core 1 live-on-platform (built, first test, rebuilt)

- **Shipped Spec 1 + deployed**: merged the 9 transcript/chat fixes to `main`, deployed on
  **Railway → `timlul-ai.com`**. Fixed post-login redirect (`/dashboard` → `/app/home`; the old
  product still lives at root routes). **Chat switched Claude Sonnet → Gemini 3.5 Flash**
  (`thinkingBudget:0`) — shares `GEMINI_API_KEY`, works on the deploy.
- **Finished-transcript polish**: speaker names now come from Gemini's `formatted_data` (relabel
  IVRIT timed words, karaoke untouched) instead of "Speaker N"; "Open with LLM" replaced by
  **Share-as-PDF** (clean `/print/[id]` route → browser Save-as-PDF); quote→chat passes company +
  quote + specific call.
- **Core 1 on the platform (built)**: home "Live Now" + company Overview **auto-detect** a live
  call (poll `/api/live/state`); `/app/live/live` streams the broadcast. Data flows browser →
  same-origin proxy routes (`/api/live/state`, `/pcm`) → live engine (`LIVE_ENGINE_URL`, default
  the local spike, tunnelled for the deploy). The live engine = the spike (`live-broadcast.mjs`).
- **First real live test (תמיס Zoom)** ✅ proved the loop end-to-end: Zoom → Recall bot → platform
  → karaoke, **audio↔text sync good**, live auto-appears on home when the bot is admitted, closing
  Zoom ended the call. Bugs surfaced → **rebuilt the live view to BE the V1 page** (same header,
  tabs, `TranscriptBody`, **`MediaPlayer` audio bar**) and **fixed join-at-live-point** (was
  playing from call start; now drops in at `liveEdge − buffer`), buffer countdown, play/pause/
  seek/volume (Web Audio). Verified against a **replay of the recorded session**
  (`scripts/live-replay-engine.mjs`, serves `out/broadcast-audio.pcm` + `broadcast-lines.jsonl`).
- **Known / next (re-test tomorrow on a real call)**: live captions render as **one block** (no
  speaker turns — the spike captures word+timestamp but not Recall's per-word speaker; production
  fix = capture speaker → real speaker segments). Accuracy-mode captions arrive in ~72–188s chunks
  (**why the buffer must be the full 5 min** so captions are ready when audio plays). Big chunks
  fall back to **raw** (Gemini changed word count) → production fix = sentence-level correction.

---

## 2026-06-13 — Spec 1 (transcript experience + chat) + live-pipeline direction

- Diagnosed: finished YouTube transcripts show no audio / no word-sync because legacy rows
  predate the `audio_url` + `word_segments` pipeline (which already persists both). Fix =
  re-process in place (`scripts/reprocess-audio.mjs`), not a pipeline rewrite.
- Scoped Spec 1 (`docs/superpowers/specs/2026-06-13-transcript-experience-and-chat-design.md`):
  9 transcript/chat fixes — audio karaoke on finished calls, always-RTL, go-to-line+highlight,
  real refresh, paragraph-correct quote speaker, editable speaker names, working search,
  "Open with LLM" (replaces PDF), transcript-scoped chat context, persisted conversations.
- Core-tech review of the live pipeline. Locked: **raw-live + polish-after** (no LLM in the live
  path — scales to many concurrent calls; Gemini polishes only the finished transcript),
  **Railway** host (= permanent webhook URL for free), Recall supports **Zoom Webinars** (bot as
  attendee; registration link + passcode). Spec 2 productionizes the live broadcast; the finished
  live call reuses Spec 1's audio-synced replay.
- PDF dropped in favour of "Open with LLM" (ChatGPT/Claude/Gemini hand-off).

---

## 2026-06-11 — V1 scoped + data layer seeded (4 real companies, mock MAYA)

- **V1 product description received** (full page map now in CLAUDE.md): Home/Calendar/Chat/
  Company/Live-Transcript pages, RTL 3-layer sidebar. Partner is building the design system
  (~2 days); frontend lands then and we wire it to the backend. Until then: backend fitting only.
- **Data layer shipped** (migration `20260611_006`, live in Supabase): `companies` +
  `scheduled_calls` + `transcripts.company_id`. Seeded 4 real companies — תיגבור (1105022,
  שירותים), תמיס (1097229, נדל"ן — identified via Globes/Bizportal after MAYA blocked scraping),
  רג"א (ניקיון עירוני), קווליטאו (1083955, שבבים) — with descriptions + 3 logos in
  `public/logos/` (תמיס logo: manual add pending). 4 mock Q2-2026 calls; תיגבור+רג"א
  deliberately simultaneous (19.6) to test multi-call UX.
- **Core 3 decision locked**: live calls' finished transcripts = Recall raw text (speaker names
  + per-word timestamps) straight into Gemini — no IVRIT re-transcription (measured tie on
  quality, Recall adds speakers/timing for free). IVRIT remains for the YouTube path.
- **Flagged**: leftover foreign tables in Supabase (patients/sessions/documents/products);
  `products` has RLS disabled (critical advisory) — user to clean up/decide.
- **Next**: frontend + design system arrive → integration plan (quotes table, chat endpoints,
  Core 1 productionization, ingest the 2 seed YouTube calls linked to companies).

- **The full product loop ran live**: real 2-person Zoom call → Recall bot (audio websocket +
  transcript webhook) → Gemini 3.5 Flash live correction → viewer page playing audio ~5 min
  behind with synced karaoke captions → call ended → broadcast drained gracefully. Spike:
  `scripts/live-broadcast.mjs` (+ `live-player.mjs` replay, `live-bakeoff.mjs` A/B harness).
- **Engine bake-off (measured on live reads of `fixtures/live-bakeoff-script.he.txt`)**:
  Recall-accuracy = best Hebrew quality, rolling 72–188s chunk delay (fits 5-min buffer);
  Gladia = 2.7s median lag but ~25 errors/3min (kept as possible "instant mode"); ElevenLabs
  disqualified (no live events, no transcript, 3 attempts); IVRIT 45s-chunks = close 2nd
  quality at ~62s but requires audio infra. **Decision: Recall-accuracy + Gemini live
  correction; delay embraced as the buffer.** Post-Gemini, Recall-raw ≈ IVRIT-raw on final
  transcript quality — engine choice driven by live experience, not final output.
- **Gemini live-correction validated**: company-context constrained prompt fixed האגירה/EBITDA/
  NOI/מח"מ/מט"ח live in 1.5–6s/chunk. Gotchas burned in: `thinkingBudget: 0` mandatory
  (reasoning leaked into captions); paid tier mandatory (free tier 429s); 350-word chunks break
  word-count preservation → production needs sentence-level correction + anchor alignment.
- **Post-call assets confirmed**: full recording (mp4→mp3) + final transcript downloadable —
  must be copied to our storage before Recall retention deletes them. Audio + polished
  transcript both shown on platform.
- **Next**: Core 1 design doc → production build (`live_calls` table, `/live/[id]`, Railway
  webhook URL, multi-call concurrency), then Core 2 (MAYA → automatic bot fleet). User V1
  product description incoming.

---

## 2026-06-10 — VISION LEVEL-UP: from "paste a link" to the Israeli institutional platform

- **New big vision** (partnership formed after strong hedge-fund feedback): the Quartr-equivalent
  for the Israeli market — institutional-only, prestige adoption. Solve report-season drowning
  (200+ calls/season): track + produce insights from **every** Israeli public company's investor
  call, live and post-call.
- **New product process**: MAYA/TASE API (company profiles + call Zoom links, automated) →
  Recall.ai bot fleet joins calls → **live transcripts hosted on-platform** (audio + captions in
  sync, ~5 min buffer OK) → post-call, raw text/audio runs through the existing pipeline →
  polished transcript stored in our DB.
- **Roadmap reordered to backend core missions**: Core 1 = live transcript of one call (NOW);
  Core 2 = automatic bot fleet from MAYA; Core 3 = finished-transcript pipeline (done, needs
  input rewiring). PDF/share/audio-click demoted to "later, with the frontend guide" — a full
  frontend description (maybe a skeleton) is arriving from the partner.
- **MAYA groundwork**: `MAYA/maya_api-guide.pdf` scanned — TASE Data Hub portal: register → app →
  API key; REST + `apikey` header; rate limit 10 req/2s (HTTP 429); call-announcement product is
  paid and needs Data Sales approval (starting in days). Design the integration behind a clean
  interface until the real schema is visible.

---

## 2026-06-10 — Feature 1 COMPLETE: IVRIT → Gemini 3.5 Flash pipeline live in production

**What shipped:**
- **New pipeline**: IVRIT (RunPod) → `parseTitleMeta` (company/quarter from YT title, no LLM) →
  `formatWithGeminiFlash` (Gemini 3.5 Flash, company-aware holistic prompt) → `parseGeminiOutput`
  (structured speaker blocks) → user. GPT-4o fully removed.
- **Prompt** (in `formatWithGeminiFlash`): gives Gemini the company name + "Israeli public company"
  context; instructs organize by speaker, fix confident typos only, never rephrase/summarize.
- **UI**: tighter same-speaker paragraph spacing (`mb-1.5`); yellow flag rendering for uncertain words
  already wired via `TranscriptBody` `renderText`.
- **Proxy**: Decodo residential proxy (`YTDLP_PROXY` on Railway) added to bypass YouTube bot-detection.
- **Quality**: transcripts are visually excellent — confirmed on קוואליטאו Q1 2026 live test.
  Gold-measurement score ~40 token-errors on אמפא (vs 31 with old GPT-4o+entities pipeline), but
  visual quality and speaker organization are significantly better. Deliberate trade-off accepted.

**Why Gemini over GPT-4o:**
GPT-4o's constrained diff-only approach scored better on the gold metric (31 errors, 0 introduced)
but produced robotic, hard-to-read output. Gemini's holistic approach produces natural, well-organized
transcripts the analysts actually want to read. Quality-over-measurement was the deliberate call.

**Remaining gaps (not blocking, revisit later):**
Per-company entity DB; IVRIT per-word confidence scores; per-line `startSec` for audio playback.

**Next feature: Feature 2 — PDF download + Share.**

---

## 2026-06-09 — Feature 4 / Live Zoom Transcription — Recall.ai quality spike

**Goal:** Validate Recall.ai as the live-transcription engine before building the UI — confirm
Hebrew quality, per-word timing, and the participant/data schema.

**What was built:**
- `scripts/recall-spike.mjs` — a Node.js spike script (no Railway/webhook needed). Three commands:
  `start "<zoom_url>"` (creates bot, saves id to `.recall-spike-bot.json`), `status`, `fetch`
  (polls until transcript ready, writes `fixtures/recall-spike.{transcript.json,.he.txt}`).
- Bot config: `recallai_streaming` provider, `prioritize_accuracy` mode (the only Recall mode that
  supports Hebrew — `low_latency` is English-only), `language_code: "auto"` (handles Hebrew+English
  code-switching in financial terms).
- Bot name: "Timlul". Reads `RECALL_API_KEY` (and optional `RECALL_REGION`, default `us-west-2`) from `.env.local`.

**Live test result (bot `f46700bf`, 2026-06-09T15:43Z):**
- Hebrew quality: **excellent** — clean recognition, natural financial vocabulary preserved.
- Transcript JSON schema: `[{ participant: { name, id, is_host, platform, email }, words: [{ text,
  start_timestamp: { relative (float seconds from call start), absolute (ISO) }, end_timestamp }], language_code }]`
- Per-word timestamps available — both relative and absolute ISO. This is also the audio-sync
  foundation for Feature 3's `startSec` line timestamps.
- Participant identified by Zoom display name. `is_host` flag available.
- `prioritize_accuracy` transcript is ready 3–10 min after call ends (not real-time streaming).

**Status:** Spike complete. Quality proven. **Next: build the live-transcript page in the website.**
Target UX: user sends a Zoom link → bot joins → `/live/[botId]` page shows transcript building
in real-time with RTL Hebrew, speaker labels, and audio sync. Need: Recall webhook → Supabase →
SSE/Realtime → the page. Or: poll Recall API directly from the page during the call.

---

## 2026-06-09 — Manual model comparison experiment (in progress)

**Goal:** Find out which model produces the best Hebrew investor-call transcript from raw IVRIT output,
so we can decide how to improve the pipeline.

**Protocol:**
1. User sends a YouTube link → Claude extracts the raw IVRIT transcript text and pastes it back.
2. User takes that raw text and submits it with a free-form "fix + organize" prompt to three model
   chat UIs simultaneously: **ChatGPT (GPT-5.5)**, **Claude Sonnet 4.6**, **Gemini Flash 3.1**.
3. User listens to the full audio recording and manually produces a **perfect gold transcript**.
4. Compare all three model outputs to the gold → count errors fixed / introduced / remaining.
5. Brainstorm findings: which model/approach wins, what the gap tells us about the pipeline.

**Why:** The manual Gemini test (2026-06-09) on the אמפא Q1 2026 transcript showed Gemini's
free-form approach fixed ~8 critical domain errors that our constrained GPT-4o pipeline missed
(היוון, שיעור התפוסה, זרוע הפיננסים, האגירה, TLV, אמפא ישראל). But Gemini hallucinated the
CEO name (רדי → לוי). This test will give us a clean multi-model comparison on a fresh transcript
with a new gold standard.

**Status:** Waiting for user to send a YouTube link. Claude will run the IVRIT pipeline and return
the raw text in-chat. No API calls needed from the user side — pure manual chat-UI test.

**Expected learning:** Which model's context understanding is strongest for Hebrew IR calls;
whether the hallucination risk is a Gemini-only issue or universal; what prompt engineering
(entity list, stricter instructions) closes the gap to perfect.

---

## 2026-06-09 — Locked the correction pipeline (Feature 1 baseline) + Claude experiment

- **Locked the constrained, gold-measured correction layer** (`src/lib/correction.ts`) as the product's
  correction step. `formatWithGPT4o` Step 0 = `generateEntities` (knowledge-first auto entity list,
  GPT-4o) → `correctTranscript` (**diff-only**, entity-guarded, context-coherence flags) → speaker-tag
  the raw text + apply corrections per line (decoupled). Best measured: אמפא **46→31 token-errors, 0
  introduced**. The diff-only output + entity-match guard (`applyConfident`) is what stops the over-reach
  that plagued the old free-rewrite GPT pass.
- **Claude Sonnet 4.6 experiment — tested, did not win.** Same IVRIT raw, swapped only the correction
  brain (`scripts/claude-test.ts`). V1 (no report) 46→41, 1 introduced; **V1 + adaptive thinking 46→39,
  2 introduced** (Claude's best) — still short of GPT-4o+entities (31), and it corrupts 1–2 good words.
  Report-as-context is a **dead end for both models** (no-thinking V2 over-reached → 5 introduced;
  thinking-V2 ran the 50K-token report away and burned the whole budget). **Verdict: the entity list is
  the lever, not the model.** Claude's *flagging* (detection) was excellent, though. Spec:
  `docs/superpowers/specs/2026-06-09-claude-correction-test-design.md`.
- **Feature 1 is "good-enough" DONE** (product call): clean + honest yellow flagging + speaker
  organization. Explicitly **not** perfect — we will return to it; this pipeline is the core of the product.
- **Revisit-later list (deliberate):** per-company canonical entity DB + cross-company learning loop
  (biggest remaining lever); IVRIT per-word confidence + audio for the genuinely-ambiguous residual
  (e.g. cap-rate היוון/רבעון); a Claude pass once we have a Claude-tuned prompt. Source-side IVRIT
  biasing stays closed (proven no-op).
- **Misc:** added `@anthropic-ai/sdk` (also serves the upcoming live-transcripts feature); admin
  "תמלל מחדש" button + backend force-path inserts a new row so the original is kept for A/B.

---

## 2026-06-07 — Cleanup, foundations & the transcript-quality gate

- **Purged the abandoned "insider transactions" feature** (full purge). Deleted 11 `src/` files,
  the entire `worker/` dir (`maya-poller` cron), `render.yaml`, the `resend` dependency, dead
  `mock-data.ts`, and insider-only env vars (`RESEND_*`, `GREEN_API_*`, `CRON_SECRET`). The feature
  was fully isolated — nothing in the transcript product imported it. DB tables left in place
  (harmless, reversible). Verified `tsc` + `next build` clean afterward.
- **Reverted the font-size bump** from commit `3c51315` — only the `fontSize` block in
  `tailwind.config.ts`, back to its prior values. Left accent color and `font-mono-num` (changed in
  the same commit) alone; the complaint was size only.
- **Added `CLAUDE.md` and this `PROGRESS.md`** — the project had neither. CLAUDE.md is the
  per-session memory; PROGRESS.md is the decision log.
- **Built the transcript-quality gate**: Bearer-token auth on the transcript API (so automation can
  drive the real product), `scripts/transcribe-batch.mjs` (submits a URL list, polls, dumps results),
  and the **`/transcript-review`** skill that audits output for Hebrew typos/speaker errors and feeds
  `KNOWN_CORRECTIONS`. Feature 1 is now gated on a clean reviewer report. Reviewer runs against the
  local dev server.
- **Skills decision**: build exactly one (`/transcript-review`). Code review uses the built-in
  `reviewer` agent — no skill needed.

---

## Earlier milestones (pre-log, summarized)

- **Security hardening**: auth on `GET /api/transcripts`, RLS on `transcripts`, removed plaintext
  password storage from the join flow (now `inviteUserByEmail`), fixed an open redirect.
- **Database user-creation bug**: fixed the `handle_new_user` Supabase trigger (wrong columns +
  `search_path`).
- **Rebrand** "Sentiment." → **"תמלול."** across the app.
- **Sign-out**: replaced a dropdown with a plain `<a href="/api/auth/signout">` after a z-index
  overlap kept intercepting the click.
- **Inline transcript editing**: company/quarter/speakers (with app-wide name sync) + line text +
  highlights, saved via `PUT /api/transcripts/[id]`.
- **Unified navbar** (`AppNav`), **Companies** accordion page, dashboard refactor, join form fields.
- **Transcription quality phase 1**: engine/model tracking + admin badge; wired the previously-dead
  `KNOWN_CORRECTIONS` + GPT proofread pass; Whisper fallback on IVRIT failure. IVRIT confirmed
  running in production via the badge (`ivrit · …turbo-ct2`).
