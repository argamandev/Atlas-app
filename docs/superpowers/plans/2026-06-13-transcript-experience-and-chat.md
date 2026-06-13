# Transcript Experience + Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a finished investor-call transcript (Tigbur Q4) the real product — audio-synced karaoke, always-RTL, manageable quotes, editable speakers, working search, an "Open with LLM" hand-off, and a chat that remembers conversations and knows which call you're asking about.

**Architecture:** Next.js 14 App Router. The karaoke engine (`loadCompletedCall` → `TranscriptBody`) already reads `audio_url` + `word_segments`; the submit pipeline already persists both. Most work is (a) re-processing the legacy Tigbur row, (b) UI/UX on the live-transcript view, and (c) a new persisted-conversations layer mirroring the existing `quotes.ts` DB pattern (DB-with-in-memory-fallback, `globalThis`-backed). New persistence: `transcripts.speaker_names`, `quotes.anchor`, `chat_conversations` table.

**Tech Stack:** TypeScript, Next.js 14, Supabase (Postgres + Storage + MCP for migrations), Tailwind, IVRIT/RunPod, `node --import tsx --test` for unit tests.

---

## Spec

Source of truth: `docs/superpowers/specs/2026-06-13-transcript-experience-and-chat-design.md`. Read it before starting.

## File Structure (what changes and why)

**New files**
- `supabase/migrations/20260613_009_speaker_names_quote_anchor_conversations.sql` — schema for `speaker_names`, `quotes.anchor`, `chat_conversations`.
- `src/lib/live/llmHandoff.ts` (+ `.test.ts`) — pure builder for the "Open with LLM" prompt + the 3 LLM targets.
- `src/lib/live/search.ts` (+ `.test.ts`) — pure transcript search (find match positions across word-flattened transcript).
- `src/lib/db/conversations.ts` — persisted chat conversations (mirror of `quotes.ts` DB/in-memory fallback).
- `src/lib/api/conversations.ts` — client fetchers for conversations.
- `src/app/api/conversations/route.ts` — `GET` list + `POST` create.
- `src/app/api/conversations/[id]/route.ts` — `GET` one + `PATCH` (append/replace messages, rename) + `DELETE`.
- `src/app/api/transcripts/[id]/speakers/route.ts` — `PATCH` rename a speaker.
- `src/components/chat/ChatHistory.tsx` — client history list (list / new / open).
- `scripts/reprocess-audio.mjs` — one-off: re-run download+transcribe on an existing transcript row to backfill `audio_url` + `word_segments`.

**Modified files**
- `CLAUDE.md`, `PROGRESS.md` — reflect current reality (Task 0).
- `src/lib/api/types.ts` — `QuoteAnchor` type; `Quote.anchor`; `Conversation` types.
- `src/lib/db/quotes.ts` — persist/read `anchor`; `renameSpeakerInQuotes` helper.
- `src/lib/db/transcripts.ts` (NEW small file) — `renameSpeaker` (writes `speaker_names`, updates quotes).
- `src/lib/live/loadCall.ts` — apply `speaker_names` overrides; stable `segmentId` on segments.
- `src/components/live/TranscriptBody.tsx` — force RTL; `data-segment-id`/`data-speaker`; inline speaker rename; search highlight + refs.
- `src/components/live/LiveTranscriptView.tsx` — selection→paragraph speaker; search bar; refresh vs auto-scroll; anchor scroll+highlight; "Open with LLM" menu; transcript-scoped open-in-chat.
- `src/components/company/QuoteCard.tsx` — go-to passes anchor.
- `src/app/app/live/[id]/page.tsx` — read `seg` param; pass `speakerNames`.
- `src/lib/chat/context.ts`, `src/app/api/chat/route.ts`, `src/lib/api/chat.ts` — `transcriptId` scoping.
- `src/components/chat/ChatView.tsx`, `src/app/app/chat/page.tsx` — conversation persistence + transcript context chip.
- `src/lib/i18n/dictionaries/en.ts` + `he.ts` — new strings.

---

## Task 0: Update CLAUDE.md + PROGRESS.md to current reality

**Files:**
- Modify: `CLAUDE.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update CLAUDE.md V1 status**

In `CLAUDE.md`, under the V1 section, add a short status paragraph reflecting reality. Insert after the "V1 data layer (LIVE in Supabase...)" paragraph:

```markdown
**V1 status (2026-06-13):** Frontend is at an OK-and-improving baseline (full-screen
shell, slim nav, bilingual EN/HE). Current focus = **Spec 1: transcript experience +
chat** (`docs/superpowers/specs/2026-06-13-transcript-experience-and-chat-design.md`):
a YouTube→text transcript with no audio/sync is poor UX; the product's value is the
**synced audio + caption** experience. The submit pipeline already persists `audio_url`
+ `word_segments`; legacy transcripts (e.g. Tigbur Q4) predate that and are being
re-processed. Next milestone = the **live Zoom test** (Spec 2), with locked decisions:
**raw-live + polish-after** (Recall raw captions live, Gemini only after the call),
**Railway** as host (provides the permanent webhook URL), and **Zoom Webinars** handled
by Recall (bot joins as attendee; pass registration link + passcode).
```

- [ ] **Step 2: Update PROGRESS.md decision log**

Append a dated entry to `PROGRESS.md` (match its existing format — read the last entry first and mirror its heading style):

```markdown
## 2026-06-13 — Spec 1 (transcript experience + chat) + live-pipeline direction

- Diagnosed: finished YouTube transcripts show no audio / no word-sync because legacy
  rows predate the `audio_url` + `word_segments` pipeline. Fix = re-process in place
  (`scripts/reprocess-audio.mjs`), not a pipeline rewrite.
- Scoped Spec 1: 9 transcript/chat fixes (audio karaoke on finished calls, always-RTL,
  go-to-line+highlight, real refresh, paragraph-correct quote speaker, editable speaker
  names, working search, "Open with LLM" replacing PDF, transcript-scoped chat context,
  persisted conversations).
- Core-tech review of the live pipeline. Locked: **raw-live + polish-after** (no LLM in
  the live path — scales to many concurrent calls), **Railway** host (= permanent
  webhook URL for free), Recall supports **Zoom Webinars** (bot as attendee). Spec 2
  will productionize the live broadcast; the finished live call reuses Spec 1's replay.
- PDF dropped in favour of "Open with LLM" (ChatGPT/Claude/Gemini hand-off).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md PROGRESS.md
git commit -m "docs: reflect Spec 1 scope + live-pipeline direction in CLAUDE/PROGRESS"
```

---

## Task 1: Database migration (speaker_names, quote anchor, conversations)

**Files:**
- Create: `supabase/migrations/20260613_009_speaker_names_quote_anchor_conversations.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260613_009: speaker-name overrides, quote line-anchor, persisted chat conversations.

-- #6 editable speaker names: override map { [speakerId]: displayName } applied at load.
alter table public.transcripts add column if not exists speaker_names jsonb;

-- #5 go-to-quote: stable line anchor { segmentId, text } captured when a quote is saved.
alter table public.quotes add column if not exists anchor jsonb;

