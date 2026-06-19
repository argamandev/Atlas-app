# CLAUDE.md — תמלול (Timlul)

Project memory for Claude. Read this first every session.

> **Brand (2026-06-15):** the product is now **Atlas** (Hebrew UI: **אטלס**), rebranded from
> תמלול/Timlul across the **V1 app (`/app/*`)** only. The legacy root product and the
> `timlul-ai.com` domain still carry the old name. Note: "תמלול" throughout this file is
> historical *and* the everyday Hebrew noun for "transcript" — only brand-name uses were renamed.

## How we work — founder context + dev workflow (READ FIRST)

**Founder:** Sagi is a **solo, non-engineer founder** learning software development as he builds Atlas. He
learns fast but is new to git, code, and architecture. **Guide proactively and educationally:** explain the
*why* in plain language, surface risky/irreversible steps before doing them, and never assume prior
knowledge. Always say which branch we're on and what is committed vs. uncommitted.

**Work small, one step at a time:**
- **Break every big feature into small, independently-testable mini-features.** No giant multi-day branches —
  one clear step at a time → clean, reviewable, safe work. (This is an explicit founder instruction.)
- **One branch per mini-feature** off `main` (`feat/<name>` / `fix/<name>`). `main` stays always-working and
  pushed to GitHub (`origin`: github.com/argamandev/Investor-Transcript).
- **Small, clearly-labeled commits** as we go (one logical step each) — never one giant end-of-feature commit.
- **Test before committing/merging.** Sagi prefers to test a feature first, confirm it works, THEN commit —
  do **not** commit unverified work. `main` only ever gets tested, working code.
- **Claude reviews the diff before any merge to `main`.** Solo founder → formal GitHub PRs are optional; the
  discipline that matters is branch + small commits + test-before-merge. Sync `main` into the branch before
  merging, delete merged branches, keep `.gitignore` clean.

**Homework track (Sagi is learning):** feed one topic at a time with a concrete resource + small exercise —
git basics, working effectively with Claude Code, app architecture (Next.js client/server + Supabase), and
security (secrets/`.env`, auth, RLS). Tie each to what we're currently building.

## What this is — the big vision

**תמלול** is building the best product for the Israeli public market and its financial
institutions — think **Quartr, but Hebrew-native and institutional-only** (no retail). The core
problem: during report season every hedge fund drowns in 200+ investor calls in a few weeks.
The product lets institutional investors track, consume, and extract insights from **every**
Israeli public company's investor calls — live and after the fact — so they can outperform.

What that means concretely:
- **A profile for every Israeli public company** (pulled from the TASE/MAYA API), with its
  quarterly-call Zoom links collected automatically.
- **Live transcripts**: a Recall.ai bot joins every call; users watch the call live on the
  platform — audio + Hebrew captions in sync (a ~5 min buffer delay is acceptable).
- **Finished transcripts**: when a call ends, the raw text/audio runs through the existing
  high-quality pipeline (IVRIT → Gemini formatting) and the polished transcript is published.
- **Many calls simultaneously** — report-season days mean dozens of concurrent calls; the
  architecture must handle them all in harmony.

