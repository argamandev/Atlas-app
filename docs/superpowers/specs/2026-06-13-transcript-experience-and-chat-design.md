# Spec 1 — Transcript Experience + Chat (Tigbur Q4 ready)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-06-13
**Status:** Approved design → ready for implementation plan
**Author:** Claude + Sagi (founder)

## Goal

Turn a finished investor-call transcript (today: Tigbur Group Q4) from a static wall
of text into the real product experience — **audio playing in sync with the words
(karaoke), correct RTL, manageable quotes, editable speakers, working search, an
"Open with LLM" hand-off, and a chat that remembers conversations and knows which
call you're asking about.** This is the gating work before the live-Zoom test, and it
de-risks the live pipeline by proving the same karaoke engine on real recorded audio.

## Why this matters (context)

A YouTube link → text transcript with **no audio and no sync** is a dead end for UX.
The product's value is the *synced audio + caption* experience, live and on replay.
The karaoke engine already exists (`loadCompletedCall` reads `audio_url` +
`word_segments`); the Tigbur Q4 transcript is "dead" only because it was processed
before the pipeline started keeping audio + word-timings. So this spec is mostly
"apply the experience we already built to finished calls, and make the surrounding
tools real."

**Strategic decisions locked in earlier (for context, not all in this spec):**
- Sequencing: **these 9 fixes first**, then live-pipeline productionization (Spec 2).
- Live pipeline: **raw-live + polish-after** (Recall raw captions live, Gemini only
  after the call). Better for many simultaneous sessions.
- Hosting: **Railway** is home; deploying there provides the permanent webhook URL.
- Investor calls are **Zoom Webinars**; Recall supports them (bot joins as attendee).
- "Open with LLM" **replaces** the PDF idea (no PDF in scope).

---

## Scope

**In scope (the 9 items, grouped A–D):**

### A. The synced replay experience (the core)

**#1 — Audio + word-sync on finished calls.**
The submit pipeline must, for every finished transcript: (a) keep the downloaded
audio and store it in a durable Supabase Storage bucket, writing `audio_url` on the
`transcripts` row; (b) request IVRIT word-level timestamps and store them in
`word_segments`. `loadCompletedCall` already serves karaoke + audio from those, so the
page lights up. **Re-process Tigbur Q4 once** so the existing call gets audio +
timings. If timings are ever absent, fall back to today's clean line-level read view.
- Risk: IVRIT word-timestamp quality over a 30–60-min call. Mitigation: the line-level
  fallback already exists; validate visually on Tigbur Q4.

**#2 — Always-RTL transcript content.**
The transcript body must render `dir="rtl"` regardless of UI language (the content is
Hebrew). Today `TranscriptBody` uses `dir="auto"` on the paragraph, which resolves to
LTR when a line starts with a number/Latin character — that's the English-mode bug.
Force RTL on the transcript content container and mirror the speaker/avatar row.

**#5 — Go-to-quote → exact line + highlight.**
When a quote is saved, record a stable **line anchor** (segment id + a short text
anchor + `start_sec`). "Go to quote" navigates to the transcript, **scrolls to that
line, flash-highlights it**, and — if audio exists — also seeks the player there.
Works with or without audio.

**#8 — Refresh button becomes real.**
The circular "sync" button currently does nothing useful (it's conflated with
auto-scroll). Split them: a clearly-labelled **auto-scroll toggle**, and a **refresh**
action that re-fetches the transcript/sync state (`router.refresh()` + re-read).

### B. Quotes & speakers

**#4 — Quote captures the real speaker.**
Saving a quote must read the speaker from the **paragraph the selection sits in** (walk
up from the selection anchor to the segment element and read its speaker), not the
first speaker in the call. Store it on the quote and show it. (Today `saveSelection`
falls back to segment 0 when there are no word-timings → wrong/placeholder speaker.)

**#6 — Edit speaker names.**
The speaker label in the transcript is inline-editable. A rename **persists** to the
transcript (a `speaker_names` override map on the row, applied at load) and **updates
that speaker's saved quotes** (quotes for this transcript whose speaker matches the old
name are updated to the new name). Renaming applies everywhere that speaker appears.

### C. Find & hand-off

**#7 — Working in-transcript search.**
The search box highlights all matches in the transcript, shows a match count, and lets
the user jump **next/prev** between matches (scrolling each into view). RTL-aware.

**#3 → "Open with LLM" (replaces PDF).**
A menu button offering **ChatGPT / Claude / Gemini**. On select: build a framed prompt
(`Here is the {company} {quarter} investor-call transcript:\n\n{full text}\n\nHelp me
analyze it.`), **copy it to the clipboard**, **open the chosen LLM in a new tab**, and
toast *"Transcript copied — paste (⌘/Ctrl+V) into {LLM}."* Rationale: none of the three
reliably accept a full-length transcript via URL (length limits; Gemini has no
pre-fill), so copy-paste is the only method that works for all three at any length.
LLM URLs: ChatGPT `https://chatgpt.com/`, Claude `https://claude.ai/new`, Gemini
`https://gemini.google.com/app`.

### D. Chat productionization

**#9a — Transcript-scoped context.**
The ✦ "open in chat" from a transcript passes **company + that specific call**
(`?company={id}&transcript={id}`). The chat shows a context chip for the call
(e.g. "Tigbur · Q4 2025") and scopes its grounding to **that transcript**, not the whole
company. `getChatContext` gains a `transcriptId` argument; `/api/chat` and `sendChat`
pass it through.