-- #9b persisted conversations. Messages kept inline as a jsonb array (V1: context-stuffing,
-- no per-message querying). No hard FKs — mirrors quotes.transcript_id (plain text id).
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New chat',
  company_id uuid,
  transcript_id text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

-- App code uses the service role (bypasses RLS); this owner policy is a safety net for any
-- future anon-key access. Drop-then-create so the migration is re-runnable.
drop policy if exists chat_conversations_owner on public.chat_conversations;
create policy chat_conversations_owner on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with name `20260613_009_speaker_names_quote_anchor_conversations` and the SQL above.
Expected: success. Then run `mcp__supabase__list_tables` and confirm `chat_conversations` exists with columns `id, user_id, title, company_id, transcript_id, messages, created_at, updated_at`, and that `transcripts.speaker_names` and `quotes.anchor` exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613_009_speaker_names_quote_anchor_conversations.sql
git commit -m "feat(db): speaker_names, quote anchor, chat_conversations (migration 009)"
```

---

## Task 2: #1 — Re-process Tigbur Q4 to backfill audio + word-sync

The pipeline already uploads audio to the `audio-temp` bucket (kept) and writes `audio_url` + `word_segments`. Legacy rows just predate it. This task adds a reusable backfill script and runs it for Tigbur Q4.

**Files:**
- Create: `scripts/reprocess-audio.mjs`

- [ ] **Step 1: Write the backfill script**

```js
// Backfill audio_url + word_segments on an existing transcript row by re-running the
// download + IVRIT transcription on its stored youtube_url. Keeps formatted_data as-is.
// Usage: node --import tsx --env-file=.env.local scripts/reprocess-audio.mjs <transcriptId>
import { supabaseAdmin } from '../src/lib/supabase.ts'
import { downloadAudio, transcribeAudio } from '../src/lib/transcription.ts'
import { existsSync, unlinkSync } from 'node:fs'

const id = process.argv[2]
if (!id) {
  console.error('usage: reprocess-audio.mjs <transcriptId>')
  process.exit(1)
}

const { data, error } = await supabaseAdmin
  .from('transcripts')
  .select('id, youtube_url')
  .eq('id', id)
  .maybeSingle()
if (error || !data) {
  console.error('row not found:', error?.message)
  process.exit(1)
}
if (!data.youtube_url) {
  console.error('row has no youtube_url — cannot re-download')
  process.exit(1)
}

let audioPath = null
try {
  console.log(`[reprocess] downloading ${data.youtube_url}`)
  audioPath = await downloadAudio(data.youtube_url)
  console.log('[reprocess] transcribing (IVRIT word timestamps)…')
  const { audioUrl, segments } = await transcribeAudio(audioPath)
  const withWords = (segments ?? []).filter((s) => s.words?.length).length
  console.log(`[reprocess] audioUrl=${audioUrl ? 'ok' : 'none'} segments=${segments?.length ?? 0} withWords=${withWords}`)
  const { error: updErr } = await supabaseAdmin
    .from('transcripts')
    .update({ audio_url: audioUrl ?? null, word_segments: segments ?? null })
    .eq('id', id)
  if (updErr) throw new Error(updErr.message)
  console.log('[reprocess] DONE — row updated')
} finally {
  if (audioPath && existsSync(audioPath)) unlinkSync(audioPath)
}
process.exit(0)
```

- [ ] **Step 2: Find the Tigbur Q4 transcript id**

Use the `mcp__supabase__execute_sql` tool:
```sql
select id, youtube_title, status, audio_url is not null as has_audio,
       word_segments is not null as has_words, company_id
from public.transcripts
where youtube_title ilike '%תיגבור%' or youtube_title ilike '%tigbur%'
order by created_at desc;
```
Note the `id` of the Q4 row (and confirm `has_audio=false`).

- [ ] **Step 3: Run the backfill**

```bash
node --import tsx --env-file=.env.local scripts/reprocess-audio.mjs <tigbur-q4-id>
```
Expected: logs end with `audioUrl=ok segments=<N> withWords=<M>` (M > 0) and `DONE — row updated`. If `withWords=0`, IVRIT returned no word timings for this audio — stop and report (the line-level fallback still works, but karaoke needs word timings).

- [ ] **Step 4: Verify in the UI**

Start the dev server (`npm run dev`, port 3210) and open `/app/live/<tigbur-q4-id>`. Expected: audio plays, the active word highlights and tracks the audio, clicking a word seeks. Speakers may show as "Speaker 1/2" (diarized) — that's fixed by Task 6.

- [ ] **Step 5: Commit**

```bash
git add scripts/reprocess-audio.mjs
git commit -m "feat(scripts): reprocess-audio backfill for legacy transcripts (#1)"
```

---

## Task 3: #2 — Always-RTL transcript content

The transcript is Hebrew; it must read RTL even in English UI mode. Today `TranscriptBody` uses `dir="auto"` (resolves to LTR when a line starts with a digit/Latin char).

**Files:**
- Modify: `src/components/live/TranscriptBody.tsx`

- [ ] **Step 1: Force RTL on the transcript root and rows**

In `src/components/live/TranscriptBody.tsx`, set the outer container to RTL and let the speaker row mirror. Change the root wrapper:

```tsx
    <div dir="rtl" className="space-y-7 text-right">
```

And change the paragraph from `dir="auto"` to inherit RTL (remove the `dir="auto"`):

```tsx
            <p className="mt-1.5 text-[15px] leading-[1.9] text-ink">
```

- [ ] **Step 2: Verify in English mode**

With the dev server running, set the locale cookie to `en` and open `/app/live/<tigbur-q4-id>`. Expected: the transcript reads right-to-left (avatar on the right, Hebrew text right-aligned) identically to Hebrew mode. Timestamps stay LTR (`dir="ltr"` already on the clock span).

- [ ] **Step 3: Commit**

```bash
git add src/components/live/TranscriptBody.tsx
git commit -m "fix(transcript): always render Hebrew transcript RTL (#2)"
```

---

## Task 4: #4 — Quote captures the paragraph's speaker

Saving a quote must read the speaker from the paragraph the selection sits in, not segment 0. Add DOM anchors in `TranscriptBody`, and resolve them in `LiveTranscriptView.saveSelection`.

**Files:**
- Modify: `src/components/live/TranscriptBody.tsx`
- Modify: `src/components/live/LiveTranscriptView.tsx`

- [ ] **Step 1: Add segment anchors to the transcript DOM**

In `TranscriptBody.tsx`, add `data-segment-id` and `data-speaker` to each segment's wrapper. Change the segment map's outer `<div>`:

```tsx
        <div key={seg.id} data-segment-id={seg.id} data-speaker={seg.speakerName} className="flex gap-3">
```

- [ ] **Step 2: Resolve the speaker from the selection in LiveTranscriptView**

In `LiveTranscriptView.tsx`, add a helper that walks up from the selection's anchor node to the nearest `[data-segment-id]` and reads `data-speaker`. Add above `onTextSelect`:

```tsx
  // The speaker of the paragraph a DOM selection sits in (or null if outside the transcript).
  function selectionSpeaker(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-speaker') ?? null
  }
