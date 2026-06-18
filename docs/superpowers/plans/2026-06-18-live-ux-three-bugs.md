# Live‑UX Three‑Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB‑SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).
> Order: **1 → 3 → 2**, each its own commit (founder wants per‑feature test + revert). Checkpoint commit
> `c36d3e2` is the restore point. Nothing merges to `main` until the founder tests.

**Goal:** Fix 3 live‑view bugs the founder reported on the real‑call test: (1) LIVE badge mis‑placed +
blank transcript on join; (3) "call ended" notification redesign (frosted Apple cards + gray header
status); (2) the live "Ask Atlas" chat grounds on the wrong company instead of the on‑screen captions.

**Tech stack:** Next.js 14 client components (`LiveBroadcastView`, `LiveSession`, `TranscriptChatPanel`),
chat route + `getChatContext` (server). Tailwind for the frosted card.

---

### Task 1: LIVE badge top‑right + "waiting for captions" placeholder

**Files:** `src/components/live/LiveBroadcastView.tsx`

- [ ] **Move the LIVE badge to the top‑right of the header.** Today it's inline in the left group (after
  the date). Move it into a right‑side group next to the close `IconButton` so it sits top‑right. Keep the
  "behind" indicator in the left group while live.
- [ ] **Blank‑transcript placeholder.** When `phase === 'playing' && words.length === 0`, render a centered,
  subtle line in the transcript area instead of an empty page:
  `ממתינים לכתוביות החיות… (התמלול מגיע בהשהיה קצרה)` ("waiting for live captions… arriving with a short
  delay"). Hides once words arrive. (Root cause: Recall accuracy mode batches transcript 72–188s late.)
- [ ] `npx tsc --noEmit` clean → commit `fix(live): LIVE badge top-right + waiting-for-captions placeholder`.

---

### Task 3: Frosted Apple notifications + gray "ended" status (remove inline banner)

**Files:** `src/components/live/LiveSession.tsx`, `src/components/live/LiveBroadcastView.tsx`

- [ ] **Remove the inline `notice` banner** from `LiveBroadcastView` (the centered pill above the transcript)
  and the `notice` prop. It blocks/clutters; replaced by floating cards + a header status.
- [ ] **Header status (LiveBroadcastView):** when `liveEnded`, the LIVE badge becomes a calm **gray**
  `הסתיים` chip (not red, no pulse). The "behind" indicator is already hidden when `liveEnded`.
- [ ] **Frosted notification card (LiveSession):** a light, Apple‑style card — `rounded-2xl bg-white/85
  backdrop-blur-xl shadow-popover ring-1 ring-black/5`, `fixed inset-x-0 top-3 z-50 mx-auto w-fit
  animate-fade-up`, with the message + (optional) action + a small ✕ close button. Two states:
  - **processing:** "Investor call ended — AI is processing your transcript. This takes a few minutes; we'll
    notify you." + ✕
  - **ready:** "The organized transcript is ready." + **View** button (→ `viewOrganized`) + ✕
  - **failed:** "Processing failed — try again." + **Try again** (→ `retryFinish`) + ✕
- [ ] **Dismiss state:** `const [dismissed, setDismissed] = useState<Record<string, boolean>>({})` keyed by
  status; the ✕ sets it; a new status (processing→ready) shows a fresh card (re‑announces).
- [ ] Render the card alongside `LiveBroadcastView` (wrap the return in a fragment). It's `fixed`, so it
  floats over the live view without blocking transcript text.
- [ ] `npx tsc --noEmit` clean → commit `feat(live): frosted Apple notifications + gray ended status; drop inline banner`.

---

### Task 2: Live chat grounds on the on‑screen captions; never a different company

**Files:** `src/lib/chat/context.ts`, `src/app/api/chat/route.ts`, `src/components/live/TranscriptChatPanel.tsx`,
`src/lib/api/chat.ts` (streamChat client), `src/components/live/LiveBroadcastView.tsx`

- [ ] **`context.ts` — never cross companies.** Change `getChatContext` so the `latestCompleted()` (any
  company) fallback ONLY runs when **no `companyId`** was given. With a `companyId` and no match, return
  `{ text: '', source: null }` rather than another company's transcript.
- [ ] **`/api/chat` — accept `liveContext`.** Read `liveContext?: string` from the body. If present, use it
  directly as the grounding context (skip `getChatContext`) with a synthetic source label
  `{ company, quarter, transcriptId: 'live' }`.
- [ ] **`streamChat` client** (`src/lib/api/chat.ts`): thread an optional `liveContext` through to the POST body.
- [ ] **`TranscriptChatPanel`:** accept optional `liveContext?: string`; pass it to `streamChat`.
- [ ] **`LiveBroadcastView`:** build the live captions text from `words`
  (`words.map(w => w.text).join(' ')`, with the company/quarter header) and pass as `liveContext` to the
  `TranscriptChatPanel` it renders. Now "Ask Atlas" answers about the call on screen.
- [ ] `npx tsc --noEmit` clean → commit `fix(chat): ground live chat on on-screen captions; no cross-company fallback`.

---

### Task 4: Verify

- [ ] `npx tsc --noEmit` clean · `npm test` pass · `npx next build` green (kill dev first).
- [ ] Update PROGRESS.md: 3 fixes done on `feat/live-phase2` (checkpoint `c36d3e2` + 3 commits), awaiting the
  founder's feature‑by‑feature live test (1 → 3 → 2).
- [ ] Restart the live engine + dev (3‑min buffer) so it's ready for tomorrow's test.

## Self‑Review
- Bug 1 → Task 1 (badge move + placeholder). Bug 3 → Task 3 (frosted cards + gray status, inline removed).
  Bug 2 → Task 2 (live‑caption grounding + no cross‑company). ✓
- Per‑commit isolation enables the founder's "test 1, test 3, test 2; revert any single one." ✓
- `liveContext` is additive (finished view + /chat page unaffected — they pass no liveContext). The
  cross‑company fallback fix is safe: the /chat page (no companyId) still falls back to any transcript. ✓