Origin story (why we're confident): started as a tool for the founder's brother at a hedge fund;
his fund manager's feedback was so strong they partnered up. Adoption strategy is prestige,
high-end users only. The UI is **RTL Hebrew**; quality and polish matter.

## V1 product (frontend + design system incoming, ~2026-06-13)

Three-layer RTL sidebar (icon rail → expanded panel → content). Pages:
- **Home** — greeting, company search (company = the atomic unit of the product), "Live Now"
  panel, upcoming calls by date.
- **Calendar** — month view of all upcoming calls (logos + times); "All calls" vs "My Calendar"
  (drag to follow).
- **Chat** — LLM chat over the transcript DB; `/company` slash commands set context; history
  panel; "My Agents" (standing quote-capture rules) + "My Skills" (agents/skills = post-launch,
  stub the UI). Chat runs on **Gemini 3.5 Flash** (shares `GEMINI_API_KEY` with the pipeline,
  `thinkingBudget: 0`); V1 = context-stuffing, no vector DB.
- **Company page** — header (name/logo/sector), Overview tab (latest call, upcoming, My Quotes
  by quarter/timeline), Investor Calls tab (full backlog by quarter), "Add Investor Call"
  (YouTube link → existing pipeline), "Open in Chat" per call/company.
- **Live Transcript page (the crown jewel)** — karaoke transcript synced to audio (live =
  Core 1 broadcast w/ delay; ended = replay); click-word-to-seek; quote-save icon → My Quotes.
- Profile & settings at sidebar bottom.

**V1 data layer (LIVE in Supabase, migration `20260611_006`)**: `companies` (4 real seeded:
תיגבור 1105022, תמיס 1097229 נדל"ן, רג"א, קווליטאו 1083955; logos in `public/logos/`, תמיס logo
pending manual) + `scheduled_calls` (4 mock Q2-2026 calls: תיגבור+רג"א both 19.6 — deliberate
simultaneous-calls test, תמיס 20.6, קווליטאו 29.6; `source='mock'` until MAYA) +
`transcripts.company_id` FK. **MayaClient interface plan**: downstream code talks to the
interface; mock impl reads seeds, real impl polls the TASE Data Hub API (10 req/2s limit) for
call announcements → upserts `scheduled_calls` with `source='maya'`. Known gap: click-word-to-
seek needs per-word timestamps — Recall calls have them; YouTube/IVRIT path doesn't yet
(IVRIT supports word timestamps, never requested). New backend to build with frontend: quotes
table, chat endpoints, live productionization (see Core 1).

**V1 status (2026-06-13):** Frontend is at an OK-and-improving baseline (full-screen shell,
slim nav, bilingual EN/HE). Current focus = **Spec 1: transcript experience + chat**
(`docs/superpowers/specs/2026-06-13-transcript-experience-and-chat-design.md`): a YouTube→text
transcript with no audio/sync is poor UX; the product's value is the **synced audio + caption**
experience. The submit pipeline now persists `audio_url` + IVRIT `word_segments` (so the
"YouTube/IVRIT path doesn't have word timestamps" gap above is closed for new transcripts);
legacy rows (e.g. Tigbur Q4) predate that and are re-processed in place via
`scripts/reprocess-audio.mjs`. Locked Spec-2 decisions: **raw-live + polish-after** (Recall raw
captions live, Gemini only after the call), **Railway** as host (permanent webhook URL),
**Zoom Webinars** via Recall (attendee join; registration link + passcode).

**Update (2026-06-14):** Spec 1 shipped and **deployed on Railway → `timlul-ai.com`** (old
product still lives at root routes; new V1 is under `/app/*`, login lands at `/app/home`). Chat
now runs on **Gemini 3.5 Flash**. **Core 1 live-broadcast is integrated into the platform**: the
home "Live Now" + company Overview **auto-detect** a live call (poll `/api/live/state`), and
`/app/live/live` is the V1 transcript page in a streaming "live mode" (`LiveBroadcastView` — real
header/tabs/`TranscriptBody`/`MediaPlayer`, Web-Audio scheduled, buffered, **joins at the live
edge** `liveEdge − buffer`). Data flows via same-origin proxy routes (`/api/live/state`, `/pcm`)
to the live engine (`LIVE_ENGINE_URL`, default the local spike `live-broadcast.mjs`; tunnelled for
the deploy). **First real תמיס Zoom test passed** — full loop + audio↔text sync proven. Test the
rebuilt page on a real call next; see PROGRESS.md for known refinements (live captions are one
block until we capture Recall's per-word speaker; 5-min buffer needed for caption-readiness;
sentence-level correction for big chunks). `scripts/live-replay-engine.mjs` replays a recorded
session as a fake-live feed for testing without Zoom.

**Update (2026-06-14, design pass + chat/player/diarization features):** A V1 **design pass**
folded the Claude-Design look into the working product (refined sizing/motion/shadows; flat-at-rest
+ hover-shadow cards; calendar polish) — see PROGRESS.md. Then four features shipped (branch
`feat/product-enhancements`, merged to `main`):
- **Global persistent audio player** (`src/lib/player/PlayerProvider.tsx` in the app shell + one
  hidden `<audio>`; `GlobalPlayer`, `ShellChrome`, `ReturnToTranscriptChip`): recorded-call audio
  keeps playing across navigation + while chatting. `LiveTranscriptView` now *consumes* the global
  player (no own `<audio>`); `usePlayer`/`usePlayerTime` keep tick re-renders local. Live-broadcast
  view keeps its own Web-Audio engine (separate). Save-quote toast → clickable "My Quotes" (`?tab=quotes`).
- **Streaming chat** — `/api/chat` proxies Gemini `streamGenerateContent` (SSE) → plain-text token
  stream (`x-chat-source` header); client `streamChat()`; **markdown rendered** via `react-markdown`
  + `remark-gfm` + shared `Markdown` (`.md` styles in globals.css). Streams plain+caret, renders
  rich text once settled. Thinking-dots indicator.
- **In-transcript side chat** (`TranscriptChatPanel`) — highlight → ✦ "Ask about this" → side panel
  beside the transcript (audio keeps playing); while open, highlighting auto-references into the
  composer. The composer (`ChatComposer`) is a **unified two-toned box** (warm reference header +
  white input) à la Claude — used by both chats.
- **Diarization editing** (Feature 1) — finished transcripts only: an additive overlay column
  `transcripts.speaker_edits` (`{boundaries:[{atWordIndex,speakerId}]}`); `applySpeakerEdits` in
  `syncEngine` re-segments the flat word stream (pure passthrough when absent → no regression);
  `PATCH /api/transcripts/[id]/diarization` recomputes the full overlay; "Edit speakers" mode in
  the transcript reassigns a selected run to a speaker. **My-Quotes folders** also added earlier
  (`quote_folders` table + `quotes.folder_id`). NEXT: **test the live feature on a real call**.

**Update (2026-06-15, chat polish):** The chat logic + conversation are **starting to get good** —
markdown rendering, streaming, RTL output and the quote-reference flow work and feel much closer to
a real assistant. **Overall the chat interface looks okay right now** — it'll be **better shaped
later and adjusted to match Claude's interface** more precisely. Done this session: dynamic
content-driven RTL on chat output (`detectDir`, not `dir="auto"`); `<br>`-in-table-cell rendering
(tiny self-contained remark plugin, only touches `<br>`, no new dep); flattened the history
reference block (`TranscriptChatPanel`); and the `ChatComposer` reference state **re-done to the
native Claude look** (`Product Reference/refernce chat interface/side-chat-refernce.jpeg`) — flat,
predominantly white, a faint 1px hairline dividing the reference row from the input + a thin outer
hairline border (NOT the earlier grey "sleeve"/puffy card), with the excerpt wrapped in **both an
opening and a closing quote**. *These changes are in the working tree, not yet committed.*
**Known open item (parked):** Hebrew inside a markdown **table** still aligns left instead of hugging
the right — to revisit later.

**Update (2026-06-15, rebrand → Atlas):** Product rebranded תמלול/Timlul → **Atlas** (Hebrew UI:
**אטלס**) across the **V1 app only**. Wordmark = the real logo image via the `BrandWordmark` DS
component (trimmed transparent PNG used as a `currentColor` CSS mask → ink on light, light on dark);
favicon traced from the logo's actual "A" glyph (`scripts/prep-brand-assets.mjs` → `src/app/icon.png`);
locale-aware `<title>`; and Atlas now has a **voice** in chat ("Ask Atlas…" placeholder, "Ask Atlas"
highlight action, "You are Atlas…" prompt). **Colors untouched.** Renamed brand-name uses only — never
the Hebrew noun תמלול ("transcript"). See PROGRESS.md. **Parked (revisit later):** chat visuals/UX +
the Atlas name context keep evolving, and the **in-transcript side-chat** gets its own visual + naming
pass (Atlas will fit there perfectly) — deferred while we build bigger features.

**Update (2026-06-16, Thread A Phase 1 — live→finished "one call"):** Built the **finish hand-off**
(`src/lib/live/finishLiveCall.ts`): an ended live call → a normal finished `transcripts` row (raw text →
Gemini `formatTranscript`; captured words → `word_segments`; captured PCM → MP3 → `audio_url`; **no IVRIT,
no YouTube**), so the existing `loadCompletedCall` → `LiveTranscriptView` renders it with synced-audio
karaoke + the Save-Quote/Ask-Atlas/Share toolbar for free — wiring Core 3's missing input (live output,
not just YouTube). Run/demoed against the recorded session via `scripts/finish-live-call.ts`. Executed +
self-verified — **awaiting admin test** at `/app/live/live-finish-demo-tamis-2026-06-14`. Spec/plan under
`docs/superpowers/`. Phase 2 (live-mode richness) next. See PROGRESS.md.