```

Then capture it into selection state. Change `setSelection({ text, top: rect.top, left: rect.left + rect.width / 2 })` to include the speaker:

```tsx
    setSelection({ text, top: rect.top, left: rect.left + rect.width / 2, speaker: selectionSpeaker(sel) })
```

Update the `selection` state type:

```tsx
  const [selection, setSelection] = useState<{ text: string; top: number; left: number; speaker: string | null } | null>(null)
```

And in `saveSelection`, use the captured speaker instead of `activeSpeaker`. Change the signature and body to take the selection object:

```tsx
  async function saveSelection(sel: { text: string; speaker: string | null }) {
    if (!sel.text) return
    if (!call.companyId) {
      setToast(dict.common.error)
      return
    }
    try {
      await createQuote({
        companyId: call.companyId,
        transcriptId: call.id === 'demo' ? null : call.id,
        text: sel.text,
        speaker: sel.speaker ?? activeSpeaker,
        quarter: call.quarter,
        startSec: currentTime,
      })
      setToast(dict.live.quoteSaved)
    } catch (err) {
      setToast((err as Error).message)
    }
  }
```

Update the selection-toolbar Save button to pass the object: change `onClick={() => { void saveSelection(selection.text); setSelection(null) }}` to:

```tsx
            onClick={() => {
              void saveSelection(selection)
              setSelection(null)
            }}
```

(`shareSelection(selection.text)` stays as-is.)

- [ ] **Step 3: Verify**

On `/app/live/<id>`, select text inside a non-first speaker's paragraph → Save → open the company's My Quotes. Expected: the saved quote shows that paragraph's speaker name, not the first speaker.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/TranscriptBody.tsx src/components/live/LiveTranscriptView.tsx
git commit -m "fix(quotes): capture the selected paragraph's speaker (#4)"
```

---

## Task 5: #5 — Go-to-quote scrolls to the exact line + highlights

Store a `{ segmentId, text }` anchor on the quote at save time; "Go to quote" navigates with the segment id, scrolls to it, flash-highlights, and seeks audio if present.

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/db/quotes.ts`
- Modify: `src/lib/api/quotes.ts`
- Modify: `src/app/api/quotes/route.ts`
- Modify: `src/components/live/LiveTranscriptView.tsx`
- Modify: `src/components/company/QuoteCard.tsx`
- Modify: `src/app/app/live/[id]/page.tsx`

- [ ] **Step 1: Add the anchor type**

In `src/lib/api/types.ts`, add the type and field:

```ts
export interface QuoteAnchor {
  segmentId: string
  text: string
}
```
And in `interface Quote`, add after `startSec`:
```ts
  anchor: QuoteAnchor | null
```

- [ ] **Step 2: Persist + read anchor in the DB layer**

In `src/lib/db/quotes.ts`:
- In `mapQuote`, add to the returned object: `anchor: (r.anchor as QuoteAnchor) ?? null,` and import the type: change the import to `import type { Quote, QuoteAnchor } from '@/lib/api/types'`.
- In `NewQuote`, add `anchor?: QuoteAnchor | null`.
- In `createQuote`, add `anchor: input.anchor ?? null,` to the `.insert({...})` object, add `anchor` to every `.select('… start_sec, anchor, created_at')` column list (there are select lists in `listQuotes`, `createQuote`, `updateQuote`), and add `anchor: input.anchor ?? null,` to the in-memory `quote` object.

- [ ] **Step 3: Thread anchor through the API + client**

In `src/app/api/quotes/route.ts` (the POST handler), include `anchor` when calling `createQuote` — find where it builds the `NewQuote` from the body and add `anchor: body.anchor ?? null`.
In `src/lib/api/quotes.ts`, add `anchor?: QuoteAnchor | null` to `NewQuoteInput` (import the type) so the client can send it.

- [ ] **Step 4: Build the anchor when saving a quote**

In `LiveTranscriptView.tsx`, extend `selectionSpeaker`'s capture to also record the enclosing segment id. Add a helper:

```tsx
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-segment-id') ?? null
  }
```

Add `segmentId` to the selection state type and capture it in `onTextSelect`:
```tsx
  const [selection, setSelection] = useState<
    { text: string; top: number; left: number; speaker: string | null; segmentId: string | null } | null
  >(null)
```
```tsx
    setSelection({
      text,
      top: rect.top,
      left: rect.left + rect.width / 2,
      speaker: selectionSpeaker(sel),
      segmentId: selectionSegmentId(sel),
    })
```
In `saveSelection`, pass the anchor to `createQuote`:
```tsx
        anchor: sel.segmentId ? { segmentId: sel.segmentId, text: sel.text.slice(0, 80) } : null,
```
(extend the `saveSelection` param type to `{ text: string; speaker: string | null; segmentId: string | null }`).

- [ ] **Step 5: Make Go-to-quote pass the anchor**

In `QuoteCard.tsx`, change `goToQuote`:

```tsx
  function goToQuote() {
    if (!quote.transcriptId) return
    const t = Math.max(0, Math.floor(quote.startSec ?? 0))
    const seg = quote.anchor?.segmentId ? `&seg=${encodeURIComponent(quote.anchor.segmentId)}` : ''
    router.push(`/app/live/${quote.transcriptId}?t=${t}${seg}`)
  }