**#9b — Persisted conversations.**
New `chat_conversations` table (per user). The history panel lists past chats (newest
first); clicking one loads its messages; **"New chat" starts a fresh conversation**;
messages are saved as they're sent. Follows the existing DB/in-memory fallback pattern
used by `quotes.ts` so it degrades gracefully if the migration hasn't been applied.

**First execution step:** update `CLAUDE.md` + `PROGRESS.md` to reflect reality
(YT-without-audio = poor UX; synced audio is the core; pre-live-test status; this plan
and the raw-first/Railway/webinar decisions).

**Out of scope (Spec 2 — live pipeline):** permanent webhook on Railway, `live_calls`
table + status/watchdog, `/app/live/[id]` *live* mode, raw-first broadcast (HLS/CDN to
many viewers), copy recording → our storage post-call, multi-call concurrency, Zoom
Webinar join config (registration link + passcode). Captured here so they aren't lost;
designed in their own spec after Spec 1 ships.

---

## Data model changes

`transcripts` (existing table):
- `audio_url text` — durable URL of the call audio (Supabase Storage). *(present per
  prior migration; verify the pipeline actually populates it)*
- `word_segments jsonb` — IVRIT word-timed segments for karaoke. *(present; verify
  populated)*
- `speaker_names jsonb` **(new)** — override map `{ [speakerId]: displayName }` for #6.

`quotes` (existing table):
- ensure `speaker text`, `start_sec numeric`, `transcript_id` exist (they do).
- `anchor jsonb` **(new)** — `{ segmentId, text }` line anchor for #5 go-to-line.

`chat_conversations` **(new table):**
- `id uuid pk`, `user_id uuid`, `title text`, `company_id uuid null`,
  `transcript_id uuid null`, `messages jsonb` (array of `{role, content, source?}`),
  `created_at`, `updated_at`. RLS by `user_id` (consistent with `quotes`).
- V1 keeps messages as a `jsonb` array on the conversation row (context-stuffing
  product, no per-message querying needed) — simplest thing that works.

Storage: a durable **`transcript-audio`** bucket holding the call MP3 (separate from
the ephemeral `audio-temp` working bucket); `audio_url` is a long-lived signed URL the
`<audio>` element can fetch.

---

## Component / file map (design altitude — exact edits in the plan)

- `src/app/api/transcripts/route.ts` — `runPipeline`: persist audio to Storage + write
  `audio_url`; ensure IVRIT word timestamps captured → `word_segments`. (#1)
- `src/lib/live/transcription.ts` — confirm word-timestamp request + parse. (#1)
- `src/components/live/TranscriptBody.tsx` — force RTL; `data-segment`/`data-speaker`
  anchors; inline speaker rename; search highlight + match refs; line highlight. (#2,#4,#5,#6,#7)
- `src/components/live/LiveTranscriptView.tsx` — selection speaker from DOM (#4); search
  state + next/prev (#7); real refresh vs auto-scroll (#8); read quote anchor → scroll +
  highlight + seek (#5); "Open with LLM" menu (#3); transcript-scoped open-in-chat (#9a).
- `src/components/company/QuoteCard.tsx` — go-to uses `anchor` (#5).
- `src/lib/db/transcripts.ts` (or new) — `renameSpeaker(transcriptId, speakerId, name)`
  persisting `speaker_names` + updating matching quotes (#6).
- `src/lib/db/conversations.ts` **(new)** + `src/app/api/conversations/**` **(new)** +
  `src/lib/api/conversations.ts` **(new)** — CRUD with in-memory fallback (#9b).
- `src/lib/chat/context.ts` + `src/app/api/chat/route.ts` + `src/lib/api/chat.ts` —
  `transcriptId` scoping (#9a).
- `src/components/chat/ChatView.tsx` + `src/app/app/chat/page.tsx` + chat history panel —
  load/list/new conversation; persist messages; transcript context chip (#9a,#9b).
- Migrations via Supabase MCP: add `speaker_names`, `quotes.anchor`, `chat_conversations`.

## Error handling

- Missing audio/timings → line-level read view (existing fallback), no crash.
- Storage upload failure → log, keep the transcript (text still works), surface no audio.
- Clipboard blocked (Open with LLM) → still open the LLM tab; toast explains to paste.
- Conversations table absent → in-memory fallback (like `quotes.ts`), chat still works.
- Speaker rename failure → optimistic UI reverts on error.

## Testing

- `npx tsc --noEmit` clean; `node --import tsx --test src/lib/live/syncEngine.test.ts`
  passes.
- **Re-process Tigbur Q4** → karaoke highlight tracks audio; word-click seeks.
- EN-mode transcript renders **RTL** (Playwright screenshot, `locale=en`).
- Search highlights + next/prev jumps; count correct.
- Save a quote mid-paragraph → speaker is that paragraph's speaker; "Go to quote"
  scrolls to + highlights the exact line (and seeks if audio).
- Rename a speaker → persists across reload; that speaker's quotes update.
- "Open with LLM" copies the framed prompt and opens the chosen LLM tab.
- Chat: send messages → reload → conversation persists; "New chat" starts fresh;
  opening chat from the transcript shows the call context chip and grounds on it.
- Verify real rows in Supabase via MCP (`chat_conversations`, updated `quotes`).

## Decisions locked

- 9 fixes before live pipeline. PDF replaced by "Open with LLM". Raw-live + polish-after
  for Spec 2. Railway = home. Webinars handled by Recall (attendee join). Conversations
  stored as one row with a `jsonb` messages array for V1.
