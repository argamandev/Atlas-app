# Pinge (snip-to-chat) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scissors-icon snipping tool on the Report PDF pane — drag a rectangle over a table, a crisp PNG of it lands in Ask Atlas as a thumbnail chip, the model answers from the actual pixels; plus one unified mark→Ask-Atlas UX across transcript text, PDF text and snips, in finished AND live views.

**Architecture:** Client captures the snip by re-rendering the page offscreen via the already-loaded pdf.js `doc` at high fixed scale and cropping (zoom-proof, no server round-trip). The chat wire contract gains `attachments` (≤4 PNG data URLs + page + documentId); `/api/chat` validates, auth-gates like `documentRef`, builds Hebrew captions from document metadata, and feeds Gemini `inline_data` image parts (OpenAI `image_url` parts on fallback). Views own a "pending PDF ask" floating button; the chat panel owns the chip stack.

**Tech Stack:** Next.js 14 App Router, TypeScript, pdf.js (native import from `public/pdf.min.mjs`), Gemini REST SSE + OpenAI SDK fallback, `node --import tsx --test` unit tests.

**Spec:** `docs/superpowers/specs/2026-07-17-pinge-design.md`

## Global Constraints

- Branch: `feat/pinge`. Small labeled commits, one per task, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01SfX6Bovaq2JyBuvcaJgg4v` trailers.
- Max 4 snips per question (`SNIP_MAX = 4`); drag under 8px either dimension = cancel (`SNIP_MIN_DRAG_PX = 8`); capture long side ≤ 1600px (`SNIP_MAX_SIDE = 1600`); server per-image base64 cap 2,000,000 chars.
- "Pinge" never appears in UI copy — scissors icon + dict strings only.
- New test files MUST be appended to package.json's explicit `"test"` file list (repo gotcha).
- All user-facing strings go through `src/lib/i18n/dictionaries/en.ts` + `he.ts` (both, or tsc breaks).
- After each task: `npx tsc --noEmit` clean and `npm test` green before commit.
- Never `git push` to main; the branch may be pushed.

---

### Task 1: Snip geometry + chip-list helpers (pure, tested)

**Files:**
- Create: `src/lib/documents/snip.ts`
- Create: `src/lib/documents/snip.test.ts`
- Modify: `package.json` (append test file to the `"test"` script list)

**Interfaces:**
- Produces: `SnipRect {x,y,width,height}` · `dragToPageRect(a, b, page): SnipRect | null` (CSS px relative to page, clamped, null if too small) · `scaleRect(r, f): SnipRect` · `snipRenderScale(rectPdf, maxSide?): number` · `appendSnip<T>(list, item, max?): {list: T[], dropped: boolean}` · consts `SNIP_MAX`, `SNIP_MIN_DRAG_PX`, `SNIP_MAX_SIDE`. Task 5 consumes the geometry; Task 6 consumes `appendSnip`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/documents/snip.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dragToPageRect,
  scaleRect,
  snipRenderScale,
  appendSnip,
  SNIP_MAX,
  SNIP_MIN_DRAG_PX,
} from './snip'

const page = { left: 100, top: 200, width: 600, height: 800 }

test('dragToPageRect: basic drag → rect relative to page, any corner order', () => {
  const r = dragToPageRect({ x: 150, y: 250 }, { x: 350, y: 400 }, page)
  assert.deepEqual(r, { x: 50, y: 50, width: 200, height: 150 })
  // reversed corners give the same rect
  const r2 = dragToPageRect({ x: 350, y: 400 }, { x: 150, y: 250 }, page)
  assert.deepEqual(r2, r)
})

test('dragToPageRect: clamps to page bounds (drag escaping the page)', () => {
  const r = dragToPageRect({ x: 50, y: 150 }, { x: 800, y: 1100 }, page)
  assert.deepEqual(r, { x: 0, y: 0, width: 600, height: 800 })
})

test('dragToPageRect: sub-threshold drag is null (accidental click)', () => {
  const tiny = SNIP_MIN_DRAG_PX - 1
  assert.equal(dragToPageRect({ x: 150, y: 250 }, { x: 150 + tiny, y: 400 }, page), null)
  assert.equal(dragToPageRect({ x: 150, y: 250 }, { x: 400, y: 250 + tiny }, page), null)
})

test('scaleRect scales every field', () => {
  assert.deepEqual(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 2), {
    x: 20,
    y: 40,
    width: 60,
    height: 80,
  })
})

test('snipRenderScale: small crop gets the full 2x, huge crop is capped to maxSide', () => {
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 300, height: 100 }), 2)
  // 1600/800 = 2 exactly at the boundary
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 800, height: 100 }), 2)
  // long side 3200 → scale 0.5 so output stays ≤1600
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 3200, height: 100 }), 0.5)
})

test('appendSnip: appends below cap, drops at cap', () => {
  const below = appendSnip([1, 2, 3], 4)
  assert.deepEqual(below, { list: [1, 2, 3, 4], dropped: false })
  const at = appendSnip([1, 2, 3, 4], 5)
  assert.deepEqual(at, { list: [1, 2, 3, 4], dropped: true })
  assert.equal(SNIP_MAX, 4)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Sagi/Desktop/Atlas-multiview && node --import tsx --test src/lib/documents/snip.test.ts`
Expected: FAIL — Cannot find module './snip'

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/documents/snip.ts
// Pinge snip geometry (spec 2026-07-17). Pure math only — no DOM, no pdf.js — so the
// zoom-proofing (screen px → PDF page units) is unit-testable at every zoom level.

export interface SnipRect {
  x: number
  y: number
  width: number
  height: number
}