**Update (2026-06-16, live UX 2A + polish SHIPPED to `main`):** The live→finished transition is live.
One **unified live view** (`LiveSession`/`LiveBroadcastView`; single `LIVE_BUFFER_SEC` buffer, env-overridable
via `NEXT_PUBLIC_LIVE_BUFFER_SEC`) shared by the Home + Company entries. Pure, unit-tested timing in
`src/lib/live/liveTiming.ts` (interpolated edge for smooth timers; `delayedLiveEdge` drains the buffer at
1x after the source ends — no cutoff/jump; `hostedLiveOver` = drain-based finished mode). The **inline
swap**: source ends → `POST /api/live/finish` (idempotent; fires `finishLiveCall`) → client polls the
**non-auth** `GET /api/live/finish` → "View the organized transcript" button → renders `LiveTranscriptView`
in place at the same URL (audio continues via `initialSeek`); `GET /api/live/finished-call/[id]` returns
the `LiveCall`. Refresh-safe (sessionStorage playhead + on-mount status re-derive). `ReturnToTranscriptChip`
uses `PlayerProvider.viewingId` (URL-independent) so it hides during the inline swap. **Gemini fallback**
(merged): GPT-4.1 formatter when Gemini 503s + accurate-IVRIT default + backoff (`transcription.ts`).
NEXT: Phase 2B toolbar-on-live → 2C quote-anchor → 2D unified player.