```

- [ ] **Step 6: Scroll + highlight the target line on the live page**

In `src/app/app/live/[id]/page.tsx`, read the `seg` param and pass it down:

```tsx
  searchParams,
}: {
  params: { id: string }
  searchParams: { t?: string; seg?: string }
}) {
```
```tsx
  return (
    <AppPage>
      <LiveTranscriptView call={call} initialSeek={initialSeek} initialSegmentId={searchParams.seg} />
    </AppPage>
  )
```

In `LiveTranscriptView.tsx`, accept `initialSegmentId?: string` in props, and add an effect that scrolls to + flash-highlights it after mount:

```tsx
  useEffect(() => {
    if (!initialSegmentId) return
    const el = document.querySelector(`[data-segment-id="${CSS.escape(initialSegmentId)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('quote-flash')
    const t = setTimeout(() => el.classList.remove('quote-flash'), 2000)
    return () => clearTimeout(t)
  }, [initialSegmentId])
```

Add the flash style to `src/app/globals.css`:

```css
@keyframes quoteFlash { 0%,100% { background: transparent } 20% { background: rgba(192,74,0,0.14) } }
.quote-flash { animation: quoteFlash 2s ease-out; border-radius: 8px; }
```

- [ ] **Step 7: Verify**

Save a quote → My Quotes → "Go to quote". Expected: navigates to the transcript, scrolls to that paragraph, the paragraph flashes orange, and (if audio) the player seeks to that time.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api/types.ts src/lib/db/quotes.ts src/lib/api/quotes.ts src/app/api/quotes/route.ts src/components/live/LiveTranscriptView.tsx src/components/company/QuoteCard.tsx src/app/app/live/[id]/page.tsx src/app/globals.css
git commit -m "feat(quotes): go-to-quote scrolls to exact line + highlights (#5)"
```

---

## Task 6: #6 — Edit speaker names (persisted, propagates to quotes)

Inline-rename a speaker on the transcript; persist a `speaker_names` override on the row, apply it at load, and update that speaker's quotes.

**Files:**
- Create: `src/lib/db/transcripts.ts`
- Create: `src/app/api/transcripts/[id]/speakers/route.ts`
- Modify: `src/lib/db/quotes.ts` (add `renameSpeakerInQuotes`)
- Modify: `src/lib/live/loadCall.ts` (apply overrides + stable segment ids)
- Modify: `src/app/app/live/[id]/page.tsx` (pass speakerNames)
- Modify: `src/components/live/LiveTranscriptView.tsx` + `TranscriptBody.tsx` (inline edit)
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts`

- [ ] **Step 1: Add `renameSpeakerInQuotes` to quotes DB layer**

In `src/lib/db/quotes.ts`, add:

```ts
// Keep saved quotes in sync when a speaker is renamed in the transcript.
export async function renameSpeakerInQuotes(transcriptId: string, oldName: string, newName: string): Promise<void> {
  if (!flags.quotes) {
    const { error } = await supabaseAdmin
      .from('quotes')
      .update({ speaker: newName })
      .eq('transcript_id', transcriptId)
      .eq('speaker', oldName)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  for (const arr of quoteMem.values()) {
    for (const q of arr) if (q.transcriptId === transcriptId && q.speaker === oldName) q.speaker = newName
  }
}
```

- [ ] **Step 2: Add the transcript speaker-rename data function**

Create `src/lib/db/transcripts.ts`:

```ts
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { renameSpeakerInQuotes } from './quotes'

// Override map { [speakerId]: displayName } merged over the transcript's speakers at load.
export async function renameSpeaker(
  transcriptId: string,
  speakerId: string,
  newName: string,
  oldName: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('speaker_names')
    .eq('id', transcriptId)
    .maybeSingle()
  const map = { ...((data?.speaker_names as Record<string, string> | null) ?? {}), [speakerId]: newName }
  const { error } = await supabaseAdmin.from('transcripts').update({ speaker_names: map }).eq('id', transcriptId)
  if (error) throw new Error(error.message)
  if (oldName && oldName !== newName) await renameSpeakerInQuotes(transcriptId, oldName, newName)
}
```

- [ ] **Step 3: Add the PATCH route**

Create `src/app/api/transcripts/[id]/speakers/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { renameSpeaker } from '@/lib/db/transcripts'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null)
  const speakerId: string | undefined = body?.speakerId
  const name: string | undefined = body?.name?.trim()
  const oldName: string = body?.oldName ?? ''
  if (!speakerId || !name) return NextResponse.json({ error: 'speakerId and name required' }, { status: 400 })
  try {
    await renameSpeaker(params.id, speakerId, name, oldName)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Apply overrides + stable ids at load**

In `src/lib/live/loadCall.ts`:
- `buildFromIvrit` already assigns `id: seg-N` and `speakerName: 'Speaker N'`. Add an `overrides` param and apply it. Change the signature to `function buildFromIvrit(segs: IvritSegment[], overrides: Record<string, string> = {}): WordTimedTranscript` and when creating each segment set `speakerName: overrides[key] ?? \`Speaker ${spkIndex.get(key)}\``, and for the no-speakers branch `speakerName: overrides['s0'] ?? 'דובר'`. The override key is the `speakerId` (`key` / `'s0'`).
- In `loadCompletedCall`, read `speaker_names`: add `speaker_names` to the `.select(...)` list, then `const overrides = (data.speaker_names as Record<string, string> | null) ?? {}` and pass it: `transcript: buildFromIvrit(wordSegs, overrides)`. For the line-level branch, apply overrides in `nameOf`: `const nameOf = (sid: string) => overrides[sid] ?? fd.speakers?.find((s) => s.id === sid)?.name ?? 'Speaker'`.

- [ ] **Step 5: Add dictionary strings**

In `en.ts` `live` block add: `editSpeaker: 'Edit speaker name',` `saveSpeaker: 'Save',`. In `he.ts` `live` block add: `editSpeaker: 'עריכת שם הדובר',` `saveSpeaker: 'שמירה',`.

- [ ] **Step 6: Inline-edit UI in TranscriptBody**

`TranscriptBody` is currently presentational. Add an optional `onRenameSpeaker?: (segmentId: string, speakerId: string, oldName: string) => void` prop and make the speaker name a button that triggers it. Since the rename needs an input, implement the input inline: add local state `editing: { id: string; value: string } | null` and render an `<input>` when editing, else the name as a click-to-edit button. Add to props:

```tsx
  onRenameSpeaker,
}: {
  …
  onRenameSpeaker?: (segmentId: string, speakerId: string, oldName: string, newName: string) => void
}) {
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
```
Replace the speaker name span:
```tsx
              {editing?.id === seg.id ? (
                <input
                  autoFocus
                  dir="rtl"
                  value={editing.value}
                  onChange={(e) => setEditing({ id: seg.id, value: e.target.value })}
                  onBlur={() => {
                    const v = editing.value.trim()
                    if (v && v !== seg.speakerName) onRenameSpeaker?.(seg.id, seg.speakerId, seg.speakerName, v)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-40 rounded border border-hairline bg-canvas px-1.5 py-0.5 text-sm font-bold text-ink outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing({ id: seg.id, value: seg.speakerName })}
                  className="text-sm font-bold text-ink hover:underline"
                  title={dict.live.editSpeaker}
                >
                  {seg.speakerName}
                </button>
              )}
```
Add the imports: `import { useEffect, useMemo, useRef, useState } from 'react'` and `import { useI18n } from '@/lib/i18n/LocaleProvider'` with `const { dict } = useI18n()` at the top of the component.

- [ ] **Step 7: Wire rename in LiveTranscriptView**

In `LiveTranscriptView.tsx`, pass `onRenameSpeaker` to `TranscriptBody`. Rename calls the route and refreshes. Add:

```tsx
  async function renameSpeaker(_segmentId: string, speakerId: string, oldName: string, newName: string) {
    if (call.id === 'demo') return
    try {
      await fetch(`/api/transcripts/${call.id}/speakers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ speakerId, name: newName, oldName }),
      })
      router.refresh()
      setToast(dict.common.save)
    } catch (err) {
      setToast((err as Error).message)
    }
  }
```
and on `<TranscriptBody … onRenameSpeaker={renameSpeaker} />`.

- [ ] **Step 8: Verify**

Re-processed Tigbur Q4 shows "Speaker 1/2"; click one, type a real name, Enter. Expected: name persists across reload (override stored), and any quote saved under that speaker now shows the new name.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/transcripts.ts src/app/api/transcripts/[id]/speakers/route.ts src/lib/db/quotes.ts src/lib/live/loadCall.ts src/app/app/live/[id]/page.tsx src/components/live/LiveTranscriptView.tsx src/components/live/TranscriptBody.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "feat(transcript): editable speaker names, persisted + propagated to quotes (#6)"
```

---

## Task 7: #7 — Working in-transcript search

Search highlights all matches, shows a count, and jumps next/prev. Pure match-finding lives in a tested helper; the UI wires it to scroll.