/** Max snips attachable to one question (founder decision: the compare-tables move). */
export const SNIP_MAX = 4
/** Drags smaller than this in either dimension are accidental clicks → cancel. */
export const SNIP_MIN_DRAG_PX = 8
/** Long side of the captured PNG never exceeds this (crisp digits, sane payload). */
export const SNIP_MAX_SIDE = 1600

type Pt = { x: number; y: number }
type PageBox = { left: number; top: number; width: number; height: number }

/**
 * Drag endpoints (viewport px) → rect in CSS px relative to the page element,
 * clamped to the page. Null when the drag is below the accidental-click threshold
 * (measured BEFORE clamping so a real drag that mostly overshoots still counts).
 */
export function dragToPageRect(a: Pt, b: Pt, page: PageBox): SnipRect | null {
  if (Math.abs(a.x - b.x) < SNIP_MIN_DRAG_PX || Math.abs(a.y - b.y) < SNIP_MIN_DRAG_PX) return null
  const x0 = Math.max(0, Math.min(a.x, b.x) - page.left)
  const y0 = Math.max(0, Math.min(a.y, b.y) - page.top)
  const x1 = Math.min(page.width, Math.max(a.x, b.x) - page.left)
  const y1 = Math.min(page.height, Math.max(a.y, b.y) - page.top)
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function scaleRect(r: SnipRect, f: number): SnipRect {
  return { x: r.x * f, y: r.y * f, width: r.width * f, height: r.height * f }
}

/** Offscreen render scale for a crop in PDF units: 2x, reduced so the crop's long side ≤ maxSide. */
export function snipRenderScale(rectPdf: SnipRect, maxSide = SNIP_MAX_SIDE): number {
  return Math.min(2, maxSide / Math.max(rectPdf.width, rectPdf.height))
}

/** Chip-stack append with cap: at SNIP_MAX the new snip is dropped (caller shows the toast). */
export function appendSnip<T>(list: T[], item: T, max = SNIP_MAX): { list: T[]; dropped: boolean } {
  if (list.length >= max) return { list, dropped: true }
  return { list: [...list, item], dropped: false }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/documents/snip.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Register the test file**

In `package.json`, append ` src/lib/documents/snip.test.ts` to the end of the `"test"` script's file list (single space separator, keep one line).

Run: `npm test` → all suites green (existing count + 6 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/documents/snip.ts src/lib/documents/snip.test.ts package.json
git commit -m "feat(pinge): snip geometry + chip-cap helpers (pure, tested)"
```

---

### Task 2: Server attachment validation, captions, provider parts (pure, tested)

**Files:**
- Create: `src/lib/chat/attachments.ts`
- Create: `src/lib/chat/attachments.test.ts`
- Modify: `package.json` (append test file)

**Interfaces:**
- Produces: `ChatAttachment {dataUrl,page,documentId}` · `parseAttachments(raw: unknown): ChatAttachment[]` · `snipCaption(meta: {title: string} | null, page: number): string` · `geminiSnipParts(atts, captions): object[]` · `openAiSnipContent(atts, captions): object[]` · consts `ATTACHMENT_MAX = 4`, `ATTACHMENT_MAX_B64 = 2_000_000`. Task 3 consumes all of these in the route.
- NOTE: this module is pure (no `server-only`, no supabase) so it stays unit-testable; the route does the DB lookups.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/chat/attachments.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAttachments,
  snipCaption,
  geminiSnipParts,
  openAiSnipContent,
  ATTACHMENT_MAX,
  ATTACHMENT_MAX_B64,
} from './attachments'

const PNG = 'data:image/png;base64,'
const good = (n = 1) => ({ dataUrl: PNG + 'aGVsbG8=', page: n, documentId: 'doc-1' })

test('parseAttachments: passes valid snips through', () => {
  assert.deepEqual(parseAttachments([good(3)]), [
    { dataUrl: PNG + 'aGVsbG8=', page: 3, documentId: 'doc-1' },
  ])
})

test('parseAttachments: non-array and junk → empty', () => {
  assert.deepEqual(parseAttachments(undefined), [])
  assert.deepEqual(parseAttachments('x'), [])
  assert.deepEqual(parseAttachments([null, 42, {}]), [])
})

test('parseAttachments: rejects non-PNG data URLs, bad pages, missing doc', () => {
  assert.deepEqual(parseAttachments([{ ...good(), dataUrl: 'data:image/jpeg;base64,aa' }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), page: 0 }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), page: 1.5 }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), documentId: '' }]), [])
})

test('parseAttachments: caps count at ATTACHMENT_MAX and size at ATTACHMENT_MAX_B64', () => {
  const six = [good(1), good(2), good(3), good(4), good(5), good(6)]
  assert.equal(parseAttachments(six).length, ATTACHMENT_MAX)
  const fat = { ...good(), dataUrl: PNG + 'a'.repeat(ATTACHMENT_MAX_B64 + 1) }
  assert.deepEqual(parseAttachments([fat]), [])
})

test('snipCaption: with and without document metadata', () => {
  assert.equal(snipCaption({ title: 'דוח רבעון 1 2026' }, 12), 'תצלום מעמוד 12 של דוח רבעון 1 2026')
  assert.equal(snipCaption(null, 5), 'תצלום מעמוד 5 מהדוח')
})

test('geminiSnipParts: inline_data + caption text per snip, prefix stripped', () => {
  const parts = geminiSnipParts([good(2)], ['cap'])
  assert.deepEqual(parts, [
    { inline_data: { mime_type: 'image/png', data: 'aGVsbG8=' } },
    { text: 'cap' },
  ])
})

test('openAiSnipContent: caption text + image_url per snip, full data URL kept', () => {
  const parts = openAiSnipContent([good(2)], ['cap'])
  assert.deepEqual(parts, [
    { type: 'text', text: 'cap' },
    { type: 'image_url', image_url: { url: PNG + 'aGVsbG8=' } },
  ])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/chat/attachments.test.ts`
Expected: FAIL — Cannot find module './attachments'

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/chat/attachments.ts
// Pinge chat attachments (spec 2026-07-17): validation of the wire shape + the
// provider-specific message parts. PURE on purpose (no server-only imports) so the
// whole attachment contract is unit-tested; /api/chat does the DB lookups.

export interface ChatAttachment {
  dataUrl: string
  page: number
  documentId: string
}

export const ATTACHMENT_MAX = 4
/** Per-image base64 cap (~1.5MB decoded) — the client downscales long side to 1600px anyway. */
export const ATTACHMENT_MAX_B64 = 2_000_000
const PNG_PREFIX = 'data:image/png;base64,'

/** Untrusted request body → clean attachment list (silently drops invalid/excess entries). */
export function parseAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: ChatAttachment[] = []
  for (const item of raw as Array<Record<string, unknown> | null>) {
    if (out.length >= ATTACHMENT_MAX) break
    const dataUrl = item?.dataUrl
    const page = item?.page
    const documentId = item?.documentId
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_PREFIX)) continue
    if (dataUrl.length - PNG_PREFIX.length > ATTACHMENT_MAX_B64) continue
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue
    if (typeof documentId !== 'string' || !documentId) continue
    out.push({ dataUrl, page, documentId })
  }
  return out
}