## Stack

- **Next.js 14 (App Router)** — server components + route handlers; TypeScript; deployed on **Railway**.
- **Supabase** — Postgres, Auth (SSR cookies), Storage (`audio-temp` bucket), RLS on `transcripts`.
- **Transcription**: **IVRIT on RunPod** is the primary engine. Default model is the accurate
  `ivrit-ai/whisper-large-v3-ct2`, with an automatic fallback chain **accurate → turbo
  (`…-turbo-ct2`) → OpenAI Whisper**. **Gemini 3.5 Flash** does formatting, speaker tagging, and
  light contextual correction via a holistic company-aware prompt — with **exponential backoff (4
  attempts) and a GPT-4.1 fallback** when Gemini is overloaded/unavailable (reuses `OPENAI_API_KEY`;
  same prompt). Transcript + word-timings + audio are persisted **before** formatting, so a failed
  format re-runs as a cheap reformat-only pass (no re-download/transcribe; `scripts/reformat.mjs`).
- **Audio**: `yt-dlp` + `ffmpeg` download to 32 kbps mono MP3 @ 16 kHz. On Windows uses `bin/yt-dlp.exe`.
- **Styling**: Tailwind. Brand font **IBM Plex Sans Hebrew**. Dark theme, accent `#C04A00`.

## Architecture map

- **Submit**: `POST /api/transcripts` (`src/app/api/transcripts/route.ts`) — auth-gated, inserts a
  `transcripts` row keyed by videoId, then fires `runPipeline()` fire-and-forget via `setImmediate`.
  A direct DB insert does **not** run the pipeline — only this handler does.
- **Pipeline** (`runPipeline` in the same file): `getVideoInfo` → `downloadAudio` →
  `transcribeAudio` (returns `{ text, engine, model }`) → `formatTranscript` → store `formatted_data`,
  `status='completed'`. Writes `processing_step` at each stage for the UI to poll.