**Files:**
- Create: `src/lib/live/search.ts`
- Create: `src/lib/live/search.test.ts`
- Modify: `src/components/live/LiveTranscriptView.tsx`
- Modify: `src/components/live/TranscriptBody.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/live/search.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMatches } from './search'
import type { WordTimedTranscript } from './syncEngine'

const t: WordTimedTranscript = {
  durationSec: 10,
  hasWordTimings: true,
  segments: [
    { id: 'seg-0', speakerId: 's1', speakerName: 'A', role: null, start: 0, end: 5,
      words: [ { text: 'רווח', start: 0, end: 1 }, { text: 'גולמי', start: 1, end: 2 }, { text: 'רווח', start: 2, end: 3 } ] },
    { id: 'seg-1', speakerId: 's2', speakerName: 'B', role: null, start: 5, end: 10,
      words: [ { text: 'הכנסות', start: 5, end: 6 } ] },
  ],
}

test('findMatches: empty query → no matches', () => {
  assert.deepEqual(findMatches(t, ''), [])
  assert.deepEqual(findMatches(t, '   '), [])
})

test('findMatches: returns each matching global word index', () => {
  assert.deepEqual(findMatches(t, 'רווח'), [0, 2])
})

test('findMatches: case-insensitive substring', () => {
  assert.deepEqual(findMatches(t, 'הכנ'), [3])
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --import tsx --test src/lib/live/search.test.ts`
Expected: FAIL — `findMatches` not found.

- [ ] **Step 3: Implement `findMatches`**

Create `src/lib/live/search.ts`:

```ts
import type { WordTimedTranscript } from './syncEngine'

// Global word indices (matching TranscriptBody's data-wi numbering) whose text contains
// the query, case-insensitive. Empty/whitespace query → no matches.
export function findMatches(transcript: WordTimedTranscript, query: string): number[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: number[] = []
  let gi = 0
  for (const seg of transcript.segments) {
    for (const w of seg.words) {
      if (w.text.toLowerCase().includes(q)) out.push(gi)
      gi++
    }
  }
  return out
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `node --import tsx --test src/lib/live/search.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire search into the UI**

In `LiveTranscriptView.tsx`:
- Add state: `const [query, setQuery] = useState('')` and `const [matchPos, setMatchPos] = useState(0)`.
- `const matches = useMemo(() => findMatches(call.transcript, query), [call.transcript, query])` (import `findMatches`).
- Replace the static search button in the sub-toolbar with an input + count + prev/next:

```tsx
        <div className="flex items-center gap-1.5">
          <SearchIcon size={15} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMatchPos(0) }}
            placeholder={dict.live.searchTranscript}
            className="w-44 bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
          />
          {query && (
            <span className="flex items-center gap-1 text-2xs text-ink-faint">
              <span className="tabular-nums">{matches.length ? matchPos + 1 : 0}/{matches.length}</span>
              <button type="button" disabled={!matches.length} onClick={() => setMatchPos((p) => (p - 1 + matches.length) % matches.length)} className="px-1 hover:text-ink disabled:opacity-40">‹</button>
              <button type="button" disabled={!matches.length} onClick={() => setMatchPos((p) => (p + 1) % matches.length)} className="px-1 hover:text-ink disabled:opacity-40">›</button>
            </span>
          )}
        </div>
```
- Pass to `TranscriptBody`: `searchMatches={matches}` and `activeMatch={matches[matchPos] ?? -1}`.

In `TranscriptBody.tsx`:
- Add props `searchMatches?: number[]` and `activeMatch?: number`, default `searchMatches = []`, `activeMatch = -1`. Build a `Set` once: `const matchSet = useMemo(() => new Set(searchMatches), [searchMatches])`.
- In the word span, add a ref for the active match and a highlight class:

```tsx
                const isMatch = matchSet.has(gi)
                const isActiveMatch = gi === activeMatch
```
add to the span: `ref={isActiveMatch ? activeMatchRef : isActive ? activeWordRef : undefined}` and append to className `isMatch ? (isActiveMatch ? 'bg-[#C04A00]/30' : 'bg-[#C04A00]/12') : ''`.
- Add `const activeMatchRef = useRef<HTMLSpanElement>(null)` and an effect to scroll the active match into view:

```tsx
  useEffect(() => {
    if (activeMatch >= 0 && activeMatchRef.current) {
      activeMatchRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeMatch])
```

- [ ] **Step 6: Verify**

Type a Hebrew word into the search box. Expected: all occurrences highlight, the count shows (e.g. `1/4`), and ‹ › jump to and scroll each match into view.

- [ ] **Step 7: Commit**

```bash
git add src/lib/live/search.ts src/lib/live/search.test.ts src/components/live/LiveTranscriptView.tsx src/components/live/TranscriptBody.tsx
git commit -m "feat(transcript): working in-transcript search with next/prev (#7)"
```

---

## Task 8: #3 — "Open with LLM" (replaces PDF)

A menu (ChatGPT / Claude / Gemini) that copies a framed prompt + transcript and opens the chosen LLM. Pure prompt builder is tested.

**Files:**
- Create: `src/lib/live/llmHandoff.ts`
- Create: `src/lib/live/llmHandoff.test.ts`
- Modify: `src/components/live/LiveTranscriptView.tsx`
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/live/llmHandoff.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLlmPrompt, LLM_TARGETS } from './llmHandoff'

test('buildLlmPrompt: includes company, quarter, and transcript text', () => {
  const p = buildLlmPrompt('Tigbur', 'Q4 2025', 'דובר א: שלום\n\nדובר ב: תודה')
  assert.match(p, /Tigbur/)
  assert.match(p, /Q4 2025/)
  assert.match(p, /דובר א: שלום/)
})