/** Hebrew caption placed beside each image so answers can cite the page naturally. */
export function snipCaption(meta: { title: string } | null, page: number): string {
  return meta ? `תצלום מעמוד ${page} של ${meta.title}` : `תצלום מעמוד ${page} מהדוח`
}

/** Gemini REST parts: inline_data image + caption text, in order, before the user text. */
export function geminiSnipParts(
  atts: ChatAttachment[],
  captions: string[]
): Array<Record<string, unknown>> {
  return atts.flatMap((a, i) => [
    { inline_data: { mime_type: 'image/png', data: a.dataUrl.slice(PNG_PREFIX.length) } },
    { text: captions[i] ?? '' },
  ])
}

/** OpenAI chat content parts for the fallback: caption text then image_url data URL. */
export function openAiSnipContent(
  atts: ChatAttachment[],
  captions: string[]
): Array<Record<string, unknown>> {
  return atts.flatMap((a, i) => [
    { type: 'text', text: captions[i] ?? '' },
    { type: 'image_url', image_url: { url: a.dataUrl } },
  ])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/chat/attachments.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Register the test file + full suite**

Append ` src/lib/chat/attachments.test.ts` to package.json's `"test"` list. Run `npm test` → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chat/attachments.ts src/lib/chat/attachments.test.ts package.json
git commit -m "feat(pinge): attachment validation, captions and provider image parts"
```

---

### Task 3: Chat wire contract + /api/chat attachment wiring

**Files:**
- Modify: `src/lib/api/chat.ts` (add `ChatSnip` + `attachments` to `ChatInput`)
- Modify: `src/app/api/chat/route.ts` (parse, auth-gate, captions, docRef merge, Gemini parts, fallback images, system-prompt line)

**Interfaces:**
- Consumes: everything from Task 2; `getDocumentMeta(id)` from `@/lib/documents`; existing `getRequestUserId`, `getDocumentContext`.
- Produces: `ChatSnip {dataUrl,page,documentId}` exported from `src/lib/api/chat.ts` — Tasks 5–8 import THIS type client-side. `ChatInput.attachments?: ChatSnip[]`.

- [ ] **Step 1: Extend the client contract**

In `src/lib/api/chat.ts`, add after the `DocumentRef` interface:

```typescript
/** Pinge: one snipped region of the report PDF, captured client-side as a PNG data URL. */
export interface ChatSnip {
  dataUrl: string
  page: number
  documentId: string
}
```

and add to `ChatInput` (after `documentRef`):

```typescript
  attachments?: ChatSnip[] // Pinge snips (≤4) — server validates + auth-gates like documentRef
```

No other change — `streamChat` already sends the whole input as JSON.

- [ ] **Step 2: Wire the route**

In `src/app/api/chat/route.ts`:

(a) Add imports:

```typescript
import { parseAttachments, snipCaption, geminiSnipParts, openAiSnipContent, type ChatAttachment } from '@/lib/chat/attachments'
import { getDocumentMeta } from '@/lib/documents'
```

(b) After the `documentRef` parsing block (line ~100), add:

```typescript
  // Pinge snips: validated here, auth-gated below exactly like documentRef.
  let attachments: ChatAttachment[] = parseAttachments(body?.attachments)
```

(c) Replace the auth-gate line

```typescript
  const userId = documentRef ? await getRequestUserId(req) : null
```

with:

```typescript
  const userId = documentRef || attachments.length > 0 ? await getRequestUserId(req) : null
  // No signed-in user → no document access of any kind (same policy + launch-notes flag as docRef).
  if (!userId) attachments = []
```

(d) After that (before `docBlock`), merge snip pages into the page-text grounding and build captions:

```typescript
  // Snipped pages ride the documentRef page-text grounding: image = authority on the
  // numbers, page prose = surrounding context (spec 2026-07-17).
  let groundingRef = documentRef
  if (attachments.length > 0) {
    const snipDocId = attachments[0].documentId
    const pages = Array.from(
      new Set([
        ...(groundingRef && groundingRef.documentId === snipDocId ? groundingRef.pages : []),
        ...attachments.map((a) => a.page),
      ])
    )
    if (!groundingRef || groundingRef.documentId === snipDocId) {
      groundingRef = { documentId: snipDocId, pages }
    }
  }
  const snipMeta =
    attachments.length > 0 ? await getDocumentMeta(attachments[0].documentId).catch(() => null) : null
  const captions = attachments.map((a) => snipCaption(snipMeta ? { title: snipMeta.title } : null, a.page))
```

and change the `docBlock` line to use `groundingRef`:

```typescript
  const docBlock = groundingRef && userId ? await getDocumentContext(groundingRef).catch(() => '') : ''
```

(e) In the `system` string, after the docBlock conditional, add an attachment conditional:

```typescript
    (attachments.length > 0
      ? '\nSnipped images from the quarterly report are attached. Read the numbers from the image itself — it is the authoritative source — and mention the page number when you cite it.'
      : '') +
```

(f) Change the final Gemini user turn (the `contents` array) so snips precede the text:

```typescript
    { role: 'user', parts: [...geminiSnipParts(attachments, captions), { text: message }] },
```

(g) Fallback: change `openAiFallback`'s signature to accept the parts and use them on the last user message:

```typescript
async function openAiFallback(
  system: string,
  recent: ChatMessage[],
  message: string,
  sourceHeader: string,
  snipContent: Array<Record<string, unknown>> = []
): Promise<Response | null> {
```

and its final user message construction:

```typescript
      {
        role: 'user',
        content:
          snipContent.length > 0
            ? ([...snipContent, { type: 'text', text: message }] as OpenAI.Chat.Completions.ChatCompletionContentPart[])
            : message,
      },
```

Update the call site: `openAiFallback(system, recent, message, sourceHeader, openAiSnipContent(attachments, captions))`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → green (route has no unit test; its pure parts were tested in Task 2, e2e comes in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/chat.ts src/app/api/chat/route.ts
git commit -m "feat(pinge): chat API carries snip attachments (Gemini inline_data + GPT fallback)"
```

---

### Task 4: ScissorsIcon + dictionary strings

**Files:**
- Modify: `src/components/ds/icons.tsx`
- Modify: `src/lib/i18n/dictionaries/en.ts`
- Modify: `src/lib/i18n/dictionaries/he.ts`

**Interfaces:**
- Produces: `ScissorsIcon` from `@/components/ds/icons` · dict keys `live.snip`, `chat.snipCap`, `chat.snipDefault`, `chat.pageShort`. Tasks 5–8 consume these.

- [ ] **Step 1: Add the icon**

In `src/components/ds/icons.tsx`, next to the other single-line icons (e.g. after `CopyTextIcon`), add (lucide "scissors" geometry, house `Base` wrapper):

```tsx
export const ScissorsIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" />
    <path d="M8.12 8.12 12 12" />
    <path d="M20 4 8.12 15.88" />
    <circle cx="6" cy="18" r="3" />
    <path d="M14.8 14.8 20 20" />
  </Base>
)
```

- [ ] **Step 2: Add dict keys (BOTH files or tsc breaks)**

`en.ts` — in the `live` block (beside `askAtlas`): `snip: 'Snip to chat',`
`en.ts` — in the `chat` block (beside `referringTo`):

```typescript
    snipCap: 'Up to 4 snips per question',
    snipDefault: 'Explain what this snippet shows.',
    pageShort: 'p.',
```

`he.ts` — in the `live` block: `snip: 'גזירה לצ׳אט',`
`he.ts` — in the `chat` block:

```typescript
    snipCap: 'עד 4 גזירים בשאלה',
    snipDefault: 'הסבירו מה מציג הקטע המצורף.',
    pageShort: 'עמ׳',
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/ds/icons.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "feat(pinge): scissors icon + he/en snip strings"
```

---

### Task 5: PdfViewer snip overlay + offscreen capture; ReportPane scissors; anchored selection callback

**Files:**
- Modify: `src/components/live/PdfViewer.tsx`
- Modify: `src/components/live/FacetPanes.tsx` (ReportPane)
- Modify: `src/components/live/LiveTranscriptView.tsx` (signature compat ONLY — behavior unchanged in this task)

**Interfaces:**
- Consumes: `dragToPageRect`, `scaleRect`, `snipRenderScale` from `@/lib/documents/snip`; `ChatSnip` from `@/lib/api/chat`; `ScissorsIcon`; `dict.live.snip`.
- Produces:
  - `PdfViewer` props gain `snipArmed?: boolean`, `onSnip?: (snip: ChatSnip, anchor: {top: number; left: number}) => void`, `onSnipCancel?: () => void`, `onSnipError?: () => void`.
  - `onAskSelection` signature CHANGES everywhere to `(text: string, pages: number[], documentId: string, anchor: {top: number; left: number}) => void` (anchor = selection midpoint, viewport coords, for the Task-7 floating button).
  - `ReportPane` props gain `onSnip?/onSnipError?` (same shapes); it owns the `snipArmed` state + scissors header button (rendered only when `doc && onSnip`).

- [ ] **Step 1: PdfViewer — anchored selection callback**

In `PdfViewer.tsx`: change the prop type of `onAskSelection` to the 4-arg form above, and in `onMouseUp` compute the anchor and pass it:

```typescript
  function onMouseUp() {
    if (!onAskSelection) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const text = selectionText(sel)
    if (!text) return
    const range = sel.getRangeAt(0)
    const pages = Array.from(
      new Set(
        [pageOf(range.startContainer), pageOf(range.endContainer)].filter((n): n is number => n !== null)
      )
    ).sort((a, b) => a - b)
    const r = range.getBoundingClientRect()
    onAskSelection(text, pages, docId, { top: r.top, left: r.left + r.width / 2 })
  }
```

- [ ] **Step 2: PdfViewer — snip mode (overlay + Esc + capture)**

Add imports:

```typescript
import { dragToPageRect, scaleRect, snipRenderScale } from '@/lib/documents/snip'
import type { ChatSnip } from '@/lib/api/chat'
```

Add the new props to the component signature:

```typescript
  snipArmed = false,
  onSnip,
  onSnipCancel,
  onSnipError,
```

```typescript
  /** Pinge: snip mode armed by the pane's scissors button */
  snipArmed?: boolean
  onSnip?: (snip: ChatSnip, anchor: { top: number; left: number }) => void
  onSnipCancel?: () => void
  onSnipError?: () => void
```

Add state + Esc handling inside the component:

```typescript
  // Pinge drag state — viewport coords; pageNo locked at pointerdown (a snip belongs to one page)
  const [snipDrag, setSnipDrag] = useState<{
    pageNo: number
    start: { x: number; y: number }
    cur: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    if (!snipArmed) {
      setSnipDrag(null)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSnipCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snipArmed, onSnipCancel])

  function pageUnder(x: number, y: number): { el: HTMLElement; pageNo: number } | null {
    for (const el of Array.from(hostRef.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return { el, pageNo: Number(el.dataset.page) }
    }
    return null
  }

  // Offscreen high-res capture (spec approach 1): re-render JUST this page at up to 2x
  // (reduced so the crop's long side ≤1600px), crop the rect, PNG. The on-screen zoom
  // never affects output quality — rectPdf is in PDF units.
  async function captureSnip(pageNo: number, rectPdf: { x: number; y: number; width: number; height: number }) {
    const page = await doc.getPage(pageNo)
    const scale = snipRenderScale(rectPdf)
    const viewport = page.getViewport({ scale })
    const full = document.createElement('canvas')
    full.width = Math.ceil(viewport.width)
    full.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: full.getContext('2d')!, viewport }).promise
    const crop = scaleRect(rectPdf, scale)
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(crop.width))
    out.height = Math.max(1, Math.round(crop.height))
    out.getContext('2d')!.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  async function finishSnip(x: number, y: number) {
    const d = snipDrag
    setSnipDrag(null)
    if (!d) {
      onSnipCancel?.()
      return
    }
    const pageEl = hostRef.current?.querySelector<HTMLElement>(`[data-page="${d.pageNo}"]`)
    if (!pageEl || !doc) {
      onSnipCancel?.()
      return
    }
    const pr = pageEl.getBoundingClientRect()
    const cssRect = dragToPageRect(d.start, { x, y }, { left: pr.left, top: pr.top, width: pr.width, height: pr.height })
    if (!cssRect) {
      onSnipCancel?.() // accidental click / sub-threshold drag
      return
    }
    try {
      const page = await doc.getPage(d.pageNo)
      const base = page.getViewport({ scale: 1 })
      const cssScale = pr.width / base.width // rendered CSS px per PDF unit (zoom-dependent)
      const rectPdf = scaleRect(cssRect, 1 / cssScale)
      const dataUrl = await captureSnip(d.pageNo, rectPdf)
      onSnip?.(
        { dataUrl, page: d.pageNo, documentId: docId },
        { top: Math.min(d.start.y, y), left: (d.start.x + x) / 2 }
      )
    } catch (err) {
      console.error('[PdfViewer] snip capture failed', (err as Error).message)
      onSnipError?.()
      onSnipCancel?.()
    }
  }
```

Make the host relative (`className="relative flex flex-col gap-3"`) and render the overlay after the pages inside the host div:

```tsx
      {snipArmed && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            e.preventDefault()
            const p = pageUnder(e.clientX, e.clientY)
            if (!p) {
              onSnipCancel?.() // click in the gutter between/outside pages exits
              return
            }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            setSnipDrag({ pageNo: p.pageNo, start: { x: e.clientX, y: e.clientY }, cur: { x: e.clientX, y: e.clientY } })
          }}
          onPointerMove={(e) => setSnipDrag((d) => (d ? { ...d, cur: { x: e.clientX, y: e.clientY } } : d))}
          onPointerUp={(e) => void finishSnip(e.clientX, e.clientY)}
        >
          {(() => {
            const host = hostRef.current?.getBoundingClientRect()
            if (!snipDrag || !host)
              return <div className="pointer-events-none absolute inset-0 bg-black/15" />
            const x0 = Math.min(snipDrag.start.x, snipDrag.cur.x) - host.left
            const y0 = Math.min(snipDrag.start.y, snipDrag.cur.y) - host.top
            const x1 = Math.max(snipDrag.start.x, snipDrag.cur.x) - host.left
            const y1 = Math.max(snipDrag.start.y, snipDrag.cur.y) - host.top
            return (
              <>
                {/* classic screenshot-tool veil: four shaded bands around a clear window */}
                <div className="pointer-events-none absolute bg-black/15" style={{ left: 0, right: 0, top: 0, height: y0 }} />
                <div className="pointer-events-none absolute bg-black/15" style={{ left: 0, right: 0, top: y1, bottom: 0 }} />
                <div className="pointer-events-none absolute bg-black/15" style={{ left: 0, width: x0, top: y0, height: y1 - y0 }} />
                <div className="pointer-events-none absolute bg-black/15" style={{ left: x1, right: 0, top: y0, height: y1 - y0 }} />
                <div
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]"
                  style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}
                />
              </>
            )
          })()}
        </div>
      )}
```

- [ ] **Step 3: ReportPane — scissors button + pass-through**

In `FacetPanes.tsx` `ReportPane`: add props

```typescript
  onSnip,
  onSnipError,
```

```typescript
  /** Pinge: forwarded to PdfViewer; scissors button renders only when provided */
  onSnip?: (snip: import('@/lib/api/chat').ChatSnip, anchor: { top: number; left: number }) => void
  onSnipError?: () => void
```

state `const [snipArmed, setSnipArmed] = useState(false)`, and in the header `right` cluster, FIRST element (before page nav):

```tsx
            {doc && onSnip && (
              <button
                type="button"
                title={dict.live.snip}
                aria-label={dict.live.snip}
                aria-pressed={snipArmed}
                onClick={() => setSnipArmed((v) => !v)}
                className={`flex rounded p-1 transition-colors ${snipArmed ? 'call-ink' : 'call-muted hover:call-ink'}`}
              >
                <ScissorsIcon size={14} strokeWidth={1.8} />
              </button>
            )}
```

(import `ScissorsIcon` beside the chevron imports). Pass to PdfViewer:

```tsx
          <PdfViewer
            docId={doc.id}
            pageCount={doc.pageCount}
            zoom={zoom}
            onAskSelection={onAskSelection}
            snipArmed={snipArmed}
            onSnip={(s, anchor) => {
              setSnipArmed(false) // one snip per arming
              onSnip?.(s, anchor)
            }}
            onSnipCancel={() => setSnipArmed(false)}
            onSnipError={onSnipError}
          />
```

Also update ReportPane's `onAskSelection` prop type to the new 4-arg signature:

```typescript
  onAskSelection?: (text: string, pages: number[], documentId: string, anchor: { top: number; left: number }) => void
```

- [ ] **Step 4: Signature compat in LiveTranscriptView (behavior unchanged)**

In `LiveTranscriptView.tsx`, `onReportAsk` gains the (unused, underscore-named) anchor param so tsc stays green — the real unification lands in Task 7:

```typescript
  function onReportAsk(text: string, pages: number[], documentId: string, _anchor: { top: number; left: number }) {
    setChat((c) => ({ open: true, seed: text, nonce: c.nonce + 1, docRef: { documentId, pages } }))
  }
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → green.

```bash
git add src/components/live/PdfViewer.tsx src/components/live/FacetPanes.tsx src/components/live/LiveTranscriptView.tsx
git commit -m "feat(pinge): snip overlay + offscreen high-res capture + scissors in Report pane"
```

---

### Task 6: TranscriptChatPanel — snip chips, cap toast, send with attachments, history thumbnails

**Files:**
- Modify: `src/components/live/TranscriptChatPanel.tsx`

**Interfaces:**
- Consumes: `ChatSnip` from `@/lib/api/chat`; `appendSnip` from `@/lib/documents/snip`; dict keys from Task 4.
- Produces: new props `snip?: ChatSnip | null` (rides `seedNonce`, exactly like `docRef`). Views (Tasks 7–8) seed a snip by bumping `nonce` with `snip` set and `seed: ''`.

- [ ] **Step 1: Props + state**

Add to imports: `import { appendSnip } from '@/lib/documents/snip'` and extend the `streamChat` import: `import { streamChat, type ChatSource, type ChatSnip } from '@/lib/api/chat'`.

`Msg` gains `snips?: ChatSnip[]`.

Props: add

```typescript
  /** Pinge: a fresh snip to attach (rides seedNonce like docRef) */
  snip?: ChatSnip | null
```

State additions:

```typescript
  const [snips, setSnips] = useState<ChatSnip[]>([])
  const [capMsg, setCapMsg] = useState(false)
  const lastNonce = useRef(0)
```

- [ ] **Step 2: Seed effect (nonce-guarded so re-renders never double-add)**

Replace the existing seed effect with:

```typescript
  useEffect(() => {
    if (seedNonce !== lastNonce.current) {
      lastNonce.current = seedNonce
      if (quote) {
        setRef(quote)
        setRefDoc(docRef ?? null)
      }
      if (snip) {
        setSnips((prev) => {
          const r = appendSnip(prev, snip)
          if (r.dropped) {
            setCapMsg(true)
            setTimeout(() => setCapMsg(false), 2500)
          }
          return r.list
        })
      }
    }
    inputRef.current?.focus({ preventScroll: true })
  }, [seedNonce, quote, snip, docRef])
```

- [ ] **Step 3: send() — attachments + empty-text default**

In `send()`: change the guard and payload:

```typescript
    const text = (explicit ?? input).trim()
    const usedSnips = snips
    if ((!text && usedSnips.length === 0) || sending) return
```

After `const apiMessage = ...` add:

```typescript
    // Snips can be sent without typed text — a default question keeps the model pointed.
    const outMessage = apiMessage || dict.chat.snipDefault
```

User message push gains snips (bubble content may be empty — render handles it):

```typescript
      { role: 'user', content: text, reference: usedRef || undefined, snips: usedSnips.length ? usedSnips : undefined },
```

Clear them with the other clears: `setSnips([])`.

In the `streamChat` call use `message: outMessage` and add:

```typescript
          attachments: usedSnips.length ? usedSnips : undefined,
```

Also: if snips exist but no `usedDoc`, ground pages via the snips' own doc (server merges anyway — no client change needed; leave `documentRef` logic as is).

- [ ] **Step 4: Composer chips + cap message**

Directly ABOVE the existing `{ref && (...)}` reference block in the composer area, add:

```tsx
        {snips.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2" dir="ltr">
            {snips.map((s, i) => (
              <div key={i} className="call-hair relative rounded-[10px] border bg-white p-1">
                <img
                  src={s.dataUrl}
                  alt={`${dict.chat.pageShort} ${s.page}`}
                  className="h-16 w-auto max-w-[150px] rounded-[6px] object-contain"
                />
                <span className="absolute bottom-1.5 start-1.5 rounded bg-black/50 px-1 text-[10px] leading-[1.5] text-white">
                  {dict.chat.pageShort} {s.page}
                </span>
                <button
                  type="button"
                  aria-label={dict.common.remove}
                  onClick={() => setSnips((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <CloseIcon size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        {capMsg && <div className="call-muted mb-2 text-[11.5px]">{dict.chat.snipCap}</div>}
```

- [ ] **Step 5: History thumbnails + optional bubble**

In the user-message render (`m.role === 'user'` branch), ABOVE the `{m.reference && ...}` block add:

```tsx
              {m.snips && m.snips.length > 0 && (
                <div className="flex max-w-[92%] flex-wrap justify-end gap-1.5" dir="ltr">
                  {m.snips.map((s, j) => (
                    <img
                      key={j}
                      src={s.dataUrl}
                      alt={`${dict.chat.pageShort} ${s.page}`}
                      className="call-hair h-20 w-auto max-w-[170px] rounded-[8px] border bg-white object-contain"
                    />
                  ))}
                </div>
              )}
```

and make the text bubble conditional: wrap the existing bubble div in `{m.content && ( ... )}`.

Send-button disabled condition becomes: `disabled={sending || (!input.trim() && snips.length === 0)}`.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → green.

```bash
git add src/components/live/TranscriptChatPanel.tsx
git commit -m "feat(pinge): composer snip chips, cap toast, image-carrying send + history"
```

---

### Task 7: Finished view — floating Ask-Atlas button + unified PDF marking + snip seeding

**Files:**
- Modify: `src/components/live/LiveTranscriptView.tsx`

**Interfaces:**
- Consumes: `ChatSnip`; ReportPane's `onSnip/onSnipError`; TranscriptChatPanel's `snip` prop; `SparkleIcon`, `dict.live.askAtlas`.
- Produces: the unified behavior — chat closed: PDF text-mark or snip → floating button; chat open: auto-seed. (Task 8 copies this shape into the live view.)

- [ ] **Step 1: State + chat shape**

Extend the chat state everywhere it's constructed (add `snip`):

```typescript
  const [chat, setChat] = useState<{
    open: boolean
    seed: string
    nonce: number
    docRef: { documentId: string; pages: number[] } | null
    snip: ChatSnip | null
  }>({ open: false, seed: '', nonce: 0, docRef: null, snip: null })
```

Every existing `setChat` call that seeds text gains `snip: null`; every `open:true, seed:''` opener gains `snip: null`. (Grep the file for `setChat` — ~5 sites.)

Add pending-PDF-ask state:

```typescript
  // Pinge/unification: a PDF text-mark or snip made while the chat is CLOSED waits here,
  // under a floating Ask-Atlas button at the selection/snip anchor.
  const [pdfPending, setPdfPending] = useState<
    | { kind: 'text'; text: string; pages: number[]; documentId: string; anchor: { top: number; left: number } }
    | { kind: 'snip'; snip: ChatSnip; anchor: { top: number; left: number } }
    | null
  >(null)
```

Import `ChatSnip` from `@/lib/api/chat`.

- [ ] **Step 2: Handlers — unified rule**

Replace `onReportAsk` with:

```typescript
  // Unified marking rule (spec 2026-07-17): chat open → auto-reference; chat closed →
  // floating Ask-Atlas button first (same UX as transcript marking).
  function onReportAsk(text: string, pages: number[], documentId: string, anchor: { top: number; left: number }) {
    if (chat.open) {
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1, docRef: { documentId, pages }, snip: null }))
    } else {
      setPdfPending({ kind: 'text', text, pages, documentId, anchor })
    }
  }

  function onReportSnip(snip: ChatSnip, anchor: { top: number; left: number }) {
    if (chat.open) {
      setChat((c) => ({ ...c, seed: '', nonce: c.nonce + 1, docRef: null, snip }))
    } else {
      setPdfPending({ kind: 'snip', snip, anchor })
    }
  }

  function firePdfPending() {
    const p = pdfPending
    if (!p) return
    setPdfPending(null)
    if (p.kind === 'text') {
      setChat((c) => ({ open: true, seed: p.text, nonce: c.nonce + 1, docRef: { documentId: p.documentId, pages: p.pages }, snip: null }))
    } else {
      setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null, snip: p.snip }))
    }
  }
```

Dismiss the pending button on any other pointerdown (same lifecycle as text selections):

```typescript
  useEffect(() => {
    if (!pdfPending) return
    const clear = () => setPdfPending(null)
    window.addEventListener('pointerdown', clear)
    return () => window.removeEventListener('pointerdown', clear)
  }, [pdfPending])
```

(The button itself acts on `onPointerDown` with `stopPropagation`, so it wins the race.)

- [ ] **Step 3: Wire ReportPane + render the floating button**

ReportPane call site gains:

```tsx
              onSnip={onReportSnip}
              onSnipError={() => setToast({ text: dict.common.error ?? 'Snip failed' })}
```

(If `dict.common.error` doesn't exist, use the literal he string `'הגזירה נכשלה'` added to both dicts as `chat.snipFailed` — check `dict.common` first and prefer an existing key.)

Beside the existing selection toolbar JSX, add:

```tsx
        {pdfPending && (
          <div
            style={{
              position: 'fixed',
              top: pdfPending.anchor.top,
              left: pdfPending.anchor.left,
              transform: 'translate(-50%, -120%)',
            }}
            className="z-50 flex items-center rounded-full bg-player px-1 py-1 shadow-player"
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                firePdfPending()
              }}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
            >
              <SparkleIcon size={14} />
              {dict.live.askAtlas}
            </button>
          </div>
        )}
```

- [ ] **Step 4: Pass the snip into the chat panel**

`TranscriptChatPanel` call site gains `snip={chat.snip}` (docRef already passed as `docRef={chat.docRef}` — verify; if the prop is currently passed differently, keep its existing name).

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → green.

```bash
git add src/components/live/LiveTranscriptView.tsx
git commit -m "feat(pinge): finished view — floating Ask-Atlas for PDF marks + snip seeding"
```

---

### Task 8: Live view parity (LiveBroadcastView)

**Files:**
- Modify: `src/components/live/LiveBroadcastView.tsx`

**Interfaces:**
- Consumes: identical shapes to Task 7. The live chat panel already accepts `docRef`/`snip` after Task 6 (optional props).
- Produces: live ReportPane wired for text marking AND snips (it currently passes neither).

- [ ] **Step 1: Extend live chat state**

`chat` state is `{ open, seed, nonce }` → becomes `{ open, seed, nonce, docRef: {documentId, pages} | null, snip: ChatSnip | null }`; update all `setChat` sites in the file (grep — ~4 sites: opener button, selection-toolbar ask, chat-open highlight seed, onClose) to carry `docRef: null, snip: null` where they seed text or just toggle.

- [ ] **Step 2: Copy the Task-7 trio**

Add the same `pdfPending` state, `onReportAsk` / `onReportSnip` / `firePdfPending` handlers and the dismissal effect (identical code, Task 7 Step 2), and the same floating-button JSX (Task 7 Step 3) near the existing selection toolbar.

- [ ] **Step 3: Wire the live ReportPane + panel**

The `ReportPane` call site (line ~519) gains:

```tsx
              onAskSelection={onReportAsk}
              onSnip={onReportSnip}
              onSnipError={() => {}}
```

(live view has no toast system — console noise from PdfViewer suffices; keep the callback for parity.)

`TranscriptChatPanel` call site gains `docRef={chat.docRef}` and `snip={chat.snip}`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → green.

```bash
git add src/components/live/LiveBroadcastView.tsx
git commit -m "feat(pinge): live view parity — PDF marking + snips wired to the live chat"
```

---

### Task 9: Full battery + eyes-on end-to-end verification

**Files:**
- Create: `docs/evidence/feat-pinge/2026-07-17-pinge-e2e-verification.md`

- [ ] **Step 1: Battery**

Run all three; all must be green before eyes-on:

```bash
npm test          # every suite incl. snip.test.ts + attachments.test.ts
npx tsc --noEmit
npm run build
```

- [ ] **Step 2: Eyes-on via /verify-app (Chrome MCP, dev server on :3003)**

Use the verify-app skill's multiview recipe. Target: `http://localhost:3003/app/live/PyuMxe88e8g_live` (real Tigbur Q1-2026 call + paired Q1-2026 report). Foreground the tab (pdf.js rAF freezes hidden). Checklist:

1. Report pane shows the scissors button; click → veil + crosshair over the PDF.
2. Esc exits snip mode; re-arm.
3. Drive a REAL pointer drag (CDP pointer events work on our overlay) over a financial-table region → floating "שאלו את אטלס" button appears at the anchor (chat closed).
4. Click it → chat opens with a thumbnail chip: image preview + "עמ׳ N" + ✕.
5. Snip again with chat OPEN → chip auto-appends, no button.
6. Add snips to 5 → cap message "עד 4 גזירים בשאלה" appears, 5th dropped.
7. ✕ removes a chip.
8. Send with typed question → user bubble shows thumbnails + text; streamed answer references the snip/page and reads numbers plausibly from the table.
9. Send a snip with NO text → default question used, answer streams.
10. PDF TEXT marking with chat closed → floating button (no auto-open); with chat open → auto-seed. (Real-hand caveat: CDP cannot create native text selections — verify the closed-chat path by hit-testing the handler with a programmatic selection + manual `onReportAsk` invocation via console, and note the founder-hand caveat in evidence.)
11. Both themes (dark + light): veil, chips, button legible; console clean throughout.
12. Zoom to 125% → snip again → captured image is NOT blurrier (compare chips).

- [ ] **Step 3: Write the evidence file**

`docs/evidence/feat-pinge/2026-07-17-pinge-e2e-verification.md`: what was driven, screenshots taken, console state, caveats (native-selection real-hand item), battery outputs.

- [ ] **Step 4: Commit + push branch**

```bash
git add docs/evidence/feat-pinge/
git commit -m "test(pinge): e2e eyes-on evidence + battery"
git push -u origin feat/pinge
```

---

## Self-review notes (run after drafting — resolved inline)

- Spec coverage: snipping UX (T5), chips/cap/send (T6), unification + floating button (T7), live parity (T8), capture mechanics (T1+T5), API/auth/captions/fallback (T2+T3), i18n (T4), error handling (T5 onSnipError + T2 caps + T3 auth-strip), testing (T1, T2, T9). Excel export / Slides / persistence: explicitly out of scope per spec.
- Type consistency: `ChatSnip` defined once in `src/lib/api/chat.ts`, consumed by T5–T8; server-side `ChatAttachment` is the wire-validation twin in `attachments.ts` (deliberate: client type ≠ trusted type).
- The `onAskSelection` 4-arg change is applied to every producer/consumer in T5 (PdfViewer, ReportPane type, LiveTranscriptView compat) — LiveBroadcastView passes nothing until T8, so tsc stays green at every commit.
