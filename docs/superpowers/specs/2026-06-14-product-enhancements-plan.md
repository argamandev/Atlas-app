# Product Enhancements — Plan (Features 1, 4, 5, 6)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

_Branch: `feat/product-enhancements`. Authored autonomously 2026-06-14 (overnight), blanket-approved
by the founder. Constraint: **do not break the working product** — every feature ends in a green
build + its own commit; production (`main` → Railway) is untouched until reviewed._

## Build order (dependency-driven)

1. **Feature 4 — Global audio player** (foundation; unlocks 6)
2. **Feature 5 — Streaming chat** (raises chat quality; prerequisite for 6 feeling good)
3. **Feature 6 — In-transcript side chat** (depends on 4 + 5)
4. **Feature 1 — Diarization editing** (independent; most complex data-model work; last)

If runway runs short, stop at the last fully-tested, committed feature and report the rest as TODO —
never leave the product half-broken.

---

## Feature 4 — Global persistent audio player (recorded calls)

**Decision (confirmed with user):** recorded transcripts only for now; full player bar on every page;
a separate floating "Return to transcript" chip; no auto-play on open.

**Architecture**
- `PlayerProvider` mounted in the persistent app shell (`/app/layout.tsx` via `MacWindowFrame`),
  holding: current call meta (`id, companyId, title, subtitle, logoUrl, audioUrl, isLive`),
  playback (`playing, currentTime, duration, volume`), and a single hidden `<audio>` element rendered
  once in the shell so navigation never unmounts/restarts it.
- Two hooks: `usePlayer()` (meta + controls — stable) and `usePlayerTime()` (high-freq `currentTime`
  via `useSyncExternalStore` over the audio element, so only the bar + the transcript karaoke re-render
  on tick, not the whole app).
- `GlobalPlayer` — the docked charcoal bar, moved out of the transcript page, **reusing the existing
  `MediaPlayer` UI unchanged**. Rendered by the shell whenever a call is loaded.
- `ReturnToTranscriptChip` — shown on non-transcript routes while a call is loaded; links to
  `/app/live/<id>` (the call's transcript) at the live position. Hidden on the transcript route and
  when the player is closed.
- **Transcript page refactor** (`LiveTranscriptView`): stop owning `<audio>` + `MediaPlayer`. On mount,
  `loadCall` the player with this call (if not already the active call). Drive karaoke from
  `usePlayerTime()`; word-click → `player.seek()`. The live-broadcast view (`LiveBroadcastView`) keeps
  its own engine — out of scope.

**Quick wins**
- Clickable "My Quotes" toast: the save toast gains a `My Quotes →` action → `/app/company/<companyId>?tab=quotes`.
- Company page honours `?tab=quotes` (deep-link the existing tab state).

**Test:** build; dev-server smoke — open a recorded transcript, play, navigate to Home/Chat (audio
keeps playing, bar stays, Return chip appears), click Return (back at position), Save quote → toast →
My Quotes jump.

---

## Feature 5 — Streaming chat

**Goal:** genuine token streaming + polished thinking/typing states (Claude-like).

- `/api/chat` → switch to Gemini `streamGenerateContent` (SSE `alt=sse`), and return a streamed
  `ReadableStream` response (text chunks) instead of a single JSON `reply`. Append a final source
  marker so the client can still render the citation. Keep the same context-stuffing + `thinkingBudget:0`.
- Client (`ChatView`/`sendChat`): consume the stream and render tokens as they arrive (replaces the
  client-side fake `StreamingText` reveal with real streaming). Keep conversation persistence (save the
  full reply once the stream ends).
- Thinking state: a tasteful animated indicator (pulsing dots) until the first token; caret while
  streaming. Keep the existing typewriter empty-state animation the founder likes.
- Graceful fallback: if streaming fails, fall back to the existing single-shot path.

**Test:** build; dev-server smoke — send a message, confirm tokens stream in live; confirm history still
persists; confirm Hebrew + English both stream.

---

## Feature 6 — In-transcript side chat (the special feature)

**Goal:** while reviewing a call, highlight text → popup gains a **Star** action → opens a chat **side
panel** beside the transcript (transcript stays visible, audio keeps playing via Feature 4), seeded with
the selected quote + company context.

- Selection toolbar (already has Save/Share): add **Star** (✦). Star → open the side chat panel and seed
  it with the quote + company + transcript id.
- `TranscriptChatPanel` — a right-side (logical-end) panel rendered within the transcript view; the
  transcript column shrinks, the panel slides in (animated). The panel hosts the Feature-5 chat in a
  compact "panel mode" (reuse `ChatView`'s engine; new lean presentational shell). Audio + karaoke keep
  running because the player is global (Feature 4) and the transcript stays mounted.
- The chat opens pre-seeded: the quote rides as grounding context (like today's `?quote=` path, but
  in-place, no navigation), company + transcript scoped automatically.
- Close the panel → transcript returns to full width.

**Test:** build; dev-server smoke — highlight → Star → panel opens with quote context, ask a question
(streams), audio keeps playing, transcript still scrolls/syncs, close panel.

---

## Feature 1 — Diarization editing (finished transcripts, post-transcription)

**Problem:** speaker turns are derived at load (`loadCall`) by mapping Gemini speaker lines onto IVRIT
word-timings; only speaker *names* persist today (`transcripts.speaker_names`). Need: rename (exists),
**reassign a selected run of text to another speaker**, and **adjust a speaker boundary**.

**Approach — a persisted "manual segmentation" overlay (additive, safe):**
- New nullable column `transcripts.speaker_edits jsonb` (additive migration; current code ignores it).
  Shape: `{ boundaries: { atWordIndex: number, speakerId: string }[] }` — an ordered list of split
  points over the flat word stream. Empty/absent → today's derived behaviour (no regression).
- `loadCall`: after building the flat word-timed list, if `speaker_edits` exists, **re-segment** the flat
  words by these boundaries instead of the derived turns. Word timings untouched → karaoke unaffected.
- Reassign = the user selects a run of words and picks a speaker → insert/adjust boundaries so that run
  belongs to the chosen speaker. Move boundary = a special case of reassign (drag/select to the new
  split). Rename keeps using `speaker_names`. New speaker = add to the registry.
- UI: an **Edit mode** toggle on the finished transcript (not live). In edit mode, selecting words shows
  an "assign to speaker ▾" action; speaker names are inline-editable (exists). Persist via
  `PATCH /api/transcripts/<id>/speakers` extended (or a sibling route) to accept `speaker_edits`.

**Test:** build; dev-server smoke — open a finished transcript, enter edit mode, reassign a run to
another speaker (segment splits + relabels, timings/karaoke intact), reload (persists), rename a speaker.

**Risk note:** this is the most invasive. It will be implemented behind an explicit edit mode and the
overlay is purely additive, so the default (no edits) render path is byte-identical to today.

---

## Definition of done per feature
Green `next build` + `tsc`; a runtime smoke test on the dev server; an isolated commit on the branch.
Branch pushed (no deploy). Morning report covers each feature: what shipped, how it was tested, result,
and any deferred follow-ups.