test('LLM_TARGETS: three known targets with urls', () => {
  assert.deepEqual(LLM_TARGETS.map((t) => t.key), ['chatgpt', 'claude', 'gemini'])
  for (const t of LLM_TARGETS) assert.match(t.url, /^https:\/\//)
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --import tsx --test src/lib/live/llmHandoff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

Create `src/lib/live/llmHandoff.ts`:

```ts
import type { WordTimedTranscript } from './syncEngine'

export interface LlmTarget {
  key: 'chatgpt' | 'claude' | 'gemini'
  label: string
  url: string
}

export const LLM_TARGETS: LlmTarget[] = [
  { key: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { key: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { key: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
]

export function buildLlmPrompt(company: string, quarter: string, transcriptText: string): string {
  return (
    `Here is the ${company} ${quarter} investor-call transcript. ` +
    `Help me analyze it — summarize the key points, guidance, and risks, and answer my questions about it.\n\n` +
    `=== TRANSCRIPT ===\n${transcriptText}`
  )
}

// Flatten a word-timed transcript into readable "Speaker: words" paragraphs.
export function transcriptToText(t: WordTimedTranscript): string {
  return t.segments.map((s) => `${s.speakerName}: ${s.words.map((w) => w.text).join(' ')}`).join('\n\n')
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `node --import tsx --test src/lib/live/llmHandoff.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add dictionary strings**

In `en.ts` `live`: `openWithLlm: 'Open with LLM',` `llmCopied: 'Transcript copied — paste it into',`. In `he.ts` `live`: `openWithLlm: 'פתיחה ב-LLM',` `llmCopied: 'התמלול הועתק — הדביקו אותו ב-',`.

- [ ] **Step 6: Add the menu to the sub-toolbar**

In `LiveTranscriptView.tsx`, import `{ LLM_TARGETS, buildLlmPrompt, transcriptToText }` and `SparkleIcon` (already imported). Add state `const [llmOpen, setLlmOpen] = useState(false)`. Add a handler:

```tsx
  async function openWithLlm(target: (typeof LLM_TARGETS)[number]) {
    setLlmOpen(false)
    const text = buildLlmPrompt(name, call.quarter, transcriptToText(call.transcript))
    try {
      await navigator.clipboard.writeText(text)
      setToast(`${dict.live.llmCopied} ${target.label}`)
    } catch {
      /* clipboard blocked — still open the LLM */
    }
    window.open(target.url, '_blank', 'noopener')
  }
```

Add the button + dropdown next to the Copy button in the sub-toolbar's left group:

```tsx
          <div className="relative">
            <IconButton label={dict.live.openWithLlm} size={30} onClick={() => setLlmOpen((v) => !v)}>
              <SparkleIcon size={16} />
            </IconButton>
            {llmOpen && (
              <div className="absolute z-50 mt-1 w-40 overflow-hidden rounded-lg bg-canvas p-1 shadow-popover">
                {LLM_TARGETS.map((tg) => (
                  <button
                    key={tg.key}
                    type="button"
                    onClick={() => void openWithLlm(tg)}
                    className="block w-full rounded-md px-2.5 py-1.5 text-start text-sm text-ink hover:bg-subtle"
                  >
                    {tg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 7: Verify**

Click "Open with LLM" → pick ChatGPT. Expected: a toast "Transcript copied — paste it into ChatGPT" and a new ChatGPT tab opens; pasting drops the framed transcript in.

- [ ] **Step 8: Commit**

```bash
git add src/lib/live/llmHandoff.ts src/lib/live/llmHandoff.test.ts src/components/live/LiveTranscriptView.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "feat(transcript): Open with LLM hand-off (ChatGPT/Claude/Gemini) (#3)"
```

---

## Task 9: #8 — Make the refresh button real

Split the conflated sync/auto-scroll control: keep the auto-scroll toggle, and add a real refresh that re-fetches the page data.

**Files:**
- Modify: `src/components/live/LiveTranscriptView.tsx`
- Modify: `src/components/ds/icons.tsx` (add `RefreshIcon` if absent)
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts`

- [ ] **Step 1: Add a RefreshIcon (if not present)**

In `src/components/ds/icons.tsx`, add (only if there is no `RefreshIcon` already — grep first):

```tsx
export function RefreshIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}
```
(Match the existing `IconProps` shape in that file — read one existing icon and mirror it exactly.)

- [ ] **Step 2: Add dictionary string**

`en.ts` `live`: `refresh: 'Refresh',`. `he.ts` `live`: `refresh: 'רענון',`.

- [ ] **Step 3: Add the refresh button to the sub-toolbar**

In `LiveTranscriptView.tsx`, import `RefreshIcon`, and add next to the auto-scroll toggle:

```tsx
          <IconButton label={dict.live.refresh} size={30} onClick={() => router.refresh()}>
            <RefreshIcon size={16} />
          </IconButton>
```
Keep the existing auto-scroll `IconButton` (it already uses `SyncIcon` + `active={autoScroll}`); just ensure its `label` is `dict.live.autoScroll` so the two are distinct.

- [ ] **Step 4: Verify**

Click refresh on `/app/live/<id>`. Expected: the transcript/data re-fetches (a server round-trip — visible if you rename a speaker in another tab then refresh here). Auto-scroll toggle still independently toggles highlight-follow.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LiveTranscriptView.tsx src/components/ds/icons.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "fix(transcript): real refresh button, separate from auto-scroll (#8)"
```

---

## Task 10: #9a — Transcript-scoped chat context

Opening chat from a transcript passes company + that specific call; the chat grounds on that transcript and shows a context chip.

**Files:**
- Modify: `src/lib/chat/context.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/api/chat.ts`
- Modify: `src/components/live/LiveTranscriptView.tsx`
- Modify: `src/app/app/chat/page.tsx`
- Modify: `src/components/chat/ChatView.tsx`

- [ ] **Step 1: Scope `getChatContext` by transcriptId**

In `src/lib/chat/context.ts`, add an optional `transcriptId`. Add a loader and prefer it:

```ts
async function byId(transcriptId: string): Promise<{ id: string; formatted_data: Transcript } | null> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('id, formatted_data')
    .eq('id', transcriptId)
    .maybeSingle()
  if (data?.formatted_data) return { id: data.id as string, formatted_data: data.formatted_data as Transcript }
  return null
}

export async function getChatContext(companyId?: string, transcriptId?: string): Promise<ChatContext> {
  const hit =
    (transcriptId ? await byId(transcriptId) : null) ??
    (companyId ? await latestCompleted(companyId) : null) ??
    (await latestCompleted())
  if (!hit) return { text: '', source: null }
  const fd = hit.formatted_data
  return { text: buildText(fd), source: { company: fd.company ?? '', quarter: fd.quarter ?? '', transcriptId: hit.id } }
}
```

- [ ] **Step 2: Thread transcriptId through the chat API**

In `src/app/api/chat/route.ts`: read `const transcriptId: string | undefined = body?.transcriptId || undefined` and call `await getChatContext(companyId, transcriptId)`.
In `src/lib/api/chat.ts`: add `transcriptId?: string` to the `sendChat` input type and include it in the POST body.

- [ ] **Step 3: Pass transcript from the live page's open-in-chat**

In `LiveTranscriptView.tsx`, change `openInChat`:

```tsx
  function openInChat() {
    if (!call.companyId) return
    const tid = call.id === 'demo' ? '' : `&transcript=${encodeURIComponent(call.id)}`
    router.push(`/app/chat?company=${call.companyId}${tid}`)
  }
```

- [ ] **Step 4: Read transcript param + show context chip**

In `src/app/app/chat/page.tsx`, accept `transcript` in `searchParams` and load its label:

```tsx
}: {
  searchParams: { company?: string; quote?: string; transcript?: string }
}) {
```
After building `initialCompany`, add:
```ts
  let initialTranscript: { id: string; label: string } | null = null
  if (searchParams.transcript) {
    const { data } = await supabaseAdmin
      .from('transcripts')
      .select('id, formatted_data')
      .eq('id', searchParams.transcript)
      .maybeSingle()
    const fd = data?.formatted_data as { company?: string; quarter?: string } | undefined
    if (fd) initialTranscript = { id: data!.id as string, label: `${fd.company ?? ''} · ${fd.quarter ?? ''}`.trim() }
  }
```
(import `supabaseAdmin` from `@/lib/supabase`). Pass `initialTranscript` to `<ChatView … initialTranscript={initialTranscript} />`.

In `ChatView.tsx`: accept `initialTranscript?: { id: string; label: string } | null`. Keep it in state: `const [transcript] = useState(initialTranscript ?? null)`. Pass `transcriptId: transcript?.id` in the `sendChat({ … })` call. Render a context chip next to the company chip when present:

```tsx
          {transcript && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              <span className="font-medium text-ink">{transcript.label}</span>
            </span>
          )}