- **Poll**: `GET /api/transcripts/[id]` returns the full row (incl. `status`, `processing_step`,
  `formatted_data`). Frontend `useProcessingTimer` polls every ~3s.
- **View/Edit**: `src/app/transcript/[id]/page.tsx` reads `formatted_data` directly via
  `supabaseAdmin`, renders `TranscriptEditor` (inline edit of company/quarter/speakers/lines +
  highlights, saved via `PUT /api/transcripts/[id]`).
- **Admin delete/rename** (V1, admin-only via `profiles.role='admin'`): `DELETE /api/transcripts/[id]`
  (nulls `scheduled_calls.transcript_id` — that FK has no cascade — deletes the row, quotes
  auto-detach, best-effort removes the `audio-temp` object) and `PATCH /api/transcripts/[id]`
  (renames the call: `formatted_data.company`/`quarter`). UI = `AdminCallControls` (pencil/trash)
  beside each finished call in `CompanyView`'s Investor-Calls tab; the company page passes `isAdmin`.
- **Transcription internals** (`src/lib/transcription.ts`):
  - `transcribeAudio` → IVRIT/RunPod primary, Whisper fallback.
  - `parseTitleMeta(videoTitle, today)` — synchronous regex: extracts company name + quarter from the
    YouTube title; no LLM needed.
  - `formatWithGeminiFlash(rawText, company, business)` — single Gemini 3.5 Flash call. Prompt gives
    Gemini the company name + "Israeli public company" context; instructs it to organize by speaker,
    fix confident typos, never rephrase/summarize. 2-attempt retry, 3 min timeout.
  - `parseGeminiOutput(text, metaSpeakers)` — splits on `## Name` or `**Name:**` headers; builds
    speaker registry with partial-name matching; role detection (מנכ→ceo, כספ→cfo, שירן/מנח→moderator);
    Q&A fallback detection via keyword patterns.
  - `formatTranscript` (the exported entry point): orchestrates the three steps above → `buildTranscript`.
- **Types**: `src/lib/types.ts` — `Transcript` is the shape of `formatted_data`
  (`sections[].lines[].text` is the transcript body; `speakers[]`; admin diagnostics `engine`/`model`/
  `processingSecs`).
- **Auth**: `src/lib/auth.ts` (`getCurrentUser`), `src/lib/supabase.ts` (`createServerSupabase`
  cookie client + `supabaseAdmin` service-role client). `src/middleware.ts` protects app routes.

## Conventions

- **RTL discipline**: Hebrew is `dir="rtl"`; numbers/tickers/durations use `font-mono-num` and
  `dir="ltr"`. Mixing Hebrew next to numbers is where bidi bugs appear — test visually.
- **No mock data, no backward-compat cruft.** Real data only. The old `mock-data.ts` was deleted.
- **Route handlers** for API; server components read Supabase directly with `supabaseAdmin`.
- Keep new code in the style of the surrounding file (naming, comment density, Hebrew UI strings).

## Hard-won gotchas (do not re-litigate)

- **PDF**: `react-pdf` and `html2canvas` both garble Hebrew next to numbers. A correct Hebrew PDF
  needs a real browser engine → server-side **Playwright** (`page.pdf()`). `window.print()` is the
  current stopgap and renders Hebrew correctly.
- **Sign-out** is a plain `<a href="/api/auth/signout">`, not a dropdown — a `z-index` overlap let
  `<main>` intercept the click. Don't reintroduce a dropdown.
- **Railway redirects** must derive origin from `x-forwarded-host` / `x-forwarded-proto`, not
  `request.url` (which resolves to an internal `localhost:8080`).
- **PUT validation** is intentionally lenient (`.passthrough()`, `role: z.string()`) — legacy rows
  have `role: "unknown"`. Don't tighten it to an enum.

## Transcript-quality gate (the workflow that matters)

