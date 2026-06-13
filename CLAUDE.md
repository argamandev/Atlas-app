# CLAUDE.md — תמלול (Timlul)

Project memory for Claude. Read this first every session.

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
`scripts/reprocess-audio.mjs`. Next milestone = the **live Zoom test** (Spec 2), with locked
decisions: **raw-live + polish-after** (Recall raw captions live, Gemini only after the call —
scales to many concurrent calls), **Railway** as host (provides the permanent webhook URL), and
**Zoom Webinars** handled by Recall (bot joins as attendee; pass registration link + passcode).

## Stack

- **Next.js 14 (App Router)** — server components + route handlers; TypeScript; deployed on **Railway**.
- **Supabase** — Postgres, Auth (SSR cookies), Storage (`audio-temp` bucket), RLS on `transcripts`.
- **Transcription**: **IVRIT on RunPod** is the primary engine (`ivrit-ai/whisper-large-v3-turbo-ct2`,
  HTTP polling), with **OpenAI Whisper** as fallback if IVRIT errors. **Gemini 3.5 Flash** does
  formatting, speaker tagging, and light contextual correction via a holistic company-aware prompt.
  GPT-4o is no longer in the pipeline.
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