```

- [ ] **Step 5: Verify**

From `/app/live/<tigbur-q4-id>` click the ✦ chat icon. Expected: chat opens showing a "Tigbur · Q4 …" chip; ask "what did the CFO say about guidance?" → the answer is grounded in *that* transcript (verify by asking something specific to Q4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/chat/context.ts src/app/api/chat/route.ts src/lib/api/chat.ts src/components/live/LiveTranscriptView.tsx src/app/app/chat/page.tsx src/components/chat/ChatView.tsx
git commit -m "feat(chat): transcript-scoped context (company + specific call) (#9a)"
```

---

## Task 11: #9b — Persisted conversations (history + new chat)

A `chat_conversations` DB layer (mirroring `quotes.ts`), API routes, client fetchers, a client history list, and ChatView wiring so chats are saved, listed, reopenable, and "New chat" works.

**Files:**
- Modify: `src/lib/api/types.ts` (Conversation types)
- Create: `src/lib/db/conversations.ts`
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/route.ts`
- Create: `src/lib/api/conversations.ts`
- Create: `src/components/chat/ChatHistory.tsx`
- Modify: `src/components/chat/ChatView.tsx`
- Modify: `src/app/app/chat/page.tsx`

- [ ] **Step 1: Add Conversation types**

In `src/lib/api/types.ts`:

```ts
export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  title: string
  companyId: string | null
  transcriptId: string | null
  messages: ChatMsg[]
  createdAt: string
  updatedAt: string
}

export type ConversationSummary = Omit<Conversation, 'messages'>
```

- [ ] **Step 2: Conversations DB layer (mirror quotes.ts fallback pattern)**

Create `src/lib/db/conversations.ts`:

```ts
import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { ChatMsg, Conversation, ConversationSummary } from '@/lib/api/types'

const g = globalThis as unknown as {
  __timlulConvMem?: Map<string, Conversation[]>
  __timlulConvFlag?: { on: boolean }
}
const convMem = (g.__timlulConvMem ??= new Map<string, Conversation[]>())
const flag = (g.__timlulConvFlag ??= { on: false })

function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = err.code ?? ''
  const msg = err.message ?? ''
  return code === '42P01' || code === 'PGRST205' || /does not exist/i.test(msg) || /could not find the table/i.test(msg) || /schema cache/i.test(msg)
}

