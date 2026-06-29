# CLAUDE.md — Atlas (אטלס)

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

**Atlas** is building the best product for the Israeli public market and its financial
institutions — think **Quartr, but English -Hebrew-native and institutional-only** (no retail). The core
problem: during report season every hedge fund drowns in 200+ investor calls in a few weeks.
The product lets institutional investors track, consume, and extract insights from **every**
Israeli public company's investor calls — live and after the fact — so they can outperform. 
Atlas also innovates with a new way to recieve insights, ideas and deeper insights from the public
Israeli market - with Chat and Agents feature.

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
high-end users only. The UI is **Ltr english with optionality to move to hebrew with RTL-Hebrew interface**; quality and polish matter.

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
תיגבור 1105022, תמיס 1097229 נדל"ן, רג"א, קווליטאו 1083955; logos in `public/logos/`)
+ `scheduled_calls` (4 mock Q2-2026 calls: תיגבור+רג"א both 19.6 — deliberate
simultaneous-calls test, תמיס 20.6, קווליטאו 29.6; `source='mock'` until MAYA) +
`transcripts.company_id` FK. **MayaClient interface plan**: downstream code talks to the
interface; mock impl reads seeds, real impl polls the TASE Data Hub API (10 req/2s limit) for
call announcements → upserts `scheduled_calls` with `source='maya'`. Click-word-to-seek needs
per-word timestamps — Recall calls have them, and the submit pipeline now persists IVRIT
`word_segments` too (legacy rows pre-date that; backfilled via `scripts/reprocess-audio.mjs`).
New backend to build with frontend: quotes table, chat endpoints, live productionization (see Core 1).

**V1 status — current state (2026-06-22):** Spec 1 shipped; the app is **deployed on Railway →
`timlul-ai.com`** (legacy product at root routes; V1 under `/app/*`, login → `/app/home`). The synced
**audio + caption** experience — not plain text — is the product's value. Locked Spec-2 decisions still
in force: **raw-live + polish-after** (Recall raw captions live, Gemini polishes only after the call),
**Railway** host (permanent webhook URL), **Zoom Webinars** via Recall (attendee join; registration link
+ passcode). The blow-by-blow history lives in **`PROGRESS.md`** — this is the synthesis.

**What exists now (key anchors):**
- **Live transcript — productionized, proven on a real ~13-min Zoom test.** One unified live view
  (`LiveSession`/`LiveBroadcastView`) shared by Home + Company "Live Now" (auto-detect via
  `/api/live/state`); single `LIVE_BUFFER_SEC` buffer (env `NEXT_PUBLIC_LIVE_BUFFER_SEC`); pure
  unit-tested timing in `src/lib/live/liveTiming.ts` (`delayedLiveEdge` drains the buffer at 1× after the
  source ends; `hostedLiveOver` = drain-based finished mode). Same-origin proxy routes → live engine
  (`LIVE_ENGINE_URL`, default `scripts/live-broadcast.mjs`). Source ends → view **stays live, drains the
  buffer** → finished recording → **auto-swaps in place to the organized transcript** (audio continues).
  Engine truncates `scripts/out/broadcast-*` per run so the finished transcript is THIS call.
  `scripts/live-replay-engine.mjs` fakes a live feed without Zoom.
- **Live → finished hand-off** (`src/lib/live/finishLiveCall.ts`): an ended live call → a normal finished
  `transcripts` row (raw text → Gemini `formatTranscript`; captured words → `word_segments`; PCM → MP3 →
  `audio_url`; no IVRIT/YouTube), rendered by the same `LiveTranscriptView`. Inline-swap wiring:
  `POST/GET /api/live/finish` (non-auth poll), `GET /api/live/finished-call/[id]`; refresh-safe
  (sessionStorage playhead + on-mount status re-derive).
- **Chat** on **Gemini 3.5 Flash**, **streaming** (`/api/chat` proxies `streamGenerateContent` SSE → token
  stream), **markdown-rendered** (`react-markdown` + `remark-gfm`), content-driven RTL (`detectDir`),
  **GPT-4.1 fallback**. In-transcript **side chat** (`TranscriptChatPanel`) + the unified `ChatComposer`
  reference box; highlight → "Ask Atlas".
- **Global persistent audio player** (`src/lib/player/PlayerProvider.tsx`): recorded-call audio keeps
  playing across navigation + while chatting; `LiveTranscriptView` consumes it. The floating black audio
  pill is chat-aware (`chatOpen` → narrows left of the chat).
- **Diarization editing** (finished transcripts): additive `transcripts.speaker_edits` overlay;
  `applySpeakerEdits` re-segments the flat word stream (pure passthrough when absent → no regression);
  `PATCH /api/transcripts/[id]/diarization`. **My-Quotes folders** (`quote_folders` + `quotes.folder_id`).

**Now / next:** transcript-UI polish (yellow text-selection, minimizable speaker panel, drag-to-scrub bar,
chat-button-on-live, "Open audio bar" chip) is shipped to `main`. Roadmap: **make the LIVE audio bar global**
(hear the call across pages, like the offline player) → then **the second big part: a more advanced
investor-call product built on this layer.**

**Parked (revisit later):** Hebrew inside a markdown **table** still aligns left, not right; chat visuals/UX
+ the in-transcript side-chat get their own visual + naming pass (Atlas will fit there perfectly).

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

## Commands

```bash
npm run dev    # Next.js dev server (localhost:3000)
npm run build  # installs yt-dlp, then `next build`
npm start      # serve the production build
npm test       # unit suites: correction, transcription, measure-core, finishLiveCall, liveTiming
```

Live spike engine (real-call testing): `node scripts/live-broadcast.mjs`. The `/live-test` skill drives
a full real Zoom test; `scripts/live-replay-engine.mjs` fakes a live feed without Zoom.

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
