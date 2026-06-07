# CLAUDE.md — תמלול (Timlul)

Project memory for Claude. Read this first every session.

## What this is

**תמלול** is a Hebrew-language investor-call transcription platform for Israeli financial
analysts. A user pastes a YouTube/Vimeo link to a company's quarterly investor call; the product
downloads the audio, transcribes it (Hebrew-specialized speech-to-text), and produces a clean,
structured, editable transcript — speakers identified, sections, highlights, export.

The UI is **RTL Hebrew**. The audience is professional (funds, analysts), so quality and polish matter.

## Stack

- **Next.js 14 (App Router)** — server components + route handlers; TypeScript; deployed on **Railway**.
- **Supabase** — Postgres, Auth (SSR cookies), Storage (`audio-temp` bucket), RLS on `transcripts`.
- **Transcription**: **IVRIT on RunPod** is the primary engine (`ivrit-ai/whisper-large-v3-turbo-ct2`,
  HTTP polling), with **OpenAI Whisper** as fallback if IVRIT errors. **GPT-4o** does formatting,
  metadata extraction, speaker tagging, and a correction pass.
- **Audio**: `yt-dlp` + `ffmpeg` download to 32 kbps mono MP3 @ 16 kHz. On Windows uses `bin/yt-dlp.exe`.
- **Styling**: Tailwind. Brand font **IBM Plex Sans Hebrew**. Dark theme, accent `#C04A00`.

## Architecture map

- **Submit**: `POST /api/transcripts` (`src/app/api/transcripts/route.ts`) — auth-gated, inserts a
  `transcripts` row keyed by videoId, then fires `runPipeline()` fire-and-forget via `setImmediate`.
  A direct DB insert does **not** run the pipeline — only this handler does.
- **Pipeline** (`runPipeline` in the same file): `getVideoInfo` → `downloadAudio` →
  `transcribeAudio` (returns `{ text, engine, model }`) → `formatWithGPT4o` → store `formatted_data`,
  `status='completed'`. Writes `processing_step` at each stage for the UI to poll.
- **Poll**: `GET /api/transcripts/[id]` returns the full row (incl. `status`, `processing_step`,
  `formatted_data`). Frontend `useProcessingTimer` polls every ~3s.
- **View/Edit**: `src/app/transcript/[id]/page.tsx` reads `formatted_data` directly via
  `supabaseAdmin`, renders `TranscriptEditor` (inline edit of company/quarter/speakers/lines +
  highlights, saved via `PUT /api/transcripts/[id]`).
- **Transcription internals** (`src/lib/transcription.ts`): `transcribeAudio`, `transcribeWithIvrit`
  (uses `IVRIT_MODEL`, overridable via `RUNPOD_IVRIT_MODEL`), `formatWithGPT4o`, and the correction
  system — `KNOWN_CORRECTIONS` (curated exact-phrase Hebrew fixes), `buildCorrectionMap` (GPT
  proposes more), `isSafeCorrection` (guards against risky multi-word changes), `applyCorrections`.
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

"Perfect transcripts" (Feature 1) is **not** done on code changes alone. It's validated by the
**`/transcript-review`** skill: a batch run of real YouTube links through the live local product
(`scripts/transcribe-batch.mjs`), followed by an audit of every line for Hebrew typos, proper-noun
errors, speaker mislabeling, and bidi issues. The reviewer reports proposed `KNOWN_CORRECTIONS`
additions; the main agent vets + applies them and re-runs until the report is clean. Only a clean
report unlocks Feature 2. The batch script authenticates via a **Bearer token** (reviewer account in
`REVIEWER_EMAIL`/`REVIEWER_PASSWORD`) against the same API the browser uses.

## Roadmap

1. **Feature 1 — Perfect transcripts** (in progress). IVRIT confirmed as engine (admin badge);
   corrections wired. Iterate via `/transcript-review`. Also lay the audio/timing foundation
   (persist call audio + per-line `startSec`) needed by Feature 3.
2. **Feature 2 — Real PDF download**. Rename current export to "הדפסה"; add "הורד PDF" via
   server-side Playwright route `POST /api/transcripts/[id]/pdf` with a "נוצר על ידי תמלול." footer.
3. **Feature 3 — Highlight actions / share**. Selection popover: סימון (mark), שיתוף כציטוט
   (WhatsApp/email/native share), לשמוע בהקלטה (sticky audio player seeking to a line's `startSec`).

## Reviewing code

Use the built-in **`reviewer`** agent for unbiased, cold-context code/security review after a
feature ("review the PDF feature") — no setup needed. See `PROGRESS.md` for the decision log.