type Row = Record<string, unknown>
function mapConv(r: Row): Conversation {
  return {
    id: String(r.id),
    title: String(r.title ?? 'New chat'),
    companyId: (r.company_id as string) ?? null,
    transcriptId: (r.transcript_id as string) ?? null,
    messages: Array.isArray(r.messages) ? (r.messages as ChatMsg[]) : [],
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('id, title, company_id, transcript_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (!error) return (data ?? []).map((r) => ({ ...mapConv({ ...r, messages: [] }) }) as ConversationSummary)
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  return (convMem.get(userId) ?? []).map(({ messages: _m, ...rest }) => rest)
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('id, title, company_id, transcript_id, messages, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!error) return data ? mapConv(data) : null
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  return (convMem.get(userId) ?? []).find((c) => c.id === id) ?? null
}

export async function createConversation(
  userId: string,
  input: { title?: string; companyId?: string | null; transcriptId?: string | null },
): Promise<Conversation> {
  const now = new Date().toISOString()
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .insert({ user_id: userId, title: input.title ?? 'New chat', company_id: input.companyId ?? null, transcript_id: input.transcriptId ?? null, messages: [] })
      .select('id, title, company_id, transcript_id, messages, created_at, updated_at')
      .single()
    if (!error && data) return mapConv(data)
    if (error && !missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const conv: Conversation = { id: randomUUID(), title: input.title ?? 'New chat', companyId: input.companyId ?? null, transcriptId: input.transcriptId ?? null, messages: [], createdAt: now, updatedAt: now }
  const arr = convMem.get(userId) ?? []
  arr.unshift(conv)
  convMem.set(userId, arr)
  return conv
}

export async function saveMessages(userId: string, id: string, messages: ChatMsg[], title?: string): Promise<void> {
  const now = new Date().toISOString()
  if (!flag.on) {
    const patch: Row = { messages, updated_at: now }
    if (title) patch.title = title
    const { error } = await supabaseAdmin.from('chat_conversations').update(patch).eq('id', id).eq('user_id', userId)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const arr = convMem.get(userId) ?? []
  const c = arr.find((x) => x.id === id)
  if (c) { c.messages = messages; c.updatedAt = now; if (title) c.title = title }
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  if (!flag.on) {
    const { error } = await supabaseAdmin.from('chat_conversations').delete().eq('id', id).eq('user_id', userId)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const arr = convMem.get(userId) ?? []
  convMem.set(userId, arr.filter((c) => c.id !== id))
}

// First user message → conversation title (trimmed to 60 chars).
export function titleFromMessages(messages: ChatMsg[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim()
  return first ? first.slice(0, 60) : 'New chat'
}
```

- [ ] **Step 3: API routes**

Create `src/app/api/conversations/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { listConversations, createConversation } from '@/lib/db/conversations'

export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  try {
    return NextResponse.json(await listConversations(userId))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => ({}))
  try {
    const conv = await createConversation(userId, { title: body?.title, companyId: body?.companyId ?? null, transcriptId: body?.transcriptId ?? null })
    return NextResponse.json(conv)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

Create `src/app/api/conversations/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { getConversation, saveMessages, deleteConversation, titleFromMessages } from '@/lib/db/conversations'
import type { ChatMsg } from '@/lib/api/types'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const conv = await getConversation(userId, params.id)
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  const messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : []
  try {
    await saveMessages(userId, params.id, messages, body?.title ?? titleFromMessages(messages))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  await deleteConversation(userId, params.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Client fetchers**

Create `src/lib/api/conversations.ts`:

```ts
import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Conversation, ConversationSummary, ChatMsg } from './types'

export function fetchConversations(): Promise<ConversationSummary[]> {
  return apiGet<ConversationSummary[]>('/api/conversations')
}
export function fetchConversation(id: string): Promise<Conversation> {
  return apiGet<Conversation>(`/api/conversations/${id}`)
}
export function createConversation(input: { title?: string; companyId?: string | null; transcriptId?: string | null }): Promise<Conversation> {
  return apiPost<Conversation>('/api/conversations', input)
}
export function saveConversation(id: string, messages: ChatMsg[], title?: string): Promise<{ ok: boolean }> {
  return apiPatch<{ ok: boolean }>(`/api/conversations/${id}`, { messages, title })
}
export function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/conversations/${id}`)
}
```

- [ ] **Step 5: ChatHistory client component**

Create `src/components/chat/ChatHistory.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlusIcon, SparkleIcon } from '@/components/ds/icons'
import { fetchConversations } from '@/lib/api/conversations'
import type { ConversationSummary } from '@/lib/api/types'

// Lists past conversations and exposes new/open. ChatView calls `register` so a freshly
// created/updated conversation refreshes the list without a full reload.
export function ChatHistory({
  activeId,
  onNew,
  onOpen,
  refreshKey,
}: {
  activeId: string | null
  onNew: () => void
  onOpen: (id: string) => void
  refreshKey: number
}) {
  const { dict } = useI18n()
  const [items, setItems] = useState<ConversationSummary[]>([])

  useEffect(() => {
    fetchConversations().then(setItems).catch(() => setItems([]))
  }, [refreshKey])

  return (
    <div className="flex h-full flex-col gap-2">
      <button
        onClick={onNew}
        className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <PlusIcon size={15} />
        {dict.chat.newChat}
      </button>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md px-2.5 py-4 text-sm text-ink-faint">
          <SparkleIcon size={15} />
          {dict.common.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={`truncate rounded-md px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-subtle ${
                c.id === activeId ? 'bg-subtle text-ink' : 'text-ink-muted'
              }`}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire ChatView to persist + load conversations**

In `ChatView.tsx`:
- Import `createConversation, saveConversation, fetchConversation` from `@/lib/api/conversations`, and `ChatHistory`.
- Accept new props: `initialConversationId?: string | null`. Add state: `const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null)` and `const [historyKey, setHistoryKey] = useState(0)`.
- After a successful send (in `send`, after appending the assistant message), persist: ensure a conversation exists, then save the full message list. Replace the end of `send`'s `try` with:

```tsx
      const assistant: Msg = { role: 'assistant', content: res.reply, source: res.source }
      setMessages((prev) => [...prev, assistant])
      const full = [...messages, { role: 'user' as const, content: text }, { role: assistant.role, content: assistant.content }]
      let cid = conversationId
      if (!cid) {
        const conv = await createConversation({ companyId: companyId ?? null, transcriptId: transcript?.id ?? null })
        cid = conv.id
        setConversationId(cid)
      }
      await saveConversation(cid, full)
      setHistoryKey((k) => k + 1)
```
- Add `openConversation(id)` and `newChat()`:

```tsx
  async function openConversation(id: string) {
    const conv = await fetchConversation(id)
    setConversationId(conv.id)
    setMessages(conv.messages.map((m) => ({ role: m.role, content: m.content })))
  }
  function newChat() {
    setConversationId(null)
    setMessages([])
    setInput('')
  }
```
- Export these so the page's panel can call them. Simplest: render `ChatHistory` *inside* ChatView is not possible (it's in the side panel). Instead, lift the panel into ChatView by having the chat page render `<ChatView … />` as the whole `CollapsiblePanel` content. **Restructure** (Step 7).

- [ ] **Step 7: Move the chat panel into ChatView so history shares its state**

The history list and the chat must share `conversationId`/`historyKey`. Render the `CollapsiblePanel` from inside a client wrapper. In `src/app/app/chat/page.tsx`, replace the static `panel` + `<ChatView/>` with a single client component that owns both:

Change `page.tsx` to pass data to `ChatView` and let `ChatView` render the `CollapsiblePanel` with `ChatHistory` as its panel:

```tsx
  return (
    <ChatView
      initialCompany={initialCompany}
      initialQuote={initialQuote}
      initialTranscript={initialTranscript}
    />
  )
```
And in `ChatView.tsx`, wrap the returned JSX in `CollapsiblePanel` (import it + `ChatHistory`):

```tsx
  return (
    <CollapsiblePanel
      title={dict.chat.chats}
      panel={
        <div className="flex h-full flex-col gap-4">
          <ChatHistory activeId={conversationId} onNew={newChat} onOpen={openConversation} refreshKey={historyKey} />
          <div className="mt-auto space-y-4">
            <div>
              <SectionHeader label={dict.chat.myAgents} className="mb-1" />
              <p className="px-2.5 text-xs text-ink-faint">{dict.chat.agentsComingSoon}</p>
            </div>
            <div>
              <SectionHeader label={dict.chat.mySkills} className="mb-1" />
              <p className="px-2.5 text-xs text-ink-faint">{dict.common.comingSoon}</p>
            </div>
          </div>
        </div>
      }
    >
      {/* existing empty/active chat JSX (the two return branches) goes here as the children */}
    </CollapsiblePanel>
  )
```
Refactor the current `if (empty) return (...)` / `return (...)` into a single `content` variable and place it as the `CollapsiblePanel` child, so both states render inside the panel. Import `CollapsiblePanel` from `@/components/app/CollapsiblePanel`, `SectionHeader` from `@/components/ds/SectionHeader`. Remove the now-unused `CollapsiblePanel`/`SectionHeader`/`PlusIcon` imports from `page.tsx`.

- [ ] **Step 8: Verify**

Send a few messages → the conversation appears in the "Chats" list with its title = your first message. Reload the page → open it from the list → messages reappear. Click "New chat" → composer recenters empty; send → a second conversation is created. Verify rows in Supabase:
```sql
select id, title, jsonb_array_length(messages) as msgs, updated_at from public.chat_conversations order by updated_at desc;
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/api/types.ts src/lib/db/conversations.ts "src/app/api/conversations/route.ts" "src/app/api/conversations/[id]/route.ts" src/lib/api/conversations.ts src/components/chat/ChatHistory.tsx src/components/chat/ChatView.tsx src/app/app/chat/page.tsx
git commit -m "feat(chat): persisted conversations — history, open, new chat (#9b)"
```

---

## Task 12: Full verification + push

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 2: Run all unit tests**

Run: `node --import tsx --test src/lib/live/syncEngine.test.ts src/lib/live/search.test.ts src/lib/live/llmHandoff.test.ts`
Expected: all pass.

- [ ] **Step 3: EN + HE smoke screenshots**

With the dev server running (port 3210), capture `/app/live/<tigbur-q4-id>` and `/app/chat` in `locale=en` and `locale=he`. Expected: transcript RTL in both; search bar present; "Open with LLM" menu; speaker names editable; chat shows the history panel.

- [ ] **Step 4: Final commit + push**

```bash
git push
```
Expected: branch `feat/v1-frontend` updates on GitHub (which, once Railway is connected, triggers a deploy).

---

## Self-Review

**Spec coverage:** #1 Task 2 · #2 Task 3 · #3 Task 8 · #4 Task 4 · #5 Task 5 · #6 Task 6 · #7 Task 7 · #8 Task 9 · #9a Task 10 · #9b Task 11 · docs Task 0 · migration Task 1. All spec items mapped.

**Type consistency:** `Quote.anchor: QuoteAnchor | null` defined (Task 5.1) and used in `mapQuote`/`NewQuote`/`NewQuoteInput`/`goToQuote`. `Conversation`/`ChatMsg`/`ConversationSummary` defined (Task 11.1) and used consistently across DB layer, routes, fetchers, components. `findMatches`, `buildLlmPrompt`/`LLM_TARGETS`/`transcriptToText`, `renameSpeaker`/`renameSpeakerInQuotes`, `saveMessages`/`titleFromMessages` — names consistent between definition and call sites.

**Deviation from spec (intentional):** the spec proposed a new `transcript-audio` bucket; the pipeline already persists durably to `audio-temp` and serves a public URL, so we keep `audio-temp` (less risk, no migration of existing audio). Noted in Task 2.