The **`/transcript-review`** skill audits live transcripts (batch real links via
`scripts/transcribe-batch.mjs`, Bearer-token auth with `REVIEWER_EMAIL`/`REVIEWER_PASSWORD`, audit every
line for typos/proper-nouns/speaker/bidi). The gold-measurement tooling (`scripts/run-experiment.ts` +
`scripts/lib/measure-core.ts`) diffs a candidate against a human gold (`scripts/fixtures/ampa-q1-2026.gold.txt`)
and reports *fixed / introduced / remaining* token-errors — used for offline model experiments.
Current pipeline (Gemini 3.5 Flash) produces visually excellent transcripts; formal gold measurement
score: ~40 token-errors on אמפא. Source-side IVRIT biasing is closed (proven no-op).

## Roadmap — backend core missions (in order)

The product process: MAYA API → company profiles + call Zoom links → Recall.ai bots join calls →
live transcript hosted on-platform (audio + captions in sync) → call ends → existing pipeline
produces the polished transcript → stored forever in our DB.

1. **Core 1 — Live Transcript of an investor call** ✅ *ARCHITECTURE PROVEN END-TO-END
   (2026-06-11, real two-person Zoom test)*. The locked pipeline: **Recall bot
   (`recallai_streaming`/`prioritize_accuracy`/`auto`) → realtime endpoints (webhook:
   `transcript.data`, websocket: `audio_mixed_raw.data` — requires `audio_mixed_raw: {}`
   artifact in recording_config) → Gemini 3.5 Flash live correction (company-context prompt,
   constrained fix-words-only, `thinkingBudget: 0` — thinking MUST be off or reasoning leaks
   into captions; 1.5–6s/chunk on paid tier) → buffered broadcast: audio + karaoke captions
   synced, playing ~5 min behind live.** Spike servers: `scripts/live-broadcast.mjs` (the full
   loop incl. viewer page), `scripts/live-player.mjs` (replay player), `scripts/live-bakeoff.mjs`
   (engine A/B harness). **Engine bake-off verdict (measured)**: Recall-accuracy = best Hebrew,
   chunks arrive rolling 72–188s — fits the buffer; Gladia = 2.7s median but error-dense
   (fallback/"instant mode" option); ElevenLabs = no-show ×3, disqualified; IVRIT 45s-chunks =
   close 2nd on quality (~62s delay) but needs audio infra we don't want to run. Post-Gemini,
   Recall-raw and IVRIT-raw converge to near-equal final transcripts.
   **Production to-build (from live-test lessons):** sentence-level correction with anchor
   alignment (350-word chunks break word-count preservation → caption/timestamp misalignment;
   safe fallback = show raw); copy recording+transcript to our storage post-call (Recall
   retention deletes); permanent webhook URL on Railway (spike used throwaway cloudflared
   tunnels — they expire); `live_calls` table + `/live/[id]` page + multi-call concurrency.
   Karaoke caption UX (decided): spoken word **white** on black, upcoming subtle gray, Gemini
   fixes accented `#C04A00`. Paid Gemini tier required (free tier 429s under live load).
2. **Core 2 — Automatic bot fleet from MAYA**. Pull quarterly-call announcements (Zoom links +
   timestamps) from the MAYA/TASE API for every Israeli public company → automatically create
   Recall bots per call → feed Core 1. Must handle many simultaneous calls (report season).
   TASE Data Hub onboarding guide: `MAYA/maya_api-guide.pdf` (registration → app → API key;
   rate limit **10 req / 2 sec**; paid products need Data Sales approval — connection starts
   in the coming days).
3. **Core 3 — Finished transcript** ✅ *pipeline COMPLETE (2026-06-10)*: IVRIT → Gemini 3.5
   Flash (company-aware holistic prompt) → structured transcript. Speakers identified, sections,
   confident typo fixes, yellow flags on uncertain words. Remaining wiring: accept raw text/audio
   from a finished live call (Core 1 output) as input, not just YouTube links. Deliberate
   leftovers: per-company entity DB; IVRIT confidence scores; per-line `startSec`.
4. **Later — full frontend + UX features** (from the partner's incoming product description):
   PDF download (server-side Playwright), share-as-quote, audio playback on click, and more.
   These are valuable but small; they'll be specced with the frontend guide.

## Reviewing code

Use the built-in **`reviewer`** agent for unbiased, cold-context code/security review after a
feature ("review the PDF feature") — no setup needed. See `PROGRESS.md` for the decision log.
